#!/usr/bin/env python3
"""
Busca os leads do dia no RD Station e abre o painel no navegador.
Não precisa de pip install — usa só stdlib do Python 3.
"""

import json
import os
import sys
import urllib.request
import urllib.parse
import urllib.error
import webbrowser
import tempfile
from datetime import datetime, timezone, timedelta

# ── Config ──────────────────────────────────────────────────────────────────
PRIVATE_TOKEN = "5330953153c77adec48fe1c81587da41"
BASE_URL      = "https://api.rd.station.com/platform/v2"

MONTHS_PT = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
]

# ── Helpers ──────────────────────────────────────────────────────────────────
def api_get(path):
    url = BASE_URL + path
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {PRIVATE_TOKEN}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

def fmt_date(iso):
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        # Converte para horário de Brasília (UTC-3)
        d = d.astimezone(timezone(timedelta(hours=-3)))
        return d.strftime("%d/%m/%Y")
    except Exception:
        return iso[:10]

def fmt_time(iso):
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        d = d.astimezone(timezone(timedelta(hours=-3)))
        return d.strftime("%H:%M")
    except Exception:
        return ""

def fmt_month(iso):
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        d = d.astimezone(timezone(timedelta(hours=-3)))
        return MONTHS_PT[d.month - 1]
    except Exception:
        return ""

def fmt_week(iso):
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        d = d.astimezone(timezone(timedelta(hours=-3)))
        return f"Semana {(d.day - 1) // 7 + 1}"
    except Exception:
        return ""

def pick(obj, *keys):
    for k in keys:
        v = obj.get(k)
        if v not in (None, "", [], {}):
            return str(v)
    return ""

