const { assertCtxDeps } = require('./ctx-utils');

module.exports = function attach(ctx) {
  assertCtxDeps(ctx, ['db', 'repositories'], 'ticker-suggestions-repository');

  const { db, repositories } = ctx;

  function findGlobalIsinSuggestion(isin) {
    return db
      .prepare(
        `SELECT ii.instrument_symbol AS symbol, ii.display_name AS displayName,
                ii.currency, ii.exchange, i.yahoo_symbol AS yahooSymbol, i.name
         FROM instrument_identifiers ii
         JOIN instruments i ON i.symbol = ii.instrument_symbol
         WHERE ii.provider = 'global' AND ii.identifier_type = 'isin' AND ii.identifier_value = ?
         LIMIT 1`,
      )
      .get(isin);
  }

  repositories.suggestions = {
    ...(repositories.suggestions || {}),
    findGlobalIsinSuggestion,
  };
};
