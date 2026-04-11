// ============================================================================
// DB.JS — Conexión PostgreSQL (Neon.tech) con Pool y SSL
// ============================================================================
const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const isNeon = process.env.DB_HOST && process.env.DB_HOST.includes('neon.tech');

const pool = new Pool(process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
} : {
  user: process.env.DB_USER,
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  ssl: (isNeon || isProduction) ? { rejectUnauthorized: false } : false
});

// Forzar search_path para NeonDB
pool.on('connect', (client) => {
  client.query('SET search_path TO public');
});

// Test de conexión al arrancar
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ ERROR CRÍTICO DE CONEXIÓN A LA DB:', err.stack);
    return;
  }
  console.log('✅ Conexión exitosa a PostgreSQL');
  release();
});

module.exports = pool;
