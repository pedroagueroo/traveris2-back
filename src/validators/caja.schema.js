// ============================================================================
// VALIDATORS — Caja Schemas (Zod)
// ============================================================================
const { z } = require('zod');

const reporteDiarioQuery = z.object({
  fecha: z.string().optional()
});

const cierreMensualQuery = z.object({
  mes: z.string().regex(/^\d{1,2}$/, 'Mes inválido').optional(),
  anio: z.string().regex(/^\d{4}$/, 'Año inválido').optional()
});

module.exports = { reporteDiarioQuery, cierreMensualQuery };
