const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/reserva/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM reserva_items_detalle 
       WHERE id_reserva = $1 
       ORDER BY fecha_servicio ASC`,
      [parseInt(req.params.id, 10)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando items:', err);
    res.status(500).json({ error: 'Error al listar vouchers' });
  }
});

router.post('/', async (req, res) => {
  const {
    id_reserva, tipo_item, nombre_item, detalles_servicio,
    fecha_servicio, proveedor_local, nro_poliza_o_voucher,
    telefono_soporte, contacto_local_nombre
  } = req.body;

  if (!id_reserva || !nombre_item) {
    return res.status(400).json({ error: 'id_reserva y nombre_item son requeridos' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO reserva_items_detalle
         (id_reserva, tipo_item, nombre_item, detalles_servicio,
          fecha_servicio, proveedor_local, nro_poliza_o_voucher,
          telefono_soporte, contacto_local_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        id_reserva,
        tipo_item || 'OTRO',
        nombre_item,
        detalles_servicio || null,
        fecha_servicio || null,
        proveedor_local || null,
        nro_poliza_o_voucher || null,
        telefono_soporte || null,
        contacto_local_nombre || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error creando item:', err);
    res.status(500).json({ error: 'Error al crear voucher' });
  }
});

router.put('/:id', async (req, res) => {
  const {
    tipo_item, nombre_item, detalles_servicio, fecha_servicio,
    proveedor_local, nro_poliza_o_voucher, telefono_soporte,
    contacto_local_nombre
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE reserva_items_detalle SET
         tipo_item             = COALESCE($1, tipo_item),
         nombre_item           = COALESCE($2, nombre_item),
         detalles_servicio     = COALESCE($3, detalles_servicio),
         fecha_servicio        = COALESCE($4, fecha_servicio),
         proveedor_local       = COALESCE($5, proveedor_local),
         nro_poliza_o_voucher  = COALESCE($6, nro_poliza_o_voucher),
         telefono_soporte      = COALESCE($7, telefono_soporte),
         contacto_local_nombre = COALESCE($8, contacto_local_nombre)
       WHERE id = $9
       RETURNING *`,
      [
        tipo_item, nombre_item, detalles_servicio, fecha_servicio,
        proveedor_local, nro_poliza_o_voucher, telefono_soporte,
        contacto_local_nombre, parseInt(req.params.id, 10)
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Voucher no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error actualizando item:', err);
    res.status(500).json({ error: 'Error al actualizar voucher' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM reserva_items_detalle WHERE id = $1',
      [parseInt(req.params.id, 10)]
    );
    res.json({ mensaje: 'Voucher eliminado' });
  } catch (err) {
    console.error('❌ Error eliminando item:', err);
    res.status(500).json({ error: 'Error al eliminar voucher' });
  }
});

module.exports = router;
