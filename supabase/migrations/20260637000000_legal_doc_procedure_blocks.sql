-- ============================================================
-- Migration: 20260637000000 — Legal Doc Procedure Blocks + Trigger Columns
--
-- 1. Tabela legal_doc_procedure_blocks (blocos por procedimento)
-- 2. RPC legal_doc_list_procedure_blocks
-- 3. Colunas trigger_status/trigger_procedures em legal_doc_templates
-- 4. Fix RPC legal_doc_upsert_template para aceitar triggers
-- 5. Fix RPC legal_doc_list_templates para retornar triggers
-- 6. Seed de procedimentos (Fotona, Drenagem, Limpeza, Ozonio)
-- ============================================================

-- ══════════════════════════════════════════════════════════════
--  1. PROCEDURE BLOCKS — blocos de conteudo por procedimento
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.legal_doc_procedure_blocks (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  clinic_id         uuid        NOT NULL DEFAULT app_clinic_id(),
  procedure_name    text        NOT NULL,
  procedure_keys    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  finalidade        text,
  descricao         text,
  alternativas      text,
  beneficios        text,
  riscos            text,
  contraindicacoes  text,
  resultados        text,
  cuidados_pre      text,
  cuidados_pos      text,
  conforto          text,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT legal_doc_procedure_blocks_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.legal_doc_procedure_blocks IS
  'Blocos de conteudo por procedimento para TCLE composto. procedure_keys: array de keywords para matching.';

CREATE INDEX idx_ldpb_clinic ON public.legal_doc_procedure_blocks (clinic_id) WHERE is_active;

CREATE TRIGGER legal_doc_procedure_blocks_updated_at
  BEFORE UPDATE ON public.legal_doc_procedure_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.legal_doc_procedure_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY ldpb_select ON public.legal_doc_procedure_blocks
  FOR SELECT TO authenticated
  USING (clinic_id = app_clinic_id() AND is_active);

CREATE POLICY ldpb_admin ON public.legal_doc_procedure_blocks
  FOR ALL TO authenticated
  USING (clinic_id = app_clinic_id() AND app_role() IN ('admin', 'owner'))
  WITH CHECK (clinic_id = app_clinic_id() AND app_role() IN ('admin', 'owner'));

-- ══════════════════════════════════════════════════════════════
--  2. RPC — listar procedure blocks
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.legal_doc_list_procedure_blocks()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado'); END IF;

  RETURN jsonb_build_object('ok', true, 'data', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', b.id,
      'procedure_name', b.procedure_name,
      'procedure_keys', b.procedure_keys,
      'finalidade', b.finalidade,
      'descricao', b.descricao,
      'alternativas', b.alternativas,
      'beneficios', b.beneficios,
      'riscos', b.riscos,
      'contraindicacoes', b.contraindicacoes,
      'resultados', b.resultados,
      'cuidados_pre', b.cuidados_pre,
      'cuidados_pos', b.cuidados_pos,
      'conforto', b.conforto
    ) ORDER BY b.procedure_name), '[]'::jsonb)
    FROM public.legal_doc_procedure_blocks b
    WHERE b.clinic_id = v_clinic_id AND b.is_active
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_list_procedure_blocks() TO authenticated;

-- ══════════════════════════════════════════════════════════════
--  3. COLUNAS TRIGGER em legal_doc_templates
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.legal_doc_templates
  ADD COLUMN IF NOT EXISTS trigger_status text,
  ADD COLUMN IF NOT EXISTS trigger_procedures jsonb;

COMMENT ON COLUMN public.legal_doc_templates.trigger_status IS
  'Status do agendamento que dispara auto-envio: na_clinica | confirmado | agendado | em_consulta';
COMMENT ON COLUMN public.legal_doc_templates.trigger_procedures IS
  'Array de nomes de procedimentos que filtram o auto-envio (null = todos)';

