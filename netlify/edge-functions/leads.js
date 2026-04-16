const TOKEN = Deno.env.get("RD_PRIVATE_TOKEN") || "5330953153c77adec48fe1c81587da41";
const BASE  = "https://api.rd.station.com/platform/v2";

export default async (request) => {
  const brt   = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const ymd   = brt.toISOString().slice(0, 10);
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

      const res = await fetch(`${BASE}/contacts?${qs}`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
      }

      const data  = await res.json();
      const batch = data.contacts || data.contact || [];
      all = all.concat(batch);

      if (batch.length < 100) break;
      page++;
    }

    return new Response(JSON.stringify({ contacts: all }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, cause: String(err.cause ?? "") }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/leads" };
