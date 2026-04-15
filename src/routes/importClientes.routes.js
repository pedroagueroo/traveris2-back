// ============================================================================
// IMPORT CLIENTES ROUTES — Importación inteligente desde Excel
// Soporta: formato estándar Y formato legado (sistema anterior de agencia)
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
    if (allowed.includes(file.mimetype) ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls') ||
        file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Solo archivos Excel (.xlsx, .xls) o CSV'));
    }
  }
});

// =====================================================
// UTILIDADES DE PARSEO
// =====================================================

/**
 * Convierte un serial de fecha Excel a formato YYYY-MM-DD.
 * Excel cuenta los días desde el 1/1/1900.
 */
function excelSerialToDate(serial) {
  if (!serial || serial <= 1) return null;
  if (typeof serial === 'number' && serial > 100) {
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  return null;
}

/**
 * Parsea fechas en formato DD/MM/YY o DD/MM/YYYY
 */
function parseDateDMY(str) {
  if (!str) return null;
  if (typeof str === 'number') return excelSerialToDate(str);

  const s = String(str).trim();
  if (!s) return null;

  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    let [, day, month, year] = match;
    day = parseInt(day, 10);
    month = parseInt(month, 10);
    year = parseInt(year, 10);

    if (year < 100) {
      // Threshold: > 30 → 1900s (births), <= 30 → 2000s (future docs)
      year = year > 30 ? 1900 + year : 2000 + year;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const pad = (n) => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  // Try ISO format YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  return null;
}

function cleanStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function cleanPhone(val) {
  if (!val) return '';
  return String(val).replace(/[^\d+\-\s()]/g, '').trim();
}

// =====================================================
// DETECCIÓN DE FORMATO Y MAPEO INTELIGENTE
// =====================================================

/**
 * Detecta si el Excel es formato legado (sistema anterior) o estándar
 */
function detectFormat(headers) {
  const h = headers.map(h => String(h).toUpperCase());
  // Columnas exclusivas del formato legado
  const legacyColumns = ['NOMB1', 'NOMB2', 'TEL_PAR', 'TEL_COM', 'ID_CLI', 'FEC_NAC', 'TIPO', 'NUMERO', 'TIPO1', 'NUMERO1'];
  const legacyCount = legacyColumns.filter(c => h.includes(c)).length;

  if (legacyCount >= 3) return 'LEGACY';
  return 'STANDARD';
}

/**
 * Mapea fila del formato LEGADO (viejo sistema de agencia) a cliente
 */
function mapLegacyRow(row) {
  // Nombre completo: usar NOMBRE (ya concatenado) o NOMB1 + NOMB2
  let nombre = cleanStr(row['NOMBRE']);
  if (!nombre) {
    const nomb1 = cleanStr(row['NOMB1']);
    const nomb2 = cleanStr(row['NOMB2']);
    nombre = [nomb1, nomb2].filter(Boolean).join(' ');
  }

  // DNI: buscar en NUMERO cuando TIPO es DNI
  let dni = '';
  const tipo = cleanStr(row['TIPO']).toUpperCase();
  if (tipo === 'DNI' || tipo === 'D.N.I' || tipo === 'D.N.I.') {
    dni = cleanStr(row['NUMERO']);
  }
  if (!dni) {
    dni = cleanStr(row['DNI_CUI']) || cleanStr(row['NUMERO']) || '';
  }

  // Email
  const email = cleanStr(row['EMAIL']) || cleanStr(row['EML_PAN']) || '';

  // Teléfono: priorizar CELULAR > TEL_PAR > TEL_COM
  const telefono = cleanPhone(row['CELULAR']) || cleanPhone(row['TEL_PAR']) || cleanPhone(row['TEL_COM']) || '';

  // Fecha de nacimiento
  const fechaNac = parseDateDMY(row['FEC_NAC']);

  // CUIT/CUIL: viene en NUM_IVA con formato "27-12345678-0"
  let cuitCuil = cleanStr(row['NUM_IVA']);
  if (!cuitCuil) cuitCuil = cleanStr(row['ID_IVA']);
  // Si el cuit es solo tipo fiscal (RI, CF, etc) no es un CUIT real
  if (cuitCuil && cuitCuil.length < 5) cuitCuil = '';

  // Pasaporte: en NUMERO1 cuando TIPO1 es PAS
  let pasaporteNro = '';
  if (cleanStr(row['TIPO1']).toUpperCase() === 'PAS') {
    pasaporteNro = cleanStr(row['NUMERO1']);
  }
  if (!pasaporteNro) {
    pasaporteNro = cleanStr(row['NRO_PASAPORTE']) || cleanStr(row['PASAPORTE']) || '';
  }

  // Fechas de pasaporte (pueden ser seriales de Excel)
  const pasaporteEmision = excelSerialToDate(row['EMI_PAS']) || parseDateDMY(row['FEC_EMI']) || null;
  const pasaporteVencimiento = excelSerialToDate(row['VEN_PAS']) || parseDateDMY(row['FEC_VTO']) || null;

  // DNI vencimiento (serial Excel)
  const dniVencimiento = excelSerialToDate(row['VTO_DOC']) || null;

  // Sexo
  let sexo = cleanStr(row['SEXO']).toUpperCase();
  if (sexo === 'MASCULINO' || sexo === 'MASC' || sexo === 'M') sexo = 'M';
  else if (sexo === 'FEMENINO' || sexo === 'FEM' || sexo === 'F') sexo = 'F';
  else if (sexo === 'X') sexo = 'X';
  else sexo = '';

  // Nacionalidad
  const nacionalidad = cleanStr(row['NACIONALIDAD']) || '';

  return {
    nombre_completo: nombre.toUpperCase(),
    dni_pasaporte: dni,
    email: email.toLowerCase(),
    telefono,
    fecha_nacimiento: fechaNac,
    cuit_cuil: cuitCuil,
    nacionalidad,
    pasaporte_nro: pasaporteNro,
    pasaporte_emision: pasaporteEmision,
    pasaporte_vencimiento: pasaporteVencimiento,
    sexo,
    dni_emision: null,
    dni_vencimiento: dniVencimiento
  };
}

/**
 * Mapea fila del formato ESTÁNDAR (columnas naturales)
 */
function mapStandardRow(row) {
  return {
    nombre_completo: cleanStr(row['Nombre Completo'] || row['nombre_completo'] || row['Nombre'] || row['NOMBRE'] || '').toUpperCase(),
    dni_pasaporte: cleanStr(row['DNI'] || row['dni_pasaporte'] || row['Documento'] || row['DNI/Pasaporte'] || ''),
    email: cleanStr(row['Email'] || row['email'] || row['E-mail'] || row['EMAIL'] || '').toLowerCase(),
    telefono: cleanPhone(row['Teléfono'] || row['telefono'] || row['Tel'] || row['Telefono'] || row['CELULAR'] || ''),
    fecha_nacimiento: parseDateDMY(row['Fecha Nacimiento'] || row['fecha_nacimiento'] || row['FEC_NAC']),
    nacionalidad: cleanStr(row['Nacionalidad'] || row['nacionalidad'] || row['NACIONALIDAD'] || ''),
    sexo: cleanStr(row['Sexo'] || row['sexo'] || row['SEXO'] || '').toUpperCase().charAt(0) || '',
    cuit_cuil: cleanStr(row['CUIT'] || row['cuit_cuil'] || row['CUIT/CUIL'] || ''),
    pasaporte_nro: cleanStr(row['Pasaporte'] || row['pasaporte_nro'] || row['NRO_PASAPORTE'] || ''),
    pasaporte_emision: parseDateDMY(row['Pasaporte Emisión'] || row['pasaporte_emision']),
    pasaporte_vencimiento: parseDateDMY(row['Pasaporte Vencimiento'] || row['pasaporte_vencimiento']),
    dni_emision: parseDateDMY(row['DNI Emisión'] || row['dni_emision']),
    dni_vencimiento: parseDateDMY(row['DNI Vencimiento'] || row['dni_vencimiento'])
  };
}

// =====================================================
// PREVIEW — Previsualizar datos del Excel
// =====================================================
router.post('/preview', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'El archivo Excel está vacío' });
    }

    // Detectar formato por headers
    const headers = rawData[0] || [];
    const format = detectFormat(headers);
    console.log(`📋 Formato detectado: ${format} (${headers.length} columnas, ${data.length} filas)`);

    // Mapear según formato
    const mapFn = format === 'LEGACY' ? mapLegacyRow : mapStandardRow;

    const clientes = data.map((row, index) => {
      const c = mapFn(row);
      const errores = [];

      if (!c.nombre_completo) errores.push('Nombre completo es requerido');

      return {
        fila: index + 2,
        ...c,
        valido: errores.length === 0,
        errores
      };
    });

    const validos = clientes.filter(c => c.valido).length;
    const invalidos = clientes.filter(c => !c.valido).length;

    res.json({
      formato: format,
      columnas_detectadas: headers,
      clientes,
      validos,
      invalidos,
      total: clientes.length
    });
  } catch (err) {
    console.error('❌ Error preview importación:', err);
    res.status(500).json({ error: 'Error al procesar archivo' });
  }
});

