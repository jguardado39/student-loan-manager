// ── js/analytics.js ───────────────────────────────────────────────────────
// Per-loan analytics: loan picker, summary cards, payoff date, and charts.
// Depends on: data.js (bills, LC, fmt, estimatePayoff, animateValue)
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

// Tracks which loan is currently selected in the analytics tab
var _selectedLoanId = null;

// ── Entry point ───────────────────────────────────────────────────────────
function renderAnalytics() {
  var active = bills.filter(function(b) { return !b.archived; });

  // Default to first loan, or keep current selection if it still exists
  if (!_selectedLoanId || !active.find(function(b) { return b.id === _selectedLoanId; })) {
    _selectedLoanId = active.length ? active[0].id : null;
  }

  renderLoanPicker(active);

  if (!_selectedLoanId) {
    renderAnalyticsEmpty();
    return;
  }

  var b          = bills.find(function(x) { return x.id === _selectedLoanId; });
  var colorIndex = active.indexOf(b);
  var loanColor  = LC[colorIndex % LC.length];

  renderSummaryCards(b, loanColor);
  renderPayoffDate(b, colorIndex);
  renderMonthlyBars(b, loanColor);
  renderBalanceChart(b, loanColor);
  renderProjectionChart(b, loanColor);
  renderChartStats('monthly', b);
}

// ── Loan picker pill buttons ──────────────────────────────────────────────
function renderLoanPicker(active) {
  var wrap = document.getElementById('analytics-loan-picker');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!active.length) return;

  active.forEach(function(b, i) {
    var lc  = LC[i % LC.length];
    var btn = document.createElement('button');
    btn.className   = 'loan-picker-btn' + (b.id === _selectedLoanId ? ' active' : '');
    btn.textContent = b.name;
    btn.style.setProperty('--picker-color', lc);
    btn.onclick = function() { selectAnalyticsLoan(b.id); };
    wrap.appendChild(btn);
  });
}

function selectAnalyticsLoan(id) {
  _selectedLoanId = id;
  if (window._balChart)  { window._balChart.destroy();  window._balChart  = null; }
  if (window._projChart) { window._projChart.destroy(); window._projChart = null; }
  renderAnalytics();
}

// ── Empty state (no active loans) ────────────────────────────────────────
function renderAnalyticsEmpty() {
  document.getElementById('interest-grid').innerHTML =
    '<div style="grid-column:span 2;padding:2rem;text-align:center;color:var(--text4);font-family:var(--mono);font-size:13px">No active loans to analyse.</div>';
  document.getElementById('payoff-card-wrap').innerHTML = '';
  document.getElementById('chart-inner').innerHTML = '';
}

// ── Summary cards (scoped to one loan) ───────────────────────────────────
function renderSummaryCards(b, loanColor) {
  var ti    = (b.loan_history || []).reduce(function(s, e) { return s + (e.interest_paid  || 0); }, 0);
  var tp    = (b.loan_history || []).reduce(function(s, e) { return s + (e.principal_paid || 0); }, 0);
  var tb    = b.remaining_balance || 0;
  var tpay  = (b.loan_history || []).length;
  var start = b.starting_balance || b.remaining_balance || 0;
  var pct   = start > 0 ? Math.min(100, Math.max(0, Math.round((1 - tb / start) * 100))) : 0;
  var mi    = b.interest_rate ? ((b.interest_rate / 100 / 12) * tb).toFixed(2) : null;

  var grid = document.getElementById('interest-grid');
  grid.innerHTML =
    '<div class="interest-card"><div class="interest-card-label">Interest paid</div>' +
    '<div class="interest-card-value red" id="a-interest">$0</div></div>' +

    '<div class="interest-card"><div class="interest-card-label">Principal paid</div>' +
    '<div class="interest-card-value" id="a-principal">$0</div></div>' +

    '<div class="interest-card"><div class="interest-card-label">Remaining balance</div>' +
    '<div class="interest-card-value" id="a-balance">$0</div></div>' +

    '<div class="interest-card"><div class="interest-card-label">Payments made</div>' +
    '<div class="interest-card-value" id="a-payments">0</div></div>' +

    '<div class="interest-card wide">' +
      '<div class="interest-card-label" style="margin-bottom:10px">Progress</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">' +
        '<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">$' + fmt(start - tb) + ' of $' + fmt(start) + ' paid</span>' +
        '<span style="font-family:var(--mono);font-size:14px;font-weight:600;color:' + loanColor + '">' + pct + '%</span>' +
      '</div>' +
      '<div style="height:8px;background:var(--surface2);border-radius:999px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:' + loanColor + ';border-radius:999px;transition:width .8s cubic-bezier(.4,0,.2,1)"></div>' +
      '</div>' +
      (mi ? '<div style="margin-top:8px;font-family:var(--mono);font-size:11px;color:var(--text3)">~$' + mi + '/mo in interest &nbsp;&middot;&nbsp; ' + b.interest_rate + '% APR</div>' : '') +
    '</div>';

  animateValue('a-interest',  ti);
  animateValue('a-principal', tp);
  animateValue('a-balance',   tb);
  document.getElementById('a-payments').textContent = tpay;
}

