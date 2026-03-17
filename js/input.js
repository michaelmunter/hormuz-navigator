// Input handling — mouse, touch, keyboard
(function () {
  const G = window.Game;

  G.initInput = function () {
    const canvas = G.gameCanvas;

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
      if (r < 0 || r >= G.rows || c < 0 || c >= G.cols || !G.oceanMask[r][c]) return;

      if (e.button !== 0) return;
      if (ms.flagged[r][c]) return;

      // First click safety
      if (!ms.started) {
        ms.started = true;
        G.ensureFirstClickSafe(r, c);
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
                  G.revealCell(nr, nc);
                }
              }
            }
          }
        }
        if (!ms.gameOver && G.checkWin()) G.onMinesweeperWin();
        return;
      }

      if (ms.mines[r][c]) {
        G.onMineHit(r, c);
        return;
      }

      G.revealCell(r, c);
      G.sounds.reveal();
      if (G.checkWin()) G.onMinesweeperWin();
    });

    // Right-click flag toggle via contextmenu (more reliable than mousedown button===2)
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (G.state !== 'MINESWEEPER') return;
      var ms = G.ms;
      if (ms.gameOver) return;
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
        if (r >= 0 && r < G.rows && c >= 0 && c < G.cols &&
            G.oceanMask[r][c] && !ms.revealed[r][c]) {
          ms.flagged[r][c] = !ms.flagged[r][c];
          ms.flagCount += ms.flagged[r][c] ? 1 : -1;
          document.getElementById('mineCounter').textContent =
            String(Math.max(0, ms.mineCount - ms.flagCount)).padStart(3, '0');
          G.drawCell(r, c);
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
        if (['ArrowUp', 'ArrowDown', ' '].indexOf(e.key) !== -1) {
          e.preventDefault();
        }
      }
    });

    // Face button
    document.getElementById('faceBtn').addEventListener('mousedown', function () {
      if (G.state === 'MINESWEEPER' && !G.ms.gameOver) {
        document.getElementById('faceBtn').innerHTML = '&#128562;';
      }
    });
  };
})();
