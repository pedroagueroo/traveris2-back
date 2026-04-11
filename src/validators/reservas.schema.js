// ============================================================================
// VALIDATORS — Reservas Schemas (Zod)
// ============================================================================
const { z } = require('zod');

const reservaSchema = z.object({
  id_titular: z.number().int().positive('Titular requerido'),
  destino_final: z.string().max(255).optional().nullable(),
  fecha_viaje_salida: z.string().optional().nullable(),
  fecha_viaje_regreso: z.string().optional().nullable(),
  operador_mayorista: z.string().max(100).optional().nullable(),
  nro_expediente_operador: z.string().max(100).optional().nullable(),
  observaciones_internas: z.string().optional().nullable(),
  estado: z.enum(['ABIERTO', 'CERRADO', 'CANCELADO']).optional(),
  fecha_limite_pago: z.string().optional().nullable(),
  pasajeros: z.array(z.object({
    id_cliente: z.number().int().positive(),
    es_titular: z.boolean().optional()
  })).optional(),
  vuelos: z.array(z.object({
    aerolinea: z.string().max(100).optional().nullable(),
    nro_vuelo: z.string().max(50).optional().nullable(),
    origen: z.string().max(100).optional().nullable(),
    destino: z.string().max(100).optional().nullable(),
    fecha_salida: z.string().optional().nullable(),
    fecha_llegada: z.string().optional().nullable(),
    clase: z.string().max(50).optional().nullable(),
    codigo_reserva: z.string().max(50).optional().nullable(),
    observaciones: z.string().optional().nullable()
  })).optional()
});

const reservaUpdateSchema = reservaSchema.partial().omit({ id_titular: true }).extend({
  id_titular: z.number().int().positive().optional()
});

module.exports = { reservaSchema, reservaUpdateSchema };
