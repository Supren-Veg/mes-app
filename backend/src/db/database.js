// Usa o módulo SQLite nativo do Node.js (disponível a partir do Node 22.5+)
// Não requer compilação de módulos nativos.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const SEED_DB     = path.join(__dirname, '..', '..', 'data', 'mes.db');
const DB_PATH     = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : SEED_DB;
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Na primeira execução com volume externo, copia o banco local como ponto de partida
if (process.env.DB_PATH && !fs.existsSync(DB_PATH) && fs.existsSync(SEED_DB)) {
  fs.copyFileSync(SEED_DB, DB_PATH);
  console.log('Banco de dados iniciado a partir da cópia local.');
}

const db = new DatabaseSync(DB_PATH);

// Aplica o schema (idempotente via CREATE TABLE IF NOT EXISTS)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

// Migração de auth — idempotente
const authCols = [
  "ALTER TABLE operators ADD COLUMN email TEXT",
  "ALTER TABLE operators ADD COLUMN password_hash TEXT",
  "ALTER TABLE operators ADD COLUMN password_change_required INTEGER DEFAULT 1",
];
for (const sql of authCols) {
  try { db.exec(sql); } catch (_) { /* coluna já existe */ }
}

// Migração de role — idempotente
try { db.exec("ALTER TABLE operators ADD COLUMN role TEXT DEFAULT 'conferente'"); } catch (_) {}
// Garante que exista pelo menos um admin se INITIAL_ADMIN_EMAIL estiver configurado
if (process.env.INITIAL_ADMIN_EMAIL) {
  db.prepare("UPDATE operators SET role = 'admin' WHERE email = ? AND (role IS NULL OR role != 'admin')")
    .run(process.env.INITIAL_ADMIN_EMAIL);
}
// Renomeia role 'auxiliar' para 'producao' (refatoração de nomenclatura)
db.prepare("UPDATE operators SET role = 'producao' WHERE role = 'auxiliar'").run();
// Renomeia role 'user' para 'conferente' (refatoração de nomenclatura)
db.prepare("UPDATE operators SET role = 'conferente' WHERE role = 'user'").run();

// Migração de metas — idempotente
db.exec(`
  CREATE TABLE IF NOT EXISTS stage_targets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    stage_id       INTEGER NOT NULL REFERENCES stages(id),
    target_minutes REAL    NOT NULL,
    created_at     TEXT    DEFAULT (datetime('now')),
    UNIQUE(stage_id)
  )
`);

