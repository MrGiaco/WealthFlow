/* ================================================================
   WealthFlow — js/transactions.js
   Movimenti: CRUD, saldo conti, import CSV/Excel, render
   ================================================================ */
'use strict';

WF.Transactions = (() => {

  let _data = null;
  let _filterType = 'all';
  let _filterAccount = 'all';
  let _searchQuery = '';
  let _importRows = [];
  let _importHeaders = [];

  function setData(data) { _data = data; }
  function getData()     { return _data; }

  // ── Account balance calculation ─────────────────────────────────
  function calcAccountBalance(accountId) {
    if (!_data) return 0;
    const account = _data.accounts.find(a => a.id === accountId);
    const base    = account?.initialBalance || 0;
    const txTotal = _data.transactions
      .filter(t => t.accountId === accountId)
      .reduce((sum, t) => {
        if (t.type === 'income')   return sum + Math.abs(t.amount);
        if (t.type === 'expense')  return sum - Math.abs(t.amount);
        if (t.type === 'buy')      return sum - Math.abs(t.amount);
        if (t.type === 'sell')     return sum + Math.abs(t.amount);
        if (t.type === 'transfer') return sum - Math.abs(t.amount); // outgoing
        return sum;
      }, 0);
    // Add incoming transfers
    const transfersIn = _data.transactions
      .filter(t => t.type === 'transfer' && t.transferToAccountId === accountId)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return base + txTotal + transfersIn;
  }

  function calcTotalLiquidity() {
    if (!_data) return 0;
    return _data.accounts.reduce((sum, a) => sum + calcAccountBalance(a.id), 0);
  }

  // ── CRUD ────────────────────────────────────────────────────────
  function add(tx) {
    if (!_data) return;
    tx.id = WF.Utils.uuid();
    tx.createdAt = new Date().toISOString();
    _data.transactions.push(tx);
    _data.transactions.sort((a, b) => b.date.localeCompare(a.date));
    WF.Utils.Events.emit('transactions:changed');
    return tx;
  }

  function update(id, changes) {
    if (!_data) return;
    const idx = _data.transactions.findIndex(t => t.id === id);
    if (idx === -1) return;
    Object.assign(_data.transactions[idx], changes);
    _data.transactions.sort((a, b) => b.date.localeCompare(a.date));
    WF.Utils.Events.emit('transactions:changed');
    return _data.transactions[idx];
  }

  function remove(id) {
    if (!_data) return;
    _data.transactions = _data.transactions.filter(t => t.id !== id);
    WF.Utils.Events.emit('transactions:changed');
  }

  function getFiltered() {
    if (!_data) return [];
    let list = [..._data.transactions];

    if (_filterType !== 'all')    list = list.filter(t => t.type === _filterType);
    if (_filterAccount !== 'all') list = list.filter(t => t.accountId === _filterAccount);
    if (_searchQuery) {
      const q = _searchQuery.toLowerCase();
      list = list.filter(t =>
        t.description?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  // ── Render transactions list ────────────────────────────────────
  function renderList(container) {
    if (!container) return;
    const txs = getFiltered();
    const empty = document.getElementById('tx-empty');

    if (!txs.length) {
      container.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    // Group by date
    const groups = {};
    txs.forEach(t => {
      const key = WF.Utils.dateGroupKey(t.date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    container.innerHTML = Object.entries(groups).map(([dateLabel, list]) => `
      <div class="tx-date-header">${dateLabel}</div>
      ${list.map(t => _renderTxItem(t)).join('')}
    `).join('');

    // Click handlers
    container.querySelectorAll('.tx-item').forEach(item => {
      item.addEventListener('click', () => {
        const tx = _data?.transactions.find(t => t.id === item.dataset.id);
        if (tx) _openEditModal(tx);
      });
    });
  }

  function _renderTxItem(tx) {
    const account = _data?.accounts.find(a => a.id === tx.accountId);
    const accountName = account?.name || '—';
    const isIncome = tx.type === 'income' || tx.type === 'sell';
    const isExpense = tx.type === 'expense' || tx.type === 'buy';
    const amountCls = isIncome ? 'income' : isExpense ? 'expense' : 'neutral';
    const amountSign = isIncome ? '+' : isExpense ? '-' : '';
    const icon = _typeIcon(tx.type, tx.category);
    const iconCls = tx.type === 'transfer' ? 'transfer' : isIncome ? 'income' : isExpense ? 'expense' : 'neutral';

    return `
      <div class="tx-item" data-id="${tx.id}">
        <div class="tx-icon-wrap ${iconCls}">${icon}</div>
        <div style="flex:1;min-width:0;">
          <div class="tx-desc truncate">${tx.description || '—'}</div>
          <div class="tx-sub">${accountName} · ${WF.Utils.categoryLabel ? WF.Utils.categoryLabel(tx.category) : tx.category || ''}</div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${amountCls}">${amountSign}${WF.Utils.formatEuro(Math.abs(tx.amount))}</div>
          <div class="tx-date">${WF.Utils.formatDate(tx.date, 'short')}</div>
        </div>
      </div>`;
  }

  function _typeIcon(type, category) {
    const icons = {
      income:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="m17 7-5-5-5 5"/></svg>`,
      expense:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="m17 17-5 5-5-5"/></svg>`,
      transfer: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>`,
      buy:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
      sell:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
    };
    // Category-specific icons
    const catIcons = {
      affitto:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
      spesa:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
      trasporto:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
      stipendio:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
      dividendo:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>`,
      ristorante: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
    };
    return catIcons[category] || icons[type] || icons.expense;
  }

  // ── Modal helpers ───────────────────────────────────────────────
  function openAddModal(type = 'expense') {
    document.getElementById('tx-edit-id').value = '';
    document.getElementById('modal-tx-title').textContent = 'Nuovo Movimento';
    document.getElementById('tx-description').value = '';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-date').value = WF.Utils.todayISO();
    document.getElementById('tx-notes').value = '';
    document.getElementById('tx-type').value = type;
    document.getElementById('tx-to-account-group').style.display = 'none';

    // Set active type pill
    document.querySelectorAll('[data-tx-type-select]').forEach(b => {
      b.classList.toggle('active', b.dataset.txTypeSelect === type);
    });

    _populateTxAccountSelects('');
    WF.App.openModal('modal-transaction');
  }

  function _openEditModal(tx) {
    document.getElementById('tx-edit-id').value = tx.id;
    document.getElementById('modal-tx-title').textContent = 'Modifica Movimento';
    document.getElementById('tx-description').value = tx.description || '';
    document.getElementById('tx-amount').value = Math.abs(tx.amount);
    document.getElementById('tx-date').value = tx.date || WF.Utils.todayISO();
    document.getElementById('tx-notes').value = tx.notes || '';
    document.getElementById('tx-type').value = tx.type;
    document.getElementById('tx-category').value = tx.category || 'altro_uscita';

    // Set active type pill
    document.querySelectorAll('[data-tx-type-select]').forEach(b => {
      b.classList.toggle('active', b.dataset.txTypeSelect === tx.type);
    });

    // Transfer account
    document.getElementById('tx-to-account-group').style.display =
      tx.type === 'transfer' ? '' : 'none';

    _populateTxAccountSelects(tx.accountId, tx.transferToAccountId);
    WF.App.openModal('modal-transaction');
  }

  function _populateTxAccountSelects(selectedId, toId = '') {
    const accounts = _data?.accounts || [];
    const options  = `<option value="">— Seleziona —</option>` +
      accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

    const sel1 = document.getElementById('tx-account');
    const sel2 = document.getElementById('tx-to-account');
    if (sel1) { sel1.innerHTML = options; sel1.value = selectedId; }
    if (sel2) { sel2.innerHTML = options; sel2.value = toId; }
  }

  function saveFromModal() {
    const id   = document.getElementById('tx-edit-id').value;
    const type = document.getElementById('tx-type').value;
    const desc = document.getElementById('tx-description').value.trim();
    const amt  = parseFloat(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value;
    const accountId = document.getElementById('tx-account').value;

    if (!desc)      { WF.Utils.toast('Inserisci una descrizione', 'error'); return false; }
    if (!amt || amt <= 0) { WF.Utils.toast('Importo non valido', 'error'); return false; }
    if (!date)      { WF.Utils.toast('Seleziona la data', 'error'); return false; }
    if (!accountId) { WF.Utils.toast('Seleziona il conto', 'error'); return false; }

    const tx = {
      type, description: desc, amount: amt, date, accountId,
      category: document.getElementById('tx-category').value,
      notes: document.getElementById('tx-notes').value.trim(),
      transferToAccountId: type === 'transfer' ? document.getElementById('tx-to-account').value : null,
    };

    if (id) {
      update(id, tx);
      WF.Utils.toast('Movimento aggiornato', 'success');
    } else {
      add(tx);
      WF.Utils.toast('Movimento aggiunto', 'success');
    }
    return true;
  }

  // ── Filter state ────────────────────────────────────────────────
  function setFilter(type) {
    _filterType = type;
    WF.Utils.Events.emit('transactions:filterChanged');
  }

  function setAccountFilter(accountId) {
    _filterAccount = accountId;
    WF.Utils.Events.emit('transactions:filterChanged');
  }

  function setSearchQuery(q) {
    _searchQuery = q;
    WF.Utils.Events.emit('transactions:filterChanged');
  }

  // ── Render: account nav strips ──────────────────────────────────
  function renderAccountStrip() {
    // Mobile account chips
    const strip = document.getElementById('tx-account-strip');
    if (strip && _data) {
      const totalBalance = calcTotalLiquidity();
      const existing = strip.querySelectorAll('.account-chip:not([data-account-filter="all"])');
      existing.forEach(e => e.remove());

      const totalChip = strip.querySelector('[data-account-filter="all"]');
      if (totalChip) {
        totalChip.querySelector('.account-chip-balance').textContent = WF.Utils.formatEuro(totalBalance);
        document.getElementById('tx-strip-total')?.textContent;
      }

      _data.accounts.forEach(a => {
        const bal = calcAccountBalance(a.id);
        const chip = document.createElement('div');
        chip.className = 'account-chip';
        chip.dataset.accountFilter = a.id;
        chip.innerHTML = `
          <div class="account-chip-name">${a.name}</div>
          <div class="account-chip-balance">${WF.Utils.formatEuro(bal)}</div>`;
        chip.addEventListener('click', () => {
          strip.querySelectorAll('.account-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          setAccountFilter(a.id);
          renderList(document.getElementById('tx-list'));
        });
        strip.appendChild(chip);
      });
    }

    // Desktop account sidebar
    const navList = document.getElementById('tx-accounts-nav-list');
    if (navList && _data) {
      navList.innerHTML = _data.accounts.map(a => {
        const bal = calcAccountBalance(a.id);
        return `
          <div class="tx-account-nav-item" data-account-nav="${a.id}">
            <span class="tx-account-nav-dot" style="background:${a.color || 'var(--primary)'};"></span>
            <span class="tx-account-nav-name">${a.name}</span>
            <span class="tx-account-nav-balance">${WF.Utils.formatEuro(bal)}</span>
          </div>`;
      }).join('');

      // Handlers
      navList.querySelectorAll('.tx-account-nav-item').forEach(item => {
        item.addEventListener('click', () => {
          document.querySelectorAll('[data-account-nav]').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          setAccountFilter(item.dataset.accountNav);
          renderList(document.getElementById('tx-list'));
        });
      });
    }

    // Update tx panel total
    const panelTotal = document.getElementById('tx-panel-total');
    if (panelTotal) panelTotal.textContent = WF.Utils.formatEuro(calcTotalLiquidity());
  }

  // ── CSV/Excel import ────────────────────────────────────────────
  function handleImportFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onload = e => {
      try {
        if (ext === 'csv') {
          _parseCsv(e.target.result);
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
          _parseRows(rows);
        }
      } catch (err) {
        WF.Utils.toast('Errore lettura file: ' + err.message, 'error');
      }
    };

    if (ext === 'csv') reader.readAsText(file, 'UTF-8');
    else reader.readAsArrayBuffer(file);
  }

  function _parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const rows  = lines.map(l => l.split(/[;,\t]/).map(c => c.trim().replace(/^"|"$/g, '')));
    _parseRows(rows);
  }

  function _parseRows(rows) {
    if (rows.length < 2) {
      WF.Utils.toast('File vuoto o formato non riconoscibile', 'error');
      return;
    }
    _importHeaders = rows[0].map(h => String(h).trim());
    _importRows    = rows.slice(1).filter(r => r.some(c => c !== ''));

    _renderImportPreview();
    _populateMappingSelects();
    document.getElementById('import-mapping-section').style.display = '';
    document.getElementById('import-footer').style.display = '';
    document.getElementById('import-count').textContent =
      `${_importRows.length} righe rilevate`;
  }

  function _renderImportPreview() {
    const table = document.getElementById('import-preview');
    if (!table) return;
    const preview = _importRows.slice(0, 5);
    table.innerHTML = `
      <table>
        <thead><tr>${_importHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${preview.map(r =>
          `<tr>${_importHeaders.map((_, i) => `<td>${r[i] ?? ''}</td>`).join('')}</tr>`
        ).join('')}</tbody>
      </table>`;
  }

  function _populateMappingSelects() {
    const selects = ['map-date', 'map-desc', 'map-amount', 'map-category'];
    const opts = `<option value="">— —</option>` +
      _importHeaders.map((h, i) => `<option value="${i}">${h}</option>`).join('');
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });

    // Auto-detect columns (case-insensitive)
    const autoMap = {
      'map-date':     ['data', 'date', 'valuta', 'data_valuta', 'data valuta'],
      'map-desc':     ['descrizione', 'description', 'causale', 'note', 'dettagli'],
      'map-amount':   ['importo', 'amount', 'dare/avere', 'saldo'],
      'map-category': ['categoria', 'category', 'tipo'],
    };
    for (const [selId, candidates] of Object.entries(autoMap)) {
      const sel = document.getElementById(selId);
      if (!sel) continue;
      const idx = _importHeaders.findIndex(h =>
        candidates.some(c => h.toLowerCase().includes(c))
      );
      if (idx >= 0) sel.value = String(idx);
    }
  }

  function executeImport() {
    const accountId = document.getElementById('import-account')?.value;
    if (!accountId) { WF.Utils.toast('Seleziona il conto', 'error'); return 0; }

    const colDate = parseInt(document.getElementById('map-date')?.value);
    const colDesc = parseInt(document.getElementById('map-desc')?.value);
    const colAmt  = parseInt(document.getElementById('map-amount')?.value);
    const colCat  = parseInt(document.getElementById('map-category')?.value);

    if (isNaN(colDate) || isNaN(colDesc) || isNaN(colAmt)) {
      WF.Utils.toast('Mappa almeno Data, Descrizione e Importo', 'error');
      return 0;
    }

    let imported = 0;
    _importRows.forEach(row => {
      const rawDate = row[colDate];
      const rawDesc = row[colDesc];
      const rawAmt  = String(row[colAmt] || '').replace(/\s/g, '').replace(',', '.');
      const amount  = parseFloat(rawAmt);

      if (!rawDate || !rawDesc || isNaN(amount)) return;

      // Parse date
      let date = '';
      const d = new Date(rawDate);
      if (!isNaN(d)) {
        date = d.toISOString().split('T')[0];
      } else {
        // Try DD/MM/YYYY
        const parts = String(rawDate).split(/[\/\-\.]/);
        if (parts.length === 3) {
          const [dd, mm, yyyy] = parts.map(Number);
          date = `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
        }
      }
      if (!date) return;

      const type = amount >= 0 ? 'income' : 'expense';
      add({
        accountId, date,
        description: String(rawDesc).trim(),
        amount: Math.abs(amount),
        type,
        category: !isNaN(colCat) && row[colCat] ? String(row[colCat]).toLowerCase() : (type === 'income' ? 'altro_entrata' : 'altro_uscita'),
        notes: '',
        transferToAccountId: null,
      });
      imported++;
    });
    return imported;
  }

  // ── Populate import account select ──────────────────────────────
  function populateImportAccountSelect() {
    const sel = document.getElementById('import-account');
    if (!sel || !_data) return;
    sel.innerHTML = `<option value="">— Seleziona conto —</option>` +
      _data.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  }

  // ── Init ────────────────────────────────────────────────────────
  function init(data) {
    setData(data);

    // Type tabs in modal
    document.querySelectorAll('[data-tx-type-select]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.txTypeSelect;
        document.getElementById('tx-type').value = type;
        document.querySelectorAll('[data-tx-type-select]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tx-to-account-group').style.display =
          type === 'transfer' ? '' : 'none';
      });
    });

    // Save button
    document.getElementById('save-transaction-btn')?.addEventListener('click', () => {
      if (saveFromModal()) {
        WF.App.closeModal('modal-transaction');
        WF.App.save();
        WF.App.renderAll();
      }
    });

    // Add buttons
    ['add-transaction-btn', 'add-transaction-btn-empty', 'add-tx-fab'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => openAddModal());
    });

    // Search
    const searchEl = document.getElementById('tx-search');
    searchEl?.addEventListener('input', WF.Utils.debounce(e => {
      setSearchQuery(e.target.value);
      renderList(document.getElementById('tx-list'));
    }, 250));

    // Filter chips
    document.querySelectorAll('[data-tx-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-tx-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setFilter(btn.dataset.txType);
        renderList(document.getElementById('tx-list'));
      });
    });

    // Filter btn toggle
    document.getElementById('tx-filter-btn')?.addEventListener('click', () => {
      const chips = document.getElementById('tx-filter-chips');
      if (chips) {
        const vis = chips.style.display !== 'none';
        chips.style.display = vis ? 'none' : '';
        document.getElementById('tx-filter-btn')?.classList.toggle('active', !vis);
      }
    });

    // Mobile account strip
    document.getElementById('tx-account-strip')?.addEventListener('click', e => {
      const chip = e.target.closest('[data-account-filter]');
      if (!chip) return;
      document.querySelectorAll('[data-account-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      setAccountFilter(chip.dataset.accountFilter);
      renderList(document.getElementById('tx-list'));
    });

    // Import buttons
    ['import-transactions-btn', 'import-btn-empty'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        populateImportAccountSelect();
        document.getElementById('import-mapping-section').style.display = 'none';
        document.getElementById('import-footer').style.display = 'none';
        WF.App.openModal('modal-import');
      });
    });

    // Drop zone
    const dropzone = document.getElementById('import-dropzone');
    const fileInput = document.getElementById('import-file-input');
    if (dropzone) {
      dropzone.addEventListener('click', () => fileInput?.click());
      dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
      dropzone.addEventListener('drop', e => {
        e.preventDefault(); dropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleImportFile(file);
      });
    }
    fileInput?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) handleImportFile(file);
    });

    // Confirm import
    document.getElementById('confirm-import-btn')?.addEventListener('click', () => {
      const count = executeImport();
      if (count > 0) {
        WF.App.closeModal('modal-import');
        WF.Utils.toast(`${count} movimenti importati`, 'success');
        WF.App.save();
        WF.App.renderAll();
      }
    });

    // Desktop all-accounts nav
    document.querySelector('[data-account-nav="all"]')?.addEventListener('click', () => {
      document.querySelectorAll('[data-account-nav]').forEach(i => i.classList.remove('active'));
      document.querySelector('[data-account-nav="all"]')?.classList.add('active');
      setAccountFilter('all');
      renderList(document.getElementById('tx-list'));
    });
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    init, setData,
    add, update, remove, getFiltered,
    calcAccountBalance, calcTotalLiquidity,
    renderList, renderAccountStrip,
    openAddModal,
    setFilter, setAccountFilter, setSearchQuery,
    handleImportFile, executeImport, populateImportAccountSelect,
  };

})();
