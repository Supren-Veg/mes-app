# Constituição do Projeto — mes-app

> Complementa a constituição global (`supren-governanca/CONSTITUICAO.md`). Em conflito, este arquivo prevalece.

## Stack (fechada)

- **Frontend**: React 18 + Vite 5 + ShadCN/UI + Tailwind CSS **v3.4** + `lucide-react`.
- **Backend**: Node.js + Express 4 + `node:sqlite`.
- Não introduzir ORM, UI kit ou framework alternativo.
- Tokens de cor no padrão ShadCN clássico: triplas HSL em `:root`, consumidas via `hsl(var(--token))`.
  **Atenção:** é a v3, não a v4 — `@theme inline` não existe aqui. Token novo se registra em
  `theme.extend.colors` do `tailwind.config.js`.

## Design system

Segue o **núcleo invariável** do `supren-governanca/BRANDING.md` (parte "Design system").
Descumprimento é **motivo de reprovação em PR**.

Pontos de variação declarados por este projeto:

| Ponto | Escolha |
| --- | --- |
| Densidade | **Compacta** — app operacional, volume de dado por tela acima de respiro |
| Escala tipográfica | Padrão do núcleo |
| Dark mode | **Escuro apenas** — não há tema claro; `darkMode: ['class']` está no config mas sem uso |
| Paleta de data-viz | `--chart-*`; séries além disso exigem token de categoria novo |

### Dívidas conhecidas (a resolver na padronização visual)

1. **A primária não é o verde Supren.** `--primary: 142 60% 55%` é um verde mais saturado que o
   oficial (`--supren-400 #5db68a`, ≈ `152 37% 54%`). Alinhar ao branding.
2. **Faltam tokens semânticos.** Existe `--destructive`, mas não `--success`, `--warn` nem
   `--info` — por isso o código recorre a cor crua do Tailwind (74 ocorrências medidas em
   2026-08-17, mais 6 hex hardcoded).

## Convenções obrigatórias

- Branch por tarefa; a `main` recebe só merge via PR.
- Deploy automático no Railway a partir da `main` — quebrar a `main` derruba produção.

## Colaboração

- Branches de outros colaboradores: não mergear, deletar nem modificar.
