const https    = require("https");
const querystr = require("querystring");
const { getStore } = require("@netlify/blobs");

const CLIENT_ID     = process.env.RD_CLIENT_ID     || "643dde12-c428-44b1-afc3-5f659e1d9e72";
const CLIENT_SECRET = process.env.RD_CLIENT_SECRET || "2260c486c91841eb914bd16942fb6d55";

function postForm(params) {
  return new Promise((resolve, reject) => {
    const payload = querystr.stringify(params);
    const req = https.request(
      {
        hostname: "api.rd.services",
        path: "/auth/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;
  if (!code) return { statusCode: 400, body: "Parâmetro 'code' ausente." };

  const { status, body } = await postForm({
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type:    "authorization_code",
    code,
  });

  let data;
  try { data = JSON.parse(body); } catch { data = { raw: body }; }

  const ok = status < 300 && data.access_token;

  if (ok) {
    // Persiste tokens no Netlify Blobs para uso automático
    try {
      const storeOptions = { 
        name: "rd-tokens",
        siteID: process.env.NETLIFY_SITE_ID || "10788d7c-668d-4399-8b58-8920990a0a69",
        token:  process.env.NETLIFY_AUTH_TOKEN || "nfp_y3jqErvshmTLhGMTiZTTTce3tuCy3tyT93e1"
      };
      const store = getStore(storeOptions);
      await store.setJSON("current", {
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        obtained_at:   Date.now(),
      });
    } catch (e) {
      console.warn("Blobs indisponível:", e.message);
    }
  }

  const netlifyUrl = `https://${event.headers?.host || "leads-hoje-yourh.netlify.app"}`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Autorização RD Station</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:620px;margin:60px auto;padding:20px;background:#f0f4f8}
  .card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
  h2{margin:0 0 12px;color:${ok ? "#166534" : "#991b1b"}}
  pre{background:#f1f5f9;padding:16px;border-radius:8px;font-size:11px;overflow-x:auto;word-break:break-all;white-space:pre-wrap}
  .btn{display:inline-block;margin-top:20px;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500}
  .ok-box{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;font-size:14px;color:#166534;margin-top:8px}
</style></head><body><div class="card">
${ok ? `
  <h2>✅ Autorização concluída!</h2>
  <div class="ok-box">Tokens salvos automaticamente. O painel já está pronto para usar e vai se renovar sozinho.</div>
  <a class="btn" href="${netlifyUrl}/leads-hoje.html">Abrir painel de leads →</a>
` : `
  <h2>❌ Erro na autorização</h2>
  <pre>${JSON.stringify(data, null, 2)}</pre>
  <a class="btn" href="${netlifyUrl}/authorize.html">Tentar novamente</a>
`}
</div></body></html>`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: html,
  };
};
