// Map loading, ocean mask building, and pathfinding
(function () {
  const G = (window.Game = window.Game || {});
  var DEV_FLAGS_KEY = "hormuz_dev_flags";

  function getHostname() {
    if (typeof window !== "undefined" && window.location && window.location.hostname) {
      return window.location.hostname;
    }
    if (typeof location !== "undefined" && location.hostname) {
      return location.hostname;
    }
    return "";
  }

  G.isLocalDevHost = function () {
    var hostname = getHostname();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  };

  function readStoredDevFlags() {
    try {
      var raw = localStorage.getItem(DEV_FLAGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  G.getDefaultDevFlags = function () {
    var enabled = G.isLocalDevHost();
    return {
      enabled: enabled,
      disablePersistence: enabled,
      disableServiceWorker: enabled,
      hotkeys: enabled,
      revealMines: false,
      skipMinesweeper: false,
      skipTransit: false,
      logStarterOpenings: enabled
    };
  };

  G.devFlags = Object.assign(
    {},
    G.getDefaultDevFlags(),
    readStoredDevFlags(),
    (typeof window !== "undefined" && window.__HORMUZ_DEV_FLAGS__) || {}
  );

  G.setDevFlags = function (overrides) {
    G.devFlags = Object.assign({}, G.devFlags || G.getDefaultDevFlags(), overrides || {});
    if (typeof window !== "undefined") {
      window.__HORMUZ_DEV_FLAGS__ = Object.assign({}, G.devFlags);
      window.hormuzDevFlags = G.devFlags;
    }
    try {
      localStorage.setItem(DEV_FLAGS_KEY, JSON.stringify(G.devFlags));
    } catch (e) {}
    return Object.assign({}, G.devFlags);
  };

  if (typeof window !== "undefined") {
    window.__HORMUZ_DEV_FLAGS__ = Object.assign({}, G.devFlags);
    window.hormuzDevFlags = G.devFlags;
    window.setHormuzDevFlags = function (overrides) {
      return G.setDevFlags(overrides);
    };
  }

  // Grid dimensions are driven by authored campaign/map tiers rather than
  // week-by-week time passing. Keep the on-screen board stable unless an
  // explicit map escalation beat changes the framing.
  G.MIN_GRID_COLS = 35;
  G.MAX_GRID_COLS = 45;
  G.GRID_RATIO = 5 / 3; // cols / rows ≈ 1.667, matches map aspect ratio
  G.MAP_ZOOM_SCALE = 0.88; // 12% tighter than the raw authored crop sizes

  G.getGridSize = function (tier) {
    var t = Math.min(tier || 0, 10);
    var cols = Math.round(G.MIN_GRID_COLS + (G.MAX_GRID_COLS - G.MIN_GRID_COLS) * (t / 10));
    var focusPort = G.getMapFocusPortName ? G.getMapFocusPortName() : null;
    if (focusPort === 'Fujairah') cols = Math.max(18, cols - 8);
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

  // Map image is 5423x3025 (NASA Blue Marble crop of Persian Gulf).
  // Tier 0: tight on the Strait of Hormuz.
  // Tier 10: full Gulf from Kuwait to Gulf of Oman.
  // Interpolate linearly between these two endpoints.
  var CROP_TIGHT = { cx: 3680, cy: 1740, w: 2175, h: 985 }; // strait
  var CROP_WIDE  = { cx: 2712, cy: 1512, w: 5423, h: 2450 }; // full Gulf
  var IMG_W = 5423, IMG_H = 3025;
  G.MAP_IMAGE_W = IMG_W;
  G.MAP_IMAGE_H = IMG_H;

  G.getCropForTier = function (tier) {
    var t = Math.min(Math.max(tier || 0, 0), 10) / 10;
    var cx = Math.round(CROP_TIGHT.cx + (CROP_WIDE.cx - CROP_TIGHT.cx) * t);
    var cy = Math.round(CROP_TIGHT.cy + (CROP_WIDE.cy - CROP_TIGHT.cy) * t);
    var w  = Math.round((CROP_TIGHT.w  + (CROP_WIDE.w  - CROP_TIGHT.w)  * t) * G.MAP_ZOOM_SCALE);
    var h  = Math.round((CROP_TIGHT.h  + (CROP_WIDE.h  - CROP_TIGHT.h)  * t) * G.MAP_ZOOM_SCALE);
    // Clamp to image bounds
    var x = Math.max(0, Math.min(IMG_W - w, cx - Math.floor(w / 2)));
    var y = Math.max(0, Math.min(IMG_H - h, cy - Math.floor(h / 2)));
    return { x: x, y: y, w: w, h: h };
  };

  G.getCropForContext = function (tier) {
    var portCrop = G.getPortBoardCrop ? G.getPortBoardCrop() : null;
    if (portCrop) {
      return {
        x: portCrop.x,
        y: portCrop.y,
        w: portCrop.w,
        h: portCrop.h
      };
    }
    return G.getCropForTier(tier);
  };

  G.applyViewportFraming = function (viewportCrop) {
    var framing = G.getPortViewportFraming ? G.getPortViewportFraming() : null;
    var panX = framing && typeof framing.panX === 'number' ? framing.panX : 0;
    var panY = framing && typeof framing.panY === 'number' ? framing.panY : 0;
    var framed = {
      x: viewportCrop.x + panX,
      y: viewportCrop.y + panY,
      w: viewportCrop.w,
      h: viewportCrop.h
    };

    if (framed.w < IMG_W) {
      framed.x = Math.max(0, Math.min(IMG_W - framed.w, framed.x));
    }
    if (framed.h < IMG_H) {
      framed.y = Math.max(0, Math.min(IMG_H - framed.h, framed.y));
    }
    return framed;
  };

  G.mapPointToCanvas = function (sourceX, sourceY, canvasW, canvasH) {
    var vc = G.viewportCrop;
    if (!vc || !vc.w || !vc.h) return null;
    return {
      x: ((sourceX - vc.x) / vc.w) * canvasW,
      y: ((sourceY - vc.y) / vc.h) * canvasH
    };
  };

  G.getPortCanvasPoint = function (portName, canvasW, canvasH) {
    if (!G.getPortByName || !G.mapPointToCanvas) return null;
    var port = G.getPortByName(portName);
    if (!port) return null;
    return G.mapPointToCanvas(port.x, port.y, canvasW, canvasH);
  };

  G.getPortOffscreenPoint = function (portName, canvasW, canvasH, padding) {
    var portPt = G.getPortCanvasPoint ? G.getPortCanvasPoint(portName, canvasW, canvasH) : null;
    if (!portPt) return null;
    var pad = padding || 48;
    var distances = [
      { edge: 'left', value: portPt.x },
      { edge: 'right', value: canvasW - portPt.x },
      { edge: 'top', value: portPt.y },
      { edge: 'bottom', value: canvasH - portPt.y }
    ];
    distances.sort(function (a, b) { return a.value - b.value; });
    var edge = distances[0].edge;
    if (edge === 'left') return { x: -pad, y: portPt.y, edge: edge };
    if (edge === 'right') return { x: canvasW + pad, y: portPt.y, edge: edge };
    if (edge === 'top') return { x: portPt.x, y: -pad, edge: edge };
    return { x: portPt.x, y: canvasH + pad, edge: edge };
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
  var OCEAN_MASK_OUTER_INSET_RATIO = 0.06;
  var OCEAN_MASK_OUTER_TRANSPARENCY_THRESHOLD = 0.58;
  var OCEAN_MASK_CENTER_RADIUS_RATIO = 0.16;
  var OCEAN_MASK_CENTER_TRANSPARENCY_THRESHOLD = 0.98;
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

  function getPortTargetRow(portName) {
    if (!portName || !G.viewportCrop || !G.getPortByName) return null;
    var port = G.getPortByName(portName);
    if (!port) return null;
    var normalizedY = (port.y - G.viewportCrop.y) / G.viewportCrop.h;
    if (!isFinite(normalizedY)) return null;
    return Math.max(0, Math.min(G.rows - 1, Math.round(normalizedY * (G.rows - 1))));
  }

  function getMinefieldTargetCells(direction) {
    var dir = direction || (G.getMinefieldDirection ? G.getMinefieldDirection() : 'forward');
    var targets = [];
    var useAuthoredTargets = !!(G.getPortCameraCrop && G.getPortCameraCrop());

    if (!useAuthoredTargets || dir !== 'return') {
      var fallbackEdges = G.getMinefieldEdges ? G.getMinefieldEdges(dir) : { exitCol: G.cols - 1 };
      var fallbackRows = getSortedEdgeRows(dir, fallbackEdges.exitCol);
      for (var fi = 0; fi < fallbackRows.length; fi++) {
        targets.push([fallbackRows[fi], fallbackEdges.exitCol]);
      }
      return targets;
    }

    if (dir === 'return' && G.findEntryFootholdCenter) {
      var anchor = G.findEntryFootholdCenter('forward', false);
      if (anchor) {
        var localTargets = [
          [anchor[0], anchor[1]],
          [anchor[0] + 1, anchor[1]]
        ];
        for (var i = 0; i < localTargets.length; i++) {
          var tr = localTargets[i][0], tc = localTargets[i][1];
          if (tr >= 0 && tr < G.rows && tc >= 0 && tc < G.cols && G.oceanMask[tr][tc]) {
            targets.push([tr, tc]);
          }
        }
        if (targets.length) return targets;
      }
    }
    return targets;
  }
  G.getMinefieldTargetCells = getMinefieldTargetCells;

  function getSortedEdgeRows(direction, edgeCol) {
    var rows = [];
    for (var r = 0; r < G.rows; r++) {
      if (G.oceanMask[r][edgeCol]) rows.push(r);
    }
    if (!rows.length) return rows;
    var targetPort = G.getVoyageArrivalPortName ? G.getVoyageArrivalPortName(direction) : null;
    var targetRow = getPortTargetRow(targetPort);
    if (targetRow === null || targetRow === undefined) return rows;
    rows.sort(function (a, b) {
      return Math.abs(a - targetRow) - Math.abs(b - targetRow);
    });
    return rows;
  }

  function sampleTransparencyStats(readAlpha, startX, startY, endX, endY) {
    var transparentCount = 0;
    var total = 0;
    for (var py = startY; py < endY; py++) {
      for (var px = startX; px < endX; px++) {
        if (readAlpha(px, py) < 128) transparentCount++;
        total++;
      }
    }
    return {
      transparentCount: transparentCount,
      total: total,
      ratio: total ? transparentCount / total : 0
    };
  }

  // A cell is playable when its number-safe center is effectively all water
  // and the surrounding footprint still contains a healthy amount of water.
  G.classifyOceanTile = function (readAlpha, startX, startY, cellSize) {
    var outerInset = Math.max(1, Math.round(cellSize * OCEAN_MASK_OUTER_INSET_RATIO));
    var outerStartX = startX + outerInset;
    var outerStartY = startY + outerInset;
    var outerEndX = startX + cellSize - outerInset;
    var outerEndY = startY + cellSize - outerInset;
    var outerStats = sampleTransparencyStats(
      readAlpha,
      outerStartX,
      outerStartY,
      outerEndX,
      outerEndY
    );
    if (!outerStats.total || outerStats.ratio < OCEAN_MASK_OUTER_TRANSPARENCY_THRESHOLD) {
      return false;
    }

    var centerRadius = Math.max(2, Math.round(cellSize * OCEAN_MASK_CENTER_RADIUS_RATIO));
    var centerX = startX + Math.floor(cellSize / 2);
    var centerY = startY + Math.floor(cellSize / 2);
    var centerStats = sampleTransparencyStats(
      readAlpha,
      Math.max(startX, centerX - centerRadius),
      Math.max(startY, centerY - centerRadius),
      Math.min(startX + cellSize, centerX + centerRadius),
      Math.min(startY + cellSize, centerY + centerRadius)
    );
    return centerStats.total > 0 &&
      centerStats.ratio >= OCEAN_MASK_CENTER_TRANSPARENCY_THRESHOLD;
  };

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
        var startX = ox + c * G.CELL;
        var startY = oy + r * G.CELL;
        G.oceanMask[r][c] = G.classifyOceanTile(function (px, py) {
          var idx = (py * canvasW + px) * 4;
          return d[idx + 3];
        }, startX, startY, G.CELL);
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
    var direction = G.getMinefieldDirection ? G.getMinefieldDirection() : 'forward';
    var targetCells = getMinefieldTargetCells(direction);
    var targetLookup = {};
    for (var ti = 0; ti < targetCells.length; ti++) targetLookup[targetCells[ti][0] + ',' + targetCells[ti][1]] = true;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const queue = [];
    const seeds = getEntrySeedCells(function (r, c) { return !mines[r][c]; }, direction, true);
    for (let i = 0; i < seeds.length; i++) {
      const r = seeds[i][0], c = seeds[i][1];
      queue.push([r, c]);
      visited[r][c] = true;
    }
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      if (targetLookup[r + ',' + c]) return true;
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
    var direction = G.getMinefieldDirection ? G.getMinefieldDirection() : 'forward';
    var targetCells = getMinefieldTargetCells(direction);
    var targetLookup = {};
    for (var ti = 0; ti < targetCells.length; ti++) targetLookup[targetCells[ti][0] + ',' + targetCells[ti][1]] = true;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const parent = Array.from({ length: rows }, () => Array(cols).fill(null));
    const queue = [];
    const seeds = getEntrySeedCells(function () { return true; }, direction, true);
    for (let i = 0; i < seeds.length; i++) {
      const r = seeds[i][0], c = seeds[i][1];
      queue.push([r, c]);
      visited[r][c] = true;
    }
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      if (targetLookup[r + ',' + c]) {
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
    var targetCells = getMinefieldTargetCells(direction);
    var targetLookup = {};
    for (var ti = 0; ti < targetCells.length; ti++) targetLookup[targetCells[ti][0] + ',' + targetCells[ti][1]] = true;
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
      if (targetLookup[r + ',' + c]) {
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
