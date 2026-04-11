// ============================================================================
// MIGRATE.JS — Ejecuta migraciones SQL contra la base de datos
// ============================================================================
const fs = require('fs');
const path = require('path');
const pool = require('./db');
require('dotenv').config();

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`📦 Encontradas ${files.length} migración(es)`);

  for (const file of files) {
    console.log(`▶️ Ejecutando: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    try {
      await pool.query(sql);
      console.log(`✅ ${file} ejecutada correctamente`);
    } catch (err) {
      console.error(`❌ Error en ${file}:`, err.message);
      process.exit(1);
    }
  }

  console.log('🎉 Todas las migraciones ejecutadas');
  process.exit(0);
}

runMigrations();
