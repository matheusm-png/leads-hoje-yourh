import { getStore } from "@netlify/blobs";

const CLIENT_ID     = Deno.env.get("RD_CLIENT_ID")     || "643dde12-c428-44b1-afc3-5f659e1d9e72";
const CLIENT_SECRET = Deno.env.get("RD_CLIENT_SECRET") || "2260c486c91841eb914bd16942fb6d55";
const BASE          = "https://api.rd.services/platform";

function todayBRT() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function refreshTokens(refreshToken) {
  const body = new URLSearchParams({
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type:    "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://api.rd.services/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Refresh falhou: ${JSON.stringify(data)}`);
  }
  return data; // { access_token, refresh_token, ... }
}

export default async () => {
  const today = todayBRT();

  try {
    // Lê tokens do Netlify Blobs
    const store    = getStore("rd-tokens");
    let   tokenRec = await store.get("current", { type: "json" }).catch(() => null);

    if (!tokenRec?.access_token) {
      return new Response(
        JSON.stringify({ error: "Não autorizado. Acesse /authorize.html para autorizar." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    let accessToken  = tokenRec.access_token;
    let refreshToken = tokenRec.refresh_token;

    // Testa acesso; renova se precisar
    async function fetchContacts(page) {
      const qs  = new URLSearchParams({ page, page_size: 100 });
      const res = await fetch(`${BASE}/contacts?${qs}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });

      if (res.status === 401 && refreshToken) {
        // Token expirou — renova e salva
        const newTokens  = await refreshTokens(refreshToken);
        accessToken      = newTokens.access_token;
        refreshToken     = newTokens.refresh_token || refreshToken;
        await store.setJSON("current", {
          access_token:  accessToken,
          refresh_token: refreshToken,
          obtained_at:   Date.now(),
        });
        // Retry com novo token
        return fetch(`${BASE}/contacts?${qs}`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
      }
      return res;
    }

    let all  = [];
    let page = 1;

    while (true) {
      const res = await fetchContacts(page);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 400)}`);
      }

      const data  = await res.json();
      const batch = data.contacts || data.contact || [];
      if (!batch.length) break;

      const todayBatch = batch.filter(c => (c.last_conversion_date || "").slice(0, 10) === today);
      all = all.concat(todayBatch);

      const oldest = (batch[batch.length - 1]?.last_conversion_date || "").slice(0, 10);
      if (oldest && oldest < today) break;
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
