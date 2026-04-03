-- ============================================================
-- ClinicAI — Prontuário Eletrônico (Sprint 5)
-- Tabela medical_records + RPCs completos com RLS granular.
--
-- Design:
--   • patient_id = UUID do lead (clinicai_leads) — já sincronizado
--     com a tabela patients via _upsertLeadAsPatient (anamnese-core.js)
--   • Soft delete (deleted_at) — nunca perde histórico clínico
--   • is_confidential: visível apenas para o autor + admin/owner
--   • Todos os writes passam por RPCs SECURITY DEFINER
--   • RLS como segunda camada de segurança
--   • Indexes otimizados para leitura por paciente (padrão de acesso dominante)
-- ============================================================

-- ── Tabela principal ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medical_records (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id        uuid         NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id       uuid         NOT NULL,
  professional_id  uuid         REFERENCES public.profiles(id) ON DELETE SET NULL,
  appointment_id   uuid,
  record_type      text         NOT NULL DEFAULT 'nota_clinica'
                   CHECK (record_type IN (
                     'nota_clinica',
                     'evolucao',
                     'prescricao',
                     'alerta',
                     'observacao',
                     'procedimento'
                   )),
  title            text         NOT NULL DEFAULT '',
  content          text         NOT NULL DEFAULT '',
  is_confidential  boolean      NOT NULL DEFAULT false,
  deleted_at       timestamptz,
  created_at       timestamptz  DEFAULT now(),
  updated_at       timestamptz  DEFAULT now()
);

COMMENT ON TABLE  public.medical_records                IS 'Prontuário eletrônico — registros clínicos por paciente';
COMMENT ON COLUMN public.medical_records.patient_id     IS 'UUID do lead/paciente (clinicai_leads localStorage = patients table)';
COMMENT ON COLUMN public.medical_records.is_confidential IS 'Visível somente para o autor + admin/owner';
COMMENT ON COLUMN public.medical_records.deleted_at     IS 'Soft delete — nunca remove dados clínicos';

