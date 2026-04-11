// ============================================================================
// AUTH MIDDLEWARE — Verificación de JWT
// ============================================================================
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'traveris_secret_key_2026_cambiar';

/**
 * Middleware que verifica el token JWT.
 * Inyecta req.usuario = { id, nombre_usuario, rol, empresa_nombre }
 */
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Formato de token inválido. Use: Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Inicie sesión nuevamente.' });
    }
    return res.status(403).json({ error: 'Token inválido' });
  }
}

module.exports = { verificarToken, JWT_SECRET };