def esc(s):
    return (str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;"))

# ── Fetch leads ──────────────────────────────────────────────────────────────
def fetch_leads():
    brt   = timezone(timedelta(hours=-3))
    today = datetime.now(brt)
    ymd   = today.strftime("%Y-%m-%d")
    start = f"{ymd}T00:00:00"
    end   = f"{ymd}T23:59:59"

    leads = []
    page  = 1

    while True:
        qs = urllib.parse.urlencode({
            "q[last_conversion_date_greater_than]": start,
            "q[last_conversion_date_less_than]":    end,
            "page":      page,
            "page_size": 100,
        })
        print(f"  Buscando página {page}…", flush=True)
        data  = api_get(f"/contacts?{qs}")
        batch = data.get("contacts") or data.get("contact") or []
        leads.extend(batch)
        if len(batch) < 100:
            break
        page += 1

    return leads

# ── Build HTML ───────────────────────────────────────────────────────────────
def build_html(leads):
    brt   = timezone(timedelta(hours=-3))
    today = datetime.now(brt)
    date_label = today.strftime("%A, %d de %B de %Y").capitalize()

    HEADERS = [
        "Empresa","Data","Hora","Mês","Semana","Origem","Tipo","Público",
        "Campanha","Cargo","Nº de Colab","Telefone","Email","Identificador",
        "ATENÇÃO","Responsável","Status","Motivo descarte","Email Corporativo?","Obs."
    ]

    def row_html(c):
        conv = pick(c, "last_conversion_date", "last_marked_opportunity_date", "updated_at")
        cells = [
            pick(c, "company", "company_name"),
            fmt_date(conv),
            fmt_time(conv),
            fmt_month(conv),
            fmt_week(conv),
            pick(c, "traffic_source",  "last_traffic_source"),
            pick(c, "traffic_medium",  "last_traffic_medium"),
            pick(c, "traffic_value",   "last_traffic_value", "traffic_segment"),
            pick(c, "campaign_name",   "last_campaign_name", "cf_campanha"),
            pick(c, "job_title"),
            pick(c, "cf_employees_range","cf_numero_de_colaboradores",
                    "cf_numero_colaboradores","cf_tamanho_empresa",
                    "cf_funcionarios","employees_range"),
            pick(c, "mobile_phone","phone","personal_phone"),
            pick(c, "email"),
            pick(c, "last_conversion_event_identifier","last_conversion_identifier","identifier"),
        ]
        tds = "".join(
            f'<td title="{esc(v)}">{esc(v)}</td>' for v in cells
        )
        manual = '<td class="tm"></td>' * 6
        return f"<tr>{tds}{manual}</tr>"

    if leads:
        rows_html = "\n".join(row_html(c) for c in leads)
    else:
        rows_html = '<tr><td colspan="20" class="empty">Nenhum lead encontrado para hoje.</td></tr>'

    n = len(leads)
    counter_txt = f"{n} lead{'s' if n != 1 else ''}"

    # Build TSV for copy button
    tsv_rows = []
    for c in leads:
        conv = pick(c, "last_conversion_date", "last_marked_opportunity_date", "updated_at")
        row_vals = [
            pick(c, "company", "company_name"),
            fmt_date(conv), fmt_time(conv), fmt_month(conv), fmt_week(conv),
            pick(c, "traffic_source","last_traffic_source"),
            pick(c, "traffic_medium","last_traffic_medium"),
            pick(c, "traffic_value","last_traffic_value","traffic_segment"),
            pick(c, "campaign_name","last_campaign_name","cf_campanha"),
            pick(c, "job_title"),
            pick(c, "cf_employees_range","cf_numero_de_colaboradores",
                    "cf_numero_colaboradores","cf_tamanho_empresa",
                    "cf_funcionarios","employees_range"),
            pick(c, "mobile_phone","phone","personal_phone"),
            pick(c, "email"),
            pick(c, "last_conversion_event_identifier","last_conversion_identifier","identifier"),
            "","","","","",""
        ]
        tsv_rows.append("\t".join(v.replace("\t"," ") for v in row_vals))

    tsv_data = json.dumps(
        "\t".join(HEADERS) + "\n" + "\n".join(tsv_rows)
    )

    copy_disabled = "" if leads else "disabled"

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Leads Hoje — RD Station</title>
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;color:#1e293b;min-height:100vh}}
header{{background:linear-gradient(135deg,#1d4ed8,#1e40af);color:#fff;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;box-shadow:0 2px 10px rgba(30,64,175,.35);position:sticky;top:0;z-index:100}}
.hl h1{{font-size:17px;font-weight:700;letter-spacing:-.3px}}
.hl .sub{{font-size:11px;opacity:.75;margin-top:2px}}
.hr{{display:flex;align-items:center;gap:10px;flex-shrink:0}}
.badge{{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:4px 14px;font-size:13px;font-weight:600}}
.btn{{border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;padding:7px 14px;transition:background .15s,opacity .15s,transform .1s;white-space:nowrap}}
.btn:active{{transform:scale(.97)}}
.btn:disabled{{opacity:.45;cursor:not-allowed;transform:none}}
.btn-copy{{background:#10b981;color:#fff}}
.btn-copy:not(:disabled):hover{{background:#059669}}
.btn-reload{{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.3)}}
.btn-reload:hover{{background:rgba(255,255,255,.28)}}
.info-bar{{background:#eff6ff;border-left:4px solid #3b82f6;color:#1e40af;padding:10px 16px;font-size:13px;margin:14px 20px 0}}
main{{padding:14px 20px 40px}}
.tw{{overflow-x:auto;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.1)}}
table{{border-collapse:collapse;width:100%;background:#fff;font-size:12px}}
thead tr.rg th{{padding:5px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;text-align:center}}
thead tr.rg .ga{{background:#1e3a5f;color:#bfdbfe}}
thead tr.rg .gm{{background:#374151;color:#d1d5db}}
thead tr.rc th{{padding:9px 11px;text-align:left;font-weight:600;font-size:11px;white-space:nowrap;border-right:1px solid rgba(255,255,255,.12)}}
thead tr.rc .ca{{background:#1e40af;color:#fff}}
thead tr.rc .cm{{background:#4b5563;color:#f3f4f6}}
tbody tr:nth-child(even){{background:#f8fafc}}
tbody tr:hover{{background:#eff6ff}}
tbody td{{padding:7px 11px;border-bottom:1px solid #e2e8f0;border-right:1px solid #f1f5f9;color:#334155;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}}
tbody td.tm{{background:#f9fafb;border-right-color:#e9ecef}}
.empty{{text-align:center;padding:48px;color:#94a3b8;font-size:14px;border:none!important}}
.toast{{position:fixed;bottom:24px;right:24px;background:#0f172a;color:#f8fafc;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,.25);opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;pointer-events:none;z-index:9999}}
.toast.on{{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>
<header>
  <div class="hl">
    <h1>Leads Hoje — RD Station</h1>
    <div class="sub">{date_label}</div>
  </div>
  <div class="hr">
    <span class="badge" id="counter">{counter_txt}</span>
    <button class="btn btn-copy" id="btnCopy" onclick="copyTsv()" {copy_disabled}>⎘ Copiar Tabela</button>
    <button class="btn btn-reload" onclick="location.reload()">↻ Atualizar</button>
  </div>
</header>

<div class="info-bar">Dados carregados em {today.strftime("%H:%M")} (horário de Brasília). Clique em <strong>Atualizar</strong> para rebuscar.</div>

<main>
<div class="tw">
<table>
  <thead>
    <tr class="rg">
      <th colspan="14" class="ga">Dados da API — RD Station</th>
      <th colspan="6"  class="gm">Preenchimento Manual</th>
    </tr>
    <tr class="rc">
      <th class="ca">Empresa</th>
      <th class="ca">Data</th>
      <th class="ca">Hora</th>
      <th class="ca">Mês</th>
      <th class="ca">Semana</th>
      <th class="ca">Origem</th>
      <th class="ca">Tipo</th>
      <th class="ca">Público</th>
      <th class="ca">Campanha</th>
      <th class="ca">Cargo</th>
      <th class="ca">Nº de Colab</th>
      <th class="ca">Telefone</th>
      <th class="ca">Email</th>
      <th class="ca">Identificador</th>
      <th class="cm">ATENÇÃO</th>
      <th class="cm">Responsável</th>
      <th class="cm">Status</th>
      <th class="cm">Motivo descarte</th>
      <th class="cm">Email Corporativo?</th>
      <th class="cm">Obs.</th>
    </tr>
  </thead>
  <tbody>
{rows_html}
  </tbody>
</table>
</div>
</main>

<div class="toast" id="toast"></div>
<script>
const TSV = {tsv_data};

function copyTsv(){{
  const write = t => navigator.clipboard ? navigator.clipboard.writeText(t) :
    new Promise(r=>{{const a=document.createElement('textarea');a.value=t;
    Object.assign(a.style,{{position:'fixed',left:'-9999px'}});
    document.body.appendChild(a);a.select();document.execCommand('copy');
    document.body.removeChild(a);r()}});
  write(TSV)
    .then(()=>showToast('✓ Copiado! Cole no Excel ou Google Sheets.'))
    .catch(()=>showToast('Erro ao copiar.'));
}}

function showToast(msg,ms=2800){{
  const el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('on');
  clearTimeout(showToast._t);
  showToast._t=setTimeout(()=>el.classList.remove('on'),ms);
}}
</script>
</body>
</html>"""

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("\n  Leads Hoje — RD Station")
    print("  " + "─" * 36)

    print("  Buscando leads de hoje na API…")
    try:
        leads = fetch_leads()
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode()
        except Exception:
            pass
        print(f"\n  ERRO HTTP {e.code}: {e.reason}")
        if body:
            print(f"  Detalhes: {body[:300]}")
        sys.exit(1)
    except Exception as e:
        print(f"\n  ERRO: {e}")
        sys.exit(1)

    print(f"  {len(leads)} lead(s) encontrado(s).")
    print("  Gerando painel…")

    html = build_html(leads)

    # Salva na mesma pasta do script
    out_dir  = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(out_dir, "painel_gerado.html")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"  Arquivo salvo: {out_path}")
    print("  Abrindo no navegador…\n")
    webbrowser.open(f"file://{out_path}")

if __name__ == "__main__":
    main()
