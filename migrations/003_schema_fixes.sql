BEGIN;

-- Columnas nombre y apellido en clientes
-- Existen en BD pero no en 001_initial_schema.sql
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(200),
  ADD COLUMN IF NOT EXISTS apellido VARCHAR(200);

-- banner_url en agencias_config
-- Fue agregada manualmente en Neon, necesita estar versionada
ALTER TABLE agencias_config
  ADD COLUMN IF NOT EXISTS banner_url TEXT;

COMMIT;
