function transactionTypeLabel(type) {
  return type === 'remove' ? 'Venta' : 'Compra';
}

function transactionOriginLabel(origin) {
  if (origin === 'auto') return 'Automático';
  if (origin === 'import') return 'Importado';
  return 'Manual';
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
    const rows = allTransactions
      .filter((item) => !symbolFilter || String(item.symbol || '').toUpperCase().includes(symbolFilter))
      .filter((item) => !originFilter || item.origin === originFilter)
      .filter((item) => !typeFilter || item.type === typeFilter)
      .filter((item) => !fromDate || item.date >= fromDate)
      .filter((item) => !toDate || item.date <= toDate)
      .slice()
      .reverse();

    state.visibleTransactionIds = rows.map((item) => String(item.id));
    const visibleIds = new Set(state.visibleTransactionIds);
    state.selectedTransactionIds = (state.selectedTransactionIds || []).filter((id) => visibleIds.has(String(id)));
    const selectedIds = new Set(state.selectedTransactionIds);
    const selectedCount = selectedIds.size;

    const hasFilters = symbolFilter || originFilter || typeFilter || fromDate || toDate;
    if (elements.ledgerFilterInfo) {
      if (hasFilters) {
        const parts = [];
        if (fromDate || toDate) {
          const fromLabel = fromDate ? ctx.formatDate(fromDate) : 'inicio';
          const toLabel = toDate ? ctx.formatDate(toDate) : 'hoy';
          parts.push(`Período: ${fromLabel} – ${toLabel}`);
        }
        elements.ledgerFilterInfo.textContent = `Mostrando ${rows.length} de ${allTransactions.length} movimientos${parts.length ? ' · ' + parts.join(' · ') : ''}`;
        elements.ledgerFilterInfo.hidden = false;
      } else {
        elements.ledgerFilterInfo.hidden = true;
      }
    }

    const totals = rows.reduce(
      (acc, item) => {
        const value = Number(item.valueEur || 0);
        if (item.type === 'add') acc.invested += value;
        if (item.type === 'remove') acc.withdrawn += value;
        acc.commissions += Number(item.commissionEur || 0);
        acc.cashFlow += Number(item.cashFlowEur || 0);
        return acc;
      },
      { invested: 0, withdrawn: 0, commissions: 0, cashFlow: 0 },
    );
    elements.ledgerTotals.innerHTML = `
      <span>Movimientos: <strong>${rows.length}</strong></span>
      <span>Compras: <strong>${ctx.formatCurrency(totals.invested)}</strong></span>
      <span>Ventas: <strong>${ctx.formatCurrency(totals.withdrawn)}</strong></span>
      <span>Comisiones: <strong>${ctx.formatCurrency(totals.commissions)}</strong></span>
      <span>Cash-flow: <strong class="${ctx.moneyClass(totals.cashFlow)}">${ctx.formatCurrency(totals.cashFlow)}</strong></span>
    `;

    if (elements.ledgerSelectionCount) {
      elements.ledgerSelectionCount.textContent = `${selectedCount} movimiento${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}`;
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
            const typeClass = item.type === 'remove' ? 'type-sell' : 'type-buy';
            const originClass = item.origin === 'auto' ? 'origin-auto' : item.origin === 'import' ? 'origin-import' : 'origin-manual';
            const isSelected = selectedIds.has(id);
            return `
          <tr class="${isSelected ? 'is-selected' : ''}">
            <td data-label="Sel.">
              <label class="row-select row-select-only">
                <input type="checkbox" data-select-transaction="${ctx.escapeHtml(id)}" ${isSelected ? 'checked' : ''} aria-label="Seleccionar movimiento ${ctx.escapeHtml(item.symbol)} ${ctx.formatDate(item.date)}" />
                <span class="sr-only">Seleccionar</span>
              </label>
            </td>
            <td data-label="Fecha">${ctx.formatDate(item.date)}</td>
            <td data-label="Ticker">${ctx.escapeHtml(item.symbol)}</td>
            <td data-label="Tipo"><span class="type-badge ${typeClass}">${transactionTypeLabel(item.type)}</span></td>
            <td data-label="Acciones">${ctx.formatShareNumber(item.shares)}</td>
            <td data-label="Precio">${Number(item.price).toFixed(2)} ${ctx.escapeHtml(item.currency)}</td>
            <td data-label="Valor">${ctx.formatCurrency(Number(item.valueEur))}</td>
            <td data-label="Comisión">${ctx.formatCurrency(Number(item.commissionEur || 0))}</td>
            <td data-label="Cash-flow"><span class="${ctx.moneyClass(Number(item.cashFlowEur || 0))}">${ctx.formatCurrency(Number(item.cashFlowEur || 0))}</span></td>
            <td data-label="Origen"><span class="origin-badge ${originClass}">${transactionOriginLabel(item.origin)}</span></td>
          </tr>`;
          })
          .join('')
      : '<tr><td colspan="10"><div class="empty-action-state"><span class="subtle">Sin movimientos para este filtro.</span></div></td></tr>';
  }

  Object.assign(ctx, { transactionTypeLabel, transactionOriginLabel, renderLedger });
}
