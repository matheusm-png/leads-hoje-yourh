const { getStore } = require("@netlify/blobs");
const fs = require("fs");
const path = require("path");

exports.handler = async (event) => {
  try {
    const offset = parseInt(event.queryStringParameters?.offset || "0");
    const limit  = parseInt(event.queryStringParameters?.limit || "500");

    // Usando require para garantir que o arquivo seja empacotado pela Netlify
    const allLeads = require("./leads_extracted.json");
    const slice    = allLeads.slice(offset, offset + limit);

    const storeOptions = { 
      name: "rd-leads",
      siteID: process.env.NETLIFY_SITE_ID || "10788d7c-668d-4399-8b58-8920990a0a69",
      token:  process.env.NETLIFY_AUTH_TOKEN || "nfp_y3jqErvshmTLhGMTiZTTTce3tuCy3tyT93e1"
    };
    const store = getStore(storeOptions);

    let count = 0;
    for (const lead of slice) {
      // Usa a data original do lead como pasta
      const dataYMD = lead._date_ymd || "sem-data";
      const timestamp = Date.now() + count;
      const emailSafe = String(lead.email || "sem-email").replace(/[^a-zA-Z0-9]/g, "_");
      const key = `${dataYMD}/import_${timestamp}_${emailSafe}`;

      await store.setJSON(key, { ...lead });
      count++;
    }

    const total = allLeads.length;
    const nextOffset = offset + count;
    const isFinished = nextOffset >= total;

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `
        <div style="font-family:sans-serif; padding:40px; text-align:center;">
          <h2>🚀 Importação em curso</h2>
          <p>Processados: <b>${offset} até ${nextOffset}</b> de um total de <b>${total}</b>.</p>
          ${isFinished 
            ? '<h3 style="color:green">✅ TUDO PRONTO! Todos os leads foram injetados.</h3><a href="/leads-hoje.html" style="padding:10px 20px; background:#2563eb; color:#fff; border-radius:8px; text-decoration:none">Abrir Painel →</a>' 
            : `<a href="?offset=${nextOffset}&limit=${limit}" style="padding:10px 20px; background:#10b981; color:#fff; border-radius:8px; text-decoration:none">Clique aqui para processar o próximo lote (+500) →</a>`}
        </div>
      `
    };
  } catch (err) {
    return { statusCode: 500, body: "Erro: " + err.message };
  }
};
