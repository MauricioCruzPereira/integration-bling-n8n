-- =============================================
-- SCHEMA SUPABASE - integration-bling-n8n
-- =============================================

-- Tabela de integrações com o Bling
CREATE TABLE IF NOT EXISTS integrations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    token       TEXT NOT NULL,
    refresh_token TEXT,
    client_id   TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ
);

-- Tabela de números de telefone autorizados (Telegram)
CREATE TABLE IF NOT EXISTS numero_telefone_liberado (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero      TEXT NOT NULL UNIQUE,
    nome        TEXT,
    ativo       BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_is_active     ON integrations (is_active);
CREATE INDEX IF NOT EXISTS idx_integrations_created_at    ON integrations (created_at);
CREATE INDEX IF NOT EXISTS idx_telefone_numero            ON numero_telefone_liberado (numero);
CREATE INDEX IF NOT EXISTS idx_telefone_ativo             ON numero_telefone_liberado (ativo);
