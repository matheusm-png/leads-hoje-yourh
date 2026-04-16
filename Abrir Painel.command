#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
echo ""
echo "  Buscando leads do RD Station…"
echo ""
python3 "$DIR/gerar_leads.py"
echo ""
echo "  Pressione Enter para fechar."
read
