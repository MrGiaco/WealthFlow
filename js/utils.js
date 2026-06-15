/* ================================================================
   WealthFlow — js/utils.js
   Utilità condivise: UUID, formatters, toast, event bus, animazioni
   ================================================================ */
'use strict';

window.WF = window.WF || {};

WF.Utils = (() => {

  // ── UUID ────────────────────────────────────────────────────────
  function uuid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
  }

  // ── Currency formatter ──────────────────────────────────────────
  const euroFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const euroFmt0 = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
  const numFmt4 = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  });
  const pctFmt = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  function formatEuro(n, compact = false) {
    if (n === null || n === undefined || isNaN(n)) return '€ —';
    return compact ? euroFmt0.format(n) : euroFmt.format(n);
  }

  function formatNumber(n, decimals = 4) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return new Intl.NumberFormat('it-IT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    }).format(n);
  }

  function formatPercent(n) {
    if (n === null || n === undefined || isNaN(n)) return '—%';
    const sign = n > 0 ? '+' : '';
    return `${sign}${pctFmt.format(n)}%`;
  }

  // ── Date formatter ──────────────────────────────────────────────
  const dateFmtShort = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' });
  const dateFmtFull  = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  const dateFmtInput = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function formatDate(dateStr, style = 'short') {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return '—';
    if (style === 'short') return dateFmtShort.format(d);
    if (style === 'full')  return dateFmtFull.format(d);
    if (style === 'input') return dateFmtInput.format(d);
    return dateFmtShort.format(d);
  }

  function formatRelativeDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const today = new Date();
    const diff = Math.floor((today - d) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Oggi';
    if (diff === 1) return 'Ieri';
    if (diff < 7)  return `${diff} giorni fa`;
    return formatDate(dateStr, 'short');
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function dateGroupKey(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const dStr = d.toDateString();
    if (dStr === today.toDateString())     return 'Oggi';
    if (dStr === yesterday.toDateString()) return 'Ieri';
    return dateFmtFull.format(d);
  }

  // ── Gain/loss color ─────────────────────────────────────────────
  function gainClass(value) {
    if (!value || value === 0) return 'flat';
    return value > 0 ? 'up' : 'down';
  }

  function gainIcon(value, size = 12) {
    const s = `width:${size}px;height:${size}px;`;
    if (!value || value === 0) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="${s}"><path d="M5 12h14"/></svg>`;
    }
    if (value > 0) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="${s}"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="${s}"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`;
  }

  function categoryColor(category) {
    const map = {
      azione:       '#4F46E5',
      etf:          '#0D9488',
      fondo:        '#7C3AED',
      obbligazione: '#D97706',
      certificate:  '#DC2626',
      altro:        '#6B7280',
    };
    return map[category] || '#4F46E5';
  }

  function categoryLabel(category) {
    const map = {
      azione: 'Azione', etf: 'ETF', fondo: 'Fondo',
      obbligazione: 'Obbligazione', certificate: 'Certificate', altro: 'Altro',
    };
    return map[category] || category;
  }

  function accountTypeLabel(type) {
    const map = {
      personal: 'Personale', investment: 'Investimento',
      shared: 'Condiviso', savings: 'Risparmio',
    };
    return map[type] || type;
  }

  function bankLabel(bank) {
    const map = {
      fineco: 'Fineco Bank', isp: 'Intesa Sanpaolo',
      ing: 'ING', mediolanum: 'Banca Mediolanum',
      unicredit: 'UniCredit', poste: 'Poste Italiane',
      bnl: 'BNL', altro: 'Altra Banca',
    };
    return map[bank] || bank;
  }

  // ── Number animation ────────────────────────────────────────────
  function animateNumber(el, from, to, duration = 600, formatter = formatEuro) {
    if (!el) return;
    const start = performance.now();
    const diff = to - from;
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      el.textContent = formatter(from + diff * ease);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── Initials from name ──────────────────────────────────────────
  function initials(name = '') {
    return name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  }

  function tickerInitials(ticker = '') {
    return ticker.replace(/\.[A-Z]+$/, '').slice(0, 3).toUpperCase();
  }

  // ── Toast system ────────────────────────────────────────────────
  const toastContainer = () => document.getElementById('toast-container');

  function toast(msg, type = 'default', duration = 3200) {
    const container = toastContainer();
    if (!container) return;

    const icons = {
      success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>`,
      error:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
      info:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
      default: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
    };

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `${icons[type] || icons.default}<span>${msg}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('hiding');
      setTimeout(() => el.remove(), 250);
    }, duration);
  }

  // ── Event bus ───────────────────────────────────────────────────
  const _listeners = {};
  const Events = {
    on(event, fn) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(fn);
    },
    off(event, fn) {
      if (_listeners[event]) {
        _listeners[event] = _listeners[event].filter(f => f !== fn);
      }
    },
    emit(event, data) {
      (_listeners[event] || []).forEach(fn => {
        try { fn(data); } catch (e) { console.error(`Event ${event} error:`, e); }
      });
    },
  };

  // ── DOM helpers ─────────────────────────────────────────────────
  function el(selector, parent = document) {
    return parent.querySelector(selector);
  }

  function els(selector, parent = document) {
    return [...parent.querySelectorAll(selector)];
  }

  function on(selector, event, fn, parent = document) {
    const elem = typeof selector === 'string' ? parent.querySelector(selector) : selector;
    if (elem) elem.addEventListener(event, fn);
  }

  function delegate(parent, selector, event, fn) {
    parent.addEventListener(event, e => {
      const target = e.target.closest(selector);
      if (target && parent.contains(target)) fn(e, target);
    });
  }

  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }

  // ── SHA-256 helper ──────────────────────────────────────────────
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Debounce ────────────────────────────────────────────────────
  function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  // ── Download file ───────────────────────────────────────────────
  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  // ── Format time ago ─────────────────────────────────────────────
  function timeAgo(ts) {
    if (!ts) return 'mai';
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60)   return 'adesso';
    if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ore fa`;
    return `${Math.floor(diff / 86400)} giorni fa`;
  }

  // ── Clamp ───────────────────────────────────────────────────────
  function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

  // ── Public API ──────────────────────────────────────────────────
  return {
    uuid, sha256, debounce, clamp,
    formatEuro, formatNumber, formatPercent,
    formatDate, formatRelativeDate, todayISO, dateGroupKey,
    gainClass, gainIcon, categoryColor, categoryLabel,
    accountTypeLabel, bankLabel,
    initials, tickerInitials,
    animateNumber,
    toast, Events,
    el, els, on, delegate, show, hide,
    downloadJSON, timeAgo,
  };

})();
