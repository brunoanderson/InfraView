-- =============================================================================
-- 003_packet_loss.sql — perda de pacotes como terceiro gatilho
--
-- Cada verificação passa a fazer várias tentativas; a perda é a porcentagem de
-- tentativas sem resposta (no ping, pacotes perdidos; no tcp/http, conexões ou
-- requisições que falharam).
--
-- 1. devices: limite de perda editável e a perda da última verificação.
-- 2. checks: quantas tentativas foram feitas e quantas falharam.
-- 3. loss_events: períodos com perda acima do limite (como latency_events).
-- 4. alerts é RECRIADA para kind aceitar 'loss': o SQLite não altera CHECK.
--    Mesmo procedimento da 002 (o migrate.js desliga as FKs e roda
--    foreign_key_check antes do COMMIT). Dados e índices são preservados.
-- =============================================================================

-- ---- 1. devices ----
ALTER TABLE devices ADD COLUMN loss_threshold_pct INTEGER NOT NULL DEFAULT 20
    CHECK (loss_threshold_pct BETWEEN 1 AND 100);
ALTER TABLE devices ADD COLUMN last_loss_pct INTEGER
    CHECK (last_loss_pct IS NULL OR last_loss_pct BETWEEN 0 AND 100);

-- ---- 2. checks ----
-- As verificações antigas tinham 1 tentativa: sucesso = 0 perdidas, falha = 1 perdida.
ALTER TABLE checks ADD COLUMN packets_sent INTEGER NOT NULL DEFAULT 1 CHECK (packets_sent >= 1);
ALTER TABLE checks ADD COLUMN packets_lost INTEGER NOT NULL DEFAULT 0 CHECK (packets_lost >= 0);
UPDATE checks SET packets_lost = 1 WHERE success = 0;

-- ---- 3. loss_events ----
CREATE TABLE loss_events (
    id            INTEGER PRIMARY KEY,
    device_id     INTEGER NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    recorded_at   TEXT    NOT NULL,
    loss_pct      INTEGER NOT NULL CHECK (loss_pct BETWEEN 0 AND 100),     -- maior perda observada
    threshold_pct INTEGER NOT NULL CHECK (threshold_pct BETWEEN 1 AND 100),
    resolved      INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1))
);
CREATE INDEX idx_loss_device_recorded ON loss_events (device_id, recorded_at);
CREATE INDEX idx_loss_recorded        ON loss_events (recorded_at);
-- no máximo UM evento de perda aberto por dispositivo
CREATE UNIQUE INDEX idx_loss_one_open ON loss_events (device_id) WHERE resolved = 0;

-- ---- 4. alerts recriada com kind 'loss' ----
CREATE TABLE alerts_new (
    id              INTEGER PRIMARY KEY,
    title           TEXT    NOT NULL,
    message         TEXT,
    severity        TEXT    NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    status          TEXT    NOT NULL DEFAULT 'ativo'
                            CHECK (status IN ('ativo', 'resolvido', 'info')),
    kind            TEXT    NOT NULL DEFAULT 'info'
                            CHECK (kind IN ('offline', 'latency', 'loss', 'info')),
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    resolved_at     TEXT,
    acknowledged_at TEXT,
    acknowledged_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    device_id       INTEGER NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    CHECK (acknowledged_by IS NULL OR acknowledged_at IS NOT NULL)
);

INSERT INTO alerts_new
    (id, title, message, severity, status, kind, created_at, resolved_at,
     acknowledged_at, acknowledged_by, device_id)
SELECT id, title, message, severity, status, kind, created_at, resolved_at,
       acknowledged_at, acknowledged_by, device_id
FROM alerts;

DROP TABLE alerts;
ALTER TABLE alerts_new RENAME TO alerts;

CREATE INDEX idx_alerts_status_created ON alerts (status, created_at);
CREATE INDEX idx_alerts_device         ON alerts (device_id);
CREATE UNIQUE INDEX idx_alerts_one_active ON alerts (device_id, kind) WHERE status = 'ativo';
