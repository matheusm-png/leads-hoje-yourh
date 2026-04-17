const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  // O RD Station envia um POST com um array de leads (leads[])
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const leadsReceived = body.leads || [];

    if (leadsReceived.length === 0) {
      return { statusCode: 200, body: "Nenhum lead recebido." };
    }

    const storeOptions = { 
      name: "rd-leads",
      siteID: process.env.NETLIFY_SITE_ID || "10788d7c-668d-4399-8b58-8920990a0a69",
      token:  process.env.NETLIFY_AUTH_TOKEN || "nfp_y3jqErvshmTLhGMTiZTTTce3tuCy3tyT93e1"
    };
    const store = getStore(storeOptions);

    // Data de hoje em fuso BRT para organização das pastas no Blob
    const agora = new Date();
    const brasil = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dataYMD = brasil.toISOString().slice(0, 10);

    for (const lead of leadsReceived) {
      // Cria uma chave única: pasta/data/timestamp_email
      const timestamp = Date.now();
      const emailSafe = String(lead.email || "sem-email").replace(/[^a-zA-Z0-9]/g, "_");
      const key = `${dataYMD}/${timestamp}_${emailSafe}`;

      // Salva o lead bruto + timestamp de recebimento
      await store.setJSON(key, {
        ...lead,
        _received_at: agora.toISOString(),
      });
    }

    console.log(`Webhook: ${leadsReceived.length} leads salvos.`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Leads processados com sucesso." }),
    };
  } catch (err) {
    console.error("Erro no Webhook:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
