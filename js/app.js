/* ================================================================
   WealthFlow — js/app.js
   Orchestratore principale: init, router, render, impostazioni, conti
   ================================================================ */
'use strict';

WF.App = (() => {

  let data = null;
  let _currentPage = 'dashboard';
  let _selectedSecurityId = null;
  let _isDesktop = false;

  // ── Data accessor ───────────────────────────────────────────────
  function getData() { return data; }

  // ── Save ────────────────────────────────────────────────────────
  async function save() {
    WF.Drive.saveToCache(data);
    WF.Portfolio.setData(data);
    WF.Transactions.setData(data);
    await WF.Drive.saveToDrive(data);
  }

  // ── Router ──────────────────────────────────────────────────────
  function navigate(page) {
    if (_currentPage === page) return;

    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
    });

    const target = document.getElementById(`page-${page}`);
    if (target) {
      target.classList.add('active');
      target.classList.add('page-enter');
      setTimeout(() => target.classList.remove('page-enter'), 300);
    }

    // Update nav items
    document.querySelectorAll('[data-nav]').forEach(n => {
      n.classList.toggle('active', n.dataset.nav === page);
    });

    _currentPage = page;
    _renderPage(page);

    // Show/hide FABs
    document.getElementById('add-security-fab')?.style.setProperty('display',
      page === 'investments' && !_isDesktop ? '' : 'none');
    document.getElementById('add-tx-fab')?.style.setProperty('display',
      page === 'transactions' && !_isDesktop ? '' : 'none');
  }

  function _renderPage(page) {
    switch (page) {
      case 'dashboard':    renderDashboard(); break;
      case 'investments':  renderInvestments(); break;
      case 'accounts':     renderAccounts(); break;
      case 'transactions': renderTransactions(); break;
      case 'settings':     renderSettings(); break;
    }
  }

  function renderAll() {
    _renderPage(_currentPage);
    if (_currentPage !== 'dashboard') renderDashboardData(); // keep hero updated
  }

  // ── Desktop / mobile detection ──────────────────────────────────
  function _checkDesktop() {
    _isDesktop = window.innerWidth >= 768;
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('hidden', !_isDesktop);
    if (_isDesktop) {
      // Show desktop panels
      document.getElementById('tx-accounts-panel')?.style.setProperty('display', '');
      document.getElementById('dash-stats-grid')?.style.setProperty('display', '');
      document.getElementById('dash-quick-stats')?.style.setProperty('display', 'none');
    } else {
      document.getElementById('tx-accounts-panel')?.style.setProperty('display', 'none');
      document.getElementById('dash-stats-grid')?.style.setProperty('display', 'none');
      document.getElementById('dash-quick-stats')?.style.setProperty('display', '');
    }
  }

  // ── DASHBOARD ───────────────────────────────────────────────────
  function renderDashboard() {
    renderDashboardData();
    renderDashboardCharts();
    renderDashboardLists();
  }

  function renderDashboardData() {
    if (!data) return;
    const portfolio = data.portfolio || [];
    const stats = WF.Portfolio.calcPortfolioStats(portfolio);
    const liquidity = WF.Transactions.calcTotalLiquidity();
    const total = stats.totalValue + liquidity;

    // Hero
    const totalEl = document.getElementById('dash-total');
    if (totalEl) WF.Utils.animateNumber(totalEl, 0, total, 800, WF.Utils.formatEuro);

    const invEl = document.getElementById('dash-inv-total');
    if (invEl) WF.Utils.animateNumber(invEl, 0, stats.totalValue, 700, WF.Utils.formatEuro);

    const liqEl = document.getElementById('dash-liq-total');
    if (liqEl) WF.Utils.animateNumber(liqEl, 0, liquidity, 700, WF.Utils.formatEuro);

    // Change badge
    const changeEl = document.getElementById('dash-change');
    if (changeEl) {
      const daily = stats.dailyGain;
      const cls   = WF.Utils.gainClass(daily);
      const icon  = WF.Utils.gainIcon(daily, 12);
      const sign  = daily > 0 ? '+' : '';
      const label = stats.hasLiveData
        ? `${icon} ${sign}${WF.Utils.formatEuro(daily)} oggi (${WF.Utils.formatPercent(stats.dailyGainPct)})`
        : `${icon} — in attesa quotazioni`;
      changeEl.className = `hero-change ${cls}`;
      changeEl.innerHTML = label;
    }

    // Desktop stats
    const statInv = document.getElementById('stat-investments');
    if (statInv) statInv.textContent = WF.Utils.formatEuro(stats.totalValue);
    const statLiq = document.getElementById('stat-liquidity');
    if (statLiq) statLiq.textContent = WF.Utils.formatEuro(liquidity);

    // Quick stats (mobile)
    const gainEl = document.getElementById('dash-gain');
    if (gainEl) {
      gainEl.textContent = WF.Utils.formatEuro(stats.totalGain);
      gainEl.style.color = stats.totalGain >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    const yieldEl = document.getElementById('dash-yield');
    if (yieldEl) {
      yieldEl.textContent = WF.Utils.formatPercent(stats.gainPct);
      yieldEl.style.color = stats.gainPct >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    const updEl = document.getElementById('dash-updated');
    if (updEl) {
      const lr = WF.Quotes.getLastRefresh();
      updEl.textContent = lr ? WF.Utils.timeAgo(lr) : '—';
    }
  }

  function renderDashboardCharts() {
    if (!data) return;
    const portfolio = data.portfolio || [];
    const allocation = WF.Portfolio.getAllocationByCategory(portfolio);
    WF.Charts.renderAllocationChart('chart-allocation', allocation);
    WF.Charts.renderPerformanceChart('chart-performance', portfolio);
  }

  function renderDashboardLists() {
    if (!data) return;
    // Top 5 investments (by value)
    const portfolio = [...(data.portfolio || [])].sort((a, b) => {
      const va = WF.Portfolio.calcSecurityStats(a).totalValue ?? WF.Portfolio.calcSecurityStats(a).totalCost;
      const vb = WF.Portfolio.calcSecurityStats(b).totalValue ?? WF.Portfolio.calcSecurityStats(b).totalCost;
      return vb - va;
    }).slice(0, 5);

    const invContainer = document.getElementById('dash-investments-list');
    if (invContainer) {
      if (!portfolio.length) {
        invContainer.innerHTML = `<div class="empty-state" style="padding:var(--sp-6) var(--sp-4);">
          <div class="empty-icon" style="width:40px;height:40px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg></div>
          <p style="font-size:var(--text-sm);color:var(--text-3);">Nessun investimento ancora</p></div>`;
      } else {
        WF.Portfolio.renderList(portfolio, invContainer, sec => {
          _selectedSecurityId = sec.id;
          if (_isDesktop) {
            WF.Portfolio.renderDetail(sec, document.getElementById('inv-detail-col'));
          } else {
            _openSecurityDetail(sec);
          }
        });
      }
    }

    // Recent 5 transactions
    const recentTxs = (data.transactions || [])
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    const txContainer = document.getElementById('dash-transactions-list');
    if (txContainer) {
      if (!recentTxs.length) {
        txContainer.innerHTML = `<div class="empty-state" style="padding:var(--sp-6) var(--sp-4);">
          <div class="empty-icon" style="width:40px;height:40px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/></svg></div>
          <p style="font-size:var(--text-sm);color:var(--text-3);">Nessun movimento ancora</p></div>`;
      } else {
        WF.Transactions.renderList(txContainer);
      }
    }
  }

  // ── INVESTMENTS ─────────────────────────────────────────────────
  function renderInvestments() {
    if (!data) return;
    const portfolio = data.portfolio || [];
    const stats = WF.Portfolio.calcPortfolioStats(portfolio);

    // Header stats
    const totalEl = document.getElementById('inv-total-value');
    if (totalEl) totalEl.textContent = WF.Utils.formatEuro(stats.totalValue || stats.totalInvested);

    const gainEl = document.getElementById('inv-total-gain');
    if (gainEl) {
      const g = stats.totalGain;
      const sign = g >= 0 ? '+' : '';
      gainEl.textContent = stats.hasLiveData
        ? `${sign}${WF.Utils.formatEuro(g)} guadagno (${WF.Utils.formatPercent(stats.gainPct)})`
        : `${WF.Utils.formatEuro(stats.totalInvested)} investiti`;
      gainEl.style.color = g >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    // Active category filter
    const activeFilter = document.querySelector('#inv-category-pills .pill.active');
    const category = activeFilter?.dataset.category || 'all';
    const filtered = WF.Portfolio.getAll(category);

    const listContainer = document.getElementById('investments-list');
    if (listContainer) {
      WF.Portfolio.renderList(filtered, listContainer, sec => {
        _selectedSecurityId = sec.id;
        if (_isDesktop) {
          WF.Portfolio.renderDetail(sec, document.getElementById('inv-detail-col'));
        } else {
          _openSecurityDetail(sec);
        }
      });
    }

    // Desktop: re-render detail if security was selected
    if (_isDesktop && _selectedSecurityId) {
      const sec = WF.Portfolio.getById(_selectedSecurityId);
      if (sec) WF.Portfolio.renderDetail(sec, document.getElementById('inv-detail-col'));
    }

    // Refresh quotes button state
    const isRefreshing = WF.Quotes.isRefreshing();
    document.querySelectorAll('#refresh-quotes-btn, #refresh-quotes-btn-top').forEach(btn => {
      btn.classList.toggle('spinning', isRefreshing);
      btn.disabled = isRefreshing;
    });
  }

  // ── ACCOUNTS ────────────────────────────────────────────────────
  function renderAccounts() {
    if (!data) return;
    const accounts = data.accounts || [];
    const grid = document.getElementById('accounts-grid');
    const empty = document.getElementById('accounts-empty');
    const totalEl = document.getElementById('accounts-total-value');

    const totalLiq = WF.Transactions.calcTotalLiquidity();
    if (totalEl) WF.Utils.animateNumber(totalEl, 0, totalLiq, 600, WF.Utils.formatEuro);

    if (!accounts.length) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = accounts.map(a => {
      const balance = WF.Transactions.calcAccountBalance(a.id);
      const txCount = (data.transactions || []).filter(t => t.accountId === a.id).length;
      const typeLabel = WF.Utils.accountTypeLabel(a.type);
      const typeCls   = a.type || 'personal';

      return `
        <div class="account-card" data-id="${a.id}">
          <div class="account-card-accent" style="background:${a.color || 'var(--primary)'};"></div>
          <div class="flex justify-between items-center" style="margin-top:var(--sp-1);">
            <div class="account-bank">${WF.Utils.bankLabel(a.bank)}</div>
            <div class="flex gap-2">
              <button class="btn btn--icon btn--ghost btn--sm" data-action="edit-account" data-id="${a.id}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </button>
              <button class="btn btn--icon btn--ghost btn--sm" data-action="delete-account" data-id="${a.id}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              </button>
            </div>
          </div>
          <div class="account-name">${a.name}</div>
          <div class="account-balance">${WF.Utils.formatEuro(balance)}</div>
          <div class="flex justify-between items-center" style="margin-top:var(--sp-3);">
            <span class="account-type-badge ${typeCls}">${typeLabel}</span>
            <span style="font-size:11px;color:var(--text-3);">${txCount} movimenti</span>
          </div>
          ${a.notes ? `<div style="font-size:11px;color:var(--text-3);margin-top:var(--sp-2);padding-top:var(--sp-2);border-top:1px solid var(--border);">${a.notes}</div>` : ''}
        </div>`;
    }).join('');
  }

  // ── TRANSACTIONS ────────────────────────────────────────────────
  function renderTransactions() {
    if (!data) return;
    WF.Transactions.renderAccountStrip();
    WF.Transactions.renderList(document.getElementById('tx-list'));
  }

  // ── SETTINGS ────────────────────────────────────────────────────
  function renderSettings() {
    const data = WF.Drive.loadFromCache();
    const authState = WF.Auth.getState();

    // Worker URL
    const workerVal = document.getElementById('settings-worker-val');
    if (workerVal) {
      const url = data.settings?.workerUrl;
      workerVal.textContent = url ? url.replace(/^https?:\/\//, '').slice(0, 40) + (url.length > 50 ? '…' : '') : 'Non configurato';
      workerVal.style.color = url ? 'var(--success)' : 'var(--text-3)';
    }

    // Drive
    const driveVal = document.getElementById('settings-drive-val');
    if (driveVal) {
      const connected = WF.Drive.isConnected();
      driveVal.textContent = connected ? 'Connesso' : 'Non connesso';
      driveVal.style.color = connected ? 'var(--success)' : 'var(--text-3)';
    }

    // Client ID
    const clientIdVal = document.getElementById('settings-client-id-val');
    if (clientIdVal) {
      const id = authState.googleClientId;
      clientIdVal.textContent = id ? id.slice(0, 20) + '…' : 'Non configurato';
      clientIdVal.style.color = id ? 'var(--success)' : 'var(--text-3)';
    }

    // Last update
    const lastUpdate = document.getElementById('settings-last-update');
    if (lastUpdate) {
      const lr = WF.Quotes.getLastRefresh();
      lastUpdate.textContent = lr ? 'Ultimo aggiornamento: ' + WF.Utils.timeAgo(lr) : 'Quotazioni non ancora aggiornate';
    }

    // Biometric toggle
    const bioToggle = document.getElementById('biometric-toggle');
    if (bioToggle) bioToggle.classList.toggle('on', WF.Auth.isBiometricEnabled());

    // Auto-refresh toggle
    const arToggle = document.getElementById('auto-refresh-toggle');
    if (arToggle) arToggle.classList.toggle('on', data.settings?.autoRefresh !== false);
  }

  // ── MODAL system ────────────────────────────────────────────────
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function _closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    document.body.style.overflow = '';
  }

  // ── Security detail modal (mobile) ──────────────────────────────
  function _openSecurityDetail(security) {
    const container = document.getElementById('security-detail-content');
    if (!container) return;
    const titleBar = document.createElement('div');
    titleBar.innerHTML = `
      <div class="modal-title-bar">
        <h2 class="modal-title">${security.name}</h2>
        <button class="btn btn--icon btn--ghost modal-close" data-modal="modal-security-detail">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>`;
    container.innerHTML = '';
    container.appendChild(titleBar);
    WF.Portfolio.renderDetail(security, container);
    openModal('modal-security-detail');
  }

  // ── Account modal ───────────────────────────────────────────────
  function _openAddAccountModal() {
    document.getElementById('account-edit-id').value = '';
    document.getElementById('modal-account-title').textContent = 'Nuovo Conto';
    document.getElementById('account-name').value = '';
    document.getElementById('account-bank').value = 'fineco';
    document.getElementById('account-type').value = 'personal';
    document.getElementById('account-balance').value = '';
    document.getElementById('account-notes').value = '';
    document.getElementById('account-color').value = '#4F46E5';
    document.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === '#4F46E5');
    });
    openModal('modal-account');
  }

  function _openEditAccountModal(account) {
    document.getElementById('account-edit-id').value = account.id;
    document.getElementById('modal-account-title').textContent = 'Modifica Conto';
    document.getElementById('account-name').value = account.name;
    document.getElementById('account-bank').value = account.bank;
    document.getElementById('account-type').value = account.type;
    document.getElementById('account-balance').value = account.initialBalance || '';
    document.getElementById('account-notes').value = account.notes || '';
    document.getElementById('account-color').value = account.color || '#4F46E5';
    document.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === account.color);
    });
    openModal('modal-account');
  }

  function _saveAccount() {
    const id      = document.getElementById('account-edit-id').value;
    const name    = document.getElementById('account-name').value.trim();
    const bank    = document.getElementById('account-bank').value;
    const type    = document.getElementById('account-type').value;
    const bal     = parseFloat(document.getElementById('account-balance').value) || 0;
    const notes   = document.getElementById('account-notes').value.trim();
    const color   = document.getElementById('account-color').value;

    if (!name) { WF.Utils.toast('Inserisci il nome del conto', 'error'); return false; }

    if (id) {
      const idx = data.accounts.findIndex(a => a.id === id);
      if (idx !== -1) Object.assign(data.accounts[idx], { name, bank, type, initialBalance: bal, notes, color });
      WF.Utils.toast('Conto aggiornato', 'success');
    } else {
      data.accounts.push({
        id: WF.Utils.uuid(), name, bank, type,
        initialBalance: bal, notes, color,
        currency: 'EUR', createdAt: new Date().toISOString(),
      });
      WF.Utils.toast('Conto aggiunto', 'success');
    }
    return true;
  }

  // ── Settings actions ────────────────────────────────────────────
  function _openTextInputModal(title, label, currentValue, hint, onSave) {
    document.getElementById('modal-text-title').textContent = title;
    document.getElementById('modal-text-label').textContent = label;
    document.getElementById('modal-text-value').value = currentValue || '';
    document.getElementById('modal-text-hint').textContent = hint || '';
    document.getElementById('save-text-input-btn').onclick = () => {
      const val = document.getElementById('modal-text-value').value.trim();
      onSave(val);
      closeModal('modal-text-input');
    };
    openModal('modal-text-input');
  }

  // ── Quotes refresh ───────────────────────────────────────────────
  async function refreshQuotes() {
    if (!WF.Quotes.isConfigured()) {
      WF.Utils.toast('Configura prima il Cloudflare Worker URL nelle impostazioni', 'info');
      return;
    }
    const tickers = WF.Quotes.getPortfolioTickers(data);
    if (!tickers.length) {
      WF.Utils.toast('Nessun titolo con ticker da aggiornare', 'info');
      return;
    }
    document.querySelectorAll('#refresh-quotes-btn svg, #refresh-quotes-btn-top svg').forEach(s => {
      s.style.animation = 'spin 1s linear infinite';
    });
    await WF.Quotes.fetchQuotes(tickers, true);
    document.querySelectorAll('#refresh-quotes-btn svg, #refresh-quotes-btn-top svg').forEach(s => {
      s.style.animation = '';
    });
    WF.Utils.toast('Quotazioni aggiornate', 'success');
    renderAll();
  }

  // ── Init ────────────────────────────────────────────────────────
  async function init() {

    // 1. Init modules
    WF.Utils; // already loaded
    WF.Auth.init();
    await WF.Drive.init();
    WF.Quotes.init();
    WF.Charts.init();

    // 2. Auth event handlers
    WF.Utils.Events.on('auth:success', _onAuthSuccess);
    WF.Utils.Events.on('auth:locked', _onLocked);

    // 3. Show lock screen
    WF.Auth.initLockUI();

    // 4. Handle responsive
    _checkDesktop();
    window.addEventListener('resize', WF.Utils.debounce(_checkDesktop, 200));

    // 5. Section-action "vedi tutti" links
    WF.Utils.delegate(document.body, '[data-nav]', 'click', (e, el) => {
      navigate(el.dataset.nav);
    });
  }

  async function _onAuthSuccess() {
    // Load data
    WF.Utils.show(document.getElementById('lock-screen') && null); // hide lock
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Init sidebar user
    _updateSidebarUser();

    // Load data from cache first, then Drive
    data = WF.Drive.loadFromCache();
    WF.Portfolio.init(data);
    WF.Transactions.init(data);

    // Render immediately with cached data
    navigate('dashboard');
    _setupAllHandlers();

    // Then try to load from Drive (async)
    const driveData = await WF.Drive.loadFromDrive();
    data = driveData;
    WF.Portfolio.setData(data);
    WF.Transactions.setData(data);
    renderAll();

    // Fetch quotes if worker is configured
    if (WF.Quotes.isConfigured()) {
      const tickers = WF.Quotes.getPortfolioTickers(data);
      if (tickers.length) {
        WF.Quotes.fetchQuotes(tickers).then(() => renderAll());
        WF.Quotes.startAutoRefresh(() => data);
      }
    }

    // Listen for quote updates
    WF.Utils.Events.on('quotes:updated', () => renderAll());
  }

  function _onLocked() {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('lock-screen').classList.remove('hidden');
    WF.Auth.initLockUI();
    WF.Quotes.stopAutoRefresh();
    WF.Charts.destroyAll();
  }

  function _updateSidebarUser() {
    const name = WF.Auth.getUserName();
    document.getElementById('sidebar-user-name')?.textContent;
    const el = document.getElementById('sidebar-user-name');
    if (el) el.textContent = name;
    const av = document.getElementById('sidebar-avatar');
    if (av) av.textContent = name.charAt(0).toUpperCase();
  }

  // ── Setup all event handlers ────────────────────────────────────
  function _setupAllHandlers() {

    // ── Modal close ──────────────────────────────────────────────
    WF.Utils.delegate(document.body, '.modal-close', 'click', (e, btn) => {
      closeModal(btn.dataset.modal);
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) _closeAllModals();
      });
    });

    // ── Navigation ───────────────────────────────────────────────
    WF.Utils.delegate(document.body, '[data-nav]', 'click', (e, el) => {
      navigate(el.dataset.nav);
    });

    // ── Category pills ───────────────────────────────────────────
    WF.Utils.delegate(document.getElementById('inv-category-pills'), '.pill', 'click', (e, pill) => {
      document.querySelectorAll('#inv-category-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderInvestments();
    });

    // ── Refresh quotes ───────────────────────────────────────────
    ['refresh-quotes-btn', 'refresh-quotes-btn-top', 'settings-refresh-quotes'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', refreshQuotes);
    });

    // ── Sync buttons ─────────────────────────────────────────────
    ['sync-btn', 'sidebar-sync-btn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', async () => {
        WF.Utils.toast('Sincronizzazione in corso…', 'info');
        await WF.Drive.saveToDrive(data);
        const freshData = await WF.Drive.loadFromDrive();
        data = freshData;
        WF.Portfolio.setData(data);
        WF.Transactions.setData(data);
        renderAll();
      });
    });

    // ── Account actions ──────────────────────────────────────────
    ['add-account-btn', 'add-account-btn-empty'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', _openAddAccountModal);
    });

    document.getElementById('save-account-btn')?.addEventListener('click', () => {
      if (_saveAccount()) {
        closeModal('modal-account');
        save();
        renderAll();
      }
    });

    // Edit / delete account via card buttons
    WF.Utils.delegate(document.getElementById('accounts-grid'), '[data-action]', 'click', (e, btn) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit-account') {
        const acc = data.accounts.find(a => a.id === id);
        if (acc) _openEditAccountModal(acc);
      } else if (btn.dataset.action === 'delete-account') {
        const acc = data.accounts.find(a => a.id === id);
        if (acc && confirm(`Eliminare il conto "${acc.name}"?\nAttenzione: verranno eliminati anche tutti i movimenti associati.`)) {
          data.accounts = data.accounts.filter(a => a.id !== id);
          data.transactions = data.transactions.filter(t => t.accountId !== id);
          data.portfolio = data.portfolio.filter(p => p.accountId !== id);
          save(); renderAll();
          WF.Utils.toast('Conto eliminato', 'info');
        }
      }
    });

    // Color swatches
    WF.Utils.delegate(document.getElementById('modal-account'), '.color-swatch', 'click', (e, swatch) => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      document.getElementById('account-color').value = swatch.dataset.color;
    });

    // ── Settings actions ─────────────────────────────────────────
    document.getElementById('settings-worker-url')?.addEventListener('click', () => {
      _openTextInputModal(
        'Cloudflare Worker URL', 'URL del worker',
        data.settings?.workerUrl || '',
        'es. https://quotes.miodominio.workers.dev',
        val => {
          if (!data.settings) data.settings = {};
          data.settings.workerUrl = val;
          save(); renderSettings();
          WF.Utils.toast('Worker URL salvato', 'success');
        }
      );
    });

    document.getElementById('settings-google-client-id')?.addEventListener('click', () => {
      _openTextInputModal(
        'Google Client ID', 'OAuth 2.0 Client ID',
        WF.Auth.getGoogleClientId(),
        'es. 123456789-xxx.apps.googleusercontent.com',
        val => {
          WF.Auth.setGoogleClientId(val);
          renderSettings();
          WF.Utils.toast('Client ID salvato', 'success');
        }
      );
    });

    document.getElementById('settings-google-drive')?.addEventListener('click', async () => {
      const ok = await WF.Drive.requestToken();
      if (ok) {
        WF.Utils.toast('Google Drive connesso!', 'success');
        await WF.Drive.saveToDrive(data);
      } else {
        WF.Utils.toast('Connessione Drive non riuscita. Verifica il Client ID.', 'error');
      }
      renderSettings();
    });

    document.getElementById('settings-change-pin')?.addEventListener('click', () => {
      const old = prompt('PIN attuale (6 cifre):');
      if (!old) return;
      const newP = prompt('Nuovo PIN (6 cifre):');
      if (!newP || newP.length !== 6) { WF.Utils.toast('Il PIN deve essere di 6 cifre', 'error'); return; }
      const conf = prompt('Conferma nuovo PIN:');
      WF.Auth.changePin(old, newP, conf).catch(e => WF.Utils.toast(e.message, 'error'));
    });

    document.getElementById('settings-biometric-toggle')?.addEventListener('click', async () => {
      if (WF.Auth.isBiometricEnabled()) {
        await WF.Auth.disableBiometric();
      } else {
        await WF.Auth.enableBiometric().catch(e => WF.Utils.toast(e.message, 'error'));
      }
      renderSettings();
    });

    document.getElementById('auto-refresh-toggle')?.addEventListener('click', function() {
      this.classList.toggle('on');
      const enabled = this.classList.contains('on');
      if (!data.settings) data.settings = {};
      data.settings.autoRefresh = enabled;
      save();
      if (enabled) WF.Quotes.startAutoRefresh(() => data);
      else WF.Quotes.stopAutoRefresh();
    });

    document.getElementById('settings-export-backup')?.addEventListener('click', () => {
      WF.Drive.exportBackup(data);
      WF.Utils.toast('Backup esportato', 'success');
    });

    document.getElementById('settings-import-backup')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json';
      input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const restored = await WF.Drive.importBackup(file);
          data = restored;
          WF.Portfolio.setData(data);
          WF.Transactions.setData(data);
          await save();
          renderAll();
          WF.Utils.toast('Dati ripristinati con successo', 'success');
        } catch (err) {
          WF.Utils.toast(err.message, 'error');
        }
      };
      input.click();
    });

    document.getElementById('settings-clear-data')?.addEventListener('click', () => {
      if (!confirm('ATTENZIONE: tutti i dati verranno eliminati definitivamente. Sei sicuro?')) return;
      if (!confirm('Conferma: eliminare tutto?')) return;
      data = { version: '1.0.0', accounts: [], portfolio: [], transactions: [], settings: {} };
      save(); renderAll();
      WF.Utils.toast('Dati eliminati', 'info');
    });

    // Sidebar user → lock
    document.getElementById('sidebar-user')?.addEventListener('click', () => {
      if (confirm('Blocca WealthFlow?')) WF.Auth.manualLock();
    });

    // ── Keyboard shortcuts ────────────────────────────────────────
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') _closeAllModals();
    });
  }

  // Google Sign-In callback (exposed globally)
  window.handleGoogleSignIn = async (response) => {
    WF.Utils.toast('Account Google collegato', 'success');
    WF.Utils.Events.emit('google:signedIn', response);
  };

  // ── Public API ──────────────────────────────────────────────────
  return {
    init,
    navigate,
    renderAll,
    openModal,
    closeModal,
    save,
    getData,
    refreshQuotes,
  };

})();

// ── Kick off ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  WF.App.init();
});
