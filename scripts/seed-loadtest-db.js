const path = require('node:path');
const { seedLoadtestDb } = require('./loadtest-data');

process.env.PORTFOLIO_DB_PATH =
  process.env.PORTFOLIO_DB_PATH || path.join(__dirname, '..', 'local', 'valorgrid', 'data', 'portfolio.loadtest.sqlite');
process.env.PORT = process.env.PORT || '0';

const { db } = require('../apps/server/server');

try {
  const result = seedLoadtestDb(db, {
    from: process.env.LOADTEST_FROM || '2023-01-01',
    to: process.env.LOADTEST_TO || new Date().toISOString().slice(0, 10),
  });
  console.log(
    JSON.stringify(
      {
        dbPath: process.env.PORTFOLIO_DB_PATH,
        ...result,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
