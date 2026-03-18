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
    var w = CELL * 2.2;
    var h = w * (img.naturalHeight / img.naturalWidth);
    drawSprite(img, mx, my, w, h, angle);
  };

  // Shahed sprite faces UP (nose at top = -π/2 direction).
  G.drawShahed = function (sx, sy, angle) {
    var CELL = G.CELL;
    var img = G.sprites.shahed;
    var w = CELL * 4;
    var h = w * (img.naturalHeight / img.naturalWidth);
    drawSprite(img, sx, sy, w, h, angle);
  };

  // FPV drone — smaller than shahed, uses fpv sprite (falls back to shahed sprite)
  G.drawFpv = function (fx, fy, angle) {
    var CELL = G.CELL;
    var img = G.sprites.fpv || G.sprites.shahed;
    var w = CELL * 2;
    var h = w * (img.naturalHeight / img.naturalWidth);
    drawSprite(img, fx, fy, w, h, angle);
  };

  // Effects (explosion, splash) — drawn without rotation, just centered
  G.drawEffect = function (effect) {
    var CELL = G.CELL;
    var img = effect.type === 'shahed_explode' ? G.sprites.shahedExploding
            : effect.type === 'missile_blast' ? G.sprites.explosion
            : G.sprites.missileOceanDrop;
    if (!img.complete || !img.naturalWidth) return;
    var w = CELL * effect.size;
    var h = w * (img.naturalHeight / img.naturalWidth);
    var alpha = effect.life / effect.maxLife; // fade out
    var ctx = G.sctx;
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

    // Subtle path highlight on clean ocean (no cell grid)
    if (transit.path) {
      ctx.fillStyle = 'rgba(80, 120, 180, 0.12)';
      for (const [r, c] of transit.path) {
        ctx.fillRect(c * G.CELL, r * G.CELL, G.CELL, G.CELL);
      }
    }

    // Draw ship — smooth position interpolation between path cells
    var shipPx = 0, shipPy = 0;
    if (transit.shipPos !== null && transit.path) {
      var curCell = transit.path[transit.shipPos];
      shipPx = curCell[1] * G.CELL + G.CELL / 2;
      shipPy = curCell[0] * G.CELL + G.CELL / 2;

      // Interpolate between path cells using moveAccum (-1..1)
      // Positive: lerp toward next cell; negative: lerp toward previous cell
      if (transit.moveAccum > 0) {
        var fwdIdx = Math.min(transit.shipPos + 1, transit.path.length - 1);
        if (fwdIdx !== transit.shipPos) {
          var fwdCell = transit.path[fwdIdx];
          shipPx += (fwdCell[1] * G.CELL + G.CELL / 2 - shipPx) * transit.moveAccum;
          shipPy += (fwdCell[0] * G.CELL + G.CELL / 2 - shipPy) * transit.moveAccum;
        }
      } else if (transit.moveAccum < 0) {
        var bwdIdx = Math.max(transit.shipPos - 1, 0);
        if (bwdIdx !== transit.shipPos) {
          var bwdCell = transit.path[bwdIdx];
          shipPx += (bwdCell[1] * G.CELL + G.CELL / 2 - shipPx) * (-transit.moveAccum);
          shipPy += (bwdCell[0] * G.CELL + G.CELL / 2 - shipPy) * (-transit.moveAccum);
        }
      }

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
