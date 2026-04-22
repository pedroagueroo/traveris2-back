BEGIN;

ALTER TABLE recibos
  DROP CONSTRAINT IF EXISTS recibos_moneda_check;

ALTER TABLE recibos
  DROP CONSTRAINT IF EXISTS recibos_moneda_check1;

ALTER TABLE recibos
  ADD CONSTRAINT recibos_moneda_check
  CHECK (moneda IN ('ARS', 'USD', 'EUR', 'MIXTO'));

COMMIT;
