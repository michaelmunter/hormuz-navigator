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
  G.findRevealedPath = function (revealed) {
    const rows = G.rows, cols = G.cols, oceanMask = G.oceanMask;
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

    for (let r = 0; r < rows; r++) {
      if (oceanMask[r][0] && revealed[r][0]) {
        var c0 = 1 / (Math.max(1, dm[r][0]) + 1);
        cost[r][0] = c0;
        heapPush(c0, r, 0);
      }
    }

    while (heap.length > 0) {
      const [d, r, c] = heapPop();
      if (d > cost[r][c]) continue; // stale entry
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
