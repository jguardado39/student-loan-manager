// ── js/main.js ────────────────────────────────────────────────────────────
// Entry point. Wires up global event listeners and bootstraps the app.
// Must be loaded LAST (after data, render, modals, analytics, sync).

// ── Lazy-load Chart.js only when the Analytics tab first opens ────────────
var _chartLoaded = false, _chartLoading = false, _chartCbs = [];
function loadChartJs(cb) {
  if (_chartLoaded) { if (cb) cb(); return; }
  if (cb) _chartCbs.push(cb);
  if (_chartLoading) return;
  _chartLoading = true;
  var s   = document.createElement('script');
  s.src   = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  s.onload = function() {
    _chartLoaded = true;
    _chartCbs.forEach(function(f) { f(); });
    _chartCbs = [];
  };
  document.head.appendChild(s);
}

// ── Dark mode: restore from localStorage on load ──────────────────────────
if (localStorage.getItem('darkMode') === '1') {
  document.body.classList.add('dark');
  document.getElementById('dark-toggle-btn').textContent = '☀️';
}

// ── Global click handlers ─────────────────────────────────────────────────

// Close any open dropdown menu when clicking elsewhere on the page
document.addEventListener('click', closeAllMenus);

// "Make a payment →" link triggers the Quick Pay modal
// Uses event delegation so it works for dynamically rendered links
document.addEventListener('click', function(e) {
  var trigger = e.target.closest('.qp-trigger');
  if (trigger) {
    e.stopPropagation();
    openQuickPay(parseInt(trigger.dataset.lid));
  }
});

// ── Modal overlay close-on-backdrop-click ────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('quick-pay-modal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('quick-pay-modal')) closeQuickPay();
  });
  document.getElementById('all-payments-modal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('all-payments-modal')) closeAllPayments();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────
render();        // Draw the UI from localStorage data immediately
autoConnect();   // Then silently verify / load from GitHub Gist (if token exists)
