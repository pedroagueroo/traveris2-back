// ============================================================================
// RESERVAS ROUTES — CRUD con paginación + pasajeros + vuelos + archivos
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { crearUpload } = require('../s3.config');
const { reservaSchema, reservaUpdateSchema } = require('../validators/reservas.schema');

const uploadArchivos = crearUpload('reservas');

// GET /api/reservas — Lista con paginación y filtros
router.get('/', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const busqueda = req.query.busqueda || '';
    const estado = req.query.estado || '';

    let whereClause = 'WHERE r.empresa_nombre = $1 AND r.estado_eliminado = FALSE';
    const params = [empresa];
    let paramIdx = 2;

    if (busqueda) {
      whereClause += ` AND (c.nombre_completo ILIKE $${paramIdx} OR r.destino_final ILIKE $${paramIdx} OR r.nro_expediente_operador ILIKE $${paramIdx})`;
      params.push(`%${busqueda}%`);
      paramIdx++;
    }

    if (estado) {
      whereClause += ` AND r.estado = $${paramIdx}`;
      params.push(estado);
      paramIdx++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM reservas r JOIN clientes c ON r.id_titular = c.id ${whereClause}`,
      params
    );

    const result = await pool.query(
      `SELECT r.*, c.nombre_completo AS titular_nombre, c.dni_pasaporte AS titular_dni
       FROM reservas r
       JOIN clientes c ON r.id_titular = c.id
       ${whereClause}
       ORDER BY r.fecha_creacion DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit)
    });
  } catch (err) {
    console.error('❌ Error listando reservas:', err);
    res.status(500).json({ error: 'Error al listar reservas' });
  }
});

// GET /api/reservas/proximos-vencimientos — Reservas con fecha límite próxima
// ⚠️ MUST be before /:id to prevent Express from matching 'proximos-vencimientos' as an :id
router.get('/proximos-vencimientos', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      `SELECT r.*, c.nombre_completo AS titular_nombre
       FROM reservas r
       JOIN clientes c ON r.id_titular = c.id
       WHERE r.empresa_nombre = $1 AND r.estado_eliminado = FALSE
         AND r.estado = 'ABIERTO'
         AND r.fecha_limite_pago IS NOT NULL
         AND r.fecha_limite_pago <= CURRENT_DATE + INTERVAL '7 days'
       ORDER BY r.fecha_limite_pago ASC`,
      [empresa]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error obteniendo vencimientos:', err);
    res.status(500).json({ error: 'Error al obtener vencimientos' });
  }
});

// GET /api/reservas/cliente/:idCliente — Reservas de un cliente
router.get('/cliente/:idCliente', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      `SELECT r.*, c.nombre_completo AS titular_nombre
       FROM reservas r
       JOIN clientes c ON r.id_titular = c.id
       WHERE r.empresa_nombre = $1 AND r.estado_eliminado = FALSE
         AND (r.id_titular = $2 OR r.id IN (
           SELECT id_reserva FROM reserva_pasajeros WHERE id_cliente = $2
         ))
       ORDER BY r.fecha_creacion DESC`,
      [empresa, parseInt(req.params.idCliente, 10)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando reservas del cliente:', err);
    res.status(500).json({ error: 'Error al listar reservas del cliente' });
  }
});

