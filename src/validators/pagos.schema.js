// ============================================================================
// VALIDATORS — Pagos Schemas (Zod)
// ============================================================================
const { z } = require('zod');

const pagoSchema = z.object({
  id_reserva: z.number().int().positive().optional().nullable(),
  id_servicio: z.number().int().positive().optional().nullable(),
  id_deuda: z.number().int().positive().optional().nullable(),
  id_proveedor: z.number().int().positive().optional().nullable(),
  id_cliente: z.number().int().positive().optional().nullable(),
  tipo: z.enum([
    'COBRO_CLIENTE', 'PAGO_PROVEEDOR',
    'INGRESO_GENERAL', 'EGRESO_GENERAL',
    'CONVERSION', 'AJUSTE_TARJETA'
  ]),
  moneda: z.enum(['ARS', 'USD', 'EUR']),
  monto: z.number({ required_error: 'Monto es requerido' }),
  metodo_pago_id: z.number().int().positive().optional().nullable(),
  id_tarjeta_cliente: z.number().int().positive().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  // Datos de tarjeta nueva (para COBRO_CLIENTE con tarjeta)
  tarjeta: z.object({
    titular: z.string().min(1).max(100),
    numero: z.string().min(8).max(19),
    expiracion: z.string().max(10),
    cvv: z.string().max(4).optional()
  }).optional().nullable()
}).superRefine((data, ctx) => {
  // metodo_pago_id es obligatorio para pagos normales (no conversiones/ajustes)
  const tiposRequierenMetodo = ['COBRO_CLIENTE', 'PAGO_PROVEEDOR', 'INGRESO_GENERAL', 'EGRESO_GENERAL'];
  if (tiposRequierenMetodo.includes(data.tipo) && !data.metodo_pago_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Debe seleccionar un método de pago',
      path: ['metodo_pago_id']
    });
  }
});

const conversionSchema = z.object({
  moneda_origen: z.enum(['ARS', 'USD', 'EUR']),
  moneda_destino: z.enum(['ARS', 'USD', 'EUR']),
  monto_origen: z.number().positive('Monto origen debe ser positivo'),
  monto_destino: z.number().positive('Monto destino debe ser positivo'),
  metodo_pago_id_origen: z.number().int().positive().optional().nullable(),
  metodo_pago_id_destino: z.number().int().positive().optional().nullable(),
  observaciones: z.string().optional().nullable()
});

module.exports = { pagoSchema, conversionSchema };
