// ============================================================================
// ADMIN MIDDLEWARE — Verificación de rol ADMIN
// ============================================================================

/**
 * Middleware que verifica que el usuario tenga rol ADMIN.
 * Debe usarse DESPUÉS de verificarToken.
 */
function verificarAdmin(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (req.usuario.rol !== 'ADMIN') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }

  next();
}

module.exports = { verificarAdmin };
