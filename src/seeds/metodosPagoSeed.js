// ============================================================================
// SEED — Métodos de Pago por defecto para cada agencia nueva
// ============================================================================
const pool = require('../db');

/**
 * Inserta los métodos de pago predeterminados para una agencia recién creada.
 * @param {string} empresaNombre - Nombre de la empresa
 * @param {import('pg').PoolClient} [client] - Cliente de transacción opcional
 */
async function seedMetodosPago(empresaNombre, client) {
  const queryFn = client || pool;

  const metodos = [
    // ARS
    { nombre: 'EFECTIVO', moneda: 'ARS', tipo: 'EFECTIVO' },
    { nombre: 'MERCADO_PAGO', moneda: 'ARS', tipo: 'TRANSFERENCIA' },
    { nombre: 'CUENTA_DNI', moneda: 'ARS', tipo: 'TRANSFERENCIA' },
    { nombre: 'BBVA_FRANCES', moneda: 'ARS', tipo: 'TRANSFERENCIA' },
    { nombre: 'NARANJA_X', moneda: 'ARS', tipo: 'TRANSFERENCIA' },
    { nombre: 'TARJETA', moneda: 'ARS', tipo: 'TARJETA' },
    // USD
    { nombre: 'EFECTIVO', moneda: 'USD', tipo: 'EFECTIVO' },
    { nombre: 'TRANSFERENCIA_USD', moneda: 'USD', tipo: 'TRANSFERENCIA' },
    // EUR
    { nombre: 'EFECTIVO', moneda: 'EUR', tipo: 'EFECTIVO' }
  ];

  for (const m of metodos) {
    await queryFn.query(
      `INSERT INTO metodos_pago (nombre, moneda, tipo, activo, empresa_nombre)
       VALUES ($1, $2, $3, TRUE, $4)`,
      [m.nombre, m.moneda, m.tipo, empresaNombre]
    );
  }

  console.log(`✅ Métodos de pago creados para "${empresaNombre}"`);
}

module.exports = { seedMetodosPago };