-- ══════════════════════════════════════════════════════════════
--  4. FIX RPC upsert_template — aceitar trigger params
-- ══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.legal_doc_upsert_template(uuid, text, text, text, text, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.legal_doc_upsert_template(
  p_id                  uuid    DEFAULT NULL,
  p_slug                text    DEFAULT NULL,
  p_name                text    DEFAULT NULL,
  p_doc_type            text    DEFAULT 'custom',
  p_content             text    DEFAULT NULL,
  p_variables           jsonb   DEFAULT NULL,
  p_is_active           boolean DEFAULT true,
  p_trigger_status      text    DEFAULT NULL,
  p_trigger_procedures  jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid; v_role text; v_id uuid;
BEGIN
  v_clinic_id := app_clinic_id(); v_role := app_role();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_role NOT IN ('admin', 'owner') THEN RAISE EXCEPTION 'Permissao insuficiente'; END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN RAISE EXCEPTION 'Nome obrigatorio'; END IF;
  IF p_content IS NULL OR trim(p_content) = '' THEN RAISE EXCEPTION 'Conteudo obrigatorio'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.legal_doc_templates (clinic_id, slug, name, doc_type, content, variables, is_active, trigger_status, trigger_procedures)
    VALUES (
      v_clinic_id,
      COALESCE(p_slug, 'doc-' || substr(gen_random_uuid()::text, 1, 8)),
      trim(p_name), p_doc_type, p_content,
      COALESCE(p_variables, '["nome","cpf","data","profissional","registro_profissional","especialidade","procedimento","clinica"]'::jsonb),
      p_is_active, p_trigger_status, p_trigger_procedures
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.legal_doc_templates SET
      name = COALESCE(trim(p_name), name),
      slug = COALESCE(p_slug, slug),
      doc_type = COALESCE(p_doc_type, doc_type),
      content = COALESCE(p_content, content),
      variables = COALESCE(p_variables, variables),
      is_active = COALESCE(p_is_active, is_active),
      trigger_status = p_trigger_status,
      trigger_procedures = p_trigger_procedures,
      version = version + 1
    WHERE id = p_id AND clinic_id = v_clinic_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Template nao encontrado'; END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_upsert_template(uuid, text, text, text, text, jsonb, boolean, text, jsonb) TO authenticated;

-- ══════════════════════════════════════════════════════════════
--  5. FIX RPC list_templates — retornar trigger columns
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.legal_doc_list_templates()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado'); END IF;

  RETURN jsonb_build_object('ok', true, 'data', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'name', t.name, 'doc_type', t.doc_type,
      'content', t.content, 'variables', t.variables, 'version', t.version,
      'is_active', t.is_active, 'trigger_status', t.trigger_status,
      'trigger_procedures', t.trigger_procedures,
      'created_at', t.created_at, 'updated_at', t.updated_at
    ) ORDER BY t.name), '[]'::jsonb)
    FROM public.legal_doc_templates t
    WHERE t.clinic_id = v_clinic_id AND t.deleted_at IS NULL
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_list_templates() TO authenticated;

-- ══════════════════════════════════════════════════════════════
--  6. SEED — Blocos de procedimentos
-- ══════════════════════════════════════════════════════════════

-- Helper: insere bloco se nao existir (por procedure_name + clinic_id)
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001';
BEGIN

-- ── Fotona Veu de Noiva ─────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona Veu de Noiva - Rejuvenescimento',
  '["fotona veu","veu de noiva","fotona rejuvenescimento"]'::jsonb,
  'A aplicacao do laser Fotona - Veu de Noiva tem como objetivo estimular a producao de colageno, melhorar a textura, vico e promover um clareamento suave na pele, e tambem potencializar a absorcao de ativos aplicados na pele.',
  '<ul><li>Limpeza profunda com sabonete especifico;</li><li>Esfoliacao fisica ou enzimatica suave;</li><li>Aplicacao do laser Fotona (modo leve);</li><li>Mascara nutritiva e hidratante.</li></ul>',
  '<ul><li>Vermelhidao leve (ate 24-48h);</li><li>Aquecimento da pele ou sensacao de repuxamento;</li><li>Descamacao suave;</li><li>Ressecamento leve.</li></ul>',
  '<ul><li>Gravidez e lactacao;</li><li>Pele bronzeada ou queimadura solar;</li><li>Feridas, herpes ativa ou dermatites;</li><li>Uso recente de isotretinoina (min 6 meses);</li><li>Historico de queloides;</li><li>Rosacea ativa, acne inflamada.</li></ul>',
  'Inicio: imediato. Maximo: poucas horas. Duracao: dias a 1 semana.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona Veu de Noiva - Rejuvenescimento');

-- ── Depilacao a Laser ───────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Depilacao a Laser - Fotona',
  '["depilacao","depilacao laser","fotona depilacao"]'::jsonb,
  'A aplicacao do laser Fotona no modo Depilacao tem como objetivo eliminar pelos de forma eficaz, alcancando o foliculo piloso sem agredir a pele.',
  '<ul><li>Tecnologia Nd:YAG com VSP e FRAC3, controle de energia e distribuicao de calor;</li><li>Hidratacao da regiao apos aplicacao.</li></ul>',
  '<ul><li>Eritema e edema perifolicular;</li><li>Sensacao de ardor ou calor;</li><li>Descamacao ou coceira;</li><li>Queimaduras e bolhas (raro);</li><li>Hiperpigmentacao ou hipopigmentacao;</li><li>Aumento paradoxal de pelos (raro).</li></ul>',
  '<ul><li>Gravidez ou lactacao;</li><li>Cancer de pele;</li><li>Infeccoes de pele na area;</li><li>Isotretinoina recente (min 6 meses);</li><li>Fotossensibilidade;</li><li>Epilepsia nao controlada;</li><li>Tatuagens na area;</li><li>Pele bronzeada.</li></ul>',
  'Inicio: apos 1a sessao. Maximo: 6 a 10 sessoes. Reducao permanente de 80-90%.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Depilacao a Laser - Fotona');

-- ── Fotona 4D ───────────────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona 4D',
  '["fotona 4d","4d","lifting facial"]'::jsonb,
  'A aplicacao do laser Fotona 4D tem como objetivo promover rejuvenescimento facial, melhora na flacidez, estimulo de colageno, clareamento, resultando em lifting facial sem cortes.',
  '<ul><li>Avaliacao e marcacao das areas;</li><li>Assepsia da pele;</li><li>Aplicacao do laser conforme protocolo;</li><li>Hidratante nas regioes tratadas ao final.</li></ul>',
  '<ul><li>Vermelhidao, inchaco e calor (1 a 3 dias);</li><li>Ressecamento e descamacao;</li><li>Pequenas crostas ou escurecimento;</li><li>Hiperpigmentacao transitoria;</li><li>Pequenos hematomas (raro).</li></ul>',
  '<ul><li>Gravidez ou lactacao;</li><li>Doencas de pele ativas (herpes, psoriase);</li><li>Infeccoes ou feridas abertas;</li><li>Isotretinoina recente (min 6 meses);</li><li>Cancer de pele;</li><li>Doencas autoimunes cutaneas;</li><li>Marcapasso (so com liberacao);</li><li>Pele bronzeada.</li></ul>',
  'Inicio: 24-48h. Maximo: 30-90 dias. Duracao: 12-18 meses.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona 4D');

