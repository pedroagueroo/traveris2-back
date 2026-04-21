-- ============================================================================
-- MIGRACIÓN 002 — Agregar fecha_sena y fecha_saldar a servicios
-- ============================================================================

ALTER TABLE reserva_servicios_detallados
  ADD COLUMN IF NOT EXISTS fecha_sena DATE,
  ADD COLUMN IF NOT EXISTS fecha_saldar DATE;
