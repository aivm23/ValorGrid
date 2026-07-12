export function createOperationsMetricRenderer(ctx) {
  function metricInfo(label, tooltip, id) {
    const escapedLabel = ctx.escapeHtml(label);
    const escapedTooltip = ctx.escapeHtml(tooltip);
    return `
      <div class="metric-label">
        <span>${escapedLabel}</span>
        <button type="button" class="metric-info-button" aria-label="${ctx.escapeHtml(ctx.t('common.metricInfo'))}" aria-describedby="${id}">i</button>
        <span id="${id}" class="sr-only">${escapedTooltip}</span>
        <div class="metric-info-tooltip" role="tooltip" aria-hidden="true">${escapedTooltip}</div>
      </div>`;
  }

  function renderMetricContent(metricId, props) {
    const {
      currentValue,
      netContributed,
      contributedMicro,
      contributedTooltip,
      totalGain,
      resultMicro,
      resultTooltip,
      unrealizedGain,
      latentMicro,
      latentTooltip,
      openInvestment,
      performance,
      commissionCopy,
    } = props;
    switch (metricId) {
      case 'marketValue':
        return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.marketValue.label'))}</span>
              <strong>${ctx.formatCurrency(currentValue)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.marketValue.micro'))}</small>`;
      case 'netContributed':
        return `
              ${metricInfo(ctx.t('operations.metrics.netContributed.label'), contributedTooltip, 'op-contributed-info')}
              <strong class="${ctx.moneyClass(netContributed)}">${ctx.formatCurrency(netContributed)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(contributedMicro)}</small>`;
      case 'totalGain':
        return `
              ${metricInfo(ctx.t('operations.metrics.totalGain.label'), resultTooltip, 'op-result-info')}
              <strong class="${ctx.moneyClass(totalGain)}">${ctx.formatCurrency(totalGain)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(resultMicro)}</small>`;
      case 'unrealizedGain':
        return `
              ${metricInfo(ctx.t('operations.metrics.unrealizedGain.label'), latentTooltip, 'op-latent-info')}
              <strong class="${ctx.moneyClass(unrealizedGain)}">${ctx.formatCurrency(unrealizedGain)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(latentMicro)}</small>`;
      case 'realizedGain':
        return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.realizedGain.label'))}</span>
              <strong class="${ctx.moneyClass(performance.realizedGain)}">${ctx.formatCurrency(performance.realizedGain)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.realizedGain.micro'))}</small>`;
      case 'commissions':
        return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.commissions.label'))}</span>
              <strong>${ctx.formatCurrency(performance.commissions)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(commissionCopy)}</small>`;
      case 'simpleReturnPct': {
        const pct = performance.simpleReturnPct;
        const displayPct = pct !== null ? ctx.formatPercent(pct) : ctx.t('common.notAvailable');
        const microText =
          pct !== null
            ? ctx.t('operations.metrics.simpleReturnPct.micro.available')
            : ctx.t('operations.metrics.simpleReturnPct.micro.unavailable');
        return `
              ${metricInfo(ctx.t('operations.metrics.simpleReturnPct.label'), ctx.t('operations.metrics.simpleReturnPct.tooltip'), 'op-simplereturn-info')}
              <strong>${ctx.escapeHtml(displayPct)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(microText)}</small>`;
      }
      case 'transactionCount':
        return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.transactionCount.label'))}</span>
              <strong>${performance.transactionCount || 0}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.transactionCount.micro'))}</small>`;
      case 'averageCommission':
        return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.averageCommission.label'))}</span>
              <strong>${performance.transactionCount > 0 ? ctx.formatCurrency(performance.commissions / performance.transactionCount) : ctx.escapeHtml(ctx.t('common.notAvailable'))}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.averageCommission.micro'))}</small>`;
      case 'openInvestment':
        return `
              ${metricInfo(ctx.t('operations.metrics.openInvestment.label'), ctx.t('operations.metrics.openInvestment.tooltip'), 'op-openinvestment-info')}
              <strong>${ctx.formatCurrency(openInvestment)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.openInvestment.micro'))}</small>`;
      case 'netCashFlow':
        return `
              ${metricInfo(ctx.t('operations.metrics.netCashFlow.label'), ctx.t('operations.metrics.netCashFlow.tooltip'), 'op-netcashflow-info')}
              <strong class="${ctx.moneyClass(performance.netCashFlow)}">${ctx.formatCurrency(performance.netCashFlow)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.netCashFlow.micro'))}</small>`;
      case 'grossBought':
        return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.grossBought.label'))}</span>
              <strong>${ctx.formatCurrency(performance.grossInvested || 0)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.grossBought.micro'))}</small>`;
      case 'grossSold':
        return `
              <span>${ctx.escapeHtml(ctx.t('operations.metrics.grossSold.label'))}</span>
              <strong>${ctx.formatCurrency(performance.grossWithdrawn || 0)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.t('operations.metrics.grossSold.micro'))}</small>`;
      case 'dividendIncome': {
        const dividendCount = performance.dividendCount || 0;
        return `
              ${metricInfo(ctx.t('Dividendos'), ctx.t('operations.metrics.dividendIncome.tooltip'), 'op-dividends-info')}
              <strong>${ctx.formatCurrency(performance.dividendIncomeEur || 0)}</strong>
              <small class="metric-micro">${ctx.escapeHtml(ctx.tn('operations.metrics.dividendIncome.micro', dividendCount))}</small>`;
      }
      default:
        return '';
    }
  }

  return { metricInfo, renderMetricContent };
}
