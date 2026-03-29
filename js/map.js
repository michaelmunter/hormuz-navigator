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
  G.gridOffsetX = 0; // pixel offset from canvas origin to grid top-left
  G.gridOffsetY = 0;
  G.gridW = 0; // grid pixel dimensions (cols * CELL)
  G.gridH = 0;

  // Cell center in canvas pixel space
  G.cellToPx = function (r, c) {
    return {
      x: G.gridOffsetX + c * G.CELL + G.CELL / 2,
      y: G.gridOffsetY + r * G.CELL + G.CELL / 2
    };
  };

  // Cell top-left corner in canvas pixel space
  G.cellTopLeft = function (r, c) {
    return {
      x: G.gridOffsetX + c * G.CELL,
      y: G.gridOffsetY + r * G.CELL
    };
  };

  G.oceanImg = new Image();  // hormuz-ocean.png — blue ocean, transparent land
  G.landImg = new Image();   // hormuz-land.png — land terrain, transparent ocean
  // src is set in game.js after onload handler is attached

  // Source crop rectangle (pixels in the full-size image).
  // Computed by getCropForTier() based on campaign escalation.
  G.crop = { x: 0, y: 0, w: 0, h: 0 }; // 0 = use full image

  // Map image is 3242x2401 (NASA Blue Marble crop of Persian Gulf).
  // Tier 0: tight on the Strait of Hormuz.
  // Tier 10: full Gulf from Kuwait to Gulf of Oman.
  // Interpolate linearly between these two endpoints.
  var CROP_TIGHT = { cx: 2200, cy: 1380, w: 1300, h: 780 }; // strait
  var CROP_WIDE  = { cx: 1621, cy: 1200, w: 3242, h: 1945 }; // full Gulf
  var IMG_W = 3242, IMG_H = 2401;

  G.getCropForTier = function (tier) {
    var t = Math.min(Math.max(tier || 0, 0), 10) / 10;
    var cx = Math.round(CROP_TIGHT.cx + (CROP_WIDE.cx - CROP_TIGHT.cx) * t);
    var cy = Math.round(CROP_TIGHT.cy + (CROP_WIDE.cy - CROP_TIGHT.cy) * t);
    var w  = Math.round(CROP_TIGHT.w  + (CROP_WIDE.w  - CROP_TIGHT.w)  * t);
    var h  = Math.round(CROP_TIGHT.h  + (CROP_WIDE.h  - CROP_TIGHT.h)  * t);
    // Clamp to image bounds
    var x = Math.max(0, Math.min(IMG_W - w, cx - Math.floor(w / 2)));
    var y = Math.max(0, Math.min(IMG_H - h, cy - Math.floor(h / 2)));
    return { x: x, y: y, w: w, h: h };
  };

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
  var OCEAN_MASK_INSET_RATIO = 0.12;
  var OCEAN_MASK_TRANSPARENCY_THRESHOLD = 0.92;
  var TRANSIT_DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];
  var TRANSIT_TURN_PENALTY = 0.08;
  var TRANSIT_COAST_BIAS = 0.18;

  function getTurnPenalty(fromDirIdx, toDirIdx) {
    // Sentinel index (TRANSIT_DIRECTIONS.length) = "no previous heading" = no turn cost
    if (fromDirIdx < 0 || toDirIdx < 0 || fromDirIdx === toDirIdx
        || fromDirIdx >= TRANSIT_DIRECTIONS.length) return 0;
    var diff = Math.abs(fromDirIdx - toDirIdx);
    diff = Math.min(diff, TRANSIT_DIRECTIONS.length - diff);
    return diff * TRANSIT_TURN_PENALTY;
  }

  function getTransitStepCost(dmValue, dr, dc) {
    var movementCost = (dr !== 0 && dc !== 0) ? Math.SQRT2 : 1;
    var coastCost = TRANSIT_COAST_BIAS / (Math.max(1, dmValue) + 1);
    return movementCost + coastCost;
  }

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
    var vc = G.viewportCrop;
    var tmp = document.createElement('canvas');
    tmp.width = canvasW;
    tmp.height = canvasH;
    var tctx = tmp.getContext('2d');
    tctx.drawImage(G.landImg, vc.x, vc.y, vc.w, vc.h, 0, 0, canvasW, canvasH);
    var imgData = tctx.getImageData(0, 0, canvasW, canvasH);
    var d = imgData.data;

    var ox = G.gridOffsetX, oy = G.gridOffsetY;
    G.oceanMask = [];
    for (var r = 0; r < G.rows; r++) {
      G.oceanMask[r] = [];
      for (var c = 0; c < G.cols; c++) {
        var transparentCount = 0, total = 0;
        var inset = Math.max(1, Math.round(G.CELL * OCEAN_MASK_INSET_RATIO));
        for (var py = oy + r * G.CELL + inset; py < oy + (r + 1) * G.CELL - inset; py++) {
          for (var px = ox + c * G.CELL + inset; px < ox + (c + 1) * G.CELL - inset; px++) {
            var idx = (py * canvasW + px) * 4;
            if (d[idx + 3] < 128) transparentCount++;
            total++;
          }
        }
        G.oceanMask[r][c] = transparentCount / total > OCEAN_MASK_TRANSPARENCY_THRESHOLD;
      }
    }
    // Post-process: remove isolated ocean cells (island tiles).
    // Any ocean cell with 5+ non-ocean neighbors is likely a tiny island — un-tile it.
    for (var r = 0; r < G.rows; r++) {
      for (var c = 0; c < G.cols; c++) {
        if (!G.oceanMask[r][c]) continue;
        var landN = 0;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= G.rows || nc < 0 || nc >= G.cols) continue; // skip out-of-bounds
            if (!G.oceanMask[nr][nc]) landN++;
          }
        }
        if (landN >= 5) G.oceanMask[r][c] = false;
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

  // Find revealed path from left to right that prefers shorter travel distance,
  // with coast clearance and turn smoothness as secondary biases.
  G.findRevealedPath = function (revealed, direction) {
    const rows = G.rows, cols = G.cols, oceanMask = G.oceanMask;
    var edges = G.getMinefieldEdges ? G.getMinefieldEdges(direction) : { exitCol: cols - 1 };
    if (!G.distanceMap) G.buildDistanceMap();
    const dm = G.distanceMap;

    const INF = 1e18;
    const cost = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => Array(TRANSIT_DIRECTIONS.length + 1).fill(INF))
    );
    const parent = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => Array(TRANSIT_DIRECTIONS.length + 1).fill(null))
    );

    // Simple priority queue (binary heap would be better but this is small enough)
    // Use a sorted insert array — the grid is at most ~60x40 = 2400 cells
    const heap = []; // [cost, r, c, dirIdx]
    function heapPush(c, r, col, dirIdx) {
      heap.push([c, r, col, dirIdx]);
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
      var c0 = 0;
      var startDirIdx = TRANSIT_DIRECTIONS.length;
      cost[r][c][startDirIdx] = c0;
      heapPush(c0, r, c, startDirIdx);
    }

    var bestEnd = null;

    while (heap.length > 0) {
      const [d, r, c, dirIdx] = heapPop();
      if (d > cost[r][c][dirIdx]) continue; // stale entry
      if (c === edges.exitCol) {
        bestEnd = [r, c, dirIdx];
        break;
      }
      for (let nextDirIdx = 0; nextDirIdx < TRANSIT_DIRECTIONS.length; nextDirIdx++) {
        const dr = TRANSIT_DIRECTIONS[nextDirIdx][0];
        const dc = TRANSIT_DIRECTIONS[nextDirIdx][1];
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
            oceanMask[nr][nc] && revealed[nr][nc]) {
          var stepCost = getTransitStepCost(dm[nr][nc], dr, dc);
          var turnCost = getTurnPenalty(dirIdx, nextDirIdx);
          var newCost = d + stepCost + turnCost;
          if (newCost < cost[nr][nc][nextDirIdx]) {
            cost[nr][nc][nextDirIdx] = newCost;
            parent[nr][nc][nextDirIdx] = [r, c, dirIdx];
            heapPush(newCost, nr, nc, nextDirIdx);
          }
        }
      }
    }

    if (bestEnd) {
        const path = [];
      let cur = bestEnd;
      while (cur) {
        path.push([cur[0], cur[1]]);
        cur = parent[cur[0]][cur[1]][cur[2]];
      }
        return path.reverse();
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
