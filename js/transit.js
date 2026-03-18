// Transit phase — ship movement, missiles, shaheds, collision detection
(function () {
  const G = window.Game;

  // Grace period: no attacks for the first N seconds of each transit leg
  var GRACE_PERIOD = 2;
  // Ramp: threat intensity increases over this many seconds after grace period ends
  var RAMP_DURATION = 12;
  // Minimum distance (in pixels) between missile spawn and ship — prevents instant-hit missiles
  var MIN_MISSILE_SPAWN_DIST = 500;

  // Turn-based difficulty scaling — Iran's mining and tech progress.
  // Threat progression: FPV drones from turn 0, shaheds unlock at turn 3, missiles at turn 5.
  // Each stat scales continuously with player turn count.
  G.getDifficulty = function (turn) {
    var t = Math.max(0, turn);
    return {
      mineRatio:    Math.min(0.30, 0.08 + t * 0.022),            // 0.08 → 0.30 over ~10 turns

      // FPV drones — always available from turn 0
      hasFpv:       true,
      fpvRate:      Math.max(2.0,  6.0 - t * 0.4),               // 6.0s → 2.0s
      fpvSpeed:     Math.min(60,   30 + t * 3),                   // 30 → 60 px/s (slow, clickable)

      // Shaheds — unlock at turn 3 (require gunner / auto cannon)
      hasShaheds:   t >= 3,
      shahedRate:   Math.max(2.5,  10.0 - t * 0.75),             // 10.0s → 2.5s
      shahedSpeed:  65,                                            // constant

      // Missiles — unlock at turn 5 (dodge only, no click defense)
      hasMissiles:  t >= 5,
      missileRate:  Math.max(2.0,  8.0 - t * 0.5),               // 8.0s → 2.0s
      missileSpeed: Math.min(150,  70 + t * 8)                    // 70 → 150 px/s
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
    effects: [],            // visual effects (explosions, splashes)
    landEdgeCells: null,
    config: null,
    elapsed: 0              // seconds since transit leg started (for grace period)
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
      hasShaheds: diff.hasShaheds && ship.hasGunner,
      shahedRate: diff.shahedRate,
      shahedSpeed: diff.shahedSpeed,
      // Missiles (turn-gated, dodge only)
      hasMissiles: diff.hasMissiles,
      missileRate: diff.missileRate,
      missileSpeed: diff.missileSpeed
    };
    t.config = cfg;

    // Find path through revealed cells
    const path = G.findRevealedPath(ms.revealed);
    if (!path) {
      G.setStatus('No clear path found! Something went wrong.', 'lose-msg');
      return;
    }

    // Reverse path for return trip
    t.path = direction === 'return' ? path.slice().reverse() : path;
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
    t.elapsed = 0;

    // Determine initial heading angle from path direction
    if (t.path.length >= 2) {
      var dr = t.path[1][0] - t.path[0][0];
      var dc = t.path[1][1] - t.path[0][1];
      t.shipAngle = Math.atan2(dr, dc);
    } else {
      t.shipAngle = 0;
    }

    if (direction === 'forward') {
      t.shahedKills = 0;
      t.fpvKills = 0;
      t.hp = 1;
      t.maxHp = 1;
    }

    t.landEdgeCells = G.getLandEdgeCells();

    // Update UI
    G.setStatus(
      direction === 'forward'
        ? 'Transit: Navigate through the strait! Up/Down to control speed, Space to stop.'
        : 'Return trip: Get back safely! Difficulty increased.',
      ''
    );
    document.getElementById('faceBtn').innerHTML = '&#9875;'; // anchor

    // Start transit timer
    clearInterval(t.transitTimerInterval);
    t.transitTimerInterval = setInterval(function () {
      t.transitSeconds++;
      document.getElementById('timer').textContent = String(Math.min(t.transitSeconds, 999)).padStart(3, '0');
    }, 1000);

    // Start game loop
    t.lastTime = performance.now();
    t.animFrame = requestAnimationFrame(G.transitLoop);
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

  var SPEED_ACCEL = 3; // how fast shipSpeed approaches target (units/s)
  var ANGLE_LERP = 4;  // how fast shipAngle approaches target (radians/s factor)

  G.updateTransit = function (dt) {
    const t = G.transit;
    const cfg = t.config;
    const returnMult = t.direction === 'return' ? 1.5 : 1.0;

    // Smooth speed: lerp toward target
    var speedDiff = t.shipSpeedTarget - t.shipSpeed;
    if (Math.abs(speedDiff) < 0.01) {
      t.shipSpeed = t.shipSpeedTarget;
    } else {
      t.shipSpeed += speedDiff * Math.min(1, dt * SPEED_ACCEL);
    }

    // Move ship — moveAccum ranges (-1..1), crossing ±1 advances/retreats shipPos
    if (Math.abs(t.shipSpeed) > 0.001) {
      t.moveAccum += cfg.speed * t.shipSpeed * dt;
      while (t.moveAccum >= 1) {
        t.moveAccum -= 1;
        t.shipPos++;
        if (t.shipPos >= t.path.length) {
          G.onTransitComplete();
          return;
        }
      }
      while (t.moveAccum <= -1) {
        t.moveAccum += 1;
        t.shipPos = Math.max(0, t.shipPos - 1);
      }
    }

    // Update ship heading angle — always faces forward along the path segment
    // the ship is visually on. When moveAccum >= 0 the ship is between
    // shipPos and shipPos+1; when < 0 it's between shipPos-1 and shipPos.
    var fromIdx, toIdx;
    if (t.moveAccum >= 0) {
      fromIdx = t.shipPos;
      toIdx = Math.min(t.shipPos + 1, t.path.length - 1);
    } else {
      fromIdx = Math.max(t.shipPos - 1, 0);
      toIdx = t.shipPos;
    }
    if (fromIdx !== toIdx) {
      var dr = t.path[toIdx][0] - t.path[fromIdx][0];
      var dc = t.path[toIdx][1] - t.path[fromIdx][1];
      var targetAngle = Math.atan2(dr, dc);

      // Smooth angle interpolation (handle wrapping)
      var angleDiff = targetAngle - t.shipAngle;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      t.shipAngle += angleDiff * Math.min(1, dt * ANGLE_LERP);
    }

    // Track elapsed time for grace period and ramp
    t.elapsed += dt;

    // Threat ramp: 0 during grace, ramps 0→1 over RAMP_DURATION after grace ends, then stays at 1
    var threatTime = Math.max(0, t.elapsed - GRACE_PERIOD);
    var ramp = Math.min(1, threatTime / RAMP_DURATION);
    // Ramp affects spawn rate: at ramp=0 rate is 3x slower, at ramp=1 rate is normal
    var rateMultiplier = 1 / (1 + 2 * (1 - ramp)); // 0.33 → 1.0

    // --- Spawn FPV drones (after grace period) ---
    if (cfg.hasFpv) {
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
        t.fpvs.push({ x: fpvSpawnX, y: fpvSpawnY, alive: true });
      }
    }

    // --- Spawn missiles (after grace period, turn-gated) ---
    if (cfg.hasMissiles) {
      t.missileTimer += dt;
      var effectiveMissileRate = cfg.missileRate / (returnMult * rateMultiplier);
      if (t.elapsed > GRACE_PERIOD && t.missileTimer >= effectiveMissileRate && t.landEdgeCells.length > 0) {
        t.missileTimer = 0;

        // Pick a spawn cell that's far enough from the ship
        var shipPxSpawn = t.path[t.shipPos][1] * G.CELL + G.CELL / 2;
        var shipPySpawn = t.path[t.shipPos][0] * G.CELL + G.CELL / 2;
        var candidates = [];
        for (var ci = 0; ci < t.landEdgeCells.length; ci++) {
          var ec = t.landEdgeCells[ci];
          var ex = ec[1] * G.CELL + G.CELL / 2, ey = ec[0] * G.CELL + G.CELL / 2;
          var ed = (ex - shipPxSpawn) * (ex - shipPxSpawn) + (ey - shipPySpawn) * (ey - shipPySpawn);
          if (ed >= MIN_MISSILE_SPAWN_DIST * MIN_MISSILE_SPAWN_DIST) candidates.push(ec);
        }
        if (candidates.length === 0) {
          t.missileTimer = 0;
        } else {
          var spawn = candidates[Math.floor(Math.random() * candidates.length)];
          var sr = spawn[0], sc = spawn[1];
          var spawnX = sc * G.CELL + G.CELL / 2;
          var spawnY = sr * G.CELL + G.CELL / 2;
          var missileSpeed = cfg.missileSpeed * (0.4 + 0.6 * ramp);

          var curR = t.path[t.shipPos][0], curC = t.path[t.shipPos][1];
          var curX = curC * G.CELL + G.CELL / 2, curY = curR * G.CELL + G.CELL / 2;
          var roughDist = Math.sqrt((curX - spawnX) * (curX - spawnX) + (curY - spawnY) * (curY - spawnY));
          var flightTime = roughDist / missileSpeed;
          var leadCells = Math.round(cfg.speed * t.shipSpeed * flightTime);
          var leadIdx = Math.min(Math.max(0, t.shipPos + leadCells), t.path.length - 1);
          var tr = t.path[leadIdx][0], tc = t.path[leadIdx][1];
          var targetX = tc * G.CELL + G.CELL / 2;
          var targetY = tr * G.CELL + G.CELL / 2;

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
            targetX: targetX, targetY: targetY
          });
          G.sounds.missileIncoming();
        }
      }
    }

    // --- Spawn shaheds (after grace period, turn-gated + requires gunner) ---
    if (cfg.hasShaheds) {
      t.shahedTimer += dt;
      var effectiveShahedRate = cfg.shahedRate / ((t.direction === 'return' ? 1.3 : 1.0) * rateMultiplier);
      if (t.elapsed > GRACE_PERIOD && t.shahedTimer >= effectiveShahedRate) {
        t.shahedTimer = 0;
        var fromTop = Math.random() > 0.5;
        var sx = fromTop ? Math.random() * G.gameCanvas.width : G.gameCanvas.width;
        var sy = fromTop ? 0 : Math.random() * G.gameCanvas.height * 0.85;
        t.shaheds.push({ x: sx, y: sy, alive: true });
      }
    }

    // Interpolated ship position for collision (matches visual position)
    var shipPx = t.path[t.shipPos][1] * G.CELL + G.CELL / 2;
    var shipPy = t.path[t.shipPos][0] * G.CELL + G.CELL / 2;
    if (t.moveAccum > 0) {
      var fi = Math.min(t.shipPos + 1, t.path.length - 1);
      if (fi !== t.shipPos) {
        shipPx += (t.path[fi][1] * G.CELL + G.CELL / 2 - shipPx) * t.moveAccum;
        shipPy += (t.path[fi][0] * G.CELL + G.CELL / 2 - shipPy) * t.moveAccum;
      }
    } else if (t.moveAccum < 0) {
      var bi = Math.max(t.shipPos - 1, 0);
      if (bi !== t.shipPos) {
        shipPx += (t.path[bi][1] * G.CELL + G.CELL / 2 - shipPx) * (-t.moveAccum);
        shipPy += (t.path[bi][0] * G.CELL + G.CELL / 2 - shipPy) * (-t.moveAccum);
      }
    }
    var hitRadius = G.CELL * 0.45;

    for (var i = t.missiles.length - 1; i >= 0; i--) {
      var m = t.missiles[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;

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
    var fpvSpeed = cfg.fpvSpeed || 40;
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
    }

    // Update shaheds (move toward ship)
    var shahedSpeed = cfg.shahedSpeed || 65;
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
    t.active = false;
    cancelAnimationFrame(t.animFrame);
    clearInterval(t.transitTimerInterval);

    G.sounds.transitComplete();
    if (t.direction === 'forward') {
      G.setStatus('Reached the other side! Preparing return trip...', 'win-msg');
      // Brief pause then start return trip
      setTimeout(function () {
        G.startTransit('return');
      }, 1500);
    } else {
      // Both legs complete — show score
      G.showScore();
    }
  };

  G.onTransitDeath = function () {
    const t = G.transit;
    t.active = false;
    t.dead = true;

    // Freeze the interpolated ship position at death
    var cell = t.path[t.shipPos];
    var px = cell[1] * G.CELL + G.CELL / 2;
    var py = cell[0] * G.CELL + G.CELL / 2;
    if (t.moveAccum > 0) {
      var fwdIdx = Math.min(t.shipPos + 1, t.path.length - 1);
      if (fwdIdx !== t.shipPos) {
        var fwd = t.path[fwdIdx];
        px += (fwd[1] * G.CELL + G.CELL / 2 - px) * t.moveAccum;
        py += (fwd[0] * G.CELL + G.CELL / 2 - py) * t.moveAccum;
      }
    } else if (t.moveAccum < 0) {
      var bwdIdx = Math.max(t.shipPos - 1, 0);
      if (bwdIdx !== t.shipPos) {
        var bwd = t.path[bwdIdx];
        px += (bwd[1] * G.CELL + G.CELL / 2 - px) * (-t.moveAccum);
        py += (bwd[0] * G.CELL + G.CELL / 2 - py) * (-t.moveAccum);
      }
    }
    t.deathPx = px;
    t.deathPy = py;
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

    G.player.inRun = false;
    G.player.ship = null; // ship lost
    G.savePlayer(); // ship destruction is permanent — run is over
  };

  // Handle click during transit — shotgun targets FPV drones, auto cannon targets shaheds
  G.handleTransitClick = function (px, py) {
    const t = G.transit;
    if (!t.active) return false;

    const clickRadius = G.CELL * 1.2;

    // Check FPV drones first (shotgun — always available)
    for (let i = t.fpvs.length - 1; i >= 0; i--) {
      const f = t.fpvs[i];
      const dx = px - f.x, dy = py - f.y;
      if (dx * dx + dy * dy < clickRadius * clickRadius) {
        spawnEffect(t, 'shahed_explode', f.x, f.y, 2, 0.4);
        t.fpvs.splice(i, 1);
        t.fpvKills++;
        G.sounds.shahedDestroyed();
        return true;
      }
    }

    // Check shaheds (auto cannon — only if ship has gunner)
    if (G.activeShip && G.activeShip.hasGunner) {
      for (let i = t.shaheds.length - 1; i >= 0; i--) {
        const s = t.shaheds[i];
        const dx = px - s.x, dy = py - s.y;
        if (dx * dx + dy * dy < clickRadius * clickRadius) {
          spawnEffect(t, 'shahed_explode', s.x, s.y, 3, 0.5);
          t.shaheds.splice(i, 1);
          t.shahedKills++;
          G.sounds.shahedDestroyed();
          return true;
        }
      }
    }

    return false;
  };

  // Handle keyboard input during transit
  G.handleTransitKey = function (key) {
    const t = G.transit;
    if (!t.active) return;

    if (key === 'ArrowUp') {
      t.shipSpeedTarget = 1;
      G.setStatus('Full speed ahead! \u25b6\u25b6', '');
      G.sounds.speedChange();
    } else if (key === 'ArrowDown') {
      t.shipSpeedTarget = -1;
      G.setStatus('Reversing! \u25c0\u25c0', '');
      G.sounds.speedChange();
    } else if (key === ' ') {
      t.shipSpeedTarget = 0;
      G.setStatus('All stop! \u23f8', '');
      G.sounds.speedChange();
    }
  };
})();
