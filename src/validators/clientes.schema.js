// ============================================================================
// VALIDATORS — Clientes Schemas (Zod)
// ============================================================================
const { z } = require('zod');

const clienteSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(200),
  apellido: z.string().min(1, 'Apellido requerido').max(200),
  dni_pasaporte: z.string().max(50).optional().nullable(),
  email: z.string().email().max(100).optional().nullable().or(z.literal('')),
  telefono: z.string().max(50).optional().nullable(),
  fecha_nacimiento: z.string().optional().nullable(),
  cuit_cuil: z.string().max(30).optional().nullable(),
  nacionalidad: z.string().max(50).optional().nullable(),
  pasaporte_nro: z.string().max(50).optional().nullable(),
  pasaporte_emision: z.string().optional().nullable(),
  pasaporte_vencimiento: z.string().optional().nullable(),
  sexo: z.string().max(20).optional().nullable(),
  pref_asiento: z.string().max(50).optional().nullable(),
  pref_comida: z.string().max(50).optional().nullable(),
  observaciones_salud: z.string().optional().nullable(),
  dni_emision: z.string().optional().nullable(),
  dni_vencimiento: z.string().optional().nullable()
});

const clienteUpdateSchema = clienteSchema.partial();

module.exports = { clienteSchema, clienteUpdateSchema };
