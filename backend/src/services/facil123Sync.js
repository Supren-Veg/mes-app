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
  'creme de leite de amendoas': 'creme de leite', // variante sem acento
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

// ── Matéria-prima da ordem ────────────────────────────────────────────────────
// O Fácil123 devolve a receita planejada de cada produção. Guardamos como
// espelho para o tablet mostrar ao operador o que usar e quanto. Nada volta
// para o Fácil — o que o operador digitar fica no gestao.

/**
 * Statements da matéria-prima. Criados por rodada (mesmo estilo dos statements de
 * ordem em runSync) em vez de cacheados no módulo: um cache global sobreviveria a
 * uma reabertura do banco (db:reset, outro DB_PATH) apontando para conexão morta.
 */
function criarStmtsMateriais() {
  return {
    buscar: db.prepare(`
      SELECT id, name, unit_symbol, expected, consumed
      FROM production_materials WHERE order_id = ? AND external_id = ?
    `),
    inserir: db.prepare(`
      INSERT INTO production_materials (order_id, external_id, name, unit_symbol, expected, consumed)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    atualizar: db.prepare(`
      UPDATE production_materials SET name = ?, unit_symbol = ?, expected = ?, consumed = ? WHERE id = ?
    `),
    listar: db.prepare('SELECT id, external_id FROM production_materials WHERE order_id = ?'),
    apagar: db.prepare('DELETE FROM production_materials WHERE id = ?'),
  };
}

function paraNumero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function somar(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

/**
 * Junta as linhas cruas do Fácil por produto.
 * O Fácil aceita a mesma matéria-prima em duas linhas da mesma receita; para o
 * operador isso é UM insumo com a soma — e é o que a chave (ordem, produto) exige.
 */
function agruparMateriais(attrs) {
  const porProduto = new Map();
  for (const linha of Array.isArray(attrs) ? attrs : []) {
    const produto = linha?.product;
    if (!produto?.id) continue;
    const externalId = String(produto.id);
    const expected = paraNumero(linha.expected);
    const consumed = paraNumero(linha.consumed);
    const existente = porProduto.get(externalId);
    if (existente) {
      existente.expected = somar(existente.expected, expected);
      existente.consumed = somar(existente.consumed, consumed);
      continue;
    }
    porProduto.set(externalId, {
      externalId,
      // símbolo primeiro: "0,08 KG" e "150 G" só fazem sentido com a unidade junto
      unitSymbol: produto.unit?.symbol || produto.unit?.name || null,
      name: (produto.name || '').trim() || `Insumo ${externalId}`,
      expected,
      consumed,
    });
  }
  return Array.from(porProduto.values());
}

/**
 * Deixa a matéria-prima da ordem igual à do Fácil: insere as novas, atualiza as
 * que mudaram e apaga as que saíram da receita. Idempotente.
 *
 * `attrs` ausente (null/undefined) significa "o Fácil não mandou a receita", e
 * isso NÃO é o mesmo que "a receita está vazia": nesse caso não se apaga nada.
 * Lista vazia de verdade (`[]`) reconcilia normalmente. A distinção fica crítica
 * na etapa 2, quando esta tabela passar a carregar o que o operador digitou.
 *
 * Devolve quantos insumos a ordem tem depois do sync.
 */
function sincronizarMateriais(orderId, attrs, stmts = criarStmtsMateriais()) {
  const veioReceita = Array.isArray(attrs);
  const materiais = agruparMateriais(attrs);
  const vistos = new Set();

  for (const m of materiais) {
    vistos.add(m.externalId);
    const atual = stmts.buscar.get(orderId, m.externalId);
    if (!atual) {
      stmts.inserir.run(orderId, m.externalId, m.name, m.unitSymbol, m.expected, m.consumed);
      continue;
    }
    // Gravar sem mudança nenhuma custa duas escritas por insumo (o UPDATE mais o
    // trigger de updated_at) e, no volume da rodada inteira, isso pesa.
    const igual =
      atual.name === m.name &&
      atual.unit_symbol === m.unitSymbol &&
      atual.expected === m.expected &&
      atual.consumed === m.consumed;
    if (!igual) {
      stmts.atualizar.run(m.name, m.unitSymbol, m.expected, m.consumed, atual.id);
    }
  }

  if (!veioReceita) return materiais.length;

  for (const antigo of stmts.listar.all(orderId)) {
    if (!vistos.has(antigo.external_id)) stmts.apagar.run(antigo.id);
  }

  return materiais.length;
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
// A matéria-prima é um bloco à parte e a query é MONTADA com ou sem ele. Derivar
// a versão de emergência por regex era frágil: bastava mexer nos campos para o
// recorte não casar mais, e aí o "fallback" reenviava a query idêntica que
// acabara de falhar — a rede de proteção viraria a causa da queda.
const BLOCO_MATERIAIS = `
    production_materials_attributes {
      expected
      consumed
      product { id name unit { name symbol } }
    }`;

function montarQueryProducoes(blocoMateriais = '') {
  return `
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
    productionlane { name }${blocoMateriais}
  }
}
`;
}

const GET_PRODUCTIONS_QUERY = montarQueryProducoes(BLOCO_MATERIAIS);

// Só entra em cena se o Fácil123 recusar o bloco novo: o sync das ordens é
// essencial e não pode cair junto com um campo experimental.
const GET_PRODUCTIONS_QUERY_SEM_MATERIAIS = montarQueryProducoes();

// Como o Fácil123 avisa que não conhece o campo — a única falha que a query de
// emergência resolve.
const CAMPO_DESCONHECIDO = /unknown field|cannot query field|undefined field|no field|production_materials_attributes/i;

async function fetchProductions(cookieStr, startDate, endDate, page = 1, comMateriais = true) {
  const resp = await axios.post(`${BASE_URL}/graphql`, {
    operationName: 'getProductions',
    variables: { start_date: startDate, end_date: endDate, expression: '', page },
    query: comMateriais ? GET_PRODUCTIONS_QUERY : GET_PRODUCTIONS_QUERY_SEM_MATERIAIS,
  }, {
    headers: {
      'Content-Type':     'application/json',
      'Cookie':            cookieStr,
      'Referer':          `${BASE_URL}/#/producoes`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    // Sem teto, um Fácil engasgado com o payload maior penduraria a requisição
    // para sempre e o sync ficaria eternamente 'running', sem nunca fechar o log.
    timeout: 60_000,
    validateStatus: () => true,
  });

  // Query malformada/recusada = 400/422 no Fácil; qualquer outro status é rede ou
  // sessão, e aí repetir sem os materiais não adianta nada.
  if (resp.status !== 200) {
    const err = new Error(`GraphQL HTTP ${resp.status}`);
    if (comMateriais && (resp.status === 400 || resp.status === 422)) err.materiaisRecusados = true;
    throw err;
  }
  if (resp.data.errors) {
    const mensagem = resp.data.errors[0]?.message || 'GraphQL error';
    const err = new Error(mensagem);
    // Sessão expirada e rate limit também chegam aqui: repetir sem a matéria-prima
    // não resolveria nenhum dos dois e ainda jogaria fora a receita da rodada.
    if (comMateriais && CAMPO_DESCONHECIDO.test(mensagem)) err.materiaisRecusados = true;
    throw err;
  }
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
  const stats = { imported: 0, updated: 0, skipped: 0, errors: 0, materiais: 0, message: null };

  console.log(`[sync] Iniciando sync Fácil123 (log #${logId})...`);

  try {
    const cookieStr = await login();
    const productMap  = buildProductMap();

    const allRows = [];
    // Desliga na primeira recusa e não volta a tentar no mesmo sync — insistir a
    // cada página só gastaria requisição no Fácil.
    let materiaisSuportados = true;

    for (const { start, end } of monthRanges(IMPORT_FROM_DATE)) {
      let page = 1;
      while (true) {
        let rows;
        try {
          rows = await fetchProductions(cookieStr, start, end, page, materiaisSuportados);
        } catch (e) {
          if (!materiaisSuportados || !e.materiaisRecusados) throw e;
          console.warn(`[sync] Fácil123 recusou a matéria-prima na query (${e.message}) — seguindo sem ela`);
          materiaisSuportados = false;
          rows = await fetchProductions(cookieStr, start, end, page, false);
        }
        console.log(`[sync] ${start.slice(0,7)} página ${page}: ${rows.length} produções`);
        if (!rows.length) break;
        allRows.push(...rows);
        if (rows.length < 25) break; // menos de 25 = última página
        page++;
      }
    }

    console.log(`[sync] Total extraído: ${allRows.length}`);

    // IMPORTANTE: a busca termina TODAS as páginas antes do upsert começar, então
    // `materiaisSuportados` já tem valor final aqui. Quem trocar isso por processar
    // página a página precisa parar de reconciliar a matéria-prima no meio do
    // caminho — senão uma recusa tardia apaga a receita das ordens já gravadas.

    const stmtFind   = db.prepare('SELECT id, planned_qty, production_date FROM production_orders WHERE external_id = ?');
    const stmtInsert = db.prepare(`
      INSERT INTO production_orders (product_id, operator_id, production_date, status, planned_qty, external_id, source_sheet)
      VALUES (?, NULL, ?, 'Pendente', ?, ?, 'facil123')
    `);
    const stmtUpdate = db.prepare(`
      UPDATE production_orders SET planned_qty = ?, production_date = ?, updated_at = datetime('now')
      WHERE external_id = ?
    `);

    const stmtsMateriais = criarStmtsMateriais();
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
        let orderId;
        if (existing) {
          stmtUpdate.run(plannedQty, productionDate, externalId);
          orderId = existing.id;
          stats.updated++;
        } else {
          orderId = stmtInsert.run(productId, productionDate, plannedQty, externalId).lastInsertRowid;
          stats.imported++;
        }

        // Só reconcilia quando o Fácil realmente mandou a receita: com a query de
        // fallback, lista vazia quer dizer "não perguntei" — apagar o que já está
        // no banco seria jogar fora informação boa.
        if (materiaisSuportados) {
          stats.materiais += sincronizarMateriais(orderId, row.production_materials_attributes, stmtsMateriais);
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

    stats.message = `Total: ${allRows.length}, cancelados: ${cancelled}, insumos: ${stats.materiais}${materiaisSuportados ? '' : ' (matéria-prima indisponível nesta rodada)'}`;
    console.log(`[sync] Concluído — importados: ${stats.imported}, atualizados: ${stats.updated}, ignorados: ${stats.skipped}, cancelados: ${cancelled}, insumos: ${stats.materiais}, erros: ${stats.errors}`);

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

module.exports = {
  runSync,
  getLastSync,
  sincronizarMateriais,
  agruparMateriais,
  fetchProductions,
  GET_PRODUCTIONS_QUERY,
  GET_PRODUCTIONS_QUERY_SEM_MATERIAIS,
};
