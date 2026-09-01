/**
 * Matéria-prima esperada por ordem — espelho do que o Fácil123 planejou.
 *
 * Aditiva por construção: cria a tabela se não existir, então rodar duas vezes
 * não quebra e bancos antigos sobem sem perder nada.
 *
 * `external_id` é o id do PRODUTO no Fácil123 (não o do vínculo): é o que
 * sobrevive quando o Fácil recria a linha da receita. Junto com `order_id`
 * forma a chave que torna o sync idempotente.
 *
 * `consumed` guarda o que o Fácil diz ter sido consumido — hoje sempre 0,0,
 * porque ninguém preenche por lá. A verdade do que foi usado será o que o
 * operador digitar no gestao; este campo é só espelho.
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS production_materials (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid        TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      order_id    INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
      external_id VARCHAR(50)  NOT NULL,
      name        VARCHAR(200) NOT NULL,
      unit_symbol VARCHAR(20),
      expected    REAL,
      consumed    REAL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE (order_id, external_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_materials_order ON production_materials(order_id);`);
}

module.exports = { up };
