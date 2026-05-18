// ── js/modals.js ──────────────────────────────────────────────────────────
// Handles all modal open / close / save interactions.
// Depends on: data.js, render.js

// ═══════════════════════════════════════════════════════════════════════════
// LOAN MODAL (add / edit a loan)
// ═══════════════════════════════════════════════════════════════════════════

function openLoanModal(id) {
  editingLoanId = id || null;
  var b   = id ? bills.find(function(x) { return x.id === id; }) : null;
  var rem   = b ? (b.remaining_balance !== undefined ? b.remaining_balance : b.amount) : '';
  var start = b ? (b.starting_balance  || rem) : '';

  document.getElementById('f-name').value          = b ? b.name        : '';
  document.getElementById('f-type').value          = b ? (b.loan_type  || 'Federal') : 'Federal';
  document.getElementById('f-amount').value        = b ? b.amount      : '';
  document.getElementById('f-rate').value          = b ? (b.interest_rate != null ? b.interest_rate : '') : '';
  document.getElementById('f-start-balance').value = start;
  document.getElementById('f-day').value           = b ? b.due_date    : '';
  document.getElementById('f-url').value           = b ? (b.payment_url || '') : '';

  document.getElementById('loan-modal-title').textContent = b ? 'Edit loan'    : 'New student loan';
  document.getElementById('loan-modal-save').textContent  = b ? 'Save changes' : 'Add loan';
  document.getElementById('loan-modal').classList.remove('hidden');
}

function closeLoanModal() {
  document.getElementById('loan-modal').classList.add('hidden');
  editingLoanId = null;
}

function saveLoan() {
  var name  = document.getElementById('f-name').value.trim();
  var lt    = document.getElementById('f-type').value;
  var amt   = parseFloat(document.getElementById('f-amount').value);
  var rate  = parseFloat(document.getElementById('f-rate').value);
  var start = parseFloat(document.getElementById('f-start-balance').value);
  var due   = document.getElementById('f-day').value;
  var url   = document.getElementById('f-url').value.trim();

  if (!name || isNaN(amt) || isNaN(start) || !due) {
    alert('Please fill in all required fields.');
    return;
  }

  if (editingLoanId) {
    var b = bills.find(function(x) { return x.id === editingLoanId; });
    b.name            = name;
    b.loan_type       = lt;
    b.amount          = amt;
    b.interest_rate   = isNaN(rate) ? null : rate;
    b.starting_balance = start;
    // Only reset remaining balance if there are no payments yet
    if (!b.loan_history || !b.loan_history.length) b.remaining_balance = start;
    b.due_date        = due;
    b.payment_url     = url || null;
  } else {
    bills.push({
      id:                Date.now(),
      name:              name,
      loan_type:         lt,
      amount:            amt,
      due_date:          due,
      payment_url:       url || null,
      interest_rate:     isNaN(rate) ? null : rate,
      starting_balance:  start,
      remaining_balance: start,
      loan_history:      []
    });
  }

  closeLoanModal();
  saveBills();
  render();
}

function deleteLoan(id) {
  if (!confirm('Delete this student loan?')) return;
  bills = bills.filter(function(b) { return b.id !== id; });
  delete openPanels[id];
  saveBills();
  render();
}

