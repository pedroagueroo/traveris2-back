// ============================================================================
// VALIDATORS — Servicios Schemas (Zod)
// ============================================================================
const { z } = require('zod');

const servicioSchema = z.object({
  id_reserva: z.number().int().positive(),
  tipo_servicio: z.enum(['HOTEL', 'VUELO', 'ASISTENCIA', 'VISA', 'CRUCERO', 'SERVICIO']),
  descripcion: z.string().optional().nullable(),

  // Polimórficos HOTEL
  hotel_nombre: z.string().max(200).optional().nullable(),
  hotel_ciudad: z.string().max(100).optional().nullable(),
  hotel_check_in: z.string().optional().nullable(),
  hotel_check_out: z.string().optional().nullable(),
  hotel_regimen: z.string().max(50).optional().nullable(),
  hotel_noches: z.number().int().optional().nullable(),
  hotel_categoria: z.string().max(30).optional().nullable(),

  // Polimórficos VUELO
  vuelo_aerolinea: z.string().max(100).optional().nullable(),
  vuelo_nro: z.string().max(50).optional().nullable(),
  vuelo_origen: z.string().max(100).optional().nullable(),
  vuelo_destino: z.string().max(100).optional().nullable(),
  vuelo_fecha_salida: z.string().optional().nullable(),
  vuelo_fecha_llegada: z.string().optional().nullable(),
  vuelo_clase: z.string().max(50).optional().nullable(),
  vuelo_codigo_reserva: z.string().max(50).optional().nullable(),

  // Polimórficos ASISTENCIA
  asistencia_compania: z.string().max(100).optional().nullable(),
  asistencia_plan: z.string().max(100).optional().nullable(),
  asistencia_fecha_desde: z.string().optional().nullable(),
  asistencia_fecha_hasta: z.string().optional().nullable(),
  asistencia_cobertura: z.string().optional().nullable(),

  // Polimórficos VISA
  visa_pais: z.string().max(100).optional().nullable(),
  visa_tipo: z.string().max(50).optional().nullable(),
  visa_fecha_tramite: z.string().optional().nullable(),
  visa_nro_tramite: z.string().max(50).optional().nullable(),

  // Polimórficos CRUCERO
  crucero_naviera: z.string().max(100).optional().nullable(),
  crucero_barco: z.string().max(100).optional().nullable(),
  crucero_itinerario: z.string().optional().nullable(),
  crucero_cabina: z.string().max(50).optional().nullable(),
  crucero_fecha_embarque: z.string().optional().nullable(),
  crucero_fecha_desembarque: z.string().optional().nullable(),

  // Fechas de pago generales
  fecha_sena: z.string().optional().nullable(),
  fecha_saldar: z.string().optional().nullable(),

  // Financieros
  id_proveedor: z.number().int().positive().optional().nullable(),
  moneda: z.enum(['ARS', 'USD', 'EUR']),
  precio_cliente: z.number().min(0, 'Precio cliente debe ser >= 0'),
  costo_proveedor: z.number().min(0, 'Costo proveedor debe ser >= 0')
});

const servicioUpdateSchema = servicioSchema.partial().omit({ id_reserva: true });

module.exports = { servicioSchema, servicioUpdateSchema };
