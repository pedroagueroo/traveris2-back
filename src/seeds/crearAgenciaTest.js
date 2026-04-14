require('dotenv').config();
const pool = require('../db');
const bcrypt = require('bcrypt');
const { seedMetodosPago } = require('./metodosPagoSeed');

(async () => {
  try {
    // 1. Crear agencia
    const r1 = await pool.query(
      `INSERT INTO agencias_config (empresa_nombre, nombre_comercial, titular, cuit_cuil, condicion_fiscal, domicilio, telefono, email)
       VALUES ('Viajes Pedro', 'Viajes Pedro Travel', 'Pedro Aguero', '20-45993142-7', 'RESP_INSCRIPTO', 'Av. Corrientes 1234, CABA', '+5491155551234', 'pedro@viajespedro.com')
       ON CONFLICT DO NOTHING RETURNING *`
    );
    console.log('Agencia:', r1.rows.length ? 'CREADA OK' : 'YA EXISTE');

    // 2. Seed metodos de pago
    await seedMetodosPago('Viajes Pedro');
    console.log('Metodos pago: SEED OK');

    // 3. Crear usuario EMPRESA
    const hash = await bcrypt.hash('Pedro2026!', 10);
    const r2 = await pool.query(
      `INSERT INTO usuarios (nombre_usuario, password_hash, rol, empresa_nombre)
       VALUES ('pedro', $1, 'EMPRESA', 'Viajes Pedro')
       ON CONFLICT DO NOTHING RETURNING id`,
      [hash]
    );
    console.log('Usuario pedro:', r2.rows.length ? 'CREADO OK' : 'YA EXISTE');

    console.log('\n=== CREDENCIALES ===');
    console.log('Usuario: pedro');
    console.log('Password: Pedro2026!');
    console.log('Agencia: Viajes Pedro');

    await pool.end();
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    await pool.end();
    process.exit(1);
  }
})();
