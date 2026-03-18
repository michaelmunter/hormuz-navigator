// Map loading, ocean mask building, and pathfinding
(function () {
  const G = (window.Game = window.Game || {});

  G.CELL = 20;

  G.oceanImg = new Image();  // hormuz-ocean.png — blue ocean, transparent land
  G.landImg = new Image();   // hormuz-land.png — land terrain, transparent ocean
  // src is set in game.js after onload handler is attached

  // Source crop rectangle (pixels in the full-size image).
  // Adjust these to frame the strait within the oversized PNG.
  G.crop = { x: 0, y: 0, w: 0, h: 0 }; // 0 = use full image

  // Sprite images (loaded in game.js)
  G.sprites = {
    ship: new Image(),
    shahed: new Image(),
    fpv: new Image(),
    missile: new Image(),
    shahedExploding: new Image(),
    explosion: new Image(),
    missileOceanDrop: new Image()
  };

  G.cols = 0;
  G.rows = 0;
  G.oceanMask = null;

  // Build the ocean mask by sampling alpha from hormuz-land.png.
  // Where land is transparent (alpha < 128) = ocean cell.
  G.buildOceanMask = function (canvasW, canvasH) {
    var crop = G.crop;
    var sx = crop.x, sy = crop.y;
    var sw = crop.w || G.landImg.width, sh = crop.h || G.landImg.height;
    var tmp = document.createElement('canvas');
    tmp.width = canvasW;
    tmp.height = canvasH;
    var tctx = tmp.getContext('2d');
    tctx.drawImage(G.landImg, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
    var imgData = tctx.getImageData(0, 0, canvasW, canvasH);
    var d = imgData.data;

    G.oceanMask = [];
    for (var r = 0; r < G.rows; r++) {
      G.oceanMask[r] = [];
      for (var c = 0; c < G.cols; c++) {
        var transparentCount = 0, total = 0;
        for (var py = r * G.CELL + 2; py < (r + 1) * G.CELL - 2; py++) {
          for (var px = c * G.CELL + 2; px < (c + 1) * G.CELL - 2; px++) {
            var idx = (py * canvasW + px) * 4;
            if (d[idx + 3] < 128) transparentCount++;
            total++;
          }
        }
        G.oceanMask[r][c] = transparentCount / total > 0.7;
      }
    }
  };

  // Check if a mine-free path exists from left to right through ocean
  G.hasPath = function (mines) {
    const rows = G.rows, cols = G.cols, oceanMask = G.oceanMask;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const queue = [];
    for (let r = 0; r < rows; r++) {
      if (oceanMask[r][0] && !mines[r][0]) {
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
              !visited[nr][nc] && oceanMask[nr][nc] && !mines[nr][nc]) {
            visited[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
      }
    }
    return false;
  };

  // BFS through all ocean to find a carveable path (ignoring mines)
  G.findCarvePath = function () {
    const rows = G.rows, cols = G.cols;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const parent = Array.from({ length: rows }, () => Array(cols).fill(null));
    const queue = [];
    for (let r = 0; r < rows; r++) {
      if (G.oceanMask[r][0]) {
        queue.push([r, 0]);
        visited[r][0] = true;
      }
    }
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      if (c === cols - 1) {
        const path = [];
        let cur = [r, c];
        while (cur) { path.push(cur); cur = parent[cur[0]][cur[1]]; }
        return path;
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
              !visited[nr][nc] && G.oceanMask[nr][nc]) {
            visited[nr][nc] = true;
            parent[nr][nc] = [r, c];
            queue.push([nr, nc]);
          }
        }
      }
    }
    return null;
  };

  // Find shortest revealed path from left to right (for ship transit)
  G.findRevealedPath = function (revealed) {
    const rows = G.rows, cols = G.cols, oceanMask = G.oceanMask;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const parent = Array.from({ length: rows }, () => Array(cols).fill(null));
    const queue = [];
    for (let r = 0; r < rows; r++) {
      if (oceanMask[r][0] && revealed[r][0]) {
        queue.push([r, 0]);
        visited[r][0] = true;
      }
    }
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      if (c === cols - 1) {
        const path = [];
        let cur = [r, c];
        while (cur) { path.push(cur); cur = parent[cur[0]][cur[1]]; }
        return path.reverse();
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
              !visited[nr][nc] && oceanMask[nr][nc] && revealed[nr][nc]) {
            visited[nr][nc] = true;
            parent[nr][nc] = [r, c];
            queue.push([nr, nc]);
          }
        }
      }
    }
    return null;
  };

  // Get land cells adjacent to ocean on the Iranian (northern) side for missile spawns.
  // Includes: upper half of map, top edge, left edge above midpoint,
  // and right side except the bottom 15%.
  G.getLandEdgeCells = function () {
    const rows = G.rows, cols = G.cols, oceanMask = G.oceanMask;
    const cells = [];
    var midRow = Math.floor(rows * 0.5);
    var bottomCutoff = Math.floor(rows * 0.85);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!oceanMask[r][c]) {
          // Only Iranian side: upper half, or right side above bottom 15%
          var isIranianSide = r < midRow
            || (c > cols * 0.7 && r < bottomCutoff);
          if (!isIranianSide) continue;
          // Land cell — check if any neighbor is ocean
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && oceanMask[nr][nc]) {
                cells.push([r, c]);
                dr = 2; // break outer
                break;
              }
            }
          }
        }
      }
    }
    return cells;
  };
})();
