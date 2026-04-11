// ============================================================================
// DEUDAS ROUTES — Consultas de deudas por reserva
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/deudas/reserva/:id/proveedores — Agrupado por (proveedor, moneda)
router.get('/reserva/:id/proveedores', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const idReserva = parseInt(req.params.id, 10);

    const result = await pool.query(
      `SELECT
        d.id_proveedor,
        p.nombre_comercial AS proveedor_nombre,
        d.moneda,
        SUM(d.monto_total) AS deuda_total,
        SUM(d.monto_pagado) AS pagado_total,
        SUM(d.monto_total) - SUM(d.monto_pagado) AS saldo
       FROM deudas_servicio d
       LEFT JOIN proveedores p ON d.id_proveedor = p.id
       WHERE d.id_reserva = $1 AND d.empresa_nombre = $2 AND d.tipo = 'PROVEEDOR'
       GROUP BY d.id_proveedor, p.nombre_comercial, d.moneda
       ORDER BY p.nombre_comercial ASC, d.moneda ASC`,
      [idReserva, empresa]
    );

    // Totales generales por moneda
    const totales = await pool.query(
      `SELECT
        d.moneda,
        SUM(d.monto_total) AS deuda_total,
        SUM(d.monto_pagado) AS pagado_total,
        SUM(d.monto_total) - SUM(d.monto_pagado) AS saldo
       FROM deudas_servicio d
       WHERE d.id_reserva = $1 AND d.empresa_nombre = $2 AND d.tipo = 'PROVEEDOR'
       GROUP BY d.moneda`,
      [idReserva, empresa]
    );

    res.json({
      detalle: result.rows,
      totales: totales.rows
    });
  } catch (err) {
    console.error('❌ Error listando deudas proveedores:', err);
    res.status(500).json({ error: 'Error al listar deudas de proveedores' });
  }
});

// GET /api/deudas/reserva/:id/clientes — Por servicio individual
router.get('/reserva/:id/clientes', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const idReserva = parseInt(req.params.id, 10);

    const result = await pool.query(
      `SELECT
        d.id,
        d.id_servicio,
        s.tipo_servicio,
        s.descripcion,
        COALESCE(s.hotel_nombre, s.vuelo_aerolinea, s.asistencia_compania,
                 s.crucero_naviera, s.visa_pais, s.descripcion) AS servicio_nombre,
        p.nombre_comercial AS proveedor_nombre,
        d.moneda,
        d.monto_total AS deuda_total,
        d.monto_pagado AS pagado_total,
        d.monto_total - d.monto_pagado AS saldo
       FROM deudas_servicio d
       JOIN reserva_servicios_detallados s ON d.id_servicio = s.id
       LEFT JOIN proveedores p ON d.id_proveedor = p.id
       WHERE d.id_reserva = $1 AND d.empresa_nombre = $2 AND d.tipo = 'CLIENTE'
       ORDER BY s.created_at ASC`,
      [idReserva, empresa]
    );

    // Totales por moneda
    const totales = await pool.query(
      `SELECT
        d.moneda,
        SUM(d.monto_total) AS deuda_total,
        SUM(d.monto_pagado) AS pagado_total,
        SUM(d.monto_total) - SUM(d.monto_pagado) AS saldo
       FROM deudas_servicio d
       WHERE d.id_reserva = $1 AND d.empresa_nombre = $2 AND d.tipo = 'CLIENTE'
       GROUP BY d.moneda`,
      [idReserva, empresa]
    );

    res.json({
      detalle: result.rows,
      totales: totales.rows
    });
  } catch (err) {
    console.error('❌ Error listando deudas clientes:', err);
    res.status(500).json({ error: 'Error al listar deudas de clientes' });
  }
});

// GET /api/deudas/proveedor/:id — Todas las deudas de un proveedor
router.get('/proveedor/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;

    const result = await pool.query(
      `SELECT d.*, r.destino_final, c.nombre_completo AS titular_nombre
       FROM deudas_servicio d
       JOIN reservas r ON d.id_reserva = r.id
       JOIN clientes c ON r.id_titular = c.id
       WHERE d.id_proveedor = $1 AND d.empresa_nombre = $2 AND d.tipo = 'PROVEEDOR'
       ORDER BY d.creada_en DESC`,
      [parseInt(req.params.id, 10), empresa]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando deudas del proveedor:', err);
    res.status(500).json({ error: 'Error al listar deudas del proveedor' });
  }
});

module.exports = router;
