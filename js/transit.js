// Transit phase — ship movement, missiles, shaheds, collision detection
(function () {
  const G = window.Game;

  // Grace period: no attacks for the first N seconds of each transit leg
  var GRACE_PERIOD = 2;
  // Ramp: threat intensity increases over this many seconds after grace period ends
  var RAMP_DURATION = 12;
  // Minimum distance (in cells) between missile spawn and ship — prevents instant-hit missiles
  var MIN_MISSILE_SPAWN_DIST_CELLS = 25;
  // Turn-based difficulty scaling — Iran's mining and tech progress.
  // Threat progression: FPV drones from turn 0, shaheds unlock at turn 3, missiles at turn 5.
  // Each stat scales continuously with player turn count.
  G.getDifficulty = function (turn) {
    var t = Math.max(0, turn);
    return {
      mineRatio:    Math.min(0.30, 0.07 + t * 0.02),              // 0.07 → 0.30 over ~12 turns

      // Speeds are in cells/s — converted to px/s at use (multiply by G.CELL)
      // FPV drones — always available from turn 0
      hasFpv:       true,
      fpvRate:      Math.max(1.5,  (6.0 - t * 0.4)),             // 6.0s → 2.0s
      fpvSpeed:     Math.min(3.0,  1.5 + t * 0.15),               // 1.5 → 3.0 cells/s (slow, clickable)

      // Shaheds — unlock at turn 3 (require gunner / auto cannon)
      hasShaheds:   t >= 3,
      shahedRate:   Math.max(2.0,  (10.0 - t * 0.75)),           // 10.0s → 2.5s
      shahedSpeed:  3.25,                                          // cells/s constant

      // Missiles — unlock at turn 5 (dodge only, no click defense)
      hasMissiles:  t >= 5,
      missileRate:  Math.max(1.5,  (8.0 - t * 0.5)),             // 8.0s → 2.0s
      missileSpeed: Math.min(7.5,  3.5 + t * 0.4)                 // 3.5 → 7.5 cells/s
    };
  };

  // Transit state
  G.transit = {
    active: false,
    direction: 'forward',  // 'forward' or 'return'
    path: null,
    shipPos: 0,             // index into path
    shipSpeed: 0,           // current actual speed (smoothly interpolated)
    shipSpeedTarget: 0,     // target speed set by input (-1, 0, 1)
    missiles: [],
    shaheds: [],
    fpvs: [],               // FPV drones — slow, clickable (shotgun)
    missileTimer: 0,
    shahedTimer: 0,
    fpvTimer: 0,
    shahedKills: 0,
    fpvKills: 0,
    transitSeconds: 0,
    transitTimerInterval: null,
    animFrame: null,
    lastTime: 0,
    moveAccum: 0,           // accumulates fractional cell movement (0..1)
    shipAngle: 0,           // current smooth heading angle (radians)
    entryAngle: 0,          // fixed angle used while sailing in to the first cell
    effects: [],            // visual effects (explosions, splashes)
    landEdgeCells: null,
    config: null,
    elapsed: 0,             // seconds since transit leg started (for grace period)
    startDelay: 0           // short reveal delay before the ship begins moving
  };

  G.getTransitEntryOffsetCells = function () {
    return 0;
  };

  G.getTransitShipScale = function () {
    return 0.78;
  };

  function isPortVisibleOnCanvas(target, canvasW, canvasH) {
    if (!target) return false;
    return target.x >= -24 && target.x <= canvasW + 24 && target.y >= -24 && target.y <= canvasH + 24;
  }

  G.playShipExitFade = function (startPx, startPy, startAngle, onDone) {
    if (!G.sctx || !G.spriteCanvas || !G.drawShip) {
      if (onDone) onDone();
      return;
    }

    var duration = 420;
    var drift = 0;
    var startTime = performance.now();
    var routePath = G.transit && G.transit.path ? G.transit.path : null;

    function tick(now) {
      var t = Math.min(1, (now - startTime) / duration);
      var eased = 1 - Math.pow(1 - t, 2);
      var alpha = 1 - eased;
      var x = startPx + Math.cos(startAngle) * drift * eased;
      var y = startPy + Math.sin(startAngle) * drift * eased;

      if (G.gctx) {
        G.gctx.clearRect(0, 0, G.gameCanvas.width, G.gameCanvas.height);
        if (routePath && G.drawTransitRoute) {
          G.drawTransitRoute(routePath, G.gctx, 1, {
            strokeStyle: 'rgba(255, 255, 255, ' + (0.25 * alpha).toFixed(3) + ')'
          });
        }
      }
      G.sctx.clearRect(0, 0, G.spriteCanvas.width, G.spriteCanvas.height);
      G.drawShip(
        x,
        y,
        startAngle,
        G.getTransitShipScale ? G.getTransitShipScale() : 0.78,
        alpha
      );

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        if (G.gctx) G.gctx.clearRect(0, 0, G.gameCanvas.width, G.gameCanvas.height);
        G.sctx.clearRect(0, 0, G.spriteCanvas.width, G.spriteCanvas.height);
        if (onDone) onDone();
      }
    }

    requestAnimationFrame(tick);
  };

  G.getTransitDockAngle = function (direction) {
    var edges = G.getMinefieldEdges ? G.getMinefieldEdges(direction) : { entryCol: 0 };
    return edges.entryCol === G.cols - 1 ? Math.PI : 0;
  };

  G.getTransitEntryAngle = function (path) {
    if (!path || path.length < 2) return 0;
    return Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]);
  };

  G.getTransitTurnSampleSpan = function (ship) {
    var hullCells = G.getShipLengthCells ? G.getShipLengthCells(ship || G.activeShip) : 1.8;
    var speed = ship && typeof ship.speed === 'number'
      ? ship.speed
      : (G.activeShip && typeof G.activeShip.speed === 'number' ? G.activeShip.speed : 2.5);

    var hullFactor = Math.max(0, hullCells - 1.8);
    var speedNorm = Math.max(0, Math.min(1, (speed - 1.2) / (3.5 - 1.2)));

    return Math.min(0.72, 0.45 + hullFactor * 0.12 + speedNorm * 0.10);
  };

  function getSegmentAngle(path, fromIdx, toIdx) {
    if (!path || fromIdx < 0 || toIdx < 0 || fromIdx >= path.length || toIdx >= path.length || fromIdx === toIdx) {
      return null;
    }
    return Math.atan2(path[toIdx][0] - path[fromIdx][0], path[toIdx][1] - path[fromIdx][1]);
  }

  function getPointAlongTransitPath(path, param, entryAngle) {
    var lastIdx = path.length - 1;
    if (param <= 0) {
      var first = path[0];
      return {
        r: first[0] + Math.sin(entryAngle) * param,
        c: first[1] + Math.cos(entryAngle) * param
      };
    }
    if (param >= lastIdx) {
      var last = path[lastIdx];
      var exitAngle = getSegmentAngle(path, lastIdx - 1, lastIdx);
      return {
        r: last[0] + Math.sin(exitAngle) * (param - lastIdx),
        c: last[1] + Math.cos(exitAngle) * (param - lastIdx)
      };
    }

    var fromIdx = Math.floor(param);
    var toIdx = fromIdx + 1;
    var t = param - fromIdx;
    return {
      r: path[fromIdx][0] + (path[toIdx][0] - path[fromIdx][0]) * t,
      c: path[fromIdx][1] + (path[toIdx][1] - path[fromIdx][1]) * t
    };
  }

  // Sample the path slightly ahead and behind the current fractional position
  // to get a continuous tangent across corners.
  G.getTransitTravelAngle = function (path, shipPos, moveAccum, moveDir, entryAngle) {
    if (!path || path.length < 2) return entryAngle || 0;

    var lastIdx = path.length - 1;
    var dir = moveDir < 0 ? -1 : 1;
    var param = Math.max(0, Math.min(lastIdx, (shipPos || 0) + (moveAccum || 0)));
    var sampleSpan = G.getTransitTurnSampleSpan ? G.getTransitTurnSampleSpan() : 0.45;
    var backPoint = getPointAlongTransitPath(path, Math.max(-1, param - sampleSpan), entryAngle || 0);
    var frontPoint = getPointAlongTransitPath(path, Math.min(lastIdx + 1, param + sampleSpan), entryAngle || 0);
    var fromPoint = dir > 0 ? backPoint : frontPoint;
    var toPoint = dir > 0 ? frontPoint : backPoint;
    return Math.atan2(toPoint.r - fromPoint.r, toPoint.c - fromPoint.c);
  };

  // Compute a stable heading by averaging several upcoming path segments.
  // This smooths away short entry kinks without forcing diagonal headings
  // onto routes that are mostly vertical or horizontal.
  G.getTransitPathHeading = function (path, shipPos, moveDir) {
    if (!path || path.length < 2) return 0;

    var lastIdx = path.length - 1;
    var center = Math.max(0, Math.min(lastIdx, shipPos || 0));
    var dir = moveDir < 0 ? -1 : 1;
    var lookaheadSegments = 6;
    var dr = 0;
    var dc = 0;

    if (dir > 0) {
      var end = Math.min(lastIdx - 1, center + lookaheadSegments - 1);
      for (var i = center; i <= end; i++) {
        dr += path[i + 1][0] - path[i][0];
        dc += path[i + 1][1] - path[i][1];
      }
    } else {
      var start = Math.max(1, center - lookaheadSegments + 1);
      for (var j = center; j >= start; j--) {
        dr += path[j][0] - path[j - 1][0];
        dc += path[j][1] - path[j - 1][1];
      }
    }

    if (dr === 0 && dc === 0) {
      var fallbackFrom = dir > 0 ? Math.max(0, Math.min(lastIdx - 1, center)) : Math.max(1, center);
      var fallbackTo = dir > 0 ? fallbackFrom + 1 : fallbackFrom - 1;
      dr = path[fallbackTo][0] - path[fallbackFrom][0];
      dc = path[fallbackTo][1] - path[fallbackFrom][1];
    }

    return Math.atan2(dr, dc);
  };

  G.startTransit = function (direction) {
    const t = G.transit;
    const ms = G.ms;
    const ship = G.activeShip;
    // Build config: ship provides speed, turn count drives threat difficulty
    var diff = G.getDifficulty(G.player.turn);
    var cfg = {
      speed: ship.speed,
      // FPV drones (always available)
      hasFpv: diff.hasFpv,
      fpvRate: diff.fpvRate,
      fpvSpeed: diff.fpvSpeed,
      // Shaheds (turn-gated, require gunner)
      hasShaheds: diff.hasShaheds && G.hasCrewRole('Gunner'),
      shahedRate: diff.shahedRate,
      shahedSpeed: diff.shahedSpeed,
      // Missiles (turn-gated, dodge only)
      hasMissiles: diff.hasMissiles,
      missileRate: diff.missileRate,
      missileSpeed: diff.missileSpeed
    };
    t.config = cfg;

    // Find path through revealed cells
    const path = G.findRevealedPath(ms.revealed, direction);
    if (!path) {
      G.setStatus('No clear path found! Something went wrong.', 'lose-msg');
      return;
    }

    t.path = path;
    t.direction = direction;
    t.active = true;
    G.state = direction === 'forward' ? 'TRANSIT_FORWARD' : 'TRANSIT_RETURN';
    t.shipPos = 0;
    t.shipSpeed = 1; // start moving forward
    t.shipSpeedTarget = 1;
    t.missiles = [];
    t.shaheds = [];
    t.fpvs = [];
    t.effects = [];
    t.missileTimer = 0;
    t.shahedTimer = 0;
    t.fpvTimer = 0;
    t.moveAccum = 0;
    t.transitSeconds = 0;
    t.dead = false;
    t.entryOffset = G.getTransitEntryOffsetCells();
    t.sailingOff = false;
    t.sailOffAccum = 0;
    t.elapsed = 0;
    t.startDelay = 0.18;
    t.lastShotTime = -SHOTGUN_COOLDOWN; // allow immediate first shot

    t.entryAngle = G.getTransitDockAngle(direction);
    t.shipAngle = t.entryAngle;

    // Read HP from the correct voyage hull. Supplied contracts should not
    // inherit damage from a wrecked owned ship sitting in port.
    var ps = G.getActivePlayerShip();
    if (G.voyage && G.voyage.usesSuppliedShip) {
      t.hp = ship.hp;
      t.maxHp = ship.hp;
    } else {
      t.hp = ps ? ps.owned.hp : ship.hp;
      t.maxHp = ps ? ps.tierData.hp : ship.hp;
    }

    if (direction === 'forward') {
      t.shahedKills = 0;
      t.fpvKills = 0;
    }

    t.landEdgeCells = G.getLandEdgeCells();

    // Update UI
    G.setStatus(
      direction === 'forward'
        ? 'Transit: Navigate through the strait! Up/Down to control speed, Space to stop.'
        : 'Return trip: Get back safely! Difficulty increased.',
      ''
    );
    if (G.renderTacticalCrewBar) G.renderTacticalCrewBar();
    if (G.updateCrewActions) G.updateCrewActions();
    if (G.updateTransitButtons) G.updateTransitButtons();

    // Start transit timer
    clearInterval(t.transitTimerInterval);
    t.transitTimerInterval = setInterval(function () {
      t.transitSeconds++;
      document.getElementById('timer').textContent = String(Math.min(t.transitSeconds, 999)).padStart(3, '0');
    }, 1000);

    // Start game loop
    t.lastTime = performance.now();
    t.animFrame = requestAnimationFrame(G.transitLoop);

    if (G.devFlags && G.devFlags.skipTransit) {
      setTimeout(function () {
        G.devCompleteTransit();
      }, 0);
    }
  };

  G.devCompleteTransit = function () {
    var t = G.transit;
    if (!t || !t.active || !t.path || !t.path.length || t.dead) return false;
    t.startDelay = 0;
    t.entryOffset = 0;
    t.shipPos = t.path.length - 1;
    t.moveAccum = 0;
    if (t.path.length > 1) {
      t.shipAngle = G.getTransitPathHeading(t.path, Math.max(0, t.path.length - 2), 1);
    }
    G.onTransitComplete();
    return true;
  };

  G.transitLoop = function (now) {
    const t = G.transit;
    if (!t.active) return;

    const dt = (now - t.lastTime) / 1000; // seconds
    t.lastTime = now;

    // Cap dt to prevent huge jumps
    const clampedDt = Math.min(dt, 0.1);

    G.updateTransit(clampedDt);

    // Only draw if still active (death/completion draws its own final frame)
    if (t.active) {
      G.drawTransitBoard(t);
      t.animFrame = requestAnimationFrame(G.transitLoop);
    }
  };

  function spawnEffect(t, type, x, y, size, duration) {
    t.effects.push({ type: type, x: x, y: y, size: size, life: duration, maxLife: duration });
  }

  var SPEED_ACCEL = 3;  // how fast shipSpeed approaches target (units/s)

  // Shotgun constants (distances in cells, converted to px at use)
  var SHOTGUN_SPREAD = Math.PI / 12;   // ~15° half-angle (30° total cone)
  var SHOTGUN_RANGE_CELLS = 9.6;       // max range in cells
  var SHOTGUN_COOLDOWN = 1.5;          // seconds between shots
  var SHOTGUN_CLOSE_RANGE_CELLS = 3;   // close range for bonus damage
  G.transit.shotgunCooldown = SHOTGUN_COOLDOWN;

  // Interpolated ship pixel position — shared by collision, click handler, and renderer
  function getShipPixelPos(t) {
    var ox = G.gridOffsetX, oy = G.gridOffsetY;
    if (t.entryOffset > 0 && t.path && t.path.length) {
      var firstCell = t.path[0];
      var entryPx = ox + firstCell[1] * G.CELL + G.CELL / 2;
      var entryPy = oy + firstCell[0] * G.CELL + G.CELL / 2;
      var backDist = t.entryOffset * G.CELL;
      entryPx -= Math.cos(t.entryAngle) * backDist;
      entryPy -= Math.sin(t.entryAngle) * backDist;
      return { x: entryPx, y: entryPy };
    }

    if (t.sailingOff) {
      var lastIdx = t.path.length - 1;
      var lastCell = t.path[lastIdx];
      var px = ox + lastCell[1] * G.CELL + G.CELL / 2;
      var py = oy + lastCell[0] * G.CELL + G.CELL / 2;
      var offDist = (t.sailOffAccum || 0) * G.CELL;
      px += Math.cos(t.shipAngle) * offDist;
      py += Math.sin(t.shipAngle) * offDist;
      return { x: px, y: py };
    }

    var cell = t.path[t.shipPos];
    var px = ox + cell[1] * G.CELL + G.CELL / 2;
    var py = oy + cell[0] * G.CELL + G.CELL / 2;
    if (t.moveAccum > 0) {
      var fi = Math.min(t.shipPos + 1, t.path.length - 1);
      if (fi !== t.shipPos) {
        px += (ox + t.path[fi][1] * G.CELL + G.CELL / 2 - px) * t.moveAccum;
        py += (oy + t.path[fi][0] * G.CELL + G.CELL / 2 - py) * t.moveAccum;
      } else {
        px += Math.cos(t.shipAngle) * t.moveAccum * G.CELL;
        py += Math.sin(t.shipAngle) * t.moveAccum * G.CELL;
      }
    } else if (t.moveAccum < 0) {
      var bi = Math.max(t.shipPos - 1, 0);
      if (bi !== t.shipPos) {
        px += (ox + t.path[bi][1] * G.CELL + G.CELL / 2 - px) * (-t.moveAccum);
        py += (oy + t.path[bi][0] * G.CELL + G.CELL / 2 - py) * (-t.moveAccum);
      }
    }
    return { x: px, y: py };
  }
  G.getShipPixelPos = getShipPixelPos;

  G.updateTransit = function (dt) {
    const t = G.transit;
    const cfg = t.config;
    const returnMult = t.direction === 'return' ? 1.5 : 1.0;

    if (t.startDelay > 0) {
      t.startDelay = Math.max(0, t.startDelay - dt);
      if (G.updateCrewActions) G.updateCrewActions();
      return;
    }

    // Smooth speed: lerp toward target
    var speedDiff = t.shipSpeedTarget - t.shipSpeed;
    if (Math.abs(speedDiff) < 0.01) {
      t.shipSpeed = t.shipSpeedTarget;
    } else {
      t.shipSpeed += speedDiff * Math.min(1, dt * SPEED_ACCEL);
    }

    // Move ship — first finish the off-path sail-in, then advance along the route.
    if (Math.abs(t.shipSpeed) > 0.001) {
      var moveDelta = cfg.speed * t.shipSpeed * dt;
      if (t.entryOffset > 0 && moveDelta > 0) {
        var consumed = Math.min(t.entryOffset, moveDelta);
        t.entryOffset -= consumed;
        moveDelta -= consumed;
      }

      t.moveAccum += moveDelta;
      while (t.moveAccum >= 1) {
        t.moveAccum -= 1;
        t.shipPos++;
        if (t.shipPos >= t.path.length) {
          t.shipPos = t.path.length - 1;
          t.moveAccum = 0;
          G.onTransitComplete();
          return;
        }
      }
      if (t.shipPos === t.path.length - 1 && t.moveAccum > 0) {
        t.moveAccum = 0;
        G.onTransitComplete();
        return;
      }
      while (t.moveAccum <= -1) {
        t.moveAccum += 1;
        t.shipPos = Math.max(0, t.shipPos - 1);
      }
    }

    if (!t.sailingOff && t.path.length > 1) {
      if (t.entryOffset > 0) {
        t.shipAngle = t.entryAngle;
      } else {
        if (t.shipPos === 0 && t.moveAccum <= 0) {
          t.shipAngle = t.entryAngle;
        } else {
          t.shipAngle = G.getTransitTravelAngle(t.path, t.shipPos, t.moveAccum, 1, t.entryAngle);
        }
      }
    }

    // Track elapsed time for grace period and ramp
    t.elapsed += dt;
    if (G.updateCrewActions) G.updateCrewActions();

    // Interpolated ship position for threat spawning and collision.
    var shipPos = getShipPixelPos(t);
    var shipPx = shipPos.x, shipPy = shipPos.y;
    var hitRadius = G.CELL * 0.45;

    // Threat ramp: 0 during grace, ramps 0→1 over RAMP_DURATION after grace ends, then stays at 1
    var threatTime = Math.max(0, t.elapsed - GRACE_PERIOD);
    var ramp = Math.min(1, threatTime / RAMP_DURATION);
    // Ramp affects spawn rate: at ramp=0 rate is 3x slower, at ramp=1 rate is normal
    var rateMultiplier = 1 / (1 + 2 * (1 - ramp)); // 0.33 → 1.0

    // No new threats when sailing off-screen
    if (t.sailingOff) {
      // Still update existing projectiles below, but don't spawn new ones
    }

    // --- Spawn FPV drones (after grace period) ---
    if (cfg.hasFpv && !t.sailingOff) {
      t.fpvTimer += dt;
      var effectiveFpvRate = cfg.fpvRate / (returnMult * rateMultiplier);
      if (t.elapsed > GRACE_PERIOD && t.fpvTimer >= effectiveFpvRate) {
        t.fpvTimer = 0;
        // FPVs spawn from ahead of the ship (right side for forward, left for return)
        // or from above/below — close enough to see coming but not instant
        var canvasW = G.gameCanvas.width, canvasH = G.gameCanvas.height;
        var fpvSpawnX, fpvSpawnY;
        var side = Math.random();
        if (side < 0.5) {
          // Spawn ahead (right edge for forward, left edge for return)
          fpvSpawnX = t.direction === 'forward' ? canvasW : 0;
          fpvSpawnY = Math.random() * canvasH * 0.85;
        } else if (side < 0.75) {
          fpvSpawnX = Math.random() * canvasW;
          fpvSpawnY = 0;
        } else {
          fpvSpawnX = Math.random() * canvasW;
          fpvSpawnY = canvasH;
        }
        var fpvDx = fpvSpawnX - shipPx, fpvDy = fpvSpawnY - shipPy;
        var fpvMinDist = MIN_MISSILE_SPAWN_DIST_CELLS * G.CELL * 0.5;
        if (fpvDx * fpvDx + fpvDy * fpvDy >= fpvMinDist * fpvMinDist) {
          t.fpvs.push({ x: fpvSpawnX, y: fpvSpawnY, alive: true });
        }
      }
    }

    // --- Spawn missiles (after grace period, turn-gated) ---
    if (cfg.hasMissiles && !t.sailingOff) {
      t.missileTimer += dt;
      var effectiveMissileRate = cfg.missileRate / (returnMult * rateMultiplier);
      if (t.elapsed > GRACE_PERIOD && t.missileTimer >= effectiveMissileRate && t.landEdgeCells.length > 0) {
        t.missileTimer = 0;

        // Pick a spawn cell that's far enough from the ship
        var _ox = G.gridOffsetX, _oy = G.gridOffsetY;
        var shipPxSpawn = shipPx;
        var shipPySpawn = shipPy;
        var candidates = [];
        for (var ci = 0; ci < t.landEdgeCells.length; ci++) {
          var ec = t.landEdgeCells[ci];
          var ex = _ox + ec[1] * G.CELL + G.CELL / 2, ey = _oy + ec[0] * G.CELL + G.CELL / 2;
          var ed = (ex - shipPxSpawn) * (ex - shipPxSpawn) + (ey - shipPySpawn) * (ey - shipPySpawn);
          var minDist = MIN_MISSILE_SPAWN_DIST_CELLS * G.CELL;
          if (ed >= minDist * minDist) candidates.push(ec);
        }
        if (candidates.length === 0) {
          t.missileTimer = 0;
        } else {
          var spawn = candidates[Math.floor(Math.random() * candidates.length)];
          var sr = spawn[0], sc = spawn[1];
          var spawnX = _ox + sc * G.CELL + G.CELL / 2;
          var spawnY = _oy + sr * G.CELL + G.CELL / 2;
          var missileSpeed = cfg.missileSpeed * G.CELL * (0.4 + 0.6 * ramp);

          var curR = t.path[t.shipPos][0], curC = t.path[t.shipPos][1];
          var curX = _ox + curC * G.CELL + G.CELL / 2, curY = _oy + curR * G.CELL + G.CELL / 2;
          var roughDist = Math.sqrt((curX - spawnX) * (curX - spawnX) + (curY - spawnY) * (curY - spawnY));
          var flightTime = roughDist / missileSpeed;
          var leadCells = Math.round(cfg.speed * t.shipSpeed * flightTime);
          var leadIdx = Math.min(Math.max(0, t.shipPos + leadCells), t.path.length - 1);
          var tr = t.path[leadIdx][0], tc = t.path[leadIdx][1];
          var targetX = _ox + tc * G.CELL + G.CELL / 2;
          var targetY = _oy + tr * G.CELL + G.CELL / 2;

          var dx = targetX - spawnX;
          var dy = targetY - spawnY;
          var dist = Math.sqrt(dx * dx + dy * dy);

          var MIN_FLIGHT_TIME = 3.0;
          var shipSpeedPx = cfg.speed * G.CELL;
          var maxSpeed = Math.max(20, (dist / MIN_FLIGHT_TIME) - shipSpeedPx);
          if (missileSpeed > maxSpeed) missileSpeed = maxSpeed;
          t.missiles.push({
            x: spawnX, y: spawnY,
            vx: (dx / dist) * missileSpeed, vy: (dy / dist) * missileSpeed,
            targetX: targetX, targetY: targetY,
            trail: []
          });
          G.sounds.missileIncoming();
        }
      }
    }

    // --- Spawn shaheds (after grace period, turn-gated + requires gunner) ---
    if (cfg.hasShaheds && !t.sailingOff) {
      t.shahedTimer += dt;
      var effectiveShahedRate = cfg.shahedRate / ((t.direction === 'return' ? 1.3 : 1.0) * rateMultiplier);
      if (t.elapsed > GRACE_PERIOD && t.shahedTimer >= effectiveShahedRate) {
        t.shahedTimer = 0;
        var fromTop = Math.random() > 0.5;
        var sx = fromTop ? Math.random() * G.gameCanvas.width : G.gameCanvas.width;
        var sy = fromTop ? 0 : Math.random() * G.gameCanvas.height * 0.85;
        t.shaheds.push({ x: sx, y: sy, alive: true, trail: [], hp: 2 });
      }
    }

    for (var i = t.missiles.length - 1; i >= 0; i--) {
      var m = t.missiles[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > 12) m.trail.shift();

      // Check if missile reached or passed its target impact point
      // Dot product of velocity with (target - position): negative means overshot
      var toTargetX = m.targetX - m.x, toTargetY = m.targetY - m.y;
      var dot = toTargetX * m.vx + toTargetY * m.vy;
      if (dot <= 0) {
        // Missile has arrived at target — check if ship is at the impact point
        var mdx = shipPx - m.targetX, mdy = shipPy - m.targetY;
        if (mdx * mdx + mdy * mdy < hitRadius * hitRadius) {
          t.missiles.splice(i, 1);
          if (G.onShipHit(1, m.targetX, m.targetY)) return;
          continue;
        }
        spawnEffect(t, 'ocean_drop', m.targetX, m.targetY, 3, 0.8);
        G.sounds.missileImpact();
        t.missiles.splice(i, 1);
        continue;
      }
    }

    // Update FPV drones (move toward ship — slower than shaheds)
    var fpvSpeed = (cfg.fpvSpeed || 2) * G.CELL;
    for (var fi = t.fpvs.length - 1; fi >= 0; fi--) {
      var f = t.fpvs[fi];
      if (!f.alive) { t.fpvs.splice(fi, 1); continue; }
      var fdx = shipPx - f.x, fdy = shipPy - f.y;
      var fdist = Math.sqrt(fdx * fdx + fdy * fdy);
      if (fdist < hitRadius) {
        t.fpvs.splice(fi, 1);
        if (G.onShipHit(1, f.x, f.y)) return;
        continue;
      }
      f.x += (fdx / fdist) * fpvSpeed * dt;
      f.y += (fdy / fdist) * fpvSpeed * dt;
      if (!f.trail) f.trail = [];
      f.trail.push({ x: f.x, y: f.y });
      if (f.trail.length > 8) f.trail.shift();
    }

    // Update shaheds (move toward ship)
    var shahedSpeed = (cfg.shahedSpeed || 3.25) * G.CELL;
    for (var j = t.shaheds.length - 1; j >= 0; j--) {
      var s = t.shaheds[j];
      if (!s.alive) { t.shaheds.splice(j, 1); continue; }
      var sdx = shipPx - s.x, sdy = shipPy - s.y;
      var sdist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sdist < hitRadius) {
        t.shaheds.splice(j, 1);
        if (G.onShipHit(1, s.x, s.y)) return;
        continue;
      }
      s.x += (sdx / sdist) * shahedSpeed * dt;
      s.y += (sdy / sdist) * shahedSpeed * dt;
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 10) s.trail.shift();
    }

    // Update effects (tick lifetime, remove expired)
    for (var k = t.effects.length - 1; k >= 0; k--) {
      t.effects[k].life -= dt;
      if (t.effects[k].life <= 0) t.effects.splice(k, 1);
    }
  };

  // Handle ship taking damage. Returns true if ship is destroyed (caller should return).
  G.onShipHit = function (damage, hitX, hitY) {
    var t = G.transit;
    t.hp -= damage;
    G.sounds.missileImpact();
    spawnEffect(t, 'explosion', hitX, hitY, 3, 0.6);
    if (t.hp <= 0) {
      t.hp = 0;
      G.onTransitDeath();
      return true;
    }
    return false;
  };

  G.onTransitComplete = function () {
    const t = G.transit;
    var shipPos =
      t && t.path && t.path.length && t.shipPos !== null
        ? getShipPixelPos(t)
        : null;
    t.active = false;
    cancelAnimationFrame(t.animFrame);
    clearInterval(t.transitTimerInterval);
    G.syncTransitHpToActiveShip();

    G.sounds.transitComplete();
    // Advance to next voyage stage (auto-stages or next interactive phase)
    G.setStatus(
      t.direction === 'forward'
        ? 'Reached the other side!'
        : 'Made it back safely!',
      'win-msg'
    );
    var finishStage = function () {
      setTimeout(function () {
        G.advanceStage();
      }, 250);
    };
    if (shipPos && G.playShipExitFade) {
      G.playShipExitFade(shipPos.x, shipPos.y, t.shipAngle, finishStage);
    } else {
      finishStage();
    }
  };

  G.onTransitDeath = function () {
    const t = G.transit;
    t.active = false;
    t.dead = true;

    // Freeze the interpolated ship position at death
    var deathPos = getShipPixelPos(t);
    t.deathPx = deathPos.x;
    t.deathPy = deathPos.y;
    t.deathAngle = t.shipAngle;

    cancelAnimationFrame(t.animFrame);
    clearInterval(t.transitTimerInterval);
    document.getElementById('faceBtn').innerHTML = '&#128565;';
    G.setStatus('Ship destroyed! The mullahs win this round.', 'lose-msg');
    G.resetCounterStyle();
    G.state = 'GAMEOVER';
    G.sounds.shipDestroyed();

    G.drawTransitBoard(t);
    G.drawShipDeath(t.deathPx, t.deathPy, t.deathAngle);

    // Process destruction: remove ship, determine crew survival
    var result = G.processShipDestruction('transit');

    // Show shipwreck overlay after a brief delay so player sees the death animation
    setTimeout(function () {
      G.showShipwreckOverlay(result);
    }, 2000);
  };

  // Normalize angle to [-PI, PI]
  function normalizeAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  // Check if a point is inside the shotgun cone from origin toward shotAngle
  function inCone(ox, oy, shotAngle, tx, ty) {
    var dx = tx - ox, dy = ty - oy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > SHOTGUN_RANGE_CELLS * G.CELL) return false;
    var angleToTarget = Math.atan2(dy, dx);
    var diff = Math.abs(normalizeAngle(angleToTarget - shotAngle));
    return diff < SHOTGUN_SPREAD;
  }

  // Handle click during transit — shotgun fires from ship toward click point
  G.handleTransitClick = function (px, py) {
    const t = G.transit;
    if (!t.active) return false;

    // Cooldown check
    if (t.elapsed - t.lastShotTime < SHOTGUN_COOLDOWN) return false;
    t.lastShotTime = t.elapsed;
    if (G.updateCrewAction) G.updateCrewAction('Shotgunner');

    // Ship position
    var ship = getShipPixelPos(t);
    var shotAngle = Math.atan2(py - ship.y, px - ship.x);

    // Spawn visual effect
    spawnEffect(t, 'shotgun_blast', ship.x, ship.y, 1, 0.4);
    t.effects[t.effects.length - 1].angle = shotAngle;
    G.sounds.shahedDestroyed(); // reuse for now

    var hitSomething = false;

    // Check FPV drones (1 HP — any hit kills)
    for (var i = t.fpvs.length - 1; i >= 0; i--) {
      var f = t.fpvs[i];
      if (inCone(ship.x, ship.y, shotAngle, f.x, f.y)) {
        spawnEffect(t, 'shahed_explode', f.x, f.y, 2, 0.4);
        t.fpvs.splice(i, 1);
        t.fpvKills++;
        hitSomething = true;
      }
    }

    // Check shaheds (2 HP — close range deals 2 damage, far deals 1)
    for (var i = t.shaheds.length - 1; i >= 0; i--) {
      var s = t.shaheds[i];
      if (inCone(ship.x, ship.y, shotAngle, s.x, s.y)) {
        var dx = s.x - ship.x, dy = s.y - ship.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var dmg = dist < SHOTGUN_CLOSE_RANGE_CELLS * G.CELL ? 2 : 1;
        s.hp -= dmg;
        if (s.hp <= 0) {
          spawnEffect(t, 'shahed_explode', s.x, s.y, 3, 0.5);
          t.shaheds.splice(i, 1);
          t.shahedKills++;
        } else {
          // Hit but not dead — flash effect
          spawnEffect(t, 'explosion', s.x, s.y, 1.5, 0.2);
        }
        hitSomething = true;
      }
    }

    return hitSomething;
  };

  // Handle keyboard input during transit
  G.handleTransitKey = function (key) {
    const t = G.transit;
    if (!t.active) return;

    if (key === 'w' || key === 'W' || key === 'ArrowUp') {
      t.shipSpeedTarget = 1;
      G.setStatus('Full speed ahead! \u25b6\u25b6', '');
      G.sounds.speedChange();
    } else if (key === 's' || key === 'S' || key === 'ArrowDown') {
      t.shipSpeedTarget = -1;
      G.setStatus('Reversing! \u25c0\u25c0', '');
      G.sounds.speedChange();
    } else if (key === ' ') {
      t.shipSpeedTarget = 0;
      G.setStatus('All stop! \u23f8', '');
      G.sounds.speedChange();
    }
    // Update captain action text and transit buttons live
    if (G.updateCaptainAction) G.updateCaptainAction();
    if (G.updateCrewAction) G.updateCrewAction('Shotgunner');
    if (G.updateTransitButtons) G.updateTransitButtons();
  };
})();
