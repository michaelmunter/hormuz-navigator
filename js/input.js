// Input handling — mouse, touch, keyboard
(function () {
  const G = window.Game;

  // Hover state for minesweeper cells
  G.hoverCell = { r: -1, c: -1 };

  G.initInput = function () {
    const canvas = G.gameCanvas;

    // Mousemove — cursor + hover highlight on unrevealed cells
    canvas.addEventListener('mousemove', function (e) {
      if (G.state !== 'MINESWEEPER' || G.ms.gameOver) {
        canvas.style.cursor = 'default';
        return;
      }
      var rect = canvas.getBoundingClientRect();
      var c = Math.floor((e.clientX - rect.left) / G.CELL);
      var r = Math.floor((e.clientY - rect.top) / G.CELL);
      var prev = G.hoverCell;
      if (prev.r === r && prev.c === c) return;
      var oldR = prev.r, oldC = prev.c;
      G.hoverCell = { r: r, c: c };
      // Redraw old cell to remove highlight
      if (oldR >= 0 && oldR < G.rows && oldC >= 0 && oldC < G.cols && G.oceanMask[oldR][oldC] && !G.ms.revealed[oldR][oldC]) {
        G.drawCell(oldR, oldC);
      }
      // Update cursor and draw highlight on new cell
      if (r >= 0 && r < G.rows && c >= 0 && c < G.cols && G.canProbeCell && G.canProbeCell(r, c)) {
        canvas.style.cursor = 'crosshair';
        G.drawCell(r, c);
      } else {
        canvas.style.cursor = 'default';
      }
    });

    canvas.addEventListener('mouseleave', function () {
      var prev = G.hoverCell;
      G.hoverCell = { r: -1, c: -1 };
      if (prev.r >= 0 && prev.r < G.rows && prev.c >= 0 && prev.c < G.cols
          && G.oceanMask[prev.r][prev.c] && !G.ms.revealed[prev.r][prev.c]) {
        G.drawCell(prev.r, prev.c);
      }
      canvas.style.cursor = 'default';
    });

    // Mouse
    canvas.addEventListener('mousedown', function (e) {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const c = Math.floor(px / G.CELL);
      const r = Math.floor(py / G.CELL);

      // Transit phase: click to destroy shaheds
      if (G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
        if (e.button === 0) {
          G.handleTransitClick(px, py);
        }
        return;
      }

      // Minesweeper phase
      if (G.state !== 'MINESWEEPER') return;
      const ms = G.ms;
      if (ms.gameOver) return;
      if (ms.introActive) return;
      if (r < 0 || r >= G.rows || c < 0 || c >= G.cols || !G.oceanMask[r][c]) return;

      if (e.button !== 0) return;
      if (ms.flagged[r][c]) return;
      if (G.canProbeCell && !G.canProbeCell(r, c) && !ms.revealed[r][c]) return;

      // First click safety
      if (!ms.started) {
        ms.started = true;
        if (!G.shouldUseFirstClickSafety || G.shouldUseFirstClickSafety(ms)) {
          G.ensureFirstClickSafe(r, c);
        }
        G.startMinesweeperTimer();
      }

      if (ms.revealed[r][c]) {
        // Chord
        if (ms.grid[r][c] > 0) {
          let adjFlags = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < G.rows && nc >= 0 && nc < G.cols && ms.flagged[nr][nc]) adjFlags++;
            }
          }
          if (adjFlags === ms.grid[r][c]) {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < G.rows && nc >= 0 && nc < G.cols &&
                    !ms.flagged[nr][nc] && !ms.revealed[nr][nc] && G.oceanMask[nr][nc]) {
                  if (ms.mines[nr][nc]) {
                    G.onMineHit(nr, nc);
                    return;
                  }
                  if (!G.canProbeCell || G.canProbeCell(nr, nc)) G.revealCell(nr, nc);
                }
              }
            }
          }
        }
        if (!ms.gameOver && G.checkWin()) G.onMinesweeperWin();
        if (!ms.gameOver && G.savePlayer) G.savePlayer();
        return;
      }

      if (ms.mines[r][c]) {
        G.onMineHit(r, c);
        return;
      }

      G.revealCell(r, c);
      G.sounds.reveal();
      if (G.checkWin()) G.onMinesweeperWin();
      if (!ms.gameOver && G.savePlayer) G.savePlayer();
    });

    // Right-click flag toggle via contextmenu (more reliable than mousedown button===2)
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (G.state !== 'MINESWEEPER') return;
      var ms = G.ms;
      if (ms.gameOver) return;
      if (ms.introActive) return;
      var rect = canvas.getBoundingClientRect();
      var c = Math.floor((e.clientX - rect.left) / G.CELL);
      var r = Math.floor((e.clientY - rect.top) / G.CELL);
      if (r < 0 || r >= G.rows || c < 0 || c >= G.cols || !G.oceanMask[r][c]) return;
      if (ms.revealed[r][c]) return;
      ms.flagged[r][c] = !ms.flagged[r][c];
      ms.flagCount += ms.flagged[r][c] ? 1 : -1;
      document.getElementById('mineCounter').textContent =
        String(Math.max(0, ms.mineCount - ms.flagCount)).padStart(3, '0');
      G.drawCell(r, c);
      if (G.savePlayer) G.savePlayer();
      if (ms.flagged[r][c]) G.sounds.flag(); else G.sounds.unflag();
    });
    document.getElementById('boardWrap').addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // Touch support
    var touchTimer = null;
    var touchMoved = false;

    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      touchMoved = false;
      var touch = e.touches[0];
      var rect = canvas.getBoundingClientRect();
      var c = Math.floor((touch.clientX - rect.left) / G.CELL);
      var r = Math.floor((touch.clientY - rect.top) / G.CELL);

      // Transit phase: immediate tap to destroy shaheds
      if (G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
        G.handleTransitClick(touch.clientX - rect.left, touch.clientY - rect.top);
        return;
      }

      touchTimer = setTimeout(function () {
        touchTimer = null;
        if (touchMoved) return;
        var ms = G.ms;
        if (G.state !== 'MINESWEEPER' || ms.gameOver) return;
        if (ms.introActive) return;
        if (r >= 0 && r < G.rows && c >= 0 && c < G.cols &&
            G.oceanMask[r][c] && !ms.revealed[r][c]) {
          ms.flagged[r][c] = !ms.flagged[r][c];
          ms.flagCount += ms.flagged[r][c] ? 1 : -1;
          document.getElementById('mineCounter').textContent =
            String(Math.max(0, ms.mineCount - ms.flagCount)).padStart(3, '0');
          G.drawCell(r, c);
          if (G.savePlayer) G.savePlayer();
        }
      }, 400);
    }, { passive: false });

    canvas.addEventListener('touchmove', function () {
      touchMoved = true;
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    }, { passive: true });

    canvas.addEventListener('touchend', function (e) {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
        if (!touchMoved) {
          var touch = e.changedTouches[0];
          var synth = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0,
            bubbles: true
          });
          canvas.dispatchEvent(synth);
        }
      }
    }, { passive: true });

    // Keyboard
    document.addEventListener('keydown', function (e) {
      if (G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
        G.handleTransitKey(e.key);
        if (['ArrowUp', 'ArrowDown', 'w', 'W', 's', 'S', ' '].indexOf(e.key) !== -1) {
          e.preventDefault();
        }
      }
    });

    // Face indicator — show surprised face on mousedown during minesweeper
    var faceEl = document.getElementById('faceBtn');
    if (faceEl) {
      faceEl.addEventListener('mousedown', function () {
        if (G.state === 'MINESWEEPER' && !G.ms.gameOver) {
          faceEl.innerHTML = '&#128562;';
        }
      });
    }
  };
})();