// Migração de normalização de nomes — idempotente
// Corrige bancos existentes que não passaram pelos scripts normalize*.js
try {
  db.exec('PRAGMA foreign_keys = OFF');

  // Mescla oldName → canonicalName.
  // Se canonicalName não existir no banco, renomeia oldName para se tornar o canônico.
  function mergeStage(oldName, canonicalName) {
    const old = db.prepare("SELECT id FROM stages WHERE name = ?").get(oldName);
    if (!old) return;
    let canonical = db.prepare("SELECT id FROM stages WHERE name = ?").get(canonicalName);
    if (!canonical) {
      db.prepare("UPDATE stages SET name = ? WHERE id = ?").run(canonicalName, old.id);
      console.log(`[migração] etapa renomeada: "${oldName}" → "${canonicalName}"`);
      return;
    }
    if (old.id === canonical.id) return;
    db.prepare("UPDATE production_steps SET stage_id = ? WHERE stage_id = ?").run(canonical.id, old.id);
    db.prepare("DELETE FROM stages WHERE id = ?").run(old.id);
    console.log(`[migração] etapa mesclada: "${oldName}" → "${canonicalName}"`);
  }

  // ─── Etapas: consolidações ──────────────────────────────────────────────
  // IMPORTANTE: a primeira entrada de cada grupo canônico deve vir primeiro,
  // pois se o canônico não existir ela é renomeada para criá-lo.
  const stageMerges = [
    ['ARMAZENAGEM',          'EMBALAGEM'],
    ['SELAR',                'EMBALAGEM'],
    ['DATAR',                'EMBALAGEM'],
    ['PROCESSAR THERMOMIX',  'PROCESSAR'],  // cria PROCESSAR se não existir
    ['BATER',                'PROCESSAR'],
    ['BATER AMÊNDOAS',       'PROCESSAR'],
    ['BATER AMENDOAS',       'PROCESSAR'],
    ['FERVER AMÊNDOAS',      'PROCESSAR'],
    ['FERVER AMENDOAS',      'PROCESSAR'],
    ['LIQUIDIFICAR',         'PROCESSAR'],
    ['MISTURAR MASSA',       'HOMOGENEIZAR'],
    ['CONTAR FORMINHAS',     'SEPARAR INSUMOS'],
    ['PESAR INSUMOS',        'SEPARAR INSUMOS'],
    ['PESAR',                'SEPARAR INSUMOS'],
    ['PESAR ÁGUA',           'SEPARAR INSUMOS'],
    ['PESAR AGUA',           'SEPARAR INSUMOS'],
    ['PESAR AMÊNDOAS',       'SEPARAR INSUMOS'],
    ['PESAR AMENDOAS',       'SEPARAR INSUMOS'],
    ['INICIO',               'SEPARAR INSUMOS'],
    ['POR MOLHO NA BANDEJA', 'MONTAGEM'],
    ['POR MOLHO NA BANDEIJA','MONTAGEM'],
    ['FECHAR EMPADA',        'TAMPAR'],
    ['HIGIENIZAR BERINJELA', 'HIGIENIZAR'],  // cria HIGIENIZAR se não existir
    ['HIGIENIZAR BERINGELA', 'HIGIENIZAR'],
    ['LAVAR',                'HIGIENIZAR'],
    ['LAVAGEM (MÁQUINA)',    'HIGIENIZAR'],
    ['LAVAGEM(MAQUINA)',     'HIGIENIZAR'],
    ['PRÉ PREPARO',          'SEPARAR INSUMOS'],
  ];

  for (const [oldName, canonicalName] of stageMerges) {
    mergeStage(oldName, canonicalName);
  }

  // ─── Produto: CREME DE LEITE DE AMÊNDOAS → CREME DE LEITE ──────────────
  // Busca o canônico por qualquer variante (casing, com ou sem unidade)
  const cremeLeiteCanonicos = [
    'Creme de Leite', 'CREME DE LEITE', 'CREME DE LEITE (KG)', 'Creme de Leite (KG)',
  ];
  const cremeLeiteAntigos = [
    'CREME DE LEITE DE AMÊNDOAS (KG)', 'Creme de Leite de Amêndoas (KG)',
    'CREME DE LEITE DE AMÊNDOAS',      'Creme de Leite de Amêndoas',
    'CREME DE LEITE DE AMENDOAS (KG)', 'Creme de Leite de Amendoas (KG)',
    'CREME DE LEITE DE AMENDOAS',      'Creme de Leite de Amendoas',
  ];

  let cremeLeiteId = null;
  for (const name of cremeLeiteCanonicos) {
    const row = db.prepare("SELECT id FROM products WHERE name = ?").get(name);
    if (row) { cremeLeiteId = row.id; break; }
  }

  if (cremeLeiteId) {
    for (const name of cremeLeiteAntigos) {
      const old = db.prepare("SELECT id FROM products WHERE name = ?").get(name);
      if (old && old.id !== cremeLeiteId) {
        db.prepare("UPDATE production_orders SET product_id = ? WHERE product_id = ?").run(cremeLeiteId, old.id);
        db.prepare("DELETE FROM products WHERE id = ?").run(old.id);
        console.log(`[migração] produto mesclado: "${name}" → Creme de Leite`);
      }
    }
  }

  db.exec('PRAGMA foreign_keys = ON');
} catch (e) {
  console.error('[migração] Erro nas migrations de normalização:', e.message);
  try { db.exec('PRAGMA foreign_keys = ON'); } catch (_) {}
}

