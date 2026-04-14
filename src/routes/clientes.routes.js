// ============================================================================
// CLIENTES ROUTES — CRUD con paginación server-side
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { crearUpload, eliminarDeS3 } = require('../s3.config');
const { clienteSchema, clienteUpdateSchema } = require('../validators/clientes.schema');

const uploadArchivos = crearUpload('clientes');

// GET /api/clientes — Lista con paginación y búsqueda
router.get('/', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const busqueda = req.query.busqueda || '';

    let whereClause = 'WHERE empresa_nombre = $1';
    const params = [empresa];

    if (busqueda) {
      whereClause += ` AND (nombre_completo ILIKE $2 OR dni_pasaporte ILIKE $2 OR email ILIKE $2)`;
      params.push(`%${busqueda}%`);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM clientes ${whereClause}`,
      params
    );

    const result = await pool.query(
      `SELECT * FROM clientes ${whereClause} ORDER BY nombre_completo ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
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
    console.error('❌ Error listando clientes:', err);
    res.status(500).json({ error: 'Error al listar clientes' });
  }
});

// GET /api/clientes/todos — Lista completa sin paginar (para selectores)
router.get('/todos', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'SELECT id, nombre_completo, dni_pasaporte, email, telefono FROM clientes WHERE empresa_nombre = $1 ORDER BY nombre_completo ASC',
      [empresa]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando todos los clientes:', err);
    res.status(500).json({ error: 'Error al listar clientes' });
  }
});

// GET /api/clientes/:id — Detalle
router.get('/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'SELECT * FROM clientes WHERE id = $1 AND empresa_nombre = $2',
      [parseInt(req.params.id, 10), empresa]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Obtener archivos
    const archivos = await pool.query(
      'SELECT * FROM cliente_archivos WHERE id_cliente = $1 ORDER BY fecha_subida DESC',
      [req.params.id]
    );

    res.json({ ...result.rows[0], archivos: archivos.rows });
  } catch (err) {
    console.error('❌ Error obteniendo cliente:', err);
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
});

// POST /api/clientes — Crear
router.post('/', async (req, res) => {
  const parsed = clienteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const empresa = req.usuario.empresa_nombre;

  try {
    const result = await pool.query(
      `INSERT INTO clientes (nombre_completo, dni_pasaporte, email, telefono, fecha_nacimiento,
        cuit_cuil, nacionalidad, pasaporte_nro, pasaporte_emision, pasaporte_vencimiento,
        sexo, pref_asiento, pref_comida, observaciones_salud, empresa_nombre, dni_emision, dni_vencimiento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [data.nombre_completo, data.dni_pasaporte, data.email, data.telefono, data.fecha_nacimiento,
       data.cuit_cuil, data.nacionalidad, data.pasaporte_nro, data.pasaporte_emision,
       data.pasaporte_vencimiento, data.sexo, data.pref_asiento, data.pref_comida,
       data.observaciones_salud, empresa, data.dni_emision, data.dni_vencimiento]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error creando cliente:', err);
    res.status(500).json({ error: 'Error al crear cliente' });
  }
});

// PUT /api/clientes/:id — Actualizar
router.put('/:id', async (req, res) => {
  const parsed = clienteUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const empresa = req.usuario.empresa_nombre;
  const campos = Object.keys(data).filter(k => data[k] !== undefined);

  if (campos.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  const sets = campos.map((c, i) => `${c} = $${i + 1}`);
  const values = campos.map(c => data[c]);

  try {
    const result = await pool.query(
      `UPDATE clientes SET ${sets.join(', ')} WHERE id = $${campos.length + 1} AND empresa_nombre = $${campos.length + 2} RETURNING *`,
      [...values, parseInt(req.params.id, 10), empresa]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error actualizando cliente:', err);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

// DELETE /api/clientes/todos — Eliminar todos los clientes
router.delete('/todos', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'DELETE FROM clientes WHERE empresa_nombre = $1 RETURNING id',
      [empresa]
    );
    res.json({ mensaje: `${result.rowCount} clientes eliminados` });
  } catch (err) {
    console.error('❌ Error eliminando todos los clientes:', err);
    if (err.code === '23503') {
      return res.status(400).json({ error: 'No se pueden eliminar: hay clientes con reservas asociadas. Elimine las reservas primero.' });
    }
    res.status(500).json({ error: 'Error al eliminar clientes' });
  }
});

// DELETE /api/clientes/:id
router.delete('/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'DELETE FROM clientes WHERE id = $1 AND empresa_nombre = $2 RETURNING id',
      [parseInt(req.params.id, 10), empresa]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({ mensaje: 'Cliente eliminado' });
  } catch (err) {
    console.error('❌ Error eliminando cliente:', err);
    if (err.code === '23503') {
      return res.status(400).json({ error: 'No se puede eliminar: el cliente tiene reservas asociadas' });
    }
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
});

// POST /api/clientes/:id/archivos — Upload archivo a S3
router.post('/:id/archivos', uploadArchivos.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }

    const result = await pool.query(
      `INSERT INTO cliente_archivos (id_cliente, nombre_archivo, ruta_archivo, tipo_archivo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [parseInt(req.params.id, 10), req.file.originalname, req.file.location || req.file.key, req.file.mimetype]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error subiendo archivo de cliente:', err);
    res.status(500).json({ error: 'Error al subir archivo' });
  }
});

// DELETE /api/clientes/:id/archivos/:archivoId
router.delete('/:id/archivos/:archivoId', async (req, res) => {
  try {
    const archivo = await pool.query(
      'SELECT * FROM cliente_archivos WHERE id = $1 AND id_cliente = $2',
      [parseInt(req.params.archivoId, 10), parseInt(req.params.id, 10)]
    );

    if (archivo.rows.length === 0) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    // Eliminar de S3
    const key = archivo.rows[0].ruta_archivo.replace(/^https?:\/\/[^/]+\//, '');
    await eliminarDeS3(key);

    // Eliminar de BD
    await pool.query('DELETE FROM cliente_archivos WHERE id = $1', [parseInt(req.params.archivoId, 10)]);

    res.json({ mensaje: 'Archivo eliminado' });
  } catch (err) {
    console.error('❌ Error eliminando archivo:', err);
    res.status(500).json({ error: 'Error al eliminar archivo' });
  }
});

module.exports = router;
