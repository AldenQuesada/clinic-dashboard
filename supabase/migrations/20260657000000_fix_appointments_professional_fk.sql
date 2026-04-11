-- ============================================================
-- Migration: Fix FK appointments.professional_id
-- Causa: FK original aponta pra public.profiles (usuarios do
-- sistema com login), mas deveria apontar pra public.professional_profiles
-- (cadastro de profissionais da clinica — podem ou nao ter login).
--
-- Impacto do bug: Appointments atribuidos a profissionais que nao
-- tem login (ex: Mirian) rejeitavam com FK violation. Appointments
-- de profissionais que tambem sao usuarios (ex: Alden owner)
-- funcionavam por coincidencia.
-- ============================================================

-- Remove FK errada (se existir)
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_professional_id_fkey;

-- Adiciona FK correta
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_professional_id_fkey
  FOREIGN KEY (professional_id)
  REFERENCES public.professional_profiles(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.appointments.professional_id IS
  'FK para professional_profiles.id — profissional que atendeu (pode nao ter login)';
