function transactionTypeLabel(ctx, type) {
  if (type === 'dividend') return ctx.t('history.events.dividend');
  return type === 'remove' ? ctx.t('history.events.sell') : ctx.t('history.events.buy');
}

function transactionOriginLabel(ctx, origin) {
  if (origin === 'auto') return ctx.t('history.origin.auto.capitalized');
  if (origin === 'import') return ctx.t('history.origin.import.capitalized');
  return ctx.t('history.origin.manual.capitalized');
}

export function attach(ctx) {
  function renderLedger() {
    const { elements, state } = ctx;
    const symbolFilter = elements.ledgerFilterSymbol.value.trim().toUpperCase();
    const originFilter = elements.ledgerFilterOrigin.value;
    const typeFilter = elements.ledgerFilterType.value;
    const fromDate = elements.ledgerFilterFrom.value;
    const toDate = elements.ledgerFilterTo.value;
    const allTransactions = state.transactions || [];
    const filtered = allTransactions
      .filter((item) => !symbolFilter || String(item.symbol || '').toUpperCase().includes(symbolFilter))
      .filter((item) => !originFilter || item.origin === originFilter)
      .filter((item) => !typeFilter || item.type === typeFilter)
      .filter((item) => !fromDate || item.date >= fromDate)
      .filter((item) => !toDate || item.date <= toDate)
      .slice()
      .reverse();

    const pageSize = state.ledgerPageSize || 1000;
    const totalPages = Math.ceil(filtered.length / pageSize);
    const currentPage = Math.min(state.ledgerCurrentPage || 1, totalPages || 1);
    state.ledgerCurrentPage = currentPage;

    const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    state.visibleTransactionIds = rows.map((item) => String(item.id));
    const visibleIds = new Set(state.visibleTransactionIds);
    state.selectedTransactionIds = (state.selectedTransactionIds || []).filter((id) => visibleIds.has(String(id)));
    const selectedIds = new Set(state.selectedTransactionIds);
    const selectedCount = selectedIds.size;

    if (elements.ledgerFilterInfo) elements.ledgerFilterInfo.hidden = true;

    const totals = rows.reduce(
      (acc, item) => {
        const value = Number(item.valueEur || 0);
        if (item.type === 'add') acc.invested += value;
        if (item.type === 'remove') acc.withdrawn += value;
        if (item.type === 'dividend') acc.dividends += value;
        acc.commissions += Number(item.commissionEur || 0);
        acc.cashFlow += Number(item.cashFlowEur || 0);
        return acc;
      },
      { invested: 0, withdrawn: 0, dividends: 0, commissions: 0, cashFlow: 0 },
    );

    const hasFilters = symbolFilter || originFilter || typeFilter || fromDate || toDate;
    const countHtml = hasFilters
      ? `<strong class="ledger-filtered-count">${filtered.length}</strong> / ${allTransactions.length}`
      : `<strong>${filtered.length}</strong>`;

    elements.ledgerTotals.innerHTML = `
      <span>${ctx.t('ledger.totalMovements', { count: countHtml })}</span>
      <span>${ctx.t('ledger.buys')}: <strong>${ctx.formatCurrency(totals.invested)}</strong></span>
      <span>${ctx.t('ledger.sells')}: <strong>${ctx.formatCurrency(totals.withdrawn)}</strong></span>
      <span>${ctx.t('ledger.dividends')}: <strong>${ctx.formatCurrency(totals.dividends)}</strong></span>
      <span>${ctx.t('ledger.fees')}: <strong>${ctx.formatCurrency(totals.commissions)}</strong></span>
      <span>${ctx.t('ledger.cashFlow')}: <strong class="${ctx.moneyClass(totals.cashFlow)}">${ctx.formatCurrency(totals.cashFlow)}</strong></span>
    `;

    if (elements.ledgerSelectionCount) {
      elements.ledgerSelectionCount.textContent = ctx.tn('ledger.selected', selectedCount);
    }
    if (elements.deleteSelectedTransactions) elements.deleteSelectedTransactions.hidden = selectedCount === 0;
    if (elements.selectVisibleTransactions) {
      elements.selectVisibleTransactions.hidden =
        selectedCount === 0 || !state.visibleTransactionIds.length || selectedCount === state.visibleTransactionIds.length;
    }
    if (elements.deselectAllTransactions) elements.deselectAllTransactions.hidden = selectedCount === 0;

    elements.ledgerRows.innerHTML = rows.length
      ? rows
          .map((item) => {
            const id = String(item.id);
            const typeClass = item.type === 'dividend' ? 'type-dividend' : item.type === 'remove' ? 'type-sell' : 'type-buy';
            const originClass = item.origin === 'auto' ? 'origin-auto' : item.origin === 'import' ? 'origin-import' : 'origin-manual';
            const isSelected = selectedIds.has(id);
            return `
          <tr class="${isSelected ? 'is-selected' : ''}" data-transaction-id="${ctx.escapeHtml(id)}">
            <td data-label="${ctx.t('ledger.col.select')}">
              <label class="row-select row-select-only">
                <input type="checkbox" data-select-transaction="${ctx.escapeHtml(id)}" ${isSelected ? 'checked' : ''} aria-label="${ctx.t('ledger.selectMovement', { symbol: ctx.escapeHtml(item.symbol), date: ctx.formatDate(item.date) })}" />
                <span class="sr-only">${ctx.t('ledger.select')}</span>
              </label>
            </td>
            <td data-label="${ctx.t('ledger.col.date')}">${ctx.formatDate(item.date)}</td>
            <td data-label="${ctx.t('ledger.col.ticker')}">${ctx.escapeHtml(item.symbol)}</td>
            <td data-label="${ctx.t('ledger.col.type')}"><span class="type-badge ${typeClass}">${transactionTypeLabel(ctx, item.type)}</span></td>
            <td data-label="${ctx.t('ledger.col.quantity')}">${ctx.formatInstrumentQuantity(item.shares, item)}</td>
            <td data-label="${ctx.t('ledger.col.price')}">${Number(item.price).toFixed(2)} ${ctx.escapeHtml(item.currency)}</td>
            <td data-label="${ctx.t('ledger.col.value')}">${ctx.formatCurrency(Number(item.valueEur))}</td>
            <td data-label="${ctx.t('ledger.col.fee')}">${ctx.formatCurrency(Number(item.commissionEur || 0))}</td>
            <td data-label="${ctx.t('ledger.cashFlow')}"><span class="${ctx.moneyClass(Number(item.cashFlowEur || 0))}">${ctx.formatCurrency(Number(item.cashFlowEur || 0))}</span></td>
            <td data-label="${ctx.t('ledger.col.origin')}"><span class="origin-badge ${originClass}">${transactionOriginLabel(ctx, item.origin)}</span></td>
          </tr>`;
          })
          .join('')
      : `<tr><td colspan="10"><div class="empty-action-state"><span class="subtle">${ctx.t('ledger.empty')}</span></div></td></tr>`;

    if (elements.ledgerPagination) {
      if (totalPages > 1) {
        elements.ledgerPagination.hidden = false;
        elements.ledgerPagination.innerHTML = `
          <button class="button button-compact btn-cancel" type="button" data-ledger-page="prev" ${currentPage === 1 ? 'disabled' : ''}>← ${ctx.t('ledger.previous')}</button>
          <span class="pagination-info">${ctx.t('ledger.page', { current: currentPage, total: totalPages })}</span>
          <button class="button button-compact btn-cancel" type="button" data-ledger-page="next" ${currentPage === totalPages ? 'disabled' : ''}>${ctx.t('ledger.next')} →</button>
        `;
      } else {
        elements.ledgerPagination.hidden = true;
        elements.ledgerPagination.innerHTML = '';
      }
    }
  }

  function goToLedgerPage(direction) {
    const { state } = ctx;
    const pageSize = state.ledgerPageSize || 1000;
    const allTransactions = state.transactions || [];
    const totalPages = Math.ceil(allTransactions.length / pageSize);
    if (direction === 'prev' && state.ledgerCurrentPage > 1) {
      state.ledgerCurrentPage--;
    } else if (direction === 'next' && state.ledgerCurrentPage < totalPages) {
      state.ledgerCurrentPage++;
    }
    renderLedger();
  }

  Object.assign(ctx, {
    transactionTypeLabel: (type) => transactionTypeLabel(ctx, type),
    transactionOriginLabel: (origin) => transactionOriginLabel(ctx, origin),
    renderLedger,
    goToLedgerPage,
  });
}