// GET /api/reservas/:id — Detalle completo
router.get('/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const id = parseInt(req.params.id, 10);

    // Reserva + titular
    const reserva = await pool.query(
      `SELECT r.*, c.nombre_completo AS titular_nombre, c.dni_pasaporte AS titular_dni,
              c.email AS titular_email, c.telefono AS titular_telefono
       FROM reservas r
       JOIN clientes c ON r.id_titular = c.id
       WHERE r.id = $1 AND r.empresa_nombre = $2`,
      [id, empresa]
    );

    if (reserva.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // Pasajeros
    const pasajeros = await pool.query(
      `SELECT rp.*, c.nombre_completo, c.dni_pasaporte, c.email, c.telefono, c.fecha_nacimiento, c.sexo
       FROM reserva_pasajeros rp
       JOIN clientes c ON rp.id_cliente = c.id
       WHERE rp.id_reserva = $1
       ORDER BY rp.es_titular DESC, c.nombre_completo ASC`,
      [id]
    );

    // Vuelos
    const vuelos = await pool.query(
      'SELECT * FROM reserva_vuelos WHERE id_reserva = $1 ORDER BY fecha_salida ASC',
      [id]
    );

    // Servicios con proveedor
    const servicios = await pool.query(
      `SELECT s.*, p.nombre_comercial AS proveedor_nombre
       FROM reserva_servicios_detallados s
       LEFT JOIN proveedores p ON s.id_proveedor = p.id
       WHERE s.id_reserva = $1
       ORDER BY s.created_at ASC`,
      [id]
    );

    // Archivos
    const archivos = await pool.query(
      'SELECT * FROM reserva_archivos WHERE id_reserva = $1 ORDER BY fecha_subida DESC',
      [id]
    );

    // Tarjetas (todas las de la empresa con saldo a favor)
    const tarjetas = await pool.query(
      `SELECT tc.*, prov.nombre_comercial AS proveedor_vinculado_nombre
       FROM tarjetas_clientes tc
       LEFT JOIN proveedores prov ON tc.id_proveedor_vinculado = prov.id
       WHERE tc.empresa_nombre = $1 AND tc.estado = 'ACTIVA' AND tc.monto_disponible > 0
       ORDER BY tc.fecha_cobro DESC`,
      [empresa]
    );

    res.json({
      ...reserva.rows[0],
      pasajeros: pasajeros.rows,
      vuelos: vuelos.rows,
      servicios: servicios.rows,
      archivos: archivos.rows,
      tarjetas: tarjetas.rows
    });
  } catch (err) {
    console.error('❌ Error obteniendo reserva:', err);
    res.status(500).json({ error: 'Error al obtener reserva' });
  }
});

