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
        ctx.font = 'bold 13px "Consolas", monospace';
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

  // Ship SVG faces LEFT. We mirror horizontally when facing right,
  // and apply a small tilt for vertical path movement.
  G.drawShip = function (px, py, tilt, facingRight) {
    var CELL = G.CELL;
    var w = CELL * 3, h = CELL * 1.4;
    var img = G.sprites.ship;
    var ctx = G.sctx;
    if (!img.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.translate(px, py);
    if (facingRight) ctx.scale(-1, 1);
    ctx.rotate(tilt);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  // Ship-struck SVG — broken tanker with fire, similar size to ship.
  G.drawShipStruck = function (px, py, tilt, facingRight) {
    var CELL = G.CELL;
    var w = CELL * 3.5, h = CELL * 1.8;
    var img = G.sprites.shipStruck;
    var ctx = G.sctx;
    if (!img.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.translate(px, py);
    if (facingRight) ctx.scale(-1, 1);
    ctx.rotate(tilt);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  // Missile SVG faces UP (nose at top = -π/2 direction).
  G.drawMissile = function (mx, my, angle) {
    var CELL = G.CELL;
    var w = CELL * 2.2, h = CELL * 2.8;
    drawSprite(G.sprites.missile, mx, my, w, h, angle);
  };

  // Shahed SVG faces UP (nose at top = -π/2 direction).
  G.drawShahed = function (sx, sy, angle) {
    var CELL = G.CELL;
    var w = CELL * 4, h = CELL * 3.5;
    drawSprite(G.sprites.shahed, sx, sy, w, h, angle);
  };

  // Effects (explosion, splash) — drawn without rotation, just centered
  G.drawEffect = function (effect) {
    var CELL = G.CELL;
    var size = CELL * effect.size;
    var img = effect.type === 'shahed_explode' ? G.sprites.shahedExploding
            : effect.type === 'missile_blast' ? G.sprites.missileBlast
            : G.sprites.missileOceanDrop;
    var alpha = effect.life / effect.maxLife; // fade out
    var ctx = G.sctx;
    if (!img.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(effect.x, effect.y);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  };

  G.resetCounterStyle = function () {
    const el = document.getElementById('mineCounter');
    el.style.color = '#f00';
  };

  G.drawTransitBoard = function (transit) {
    const ctx = G.gctx;
    ctx.clearRect(0, 0, G.gameCanvas.width, G.gameCanvas.height);
    G.sctx.clearRect(0, 0, G.spriteCanvas.width, G.spriteCanvas.height);

    // Subtle path highlight on clean ocean (no cell grid)
    if (transit.path) {
      ctx.fillStyle = 'rgba(80, 120, 180, 0.12)';
      for (const [r, c] of transit.path) {
        ctx.fillRect(c * G.CELL, r * G.CELL, G.CELL, G.CELL);
      }
    }

    // Draw ship — mirrored + tilted (skip if dead, struck sprite drawn separately)
    var shipPx = 0, shipPy = 0;
    if (transit.shipPos !== null && transit.path) {
      var sr = transit.path[transit.shipPos];
      shipPx = sr[1] * G.CELL + G.CELL / 2;
      shipPy = sr[0] * G.CELL + G.CELL / 2;
      if (!transit.dead) {
        G.drawShip(shipPx, shipPy, transit.shipTilt, transit.shipFacingRight);
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

    // Draw shaheds on top — angle toward ship, SVG faces up (-π/2)
    for (const s of transit.shaheds) {
      var sAngle = Math.atan2(shipPy - s.y, shipPx - s.x) + Math.PI / 2;
      G.drawShahed(s.x, s.y, sAngle);
    }

    // Draw effects (explosions, splashes) on top of everything
    for (const e of transit.effects) {
      G.drawEffect(e);
    }

  };
})();