-- ── Fotona Active Acne ──────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona Active Acne - Acne Ativa',
  '["fotona acne","active acne","acne ativa","acne"]'::jsonb,
  'A aplicacao do laser Fotona Active Acne tem como objetivo reduzir inflamacao, diminuir a populacao de bacterias, regular producao sebacea, estimular regeneracao e prevenir cicatrizes pos-acne.',
  '<ul><li>Avaliacao clinica da acne;</li><li>Limpeza com solucao antisseptica;</li><li>Aplicacao Nd:YAG modo FRAC3;</li><li>Er:YAG modo SMOOTH para poros e turnover celular (quando indicado).</li></ul>',
  '<ul><li>Vermelhidao leve e calor;</li><li>Ardencia passageira;</li><li>Descamacao fina;</li><li>Hiperpigmentacao pos-inflamatoria;</li><li>Crosticulas discretas;</li><li>Reacao inflamatoria em acne nodulocistica.</li></ul>',
  '<ul><li>Acne com infeccao severa;</li><li>Herpes ativa;</li><li>Gravidez;</li><li>Isotretinoina oral recente (min 6 meses);</li><li>Doencas autoimunes cutaneas;</li><li>Pele bronzeada;</li><li>Queloides;</li><li>Acidos topicos fortes (suspender).</li></ul>',
  'Inicio: 1-3 sessoes. Maximo: 4-6 sessoes. Duracao: meses a anos com manutencao.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona Active Acne - Acne Ativa');

-- ── Fotona ClearSteps ───────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona ClearSteps - Onicomicose',
  '["fotona clearsteps","onicomicose","fungo unha","clearsteps"]'::jsonb,
  'Tratar onicomicose (infeccao fungica nas unhas), reduzir ou eliminar fungos de forma segura e ajudar na regeneracao e melhora estetica da unha afetada.',
  '<ul><li>Limpeza da area (remocao de esmalte);</li><li>Laser sobre a unha e ao redor;</li><li>Aquecimento a 45-50C eliminando fungos;</li><li>Duracao: 15 a 30 min.</li></ul>',
  '<ul><li>Sensacao de calor intenso;</li><li>Vermelhidao ou inchaco ao redor;</li><li>Desconforto momentaneo;</li><li>Bolhas ou queimaduras (raro);</li><li>Falta de resposta em casos avancados.</li></ul>',
  '<ul><li>Gravidez;</li><li>Infeccao ativa grave local;</li><li>Epilepsia fotossensivel;</li><li>Diabetes descompensado;</li><li>Imunossupressao;</li><li>Anticoagulantes;</li><li>Unha muito deformada.</li></ul>',
  'Inicio: apos 1a sessao. Maximo: 3-6 meses. Pode ser permanente com cuidados.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona ClearSteps - Onicomicose');

-- ── Fotona HairRestart ──────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona HairRestart - Crescimento Capilar',
  '["fotona hair","hairrestart","crescimento capilar","queda cabelo","alopecia"]'::jsonb,
  'Estimular foliculos capilares em repouso, promover espessamento de fios, reduzir queda, melhorar circulacao do couro cabeludo e frear avanco da alopecia.',
  '<ul><li>Avaliacao e classificacao da alopecia;</li><li>Higienizacao do couro cabeludo;</li><li>Aplicacao do laser em quadrantes com movimentos sequenciais.</li></ul>',
  '<ul><li>Vermelhidao leve ou calor;</li><li>Formigamento ou coceira;</li><li>Descamacao discreta;</li><li>Hipopigmentacao ou hiperpigmentacao;</li><li>Falta de resposta em alopecias cicatriciais.</li></ul>',
  '<ul><li>Gravidez ou lactacao;</li><li>Infeccao ativa no couro cabeludo;</li><li>Cancer de pele na regiao;</li><li>Isotretinoina recente (min 6 meses);</li><li>Alopecia cicatricial extensa;</li><li>Medicamentos fotossensibilizantes.</li></ul>',
  'Inicio: 2-4 semanas. Maximo: 6-8 sessoes. Duracao: 6-12 meses.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona HairRestart - Crescimento Capilar');

-- ── Fotona Hiperpigmentacao ─────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona Hiperpigmentacao',
  '["fotona hiperpigmentacao","manchas","clareamento","hiperpigmentacao"]'::jsonb,
  'Reducao de manchas escuras causadas por inflamacoes (acnes, dermatites, lesoes), melhora do tom da pele, estimulo a renovacao celular e modulacao da producao de melanina.',
  '<p>Aplicacao do laser Fotona Nd:YAG 1064nm com modos como MaQX-1 para fototermolise seletiva dos depositos de melanina.</p>',
  '<ul><li>Eritema localizado;</li><li>Sensacao de calor ou ardencia;</li><li>Edema discreto;</li><li>Ressecamento ou descamacao;</li><li>Escurecimento temporario da mancha;</li><li>Sensibilidade ao toque.</li></ul>',
  '<ul><li>Gravidez e lactacao;</li><li>Medicamentos fotossensibilizantes;</li><li>Doencas cutaneas ativas;</li><li>Queloides;</li><li>Cancer de pele;</li><li>Pele bronzeada;</li><li>Melasma;</li><li>Diabetes nao controlado.</li></ul>',
  'Inicio: 7-14 dias. Maximo: 2-3 sessoes. Total: 4-6 sessoes.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona Hiperpigmentacao');

