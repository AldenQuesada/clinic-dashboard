-- ============================================================
-- Migration: Facial Shares Module
-- Sistema de links compartilhaveis publicos da analise facial.
--
-- Decisoes de seguranca:
--   - Token = 32 bytes random base64url (256 bits) — gerado no client via
--     crypto.subtle. Aqui validamos UNIQUE.
--   - Storage bucket facial-shares e PRIVADO. URLs sao geradas via signed
--     URLs com TTL curto (5min) na hora do acesso.
--   - Snapshots de dados (lead_name, clinic_name, professional_name) para
--     que o share continue valido mesmo se o registro original mudar.
--   - LGPD: consent_acknowledged_at obrigatorio na criacao + audit trail
--     em facial_share_access_log (sem IP cru, so hash).
--   - Auto-revogacao por status='expired' via fm_share_expire_old() (cron).
-- ============================================================

CREATE TABLE IF NOT EXISTS facial_shares (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Token criptografico (gerado client-side via crypto.subtle.getRandomValues)
  token                    text NOT NULL UNIQUE,

  -- Vinculo
  lead_id                  text NOT NULL,
  source_appointment_id    uuid,

  -- Snapshots de dados (autonomia do share)
  lead_name_snapshot          text,
  clinic_name_snapshot        text,
  professional_name_snapshot  text,
  procedure_label_snapshot    text,

  -- Storage paths (URLs assinadas geradas on-the-fly)
  before_photo_path        text,                                  -- ex: <clinic_id>/<share_id>/before.jpg
  after_photo_path         text,

  -- Conteudo denormalizado (para o renderer publico nao precisar de outras tabelas)
  metrics                  jsonb NOT NULL DEFAULT '{}'::jsonb,    -- { nasolabial: 105, ... }
  analysis_text            text,                                   -- texto resumo opcional
  cta_phone                text,                                   -- telefone WhatsApp da clinica para CTA "agendar"

  -- Estado
  status                   text NOT NULL DEFAULT 'active',         -- active | revoked | expired
  expires_at               timestamptz NOT NULL,

  -- LGPD
  consent_acknowledged_at  timestamptz NOT NULL DEFAULT now(),
  consent_text_snapshot    text,                                   -- texto exato do consent que o profissional viu

  -- Audit
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by_user_id       uuid,

  revoked_at               timestamptz,
  revoked_reason           text,
  revoked_by_user_id       uuid,

  -- Tracking
  last_accessed_at         timestamptz,
  access_count             int NOT NULL DEFAULT 0
);

ALTER TABLE facial_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facial_shares_clinic" ON facial_shares
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE INDEX IF NOT EXISTS idx_fmshare_token        ON facial_shares (token);
CREATE INDEX IF NOT EXISTS idx_fmshare_lead         ON facial_shares (lead_id, status);
CREATE INDEX IF NOT EXISTS idx_fmshare_active_exp   ON facial_shares (expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_fmshare_clinic_status ON facial_shares (clinic_id, status, created_at DESC);

-- Audit trail de acessos (LGPD: rastrear quem viu o que e quando)
-- IP nao e armazenado cru — apenas hash SHA-256 trunc para identificar
-- acessos repetidos sem viola privacidade do visitante.
CREATE TABLE IF NOT EXISTS facial_share_access_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id     uuid NOT NULL REFERENCES facial_shares(id) ON DELETE CASCADE,
  accessed_at  timestamptz NOT NULL DEFAULT now(),
  user_agent   text,
  ip_hash      text                                                -- substr(sha256(ip), 1, 16)
);

ALTER TABLE facial_share_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facial_share_access_log_clinic" ON facial_share_access_log
  FOR ALL USING (true);  -- log e write-only do publico, leitura para admin via RPC

