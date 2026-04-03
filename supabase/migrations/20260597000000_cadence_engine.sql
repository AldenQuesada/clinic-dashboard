-- ============================================================
-- Migration: Motor de cadencia automatica
-- Envia follow-ups programados para leads que nao responderam
-- Executado via pg_cron a cada 30 minutos
-- ============================================================

-- 1. Atualizar cadencia Full Face com playbook SPIN
DELETE FROM wa_cadences WHERE clinic_id = '00000000-0000-0000-0000-000000000001';

INSERT INTO wa_cadences (clinic_id, name, trigger_phase, is_active, steps) VALUES
('00000000-0000-0000-0000-000000000001', 'Full Face - Lifting 5D', 'lead', true,
 '[
   {"day": 1, "hour": 10, "template_slug": "ff_followup_day1", "ai_mode": true, "send_photo": true, "photo_queixa": "geral"},
   {"day": 2, "hour": 14, "template_slug": "ff_followup_day2", "ai_mode": true, "send_photo": false},
   {"day": 3, "hour": 10, "template_slug": "ff_followup_day3", "ai_mode": true, "send_photo": false},
   {"day": 5, "hour": 10, "template_slug": "ff_followup_day5", "ai_mode": true, "send_photo": false},
   {"day": 7, "hour": 10, "template_slug": "ff_followup_day7", "ai_mode": false, "send_photo": false},
   {"day": 10, "hour": 10, "template_slug": "ff_followup_day10", "ai_mode": false, "send_photo": false}
 ]'::jsonb),

('00000000-0000-0000-0000-000000000001', 'Procedimentos Isolados', 'lead', true,
 '[
   {"day": 1, "hour": 10, "template_slug": "proc_followup_day1", "ai_mode": true, "send_photo": true, "photo_queixa": "geral"},
   {"day": 2, "hour": 14, "template_slug": "proc_followup_day2", "ai_mode": true, "send_photo": false},
   {"day": 3, "hour": 10, "template_slug": "proc_followup_day3", "ai_mode": true, "send_photo": false},
   {"day": 5, "hour": 10, "template_slug": "proc_followup_day5", "ai_mode": false, "send_photo": false}
 ]'::jsonb);

-- 2. Atualizar templates de follow-up Full Face (SPIN)
DELETE FROM wa_message_templates WHERE clinic_id = '00000000-0000-0000-0000-000000000001' AND slug LIKE 'ff_%';
DELETE FROM wa_message_templates WHERE clinic_id = '00000000-0000-0000-0000-000000000001' AND slug LIKE 'proc_%';

