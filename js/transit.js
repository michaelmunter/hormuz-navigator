// Transit phase — ship movement, missiles, shaheds, collision detection
(function () {
  const G = window.Game;

  // Difficulty tables indexed by barrel count
  // missileRate/shahedRate = base interval in seconds (gets shorter as elapsed time ramps up)
  // missileSpeed = base missile speed in px/s (scales with ship speed for lead calculation)
  var BARREL_CONFIG = {
    10:  { mineRatio: 0.08, speed: 3.5, missileRate: 8.0, missileSpeed: 70,  shahedRate: 14.0, multiplier: 1 },
    25:  { mineRatio: 0.20, speed: 2.5, missileRate: 4.0, missileSpeed: 110, shahedRate: 6.0,  multiplier: 2.5 },
    50:  { mineRatio: 0.25, speed: 2.0, missileRate: 3.0, missileSpeed: 120, shahedRate: 4.0,  multiplier: 5 },
    100: { mineRatio: 0.30, speed: 1.5, missileRate: 2.5, missileSpeed: 140, shahedRate: 3.0,  multiplier: 10 }
  };

  // Grace period: no attacks for the first N seconds of each transit leg
  var GRACE_PERIOD = 5;
  // Ramp: threat intensity increases over this many seconds after grace period ends
  var RAMP_DURATION = 20;
  // Minimum distance (in pixels) between missile spawn and ship — prevents instant-hit missiles
  var MIN_MISSILE_SPAWN_DIST = 500;
  G.BARREL_CONFIG = BARREL_CONFIG;

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
    missileTimer: 0,
    shahedTimer: 0,
    shahedKills: 0,
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
    const cfg = BARREL_CONFIG[G.barrels];
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
    t.effects = [];
    t.missileTimer = 0;
    t.shahedTimer = 0;
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

    // Move ship
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
      // Clamp moveAccum to [0,1) range
      if (t.moveAccum < 0) t.moveAccum = 0;
    }

    // Update ship heading angle
    // Always compute from forward path direction (shipPos → shipPos+1).
    // When reversing, flip by π so the stern leads — the ship visually sails backward.
    var nextIdx = Math.min(t.shipPos + 1, t.path.length - 1);
    if (nextIdx !== t.shipPos) {
      var dr = t.path[nextIdx][0] - t.path[t.shipPos][0];
      var dc = t.path[nextIdx][1] - t.path[t.shipPos][1];
      var targetAngle = Math.atan2(dr, dc);

      // When reversing, flip 180° so stern faces the direction of travel
      if (t.shipSpeed < -0.01) {
        targetAngle += Math.PI;
      }

      // Smooth angle interpolation (handle wrapping)
      var angleDiff = targetAngle - t.shipAngle;
      // Normalize to [-π, π]
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

    // Spawn missiles (only after grace period)
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
      // If no cells are far enough, skip this spawn entirely — don't fire a point-blank missile
      if (candidates.length === 0) {
        t.missileTimer = 0;
      } else {

      var spawn = candidates[Math.floor(Math.random() * candidates.length)];
      var sr = spawn[0], sc = spawn[1];
      var spawnX = sc * G.CELL + G.CELL / 2;
      var spawnY = sr * G.CELL + G.CELL / 2;
      // Missile speed scales with ramp — starts at 40% speed, ramps to full
      var missileSpeed = cfg.missileSpeed * (0.4 + 0.6 * ramp);

      // Lead the target: estimate missile flight time, look ahead on ship path
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

      // Enforce minimum flight time — player always has at least 3s to react
      // Account for ship closing the gap: effective speed = missile + ship toward each other
      var MIN_FLIGHT_TIME = 3.0;
      var shipSpeedPx = cfg.speed * G.CELL; // ship speed in px/s
      var maxSpeed = Math.max(20, (dist / MIN_FLIGHT_TIME) - shipSpeedPx);
      if (missileSpeed > maxSpeed) missileSpeed = maxSpeed;
      t.missiles.push({
        x: spawnX,
        y: spawnY,
        vx: (dx / dist) * missileSpeed,
        vy: (dy / dist) * missileSpeed,
        targetX: targetX,
        targetY: targetY
      });
      G.sounds.missileIncoming();
      } // end else (candidates found)
    }

    // Spawn shaheds (only after grace period, with ramp)
    t.shahedTimer += dt;
    var effectiveShahedRate = cfg.shahedRate / ((t.direction === 'return' ? 1.3 : 1.0) * rateMultiplier);
    if (t.elapsed > GRACE_PERIOD && t.shahedTimer >= effectiveShahedRate) {
      t.shahedTimer = 0;
      var fromTop = Math.random() > 0.5;
      var sx = fromTop ? Math.random() * G.gameCanvas.width : G.gameCanvas.width;
      var sy = fromTop ? 0 : Math.random() * G.gameCanvas.height * 0.85;
      t.shaheds.push({ x: sx, y: sy, alive: true });
    }

    // Update missiles
    var shipPx = t.path[t.shipPos][1] * G.CELL + G.CELL / 2;
    var shipPy = t.path[t.shipPos][0] * G.CELL + G.CELL / 2;
    var hitRadius = G.CELL * 0.8;

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
          G.onTransitDeath();
          return;
        }
        spawnEffect(t, 'ocean_drop', m.targetX, m.targetY, 3, 0.8);
        G.sounds.missileImpact();
        t.missiles.splice(i, 1);
        continue;
      }
    }

    // Update shaheds (move toward ship)
    var shahedSpeed = 65;
    for (var j = t.shaheds.length - 1; j >= 0; j--) {
      var s = t.shaheds[j];
      if (!s.alive) { t.shaheds.splice(j, 1); continue; }
      var sdx = shipPx - s.x, sdy = shipPy - s.y;
      var sdist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sdist < hitRadius) {
        t.shaheds.splice(j, 1);
        G.onTransitDeath();
        return;
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
    cancelAnimationFrame(t.animFrame);
    clearInterval(t.transitTimerInterval);
    document.getElementById('faceBtn').innerHTML = '&#128565;';
    G.setStatus('Ship destroyed! The mullahs win this round.', 'lose-msg');
    G.resetCounterStyle();
    G.state = 'GAMEOVER';
    G.sounds.shipDestroyed();

    // Draw the struck/sinking ship at the last position
    var cell = t.path[t.shipPos];
    var px = cell[1] * G.CELL + G.CELL / 2;
    var py = cell[0] * G.CELL + G.CELL / 2;
    G.drawTransitBoard(t);
    G.drawShipDeath(px, py, t.shipAngle);

    G.player.inRun = false;
    G.savePlayer(); // ship destruction is permanent — run is over
  };

  // Handle click on shahed during transit
  G.handleTransitClick = function (px, py) {
    const t = G.transit;
    if (!t.active) return false;

    const clickRadius = G.CELL * 1.2;
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