// ── Payoff date card (single loan) ────────────────────────────────────────
function renderPayoffDate(b, colorIndex) {
  var wrap = document.getElementById('payoff-card-wrap');
  wrap.innerHTML = '';

  var rem       = b.remaining_balance || 0;
  var start     = b.starting_balance  || b.remaining_balance || 0;
  var pct       = start > 0 ? Math.min(100, Math.max(0, Math.round((1 - rem / start) * 100))) : 0;
  var payoff    = estimatePayoff(b);
  var ds        = payoff
    ? payoff.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Need more payments';
  var loanColor = LC[colorIndex % LC.length];

  var c = document.createElement('div');
  c.className = 'payoff-card';
  c.style.setProperty('--payoff-color', loanColor);
  c.innerHTML =
    '<div class="payoff-card-header">' +
      '<div class="payoff-card-name">' + b.name + '</div>' +
      '<div class="payoff-card-date ' + (payoff ? '' : 'unknown') + '" style="color:' + loanColor + '">' +
        (payoff ? '🎯 ' + ds : ds) +
      '</div>' +
    '</div>' +
    '<div class="payoff-track"><div class="payoff-fill" style="width:' + pct + '%;background:' + loanColor + '"></div></div>' +
    '<div class="payoff-meta"><span>$' + fmt(rem) + ' remaining</span><span>' + pct + '% paid off</span></div>';
  wrap.appendChild(c);
}

// ── Monthly bar chart (single loan) ──────────────────────────────────────
function renderMonthlyBars(b, loanColor) {
  var monthly = {};
  (b.loan_history || []).forEach(function(e) {
    var d = new Date(e.paid_on);
    if (isNaN(d)) return;
    var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    monthly[k] = (monthly[k] || 0) + (e.amount_paid || 0);
  });

  var ci = document.getElementById('chart-inner');
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

  var mx        = Math.max.apply(null, keys.map(function(k) { return monthly[k]; }));
  var maxKey    = keys.reduce(function(a, k) { return monthly[k] > monthly[a] ? k : a; }, keys[0]);
  var softColor = loanColor + '28';

  keys.forEach(function(k) {
    var v     = monthly[k];
    var h     = mx > 0 ? Math.max(4, (v / mx) * 100) : 4;
    var pts   = k.split('-');
    var lbl   = new Date(+pts[0], +pts[1] - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    var isMax = k === maxKey;
    var w     = document.createElement('div');
    w.className = 'chart-bar-wrap';
    w.innerHTML =
      '<div class="chart-tooltip">$' + fmt(v) + '</div>' +
      '<div class="chart-bar" style="height:' + h + '%;background:' + (isMax ? loanColor : softColor) + ';"></div>' +
      '<div class="chart-label">' + lbl + '</div>';
    var bar = w.querySelector('.chart-bar');
    bar.addEventListener('mouseenter', function() { bar.style.background = loanColor; });
    bar.addEventListener('mouseleave', function() { bar.style.background = isMax ? loanColor : softColor; });
    ci.appendChild(w);
  });
}

// ── Balance-over-time line chart (single loan) ────────────────────────────
function renderBalanceChart(b, loanColor) {
  var bw = document.getElementById('balance-chart-wrap');
  if (window._balChart) { window._balChart.destroy(); window._balChart = null; }
  bw.innerHTML = '';

  var hist = (b.loan_history || []).slice()
    .sort(function(a, c) { return new Date(a.paid_on) - new Date(c.paid_on); });

  if (hist.length < 2) {
    bw.innerHTML =
      '<div class="chart-empty">' +
        '<div class="chart-empty-icon">📉</div>' +
        '<div class="chart-empty-text">Add at least 2 payments<br>to see your balance over time.</div>' +
      '</div>';
    return;
  }

  var labels    = hist.map(function(e) { return e.paid_on; });
  var data      = hist.map(function(e) { return e.remaining_balance; });
  var canvas    = document.createElement('canvas');
  canvas.height = 240;
  bw.appendChild(canvas);

  var dark      = document.body.classList.contains('dark');
  var gc        = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  var tc        = dark ? '#525250' : '#b0b0a8';
  var softColor = loanColor + '26';

  window._balChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label:                b.name,
        data:                 data,
        borderColor:          loanColor,
        backgroundColor:      softColor,
        fill:                 true,
        borderWidth:          2.5,
        pointRadius:          4,
        pointHoverRadius:     6,
        pointBackgroundColor: loanColor,
        tension:              .4
      }]
    },
    options: _chartOptions(dark, gc, tc, {
      label: function(x) { return ' $' + fmt(x.raw); }
    })
  });
}

