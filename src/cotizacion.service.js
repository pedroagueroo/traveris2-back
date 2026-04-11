// ============================================================================
// COTIZACIÓN SERVICE — Cotización del dólar desde APIs argentinas
// ============================================================================
const fetch = require('node-fetch');

/**
 * Obtiene cotizaciones del dólar desde DolarApi.com
 * @returns {Promise<Array>} Array de cotizaciones
 */
async function obtenerCotizaciones() {
  try {
    const response = await fetch('https://dolarapi.com/v1/dolares', {
      timeout: 5000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('❌ Error obteniendo cotizaciones:', err.message);
    // Fallback con valores hardcodeados de emergencia
    return [
      { nombre: 'Oficial', compra: 0, venta: 0, casa: 'oficial' },
      { nombre: 'Blue', compra: 0, venta: 0, casa: 'blue' },
      { nombre: 'Tarjeta', compra: 0, venta: 0, casa: 'tarjeta' }
    ];
  }
}

module.exports = { obtenerCotizaciones };
