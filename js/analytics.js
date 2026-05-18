// ── js/analytics.js ───────────────────────────────────────────────────────
// Analytics tab: summary cards, payoff dates, and all three charts.
// Depends on: data.js  (bills, LC, fmt, estimatePayoff, animateValue)
// Chart.js is lazy-loaded by main.js before this is called.

var CHART_COLORS      = ['#2d6a4f','#1a56a0','#7c3aed','#b7770d','#c0392b','#0891b2'];
var CHART_COLORS_SOFT = [
  'rgba(45,106,79,.15)',  'rgba(26,86,160,.15)', 'rgba(124,58,237,.15)',
  'rgba(183,119,13,.15)', 'rgba(192,57,43,.15)', 'rgba(8,145,178,.15)'
];

var _chartTitles = {
  monthly:    'Monthly payments',
  balance:    'Balance history',
  projection: 'Payoff projection'
};

// ── Main analytics render (called when Analytics tab opens) ───────────────
function renderAnalytics() {
  renderSummaryCards();
  renderPayoffDates();
  renderMonthlyBars();
  renderBalanceChart();
  renderProjectionChart();
  renderChartStats('monthly');
}

// ── Summary cards ─────────────────────────────────────────────────────────
function renderSummaryCards() {
  var ti = 0, tp = 0;
  bills.forEach(function(b) {
    (b.loan_history || []).forEach(function(e) {
      if (e.interest_paid)  ti += e.interest_paid;
      if (e.principal_paid) tp += e.principal_paid;
    });
  });
  var tb   = bills.reduce(function(s, b) { return s + (b.remaining_balance || 0); }, 0);
  var tpay = bills.reduce(function(s, b) { return s + (b.loan_history || []).length; }, 0);

  var grid = document.getElementById('interest-grid');
  grid.innerHTML =
    '<div class="interest-card"><div class="interest-card-label">Total interest paid</div>' +
    '<div class="interest-card-value red" id="a-interest">$0</div></div>' +
    '<div class="interest-card"><div class="interest-card-label">Total principal paid</div>' +
    '<div class="interest-card-value" id="a-principal">$0</div></div>' +
    '<div class="interest-card"><div class="interest-card-label">Total remaining</div>' +
    '<div class="interest-card-value" id="a-balance">$0</div></div>' +
    '<div class="interest-card"><div class="interest-card-label">Payments made</div>' +
    '<div class="interest-card-value" id="a-payments">0</div></div>';

  animateValue('a-interest',  ti);
  animateValue('a-principal', tp);
  animateValue('a-balance',   tb);
  document.getElementById('a-payments').textContent = tpay;

  // Per-loan breakdown
  bills.forEach(function(b) {
    var interest  = (b.loan_history || []).reduce(function(s, e) { return s + (e.interest_paid  || 0); }, 0);
    var principal = (b.loan_history || []).reduce(function(s, e) { return s + (e.principal_paid || 0); }, 0);
    if (!interest && !principal) return;
    var c = document.createElement('div');
    c.className = 'interest-card wide';
    c.innerHTML =
      '<div class="interest-card-label" style="margin-bottom:8px">' + b.name + '</div>' +
      '<div class="per-loan-row">' +
        '<div><div class="per-loan-cell-label">Principal paid</div><div class="per-loan-cell-value">$' + fmt(principal) + '</div></div>' +
        '<div><div class="per-loan-cell-label">Interest paid</div><div class="per-loan-cell-value red">$' + fmt(interest) + '</div></div>' +
        '<div><div class="per-loan-cell-label">Remaining</div><div class="per-loan-cell-value">$' + fmt(b.remaining_balance) + '</div></div>' +
      '</div>';
    grid.appendChild(c);
  });
}