-- ── Fotona IncontiLase ──────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona IncontiLase - Incontinencia Urinaria',
  '["fotona incontilase","incontinencia","incontinencia urinaria","incontilase"]'::jsonb,
  'Tratamento de incontinencia urinaria de esforco (leve a moderada). Promove neocolagenese e contracao dos tecidos, resultando em maior suporte a bexiga sem cirurgia.',
  '<ul><li>Posicao ginecologica;</li><li>Sonda vaginal esteril com laser Er:YAG modo SMOOTH;</li><li>Aquecimento da mucosa vaginal;</li><li>Sem cortes, sangramentos ou anestesia.</li></ul>',
  '<p>Praticamente inexistentes. Procedimento muito seguro com baixo indice de efeitos adversos.</p>',
  '<ul><li>Gestacao e lactacao;</li><li>Infeccoes genitais ativas;</li><li>Doencas autoimunes na regiao;</li><li>Imunossupressao ou cicatrizacao deficiente.</li></ul>',
  'Inicio: gradual. Maximo: 120 dias. Ate 70% das pacientes livres dos sintomas.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona IncontiLase - Incontinencia Urinaria');

-- ── Fotona IntimaLase ───────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona IntimaLase - Rejuvenescimento Intimo',
  '["fotona intimalase","rejuvenescimento intimo","intimalase","vaginal"]'::jsonb,
  'Rejuvenescimento vaginal, tratamento de frouxidao vaginal, melhora da funcao sexual, atrofia vaginal leve e incontinencia urinaria leve a moderada.',
  '<ul><li>Posicao ginecologica;</li><li>Sonda vaginal esteril 360 graus;</li><li>Aquecimento suave e controlado;</li><li>20-30 min, sem cortes ou anestesia.</li></ul>',
  '<ul><li>Leve desconforto ou ardor;</li><li>Ressecamento temporario;</li><li>Corrimento discreto;</li><li>Irritacao ou coceira (raro);</li><li>Queimaduras (muito raro).</li></ul>',
  '<ul><li>Gravidez;</li><li>Infeccao vaginal ativa;</li><li>Cancer ginecologico;</li><li>Lesoes abertas na mucosa;</li><li>Menstruacao no dia;</li><li>Diabetes descompensado;</li><li>Herpes genital recorrente.</li></ul>',
  'Inicio: 1a sessao. Maximo: 30-90 dias. Duracao: 12-18 meses.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona IntimaLase - Rejuvenescimento Intimo');

-- ── Fotona LipedemaXtreme ───────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona LipedemaXtreme - Lipedema',
  '["fotona lipedema","lipedemaxtreme","lipedema"]'::jsonb,
  'Reducao de gordura localizada, reducao do inchaco e alivio da sensacao de peso, melhora da firmeza da pele, acao antiedema e reestruturacao tecidual.',
  '<ul><li>Er:YAG modo SMOOTH com T-RUNNER: aquecimento controlado e colageno;</li><li>Nd:YAG modo PIANO com NX-RUNNER: aquecimento profundo para gordura;</li><li>Vacuum: drenagem linfatica ativa.</li></ul>',
  '<ul><li>Aquecimento local e vermelhidao transitoria;</li><li>Desconforto leve;</li><li>Edema efemero;</li><li>Marcas temporarias por succao (raro).</li></ul>',
  '<ul><li>Infeccao ativa na area;</li><li>Cancer de pele;</li><li>Gravidez;</li><li>Doencas vasculares;</li><li>Pele bronzeada;</li><li>Anticoagulantes;</li><li>Dermatites ativas.</li></ul>',
  'Inicio: 1a sessao. Maximo: 3-6 sessoes. Duracao: 12-18 meses com manutencao.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona LipedemaXtreme - Lipedema');

-- ── Fotona TightSculpting ───────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona TightSculpting - Gordura e Flacidez',
  '["fotona tightsculpting","tightsculpting","gordura corporal","gordura flacidez"]'::jsonb,
  'Reducao de gordura localizada, melhora da flacidez e firmeza da pele, contorno corporal sem cirurgia, resultados progressivos e naturais.',
  '<ul><li>Avaliacao e marcacao da area;</li><li>Etapa 1: Nd:YAG 1064nm para lipolise;</li><li>Etapa 2: Er:YAG 2940nm para retracao e colageno.</li></ul>',
  '<ul><li>Vermelhidao, inchaco e calor (1-3 dias);</li><li>Desconforto ou dor moderada;</li><li>Manchas se houver exposicao solar.</li></ul>',
  '<ul><li>Gravidez e lactacao;</li><li>Cancer ativo;</li><li>Doencas autoimunes;</li><li>Infeccoes cutaneas;</li><li>Anticoagulantes;</li><li>Marcapasso;</li><li>Pele bronzeada;</li><li>Diabetes descompensado;</li><li>Queloides;</li><li>Isotretinoina recente (min 6 meses).</li></ul>',
  'Inicio: 1a sessao. Maximo: 60-90 dias. Duracao: 3-6 meses.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona TightSculpting - Gordura e Flacidez');

