/* ============================================================
 * apply-lp-lead-submit-v2.cjs
 *
 * Substitui RPC lp_lead_submit por versão que enfileira mensagens
 * em wa_outbox quando o form-inline da página tem configs de WA.
 *
 *  · A) auto-reply pro lead (se telefone capturado + enabled)
 *  · B) notificação pra staff (se número configurado)
 *
 * Tudo em EXCEPTION isolada — se WA falhar, lead AINDA é gravado.
 *
 * Idempotente. Pré-requisito: lp_pages + lp_leads + wa_outbox.
 *
 * Uso:
 *   node apply-lp-lead-submit-v2.cjs
 * ============================================================ */

const { Client } = require('pg')

const sql = `
CREATE OR REPLACE FUNCTION public.lp_lead_submit(
  p_slug text,
  p_data jsonb,
  p_utm  jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead_id   uuid;
  v_page      public.lp_pages%ROWTYPE;
  v_form_blk  jsonb;
  v_props     jsonb;
  v_phone     text;
  v_nome      text;
  v_template  text;
  v_msg       text;
  v_staff     text;
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug_required');
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'data_required');
  END IF;

  -- ── 1. Insere lead ─────────────────────────────────────────
  INSERT INTO public.lp_leads (page_slug, data, utm)
  VALUES (p_slug, p_data, p_utm)
  RETURNING id INTO v_lead_id;

  -- Increment conversion (best-effort)
  BEGIN
    UPDATE public.lp_pages SET conversions = conversions + 1 WHERE slug = p_slug;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- ── 2. Lê pagina + busca primeiro bloco form-inline ────────
  BEGIN
    SELECT * INTO v_page FROM public.lp_pages WHERE slug = p_slug LIMIT 1;
    IF v_page IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'id', v_lead_id, 'wa', 'no_page');
    END IF;

    SELECT b INTO v_form_blk
      FROM jsonb_array_elements(v_page.blocks) b
     WHERE b->>'type' = 'form-inline'
     LIMIT 1;

    IF v_form_blk IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'id', v_lead_id, 'wa', 'no_form_block');
    END IF;

    v_props := v_form_blk->'props';
    v_phone := COALESCE(p_data->>'telefone', p_data->>'phone', p_data->>'tel', '');
    v_nome  := COALESCE(p_data->>'nome',     p_data->>'name',  '');
  EXCEPTION WHEN OTHERS THEN
    -- best-effort, lead ja gravado
    RETURN jsonb_build_object('ok', true, 'id', v_lead_id, 'wa', 'config_read_failed');
  END;

  -- ── 3. A) Auto-reply pro LEAD ──────────────────────────────
  IF (v_props->>'wa_auto_reply_enabled')::bool IS TRUE
     AND length(trim(coalesce(v_phone, ''))) >= 8 THEN
    BEGIN
      v_template := COALESCE(v_props->>'wa_auto_reply_template', '');
      IF length(trim(v_template)) > 0 THEN
        v_msg := v_template;
        v_msg := replace(v_msg, '{{nome}}',    v_nome);
        v_msg := replace(v_msg, '{{phone}}',   v_phone);
        v_msg := replace(v_msg, '{{slug}}',    p_slug);
        v_msg := replace(v_msg, '{{titulo}}',  COALESCE(v_page.title, p_slug));
        -- Substitui qualquer outra var existente no data
        IF p_data ? 'interesse' THEN
          v_msg := replace(v_msg, '{{interesse}}', COALESCE(p_data->>'interesse', ''));
        END IF;

        INSERT INTO public.wa_outbox (
          clinic_id, lead_id, phone, content, content_type,
          status, scheduled_at, vars_snapshot, business_hours, max_attempts, priority
        ) VALUES (
          v_clinic_id,
          'lp:' || v_lead_id::text,        -- prefixo pra identificar origem
          regexp_replace(v_phone, '\\D', '', 'g'),
          v_msg,
          'text',
          'pending',
          now(),
          jsonb_build_object('source', 'lp_form_auto_reply', 'slug', p_slug, 'lead_id', v_lead_id),
          false,                            -- ignora horário comercial pra resposta imediata
          3,
          1                                 -- prioridade alta
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- silencia · lead ainda OK
      NULL;
    END;
  END IF;

  -- ── 4. B) Notificação pra STAFF ────────────────────────────
  v_staff := COALESCE(v_props->>'wa_staff_phone', '');
  IF length(trim(v_staff)) >= 8 THEN
    BEGIN
      v_template := COALESCE(
        v_props->>'wa_staff_template',
        E'Novo lead na LP {{titulo}}\\n\\nNome: {{nome}}\\nTelefone: {{phone}}\\nInteresse: {{interesse}}'
      );
      v_msg := v_template;
      v_msg := replace(v_msg, '{{nome}}',    v_nome);
      v_msg := replace(v_msg, '{{phone}}',   v_phone);
      v_msg := replace(v_msg, '{{slug}}',    p_slug);
      v_msg := replace(v_msg, '{{titulo}}',  COALESCE(v_page.title, p_slug));
      v_msg := replace(v_msg, '{{interesse}}', COALESCE(p_data->>'interesse', ''));

      INSERT INTO public.wa_outbox (
        clinic_id, lead_id, phone, content, content_type,
        status, scheduled_at, vars_snapshot, business_hours, max_attempts, priority
      ) VALUES (
        v_clinic_id,
        'lp_staff:' || v_lead_id::text,
        regexp_replace(v_staff, '\\D', '', 'g'),
        v_msg,
        'text',
        'pending',
        now(),
        jsonb_build_object('source', 'lp_form_staff_alert', 'slug', p_slug, 'lead_id', v_lead_id),
        false,
        3,
        1
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_lead_id);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_lead_submit(text, jsonb, jsonb) TO anon, authenticated;
`

const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

;(async () => {
  try {
    await c.connect()
    await c.query(sql)
    await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('[lp-lead-submit-v2] RPC atualizada')
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
