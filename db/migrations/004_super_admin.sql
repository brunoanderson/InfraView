-- =============================================================================
-- 004_super_admin.sql — três perfis e a conta raiz
--
-- 1. users é RECRIADA, porque o SQLite não altera um CHECK com ALTER TABLE:
--      * role passa a aceitar 'superadmin' (gerencia usuários), além de
--        'admin' (gerencia dispositivos e alertas) e 'viewer' (só consulta);
--      * nova coluna is_root (0/1): marca a conta raiz, que só pode ser
--        superadmin (CHECK) e nunca é criada nem alterada pela API.
--    Mesmo procedimento da 002: users_new, cópia, DROP e RENAME. O migrate.js
--    desliga as chaves estrangeiras durante a migration, então alerts.acknowledged_by
--    continua apontando para os mesmos ids, e confere tudo com foreign_key_check.
-- 2. Índice único PARCIAL: no máximo uma linha com is_root = 1.
-- 3. Bancos já existentes: o admin mais antigo (menor id) vira a conta raiz,
--    se ainda não houver uma. Num banco novo a tabela está vazia e o seed cria a raiz.
-- =============================================================================

CREATE TABLE users_new (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'viewer' CHECK (role IN ('superadmin', 'admin', 'viewer')),
    is_root       INTEGER NOT NULL DEFAULT 0 CHECK (is_root IN (0, 1)),
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (is_root = 0 OR role = 'superadmin')
);

INSERT INTO users_new (id, name, email, password_hash, role, created_at)
SELECT id, name, email, password_hash, role, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX idx_users_single_root ON users (is_root) WHERE is_root = 1;

UPDATE users
SET role = 'superadmin', is_root = 1
WHERE id = (SELECT MIN(id) FROM users WHERE role = 'admin')
  AND NOT EXISTS (SELECT 1 FROM users WHERE is_root = 1);