-- ── Fotona ThermoLipolise ───────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona ThermoLipolise - Gordura Corporal',
  '["fotona thermolipolise","thermolipolise","lipolise"]'::jsonb,
  'Reducao de gordura localizada, melhora da tonificacao da pele e definicao do contorno corporal em unico tratamento.',
  '<ul><li>Nd:YAG pulso ultralongo modo Piano ate 2.5cm de profundidade;</li><li>Er:YAG modo Smooth para colageno;</li><li>Vacuum controlado para lipolise e drenagem.</li></ul>',
  '<ul><li>Leve desconforto termico;</li><li>Reacoes superficiais transitorias (vermelhidao, edema).</li></ul>',
  '<ul><li>Gravidez e lactacao;</li><li>Doencas autoimunes ou infecciosas ativas;</li><li>Anticoagulantes;</li><li>Cicatrizacao inadequada;</li><li>Lesoes na area, fotossensibilidade, neuropatias.</li></ul>',
  'Inicio: 1a sessao. Efeito continuo nas semanas seguintes. Gordura eliminada nao retorna.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona ThermoLipolise - Gordura Corporal');

-- ── Fotona SmoothEye ────────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona SmoothEye - Rejuvenescimento Palpebras',
  '["fotona smootheye","smootheye","palpebras","rejuvenescimento olhos"]'::jsonb,
  'Melhorar flacidez das palpebras, reducao de rugas finas e medias, estimulo de colageno, abrir o olhar com efeito lifting suave.',
  '<ul><li>Limpeza da area;</li><li>Anestesico topico (opcional);</li><li>Disparo controlado na regiao periorbital;</li><li>Produto calmante pos-laser.</li></ul>',
  '<ul><li>Vermelhidao e leve inchaco;</li><li>Calor ou repuxamento;</li><li>Descamacao leve;</li><li>Hipercromia ou hipocromia;</li><li>Crostas ou escurecimento temporario;</li><li>Infeccao secundaria (raro).</li></ul>',
  '<ul><li>Gravidez e lactacao;</li><li>Infeccoes ativas na regiao;</li><li>Isotretinoina recente (min 6 meses);</li><li>Cancer de pele;</li><li>Doencas autoimunes cutaneas;</li><li>Epilepsia fotossensivel;</li><li>Preenchimento recente nos olhos;</li><li>Cirurgias oftalmologicas recentes;</li><li>Pele bronzeada.</li></ul>',
  'Inicio: 1a sessao. Maximo: 4-6 meses. Duracao: ~12 meses.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona SmoothEye - Rejuvenescimento Palpebras');

-- ── Fotona RenovaLase ───────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona RenovaLase - Atrofia Vaginal',
  '["fotona renovalase","renovalase","atrofia vaginal","ressecamento vaginal"]'::jsonb,
  'Aliviar sintomas da atrofia vaginal (ressecamento, coceira, irritacao, dispareunia), substituindo uso prolongado de estrogeno.',
  '<ul><li>Pulsos termicos leves modo SMOOTH, sem ablacao;</li><li>Estimula angiogenese, fibroblastos e colageno;</li><li>Sem anestesia, pouco ou nenhum downtime.</li></ul>',
  '<p>Nao ha efeitos adversos significativos relatados. Procedimento seguro e bem tolerado.</p>',
  '<ul><li>Infeccao vaginal ativa;</li><li>Gravidez;</li><li>Lesoes neoplasicas;</li><li>Radioterapia recente na regiao.</li></ul>',
  'Inicio: primeiros dias. Maximo: 4-6 semanas. Duracao: ate 18 meses com manutencao anual.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona RenovaLase - Atrofia Vaginal');

-- ── Fotona Prolapse ─────────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona Prolapse - Prolapso Pelvico',
  '["fotona prolapse","prolapso","prolapso pelvico","cistocele"]'::jsonb,
  'Reduzir grau de prolapso de orgaos pelvicos (cistocele) atraves de aquecimento controlado e remodelacao do colageno, sem remocao de tecido.',
  '<ul><li>Posicao ginecologica;</li><li>Sonda vaginal esteril;</li><li>Irradiacao circular 360 graus;</li><li>Irradiacao angular na parede afetada;</li><li>Sem cortes, sangramentos ou anestesia.</li></ul>',
  '<p>Desconforto extremamente baixo. Nenhum evento adverso relatado nos estudos clinicos.</p>',
  '<ul><li>Gravidez;</li><li>Infeccoes ativas;</li><li>Lesoes na mucosa;</li><li>Condicoes que contraindicam calor ou estimulacao colagenosa.</li></ul>',
  'Inicio: 1a sessao. Maximo: 4 meses. Duracao: ate 2 anos sem tratamento adicional.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona Prolapse - Prolapso Pelvico');

-- ── Fotona OrangeLase ───────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona OrangeLase - Celulites',
  '["fotona orangelase","orangelase","celulite","celulites","casca de laranja"]'::jsonb,
  'Melhorar textura da pele com aspecto casca de laranja, quebra de septos fibrosos, estimulo de colageno e elastina, melhora da microcirculacao.',
  '<ul><li>Avaliacao do grau de celulite;</li><li>Higienizacao e marcacao;</li><li>Nd:YAG modo PIANO;</li><li>Er:YAG modo SMOOTH;</li><li>Opcional: Er:YAG leve ablativo ou FRAC3.</li></ul>',
  '<ul><li>Aquecimento local e eritema;</li><li>Edema leve (1-2 dias);</li><li>Hiperpigmentacao pos-inflamatoria (rara);</li><li>Equimose ou hipersensibilidade;</li><li>Bolhas ou queimaduras (se sem controle termico).</li></ul>',
  '<ul><li>Gravidez ou lactacao;</li><li>Doenca vascular ativa;</li><li>Infeccao ativa na area;</li><li>Implantes metalicos proximos;</li><li>Cancer de pele;</li><li>Pele bronzeada;</li><li>Anticoagulantes;</li><li>Doencas autoimunes cutaneas;</li><li>Tatuagens na area.</li></ul>',
  'Inicio: 1a sessao. Maximo: 3-6 sessoes. Duracao: 6-12 meses.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona OrangeLase - Celulites');

