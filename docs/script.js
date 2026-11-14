const W = 640, H = 400;
const sky = document.getElementById('sky');
const ctx = sky.getContext('2d');
const lens = document.getElementById('lens');
const lctx = lens.getContext('2d');

// hidden canvases that hold the Before and After pictures
const A = document.createElement('canvas');
const B = document.createElement('canvas');
A.width = B.width = W;
A.height = B.height = H;

let found = [];        // detected objects
let selected = null;   // the object you clicked
let mode = 'slide';    // slide, blink or diff
let filter = 'all';    // all, mover or change
let blinkOn = false;
let timer = null;

// ---------- drawing what you see ----------
function label(text, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 6, y - 16, 110, 24);
  ctx.fillStyle = 'white';
  ctx.font = '14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function render() {
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, W, H);

  if (mode === 'diff') {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(B, 0, 0);
    ctx.globalAlpha = 1;
  } else if (mode === 'slide') {
    const s = Number(document.getElementById('split').value);
    if (s > 0) ctx.drawImage(A, 0, 0, s, H, 0, 0, s, H);
    if (s < W) ctx.drawImage(B, s, 0, W - s, H, s, 0, W - s, H);
    ctx.fillStyle = 'white';
    ctx.fillRect(s - 1, 0, 2, H);
    label('BEFORE', 10, 25);
    label('AFTER', W - 100, 25);
  } else {
    ctx.drawImage(blinkOn ? B : A, 0, 0);
    label(blinkOn ? 'AFTER' : 'BEFORE', 10, 25);
  }
  drawMarkers();
}

function setMode(m) {
  mode = m;
  clearInterval(timer);
  document.getElementById('mSlide').classList.remove('on');
  document.getElementById('mBlink').classList.remove('on');
  document.getElementById('mDiff').classList.remove('on');
  if (m === 'slide') document.getElementById('mSlide').classList.add('on');
  if (m === 'blink') {
    document.getElementById('mBlink').classList.add('on');
    timer = setInterval(() => { blinkOn = !blinkOn; render(); }, 700);
  }
  if (m === 'diff') document.getElementById('mDiff').classList.add('on');
  render();
}

document.getElementById('mSlide').onclick = () => setMode('slide');
document.getElementById('mBlink').onclick = () => setMode('blink');
document.getElementById('mDiff').onclick = () => setMode('diff');
document.getElementById('split').oninput = render;

// ---------- upload your own images ----------
function loadImage(file, target) {
  const img = new Image();
  img.onload = () => {
    target.getContext('2d').drawImage(img, 0, 0, W, H);
    render();
  };
  img.src = URL.createObjectURL(file);
}
document.getElementById('fileA').onchange = e => loadImage(e.target.files[0], A);
document.getElementById('fileB').onchange = e => loadImage(e.target.files[0], B);

