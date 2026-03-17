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
    const shuffled = oceanCells.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < ms.mineCount; i++) {
      const [r, c] = shuffled[i];
      ms.mines[r][c] = true;
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

  G.onMineHit = function (r, c) {
    const ms = G.ms;
    ms.gameOver = true;
    clearInterval(ms.timerInterval);
    ms.revealed[r][c] = 'boom';
    document.getElementById('faceBtn').innerHTML = '&#128565;';
    G.setStatus('BOOM! Ship sunk. Try again.', 'lose-msg');
    G.sounds.mineExplode();

    for (let rr = 0; rr < G.rows; rr++) {
      for (let cc = 0; cc < G.cols; cc++) {
        if (ms.mines[rr][cc] || (ms.flagged[rr][cc] && !ms.mines[rr][cc])) {
          G.drawCell(rr, cc);
        }
      }
    }
  };

  G.onMinesweeperWin = function () {
    const ms = G.ms;
    ms.gameWon = true;
    ms.gameOver = true;
    clearInterval(ms.timerInterval);
    document.getElementById('faceBtn').innerHTML = '&#128526;';

    G.sounds.minesweeperWin();
    // Transition to transit phase
    G.startTransit('forward');
  };

  // First-click safety: move mine away from first click, then re-verify path
  G.ensureFirstClickSafe = function (r, c) {
    const ms = G.ms;
    if (!ms.mines[r][c]) return;

    ms.mines[r][c] = false;
    // Place mine elsewhere (not adjacent to first click)
    outer:
    for (let rr = 0; rr < G.rows; rr++) {
      for (let cc = 0; cc < G.cols; cc++) {
        if (G.oceanMask[rr][cc] && !ms.mines[rr][cc] && !(rr === r && cc === c)) {
          if (Math.abs(rr - r) > 1 || Math.abs(cc - c) > 1) {
            ms.mines[rr][cc] = true;
            break outer;
          }
        }
      }
    }

    // Re-verify path — the moved mine may have landed on the carved path
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
    for (let rr = 0; rr < G.rows; rr++) {
      for (let cc = 0; cc < G.cols; cc++) {
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
