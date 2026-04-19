-- ============================================================================
-- Anatomy Quiz · Lara Dispatcher (pg_net + pg_cron · serverless)
-- Migration 20260420 (segunda) · Onda 33
--
-- Substitui n8n: Postgres chama Anthropic Haiku + Evolution API direto via pg_net.
-- pg_cron processa fila a cada 30s.
-- Secrets (Anthropic key + Evolution key) ficam em vault.secrets.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────────────────────────
-- 1. Adiciona colunas pra state-machine das sequências (MVP single-msg)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.anatomy_quiz_lara_dispatch
  ADD COLUMN IF NOT EXISTS message_text       text,
  ADD COLUMN IF NOT EXISTS anthropic_response jsonb,
  ADD COLUMN IF NOT EXISTS evolution_response jsonb,
  ADD COLUMN IF NOT EXISTS sequence_step      int default 0,
  ADD COLUMN IF NOT EXISTS next_send_at       timestamptz default now();

CREATE INDEX IF NOT EXISTS idx_aq_dispatch_next
  ON public.anatomy_quiz_lara_dispatch(next_send_at)
  WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────
-- 2. Helper · le secret do vault
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._aq_get_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
  RETURN v_secret;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 3. Helper · monta SYSTEM PROMPT pra Claude baseado no template_key