// ── Payoff date cards ─────────────────────────────────────────────────────
function renderPayoffDates() {
  var pl = document.getElementById('payoff-list');
  pl.innerHTML = '';
  bills.forEach(function(b, bi) {
    var rem   = b.remaining_balance || 0;
    var start = b.starting_balance  || b.remaining_balance || 0;
    var pct   = start > 0 ? Math.min(100, Math.max(0, Math.round((1 - rem / start) * 100))) : 0;
    var payoff = estimatePayoff(b);
    var ds     = payoff
      ? payoff.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : 'Need more payments';
    var loanColor = LC[bi % LC.length];
    var c = document.createElement('div');
    c.className = 'payoff-card';
    c.style.setProperty('--payoff-color', loanColor);
    c.innerHTML =
      '<div class="payoff-card-header">' +
        '<div class="payoff-card-name">'  + b.name + '</div>' +
        '<div class="payoff-card-date ' + (payoff ? '' : 'unknown') + '" style="color:' + loanColor + '">' +
          (payoff ? '🎯 ' + ds : ds) +
        '</div>' +
      '</div>' +
      '<div class="payoff-track"><div class="payoff-fill" style="width:' + pct + '%;background:' + loanColor + '"></div></div>' +
      '<div class="payoff-meta"><span>$' + fmt(rem) + ' remaining</span><span>' + pct + '% paid off</span></div>';
    pl.appendChild(c);
  });
}

// ── Monthly bar chart ─────────────────────────────────────────────────────
function renderMonthlyBars() {
  var monthly = {};
  bills.forEach(function(b) {
    (b.loan_history || []).forEach(function(e) {
      var d = new Date(e.paid_on);
      if (isNaN(d)) return;
      var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      monthly[k] = (monthly[k] || 0) + (e.amount_paid || 0);
    });
  });

  var ci   = document.getElementById('chart-inner');
  ci.innerHTML = '';

  var keys = Object.keys(monthly).sort();
  if (!keys.length) {
    ci.innerHTML =
      '<div class="chart-empty">' +
        '<div class="chart-empty-icon">📊</div>' +
        '<div class="chart-empty-text">No payments yet.<br>Add a payment to see your history.</div>' +
      '</div>';
    return;
  }

  var mx     = Math.max.apply(null, keys.map(function(k) { return monthly[k]; }));
  var maxKey = keys.reduce(function(a, k) { return monthly[k] > monthly[a] ? k : a; }, keys[0]);

  keys.forEach(function(k) {
    var v      = monthly[k];
    var h      = mx > 0 ? Math.max(4, (v / mx) * 100) : 4;
    var pts    = k.split('-');
    var lbl    = new Date(+pts[0], +pts[1] - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    var isMax  = k === maxKey;
    var w      = document.createElement('div');
    w.className = 'chart-bar-wrap';
    w.innerHTML =
      '<div class="chart-tooltip">$' + fmt(v) + '</div>' +
      '<div class="chart-bar" style="height:' + h + '%;' + (isMax ? 'background:var(--accent);' : '') + '"></div>' +
      '<div class="chart-label">' + lbl + '</div>';
    ci.appendChild(w);
  });
}

// ── Balance-over-time line chart ──────────────────────────────────────────
function renderBalanceChart() {
  var bw = document.getElementById('balance-chart-wrap');
  if (window._balChart) { window._balChart.destroy(); window._balChart = null; }
  bw.innerHTML = '';

  var allDates = new Set();
  bills.forEach(function(b) {
    (b.loan_history || []).forEach(function(e) { if (e.paid_on) allDates.add(e.paid_on); });
  });
  var sortedDates = Array.from(allDates).sort(function(a, b) { return new Date(a) - new Date(b); });

  if (sortedDates.length < 2) {
    bw.innerHTML =
      '<div class="chart-empty">' +
        '<div class="chart-empty-icon">📉</div>' +
        '<div class="chart-empty-text">Add at least 2 payments<br>to see your balance over time.</div>' +
      '</div>';
    return;
  }

  var canvas = document.createElement('canvas');
  canvas.height = 240;
  bw.appendChild(canvas);

  var dark = document.body.classList.contains('dark');
  var gc   = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  var tc   = dark ? '#525250' : '#b0b0a8';

  window._balChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: sortedDates,
      datasets: bills.map(function(b, i) {
        var col = CHART_COLORS[i % 6];
        return {
          label: b.name,
          data: sortedDates.map(function(dt) {
            var h  = (b.loan_history || []).slice()
              .sort(function(a, c) { return new Date(a.paid_on) - new Date(c.paid_on); });
            var en = h.filter(function(e) { return new Date(e.paid_on) <= new Date(dt); }).pop();
            return en ? en.remaining_balance : null;
          }),
          borderColor:     col,
          backgroundColor: CHART_COLORS_SOFT[i % 6],
          fill:            true,
          borderWidth:     2.5,
          pointRadius:     4,
          pointHoverRadius: 6,
          pointBackgroundColor: col,
          tension:         .4,
          spanGaps:        true
        };
      })
    },
    options: _chartOptions(dark, gc, tc, {
      label: function(x) { return ' ' + x.dataset.label + ': $' + fmt(x.raw); }
    })
  });
}

