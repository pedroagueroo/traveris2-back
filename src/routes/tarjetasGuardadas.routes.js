const express = require('express');
const router = express.Router();
const pool = require('../db');

const ENCRYPT_KEY = process.env.TARJETAS_ENCRYPT_KEY || 'traveris_vault_key_cambiar_en_prod';

router.get('/', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      `SELECT id, empresa_nombre, alias, nro_tarjeta, banco, vencimiento,
              -- Devolver solo últimos 4 dígitos del número completo, nunca el full
              RIGHT(
                pgp_sym_decrypt(nro_tarjeta_completo::bytea, $2)::text, 
                4
              ) AS ultimos_4,
              created_at
       FROM tarjetas_guardadas
       WHERE empresa_nombre = $1
       ORDER BY alias ASC`,
      [empresa, ENCRYPT_KEY]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando tarjetas guardadas:', err);
    res.status(500).json({ error: 'Error al listar tarjetas' });
  }
});

router.post('/', async (req, res) => {
  const { alias, nro_tarjeta_completo, banco, vencimiento } = req.body;
  const empresa = req.usuario.empresa_nombre;

  if (!alias || !nro_tarjeta_completo) {
    return res.status(400).json({ error: 'alias y nro_tarjeta_completo son requeridos' });
  }

  // Validar que sea numérico y entre 13-19 dígitos
  const limpio = nro_tarjeta_completo.replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(limpio)) {
    return res.status(400).json({ error: 'Número de tarjeta inválido' });
  }

  try {
    // Verificar que no exista ya con ese alias
    const existe = await pool.query(
      'SELECT id FROM tarjetas_guardadas WHERE empresa_nombre = $1 AND alias = $2',
      [empresa, alias]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe una tarjeta con ese alias' });
    }

    const nro_mask = limpio.substring(0, 4) + ' **** **** ' + limpio.slice(-4);

    const result = await pool.query(
      `INSERT INTO tarjetas_guardadas
         (empresa_nombre, alias, nro_tarjeta_completo, nro_tarjeta, banco, vencimiento)
       VALUES (
         $1, $2,
         pgp_sym_encrypt($3, $4),
         $5, $6, $7
       )
       RETURNING id, alias, nro_tarjeta, banco, vencimiento, created_at`,
      [empresa, alias, limpio, ENCRYPT_KEY, nro_mask, banco || null, vencimiento || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error guardando tarjeta:', err);
    res.status(500).json({ error: 'Error al guardar tarjeta' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    await pool.query(
      'DELETE FROM tarjetas_guardadas WHERE id = $1 AND empresa_nombre = $2',
      [parseInt(req.params.id, 10), empresa]
    );
    res.json({ mensaje: 'Tarjeta eliminada' });
  } catch (err) {
    console.error('❌ Error eliminando tarjeta:', err);
    res.status(500).json({ error: 'Error al eliminar tarjeta' });
  }
});

module.exports = router;
