/**
 * Sincronização com Fácil123 — via API GraphQL (sem Playwright)
 *
 * Fluxo:
 *  1. GET /usuarios/entrar → extrai CSRF token
 *  2. POST /usuarios/entrar → login, obtém cookie de sessão
 *  3. POST /graphql → getProductions (paginado por mês)
 *  4. Upsert no banco (external_id como chave)
 *  5. Detecta cancelamentos (ordens ausentes no scrape)
 */

const axios = require('axios');
const db    = require('../db/database');

const BASE_URL = 'https://app.facil123.com.br';

// Data de corte — só importa ordens a partir desta data
const IMPORT_FROM_DATE = '2026-03-23';

// ── Normalização de nomes ──────────────────────────────────────────────────────
function normName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s*\(?\s*\d+\s*kg\s*\)?\s*/gi, '')
    .replace(/\s+em\s+kg/gi, '')
    .replace(/\s+kg\b/gi, '')
    .replace(/\s*\(?\s*und\s*\)?\s*/gi, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Mapeamento explícito Fácil123 → MES ───────────────────────────────────────
const EXPLICIT_MAP = {
  'quibe':                      'quibe vegano',
  'empada de palmito g':        'empada de palmito m',
  'creme de leite de amêndoas': 'creme de leite',
};

// ── Lookup/criação de produto ──────────────────────────────────────────────────
function buildProductMap() {
  const products = db.prepare('SELECT id, name FROM products').all();
  const map = new Map();
  for (const p of products) map.set(normName(p.name), p.id);
  return map;
}

function resolveProductId(facil123Name, productMap) {
  const norm = normName(facil123Name);
  if (productMap.has(norm)) return productMap.get(norm);
  const mapped = EXPLICIT_MAP[norm];
  if (mapped && productMap.has(mapped)) return productMap.get(mapped);

  // Cria novo produto automaticamente
  const LOWER = new Set(['de','da','do','das','dos','e','a','o','em','no','na','com','por','para','sem']);
  const newName = facil123Name
    .toLowerCase()
    .replace(/\s+(em\s+)?kg\b/gi, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => (!w ? w : (i === 0 || !LOWER.has(w)) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

  const existing = db.prepare('SELECT id FROM products WHERE name = ?').get(newName);
  if (existing) { productMap.set(norm, existing.id); return existing.id; }

  const r = db.prepare('INSERT INTO products (name, unit) VALUES (?, ?)').run(newName, 'KG');
  console.log(`[sync] Produto criado: "${newName}"`);
  productMap.set(norm, r.lastInsertRowid);
  return r.lastInsertRowid;
}

// ── Log de sync ────────────────────────────────────────────────────────────────
function createLog() {
  return db.prepare(`INSERT INTO sync_logs (started_at) VALUES (datetime('now'))`).run().lastInsertRowid;
}

function finishLog(id, stats) {
  db.prepare(`
    UPDATE sync_logs SET finished_at = datetime('now'), status = ?, imported = ?, updated = ?, skipped = ?, errors = ?, message = ?
    WHERE id = ?
  `).run(
    stats.errors > 0 ? 'partial' : 'ok',
    stats.imported, stats.updated, stats.skipped, stats.errors,
    stats.message || null, id
  );
}

// ── Login no Fácil123 ─────────────────────────────────────────────────────────
async function login() {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

  // 1. GET login page — obtém CSRF token e session_id inicial
  const getResp = await axios.get(`${BASE_URL}/usuarios/entrar`, {
    headers: { 'User-Agent': UA },
    maxRedirects: 0,
    validateStatus: () => true,
  });

  const csrfMatch = getResp.data.match(/name="authenticity_token"[^>]*value="([^"]+)"/);
  if (!csrfMatch) throw new Error('CSRF token não encontrado na página de login');
  const csrfToken = csrfMatch[1];
  console.log(`[sync] CSRF token obtido (${csrfToken.length} chars)`);

  // Cookies do GET (session_id inicial)
  const cookieMap = new Map();
  for (const raw of getResp.headers['set-cookie'] || []) {
    const pair = raw.split(';')[0];
    const eq   = pair.indexOf('=');
    if (eq > 0) cookieMap.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }

  const c1 = Array.from(cookieMap.entries()).map(([k,v]) => `${k}=${v}`).join('; ');

  // 2. POST login — captura cookies de sessão do 303
  const params = new URLSearchParams();
  params.append('authenticity_token', csrfToken);
  params.append('user[email]',       process.env.FACIL123_EMAIL);
  params.append('user[password]',    process.env.FACIL123_SENHA);
  params.append('user[remember_me]', '1');

  const postResp = await axios.post(`${BASE_URL}/usuarios/entrar`, params.toString(), {
    headers: {
      'User-Agent':   UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer':      `${BASE_URL}/usuarios/entrar`,
      'Cookie':       c1,
    },
    maxRedirects: 0,
    validateStatus: () => true,
  });

  // Acumula cookies do 303 (sobrescreve os iniciais se necessário)
  for (const raw of postResp.headers['set-cookie'] || []) {
    const pair = raw.split(';')[0];
    const eq   = pair.indexOf('=');
    if (eq > 0) cookieMap.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }

  const cookieStr = Array.from(cookieMap.entries()).map(([k,v]) => `${k}=${v}`).join('; ');

  if (!cookieStr.includes('_facil123_session')) {
    throw new Error('Login falhou — _facil123_session não encontrado');
  }

  console.log('[sync] Login OK');
  return cookieStr;
}

// ── Query GraphQL de produções ─────────────────────────────────────────────────
const GET_PRODUCTIONS_QUERY = `
query getProductions($expression: String, $start_date: APIDateTime, $end_date: APIDateTime, $page: Int) {
  productions: getProductions(
    expression: $expression
    start_date: $start_date
    end_date: $end_date
    page: $page
  ) {
    id
    produced_at
    expected
    product { id name }
    productionlane { name }
  }
}
`;

async function fetchProductions(cookieStr, startDate, endDate, page = 1) {
  const resp = await axios.post(`${BASE_URL}/graphql`, {
    operationName: 'getProductions',
    variables: { start_date: startDate, end_date: endDate, expression: '', page },
    query: GET_PRODUCTIONS_QUERY,
  }, {
    headers: {
      'Content-Type':     'application/json',
      'Cookie':            cookieStr,
      'Referer':          `${BASE_URL}/#/producoes`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    validateStatus: () => true,
  });

  if (resp.status !== 200) throw new Error(`GraphQL HTTP ${resp.status}`);
  if (resp.data.errors) throw new Error(resp.data.errors[0]?.message || 'GraphQL error');
  return resp.data.data?.productions || [];
}

// ── Gera intervalos mensais de startDate até hoje ─────────────────────────────
function monthRanges(fromDate) {
  const ranges = [];
  const from = new Date(fromDate + 'T00:00:00-03:00');
  const now  = new Date();

  let cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= now) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    // start_date = primeiro dia do mês às 00:00 BRT = 03:00 UTC
    const start = new Date(cur.getFullYear(), cur.getMonth(), 1, 3, 0, 0);
    // end_date   = último instante do mês às 23:59:59 BRT
    const end   = new Date(next.getFullYear(), next.getMonth(), 1, 2, 59, 59, 999);
    ranges.push({ start: start.toISOString(), end: end.toISOString() });
    cur = next;
  }
  return ranges;
}

// ── Sync principal ─────────────────────────────────────────────────────────────
async function runSync() {
  const logId = createLog();
  const stats = { imported: 0, updated: 0, skipped: 0, errors: 0, message: null };

  console.log(`[sync] Iniciando sync Fácil123 (log #${logId})...`);

  try {
    const cookieStr = await login();
    const productMap  = buildProductMap();

    const allRows = [];

    for (const { start, end } of monthRanges(IMPORT_FROM_DATE)) {
      let page = 1;
      while (true) {
        const rows = await fetchProductions(cookieStr, start, end, page);
        console.log(`[sync] ${start.slice(0,7)} página ${page}: ${rows.length} produções`);
        if (!rows.length) break;
        allRows.push(...rows);
        if (rows.length < 25) break; // menos de 25 = última página
        page++;
      }
    }

    console.log(`[sync] Total extraído: ${allRows.length}`);

    const stmtFind   = db.prepare('SELECT id, planned_qty, production_date FROM production_orders WHERE external_id = ?');
    const stmtInsert = db.prepare(`
      INSERT INTO production_orders (product_id, operator_id, production_date, status, planned_qty, external_id, source_sheet)
      VALUES (?, NULL, ?, 'Pendente', ?, ?, 'facil123')
    `);
    const stmtUpdate = db.prepare(`
      UPDATE production_orders SET planned_qty = ?, production_date = ?, updated_at = datetime('now')
      WHERE external_id = ?
    `);

    const seenExternalIds = new Set();

    for (const row of allRows) {
      try {
        if (!row.id || !row.product?.name) { stats.skipped++; continue; }

        // produced_at é timestamp BRT — pega só a data
        const productionDate = row.produced_at ? row.produced_at.slice(0, 10) : null;
        if (!productionDate || productionDate < IMPORT_FROM_DATE) { stats.skipped++; continue; }

        const externalId = String(row.id);
        seenExternalIds.add(externalId);

        const plannedQty = row.expected ? parseFloat(row.expected) : null;
        const productId  = resolveProductId(row.product.name, productMap);

        if (!productId) {
          console.warn(`[sync] Produto não resolvido: "${row.product.name}"`);
          stats.errors++;
          continue;
        }

        const existing = stmtFind.get(externalId);
        if (existing) {
          stmtUpdate.run(plannedQty, productionDate, externalId);
          stats.updated++;
        } else {
          stmtInsert.run(productId, productionDate, plannedQty, externalId);
          stats.imported++;
        }
      } catch (e) {
        console.error(`[sync] Erro na linha ${row.id}:`, e.message);
        stats.errors++;
      }
    }

    // Detecta cancelamentos
    const dbActive = db.prepare(`
      SELECT id, external_id FROM production_orders
      WHERE source_sheet = 'facil123'
        AND status NOT IN ('Cancelado', 'Concluído')
        AND production_date >= ?
    `).all(IMPORT_FROM_DATE);

    const stmtCancel = db.prepare(`UPDATE production_orders SET status = 'Cancelado', updated_at = datetime('now') WHERE id = ?`);
    let cancelled = 0;
    for (const order of dbActive) {
      if (!seenExternalIds.has(order.external_id)) {
        stmtCancel.run(order.id);
        cancelled++;
        console.log(`[sync] Ordem #${order.id} cancelada — ausente no Fácil123`);
      }
    }

    stats.message = `Total: ${allRows.length}, cancelados: ${cancelled}`;
    console.log(`[sync] Concluído — importados: ${stats.imported}, atualizados: ${stats.updated}, ignorados: ${stats.skipped}, cancelados: ${cancelled}, erros: ${stats.errors}`);

  } catch (e) {
    stats.errors++;
    stats.message = e.message;
    console.error('[sync] Erro geral:', e.message);
  }

  finishLog(logId, stats);
  return stats;
}

// ── Último sync ────────────────────────────────────────────────────────────────
function getLastSync() {
  return db.prepare(`
    SELECT id, started_at, finished_at, status, imported, updated, skipped, errors, message
    FROM sync_logs ORDER BY id DESC LIMIT 1
  `).get() || null;
}

module.exports = { runSync, getLastSync };
