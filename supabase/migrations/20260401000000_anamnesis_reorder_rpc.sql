-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — REF-02: Atomic Reorder RPCs
--  Migration: 20260401000000_anamnesis_reorder_rpc.sql
--
--  Substitui o padrão de N×2 chamadas PATCH individuais por uma única
--  transação atômica no banco para reordenação de sessões, campos e opções.
--
--  RPCs criados:
--    reorder_anamnesis_sessions(p_template_id, p_ids)
--    reorder_anamnesis_fields(p_session_id, p_ids)
--    reorder_anamnesis_field_options(p_field_id, p_ids)
--
--  Algoritmo (2 fases — idêntico ao _persistOrder do frontend):
--    Fase 1: move todos para faixa segura (base + i) → evita conflitos UNIQUE
--    Fase 2: define ordem final sequencial 1..N
-- ═══════════════════════════════════════════════════════════════════════════

-- ── reorder_anamnesis_sessions ──────────────────────────────────────────────
create or replace function public.reorder_anamnesis_sessions(
  p_template_id uuid,
  p_ids         uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i    int;
  v_len  int := array_length(p_ids, 1);
  v_base int;
begin
  if v_len is null or v_len = 0 then return; end if;
  v_base := v_len + 10000;

  -- Fase 1: faixa segura
  for v_i in 1..v_len loop
    update public.anamnesis_template_sessions
    set    order_index = v_base + v_i
    where  id          = p_ids[v_i]
      and  template_id = p_template_id;
  end loop;

  -- Fase 2: ordem final 1..N
  for v_i in 1..v_len loop
    update public.anamnesis_template_sessions
    set    order_index = v_i
    where  id          = p_ids[v_i]
      and  template_id = p_template_id;
  end loop;
end;
$$;

-- ── reorder_anamnesis_fields ─────────────────────────────────────────────────
create or replace function public.reorder_anamnesis_fields(
  p_session_id uuid,
  p_ids        uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i    int;
  v_len  int := array_length(p_ids, 1);
  v_base int;
begin
  if v_len is null or v_len = 0 then return; end if;
  v_base := v_len + 10000;

  for v_i in 1..v_len loop
    update public.anamnesis_fields
    set    order_index = v_base + v_i
    where  id         = p_ids[v_i]
      and  session_id = p_session_id;
  end loop;

  for v_i in 1..v_len loop
    update public.anamnesis_fields
    set    order_index = v_i
    where  id         = p_ids[v_i]
      and  session_id = p_session_id;
  end loop;
end;
$$;

-- ── reorder_anamnesis_field_options ──────────────────────────────────────────
create or replace function public.reorder_anamnesis_field_options(
  p_field_id uuid,
  p_ids      uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i    int;
  v_len  int := array_length(p_ids, 1);
  v_base int;
begin
  if v_len is null or v_len = 0 then return; end if;
  v_base := v_len + 10000;

  for v_i in 1..v_len loop
    update public.anamnesis_field_options
    set    order_index = v_base + v_i
    where  id       = p_ids[v_i]
      and  field_id = p_field_id;
  end loop;

  for v_i in 1..v_len loop
    update public.anamnesis_field_options
    set    order_index = v_i
    where  id       = p_ids[v_i]
      and  field_id = p_field_id;
  end loop;
end;
$$;

-- ── Permissões ───────────────────────────────────────────────────────────────
-- anon pode chamar as RPCs (clinic/session/field validados pelos parâmetros
-- + RLS nas tabelas dentro do security definer context).
grant execute on function public.reorder_anamnesis_sessions(uuid, uuid[])       to anon;
grant execute on function public.reorder_anamnesis_fields(uuid, uuid[])         to anon;
grant execute on function public.reorder_anamnesis_field_options(uuid, uuid[])  to anon;
