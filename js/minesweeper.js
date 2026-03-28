// Minesweeper phase logic — mine placement, reveal, flood fill, win check
(function () {
  const G = window.Game;
  const ENTRY_MAX_REVEAL_CELLS = 24;
  const ENTRY_MAX_CONTAINMENT_MINES = 4;
  const ENTRY_CONTAINMENT_CANDIDATE_LIMIT = 12;
  const ENTRY_MAX_INFO_REVEALS = 2;
  const ENTRY_OPENING_ATTEMPTS = 10;
  const ENTRY_MIN_SAFE_PROBES = 2;
  const ENTRY_FOOTHOLD_PROFILES = [
    {
      rowDepths: { '-1': 2, '0': 2, '1': 2 },
      maxRevealCells: 18,
      maxInfoReveals: 1
    },
    {
      rowDepths: { '-1': 1, '0': 2, '1': 1 },
      maxRevealCells: 15,
      maxInfoReveals: 2
    },
    {
      rowDepths: { '-2': 1, '-1': 2, '0': 3, '1': 2, '2': 1 },
      maxRevealCells: 20,
      maxInfoReveals: 0
    },
    {
      rowDepths: { '-1': 1, '0': 3, '1': 2 },
      maxRevealCells: 17,
      maxInfoReveals: 1
    },
    {
      rowDepths: { '-1': 2, '0': 3, '1': 1 },
      maxRevealCells: 17,
      maxInfoReveals: 1
    }
  ];

  function getMinefieldObjectiveText() {
    return G.getMinefieldDirection && G.getMinefieldDirection() === 'return'
      ? 'Expand from secured water. Clear a path from right to left!'
      : 'Expand from secured water. Clear a path from left to right!';
  }

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
    timerInterval: null,
    pendingClearedMine: null,
    fadingMine: null,
    entryFootholdCenter: null,
    entryFootholdProfile: null
  };

  G.initMinesweeper = function (mineRatio) {
    const ms = G.ms;
    const rows = G.rows, cols = G.cols;

    ms.gameOver = false;
    ms.gameWon = false;
    ms.started = false;
    ms.seconds = 0;
    ms.flagCount = 0;
    ms.introActive = false;
    ms.pendingClearedMine = null;
    ms.fadingMine = null;
    ms.entryFootholdCenter = null;
    ms.entryFootholdProfile = null;
    clearInterval(ms.timerInterval);

    document.getElementById('timer').textContent = '000';
    document.getElementById('faceBtn').innerHTML = '&#128578;';
    G.setStatus(getMinefieldObjectiveText(), '');

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

    G.generateStarterOpening(oceanCells, ms, mineRatio);

    G.drawBoard();
    G.playMinesweeperIntro();
    G.savePlayer();
  };

  G.getMinesweeperSnapshot = function () {
    var ms = G.ms;
    return {
      grid: ms.grid,
      mines: ms.mines,
      revealed: ms.revealed,
      flagged: ms.flagged,
      gameOver: ms.gameOver,
      gameWon: ms.gameWon,
      mineCount: ms.mineCount,
      flagCount: ms.flagCount,
      started: ms.started,
      seconds: ms.seconds,
      pendingClearedMine: ms.pendingClearedMine,
      fadingMine: null,
      entryFootholdCenter: ms.entryFootholdCenter
    };
  };

  G.restoreMinesweeper = function (snapshot) {
    if (!snapshot) return;
    var ms = G.ms;
    clearInterval(ms.timerInterval);
    ms.grid = snapshot.grid;
    ms.mines = snapshot.mines;
    ms.revealed = snapshot.revealed;
    ms.flagged = snapshot.flagged;
    ms.gameOver = !!snapshot.gameOver;
    ms.gameWon = !!snapshot.gameWon;
    ms.mineCount = snapshot.mineCount || 0;
    ms.flagCount = snapshot.flagCount || 0;
    ms.started = !!snapshot.started;
    ms.seconds = snapshot.seconds || 0;
    ms.introActive = false;
    ms.pendingClearedMine = snapshot.pendingClearedMine || null;
    ms.fadingMine = null;
    ms.entryFootholdCenter = snapshot.entryFootholdCenter || null;
    ms.entryFootholdProfile = null;
    document.getElementById('mineCounter').textContent =
      String(Math.max(0, ms.mineCount - ms.flagCount)).padStart(3, '0');
    document.getElementById('timer').textContent = String(Math.min(ms.seconds, 999)).padStart(3, '0');
    document.getElementById('faceBtn').innerHTML = ms.gameOver
      ? (ms.gameWon ? '&#128526;' : '&#128560;')
      : '&#128578;';
    G.setStatus(getMinefieldObjectiveText(), '');
    G.drawBoard();
    if (ms.started && !ms.gameOver) G.startMinesweeperTimer();
  };

  G.playMinesweeperIntro = function () {
    var ms = G.ms;
    var center = G.findEntryFootholdCenter();
    if (!center || !G.sctx || !G.activeShip) return;
    var edges = G.getMinefieldEdges ? G.getMinefieldEdges() : { entryCol: 0 };

    ms.introActive = true;
    var startX = edges.entryCol === G.cols - 1 ? (G.cols + 0.8) * G.CELL : -G.CELL * 1.8;
    var targetX = center[1] * G.CELL + G.CELL / 2;
    var targetY = center[0] * G.CELL + G.CELL / 2;
    var startTime = performance.now();
    var duration = 650;

    function tick(now) {
      var t = Math.min(1, (now - startTime) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      var x = startX + (targetX - startX) * eased;

      G.sctx.clearRect(0, 0, G.spriteCanvas.width, G.spriteCanvas.height);
      G.drawShip(x, targetY, 0);

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        ms.introActive = false;
        G.drawMinesweeperEntryShip();
      }
    }

    requestAnimationFrame(tick);
  };

  G.drawMinesweeperEntryShip = function () {
    var center = G.findEntryFootholdCenter();
    if (!center || !G.sctx || !G.activeShip) return;
    var edges = G.getMinefieldEdges ? G.getMinefieldEdges() : { entryCol: 0 };
    var x = center[1] * G.CELL + G.CELL / 2;
    var y = center[0] * G.CELL + G.CELL / 2;
    var angle = edges.entryCol === G.cols - 1 ? Math.PI : 0;
    G.drawShip(x, y, angle);
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

  G.getMinefieldDirection = function () {
    var stage = (G.voyage && G.voyage.stages && G.voyage.stageIdx >= 0)
      ? G.voyage.stages[G.voyage.stageIdx]
      : null;
    return stage && stage.id === 'mines_ret' ? 'return' : 'forward';
  };

  G.getMinefieldEdges = function (direction) {
    var travelDirection = direction || G.getMinefieldDirection();
    if (travelDirection === 'return') {
      return { entryCol: G.cols - 1, exitCol: 0, inwardStep: -1 };
    }
    return { entryCol: 0, exitCol: G.cols - 1, inwardStep: 1 };
  };

  G.findEntryFootholdCenter = function (direction) {
    if (G.ms && G.ms.entryFootholdCenter) return G.ms.entryFootholdCenter;
    var entryCol = G.getMinefieldEdges ? G.getMinefieldEdges(direction).entryCol : 0;
    var targetRow = Math.floor(G.rows / 2);
    for (var offset = 0; offset < G.rows; offset++) {
      var up = targetRow - offset;
      if (up >= 0 && G.oceanMask[up][entryCol]) return [up, entryCol];
      var down = targetRow + offset;
      if (offset > 0 && down < G.rows && G.oceanMask[down][entryCol]) return [down, entryCol];
    }
    return null;
  };

  G.pickEntryFootholdCenter = function (direction) {
    var entryCol = G.getMinefieldEdges ? G.getMinefieldEdges(direction).entryCol : 0;
    var candidates = [];
    for (var r = 0; r < G.rows; r++) {
      if (G.oceanMask[r][entryCol]) candidates.push([r, entryCol]);
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  function cloneRowDepths(rowDepths) {
    var copy = {};
    var keys = Object.keys(rowDepths || {});
    for (var i = 0; i < keys.length; i++) copy[keys[i]] = rowDepths[keys[i]];
    return copy;
  }

  G.pickEntryFootholdProfile = function () {
    var template = ENTRY_FOOTHOLD_PROFILES[Math.floor(Math.random() * ENTRY_FOOTHOLD_PROFILES.length)];
    var rowDepths = cloneRowDepths(template.rowDepths);
    if (Math.random() < 0.5) {
      var mirrored = {};
      var keys = Object.keys(rowDepths);
      for (var i = 0; i < keys.length; i++) mirrored[String(-Number(keys[i]))] = rowDepths[keys[i]];
      rowDepths = mirrored;
    }
    return {
      rowDepths: rowDepths,
      maxRevealCells: template.maxRevealCells + Math.floor(Math.random() * 3),
      maxInfoReveals: Math.max(0, Math.min(ENTRY_MAX_INFO_REVEALS, template.maxInfoReveals + Math.floor(Math.random() * 2)))
    };
  };

  function resetMinefieldArrays(ms) {
    for (var r = 0; r < G.rows; r++) {
      for (var c = 0; c < G.cols; c++) {
        ms.grid[r][c] = 0;
        ms.mines[r][c] = false;
        ms.revealed[r][c] = false;
        ms.flagged[r][c] = false;
      }
    }
    ms.flagCount = 0;
    ms.pendingClearedMine = null;
    ms.fadingMine = null;
  }

  G.generateStarterOpening = function (oceanCells, ms, mineRatio) {
    var targetMineCount = Math.floor(oceanCells.length * mineRatio);
    var accepted = false;

    for (var attempt = 0; attempt < ENTRY_OPENING_ATTEMPTS; attempt++) {
      resetMinefieldArrays(ms);
      ms.mineCount = targetMineCount;
      ms.entryFootholdCenter = G.pickEntryFootholdCenter();
      ms.entryFootholdProfile = G.pickEntryFootholdProfile();

      G.placeMines(oceanCells, ms);
      G.seedEntryFoothold(ms);
      G.computeNumbers(ms);
      G.containEntryFootholdReveal(ms);
      G.revealEntryFoothold(ms);

      if (G.isStarterOpeningAcceptable(ms)) {
        accepted = true;
        break;
      }
    }

    if (!accepted) {
      G.ensureStarterIntel(ms);
    }
  };

  function getEntryFootholdCells(center, profile) {
    var cells = [];
    if (!center) return cells;
    var inwardStep = G.getMinefieldEdges ? G.getMinefieldEdges().inwardStep : 1;
    var rowDepths = (profile && profile.rowDepths) || { '-1': 2, '0': 2, '1': 2 };
    var offsets = Object.keys(rowDepths);
    for (var i = 0; i < offsets.length; i++) {
      var rowOffset = Number(offsets[i]);
      var depth = rowDepths[offsets[i]];
      for (var dc = 0; dc <= depth; dc++) {
        var nr = center[0] + rowOffset;
        var nc = center[1] + (dc * inwardStep);
        if (nr < 0 || nr >= G.rows || nc < 0 || nc >= G.cols) continue;
        if (!G.oceanMask[nr][nc]) continue;
        cells.push([nr, nc]);
      }
    }
    return cells;
  }

  G.seedEntryFoothold = function (ms) {
    var center = G.findEntryFootholdCenter();
    if (!center) return;

    var removed = 0;
    var footholdCells = getEntryFootholdCells(center, ms.entryFootholdProfile);
    for (var i = 0; i < footholdCells.length; i++) {
      var nr = footholdCells[i][0];
      var nc = footholdCells[i][1];
      if (ms.mines[nr][nc]) {
        ms.mines[nr][nc] = false;
        removed++;
      }
    }

    if (removed > 0) {
      ms.mineCount -= removed;
      document.getElementById('mineCounter').textContent = String(ms.mineCount).padStart(3, '0');
    }

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
  };

  function isEntryFootholdCell(center, r, c) {
    if (!center) return false;
    var footholdCells = getEntryFootholdCells(center, G.ms && G.ms.entryFootholdProfile);
    for (var i = 0; i < footholdCells.length; i++) {
      if (footholdCells[i][0] === r && footholdCells[i][1] === c) return true;
    }
    return false;
  }

  function collectSimulatedReveal(ms, startR, startC) {
    var revealed = [];
    var seen = Array.from({ length: G.rows }, function () {
      return Array(G.cols).fill(false);
    });
    var stack = [[startR, startC]];

    while (stack.length) {
      var cell = stack.pop();
      var r = cell[0];
      var c = cell[1];
      if (r < 0 || r >= G.rows || c < 0 || c >= G.cols) continue;
      if (seen[r][c] || !G.oceanMask[r][c] || ms.mines[r][c]) continue;

      seen[r][c] = true;
      revealed.push([r, c]);

      if (ms.grid[r][c] !== 0) continue;

      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          stack.push([r + dr, c + dc]);
        }
      }
    }

    return revealed;
  }

  function getContainmentCandidates(ms, revealedCells, center) {
    var zeroCandidates = [];
    var fallbackCandidates = [];
    var seen = Array.from({ length: G.rows }, function () {
      return Array(G.cols).fill(false);
    });

    for (var i = 0; i < revealedCells.length; i++) {
      var r = revealedCells[i][0];
      var c = revealedCells[i][1];
      if (!G.oceanMask[r][c] || ms.mines[r][c] || isEntryFootholdCell(center, r, c)) continue;
      if (seen[r][c]) continue;
      seen[r][c] = true;
      if (ms.grid[r][c] === 0) zeroCandidates.push([r, c]);
      else fallbackCandidates.push([r, c]);
    }

    function sortByDistance(a, b) {
      var aDist = Math.abs(a[0] - center[0]) + Math.abs(a[1] - center[1]);
      var bDist = Math.abs(b[0] - center[0]) + Math.abs(b[1] - center[1]);
      return aDist - bDist;
    }

    zeroCandidates.sort(sortByDistance);
    fallbackCandidates.sort(sortByDistance);

    return zeroCandidates.length ? zeroCandidates : fallbackCandidates;
  }

  function evaluateContainmentPlacement(ms, center, placement) {
    for (var i = 0; i < placement.length; i++) {
      ms.mines[placement[i][0]][placement[i][1]] = true;
    }

    if (!G.hasPath(ms.mines)) {
      for (var j = 0; j < placement.length; j++) {
        ms.mines[placement[j][0]][placement[j][1]] = false;
      }
      return null;
    }

    G.computeNumbers(ms);
    var revealedCells = collectSimulatedReveal(ms, center[0], center[1]);

    for (var k = 0; k < placement.length; k++) {
      ms.mines[placement[k][0]][placement[k][1]] = false;
    }

    return revealedCells;
  }

  function findBestContainmentPlacement(ms, revealedCells, center) {
    var baseline = revealedCells.length;
    var candidates = getContainmentCandidates(ms, revealedCells, center).slice(0, ENTRY_CONTAINMENT_CANDIDATE_LIMIT);
    var best = null;
    var bestReduction = 0;

    for (var i = 0; i < candidates.length; i++) {
      var singlePlacement = [candidates[i]];
      var singleReveal = evaluateContainmentPlacement(ms, center, singlePlacement);
      if (singleReveal) {
        var singleReduction = baseline - singleReveal.length;
        if (singleReduction > bestReduction) {
          bestReduction = singleReduction;
          best = singlePlacement.slice();
        }
      }

      for (var j = i + 1; j < candidates.length; j++) {
        var pairPlacement = [candidates[i], candidates[j]];
        var pairReveal = evaluateContainmentPlacement(ms, center, pairPlacement);
        if (!pairReveal) continue;
        var pairReduction = baseline - pairReveal.length;
        if (pairReduction > bestReduction) {
          bestReduction = pairReduction;
          best = pairPlacement.slice();
        }
      }
    }

    G.computeNumbers(ms);
    return best;
  }

  function updateMineCounter(ms) {
    document.getElementById('mineCounter').textContent =
      String(Math.max(0, ms.mineCount - ms.flagCount)).padStart(3, '0');
  }

  G.containEntryFootholdReveal = function (ms) {
    var center = G.findEntryFootholdCenter();
    if (!center) return;

    var revealedCells = collectSimulatedReveal(ms, center[0], center[1]);
    var maxRevealCells = (ms.entryFootholdProfile && ms.entryFootholdProfile.maxRevealCells) || ENTRY_MAX_REVEAL_CELLS;
    if (revealedCells.length <= maxRevealCells) return;

    var added = 0;
    var guard = 0;

    while (revealedCells.length > maxRevealCells && guard < 6 && added < ENTRY_MAX_CONTAINMENT_MINES) {
      var bestPlacement = findBestContainmentPlacement(ms, revealedCells, center);
      if (!bestPlacement || !bestPlacement.length) break;
      var remainingBudget = ENTRY_MAX_CONTAINMENT_MINES - added;
      if (bestPlacement.length > remainingBudget) {
        bestPlacement = bestPlacement.slice(0, remainingBudget);
      }
      for (var i = 0; i < bestPlacement.length; i++) {
        ms.mines[bestPlacement[i][0]][bestPlacement[i][1]] = true;
      }
      ms.mineCount += bestPlacement.length;
      added += bestPlacement.length;
      G.computeNumbers(ms);
      revealedCells = collectSimulatedReveal(ms, center[0], center[1]);
      guard++;
    }

    if (added > 0) updateMineCounter(ms);
  };

  function getHiddenNeighbors(ms, r, c) {
    var hidden = [];
    var flagged = 0;
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr;
        var nc = c + dc;
        if (nr < 0 || nr >= G.rows || nc < 0 || nc >= G.cols) continue;
        if (!G.oceanMask[nr][nc]) continue;
        if (ms.flagged[nr][nc]) {
          flagged++;
        } else if (!ms.revealed[nr][nc]) {
          hidden.push([nr, nc]);
        }
      }
    }
    return { hidden: hidden, flagged: flagged };
  }

  function getDeterministicStarterSafeProbes(ms) {
    var simulatedFlagged = Array.from({ length: G.rows }, function (_, r) {
      return ms.flagged[r].slice();
    });
    var safeMap = Array.from({ length: G.rows }, function () {
      return Array(G.cols).fill(false);
    });
    var changed = true;

    function getNeighborsForState(r, c) {
      var hidden = [];
      var flagged = 0;
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          var nr = r + dr;
          var nc = c + dc;
          if (nr < 0 || nr >= G.rows || nc < 0 || nc >= G.cols) continue;
          if (!G.oceanMask[nr][nc]) continue;
          if (simulatedFlagged[nr][nc]) {
            flagged++;
          } else if (!ms.revealed[nr][nc]) {
            hidden.push([nr, nc]);
          }
        }
      }
      return { hidden: hidden, flagged: flagged };
    }

    while (changed) {
      changed = false;
      for (var r = 0; r < G.rows; r++) {
        for (var c = 0; c < G.cols; c++) {
          if (ms.revealed[r][c] !== true || ms.mines[r][c] || ms.grid[r][c] < 0) continue;
          var neighbors = getNeighborsForState(r, c);
          if (!neighbors.hidden.length) continue;
          var remainingMines = ms.grid[r][c] - neighbors.flagged;
          if (remainingMines < 0) continue;

          if (remainingMines === 0) {
            for (var i = 0; i < neighbors.hidden.length; i++) {
              var safe = neighbors.hidden[i];
              if (!safeMap[safe[0]][safe[1]]) {
                safeMap[safe[0]][safe[1]] = true;
                changed = true;
              }
            }
          } else if (remainingMines === neighbors.hidden.length) {
            for (var j = 0; j < neighbors.hidden.length; j++) {
              var mine = neighbors.hidden[j];
              if (!simulatedFlagged[mine[0]][mine[1]]) {
                simulatedFlagged[mine[0]][mine[1]] = true;
                changed = true;
              }
            }
          }
        }
      }
    }

    var safeProbes = [];
    for (var rr = 0; rr < G.rows; rr++) {
      for (var cc = 0; cc < G.cols; cc++) {
        if (safeMap[rr][cc] && G.canProbeCell(rr, cc)) safeProbes.push([rr, cc]);
      }
    }
    return safeProbes;
  }

  function hasImmediateSafeFrontierProbe(ms) {
    return getDeterministicStarterSafeProbes(ms).length > 0;
  }

  function hasInitialDeterministicMineFlag(ms) {
    for (var r = 0; r < G.rows; r++) {
      for (var c = 0; c < G.cols; c++) {
        if (ms.revealed[r][c] !== true || ms.mines[r][c] || ms.grid[r][c] <= 0) continue;
        var neighbors = getHiddenNeighbors(ms, r, c);
        if (!neighbors.hidden.length) continue;
        if (ms.grid[r][c] - neighbors.flagged === neighbors.hidden.length) return true;
      }
    }
    return false;
  }

  function getStarterInfoCandidates(ms, center) {
    var candidates = [];
    var seen = Array.from({ length: G.rows }, function () {
      return Array(G.cols).fill(false);
    });

    for (var r = 0; r < G.rows; r++) {
      for (var c = 0; c < G.cols; c++) {
        if (!G.canProbeCell(r, c) || ms.mines[r][c] || seen[r][c]) continue;
        seen[r][c] = true;
        candidates.push([r, c]);
      }
    }

    candidates.sort(function (a, b) {
      var aZeroPenalty = ms.grid[a[0]][a[1]] === 0 ? 1 : 0;
      var bZeroPenalty = ms.grid[b[0]][b[1]] === 0 ? 1 : 0;
      if (aZeroPenalty !== bZeroPenalty) return aZeroPenalty - bZeroPenalty;

      var aDist = Math.abs(a[0] - center[0]) + Math.abs(a[1] - center[1]);
      var bDist = Math.abs(b[0] - center[0]) + Math.abs(b[1] - center[1]);
      if (aDist !== bDist) return aDist - bDist;

      return ms.grid[a[0]][a[1]] - ms.grid[b[0]][b[1]];
    });

    return candidates;
  }

  G.ensureStarterIntel = function (ms) {
    var center = G.findEntryFootholdCenter();
    if (!center || getDeterministicStarterSafeProbes(ms).length >= ENTRY_MIN_SAFE_PROBES) return;

    var reveals = 0;
    var maxInfoReveals = ms.entryFootholdProfile && typeof ms.entryFootholdProfile.maxInfoReveals === 'number'
      ? ms.entryFootholdProfile.maxInfoReveals
      : ENTRY_MAX_INFO_REVEALS;
    while (getDeterministicStarterSafeProbes(ms).length < ENTRY_MIN_SAFE_PROBES && reveals < maxInfoReveals) {
      var deterministicCandidates = getDeterministicStarterSafeProbes(ms);
      var candidates = deterministicCandidates.length ? deterministicCandidates : getStarterInfoCandidates(ms, center);
      if (!candidates.length) break;
      G.revealCell(candidates[0][0], candidates[0][1]);
      reveals++;
    }
  };

  G.revealEntryFoothold = function (ms) {
    var center = G.findEntryFootholdCenter();
    if (!center) return;
    G.revealCell(center[0], center[1]);
    G.ensureStarterIntel(ms);
  };

  G.shouldUseFirstClickSafety = function (ms) {
    for (var r = 0; r < G.rows; r++) {
      for (var c = 0; c < G.cols; c++) {
        if (G.oceanMask[r][c] && ms.revealed[r][c] === true) return false;
      }
    }
    return true;
  };

  G.isStarterOpeningAcceptable = function (ms) {
    if (!ms || !G.findEntryFootholdCenter()) return false;
    return getDeterministicStarterSafeProbes(ms).length >= ENTRY_MIN_SAFE_PROBES && !hasInitialDeterministicMineFlag(ms);
  };

  G.canProbeCell = function (r, c) {
    var ms = G.ms;
    if (r < 0 || r >= G.rows || c < 0 || c >= G.cols) return false;
    if (!G.oceanMask[r][c] || ms.revealed[r][c] || ms.flagged[r][c]) return false;

    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < G.rows && nc >= 0 && nc < G.cols && ms.revealed[nr][nc] === true) {
          return true;
        }
      }
    }
    return false;
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
    var edges = G.getMinefieldEdges ? G.getMinefieldEdges() : { entryCol: 0, exitCol: cols - 1 };
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const queue = [];
    var center = G.findEntryFootholdCenter();

    if (center && G.oceanMask[center[0]][center[1]] && ms.revealed[center[0]][center[1]]) {
      queue.push([center[0], center[1]]);
      visited[center[0]][center[1]] = true;
    }

    if (!queue.length && center) {
      for (let dr = -1; dr <= 1; dr++) {
        const r = center[0] + dr, c = center[1];
        if (r >= 0 && r < rows && c >= 0 && c < cols && G.oceanMask[r][c] && ms.revealed[r][c]) {
          queue.push([r, c]);
          visited[r][c] = true;
        }
      }
    }

    if (!queue.length) {
      for (let r = 0; r < rows; r++) {
        if (G.oceanMask[r][edges.entryCol] && ms.revealed[r][edges.entryCol]) {
          queue.push([r, edges.entryCol]);
          visited[r][edges.entryCol] = true;
        }
      }
    }

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      if (c === edges.exitCol) return true;
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
      ms.pendingClearedMine = { r: r, c: c };
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
    if (G.updateCrewActions) G.updateCrewActions();

    G.sounds.minesweeperWin();

    // Build distance map and compute the transit route
    G.buildDistanceMap();
    var path = G.findRevealedPath(ms.revealed);
    if (path) {
      G.setStatus('Route plotted! Preparing to set sail...', 'win-msg');
    }

    // Brief delay so the win beat lands, then draw the route on the solved board
    // before handing off to transit.
    setTimeout(function () {
      G.animateRoutePlot(path, function () {
        G.transitionMinesToTransit(path);
      });
    }, 180);
  };

  G.resolvePendingClearedMine = function () {
    var ms = G.ms;
    if (!ms.pendingClearedMine) return;

    var r = ms.pendingClearedMine.r;
    var c = ms.pendingClearedMine.c;
    ms.pendingClearedMine = null;
    ms.mines[r][c] = false;
    ms.revealed[r][c] = true;
    G.computeNumbers(ms);
    ms.fadingMine = { r: r, c: c, startedAt: performance.now(), duration: 420 };

    function tick(now) {
      if (!ms.fadingMine) return;
      if (now - ms.fadingMine.startedAt >= ms.fadingMine.duration) {
        ms.fadingMine = null;
        G.drawBoard();
        G.savePlayer();
        return;
      }
      G.drawBoard();
      requestAnimationFrame(tick);
    }

    G.drawBoard();
    requestAnimationFrame(tick);
    G.savePlayer();
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
