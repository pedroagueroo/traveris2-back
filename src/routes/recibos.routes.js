// ============================================================================
// RECIBOS ROUTES — Consulta y datos para impresión (JWT obligatorio)
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/recibos/reserva/:id — Recibos de una reserva
router.get('/reserva/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      `SELECT r.*, p.tipo AS pago_tipo, p.fecha AS pago_fecha
       FROM recibos r
       LEFT JOIN pagos p ON r.id_pago = p.id
       WHERE r.id_reserva = $1 AND r.empresa_nombre = $2
       ORDER BY r.numero_recibo DESC`,
      [parseInt(req.params.id, 10), empresa]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando recibos:', err);
    res.status(500).json({ error: 'Error al listar recibos' });
  }
});

// GET /api/recibos/:id — Detalle de un recibo (datos para impresión)
router.get('/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const id = parseInt(req.params.id, 10);

    const recibo = await pool.query(
      'SELECT * FROM recibos WHERE id = $1 AND empresa_nombre = $2',
      [id, empresa]
    );

    if (recibo.rows.length === 0) {
      return res.status(404).json({ error: 'Recibo no encontrado' });
    }

    // Obtener datos de la agencia para el recibo
    const agencia = await pool.query(
      'SELECT * FROM agencias_config WHERE empresa_nombre = $1',
      [empresa]
    );

    // Obtener datos de la reserva si existe
    let reservaData = null;
    if (recibo.rows[0].id_reserva) {
      const reserva = await pool.query(
        'SELECT destino_final, fecha_viaje_salida, fecha_viaje_regreso FROM reservas WHERE id = $1',
        [recibo.rows[0].id_reserva]
      );
      reservaData = reserva.rows[0] || null;
    }

    res.json({
      recibo: recibo.rows[0],
      agencia: agencia.rows[0] || null,
      reserva: reservaData
    });
  } catch (err) {
    console.error('❌ Error obteniendo recibo:', err);
    res.status(500).json({ error: 'Error al obtener recibo' });
  }
});

// GET /api/recibos — Lista de todos los recibos
router.get('/', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM recibos WHERE empresa_nombre = $1',
      [empresa]
    );

    const result = await pool.query(
      `SELECT * FROM recibos WHERE empresa_nombre = $1
       ORDER BY numero_recibo DESC LIMIT $2 OFFSET $3`,
      [empresa, limit, offset]
    );

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit
    });
  } catch (err) {
    console.error('❌ Error listando todos los recibos:', err);
    res.status(500).json({ error: 'Error al listar recibos' });
  }
});

module.exports = router;