// =====================================================
// CONFIRMAR — Importar clientes con UPSERT
// =====================================================
router.post('/confirmar', async (req, res) => {
  const { clientes } = req.body;
  const empresa = req.usuario.empresa_nombre;

  if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
    return res.status(400).json({ error: 'No hay clientes para importar' });
  }

  let importados = 0;
  let actualizados = 0;
  let errores = 0;
  const detalleErrores = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i];
      try {
        if (!c.nombre_completo) {
          errores++;
          detalleErrores.push({ fila: c.fila || i + 2, motivo: 'Nombre vacío' });
          continue;
        }

        // UPSERT: Si existe por DNI+empresa → actualizar. Si no → insertar.
        if (c.dni_pasaporte) {
          const existente = await client.query(
            'SELECT id FROM clientes WHERE dni_pasaporte = $1 AND empresa_nombre = $2',
            [c.dni_pasaporte, empresa]
          );

          if (existente.rows.length > 0) {
            await client.query(`
              UPDATE clientes SET
                nombre_completo = $1,
                email = CASE WHEN $2 = '' THEN email ELSE COALESCE($2, email) END,
                telefono = CASE WHEN $3 = '' THEN telefono ELSE COALESCE($3, telefono) END,
                fecha_nacimiento = COALESCE($4::date, fecha_nacimiento),
                cuit_cuil = CASE WHEN $5 = '' THEN cuit_cuil ELSE COALESCE($5, cuit_cuil) END,
                nacionalidad = CASE WHEN $6 = '' THEN nacionalidad ELSE COALESCE($6, nacionalidad) END,
                pasaporte_nro = CASE WHEN $7 = '' THEN pasaporte_nro ELSE COALESCE($7, pasaporte_nro) END,
                pasaporte_emision = COALESCE($8::date, pasaporte_emision),
                pasaporte_vencimiento = COALESCE($9::date, pasaporte_vencimiento),
                sexo = CASE WHEN $10 = '' THEN sexo ELSE COALESCE($10, sexo) END,
                dni_vencimiento = COALESCE($11::date, dni_vencimiento),
                dni_emision = COALESCE($12::date, dni_emision)
              WHERE id = $13
            `, [
              c.nombre_completo,
              c.email || '',
              c.telefono || '',
              c.fecha_nacimiento || null,
              c.cuit_cuil || '',
              c.nacionalidad || '',
              c.pasaporte_nro || '',
              c.pasaporte_emision || null,
              c.pasaporte_vencimiento || null,
              c.sexo || '',
              c.dni_vencimiento || null,
              c.dni_emision || null,
              existente.rows[0].id
            ]);
            actualizados++;
            continue;
          }
        }

        // INSERTAR nuevo cliente
        await client.query(`
          INSERT INTO clientes (
            nombre_completo, dni_pasaporte, email, telefono, fecha_nacimiento,
            cuit_cuil, nacionalidad, pasaporte_nro, pasaporte_emision, pasaporte_vencimiento,
            sexo, empresa_nombre, dni_emision, dni_vencimiento
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `, [
          c.nombre_completo,
          c.dni_pasaporte || null,
          c.email || null,
          c.telefono || null,
          c.fecha_nacimiento || null,
          c.cuit_cuil || null,
          c.nacionalidad || null,
          c.pasaporte_nro || null,
          c.pasaporte_emision || null,
          c.pasaporte_vencimiento || null,
          c.sexo || null,
          empresa,
          c.dni_emision || null,
          c.dni_vencimiento || null
        ]);
        importados++;

      } catch (rowErr) {
        errores++;
        detalleErrores.push({ fila: c.fila || i + 2, motivo: rowErr.message, nombre: c.nombre_completo });
      }

      // Commit parcial cada 50 filas
      if ((i + 1) % 50 === 0) {
        await client.query('COMMIT');
        await client.query('BEGIN');
      }
    }

    await client.query('COMMIT');
  } catch (txErr) {
    await client.query('ROLLBACK');
    throw txErr;
  } finally {
    client.release();
  }

  console.log(`✅ Importación: ${importados} nuevos, ${actualizados} actualizados, ${errores} errores`);

  res.json({ importados, actualizados, errores, detalleErrores });
});

module.exports = router;