// ---------- demo sky (fake stars) ----------
function seededRandom(seed) {
  return function () {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function drawStars(canvas, dotX, dotY, starBright) {
  const c = canvas.getContext('2d');
  const rand = seededRandom(42);
  c.fillStyle = 'black';
  c.fillRect(0, 0, W, H);
  c.fillStyle = 'white';
  for (let i = 0; i < 120; i++) {
    c.beginPath();
    c.arc(rand() * W, rand() * H, 1 + rand() * 2, 0, 7);
    c.fill();
  }
  // a star that only changes brightness (does not move)
  c.fillStyle = 'rgb(' + starBright + ',' + starBright + ',' + starBright + ')';
  c.beginPath();
  c.arc(500, 100, 7, 0, 7);
  c.fill();
  // the moving object
  c.fillStyle = 'white';
  c.beginPath();
  c.arc(dotX, dotY, 6, 0, 7);
  c.fill();
}

function clearResults() {
  found = [];
  selected = null;
  document.getElementById('list').textContent = 'Nothing found yet.';
  document.getElementById('stats').textContent = '';
  document.getElementById('info').textContent = 'Click a marker or an item in the list to see details.';
}

document.getElementById('demoBtn').onclick = () => {
  drawStars(A, 200, 250, 60);    // Before: object here, star dim
  drawStars(B, 280, 200, 255);   // After: object moved, star bright
  clearResults();
  document.getElementById('result').textContent = 'Demo loaded. Now press Compare.';
  setMode('slide');
};

document.getElementById('resetBtn').onclick = () => {
  clearResults();
  document.getElementById('result').textContent = 'Results cleared. Press Compare again.';
  render();
};

// ---------- find groups of changed pixels ----------
function findBlobs(mask, minSize) {
  const seen = new Uint8Array(W * H);
  const blobs = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let n = 0, sx = 0, sy = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = Math.floor(p / W);
      n++; sx += x; sy += y;
      const neighbours = [p - 1, p + 1, p - W, p + W];
      for (const q of neighbours) {
        if (q < 0 || q >= mask.length) continue;
        if (seen[q] || !mask[q]) continue;
        if (Math.abs((q % W) - x) > 1) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (n >= minSize) blobs.push({ x: sx / n, y: sy / n, size: n });
  }
  return blobs;
}

// ---------- number of days between the two dates ----------
function daysBetween() {
  const a = new Date(document.getElementById('dateA').value);
  const b = new Date(document.getElementById('dateB').value);
  const d = Math.round((b - a) / 86400000);
  return d > 0 ? d : 1;
}

// ---------- confidence: how sure are we that it really moved? ----------
function confidence(f) {
  if (f.type !== 'mover') return '';
  return (f.dist >= 40 && f.size >= 20) ? 'High' : 'Low';
}

// ---------- where would it be later? (straight-line guess) ----------
function predicted(f) {
  const days = daysBetween();
  const ahead = Number(document.getElementById('predictDays').value) || 0;
  return {
    x: f.x + ((f.x - f.fromX) / days) * ahead,
    y: f.y + ((f.y - f.fromY) / days) * ahead,
    ahead: ahead
  };
}

// ---------- compare the two images ----------
function compare() {
  const a = A.getContext('2d').getImageData(0, 0, W, H).data;
  const b = B.getContext('2d').getImageData(0, 0, W, H).data;
  const limit = Number(document.getElementById('thr').value);
  const minSize = Number(document.getElementById('minSize').value);
  document.getElementById('minVal').textContent = minSize;

  const brighter = new Uint8Array(W * H);   // got brighter in After
  const dimmer = new Uint8Array(W * H);     // got dimmer in After
  let changedPixels = 0;

  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const brightA = (a[i] + a[i + 1] + a[i + 2]) / 3;
    const brightB = (b[i] + b[i + 1] + b[i + 2]) / 3;
    const diff = brightB - brightA;
    if (diff > limit) { brighter[p] = 1; changedPixels++; }
    else if (diff < -limit) { dimmer[p] = 1; changedPixels++; }
  }

  const newSpots = findBlobs(brighter, minSize);
  const oldSpots = findBlobs(dimmer, minSize);
  const used = [];
  found = [];
  selected = null;

  // a new spot + an old spot close by = something moved
  newSpots.forEach(n => {
    let best = -1, bestDist = 150;
    oldSpots.forEach((o, j) => {
      const d = Math.hypot(n.x - o.x, n.y - o.y);
      if (!used.includes(j) && d < bestDist) { bestDist = d; best = j; }
    });
    if (best >= 0) {
      used.push(best);
      found.push({ type: 'mover', x: n.x, y: n.y, size: n.size,
                   fromX: oldSpots[best].x, fromY: oldSpots[best].y, dist: bestDist });
    } else {
      found.push({ type: 'change', x: n.x, y: n.y, size: n.size, what: 'brighter' });
    }
  });
  oldSpots.forEach((o, j) => {
    if (!used.includes(j)) found.push({ type: 'change', x: o.x, y: o.y, size: o.size, what: 'dimmer' });
  });

  const movers = found.filter(f => f.type === 'mover');
  document.getElementById('result').textContent =
    movers.length + ' possible moving object(s), ' + (found.length - movers.length) + ' brightness change(s).';

  let biggest = 0;
  movers.forEach(m => { if (m.dist > biggest) biggest = m.dist; });
  document.getElementById('stats').textContent =
    'Changed pixels: ' + changedPixels + '. Biggest movement: ' + Math.round(biggest) + ' px.';

  buildList();
  setMode('diff');
}

// ---------- text about one object ----------
function describe(f) {
  if (f.type === 'mover') {
    const days = daysBetween();
    const speed = (f.dist / days).toFixed(1);
    const p = predicted(f);
    return 'POSSIBLE MOVING OBJECT (' + confidence(f) + ' confidence): it moved about ' +
      Math.round(f.dist) + ' pixels in ' + days + ' days, which is ' + speed +
      ' pixels per day. If it keeps going in a straight line, in ' + p.ahead +
      ' days it would be near x=' + Math.round(p.x) + ', y=' + Math.round(p.y) +
      '. Could be an asteroid or comet. Needs checking.';
  }
  return 'BRIGHTNESS CHANGE: this spot got ' + f.what +
    ' but did not move. Likely a variable star or an image artifact.';
}

function select(f) {
  selected = f;
  document.getElementById('info').textContent = describe(f);
  render();
}

// ---------- which objects pass the filter ----------
function visible(f) {
  return filter === 'all' || f.type === filter;
}

function setFilter(name) {
  filter = name;
  document.getElementById('fAll').classList.remove('on');
  document.getElementById('fMov').classList.remove('on');
  document.getElementById('fChg').classList.remove('on');
  if (name === 'all') document.getElementById('fAll').classList.add('on');
  if (name === 'mover') document.getElementById('fMov').classList.add('on');
  if (name === 'change') document.getElementById('fChg').classList.add('on');
  buildList();
  render();
}
document.getElementById('fAll').onclick = () => setFilter('all');
document.getElementById('fMov').onclick = () => setFilter('mover');
document.getElementById('fChg').onclick = () => setFilter('change');

// ---------- search by number ----------
document.getElementById('searchBtn').onclick = () => {
  const n = Number(document.getElementById('searchBox').value);
  if (n >= 1 && n <= found.length) {
    setFilter('all');
    select(found[n - 1]);
  } else {
    document.getElementById('info').textContent = 'No object with that number.';
  }
};

// ---------- the list of detections ----------
function buildList() {
  const list = document.getElementById('list');
  list.innerHTML = '';
  if (found.length === 0) {
    list.textContent = 'No differences found. Try a lower sensitivity.';
    return;
  }
  let shown = 0;
  found.forEach((f, i) => {
    if (!visible(f)) return;
    shown++;
    const div = document.createElement('div');
    div.className = 'item';
    if (f.type === 'mover') {
      div.innerHTML = '<span class="mv">Object ' + (i + 1) + ': possible moving object (' +
        confidence(f) + ' confidence)</span><br>moved ' + Math.round(f.dist) + ' px, ' +
        (f.dist / daysBetween()).toFixed(1) + ' px per day';
    } else {
      div.innerHTML = '<span class="ch">Object ' + (i + 1) + ': brightness change</span><br>' +
        'got ' + f.what + ', did not move';
    }
    div.onclick = () => select(f);
    list.appendChild(div);
  });
  if (shown === 0) list.textContent = 'Nothing matches this filter.';
}

// ---------- draw circles, squares, numbers and predictions ----------
function drawMarkers() {
  found.forEach((f, i) => {
    if (!visible(f)) return;
    ctx.lineWidth = (f === selected) ? 5 : 3;
    if (f.type === 'mover') {
      ctx.strokeStyle = (f === selected) ? 'yellow' : 'orange';
      ctx.beginPath(); ctx.arc(f.x, f.y, 16, 0, 7); ctx.stroke();
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(f.fromX, f.fromY); ctx.lineTo(f.x, f.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(f.fromX, f.fromY, 6, 0, 7); ctx.stroke();

      // green dotted line: where it could be later
      const p = predicted(f);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'lime';
      ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 7); ctx.stroke();
      ctx.fillStyle = 'lime';
      ctx.font = '13px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('+' + p.ahead + 'd', p.x + 12, p.y + 4);
    } else {
      ctx.strokeStyle = (f === selected) ? 'yellow' : 'deepskyblue';
      ctx.strokeRect(f.x - 14, f.y - 14, 28, 28);
    }
    // the object number
    ctx.fillStyle = 'white';
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), f.x + 18, f.y - 14);
  });
}