INSERT INTO wa_message_templates (clinic_id, slug, name, category, content, sort_order) VALUES
-- Full Face follow-ups
('00000000-0000-0000-0000-000000000001', 'ff_followup_day1', 'FF Dia 1 - Implicacao', 'follow_up',
 '{nome}, sabia que a perda de colageno se acelera depois dos 30? E de 1-2% ao ano — o que hoje te incomoda um pouco, em 2-3 anos pode incomodar muito mais.

A boa noticia e que quanto antes tratar, mais natural o resultado.

Olha o resultado dessa paciente que tinha queixas parecidas com as suas! Um resultado assim e o que voce esta procurando?', 20),

('00000000-0000-0000-0000-000000000001', 'ff_followup_day2', 'FF Dia 2 - Valor', 'follow_up',
 '{nome}, voce continua vendo valor em iniciar seu processo de rejuvenescimento e reconciliacao facial? Ou isso deixou de ser prioridade pra voce agora?

Pergunto porque a Dra. Mirian tem uma abordagem unica — ela avalia o rosto como um todo e monta um protocolo personalizado. E todo seu investimento volta como cashback em Fotona 4D.

Me conta o que esta pensando!', 21),

('00000000-0000-0000-0000-000000000001', 'ff_followup_day3', 'FF Dia 3 - Escassez', 'follow_up',
 '{nome}, a agenda da Dra. Mirian esta bem concorrida esse mes.

Lembra: aqui na clinica, todo seu investimento nos injetaveis volta como cashback para realizar o Fotona 4D — o melhor laser de regeneracao facial do mundo. Em outras clinicas voce paga separado. Aqui e por nossa conta.

Ainda faz sentido eu manter esse espaco reservado pra voce?', 22),

('00000000-0000-0000-0000-000000000001', 'ff_followup_day5', 'FF Dia 5 - Puxao amigavel', 'follow_up',
 '{nome}, voce desistiu da ideia ou a correria desses dias te engoliu?

Se ainda faz sentido cuidar do seu rosto, estou aqui pra te ajudar. Se nao for o momento, tudo bem tambem — me avisa que eu paro de mandar mensagens.', 23),

('00000000-0000-0000-0000-000000000001', 'ff_followup_day7', 'FF Dia 7 - Porta aberta', 'follow_up',
 '{nome}, se neste momento nao for o melhor pra voce, tudo bem. Prefere que eu retome esse assunto em outro momento ou encerramos por aqui?

Porque o rejuvenescimento de verdade nao e mudar quem voce e — e fazer o espelho voltar a te reconhecer.', 24),

('00000000-0000-0000-0000-000000000001', 'ff_followup_day10', 'FF Dia 10 - Encerramento', 'follow_up',
 '{nome}, vou pausar meu contato por aqui.

Voce nos procurou porque algo pediu atencao. Ignorar isso tambem e uma decisao.

Se quiser retomar, e so me responder que te ajudo com o maior prazer!', 25),

-- Procedimentos isolados follow-ups
('00000000-0000-0000-0000-000000000001', 'proc_followup_day1', 'Proc Dia 1 - Retomar', 'follow_up',
 '{nome}, ontem conversamos sobre {queixa_principal} e fiquei curiosa pra saber se voce pensou mais sobre isso.

A Dra. Mirian e especialista exatamente nesse tipo de procedimento e tem resultados incriveis.

Quer que eu te mostre mais resultados ou prefere ja agendar a consulta?', 30),

('00000000-0000-0000-0000-000000000001', 'proc_followup_day2', 'Proc Dia 2 - Valor', 'follow_up',
 '{nome}, muitas pacientes que tinham {queixa_principal} parecida com a sua ficaram super satisfeitas com o resultado.

E aqui na clinica tem um diferencial: todo seu investimento em injetaveis volta como cashback pra Fotona 4D — o melhor laser de regeneracao do mundo.

Ainda tem interesse em resolver isso?', 31),

('00000000-0000-0000-0000-000000000001', 'proc_followup_day3', 'Proc Dia 3 - Escassez', 'follow_up',
 '{nome}, a agenda da Dra. Mirian esta bem concorrida. Se quiser garantir um horario, me avisa que reservo pra voce.

Se nao for o momento, tudo bem — e so me dizer que paro de enviar mensagens.', 32),

('00000000-0000-0000-0000-000000000001', 'proc_followup_day5', 'Proc Dia 5 - Encerramento', 'follow_up',
 '{nome}, vou pausar meu contato por aqui.

Se mudar de ideia sobre tratar {queixa_principal}, e so me chamar que te ajudo com prazer!', 33)

ON CONFLICT (clinic_id, slug) DO NOTHING;

-- 3. Motor de cadencia (pg_cron)
CREATE OR REPLACE FUNCTION wa_run_cadences()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_conv       record;
  v_cadence    record;
  v_step       jsonb;
  v_template   record;
  v_content    text;
  v_lead       record;
  v_lead_name  text;
  v_queixa     text;
  v_now        timestamptz := now();
  v_hour       int := extract(hour from v_now at time zone 'America/Sao_Paulo');
  v_enqueued   int := 0;
  v_days_since int;
  v_funnel     text;
BEGIN
  -- So rodar entre 8h e 20h (horario de Brasilia)
  IF v_hour < 8 OR v_hour > 20 THEN
    RETURN jsonb_build_object('enqueued', 0, 'reason', 'fora do horario');
  END IF;

  -- Buscar conversas ativas com cadencia
  FOR v_conv IN
    SELECT c.*, l.name, l.queixas_faciais, l.funnel as lead_funnel
    FROM wa_conversations c
    LEFT JOIN leads l ON l.id = c.lead_id AND l.deleted_at IS NULL
    WHERE c.clinic_id = v_clinic_id
      AND c.status = 'active'
      AND c.ai_enabled = true
      AND c.cadence_paused = false
      -- Lead nao respondeu (ultima msg e da Lara, nao do lead)
      AND (c.last_ai_msg IS NOT NULL AND (c.last_lead_msg IS NULL OR c.last_ai_msg > c.last_lead_msg))
  LOOP
    -- Determinar funil
    v_funnel := COALESCE(v_conv.funnel, v_conv.lead_funnel);

    -- Buscar cadencia adequada
    SELECT * INTO v_cadence
    FROM wa_cadences
    WHERE clinic_id = v_clinic_id
      AND is_active = true
      AND (
        (v_funnel = 'fullface' AND name ILIKE '%full face%')
        OR (v_funnel = 'procedimentos' AND name ILIKE '%procedimentos%')
        OR (v_funnel IS NULL AND name ILIKE '%full face%') -- default
      )
    LIMIT 1;

    IF v_cadence IS NULL THEN CONTINUE; END IF;

    -- Calcular dias desde ultimo contato da Lara
    v_days_since := extract(day from v_now - v_conv.last_ai_msg);

    -- Buscar step atual
    v_step := NULL;
    FOR v_step IN SELECT * FROM jsonb_array_elements(v_cadence.steps)
    LOOP
      -- Verificar se e o dia certo e a hora certa
      IF (v_step->>'day')::int = v_days_since
         AND (v_step->>'hour')::int = v_hour
         AND v_conv.cadence_step < (v_step->>'day')::int
      THEN
        -- Buscar template
        SELECT * INTO v_template
        FROM wa_message_templates
        WHERE clinic_id = v_clinic_id
          AND slug = v_step->>'template_slug'
          AND is_active = true;

        IF v_template IS NOT NULL THEN
          -- Preparar conteudo
          v_lead_name := COALESCE(split_part(COALESCE(v_conv.name, v_conv.display_name, ''), ' ', 1), 'Voce');
          v_queixa := COALESCE(
            (SELECT string_agg(q, ' e ') FROM (
              SELECT jsonb_array_elements_text(COALESCE(v_conv.queixas_faciais, '[]'::jsonb)) q LIMIT 2
            ) sub),
            'suas queixas'
          );

          v_content := v_template.content;
          v_content := replace(v_content, '{nome}', v_lead_name);
          v_content := replace(v_content, '{queixa_principal}', v_queixa);

          -- Enfileirar na outbox
          INSERT INTO wa_outbox (
            clinic_id, conversation_id, lead_id, phone, content,
            template_id, priority, scheduled_at, business_hours, status
          ) VALUES (
            v_clinic_id, v_conv.id, v_conv.lead_id, v_conv.phone,
            v_content, v_template.id, 5, NULL, true, 'pending'
          );

          -- Atualizar cadence_step
          UPDATE wa_conversations
          SET cadence_step = (v_step->>'day')::int, updated_at = v_now
          WHERE id = v_conv.id;

          v_enqueued := v_enqueued + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('enqueued', v_enqueued, 'checked_at', v_now);
END;
$$;

-- Agendar no pg_cron: executa a cada 30 minutos
SELECT cron.schedule(
  'wa-run-cadences',
  '*/30 * * * *',
  $$SELECT wa_run_cadences()$$
);
