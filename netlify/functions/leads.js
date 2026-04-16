const https = require("https");

const TOKEN = process.env.RD_PRIVATE_TOKEN || "5330953153c77adec48fe1c81587da41";

function rdFetch(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.rd.station.com",
        path: "/platform/v2" + path,
        method: "GET",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/json",
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          } else {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error("Resposta inválida da API: " + raw.slice(0, 200)));
            }
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

exports.handler = async () => {
  // Horário de Brasília (UTC-3)
  const brt  = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const ymd  = brt.toISOString().slice(0, 10);
  const start = `${ymd}T00:00:00`;
  const end   = `${ymd}T23:59:59`;

  try {
    let all  = [];
    let page = 1;

    while (true) {
      const qs = new URLSearchParams({
        "q[last_conversion_date_greater_than]": start,
        "q[last_conversion_date_less_than]":    end,
        page,
        page_size: 100,
      });

      const data  = await rdFetch(`/contacts?${qs}`);
      const batch = data.contacts || data.contact || [];
      all = all.concat(batch);

      if (batch.length < 100) break;
      page++;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: all }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
