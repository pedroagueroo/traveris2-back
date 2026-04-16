// ============================================================================
// CAJA ROUTES — Balance, detalle, reportes
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { obtenerCotizaciones } = require('../cotizacion.service');

// GET /api/caja/cotizaciones-completas — Pública (sin JWT check en este archivo)
router.get('/cotizaciones-completas', async (req, res) => {
  try {
    const cotizaciones = await obtenerCotizaciones();
    res.json(cotizaciones);
  } catch (err) {
    console.error('❌ Error cotizaciones:', err);
    res.status(500).json({ error: 'Error al obtener cotizaciones' });
  }
});

// GET /api/caja/balance — Saldo por moneda (excluyendo tarjeta-puente)
router.get('/balance', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;

    // CAJA = SUM(COBRO_CLIENTE sin tarjeta-puente)
    //      - SUM(PAGO_PROVEEDOR sin tarjeta-puente)
    //      + SUM(INGRESO_GENERAL) - SUM(EGRESO_GENERAL)
    //      ± CONVERSIONES ± AJUSTE_TARJETA
    const result = await pool.query(
      `SELECT
        moneda,
        COALESCE(SUM(CASE
          WHEN tipo = 'COBRO_CLIENTE' AND id_tarjeta_cliente IS NULL THEN monto
          WHEN tipo = 'PAGO_PROVEEDOR' AND id_tarjeta_cliente IS NULL THEN -monto
          WHEN tipo = 'INGRESO_GENERAL' THEN monto
          WHEN tipo = 'EGRESO_GENERAL' THEN -monto
          WHEN tipo = 'CONVERSION' THEN monto
          WHEN tipo = 'AJUSTE_TARJETA' THEN monto
          ELSE 0
        END), 0) AS saldo
       FROM pagos
       WHERE empresa_nombre = $1 AND anulado = FALSE
       GROUP BY moneda
       ORDER BY moneda`,
      [empresa]
    );

    // Asegurar que siempre devolvemos las 3 monedas
    const monedas = ['ARS', 'USD', 'EUR'];
    const balances = monedas.map(m => {
      const found = result.rows.find(r => r.moneda === m);
      return { moneda: m, saldo: found ? parseFloat(found.saldo) : 0 };
    });

    res.json(balances);
  } catch (err) {
    console.error('❌ Error balance caja:', err);
    res.status(500).json({ error: 'Error al obtener balance' });
  }
});

// GET /api/caja/detalle/:moneda — Desglose por método de pago
router.get('/detalle/:moneda', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const moneda = req.params.moneda.toUpperCase();

    const result = await pool.query(
      `SELECT
        mp.id AS metodo_id,
        mp.nombre AS metodo_nombre,
        mp.tipo AS metodo_tipo,
        COALESCE(SUM(CASE
          WHEN p.tipo = 'COBRO_CLIENTE' AND p.id_tarjeta_cliente IS NULL THEN p.monto
          WHEN p.tipo = 'PAGO_PROVEEDOR' AND p.id_tarjeta_cliente IS NULL THEN -p.monto
          WHEN p.tipo = 'INGRESO_GENERAL' THEN p.monto
          WHEN p.tipo = 'EGRESO_GENERAL' THEN -p.monto
          WHEN p.tipo = 'CONVERSION' THEN p.monto
          WHEN p.tipo = 'AJUSTE_TARJETA' THEN p.monto
          ELSE 0
        END), 0) AS saldo
       FROM metodos_pago mp
       LEFT JOIN pagos p ON p.metodo_pago_id = mp.id AND p.anulado = FALSE
       WHERE mp.empresa_nombre = $1 AND mp.moneda = $2 AND mp.activo = TRUE
       GROUP BY mp.id, mp.nombre, mp.tipo
       ORDER BY mp.nombre`,
      [empresa, moneda]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error detalle caja:', err);
    res.status(500).json({ error: 'Error al obtener detalle de caja' });
  }
});

