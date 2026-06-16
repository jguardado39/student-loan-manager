// ── js/render.js ──────────────────────────────────────────────────────────
// Responsible for building and updating the DOM.
// Depends on: data.js

// ── Main render ───────────────────────────────────────────────────────────
function render() {
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  document.getElementById('today-label').textContent =
    today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Compute summary metrics
  var total = 0, dueWeek = 0, overdue = 0, totalDebt = 0;
  bills.forEach(function(b) {
    total     += b.amount || 0;
    totalDebt += b.remaining_balance || 0;
    var diff = Math.round((new Date(b.due_date + 'T00:00:00') - today) / 86400000);
    if (diff < 0)      overdue  += b.amount || 0;
    else if (diff <= 7) dueWeek += b.amount || 0;
  });
  animateValue('total-monthly', total);
  animateValue('due-week',      dueWeek);
  animateValue('overdue',       overdue);
  animateValue('total-debt',    totalDebt);

  var cont    = document.getElementById('loans-list');
  var arch    = document.getElementById('archived-list');
  var archSec = document.getElementById('archived-section');
  cont.innerHTML = '';
  arch.innerHTML = '';

  var active   = bills.filter(function(b) { return !b.archived; })
                       .sort(function(a, b) { return new Date(a.due_date) - new Date(b.due_date); });
  var archived = bills.filter(function(b) { return  b.archived; });

  archSec.style.display = archived.length > 0 ? 'block' : 'none';
  document.getElementById('archived-label').textContent = 'Paid off loans (' + archived.length + ')';

  var isDark = document.body.classList.contains('dark');

  active  .forEach(function(b, i) { buildLoanBlock(b, false, i,              isDark, cont); });
  archived.forEach(function(b, i) { buildLoanBlock(b, true,  active.length + i, isDark, arch); });
}

