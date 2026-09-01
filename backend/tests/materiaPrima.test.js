/**
 * Matéria-prima da ordem — o que o tablet vai mostrar para o operador.
 *
 * Roda contra um banco descartável (DB_PATH aponta para uma pasta temporária),
 * nunca contra o banco real, e NÃO fala com o Fácil123: os dados abaixo são a
 * cópia fiel do que a consulta ao Fácil devolveu nas OPs de 31/08/2026.
 */
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mes-materia-'));
process.env.DB_PATH = path.join(tmpDir, 'teste.db');

const db = require('../src/db/database');
const axios = require('axios');
const {
  sincronizarMateriais,
  agruparMateriais,
  fetchProductions,
  GET_PRODUCTIONS_QUERY,
  GET_PRODUCTIONS_QUERY_SEM_MATERIAIS,
} = require('../src/services/facil123Sync');
const orderRepository = require('../src/repositories/orderRepository');

// ── Dados reais do Fácil123 (OPs de 31/08/2026) ───────────────────────────────
const QUICHE_PALMITO = [
  { expected: '0.12', consumed: '0.0', product: { id: 5001, name: 'MASSA DE QUICHE',      unit: { name: 'Quilo', symbol: 'KG' } } },
  { expected: '0.08', consumed: '0.0', product: { id: 5002, name: 'RECHEIO DE PALMITO',   unit: { name: 'Quilo', symbol: 'KG' } } },
];
const ASSADO_GRAO_DE_BICO = [
  { expected: '150', consumed: '0.0', product: { id: 6001, name: 'PAPRICA', unit: { name: 'Grama', symbol: 'G' } } },
  { expected: '75',  consumed: '0.0', product: { id: 6002, name: 'SAL',     unit: { name: 'Grama', symbol: 'G' } } },
];

let contador = 0;
function criarOrdem() {
  contador++;
  const produto = db
    .prepare("INSERT INTO products (name, unit) VALUES (?, 'UN')")
    .run(`Produto de teste ${Date.now()}-${contador}`);
  const ordem = db
    .prepare(`
      INSERT INTO production_orders (product_id, production_date, planned_qty, external_id, source_sheet)
      VALUES (?, '2026-08-31', 130, ?, 'facil123')
    `)
    .run(produto.lastInsertRowid, `teste-${Date.now()}-${contador}`);
  return ordem.lastInsertRowid;
}

function materiaisDa(orderId) {
  return db
    .prepare('SELECT external_id, name, unit_symbol, expected, consumed FROM production_materials WHERE order_id = ? ORDER BY name')
    .all(orderId);
}

test('grava a matéria-prima da ordem com a unidade junto', () => {
  const orderId = criarOrdem();
  const total = sincronizarMateriais(orderId, QUICHE_PALMITO);

  assert.strictEqual(total, 2);
  const linhas = materiaisDa(orderId);
  assert.deepStrictEqual(
    linhas.map(l => [l.name, l.expected, l.unit_symbol]),
    [['MASSA DE QUICHE', 0.12, 'KG'], ['RECHEIO DE PALMITO', 0.08, 'KG']],
  );
});

test('unidade em grama é preservada — 150 G não vira 150 KG', () => {
  const orderId = criarOrdem();
  sincronizarMateriais(orderId, ASSADO_GRAO_DE_BICO);

  const paprica = materiaisDa(orderId).find(l => l.name === 'PAPRICA');
  assert.strictEqual(paprica.expected, 150);
  assert.strictEqual(paprica.unit_symbol, 'G');
});

test('sincronizar duas vezes não duplica nem muda nada', () => {
  const orderId = criarOrdem();
  sincronizarMateriais(orderId, QUICHE_PALMITO);
  const primeira = materiaisDa(orderId);

  sincronizarMateriais(orderId, QUICHE_PALMITO);
  assert.deepStrictEqual(materiaisDa(orderId), primeira);
});

test('insumo retirado da receita no Fácil some da ordem', () => {
  const orderId = criarOrdem();
  sincronizarMateriais(orderId, QUICHE_PALMITO);

  sincronizarMateriais(orderId, [QUICHE_PALMITO[0]]);
  const linhas = materiaisDa(orderId);
  assert.strictEqual(linhas.length, 1);
  assert.strictEqual(linhas[0].name, 'MASSA DE QUICHE');
});

