// ============================================================================
// VALIDATORS — Proveedores Schemas (Zod)
// ============================================================================
const { z } = require('zod');

const proveedorSchema = z.object({
  nombre_comercial: z.string().min(1, 'Nombre comercial requerido').max(100),
  razon_social_cuit: z.string().max(100).optional().nullable(),
  contacto: z.string().max(100).optional().nullable(),
  email: z.string().email().max(100).optional().nullable().or(z.literal(''))
});

const proveedorUpdateSchema = proveedorSchema.partial();

module.exports = { proveedorSchema, proveedorUpdateSchema };
