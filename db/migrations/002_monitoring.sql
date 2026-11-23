-- =============================================================================
-- 002_monitoring.sql — monitoramento real dos dispositivos
--
-- 1. devices é RECRIADA, porque o SQLite não consegue remover um UNIQUE nem
--    alterar um CHECK com ALTER TABLE. Mudanças:
--      * ip vira host (aceita IP ou nome, ex.: 192.168.0.1 ou roteador.lan);
--      * host deixa de ser UNIQUE: o mesmo host pode ter várias checagens
--        (ping, tcp:80, tcp:554...). O que não pode repetir é host + tipo + porta;
--      * status ganha 'pendente' (cadastrado, ainda não verificado);
--      * colunas de configuração (check_type, port, latency_threshold_ms,
--        monitoring_enabled) e de estado (consecutive_failures, last_check_at).
--    Procedimento oficial do SQLite: criar devices_new, copiar, apagar a antiga
--    e renomear. O migrate.js desliga as chaves estrangeiras durante a migration
--    (senão o DROP apagaria em cascata eventos e alertas) e roda
--    PRAGMA foreign_key_check antes do COMMIT.
-- 2. checks: histórico de cada verificação (base do uptime e da latência média).
-- 3. alerts ganha kind e resolved_at.
-- 4. Índices únicos PARCIAIS garantem, no próprio banco, que nunca exista mais de
--    uma queda aberta, um pico aberto ou um alerta ativo do mesmo tipo por dispositivo.
-- =============================================================================

CREATE TABLE devices_new (
    id                   INTEGER PRIMARY KEY,
    name                 TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    model                TEXT,
    host                 TEXT    NOT NULL COLLATE NOCASE,
    -- como verificar: ping (ICMP), tcp (conectar numa porta) ou http (GET numa porta)
    check_type           TEXT    NOT NULL DEFAULT 'ping' CHECK (check_type IN ('ping', 'tcp', 'http')),
    port                 INTEGER CHECK (port IS NULL OR port BETWEEN 1 AND 65535),
    status               TEXT    NOT NULL DEFAULT 'pendente'
                                 CHECK (status IN ('pendente', 'online', 'atencao', 'offline')),
    status_note          TEXT,    -- preenchido pelo monitor: último erro ou aviso de latência
    latency_ms           INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),   -- última medição
    latency_threshold_ms INTEGER NOT NULL DEFAULT 100 CHECK (latency_threshold_ms > 0),
    is_gateway           INTEGER NOT NULL DEFAULT 0 CHECK (is_gateway IN (0, 1)),
    icon                 TEXT    NOT NULL DEFAULT 'bi-hdd',
    monitoring_enabled   INTEGER NOT NULL DEFAULT 1 CHECK (monitoring_enabled IN (0, 1)),
    consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    up_since             TEXT,    -- desde quando responde sem parar (NULL se offline)
    last_seen_at         TEXT,    -- última resposta com sucesso
    last_check_at        TEXT,    -- última verificação (sucesso ou falha)
    category_id          INTEGER NOT NULL REFERENCES categories (id),
    created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    -- tcp e http precisam de porta; ping não usa porta
    CHECK ((check_type = 'ping') = (port IS NULL))
);

-- Copia o que já existe: os dispositivos antigos viram checagens por ping.
INSERT INTO devices_new
    (id, name, model, host, check_type, port, status, status_note, latency_ms,
     is_gateway, icon, up_since, last_seen_at, category_id, created_at, updated_at)
SELECT id, name, model, ip, 'ping', NULL, status, status_note, latency_ms,
       is_gateway, icon, up_since, last_seen_at, category_id, created_at, updated_at
FROM devices;

DROP TABLE devices;
ALTER TABLE devices_new RENAME TO devices;

CREATE INDEX idx_devices_category ON devices (category_id);
CREATE INDEX idx_devices_status   ON devices (status);
-- mesmo host + tipo + porta só uma vez (IFNULL porque, num UNIQUE, NULL nunca é igual a NULL)
CREATE UNIQUE INDEX idx_devices_target ON devices (host, check_type, IFNULL(port, 0));

-- Histórico de verificações. Limpeza automática: o monitor apaga as com mais de 7 dias.
CREATE TABLE checks (
    id         INTEGER PRIMARY KEY,
    device_id  INTEGER NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    checked_at TEXT    NOT NULL,
    success    INTEGER NOT NULL CHECK (success IN (0, 1)),
    latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    error      TEXT
);
CREATE INDEX idx_checks_device_checked ON checks (device_id, checked_at);
CREATE INDEX idx_checks_checked        ON checks (checked_at);

-- Tipo do alerta, para o monitor saber qual resolver quando a situação normaliza.
ALTER TABLE alerts ADD COLUMN kind TEXT NOT NULL DEFAULT 'info'
    CHECK (kind IN ('offline', 'latency', 'info'));
ALTER TABLE alerts ADD COLUMN resolved_at TEXT;

-- Classifica os alertas que já existiam (gerados pelo seed antigo).
UPDATE alerts SET kind = 'offline' WHERE title LIKE '%offline%' OR title LIKE '%reconect%';
UPDATE alerts SET kind = 'latency' WHERE title LIKE '%latência%';

-- No máximo UMA ocorrência aberta por dispositivo (a rede de segurança contra duplicação).
CREATE UNIQUE INDEX idx_downtime_one_open ON downtime_events (device_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX idx_latency_one_open  ON latency_events (device_id)  WHERE resolved = 0;
CREATE UNIQUE INDEX idx_alerts_one_active ON alerts (device_id, kind)    WHERE status = 'ativo';
