-- ============================================================
-- Migration: 20260533000000 — Leads: CPF e RG com unicidade real
--
-- Problema: CPF e RG ficavam apenas em data->'customFields' (JSONB),
-- sem colunas próprias nem constraint de unicidade no banco.
-- Validação existia só no localStorage — ineficaz cross-device.
--
-- Solução:
--   1. Colunas dedicadas `cpf` e `rg` (dígitos normalizados)
--   2. Trigger BEFORE INSERT/UPDATE que extrai e normaliza automaticamente
--   3. Índices únicos parciais por (clinic_id, cpf/rg)
--   4. RPC `leads_check_duplicate_doc` para pré-validação do frontend
--
-- Blindagens:
--   - Normalização server-side (independente de formatação do cliente)
--   - COALESCE entre colunas JSONB possíveis (retrocompatível)
--   - p_exclude_id para uso no modo edição (não conflita consigo mesmo)
--   - SECURITY DEFINER + _sdr_clinic_id() para isolamento multi-clínica
--   - Backfill automático de dados existentes via UPDATE no final
-- ============================================================

-- ── 1. Colunas dedicadas ──────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS rg  text;

-- ── 2. Função de extração e normalização ──────────────────────
-- Usa to_jsonb(NEW) para ser agnóstico ao nome da coluna JSONB.
-- Tenta: data->'customFields', custom_fields, metadata (ordem de prioridade).

CREATE OR REPLACE FUNCTION public._leads_extract_docs()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row     jsonb;
  v_cpf_raw text;
  v_rg_raw  text;
  v_cpf_n   text;
  v_rg_n    text;
BEGIN
  v_row := to_jsonb(NEW);

  -- Extrair CPF bruto: tenta caminhos mais comuns
  v_cpf_raw := COALESCE(
    v_row -> 'data' -> 'customFields' ->> 'cpf',
    v_row -> 'custom_fields' ->> 'cpf',
    v_row -> 'customFields' ->> 'cpf',
    v_row -> 'metadata' -> 'customFields' ->> 'cpf'
  );

  -- Extrair RG bruto
  v_rg_raw := COALESCE(
    v_row -> 'data' -> 'customFields' ->> 'rg',
    v_row -> 'custom_fields' ->> 'rg',
    v_row -> 'customFields' ->> 'rg',
    v_row -> 'metadata' -> 'customFields' ->> 'rg'
  );

  -- Normalizar CPF: somente dígitos, exatamente 11 chars
  IF v_cpf_raw IS NOT NULL AND v_cpf_raw <> '' THEN
    v_cpf_n := regexp_replace(v_cpf_raw, '\D', '', 'g');
    NEW.cpf := CASE WHEN length(v_cpf_n) = 11 THEN v_cpf_n ELSE NULL END;
  ELSE
    NEW.cpf := NULL;
  END IF;

  -- Normalizar RG: dígitos + letra X, lowercase, mínimo 5 chars
  IF v_rg_raw IS NOT NULL AND v_rg_raw <> '' THEN
    v_rg_n := regexp_replace(lower(v_rg_raw), '[^0-9x]', '', 'g');
    NEW.rg := CASE WHEN length(v_rg_n) >= 5 THEN v_rg_n ELSE NULL END;
  ELSE
    NEW.rg := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Trigger ────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_leads_extract_docs ON public.leads;

CREATE TRIGGER trg_leads_extract_docs
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public._leads_extract_docs();

-- ── 4. Backfill: popula cpf/rg em registros existentes ────────
-- O trigger BEFORE UPDATE dispara e preenche automaticamente.

UPDATE public.leads
  SET updated_at = COALESCE(updated_at, now())
WHERE deleted_at IS NULL;

-- ── 5. Índices únicos parciais ────────────────────────────────
-- Igual ao padrão da tabela patients:
-- unicidade por clínica, ignora soft-deletes e NULLs.

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_cpf_clinic
  ON public.leads (clinic_id, cpf)
  WHERE deleted_at IS NULL AND cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_rg_clinic
  ON public.leads (clinic_id, rg)
  WHERE deleted_at IS NULL AND rg IS NOT NULL;