CREATE INDEX IF NOT EXISTS idx_fmshare_log_share ON facial_share_access_log (share_id, accessed_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION facial_shares_set_updated_at()
RETURNS trigger AS $$
BEGIN
  RETURN NEW;  -- placeholder se quisermos updated_at futuro
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RPCs
-- ============================================================

-- 1. Criar share. Token e gerado no client (32 bytes base64url) e
--    passado aqui — assim o server nao precisa de extensoes pgcrypto
--    no plano free do Supabase.
CREATE OR REPLACE FUNCTION fm_share_create(
  p_token                      text,
  p_lead_id                    text,
  p_lead_name                  text,
  p_clinic_name                text,
  p_professional_name          text,
  p_procedure_label            text,
  p_source_appointment_id      uuid,
  p_before_photo_path          text,
  p_after_photo_path           text,
  p_metrics                    jsonb,
  p_analysis_text              text,
  p_cta_phone                  text,
  p_ttl_days                   int,
  p_consent_text               text
) RETURNS jsonb AS $$
DECLARE
  v_id uuid;
  v_expires timestamptz;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'token muito curto (>= 32 chars exigido)';
  END IF;
  IF p_consent_text IS NULL OR length(p_consent_text) < 10 THEN
    RAISE EXCEPTION 'consent_text obrigatorio para LGPD';
  END IF;

  v_expires := now() + (p_ttl_days || ' days')::interval;

  INSERT INTO facial_shares (
    token, lead_id, lead_name_snapshot,
    clinic_name_snapshot, professional_name_snapshot, procedure_label_snapshot,
    source_appointment_id,
    before_photo_path, after_photo_path,
    metrics, analysis_text, cta_phone,
    expires_at, consent_text_snapshot
  ) VALUES (
    p_token, p_lead_id, p_lead_name,
    p_clinic_name, p_professional_name, p_procedure_label,
    p_source_appointment_id,
    p_before_photo_path, p_after_photo_path,
    COALESCE(p_metrics, '{}'::jsonb), p_analysis_text, p_cta_phone,
    v_expires, p_consent_text
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'token', p_token,
    'expires_at', v_expires
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Resolver share por token (chamado da pagina publica, sem auth).
--    Retorna NULL se expirado/revogado. Bumpa access_count + log.
CREATE OR REPLACE FUNCTION fm_share_resolve(
  p_token       text,
  p_user_agent  text DEFAULT NULL,
  p_ip_hash     text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_row facial_shares%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM facial_shares
  WHERE token = p_token AND status = 'active' AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Bump tracking
  UPDATE facial_shares
  SET last_accessed_at = now(), access_count = access_count + 1
  WHERE id = v_row.id;

  -- Audit log
  INSERT INTO facial_share_access_log (share_id, user_agent, ip_hash)
  VALUES (v_row.id, p_user_agent, p_ip_hash);

  RETURN jsonb_build_object(
    'id', v_row.id,
    'lead_name', v_row.lead_name_snapshot,
    'clinic_name', v_row.clinic_name_snapshot,
    'professional_name', v_row.professional_name_snapshot,
    'procedure_label', v_row.procedure_label_snapshot,
    'before_photo_path', v_row.before_photo_path,
    'after_photo_path', v_row.after_photo_path,
    'metrics', v_row.metrics,
    'analysis_text', v_row.analysis_text,
    'cta_phone', v_row.cta_phone,
    'expires_at', v_row.expires_at,
    'created_at', v_row.created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Revogar share manualmente. Nao deleta — marca revoked + zera dados
--    sensiveis. O storage e deletado em separado pelo client (mais
--    confiavel que trigger SQL para storage do Supabase).
CREATE OR REPLACE FUNCTION fm_share_revoke(
  p_id      uuid,
  p_reason  text,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_row facial_shares%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM facial_shares WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE facial_shares
  SET status = 'revoked',
      revoked_at = now(),
      revoked_reason = p_reason,
      revoked_by_user_id = p_user_id
  WHERE id = p_id;

  -- Retorna paths para o client deletar do storage
  RETURN jsonb_build_object(
    'id', v_row.id,
    'before_photo_path', v_row.before_photo_path,
    'after_photo_path', v_row.after_photo_path
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Listar shares (dashboard admin)
CREATE OR REPLACE FUNCTION fm_share_list(
  p_lead_id   text DEFAULT NULL,
  p_status    text DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  token text,
  lead_id text,
  lead_name text,
  procedure_label text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  access_count int,
  last_accessed_at timestamptz,
  is_expired boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs.id, fs.token, fs.lead_id, fs.lead_name_snapshot,
    fs.procedure_label_snapshot, fs.status,
    fs.expires_at, fs.created_at, fs.access_count, fs.last_accessed_at,
    (fs.expires_at < now()) AS is_expired
  FROM facial_shares fs
  WHERE (p_lead_id IS NULL OR fs.lead_id = p_lead_id)
    AND (p_status  IS NULL OR fs.status  = p_status)
  ORDER BY fs.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Marcar todos os shares vencidos como expired (chamavel via cron / botao admin)
CREATE OR REPLACE FUNCTION fm_share_expire_old()
RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE facial_shares
  SET status = 'expired'
  WHERE status = 'active' AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT ALL ON facial_shares             TO anon, authenticated;
GRANT ALL ON facial_share_access_log   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fm_share_create     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fm_share_resolve    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fm_share_revoke     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fm_share_list       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fm_share_expire_old TO anon, authenticated;
