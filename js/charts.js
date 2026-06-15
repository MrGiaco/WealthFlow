/* ================================================================
   WealthFlow — js/charts.js
   Grafici: Chart.js donut allocazione, line performance, sparklines
   ================================================================ */
'use strict';

WF.Charts = (() => {

  let _charts = {}; // { id: Chart instance }

  const CAT_COLORS = {
    azione:       '#4F46E5',
    etf:          '#0D9488',
    fondo:        '#7C3AED',
    obbligazione: '#D97706',
    certificate:  '#DC2626',
    altro:        '#6B7280',
  };

  const CAT_LABELS = {
    azione: 'Azioni', etf: 'ETF', fondo: 'Fondi',
    obbligazione: 'Obbligazioni', certificate: 'Certificates', altro: 'Altro',
  };

  // ── Destroy existing chart ──────────────────────────────────────
  function _destroyChart(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }

  // ── Global Chart.js defaults ────────────────────────────────────
  function _setDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
    Chart.defaults.font.size   = 12;
    Chart.defaults.color       = '#9CA3AF';
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = '#0F0A28';
    Chart.defaults.plugins.tooltip.titleColor = '#fff';
    Chart.defaults.plugins.tooltip.bodyColor  = 'rgba(255,255,255,0.8)';
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.padding = 10;
  }

  // ── Allocation donut chart ──────────────────────────────────────
  function renderAllocationChart(canvasId, allocation) {
    if (!window.Chart) return;
    _destroyChart(canvasId);

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const categories = Object.keys(allocation);
    if (!categories.length) {
      canvas.parentElement.innerHTML =
        `<div style="text-align:center;color:var(--text-3);padding:20px;font-size:13px;">Nessun dato</div>`;
      return;
    }

    const total = Object.values(allocation).reduce((a, b) => a + b, 0);
    const labels = categories.map(c => CAT_LABELS[c] || c);
    const values = categories.map(c => allocation[c]);
    const colors = categories.map(c => CAT_COLORS[c] || '#9CA3AF');
    const border = categories.map(c => (CAT_COLORS[c] || '#9CA3AF') + '33');

    _charts[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverBorderColor: '#ffffff',
          hoverBorderWidth: 3,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '70%',
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 10, boxHeight: 10, borderRadius: 5,
              padding: 12, font: { size: 11, weight: '500' },
              color: '#6B7280',
              generateLabels(chart) {
                return chart.data.labels.map((label, i) => ({
                  text: `${label} (${((values[i] / total) * 100).toFixed(1)}%)`,
                  fillStyle: colors[i],
                  strokeStyle: colors[i],
                  lineWidth: 0,
                  hidden: false,
                  index: i,
                }));
              },
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const pct = ((ctx.raw / total) * 100).toFixed(1);
                return ` ${WF.Utils.formatEuro(ctx.raw)} (${pct}%)`;
              },
            },
          },
        },
      },
    });

    // Update badge
    const badge = document.getElementById('dash-alloc-count');
    if (badge) badge.textContent = `${Object.values(allocation).filter(v => v > 0).length} cat.`;
  }

  // ── Performance line chart ──────────────────────────────────────
  // Since we don't have historical data, we fake a 7-day trend based on
  // current portfolio value and daily changes
  function renderPerformanceChart(canvasId, portfolio) {
    if (!window.Chart) return;
    _destroyChart(canvasId);

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (!portfolio.length) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = '';

    // Build 7-day simulated data
    const stats = WF.Portfolio.calcPortfolioStats(portfolio);
    const currentValue = stats.totalValue || stats.totalInvested;
    const dailyPct = stats.dailyGainPct / 100 || 0;

    const labels = [];
    const values = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }));
      // Simulate backward: inverse daily move
      const factor = Math.pow(1 - dailyPct, i) * (0.998 + Math.random() * 0.004);
      values.push(currentValue * factor);
    }

    const isPositive = values[values.length - 1] >= values[0];
    const gradient = canvas.getContext('2d').createLinearGradient(0, 0, 0, 140);
    gradient.addColorStop(0, isPositive ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    _charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: isPositive ? '#10B981' : '#EF4444',
          borderWidth: 2,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: isPositive ? '#10B981' : '#EF4444',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 } } },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)', lineWidth: 1 },
            border: { display: false },
            ticks: {
              font: { size: 10 },
              callback: v => WF.Utils.formatEuro(v, true),
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => ` ${WF.Utils.formatEuro(ctx.raw)}`,
            },
          },
        },
      },
    });
  }

  // ── Monthly bar chart (income vs expense) ───────────────────────
  function renderMonthlyChart(canvasId, transactions) {
    if (!window.Chart) return;
    _destroyChart(canvasId);

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Last 6 months
    const now = new Date();
    const months = [];
    const incomes  = [];
    const expenses = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(d.toLocaleDateString('it-IT', { month: 'short' }));

      const monthTxs = transactions.filter(t => t.date.startsWith(key));
      incomes.push(monthTxs.filter(t => t.type === 'income' || t.type === 'sell').reduce((s, t) => s + t.amount, 0));
      expenses.push(monthTxs.filter(t => t.type === 'expense' || t.type === 'buy').reduce((s, t) => s + t.amount, 0));
    }

    _charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Entrate',
            data: incomes,
            backgroundColor: 'rgba(16,185,129,0.8)',
            borderRadius: 6, borderSkipped: false,
          },
          {
            label: 'Uscite',
            data: expenses,
            backgroundColor: 'rgba(239,68,68,0.8)',
            borderRadius: 6, borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${WF.Utils.formatEuro(ctx.raw)}` },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false } },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false },
            ticks: { callback: v => WF.Utils.formatEuro(v, true), font: { size: 10 } },
          },
        },
      },
    });
  }

  // ── Mini sparkline (inline SVG, no Chart.js) ────────────────────
  function renderSparkline(container, values, color = '#4F46E5') {
    if (!container || !values.length) return;
    const w = container.offsetWidth || 80;
    const h = 36;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${x},${y}`;
    }).join(' ');

    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;">
        <polyline
          points="${points}"
          fill="none"
          stroke="${color}"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>`;
  }

  // ── Destroy all charts ──────────────────────────────────────────
  function destroyAll() {
    Object.values(_charts).forEach(c => { try { c.destroy(); } catch {} });
    _charts = {};
  }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    _setDefaults();
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    init,
    renderAllocationChart,
    renderPerformanceChart,
    renderMonthlyChart,
    renderSparkline,
    destroyAll,
  };

})();
