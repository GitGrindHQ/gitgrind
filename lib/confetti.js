/*!
 * GitGrind — Bundled Confetti Library
 * Based on canvas-confetti by catdad (MIT License)
 * Self-contained, no CDN, CSP-compliant
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.confetti = factory());
}(this, function () {
  'use strict';

  var raf = (function () {
    var TIME = Math.floor(1000 / 60);
    var frame, cancel;
    var frames = {};
    var lastFrameTime = 0;

    if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
      frame = function (cb) { var id = Math.random(); frames[id] = requestAnimationFrame(function onFrame(time) { if (frames[id] != null) { frames[id] = requestAnimationFrame(onFrame); cb(time); } }); return id; };
      cancel = function (id) { if (frames[id] != null) { cancelAnimationFrame(frames[id]); } delete frames[id]; };
    } else {
      frame = function (cb) { var id = Math.random(); frames[id] = setTimeout(function onFrame() { if (frames[id] != null) { frames[id] = setTimeout(onFrame, TIME); cb(Date.now()); } }, TIME); return id; };
      cancel = function (id) { if (frames[id] != null) { clearTimeout(frames[id]); } delete frames[id]; };
    }

    return { frame: frame, cancel: cancel };
  }());

  var getDefaultCanvas = (function () {
    var canvasEl;
    return function () {
      if (!canvasEl || !document.body.contains(canvasEl)) {
        canvasEl = document.createElement('canvas');
        canvasEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999999;';
        document.body.appendChild(canvasEl);
      }
      return canvasEl;
    };
  }());

  function randomPhysics(opts) {
    var radAngle = opts.angle * (Math.PI / 180);
    var radSpread = opts.spread * (Math.PI / 180);
    return {
      x: opts.origin.x,
      y: opts.origin.y,
      wobble: Math.random() * 10,
      wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
      velocity: (opts.startVelocity * 0.5) + (Math.random() * opts.startVelocity),
      angle2D: -radAngle + ((0.5 * radSpread) - (Math.random() * radSpread)),
      tiltAngle: (Math.random() * (0.75 - 0.25) + 0.25) * Math.PI,
      color: opts.color,
      shape: opts.shape,
      tick: 0,
      totalTicks: opts.ticks,
      decay: opts.decay,
      drift: opts.drift,
      random: Math.random() + 2,
      tiltSin: 0,
      tiltCos: 0,
      wobbleX: 0,
      wobbleY: 0,
      gravity: opts.gravity * 3,
      ovalScalar: 0.6,
      scalar: opts.scalar
    };
  }

  function updateFetti(ctx, progress, opts, fetti) {
    fetti.x += Math.cos(fetti.angle2D) * fetti.velocity + fetti.drift;
    fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + fetti.gravity;
    fetti.wobble += fetti.wobbleSpeed;
    fetti.velocity *= fetti.decay;
    fetti.tiltAngle += 0.1;
    fetti.tiltSin = Math.sin(fetti.tiltAngle);
    fetti.tiltCos = Math.cos(fetti.tiltAngle);
    fetti.random = Math.random() + 2;
    fetti.wobbleX = fetti.x + ((10 * fetti.scalar) * Math.cos(fetti.wobble));
    fetti.wobbleY = fetti.y + ((10 * fetti.scalar) * Math.sin(fetti.wobble));

    var progress2 = fetti.tick++ / fetti.totalTicks;
    var x1 = fetti.x + (fetti.random * fetti.tiltCos);
    var y1 = fetti.y + (fetti.random * fetti.tiltSin);
    var x2 = fetti.wobbleX + (fetti.random * fetti.tiltCos);
    var y2 = fetti.wobbleY + (fetti.random * fetti.tiltSin);

    ctx.fillStyle = 'rgba(' + fetti.color.r + ', ' + fetti.color.g + ', ' + fetti.color.b + ', ' + (1 - progress2) + ')';
    ctx.beginPath();

    if (fetti.shape === 'circle') {
      ctx.ellipse ? ctx.ellipse(fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI) : ctx.arc(fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, 0, 2 * Math.PI);
    } else {
      ctx.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
      ctx.lineTo(Math.floor(fetti.wobbleX), Math.floor(y1));
      ctx.lineTo(Math.floor(x2), Math.floor(y2));
      ctx.lineTo(Math.floor(x1), Math.floor(fetti.wobbleY));
    }

    ctx.closePath();
    ctx.fill();
    return fetti.tick < fetti.totalTicks;
  }

  function animate(canvas, fettis, opts, done) {
    var animatingFettis = fettis.slice();
    var id = raf.frame(function onFrame() {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      animatingFettis = animatingFettis.filter(function (fetti) {
        return updateFetti(ctx, fetti.tick / fetti.totalTicks, opts, fetti);
      });
      if (animatingFettis.length > 0) {
        id = raf.frame(onFrame);
      } else {
        done();
      }
    });
    return { cancel: function () { raf.cancel(id); } };
  }

  function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
  }

  function confettiCannon(canvas, opts) {
    opts = opts || {};
    var particleCount = opts.particleCount || 50;
    var angle = opts.angle || 90;
    var spread = opts.spread || 45;
    var startVelocity = opts.startVelocity || 45;
    var decay = opts.decay || 0.9;
    var gravity = opts.gravity || 1;
    var drift = opts.drift || 0;
    var ticks = opts.ticks || 200;
    var scalar = opts.scalar || 1;
    var origin = { x: (opts.origin && opts.origin.x != null ? opts.origin.x : 0.5), y: (opts.origin && opts.origin.y != null ? opts.origin.y : 0.5) };
    var colors = (opts.colors || ['#7c3aed', '#a855f7', '#10b981', '#f59e0b', '#e6edf3', '#ef4444']).map(hexToRgb);
    var shapes = opts.shapes || ['square', 'circle'];

    if (!canvas) canvas = getDefaultCanvas();
    canvas.width = canvas.offsetWidth || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;

    var fettis = Array.from({ length: particleCount }, function () {
      return randomPhysics({
        angle: angle,
        spread: spread,
        startVelocity: startVelocity,
        decay: decay,
        gravity: gravity,
        drift: drift,
        ticks: ticks,
        scalar: scalar,
        origin: { x: origin.x * canvas.width, y: origin.y * canvas.height },
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)]
      });
    });

    return new Promise(function (resolve) {
      animate(canvas, fettis, opts, resolve);
    });
  }

  confettiCannon.create = function (canvas, globalOpts) {
    globalOpts = globalOpts || {};
    if (globalOpts.resize) {
      var onResize = function () {
        canvas.width = canvas.offsetWidth || window.innerWidth;
        canvas.height = canvas.offsetHeight || window.innerHeight;
      };
      window.addEventListener('resize', onResize, false);
    }
    return function (opts) {
      return confettiCannon(canvas, opts);
    };
  };

  return confettiCannon;
}));