-- (Claude recebe context completo · responde COM A MENSAGEM PRONTA)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._aq_build_prompt(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_d record;
  v_first_name text;
  v_q1 text; v_q2 text;
  v_p1 text; v_p2 text;
  v_system text;
  v_user text;
BEGIN
  SELECT * INTO v_d FROM public.anatomy_quiz_lara_dispatch WHERE id = p_dispatch_id;
  IF v_d.id IS NULL THEN RETURN NULL; END IF;

  v_first_name := split_part(coalesce(v_d.name,''), ' ', 1);
  v_q1 := v_d.queixas->0->>'label';
  v_q2 := v_d.queixas->1->>'label';
  v_p1 := v_d.queixas->0->>'protocol';
  v_p2 := v_d.queixas->1->>'protocol';

  v_system :=
    'Voce e a Lara, assistente da Dra. Mirian de Paula (Clinica Mirian de Paula em Maringa/PR · medicina estetica facial). ' ||
    'Voce conversa via WhatsApp · sempre se apresenta como Lara · usa portugues brasileiro coloquial profissional. ' ||
    'NUNCA usa "se quiser" ou "sem compromisso" (Never Split the Difference). Sempre tem um CTA claro. ' ||
    'Tom acolhedor + autoridade da Dra. Mirian + foco em conversao SDR. ' ||
    'Maximo 6 linhas. Pode usar 1 emoji 💛. Sem hashtags. ' ||
    'Mencione SEMPRE as queixas especificas que a paciente marcou (' || coalesce(v_q1,'(sem queixas)') ||
    CASE WHEN v_q2 IS NOT NULL THEN ' e ' || v_q2 ELSE '' END || '). ' ||
    'Mencione o protocolo da Dra. quando fizer sentido (' || coalesce(v_p1,'') ||
    CASE WHEN v_p2 IS NOT NULL THEN ' / ' || v_p2 ELSE '' END || ').';

  v_user := 'Contexto da paciente: ' ||
    'NOME=' || coalesce(v_first_name,'(sem nome)') ||
    ' · TEMPLATE=' || v_d.template_key ||
    ' · LIFECYCLE=' || v_d.lifecycle ||
    ' · QUEIXAS=' || coalesce(v_q1,'') || coalesce(' + '||v_q2, '') ||
    ' · CONTEXT=' || coalesce(v_d.context::text, '{}');

  v_user := v_user || E'\n\nGere a 1a mensagem da Lara seguindo este template:';

  v_user := v_user || E'\n\n' || CASE v_d.template_key
    WHEN 'aq_novo_lead' THEN
      'NOVO LEAD (mensagem 1 de 5 · Onboarding+Rapport+Permissao):' || E'\n' ||
      'Apresente-se como Lara · agradeca a confianca · cite as 2 queixas · peca permissao pra fazer 2 perguntinhas (que vai ajudar a separar o protocolo certo). Nao agende nada nesta msg.'
    WHEN 'aq_lead_frio' THEN
      'LEAD FRIO retornando (mensagem 1 de 4 · Reconexao+Permissao):' || E'\n' ||
      'Apresente-se como Lara · "que bom te ver de novo" · cite que dessa vez marcou as queixas X+Y · peca uma pergunta sem julgamento.'
    WHEN 'aq_orcamento_aberto' THEN
      'ORCAMENTO ABERTO (mensagem unica):' || E'\n' ||
      'Apresente-se como Lara · "olha que coincidencia" · queixas atuais ja entram no orcamento que separamos · com 1 plano resolve tudo · se fechar essa semana, encaixa no mes atual · pergunta se pode mandar detalhes.'
    WHEN 'aq_agendado_futuro' THEN
      'JA AGENDADA (mensagem unica):' || E'\n' ||
      'Apresente-se como Lara · "que otimo" · cite queixas + ja esta agendada com a Dra. dia ' || coalesce(v_d.context->'lifecycle'->>'scheduled_for', '(sem data)') || ' · vai ser o espaco pra tirar duvidas e Dra. ja chega com plano personalizado pras areas marcadas · 30 dias depois vai ver rosto se transformar em camera lenta · pergunta se tem duvida pra adiantar antes do dia.'
    WHEN 'aq_paciente_ativo' THEN
      'PACIENTE ATIVA (mensagem unica):' || E'\n' ||
      'Apresente-se como Lara · "que alegria te ver de volta" · ela ja viveu o processo · agora as queixas X+Y entraram no radar (a pele evolui) · Dra. gosta de reavaliacao a cada 6 meses pra ajustar protocolo · oferece reservar horario essa semana · PS curto mencionando os protocolos.'
    WHEN 'aq_requiz_recente' THEN
      'RE-QUIZ <24H (mensagem unica · com humor leve):' || E'\n' ||
      'Apresente-se como Lara · "voltou? ta pensando carinhosamente na sua pele" 😊 · anotou as novas queixas · ja mandou mensagem ontem (lembra?) · oferece reservar horario essa semana pra resolver tudo de uma vez · pergunta "topa?".'
    ELSE
      'Mensagem generica de boas-vindas mencionando as queixas.'
  END;

  RETURN jsonb_build_object('system', v_system, 'user', v_user);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Worker function · processa 1 dispatch pendente
-- (chamada pelo cron ou direto)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._aq_process_one_dispatch(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_d         record;
  v_prompt    jsonb;
  v_anthropic_key text;
  v_evolution_key text;
  v_evolution_url text;
  v_evolution_instance text;
  v_request_id bigint;
  v_response   record;
  v_msg_text   text;
  v_send_resp  jsonb;
BEGIN
  SELECT * INTO v_d FROM public.anatomy_quiz_lara_dispatch
  WHERE id = p_dispatch_id AND status = 'pending'
  FOR UPDATE SKIP LOCKED;
  IF v_d.id IS NULL THEN RETURN jsonb_build_object('skipped', true); END IF;

  -- Marca como processing pra evitar duplo processamento
  UPDATE public.anatomy_quiz_lara_dispatch
  SET status = 'processing', attempts = attempts + 1
  WHERE id = v_d.id;

  -- Carrega secrets
  v_anthropic_key := public._aq_get_secret('ANTHROPIC_API_KEY');
  v_evolution_key := public._aq_get_secret('EVOLUTION_API_KEY');
  v_evolution_url := public._aq_get_secret('EVOLUTION_BASE_URL');
  v_evolution_instance := public._aq_get_secret('EVOLUTION_INSTANCE');

  IF v_anthropic_key IS NULL OR v_evolution_key IS NULL OR v_evolution_url IS NULL OR v_evolution_instance IS NULL THEN
    UPDATE public.anatomy_quiz_lara_dispatch
    SET status = 'failed', error_message = 'Vault secrets nao configurados (ANTHROPIC_API_KEY/EVOLUTION_*)'
    WHERE id = v_d.id;
    RETURN jsonb_build_object('error','missing_secrets');
  END IF;

  -- Monta prompt
  v_prompt := public._aq_build_prompt(v_d.id);

  -- 1) POST Anthropic (modelo Haiku · resposta direta · sync via pg_net)
  SELECT net.http_post(
    url     := 'https://api.anthropic.com/v1/messages',
    headers := jsonb_build_object(
      'x-api-key',         v_anthropic_key,
      'anthropic-version', '2023-06-01',
      'content-type',      'application/json'
    ),
    body    := jsonb_build_object(
      'model',      'claude-haiku-4-5-20251001',
      'max_tokens', 600,
      'system',     v_prompt->>'system',
      'messages',   jsonb_build_array(
        jsonb_build_object('role','user','content', v_prompt->>'user')
      )
    )
  ) INTO v_request_id;

  -- pg_net e async · poll pra resposta (max 20s)
  FOR i IN 1..20 LOOP
    PERFORM pg_sleep(1);
    SELECT * INTO v_response FROM net._http_response WHERE id = v_request_id;
    IF v_response.id IS NOT NULL THEN EXIT; END IF;
  END LOOP;

  IF v_response.id IS NULL OR v_response.status_code IS NULL THEN
    UPDATE public.anatomy_quiz_lara_dispatch
    SET status = 'failed', error_message = 'Anthropic timeout · request_id=' || v_request_id
    WHERE id = v_d.id;
    RETURN jsonb_build_object('error','anthropic_timeout');
  END IF;

  IF v_response.status_code <> 200 THEN
    UPDATE public.anatomy_quiz_lara_dispatch
    SET status = 'failed', error_message = 'Anthropic ' || v_response.status_code || ': ' || left(v_response.content,500),
        anthropic_response = (v_response.content)::jsonb
    WHERE id = v_d.id;
    RETURN jsonb_build_object('error','anthropic_status', 'code', v_response.status_code);
  END IF;

  -- Extrai texto da resposta Anthropic
  v_msg_text := (v_response.content::jsonb)->'content'->0->>'text';
  IF v_msg_text IS NULL OR length(trim(v_msg_text)) < 5 THEN
    UPDATE public.anatomy_quiz_lara_dispatch
    SET status = 'failed', error_message = 'Anthropic respondeu vazio',
        anthropic_response = (v_response.content)::jsonb
    WHERE id = v_d.id;
    RETURN jsonb_build_object('error','empty_message');
  END IF;

  -- 2) POST Evolution API · envia WhatsApp
  SELECT net.http_post(
    url     := v_evolution_url || '/message/sendText/' || v_evolution_instance,
    headers := jsonb_build_object(
      'apikey',       v_evolution_key,
      'content-type', 'application/json'
    ),
    body    := jsonb_build_object(
      'number', v_d.phone,
      'text',   v_msg_text
    )
  ) INTO v_request_id;

  FOR i IN 1..15 LOOP
    PERFORM pg_sleep(1);
    SELECT * INTO v_response FROM net._http_response WHERE id = v_request_id;
    IF v_response.id IS NOT NULL THEN EXIT; END IF;
  END LOOP;

  IF v_response.id IS NULL THEN
    UPDATE public.anatomy_quiz_lara_dispatch
    SET status='failed', error_message='Evolution timeout', message_text=v_msg_text
    WHERE id=v_d.id;
    RETURN jsonb_build_object('error','evolution_timeout');
  END IF;

  v_send_resp := CASE WHEN v_response.content IS NOT NULL THEN (v_response.content)::jsonb ELSE '{}'::jsonb END;

  IF v_response.status_code BETWEEN 200 AND 299 THEN
    UPDATE public.anatomy_quiz_lara_dispatch
    SET status='dispatched',
        dispatched_at=now(),
        message_text=v_msg_text,
        anthropic_response=NULL,
        evolution_response=v_send_resp
    WHERE id=v_d.id;
    RETURN jsonb_build_object('ok',true,'dispatch_id',v_d.id,'msg_preview',left(v_msg_text,80));
  ELSE
    UPDATE public.anatomy_quiz_lara_dispatch
    SET status='failed',
        error_message='Evolution '||v_response.status_code||': '||left(v_response.content,500),
        message_text=v_msg_text,
        evolution_response=v_send_resp
    WHERE id=v_d.id;
    RETURN jsonb_build_object('error','evolution_status','code',v_response.status_code);
  END IF;

