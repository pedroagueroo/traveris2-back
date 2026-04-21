// ============================================================================
// PAGOS ROUTES — Transacciones atómicas para cobros y pagos
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { pagoSchema, conversionSchema } = require('../validators/pagos.schema');

/**
 * Detecta banco por BIN argentino
 */
function detectarBancoPorBIN(numero) {
  const bin = numero.replace(/\s/g, '').substring(0, 6);
  const binNum = parseInt(bin, 10);

  // Redes
  let red = 'Desconocida';
  if (/^4/.test(bin)) red = 'Visa';
  else if (/^5[1-5]/.test(bin) || (binNum >= 222100 && binNum <= 272099)) red = 'Mastercard';
  else if (/^3[47]/.test(bin)) red = 'American Express';
  else if (/^(6042|6043|6044|6045|5896|6271|6046)/.test(bin)) red = 'Cabal';
  else if (/^(589562|546553|527601)/.test(bin)) red = 'Naranja';

  // Bancos argentinos (aproximados)
  const bancos = {
    '450799': 'Banco Nación', '450800': 'Banco Nación',
    '451761': 'Banco Provincia', '451762': 'Banco Provincia',
    '455500': 'Banco Galicia', '455501': 'Banco Galicia', '417309': 'Banco Galicia',
    '454775': 'BBVA Francés', '470564': 'BBVA Francés',
    '450601': 'Santander', '450602': 'Santander',
    '451200': 'HSBC',
    '446344': 'Macro', '446345': 'Macro',
    '517562': 'Banco Ciudad',
    '520188': 'Banco Credicoop'
  };

  const banco = bancos[bin] || `${red}`;
  return banco;
}

/**
 * Enmascara número de tarjeta: BIN + ****XXXX
 */
function enmascararTarjeta(numero) {
  const limpio = numero.replace(/\s/g, '');
  const bin = limpio.substring(0, 6);
  const ultimos4 = limpio.substring(limpio.length - 4);
  return `${bin}****${ultimos4}`;
}

