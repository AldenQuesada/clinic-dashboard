/* ============================================================
 * apply-lp-history.cjs (Onda 19)
 *
 * Adiciona historico de versoes automatico:
 *   · trigger lp_pages_autosnap_trg: snapshot a cada UPDATE de blocks
 *     com debounce de 15min (evita lixo)
 *   · lp_revision_list ampliado (block_count, snapshot_size)
 *   · lp_revision_get(id)        — retorna snapshot completo
 *   · lp_revision_label_set(id, label)
 *   · lp_revision_delete(id)
 *
 * Idempotente.
 *
 * Uso: node apply-lp-history.cjs
 * ============================================================ */

const { Client } = require('pg')

const sql = `
-- ── 1. TRIGGER: snapshot automatico debounced ──────────────
CREATE OR REPLACE FUNCTION public.lp_pages_autosnap()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last_at timestamptz;
BEGIN
  -- so snapshota se blocks de fato mudou
  IF NEW.blocks IS NOT DISTINCT FROM OLD.blocks THEN
    RETURN NEW;
  END IF;

  -- debounce: pula se snapshot < 15min existente
  SELECT MAX(created_at) INTO v_last_at
    FROM public.lp_revisions
   WHERE page_id = NEW.id
     AND created_by = 'auto';

  IF v_last_at IS NOT NULL AND now() - v_last_at < interval '15 minutes' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lp_revisions (page_id, snapshot, label, created_by)
  VALUES (
    NEW.id,
    jsonb_build_object(
      'blocks',           OLD.blocks,
      'tokens_override',  OLD.tokens_override,
      'title',            OLD.title,
      'meta_title',       OLD.meta_title,
      'meta_description', OLD.meta_description,
      'og_image_url',     OLD.og_image_url
    ),
    NULL,
    'auto'
  );

  -- mantem teto de 50 snapshots por pagina (mais recentes)
  DELETE FROM public.lp_revisions
   WHERE page_id = NEW.id
     AND id NOT IN (
       SELECT id FROM public.lp_revisions
        WHERE page_id = NEW.id
        ORDER BY created_at DESC
        LIMIT 50
     );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lp_pages_autosnap_trg ON public.lp_pages;
CREATE TRIGGER lp_pages_autosnap_trg
  AFTER UPDATE OF blocks ON public.lp_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.lp_pages_autosnap();

-- ── 2. lp_revision_list ampliado (block_count + snapshot_size) ─
CREATE OR REPLACE FUNCTION public.lp_revision_list(p_page_id uuid, p_limit int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',            r.id,
        'label',         r.label,
        'created_by',    r.created_by,
        'created_at',    r.created_at,
        'block_count',   COALESCE(jsonb_array_length(r.snapshot->'blocks'), 0),
        'snapshot_size', length(r.snapshot::text)
      ) ORDER BY r.created_at DESC
    )
    FROM (
      SELECT * FROM public.lp_revisions
       WHERE page_id = p_page_id
       ORDER BY created_at DESC
       LIMIT GREATEST(1, LEAST(p_limit, 100))
    ) r
  ), '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_revision_list(uuid, int) TO anon, authenticated;

-- ── 3. lp_revision_get — snapshot completo pra preview/diff ──
CREATE OR REPLACE FUNCTION public.lp_revision_get(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rev public.lp_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_rev FROM public.lp_revisions WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'ok',         true,
    'id',         v_rev.id,
    'page_id',    v_rev.page_id,
    'label',      v_rev.label,
    'created_by', v_rev.created_by,
    'created_at', v_rev.created_at,
    'snapshot',   v_rev.snapshot
  );
END $$;

GRANT EXECUTE ON FUNCTION public.lp_revision_get(uuid) TO anon, authenticated;

-- ── 4. lp_revision_label_set — renomear marcador ─────────────
CREATE OR REPLACE FUNCTION public.lp_revision_label_set(p_revision_id uuid, p_label text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lp_revisions
     SET label = NULLIF(trim(p_label), '')
   WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_revision_label_set(uuid, text) TO anon, authenticated;

-- ── 5. lp_revision_delete ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lp_revision_delete(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.lp_revisions WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_revision_delete(uuid) TO anon, authenticated;
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
    console.log('[history] migration aplicada')
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
