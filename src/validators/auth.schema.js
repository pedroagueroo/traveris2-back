// ============================================================================
// VALIDATORS — Auth Schemas (Zod)
// ============================================================================
const { z } = require('zod');

const loginSchema = z.object({
  nombre_usuario: z.string()
    .min(1, 'El nombre de usuario es requerido')
    .max(100, 'Máximo 100 caracteres'),
  password: z.string()
    .min(1, 'La contraseña es requerida')
    .max(255, 'Máximo 255 caracteres')
});

module.exports = { loginSchema };