-- ── Fotona NightLase ────────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona NightLase - Melhora do Sono',
  '["fotona nightlase","nightlase","ronco","apneia","melhora sono"]'::jsonb,
  'Reducao do ronco, melhora da apneia leve a moderada, aumento da permeabilidade das vias aereas e estimulo de colageno da mucosa orofaringea.',
  '<ul><li>Avaliacao inicial (questionario de sono);</li><li>Higienizacao e protecao;</li><li>Laser no palato mole, uvula, amigdalas, paredes da faringe e base da lingua.</li></ul>',
  '<ul><li>Irritacao ou ressecamento da garganta (1-2 dias);</li><li>Sensacao de garganta quente;</li><li>Desconforto ao engolir;</li><li>Edema leve do palato;</li><li>Rouquidao passageira;</li><li>Falta de resposta em apneia grave.</li></ul>',
  '<ul><li>Gravidez;</li><li>Infeccoes ativas na orofaringe;</li><li>Cancer ou lesoes suspeitas;</li><li>Isotretinoina oral recente;</li><li>Doencas autoimunes mucocutaneas;</li><li>Obstrucao grave nao tratada;</li><li>Amigdalas hipertroficas grau III-IV;</li><li>Apneia grave sem acompanhamento.</li></ul>',
  'Inicio: 1a sessao. Maximo: 3-4 sessoes. Duracao: ate 12 meses com manutencao anual.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona NightLase - Melhora do Sono');

-- ── Fotona MicroCoring ──────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona MicroCoring - Rejuvenescimento Facial',
  '["fotona microcoring","microcoring","rejuvenescimento facial"]'::jsonb,
  'Rejuvenescimento facial minimamente invasivo criando microcanais ultrafinos na pele, estimulando remodelacao tecidual intensa.',
  '<ul><li>Avaliacao personalizada;</li><li>Assepsia profunda;</li><li>Anestesico topico 30-60 min;</li><li>Delimitacao das areas;</li><li>Aplicacao do laser conforme protocolo;</li><li>Hidratantes e pomadas cicatrizantes ao final.</li></ul>',
  '<ul><li>Eritema, sensibilidade, inchaco;</li><li>Descamacao ou crostas superficiais;</li><li>Raramente: hiperpigmentacao, infeccao, equimoses.</li></ul>',
  '<ul><li>Gravidez e lactacao;</li><li>Anticoagulantes;</li><li>Queloides;</li><li>Infeccao ativa, acne, lesoes;</li><li>Retinoides orais recentes;</li><li>Exposicao solar recente;</li><li>Imunossupressao;</li><li>Cancer de pele;</li><li>Pele bronzeada.</li></ul>',
  'Inicio: 7-14 dias. Maximo: 3-6 meses. Duracao: 12-18 meses.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona MicroCoring - Rejuvenescimento Facial');

-- ── Fotona LipLase ──────────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, riscos, contraindicacoes, resultados)
SELECT v_clinic, 'Fotona LipLase - Rejuvenescimento Labios',
  '["fotona liplase","liplase","labios","rejuvenescimento labios"]'::jsonb,
  'Rejuvenescimento labial, aumento natural do volume, hidratacao, melhora da definicao do contorno e correcao de rugas periorais (codigo de barras).',
  '<ul><li>Avaliacao da anatomia labial;</li><li>Higienizacao;</li><li>Aplicacao intraoral (opcional) e extraoral;</li><li>Pulsos modo SMOOTH;</li><li>Produto calmante ao final.</li></ul>',
  '<ul><li>Labios avermelhados e aquecidos;</li><li>Inchaco discreto (ate 24h);</li><li>Descamacao ou crosticulas;</li><li>Desconforto ao mastigar;</li><li>Hiperpigmentacao em fotossensiveis;</li><li>Reativacao de herpes labial.</li></ul>',
  '<ul><li>Gravidez e lactacao;</li><li>Infeccao ativa nos labios;</li><li>Doencas autoimunes cutaneas;</li><li>Isotretinoina recente (min 6 meses);</li><li>Herpes recorrente (profilaxia recomendada);</li><li>Preenchimento labial recente (min 30 dias);</li><li>Pele bronzeada.</li></ul>',
  'Inicio: imediato. Maximo: 2-4 sessoes. Duracao: 6 meses a 1 ano.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Fotona LipLase - Rejuvenescimento Labios');

