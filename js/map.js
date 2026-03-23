// Map loading, ocean mask building, and pathfinding
(function () {
  const G = (window.Game = window.Game || {});

  // Grid dimensions are driven by authored campaign/map tiers rather than
  // week-by-week time passing. Keep the on-screen board stable unless an
  // explicit map escalation beat changes the framing.
  G.MIN_GRID_COLS = 35;
  G.MAX_GRID_COLS = 45;
  G.GRID_RATIO = 5 / 3; // cols / rows ≈ 1.667, matches map aspect ratio

  G.getGridSize = function (tier) {
    var t = Math.min(tier || 0, 10);
    var cols = Math.round(G.MIN_GRID_COLS + (G.MAX_GRID_COLS - G.MIN_GRID_COLS) * (t / 10));
    var rows = Math.round(cols / G.GRID_RATIO);
    return { cols: cols, rows: rows };
  };

  G.CELL = 20; // default, recomputed in initBoard()

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
    explosion: new Image(),
    missileOceanDrop: new Image()
  };

  G.cols = 0;
  G.rows = 0;
  G.oceanMask = null;

  function getEntrySeedCells(canUseCell, direction, exactOnly) {
    var edges = G.getMinefieldEdges ? G.getMinefieldEdges(direction) : { entryCol: 0 };
    var seeds = [];
    if (G.findEntryFootholdCenter) {
      var center = G.findEntryFootholdCenter(direction);
      if (center) {
        if (exactOnly) {
          if (G.oceanMask[center[0]][center[1]] && canUseCell(center[0], center[1])) {
            seeds.push([center[0], center[1]]);
          }
        } else {
          for (var dr = -1; dr <= 1; dr++) {
            var nr = center[0] + dr, nc = center[1];
            if (nr >= 0 && nr < G.rows && nc >= 0 && nc < G.cols &&
                G.oceanMask[nr][nc] && canUseCell(nr, nc)) {
              seeds.push([nr, nc]);
            }
          }
        }
      }
    }
    if (seeds.length) return seeds;

    for (var r = 0; r < G.rows; r++) {
      if (G.oceanMask[r][edges.entryCol] && canUseCell(r, edges.entryCol)) seeds.push([r, edges.entryCol]);
    }
    return seeds;
  }

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
        var inset = Math.max(1, Math.round(G.CELL * 0.1));
        for (var py = r * G.CELL + inset; py < (r + 1) * G.CELL - inset; py++) {
          for (var px = c * G.CELL + inset; px < (c + 1) * G.CELL - inset; px++) {
            var idx = (py * canvasW + px) * 4;
            if (d[idx + 3] < 128) transparentCount++;
            total++;
          }
        }
        G.oceanMask[r][c] = transparentCount / total > 0.95;
      }
    }
  };

  // Check if a mine-free path exists from left to right through ocean
  G.hasPath = function (mines) {
    const rows = G.rows, cols = G.cols, oceanMask = G.oceanMask;
    var edges = G.getMinefieldEdges ? G.getMinefieldEdges() : { exitCol: cols - 1 };
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const queue = [];
    const seeds = getEntrySeedCells(function (r, c) { return !mines[r][c]; }, null, true);
    for (let i = 0; i < seeds.length; i++) {
      const r = seeds[i][0], c = seeds[i][1];
      queue.push([r, c]);
      visited[r][c] = true;
    }
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      if (c === edges.exitCol) return true;
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
    var edges = G.getMinefieldEdges ? G.getMinefieldEdges() : { exitCol: cols - 1 };
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const parent = Array.from({ length: rows }, () => Array(cols).fill(null));
    const queue = [];
    const seeds = getEntrySeedCells(function () { return true; }, null, true);
    for (let i = 0; i < seeds.length; i++) {
      const r = seeds[i][0], c = seeds[i][1];
      queue.push([r, c]);
      visited[r][c] = true;
    }
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      if (c === edges.exitCol) {
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

  // Build distance-from-land map: BFS from all land/edge cells.
  // Each ocean cell gets the minimum Chebyshev distance to the nearest non-ocean cell.
  G.buildDistanceMap = function () {
    const rows = G.rows, cols = G.cols, oceanMask = G.oceanMask;
    const dist = Array.from({ length: rows }, () => Array(cols).fill(0));
    const queue = [];
    // Seed: all non-ocean cells and border cells have distance 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!oceanMask[r][c]) {
          queue.push([r, c]);
        } else if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
          // Ocean cells at the canvas edge are near "coast" too
          dist[r][c] = 1;
          queue.push([r, c]);
        } else {
          dist[r][c] = -1; // unvisited ocean
        }
      }
    }
    // BFS outward
    let head = 0;
    while (head < queue.length) {
      const [r, c] = queue[head++];
      const nd = dist[r][c] + 1;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && dist[nr][nc] === -1) {
            dist[nr][nc] = nd;
            queue.push([nr, nc]);
          }
        }
      }
    }
    G.distanceMap = dist;
  };

  // Find revealed path from left to right that maximizes distance from coast.
  // Uses Dijkstra with cost = 1 / (distFromLand + 1), so cells far from land are cheaper.
  G.findRevealedPath = function (revealed, direction) {
    const rows = G.rows, cols = G.cols, oceanMask = G.oceanMask;
    var edges = G.getMinefieldEdges ? G.getMinefieldEdges(direction) : { exitCol: cols - 1 };
    if (!G.distanceMap) G.buildDistanceMap();
    const dm = G.distanceMap;

    const INF = 1e18;
    const cost = Array.from({ length: rows }, () => Array(cols).fill(INF));
    const parent = Array.from({ length: rows }, () => Array(cols).fill(null));

    // Simple priority queue (binary heap would be better but this is small enough)
    // Use a sorted insert array — the grid is at most ~60x40 = 2400 cells
    const heap = []; // [cost, r, c]
    function heapPush(c, r, col) {
      heap.push([c, r, col]);
      // bubble up
      let i = heap.length - 1;
      while (i > 0) {
        const pi = (i - 1) >> 1;
        if (heap[pi][0] <= heap[i][0]) break;
        var tmp = heap[pi]; heap[pi] = heap[i]; heap[i] = tmp;
        i = pi;
      }
    }
    function heapPop() {
      if (heap.length === 1) return heap.pop();
      const top = heap[0];
      heap[0] = heap.pop();
      let i = 0;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1, ri = 2 * i + 2;
        if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
        if (ri < heap.length && heap[ri][0] < heap[smallest][0]) smallest = ri;
        if (smallest === i) break;
        var tmp = heap[smallest]; heap[smallest] = heap[i]; heap[i] = tmp;
        i = smallest;
      }
      return top;
    }

    const seeds = getEntrySeedCells(function (r, c) { return !!revealed[r][c]; }, direction, true);
    for (let i = 0; i < seeds.length; i++) {
      const r = seeds[i][0], c = seeds[i][1];
      var c0 = 1 / (Math.max(1, dm[r][c]) + 1);
      cost[r][c] = c0;
      heapPush(c0, r, c);
    }

    while (heap.length > 0) {
      const [d, r, c] = heapPop();
      if (d > cost[r][c]) continue; // stale entry
      if (c === edges.exitCol) {
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
              oceanMask[nr][nc] && revealed[nr][nc]) {
            var stepCost = 1 / (Math.max(1, dm[nr][nc]) + 1);
            var newCost = d + stepCost;
            if (newCost < cost[nr][nc]) {
              cost[nr][nc] = newCost;
              parent[nr][nc] = [r, c];
              heapPush(newCost, nr, nc);
            }
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
