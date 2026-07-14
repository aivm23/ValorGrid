const SHARE_EPSILON = 0.0000001;

function normalizeSplit(split = {}) {
  const oldShares = Number(split.oldShares ?? split.old_shares);
  const newShares = Number(split.newShares ?? split.new_shares);
  const ratio = Number(split.ratio ?? (oldShares > 0 ? newShares / oldShares : NaN));
  return { oldShares, newShares, ratio };
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isSupportedSplitRatio(split) {
  const { oldShares, newShares, ratio } = normalizeSplit(split);
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) <= SHARE_EPSILON) return false;
  return (
    (oldShares === 1 && isPositiveInteger(newShares) && newShares > 1) ||
    (newShares === 1 && isPositiveInteger(oldShares) && oldShares > 1)
  );
}

function evaluateSplitForPosition(currentShares, split) {
  const shares = Number(currentShares || 0);
  if (!isSupportedSplitRatio(split)) {
    return { applied: false, shares, reason: 'unsupported_ratio' };
  }
  if (!Number.isFinite(shares) || shares <= SHARE_EPSILON) {
    return { applied: false, shares, reason: 'no_position' };
  }

  const { ratio } = normalizeSplit(split);
  const result = shares * ratio;
  const rounded = Math.round(result);
  if (!Number.isFinite(result) || Math.abs(result - rounded) > SHARE_EPSILON) {
    return { applied: false, shares, reason: 'fractional_result' };
  }
  return { applied: true, shares: rounded, reason: null };
}

module.exports = {
  SHARE_EPSILON,
  evaluateSplitForPosition,
  isSupportedSplitRatio,
  normalizeSplit,
};