-- ── Drenagem Linfatica ──────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, alternativas, beneficios, riscos, contraindicacoes, resultados, cuidados_pre, cuidados_pos, conforto)
SELECT v_clinic, 'Drenagem Linfatica',
  '["drenagem","drenagem linfatica","linfatica"]'::jsonb,
  'Acelerar recuperacao pos-cirurgica ou pos-estetica, melhorar circulacao linfatica e venosa, reduzir inchacos, eliminar toxinas, auxiliar na melhora da celulite e promover relaxamento e bem-estar.',
  '<ul><li>Paciente deitado confortavelmente;</li><li>Abertura dos linfonodos (cervical, axilar, inguinal);</li><li>Movimentos lentos com leve pressao: circulares, em bomba ou deslizamento;</li><li>Ritmo constante e repetitivo nas areas especificas.</li></ul>',
  '<ul><li>Pressoterapia (drenagem mecanica);</li><li>Massagem relaxante ou circulatoria;</li><li>Exercicios fisicos leves;</li><li>Liberacao miofascial;</li><li>Radiofrequencia estetica;</li><li>Hidroterapia;</li><li>Alimentacao diuretica e detox.</li></ul>',
  '<ul><li>Reducao de inchaco (edema);</li><li>Melhora da circulacao linfatica e venosa;</li><li>Eliminacao de toxinas;</li><li>Prevencao e combate a celulite;</li><li>Melhora do aspecto da pele;</li><li>Auxilio na recuperacao pos-operatoria;</li><li>Sensacao de leveza e relaxamento;</li><li>Estimulo do sistema imunologico.</li></ul>',
  '<ul><li>Hematomas leves;</li><li>Tontura ou queda de pressao;</li><li>Reacoes alergicas a cremes ou oleos;</li><li>Desconforto em regioes sensiveis;</li><li>Exacerbacao de sintomas.</li></ul>',
  '<ul><li>Trombose venosa profunda (TVP);</li><li>Insuficiencia cardiaca descompensada;</li><li>Infeccoes agudas;</li><li>Cancer ativo sem liberacao medica;</li><li>Erisipela ou linfangite;</li><li>Problemas graves na pele (dermatites, feridas abertas).</li></ul>',
  'Inicio: imediato. Maximo: 3-5 sessoes. Duracao: 3-7 dias.',
  '<ul><li>Informar sobre doencas, medicamentos, gestacao, alergias;</li><li>Hidratar-se bem 24h antes;</li><li>Alimentacao leve;</li><li>Evitar cafeina ou alcool;</li><li>Roupas confortaveis.</li></ul>',
  '<ul><li>Manter hidratacao;</li><li>Evitar alimentos ricos em sodio;</li><li>Repouso relativo;</li><li>Evitar roupas apertadas;</li><li>Atividade fisica leve (se liberado);</li><li>Evitar alcool por 24h.</li></ul>',
  '<ul><li>Iluminacao suave;</li><li>Musica ambiente tranquila;</li><li>Aromaterapia leve;</li><li>Temperatura agradavel.</li></ul>'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Drenagem Linfatica');

-- ── Limpeza de Pele ─────────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, alternativas, beneficios, riscos, contraindicacoes, resultados, cuidados_pre, cuidados_pos, conforto)
SELECT v_clinic, 'Limpeza de Pele',
  '["limpeza de pele","limpeza facial","limpeza"]'::jsonb,
  'Desobstruir poros, remover impurezas, oleosidade excessiva, celulas mortas e comedoes, melhorar textura, vico e aparencia da pele.',
  '<ul><li>Higienizacao com sabonetes especificos;</li><li>Esfoliacao com microgranulos ou acidos leves;</li><li>Locoes emolientes + vapor de ozonio para abrir poros;</li><li>Extracao manual de cravos;</li><li>Corrente eletrica leve bactericida;</li><li>Mascara calmante ou reequilibrante;</li><li>Tonificacao, hidratacao e protetor solar.</li></ul>',
  '<ul><li>Peeling Ultrassonico;</li><li>HydraFacial;</li><li>Peeling de Diamante ou Cristal;</li><li>Mascaras Detox ou Argila;</li><li>Peeling Quimico Superficial;</li><li>Terapia com LED Azul;</li><li>Limpeza de pele enzimatica.</li></ul>',
  '<ul><li>Poros desobstruidos e limpos;</li><li>Melhor respiracao cutanea;</li><li>Reducao de espinhas e inflamacoes;</li><li>Controle da oleosidade;</li><li>Melhora na textura;</li><li>Aparencia mais jovem e revitalizada;</li><li>Melhor absorcao de dermocosmeticos;</li><li>Sensacao de frescor e bem-estar.</li></ul>',
  '<ul><li>Vermelhidao (eritema);</li><li>Sensacao de ardencia ou repuxamento;</li><li>Manchas pos-inflamatorias;</li><li>Hematomas leves;</li><li>Acne rebote (raro);</li><li>Descamacao leve.</li></ul>',
  '<ul><li>Acne inflamatoria grave (graus III e IV);</li><li>Infeccoes cutaneas (herpes, impetigo, foliculite);</li><li>Pele com queimadura solar;</li><li>Pos-procedimento agressivo recente;</li><li>Dermatites em fase aguda;</li><li>Rosacea em crise.</li></ul>',
  'Inicio: imediato. Maximo: 2-3 dias. Duracao: 15-30 dias.',
  '<ul><li>Informar sobre doencas, medicamentos, gestacao, alergias;</li><li>Evitar exposicao solar intensa;</li><li>Nao usar esfoliantes, acidos ou retinoides;</li><li>Evitar depilacao facial;</li><li>Higienizar o rosto no dia.</li></ul>',
  '<ul><li>Evitar sol 48-72h;</li><li>Sem maquiagem nas primeiras 24h;</li><li>Nao tocar ou espremer a pele;</li><li>Evitar sauna, piscina, academia 24h;</li><li>Hidratar com produtos adequados;</li><li>Evitar acidos e esfoliantes por 3-5 dias.</li></ul>',
  '<ul><li>Vapor morno;</li><li>Movimentos suaves e ritmo controlado;</li><li>Produtos calmantes;</li><li>Mascara anestesica topica (opcional).</li></ul>'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Limpeza de Pele');

