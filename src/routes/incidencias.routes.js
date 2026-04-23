const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/incidencias/reserva/:id
router.get('/reserva/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM reserva_incidencias 
       WHERE id_reserva = $1 
       ORDER BY fecha_incidencia DESC`,
      [parseInt(req.params.id, 10)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando incidencias:', err);
    res.status(500).json({ error: 'Error al listar incidencias' });
  }
});

// POST /api/incidencias
router.post('/', async (req, res) => {
  const { id_reserva, descripcion, estado_gestion } = req.body;
  if (!id_reserva || !descripcion) {
    return res.status(400).json({ error: 'id_reserva y descripcion son requeridos' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO reserva_incidencias 
         (id_reserva, fecha_incidencia, descripcion, estado_gestion)
       VALUES ($1, NOW(), $2, $3)
       RETURNING *`,
      [id_reserva, descripcion, estado_gestion || 'PENDIENTE']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error creando incidencia:', err);
    res.status(500).json({ error: 'Error al crear incidencia' });
  }
});

// PUT /api/incidencias/:id
router.put('/:id', async (req, res) => {
  const { descripcion, estado_gestion } = req.body;
  try {
    const result = await pool.query(
      `UPDATE reserva_incidencias 
       SET descripcion = COALESCE($1, descripcion),
           estado_gestion = COALESCE($2, estado_gestion)
       WHERE id = $3
       RETURNING *`,
      [descripcion, estado_gestion, parseInt(req.params.id, 10)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error actualizando incidencia:', err);
    res.status(500).json({ error: 'Error al actualizar incidencia' });
  }
});

// DELETE /api/incidencias/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM reserva_incidencias WHERE id = $1',
      [parseInt(req.params.id, 10)]
    );
    res.json({ mensaje: 'Incidencia eliminada' });
  } catch (err) {
    console.error('❌ Error eliminando incidencia:', err);
    res.status(500).json({ error: 'Error al eliminar incidencia' });
  }
});

module.exports = router;