// ── Build a single loan card ──────────────────────────────────────────────
function buildLoanBlock(bill, isArch, colorIndex, isDark, container) {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var due   = new Date(bill.due_date + 'T00:00:00');
  var dl    = Math.round((due - today) / 86400000);
  var st    = getStatus(dl);
  var icon  = ICONS[bill.loan_type] || ICONS['Other'];
  var dl2   = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  var rem   = bill.remaining_balance !== undefined ? bill.remaining_balance : bill.amount;
  var start = bill.starting_balance  || bill.remaining_balance || bill.amount;
  var pct   = start > 0 ? Math.min(100, Math.max(0, Math.round((1 - rem / start) * 100))) : 0;
  var isOpen = !!openPanels[bill.id];

  var lc  = LC[colorIndex % LC.length];
  var lcs = isDark ? LD[colorIndex % LD.length] : LS[colorIndex % LS.length];

  var typeBadgeClass = {
    Federal:      'badge-federal',
    Subsidized:   'badge-subsidized',
    Unsubsidized: 'badge-unsubsidized',
    Private:      'badge-private',
    PLUS:         'badge-federal',
    Perkins:      'badge-subsidized'
  }[bill.loan_type] || 'badge-federal';

  // ── Outer block ──
  var block = document.createElement('div');
  block.className = isArch ? 'loan-block archived' : 'loan-block';
  block.style.setProperty('--loan-color',      lc);
  block.style.setProperty('--loan-color-soft', lcs);

  // ── Card row (header) ──
  var cr = document.createElement('div');
  cr.className = 'bill-card';
  cr.onclick = function(e) { if (e.target.closest('button,a')) return; togglePanel(bill.id); };
  cr.innerHTML =
    '<div class="bill-icon">' + icon + '</div>' +
    '<div class="bill-info">' +
      '<div class="bill-name">' + bill.name +
        (bill.loan_type ? '<span class="badge ' + typeBadgeClass + '">' + bill.loan_type + '</span>' : '') +
        (isArch
          ? '<span class="badge badge-ok">Paid off 🎓</span>'
          : '<span class="badge ' + st.cls + '">' + st.label + '</span>') +
      '</div>' +
      '<div class="bill-meta">' + (isArch ? 'Paid off' : 'Due ' + dl2) +
        (bill.payment_url && !isArch
          ? ' &nbsp;·&nbsp; <a href="' + bill.payment_url + '" target="_blank" rel="noopener" ' +
            'class="pay-link qp-trigger" data-lid="' + bill.id + '">Make a payment →</a>'
          : '') +
      '</div>' +
    '</div>' +
    '<div class="loan-balance-block">' +
      '<div class="loan-balance-remaining">$' + fmt(rem) + '</div>' +
      '<div class="loan-balance-label">remaining</div>' +
      '<div class="loan-monthly">$' + fmt(bill.amount) + '/mo</div>' +
    '</div>' +
    '<div class="card-right">' +
      '<button class="expand-btn ' + (isOpen ? 'open' : '') + '" ' +
        'id="expand-btn-' + bill.id + '" ' +
        'onclick="togglePanel(' + bill.id + ')">' + (isOpen ? '▲' : '▼') + '</button>' +
      '<div class="menu-wrap">' +
        '<button class="menu-trigger" onclick="toggleMenu(' + bill.id + ',event)">⋯</button>' +
        '<div class="menu-dropdown" id="menu-' + bill.id + '" style="display:none;">' +
          (isArch
            ? '<button class="menu-item" onclick="unarchiveLoan(' + bill.id + ');closeMenu(' + bill.id + ')">↩️ &nbsp;Restore loan</button>'
            : '') +
          '<button class="menu-item" onclick="openLoanModal(' + bill.id + ');closeMenu(' + bill.id + ')">✏️ &nbsp;Edit loan</button>' +
          '<div class="menu-divider"></div>' +
          '<button class="menu-item danger" onclick="deleteLoan(' + bill.id + ');closeMenu(' + bill.id + ')">🗑️ &nbsp;Delete loan</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── Progress bar ──
  var mi  = bill.interest_rate ? ((bill.interest_rate / 100 / 12) * rem).toFixed(2) : null;
  var pw  = document.createElement('div');
  pw.className = 'progress-wrap';
  pw.innerHTML =
    '<div class="progress-stats">' +
      '<span class="progress-stat-paid">$' + fmt(start - rem) + ' of $' + fmt(start) + ' paid</span>' +
      '<span class="progress-stat-pct">' + pct + '%</span>' +
    '</div>' +
    '<div class="progress-track">' +
      '<div class="progress-fill" style="width:' + pct + '%"></div>' +
      '<div class="progress-ticks">' +
        '<div class="progress-tick" style="left:25%"></div>' +
        '<div class="progress-tick" style="left:50%"></div>' +
        '<div class="progress-tick" style="left:75%"></div>' +
      '</div>' +
    '</div>' +
    '<div class="progress-rate">' +
      (bill.interest_rate ? '<span class="rate-pill highlighted">' + bill.interest_rate + '% APR</span>' : '') +
      (mi ? '<span class="rate-pill">~$' + mi + '/mo interest</span>' : '') +
      '<span class="rate-pill">' + ((bill.loan_history || []).length) + ' payments</span>' +
    '</div>';

  // ── History panel ──
  var panel = document.createElement('div');
  panel.className = 'history-panel' + (isOpen ? ' open' : '');
  panel.id = 'panel-' + bill.id;
  panel.style.setProperty('--loan-color',      lc);
  panel.style.setProperty('--loan-color-soft', lcs);

  var hdr = document.createElement('div');
  hdr.className = 'history-panel-header';
  hdr.innerHTML =
    '<span class="history-panel-title">Payment history</span>' +
    '<button class="add-payment-btn" onclick="openPaymentModal(' + bill.id + ')">+ Add payment</button>';
  panel.appendChild(hdr);

  buildPaymentRows(bill, panel);

  block.appendChild(cr);
  block.appendChild(pw);
  block.appendChild(panel);
  container.appendChild(block);
}