-- ── 6. RPC: leads_check_duplicate_doc ────────────────────────
-- Pré-validação do frontend antes de salvar.
-- Retorna o primeiro conflito encontrado (CPF tem prioridade sobre RG).
--
-- Parâmetros:
--   p_cpf        — CPF normalizado (somente dígitos, 11 chars)
--   p_rg         — RG normalizado  (alfanumérico lowercase)
--   p_exclude_id — ID do lead atual (ignora no modo edição)
--
-- Retorno:
--   { found: false }
--   { found: true, tipo: 'CPF'|'RG', lead_id, name, phone }

DROP FUNCTION IF EXISTS public.leads_check_duplicate_doc(text, text, text);

CREATE OR REPLACE FUNCTION public.leads_check_duplicate_doc(
  p_cpf        text DEFAULT NULL,
  p_rg         text DEFAULT NULL,
  p_exclude_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_id        text;
  v_row       jsonb;
  v_name      text;
  v_phone     text;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  -- ── Verifica CPF ─────────────────────────────────────────────
  IF p_cpf IS NOT NULL AND length(p_cpf) = 11 THEN
    SELECT id, to_jsonb(l) INTO v_id, v_row
    FROM public.leads l
    WHERE l.clinic_id  = v_clinic_id
      AND l.cpf        = p_cpf
      AND l.deleted_at IS NULL
      AND (p_exclude_id IS NULL OR l.id != p_exclude_id)
    LIMIT 1;

    IF FOUND THEN
      -- Extrai name/phone da JSONB data (tolerante a estruturas diferentes)
      v_name  := COALESCE(
        v_row -> 'data' ->> 'name',
        v_row ->> 'name'
      );
      v_phone := COALESCE(
        v_row -> 'data' ->> 'phone',
        v_row -> 'data' ->> 'whatsapp',
        v_row -> 'data' ->> 'telefone',
        v_row ->> 'phone',
        v_row ->> 'whatsapp'
      );
      RETURN jsonb_build_object(
        'found',   true,
        'tipo',    'CPF',
        'lead_id', v_id,
        'name',    COALESCE(v_name, 'Lead existente'),
        'phone',   v_phone
      );
    END IF;
  END IF;

  -- ── Verifica RG ──────────────────────────────────────────────
  IF p_rg IS NOT NULL AND length(p_rg) >= 5 THEN
    SELECT id, to_jsonb(l) INTO v_id, v_row
    FROM public.leads l
    WHERE l.clinic_id  = v_clinic_id
      AND l.rg         = p_rg
      AND l.deleted_at IS NULL
      AND (p_exclude_id IS NULL OR l.id != p_exclude_id)
    LIMIT 1;

    IF FOUND THEN
      v_name  := COALESCE(
        v_row -> 'data' ->> 'name',
        v_row ->> 'name'
      );
      v_phone := COALESCE(
        v_row -> 'data' ->> 'phone',
        v_row -> 'data' ->> 'whatsapp',
        v_row -> 'data' ->> 'telefone',
        v_row ->> 'phone',
        v_row ->> 'whatsapp'
      );
      RETURN jsonb_build_object(
        'found',   true,
        'tipo',    'RG',
        'lead_id', v_id,
        'name',    COALESCE(v_name, 'Lead existente'),
        'phone',   v_phone
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('found', false);
END;
$$;

-- ── Verificação pós-migration ─────────────────────────────────
-- SELECT COUNT(*) total,
--        COUNT(cpf) com_cpf,
--        COUNT(rg)  com_rg
-- FROM public.leads
-- WHERE deleted_at IS NULL;
--
-- -- Testar RPC (substituir pelo clinic_id real):
-- SELECT leads_check_duplicate_doc('12345678901', NULL);
-- ============================================================
