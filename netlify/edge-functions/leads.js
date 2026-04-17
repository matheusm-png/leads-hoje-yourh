import { getStore } from "@netlify/blobs";

const CLIENT_ID     = Deno.env.get("RD_CLIENT_ID")     || "643dde12-c428-44b1-afc3-5f659e1d9e72";
const CLIENT_SECRET = Deno.env.get("RD_CLIENT_SECRET") || "2260c486c91841eb914bd16942fb6d55";
const BASE          = "https://api.rd.services/platform";

/* ── Auth ── */
async function refreshTokens(refreshToken) {
  const res  = await fetch("https://api.rd.services/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Refresh falhou: ${JSON.stringify(data)}`);
  return data;
}

async function getToken() {
  const store    = getStore("rd-tokens");
  const tokenRec = await store.get("current", { type: "json" }).catch(() => null);
  if (!tokenRec?.access_token) throw new Error("Não autorizado. Acesse /authorize.html");
  return { store, tokenRec, token: tokenRec.access_token };
}

/* ── HTTP helper com auto-refresh ── */
async function rdGet(path, ctx) {
  let res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json" },
  });

  if (res.status === 401 && ctx.tokenRec?.refresh_token) {
    const newTokens = await refreshTokens(ctx.tokenRec.refresh_token);
    ctx.token = newTokens.access_token;
    await ctx.store.setJSON("current", {
      access_token:  newTokens.access_token,
      refresh_token: newTokens.refresh_token || ctx.tokenRec.refresh_token,
      obtained_at:   Date.now(),
    });
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json" },
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

/* ── Datas BRT ── */
function todayRangeBRT() {
  const brt  = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const ymd  = brt.toISOString().slice(0, 10);
  return {
    start: `${ymd}T00:00:00-03:00`,
    end:   `${ymd}T23:59:59-03:00`,
    ymd,
  };
}

/* ── Busca detalhes do contato ── */
async function fetchContact(uuid, ctx) {
  try {
    return await rdGet(`/contacts/${uuid}`, ctx);
  } catch {
    return null;
  }
}

/* ── Main ── */
export default async () => {
  try {
    const ctx            = await getToken();
    const { start, end } = todayRangeBRT();

    let allEvents = [];
    let nextCursor = null;

    // Pagina todos os eventos de conversão do dia
    while (true) {
      const qs = new URLSearchParams({
        event_type: "CONVERSION",
        start_date: start,
        end_date:   end,
        page_size:  100,
      });
      if (nextCursor) qs.set("cursor", nextCursor);

      const data = await rdGet(`/events?${qs}`, ctx);
      const batch = data.events || data.event || data || [];
      if (!Array.isArray(batch) || !batch.length) break;

      allEvents = allEvents.concat(batch);

      nextCursor = data.next_cursor || data.cursor || null;
      if (!nextCursor || batch.length < 100) break;
    }

    // Para cada evento, busca dados completos do contato (em paralelo, 5 por vez)
    const leads = [];
    const chunk = 5;

    for (let i = 0; i < allEvents.length; i += chunk) {
      const slice   = allEvents.slice(i, i + chunk);
      const details = await Promise.all(
        slice.map(async (ev) => {
          const uuid    = ev.contact?.uuid || ev.uuid || ev.contact_uuid;
          const contact = uuid ? await fetchContact(uuid, ctx) : null;
          return mergeEventContact(ev, contact);
        })
      );
      leads.push(...details);
    }

    return new Response(JSON.stringify({ contacts: leads }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

/* ── Mescla evento + contato no formato esperado pelo frontend ── */
function mergeEventContact(ev, contact) {
  const c   = contact || {};
  const pay = ev.payload || ev.event_payload || ev;

  // Data vem do evento
  const convDate = ev.event_timestamp || ev.created_at || ev.timestamp || "";

  return {
    // Campos do contato
    company:     pick(c, "company", "company_name"),
    email:       pick(c, "email") || pick(ev.contact, "email") || pick(ev, "email"),
    job_title:   pick(c, "job_title"),
    mobile_phone: pick(c, "mobile_phone", "phone", "personal_phone"),
    phone:        pick(c, "phone", "mobile_phone"),

    // Campos de tráfego (podem vir do evento ou do contato)
    traffic_source: pick(pay, "traffic_source") || pick(c, "traffic_source"),
    traffic_medium: pick(pay, "traffic_medium") || pick(c, "traffic_medium"),
    traffic_value:  pick(pay, "traffic_value")  || pick(c, "traffic_value"),
    campaign_name:  pick(pay, "campaign_name")  || pick(c, "campaign_name"),

    // Custom fields
    cf_employees_range: pick(c,
      "cf_employees_range", "cf_numero_de_colaboradores",
      "cf_tamanho_empresa",  "cf_funcionarios", "employees_range"
    ),

    // Data da conversão
    last_conversion_date: convDate,

    // Identificador do evento
    last_conversion_event_identifier:
      ev.event_identifier || ev.identifier || pick(pay, "conversion_identifier"),
  };
}

function pick(obj, ...keys) {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

export const config = { path: "/api/leads" };