// GET /api/pagos/reserva/:id — Pagos de una reserva
router.get('/reserva/:id', async (req, res) => {
  try {
    const empresa = req.usuario.empresa_nombre;
    const result = await pool.query(
      `SELECT p.*, mp.nombre AS metodo_nombre, mp.tipo AS metodo_tipo,
              c.nombre_completo AS cliente_nombre,
              tc.numero_mask AS tarjeta_mask, tc.banco_detectado
       FROM pagos p
       LEFT JOIN metodos_pago mp ON p.metodo_pago_id = mp.id
       LEFT JOIN clientes c ON p.id_cliente = c.id
       LEFT JOIN tarjetas_clientes tc ON p.id_tarjeta_cliente = tc.id
       WHERE p.id_reserva = $1 AND p.empresa_nombre = $2
       ORDER BY p.fecha DESC`,
      [parseInt(req.params.id, 10), empresa]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error listando pagos:', err);
    res.status(500).json({ error: 'Error al listar pagos' });
  }
});

// POST /api/pagos — Transacción atómica de pago
router.post('/', async (req, res) => {
  const parsed = pagoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const empresa = req.usuario.empresa_nombre;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let idTarjetaCliente = data.id_tarjeta_cliente || null;

    // ─── COBRO_CLIENTE CON TARJETA NUEVA ─────────────────────────────
    if (data.tipo === 'COBRO_CLIENTE' && data.tarjeta) {
      const mask = enmascararTarjeta(data.tarjeta.numero);
      const banco = detectarBancoPorBIN(data.tarjeta.numero);

      // 1. INSERT pago (sin id_tarjeta_cliente todavía)
      const pago = await client.query(
        `INSERT INTO pagos (id_reserva, id_servicio, id_deuda, id_proveedor, id_cliente,
          tipo, moneda, monto, metodo_pago_id, id_tarjeta_cliente, observaciones, empresa_nombre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11)
         RETURNING *`,
        [data.id_reserva, data.id_servicio, data.id_deuda, data.id_proveedor,
         data.id_cliente, data.tipo, data.moneda, data.monto, data.metodo_pago_id,
         data.observaciones, empresa]
      );

      const idPago = pago.rows[0].id;

      // 2. INSERT tarjeta_clientes
      const tarjeta = await client.query(
        `INSERT INTO tarjetas_clientes (titular, numero_mask, expiracion, banco_detectado,
          moneda, monto_original, monto_disponible, id_pago_origen, empresa_nombre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [data.tarjeta.titular, mask, data.tarjeta.expiracion, banco,
         data.moneda, data.monto, data.monto, idPago, empresa]
      );

      idTarjetaCliente = tarjeta.rows[0].id;

      // 3. UPDATE pago con id_tarjeta_cliente
      await client.query(
        'UPDATE pagos SET id_tarjeta_cliente = $1 WHERE id = $2',
        [idTarjetaCliente, idPago]
      );

      // 4. UPDATE deuda
      if (data.id_deuda) {
        await client.query(
          'UPDATE deudas_servicio SET monto_pagado = monto_pagado + $1 WHERE id = $2',
          [Math.abs(data.monto), data.id_deuda]
        );
      }

      // 5. Generar recibo
      await generarRecibo(client, pago.rows[0], empresa);

      await client.query('COMMIT');
      return res.status(201).json(pago.rows[0]);
    }

    // ─── PAGO_PROVEEDOR CON TARJETA-PUENTE ───────────────────────────
    if (data.tipo === 'PAGO_PROVEEDOR' && idTarjetaCliente) {
      // Validar disponibilidad
      const tarjeta = await client.query(
        'SELECT * FROM tarjetas_clientes WHERE id = $1 AND empresa_nombre = $2',
        [idTarjetaCliente, empresa]
      );

      if (tarjeta.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Tarjeta no encontrada' });
      }

      const t = tarjeta.rows[0];
      const disponible = parseFloat(t.monto_disponible);
      if (disponible < Math.abs(data.monto)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Saldo insuficiente en tarjeta. Disponible: ${disponible}, Requerido: ${Math.abs(data.monto)}`
        });
      }

      // Determinar proveedor: desde la deuda o desde data.id_proveedor
      let idProveedorPago = data.id_proveedor || null;
      if (!idProveedorPago && data.id_deuda) {
        const deudaRow = await client.query('SELECT id_proveedor FROM deudas_servicio WHERE id = $1', [data.id_deuda]);
        if (deudaRow.rows.length > 0) idProveedorPago = deudaRow.rows[0].id_proveedor;
      }

      // Validar vinculación: la tarjeta solo puede usarse con el proveedor ya vinculado (o si no tiene ninguno)
      if (t.id_proveedor_vinculado && idProveedorPago && t.id_proveedor_vinculado !== idProveedorPago) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Esta tarjeta está vinculada a otro proveedor y no puede usarse para este pago.'
        });
      }

      // INSERT pago
      const pago = await client.query(
        `INSERT INTO pagos (id_reserva, id_servicio, id_deuda, id_proveedor, id_cliente,
          tipo, moneda, monto, metodo_pago_id, id_tarjeta_cliente, observaciones, empresa_nombre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [data.id_reserva, data.id_servicio, data.id_deuda, idProveedorPago,
         data.id_cliente, data.tipo, data.moneda, data.monto, data.metodo_pago_id,
         idTarjetaCliente, data.observaciones, empresa]
      );

      // UPDATE tarjeta disponible + vincular al proveedor si no lo estaba
      const nuevoDisponible = disponible - Math.abs(data.monto);
      const nuevoEstado = nuevoDisponible <= 0 ? 'CONSUMIDA' : 'ACTIVA';
      await client.query(
        `UPDATE tarjetas_clientes
         SET monto_disponible = $1, estado = $2,
             id_proveedor_vinculado = COALESCE(id_proveedor_vinculado, $4)
         WHERE id = $3`,
        [Math.max(0, nuevoDisponible), nuevoEstado, idTarjetaCliente, idProveedorPago]
      );

      // UPDATE deuda
      if (data.id_deuda) {
        await client.query(
          'UPDATE deudas_servicio SET monto_pagado = monto_pagado + $1 WHERE id = $2',
          [Math.abs(data.monto), data.id_deuda]
        );
      }

      await client.query('COMMIT');
      return res.status(201).json(pago.rows[0]);
    }

    // ─── FLUJO GENÉRICO (efectivo, transferencia, etc.) ──────────────
    const pago = await client.query(
      `INSERT INTO pagos (id_reserva, id_servicio, id_deuda, id_proveedor, id_cliente,
        tipo, moneda, monto, metodo_pago_id, id_tarjeta_cliente, observaciones, empresa_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [data.id_reserva, data.id_servicio, data.id_deuda, data.id_proveedor,
       data.id_cliente, data.tipo, data.moneda, data.monto, data.metodo_pago_id,
       idTarjetaCliente, data.observaciones, empresa]
    );

    // UPDATE deuda si aplica
    if (data.id_deuda && (data.tipo === 'COBRO_CLIENTE' || data.tipo === 'PAGO_PROVEEDOR')) {
      await client.query(
        'UPDATE deudas_servicio SET monto_pagado = monto_pagado + $1 WHERE id = $2',
        [Math.abs(data.monto), data.id_deuda]
      );
    }

    // Generar recibo si es COBRO_CLIENTE
    if (data.tipo === 'COBRO_CLIENTE') {
      await generarRecibo(client, pago.rows[0], empresa);
    }

    await client.query('COMMIT');
    res.status(201).json(pago.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error registrando pago:', err);
    res.status(500).json({ error: 'Error al registrar pago' });
  } finally {
    client.release();
  }
});