// ── Payoff projection chart ───────────────────────────────────────────────
function renderProjectionChart() {
  var pw = document.getElementById('projection-chart-wrap');
  if (window._projChart) { window._projChart.destroy(); window._projChart = null; }
  pw.innerHTML = '';

  var datasets = [];
  var hasProjection = false;

  bills.forEach(function(b, i) {
    var hist = (b.loan_history || []).slice()
      .sort(function(a, c) { return new Date(a.paid_on) - new Date(c.paid_on); });
    var pp = hist.map(function(e) { return e.principal_paid; }).filter(function(p) { return p > 0; });
    if (pp.length < 2) return;
    hasProjection = true;

    var avg = pp.reduce(function(a, c) { return a + c; }, 0) / pp.length;
    var bal = hist.length ? hist[hist.length - 1].remaining_balance : b.remaining_balance;

    var historical  = hist.map(function(e) { return { x: e.paid_on, y: e.remaining_balance }; });
    var projection  = [];
    var d           = new Date();
    var iter        = 0;
    while (bal > 0 && iter < 360) {
      d = new Date(d);
      d.setMonth(d.getMonth() + 1);
      bal = Math.max(0, bal - avg);
      projection.push({ x: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), y: bal });
      iter++;
      if (!bal) break;
    }

    var col = CHART_COLORS[i % 6];
    datasets.push({
      label:               b.name + ' (actual)',
      data:                historical,
      borderColor:         col,
      backgroundColor:     CHART_COLORS_SOFT[i % 6],
      fill:                true,
      borderWidth:         2.5,
      pointRadius:         3,
      pointHoverRadius:    5,
      pointBackgroundColor: col,
      tension:             .4
    });
    datasets.push({
      label:           b.name + ' (projected)',
      data:            projection,
      borderColor:     col,
      backgroundColor: 'transparent',
      borderWidth:     2,
      borderDash:      [6, 4],
      pointRadius:     0,
      tension:         .4
    });
  });

  if (!hasProjection) {
    pw.innerHTML =
      '<div class="chart-empty">' +
        '<div class="chart-empty-icon">🔮</div>' +
        '<div class="chart-empty-text">Add at least 2 payments with principal<br>to see your payoff projection.</div>' +
      '</div>';
    return;
  }

  var canvas = document.createElement('canvas');
  canvas.height = 240;
  pw.appendChild(canvas);

  var dark = document.body.classList.contains('dark');
  var gc   = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  var tc   = dark ? '#525250' : '#b0b0a8';

  window._projChart = new Chart(canvas, {
    type: 'line',
    data: { datasets: datasets },
    options: Object.assign(
      _chartOptions(dark, gc, tc, {
        label: function(x) { return ' ' + x.dataset.label + ': $' + fmt(x.raw.y); }
      }),
      {
        parsing: false,
        plugins: Object.assign(
          _chartOptions(dark, gc, tc, {}).plugins,
          {
            legend: {
              labels: {
                color: tc,
                font: { size: 11, family: 'Epilogue', weight: '600' },
                padding: 16,
                usePointStyle: true,
                pointStyleWidth: 8,
                // Hide "projected" series from legend to avoid clutter
                filter: function(item) { return !item.text.includes('projected'); }
              }
            }
          }
        ),
        scales: {
          x: { type: 'category', ticks: { color: tc, maxTicksLimit: 8, font: { size: 10, family: 'Martian Mono' } }, grid: { color: gc }, border: { display: false } },
          y: { ticks: { color: tc, callback: function(v) { return '$' + fmt(v); }, font: { size: 10, family: 'Martian Mono' } }, grid: { color: gc }, border: { display: false } }
        }
      }
    )
  });
}

