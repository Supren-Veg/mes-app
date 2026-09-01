-- ============================================================
-- MES – Manufacturing Execution System
-- Schema v1.0 — SQLite
-- Compatível com integração futura ERP Fácil123 (uuid, external_id)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- operators
-- Representa os operadores de produção
-- ============================================================
CREATE TABLE IF NOT EXISTS operators (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  name        VARCHAR(100) NOT NULL UNIQUE,
  external_id VARCHAR(50),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- products
-- Catálogo normalizado de produtos
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  name        VARCHAR(200) NOT NULL UNIQUE,
  unit        VARCHAR(20)  NOT NULL DEFAULT 'KG',
  external_id VARCHAR(50),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- stages
-- Catálogo normalizado de etapas de produção
-- is_legacy: etapas genéricas de dados históricos não desmembrados
-- ============================================================
CREATE TABLE IF NOT EXISTS stages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  name        VARCHAR(100) NOT NULL UNIQUE,
  category    VARCHAR(50),
  is_legacy   INTEGER NOT NULL DEFAULT 0,
  legacy_note TEXT,
  external_id VARCHAR(50),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- production_orders
-- Uma ordem agrupa todas as etapas de um produto em um dia
-- ============================================================
CREATE TABLE IF NOT EXISTS production_orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  operator_id     INTEGER REFERENCES operators(id) ON DELETE SET NULL,
  production_date TEXT    NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'Pendente'
                  CHECK(status IN ('Pendente','Em Andamento','Concluído','Cancelado')),
  planned_qty     REAL,
  produced_qty    REAL,
  notes           TEXT,
  external_id     VARCHAR(50),
  source_sheet    VARCHAR(50),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_date       ON production_orders(production_date);
CREATE INDEX IF NOT EXISTS idx_orders_product    ON production_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_operator   ON production_orders(operator_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON production_orders(status);

-- ============================================================
-- production_steps
-- Uma linha por etapa dentro de uma ordem de produção
-- net_time_minutes = gross - soma das pausas (calculado no backend)
-- ============================================================
CREATE TABLE IF NOT EXISTS production_steps (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  order_id            INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  stage_id            INTEGER NOT NULL REFERENCES stages(id) ON DELETE RESTRICT,
  status              VARCHAR(20) NOT NULL DEFAULT 'Pendente'
                      CHECK(status IN ('Pendente','Em Andamento','Concluído','Cancelado')),
  started_at          TEXT,
  finished_at         TEXT,
  gross_time_minutes  REAL,
  net_time_minutes    REAL,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_steps_order   ON production_steps(order_id);
CREATE INDEX IF NOT EXISTS idx_steps_stage   ON production_steps(stage_id);
CREATE INDEX IF NOT EXISTS idx_steps_started ON production_steps(started_at);

-- ============================================================
-- production_pauses
-- Pausas normalizadas (substitui as colunas F–K achatadas da planilha)
-- ============================================================
CREATE TABLE IF NOT EXISTS production_pauses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  step_id          INTEGER NOT NULL REFERENCES production_steps(id) ON DELETE CASCADE,
  pause_index      INTEGER NOT NULL DEFAULT 1,
  paused_at        TEXT    NOT NULL,
  resumed_at       TEXT,
  duration_minutes REAL,
  reason           TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pauses_step ON production_pauses(step_id);

-- ============================================================
-- production_materials
-- Matéria-prima esperada de cada ordem, espelhada do Fácil123.
-- Chave (order_id, external_id) torna o sync idempotente; external_id é o id
-- do PRODUTO no Fácil, que sobrevive à recriação da linha da receita.
-- unit_symbol é obrigatório na prática: "0,08" e "150" são ambíguos sem KG/G.
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_materials_order ON production_materials(order_id);

-- ============================================================
-- Trigger: updated_at automático
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_operators_updated
  AFTER UPDATE ON operators
  BEGIN UPDATE operators SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_products_updated
  AFTER UPDATE ON products
  BEGIN UPDATE products SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_stages_updated
  AFTER UPDATE ON stages
  BEGIN UPDATE stages SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_orders_updated
  AFTER UPDATE ON production_orders
  BEGIN UPDATE production_orders SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_steps_updated
  AFTER UPDATE ON production_steps
  BEGIN UPDATE production_steps SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_materials_updated
  AFTER UPDATE ON production_materials
  BEGIN UPDATE production_materials SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id; END;
