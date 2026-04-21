// ============================================================================
// VALIDATORS — Admin Schemas (Zod)
// ============================================================================
const { z } = require('zod');

const crearAgenciaSchema = z.object({
  empresa_nombre: z.string().min(1).max(100),
  nombre_comercial: z.string().max(200).optional().nullable(),
  titular: z.string().max(200).optional().nullable(),
  cuit_cuil: z.string().max(30).optional().nullable(),
  condicion_fiscal: z.enum(['MONOTRIBUTO', 'RESP_INSCRIPTO', 'EXENTO']).optional().nullable().or(z.literal('')),
  domicilio: z.string().optional().nullable(),
  telefono: z.string().max(50).optional().nullable(),
  email: z.string().max(100).optional().nullable().or(z.literal('')),
  pagina_web: z.string().max(200).optional().nullable().or(z.literal('')),
  recibo_footer_legal: z.string().optional().nullable()
});

const actualizarAgenciaSchema = crearAgenciaSchema.partial().omit({ empresa_nombre: true }).strip();

const reciboConfigSchema = z.object({
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  fontFamily: z.string().optional(),
  logoPosition: z.enum(['left', 'center', 'right']).optional(),
  showArcaLogo: z.boolean().optional(),
  extraText: z.string().optional()
});

const crearUsuarioSchema = z.object({
  nombre_usuario: z.string().min(3).max(100),
  password: z.string().min(6).max(255),
  rol: z.enum(['ADMIN', 'EMPRESA']),
  empresa_nombre: z.string().max(100).nullable().optional()
});

const actualizarUsuarioSchema = z.object({
  nombre_usuario: z.string().min(3).max(100).optional(),
  password: z.string().min(6).max(255).optional(),
  rol: z.enum(['ADMIN', 'EMPRESA']).optional(),
  empresa_nombre: z.string().max(100).nullable().optional(),
  activo: z.boolean().optional()
});

module.exports = {
  crearAgenciaSchema,
  actualizarAgenciaSchema,
  reciboConfigSchema,
  crearUsuarioSchema,
  actualizarUsuarioSchema
};
