-- Mira: perfil completo do paciente (historico, orcamentos, procedimentos, queixas)
--
-- Chamada quando user pergunta "quem e Maria?" — retorna ficha completa
-- em vez do resumo basico de antes.

-- ============================================================
-- RPC: wa_pro_patient_profile — ficha completa
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_patient_profile(
  p_phone text,
  p_patient_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth     jsonb := wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_lead     record;
  v_appts    jsonb;
  v_procs    text[];
  v_stats    record;
  v_balance  record;
  v_queixas  text[];
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;

  -- Dados cadastrais
  SELECT * INTO v_lead FROM leads
  WHERE id = p_patient_id AND clinic_id = v_clinic_id AND deleted_at IS NULL;
  IF v_lead.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Estatisticas de appointments
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE status = 'finalizado')::int AS finalizados,
    count(*) FILTER (WHERE status = 'agendado')::int AS agendados,
    count(*) FILTER (WHERE status = 'cancelado')::int AS cancelados,
    MIN(scheduled_date) AS primeiro,
    MAX(scheduled_date) FILTER (WHERE status = 'finalizado') AS ultimo_finalizado
  INTO v_stats
  FROM appointments
  WHERE patient_id::text = p_patient_id AND clinic_id = v_clinic_id AND deleted_at IS NULL;

  -- Proximas consultas agendadas
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', TO_CHAR(a.scheduled_date, 'DD/MM'),
      'time', LEFT(a.start_time::text, 5),
      'procedure', COALESCE(NULLIF(a.procedure_name,''), 'Consulta'),
      'status', a.status
    ) ORDER BY a.scheduled_date, a.start_time
  ), '[]'::jsonb) INTO v_appts
  FROM appointments a
  WHERE a.patient_id::text = p_patient_id AND a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL AND a.status = 'agendado'
    AND a.scheduled_date >= CURRENT_DATE;

  -- Procedimentos distintos realizados
  SELECT array_agg(DISTINCT procedure_name) INTO v_procs
  FROM appointments
  WHERE patient_id::text = p_patient_id AND clinic_id = v_clinic_id
    AND deleted_at IS NULL AND status = 'finalizado'
    AND procedure_name IS NOT NULL AND procedure_name != '';

  -- Saldo financeiro
  SELECT
    COALESCE(SUM(value), 0) AS total_valor,
    COALESCE(SUM(CASE WHEN payment_status = 'pago' THEN value ELSE 0 END), 0) AS total_pago
  INTO v_balance
  FROM appointments
  WHERE patient_id::text = p_patient_id AND clinic_id = v_clinic_id
    AND deleted_at IS NULL AND status = 'finalizado';

  -- Queixas (faciais + corporais)
  IF v_lead.queixas_faciais IS NOT NULL AND jsonb_typeof(v_lead.queixas_faciais) = 'array'
     AND jsonb_array_length(v_lead.queixas_faciais) > 0 THEN
    SELECT array_agg(x->>'label') INTO v_queixas
    FROM jsonb_array_elements(v_lead.queixas_faciais) x
    WHERE x->>'label' IS NOT NULL;
  ELSIF v_lead.queixas_faciais IS NOT NULL AND jsonb_typeof(v_lead.queixas_faciais) = 'object' THEN
    SELECT array_agg(key) INTO v_queixas
    FROM jsonb_each(v_lead.queixas_faciais)
    WHERE value::text != 'null' AND value::text != '""';
  END IF;

  IF v_lead.queixas_corporais IS NOT NULL AND jsonb_typeof(v_lead.queixas_corporais) = 'array'
     AND jsonb_array_length(v_lead.queixas_corporais) > 0 THEN
    DECLARE v_corp text[];
    BEGIN
      SELECT array_agg(x->>'label') INTO v_corp
      FROM jsonb_array_elements(v_lead.queixas_corporais) x
      WHERE x->>'label' IS NOT NULL;
      IF v_corp IS NOT NULL THEN
        v_queixas := COALESCE(v_queixas, '{}') || v_corp;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'patient', jsonb_build_object(
      'id',         v_lead.id,
      'name',       v_lead.name,
      'phone',      v_lead.phone,
      'cpf',        COALESCE(v_lead.cpf, v_lead.data->>'cpf'),
      'sexo',       COALESCE(v_lead.sexo, v_lead.data->>'sexo'),
      'birth_date', v_lead.birth_date,
      'phase',      v_lead.phase,
      'origem',     COALESCE(v_lead.origem, v_lead.source_type),
      'endereco',   COALESCE(v_lead.endereco, v_lead.data->>'endereco'),
      'profissao',  COALESCE(v_lead.profissao, v_lead.data->>'profissao')
    ),
    'stats', jsonb_build_object(
      'total',       v_stats.total,
      'finalizados', v_stats.finalizados,
      'agendados',   v_stats.agendados,
      'cancelados',  v_stats.cancelados,
      'primeiro',    v_stats.primeiro,
      'ultimo_finalizado', v_stats.ultimo_finalizado
    ),
    'proximas', v_appts,
    'procedimentos', COALESCE(v_procs, '{}'),
    'queixas', COALESCE(v_queixas, '{}'),
    'financeiro', jsonb_build_object(
      'total', v_balance.total_valor,
      'pago',  v_balance.total_pago,
      'saldo', v_balance.total_valor - v_balance.total_pago
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_patient_profile(text, text) TO authenticated, anon;


-- ============================================================
-- Formatter: perfil completo WhatsApp
-- ============================================================
CREATE OR REPLACE FUNCTION public._fmt_patient_profile(p jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
  v_pat jsonb;
  v_stats jsonb;
  v_fin jsonb;
  v_procs text[];
  v_queixas text[];
  v_item jsonb;
  v_age int;
BEGIN
  IF p IS NULL OR NOT (p->>'ok')::boolean THEN
    RETURN '⚠️ ' || COALESCE(p->>'error', 'erro');
  END IF;

  v_pat   := p->'patient';
  v_stats := p->'stats';
  v_fin   := p->'financeiro';

  -- Calcula idade
  IF v_pat->>'birth_date' IS NOT NULL AND v_pat->>'birth_date' != '' THEN
    v_age := EXTRACT(year FROM age(CURRENT_DATE, (v_pat->>'birth_date')::date))::int;
  END IF;

  v_out := '👤 *' || (v_pat->>'name') || E'*\n─────────────';

  -- Dados cadastrais
  IF v_pat->>'phone' IS NOT NULL THEN
    v_out := v_out || E'\nTel: ' || (v_pat->>'phone');
  END IF;
  IF NULLIF(v_pat->>'cpf', '') IS NOT NULL THEN
    v_out := v_out || E'\nCPF: ' || (v_pat->>'cpf');
  END IF;
  IF NULLIF(v_pat->>'sexo', '') IS NOT NULL THEN
    v_out := v_out || ' · ' || INITCAP(v_pat->>'sexo');
  END IF;
  IF v_age IS NOT NULL THEN
    v_out := v_out || ' · ' || v_age || ' anos';
  END IF;
  IF NULLIF(v_pat->>'profissao', '') IS NOT NULL THEN
    v_out := v_out || E'\nProf: ' || (v_pat->>'profissao');
  END IF;
  v_out := v_out || E'\nFase: ' || COALESCE(v_pat->>'phase', '?');

  -- Historico de consultas
  v_out := v_out || E'\n\n📊 *Historico*';
  v_out := v_out || E'\nConsultas: *' || (v_stats->>'total') || '*';
  IF (v_stats->>'finalizados')::int > 0 THEN
    v_out := v_out || ' (finaliz: ' || (v_stats->>'finalizados') || ')';
  END IF;
  IF (v_stats->>'cancelados')::int > 0 THEN
    v_out := v_out || ' (cancel: ' || (v_stats->>'cancelados') || ')';
  END IF;
  IF (v_stats->>'agendados')::int > 0 THEN
    v_out := v_out || ' (prox: ' || (v_stats->>'agendados') || ')';
  END IF;
  IF v_stats->>'ultimo_finalizado' IS NOT NULL THEN
    v_out := v_out || E'\nUltima: ' || TO_CHAR((v_stats->>'ultimo_finalizado')::date, 'DD/MM/YYYY');
  END IF;

  -- Proximas agendadas
  IF jsonb_array_length(COALESCE(p->'proximas', '[]'::jsonb)) > 0 THEN
    v_out := v_out || E'\n\n📅 *Proximas:*';
    FOR v_item IN SELECT * FROM jsonb_array_elements(p->'proximas') LOOP
      v_out := v_out || E'\n• ' || (v_item->>'date') || ' ' || (v_item->>'time') || ' — ' || (v_item->>'procedure');
    END LOOP;
  END IF;

  -- Procedimentos realizados
  SELECT array_agg(x) INTO v_procs FROM jsonb_array_elements_text(p->'procedimentos') x;
  IF v_procs IS NOT NULL AND array_length(v_procs, 1) > 0 THEN
    v_out := v_out || E'\n\n💉 *Procedimentos:* ' || array_to_string(v_procs, ', ');
  END IF;

  -- Queixas
  SELECT array_agg(x) INTO v_queixas FROM jsonb_array_elements_text(p->'queixas') x;
  IF v_queixas IS NOT NULL AND array_length(v_queixas, 1) > 0 THEN
    v_out := v_out || E'\n\n🩺 *Queixas:* ' || array_to_string(v_queixas, ', ');
  END IF;

  -- Financeiro
  IF (v_fin->>'total')::numeric > 0 THEN
    v_out := v_out || E'\n\n💰 *Financeiro*' ||
             E'\nTotal: ' || _money((v_fin->>'total')::numeric) ||
             ' · Pago: ' || _money((v_fin->>'pago')::numeric) ||
             ' · Saldo: *' || _money((v_fin->>'saldo')::numeric) || '*';
  END IF;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._fmt_patient_profile(jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.wa_pro_patient_profile(text, text) TO authenticated, anon;

COMMENT ON FUNCTION public.wa_pro_patient_profile(text, text)
  IS 'Perfil completo do paciente: cadastro + historico + procedimentos + queixas + financeiro';