// ── Payoff projection chart (single loan) ────────────────────────────────
function renderProjectionChart(b, loanColor) {
  var pw = document.getElementById('projection-chart-wrap');
  if (window._projChart) { window._projChart.destroy(); window._projChart = null; }
  pw.innerHTML = '';

  var hist = (b.loan_history || []).slice()
    .sort(function(a, c) { return new Date(a.paid_on) - new Date(c.paid_on); });
  var pp = hist.map(function(e) { return e.principal_paid; }).filter(function(p) { return p > 0; });

  if (pp.length < 2) {
    pw.innerHTML =
      '<div class="chart-empty">' +
        '<div class="chart-empty-icon">🔮</div>' +
        '<div class="chart-empty-text">Add at least 2 payments with principal<br>to see your payoff projection.</div>' +
      '</div>';
    return;
  }

  var avg        = pp.reduce(function(a, c) { return a + c; }, 0) / pp.length;
  var bal        = hist[hist.length - 1].remaining_balance;
  var historical = hist.map(function(e) { return { x: e.paid_on, y: e.remaining_balance }; });
  var projection = [];
  var d          = new Date();
  var iter       = 0;
  while (bal > 0 && iter < 360) {
    d = new Date(d);
    d.setMonth(d.getMonth() + 1);
    bal = Math.max(0, bal - avg);
    projection.push({ x: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), y: bal });
    iter++;
    if (!bal) break;
  }

  var canvas    = document.createElement('canvas');
  canvas.height = 240;
  pw.appendChild(canvas);

  var dark      = document.body.classList.contains('dark');
  var gc        = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  var tc        = dark ? '#525250' : '#b0b0a8';
  var softColor = loanColor + '26';

  window._projChart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [
        {
          label:                'Actual',
          data:                 historical,
          borderColor:          loanColor,
          backgroundColor:      softColor,
          fill:                 true,
          borderWidth:          2.5,
          pointRadius:          3,
          pointHoverRadius:     5,
          pointBackgroundColor: loanColor,
          tension:              .4
        },
        {
          label:           'Projected',
          data:            projection,
          borderColor:     loanColor,
          backgroundColor: 'transparent',
          borderWidth:     2,
          borderDash:      [6, 4],
          pointRadius:     0,
          tension:         .4
        }
      ]
    },
    options: Object.assign(
      _chartOptions(dark, gc, tc, {
        label: function(x) { return ' ' + x.dataset.label + ': $' + fmt(x.raw.y); }
      }),
      {
        parsing: false,
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
      legend: { display: false },
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
    document.getElementById('subtab-'   + x).classList.toggle('active', x === c);
    document.getElementById('subpanel-' + x).classList.toggle('active', x === c);
  });
  var tl = document.getElementById('chart-title-line');
  if (tl) tl.textContent = _chartTitles[c] || '';
  var b = bills.find(function(x) { return x.id === _selectedLoanId; });
  renderChartStats(c, b);
}

// ── Stat pills above each chart (scoped to selected loan) ─────────────────
function renderChartStats(c, b) {
  var row = document.getElementById('chart-stats-row');
  if (!row || !b) return;
  row.innerHTML = '';

  var pills = [];

  if (c === 'monthly') {
    var monthly = {};
    (b.loan_history || []).forEach(function(e) {
      var d = new Date(e.paid_on);
      if (isNaN(d)) return;
      var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      monthly[k] = (monthly[k] || 0) + (e.amount_paid || 0);
    });
    var vals = Object.values(monthly);
    if (!vals.length) return;
    var total = vals.reduce(function(a, v) { return a + v; }, 0);
    var avg   = total / vals.length;
    var mx    = Math.max.apply(null, vals);
    pills = [['Total paid', '$' + fmt(total)], ['Avg / month', '$' + fmt(Math.round(avg))], ['Best month', '$' + fmt(mx)]];

  } else if (c === 'balance') {
    var rem   = b.remaining_balance || 0;
    var start = b.starting_balance  || 0;
    var pct   = start > 0 ? Math.round((1 - rem / start) * 100) : 0;
    pills = [['Started', '$' + fmt(start)], ['Remaining', '$' + fmt(rem)], ['% paid off', pct + '%']];

  } else if (c === 'projection') {
    var payoff = estimatePayoff(b);
    var pp     = (b.loan_history || []).map(function(e) { return e.principal_paid; }).filter(function(p) { return p > 0; });
    var avg2   = pp.length ? pp.reduce(function(a, v) { return a + v; }, 0) / pp.length : 0;
    pills = [
      ['Avg principal/mo', avg2 ? '$' + fmt(Math.round(avg2)) : '—'],
      ['Est. payoff', payoff ? payoff.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—']
    ];
  }

  pills.forEach(function(p) {
    var el = document.createElement('div');
    el.className = 'chart-stat-pill';
    el.innerHTML =
      '<div class="chart-stat-pill-label">' + p[0] + '</div>' +
      '<div class="chart-stat-pill-value">' + p[1] + '</div>';
    row.appendChild(el);
  });
}