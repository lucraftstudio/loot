(function (global) {
  'use strict';
  const scriptBase = new URL('./assets/', document.currentScript?.src || document.baseURI).href;
  const RARITIES = {
    normal: 'normal',
    purple: 'purple',
    gold: 'gold',
    hidden: 'purple',
    superHidden: 'gold',
  };
  const W = 1100,
    H = 2000;
  const QUADS = {
    front: [
      [165, 668],
      [737, 589],
      [741, 1739],
      [154, 1755],
    ],
    right: [
      [737, 589],
      [947, 714],
      [961, 1814],
      [741, 1739],
    ],
    bottom: [
      [154, 1755],
      [741, 1739],
      [961, 1814],
      [344, 1838],
    ],
  };
  const image = (url) =>
    new Promise((resolve, reject) => {
      const im = new Image();
      const timer = setTimeout(() => reject(new Error('Box image timed out: ' + url)), 15000);
      im.onload = () => {
        clearTimeout(timer);
        resolve(im);
      };
      im.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Unable to load box asset: ' + url));
      };
      im.src = url;
    });
  function polygon(ctx, q) {
    ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
  }
  function solve(a, b) {
    a = a.map((r, i) => [...r, b[i]]);
    for (let j = 0; j < a.length; j++) {
      let k = j;
      for (let i = j + 1; i < a.length; i++) if (Math.abs(a[i][j]) > Math.abs(a[k][j])) k = i;
      [a[k], a[j]] = [a[j], a[k]];
      if (Math.abs(a[j][j]) < 1e-10) throw Error('Degenerate face projection');
      let v = a[j][j];
      a[j] = a[j].map((x) => x / v);
      for (let i = 0; i < a.length; i++)
        if (i !== j) {
          let c = a[i][j];
          a[i] = a[i].map((x, k) => x - c * a[j][k]);
        }
    }
    return a.map((r) => r.at(-1));
  }
  function homography(q) {
    const src = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      a = [],
      b = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = src[i],
        [x, y] = q[i];
      a.push([u, v, 1, 0, 0, 0, -x * u, -x * v], [0, 0, 0, u, v, 1, -y * u, -y * v]);
      b.push(x, y);
    }
    const m = solve(a, b);
    return (u, v) => {
      let d = m[6] * u + m[7] * v + 1;
      return [(m[0] * u + m[1] * v + m[2]) / d, (m[3] * u + m[4] * v + m[5]) / d];
    };
  }
  function triangle(ctx, im, src, dst) {
    const a = src[0],
      b = src[1],
      c = src[2],
      d = dst[0],
      e = dst[1],
      f = dst[2],
      det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    const xx = ((e[0] - d[0]) * (c[1] - a[1]) - (f[0] - d[0]) * (b[1] - a[1])) / det,
      xy = ((e[1] - d[1]) * (c[1] - a[1]) - (f[1] - d[1]) * (b[1] - a[1])) / det,
      yx = ((f[0] - d[0]) * (b[0] - a[0]) - (e[0] - d[0]) * (c[0] - a[0])) / det,
      yy = ((f[1] - d[1]) * (b[0] - a[0]) - (e[1] - d[1]) * (c[0] - a[0])) / det;
    ctx.save();
    const center = [
      (dst[0][0] + dst[1][0] + dst[2][0]) / 3,
      (dst[0][1] + dst[1][1] + dst[2][1]) / 3,
    ];
    const expanded = dst.map(([x, y]) => {
      const length = Math.hypot(x - center[0], y - center[1]) || 1;
      return [x + ((x - center[0]) * 0.65) / length, y + ((y - center[1]) * 0.65) / length];
    });
    polygon(ctx, expanded);
    ctx.clip();
    ctx.transform(xx, xy, yx, yy, d[0] - xx * a[0] - yx * a[1], d[1] - xy * a[0] - yy * a[1]);
    ctx.drawImage(im, 0, 0);
    ctx.restore();
  }
  function project(ctx, im, q, sourceQuad) {
    const map = homography(q),
      sourceMap = sourceQuad ? homography(sourceQuad) : (u, v) => [u * im.width, v * im.height],
      n = 24;
    ctx.save();
    polygon(ctx, q);
    ctx.clip();
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const uv = [
            [x / n, y / n],
            [(x + 1) / n, y / n],
            [(x + 1) / n, (y + 1) / n],
            [x / n, (y + 1) / n],
          ],
          uvpx = uv.map(([u, v]) => sourceMap(u, v)),
          dst = uv.map(([u, v]) => map(u, v));
        triangle(ctx, im, [uvpx[0], uvpx[1], uvpx[2]], [dst[0], dst[1], dst[2]]);
        triangle(ctx, im, [uvpx[0], uvpx[2], uvpx[3]], [dst[0], dst[2], dst[3]]);
      }
    ctx.restore();
  }
  async function loadSkin(options) {
    const skin = options.skin || {},
      base = options.assetBase ? new URL(options.assetBase, document.baseURI).href : scriptBase,
      url = (x) => new URL(x, base).href;
    const paper = await image(skin.lidInner || url('paper.png'));
    if (!skin.front && !skin.right && !skin.bottom) {
      return { body: await image(skin.body || url('approved-body.png')), paper };
    }
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    for (const face of ['front', 'right', 'bottom']) {
      const spec = skin[face],
        art = spec ? await image(typeof spec === 'string' ? spec : spec.url) : paper;
      project(ctx, art, QUADS[face], typeof spec === 'object' ? spec.quad : null);
      if (face !== 'front') {
        ctx.save();
        polygon(ctx, QUADS[face]);
        ctx.clip();
        ctx.fillStyle = face === 'right' ? 'rgba(82,48,30,.06)' : 'rgba(82,48,30,.10)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
    return { body: canvas, paper };
  }
  function createScene(player) {
    const cvs = player.canvas,
      ctx = cvs.getContext('2d'),
      assets = player.assets,
      lamp = player.lamp;
    const A = { x: 165, y: 668 },
      B = { x: 737, y: 589 },
      C = { x: 947, y: 714 },
      D = { x: 375, y: 793 },
      origin = { x: 580, y: 622 };
    let particles = [];
    const reduced = player.options.reducedMotion === true;
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
      ease = (t) => 1 - Math.pow(1 - t, 3),
      lerp = (a, b, t) => a + (b - a) * t;
    function lid(angle, illumination = 0, tint = '255,244,205') {
      const a = (angle * Math.PI) / 180,
        vx = 140 * Math.cos(a),
        vy = 83.333 * Math.cos(a) + 460 * Math.sin(a),
        l = { x: D.x - vx, y: D.y - vy },
        r = { x: C.x - vx, y: C.y - vy },
        im = assets.paper;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(r.x, r.y);
      ctx.lineTo(C.x, C.y);
      ctx.lineTo(D.x, D.y);
      ctx.closePath();
      ctx.clip();
      ctx.transform(
        (r.x - l.x) / im.width,
        (r.y - l.y) / im.width,
        (D.x - l.x) / im.height,
        (D.y - l.y) / im.height,
        l.x,
        l.y,
      );
      ctx.drawImage(im, 0, 0);
      if (illumination > 0) {
        let g = ctx.createLinearGradient(0, 0, 0, im.height);
        g.addColorStop(0, `rgba(${tint},${Math.min(0.15, illumination * 0.12)})`);
        g.addColorStop(0.5, `rgba(${tint},${Math.min(0.35, illumination * 0.35)})`);
        g.addColorStop(1, `rgba(255,255,243,${Math.min(0.93, illumination)})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, im.width, im.height);
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = '#bca18e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(r.x, r.y);
      ctx.lineTo(C.x, C.y);
      ctx.lineTo(D.x, D.y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    function seal(progress) {
      if (progress <= 0 || progress >= 1.2) return;
      ctx.save();
      let peel = clamp(progress),
        rx = lerp(A.x, B.x, peel) + 25,
        ry = lerp(A.y, B.y, peel) + 15,
        len = 110 + 260 * peel;
      let tx = rx + (-30 + 220 * Math.pow(peel, 6)),
        ty = ry - len;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.quadraticCurveTo(rx - 80, ry - len * 0.4, tx, ty);
      ctx.strokeStyle = '#fff4eb';
      ctx.lineWidth = 38;
      ctx.lineCap = 'butt';
      ctx.stroke();
      ctx.strokeStyle = '#dc4a75';
      ctx.lineWidth = 23;
      ctx.stroke();
      ctx.strokeStyle = '#ffabbc';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
    function halo(x, y, r, color, alpha) {
      let g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color},${alpha})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    function star(x, y, r, alpha, color) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = r * 2;
      ctx.beginPath();
      ctx.moveTo(0, -r * 2);
      ctx.quadraticCurveTo(r * 0.15, -r * 0.15, r * 1.4, 0);
      ctx.quadraticCurveTo(r * 0.15, r * 0.15, 0, r * 2);
      ctx.quadraticCurveTo(-r * 0.15, r * 0.15, -r * 1.4, 0);
      ctx.quadraticCurveTo(-r * 0.15, -r * 0.15, 0, -r * 2);
      ctx.fill();
      ctx.restore();
    }
    function spawn(n) {
      for (let i = 0; i < n; i++) {
        let a = -Math.PI + Math.random() * Math.PI,
          s = 50 + Math.random() * 200;
        particles.push({
          x: origin.x + (Math.random() - 0.5) * 170,
          y: origin.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 70,
          life: 1.5 + Math.random() * 3,
          age: 0,
          r: 1 + Math.random() * 4,
          seed: Math.random() * 6.28,
        });
      }
    }

    function lampState(elapsed, selected) {
      if (elapsed < 1.3) return { power: 0, kind: -1, tint: '255,244,205', rare: false };
      const little = 0.12 * ease(clamp((elapsed - 1.3) / 0.35));
      if (elapsed < 2.5) return { power: little, kind: -1, tint: '255,244,205', rare: false };
      const progress = ease(clamp((elapsed - 2.5) / 0.35)),
        gold = selected === 'gold';
      if (selected === 'normal')
        return { power: lerp(0.12, 0.18, progress), kind: -2, tint: '245,247,250', rare: false };
      const age = Math.max(0, elapsed - 2.5),
        push = ease(clamp(age / 0.09)) * (1 - ease(clamp((age - 0.13) / 0.6)));
      return {
        power: lerp(0.12, gold ? 1.7 : 1.05, progress) * (1 + push * (gold ? 0.24 : 0.15)),
        kind: gold ? 1 : 0,
        tint: gold ? '255,234,189' : '206,166,255',
        rare: true,
      };
    }
    function paintInterior(state, t, age) {
      if (state.power <= 0) return;
      if (lamp) {
        lamp.render(t, age, state.kind, state.power);
        ctx.drawImage(lamp.canvas, 0, 0, W, H);
      } else {
        // Preserve the supplied tier colours even when WebGL is unavailable.
        // Radial falloff avoids rectangular light backgrounds.
        const tint = state.tint;
        if (state.rare) {
          halo(origin.x, origin.y - 180, 440, tint, Math.min(0.6, state.power * 0.35));
          ctx.save();
          ctx.translate(origin.x, origin.y - 70);
          ctx.scale(1, 1.5);
          halo(0, -105, 290, tint, Math.min(0.65, state.power * 0.38));
          ctx.restore();
        }
        for (let index = 0; index < 7; index++) {
          const x = 235 + index * 85;
          const y = 690 - (x - 580) * 0.12;
          glowLamp(x, y, state.rare ? 210 : 100, tint, state.power * (state.rare ? 0.27 : 0.23));
        }
      }
    }

    function glowLamp(x, y, r, color, a) {
      let g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color},${Math.min(0.9, a)})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    function dust(t, dt, state) {
      if (!state.rare) return;
      const gold = state.kind === 1;
      if (!reduced) {
        const amount = dt * (gold ? 150 : 52);
        spawn(Math.floor(amount) + (Math.random() < amount % 1 ? 1 : 0));
      }
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (const p of particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const fade = Math.sin(Math.PI * clamp(p.age / p.life));
        const flicker = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(t * 7 + p.seed + p.age * 2), 3);
        const alpha = fade * (gold ? flicker : 0.65);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = gold ? '#e8c480' : '#c1a1df';
        ctx.shadowColor = gold ? '#f1d598' : '#dfc7f5';
        ctx.shadowBlur = gold ? 9 : 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.min(gold ? 2.4 : 1.8, p.r), 0, 7);
        ctx.fill();
        if (gold) {
          ctx.fillStyle = '#fffef3';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 0.7, 0, 7);
          ctx.fill();
        }
        if (gold && p.r > 3.5 && flicker > 0.55) {
          const r = 3 + flicker * 5;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.fillStyle = '#fffef0';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.quadraticCurveTo(r * 0.12, -r * 0.12, r * 0.75, 0);
          ctx.quadraticCurveTo(r * 0.12, r * 0.12, 0, r);
          ctx.quadraticCurveTo(-r * 0.12, r * 0.12, -r * 0.75, 0);
          ctx.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
      particles = particles.filter((p) => p.age < p.life && p.y > -40);
    }

    function frontBounce(state) {
      if (state.power <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(C.x, C.y);
      ctx.lineTo(956, 1010);
      ctx.lineTo(165, 980);
      ctx.closePath();
      ctx.clip();
      let g = ctx.createLinearGradient(0, 620, 0, 950);
      g.addColorStop(0, `rgba(${state.tint},${Math.min(0.2, state.power * 0.12)})`);
      g.addColorStop(1, `rgba(${state.tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 570, W, 470);
      ctx.restore();
    }

    function draw(elapsed, t, dt, mode) {
      ctx.clearRect(0, 0, W, H);
      let angle = 0,
        tear = 0;
      if (elapsed >= 1 && elapsed < 1.3) tear = (elapsed - 1) / 0.3;
      if (elapsed >= 1.3 && elapsed < 1.65) angle = 38 * ease((elapsed - 1.3) / 0.35);
      else if (elapsed >= 1.65 && elapsed < 2.5) angle = 38;
      else if (elapsed >= 2.5 && elapsed < 2.85)
        angle = lerp(38, 103, ease((elapsed - 2.5) / 0.35));
      else if (elapsed >= 2.85) angle = 103;
      const state = lampState(elapsed, mode),
        shock = Math.max(0, elapsed - 2.5),
        shake = state.rare
          ? (state.kind === 1 ? 0.006 : 0.0035) * Math.sin(shock * 17) * Math.exp(-shock * 2)
          : 0;
      ctx.save();
      ctx.translate(550, 1810);
      ctx.rotate(shake);
      ctx.translate(-550, -1810);
      lid(angle, Math.min(1, state.power * 0.7), state.tint);
      seal(tear);
      paintInterior(state, t, shock);
      dust(t, dt, state);
      ctx.drawImage(assets.body, 0, 0);
      frontBounce(state);
      ctx.restore();
    }
    return {
      draw,
      reset() {
        particles = [];
      },
      lampState,
    };
  }
  class BlindBoxAnimation {
    constructor(options = {}) {
      this.options = { rarity: 'normal', holdFlash: true, flashZIndex: 9999, ...options };
      this.container =
        typeof options.container === 'string'
          ? document.querySelector(options.container)
          : options.container;
      if (!this.container) throw Error('An animation container is required');
      this.container.classList.add('bb-animation');
      this.canvas = document.createElement('canvas');
      this.canvas.width = W;
      this.canvas.height = H;
      this.canvas.setAttribute('aria-label', 'Blind box opening animation');
      this.container.appendChild(this.canvas);
      this.flash = document.createElement('div');
      this.flash.className = 'bb-white-flash';
      this.flash.style.zIndex = String(this.options.flashZIndex);
      this.flash.setAttribute('aria-hidden', 'true');
      (options.flashContainer || document.body).appendChild(this.flash);
      this.lamp =
        typeof global.createInteriorLamp === 'function' ? global.createInteriorLamp() : null;
      this.sound =
        typeof global.BoxAudio === 'function'
          ? new global.BoxAudio({
              enabled: this.options.sound !== false,
              sources: this.options.audioSources,
            })
          : null;
      this.busy = false;
      this.destroyed = false;
      this.ready = loadSkin(this.options).then((assets) => {
        if (this.destroyed || this._skinGeneration) return;
        this.assets = assets;
        this.scene = createScene(this);
        this.scene.draw(0, 0, 0, 'normal');
      });
      this._frame = this._frame.bind(this);
    }
    play(options = {}) {
      const rarity = RARITIES[options.rarity || this.options.rarity];
      if (!rarity) return Promise.reject(Error('Unknown rarity'));
      if (this.destroyed) return Promise.reject(Error('Animation destroyed'));
      if (this.busy) return Promise.reject(Error('Animation already playing'));
      const soundReady = this.sound?.prepare();
      this.busy = true;
      this._rarity = rarity;
      this._result = options.result;
      this._onComplete = options.onComplete;
      this._generation = (this._generation || 0) + 1;
      const generation = this._generation;
      this.flash.style.transition = 'none';
      this.flash.style.opacity = '0';
      this.flash.style.background = 'transparent';
      clearTimeout(this._fadeTimer);
      return new Promise((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
        Promise.all([this.ready, soundReady])
          .then(() => {
            if (generation !== this._generation || !this.busy) return;
            this.scene.reset();
            this.sound?.start(rarity);
            this._start = performance.now();
            this._last = this._start;
            this._raf = requestAnimationFrame(this._frame);
          })
          .catch((error) => {
            if (generation !== this._generation) return;
            this.busy = false;
            this._reject = null;
            this._resolve = null;
            reject(error);
          });
      });
    }
    _wash(progress) {
      const r = this.canvas.getBoundingClientRect(),
        scale = Math.min(r.width / W, r.height / H),
        x = r.left + (r.width - W * scale) / 2 + W * scale * 0.515,
        y = r.top + (r.height - H * scale) / 2 + H * scale * 0.344,
        radius =
          Math.hypot(global.innerWidth, global.innerHeight) *
          Math.pow(Math.max(0, progress), 0.85) *
          1.3,
        edge =
          this._rarity === 'gold'
            ? '255,232,174'
            : this._rarity === 'purple'
              ? '232,218,255'
              : '255,247,233';
      this.flash.style.opacity = '1';
      this.flash.style.background =
        progress >= 1
          ? '#fff'
          : `radial-gradient(circle at ${x}px ${y}px,rgba(255,255,255,1) 0px,rgba(255,255,255,.99) ${radius * 0.65}px,rgba(${edge},.78) ${radius * 0.84}px,rgba(${edge},0) ${Math.max(1, radius)}px)`;
    }
    _frame(ms) {
      if (!this.busy || this.destroyed) return;
      const elapsed = (ms - this._start) / 1000,
        dt = Math.min(0.04, Math.max(0, (ms - this._last) / 1000));
      this._last = ms;
      this.scene.draw(elapsed, ms / 1000, dt, this._rarity);
      if (elapsed >= 3.6) this._wash(Math.min(1, (elapsed - 3.6) / 0.55));
      if (elapsed >= 4.15) {
        this._wash(1);
        this._complete();
      } else this._raf = requestAnimationFrame(this._frame);
    }
    _complete() {
      if (!this.busy) return;
      this.busy = false;
      this._raf = null;
      const payload = { rarity: this._rarity, result: this._result, cancelled: false },
        resolve = this._resolve,
        callback = this._onComplete;
      this._resolve = null;
      this._reject = null;
      this._onComplete = null;
      this.container.dispatchEvent(
        new CustomEvent('blindbox:complete', { detail: payload, bubbles: true }),
      );
      try {
        if (typeof callback === 'function') callback(payload);
      } catch (error) {
        console.error(error);
      }
      if (resolve) resolve(payload);
      if (!this.options.holdFlash) {
        const generation = this._generation;
        this._fadeTimer = setTimeout(() => {
          if (generation === this._generation && !this.destroyed) {
            this.flash.style.transition = 'opacity 180ms';
            this.flash.style.opacity = '0';
          }
        }, 120);
      }
    }
    reset() {
      this.sound?.stop();
      cancelAnimationFrame(this._raf);
      clearTimeout(this._fadeTimer);
      this._generation = (this._generation || 0) + 1;
      this.busy = false;
      this._raf = null;
      if (this._resolve)
        this._resolve({ rarity: this._rarity, result: this._result, cancelled: true });
      this._resolve = null;
      this._reject = null;
      this._onComplete = null;
      this.flash.style.transition = 'none';
      this.flash.style.opacity = '0';
      this.flash.style.background = 'transparent';
      if (this.scene) this.scene.reset();
      if (this.scene && !this.destroyed) this.scene.draw(0, 0, 0, 'normal');
    }
    prepareAudio() {
      return this.sound?.prepare() || Promise.resolve();
    }
    async setSkin(skin) {
      if (this.destroyed) throw Error('Animation destroyed');
      if (this.busy) throw Error('Wait for animation to finish before changing skin');
      const skinGeneration = (this._skinGeneration || 0) + 1;
      this._skinGeneration = skinGeneration;
      this.ready = loadSkin({ ...this.options, skin }).then((assets) => {
        if (this.destroyed || skinGeneration !== this._skinGeneration) return;
        this.options.skin = skin;
        this.assets = assets;
        this.scene = createScene(this);
        this.scene.draw(0, 0, 0, 'normal');
      });
      return this.ready;
    }
    dismissFlash() {
      this.flash.style.transition = 'opacity 180ms';
      this.flash.style.opacity = '0';
    }
    setSound(enabled) {
      this.sound?.setEnabled(enabled);
    }
    destroy() {
      this.sound?.destroy();
      this.reset();
      this.destroyed = true;
      this.canvas.remove();
      this.flash.remove();
      if (this.lamp?.dispose) this.lamp.dispose();
    }
  }
  BlindBoxAnimation.geometry = {
    canvas: [W, H],
    boxCm: [7, 7, 11],
    faces: QUADS,
    view: 'fixed near-front low angle',
  };
  global.BlindBoxAnimation = BlindBoxAnimation;
})(window);