EXCEPTION WHEN OTHERS THEN
  UPDATE public.anatomy_quiz_lara_dispatch
  SET status='failed', error_message='EXCEPTION: '||SQLERRM
  WHERE id=p_dispatch_id;
  RETURN jsonb_build_object('error','exception','message',SQLERRM);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. Worker batch · processa todos pendentes (chamado pelo cron)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aq_process_pending()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispatch record;
  v_count int := 0;
BEGIN
  FOR v_dispatch IN
    SELECT id FROM public.anatomy_quiz_lara_dispatch
    WHERE status = 'pending' AND next_send_at <= now()
    ORDER BY created_at ASC
    LIMIT 5  -- max 5 por tick (60s) pra evitar bloqueio longo
  LOOP
    PERFORM public._aq_process_one_dispatch(v_dispatch.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. pg_cron · agenda execucao a cada 30s
-- ─────────────────────────────────────────────────────────────────
-- Remove job antigo se existir
SELECT cron.unschedule('aq_lara_dispatcher')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aq_lara_dispatcher');

-- Agenda novo (a cada minuto · pg_cron min granularity)
SELECT cron.schedule(
  'aq_lara_dispatcher',
  '* * * * *',  -- a cada minuto
  $cron$ SELECT public.aq_process_pending(); $cron$
);

-- ─────────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.aq_process_pending IS
  'pg_cron job · processa fila anatomy_quiz_lara_dispatch · chama Claude Haiku + Evolution API via pg_net';
