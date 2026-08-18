# CLAUDE.md — mes-app

> **Constituição:** seguir `CONSTITUICAO.md` (projeto) e `supren-governanca/CONSTITUICAO.md` (global). Precedência: projeto > global > este arquivo.

## Referências rápidas

- **Stack**: React 18 + Vite + ShadCN/UI + Tailwind **v3.4** (frontend) · Node.js + Express + `node:sqlite` (backend).
- **Produção**: Railway, deploy automático via push na `main`.
- **Iniciar**: ver `COMO_INICIAR.md`.

## Interface

Antes de mexer em qualquer tela, ler a parte **Design system** do `supren-governanca/BRANDING.md`
e os pontos de variação declarados no `CONSTITUICAO.md` deste repo. Este projeto é **denso e só
escuro** — não copiar espaçamento de tela do gestao-supren, que é confortável e tem tema claro.

Aqui é Tailwind **v3**: token novo entra como variável em `:root` (tripla HSL) e é registrado em
`theme.extend.colors` do `tailwind.config.js`. `@theme inline` é sintaxe da v4 e não funciona.
