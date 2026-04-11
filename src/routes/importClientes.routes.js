// ============================================================================
// IMPORT CLIENTES ROUTES — Importación desde Excel
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const XLSX = require('xlsx');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo archivos Excel (.xlsx, .xls) o CSV'));
    }
  }
});

// POST /api/import-clientes/preview — Previsualizar datos del Excel
router.post('/preview', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // Mapear columnas esperadas
    const clientes = data.map((row, index) => ({
      fila: index + 2,
      nombre_completo: String(row['Nombre Completo'] || row['nombre_completo'] || row['Nombre'] || '').trim(),
      dni_pasaporte: String(row['DNI'] || row['dni_pasaporte'] || row['Documento'] || '').trim(),
      email: String(row['Email'] || row['email'] || row['E-mail'] || '').trim(),
      telefono: String(row['Teléfono'] || row['telefono'] || row['Tel'] || '').trim(),
      fecha_nacimiento: row['Fecha Nacimiento'] || row['fecha_nacimiento'] || null,
      nacionalidad: String(row['Nacionalidad'] || row['nacionalidad'] || '').trim(),
      sexo: String(row['Sexo'] || row['sexo'] || '').trim(),
      valido: true,
      errores: []
    }));

    // Validar
    for (const c of clientes) {
      if (!c.nombre_completo) {
        c.valido = false;
        c.errores.push('Nombre completo es requerido');
      }
    }

    const validos = clientes.filter(c => c.valido).length;
    const invalidos = clientes.filter(c => !c.valido).length;

    res.json({ clientes, validos, invalidos, total: clientes.length });
  } catch (err) {
    console.error('❌ Error preview importación:', err);
    res.status(500).json({ error: 'Error al procesar archivo' });
  }
});

// POST /api/import-clientes/confirmar — Importar clientes confirmados
router.post('/confirmar', async (req, res) => {
  const { clientes } = req.body;
  const empresa = req.usuario.empresa_nombre;

  if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
    return res.status(400).json({ error: 'No hay clientes para importar' });
  }

  let importados = 0;
  let errores = 0;
  const detalleErrores = [];

  for (const c of clientes) {
    try {
      await pool.query(
        `INSERT INTO clientes (nombre_completo, dni_pasaporte, email, telefono,
          fecha_nacimiento, nacionalidad, sexo, empresa_nombre)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [c.nombre_completo, c.dni_pasaporte || null, c.email || null,
         c.telefono || null, c.fecha_nacimiento || null,
         c.nacionalidad || null, c.sexo || null, empresa]
      );
      importados++;
    } catch (err) {
      errores++;
      detalleErrores.push({ nombre: c.nombre_completo, error: err.message });
    }
  }

  res.json({ importados, errores, detalleErrores });
});

module.exports = router;
