/* loot Peek Loading — standalone component, no dependencies. */

function mount(container, options = {}) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container || !container.appendChild)
    throw new Error('LootLoading.mount: provide a container element or valid selector.');
  const root = document.createElement('div');
  root.className = 'loot-peek-loader';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', options.label || 'Loading');
  root.innerHTML =
    '<div class="peek-scene"><canvas width="1200" height="880" aria-hidden="true"></canvas></div>';
  root.style.width = options.width || '360px';
  root.style.maxWidth = '100%';
  container.appendChild(root);
  const canvas = root.querySelector('canvas'),
    c = canvas.getContext('2d');
  let raf = 0,
    destroyed = false,
    visible = true;

  const purple = '#6d28d9',
    paper = '#fffcf8',
    edge = '#e5d9fa';
  const spring = (p) => ({ p, v: 0 });
  let body = spring(190),
    turn = spring(0),
    gaze = spring(0),
    stretch = spring(1),
    clock = 0,
    last = performance.now(),
    stopped = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    stopped = true;
    body.p = 0;
  }
  function integrate(s, target, dt, w, z) {
    s.v += (w * w * (target - s.p) - 2 * z * w * s.v) * dt;
    s.p += s.v * dt;
  }
  function targets(t) {
    let y = 190,
      angle = 0,
      eye = 0,
      sy = 1;
    if (t >= 0.24 && t < 0.8) {
      y = 105;
      sy = 0.98;
    } else if (t >= 0.8 && t < 3.76) {
      y = 0;
      sy = 1;
    }
    if (t >= 0.8 && t < 1.0) sy = 1.06;
    if (t >= 1.46 && t < 2.2) eye = -13;
    if (t >= 1.58 && t < 2.28) angle = -5;
    if (t >= 2.2 && t < 3.05) eye = 13;
    if (t >= 2.34 && t < 3.16) angle = 5;
    if (t >= 3.5 && t < 3.76) {
      y = -5;
      sy = 1.025;
    }
    if (t >= 3.76) {
      y = 190;
      sy = 0.94;
    }
    return { y, angle, eye, sy };
  }
  function oval(x, y, rx, ry, fill) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
  }
  function eye(cx, cy, half, wink) {
    c.save();
    c.beginPath();
    c.ellipse(cx, cy, 31, 29, 0, 0, Math.PI * 2);
    c.clip();
    c.beginPath();
    const top = half ? cy + 2 : cy - 31;
    const lid = top + (cy + 25 - top) * wink;
    c.moveTo(cx - 40, lid + 4);
    c.quadraticCurveTo(cx, lid - 2, cx + 40, lid - 5);
    c.lineTo(cx + 40, cy + 40);
    c.lineTo(cx - 40, cy + 40);
    c.closePath();
    c.clip();
    c.fillStyle = '#fff';
    c.fillRect(cx - 40, cy - 40, 80, 80);
    const px = cx + (half ? -7 : 8) + gaze.p,
      py = cy + (half ? -6 : -3);
    oval(px, py, 12.5, 17.5, purple);
    oval(px + 5.5, py - 8, 3.8, 3.8, '#fff');
    c.restore();
  }
  function draw(t) {
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, 600, 440);
    c.fillStyle = paper;
    c.fillRect(0, 0, 600, 440);
    const alive = body.p < 25 ? Math.sin(t * 4.3) * 1.4 : 0;
    const lift = body.p + alive;
    c.save();
    c.translate(195 + turn.p * 0.65, 95 + lift);
    c.translate(105, 160);
    c.rotate((turn.p * Math.PI) / 180);
    c.scale(1 / stretch.p, stretch.p);
    c.translate(-105, -160);
    // The body is deliberately long: its lower half lives behind the foreground ledge.
    c.beginPath();
    c.roundRect(0, 0, 210, 285, [49, 49, 55, 55]);
    c.fillStyle = purple;
    c.fill();
    const wink = t > 3.12 && t < 3.46 ? Math.sin(((t - 3.12) / 0.34) * Math.PI) ** 2 : 0;
    eye(64, 91, false, 0);
    eye(146, 97, true, wink);
    c.restore();
    // Opaque foreground hides the torso. The hands sit ON the edge, rather than being cut off with it.
    c.fillStyle = paper;
    c.fillRect(0, 255, 600, 185);
    c.beginPath();
    c.moveTo(142, 255);
    c.bezierCurveTo(220, 253, 380, 253, 458, 255);
    c.strokeStyle = edge;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.stroke();
    const handLift = Math.max(0, body.p - 4);
    c.save();
    c.beginPath();
    c.rect(130, 180, 340, 91);
    c.clip();
    for (const [x, phase] of [
      [194, 0],
      [406, 0.75],
    ]) {
      const py = 252 + handLift + (body.p < 10 ? Math.sin(t * 4.3 + phase) * 0.5 : 0);
      oval(x, py + 8, 23, 7, '#ede4f8');
      oval(x, py, 24, 20, paper);
      oval(x, py - 1, 21, 17, purple);
      c.beginPath();
      c.moveTo(x + 10, py - 10);
      c.quadraticCurveTo(x + 14, py - 7, x + 14, py - 3);
      c.strokeStyle = '#a78bfa';
      c.lineWidth = 2;
      c.stroke();
    }
    c.restore();
    c.font = '700 27px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
    c.fillStyle = purple;
    c.textBaseline = 'alphabetic';
    const word = 'Loading',
      length = c.measureText(word).width,
      left = (600 - length - 40) / 2;
    c.fillText(word, left, 335);
    const count = 1 + Math.floor((t % 1.6) / 0.4);
    for (let i = 0; i < Math.min(4, count); i++) c.fillText('.', left + length + i * 10, 335);
  }
  function frame(now) {
    raf = 0;
    if (destroyed || !visible || !root.isConnected) return;
    let remaining = Math.min(0.06, Math.max(0, (now - last) / 1000));
    last = now;
    if (!stopped) {
      while (remaining > 0) {
        const dt = Math.min(1 / 180, remaining);
        remaining -= dt;
        clock += dt;
        if (clock >= 4.8) clock -= 4.8;
        const goal = targets(clock);
        integrate(body, goal.y, dt, 17, 0.76);
        integrate(turn, goal.angle, dt, 13, 0.7);
        integrate(gaze, goal.eye, dt, 29, 0.85);
        integrate(stretch, goal.sy, dt, 20, 0.8);
      }
    }
    draw(clock);
    if (!reduced) raf = requestAnimationFrame(frame);
  }
  draw(0);
  if (!reduced) raf = requestAnimationFrame(frame);
  return {
    element: root,
    show() {
      if (destroyed) return;
      visible = true;
      root.hidden = false;
      last = performance.now();
      if (!raf && !reduced) raf = requestAnimationFrame(frame);
    },
    hide() {
      visible = false;
      root.hidden = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    destroy() {
      destroyed = true;
      visible = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      root.remove();
    },
  };
}
window.LootLoading = Object.freeze({ mount });