function unarchiveLoan(id) {
  var b = bills.find(function(x) { return x.id === id; });
  if (b) { b.archived = false; saveBills(); render(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT MODAL (add / edit a payment)
// ═══════════════════════════════════════════════════════════════════════════

function openPaymentModal(lid, pidx) {
  activePayLoanId = lid;
  editingPayIdx   = pidx !== undefined ? pidx : null;

  var b = bills.find(function(x) { return x.id === lid; });
  var e = editingPayIdx !== null ? b.loan_history[editingPayIdx] : null;
  var ts = new Date().toISOString().split('T')[0];

  function toInputDate(raw) {
    var d = new Date(raw);
    return isNaN(d) ? ts : d.toISOString().split('T')[0];
  }

  document.getElementById('payment-modal-title').textContent = e ? 'Edit payment' : 'Add payment';
  document.getElementById('payment-modal-save').textContent  = e ? 'Save changes' : 'Save payment';
  document.getElementById('p-date').value      = e ? toInputDate(e.paid_on) : ts;
  document.getElementById('p-total').value     = e ? e.amount_paid : '';
  document.getElementById('p-principal').value = (e && e.principal_paid != null) ? e.principal_paid : '';
  document.getElementById('p-interest-preview').textContent = '—';

  document.getElementById('payment-modal').classList.remove('hidden');
  updateBalancePreview();
  updateInterestPreview();
}

function closePaymentModal() {
  document.getElementById('payment-modal').classList.add('hidden');
  activePayLoanId = null;
  editingPayIdx   = null;
}

function updateInterestPreview() {
  var t  = parseFloat(document.getElementById('p-total').value);
  var p  = parseFloat(document.getElementById('p-principal').value);
  var pr = document.getElementById('p-interest-preview');
  if (isNaN(t) || isNaN(p)) { pr.textContent = '—'; pr.style.color = 'var(--text4)'; return; }
  var i = Math.max(0, t - p);
  pr.textContent = '$' + fmt(i);
  pr.style.color = i > 0 ? 'var(--danger)' : 'var(--text3)';
}

function updateBalancePreview() {
  var b  = bills.find(function(x) { return x.id === activePayLoanId; });
  if (!b) return;
  var p  = parseFloat(document.getElementById('p-principal').value);
  var pr = document.getElementById('p-balance-preview');
  if (isNaN(p)) { pr.textContent = '—'; pr.style.color = 'var(--text4)'; return; }
  var start  = b.starting_balance || 0;
  var soFar  = (b.loan_history || []).reduce(function(s, e, i) {
    return editingPayIdx !== null && i === editingPayIdx ? s : s + (e.principal_paid || 0);
  }, 0);
  pr.textContent = '$' + fmt(Math.max(0, start - soFar - p));
  pr.style.color = 'var(--accent)';
}

function savePayment() {
  var b   = bills.find(function(x) { return x.id === activePayLoanId; });
  if (!b) return;
  var rd  = document.getElementById('p-date').value;
  var tot = parseFloat(document.getElementById('p-total').value);
  var prin = parseFloat(document.getElementById('p-principal').value);

  if (!rd || isNaN(tot) || isNaN(prin)) {
    alert('Please fill in date paid, total amount paid, and principal paid.');
    return;
  }

  var po = new Date(rd + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
  var entry = {
    paid_on:           po,
    paid_on_raw:       rd,
    amount_paid:       tot,
    principal_paid:    prin,
    interest_paid:     Math.max(0, tot - prin),
    remaining_balance: 0
  };

  if (!b.loan_history) b.loan_history = [];
  if (editingPayIdx !== null) b.loan_history[editingPayIdx] = entry;
  else b.loan_history.push(entry);

  recomputeBalances(b);
  var nb = b.remaining_balance;
  saveBills();
  render();
  closePaymentModal();
  if (!nb) setTimeout(function() { celebrate(b.name, b.id); }, 300);
}

function deletePayment(lid, pidx) {
  var b = bills.find(function(x) { return x.id === lid; });
  if (!b || !confirm('Delete this payment?')) return;
  b.loan_history.splice(pidx, 1);
  if (b.loan_history.length) recomputeBalances(b);
  else b.remaining_balance = b.starting_balance || 0;
  saveBills();
  render();
}

// ═══════════════════════════════════════════════════════════════════════════
// ALL PAYMENTS MODAL (full history list)
// ═══════════════════════════════════════════════════════════════════════════

function openAllPayments(lid) {
  var b = bills.find(function(x) { return x.id === lid; });
  if (!b) return;

  document.getElementById('all-payments-title').textContent = b.name + ' — Payment history';

  var tp  = (b.loan_history || []).reduce(function(s, e) { return s + (e.amount_paid    || 0); }, 0);
  var tpr = (b.loan_history || []).reduce(function(s, e) { return s + (e.principal_paid || 0); }, 0);
  var ti  = (b.loan_history || []).reduce(function(s, e) { return s + (e.interest_paid  || 0); }, 0);

  document.getElementById('all-payments-summary').innerHTML =
    '<div class="all-payments-stat"><div class="all-payments-stat-label">Total paid</div>' +
    '<div class="all-payments-stat-value">$' + fmt(tp) + '</div></div>' +
    '<div class="all-payments-stat"><div class="all-payments-stat-label">Principal</div>' +
    '<div class="all-payments-stat-value">$' + fmt(tpr) + '</div></div>' +
    '<div class="all-payments-stat"><div class="all-payments-stat-label">Interest</div>' +
    '<div class="all-payments-stat-value red">$' + fmt(ti) + '</div></div>';

  var sorted = (b.loan_history || []).map(function(e, i) { return { e: e, i: i }; })
    .sort(function(a, b2) {
      var da = a.e.paid_on_raw || a.e.paid_on;
      var db = b2.e.paid_on_raw || b2.e.paid_on;
      return db > da ? 1 : db < da ? -1 : 0;
    });

  var le = document.getElementById('all-payments-list');
  le.innerHTML = '';

  if (!sorted.length) {
    le.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text4);font-size:13px">No payments yet.</div>';
  } else {
    sorted.forEach(function(o, rn) {
      var e = o.e, i = o.i;
      var hp = e.principal_paid != null && e.principal_paid !== undefined;
      var hi = e.interest_paid  != null && e.interest_paid  !== undefined;
      var bd = '';
      if (hp || hi) {
        var pts = [];
        if (hp) pts.push('Principal: $' + fmt(e.principal_paid));
        if (hi) pts.push('Interest: $'  + fmt(e.interest_paid));
        bd = '<div class="payment-breakdown">' + pts.join('  ·  ') + '</div>';
      }
      var row = document.createElement('div');
      row.className = 'all-payment-row';
      row.innerHTML =
        '<div class="all-payment-num">#' + (sorted.length - rn) + '</div>' +
        '<div class="payment-dot" style="background:var(--accent)"></div>' +
        '<div class="payment-info" style="flex:1">' +
          '<div class="payment-date">'    + e.paid_on          + '</div>' +
          '<div class="payment-amount">$' + fmt(e.amount_paid)  + ' paid</div>' + bd +
        '</div>' +
        '<div class="payment-balance">$' + fmt(e.remaining_balance) + '<span>remaining</span></div>' +
        '<button class="payment-edit-btn" ' +
          'onclick="closeAllPayments();setTimeout(function(){openPaymentModal(' + lid + ',' + i + ')},150)" ' +
          'title="Edit">✏️</button>' +
        '<button class="payment-delete-btn" ' +
          'onclick="deletePayment(' + lid + ',' + i + ');openAllPayments(' + lid + ')" ' +
          'title="Delete">🗑️</button>';
      le.appendChild(row);
    });
  }

  document.getElementById('all-payments-modal').classList.remove('hidden');
}

function closeAllPayments() {
  document.getElementById('all-payments-modal').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK PAYMENT MODAL (triggered from "Make a payment →" link)
// ═══════════════════════════════════════════════════════════════════════════

var activeQuickPayId = null;

function openQuickPay(lid) {
  activeQuickPayId = lid;
  var b      = bills.find(function(x) { return x.id === lid; });
  if (!b) return;

  var ci = bills.filter(function(x) { return !x.archived; }).indexOf(b);
  var lc = LC[ci % LC.length];

  document.getElementById('qp-header').style.background =
    'linear-gradient(135deg,' + lc + ' 0%, #1f5c3c 100%)';
  document.getElementById('qp-confirm-btn').style.background = lc;

  var name = b.name;
  document.getElementById('qp-title').textContent =
    'Pay ' + (name.length > 20 ? name.slice(0, 19) + '…' : name);

  document.getElementById('qp-amount').value          = b.amount || '';
  document.getElementById('qp-date').value            = new Date().toISOString().split('T')[0];
  document.getElementById('qp-balance-preview').style.display = 'none';

  document.getElementById('quick-pay-modal').classList.remove('hidden');
  updateQPPreview();
  setTimeout(function() { document.getElementById('qp-amount').select(); }, 50);
}

function closeQuickPay() {
  document.getElementById('quick-pay-modal').classList.add('hidden');
  activeQuickPayId = null;
}

function updateQPPreview() {
  var b   = bills.find(function(x) { return x.id === activeQuickPayId; });
  if (!b) return;
  var amt     = parseFloat(document.getElementById('qp-amount').value);
  var preview = document.getElementById('qp-balance-preview');
  var balVal  = document.getElementById('qp-balance-val');
  if (isNaN(amt) || amt <= 0) { preview.style.display = 'none'; return; }
  var start  = b.starting_balance || 0;
  var soFar  = (b.loan_history || []).reduce(function(s, e) { return s + (e.principal_paid || 0); }, 0);
  var newBal = Math.max(0, start - soFar - amt);
  balVal.textContent    = '$' + fmt(newBal);
  preview.style.display = 'flex';
}

function saveQuickPayment() {
  var b   = bills.find(function(x) { return x.id === activeQuickPayId; });
  if (!b) return;
  var amt = parseFloat(document.getElementById('qp-amount').value);
  var rd  = document.getElementById('qp-date').value;

  if (!rd || isNaN(amt) || amt <= 0) {
    alert('Please enter a valid payment amount and date.');
    return;
  }

  var po = new Date(rd + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
  var entry = {
    paid_on:           po,
    paid_on_raw:       rd,
    amount_paid:       amt,
    principal_paid:    amt,
    interest_paid:     0,
    remaining_balance: 0
  };

  if (!b.loan_history) b.loan_history = [];
  b.loan_history.push(entry);
  recomputeBalances(b);

  var nb = b.remaining_balance;
  saveBills();
  render();
  closeQuickPay();
  if (!nb) setTimeout(function() { celebrate(b.name, b.id); }, 300);
}