// POST /api/reservas — Crear reserva con pasajeros y vuelos
router.post('/', async (req, res) => {
  // Convert empty strings to null
  const body = { ...req.body };
  for (const key of Object.keys(body)) {
    if (body[key] === '' || body[key] === undefined) body[key] = null;
  }
  const parsed = reservaSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const empresa = req.usuario.empresa_nombre;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insertar reserva
    const reserva = await client.query(
      `INSERT INTO reservas (id_titular, destino_final, fecha_viaje_salida, fecha_viaje_regreso,
        operador_mayorista, nro_expediente_operador, empresa_nombre, observaciones_internas,
        estado, fecha_limite_pago)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [data.id_titular, data.destino_final || null, data.fecha_viaje_salida || null, data.fecha_viaje_regreso || null,
       data.operador_mayorista || null, data.nro_expediente_operador || null, empresa,
       data.observaciones_internas || null, data.estado || 'ABIERTO', data.fecha_limite_pago || null]
    );

    const idReserva = reserva.rows[0].id;

    // 2. Insertar pasajeros
    if (data.pasajeros && data.pasajeros.length > 0) {
      for (const p of data.pasajeros) {
        await client.query(
          `INSERT INTO reserva_pasajeros (id_reserva, id_cliente, es_titular)
           VALUES ($1, $2, $3)`,
          [idReserva, p.id_cliente, p.es_titular || false]
        );
      }
    }

    // Siempre agregar titular como pasajero si no está en la lista
    const titularEnLista = data.pasajeros?.some(p => p.id_cliente === data.id_titular);
    if (!titularEnLista) {
      await client.query(
        `INSERT INTO reserva_pasajeros (id_reserva, id_cliente, es_titular)
         VALUES ($1, $2, TRUE)`,
        [idReserva, data.id_titular]
      );
    }

    // 3. Insertar vuelos
    if (data.vuelos && data.vuelos.length > 0) {
      for (const v of data.vuelos) {
        await client.query(
          `INSERT INTO reserva_vuelos (id_reserva, aerolinea, nro_vuelo, origen, destino,
            fecha_salida, fecha_llegada, clase, codigo_reserva, observaciones)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [idReserva, v.aerolinea, v.nro_vuelo, v.origen, v.destino,
           v.fecha_salida, v.fecha_llegada, v.clase, v.codigo_reserva, v.observaciones]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(reserva.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error creando reserva:', err);
    res.status(500).json({ error: 'Error al crear reserva', detalle: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/reservas/:id — Actualizar reserva (in-place, no destructivo)
router.put('/:id', async (req, res) => {
  // Convert empty strings to null
  const body = { ...req.body };
  for (const key of Object.keys(body)) {
    if (typeof body[key] === 'string' && body[key].trim() === '') body[key] = null;
  }
  const parsed = reservaUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const empresa = req.usuario.empresa_nombre;
  const id = parseInt(req.params.id, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Actualizar campos de la reserva
    const camposReserva = ['id_titular', 'destino_final', 'fecha_viaje_salida', 'fecha_viaje_regreso',
      'operador_mayorista', 'nro_expediente_operador', 'observaciones_internas', 'estado', 'fecha_limite_pago'];

    const updates = [];
    const values = [];
    let idx = 1;

    for (const campo of camposReserva) {
      if (data[campo] !== undefined) {
        updates.push(`${campo} = $${idx++}`);
        values.push(data[campo]);
      }
    }

    if (updates.length > 0) {
      values.push(id, empresa);
      const result = await client.query(
        `UPDATE reservas SET ${updates.join(', ')} WHERE id = $${idx} AND empresa_nombre = $${idx + 1} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Reserva no encontrada' });
      }
    }

    // Actualizar pasajeros (si vienen)
    if (data.pasajeros !== undefined) {
      // Eliminar pasajeros actuales y reinsertar
      await client.query('DELETE FROM reserva_pasajeros WHERE id_reserva = $1', [id]);
      for (const p of data.pasajeros) {
        await client.query(
          'INSERT INTO reserva_pasajeros (id_reserva, id_cliente, es_titular) VALUES ($1, $2, $3)',
          [id, p.id_cliente, p.es_titular || false]
        );
      }
    }

    // Actualizar vuelos (si vienen) — se reinsertan porque no tienen deudas vinculadas
    if (data.vuelos !== undefined) {
      await client.query('DELETE FROM reserva_vuelos WHERE id_reserva = $1', [id]);
      for (const v of data.vuelos) {
        await client.query(
          `INSERT INTO reserva_vuelos (id_reserva, aerolinea, nro_vuelo, origen, destino,
            fecha_salida, fecha_llegada, clase, codigo_reserva, observaciones)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, v.aerolinea, v.nro_vuelo, v.origen, v.destino,
           v.fecha_salida, v.fecha_llegada, v.clase, v.codigo_reserva, v.observaciones]
        );
      }
    }

    await client.query('COMMIT');

    // Devolver reserva actualizada
    const reservaFinal = await pool.query(
      `SELECT r.*, c.nombre_completo AS titular_nombre FROM reservas r
       JOIN clientes c ON r.id_titular = c.id WHERE r.id = $1`,
      [id]
    );

    res.json(reservaFinal.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error actualizando reserva:', err);
    res.status(500).json({ error: 'Error al actualizar reserva' });
  } finally {
    client.release();
  }
});

// DELETE /api/reservas/todos — Soft delete all
router.delete('/todos', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'UPDATE reservas SET estado_eliminado = TRUE WHERE empresa_nombre = $1 AND estado_eliminado = FALSE RETURNING id',
      [empresa]
    );
    res.json({ mensaje: `${result.rowCount} reservas eliminadas` });
  } catch (err) {
    console.error('❌ Error eliminando todas las reservas:', err);
    res.status(500).json({ error: 'Error al eliminar reservas' });
  }
});

// DELETE /api/reservas/:id — Soft delete
router.delete('/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'UPDATE reservas SET estado_eliminado = TRUE WHERE id = $1 AND empresa_nombre = $2 RETURNING id',
      [parseInt(req.params.id, 10), empresa]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    res.json({ mensaje: 'Reserva eliminada' });
  } catch (err) {
    console.error('❌ Error eliminando reserva:', err);
    res.status(500).json({ error: 'Error al eliminar reserva' });
  }
});

// POST /api/reservas/:id/archivos — Upload archivo
router.post('/:id/archivos', uploadArchivos.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }

    // Support both S3 (location/key) and local (path/filename) storage
    const rutaArchivo = req.file.location || req.file.key || `/uploads/reservas/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO reserva_archivos (id_reserva, nombre_archivo, ruta_archivo, tipo_archivo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [parseInt(req.params.id, 10), req.file.originalname, rutaArchivo, req.file.mimetype]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error subiendo archivo de reserva:', err);
    res.status(500).json({ error: 'Error al subir archivo', detalle: err.message });
  }
});

module.exports = router;
