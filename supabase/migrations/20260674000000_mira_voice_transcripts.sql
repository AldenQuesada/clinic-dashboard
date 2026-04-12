-- Mira Bloco D #2 — Voice → Task (audio do WhatsApp vira comando)
--
-- Fluxo completo (implementado em n8n):
--   Evolution recebe audioMessage → n8n baixa via downloadMedia →
--   Groq Whisper transcreve → chama wa_pro_process_voice que loga +
--   invoca wa_pro_handle_message com o transcript como se fosse texto.
--
-- Blindagens:
--  - Cap de duracao (60s) na stage n8n ANTES de mandar pra Groq
--  - Transcript minimo 3 chars (rejeita ruido/vazio)
--  - Tudo em pt-BR forcado (language='pt')
--  - Writes (create/cancel/reschedule) caem no pattern 2-step, entao
--    Whisper errando nome nao executa direto — Mirian confirma antes
--  - Audit completo por transcripcao (custo, duracao, confidence, model)
--  - Idempotencia: se Evolution enviar webhook duplicado (mesmo message_id),
--    wa_pro_log_transcript ignora silenciosamente

-- ============================================================
-- Tabela: wa_pro_transcripts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wa_pro_transcripts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL,
  professional_id   uuid,
  phone             text NOT NULL,
  message_id        text,              -- Evolution key.id (pra dedupe)
  audio_mime        text,              -- 'audio/ogg; codecs=opus' etc
  duration_s        int,               -- duracao em segundos
  transcript        text NOT NULL,
  model             text DEFAULT 'whisper-large-v3-turbo',
  provider          text DEFAULT 'groq',
  language          text DEFAULT 'pt',
  tokens_used       int,
  cost_usd          numeric(10,6),     -- calculado no client (duration/3600 * rate)
  intent_resolved   text,              -- intent que o handle_message decidiu
  status            text DEFAULT 'ok', -- ok | too_long | empty | failed
  error             text,
  created_at        timestamptz DEFAULT now()
);

