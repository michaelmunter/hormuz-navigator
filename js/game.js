// Game state machine, initialization, scoring, phase transitions
(function () {
  const G = window.Game;

  // Game states: MENU, MINESWEEPER, TRANSIT_FORWARD, TRANSIT_RETURN, SCORE, GAMEOVER
  G.state = 'MENU';
  G.barrels = 50;
  G.cumulativeScore = 0;
  G.roundScore = 0;

  // --- Player state & persistence ---
  var SAVE_KEY = 'hormuz_save';
  var SAVE_VERSION = 1;
  var STARTING_BANK = 6000000; // $6M — enough for The Rustbucket ($5M) + a crew hire

  G.player = null;

  G.createFreshPlayer = function () {
    return {
      bank: STARTING_BANK,
      crew: [],       // placeholder for PR 4
      ship: null,     // placeholder for PR 3
      turn: 0,
      equipment: [],  // placeholder for PR 5
      inRun: false    // true while a run is in progress (mine phase or transit)
    };
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
    // Version 1 is baseline, no migrations yet
    // Future: if (data.version < 2) { ... data.version = 2; }
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
      G.initBoard();
      G.loadPlayer();
      G.cumulativeScore = G.player.bank;

      // If player was mid-run, that run is lost (they closed the tab to escape)
      // Treat as a failed run — clear inRun flag and save
      if (G.player.inRun) {
        G.player.inRun = false;
        G.savePlayer();
      }

      // If player has progress (bank differs from starting), show continue/cash out
      if (G.player.bank !== STARTING_BANK || G.player.turn > 0) {
        G.showReturningMenu();
      } else {
        G.showMenu();
      }
    }
  }
  G.oceanImg.onload = onMapImgLoad;
  G.landImg.onload = onMapImgLoad;
  // Set src after handlers to avoid missing cached image load
  G.oceanImg.src = 'hormuz-ocean.png';
  G.landImg.src = 'hormuz-land.png';

  // Load PNG sprites
  var spriteSrcs = {
    ship: 'sprites/ships/ship-1.png',
    shahed: 'sprites/shahed.png',
    missile: 'sprites/missile.png',
    shahedExploding: 'sprites/shahed-exploding.png',
    explosion: 'sprites/explosion.png',
    missileOceanDrop: 'sprites/missile_oceandrop.png'
  };
  Object.keys(spriteSrcs).forEach(function (name) {
    G.sprites[name].src = spriteSrcs[name];
  });

  G.initBoard = function () {
    var crop = G.crop;
    var imgW = crop.w || G.oceanImg.width;
    var imgH = crop.h || G.oceanImg.height;
    var compact = window.innerHeight < 700;
    var maxW = Math.min(window.innerWidth - (compact ? 30 : 60), 1200);
    var maxH = Math.min(window.innerHeight - (compact ? 90 : 160), 750);
    var scale = Math.min(maxW / imgW, maxH / imgH);
    var w = Math.floor(imgW * scale);
    var h = Math.floor(imgH * scale);

    G.cols = Math.floor(w / G.CELL);
    G.rows = Math.floor(h / G.CELL);
    var canvasW = G.cols * G.CELL;
    var canvasH = G.rows * G.CELL;

    G.sizeCanvases(canvasW, canvasH);
    G.buildOceanMask(canvasW, canvasH);
    G.drawLayers(canvasW, canvasH);
  };

  G.showMenu = function () {
    G.state = 'MENU';
    G.resetCounterStyle();
    document.getElementById('menuOverlay').classList.add('active');
    document.getElementById('returningOverlay').classList.remove('active');
    document.getElementById('cumulativeScoreDisplay').textContent = G.formatMoney(G.player.bank);
  };

  G.showReturningMenu = function () {
    G.state = 'MENU';
    G.resetCounterStyle();
    document.getElementById('returningOverlay').classList.add('active');
    document.getElementById('menuOverlay').classList.remove('active');
    document.getElementById('returningBank').textContent = G.formatMoney(G.player.bank);
    document.getElementById('returningTurns').textContent = G.player.turn;
  };

  G.startRound = function (barrels) {
    G.barrels = barrels;
    document.getElementById('menuOverlay').classList.remove('active');
    G.state = 'MINESWEEPER';
    var cfg = G.BARREL_CONFIG[barrels];
    G.initMinesweeper(cfg.mineRatio);
    G.player.inRun = true;
    G.savePlayer(); // committed to this run — closing tab now = lost run
  };

  // Called from transit.js when forward leg completes and then return leg completes
  G.showScore = function () {
    var t = G.transit;
    var cfg = G.BARREL_CONFIG[G.barrels];
    G.state = 'SCORE';

    var base = 1000;
    var timePenalty = t.transitSeconds * 2;
    var shahedBonus = t.shahedKills * 50;
    G.roundScore = Math.max(0, Math.floor((base - timePenalty + shahedBonus) * cfg.multiplier));
    G.player.bank += G.roundScore;
    G.player.turn++;
    G.player.inRun = false;
    G.cumulativeScore = G.player.bank;

    G.resetCounterStyle();

    // Show score overlay
    document.getElementById('scoreRound').textContent = G.formatMoney(G.roundScore);
    document.getElementById('scoreShahedKills').textContent = t.shahedKills;
    document.getElementById('scoreBarrels').textContent = G.barrels;
    document.getElementById('scoreMultiplier').textContent = cfg.multiplier + '×';
    document.getElementById('scoreTotal').textContent = G.formatMoney(G.player.bank);
    document.getElementById('scoreOverlay').classList.add('active');

    G.savePlayer(); // successful delivery — earnings locked in
    G.saveHighScore(G.player.bank);
  };

  G.goAgain = function () {
    document.getElementById('scoreOverlay').classList.remove('active');
    G.showMenu();
  };

  G.continueGame = function () {
    document.getElementById('returningOverlay').classList.remove('active');
    G.showMenu();
  };

  G.cashOut = function () {
    document.getElementById('scoreOverlay').classList.remove('active');
    document.getElementById('returningOverlay').classList.remove('active');
    G.saveHighScore(G.player.bank);
    G.deleteSave();
    G.player = G.createFreshPlayer();
    G.cumulativeScore = G.player.bank;
    G.showMenu();
  };

  // Called by face button / New menu
  G.newGame = function () {
    // Cancel any transit
    if (G.transit.active) {
      G.transit.active = false;
      cancelAnimationFrame(G.transit.animFrame);
      clearInterval(G.transit.transitTimerInterval);
    }
    clearInterval(G.ms.timerInterval);
    G.resetCounterStyle();
    document.getElementById('scoreOverlay').classList.remove('active');

    // Mark run as over (player abandoned or died)
    G.player.inRun = false;
    G.cumulativeScore = G.player.bank;

    // If player has progress, show continue/cash out menu
    if (G.player.bank !== STARTING_BANK || G.player.turn > 0) {
      G.savePlayer();
      G.showReturningMenu();
    } else {
      G.deleteSave();
      G.player = G.createFreshPlayer();
      G.cumulativeScore = G.player.bank;
      G.showMenu();
    }
  };

  // High scores in localStorage
  G.saveHighScore = function (score) {
    try {
      var scores = JSON.parse(localStorage.getItem('hormuz_highscores') || '[]');
      scores.push(score);
      scores.sort(function (a, b) { return b - a; });
      scores = scores.slice(0, 10);
      localStorage.setItem('hormuz_highscores', JSON.stringify(scores));
    } catch (e) { /* ignore */ }
  };

  G.getHighScores = function () {
    try {
      return JSON.parse(localStorage.getItem('hormuz_highscores') || '[]');
    } catch (e) { return []; }
  };

  // Help
  G.showHelp = function () {
    document.getElementById('helpModal').classList.add('active');
  };

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  // Test mode: skip minesweeper, go straight to transit
  G.startTestMode = function () {
    G.barrels = 50;
    document.getElementById('menuOverlay').classList.remove('active');
    G.state = 'MINESWEEPER';
    G.initMinesweeper(0); // no mines
    // Reveal all ocean cells
    for (var r = 0; r < G.rows; r++) {
      for (var c = 0; c < G.cols; c++) {
        if (G.oceanMask[r][c]) G.ms.revealed[r][c] = true;
      }
    }
    G.startTransit('forward');
  };

  // Mute toggle
  G.toggleMute = function () {
    G.soundEnabled = !G.soundEnabled;
    document.getElementById('muteBtn').textContent = G.soundEnabled ? '🔊' : '🔇';
  };

  // Mobile transit controls
  G.transitControl = function (action) {
    if (action === 'forward') G.handleTransitKey('ArrowUp');
    else if (action === 'reverse') G.handleTransitKey('ArrowDown');
    else if (action === 'stop') G.handleTransitKey(' ');
  };

  // Show/hide transit controls based on state
  G.updateTransitControls = function () {
    var el = document.getElementById('transitControls');
    if (G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  };

  // Patch state transitions to update transit controls
  var origSetStatus = G.setStatus;
  G.setStatus = function (text, className) {
    origSetStatus(text, className);
    G.updateTransitControls();
  };

  // Expose for HTML onclick
  window.newGame = G.newGame;
  window.showHelp = G.showHelp;
  window.startRound = function (b) { G.startRound(b); };
  window.startTestMode = function () { G.startTestMode(); };
  window.goAgain = function () { G.goAgain(); };
  window.cashOut = function () { G.cashOut(); };
  window.continueGame = function () { G.continueGame(); };
  window.toggleMute = function () { G.toggleMute(); };
  window.transitControl = function (a) { G.transitControl(a); };
})();
