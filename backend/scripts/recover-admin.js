/**
 * recover-admin.js
 * Recria a conta do administrador Ygor com uma senha temporária.
 * Rode este script apenas para recuperação de acesso.
 * Gera uma senha temporária aleatória a cada execução (nunca fixa no código — repo público).
 * Após rodar, faça login com a senha impressa e troque imediatamente.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/db/database');

const NOME  = 'Ygor';
const EMAIL = 'ygor@empresa.com'; // ajuste se necessário
const SENHA = crypto.randomBytes(12).toString('base64url'); // temporária, troca obrigatória no 1º login

const hash = bcrypt.hashSync(SENHA, 10);

// Tenta atualizar primeiro
const upd = db.prepare(`
  UPDATE operators
  SET email = ?, password_hash = ?, password_change_required = 1, role = 'admin'
  WHERE name = ?
`).run(EMAIL, hash, NOME);

if (upd.changes === 0) {
  // Não existe → cria
  db.prepare(`
    INSERT INTO operators (name, email, password_hash, password_change_required, role)
    VALUES (?, ?, ?, 1, 'admin')
  `).run(NOME, EMAIL, hash);
  console.log(`Operador "${NOME}" criado como admin.`);
} else {
  console.log(`Senha do operador "${NOME}" redefinida.`);
}

console.log(`\nAcesse o sistema com:`);
console.log(`  Email : ${EMAIL}`);
console.log(`  Senha : ${SENHA}`);
console.log(`\n⚠ Troque a senha imediatamente após o login!`);
