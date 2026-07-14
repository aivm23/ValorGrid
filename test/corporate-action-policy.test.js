const assert = require('node:assert/strict');
const test = require('node:test');

const {
  evaluateSplitForPosition,
  isSupportedSplitRatio,
} = require('../apps/server/src/domains/corporate-actions/corporate-action-policy');
const {
  isExactTechnicalPair,
  reconcileTechnicalCorporateActionPairs,
} = require('../apps/server/src/domains/data-ingestion/ingestion-corporate-actions');

function technicalRow(rowIndex, type, shares, price, valueEur = 4323.04) {
  return {
    rowIndex,
    status: 'valid',
    rowKind: 'trade',
    errors: [],
    normalized: {
      type,
      symbol: 'GOOG',
      date: '2022-07-18',
      shares,
      price,
      valueEur,
      currency: 'USD',
      fxToEur: 0.9584009506327205,
      commissionEur: 0,
      cashFlowEur: type === 'add' ? -valueEur : valueEur,
      externalId: null,
      externalIdentifiers: [
        { provider: 'global', identifierType: 'isin', identifierValue: 'US02079K1079' },
        { provider: 'broker', identifierType: 'broker_product', identifierValue: 'ALPHABET-C' },
      ],
    },
  };
}

const googleSplit = {
  effectiveDate: '2022-07-18',
  oldShares: 1,
  newShares: 20,
  ratio: 20,
};

test('split policy accepts integer 1:N and N:1 results', () => {
  assert.deepEqual(evaluateSplitForPosition(2, googleSplit), { applied: true, shares: 40, reason: null });
  assert.deepEqual(evaluateSplitForPosition(40, { oldShares: 20, newShares: 1, ratio: 0.05 }), {
    applied: true,
    shares: 2,
    reason: null,
  });
});

test('split policy rejects 21:20, 3:2, empty positions and fractional reverse results', () => {
  assert.equal(isSupportedSplitRatio({ oldShares: 20, newShares: 21, ratio: 1.05 }), false);
  assert.equal(isSupportedSplitRatio({ oldShares: 2, newShares: 3, ratio: 1.5 }), false);
  assert.equal(evaluateSplitForPosition(0, googleSplit).reason, 'no_position');
  assert.equal(evaluateSplitForPosition(3, { oldShares: 2, newShares: 1, ratio: 0.5 }).reason, 'fractional_result');
});

test('technical import pair is ignored only when it exactly matches a valid Yahoo split', async () => {
  const exactRows = [technicalRow(51, 'add', 40, 112.767), technicalRow(52, 'remove', 2, 2255.34)];
  assert.equal(isExactTechnicalPair(exactRows[0], exactRows[1], googleSplit), true);

  const almostRows = [technicalRow(51, 'add', 40, 112.767, 4323.05), technicalRow(52, 'remove', 2, 2255.34)];
  assert.equal(isExactTechnicalPair(almostRows[0], almostRows[1], googleSplit), false);

  const ctx = {
    services: { corporateActions: { getYahooSplitEvents: async () => [googleSplit] } },
    getInstrument: () => ({ symbol: 'GOOG', yahooSymbol: 'GOOG' }),
    addDays: () => '2022-07-17',
    getPositionShares: () => 2,
  };
  const reconciled = await reconcileTechnicalCorporateActionPairs(ctx, exactRows);
  assert.deepEqual(
    reconciled.map((row) => row.status),
    ['ignored', 'ignored'],
  );
  assert.ok(reconciled.every((row) => row.rowKind === 'corporate_action_ignored'));
  assert.ok(reconciled.every((row) => row.normalized.transactionId === null));
});