test('quantidade que muda no Fácil é atualizada, não duplicada', () => {
  const orderId = criarOrdem();
  sincronizarMateriais(orderId, QUICHE_PALMITO);

  const dobrado = QUICHE_PALMITO.map(m => ({ ...m, expected: String(parseFloat(m.expected) * 2) }));
  sincronizarMateriais(orderId, dobrado);

  const linhas = materiaisDa(orderId);
  assert.strictEqual(linhas.length, 2);
  assert.strictEqual(linhas.find(l => l.name === 'MASSA DE QUICHE').expected, 0.24);
});

test('mesma matéria-prima em duas linhas vira um insumo somado', () => {
  const agrupado = agruparMateriais([
    QUICHE_PALMITO[0],
    { ...QUICHE_PALMITO[0], expected: '0.03' },
  ]);
  assert.strictEqual(agrupado.length, 1);
  assert.strictEqual(agrupado[0].expected, 0.15);
});

test('ordem sem receita no Fácil não quebra e fica sem insumo', () => {
  const orderId = criarOrdem();
  assert.strictEqual(sincronizarMateriais(orderId, undefined), 0);
  assert.strictEqual(sincronizarMateriais(orderId, []), 0);
  assert.strictEqual(materiaisDa(orderId).length, 0);
});

test('receita ausente NÃO apaga a matéria-prima já gravada', () => {
  const orderId = criarOrdem();
  sincronizarMateriais(orderId, QUICHE_PALMITO);

  // "o Fácil não mandou a receita" — nada a reconciliar
  sincronizarMateriais(orderId, null);
  assert.strictEqual(materiaisDa(orderId).length, 2);
  sincronizarMateriais(orderId, undefined);
  assert.strictEqual(materiaisDa(orderId).length, 2);
});

test('receita vazia de verdade ([]) esvazia a ordem', () => {
  const orderId = criarOrdem();
  sincronizarMateriais(orderId, QUICHE_PALMITO);

  sincronizarMateriais(orderId, []);
  assert.strictEqual(materiaisDa(orderId).length, 0);
});

test('linha sem produto é ignorada em vez de virar insumo fantasma', () => {
  const orderId = criarOrdem();
  const total = sincronizarMateriais(orderId, [
    { expected: '1', consumed: '0.0', product: null },
    QUICHE_PALMITO[0],
  ]);
  assert.strictEqual(total, 1);
});

test('o detalhe da ordem entrega a matéria-prima para a tela', () => {
  const orderId = criarOrdem();
  sincronizarMateriais(orderId, QUICHE_PALMITO);

  const ordem = orderRepository.findById(orderId);
  assert.ok(Array.isArray(ordem.materials));
  assert.strictEqual(ordem.materials.length, 2);
  assert.strictEqual(ordem.materials[0].unit_symbol, 'KG');
});

test('erro de campo desconhecido marca a recusa para o fallback entrar', async () => {
  const original = axios.post;
  axios.post = async () => ({
    status: 200,
    data: { errors: [{ message: "Cannot query field 'production_materials_attributes' on type 'Production'" }] },
  });
  try {
    await assert.rejects(
      () => fetchProductions('cookie', '2026-08-01', '2026-08-31', 1, true),
      (e) => e.materiaisRecusados === true,
    );
  } finally {
    axios.post = original;
  }
});

test('sessão expirada NÃO é confundida com recusa da matéria-prima', async () => {
  const original = axios.post;
  axios.post = async () => ({ status: 200, data: { errors: [{ message: 'You need to sign in first' }] } });
  try {
    await assert.rejects(
      () => fetchProductions('cookie', '2026-08-01', '2026-08-31', 1, true),
      (e) => e.materiaisRecusados === undefined,
    );
  } finally {
    axios.post = original;
  }
});

test('erro de servidor (500) não vira tentativa sem matéria-prima', async () => {
  const original = axios.post;
  axios.post = async () => ({ status: 500, data: {} });
  try {
    await assert.rejects(
      () => fetchProductions('cookie', '2026-08-01', '2026-08-31', 1, true),
      (e) => e.materiaisRecusados === undefined,
    );
  } finally {
    axios.post = original;
  }
});

test('a query de emergência não pede matéria-prima ao Fácil', () => {
  assert.ok(GET_PRODUCTIONS_QUERY.includes('production_materials_attributes'));
  assert.ok(!GET_PRODUCTIONS_QUERY_SEM_MATERIAIS.includes('production_materials_attributes'));
  // e continua sendo a mesma consulta de ordens
  assert.ok(GET_PRODUCTIONS_QUERY_SEM_MATERIAIS.includes('produced_at'));
  assert.ok(GET_PRODUCTIONS_QUERY_SEM_MATERIAIS.includes('productionlane'));
});
