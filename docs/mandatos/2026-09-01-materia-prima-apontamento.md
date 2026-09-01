# Mandato — Matéria-prima no apontamento do tablet

- **Data:** 2026-09-01
- **Projeto:** mes-app (etapa 1) + gestao-supren (etapa 2)
- **Solicitante:** Ygor
- **Status:** aprovado

## Objetivo

Fazer a tela de apontamento do tablet já mostrar a matéria-prima e a quantidade
esperada de cada produção (vindas do Fácil123), para o operador digitar apenas a
quantidade que realmente usou.

## Contexto

Confirmado ao vivo em 31/08 que o Fácil123 expõe a matéria-prima esperada por
produção: `getProductions` aceita `production_materials_attributes { expected
consumed product { id name unit { name symbol } } }`. Testado com o cliente de
`Análise de Vendas\extracao\facil123_client.py` nas 3 OPs de 31/08 (QUICHE PALMITO
130G, ASSADO DE GRÃO DE BICO, EMPADA DE PALMITO) — bate com o print da tela do
Fácil (OP 962840).

Hoje o operador não vê insumo nenhum: descobre na mão o que usar e quanto.

Correção de rota em relação ao handoff de 31/08: a etapa 1 é no **mes-app**, não no
gestao-supren. O robô que fala com o Fácil123 é `backend/src/services/facil123Sync.js`
do mes-app; o gestao-supren apenas **lê** as ordens do MES por HTTP
(`lib/operacional/mes-api.ts`, só GET).

## Escopo

**Dentro (etapa 1 — este mandato, repo mes-app):**
- Query `getProductions` passa a pedir `production_materials_attributes`.
- Tabela nova `production_materials` no SQLite do MES (migration + schema.sql),
  uma linha por insumo de cada ordem, com `expected`, `consumed`, nome do produto e
  **símbolo da unidade** (KG/G).
- Upsert dos insumos junto do upsert da ordem, idempotente por (ordem, insumo).
- A API do MES passa a devolver os insumos no detalhe da ordem.

**Dentro (etapa 2 — mandato próprio depois, repo gestao-supren):**
- Tela do tablet lista cada insumo com o esperado + campo para o operador digitar o
  usado; o valor digitado fica **no gestão**.

**Fora (não tocar):**
- **Nada é escrito de volta no Fácil123** — decisão fechada com o Ygor.
- Não mexer nas worktrees de Orçamentos (`gestao-pdf-resumo-wt`, `gestao-toast-wt`).
- Não mexer na worktree antiga `gestao-mes-cutover-wt` (parada desde 26/08).
- Não alterar o fluxo de cronômetro/etapas já em piloto.

## Autonomia concedida

Escrever a migration, a query e a rota sem consultar a cada passo. Exige aprovação:
qualquer escrita no Fácil123, qualquer deploy em produção e o merge do PR.

## Riscos e rollback

1. **Query mais pesada no Fácil** — `production_materials_attributes` engorda a
   resposta paginada. Mitigação: mesma paginação de hoje; se o Fácil recusar, a
   sincronização mantém o comportamento antigo (materiais viram lista vazia).
2. **Unidade ambígua na tela** — "0,08" e "150" não significam nada sem KG/G. Por
   isso o símbolo da unidade é campo obrigatório desde a etapa 1.
3. **`consumed` sempre 0.0 no Fácil** — o campo existe e ninguém preenche. É
   guardado só como espelho; a verdade do que foi usado será o que o operador digitar
   no gestão.
4. **Login no Fácil com senha errada bloqueia a conta** e derruba MES, clientes e
   pedidos juntos (mesma conta `compras@suprenveg.com.br`). Não testar login às cegas.
5. Rollback: tudo atrás de branch + PR; a migration é aditiva (tabela nova), reverter
   é dropar a tabela.

## Critérios de conclusão

- [ ] Migration cria `production_materials` e roda duas vezes sem erro (idempotente)
- [ ] Sincronização traz os insumos das 3 OPs conhecidas de 31/08, com unidade
- [ ] Detalhe da ordem na API devolve os insumos
- [ ] Verificação executada (teste rodado ou fluxo exercitado de ponta a ponta)
- [ ] PR aberto com /cto-review executado

## Aprovação

- Aprovado por: Ygor em 2026-09-01 ("pode construir", após a proposta de 31/08)