// GET /api/caja/reporte-diario — Movimientos del día
router.get('/reporte-diario', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT p.*,
        mp.nombre AS metodo_nombre,
        c.nombre_completo AS cliente_nombre,
        prov.nombre_comercial AS proveedor_nombre,
        r.destino_final
       FROM pagos p
       LEFT JOIN metodos_pago mp ON p.metodo_pago_id = mp.id
       LEFT JOIN clientes c ON p.id_cliente = c.id
       LEFT JOIN proveedores prov ON p.id_proveedor = prov.id
       LEFT JOIN reservas r ON p.id_reserva = r.id
       WHERE p.empresa_nombre = $1 AND DATE(p.fecha) = $2 AND p.anulado = FALSE
       ORDER BY p.fecha DESC`,
      [empresa, fecha]
    );

    // Totales del día por moneda
    const totales = await pool.query(
      `SELECT moneda,
        COALESCE(SUM(CASE WHEN tipo IN ('COBRO_CLIENTE', 'INGRESO_GENERAL') THEN monto ELSE 0 END), 0) AS ingresos,
        COALESCE(SUM(CASE WHEN tipo IN ('PAGO_PROVEEDOR', 'EGRESO_GENERAL') THEN ABS(monto) ELSE 0 END), 0) AS egresos
       FROM pagos
       WHERE empresa_nombre = $1 AND DATE(fecha) = $2 AND anulado = FALSE
       GROUP BY moneda`,
      [empresa, fecha]
    );

    res.json({ movimientos: result.rows, totales: totales.rows, fecha });
  } catch (err) {
    console.error('❌ Error reporte diario:', err);
    res.status(500).json({ error: 'Error al generar reporte diario' });
  }
});

// GET /api/caja/cierre-mensual — Cierre del mes
router.get('/cierre-mensual', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const now = new Date();
    const mes = parseInt(req.query.mes || String(now.getMonth() + 1), 10);
    const anio = parseInt(req.query.anio || String(now.getFullYear()), 10);

    // Saldo al inicio del mes (todos los pagos antes del 1ro del mes)
    const inicioMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const finMes = mes === 12
      ? `${anio + 1}-01-01`
      : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;

    const saldoAnterior = await pool.query(
      `SELECT moneda,
        COALESCE(SUM(CASE
          WHEN tipo = 'COBRO_CLIENTE' AND id_tarjeta_cliente IS NULL THEN monto
          WHEN tipo = 'PAGO_PROVEEDOR' AND id_tarjeta_cliente IS NULL THEN -monto
          WHEN tipo = 'INGRESO_GENERAL' THEN monto
          WHEN tipo = 'EGRESO_GENERAL' THEN -monto
          WHEN tipo = 'CONVERSION' THEN monto
          WHEN tipo = 'AJUSTE_TARJETA' THEN monto
          ELSE 0
        END), 0) AS saldo
       FROM pagos
       WHERE empresa_nombre = $1 AND fecha < $2 AND anulado = FALSE
       GROUP BY moneda`,
      [empresa, inicioMes]
    );

    // Movimientos del mes
    const movimientosMes = await pool.query(
      `SELECT moneda, tipo,
        COUNT(*) AS cantidad,
        COALESCE(SUM(monto), 0) AS total
       FROM pagos
       WHERE empresa_nombre = $1 AND fecha >= $2 AND fecha < $3 AND anulado = FALSE
       GROUP BY moneda, tipo
       ORDER BY moneda, tipo`,
      [empresa, inicioMes, finMes]
    );

    // Rentabilidad: ganancia por reservas del mes
    const rentabilidad = await pool.query(
      `SELECT moneda,
        SUM(precio_cliente) AS total_venta,
        SUM(costo_proveedor) AS total_costo,
        SUM(precio_cliente - costo_proveedor) AS ganancia
       FROM reserva_servicios_detallados s
       JOIN reservas r ON s.id_reserva = r.id
       WHERE r.empresa_nombre = $1 AND r.fecha_creacion >= $2 AND r.fecha_creacion < $3
         AND r.estado_eliminado = FALSE
       GROUP BY moneda`,
      [empresa, inicioMes, finMes]
    );

    res.json({
      mes, anio,
      saldo_anterior: saldoAnterior.rows,
      movimientos: movimientosMes.rows,
      rentabilidad: rentabilidad.rows
    });
  } catch (err) {
    console.error('❌ Error cierre mensual:', err);
    res.status(500).json({ error: 'Error al generar cierre mensual' });
  }
});

module.exports = router;
