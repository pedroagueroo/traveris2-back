// ============================================================================
// METODOS PAGO ROUTES — CRUD filtrado por moneda y empresa
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { z } = require('zod');

const metodoSchema = z.object({
  nombre: z.string().min(1).max(50),
  moneda: z.enum(['ARS', 'USD', 'EUR']),
  tipo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'])
});

// GET /api/metodos-pago/:moneda — Filtrados por moneda
router.get('/:moneda', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const moneda = req.params.moneda.toUpperCase();

    if (!['ARS', 'USD', 'EUR'].includes(moneda)) {
      return res.status(400).json({ error: 'Moneda inválida' });
    }

    const result = await pool.query(
      'SELECT * FROM metodos_pago WHERE empresa_nombre = $1 AND moneda = $2 AND activo = TRUE ORDER BY nombre ASC',
      [empresa, moneda]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando métodos:', err);
    res.status(500).json({ error: 'Error al listar métodos de pago' });
  }
});

// GET /api/metodos-pago — Todos (para admin)
router.get('/', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      'SELECT * FROM metodos_pago WHERE empresa_nombre = $1 ORDER BY moneda, nombre ASC',
      [empresa]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando todos los métodos:', err);
    res.status(500).json({ error: 'Error al listar métodos de pago' });
  }
});

// POST /api/metodos-pago — Agregar nuevo
router.post('/', async (req, res) => {
  const parsed = metodoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const empresa = req.usuario.empresa_nombre;
  const { nombre, moneda, tipo } = parsed.data;

  try {
    const result = await pool.query(
      `INSERT INTO metodos_pago (nombre, moneda, tipo, empresa_nombre)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre, moneda, tipo, empresa]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error creando método:', err);
    res.status(500).json({ error: 'Error al crear método de pago' });
  }
});

// PUT /api/metodos-pago/:id/toggle — Activar/desactivar
router.put('/:id/toggle', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      `UPDATE metodos_pago SET activo = NOT activo WHERE id = $1 AND empresa_nombre = $2 RETURNING *`,
      [parseInt(req.params.id, 10), empresa]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Método no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error toggling método:', err);
    res.status(500).json({ error: 'Error al modificar método de pago' });
  }
});

module.exports = router;
