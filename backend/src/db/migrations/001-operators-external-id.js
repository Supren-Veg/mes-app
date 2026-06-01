/**
 * Garante que operators.external_id existe.
 * Migration retrocompatível — aplica apenas se a coluna não existir.
 */
function up(db) {
  try {
    db.exec('ALTER TABLE operators ADD COLUMN external_id TEXT');
  } catch (_) { /* coluna já existe */ }
}

module.exports = { up };
