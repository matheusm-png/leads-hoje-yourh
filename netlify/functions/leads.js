const { getStore } = require("@netlify/blobs");

const CLIENT_ID     = process.env.RD_CLIENT_ID     || "643dde12-c428-44b1-afc3-5f659e1d9e72";
const CLIENT_SECRET = process.env.RD_CLIENT_SECRET || "2260c486c91841eb914bd16942fb6d55";
const BASE          = "https://api.rd.services/platform";

/* ── Auth ── */
async function refreshTokens(refreshToken) {
  const res = await fetch("https://api.rd.services/auth/token", {
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

/* ── HTTP helper com auto-refresh ── */
async function rdGet(url, ctx) {
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json" },
  });

  if (res.status === 401 && ctx.tokenRec?.refresh_token) {
    const newTokens = await refreshTokens(ctx.tokenRec.refresh_token);
    ctx.token = newTokens.access_token;
    ctx.tokenRec.refresh_token = newTokens.refresh_token || ctx.tokenRec.refresh_token;
    await ctx.store.setJSON("current", {
      access_token:  ctx.token,
      refresh_token: ctx.tokenRec.refresh_token,
      obtained_at:   Date.now(),
    });
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json" },
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

/* ── Busca Profunda (30 dias) para Diagnóstico ── */
function getSafeRangeBRT() {
  const agora    = new Date();
  const brasil   = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  
  // 30 dias atrás
  const inicio = new Date(brasil);
  inicio.setDate(brasil.getDate() - 30);
  const dataInicio = inicio.toISOString().slice(0, 10);

  // Amanhã
  const amanha = new Date(brasil);
  amanha.setDate(brasil.getDate() + 1);
  const dataAmanha = amanha.toISOString().slice(0, 10);

  return {
    start: `${dataInicio}T00:00:00-03:00`,
    end:   `${dataAmanha}T23:59:59-03:00`,
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

function mergeEventContact(ev, contact) {
  const c   = contact || {};
  const pay = ev.payload || ev.event_payload || {};

  return {
    company:     pick(c, "company", "company_name"),
    email:       pick(c, "email") || pick(ev.contact, "email") || pick(ev, "email"),
    job_title:   pick(c, "job_title"),
    mobile_phone: pick(c, "mobile_phone", "phone", "personal_phone"),
    phone:        pick(c, "phone", "mobile_phone"),
    traffic_source: pick(pay, "traffic_source") || pick(c, "traffic_source"),
    traffic_medium: pick(pay, "traffic_medium") || pick(c, "traffic_medium"),
    traffic_value:  pick(pay, "traffic_value")  || pick(c, "traffic_value"),
    campaign_name:  pick(pay, "campaign_name")  || pick(c, "campaign_name"),
    cf_employees_range: pick(c,
      "cf_employees_range", "cf_numero_de_colaboradores",
      "cf_tamanho_empresa",  "cf_funcionarios", "employees_range"
    ),
    last_conversion_date: ev.event_timestamp || ev.created_at || ev.timestamp || "",
    last_conversion_event_identifier:
      ev.event_identifier || ev.identifier || pick(pay, "conversion_identifier"),
  };
}

/* ── Handler ── */
exports.handler = async (event) => {
  try {
    const storeOptions = { 
      name: "rd-leads",
      siteID: process.env.NETLIFY_SITE_ID || "10788d7c-668d-4399-8b58-8920990a0a69",
      token:  process.env.NETLIFY_AUTH_TOKEN || "nfp_y3jqErvshmTLhGMTiZTTTce3tuCy3tyT93e1"
    };
    const store = getStore(storeOptions);

    // Identifica a data solicitada ou usa hoje (BRT)
    let dataYMD = event.queryStringParameters?.date;
    
    if (!dataYMD) {
      const agora    = new Date();
      const brasil   = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      dataYMD = brasil.toISOString().slice(0, 10);
    }

    // Lista todas as chaves (leads) da data escolhida
    const { blobs } = await store.list({ prefix: `${dataYMD}/` });
    
    // Busca o conteúdo de cada lead em paralelo
    const leads = await Promise.all(
      blobs.map(async (b) => {
        return await store.get(b.key, { type: "json" });
      })
    );

    // Ordena por mais recente (recebimento do webhook)
    leads.sort((a, b) => new Date(b._received_at) - new Date(a._received_at));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contacts: leads, 
        debug: { source: "blobs", count: leads.length, folder: dataYMD } 
      }),
    };
  } catch (err) {
    console.error("Erro ao listar leads:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message, debug: true }),
    };
  }
};
