/**
 * Error estructurado de aplicación con código HTTP y código de error legible por máquina.
 * Sustituye progresivamente a `new Error('mensaje')` en validaciones y servicios.
 */
class AppError extends Error {
  /**
   * @param {number} statusCode - HTTP status code (400, 404, 409, 502, etc.)
   * @param {string} message - Mensaje legible para el cliente
   * @param {string} [errorCode] - Código interno opcional para debugging (ej. 'INVALID_AMOUNT')
   */
  constructor(statusCode, message, errorCode) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode || null;
  }
}

module.exports = { AppError };
