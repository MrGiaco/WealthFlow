/* ================================================================
   WealthFlow — js/portfolio.js
   Portafoglio: CRUD titoli, calcolo PMC/gain/loss, render UI
   ================================================================ */
'use strict';

WF.Portfolio = (() => {

  let _data = null;  // riferimento a WF.App.data

  function setData(data) { _data = data; }
  function getData()     { return _data; }

  // ── Stats calculation ───────────────────────────────────────────
  function calcSecurityStats(security) {
    const quote = WF.Quotes.getQuote(security.ticker);
    const totalCost  = (security.quantity || 0) * (security.avgCost || 0);
    const currentPrice = quote?.price || null;
    const totalValue   = currentPrice !== null ? (security.quantity || 0) * currentPrice : null;
    const gainLoss     = totalValue !== null ? totalValue - totalCost : null;
    const gainLossPct  = totalCost > 0 && gainLoss !== null ? (gainLoss / totalCost) * 100 : null;
    const dailyChange  = quote?.change || null;
    const dailyChangePct = quote?.changePercent || null;
    const dailyTotal   = dailyChange !== null ? (security.quantity || 0) * dailyChange : null;

    return {
      totalCost,
      currentPrice,
      totalValue,
      gainLoss,
      gainLossPct,
      dailyChange,
      dailyChangePct,
      dailyTotal,
      quote,
    };
  }

  function calcPortfolioStats(portfolio = []) {
    let totalInvested = 0;
    let totalValue    = 0;
    let totalGain     = 0;
    let dailyGain     = 0;
    let hasLiveData   = false;

    portfolio.forEach(sec => {
      const stats = calcSecurityStats(sec);
      totalInvested += stats.totalCost;
      if (stats.totalValue !== null) {
        totalValue += stats.totalValue;
        totalGain  += stats.gainLoss;
        hasLiveData = true;
      } else {
        totalValue += stats.totalCost; // fallback: use cost
      }
      if (stats.dailyTotal !== null) dailyGain += stats.dailyTotal;
    });

    const gainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
    const dailyGainPct = totalInvested > 0 ? (dailyGain / totalInvested) * 100 : 0;

    return {
      totalInvested,
      totalValue,
      totalGain,
      gainPct,
      dailyGain,
      dailyGainPct,
      hasLiveData,
      count: portfolio.length,
    };
  }

  // ── CRUD ────────────────────────────────────────────────────────
  function add(security) {
    if (!_data) return;
    security.id = WF.Utils.uuid();
    security.addedAt = new Date().toISOString();
    _data.portfolio.push(security);
    WF.Utils.Events.emit('portfolio:changed');
    return security;
  }

  function update(id, changes) {
    if (!_data) return;
    const idx = _data.portfolio.findIndex(s => s.id === id);
    if (idx === -1) return;
    Object.assign(_data.portfolio[idx], changes);
    WF.Utils.Events.emit('portfolio:changed');
    return _data.portfolio[idx];
  }

  function remove(id) {
    if (!_data) return;
    _data.portfolio = _data.portfolio.filter(s => s.id !== id);
    WF.Utils.Events.emit('portfolio:changed');
  }

  function getAll(category = 'all', accountId = null) {
    if (!_data) return [];
    let list = _data.portfolio;
    if (category !== 'all') list = list.filter(s => s.category === category);
    if (accountId)          list = list.filter(s => s.accountId === accountId);
    return list;
  }

  function getById(id) {
    return _data?.portfolio.find(s => s.id === id) || null;
  }

  // ── Allocation breakdown ────────────────────────────────────────
  function getAllocationByCategory(portfolio = []) {
    const map = {};
    portfolio.forEach(s => {
      const stats = calcSecurityStats(s);
      const val   = stats.totalValue ?? stats.totalCost;
      const cat   = s.category || 'altro';
      map[cat] = (map[cat] || 0) + val;
    });
    return map;
  }

  // ── Render: investments list ────────────────────────────────────
  function renderList(portfolio, container, onSelect) {
    if (!container) return;
    if (!portfolio.length) {
      container.innerHTML = '';
      document.getElementById('inv-empty')?.classList.remove('hidden');
      return;
    }
    document.getElementById('inv-empty')?.classList.add('hidden');

    container.innerHTML = portfolio.map(sec => {
      const stats = calcSecurityStats(sec);
      const gainCls = WF.Utils.gainClass(stats.gainLoss);
      const gainIcon = WF.Utils.gainIcon(stats.gainLoss, 11);
      const acronym = WF.Utils.tickerInitials(sec.ticker);
      const catColor = WF.Utils.categoryColor(sec.category);
      const catLabel = WF.Utils.categoryLabel(sec.category);

      const priceStr  = stats.currentPrice !== null
        ? WF.Utils.formatNumber(stats.currentPrice, 4)
        : '—';
      const totalStr  = stats.totalValue !== null
        ? WF.Utils.formatEuro(stats.totalValue)
        : WF.Utils.formatEuro(stats.totalCost);
      const gainStr   = stats.gainLoss !== null
        ? `${stats.gainLoss >= 0 ? '+' : ''}${WF.Utils.formatEuro(stats.gainLoss)} (${WF.Utils.formatPercent(stats.gainLossPct)})`
        : `PMC: ${WF.Utils.formatNumber(sec.avgCost, 4)}`;

      return `
        <div class="security-item" data-id="${sec.id}" role="button" tabindex="0">
          <div class="security-avatar" style="background:${catColor}22;color:${catColor};">${acronym}</div>
          <div style="flex:1;min-width:0;">
            <div class="security-name truncate">${sec.name}</div>
            <div class="security-meta">
              <span>${sec.ticker}</span>
              <span style="margin:0 4px;opacity:.4;">·</span>
              <span style="color:${catColor};font-size:10px;font-weight:600;">${catLabel}</span>
              <span style="margin:0 4px;opacity:.4;">·</span>
              <span>${WF.Utils.formatNumber(sec.quantity, 4)} pz</span>
            </div>
          </div>
          <div class="security-right">
            <div class="security-value">${totalStr}</div>
            <div class="security-gain ${gainCls}">
              ${gainIcon} ${gainStr}
            </div>
          </div>
        </div>`;
    }).join('');

    // Attach click handlers
    container.querySelectorAll('.security-item').forEach(item => {
      item.addEventListener('click', () => {
        container.querySelectorAll('.security-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        const sec = getById(item.dataset.id);
        if (sec && onSelect) onSelect(sec);
      });
    });
  }

  // ── Render: security detail (desktop panel / mobile modal) ──────
  function renderDetail(security, container) {
    if (!container || !security) return;
    const stats = calcSecurityStats(security);
    const gainCls = WF.Utils.gainClass(stats.gainLoss);
    const acronym = WF.Utils.tickerInitials(security.ticker);
    const catColor = WF.Utils.categoryColor(security.category);
    const quote = stats.quote;

    const priceDisplay = stats.currentPrice !== null
      ? WF.Utils.formatNumber(stats.currentPrice, 4) + ' ' + (security.currency || 'EUR')
      : '—';

    const changePct = quote?.changePercent;
    const changeStr = changePct !== null && changePct !== undefined
      ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
      : '—%';

    const gainLossDisplay = stats.gainLoss !== null
      ? `${stats.gainLoss >= 0 ? '+' : ''}${WF.Utils.formatEuro(stats.gainLoss)}`
      : '—';
    const gainPctDisplay = stats.gainLossPct !== null
      ? `${stats.gainLossPct >= 0 ? '+' : ''}${stats.gainLossPct.toFixed(2)}%`
      : '—';

    // Account name
    const account = _data?.accounts.find(a => a.id === security.accountId);
    const accountName = account?.name || '—';

    container.innerHTML = `
      <div class="security-detail-header">
        <div class="security-detail-avatar" style="background:${catColor}22;color:${catColor};">${acronym}</div>
        <div style="flex:1;min-width:0;">
          <div class="security-detail-title truncate">${security.name}</div>
          <div class="security-detail-ticker">${security.ticker}${security.isin ? ' · ' + security.isin : ''}</div>
        </div>
        <div>
          <div class="security-detail-price">${priceDisplay}</div>
          <div class="security-detail-change ${WF.Utils.gainClass(changePct)}" style="text-align:right;">${changeStr} oggi</div>
        </div>
      </div>

      <!-- P&L highlight -->
      <div class="profit-card ${gainCls}" style="margin:var(--sp-4);">
        <div class="profit-label">Guadagno / Perdita Totale</div>
        <div class="profit-value">${gainLossDisplay}</div>
        <div class="profit-pct">
          ${WF.Utils.gainIcon(stats.gainLoss, 14)}
          ${gainPctDisplay} sul costo totale
        </div>
      </div>

      <!-- Detail stats grid -->
      <div class="detail-stats-grid">
        <div class="detail-stat-cell">
          <div class="detail-stat-label">Quantità</div>
          <div class="detail-stat-val">${WF.Utils.formatNumber(security.quantity, 4)} pz</div>
        </div>
        <div class="detail-stat-cell">
          <div class="detail-stat-label">PMC</div>
          <div class="detail-stat-val">${WF.Utils.formatNumber(security.avgCost, 4)} ${security.currency || 'EUR'}</div>
        </div>
        <div class="detail-stat-cell">
          <div class="detail-stat-label">Costo Totale Carico</div>
          <div class="detail-stat-val">${WF.Utils.formatEuro(stats.totalCost)}</div>
        </div>
        <div class="detail-stat-cell">
          <div class="detail-stat-label">Valore Attuale</div>
          <div class="detail-stat-val">${stats.totalValue !== null ? WF.Utils.formatEuro(stats.totalValue) : '—'}</div>
        </div>
        <div class="detail-stat-cell">
          <div class="detail-stat-label">Variazione Oggi (€)</div>
          <div class="detail-stat-val ${WF.Utils.gainClass(stats.dailyTotal)}">${stats.dailyTotal !== null ? (stats.dailyTotal >= 0 ? '+' : '') + WF.Utils.formatEuro(stats.dailyTotal) : '—'}</div>
        </div>
        <div class="detail-stat-cell">
          <div class="detail-stat-label">Variazione Oggi (%)</div>
          <div class="detail-stat-val ${WF.Utils.gainClass(stats.dailyChangePct)}">${stats.dailyChangePct !== null ? (stats.dailyChangePct >= 0 ? '+' : '') + stats.dailyChangePct.toFixed(2) + '%' : '—'}</div>
        </div>
        <div class="detail-stat-cell">
          <div class="detail-stat-label">Categoria</div>
          <div class="detail-stat-val">${WF.Utils.categoryLabel(security.category)}</div>
        </div>
        <div class="detail-stat-cell">
          <div class="detail-stat-label">Conto</div>
          <div class="detail-stat-val">${accountName}</div>
        </div>
      </div>

      ${security.notes ? `
      <div style="padding:var(--sp-4);">
        <div style="font-size:var(--text-xs);color:var(--text-3);margin-bottom:4px;font-weight:600;">NOTE</div>
        <div style="font-size:var(--text-sm);color:var(--text-2);line-height:1.5;">${security.notes}</div>
      </div>` : ''}

      <!-- Actions -->
      <div class="flex gap-3" style="padding:var(--sp-4);border-top:1px solid var(--border);">
        <button class="btn btn--secondary flex-1" data-action="edit-security" data-id="${security.id}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          Modifica
        </button>
        <button class="btn btn--danger" data-action="delete-security" data-id="${security.id}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          Elimina
        </button>
      </div>`;
  }

  // ── Modal: populate form ────────────────────────────────────────
  function openAddModal() {
    document.getElementById('security-edit-id').value = '';
    document.getElementById('modal-security-title').textContent = 'Nuovo Titolo';
    document.getElementById('security-name').value = '';
    document.getElementById('security-ticker').value = '';
    document.getElementById('security-isin').value = '';
    document.getElementById('security-category').value = 'azione';
    document.getElementById('security-quantity').value = '';
    document.getElementById('security-avg-cost').value = '';
    document.getElementById('security-notes').value = '';
    document.getElementById('security-currency').value = 'EUR';
    document.getElementById('security-calc-total').textContent = '€ 0.00';
    _populateAccountSelect('security-account', '');
    WF.App.openModal('modal-security');
  }

  function openEditModal(security) {
    document.getElementById('security-edit-id').value = security.id;
    document.getElementById('modal-security-title').textContent = 'Modifica Titolo';
    document.getElementById('security-name').value = security.name || '';
    document.getElementById('security-ticker').value = security.ticker || '';
    document.getElementById('security-isin').value = security.isin || '';
    document.getElementById('security-category').value = security.category || 'azione';
    document.getElementById('security-quantity').value = security.quantity || '';
    document.getElementById('security-avg-cost').value = security.avgCost || '';
    document.getElementById('security-notes').value = security.notes || '';
    document.getElementById('security-currency').value = security.currency || 'EUR';
    document.getElementById('security-calc-total').textContent = WF.Utils.formatEuro((security.quantity || 0) * (security.avgCost || 0));
    _populateAccountSelect('security-account', security.accountId || '');
    WF.App.openModal('modal-security');
  }

  function _populateAccountSelect(selectId, selectedId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const accounts = _data?.accounts || [];
    sel.innerHTML = `<option value="">— Seleziona conto —</option>` +
      accounts.map(a => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${a.name}</option>`).join('');
  }

  // ── Save from modal ─────────────────────────────────────────────
  function saveFromModal() {
    const id       = document.getElementById('security-edit-id').value;
    const name     = document.getElementById('security-name').value.trim();
    const ticker   = document.getElementById('security-ticker').value.trim().toUpperCase();
    const category = document.getElementById('security-category').value;
    const quantity = parseFloat(document.getElementById('security-quantity').value) || 0;
    const avgCost  = parseFloat(document.getElementById('security-avg-cost').value) || 0;

    if (!name)   { WF.Utils.toast('Inserisci il nome del titolo', 'error'); return false; }
    if (!ticker) { WF.Utils.toast('Inserisci il ticker', 'error'); return false; }
    if (quantity <= 0) { WF.Utils.toast('La quantità deve essere > 0', 'error'); return false; }
    if (avgCost <= 0)  { WF.Utils.toast('Il PMC deve essere > 0', 'error'); return false; }

    const security = {
      name, ticker, category, quantity, avgCost,
      isin:      document.getElementById('security-isin').value.trim().toUpperCase(),
      accountId: document.getElementById('security-account').value,
      currency:  document.getElementById('security-currency').value,
      notes:     document.getElementById('security-notes').value.trim(),
    };

    if (id) {
      update(id, security);
      WF.Utils.toast('Titolo aggiornato', 'success');
    } else {
      add(security);
      WF.Utils.toast('Titolo aggiunto', 'success');
    }
    return true;
  }

  // ── Delete with confirm ─────────────────────────────────────────
  function confirmDelete(id) {
    const sec = getById(id);
    if (!sec) return;
    if (confirm(`Eliminare "${sec.name}"?\nQuantità: ${sec.quantity} pz · PMC: ${WF.Utils.formatEuro(sec.avgCost)}`)) {
      remove(id);
      WF.Utils.toast('Titolo eliminato', 'info');
    }
  }

  // ── Init ────────────────────────────────────────────────────────
  function init(data) {
    setData(data);

    // Live calc in modal
    const qInput = document.getElementById('security-quantity');
    const pInput = document.getElementById('security-avg-cost');
    const calcTotal = document.getElementById('security-calc-total');
    const updateCalc = () => {
      const q = parseFloat(qInput?.value) || 0;
      const p = parseFloat(pInput?.value) || 0;
      if (calcTotal) calcTotal.textContent = WF.Utils.formatEuro(q * p);
    };
    qInput?.addEventListener('input', updateCalc);
    pInput?.addEventListener('input', updateCalc);

    // Save button
    document.getElementById('save-security-btn')?.addEventListener('click', () => {
      if (saveFromModal()) {
        WF.App.closeModal('modal-security');
        WF.App.save();
        WF.App.renderAll();
      }
    });

    // Add buttons
    ['add-security-btn', 'add-security-btn-empty', 'add-security-fab'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', openAddModal);
    });

    // Edit/delete from detail panel
    document.addEventListener('click', e => {
      const editBtn = e.target.closest('[data-action="edit-security"]');
      if (editBtn) {
        const sec = getById(editBtn.dataset.id);
        if (sec) { WF.App.closeModal('modal-security-detail'); openEditModal(sec); }
      }
      const delBtn = e.target.closest('[data-action="delete-security"]');
      if (delBtn) {
        WF.App.closeModal('modal-security-detail');
        confirmDelete(delBtn.dataset.id);
        WF.App.save(); WF.App.renderAll();
      }
    });
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    init, setData,
    add, update, remove, getAll, getById,
    calcSecurityStats, calcPortfolioStats, getAllocationByCategory,
    renderList, renderDetail,
    openAddModal, openEditModal, saveFromModal,
    confirmDelete,
  };

})();
