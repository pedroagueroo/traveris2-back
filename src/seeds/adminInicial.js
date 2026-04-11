// ============================================================================
// SEED — Admin Inicial desde variables de entorno
// ============================================================================
const bcrypt = require('bcrypt');
const pool = require('../db');
require('dotenv').config();

const SALT_ROUNDS = 10;

async function seedAdminInicial() {
  const usuario = process.env.ADMIN_INICIAL_USER;
  const password = process.env.ADMIN_INICIAL_PASS;

  if (!usuario || !password) {
    console.log('⚠️  ADMIN_INICIAL_USER / ADMIN_INICIAL_PASS no configurados. Saltando seed.');
    return;
  }

  try {
    // Verificar si ya existe
    const existe = await pool.query(
      'SELECT id FROM usuarios WHERE nombre_usuario = $1',
      [usuario]
    );

    if (existe.rows.length > 0) {
      console.log(`ℹ️  Usuario admin "${usuario}" ya existe. Saltando seed.`);
      return;
    }

    // Crear con bcrypt
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    await pool.query(
      `INSERT INTO usuarios (nombre_usuario, password_hash, rol, empresa_nombre, activo)
       VALUES ($1, $2, 'ADMIN', NULL, TRUE)`,
      [usuario, hash]
    );

    console.log(`✅ Usuario ADMIN "${usuario}" creado exitosamente.`);
  } catch (err) {
    console.error('❌ Error al crear admin inicial:', err);
  }
}

// Si se ejecuta directamente: node src/seeds/adminInicial.js
if (require.main === module) {
  seedAdminInicial().then(() => process.exit(0));
} else {
  module.exports = { seedAdminInicial };
}
