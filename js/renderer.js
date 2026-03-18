// Canvas rendering — cells, mines, flags, ship, projectiles, UI
(function () {
  const G = window.Game;

  // Canvas references (set during init)
  G.oceanCanvas = null;
  G.gameCanvas = null;
  G.landCanvas = null;
  G.spriteCanvas = null;
  G.octx = null;
  G.gctx = null;
  G.lctx = null;
  G.sctx = null;

  const NUM_COLORS = [
    null, '#c0d8ff', '#40ff90', '#ff6060', '#d0d0ff',
    '#ff9090', '#60ffff', '#ffffff', '#c0c0c0'
  ];

  // Offscreen buffers for flicker-free rendering
  var _spriteBuffer = null;
  var _sbctx = null;
  var _gameBuffer = null;
  var _gbctx = null;

  G.initCanvases = function () {
    G.oceanCanvas = document.getElementById('oceanCanvas');
    G.gameCanvas = document.getElementById('gameCanvas');
    G.landCanvas = document.getElementById('landCanvas');
    G.spriteCanvas = document.getElementById('spriteCanvas');
    G.octx = G.oceanCanvas.getContext('2d');
    G.gctx = G.gameCanvas.getContext('2d');
    G.lctx = G.landCanvas.getContext('2d');
    G.sctx = G.spriteCanvas.getContext('2d');
  };

  G.sizeCanvases = function (canvasW, canvasH) {
    [G.oceanCanvas, G.gameCanvas, G.landCanvas, G.spriteCanvas].forEach(function (cv) {
      cv.width = canvasW;
      cv.height = canvasH;
    });
    // Size offscreen buffers to match
    _spriteBuffer = document.createElement('canvas');
    _spriteBuffer.width = canvasW;
    _spriteBuffer.height = canvasH;
    _sbctx = _spriteBuffer.getContext('2d');
    _gameBuffer = document.createElement('canvas');
    _gameBuffer.width = canvasW;
    _gameBuffer.height = canvasH;
    _gbctx = _gameBuffer.getContext('2d');
    document.getElementById('boardWrap').style.width = canvasW + 'px';
    document.getElementById('boardWrap').style.height = canvasH + 'px';
  };

  G.drawLayers = function (canvasW, canvasH) {
    var crop = G.crop;
    var sx = crop.x, sy = crop.y;
    var sw = crop.w || G.oceanImg.width, sh = crop.h || G.oceanImg.height;
    G.octx.drawImage(G.oceanImg, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
    G.lctx.drawImage(G.landImg, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
  };

  G.drawBoard = function () {
    G.gctx.clearRect(0, 0, G.gameCanvas.width, G.gameCanvas.height);
    if (G.sctx) G.sctx.clearRect(0, 0, G.spriteCanvas.width, G.spriteCanvas.height);
    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        G.drawCell(r, c);
      }
    }
  };

  G.drawCell = function (r, c) {
    const CELL = G.CELL;
    const x = c * CELL, y = r * CELL;
    const ctx = G.gctx;
    const ms = G.ms; // minesweeper state

    if (!G.oceanMask[r][c]) {
      ctx.clearRect(x, y, CELL, CELL);
      return;
    }

    if (ms.revealed[r][c]) {
      // Revealed cell — lighter variant of ocean #4e629d
      ctx.fillStyle = 'rgba(110, 130, 190, 0.35)';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = 'rgba(90, 110, 170, 0.25)';
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

      if (ms.mines[r][c]) {
        if (ms.revealed[r][c] === 'boom') {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        }
        G.drawMine(x, y);
      } else if (ms.grid[r][c] > 0) {
        ctx.fillStyle = NUM_COLORS[ms.grid[r][c]] || '#000';
        ctx.font = 'bold 13px "Menlo", "Consolas", "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ms.grid[r][c], x + CELL / 2, y + CELL / 2 + 1);
      }
    } else {
      // Unrevealed cell — clear first so removed flags disappear
      ctx.clearRect(x, y, CELL, CELL);
      // Subtle bevel lines matching ocean #4e629d family
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#7080b8';
      ctx.fillRect(x, y, CELL, 1);
      ctx.fillRect(x, y, 1, CELL);
      ctx.fillStyle = '#2a3468';
      ctx.fillRect(x + CELL - 1, y, 1, CELL);
      ctx.fillRect(x, y + CELL - 1, CELL, 1);
      ctx.globalAlpha = 1.0;

      if (ms.flagged[r][c]) {
        G.drawFlag(x, y);
      }

      if (ms.gameOver && ms.mines[r][c] && !ms.flagged[r][c]) {
        G.drawMine(x, y);
      }
      if (ms.gameOver && ms.flagged[r][c] && !ms.mines[r][c]) {
        G.drawMine(x, y);
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 4);
        ctx.lineTo(x + CELL - 4, y + CELL - 4);
        ctx.moveTo(x + CELL - 4, y + 4);
        ctx.lineTo(x + 4, y + CELL - 4);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  };

  G.drawMine = function (x, y) {
    const CELL = G.CELL;
    const ctx = G.gctx;
    const cx = x + CELL / 2, cy = y + CELL / 2;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    for (let a = 0; a < 4; a++) {
      const angle = a * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 3, cy + Math.sin(angle) * 3);
      ctx.lineTo(cx + Math.cos(angle) * 7, cy + Math.sin(angle) * 7);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 2, cy - 2, 2, 2);
  };

  G.drawFlag = function (x, y) {
    const CELL = G.CELL;
    const ctx = G.gctx;
    const cx = x + CELL / 2;
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(cx - 1, y + 4, 2, CELL - 8);
    ctx.fillStyle = '#ff3030';
    ctx.beginPath();
    ctx.moveTo(cx + 1, y + 4);
    ctx.lineTo(cx + 7, y + 7);
    ctx.lineTo(cx + 1, y + 10);
    ctx.fill();
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(cx - 4, y + CELL - 5, 8, 2);
    ctx.fillRect(cx - 3, y + CELL - 7, 6, 2);
  };

  // Draw dashed transit route line through path cell centers
  G.drawTransitRoute = function (path, ctx) {
    if (!path || path.length < 2) return;
    var CELL = G.CELL;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0][1] * CELL + CELL / 2, path[0][0] * CELL + CELL / 2);
    for (var i = 1; i < path.length; i++) {
      ctx.lineTo(path[i][1] * CELL + CELL / 2, path[i][0] * CELL + CELL / 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  // --- Transit phase rendering (SVG sprites with rotation/mirror) ---

  // Helper: draw a sprite centered at (px,py) rotated to angle, scaled to w×h
  function drawSprite(img, px, py, w, h, angle) {
    const ctx = G.sctx;
    if (!img.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Ship sprite has bow pointing UP (-π/2 direction).
  // shipAngle is the heading in radians (0 = rightward, π/2 = downward).
  // Size is derived from the image's aspect ratio, scaled to a fixed length in cells.
  var BASE_SHIP_LENGTH = 1.8; // ship length in grid cells for gridWidth 1

  G.drawShip = function (px, py, shipAngle) {
    var CELL = G.CELL;
    var img = G.sprites.ship;
    var ctx = G.sctx;
    if (!img.complete || !img.naturalWidth) return;
    // Scale ship size by gridWidth
    var gw = (G.activeShip && G.activeShip.gridWidth) || 1;
    var lengthCells = BASE_SHIP_LENGTH + (gw - 1) * 0.6;
    var len = CELL * lengthCells;
    var beam = len * (img.naturalWidth / img.naturalHeight);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(shipAngle + Math.PI / 2);
    ctx.drawImage(img, -beam / 2, -len / 2, beam, len);
    ctx.restore();
  };

  // Ship destroyed — draw the ship at its last position with an explosion overlay
  G.drawShipDeath = function (px, py, shipAngle) {
    // Draw ship in place
    G.drawShip(px, py, shipAngle);
    // Explosion overlay on top
    var CELL = G.CELL;
    var img = G.sprites.explosion;
    var ctx = G.sctx;
    if (!img.complete || !img.naturalWidth) return;
    var w = CELL * 4;
    var h = w * (img.naturalHeight / img.naturalWidth);
    ctx.save();
    ctx.translate(px, py);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  // Missile sprite faces UP (nose at top = -π/2 direction).
  G.drawMissile = function (mx, my, angle) {
    var CELL = G.CELL;
    var img = G.sprites.missile;
    var w = CELL * 0.7;
    var h = w * (img.naturalHeight / img.naturalWidth);
    drawSprite(img, mx, my, w, h, angle);
  };

  // Shahed sprite faces UP (nose at top = -π/2 direction).
  G.drawShahed = function (sx, sy, angle) {
    var CELL = G.CELL;
    var img = G.sprites.shahed;
    var w = CELL * 1.2;
    var h = w * (img.naturalHeight / img.naturalWidth);
    drawSprite(img, sx, sy, w, h, angle);
  };

  // FPV drone — smaller than shahed, uses fpv sprite (falls back to shahed sprite)
  G.drawFpv = function (fx, fy, angle) {
    var CELL = G.CELL;
    var img = G.sprites.fpv || G.sprites.shahed;
    var w = CELL * 1.44;
    var h = w * (img.naturalHeight / img.naturalWidth);
    drawSprite(img, fx, fy, w, h, angle);
  };

  // Effects (explosion, splash) — drawn without rotation, just centered
  G.drawEffect = function (effect) {
    var CELL = G.CELL;
    var alpha = effect.life / effect.maxLife; // 1 → 0 over lifetime
    var ctx = G.sctx;

    if (effect.type === 'ocean_drop') {
      // Procedural water splash — expanding ripple rings
      var progress = 1 - alpha; // 0 → 1 over lifetime
      var maxR = CELL * effect.size * 0.5;
      ctx.save();
      ctx.translate(effect.x, effect.y);

      // 3 concentric ripple rings expanding outward
      ctx.lineWidth = 1.5;
      for (var ring = 0; ring < 3; ring++) {
        var ringDelay = ring * 0.15;
        var ringProgress = Math.max(0, progress - ringDelay) / (1 - ringDelay);
        if (ringProgress <= 0 || ringProgress >= 1) continue;
        var r = maxR * (0.2 + 0.8 * ringProgress);
        var ringAlpha = (1 - ringProgress) * 0.6 * alpha;
        ctx.globalAlpha = ringAlpha;
        ctx.strokeStyle = 'rgba(200, 220, 255, 0.9)';
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Spray droplets
      if (progress < 0.6) {
        ctx.globalAlpha = (1 - progress / 0.6) * 0.5;
        ctx.fillStyle = '#cde';
        for (var d = 0; d < 6; d++) {
          var angle = (d / 6) * Math.PI * 2 + effect.x * 0.1; // pseudo-random per effect
          var dropR = maxR * 0.3 * progress * 2;
          var dx = Math.cos(angle) * dropR;
          var dy = Math.sin(angle) * dropR * 0.45 - CELL * 0.3 * (1 - progress * 1.5);
          ctx.beginPath();
          ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
      return;
    }

    if (effect.type === 'shotgun_blast') {
      // Cosmetic pellet scatter flying outward from ship in a cone
      var progress = 1 - alpha; // 0 → 1 over lifetime
      var spread = Math.PI / 16; // tighter visual cone
      var maxDist = CELL * 9.6;  // match SHOTGUN_RANGE
      var pelletCount = 16;
      ctx.save();
      for (var p = 0; p < pelletCount; p++) {
        // Deterministic scatter per pellet using effect position as seed
        var seed = effect.x * 13.7 + effect.y * 7.3 + p * 31.1;
        var pAngle = effect.angle + (((seed % 100) / 100) - 0.5) * 2 * spread;
        var pDist = maxDist * (0.3 + 0.7 * ((seed * 3.7 % 100) / 100)) * progress;
        var px = effect.x + Math.cos(pAngle) * pDist;
        var py = effect.y + Math.sin(pAngle) * pDist;
        var r = 2.5 * (1 - progress * 0.3);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffe060';
        ctx.strokeStyle = '#a0600a';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // Muzzle flash at origin — bigger and brighter
      if (progress < 0.5) {
        var flashAlpha = (1 - progress / 0.5) * 0.85;
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, CELL * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffa020';
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, CELL * 0.7, 0, Math.PI * 2);
        ctx.globalAlpha = flashAlpha * 0.4;
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // Sprite-based effects (explosions)
    var img = G.sprites.explosion;
    if (!img.complete || !img.naturalWidth) return;
    var w = CELL * effect.size;
    var h = w * (img.naturalHeight / img.naturalWidth);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(effect.x, effect.y);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  G.resetCounterStyle = function () {
    const el = document.getElementById('mineCounter');
    el.style.color = '#f00';
  };

  G.drawTransitBoard = function (transit) {
    var w = G.gameCanvas.width, h = G.gameCanvas.height;

    // Draw to offscreen buffers, then blit — prevents flicker
    var realGctx = G.gctx, realSctx = G.sctx;
    G.gctx = _gbctx;
    G.sctx = _sbctx;
    var ctx = G.gctx;
    ctx.clearRect(0, 0, w, h);
    G.sctx.clearRect(0, 0, w, h);

    // Draw dashed transit route line
    if (transit.path) {
      G.drawTransitRoute(transit.path, ctx);
    }

    // Draw ship — use shared interpolation helper
    var shipPx = 0, shipPy = 0;
    if (transit.shipPos !== null && transit.path) {
      var shipPos = G.getShipPixelPos(transit);
      shipPx = shipPos.x;
      shipPy = shipPos.y;

      if (!transit.dead) {
        G.drawShip(shipPx, shipPy, transit.shipAngle);
      }
    }

    // Draw missile trajectory indicators on sprite canvas
    var sctx = G.sctx;
    for (const m of transit.missiles) {
      // Target icon: two concentric circles + center dot
      sctx.save();
      sctx.strokeStyle = 'rgba(255, 40, 40, 0.7)';
      sctx.lineWidth = 1.5;
      sctx.beginPath();
      sctx.arc(m.targetX, m.targetY, 10, 0, Math.PI * 2);
      sctx.stroke();
      sctx.beginPath();
      sctx.arc(m.targetX, m.targetY, 5, 0, Math.PI * 2);
      sctx.stroke();
      sctx.fillStyle = 'rgba(255, 40, 40, 0.8)';
      sctx.beginPath();
      sctx.arc(m.targetX, m.targetY, 2, 0, Math.PI * 2);
      sctx.fill();
      sctx.lineWidth = 1;
      // Dotted line from missile to target
      sctx.strokeStyle = 'rgba(255, 40, 40, 0.4)';
      sctx.lineWidth = 1;
      sctx.setLineDash([4, 4]);
      sctx.beginPath();
      sctx.moveTo(m.x, m.y);
      sctx.lineTo(m.targetX, m.targetY);
      sctx.stroke();
      sctx.setLineDash([]);
      sctx.restore();
    }

    // --- Draw propulsion trails (behind sprites) ---
    var CELL = G.CELL;

    // Missile exhaust — flickering orange/yellow trail behind the missile
    var now = performance.now() * 0.006;
    for (const m of transit.missiles) {
      if (!m.trail || m.trail.length < 2) continue;
      for (var ti = 0; ti < m.trail.length - 1; ti++) {
        var t_pt = m.trail[ti];
        var frac = ti / m.trail.length; // 0 = oldest, 1 = newest
        var flicker = 0.7 + 0.3 * Math.sin(now + ti * 2.5);
        var r = CELL * 0.2 * (0.3 + 0.7 * frac) * flicker;
        sctx.globalAlpha = 0.5 * frac * flicker;
        // Vary color: yellow core near missile, orange/red further back
        var red = 255;
        var green = Math.round(100 + 155 * frac);
        var blue = frac > 0.7 ? Math.round(60 * (frac - 0.7) / 0.3) : 0;
        sctx.fillStyle = 'rgb(' + red + ',' + green + ',' + blue + ')';
        sctx.beginPath();
        sctx.arc(t_pt.x, t_pt.y, r, 0, Math.PI * 2);
        sctx.fill();
      }
    }
    sctx.globalAlpha = 1;

    // Shahed smoke — grey puffs, slightly larger
    for (const s of transit.shaheds) {
      if (!s.trail || s.trail.length < 2) continue;
      for (var ti = 0; ti < s.trail.length; ti++) {
        var t_pt = s.trail[ti];
        var frac = ti / s.trail.length;
        var r = CELL * 0.25 * (0.4 + 0.6 * frac);
        sctx.globalAlpha = 0.35 * frac;
        sctx.fillStyle = '#888';
        sctx.beginPath();
        sctx.arc(t_pt.x, t_pt.y, r, 0, Math.PI * 2);
        sctx.fill();
      }
    }
    sctx.globalAlpha = 1;

    // Draw missiles on top — angle from velocity, SVG faces up (-π/2)
    for (const m of transit.missiles) {
      var mAngle = Math.atan2(m.vy, m.vx) + Math.PI / 2;
      G.drawMissile(m.x, m.y, mAngle);
    }

    // Draw FPV drones — smaller, angle toward ship
    for (const f of transit.fpvs) {
      var fAngle = Math.atan2(shipPy - f.y, shipPx - f.x) + Math.PI / 2;
      G.drawFpv(f.x, f.y, fAngle);
    }

    // Draw shaheds on top — angle toward ship, SVG faces up (-π/2)
    for (const s of transit.shaheds) {
      var sAngle = Math.atan2(shipPy - s.y, shipPx - s.x) + Math.PI / 2;
      G.drawShahed(s.x, s.y, sAngle);
    }

    // Draw effects (explosions, splashes) on top of everything
    for (const e of transit.effects) {
      G.drawEffect(e);
    }

    // No HP bar — one-hit-kill model (1 HP)

    // Blit offscreen buffers to visible canvases in one operation
    G.gctx = realGctx;
    G.sctx = realSctx;
    G.gctx.clearRect(0, 0, w, h);
    G.gctx.drawImage(_gameBuffer, 0, 0);
    G.sctx.clearRect(0, 0, w, h);
    G.sctx.drawImage(_spriteBuffer, 0, 0);
  };
})();
