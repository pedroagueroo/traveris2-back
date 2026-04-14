// ============================================================================
// INDEX.JS — Servidor principal Traveris Pro v2
// ============================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const pool = require('./db');
const { verificarToken } = require('./middlewares/auth');
const { verificarAdmin } = require('./middlewares/admin');
const { resolverEmpresa } = require('./middlewares/resolverEmpresa');
const { seedAdminInicial } = require('./seeds/adminInicial');

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const clientesRoutes = require('./routes/clientes.routes');
const proveedoresRoutes = require('./routes/proveedores.routes');
const reservasRoutes = require('./routes/reservas.routes');
const serviciosRoutes = require('./routes/servicios.routes');
const deudasRoutes = require('./routes/deudas.routes');
const pagosRoutes = require('./routes/pagos.routes');
const metodosPagoRoutes = require('./routes/metodosPago.routes');
const tarjetasRoutes = require('./routes/tarjetas.routes');
const recibosRoutes = require('./routes/recibos.routes');
const cajaRoutes = require('./routes/caja.routes');
const importClientesRoutes = require('./routes/importClientes.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── SEGURIDAD ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));

// ─── CORS ────────────────────────────────────────────────────────────────────
const dominiosPermitidos = [
  process.env.FRONTEND_URL || 'https://traveris-pro.vercel.app',
  'http://localhost:4200'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || dominiosPermitidos.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Límite de peticiones alcanzado.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', globalLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos de inicio de sesión.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth/login', loginLimiter);

// ─── BODY PARSING ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ─── RUTAS PÚBLICAS (sin JWT) ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Cotizaciones es pública (datos de API externa)
app.get('/api/caja/cotizaciones-completas', (req, res, next) => {
  req.url = '/cotizaciones-completas';
  cajaRoutes(req, res, next);
});

// ─── RUTAS PROTEGIDAS (con JWT) ─────────────────────────────────────────────
app.use('/api/admin', verificarToken, verificarAdmin, resolverEmpresa, adminRoutes);
app.use('/api/clientes', verificarToken, resolverEmpresa, clientesRoutes);
app.use('/api/proveedores', verificarToken, resolverEmpresa, proveedoresRoutes);
app.use('/api/reservas', verificarToken, resolverEmpresa, reservasRoutes);
app.use('/api/servicios', verificarToken, resolverEmpresa, serviciosRoutes);
app.use('/api/deudas', verificarToken, resolverEmpresa, deudasRoutes);
app.use('/api/pagos', verificarToken, resolverEmpresa, pagosRoutes);
app.use('/api/metodos-pago', verificarToken, resolverEmpresa, metodosPagoRoutes);
app.use('/api/tarjetas', verificarToken, resolverEmpresa, tarjetasRoutes);
app.use('/api/recibos', verificarToken, resolverEmpresa, recibosRoutes);
app.use('/api/caja', verificarToken, resolverEmpresa, cajaRoutes);
app.use('/api/import-clientes', verificarToken, resolverEmpresa, importClientesRoutes);

// ─── RUTA DE PRUEBA ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ mensaje: 'Backend Traveris Pro v2 funcionando 🚀', version: '2.0.0' });
});

app.get('/probar-conexion', async (req, res) => {
  try {
    const resDB = await pool.query('SELECT NOW()');
    res.json({ conexion: 'exitosa', hora: resDB.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al conectar con la base de datos' });
  }
});

app.get('/diagnostico', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT COUNT(*) as count FROM usuarios');
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('test', 10);
    const valid = await bcrypt.compare('test', hash);
    const { z } = require('zod');
    const schema = z.object({ test: z.string() });
    const parsed = schema.safeParse({ test: 'ok' });
    res.json({
      db_usuarios: dbTest.rows[0].count,
      bcrypt_ok: valid,
      zod_ok: parsed.success,
      node_version: process.version,
      env_jwt: !!process.env.JWT_SECRET
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack?.substring(0, 300) });
  }
});

// ─── MANEJADORES GLOBALES DE ERRORES ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error general interceptado:', err.stack);
  res.status(500).json({
    error: 'Error interno del servidor',
    mensaje: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

process.on('uncaughtException', (err) => {
  console.error('🔥 CRÍTICO - Excepción no capturada:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('🔥 CRÍTICO - Promesa rechazada no manejada:', reason);
});

// ─── ARRANQUE ────────────────────────────────────────────────────────────────
async function iniciar() {
  // Seed admin inicial
  await seedAdminInicial();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Traveris Pro v2 escuchando en puerto ${PORT}`);
  });
}

iniciar();
