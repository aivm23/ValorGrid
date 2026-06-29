# Financial Semantics

ValorGrid metrics use explicit sign conventions.

- Market value: current value of open positions.
- Net contributed: buys and fees minus net sells.
- Current result: market value minus net contributed.
- Realized result: FIFO result from sales.
- Unrealized result: open-position gain/loss.
- Fees: confirmed transaction fees.
- Historical `contributed`: accumulated net contribution used by the materialized history.

Financial formulas must stay aligned with source code and tests.
