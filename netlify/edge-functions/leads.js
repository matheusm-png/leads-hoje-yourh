const CLIENT_ID     = Deno.env.get("RD_CLIENT_ID")     || "643dde12-c428-44b1-afc3-5f659e1d9e72";
const CLIENT_SECRET = Deno.env.get("RD_CLIENT_SECRET") || "2260c486c91841eb914bd16942fb6d55";
const REFRESH_TOKEN = Deno.env.get("RD_REFRESH_TOKEN") || "";
const BASE          = "https://api.rd.services/platform";

async function getAccessToken() {
  if (!REFRESH_TOKEN) throw new Error("RD_REFRESH_TOKEN não configurado. Acesse /authorize.html para autorizar.");

  const res = await fetch("https://api.rd.services/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    "refresh_token",
      refresh_token: REFRESH_TOKEN,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Auth falhou: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

export default async () => {
  const brt   = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const ymd   = brt.toISOString().slice(0, 10);
  const start = `${ymd}T00:00:00`;
  const end   = `${ymd}T23:59:59`;

  try {
    const token = await getAccessToken();
    let all = [], page = 1;

    while (true) {
      const qs = new URLSearchParams({
        "q[last_conversion_date_greater_than]": start,
        "q[last_conversion_date_less_than]":    end,
        page, page_size: 100,
      });

      const res = await fetch(`${BASE}/contacts?${qs}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
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
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/leads" };
