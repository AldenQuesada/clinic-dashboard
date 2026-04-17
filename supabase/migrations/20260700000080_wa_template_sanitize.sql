-- ============================================================
-- Migration: WA Template Sanitize (Fase 8 - Entrega 1)
--
-- Cria/atualiza helper SQL _wa_render_template(body, vars) que:
--  1. Substitui {{chave}} pelos valores do jsonb vars
--  2. Remove delimitadores markdown orfaos quando var vazia:
--     *  *   (espacos entre asteriscos)  -> vazio
--     _  _   (underscores)               -> vazio
--     ~  ~   (tildes)                    -> vazio
--  3. Colapsa espacos/tabs multiplos em 1
--  4. Remove espacos antes de pontuacao (. , ; : ! ?)
--  5. Colapsa quebras de linha (>=3) em 2
--  6. Trim final
--
-- Universal — afeta TODAS as msgs WA que passarem por este helper.
-- Idempotente: DROP + CREATE (nome de parametros pode ter mudado).
-- ============================================================

-- Drop defensivo (pode existir com parametros diferentes de migrations antigas)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT 'DROP FUNCTION IF EXISTS public.' || p.proname
           || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS cmd
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='_wa_render_template'
  LOOP
    EXECUTE r.cmd;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._wa_render_template(
  p_body text,
  p_vars jsonb
) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_result text;
  v_key    text;
  v_val    text;
BEGIN
  IF p_body IS NULL OR p_body = '' THEN
    RETURN COALESCE(p_body, '');
  END IF;

  v_result := p_body;

  -- 1. Substitui vars conhecidas
  IF p_vars IS NOT NULL AND jsonb_typeof(p_vars) = 'object' THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_vars)
    LOOP
      v_result := replace(v_result, '{{' || v_key || '}}', COALESCE(v_val, ''));
    END LOOP;
  END IF;

  -- 2. Limpa placeholders nao resolvidos (var nao passada)
  v_result := regexp_replace(v_result, '\{\{[^{}]+\}\}', '', 'g');

  -- 3. Remove delimitadores markdown orfaos (valor vazio entre eles)
  --    * * | *  * | *   * -> ''
  v_result := regexp_replace(v_result, '\*\s*\*', '', 'g');
  v_result := regexp_replace(v_result, '_\s*_',   '', 'g');
  v_result := regexp_replace(v_result, '~\s*~',   '', 'g');

  -- 4. Remove espacos/tabs antes de pontuacao
  v_result := regexp_replace(v_result, '[ \t]+([.,;:!?])', '\1', 'g');

  -- 5. Colapsa espacos/tabs multiplos
  v_result := regexp_replace(v_result, '[ \t]{2,}', ' ', 'g');

  -- 6. Colapsa quebras de linha (>=3) em 2
  v_result := regexp_replace(v_result, '\n{3,}', E'\n\n', 'g');

  -- 7. Remove espacos no inicio/fim de linha (trim por linha)
  v_result := regexp_replace(v_result, '[ \t]+\n', E'\n', 'g');
  v_result := regexp_replace(v_result, '\n[ \t]+', E'\n', 'g');

  -- 8. Trim final
  v_result := btrim(v_result);

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public._wa_render_template(text, jsonb) TO authenticated, anon;

-- Sanity: chamar a funcao e retornar resultado
DO $$
DECLARE
  v_test text;
BEGIN
  -- Teste var vazia entre asteriscos
  v_test := public._wa_render_template(
    'Sua *{{recompensa}}* esta liberada!',
    jsonb_build_object('recompensa', '')
  );
  RAISE NOTICE 'Test 1 (empty var + markdown): "%"', v_test;

  -- Teste multiplos espacos
  v_test := public._wa_render_template(
    'Ola {{nome}}, sua {{item}} chegou .',
    jsonb_build_object('nome', 'Maria', 'item', '')
  );
  RAISE NOTICE 'Test 2 (space before punct): "%"', v_test;

  -- Teste var preenchida normal
  v_test := public._wa_render_template(
    'Parabens *{{nome}}*! Voce ganhou {{creditos}} creditos.',
    jsonb_build_object('nome', 'Julia', 'creditos', '5')
  );
  RAISE NOTICE 'Test 3 (normal): "%"', v_test;
END $$;

COMMENT ON FUNCTION public._wa_render_template(text, jsonb) IS
  'Renderiza template WA substituindo {{vars}} e sanitizando: delimitadores markdown orfaos, espacos duplicados, espacos antes de pontuacao, quebras multiplas. Fase 8 Entrega 1.';
