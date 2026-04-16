const https = require("https");

const CLIENT_ID     = process.env.RD_CLIENT_ID     || "2b4d5177951b2aaefe0b7f838559c2d9";
const CLIENT_SECRET = process.env.RD_CLIENT_SECRET || "5330953153c77adec48fe1c81587da41";

function post(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "api.rd.services",
        path: "/auth/token",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

  if (!code) {
    return { statusCode: 400, body: "Parâmetro 'code' ausente." };
  }

  const { status, body } = await post({
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
  });

  let data;
  try { data = JSON.parse(body); } catch { data = { raw: body }; }

  const ok = status < 300 && data.refresh_token;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Autorização RD Station</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:600px;margin:60px auto;padding:20px;background:#f0f4f8}
  .card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
  h2{margin:0 0 16px;color:${ok ? "#166534" : "#991b1b"}}
  pre{background:#f1f5f9;padding:16px;border-radius:8px;font-size:12px;overflow-x:auto;word-break:break-all;white-space:pre-wrap}
  .label{font-size:13px;font-weight:600;color:#475569;margin:12px 0 4px}
  .token{background:#dcfce7;border:1px solid #86efac;padding:12px 16px;border-radius:8px;font-family:monospace;font-size:13px;word-break:break-all}
  .btn{display:inline-block;margin-top:20px;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500}
  ol{font-size:13px;line-height:1.8;color:#374151}
</style></head><body><div class="card">
${ok ? `
  <h2>✅ Autorização concluída!</h2>
  <p style="font-size:14px;color:#374151">Copie o <strong>refresh_token</strong> abaixo e adicione como variável de ambiente no Netlify:</p>
  <div class="label">refresh_token</div>
  <div class="token">${data.refresh_token}</div>
  <ol style="margin-top:20px">
    <li>No Netlify: <strong>Site configuration → Environment variables</strong></li>
    <li>Crie a variável: <code>RD_REFRESH_TOKEN</code></li>
    <li>Cole o token acima como valor</li>
    <li>Clique em <strong>Save</strong> e depois <strong>Trigger deploy</strong></li>
  </ol>
  <a class="btn" href="/leads-hoje.html">Abrir painel de leads →</a>
` : `
  <h2>❌ Erro na autorização</h2>
  <p style="font-size:14px;color:#374151">Resposta da API (status ${status}):</p>
  <pre>${JSON.stringify(data, null, 2)}</pre>
  <a class="btn" href="/authorize.html">Tentar novamente</a>
`}
</div></body></html>`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: html,
  };
};
