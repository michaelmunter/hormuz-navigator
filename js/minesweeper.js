// Minesweeper phase logic — mine placement, reveal, flood fill, win check
(function () {
  const G = window.Game;

  // Minesweeper state
  G.ms = {
    grid: null,
    mines: null,
    revealed: null,
    flagged: null,
    gameOver: false,
    gameWon: false,
    mineCount: 0,
    flagCount: 0,
    started: false,
    seconds: 0,
    timerInterval: null
  };

  G.initMinesweeper = function (mineRatio) {
    const ms = G.ms;
    const rows = G.rows, cols = G.cols;

    ms.gameOver = false;
    ms.gameWon = false;
    ms.started = false;
    ms.seconds = 0;
    ms.flagCount = 0;
    clearInterval(ms.timerInterval);

    document.getElementById('timer').textContent = '000';
    document.getElementById('faceBtn').innerHTML = '&#128578;';
    G.setStatus('Navigate the Strait of Hormuz. Clear a path from left to right!', '');

    // Count ocean cells
    const oceanCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (G.oceanMask[r][c]) oceanCells.push([r, c]);
      }
    }

    ms.mineCount = Math.floor(oceanCells.length * mineRatio);
    document.getElementById('mineCounter').textContent = String(ms.mineCount).padStart(3, '0');

    // Init arrays
    ms.grid = [];
    ms.mines = [];
    ms.revealed = [];
    ms.flagged = [];
    for (let r = 0; r < rows; r++) {
      ms.grid[r] = [];
      ms.mines[r] = [];
      ms.revealed[r] = [];
      ms.flagged[r] = [];
      for (let c = 0; c < cols; c++) {
        ms.grid[r][c] = 0;
        ms.mines[r][c] = false;
        ms.revealed[r][c] = false;
        ms.flagged[r][c] = false;
      }
    }

    // Place mines with guaranteed path
    G.placeMines(oceanCells, ms);

    // Compute numbers
    G.computeNumbers(ms);

    G.drawBoard();
  };

  G.placeMines = function (oceanCells, ms) {
    // Stratified placement: divide ocean into sectors and distribute mines
    // evenly across them so mines spread across the whole board instead of clumping
    const SECTOR_ROWS = 6, SECTOR_COLS = 6;
    const rowStep = Math.ceil(G.rows / SECTOR_ROWS);
    const colStep = Math.ceil(G.cols / SECTOR_COLS);
    const sectors = {};
    for (let i = 0; i < oceanCells.length; i++) {
      const [r, c] = oceanCells[i];
      const key = Math.floor(r / rowStep) * SECTOR_COLS + Math.floor(c / colStep);
      if (!sectors[key]) sectors[key] = [];
      sectors[key].push([r, c]);
    }
    const sectorKeys = Object.keys(sectors);
    // Shuffle each sector
    for (let k = 0; k < sectorKeys.length; k++) {
      sectors[sectorKeys[k]].sort(function () { return Math.random() - 0.5; });
    }
    // Distribute mines round-robin across sectors
    let placed = 0;
    const sectorIdx = {};
    for (let k = 0; k < sectorKeys.length; k++) sectorIdx[sectorKeys[k]] = 0;
    let round = 0;
    while (placed < ms.mineCount) {
      let placedThisRound = false;
      for (let k = 0; k < sectorKeys.length && placed < ms.mineCount; k++) {
        const key = sectorKeys[k];
        const cells = sectors[key];
        if (sectorIdx[key] < cells.length) {
          const [r, c] = cells[sectorIdx[key]];
          ms.mines[r][c] = true;
          sectorIdx[key]++;
          placed++;
          placedThisRound = true;
        }
      }
      if (!placedThisRound) break;
      round++;
    }

    if (!G.hasPath(ms.mines)) {
      const path = G.findCarvePath();
      if (path) {
        let removed = 0;
        for (const [r, c] of path) {
          if (ms.mines[r][c]) { ms.mines[r][c] = false; removed++; }
        }
        ms.mineCount -= removed;
        document.getElementById('mineCounter').textContent = String(ms.mineCount).padStart(3, '0');
      }
    }
  };

  G.computeNumbers = function (ms) {
    const rows = G.rows, cols = G.cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!G.oceanMask[r][c] || ms.mines[r][c]) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && ms.mines[nr][nc]) count++;
          }
        }
        ms.grid[r][c] = count;
      }
    }
  };

  G.revealCell = function (r, c) {
    const ms = G.ms;
    if (r < 0 || r >= G.rows || c < 0 || c >= G.cols) return;
    if (!G.oceanMask[r][c] || ms.revealed[r][c] || ms.flagged[r][c]) return;

    ms.revealed[r][c] = true;
    G.drawCell(r, c);

    if (ms.grid[r][c] === 0 && !ms.mines[r][c]) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          G.revealCell(r + dr, c + dc);
        }
      }
    }
  };

  G.checkWin = function () {
    const ms = G.ms;
    const rows = G.rows, cols = G.cols;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const queue = [];

    for (let r = 0; r < rows; r++) {
      if (G.oceanMask[r][0] && ms.revealed[r][0]) {
        queue.push([r, 0]);
        visited[r][0] = true;
      }
    }

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      if (c === cols - 1) return true;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
              !visited[nr][nc] && G.oceanMask[nr][nc] && ms.revealed[nr][nc]) {
            visited[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
      }
    }
    return false;
  };

  // Find the swimmer crew member (if alive)
  function findSwimmer() {
    if (!G.player || !G.player.crew) return null;
    for (var i = 0; i < G.player.crew.length; i++) {
      var m = G.player.crew[i];
      if (m.role === 'Swimmer' && m.alive) return m;
    }
    return null;
  }

  G.onMineHit = function (r, c) {
    const ms = G.ms;
    ms.revealed[r][c] = 'boom';
    G.sounds.mineExplode();

    var swimmer = findSwimmer();
    if (swimmer) {
      // Swimmer absorbs the hit — dies (permadeath), but game continues
      swimmer.alive = false;
      G.player.totalCrewDeaths = (G.player.totalCrewDeaths || 0) + 1;
      G.drawCell(r, c);
      document.getElementById('faceBtn').innerHTML = '&#128560;'; // worried face
      G.setStatus(swimmer.name + ' hit a mine! Swimmer lost — next hit sinks the ship.', 'lose-msg');
      G.renderTacticalCrewBar();
      G.savePlayer();

      // Show retreat option
      G.showRetreatOption();
      return;
    }

    // No swimmer — ship destroyed
    ms.gameOver = true;
    clearInterval(ms.timerInterval);
    document.getElementById('faceBtn').innerHTML = '&#128565;';
    G.setStatus('BOOM! Ship sunk!', 'lose-msg');

    // Reveal all mines
    for (let rr = 0; rr < G.rows; rr++) {
      for (let cc = 0; cc < G.cols; cc++) {
        if (ms.mines[rr][cc] || (ms.flagged[rr][cc] && !ms.mines[rr][cc])) {
          G.drawCell(rr, cc);
        }
      }
    }

    // Process destruction: remove ship, determine crew survival
    var result = G.processShipDestruction('mine');

    // Show shipwreck overlay after a delay so player sees the mine reveal
    setTimeout(function () {
      G.showShipwreckOverlay(result);
    }, 2500);
  };

  G.onMinesweeperWin = function () {
    const ms = G.ms;
    ms.gameWon = true;
    ms.gameOver = true;
    clearInterval(ms.timerInterval);
    document.getElementById('faceBtn').innerHTML = '&#128526;';

    G.sounds.minesweeperWin();

    // Build distance map and compute the transit route
    G.buildDistanceMap();
    var path = G.findRevealedPath(ms.revealed);
    if (path) {
      // Draw the route on top of the minesweeper board
      G.drawTransitRoute(path, G.gctx);
      G.setStatus('Route plotted! Preparing to set sail...', 'win-msg');
    }

    // Brief delay so player can see the plotted route, then crossfade to transit
    setTimeout(function () {
      G.crossfadeToNextStage();
    }, 1500);
  };

  // First-click safety: clear all mines within radius 2 of first click
  // so the click always opens up a flood-filled area
  G.ensureFirstClickSafe = function (r, c) {
    const ms = G.ms;
    var CLEAR_RADIUS = 2;
    var removed = 0;

    for (var dr = -CLEAR_RADIUS; dr <= CLEAR_RADIUS; dr++) {
      for (var dc = -CLEAR_RADIUS; dc <= CLEAR_RADIUS; dc++) {
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < G.rows && nc >= 0 && nc < G.cols && ms.mines[nr][nc]) {
          ms.mines[nr][nc] = false;
          removed++;
        }
      }
    }

    if (removed > 0) {
      ms.mineCount -= removed;
      document.getElementById('mineCounter').textContent = String(ms.mineCount).padStart(3, '0');
    }

    // Re-verify path
    if (!G.hasPath(ms.mines)) {
      var path = G.findCarvePath();
      if (path) {
        for (var i = 0; i < path.length; i++) {
          if (ms.mines[path[i][0]][path[i][1]]) {
            ms.mines[path[i][0]][path[i][1]] = false;
            ms.mineCount--;
          }
        }
        document.getElementById('mineCounter').textContent = String(ms.mineCount).padStart(3, '0');
      }
    }

    // Recompute numbers
    for (var rr = 0; rr < G.rows; rr++) {
      for (var cc = 0; cc < G.cols; cc++) {
        ms.grid[rr][cc] = 0;
      }
    }
    G.computeNumbers(ms);
  };

  G.startMinesweeperTimer = function () {
    const ms = G.ms;
    ms.timerInterval = setInterval(function () {
      ms.seconds++;
      document.getElementById('timer').textContent = String(Math.min(ms.seconds, 999)).padStart(3, '0');
    }, 1000);
  };
})();