// POST /api/pagos/convertir — Conversión de moneda (2 registros)
router.post('/convertir', async (req, res) => {
  const parsed = conversionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.errors });
  }

  const data = parsed.data;
  const empresa = req.usuario.empresa_nombre;

  if (data.moneda_origen === data.moneda_destino) {
    return res.status(400).json({ error: 'Las monedas de origen y destino deben ser diferentes' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Egreso en moneda origen
    const egreso = await client.query(
      `INSERT INTO pagos (tipo, moneda, monto, metodo_pago_id, observaciones, empresa_nombre)
       VALUES ('CONVERSION', $1, $2, $3, $4, $5)
       RETURNING *`,
      [data.moneda_origen, -data.monto_origen, data.metodo_pago_id_origen,
       data.observaciones || `Conversión ${data.moneda_origen} → ${data.moneda_destino}`, empresa]
    );

    // Ingreso en moneda destino
    const ingreso = await client.query(
      `INSERT INTO pagos (tipo, moneda, monto, metodo_pago_id, observaciones, empresa_nombre)
       VALUES ('CONVERSION', $1, $2, $3, $4, $5)
       RETURNING *`,
      [data.moneda_destino, data.monto_destino, data.metodo_pago_id_destino,
       data.observaciones || `Conversión ${data.moneda_origen} → ${data.moneda_destino}`, empresa]
    );

    await client.query('COMMIT');
    res.status(201).json({ egreso: egreso.rows[0], ingreso: ingreso.rows[0] });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en conversión:', err);
    res.status(500).json({ error: 'Error al convertir moneda' });
  } finally {
    client.release();
  }
});