// ---------- click a marker on the sky ----------
sky.onclick = e => {
  const r = sky.getBoundingClientRect();
  const x = (e.clientX - r.left) * W / r.width;
  const y = (e.clientY - r.top) * H / r.height;
  let best = null, bestDist = 30;
  found.forEach(f => {
    if (!visible(f)) return;
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < bestDist) { bestDist = d; best = f; }
  });
  if (best) select(best);
  else document.getElementById('info').textContent = 'Click right on a marker.';
};

// ---------- zoom lens ----------
sky.onmousemove = e => {
  const r = sky.getBoundingClientRect();
  const x = (e.clientX - r.left) * W / r.width;
  const y = (e.clientY - r.top) * H / r.height;
  lctx.imageSmoothingEnabled = false;
  lctx.fillStyle = 'black';
  lctx.fillRect(0, 0, 160, 160);
  lctx.drawImage(sky, x - 20, y - 20, 40, 40, 0, 0, 160, 160);
};

// ---------- download the result as a picture ----------
document.getElementById('downloadBtn').onclick = () => {
  const link = document.createElement('a');
  link.download = 'planetx-result.png';
  link.href = sky.toDataURL('image/png');
  link.click();
};

// ---------- download a text report ----------
document.getElementById('reportBtn').onclick = () => {
  let text = 'PLANET X REPORT\n';
  text += 'Before date: ' + document.getElementById('dateA').value + '\n';
  text += 'After date: ' + document.getElementById('dateB').value + '\n';
  text += 'Objects found: ' + found.length + '\n\n';
  found.forEach((f, i) => {
    text += 'Object ' + (i + 1) + ': ' + describe(f) + '\n';
  });
  const blob = new Blob([text], { type: 'text/plain' });
  const link = document.createElement('a');
  link.download = 'planetx-report.txt';
  link.href = URL.createObjectURL(blob);
  link.click();
};

document.getElementById('compareBtn').onclick = compare;
document.getElementById('thr').oninput = compare;
document.getElementById('minSize').oninput = compare;
document.getElementById('predictDays').oninput = () => { buildList(); render(); };
render();