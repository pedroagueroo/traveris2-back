// ============================================================================
// MIDDLEWARE — Resolver empresa_nombre para usuarios ADMIN
// ============================================================================
const pool = require('../db');

/**
 * Para usuarios ADMIN que no tienen empresa_nombre asignada,
 * busca la primera agencia en la BD y la asigna al request.
 * Esto permite al ADMIN operar en el sistema como si fuera
 * usuario de esa agencia (crear clientes, reservas, etc.)
 */
async function resolverEmpresa(req, res, next) {
  if (req.usuario && !req.usuario.empresa_nombre) {
    try {
      const result = await pool.query(
        'SELECT empresa_nombre FROM agencias_config ORDER BY creada_en ASC LIMIT 1'
      );
      if (result.rows.length > 0) {
        req.usuario.empresa_nombre = result.rows[0].empresa_nombre;
      } else {
        // No hay agencias — las rutas que lo requieran fallarán naturalmente
        req.usuario.empresa_nombre = null;
      }
    } catch (err) {
      console.error('⚠️ Error resolviendo empresa para ADMIN:', err);
    }
  }
  next();
}

module.exports = { resolverEmpresa };