// PUT /api/pagos/:id/anular — Soft delete + reversión
router.put('/:id/anular', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const empresa = req.usuario.empresa_nombre;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Obtener pago
    const pago = await client.query(
      'SELECT * FROM pagos WHERE id = $1 AND empresa_nombre = $2 AND anulado = FALSE',
      [id, empresa]
    );

    if (pago.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pago no encontrado o ya anulado' });
    }

    const p = pago.rows[0];

    // Marcar como anulado
    await client.query('UPDATE pagos SET anulado = TRUE WHERE id = $1', [id]);

    // Revertir monto_pagado de la deuda
    if (p.id_deuda) {
      await client.query(
        'UPDATE deudas_servicio SET monto_pagado = GREATEST(0, monto_pagado - $1) WHERE id = $2',
        [Math.abs(p.monto), p.id_deuda]
      );
    }

    // Devolver saldo de tarjeta si aplica
    if (p.id_tarjeta_cliente) {
      if (p.tipo === 'PAGO_PROVEEDOR') {
        // Si se usó tarjeta-puente para pagar proveedor, devolver disponible
        await client.query(
          `UPDATE tarjetas_clientes
           SET monto_disponible = monto_disponible + $1,
               estado = 'ACTIVA'
           WHERE id = $2`,
          [Math.abs(p.monto), p.id_tarjeta_cliente]
        );
      }
      // Si fue COBRO_CLIENTE con tarjeta, la tarjeta debería eliminarse o marcarse
      // Pero por consistencia, la dejamos y solo anulamos el pago
    }

    // Anular recibo vinculado
    await client.query(
      'UPDATE recibos SET anulado = TRUE WHERE id_pago = $1',
      [id]
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Pago anulado correctamente' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error anulando pago:', err);
    res.status(500).json({ error: 'Error al anular pago' });
  } finally {
    client.release();
  }
});

/**
 * Genera un recibo automáticamente para un COBRO_CLIENTE
 */