// Migração de normalização de produtos — nomes ALL CAPS com unidade → Title Case sem unidade no nome
try {
  const productRenames = [
    ['ABOBRINHA ASSADA (KG)',             'Abobrinha Assada',            'KG' ],
    ['BERINJELA ASSADA (KG)',             'Berinjela Assada',            'KG' ],
    ['CALDO DE LEGUMES (KG)',             'Caldo de Legumes',            'KG' ],
    ['CREME DE ARROZ (KG)',               'Creme de Arroz',              'KG' ],
    ['CREME DE INHAME (KG)',              'Creme de Inhame',             'KG' ],
    ['CREME DE LEITE (KG)',               'Creme de Leite',              'KG' ],
    ['CUSCUZ PAULISTA (KG)',              'Cuscuz Paulista',             'KG' ],
    ['DISCO DE LEGUMES 240G',             'Discos Proteicos 240g',       'UND'],
    ['EMPADA DE ESPINAFRE M (KG)',        'Empada de Espinafre M',       'KG' ],
    ['EMPADA DE ESPINAFRE PP (KG)',       'Empada de Espinafre PP',      'KG' ],
    ['EMPADA DE MAÇÃ (KG)',              'Empada de Maçã',              'KG' ],
    ['EMPADA DE MAÇÃ 120G',             'Empada de Maçã 120g',         'UND'],
    ['EMPADA DE PALMITO (M) EM KG',      'Empada de Palmito M',         'KG' ],
    ['EMPADA DE PALMITO (PP) EM KG',     'Empada de Palmito PP',        'KG' ],
    ['EMPADA DE PALMITO 160G',           'Empada de Palmito 160g',      'UND'],
    ['EMPADA DE SABORES P (KG)',          'Empada de Sabores P',         'KG' ],
    ['EMPADA DE TOMATE SECO (PP) EM KG', 'Empada de Tomate Seco PP',    'KG' ],
    ['EMPADA DE TOMATE SECO P (KG)',      'Empada de Tomate Seco P',     'KG' ],
    ['ESTROGONOFE DE GRÃO DE BICO (KG)', 'Estrogonofe de Grão de Bico', 'KG' ],
    ['FARINHA DE AMÊNDOAS (KG)',         'Farinha de Amêndoas',         'KG' ],
    ['GRÃO DE BICO COZIDO (KG)',         'Grão de Bico Cozido',         'KG' ],
    ['GUISADO DE PINHÃO 450G',           'Guisado de Pinhão 450g',      'UND'],
    ['LASANHA DE ABOBRINHA (KG)',         'Lasanha de Abobrinha',        'KG' ],
    ['LASANHA DE ABOBRINHA 410 G',        'Lasanha de Abobrinha 410g',   'UND'],
    ['LASANHA DE BERINJELA 1,2KG (UND)', 'Lasanha de Berinjela 1,2kg',  'UND'],
    ['LASANHA DE BERINJELA 410G (UND)',  'Lasanha de Berinjela 410g',   'UND'],
    ['LENTILHA COZIDA (KG)',             'Lentilha Cozida',             'KG' ],
    ['MASSA DE EMPADA (KG)',             'Massa de Empada',             'KG' ],
    ['MOLHO DE TOMATE (KG)',             'Molho de Tomate',             'KG' ],
    ['PALMITO (KG)',                     'Palmito',                     'KG' ],
    ['PASTA DE ALHO (KG)',               'Pasta de Alho',               'KG' ],
    ['PINHÃO COZIDO (KG)',              'Pinhão Cozido',               'KG' ],
    ['PÃO DE QUEIJO VEGANO (KG)',        'Pão de Queijo Vegano',        'KG' ],
    ['QUEIJO DE INHAME (KG)',            'Queijo de Inhame',            'KG' ],
    ['QUEIJO VEGANO DA CASA (KG)',       'Queijo Vegano da Casa',       'KG' ],
    ['QUIBE VEGANO (KG)',                'Quibe Vegano',                'KG' ],
    ['QUIBE VEGANO 180G',               'Quibe Vegano 180g',           'UND'],
    ['QUICHE SABORES (KG)',              'Quiche Sabores',              'KG' ],
    ['RECHEIO DE MAÇÃ (KG)',            'Recheio de Maçã',             'KG' ],
    ['RECHEIO DE PALMITO (KG)',          'Recheio de Palmito',          'KG' ],
    ['RECHEIO DE TOMATE SECO (KG)',      'Recheio de Tomate Seco',      'KG' ],
  ];

  const stmtRename = db.prepare('UPDATE products SET name = ?, unit = ? WHERE name = ?');
  for (const [oldName, newName, unit] of productRenames) {
    const r = stmtRename.run(newName, unit, oldName);
    if (r.changes > 0) console.log(`[migração] produto: "${oldName}" → "${newName}"`);
  }

  // Inserir produtos ausentes (adicionados pelo normalize4.js, inexistentes no Railway)
  const toInsert = [
    ['Empada de Espinafre 160g',         'UND'],
    ['Empada de Palmito P',              'KG' ],
    ['Empada de Alho Poró P',            'KG' ],
    ['Estrogonofe de Grão de Bico 450g', 'UND'],
  ];
  const stmtCheck  = db.prepare('SELECT 1 FROM products WHERE name = ?');
  const stmtInsert = db.prepare('INSERT INTO products (name, unit) VALUES (?, ?)');
  for (const [name, unit] of toInsert) {
    if (!stmtCheck.get(name)) {
      stmtInsert.run(name, unit);
      console.log(`[migração] produto inserido: "${name}" (${unit})`);
    }
  }
} catch (e) {
  console.error('[migração produtos] Erro:', e.message);
}

// Corrige nomes de produtos criados automaticamente pelo sync com capitalização errada
try {
  const badNames = [
    ['GrãO De Bico OrgâNico Cozido',      'Grão de Bico Orgânico Cozido'],
    ['Creme De Leite De AmêNdoas',         'Creme de Leite de Amêndoas'],
    ['Lentilha Canadense Cozida',          'Lentilha Canadense Cozida'],   // já correto, mantém
    ['Desmoldante Da Casa',                'Desmoldante da Casa'],
    ['Massa De Empada Doce',               'Massa de Empada Doce'],
    ['Molho Verde',                        'Molho Verde'],
    ['Molho Branco',                       'Molho Branco'],
    ['Queijo Cajupiry Da Casa',            'Queijo Cajupiry da Casa'],
  ];
  const stmt = db.prepare('UPDATE products SET name = ? WHERE name = ?');
  for (const [old, fixed] of badNames) {
    const r = stmt.run(fixed, old);
    if (r.changes > 0) console.log(`[migração] produto corrigido: "${old}" → "${fixed}"`);
  }
} catch (e) {
  console.error('[migração] Erro ao corrigir nomes de produtos:', e.message);
}

// Tabela de log de sincronização com Fácil123
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT    NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    status     TEXT    NOT NULL DEFAULT 'running',
    imported   INTEGER DEFAULT 0,
    updated    INTEGER DEFAULT 0,
    skipped    INTEGER DEFAULT 0,
    errors     INTEGER DEFAULT 0,
    message    TEXT
  )
`);

// Runner de migrations versionadas (src/db/migrations/NNN-descricao.js)
const { runMigrations } = require('./migrate');
runMigrations(db);

module.exports = db;
