// ── js/data.js ────────────────────────────────────────────────────────────
// Shared state, constants, and data persistence.
// Loaded first — all other JS files depend on these globals.

// ── Color palettes (indexed by loan position) ─────────────────────────────
var LC = ['#2d6a4f','#1a56a0','#7c3aed','#b7770d','#c0392b','#0891b2'];
var LS = ['#d8ede4','#e8f0fb','#ede9fe','#fef9e7','#fdecea','#e0f2fe'];
var LD = ['#152a20','#182030','#1e1230','#2a2010','#2a1a18','#0c2030'];

// Emoji icons keyed by loan name keywords
var ICONS = {
  'Federal Direct Loan': '🎓',
  'Perkins Loan': '🎓',
  'PLUS Loan': '🎓',
  'Private Loan': '🏦',
  'Subsidized': '🎓',
  'Unsubsidized': '🎓',
  'Other': '💳'
};

// ── Bills (main data array) ───────────────────────────────────────────────
var bills = JSON.parse(localStorage.getItem('slm-bills')) || [
  {
    id: 1,
    name: 'Federal Direct Loan',
    loan_type: 'Subsidized',
    interest_rate: 4.99,
    amount: 350,
    due_date: '2026-04-15',
    starting_balance: 18000,
    remaining_balance: 15200,
    loan_history: []
  },
  {
    id: 2,
    name: 'Private Loan',
    loan_type: 'Private',
    interest_rate: 7.25,
    amount: 200,
    due_date: '2026-04-18',
    starting_balance: 8000,
    remaining_balance: 6400,
    loan_history: []
  }
];

// ── UI state ──────────────────────────────────────────────────────────────
var editingLoanId  = null;
var activePayLoanId = null;
var editingPayIdx  = null;
var openPanels     = {};

// ── Persistence ───────────────────────────────────────────────────────────
function saveBills() {
  localStorage.setItem('slm-bills', JSON.stringify(bills));
  // Also push to GitHub Gist if connected
  var token = localStorage.getItem('gh-token');
  if (token) gistSave(bills);
}

// ── Shared helpers ────────────────────────────────────────────────────────

/** Format a number as a dollar value string (no $ prefix). */
function fmt(n) {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: n % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: 2
  });
}

/** Return a due-date status label + CSS class based on days remaining. */
function getStatus(daysLeft) {
  if (daysLeft < 0)  return { label: 'Overdue',      cls: 'badge-overdue' };
  if (daysLeft === 0) return { label: 'Due today',   cls: 'badge-due' };
  if (daysLeft <= 5) return { label: daysLeft + 'd left', cls: 'badge-soon' };
  return               { label: daysLeft + 'd left', cls: 'badge-ok' };
}

/** Estimate payoff date from payment history. Returns a Date or null. */
function estimatePayoff(bill) {
  var pp = (bill.loan_history || [])
    .map(function(e) { return e.principal_paid; })
    .filter(function(p) { return p > 0; });
  if (pp.length < 2) return null;
  var avg = pp.reduce(function(a, b) { return a + b; }, 0) / pp.length;
  if (avg <= 0) return null;
  var sorted = (bill.loan_history || []).slice().sort(function(a, b) {
    return new Date(b.paid_on) - new Date(a.paid_on);
  });
  var cur = sorted.length > 0 ? sorted[0].remaining_balance : bill.remaining_balance;
  var d = new Date();
  d.setDate(d.getDate() + Math.round((cur / avg) * 30));
  return d;
}

/** Animate a metric card value counting up/down to `target`. */
function animateValue(id, target) {
  var el = document.getElementById(id);
  if (!el) return;
  var prev   = parseFloat(el.dataset.value) || 0;
  var change = target - prev;
  if (!change) { el.textContent = '$' + fmt(target); return; }
  var dur = 1600, st = performance.now();
  function step(now) {
    var p = Math.min((now - st) / dur, 1);
    var e = 1 - Math.pow(1 - p, 3);           // ease-out-cubic
    el.textContent = '$' + fmt(Math.round((prev + change * e) * 100) / 100);
    if (p < 1) requestAnimationFrame(step);
    else { el.textContent = '$' + fmt(target); el.dataset.value = target; }
  }
  el.dataset.value = prev;
  requestAnimationFrame(step);
}

/** Recompute all remaining_balance fields from scratch after a payment edit. */
function recomputeBalances(bill) {
  var start = bill.starting_balance || 0;
  var ch = bill.loan_history.slice().sort(function(a, b) {
    var da = a.paid_on_raw || a.paid_on;
    var db = b.paid_on_raw || b.paid_on;
    return da > db ? 1 : da < db ? -1 : 0;
  });
  var bal = start;
  ch.forEach(function(e) {
    bal = Math.max(0, bal - (e.principal_paid || 0));
    e.remaining_balance = bal;
  });
  // Sync back to the original (unsorted) array
  bill.loan_history.forEach(function(e) {
    var m = ch.find(function(c) {
      return (c.paid_on_raw || c.paid_on) === (e.paid_on_raw || e.paid_on) &&
             c.amount_paid === e.amount_paid;
    });
    if (m) e.remaining_balance = m.remaining_balance;
  });
  bill.remaining_balance = ch.length ? ch[ch.length - 1].remaining_balance : start;
}

/** Export all loan + payment data as a CSV download. */
function exportCSV() {
  var today = new Date().toLocaleDateString('en-US');
  var rows = [
    ['Loan Name','Type','Interest Rate (%)','Monthly Payment',
     'Starting Balance','Remaining Balance','Payments Made','Date Exported']
  ];
  bills.forEach(function(b) {
    rows.push([
      b.name, b.loan_type || '', b.interest_rate != null ? b.interest_rate : '',
      b.amount, b.starting_balance || '', b.remaining_balance || '',
      (b.loan_history || []).length, today
    ]);
  });
  rows.push([]);
  rows.push(['--- Payment History ---']);
  rows.push(['Loan Name','Date Paid','Amount Paid','Principal Paid','Interest Paid','Remaining Balance']);
  bills.forEach(function(b) {
    (b.loan_history || []).forEach(function(e) {
      rows.push([
        b.name, e.paid_on, e.amount_paid,
        e.principal_paid != null ? e.principal_paid : '',
        e.interest_paid  != null ? e.interest_paid  : '',
        e.remaining_balance
      ]);
    });
  });
  var csv = rows.map(function(r) {
    return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url;
  a.download = 'student_loans.csv';
  a.click();
  URL.revokeObjectURL(url);
}