-- ── Indexes ───────────────────────────────────────────────────
-- Padrão dominante: listar registros de um paciente, ordenados por data
CREATE INDEX IF NOT EXISTS idx_mr_patient_clinic_date
  ON public.medical_records (clinic_id, patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Para queries por profissional (minha agenda, meus registros)
CREATE INDEX IF NOT EXISTS idx_mr_professional_date
  ON public.medical_records (clinic_id, professional_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Para queries por tipo
CREATE INDEX IF NOT EXISTS idx_mr_type
  ON public.medical_records (clinic_id, record_type, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── Trigger updated_at ────────────────────────────────────────
DROP TRIGGER IF EXISTS medical_records_updated_at ON public.medical_records;
CREATE TRIGGER medical_records_updated_at
  BEFORE UPDATE ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;

-- Leitura: therapist/admin/owner
-- Registros confidenciais: somente autor + admin/owner
DROP POLICY IF EXISTS "mr_select" ON public.medical_records;
CREATE POLICY "mr_select"
  ON public.medical_records FOR SELECT
  USING (
    clinic_id   = app_clinic_id()
    AND deleted_at IS NULL
    AND app_role() IN ('therapist','admin','owner')
    AND (
      is_confidential = false
      OR professional_id = auth.uid()
      OR app_role() IN ('admin','owner')
    )
  );

-- Inserção: therapist/admin/owner
DROP POLICY IF EXISTS "mr_insert" ON public.medical_records;
CREATE POLICY "mr_insert"
  ON public.medical_records FOR INSERT
  WITH CHECK (
    clinic_id = app_clinic_id()
    AND app_role() IN ('therapist','admin','owner')
  );

-- Update: autor do registro ou admin/owner
DROP POLICY IF EXISTS "mr_update" ON public.medical_records;
CREATE POLICY "mr_update"
  ON public.medical_records FOR UPDATE
  USING (
    clinic_id = app_clinic_id()
    AND (professional_id = auth.uid() OR app_role() IN ('admin','owner'))
  );

-- ── RPC: mr_list_for_patient ──────────────────────────────────
-- Lista registros de um paciente com dados do profissional.
-- Filtra confidenciais conforme a role do usuário.
-- Retorna: { records: [], total: int, has_more: bool }
CREATE OR REPLACE FUNCTION public.mr_list_for_patient(
  p_patient_id  uuid,
  p_limit       int  DEFAULT 20,
  p_offset      int  DEFAULT 0,
  p_type_filter text DEFAULT NULL  -- NULL = todos os tipos
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_uid       uuid := auth.uid();
  v_total     int;
  v_records   jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('therapist','admin','owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente para acessar prontuário';
  END IF;

  -- Total (para paginação)
  SELECT COUNT(*) INTO v_total
    FROM public.medical_records mr
   WHERE mr.clinic_id    = v_clinic_id
     AND mr.patient_id   = p_patient_id
     AND mr.deleted_at   IS NULL
     AND (p_type_filter IS NULL OR mr.record_type = p_type_filter)
     AND (
       mr.is_confidential = false
       OR mr.professional_id = v_uid
       OR v_role IN ('admin','owner')
     );

  -- Registros paginados com join no profissional
  SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC) INTO v_records
    FROM (
      SELECT
        mr.id,
        mr.patient_id,
        mr.appointment_id,
        mr.record_type,
        mr.title,
        mr.content,
        mr.is_confidential,
        mr.created_at,
        mr.updated_at,
        mr.professional_id,
        CASE
          WHEN p.id IS NOT NULL
          THEN (p.first_name || ' ' || COALESCE(p.last_name, ''))
          ELSE NULL
        END AS professional_name,
        -- Flag para UI: o usuário atual é o autor?
        (mr.professional_id = v_uid) AS is_mine
      FROM public.medical_records mr
      LEFT JOIN public.profiles p ON p.id = mr.professional_id
     WHERE mr.clinic_id    = v_clinic_id
       AND mr.patient_id   = p_patient_id
       AND mr.deleted_at   IS NULL
       AND (p_type_filter IS NULL OR mr.record_type = p_type_filter)
       AND (
         mr.is_confidential = false
         OR mr.professional_id = v_uid
         OR v_role IN ('admin','owner')
       )
     ORDER BY mr.created_at DESC
     LIMIT  p_limit
     OFFSET p_offset
    ) r;

  RETURN jsonb_build_object(
    'records',  COALESCE(v_records, '[]'::jsonb),
    'total',    v_total,
    'has_more', (p_offset + p_limit) < v_total
  );
END;
$$;

-- ── RPC: mr_create ────────────────────────────────────────────
-- Cria um novo registro de prontuário.
-- professional_id = auth.uid() (sempre o usuário logado).
CREATE OR REPLACE FUNCTION public.mr_create(
  p_patient_id     uuid,
  p_record_type    text    DEFAULT 'nota_clinica',
  p_title          text    DEFAULT '',
  p_content        text    DEFAULT '',
  p_appointment_id uuid    DEFAULT NULL,
  p_is_confidential boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_uid       uuid := auth.uid();
  v_id        uuid;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('therapist','admin','owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente para criar registro';
  END IF;
  IF p_content IS NULL OR trim(p_content) = '' THEN
    RAISE EXCEPTION 'O conteúdo do registro não pode estar vazio';
  END IF;
  IF p_record_type NOT IN ('nota_clinica','evolucao','prescricao','alerta','observacao','procedimento') THEN
    RAISE EXCEPTION 'Tipo de registro inválido: %', p_record_type;
  END IF;

  INSERT INTO public.medical_records (
    clinic_id, patient_id, professional_id, appointment_id,
    record_type, title, content, is_confidential
  ) VALUES (
    v_clinic_id, p_patient_id, v_uid, p_appointment_id,
    p_record_type, COALESCE(p_title,''), p_content, COALESCE(p_is_confidential, false)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- ── RPC: mr_update ────────────────────────────────────────────
-- Atualiza título, conteúdo, tipo ou confidencialidade.
-- Somente o autor ou admin/owner pode editar.
CREATE OR REPLACE FUNCTION public.mr_update(
  p_id              uuid,
  p_title           text    DEFAULT NULL,
  p_content         text    DEFAULT NULL,
  p_record_type     text    DEFAULT NULL,
  p_is_confidential boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_uid       uuid := auth.uid();
  v_owner_id  uuid;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT professional_id INTO v_owner_id
    FROM public.medical_records
   WHERE id = p_id AND clinic_id = v_clinic_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado';
  END IF;

  IF v_owner_id IS DISTINCT FROM v_uid AND v_role NOT IN ('admin','owner') THEN
    RAISE EXCEPTION 'Somente o autor ou administrador pode editar este registro';
  END IF;

  IF p_record_type IS NOT NULL AND
     p_record_type NOT IN ('nota_clinica','evolucao','prescricao','alerta','observacao','procedimento') THEN
    RAISE EXCEPTION 'Tipo de registro inválido: %', p_record_type;
  END IF;

  UPDATE public.medical_records SET
    title           = COALESCE(p_title,           title),
    content         = COALESCE(p_content,         content),
    record_type     = COALESCE(p_record_type,     record_type),
    is_confidential = COALESCE(p_is_confidential, is_confidential)
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── RPC: mr_delete ────────────────────────────────────────────
-- Soft delete — preserva histórico clínico.
-- Somente autor ou admin/owner.
CREATE OR REPLACE FUNCTION public.mr_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_uid       uuid := auth.uid();
  v_owner_id  uuid;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT professional_id INTO v_owner_id
    FROM public.medical_records
   WHERE id = p_id AND clinic_id = v_clinic_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já removido';
  END IF;

  IF v_owner_id IS DISTINCT FROM v_uid AND v_role NOT IN ('admin','owner') THEN
    RAISE EXCEPTION 'Somente o autor ou administrador pode remover este registro';
  END IF;

  UPDATE public.medical_records
     SET deleted_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── RPC: mr_get_patient_summary ───────────────────────────────
-- Retorna contadores e metadados do prontuário de um paciente.
-- Usado para o card de resumo no topo da página.
CREATE OR REPLACE FUNCTION public.mr_get_patient_summary(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_uid       uuid := auth.uid();
  v_result    jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('therapist','admin','owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  SELECT jsonb_build_object(
    'total',       COUNT(*),
    'last_record', MAX(created_at),
    'by_type',     jsonb_object_agg(record_type, cnt)
  ) INTO v_result
  FROM (
    SELECT
      record_type,
      created_at,
      COUNT(*) OVER () AS total_all,
      MAX(created_at) OVER () AS last_all,
      COUNT(*) OVER (PARTITION BY record_type) AS cnt
    FROM public.medical_records
    WHERE clinic_id   = v_clinic_id
      AND patient_id  = p_patient_id
      AND deleted_at  IS NULL
      AND (
        is_confidential = false
        OR professional_id = v_uid
        OR v_role IN ('admin','owner')
      )
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object('total', 0, 'last_record', null, 'by_type', '{}'));
END;
$$;

-- ── Permissões ────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'mr_list_for_patient(uuid,int,int,text)',
    'mr_create(uuid,text,text,text,uuid,boolean)',
    'mr_update(uuid,text,text,text,boolean)',
    'mr_delete(uuid)',
    'mr_get_patient_summary(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || fn || ' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || fn || ' TO authenticated';
  END LOOP;
END;
$$;
