// ============================================================================
// AUTH ROUTES — Login con bcrypt + JWT
// ============================================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { loginSchema } = require('../validators/auth.schema');
const { JWT_SECRET } = require('../middlewares/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    // Validar body con Zod
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        detalles: parsed.error.errors.map(e => e.message)
      });
    }

    const { nombre_usuario, password } = parsed.data;

    // Buscar usuario activo
    const result = await pool.query(
      'SELECT id, nombre_usuario, password_hash, rol, empresa_nombre FROM usuarios WHERE nombre_usuario = $1 AND activo = TRUE',
      [nombre_usuario]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = result.rows[0];

    // Comparar password con bcrypt
    const passwordValido = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar JWT con 12h de expiración
    const payload = {
      id: usuario.id,
      nombre_usuario: usuario.nombre_usuario,
      rol: usuario.rol,
      empresa_nombre: usuario.empresa_nombre
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        rol: usuario.rol,
        empresa_nombre: usuario.empresa_nombre
      }
    });

  } catch (err) {
    console.error('❌ Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
  }
});

// GET /api/auth/perfil — Datos del usuario autenticado
router.get('/perfil', async (req, res) => {
  // Esta ruta se usa CON token (se aplica verificarToken desde index.js si se monta así)
  // Pero como auth.routes se monta sin verificarToken, se verifica manualmente aquí
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await pool.query(
      'SELECT id, nombre_usuario, rol, empresa_nombre FROM usuarios WHERE id = $1 AND activo = TRUE',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error en perfil:', err);
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;
