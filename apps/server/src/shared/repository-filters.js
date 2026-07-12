function appendDateRangeFilters(where, params, filters, column) {
  if (filters.fromDate) {
    where.push(`${column} >= ?`);
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    where.push(`${column} <= ?`);
    params.push(filters.toDate);
  }
}

module.exports = { appendDateRangeFilters };
