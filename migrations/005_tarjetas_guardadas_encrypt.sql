BEGIN;

-- Asegurar que la columna existe como TEXT para guardar el valor encriptado
ALTER TABLE tarjetas_guardadas
  ALTER COLUMN nro_tarjeta_completo TYPE TEXT;

-- Índice para búsqueda por empresa
CREATE INDEX IF NOT EXISTS idx_tarjetas_guardadas_empresa 
  ON tarjetas_guardadas(empresa_nombre);

COMMIT;
