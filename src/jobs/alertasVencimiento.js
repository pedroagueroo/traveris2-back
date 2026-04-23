const cron = require('node-cron');
const pool = require('../db');
const { enviarEmail } = require('../mailer');

async function enviarAlertasVencimiento() {
  try {
    // Traer todas las agencias activas
    const agencias = await pool.query(
      `SELECT empresa_nombre, email, nombre_comercial 
       FROM agencias_config 
       WHERE activa = TRUE AND email IS NOT NULL`
    );

    for (const agencia of agencias.rows) {
      // Reservas con vencimiento en los próximos 3 días
      const reservas = await pool.query(
        `SELECT r.id, r.destino_final, r.fecha_limite_pago,
                c.nombre_completo AS titular_nombre,
                (r.fecha_limite_pago - CURRENT_DATE) AS dias_restantes
         FROM reservas r
         JOIN clientes c ON r.id_titular = c.id
         WHERE r.empresa_nombre = $1
           AND r.estado = 'ABIERTO'
           AND r.estado_eliminado = FALSE
           AND r.fecha_limite_pago IS NOT NULL
           AND r.fecha_limite_pago >= CURRENT_DATE
           AND r.fecha_limite_pago <= CURRENT_DATE + INTERVAL '3 days'
         ORDER BY r.fecha_limite_pago ASC`,
        [agencia.empresa_nombre]
      );

      if (reservas.rows.length === 0) continue;

      const filas = reservas.rows.map(r => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">#${r.id}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${r.titular_nombre}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${r.destino_final || '-'}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">
            ${new Date(r.fecha_limite_pago).toLocaleDateString('es-AR')}
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: ${r.dias_restantes <= 1 ? '#ef4444' : '#f59e0b'};">
            ${r.dias_restantes === 0 ? 'HOY' : r.dias_restantes === 1 ? 'Mañana' : `En ${r.dias_restantes} días`}
          </td>
        </tr>
      `).join('');

      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #6366F1; padding: 1.5rem; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0;">Traveris Pro</h2>
            <p style="color: rgba(255,255,255,0.8); margin: 0.25rem 0 0;">Alertas de vencimiento</p>
          </div>
          <div style="background: #f8fafc; padding: 1.5rem; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">
              Hola <strong>${agencia.nombre_comercial || agencia.empresa_nombre}</strong>, 
              hay <strong>${reservas.rows.length} reserva${reservas.rows.length > 1 ? 's' : ''}</strong> 
              con fecha límite de pago próxima:
            </p>
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background: #f1f5f9;">
                  <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280;">#</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280;">Titular</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280;">Destino</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280;">Vence</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280;">Estado</th>
                </tr>
              </thead>
              <tbody>${filas}</tbody>
            </table>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 1rem;">
              Este es un recordatorio automático de Traveris Pro.
            </p>
          </div>
        </div>
      `;

      await enviarEmail({
        to: agencia.email,
        subject: `Traveris Pro — ${reservas.rows.length} reserva${reservas.rows.length > 1 ? 's' : ''} por vencer`,
        html
      });
    }
  } catch (err) {
    console.error('❌ Error en alertas de vencimiento:', err);
  }
}

// Corre todos los días a las 8:00 AM
function iniciarJob() {
  cron.schedule('0 8 * * *', () => {
    console.log('📅 Ejecutando alertas de vencimiento...');
    enviarAlertasVencimiento();
  }, { timezone: 'America/Argentina/Buenos_Aires' });

  console.log('✅ Job de alertas de vencimiento activo (8:00 AM ARG)');
}

module.exports = { iniciarJob, enviarAlertasVencimiento };
