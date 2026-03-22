// Game state machine, initialization, scoring, phase transitions
(function () {
  const G = window.Game;

  // Game states: MENU, AUTO_STAGE, MINESWEEPER, TRANSIT_FORWARD, TRANSIT_RETURN, SCORE, GAMEOVER
  G.state = 'MENU';
  G.activeShip = null; // current ship tier object for active run
  G.cumulativeScore = 0;
  G.roundScore = 0;

  // --- Player state & persistence ---
  var SAVE_KEY = 'hormuz_save';
  var SAVE_VERSION = 4;
  var STARTING_BANK = 1000000; // $1M — Rustbucket is free starter ship

  G.player = null;

  G.createFreshPlayer = function () {
    return {
      bank: STARTING_BANK,
      crew: [],
      ownedShips: [{ tier: 1, hp: 1 }], // start with The Rustbucket
      activeShipIdx: 0,                  // index into ownedShips
      turn: 0,
      equipment: [],
      inRun: false,
      totalCrewDeaths: 0
    };
  };

  // Convenience: get active ship data (tier object + current HP)
  G.getActivePlayerShip = function () {
    if (!G.player || !G.player.ownedShips || G.player.ownedShips.length === 0) return null;
    var owned = G.player.ownedShips[G.player.activeShipIdx];
    if (!owned) return null;
    var tierData = G.getShipTier(owned.tier);
    return { tierData: tierData, hp: owned.hp, maxHp: tierData.hp, owned: owned };
  };

  G.savePlayer = function () {
    try {
      var payload = { version: SAVE_VERSION, player: G.player };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (e) { /* localStorage unavailable or full */ }
  };

  G.loadPlayer = function () {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { G.player = G.createFreshPlayer(); return; }
      var data = JSON.parse(raw);
      if (!data || !data.player) { G.player = G.createFreshPlayer(); return; }
      if (data.version < SAVE_VERSION) {
        data = G.migrateSave(data);
      }
      G.player = data.player;
    } catch (e) {
      G.player = G.createFreshPlayer();
    }
  };

  G.migrateSave = function (data) {
    if (data.version < 2) {
      data.player.ship = null;
      data.version = 2;
    }
    if (data.version < 3) {
      var tier = data.player.ship || 1;
      data.player.ownedShips = [{ tier: tier, hp: 1 }];
      data.player.activeShipIdx = 0;
      delete data.player.ship;
      data.version = 3;
    }
    if (data.version < 4) {
      data.player.totalCrewDeaths = data.player.totalCrewDeaths || 0;
      for (var i = 0; i < data.player.ownedShips.length; i++) {
        var s = data.player.ownedShips[i];
        var td = G.getShipTier(s.tier);
        if (td && s.hp === 1) s.hp = td.hp;
      }
      data.version = 4;
    }
    return data;
  };

  G.deleteSave = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  };

  G.formatMoney = function (amount) {
    return '$' + amount.toLocaleString();
  };

  G.setStatus = function (text, className) {
    var el = document.getElementById('statusBar');
    el.textContent = text;
    el.className = 'status-bar' + (className ? ' ' + className : '');
  };

  // Wait for both map images to load before init
  var imgLoaded = 0;
  function onMapImgLoad() {
    imgLoaded++;
    if (imgLoaded === 2) {
      G.initCanvases();
      G.initInput();
      G.loadPlayer();
      G.initBoard(G.player.turn);
      G.cumulativeScore = G.player.bank;

      if (G.player.inRun) {
        G.player.inRun = false;
        G.savePlayer();
      }

      if (G.player.bank !== STARTING_BANK || G.player.turn > 0) {
        G.showReturningMenu();
      } else {
        G.showMenu();
      }
    }
  }
  G.oceanImg.onload = onMapImgLoad;
  G.landImg.onload = onMapImgLoad;
  G.oceanImg.src = 'hormuz-ocean.png';
  G.landImg.src = 'hormuz-land.png';

  // Load PNG sprites
  var spriteSrcs = {
    ship: 'sprites/ships/ship-1.png',
    shahed: 'sprites/shahed.png',
    fpv: 'sprites/fpv.png',
    missile: 'sprites/missile.png',
    explosion: 'sprites/explosion.png',
    missileOceanDrop: 'sprites/missile_oceandrop.png'
  };
  Object.keys(spriteSrcs).forEach(function (name) {
    G.sprites[name].src = spriteSrcs[name];
  });

  G.initBoard = function (turn) {
    var barHeight = 56;
    var maxW = window.innerWidth;
    var maxH = window.innerHeight - barHeight;

    var grid = G.getGridSize(turn);
    G.cols = grid.cols;
    G.rows = grid.rows;

    var cellW = Math.floor(maxW / G.cols);
    var cellH = Math.floor(maxH / G.rows);
    G.CELL = Math.max(16, Math.min(38, Math.min(cellW, cellH)));

    var canvasW = G.cols * G.CELL;
    var canvasH = G.rows * G.CELL;

    G.sizeCanvases(canvasW, canvasH);
    G.buildOceanMask(canvasW, canvasH);
    G.drawLayers(canvasW, canvasH);
  };

  // ──────────────────────────────────────────────────────────
  //  VOYAGE STAGE SYSTEM
  // ──────────────────────────────────────────────────────────

  // Stage definitions — {port} replaced with random delivery port
  var STAGE_DEFS = [
    { id: 'sailing_out',   label: 'Sailing to Hormuz',  auto: 2500 },
    { id: 'mines_fwd',     label: 'Clearing mines' },
    { id: 'transit_fwd',   label: 'Running the strait' },
    { id: 'sailing_to',    label: 'Sailing to {port}',  auto: 2000 },
    { id: 'manage_port',   label: 'In port at {port}' },
    { id: 'sailing_back',  label: 'Sailing back',       auto: 2000 },
    { id: 'mines_ret',     label: 'Clearing mines' },
    { id: 'transit_ret',   label: 'Running the strait' },
    { id: 'arriving',      label: 'Arriving home',      auto: 2000 }
  ];

  G.voyage = {
    stageIdx: -1,
    port: '',
    stages: [],
    timer: null,
    cargoLoaded: false,   // true after loading stage
    oilPct: 0             // 0-100 for oil bar animation
  };

  function buildVoyageStages(port) {
    return STAGE_DEFS.map(function (def) {
      return {
        id: def.id,
        label: def.label.replace('{port}', port),
        auto: def.auto || 0
      };
    });
  }

  // Stage trail — now rendered via map stage card instead of top bar
  G.renderStageTrail = function () {
    // No-op; stage info is shown in the map overlay card
  };

  // Animate oil bar from startPct to endPct over duration ms
  function _animateOil(startPct, endPct, duration, onDone) {
    var startTime = performance.now();
    function tick(now) {
      var elapsed = now - startTime;
      var t = Math.min(1, elapsed / duration);
      // Ease out
      t = 1 - Math.pow(1 - t, 2);
      G.voyage.oilPct = startPct + (endPct - startPct) * t;
      _updateOilBar();
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        G.voyage.oilPct = endPct;
        _updateOilBar();
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(tick);
  }

  function _updateOilBar() {
    var fill = document.querySelector('.ship-oil-fill');
    if (fill) fill.style.width = Math.round(G.voyage.oilPct) + '%';
  }

  // Start a new voyage or continue from management stage
  G.startVoyage = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip) return;
    var ship = playerShip.tierData;

    G.activeShip = ship;

    // Switch to gameplay bar mode
    G.updateBarMode('gameplay');

    // Load ship sprite
    G.sprites.ship.src = ship.sprite;

    // Pick random delivery port
    G.voyage.port = G.getRandomPort();
    G.voyage.stages = buildVoyageStages(G.voyage.port);
    G.voyage.stageIdx = -1; // will be incremented by advanceStage

    // Init board
    G.initBoard(G.player.turn);

    G.player.inRun = true;
    G.savePlayer();

    // Advance to first stage (loading cargo)
    G.advanceStage();
  };

  // Advance to the next voyage stage
  G.advanceStage = function () {
    var v = G.voyage;
    if (v.timer) { clearTimeout(v.timer); v.timer = null; }

    v.stageIdx++;

    // Voyage complete — award cargo and start next loop
    if (v.stageIdx >= v.stages.length) {
      G.completeVoyage();
      return;
    }

    var stage = v.stages[v.stageIdx];

    if (stage.auto) {
      // Auto-advance after delay
      G.state = 'AUTO_STAGE';
      G.updateBarMode('auto');
      G.renderTacticalCrewBar();
      if (G.renderShipButton) G.renderShipButton();
      G.updateMapStageCard();
      v.timer = setTimeout(function () {
        G.advanceStage();
      }, stage.auto);
    } else {
      // Interactive stage
      switch (stage.id) {
        case 'mines_fwd':
          G.updateBarMode('gameplay');
          G.initBoard(G.player.turn);
          G.state = 'MINESWEEPER';
          var diff = G.getDifficulty(G.player.turn);
          G.initMinesweeper(diff.mineRatio);
          G.renderTacticalCrewBar();
          G.updateMapStageCard();
          break;

        case 'transit_fwd':
          G.updateBarMode('gameplay');
          G.startTransit('forward');
          G.updateMapStageCard();
          break;

        case 'mines_ret':
          G.updateBarMode('gameplay');
          // Fresh minefield for return trip
          G.initBoard(G.player.turn);
          G.state = 'MINESWEEPER';
          var diffRet = G.getDifficulty(G.player.turn);
          G.initMinesweeper(diffRet.mineRatio);
          G.renderTacticalCrewBar();
          G.updateMapStageCard();
          break;

        case 'transit_ret':
          G.updateBarMode('gameplay');
          G.startTransit('return');
          G.updateMapStageCard();
          break;

        case 'manage_port':
          // Show port card with "Sell & Return" button
          G.state = 'MENU';
          G.updateBarMode('menu');
          G.voyage.oilPct = 100;
          G.voyage.selling = false;
          G.roundScore = G.activeShip ? G.activeShip.cargoValue : 0;
          G.renderTacticalCrewBar();
          G.updateMapStageCard();
          break;
      }
    }
  };

  // ──────────────────────────────────────────────────────────
  //  SELL CARGO IN CHUNKS (used in manage_port)
  // ──────────────────────────────────────────────────────────
  function _sellCargoChunks(onDone) {
    var v = G.voyage;
    var chunks = 5;
    var totalValue = G.roundScore;
    var chunkValue = Math.floor(totalValue / chunks);
    var chunkIdx = 0;
    function tick() {
      chunkIdx++;
      var earned = (chunkIdx === chunks) ? totalValue - chunkValue * (chunks - 1) : chunkValue;
      G.player.bank += earned;
      G.voyage.oilPct = 100 - (chunkIdx / chunks) * 100;
      _updateOilBar();
      G.sounds.cargoSell();
      document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
      G.updateMapStageCard();
      if (chunkIdx < chunks) {
        v.timer = setTimeout(tick, 350);
      } else {
        G.voyage.cargoLoaded = false;
        G.voyage.oilPct = 0;
        G.savePlayer();
        if (G.renderShipButton) G.renderShipButton();
        v.timer = setTimeout(onDone, 600);
      }
    }
    v.timer = setTimeout(tick, 400);
  }

  // ──────────────────────────────────────────────────────────
  //  CARGO LOADING IN DOCK (called from Set Sail button)
  // ──────────────────────────────────────────────────────────
  function _loadCargoAndSail() {
    // Disable button while loading — preserve width
    var btn = document.querySelector('.stage-sail-btn');
    if (btn) {
      btn.style.minWidth = btn.offsetWidth + 'px';
      btn.classList.add('loading');
      btn.textContent = 'Loading…';
    }
    G.voyage.oilPct = 0;
    G.voyage.cargoLoaded = false;
    _animateOil(0, 100, 1200, function () {
      G.voyage.cargoLoaded = true;
      G.sounds.cargoLoad();
      if (G.renderShipButton) G.renderShipButton();
      // Now actually start the voyage
      G.startVoyage();
    });
  }

  window.loadCargoAndSail = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip || playerShip.hp <= 0) return;
    if (!G.hasCrewRole('Captain')) return;
    _loadCargoAndSail();
  };

  window.sellAndReturn = function () {
    var v = G.voyage;
    if (!v.stages || v.stages[v.stageIdx].id !== 'manage_port') return;

    // Disable button while selling
    var btn = document.querySelector('.stage-sail-btn');
    if (btn) {
      btn.style.minWidth = btn.offsetWidth + 'px';
      btn.classList.add('loading');
      btn.textContent = 'Selling…';
    }

    v.selling = true;
    G.state = 'AUTO_STAGE';
    G.updateBarMode('auto');
    G.renderTacticalCrewBar();
    _sellCargoChunks(function () {
      v.selling = 'done';
      G.updateMapStageCard();
      // Auto-advance after brief pause
      v.timer = setTimeout(function () {
        G.advanceStage();
      }, 1200);
    });
  };

  // ──────────────────────────────────────────────────────────
  //  CROSSFADE — capture current board, swap content, fade old out
  // ──────────────────────────────────────────────────────────
  G.crossfadeToNextStage = function () {
    var wrap = document.getElementById('boardWrap');
    if (!wrap) { G.advanceStage(); return; }

    // Capture ALL canvas layers as a composite overlay
    var canvases = wrap.querySelectorAll('canvas');
    if (!canvases.length) { G.advanceStage(); return; }

    // Create a composite canvas matching wrap size
    var compCanvas = document.createElement('canvas');
    var rect = wrap.getBoundingClientRect();
    compCanvas.width = rect.width;
    compCanvas.height = rect.height;
    var compCtx = compCanvas.getContext('2d');

    // Draw each canvas layer in order (z-index order = DOM order)
    for (var ci = 0; ci < canvases.length; ci++) {
      var c = canvases[ci];
      if (c.width > 0 && c.height > 0) {
        compCtx.drawImage(c, 0, 0, rect.width, rect.height);
      }
    }

    // Create overlay using the composite as a data URL on a canvas element
    var overlay = document.createElement('canvas');
    overlay.className = 'board-crossfade';
    overlay.width = compCanvas.width;
    overlay.height = compCanvas.height;
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    var ovCtx = overlay.getContext('2d');
    ovCtx.drawImage(compCanvas, 0, 0);
    wrap.appendChild(overlay);

    // Force layout — ensure overlay is painted before swapping content
    overlay.offsetHeight;

    // Start the new stage underneath
    G.advanceStage();

    // Trigger the fade on next frame
    requestAnimationFrame(function () {
      overlay.classList.add('fading');
      overlay.addEventListener('transitionend', function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      });
      // Fallback cleanup
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 1200);
    });
  };

  // ──────────────────────────────────────────────────────────
  //  SHIP DESTRUCTION & SHIPWRECK
  // ──────────────────────────────────────────────────────────

  var SURVIVOR_STORIES = [
    '{name} tamed a shark and rode it back to port.',
    '{name} floated on a barrel of crude for three days.',
    '{name} was rescued by a passing fishing boat.',
    '{name} swam 12 miles to shore and hitched a ride.',
    '{name} held onto a refrigerator door. Don\'t ask.',
    '{name} was found clinging to the ship\'s flag.',
    '{name} fashioned a raft from debris and sailed home.',
    '{name} was plucked from the water by a helicopter.',
    '{name} washed ashore on Qeshm Island and bribed a fisherman.',
    '{name} doggy-paddled for 6 hours straight.'
  ];

  var DEATH_STORIES = [
    '{name} went down with the ship.',
    '{name} was never found.',
    '{name} didn\'t make it.',
    'No trace of {name} was recovered.',
    '{name} was last seen heading below deck.'
  ];

  function pickStory(pool, name) {
    var s = pool[Math.floor(Math.random() * pool.length)];
    return s.replace(/\{name\}/g, name);
  }

  G.processShipDestruction = function (cause) {
    var playerShip = G.getActivePlayerShip();
    var shipName = playerShip ? playerShip.tierData.name : 'Unknown';

    G.player.ownedShips.splice(G.player.activeShipIdx, 1);
    if (G.player.ownedShips.length > 0) {
      G.player.activeShipIdx = Math.min(G.player.activeShipIdx, G.player.ownedShips.length - 1);
    } else {
      G.player.activeShipIdx = 0;
    }

    var survivors = [];
    var dead = [];
    var crewResults = [];

    for (var i = 0; i < G.player.crew.length; i++) {
      var member = G.player.crew[i];
      if (member.alive === false) {
        dead.push(member);
        crewResults.push({ member: member, survived: false, story: pickStory(DEATH_STORIES, member.name) });
        continue;
      }
      if (Math.random() < 0.6) {
        survivors.push(member);
        crewResults.push({ member: member, survived: true, story: pickStory(SURVIVOR_STORIES, member.name) });
      } else {
        member.alive = false;
        dead.push(member);
        crewResults.push({ member: member, survived: false, story: pickStory(DEATH_STORIES, member.name) });
      }
    }

    G.player.totalCrewDeaths = (G.player.totalCrewDeaths || 0) + dead.length;
    G.player.crew = survivors;
    G.player.inRun = false;

    // Clear voyage state
    G.voyage.stageIdx = -1;
    G.voyage.stages = [];
    if (G.voyage.timer) { clearTimeout(G.voyage.timer); G.voyage.timer = null; }

    G.savePlayer();

    var cheapestShipCost = G.SHIP_TIERS[0].cost;
    var isRetired = G.player.ownedShips.length === 0 && G.player.bank < cheapestShipCost;

    return {
      cause: cause,
      shipName: shipName,
      crewResults: crewResults,
      survivors: survivors,
      dead: dead,
      isRetired: isRetired
    };
  };

  G.showShipwreckOverlay = function (result) {
    var overlay = document.getElementById('shipwreckOverlay');
    document.getElementById('shipwreckTitle').textContent =
      result.cause === 'mine' ? 'Mine Strike!' : 'Ship Destroyed!';
    document.getElementById('shipwreckCause').textContent =
      result.shipName + ' has been lost' +
      (result.cause === 'mine' ? ' to a mine.' : ' in the strait.');

    var listEl = document.getElementById('shipwreckCrewList');
    listEl.innerHTML = '';

    for (var i = 0; i < result.crewResults.length; i++) {
      var cr = result.crewResults[i];
      var row = document.createElement('div');
      row.className = 'shipwreck-crew-row' + (cr.survived ? ' survived' : ' dead');

      var portrait = document.createElement('div');
      portrait.className = 'shipwreck-portrait';
      portrait.style.backgroundImage = 'url(' + G.getPortraitSrc(cr.member.charId) + ')';
      row.appendChild(portrait);

      var info = document.createElement('div');
      info.className = 'shipwreck-crew-info';
      var nameEl = document.createElement('div');
      nameEl.className = 'shipwreck-crew-name';
      nameEl.textContent = cr.member.name + (cr.survived ? '' : ' \u2020');
      info.appendChild(nameEl);
      var storyEl = document.createElement('div');
      storyEl.className = 'shipwreck-crew-story';
      storyEl.textContent = cr.story;
      info.appendChild(storyEl);
      row.appendChild(info);

      listEl.appendChild(row);
    }

    document.getElementById('shipwreckBank').textContent =
      'Bank: ' + G.formatMoney(G.player.bank);

    var btn = document.getElementById('shipwreckContinueBtn');
    if (result.isRetired) {
      btn.textContent = 'Game Over \u2014 Cash Out';
    } else {
      btn.textContent = 'Return to Port';
    }

    overlay.classList.add('active');
  };

  G.onShipwreckContinue = function () {
    document.getElementById('shipwreckOverlay').classList.remove('active');
    var cheapestShipCost = G.SHIP_TIERS[0].cost;
    var isRetired = G.player.ownedShips.length === 0 && G.player.bank < cheapestShipCost;
    if (isRetired) {
      G.showGameOver();
    } else {
      G.cumulativeScore = G.player.bank;
      G.showMenu();
    }
  };

  // Game over — no ship, no funds
  G.showGameOver = function () {
    G.saveHighScore(G.player.bank);
    var overlay = document.getElementById('gameOverOverlay');
    document.getElementById('gameOverBank').textContent = G.formatMoney(G.player.bank);
    document.getElementById('gameOverWeeks').textContent = G.player.turn;
    overlay.classList.add('active');
  };

  G.onGameOverRestart = function () {
    document.getElementById('gameOverOverlay').classList.remove('active');
    G.deleteSave();
    G.player = G.createFreshPlayer();
    G.cumulativeScore = G.player.bank;
    G.showMenu();
  };

  // Retreat to port — costs 1 week, allows hiring at nearest port
  G.showRetreatOption = function () {
    var overlay = document.getElementById('retreatOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
  };

  G.onRetreatContinue = function () {
    // Continue without swimmer
    document.getElementById('retreatOverlay').classList.remove('active');
  };

  G.onRetreatToPort = function () {
    document.getElementById('retreatOverlay').classList.remove('active');
    // Cost: 1 week
    G.player.turn++;
    // Stop minesweeper
    var ms = G.ms;
    ms.gameOver = true;
    clearInterval(ms.timerInterval);
    // Remove dead crew so player can hire replacements
    G.player.crew = G.player.crew.filter(function (m) { return m.alive !== false; });
    // Clear voyage and return to menu
    G.voyage.stageIdx = -1;
    G.voyage.stages = [];
    if (G.voyage.timer) { clearTimeout(G.voyage.timer); G.voyage.timer = null; }
    G.player.inRun = false;
    G.savePlayer();
    G.showMenu();
  };

  // ──────────────────────────────────────────────────────────
  //  MENU / DOCK
  // ──────────────────────────────────────────────────────────

  G.showMenu = function () {
    G.state = 'MENU';
    G.resetCounterStyle();
    // Clear voyage state
    G.voyage.stageIdx = -1;
    G.voyage.stages = [];
    G.voyage.oilPct = 0;
    G.voyage.cargoLoaded = false;
    if (G.voyage.timer) { clearTimeout(G.voyage.timer); G.voyage.timer = null; }
    G.updateBarMode('menu');
    G.initBoard(G.player.turn);
    G.renderDock();
    G.updateMapStageCard();
  };

  G.showReturningMenu = function () {
    G.showMenu();
  };

  G.activeDestination = null; // legacy compat

  // Legacy compat — old startRound redirects to startVoyage
  G.startRound = function () {
    G.startVoyage();
  };

  // Called when voyage completes (all stages done) — awards cargo and starts next loop
  G.completeVoyage = function () {
    var t = G.transit;
    var ship = G.activeShip;

    // roundScore and bank already updated during selling stage
    G.player.turn++;
    G.player.inRun = false;

    // Sync transit HP back to owned ship
    var playerShip = G.getActivePlayerShip();
    if (playerShip) {
      playerShip.owned.hp = Math.max(1, t.hp);
    }
    G.cumulativeScore = G.player.bank;

    G.savePlayer();
    G.saveHighScore(G.player.bank);

    // Immediately start next voyage loop
    G.showMenu();
  };

  // Legacy compat
  G.showScore = G.completeVoyage;

  G.goAgain = function () {
    document.getElementById('scoreOverlay').classList.remove('active');
    G.showMenu();
  };

  G.continueGame = function () {
    G.showMenu();
  };

  G.cashOut = function () {
    // Close any open overlays
    var scoreOvl = document.getElementById('scoreOverlay');
    if (scoreOvl) scoreOvl.classList.remove('active');
    G.saveHighScore(G.player.bank);
    G.deleteSave();
    G.player = G.createFreshPlayer();
    G.cumulativeScore = G.player.bank;
    G.showMenu();
  };

  G.newGame = function () {
    if (G.transit.active) {
      G.transit.active = false;
      cancelAnimationFrame(G.transit.animFrame);
      clearInterval(G.transit.transitTimerInterval);
    }
    clearInterval(G.ms.timerInterval);
    if (G.voyage.timer) { clearTimeout(G.voyage.timer); G.voyage.timer = null; }
    G.resetCounterStyle();
    document.getElementById('scoreOverlay').classList.remove('active');
    document.getElementById('shipwreckOverlay').classList.remove('active');

    // Always reset to fresh player
    G.deleteSave();
    G.player = G.createFreshPlayer();
    G.cumulativeScore = G.player.bank;
    G.showMenu();
  };

  // High scores
  G.saveHighScore = function (score) {
    try {
      var scores = JSON.parse(localStorage.getItem('hormuz_highscores') || '[]');
      scores.push(score);
      scores.sort(function (a, b) { return b - a; });
      scores = scores.slice(0, 10);
      localStorage.setItem('hormuz_highscores', JSON.stringify(scores));
    } catch (e) {}
  };

  G.getHighScores = function () {
    try {
      return JSON.parse(localStorage.getItem('hormuz_highscores') || '[]');
    } catch (e) { return []; }
  };

  G.showHelp = function () {
    document.getElementById('helpModal').classList.add('active');
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  // Test mode
  G.startTestMode = function () {
    G.activeShip = G.getShipTier(4);
    G.sprites.ship.src = G.activeShip.sprite;
    G.player.turn = 5;
    G.updateBarMode('gameplay');
    G.initBoard(G.player.turn);
    G.state = 'MINESWEEPER';
    G.initMinesweeper(0);
    for (var r = 0; r < G.rows; r++) {
      for (var c = 0; c < G.cols; c++) {
        if (G.oceanMask[r][c]) G.ms.revealed[r][c] = true;
      }
    }
    // Set up minimal voyage for stage trail
    G.voyage.port = 'Fujairah';
    G.voyage.stages = [
      { id: 'test', label: 'Test mode' },
      { id: 'transit_fwd', label: 'Running the strait' }
    ];
    G.voyage.stageIdx = 1;
    G.renderStageTrail();
    G.startTransit('forward');
  };

  G.toggleMute = function () {
    G.soundEnabled = !G.soundEnabled;
    document.getElementById('muteBtn').textContent = G.soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07';
  };

  G.transitControl = function (action) {
    if (action === 'forward') G.handleTransitKey('ArrowUp');
    else if (action === 'reverse') G.handleTransitKey('ArrowDown');
    else if (action === 'stop') G.handleTransitKey(' ');
  };

  // Highlight the active transit direction button
  G.updateTransitButtons = function () {
    var t = G.transit;
    if (!t) return;
    var fwd = document.getElementById('btnForward');
    var stop = document.getElementById('btnStop');
    var rev = document.getElementById('btnReverse');
    if (!fwd) return;
    fwd.classList.toggle('engaged', t.shipSpeedTarget === 1);
    stop.classList.toggle('engaged', t.shipSpeedTarget === 0);
    rev.classList.toggle('engaged', t.shipSpeedTarget === -1);
  };

  G.updateTransitControls = function () {
    var el = document.getElementById('transitControls');
    if (G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  };

  var origSetStatus = G.setStatus;
  G.setStatus = function (text, className) {
    origSetStatus(text, className);
    G.updateTransitControls();
  };

  // --- Bar mode toggling (menu vs gameplay) ---
  G.updateBarMode = function (mode) {
    var newsTicker = document.getElementById('newsTicker');
    var transitControls = document.getElementById('transitControls');
    var boardWrap = document.getElementById('boardWrap');
    var mapCard = document.getElementById('mapStageCard');

    if (mode === 'gameplay') {
      newsTicker.classList.remove('active');
      if (transitControls) transitControls.classList.remove('active');
      if (boardWrap) boardWrap.classList.remove('map-dimmed');
      if (mapCard) mapCard.classList.remove('active');
    } else if (mode === 'auto') {
      newsTicker.classList.remove('active');
      if (transitControls) transitControls.classList.remove('active');
      if (boardWrap) boardWrap.classList.add('map-dimmed');
    } else {
      // Menu — dim map, show news
      newsTicker.classList.add('active');
      if (transitControls) transitControls.classList.remove('active');
      if (boardWrap) boardWrap.classList.add('map-dimmed');
    }
  };

  // --- Port action helpers ---
  function _buildPortActions(playerShip, sailAction, sailLabel) {
    sailLabel = sailLabel || 'Set Sail';
    var html = '<div class="stage-actions">';
    html += '<button class="stage-sail-btn' + (G.hasCrewRole('Captain') ? '' : ' disabled') + '" onclick="' + sailAction + '">' + sailLabel + '</button>';
    // Repair button if damaged
    if (playerShip && playerShip.hp < playerShip.maxHp) {
      var cost = _getRepairCost(playerShip);
      var canRepair = G.player.bank >= cost;
      html += '<button class="stage-repair-btn' + (canRepair ? '' : ' disabled') + '" onclick="repairShip()" title="Repair hull">';
      html += '🔧 ' + G.formatMoney(cost);
      html += '</button>';
    }
    html += '</div>';
    return html;
  }

  function _buildShipUpgrades(playerShip) {
    if (!playerShip) return '';
    var currentTier = playerShip.tierData.tier;
    var html = '';
    var hasUpgrades = false;

    for (var i = 0; i < G.SHIP_TIERS.length; i++) {
      var s = G.SHIP_TIERS[i];
      if (s.tier <= currentTier) continue;
      if (!hasUpgrades) {
        html += '<div class="stage-section-label">Upgrade Ship</div>';
        hasUpgrades = true;
      }
      var canAfford = G.player.bank >= s.cost;
      html += '<div class="stage-ship-upgrade' + (canAfford ? '' : ' disabled') + '" onclick="upgradeShip(' + s.tier + ')">';
      html += '<div><div class="stage-ship-upgrade-name">' + s.name + '</div>';
      html += '<div class="stage-ship-upgrade-info">' + s.hp + ' HP · ' + s.crewSlots.length + ' crew · Cargo ' + G.formatMoney(s.cargoValue) + '</div></div>';
      html += '<div class="stage-ship-upgrade-cost">' + G.formatMoney(s.cost) + '</div>';
      html += '</div>';
    }
    return html;
  }

  window.upgradeShip = function (tier) {
    var tierData = G.getShipTier(tier);
    if (!tierData || G.player.bank < tierData.cost) return;
    G.player.bank -= tierData.cost;
    G.player.ownedShips = [{ tier: tierData.tier, hp: tierData.hp }];
    G.player.activeShipIdx = 0;
    G.savePlayer();
    document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
    if (G.renderShipButton) G.renderShipButton();
    G.renderDock();
    G.updateMapStageCard();
  };

  window.buyShip = function (tier) {
    var tierData = G.getShipTier(tier);
    if (!tierData || G.player.bank < tierData.cost) return;
    G.player.bank -= tierData.cost;
    G.player.ownedShips = [{ tier: tierData.tier, hp: tierData.hp }];
    G.player.activeShipIdx = 0;
    G.savePlayer();
    document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
    if (G.renderShipButton) G.renderShipButton();
    G.renderTacticalCrewBar();
    G.renderDock();
    G.updateMapStageCard();
  };

  // --- Map stage card (overlay on map with contextual info) ---
  G.updateMapStageCard = function () {
    var card = document.getElementById('mapStageCard');
    if (!card) return;

    var v = G.voyage;
    var stage = (v.stages && v.stageIdx >= 0) ? v.stages[v.stageIdx] : null;

    // Hide during active gameplay
    if (G.state === 'MINESWEEPER' || G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
      card.classList.remove('active');
      return;
    }

    var playerShip = G.getActivePlayerShip();
    var html = '';

    if (!stage) {
      // At port, no voyage started
      html += '<h3>At Port</h3>';
      html += '<div class="stage-subtitle">Persian Gulf</div>';
      if (!playerShip) {
        // No ship — show buy options
        html += '<div class="stage-detail" style="color:var(--dock-text-muted)">You need a ship to set sail.</div>';
        // Show all ships as purchase options
        for (var si = 0; si < G.SHIP_TIERS.length; si++) {
          var s = G.SHIP_TIERS[si];
          var canAfford = G.player.bank >= s.cost;
          html += '<div class="stage-ship-upgrade' + (canAfford ? '' : ' disabled') + '" onclick="buyShip(' + s.tier + ')">';
          html += '<div><div class="stage-ship-upgrade-name">' + s.name + '</div>';
          html += '<div class="stage-ship-upgrade-info">' + s.hp + ' HP · ' + s.crewSlots.length + ' crew · Cargo ' + G.formatMoney(s.cargoValue) + '</div></div>';
          html += '<div class="stage-ship-upgrade-cost">' + G.formatMoney(s.cost) + '</div>';
          html += '</div>';
        }
      } else {
        html += _buildPortActions(playerShip, 'loadCargoAndSail()', 'Load & Set Sail');
        html += _buildShipUpgrades(playerShip);
      }
    } else if (stage.id === 'manage_port') {
      html += '<h3>In Port — ' + (v.port || '') + '</h3>';
      if (v.selling === 'done') {
        // Selling complete — show total, then auto-advance
        html += '<div class="stage-detail">Sold cargo for <strong style="color:var(--dock-green)">' + G.formatMoney(G.roundScore) + '</strong></div>';
        html += '<div class="stage-auto-label">Returning home…</div>';
      } else if (v.selling) {
        // Selling in progress
        var sellVal = G.activeShip ? G.activeShip.cargoValue : 0;
        var oilLeft = Math.round(G.voyage.oilPct || 0);
        html += '<div class="stage-auto-label">Selling cargo…</div>';
        var sold = Math.round(sellVal * (100 - oilLeft) / 100);
        html += '<div class="stage-detail" style="color:var(--dock-green)">+' + G.formatMoney(sold) + '</div>';
      } else {
        // Arrived — show Sell & Return button + repair
        var cargoVal = G.activeShip ? G.activeShip.cargoValue : 0;
        html += '<div class="stage-detail">Cargo: <strong>' + G.formatMoney(cargoVal) + '</strong> crude oil</div>';
        html += _buildPortActions(playerShip, 'sellAndReturn()', 'Sell & Return');
      }
    } else if (stage.auto) {
      // Auto stage — just show what's happening
      html += '<div class="stage-auto-label">' + stage.label + '…</div>';
    }

    card.innerHTML = html;
    card.classList.add('active');
  };

  function _getRepairCost(playerShip) {
    var missing = playerShip.maxHp - playerShip.hp;
    // 10% of ship cost per HP point
    var costPerHp = Math.round(playerShip.tierData.cost * 0.1);
    return missing * costPerHp;
  }

  window.continueVoyage = function () {
    if (G.voyage && G.voyage.stages[G.voyage.stageIdx] &&
        G.voyage.stages[G.voyage.stageIdx].id === 'manage_port') {
      G.advanceStage();
    }
  };

  window.repairShip = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip || playerShip.hp >= playerShip.maxHp) return;
    var cost = _getRepairCost(playerShip);
    if (G.player.bank < cost) return;
    G.player.bank -= cost;
    playerShip.owned.hp = playerShip.maxHp;
    G.savePlayer();
    document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
    if (G.renderShipButton) G.renderShipButton();
    G.renderDock();
    G.updateMapStageCard();
  };

  // --- Dynamic crew action text ---
  function _getCrewAction(role) {
    if (G.state === 'AUTO_STAGE') {
      if (role === 'Captain') return 'Sailing';
      return '';
    }
    if (G.state === 'MINESWEEPER') {
      if (role === 'Swimmer') return 'Sweeping';
      if (role === 'Captain') return 'At helm';
      return '';
    }
    if (G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
      if (role === 'Captain') {
        var t = G.transit;
        if (t.shipSpeedTarget > 0) return '▲ Forward';
        if (t.shipSpeedTarget < 0) return '▼ Reverse';
        return '⏸ Holding';
      }
      if (role === 'Shotgunner') return 'On deck';
      if (role === 'Gunner') return 'Scanning';
      if (role === 'Navigator') return 'Plotting';
      return '';
    }
    return '';
  }

  // --- Update captain action text without full re-render ---
  G.updateCaptainAction = function () {
    var actionEl = document.querySelector('.crew-slot[data-role="Captain"] .crew-slot-action');
    if (actionEl) {
      actionEl.textContent = _getCrewAction('Captain');
    }
  };

  // --- Unified crew bar (all states) ---
  G.renderTacticalCrewBar = function () {
    var container = document.getElementById('tacticalCrewSlots');
    if (!container) return;
    container.innerHTML = '';

    if (!G.player || !G.player.crew) return;

    var isMenu = (G.state === 'MENU');

    var playerShip = G.getActivePlayerShip();
    if (!playerShip) return;
    var slots = playerShip.tierData.crewSlots;

    for (var i = 0; i < slots.length; i++) {
      (function (role) {
        var member = G.getCrewForRole(role);
        var slotEl = document.createElement('div');
        slotEl.className = 'crew-slot';
        slotEl.setAttribute('data-role', role);

        if (member) {
          // Portrait
          var card = _buildCrewCard(member, isMenu);
          if (isMenu) {
            card.onclick = function (e) {
              e.stopPropagation();
              G.showCrewPopover(member, role, card);
            };
          }
          slotEl.appendChild(card);

          // Text info beside portrait
          var info = document.createElement('div');
          info.className = 'crew-slot-info';

          var topGroup = document.createElement('div');
          topGroup.className = 'crew-slot-top';

          var header = document.createElement('div');
          header.className = 'crew-slot-header';
          header.textContent = role.toUpperCase();
          topGroup.appendChild(header);

          var nameEl = document.createElement('div');
          nameEl.className = 'crew-slot-name';
          nameEl.textContent = member.name;
          topGroup.appendChild(nameEl);

          info.appendChild(topGroup);

          // Dynamic action text (only during gameplay)
          var action = _getCrewAction(role);
          var actionEl = document.createElement('div');
          actionEl.className = 'crew-slot-action';
          actionEl.textContent = action || '';
          info.appendChild(actionEl);

          slotEl.appendChild(info);
        } else if (isMenu) {
          // Empty hire slot — same structure as filled to prevent layout shift
          var empty = document.createElement('div');
          empty.className = 'crew-slot-empty';
          empty.textContent = 'HIRE';
          empty.onclick = function (e) {
            e.stopPropagation();
            G.showHireModal(role);
          };
          slotEl.appendChild(empty);

          var emptyInfo = document.createElement('div');
          emptyInfo.className = 'crew-slot-info';
          var emptyTop = document.createElement('div');
          emptyTop.className = 'crew-slot-top';
          var emptyHeader = document.createElement('div');
          emptyHeader.className = 'crew-slot-header';
          emptyHeader.textContent = role.toUpperCase();
          emptyTop.appendChild(emptyHeader);
          emptyInfo.appendChild(emptyTop);
          // Spacer for action line to match filled slot height
          var emptySpacer = document.createElement('div');
          emptySpacer.className = 'crew-slot-action';
          emptySpacer.innerHTML = '&nbsp;';
          emptyInfo.appendChild(emptySpacer);
          slotEl.appendChild(emptyInfo);
        }

        container.appendChild(slotEl);
      })(slots[i]);
    }
  };

  function _buildCrewCard(member, clickable) {
    var card = document.createElement('div');
    var classes = 'crew-card';
    if (clickable) classes += ' clickable';
    if (member.alive === false) classes += ' crew-dead';
    card.className = classes;
    card.title = member.name + ' — ' + member.quirkLabel + ' (' + member.role + ')';

    var portrait = document.createElement('div');
    portrait.className = 'crew-card-portrait';
    portrait.style.backgroundImage = 'url(' + G.getPortraitSrc(member.charId) + ')';
    card.appendChild(portrait);

    return card;
  }

  // --- Tactical menu ---
  G.toggleTacticalMenu = function () {
    var menu = document.getElementById('tacticalMenu');
    menu.classList.toggle('active');
  };
  G.closeTacticalMenu = function () {
    var menu = document.getElementById('tacticalMenu');
    menu.classList.remove('active');
  };

  document.addEventListener('click', function (e) {
    var menu = document.getElementById('tacticalMenu');
    if (menu && menu.classList.contains('active') && !e.target.closest('.tactical-menu-wrap')) {
      menu.classList.remove('active');
    }
  });

  // Expose for HTML onclick
  window.newGame = G.newGame;
  window.showHelp = G.showHelp;
  window.startRound = function () { G.startVoyage(); };
  window.startTestMode = function () { G.startTestMode(); };
  window.goAgain = function () { G.goAgain(); };
  window.cashOut = function () { G.cashOut(); };
  window.continueGame = function () { G.continueGame(); };
  window.toggleMute = function () { G.toggleMute(); };
  window.transitControl = function (a) { G.transitControl(a); };
  window.toggleTacticalMenu = function () { G.toggleTacticalMenu(); };
  window.closeTacticalMenu = function () { G.closeTacticalMenu(); };
  window.onShipwreckContinue = function () { G.onShipwreckContinue(); };
  window.onRetreatToPort = function () { G.onRetreatToPort(); };
  window.onRetreatContinue = function () { G.onRetreatContinue(); };
  window.onGameOverRestart = function () { G.onGameOverRestart(); };
})();