// ── Shared Chart.js options factory ──────────────────────────────────────
function _chartOptions(dark, gc, tc, tooltipCallbacks) {
  return {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: tc,
          font: { size: 11, family: 'Epilogue', weight: '600' },
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8
        }
      },
      tooltip: {
        backgroundColor: dark ? '#1e1e1c' : '#fff',
        titleColor:      dark ? '#f0efe8' : '#111',
        bodyColor:       dark ? '#b0b0a8' : '#3a3a38',
        borderColor:     dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)',
        borderWidth:     1,
        padding:         12,
        callbacks:       tooltipCallbacks
      }
    },
    scales: {
      x: { ticks: { color: tc, maxTicksLimit: 8, font: { size: 10, family: 'Martian Mono' } }, grid: { color: gc }, border: { display: false } },
      y: { ticks: { color: tc, callback: function(v) { return '$' + fmt(v); }, font: { size: 10, family: 'Martian Mono' } }, grid: { color: gc }, border: { display: false } }
    }
  };
}

// ── Chart sub-tab switching ───────────────────────────────────────────────
function switchChart(c) {
  ['monthly', 'balance', 'projection'].forEach(function(x) {
    document.getElementById('subtab-'  + x).classList.toggle('active', x === c);
    document.getElementById('subpanel-' + x).classList.toggle('active', x === c);
  });
  var tl = document.getElementById('chart-title-line');
  if (tl) tl.textContent = _chartTitles[c] || '';
  renderChartStats(c);
}

// ── Stat pills above each chart ───────────────────────────────────────────
function renderChartStats(c) {
  var row = document.getElementById('chart-stats-row');
  if (!row) return;
  row.innerHTML = '';

  var pills = [];

  if (c === 'monthly') {
    var monthly = {};
    bills.forEach(function(b) {
      (b.loan_history || []).forEach(function(e) {
        var d = new Date(e.paid_on);
        if (isNaN(d)) return;
        var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        monthly[k] = (monthly[k] || 0) + (e.amount_paid || 0);
      });
    });
    var vals = Object.values(monthly);
    if (!vals.length) return;
    var total = vals.reduce(function(a, b) { return a + b; }, 0);
    var avg   = total / vals.length;
    var mx    = Math.max.apply(null, vals);
    pills = [['Total paid', '$' + fmt(total)], ['Avg / month', '$' + fmt(Math.round(avg))], ['Best month', '$' + fmt(mx)]];

  } else if (c === 'balance') {
    var tb = bills.reduce(function(s, b) { return s + (b.remaining_balance || 0); }, 0);
    var ts = bills.reduce(function(s, b) { return s + (b.starting_balance  || 0); }, 0);
    var pct = ts > 0 ? Math.round((1 - tb / ts) * 100) : 0;
    pills = [['Started', '$' + fmt(ts)], ['Remaining', '$' + fmt(tb)], ['% paid off', pct + '%']];

  } else if (c === 'projection') {
    var earliest = null;
    bills.forEach(function(b) {
      var e = estimatePayoff(b);
      if (e && (!earliest || e < earliest)) earliest = e;
    });
    pills = [
      ['Loans tracked', bills.filter(function(b) { return !b.archived; }).length],
      ['Est. payoff',   earliest ? earliest.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—']
    ];
  }

  pills.forEach(function(p) {
    var el = document.createElement('div');
    el.className = 'chart-stat-pill';
    el.innerHTML =
      '<div class="chart-stat-pill-label">'  + p[0] + '</div>' +
      '<div class="chart-stat-pill-value">'  + p[1] + '</div>';
    row.appendChild(el);
  });
}
