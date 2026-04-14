// ============================================================================
// SERVICIOS ROUTES — CRUD con generación automática de deudas
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { servicioSchema, servicioUpdateSchema } = require('../validators/servicios.schema');

// GET /api/servicios/reserva/:id — Servicios de una reserva
router.get('/reserva/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, p.nombre_comercial AS proveedor_nombre
       FROM reserva_servicios_detallados s
       LEFT JOIN proveedores p ON s.id_proveedor = p.id
       WHERE s.id_reserva = $1
       ORDER BY s.created_at ASC`,
      [parseInt(req.params.id, 10)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando servicios:', err);
    res.status(500).json({ error: 'Error al listar servicios' });
  }
});

// POST /api/servicios — Crear servicio + 2 deudas (transacción atómica)
router.post('/', async (req, res) => {
  // Convert empty strings to null for optional fields
  const body = { ...req.body };
  for (const key of Object.keys(body)) {
    if (body[key] === '' || body[key] === undefined) body[key] = null;
  }
  const parsed = servicioSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const empresa = req.usuario.empresa_nombre;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que la reserva existe y pertenece a la empresa
    const reserva = await client.query(
      'SELECT id FROM reservas WHERE id = $1 AND empresa_nombre = $2 AND estado_eliminado = FALSE',
      [data.id_reserva, empresa]
    );
    if (reserva.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // 1. INSERT servicio
    const servicio = await client.query(
      `INSERT INTO reserva_servicios_detallados (
        id_reserva, tipo_servicio, descripcion,
        hotel_nombre, hotel_ciudad, hotel_check_in, hotel_check_out,
        hotel_regimen, hotel_noches, hotel_categoria,
        vuelo_aerolinea, vuelo_nro, vuelo_origen, vuelo_destino,
        vuelo_fecha_salida, vuelo_fecha_llegada, vuelo_clase, vuelo_codigo_reserva,
        asistencia_compania, asistencia_plan, asistencia_fecha_desde,
        asistencia_fecha_hasta, asistencia_cobertura,
        visa_pais, visa_tipo, visa_fecha_tramite, visa_nro_tramite,
        crucero_naviera, crucero_barco, crucero_itinerario, crucero_cabina,
        crucero_fecha_embarque, crucero_fecha_desembarque,
        id_proveedor, moneda, precio_cliente, costo_proveedor
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
      ) RETURNING *`,
      [
        data.id_reserva, data.tipo_servicio, data.descripcion,
        data.hotel_nombre, data.hotel_ciudad, data.hotel_check_in, data.hotel_check_out,
        data.hotel_regimen, data.hotel_noches, data.hotel_categoria,
        data.vuelo_aerolinea, data.vuelo_nro, data.vuelo_origen, data.vuelo_destino,
        data.vuelo_fecha_salida, data.vuelo_fecha_llegada, data.vuelo_clase, data.vuelo_codigo_reserva,
        data.asistencia_compania, data.asistencia_plan, data.asistencia_fecha_desde,
        data.asistencia_fecha_hasta, data.asistencia_cobertura,
        data.visa_pais, data.visa_tipo, data.visa_fecha_tramite, data.visa_nro_tramite,
        data.crucero_naviera, data.crucero_barco, data.crucero_itinerario, data.crucero_cabina,
        data.crucero_fecha_embarque, data.crucero_fecha_desembarque,
        data.id_proveedor, data.moneda, data.precio_cliente, data.costo_proveedor
      ]
    );

    const idServicio = servicio.rows[0].id;

    // 2. INSERT deuda CLIENTE (lo que el cliente debe a la agencia)
    await client.query(
      `INSERT INTO deudas_servicio (id_servicio, id_reserva, id_proveedor, tipo, moneda, monto_total, empresa_nombre)
       VALUES ($1, $2, $3, 'CLIENTE', $4, $5, $6)`,
      [idServicio, data.id_reserva, data.id_proveedor, data.moneda, data.precio_cliente, empresa]
    );

    // 3. INSERT deuda PROVEEDOR (lo que la agencia debe al proveedor)
    await client.query(
      `INSERT INTO deudas_servicio (id_servicio, id_reserva, id_proveedor, tipo, moneda, monto_total, empresa_nombre)
       VALUES ($1, $2, $3, 'PROVEEDOR', $4, $5, $6)`,
      [idServicio, data.id_reserva, data.id_proveedor, data.moneda, data.costo_proveedor, empresa]
    );

    await client.query('COMMIT');

    // Enriquecer respuesta con nombre de proveedor
    let proveedorNombre = null;
    if (data.id_proveedor) {
      const prov = await pool.query('SELECT nombre_comercial FROM proveedores WHERE id = $1', [data.id_proveedor]);
      proveedorNombre = prov.rows[0]?.nombre_comercial || null;
    }

    res.status(201).json({
      ...servicio.rows[0],
      proveedor_nombre: proveedorNombre
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error creando servicio:', err);
    res.status(500).json({ error: 'Error al crear servicio' });
  } finally {
    client.release();
  }
});

// PUT /api/servicios/:id — Actualizar servicio + ajustar deudas
router.put('/:id', async (req, res) => {
  // Convert empty strings to null for optional fields
  const body = { ...req.body };
  for (const key of Object.keys(body)) {
    if (body[key] === '' || body[key] === undefined) body[key] = null;
  }
  const parsed = servicioUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const empresa = req.usuario.empresa_nombre;
  const id = parseInt(req.params.id, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar servicio existente
    const existente = await client.query(
      `SELECT s.* FROM reserva_servicios_detallados s
       JOIN reservas r ON s.id_reserva = r.id
       WHERE s.id = $1 AND r.empresa_nombre = $2`,
      [id, empresa]
    );

    if (existente.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    // Construir SET dinámico (excluir id_reserva)
    const camposPermitidos = Object.keys(data).filter(k => k !== 'id_reserva' && data[k] !== undefined);
    if (camposPermitidos.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    const sets = camposPermitidos.map((c, i) => `${c} = $${i + 1}`);
    const values = camposPermitidos.map(c => data[c]);

    await client.query(
      `UPDATE reserva_servicios_detallados SET ${sets.join(', ')} WHERE id = $${camposPermitidos.length + 1}`,
      [...values, id]
    );

    // Ajustar deudas si cambian los montos financieros
    if (data.precio_cliente !== undefined) {
      // Verificar si ya hay pagos
      const pagosCliente = await client.query(
        `SELECT COALESCE(SUM(monto_pagado), 0) AS pagado FROM deudas_servicio WHERE id_servicio = $1 AND tipo = 'CLIENTE'`,
        [id]
      );
      const pagado = parseFloat(pagosCliente.rows[0].pagado);

      if (data.precio_cliente < pagado) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `No se puede reducir precio_cliente a ${data.precio_cliente} porque ya se pagaron ${pagado}`,
          warning: true
        });
      }

      await client.query(
        `UPDATE deudas_servicio SET monto_total = $1 WHERE id_servicio = $2 AND tipo = 'CLIENTE'`,
        [data.precio_cliente, id]
      );
    }

    if (data.costo_proveedor !== undefined) {
      const pagosProveedor = await client.query(
        `SELECT COALESCE(SUM(monto_pagado), 0) AS pagado FROM deudas_servicio WHERE id_servicio = $1 AND tipo = 'PROVEEDOR'`,
        [id]
      );
      const pagado = parseFloat(pagosProveedor.rows[0].pagado);

      if (data.costo_proveedor < pagado) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `No se puede reducir costo_proveedor a ${data.costo_proveedor} porque ya se pagaron ${pagado}`,
          warning: true
        });
      }

      await client.query(
        `UPDATE deudas_servicio SET monto_total = $1 WHERE id_servicio = $2 AND tipo = 'PROVEEDOR'`,
        [data.costo_proveedor, id]
      );
    }

    // Si se cambia moneda, actualizar deudas también
    if (data.moneda !== undefined) {
      await client.query(
        `UPDATE deudas_servicio SET moneda = $1 WHERE id_servicio = $2`,
        [data.moneda, id]
      );
    }

    // Si se cambia proveedor, actualizar deudas
    if (data.id_proveedor !== undefined) {
      await client.query(
        `UPDATE deudas_servicio SET id_proveedor = $1 WHERE id_servicio = $2`,
        [data.id_proveedor, id]
      );
    }

    await client.query('COMMIT');

    const updated = await pool.query(
      `SELECT s.*, p.nombre_comercial AS proveedor_nombre
       FROM reserva_servicios_detallados s
       LEFT JOIN proveedores p ON s.id_proveedor = p.id
       WHERE s.id = $1`,
      [id]
    );

    res.json(updated.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error actualizando servicio:', err);
    res.status(500).json({ error: 'Error al actualizar servicio' });
  } finally {
    client.release();
  }
});

// DELETE /api/servicios/:id — Solo si no hay pagos vinculados
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const empresa = req.usuario.empresa_nombre;

  try {
    // Verificar pagos
    const pagos = await pool.query(
      `SELECT COUNT(*) FROM pagos WHERE id_servicio = $1 AND anulado = FALSE`,
      [id]
    );

    if (parseInt(pagos.rows[0].count, 10) > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar el servicio porque tiene pagos vinculados. Anule los pagos primero.'
      });
    }

    // Verificar propiedad
    const servicio = await pool.query(
      `SELECT s.id FROM reserva_servicios_detallados s
       JOIN reservas r ON s.id_reserva = r.id
       WHERE s.id = $1 AND r.empresa_nombre = $2`,
      [id, empresa]
    );

    if (servicio.rows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    // CASCADE elimina deudas_servicio automáticamente
    await pool.query('DELETE FROM reserva_servicios_detallados WHERE id = $1', [id]);

    res.json({ mensaje: 'Servicio eliminado' });
  } catch (err) {
    console.error('❌ Error eliminando servicio:', err);
    res.status(500).json({ error: 'Error al eliminar servicio' });
  }
});

module.exports = router;