-- Dedupe: um message_id da Evolution nunca e processado 2x
CREATE UNIQUE INDEX IF NOT EXISTS wa_pro_transcripts_msgid_idx
  ON public.wa_pro_transcripts (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_pro_transcripts_clinic_created_idx
  ON public.wa_pro_transcripts (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wa_pro_transcripts_phone_created_idx
  ON public.wa_pro_transcripts (phone, created_at DESC);

ALTER TABLE public.wa_pro_transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_pro_transcripts_service ON public.wa_pro_transcripts;
CREATE POLICY wa_pro_transcripts_service ON public.wa_pro_transcripts
  FOR ALL TO authenticated
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');
REVOKE ALL ON public.wa_pro_transcripts FROM anon;


-- ============================================================
-- RPC: wa_pro_process_voice
-- Chamada pelo n8n depois da transcription.
-- Dedupe por message_id + log + chamada a handle_message.
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_process_voice(
  p_phone       text,
  p_transcript  text,
  p_duration_s  int DEFAULT NULL,
  p_message_id  text DEFAULT NULL,
  p_audio_mime  text DEFAULT NULL,
  p_model       text DEFAULT 'whisper-large-v3-turbo',
  p_provider    text DEFAULT 'groq',
  p_cost_usd    numeric DEFAULT NULL,
  p_status      text DEFAULT 'ok',
  p_error       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth        jsonb;
  v_clinic_id   uuid;
  v_prof_id     uuid;
  v_clean       text;
  v_handle_res  jsonb;
  v_intent      text;
  v_transcript_id uuid;
  v_dup_count   int;
BEGIN
  -- Dedupe defensivo (o UNIQUE INDEX faria, mas checar antes e mais limpo)
  IF p_message_id IS NOT NULL THEN
    SELECT count(*) INTO v_dup_count FROM public.wa_pro_transcripts
    WHERE message_id = p_message_id;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true,
        'response', NULL);
    END IF;
  END IF;

  -- Auth (nao bloqueia o log — transcreve mesmo se numero nao cadastrado,
  -- mas so roda handle_message se for autorizado)
  v_auth := wa_pro_authenticate(p_phone);
  IF (v_auth->>'ok')::boolean THEN
    v_clinic_id := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
    v_prof_id   := (v_auth->>'professional_id')::uuid;
  ELSE
    v_clinic_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  -- Valida transcript
  v_clean := TRIM(COALESCE(p_transcript, ''));
  IF LENGTH(v_clean) < 3 THEN
    INSERT INTO public.wa_pro_transcripts (
      clinic_id, professional_id, phone, message_id, audio_mime, duration_s,
      transcript, model, provider, cost_usd, status, error
    ) VALUES (
      v_clinic_id, v_prof_id, p_phone, p_message_id, p_audio_mime, p_duration_s,
      COALESCE(v_clean, ''), p_model, p_provider, p_cost_usd, 'empty',
      'transcript too short'
    );
    RETURN jsonb_build_object('ok', false, 'error', 'transcript_empty',
      'response', '🎙️ Nao entendi o audio. Pode repetir mais alto?');
  END IF;

  -- Status pre-determinado (too_long etc) — so loga, nao processa
  IF p_status IS DISTINCT FROM 'ok' THEN
    INSERT INTO public.wa_pro_transcripts (
      clinic_id, professional_id, phone, message_id, audio_mime, duration_s,
      transcript, model, provider, cost_usd, status, error
    ) VALUES (
      v_clinic_id, v_prof_id, p_phone, p_message_id, p_audio_mime, p_duration_s,
      v_clean, p_model, p_provider, p_cost_usd, p_status, p_error
    );

    IF p_status = 'too_long' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'too_long',
        'response', '⏱️ Audio muito longo (max 60s). Fala mais curto.');
    END IF;
    IF p_status = 'failed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'transcription_failed',
        'response', '🎙️ Nao consegui transcrever. Manda por texto?');
    END IF;
  END IF;

  -- Se numero nao autorizado, registra mas retorna unauthorized
  IF NOT (v_auth->>'ok')::boolean THEN
    INSERT INTO public.wa_pro_transcripts (
      clinic_id, professional_id, phone, message_id, audio_mime, duration_s,
      transcript, model, provider, cost_usd, status, intent_resolved
    ) VALUES (
      v_clinic_id, NULL, p_phone, p_message_id, p_audio_mime, p_duration_s,
      v_clean, p_model, p_provider, p_cost_usd, 'ok', 'unauthorized'
    );
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized',
      'response', '🚫 Numero nao autorizado.');
  END IF;

  -- Chama o pipeline de texto existente
  v_handle_res := wa_pro_handle_message(p_phone, v_clean);
  v_intent := v_handle_res->>'intent';

  -- Loga transcricao
  INSERT INTO public.wa_pro_transcripts (
    clinic_id, professional_id, phone, message_id, audio_mime, duration_s,
    transcript, model, provider, cost_usd, status, intent_resolved
  ) VALUES (
    v_clinic_id, v_prof_id, p_phone, p_message_id, p_audio_mime, p_duration_s,
    v_clean, p_model, p_provider, p_cost_usd, 'ok', v_intent
  ) RETURNING id INTO v_transcript_id;

  -- Retorna transcript + response do handle_message juntos.
  -- Se for intent de escrita (stage), a resposta ja e o preview pedindo sim.
  -- Se for read, a resposta ja e o resultado formatado.
  -- Em ambos, prepend "🎙️ ouvi: <transcript>" pra Mirian saber o que a Mira entendeu.
  RETURN jsonb_build_object(
    'ok', true,
    'transcript_id', v_transcript_id,
    'transcript', v_clean,
    'intent', v_intent,
    'response', E'🎙️ _ouvi:_ "' || v_clean || E'"\n\n' || (v_handle_res->>'response')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_process_voice(
  text, text, int, text, text, text, text, numeric, text, text
) TO authenticated, anon;


-- ============================================================
-- View: wa_pro_voice_usage — custo mensal por profissional
-- ============================================================
CREATE OR REPLACE VIEW public.wa_pro_voice_usage AS
SELECT
  clinic_id,
  professional_id,
  date_trunc('month', created_at)::date AS month,
  count(*)                              AS transcriptions,
  count(*) FILTER (WHERE status = 'ok') AS successful,
  count(*) FILTER (WHERE status = 'empty') AS empty_count,
  count(*) FILTER (WHERE status = 'too_long') AS too_long_count,
  count(*) FILTER (WHERE status = 'failed') AS failed_count,
  COALESCE(sum(duration_s), 0)          AS total_seconds,
  ROUND(COALESCE(sum(duration_s), 0) / 60.0, 2) AS total_minutes,
  COALESCE(sum(cost_usd), 0)            AS total_cost_usd
FROM public.wa_pro_transcripts
GROUP BY clinic_id, professional_id, date_trunc('month', created_at);

GRANT SELECT ON public.wa_pro_voice_usage TO authenticated;


COMMENT ON TABLE public.wa_pro_transcripts IS
  'Log de transcricoes de audio do WhatsApp processadas pela Mira (Groq Whisper)';
COMMENT ON FUNCTION public.wa_pro_process_voice(
  text, text, int, text, text, text, text, numeric, text, text
) IS
  'Entrypoint do n8n apos transcription: loga + chama handle_message com o texto';