// ── Payment rows inside history panel ────────────────────────────────────
function buildPaymentRows(bill, panel) {
  if (!bill.loan_history || !bill.loan_history.length) {
    var em = document.createElement('div');
    em.className = 'history-empty-row';
    em.textContent = 'No payments yet — click + Add payment to get started.';
    panel.appendChild(em);
    return;
  }

  var sorted = bill.loan_history.map(function(e, i) { return { e: e, i: i }; })
    .sort(function(a, b) {
      var da = a.e.paid_on_raw || a.e.paid_on;
      var db = b.e.paid_on_raw || b.e.paid_on;
      return db > da ? 1 : db < da ? -1 : 0;
    });

  sorted.slice(0, 5).forEach(function(o) {
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
    row.className = 'payment-row';
    row.innerHTML =
      '<div class="payment-dot"></div>' +
      '<div class="payment-info">' +
        '<div class="payment-date">'   + e.paid_on     + '</div>' +
        '<div class="payment-amount">$' + fmt(e.amount_paid) + ' paid</div>' + bd +
      '</div>' +
      '<div class="payment-balance">$' + fmt(e.remaining_balance) + '<span>remaining</span></div>' +
      '<button class="payment-edit-btn"   onclick="openPaymentModal(' + bill.id + ',' + i + ')" title="Edit">✏️</button>' +
      '<button class="payment-delete-btn" onclick="deletePayment('    + bill.id + ',' + i + ')" title="Delete">🗑️</button>';
    panel.appendChild(row);
  });

  if (bill.loan_history.length > 5) {
    var extra = bill.loan_history.length - 5;
    var ft = document.createElement('div');
    ft.className = 'history-view-all';
    ft.innerHTML =
      '<span class="history-view-all-count">' + extra + ' more payment' + (extra !== 1 ? 's' : '') + '</span>' +
      '<button class="history-view-all-btn" onclick="openAllPayments(' + bill.id + ')">View all ' + bill.loan_history.length + ' →</button>';
    panel.appendChild(ft);
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────
function togglePanel(id) {
  openPanels[id] = !openPanels[id];
  var p = document.getElementById('panel-' + id);
  var b = document.getElementById('expand-btn-' + id);
  if (p) p.classList.toggle('open', openPanels[id]);
  if (b) { b.classList.toggle('open', openPanels[id]); b.textContent = openPanels[id] ? '▲' : '▼'; }
}

function toggleMenu(id, e) {
  e.stopPropagation();
  var m    = document.getElementById('menu-' + id);
  var open = m.style.display !== 'none';
  closeAllMenus();
  if (!open) {
    m.style.display = 'block';
    m.previousElementSibling.classList.add('active');
  }
}
function closeMenu(id) {
  var m = document.getElementById('menu-' + id);
  if (m) {
    m.style.display = 'none';
    if (m.previousElementSibling) m.previousElementSibling.classList.remove('active');
  }
}
function closeAllMenus() {
  document.querySelectorAll('.menu-dropdown').forEach(function(m) { m.style.display = 'none'; });
  document.querySelectorAll('.menu-trigger').forEach(function(t) { t.classList.remove('active'); });
}

function toggleArchived() {
  var l    = document.getElementById('archived-list');
  var ic   = document.getElementById('archived-icon');
  var open = l.style.display === 'flex' || l.style.display === 'block';
  l.style.display    = open ? 'none' : 'flex';
  l.style.flexDirection = 'column';
  ic.classList.toggle('open', !open);
}

function toggleDark() {
  var d = document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', d ? '1' : '0');
  document.getElementById('dark-toggle-btn').textContent = d ? '☀️' : '🌙';
}

function switchTab(t) {
  ['loans', 'analytics'].forEach(function(x) {
    document.getElementById('tab-btn-' + x).classList.toggle('active', x === t);
    document.getElementById('tab-' + x).classList.toggle('active', x === t);
  });
  if (t === 'analytics') loadChartJs(renderAnalytics);
}

// ── Celebrate / confetti ──────────────────────────────────────────────────
function celebrate(name, lid) {
  var b = bills.find(function(x) { return x.id === lid; });
  if (b) { b.archived = true; saveBills(); render(); }

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:999;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);';
  ov.innerHTML =
    '<div style="background:var(--surface);border-radius:24px;padding:2.5rem 2rem;text-align:center;' +
    'max-width:340px;margin:1rem;box-shadow:0 24px 64px rgba(0,0,0,.25);border:1px solid var(--border)">' +
    '<div style="font-size:56px;margin-bottom:1rem">🎉</div>' +
    '<div style="font-size:22px;font-weight:800;margin-bottom:.5rem">Loan paid off!</div>' +
    '<div style="font-size:15px;color:var(--text3);margin-bottom:1.5rem">' + name + ' is fully paid off.<br>That\'s a huge accomplishment! 🎓</div>' +
    '<button style="padding:.7rem 2rem;background:var(--text);color:var(--bg);border:none;border-radius:11px;font-size:14px;font-weight:700;cursor:pointer">Amazing, thanks! 🙌</button>' +
    '</div>';
  ov.querySelector('button').onclick = function() { ov.remove(); };
  ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);

  // Confetti
  var cv  = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;z-index:1000;pointer-events:none';
  cv.width  = innerWidth;
  cv.height = innerHeight;
  document.body.appendChild(cv);
  var cx = cv.getContext('2d');
  var CC = ['#2d6a4f','#52b788','#1a56a0','#7c3aed','#f4a261','#ffd166','#06d6a0'];
  var pp = Array.from({ length: 120 }, function() {
    return {
      x:       Math.random() * cv.width,
      y:       Math.random() * cv.height - cv.height,
      w:       Math.random() * 10 + 5,
      h:       Math.random() * 5  + 3,
      color:   CC[Math.floor(Math.random() * 7)],
      rot:     Math.random() * Math.PI * 2,
      vx:      (Math.random() - .5) * 3,
      vy:      Math.random() * 4 + 2,
      vr:      (Math.random() - .5) * .15,
      opacity: 1
    };
  });
  var fr = 0;
  (function draw() {
    cx.clearRect(0, 0, cv.width, cv.height);
    pp.forEach(function(p) {
      p.x  += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += .08;
      if (fr > 90) p.opacity = Math.max(0, p.opacity - .015);
      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.rot);
      cx.globalAlpha = p.opacity;
      cx.fillStyle   = p.color;
      cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cx.restore();
    });
    fr++;
    if (fr < 160) requestAnimationFrame(draw); else cv.remove();
  })();
}