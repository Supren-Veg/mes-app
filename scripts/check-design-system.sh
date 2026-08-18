#!/usr/bin/env bash
# Gate de conformidade com o design system (supren-governanca/BRANDING.md).
# Excecoes legitimas sao declaradas no CONSTITUICAO.md deste repo.
set -uo pipefail

DIRS="frontend/src"
FAIL=0

check() {
  local nome="$1" padrao="$2" extra="${3:-}"
  local hits
  # shellcheck disable=SC2086
  hits=$(grep -rnE "$padrao" $DIRS --include=*.jsx ${extra} || true)
  local n
  n=$(printf '%s' "$hits" | grep -c . || true)
  if [ "$n" -gt 0 ]; then
    echo "FALHA: $nome ($n ocorrencia(s))"
    printf '%s\n' "$hits" | head -20 | sed 's/^/    /'
    FAIL=1
  else
    echo "ok: $nome"
  fi
}

echo "== Conformidade com o design system Supren =="

check "cor crua do Tailwind (use os tokens)" \
  '(text|bg|border)-(red|green|blue|gray|slate|zinc|neutral|amber|yellow|orange|emerald|indigo|purple|pink|fuchsia|cyan|rose|violet|teal|sky|lime)-[0-9]{2,3}'

# frontend/src/utils/colors.js e a paleta canonica de etapas (15 cores categoricas),
# centralizada de proposito — excecao declarada na CONSTITUICAO.md.
check "hex hardcoded (use os tokens)" \
  '#[0-9a-fA-F]{6}' \
  '--exclude-dir=utils'

check "icone fora da escala (use size-*)" \
  '\bh-([0-9.]+) w-\1\b'

check "prop numerica de tamanho (use size-*)" \
  'size=\{[0-9]+\}'

check "token sem utilitario (exponha no @theme inline)" \
  '\[color:var\(--'

if [ "$FAIL" -eq 0 ]; then
  echo "== Tudo conforme =="
else
  echo "== Reprovado: ver BRANDING.md (parte Design system) =="
fi
exit "$FAIL"
