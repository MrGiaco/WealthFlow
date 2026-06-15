/* ================================================================
   WealthFlow — js/quotes.js
   Quotazioni: Cloudflare Worker proxy, cache 30min, auto-refresh
   ================================================================ */
'use strict';

WF.Quotes = (() => {

  const CACHE_TTL = 30 * 60 * 1000;     // 30 minuti
  const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minuti
  const CACHE_KEY = 'wf_quotes_cache';

  let _cache = {};           // { ticker: { data, timestamp } }
  let _refreshTimer = null;
  let _isRefreshing = false;
  let _lastRefresh = null;

  // ── Cache helpers ───────────────────────────────────────────────
  function _loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      _cache = raw ? JSON.parse(raw) : {};
    } catch { _cache = {}; }
  }

  function _saveCache() {
    localStorage.setItem(CACHE_KEY, JSON.stringify(_cache));
  }

  function _isFresh(ticker) {
    const entry = _cache[ticker];
    if (!entry) return false;
    return Date.now() - entry.timestamp < CACHE_TTL;
  }

  function getQuote(ticker) {
    return _cache[ticker]?.data || null;
  }

  function getAllQuotes() {
    return Object.fromEntries(
      Object.entries(_cache).map(([k, v]) => [k, v.data])
    );
  }

  // ── Worker URL ──────────────────────────────────────────────────
  function _getWorkerUrl() {
    const data = WF.Drive.loadFromCache();
    return data?.settings?.workerUrl || '';
  }

  function isConfigured() {
    return !!_getWorkerUrl();
  }

  // ── Fetch quotes ────────────────────────────────────────────────
  async function fetchQuotes(tickers = [], forceRefresh = false) {
    if (!tickers.length) return {};
    const workerUrl = _getWorkerUrl();
    if (!workerUrl) {
      console.warn('Quotes: Worker URL non configurato');
      return _buildFromCache(tickers);
    }

    // Determine which tickers need refresh
    const toFetch = forceRefresh
      ? tickers
      : tickers.filter(t => !_isFresh(t));

    if (!toFetch.length) return _buildFromCache(tickers);

    _isRefreshing = true;
    WF.Utils.Events.emit('quotes:loading', { tickers: toFetch });

    try {
      const url = `${workerUrl}?tickers=${encodeURIComponent(toFetch.join(','))}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const results = json.results || {};

      // Update cache
      for (const [ticker, data] of Object.entries(results)) {
        if (!data.error) {
          _cache[ticker] = { data, timestamp: Date.now() };
        }
      }
      _saveCache();
      _lastRefresh = Date.now();
      WF.Utils.Events.emit('quotes:updated', { results, timestamp: _lastRefresh });

    } catch (e) {
      console.error('Quotes fetch error:', e);
      WF.Utils.Events.emit('quotes:error', { message: e.message });
    }

    _isRefreshing = false;
    return _buildFromCache(tickers);
  }

  function _buildFromCache(tickers) {
    const result = {};
    tickers.forEach(t => {
      if (_cache[t]) result[t] = _cache[t].data;
    });
    return result;
  }

  // ── Extract tickers from portfolio ──────────────────────────────
  function getPortfolioTickers(data) {
    const portfolio = data?.portfolio || [];
    return [...new Set(portfolio.map(p => p.ticker).filter(Boolean))];
  }

  // ── Auto-refresh ─────────────────────────────────────────────────
  function startAutoRefresh(getDataFn) {
    stopAutoRefresh();
    const doRefresh = async () => {
      if (!isMarketOpen()) return;
      if (_isRefreshing) return;
      const data = getDataFn();
      const tickers = getPortfolioTickers(data);
      if (tickers.length) {
        await fetchQuotes(tickers, true);
      }
    };
    _refreshTimer = setInterval(doRefresh, REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }

  // ── Market hours check ──────────────────────────────────────────
  function isMarketOpen() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Weekend

    // European markets: roughly 7:00 - 19:00 UTC
    const hour = now.getUTCHours();
    return hour >= 7 && hour < 19;
  }

  // ── Format quote data for display ──────────────────────────────
  function formatQuoteChange(quote) {
    if (!quote || quote.changePercent === null || quote.changePercent === undefined) {
      return { text: '—', cls: 'flat' };
    }
    const pct = quote.changePercent;
    const sign = pct > 0 ? '+' : '';
    return {
      text: `${sign}${pct.toFixed(2)}%`,
      cls: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
    };
  }

  // ── State getters ───────────────────────────────────────────────
  function isRefreshing() { return _isRefreshing; }
  function getLastRefresh() { return _lastRefresh; }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    _loadCache();
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    init,
    fetchQuotes,
    getQuote,
    getAllQuotes,
    getPortfolioTickers,
    isConfigured,
    isRefreshing,
    isMarketOpen,
    getLastRefresh,
    startAutoRefresh,
    stopAutoRefresh,
    formatQuoteChange,
  };

})();
