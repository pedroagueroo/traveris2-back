// ============================================================================
// PROVEEDORES ROUTES — CRUD sin DDL en runtime
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { proveedorSchema, proveedorUpdateSchema } = require('../validators/proveedores.schema');

// GET /api/proveedores
router.get('/', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'SELECT * FROM proveedores WHERE empresa_nombre = $1 ORDER BY nombre_comercial ASC',
      [empresa]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando proveedores:', err);
    res.status(500).json({ error: 'Error al listar proveedores' });
  }
});

// GET /api/proveedores/:id
router.get('/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'SELECT * FROM proveedores WHERE id = $1 AND empresa_nombre = $2',
      [parseInt(req.params.id, 10), empresa]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error obteniendo proveedor:', err);
    res.status(500).json({ error: 'Error al obtener proveedor' });
  }
});

// POST /api/proveedores
router.post('/', async (req, res) => {
  const parsed = proveedorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const empresa = req.usuario.empresa_nombre;

  try {
    const result = await pool.query(
      `INSERT INTO proveedores (empresa_nombre, nombre_comercial, razon_social_cuit, contacto, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [empresa, data.nombre_comercial, data.razon_social_cuit, data.contacto, data.email]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error creando proveedor:', err);
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

// PUT /api/proveedores/:id
router.put('/:id', async (req, res) => {
  const parsed = proveedorUpdateSchema.safeParse(req.body);
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
      `UPDATE proveedores SET ${sets.join(', ')} WHERE id = $${campos.length + 1} AND empresa_nombre = $${campos.length + 2} RETURNING *`,
      [...values, parseInt(req.params.id, 10), empresa]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error actualizando proveedor:', err);
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

// DELETE /api/proveedores/:id
router.delete('/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'DELETE FROM proveedores WHERE id = $1 AND empresa_nombre = $2 RETURNING id',
      [parseInt(req.params.id, 10), empresa]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    res.json({ mensaje: 'Proveedor eliminado' });
  } catch (err) {
    console.error('❌ Error eliminando proveedor:', err);
    if (err.code === '23503') {
      return res.status(400).json({ error: 'No se puede eliminar: el proveedor tiene servicios asociados' });
    }
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

module.exports = router;
