-- ============================================================
-- Migration: Templates WA + Calendário Sazonal
--
-- b2b_voucher_wa_templates — mensagem editável com placeholders
-- b2b_seasonal_calendar    — 12 meses com paleta + copy
--
-- Idempotente.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- Templates editáveis
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.b2b_voucher_wa_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  scope            text NOT NULL DEFAULT 'global' CHECK (scope IN ('global','partnership')),
  partnership_id   uuid NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  name             text NOT NULL,
  body             text NOT NULL,
  is_default       boolean NOT NULL DEFAULT false,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_wa_tpl_partnership
  ON public.b2b_voucher_wa_templates (clinic_id, partnership_id, active);
CREATE INDEX IF NOT EXISTS idx_b2b_wa_tpl_default
  ON public.b2b_voucher_wa_templates (clinic_id, is_default) WHERE is_default = true;

ALTER TABLE public.b2b_voucher_wa_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_wa_templates_all" ON public.b2b_voucher_wa_templates;
CREATE POLICY "b2b_wa_templates_all" ON public.b2b_voucher_wa_templates FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_b2b_wa_tpl_upd ON public.b2b_voucher_wa_templates;
CREATE TRIGGER trg_b2b_wa_tpl_upd
  BEFORE UPDATE ON public.b2b_voucher_wa_templates
  FOR EACH ROW EXECUTE FUNCTION public._b2b_set_updated_at();


-- Template default global (seed)
INSERT INTO public.b2b_voucher_wa_templates (scope, name, body, is_default, active)
SELECT 'global', 'Padrão Voucher Presente',
E'Oi {nome}! 💫\n\n' ||
'Você acabou de ganhar um Voucher Presente da Clínica Mirian de Paula em parceria com a {parceiro}.\n\n' ||
'Seu presente está esperando por aqui:\n{link}\n\n' ||
'Válido por {validade_dias} dias. Qualquer dúvida, é só chamar.\n— Mirian',
  true, true
 WHERE NOT EXISTS (
   SELECT 1 FROM public.b2b_voucher_wa_templates WHERE is_default = true AND scope = 'global'
 );


-- Coluna em b2b_vouchers pra guardar template usado + mensagem customizada
ALTER TABLE public.b2b_vouchers
  ADD COLUMN IF NOT EXISTS wa_template_id      uuid NULL REFERENCES public.b2b_voucher_wa_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wa_message_custom   text NULL,
  ADD COLUMN IF NOT EXISTS seasonal_theme_key  text NULL;


-- ════════════════════════════════════════════════════════════
-- Calendário sazonal (12 meses fixos)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.b2b_seasonal_calendar (
  month             int PRIMARY KEY CHECK (month BETWEEN 1 AND 12),
  key               text NOT NULL UNIQUE,
  label             text NOT NULL,
  bg_hex            text NOT NULL,
  accent_hex        text NOT NULL,
  ink_hex           text NOT NULL,
  ornament_variant  text NOT NULL DEFAULT 'default',
  copy_flavor       text NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.b2b_seasonal_calendar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_seasonal_all" ON public.b2b_seasonal_calendar;
CREATE POLICY "b2b_seasonal_all" ON public.b2b_seasonal_calendar FOR ALL USING (true) WITH CHECK (true);

-- Seed (idempotente via ON CONFLICT)
INSERT INTO public.b2b_seasonal_calendar (month, key, label, bg_hex, accent_hex, ink_hex, ornament_variant, copy_flavor) VALUES
  ( 1, 'verao_dourado',      'Verão Dourado',     '#F4ECD8', '#D4A574', '#1A1A2E', 'sun',     'Leveza do verão.'),
  ( 2, 'carnaval_cores',     'Carnaval',          '#FFFFFF', '#E94A65', '#1A1A2E', 'default', 'Cor que celebra.'),
  ( 3, 'outono_intimo',      'Outono Íntimo',     '#F5DDCE', '#7A1F2B', '#1A1A2E', 'leaf',    'Aconchego do outono.'),
  ( 4, 'pascoa_renovacao',   'Páscoa · Renovação','#E8E3F0', '#7C6EB4', '#1A1A2E', 'default', 'Renasce quem se cuida.'),
  ( 5, 'dia_das_maes',       'Dia das Mães',      '#F9E8E8', '#8B2F3D', '#1A1A2E', 'heart',   'Cuidado de mãe, cuidado de si.'),
  ( 6, 'junino_aconchego',   'Junino',            '#F4EEDD', '#C08A5C', '#1A1A2E', 'default', 'Aconchego nosso.'),
  ( 7, 'inverno_luxo',       'Inverno Luxo',      '#F5F2EC', '#C9A96E', '#1A1A2E', 'snow',    'Sofisticação do inverno.'),
  ( 8, 'primavera_nasce',    'Primavera Nasce',   '#E5EDE0', '#7A8F5F', '#1A1A2E', 'leaf',    'Desabrochar gentil.'),
  ( 9, 'primavera_plena',    'Primavera Plena',   '#FAF4EC', '#C9A96E', '#1A1A2E', 'default', 'Florescer em plenitude.'),
  (10, 'outubro_rosa',       'Outubro Rosa',      '#FCE4EC', '#D81B60', '#1A1A2E', 'ribbon',  'Cuidar é celebrar.'),
  (11, 'novembro_azul',      'Novembro Azul',     '#E8EEF5', '#1A3A5C', '#1A1A2E', 'default', 'Atenção plena.'),
  (12, 'natal_premium',      'Natal Premium',     '#0F0D0A', '#D4AF37', '#F5F0E8', 'star',    'Presente que importa.')
ON CONFLICT (month) DO UPDATE SET
  key              = EXCLUDED.key,
  label            = EXCLUDED.label,
  bg_hex           = EXCLUDED.bg_hex,
  accent_hex       = EXCLUDED.accent_hex,
  ink_hex          = EXCLUDED.ink_hex,
  ornament_variant = EXCLUDED.ornament_variant,
  copy_flavor      = EXCLUDED.copy_flavor,
  updated_at       = now();


GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_voucher_wa_templates TO anon, authenticated, service_role;
GRANT SELECT                         ON public.b2b_seasonal_calendar    TO anon, authenticated, service_role;
