/**
 * Runner de migrations versionadas.
 *
 * Convenção: cada arquivo em src/db/migrations/ deve ter o formato
 *   NNN-descricao.js   (ex: 001-add-sync-logs.js)
 * e exportar uma função `up(db)` que aplica a migration.
 *
 * O runner cria a tabela schema_migrations (se não existir) e executa
 * apenas as migrations ainda não registradas nela.
 */

const fs   = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  if (!fs.existsSync(MIGRATIONS_DIR)) return;

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name)
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const migration = require(path.join(MIGRATIONS_DIR, file));
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
      console.log(`[migrate] aplicada: ${file}`);
    } catch (e) {
      console.error(`[migrate] erro em ${file}:`, e.message);
      throw e;
    }
  }
}

module.exports = { runMigrations };
