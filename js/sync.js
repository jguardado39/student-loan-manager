// ── js/sync.js ────────────────────────────────────────────────────────────
// GitHub Gist sync (save / load / connect / disconnect)
// Self-contained QR code generator (no external library needed)
// Depends on: data.js (bills, saveBills via gistSave callback)

var GIST_FILE = 'student_loans.json';

// ── Sync status indicator ─────────────────────────────────────────────────
function setSyncStatus(state, label) {
  var btn = document.getElementById('sync-btn');
  var lbl = document.getElementById('sync-label');
  if (!btn) return;
  btn.className = 'sync-btn ' + state;
  lbl.textContent = label || (
    state === 'connected' ? 'Synced'    :
    state === 'syncing'   ? 'Saving…'   :
    state === 'error'     ? 'Sync error' : 'Sync'
  );
}

// ── Save to Gist ──────────────────────────────────────────────────────────
async function gistSave(data) {
  var token = localStorage.getItem('gh-token');
  if (!token) return;
  var gistId = localStorage.getItem('gh-gist-id');
  setSyncStatus('syncing', 'Saving…');
  try {
    var body = JSON.stringify({
      description: 'Student Loan Manager Data',
      public: false,
      files: { [GIST_FILE]: { content: JSON.stringify(data, null, 2) } }
    });
    var url    = gistId ? 'https://api.github.com/gists/' + gistId : 'https://api.github.com/gists';
    var method = gistId ? 'PATCH' : 'POST';
    var res    = await fetch(url, {
      method: method,
      headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: body
    });
    var result = await res.json();
    if (result.id) {
      localStorage.setItem('gh-gist-id', result.id);
      setSyncStatus('connected', 'Synced');
    } else {
      console.error('Gist save error:', result);
      setSyncStatus('error', 'Save failed');
    }
  } catch (e) {
    console.error('Gist save error:', e);
    setSyncStatus('error', 'Save failed');
  }
}

// ── Load from Gist ────────────────────────────────────────────────────────
async function gistLoad() {
  var token = localStorage.getItem('gh-token');
  if (!token) return false;
  setSyncStatus('syncing', 'Loading…');
  try {
    var gistId = localStorage.getItem('gh-gist-id');
    if (!gistId) {
      // Search user's gists for the matching file
      var res  = await fetch('https://api.github.com/gists?per_page=100', {
        headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' }
      });
      var list = await res.json();
      if (!Array.isArray(list)) { setSyncStatus('error', 'Token error'); return false; }
      var found = list.find(function(g) { return g.files && g.files[GIST_FILE]; });
      if (found) {
        localStorage.setItem('gh-gist-id', found.id);
        gistId = found.id;
      } else {
        setSyncStatus('connected', 'Synced');
        return true; // no gist yet — that's fine on first connect
      }
    }

    var res2 = await fetch('https://api.github.com/gists/' + gistId, {
      headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' }
    });
    var data = await res2.json();
    if (data.files && data.files[GIST_FILE]) {
      var parsed = JSON.parse(data.files[GIST_FILE].content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        bills = parsed;
        localStorage.setItem('slm-bills', JSON.stringify(bills));
        render();
      }
    }
    setSyncStatus('connected', 'Synced');
    return true;
  } catch (e) {
    console.error('Gist load error:', e);
    setSyncStatus('error', 'Load failed');
    return false;
  }
}

// ── Connect a new token ───────────────────────────────────────────────────
async function connectGist() {
  var input = document.getElementById('gh-token-input');
  var token = input ? input.value.trim() : '';
  if (!token) { alert('Please enter your GitHub token.'); return; }
  setSyncStatus('syncing', 'Connecting…');
  try {
    var res  = await fetch('https://api.github.com/user', {
      headers: { Authorization: 'token ' + token }
    });
    var user = await res.json();
    if (!user.login) {
      alert('Invalid token — please check and try again.');
      setSyncStatus('error', 'Invalid token');
      return;
    }
    localStorage.setItem('gh-token', token);
    localStorage.removeItem('gh-gist-id');
    showGistConnectedView(user.login);
    await gistLoad();
  } catch (e) {
    alert('Could not connect to GitHub. Please check your token.');
    setSyncStatus('error', 'Failed');
  }
}

async function forceSyncFromGist() {
  closeGistModal();
  await gistLoad();
}

function disconnectGist() {
  if (!confirm('Disconnect GitHub sync? Your data stays in localStorage but will not sync to other devices.')) return;
  localStorage.removeItem('gh-token');
  localStorage.removeItem('gh-gist-id');
  showGistSetupView();
  setSyncStatus('', 'Sync');
  closeGistModal();
}

