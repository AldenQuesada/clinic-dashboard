-- ============================================================
-- Migration: B2B Closure Templates — Fraqueza #13
--
-- Carta de encerramento editavel por template. Antes era hard-coded
-- na RPC b2b_closure_approve. Agora busca template por key (default),
-- substitui vars {{parceria}} {{motivo}} {{data}} + fallback embutido.
--
-- Tabela + seed do template 'default' (extrai da copy atual da 292)
-- + modificacao da b2b_closure_approve para aceitar p_template_key.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_closure_templates (
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  key         text NOT NULL,
  subject     text NULL,
  body        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, key)
);

ALTER TABLE public.b2b_closure_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS b2b_closure_templates_all ON public.b2b_closure_templates;
CREATE POLICY b2b_closure_templates_all
  ON public.b2b_closure_templates
  FOR ALL USING (true) WITH CHECK (true);


-- ── Seed default (compatível com a migration 292) ──────────
INSERT INTO public.b2b_closure_templates (clinic_id, key, subject, body)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'default',
  'Encerramento de ciclo — Clínica Mirian de Paula',
  E'Prezados {{parceria}},\n\n' ||
  E'Agradecemos por compartilhar essa jornada com a Clínica Mirian de Paula.\n' ||
  E'Seguindo nossa revisão periódica, acordamos por encerrar este ciclo da nossa parceria neste momento.\n\n' ||
  E'Motivo: {{motivo}}\n\n' ||
  E'Os vouchers emitidos dentro do prazo de validade permanecem honrados.\n' ||
  E'Sempre que fizer sentido reativar, nossa porta fica aberta.\n\n' ||
  E'Com carinho,\n' ||
  E'Mirian de Paula\nClínica Mirian de Paula · Beauty & Health\n\n' ||
  E'Data: {{data}}'
)
ON CONFLICT (clinic_id, key) DO NOTHING;


-- ── Listar templates ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_closure_templates_list()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'key',        key,
      'subject',    subject,
      'body',       body,
      'updated_at', updated_at
    )
    ORDER BY (key = 'default') DESC, key
  ), '[]'::jsonb)
  INTO v_out
  FROM public.b2b_closure_templates
  WHERE clinic_id = v_clinic_id;

  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;


-- ── Obter template por key ────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_closure_template_get(
  p_key text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row       public.b2b_closure_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.b2b_closure_templates
    WHERE clinic_id = v_clinic_id AND key = COALESCE(p_key, 'default');

  IF NOT FOUND THEN
    -- Fallback ao default se key não encontrada
    SELECT * INTO v_row FROM public.b2b_closure_templates
      WHERE clinic_id = v_clinic_id AND key = 'default';
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_default_template');
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'key',        v_row.key,
    'subject',    v_row.subject,
    'body',       v_row.body,
    'updated_at', v_row.updated_at
  );
END $$;


-- ── Upsert template ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_closure_template_upsert(
  p_key     text,
  p_subject text,
  p_body    text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_key');
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_body');
  END IF;

  INSERT INTO public.b2b_closure_templates (clinic_id, key, subject, body, updated_at)
  VALUES (v_clinic_id, trim(p_key), NULLIF(trim(COALESCE(p_subject,'')),''), trim(p_body), now())
  ON CONFLICT (clinic_id, key) DO UPDATE
    SET subject    = EXCLUDED.subject,
        body       = EXCLUDED.body,
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'key', trim(p_key));
END $$;


-- ── Deletar template (não permite deletar 'default') ─────
CREATE OR REPLACE FUNCTION public.b2b_closure_template_delete(
  p_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF p_key = 'default' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_default');
  END IF;

  DELETE FROM public.b2b_closure_templates
   WHERE clinic_id = v_clinic_id AND key = p_key;

  RETURN jsonb_build_object('ok', true);
END $$;


-- ── Re-criar b2b_closure_approve com suporte a template ──
--    Drop antiga (uuid, text) pra evitar ambiguidade com a nova (uuid, text, text).
--    Client-side todos callers usam a RPC — vai pegar a nova automaticamente.
DROP FUNCTION IF EXISTS public.b2b_closure_approve(uuid, text);

CREATE OR REPLACE FUNCTION public.b2b_closure_approve(
  p_id           uuid,
  p_reason       text DEFAULT NULL,
  p_template_key text DEFAULT 'default'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id      uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_p              public.b2b_partnerships%ROWTYPE;
  v_tpl_body       text;
  v_letter         text;
  v_final_reason   text;
  v_data_str       text;
  v_parceria_name  text;
BEGIN
  SELECT * INTO v_p FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  v_final_reason  := COALESCE(p_reason, v_p.closure_reason, 'Encerramento acordado');
  v_parceria_name := COALESCE(v_p.contact_name, v_p.name);
  v_data_str      := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');

  -- Busca body do template
  SELECT body INTO v_tpl_body
    FROM public.b2b_closure_templates
   WHERE clinic_id = v_clinic_id
     AND key = COALESCE(p_template_key, 'default');

  -- Fallback ao default se key não encontrada
  IF v_tpl_body IS NULL THEN
    SELECT body INTO v_tpl_body
      FROM public.b2b_closure_templates
     WHERE clinic_id = v_clinic_id AND key = 'default';
  END IF;

  -- Último fallback: hard-coded (garante que nunca quebra)
  IF v_tpl_body IS NULL THEN
    v_tpl_body :=
      E'Prezados {{parceria}},\n\nAgradecemos por compartilhar essa jornada.\nMotivo: {{motivo}}\n\nData: {{data}}';
  END IF;

  -- Substituição de vars (replace simples)
  v_letter := v_tpl_body;
  v_letter := replace(v_letter, '{{parceria}}', v_parceria_name);
  v_letter := replace(v_letter, '{{motivo}}',   v_final_reason);
  v_letter := replace(v_letter, '{{data}}',     v_data_str);

  UPDATE public.b2b_partnerships
     SET status         = 'closed',
         status_reason  = v_final_reason,
         closure_letter = v_letter,
         updated_at     = now()
   WHERE id = p_id;

  -- Cancela vouchers abertos automaticamente
  UPDATE public.b2b_vouchers
     SET status     = 'cancelled',
         notes      = COALESCE(notes, '') || ' [auto: parceria encerrada]',
         updated_at = now()
   WHERE clinic_id = v_clinic_id AND partnership_id = p_id
     AND status IN ('issued','delivered','opened');

  -- Resolve tasks abertas
  UPDATE public.b2b_tasks
     SET status      = 'auto_resolved',
         resolved_at = now(),
         updated_at  = now()
   WHERE clinic_id = v_clinic_id AND partnership_id = p_id AND status = 'open';

  RETURN jsonb_build_object(
    'ok',           true,
    'id',           p_id,
    'letter',       v_letter,
    'template_key', COALESCE(p_template_key, 'default')
  );
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_closure_templates_list()                   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_closure_template_get(text)                  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_closure_template_upsert(text, text, text)   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_closure_template_delete(text)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_closure_approve(uuid, text, text)           TO anon, authenticated, service_role;
