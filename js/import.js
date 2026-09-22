// ── js/import.js ──────────────────────────────────────────────────────────
// Import loan + payment data from a file.
// Accepts:
//   • CSV produced by exportCSV() (loan summary + "--- Payment History ---")
//   • JSON: an array of bill objects (same shape as localStorage 'slm-bills')
// Loans are merged by name (case-insensitive). Payments already present
// (same date + amount) are skipped, so re-importing the same file is safe.

/** Open the hidden file picker. */
function openImport() {
  var input = document.getElementById('import-file');
  input.value = '';            // allow re-selecting the same file
  input.click();
}

/** Handle the chosen file. */
function handleImportFile(evt) {
  var file = evt.target.files && evt.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function() {
    try {
      var text = String(reader.result).replace(/^﻿/, '');   // strip BOM
      var isJSON = /\.json$/i.test(file.name) || /^\s*[\[{]/.test(text);
      var incoming = isJSON ? parseImportJSON(text) : parseImportCSV(text);
      if (!incoming.length) {
        alert('No loans found in "' + file.name + '".');
        return;
      }
      var res = mergeImportedBills(incoming);
      saveBills();
      render();
      alert('Import complete:\n' +
        res.added + ' loan(s) added, ' + res.updated + ' updated\n' +
        res.payments + ' payment(s) added' +
        (res.skipped ? ', ' + res.skipped + ' duplicate(s) skipped' : ''));
    } catch (err) {
      alert('Could not import "' + file.name + '":\n' + err.message);
    }
  };
  reader.readAsText(file);
}

// ── Parsers ───────────────────────────────────────────────────────────────

/** Split CSV text into rows of fields (handles quotes, "" escapes, CRLF). */
function csvToRows(text) {
  var rows = [], row = [], field = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Parse a number, tolerating "$1,234.56" and blanks. Returns null if blank/invalid. */
function importNum(v) {
  if (v == null) return null;
  var s = String(v).replace(/[$,\s%]/g, '');
  if (s === '') return null;
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Convert "April 15, 2026", "4/15/2026" or "2026-04-15" to "YYYY-MM-DD". */
function importDate(v) {
  var s = String(v || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  if (isNaN(d)) return null;
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** Build a payment entry in the same shape savePayment() uses. */
function makeImportedPayment(rawDate, total, principal, interest) {
  var prin = principal != null ? principal
           : (interest != null ? Math.max(0, total - interest) : total);
  return {
    paid_on: new Date(rawDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    }),
    paid_on_raw:       rawDate,
    amount_paid:       total,
    principal_paid:    prin,
    interest_paid:     interest != null ? interest : Math.max(0, total - prin),
    remaining_balance: 0
  };
}

/** Parse the CSV format written by exportCSV(). */
function parseImportCSV(text) {
  var rows = csvToRows(text).map(function(r) {
    return r.map(function(v) { return v.trim(); });
  });
  var loans = [], byName = {}, section = null, head = null;

  function col(name) { return head ? head.indexOf(name) : -1; }
  function get(r, name) { var i = col(name); return i >= 0 ? r[i] : ''; }

  rows.forEach(function(r) {
    if (!r.length || r.every(function(v) { return v === ''; })) return;
    var first = r[0];
    if (/payment history/i.test(first)) { section = null; head = null; return; }
    if (first === 'Loan Name') {
      head = r;
      section = r.indexOf('Date Paid') >= 0 ? 'payments' : 'loans';
      return;
    }
    if (!section) return;

    if (section === 'loans') {
      var start = importNum(get(r, 'Starting Balance'));
      var rem   = importNum(get(r, 'Remaining Balance'));
      var loan = {
        name:              first,
        loan_type:         get(r, 'Type') || 'Other',
        interest_rate:     importNum(get(r, 'Interest Rate (%)')),
        amount:            importNum(get(r, 'Monthly Payment')) || 0,
        starting_balance:  start != null ? start : (rem || 0),
        remaining_balance: rem != null ? rem : (start || 0),
        loan_history:      []
      };
      var due = importDate(get(r, 'Due Date'));
      if (due) loan.due_date = due;
      loans.push(loan);
      byName[first.toLowerCase()] = loan;
    } else {
      var raw   = importDate(get(r, 'Date Paid'));
      var total = importNum(get(r, 'Amount Paid'));
      if (!raw || total == null) return;
      var target = byName[first.toLowerCase()];
      if (!target) {                    // payment for a loan not in the summary
        target = { name: first, loan_type: 'Other', interest_rate: null, amount: 0,
                   starting_balance: 0, remaining_balance: 0, loan_history: [] };
        loans.push(target);
        byName[first.toLowerCase()] = target;
      }
      target.loan_history.push(makeImportedPayment(
        raw, total, importNum(get(r, 'Principal Paid')), importNum(get(r, 'Interest Paid'))));
    }
  });
  if (!loans.length) throw new Error('No "Loan Name" header row found. Use a file from ⬇ Export.');
  return loans;
}

/** Parse a JSON backup (array of bills, or { bills: [...] }). */
function parseImportJSON(text) {
  var data = JSON.parse(text);
  if (data && !Array.isArray(data) && Array.isArray(data.bills)) data = data.bills;
  if (!Array.isArray(data)) throw new Error('Expected a list of loans.');
  return data.filter(function(b) { return b && b.name; }).map(function(b) {
    var hist = (b.loan_history || []).map(function(e) {
      var raw = importDate(e.paid_on_raw || e.paid_on);
      var tot = importNum(e.amount_paid);
      return raw && tot != null
        ? makeImportedPayment(raw, tot, importNum(e.principal_paid), importNum(e.interest_paid))
        : null;
    }).filter(Boolean);
    return {
      name:              String(b.name),
      loan_type:         b.loan_type || 'Other',
      interest_rate:     importNum(b.interest_rate),
      amount:            importNum(b.amount) || 0,
      due_date:          importDate(b.due_date) || undefined,
      starting_balance:  importNum(b.starting_balance) || 0,
      remaining_balance: importNum(b.remaining_balance) || 0,
      loan_history:      hist
    };
  });
}

// ── Merge ─────────────────────────────────────────────────────────────────

/** Merge parsed loans into `bills`. Returns counts for the summary alert. */
function mergeImportedBills(incoming) {
  var res = { added: 0, updated: 0, payments: 0, skipped: 0 };
  var nextId = Date.now();

  incoming.forEach(function(inc) {
    var existing = bills.find(function(b) {
      return (b.name || '').toLowerCase() === inc.name.toLowerCase();
    });

    if (!existing) {
      existing = {
        id:                nextId++,
        name:              inc.name,
        loan_type:         inc.loan_type,
        interest_rate:     inc.interest_rate,
        amount:            inc.amount,
        due_date:          inc.due_date || new Date().toISOString().slice(0, 10),
        starting_balance:  inc.starting_balance,
        remaining_balance: inc.remaining_balance,
        loan_history:      []
      };
      bills.push(existing);
      res.added++;
    } else {
      // Only overwrite fields the file actually supplied
      if (inc.loan_type)             existing.loan_type        = inc.loan_type;
      if (inc.interest_rate != null) existing.interest_rate    = inc.interest_rate;
      if (inc.amount)                existing.amount           = inc.amount;
      if (inc.due_date)              existing.due_date         = inc.due_date;
      if (inc.starting_balance)      existing.starting_balance = inc.starting_balance;
      res.updated++;
    }
    if (!existing.loan_history) existing.loan_history = [];

    inc.loan_history.forEach(function(p) {
      var dup = existing.loan_history.some(function(e) {
        return importDate(e.paid_on_raw || e.paid_on) === p.paid_on_raw &&
               Math.abs((e.amount_paid || 0) - p.amount_paid) < 0.005;
      });
      if (dup) { res.skipped++; return; }
      existing.loan_history.push(p);
      res.payments++;
    });

    if (existing.loan_history.length) recomputeBalances(existing);
    else if (inc.remaining_balance != null) existing.remaining_balance = inc.remaining_balance;
  });
  return res;
}