async function generarRecibo(client, pago, empresa) {
  // Obtener siguiente número de recibo
  const ultimoRecibo = await client.query(
    'SELECT COALESCE(MAX(numero_recibo), 0) AS ultimo FROM recibos WHERE empresa_nombre = $1',
    [empresa]
  );
  const nuevoNumero = parseInt(ultimoRecibo.rows[0].ultimo, 10) + 1;

  // Obtener datos del cliente
  let nombreCliente = '';
  let dniCliente = '';
  if (pago.id_cliente) {
    const clienteData = await client.query(
      'SELECT nombre_completo, dni_pasaporte FROM clientes WHERE id = $1',
      [pago.id_cliente]
    );
    if (clienteData.rows.length > 0) {
      nombreCliente = clienteData.rows[0].nombre_completo;
      dniCliente = clienteData.rows[0].dni_pasaporte || '';
    }
  }

  // Obtener nombre del método de pago
  let metodoPagoNombre = '';
  if (pago.metodo_pago_id) {
    const metodo = await client.query('SELECT nombre FROM metodos_pago WHERE id = $1', [pago.metodo_pago_id]);
    metodoPagoNombre = metodo.rows[0]?.nombre || '';
  }

  await client.query(
    `INSERT INTO recibos (numero_recibo, id_pago, id_reserva, id_cliente, nombre_cliente,
      dni_cliente, concepto, moneda, monto, metodo_pago, empresa_nombre)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [nuevoNumero, pago.id, pago.id_reserva, pago.id_cliente, nombreCliente,
     dniCliente, pago.observaciones || 'Cobro de servicios', pago.moneda,
     pago.monto, metodoPagoNombre, empresa]
  );
}

// POST /api/pagos/multiples — Transacción atómica de múltiples pagos (generando un único recibo)
router.post('/multiples', async (req, res) => {
  if (!Array.isArray(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Se requiere un arreglo de pagos' });
  }

  const empresa = req.usuario.empresa_nombre;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    let pagosInsertados = [];
    let sumatoriaMonedas = {};
    let concepto = "Pago múltiple agrupado:\n";
    let idReserva = null;
    let idCliente = null;

    for (let rawData of req.body) {
      if (rawData.tipo !== 'COBRO_CLIENTE') {
        throw new Error('Solo se permiten registrar COBRO_CLIENTE en Pagos Múltiples');
      }

      // Coerción de tipos — Angular envía strings desde inputs de formulario
      if (rawData.monto !== undefined && rawData.monto !== null) rawData.monto = parseFloat(rawData.monto);
      if (rawData.metodo_pago_id !== undefined && rawData.metodo_pago_id !== null) rawData.metodo_pago_id = parseInt(rawData.metodo_pago_id, 10) || null;
      if (rawData.id_reserva !== undefined && rawData.id_reserva !== null) rawData.id_reserva = parseInt(rawData.id_reserva, 10) || null;
      if (rawData.id_servicio !== undefined && rawData.id_servicio !== null) rawData.id_servicio = parseInt(rawData.id_servicio, 10) || null;
      if (rawData.id_deuda !== undefined && rawData.id_deuda !== null) rawData.id_deuda = parseInt(rawData.id_deuda, 10) || null;
      if (rawData.id_cliente !== undefined && rawData.id_cliente !== null) rawData.id_cliente = parseInt(rawData.id_cliente, 10) || null;

      const parsed = pagoSchema.safeParse(rawData);
      if (!parsed.success) {
        console.error('❌ Validación fallida:', JSON.stringify(parsed.error.issues), 'Data:', JSON.stringify(rawData));
        throw new Error('Datos inválidos en uno de los pagos: ' + parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '));
      }
      
      const data = parsed.data;
      idReserva = data.id_reserva;
      idCliente = data.id_cliente;

      let idTarjetaCliente = null;

      if (data.tarjeta) {
        const cleanly = data.tarjeta.numero.replace(/\s/g, '');
        const mask = cleanly.substring(0, 6) + '****' + cleanly.substring(cleanly.length - 4);
        const banco = detectarBancoPorBIN(data.tarjeta.numero);

        const pago = await client.query(
          `INSERT INTO pagos (id_reserva, id_servicio, id_deuda, id_proveedor, id_cliente,
            tipo, moneda, monto, metodo_pago_id, id_tarjeta_cliente, observaciones, empresa_nombre)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11) RETURNING *`,
          [data.id_reserva, data.id_servicio, data.id_deuda, data.id_proveedor,
           data.id_cliente, data.tipo, data.moneda, data.monto, data.metodo_pago_id,
           data.observaciones, empresa]
        );
        const idPago = pago.rows[0].id;
        
        const tarjeta = await client.query(
          `INSERT INTO tarjetas_clientes (titular, numero_mask, expiracion, banco_detectado,
            moneda, monto_original, monto_disponible, id_pago_origen, empresa_nombre)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [data.tarjeta.titular, mask, data.tarjeta.expiracion, banco,
           data.moneda, data.monto, data.monto, idPago, empresa]
        );
        
        idTarjetaCliente = tarjeta.rows[0].id;
        await client.query('UPDATE pagos SET id_tarjeta_cliente = $1 WHERE id = $2', [idTarjetaCliente, idPago]);
        pagosInsertados.push(pago.rows[0]);
      } else {
        const pago = await client.query(
          `INSERT INTO pagos (id_reserva, id_servicio, id_deuda, id_proveedor, id_cliente,
            tipo, moneda, monto, metodo_pago_id, id_tarjeta_cliente, observaciones, empresa_nombre)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [data.id_reserva, data.id_servicio, data.id_deuda, data.id_proveedor,
           data.id_cliente, data.tipo, data.moneda, data.monto, data.metodo_pago_id,
           null, data.observaciones, empresa]
        );
        pagosInsertados.push(pago.rows[0]);
      }

      if (data.id_deuda) {
        await client.query(
          'UPDATE deudas_servicio SET monto_pagado = monto_pagado + $1 WHERE id = $2',
          [Math.abs(data.monto), data.id_deuda]
        );
      }

      let svcName = 'Servicio General';
      if (data.id_servicio) {
         const svcRes = await client.query('SELECT tipo_servicio FROM reserva_servicios_detallados WHERE id = $1', [data.id_servicio]);
         if (svcRes.rows.length) svcName = svcRes.rows[0].tipo_servicio;
      }
      concepto += `- ${svcName}: ${data.monto} ${data.moneda}\n`;

      if (!sumatoriaMonedas[data.moneda]) { sumatoriaMonedas[data.moneda] = 0; }
      sumatoriaMonedas[data.moneda] += parseFloat(data.monto);
    }

    // Generar un único recibo
    const primerPago = pagosInsertados[0];
    
    // Obtener siguiente número de recibo
    const ultimoRecibo = await client.query(
      'SELECT COALESCE(MAX(numero_recibo), 0) AS ultimo FROM recibos WHERE empresa_nombre = $1',
      [empresa]
    );
    const nuevoNumero = parseInt(ultimoRecibo.rows[0].ultimo, 10) + 1;

    let nombreCliente = ''; let dniCliente = '';
    if (idCliente) {
      const clienteData = await client.query('SELECT nombre_completo, dni_pasaporte FROM clientes WHERE id = $1', [idCliente]);
      if (clienteData.rows.length > 0) { nombreCliente = clienteData.rows[0].nombre_completo; dniCliente = clienteData.rows[0].dni_pasaporte || ''; }
    }

    const monedasUsadas = Object.keys(sumatoriaMonedas);
    let reciboMoneda = monedasUsadas.length === 1 ? monedasUsadas[0] : 'MIXTO';
    let reciboMonto = monedasUsadas.length === 1 ? sumatoriaMonedas[reciboMoneda] : 0;

    const recibo = await client.query(
      `INSERT INTO recibos (numero_recibo, id_pago, id_reserva, id_cliente, nombre_cliente,
        dni_cliente, concepto, moneda, monto, metodo_pago, empresa_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [nuevoNumero, primerPago.id, idReserva, idCliente, nombreCliente,
       dniCliente, concepto.trim(), reciboMoneda, reciboMonto, "Varios", empresa]
    );

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Pagos registrados', id_pago: primerPago.id }); // Returning id_pago just so the frontend doesn't crash if it expects it

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error registrando pagos múltiples:', err);
    res.status(500).json({ error: 'Error al registrar pagos múltiples', detalle: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/pagos/:id — Eliminar movimiento permanentemente
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const empresa = req.usuario.empresa_nombre;
    const id = parseInt(req.params.id, 10);

    await client.query('BEGIN');

    // Obtener el pago
    const pagoResult = await client.query(
      'SELECT * FROM pagos WHERE id = $1 AND empresa_nombre = $2',
      [id, empresa]
    );

    if (pagoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }

    const pago = pagoResult.rows[0];

    // Si el pago tiene deuda asociada, revertir el saldo
    if (pago.id_deuda && !pago.anulado) {
      await client.query(
        'UPDATE deudas_servicio SET monto_pagado = monto_pagado - $1 WHERE id = $2',
        [Math.abs(pago.monto), pago.id_deuda]
      );
    }

    // Si el pago consumió saldo de tarjeta-puente, devolverlo
    if (pago.id_tarjeta_cliente && !pago.anulado) {
      await client.query(
        'UPDATE tarjetas_clientes SET monto_disponible = monto_disponible + $1 WHERE id = $2',
        [Math.abs(pago.monto), pago.id_tarjeta_cliente]
      );
    }

    // Si este pago creó tarjetas-puente (COBRO_CLIENTE con tarjeta), eliminarlas
    // Primero: desvinculamos otros pagos que usaron esas tarjetas
    const tarjetasCreadas = await client.query(
      'SELECT id FROM tarjetas_clientes WHERE id_pago_origen = $1', [id]
    );
    if (tarjetasCreadas.rows.length > 0) {
      const tarjetaIds = tarjetasCreadas.rows.map(t => t.id);
      // Nullificar referencia en pagos que consumieron estas tarjetas
      await client.query(
        'UPDATE pagos SET id_tarjeta_cliente = NULL WHERE id_tarjeta_cliente = ANY($1)',
        [tarjetaIds]
      );
      // Eliminar las tarjetas
      await client.query(
        'DELETE FROM tarjetas_clientes WHERE id_pago_origen = $1', [id]
      );
    }

    // Eliminar recibos asociados
    await client.query('DELETE FROM recibos WHERE id_pago = $1', [id]);

    // Eliminar el pago
    await client.query('DELETE FROM pagos WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ mensaje: 'Movimiento eliminado permanentemente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error eliminando movimiento:', err);
    res.status(500).json({ error: 'Error al eliminar movimiento' });
  } finally {
    client.release();
  }
});

module.exports = router;