// ── Auto-connect on page load ─────────────────────────────────────────────
async function autoConnect() {
  // Support token embedded in URL (from QR code scan)
  var urlParams = new URLSearchParams(window.location.search);
  var urlToken  = urlParams.get('token');
  if (urlToken) {
    localStorage.setItem('gh-token', urlToken);
    localStorage.removeItem('gh-gist-id');
    window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
  }

  var token = localStorage.getItem('gh-token');
  if (!token) return;

  try {
    var res  = await fetch('https://api.github.com/user', {
      headers: { Authorization: 'token ' + token }
    });
    var user = await res.json();
    if (user.login) {
      setSyncStatus('connected', 'Synced');
      document.getElementById('gist-connected-user').textContent = '@' + user.login;
      await gistLoad();
    } else {
      localStorage.removeItem('gh-token');
      localStorage.removeItem('gh-gist-id');
      setSyncStatus('', 'Sync');
    }
  } catch (e) {
    setSyncStatus('error', 'Offline?');
  }
}

// ── Gist modal views ──────────────────────────────────────────────────────
function openGistModal() {
  var token = localStorage.getItem('gh-token');
  if (token) showGistConnectedView(null); else showGistSetupView();
  document.getElementById('gist-modal').classList.remove('hidden');
}
function closeGistModal() {
  document.getElementById('gist-modal').classList.add('hidden');
}
function showGistSetupView() {
  document.getElementById('gist-setup-view').style.display     = 'block';
  document.getElementById('gist-connected-view').style.display = 'none';
  document.getElementById('gist-modal-title').textContent = 'Connect GitHub Sync';
}
function showGistConnectedView(username) {
  document.getElementById('gist-setup-view').style.display     = 'none';
  document.getElementById('gist-connected-view').style.display = 'block';
  document.getElementById('gist-modal-title').textContent = 'GitHub Sync';
  if (username) document.getElementById('gist-connected-user').textContent = '@' + username;
  setTimeout(generateQR, 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// Self-contained QR Code Generator
// Encodes a URL into a QR matrix and renders it onto a <canvas> element.
// ═══════════════════════════════════════════════════════════════════════════

var _EXP = new Array(512), _LOG = new Array(256);
(function() {
  var x = 1;
  for (var i = 0; i < 256; i++) {
    _EXP[i] = x; _EXP[i + 255] = x;
    if (i > 0) _LOG[x] = i;
    x = x < 128 ? x * 2 : (x * 2) ^ 285;
  }
  _LOG[1] = 0;
})();

function _gmul(a, b) { return (!a || !b) ? 0 : _EXP[_LOG[a] + _LOG[b]]; }
function _polyMul(p, q) {
  var r = new Array(p.length + q.length - 1).fill(0);
  for (var i = 0; i < p.length; i++)
    for (var j = 0; j < q.length; j++) r[i + j] ^= _gmul(p[i], q[j]);
  return r;
}
function _ecGen(n) {
  var g = [1];
  for (var i = 0; i < n; i++) g = _polyMul(g, [1, _EXP[i]]);
  return g;
}
function _rsEncode(data, nEC) {
  var gen = _ecGen(nEC);
  var msg = data.slice().concat(new Array(nEC).fill(0));
  for (var i = 0; i < data.length; i++) {
    var c = msg[i];
    if (c) for (var j = 0; j < gen.length; j++) msg[i + j] ^= _gmul(gen[j], c);
  }
  return msg.slice(data.length);
}

var _QRCAP = [null,
  {ec:10,data:16},{ec:16,data:28},{ec:26,data:44},{ec:36,data:64},
  {ec:46,data:86},{ec:60,data:108},{ec:66,data:124},{ec:82,data:154},
  {ec:96,data:182},{ec:114,data:216}
];
function _qrVersion(len) {
  for (var v = 1; v <= 10; v++) if (_QRCAP[v].data >= len + 3) return v;
  return -1;
}
function _qrBits(data, version) {
  var cap = _QRCAP[version], bits = [];
  function push(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); }
  push(4, 4); push(data.length, 8);
  for (var i = 0; i < data.length; i++) push(data[i], 8);
  for (var i = 0; i < 4 && bits.length < cap.data * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  var pads = [0xEC, 0x11], pi = 0;
  while (bits.length < cap.data * 8) push(pads[pi++ & 1], 8);
  return bits;
}
function _qrB2B(bits) {
  var out = [];
  for (var i = 0; i < bits.length; i += 8) {
    var b = 0;
    for (var j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0);
    out.push(b);
  }
  return out;
}
function _qrMat(size) {
  var m = [], u = [];
  for (var i = 0; i < size; i++) { m.push(new Array(size).fill(0)); u.push(new Array(size).fill(false)); }
  return { m: m, u: u, size: size };
}
function _qrSet(mx, r, c, v) { mx.m[r][c] = v; mx.u[r][c] = true; }
function _qrFinder(mx, r, c) {
  for (var i = -1; i <= 7; i++) for (var j = -1; j <= 7; j++) {
    var rr = r + i, cc = c + j;
    if (rr < 0 || rr >= mx.size || cc < 0 || cc >= mx.size) continue;
    var dark = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
               (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
               (i >= 2 && i <= 4 && j >= 2 && j <= 4);
    _qrSet(mx, rr, cc, dark ? 1 : 0);
  }
}
function _qrTiming(mx) {
  for (var i = 8; i < mx.size - 8; i++) {
    _qrSet(mx, 6, i, i % 2 === 0 ? 1 : 0);
    _qrSet(mx, i, 6, i % 2 === 0 ? 1 : 0);
  }
}
var _QRALIGN = [null,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
function _qrAlign(mx, v) {
  var pos = _QRALIGN[v];
  if (!pos || pos.length < 2) return;
  for (var i = 0; i < pos.length; i++) for (var j = 0; j < pos.length; j++) {
    var r = pos[i], c = pos[j];
    if (mx.u[r][c]) continue;
    for (var di = -2; di <= 2; di++) for (var dj = -2; dj <= 2; dj++) {
      var dark = Math.max(Math.abs(di), Math.abs(dj)) !== 1;
      _qrSet(mx, r + di, c + dj, dark ? 1 : 0);
    }
  }
}
function _qrFmt(mx) {
  var data = (1 << 3) | 2, g = 0x537;
  var ecc = data << 10;
  for (var i = 4; i >= 0; i--) { if ((ecc >> (i + 10)) & 1) ecc ^= (g << i); }
  var fmt = ((data << 10) | (ecc & 0x3FF)) ^ 0x5412;
  var fb = []; for (var i = 14; i >= 0; i--) fb.push((fmt >> i) & 1);
  var s = mx.size;
  var p1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  var p2 = [[s-1,8],[s-2,8],[s-3,8],[s-4,8],[s-5,8],[s-6,8],[s-7,8],[8,s-8],[8,s-7],[8,s-6],[8,s-5],[8,s-4],[8,s-3],[8,s-2],[8,s-1]];
  for (var i = 0; i < 15; i++) { _qrSet(mx, p1[i][0], p1[i][1], fb[i]); _qrSet(mx, p2[i][0], p2[i][1], fb[i]); }
  _qrSet(mx, s - 8, 8, 1);
}
function _qrData(mx, allBits) {
  var bi = 0, dir = -1, col = mx.size - 1;
  while (col > 0) {
    if (col === 6) col--;
    for (var count = 0; count < mx.size; count++) {
      var row = dir === -1 ? mx.size - 1 - count : count;
      for (var dc = 0; dc < 2; dc++) {
        var cc = col - dc;
        if (mx.u[row][cc]) continue;
        var bit = bi < allBits.length ? allBits[bi++] : 0;
        if ((row + cc) % 3 === 0) bit ^= 1;
        mx.m[row][cc] = bit; mx.u[row][cc] = true;
      }
    }
    dir = -dir; col -= 2;
  }
}
function _qrEncode(text) {
  var bytes = [];
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c > 255) return null;
    bytes.push(c);
  }
  var v = _qrVersion(bytes.length);
  if (v < 0) return null;
  var cap = _QRCAP[v];
  var bits = _qrBits(bytes, v);
  var data = _qrB2B(bits);
  var ec   = _rsEncode(data, cap.ec);
  var all  = data.concat(ec);
  var allBits = [];
  for (var i = 0; i < all.length; i++) for (var j = 7; j >= 0; j--) allBits.push((all[i] >> j) & 1);
  var size = v * 4 + 17;
  var mx   = _qrMat(size);
  _qrFinder(mx, 0, 0); _qrFinder(mx, 0, size - 7); _qrFinder(mx, size - 7, 0);
  _qrTiming(mx); _qrAlign(mx, v); _qrFmt(mx); _qrData(mx, allBits);
  return mx;
}

function generateQR() {
  var token = localStorage.getItem('gh-token');
  if (!token) return;
  var url  = window.location.origin + window.location.pathname + '?token=' + token;
  var wrap = document.getElementById('qr-canvas-wrap');
  if (!wrap) return;

  var result = _qrEncode(url);
  if (!result) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:1rem;text-align:center">URL too long to encode.</div>';
    return;
  }

  var cellSize = Math.max(3, Math.floor(200 / result.size));
  var px       = cellSize * result.size;
  var canvas   = document.createElement('canvas');
  canvas.width = canvas.height = px;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#111110';
  for (var r = 0; r < result.size; r++)
    for (var c = 0; c < result.size; c++)
      if (result.m[r][c]) ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
  wrap.innerHTML = '';
  wrap.appendChild(canvas);
}
