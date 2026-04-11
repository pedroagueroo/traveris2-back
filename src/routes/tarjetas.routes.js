// ============================================================================
// TARJETAS ROUTES — Tarjetas-puente (no billetera)
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/tarjetas/disponibles — Tarjetas con saldo > 0
router.get('/disponibles', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      `SELECT * FROM tarjetas_clientes
       WHERE empresa_nombre = $1 AND estado = 'ACTIVA' AND monto_disponible > 0
       ORDER BY fecha_cobro DESC`,
      [empresa]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando tarjetas:', err);
    res.status(500).json({ error: 'Error al listar tarjetas disponibles' });
  }
});

// GET /api/tarjetas — Todas las tarjetas
router.get('/', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const estado = req.query.estado || '';

    let query = 'SELECT * FROM tarjetas_clientes WHERE empresa_nombre = $1';
    const params = [empresa];

    if (estado) {
      query += ' AND estado = $2';
      params.push(estado);
    }

    query += ' ORDER BY fecha_cobro DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando tarjetas:', err);
    res.status(500).json({ error: 'Error al listar tarjetas' });
  }
});

// POST /api/tarjetas/:id/liquidar — Liquidar residual
router.post('/:id/liquidar', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const empresa = req.usuario.empresa_nombre;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tarjeta = await client.query(
      'SELECT * FROM tarjetas_clientes WHERE id = $1 AND empresa_nombre = $2',
      [id, empresa]
    );

    if (tarjeta.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tarjeta no encontrada' });
    }

    const t = tarjeta.rows[0];

    if (t.estado === 'LIQUIDADA') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La tarjeta ya fue liquidada' });
    }

    const montoResidual = parseFloat(t.monto_disponible);

    if (montoResidual <= 0) {
      // Si no hay residual, solo marcar como liquidada
      await client.query(
        "UPDATE tarjetas_clientes SET estado = 'LIQUIDADA' WHERE id = $1",
        [id]
      );
      await client.query('COMMIT');
      return res.json({ mensaje: 'Tarjeta liquidada (sin residual)' });
    }

    // Generar AJUSTE_TARJETA
    await client.query(
      `INSERT INTO pagos (tipo, moneda, monto, id_tarjeta_cliente, observaciones, empresa_nombre)
       VALUES ('AJUSTE_TARJETA', $1, $2, $3, $4, $5)`,
      [t.moneda, montoResidual,
       id, `Liquidación tarjeta ${t.numero_mask} - ${t.banco_detectado}`, empresa]
    );

    // Marcar como LIQUIDADA
    await client.query(
      "UPDATE tarjetas_clientes SET monto_disponible = 0, estado = 'LIQUIDADA' WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Tarjeta liquidada', monto_ingresado: montoResidual });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error liquidando tarjeta:', err);
    res.status(500).json({ error: 'Error al liquidar tarjeta' });
  } finally {
    client.release();
  }
});

module.exports = router;
