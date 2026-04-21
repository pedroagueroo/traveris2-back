// ============================================================================
// ADMIN ROUTES — Panel de administración (ADMIN only)
// ============================================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db');
const { crearUpload } = require('../s3.config');
const { seedMetodosPago } = require('../seeds/metodosPagoSeed');
const {
  crearAgenciaSchema,
  actualizarAgenciaSchema,
  reciboConfigSchema,
  crearUsuarioSchema,
  actualizarUsuarioSchema
} = require('../validators/admin.schema');

const SALT_ROUNDS = 10;
const uploadLogo = crearUpload('logos');
const uploadBanner = crearUpload('banners');

// ─── AGENCIAS ────────────────────────────────────────────────────────────────

// GET /api/admin/agencias — Lista todas las agencias
router.get('/agencias', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ac.*,
        (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_nombre = ac.empresa_nombre AND u.activo = TRUE) AS total_usuarios
      FROM agencias_config ac
      ORDER BY ac.creada_en DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando agencias:', err);
    res.status(500).json({ error: 'Error al listar agencias' });
  }
});

// POST /api/admin/agencias — Crear agencia nueva
router.post('/agencias', async (req, res) => {
  const parsed = crearAgenciaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar si ya existe
    const existe = await client.query(
      'SELECT id FROM agencias_config WHERE empresa_nombre = $1',
      [data.empresa_nombre]
    );
    if (existe.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ya existe una agencia con ese nombre' });
    }

    // Insertar agencia
    const result = await client.query(
      `INSERT INTO agencias_config (empresa_nombre, nombre_comercial, titular, cuit_cuil,
        condicion_fiscal, domicilio, telefono, email, pagina_web, recibo_footer_legal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [data.empresa_nombre, data.nombre_comercial, data.titular, data.cuit_cuil,
       data.condicion_fiscal, data.domicilio, data.telefono, data.email,
       data.pagina_web, data.recibo_footer_legal]
    );

    // Seed métodos de pago
    await seedMetodosPago(data.empresa_nombre, client);

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error creando agencia:', err);
    res.status(500).json({ error: 'Error al crear agencia' });
  } finally {
    client.release();
  }
});

// GET /api/admin/agencias/:empresa — Config completa de una agencia
router.get('/agencias/:empresa', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM agencias_config WHERE empresa_nombre = $1',
      [req.params.empresa]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error obteniendo agencia:', err);
    res.status(500).json({ error: 'Error al obtener agencia' });
  }
});

// PUT /api/admin/agencias/:empresa — Actualizar datos
router.put('/agencias/:empresa', async (req, res) => {
  const parsed = actualizarAgenciaSchema.safeParse(req.body);
  if (!parsed.success) {
    console.error('❌ Validación agencia fallida:', JSON.stringify(parsed.error.errors));
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  // Filtrar solo campos que tienen valor definido (incluimos null para permitir borrar valores)
  const campos = Object.keys(data).filter(k => data[k] !== undefined);

  if (campos.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  // Convertir '' a null para campos opcionales
  const values = campos.map(c => {
    const v = data[c];
    return (v === '' ? null : v);
  });

  const sets = campos.map((c, i) => `${c} = $${i + 1}`);
  sets.push(`actualizada_en = CURRENT_TIMESTAMP`);

  try {
    const result = await pool.query(
      `UPDATE agencias_config SET ${sets.join(', ')} WHERE empresa_nombre = $${campos.length + 1} RETURNING *`,
      [...values, req.params.empresa]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error actualizando agencia:', err);
    res.status(500).json({ error: 'Error al actualizar agencia' });
  }
});

function valores_count(campos) {
  return campos.length + 1;
}

// POST /api/admin/agencias/:empresa/logo — Upload logo a S3
router.post('/agencias/:empresa/logo', (req, res, next) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error (logo):', err.message);
      return res.status(400).json({ error: 'Error al subir archivo: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }

    const logoUrl = req.file.location || req.file.key || req.file.filename;
    console.log('✅ Logo subido:', logoUrl);

    await pool.query(
      'UPDATE agencias_config SET logo_url = $1, actualizada_en = CURRENT_TIMESTAMP WHERE empresa_nombre = $2',
      [logoUrl, req.params.empresa]
    );

    res.json({ logo_url: logoUrl });
  } catch (err) {
    console.error('❌ Error subiendo logo:', err);
    res.status(500).json({ error: 'Error al subir logo' });
  }
});

// POST /api/admin/agencias/:empresa/banner — Upload banner de recibo a S3
router.post('/agencias/:empresa/banner', (req, res, next) => {
  uploadBanner.single('banner')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error (banner):', err.message);
      return res.status(400).json({ error: 'Error al subir archivo: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }

    const bannerUrl = req.file.location || req.file.key || req.file.filename;
    console.log('✅ Banner subido:', bannerUrl);

    await pool.query(
      'UPDATE agencias_config SET banner_url = $1, actualizada_en = CURRENT_TIMESTAMP WHERE empresa_nombre = $2',
      [bannerUrl, req.params.empresa]
    );

    res.json({ banner_url: bannerUrl });
  } catch (err) {
    console.error('❌ Error subiendo banner:', err);
    res.status(500).json({ error: 'Error al subir banner' });
  }
});

// PUT /api/admin/agencias/:empresa/recibo-config — Actualizar recibo_config JSONB
router.put('/agencias/:empresa/recibo-config', async (req, res) => {
  const parsed = reciboConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  try {
    // Merge con config existente
    const current = await pool.query(
      'SELECT recibo_config FROM agencias_config WHERE empresa_nombre = $1',
      [req.params.empresa]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }

    const merged = { ...current.rows[0].recibo_config, ...parsed.data };

    const result = await pool.query(
      'UPDATE agencias_config SET recibo_config = $1, actualizada_en = CURRENT_TIMESTAMP WHERE empresa_nombre = $2 RETURNING recibo_config',
      [JSON.stringify(merged), req.params.empresa]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error actualizando recibo config:', err);
    res.status(500).json({ error: 'Error al actualizar configuración de recibo' });
  }
});

// GET /api/admin/agencias/:empresa/recibo-preview — Preview HTML del recibo
router.get('/agencias/:empresa/recibo-preview', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM agencias_config WHERE empresa_nombre = $1',
      [req.params.empresa]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }
    // Devuelve la config para que el frontend renderice el preview
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error en recibo preview:', err);
    res.status(500).json({ error: 'Error al generar preview' });
  }
});

// ─── USUARIOS ────────────────────────────────────────────────────────────────

// GET /api/admin/usuarios — Lista usuarios (filtro por empresa opcional)
router.get('/usuarios', async (req, res) => {
  try {
    const { empresa } = req.query;
    let query = 'SELECT id, nombre_usuario, rol, empresa_nombre, activo, creado_en FROM usuarios';
    const params = [];

    if (empresa) {
      query += ' WHERE empresa_nombre = $1';
      params.push(empresa);
    }

    query += ' ORDER BY creado_en DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando usuarios:', err);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

// POST /api/admin/usuarios — Crear usuario
router.post('/usuarios', async (req, res) => {
  const parsed = crearUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const { nombre_usuario, password, rol, empresa_nombre } = parsed.data;

  // Si rol es EMPRESA, empresa_nombre es obligatorio
  if (rol === 'EMPRESA' && !empresa_nombre) {
    return res.status(400).json({ error: 'empresa_nombre es requerido para usuarios EMPRESA' });
  }

  // Validar que la agencia exista si es EMPRESA
  if (rol === 'EMPRESA' && empresa_nombre) {
    const agencia = await pool.query(
      'SELECT id FROM agencias_config WHERE empresa_nombre = $1',
      [empresa_nombre]
    );
    if (agencia.rows.length === 0) {
      return res.status(400).json({ error: 'La agencia especificada no existe' });
    }
  }

  try {
    // Verificar si ya existe
    const existe = await pool.query(
      'SELECT id FROM usuarios WHERE nombre_usuario = $1',
      [nombre_usuario]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO usuarios (nombre_usuario, password_hash, rol, empresa_nombre)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre_usuario, rol, empresa_nombre, activo, creado_en`,
      [nombre_usuario, hash, rol, rol === 'ADMIN' ? null : empresa_nombre]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error creando usuario:', err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/admin/usuarios/:id — Editar usuario / resetear password
router.put('/usuarios/:id', async (req, res) => {
  const parsed = actualizarUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const updates = [];
  const values = [];
  let idx = 1;

  if (data.nombre_usuario !== undefined) {
    updates.push(`nombre_usuario = $${idx++}`);
    values.push(data.nombre_usuario);
  }
  if (data.password !== undefined) {
    const hash = await bcrypt.hash(data.password, SALT_ROUNDS);
    updates.push(`password_hash = $${idx++}`);
    values.push(hash);
  }
  if (data.rol !== undefined) {
    updates.push(`rol = $${idx++}`);
    values.push(data.rol);
  }
  if (data.empresa_nombre !== undefined) {
    updates.push(`empresa_nombre = $${idx++}`);
    values.push(data.empresa_nombre);
  }
  if (data.activo !== undefined) {
    updates.push(`activo = $${idx++}`);
    values.push(data.activo);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  values.push(parseInt(req.params.id, 10));

  try {
    const result = await pool.query(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, nombre_usuario, rol, empresa_nombre, activo, creado_en`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error actualizando usuario:', err);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/admin/usuarios/:id — Baja lógica
router.delete('/usuarios/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE usuarios SET activo = FALSE WHERE id = $1
       RETURNING id, nombre_usuario, rol, empresa_nombre, activo`,
      [parseInt(req.params.id, 10)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ mensaje: 'Usuario desactivado', usuario: result.rows[0] });
  } catch (err) {
    console.error('❌ Error desactivando usuario:', err);
    res.status(500).json({ error: 'Error al desactivar usuario' });
  }
});

module.exports = router;
