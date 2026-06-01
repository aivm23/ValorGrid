const { AppError } = require('./app-error');

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {string} [errorCode]
 */
function assertPresent(value, fieldName, errorCode) {
  if (value === undefined || value === null || value === '') {
    throw new AppError(400, `${fieldName} is required`, errorCode || 'MISSING_FIELD');
  }
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 */
function assertPositiveNumber(value, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new AppError(400, `${fieldName} must be a positive number`, 'INVALID_AMOUNT');
  }
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 */
function assertString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(400, `${fieldName} must be a non-empty string`, 'INVALID_STRING');
  }
}

/**
 * @param {unknown} value
 * @param {string[]} allowed
 * @param {string} fieldName
 */
function assertOneOf(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new AppError(
      400,
      `${fieldName} must be one of: ${allowed.join(', ')}`,
      'INVALID_VALUE',
    );
  }
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {string} fieldName
 */
function assertInRange(value, min, max, fieldName) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new AppError(400, `${fieldName} must be between ${min} and ${max}`, 'OUT_OF_RANGE');
  }
}

/**
 * Valida que exactamente uno de dos campos esté presente (XOR).
 * @param {boolean} hasA
 * @param {boolean} hasB
 * @param {string} nameA
 * @param {string} nameB
 */
function assertXor(hasA, hasB, nameA, nameB) {
  if (hasA === hasB) {
    throw new AppError(400, `Provide ${nameA} or ${nameB}, but not both`, 'AMBIGUOUS_INPUT');
  }
}

module.exports = {
  assertPresent,
  assertPositiveNumber,
  assertString,
  assertOneOf,
  assertInRange,
  assertXor,
};
