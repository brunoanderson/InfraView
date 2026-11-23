-- =============================================================================
-- 001_init.sql — schema inicial do InfraView
--
-- Convenções:
--   * nomes em snake_case;
--   * datas em TEXT no formato ISO 8601 UTC (ex.: 2026-11-23T17:00:00.000Z),
--     o mesmo de Date.prototype.toISOString(). Por isso a comparação de texto
--     (>=, <, ORDER BY) funciona como comparação de datas;
--   * enums viram CHECK (... IN (...)): o próprio banco recusa valores inválidos;
--   * booleanos são INTEGER 0/1 (o SQLite não tem tipo BOOLEAN).
--
-- Este arquivo roda dentro de uma transação aberta por db/migrate.js:
-- se qualquer comando falhar, nada aqui é aplicado.
-- =============================================================================

-- Usuários do painel. O cadastro público cria 'viewer'; só 'admin' altera dispositivos.
CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Categorias da tela Rede (Wi-Fi, Segurança, Energia, Outros).
CREATE TABLE categories (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z0-9-]*'),
    icon TEXT NOT NULL                  -- classe do Bootstrap Icons, ex.: bi-wifi
);

-- Dispositivos monitorados. 1 categoria : N dispositivos.
CREATE TABLE devices (
    id           INTEGER PRIMARY KEY,
    name         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    model        TEXT    NOT NULL,
    ip           TEXT    NOT NULL UNIQUE,
    status       TEXT    NOT NULL DEFAULT 'online'
                         CHECK (status IN ('online', 'offline', 'atencao')),
    status_note  TEXT,                  -- ex.: "Latência Alta", "Em bateria"
    latency_ms   INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    is_gateway   INTEGER NOT NULL DEFAULT 0 CHECK (is_gateway IN (0, 1)),
    icon         TEXT    NOT NULL DEFAULT 'bi-hdd',
    up_since     TEXT,                  -- desde quando está no ar (NULL se offline)
    last_seen_at TEXT,                  -- última resposta recebida
    -- Sem ON DELETE: o padrão (NO ACTION) impede apagar uma categoria que ainda
    -- tem dispositivos, e o erro sai como SQLITE_CONSTRAINT_FOREIGNKEY.
    -- (Com RESTRICT o efeito seria o mesmo, mas o código vira ..._TRIGGER.)
    category_id  INTEGER NOT NULL REFERENCES categories (id),
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_devices_category ON devices (category_id);
CREATE INDEX idx_devices_status   ON devices (status);

-- Quedas (downtime). ended_at NULL = queda em andamento.
-- A duração não é guardada: é calculada a partir de started_at/ended_at.
CREATE TABLE downtime_events (
    id         INTEGER PRIMARY KEY,
    started_at TEXT    NOT NULL,
    ended_at   TEXT    CHECK (ended_at IS NULL OR ended_at >= started_at),
    reason     TEXT,
    device_id  INTEGER NOT NULL REFERENCES devices (id) ON DELETE CASCADE
);
CREATE INDEX idx_downtime_device_started ON downtime_events (device_id, started_at);
CREATE INDEX idx_downtime_started        ON downtime_events (started_at);

-- Picos de latência acima do limite configurado.
CREATE TABLE latency_events (
    id           INTEGER PRIMARY KEY,
    recorded_at  TEXT    NOT NULL,
    latency_ms   INTEGER NOT NULL CHECK (latency_ms >= 0),
    threshold_ms INTEGER NOT NULL CHECK (threshold_ms > 0),
    resolved     INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
    device_id    INTEGER NOT NULL REFERENCES devices (id) ON DELETE CASCADE
);
CREATE INDEX idx_latency_device_recorded ON latency_events (device_id, recorded_at);
CREATE INDEX idx_latency_recorded        ON latency_events (recorded_at);

-- Alertas exibidos na tela Alertas.
-- acknowledged_by aponta para quem clicou em "Reconhecer"; se esse usuário
-- for apagado, o alerta continua existindo (SET NULL).
CREATE TABLE alerts (
    id              INTEGER PRIMARY KEY,
    title           TEXT    NOT NULL,
    message         TEXT,
    severity        TEXT    NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    status          TEXT    NOT NULL DEFAULT 'ativo'
                            CHECK (status IN ('ativo', 'resolvido', 'info')),
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    acknowledged_at TEXT,
    acknowledged_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    device_id       INTEGER NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    -- um alerta só pode ter "quem reconheceu" se tiver "quando reconheceu"
    -- (o contrário é permitido: o usuário pode ter sido apagado depois)
    CHECK (acknowledged_by IS NULL OR acknowledged_at IS NOT NULL)
);
CREATE INDEX idx_alerts_status_created ON alerts (status, created_at);
CREATE INDEX idx_alerts_device         ON alerts (device_id);