-- ── Ozonoterapia Facial ─────────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, alternativas, beneficios, riscos, contraindicacoes, resultados, cuidados_pre, cuidados_pos, conforto)
SELECT v_clinic, 'Ozonoterapia Facial',
  '["ozonio facial","ozonoterapia facial","ozonio face"]'::jsonb,
  'Melhorar a saude e aparencia da pele utilizando ozonio medicinal (O3) com propriedades antissepticas, cicatrizantes, regenerativas e antioxidantes.',
  '<ul><li>Avaliacao da pele: tipo, sensibilidade, lesoes;</li><li>Limpeza previa (higienizacao e esfoliacao leve);</li><li>Aplicacao do ozonio via gas, agua ou oleo ozonizado, ou microagulhamento + ozonio;</li><li>Finalizacao com calmantes e protetor solar.</li></ul>',
  '<ul><li>Limpeza de pele profunda;</li><li>Peelings quimicos;</li><li>Terapia fotodinamica com LED;</li><li>Microagulhamento sem ozonio;</li><li>Laser fracionado ou LIP.</li></ul>',
  '<ul><li>Acao bactericida e fungicida;</li><li>Reducao da oleosidade;</li><li>Aceleracao da cicatrizacao;</li><li>Clareamento de manchas inflamatorias;</li><li>Revitalizacao e oxigenacao cutanea;</li><li>Estimulo de colageno e elastina;</li><li>Melhora da microcirculacao.</li></ul>',
  '<ul><li>Vermelhidao ou leve ardencia momentanea;</li><li>Ressecamento se uso excessivo;</li><li>Hipersensibilidade ao ozonio (muito raro).</li></ul>',
  '<ul><li>Gravidez (uso topico com cautela);</li><li>Hipertireoidismo nao controlado;</li><li>Doencas autoimunes ativas;</li><li>Hemofilia ou tendencia hemorragica;</li><li>Alergia a ozonio;</li><li>Pele sensibilizada por acidos, laser ou sol;</li><li>Infeccoes cutaneas agudas;</li><li>Herpes labial ativo.</li></ul>',
  'Inicio: 1a-2a sessao. Maximo: 4-6 sessoes. Duracao: semanas a meses com bons cuidados.',
  '<ul><li>Evitar acidos topicos ou esfoliantes 48h antes;</li><li>Suspender isotretinoina ou antibioticos topicos;</li><li>Pele sem exposicao solar recente.</li></ul>',
  '<ul><li>Evitar sol nas 24-48h seguintes;</li><li>Hidratar a pele;</li><li>Nao usar produtos irritantes ou com alcool por 24h;</li><li>Seguir orientacao de intervalos entre sessoes.</li></ul>',
  '<ul><li>Ozonio a baixas concentracoes;</li><li>Canulas frias ou oleo/agua ozonizada;</li><li>Mascaras calmantes apos sessao;</li><li>Massagens faciais, aromaterapia (opcional).</li></ul>'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Ozonoterapia Facial');

-- ── Ozonoterapia Corporal ───────────────────────────────────
INSERT INTO public.legal_doc_procedure_blocks (clinic_id, procedure_name, procedure_keys, finalidade, descricao, alternativas, beneficios, riscos, contraindicacoes, resultados, cuidados_pre, cuidados_pos, conforto)
SELECT v_clinic, 'Ozonoterapia Corporal',
  '["ozonio corporal","ozonoterapia corporal","ozonio corpo"]'::jsonb,
  'Melhorar saude e aparencia da pele utilizando ozonio medicinal (O3) para fins terapeuticos, esteticos e funcionais.',
  '<ul><li>Microinjecoes com seringa e agulhas finas com ozonio na gordura localizada, celulite, pontos dolorosos ou areas com fibrose.</li></ul>',
  '<ul><li>Carboxiterapia;</li><li>Drenagem linfatica;</li><li>Mesoterapia corporal;</li><li>Laser lipolise ou criolipolise;</li><li>Peelings corporais e bioestimuladores;</li><li>Infravermelho ou ondas de choque.</li></ul>',
  '<ul><li>Reducao de celulite e gordura localizada;</li><li>Aumento da oxigenacao e circulacao;</li><li>Melhora da textura e cicatrizacao;</li><li>Drenagem de liquidos e toxinas;</li><li>Acao antifungica, antibacteriana e antiviral;</li><li>Alivio de dores musculares e articulares;</li><li>Estimulacao de colageno.</li></ul>',
  '<ul><li>Dor leve ou ardencia no local;</li><li>Hematomas ou edema leve;</li><li>Reacoes alergicas ao oleo ozonizado (raro).</li></ul>',
  '<ul><li>Gestacao;</li><li>Tireotoxicose;</li><li>Deficiencia de G6PD;</li><li>Trombocitopenia severa;</li><li>Epilepsia nao controlada;</li><li>Doencas autoimunes ativas;</li><li>Infeccao ativa no local;</li><li>Anticoagulantes recentes;</li><li>Hipotensao descompensada.</li></ul>',
  'Inicio: 2a-3a sessao. Maximo: 5-8 sessoes. Duracao: meses com manutencao trimestral/semestral.',
  '<ul><li>Evitar sol ou procedimentos invasivos na area;</li><li>Nao usar cremes ou acidos 24h antes;</li><li>Hidratar-se bem.</li></ul>',
  '<ul><li>Evitar sol 24-48h;</li><li>Manter hidratacao oral e da pele;</li><li>Evitar atividade fisica intensa 24h;</li><li>Comunicar reacoes persistentes.</li></ul>',
  '<ul><li>Ozonio a baixas concentracoes;</li><li>Canulas frias ou oleo/agua ozonizada;</li><li>Mascaras calmantes;</li><li>Aromaterapia e cromoterapia (opcional).</li></ul>'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_doc_procedure_blocks WHERE clinic_id = v_clinic AND procedure_name = 'Ozonoterapia Corporal');

END $$;
