// Lightweight tests for Hormuz Navigator game logic
// Run with: node test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Simulate the game's core logic (extracted from index.html)
// We test the algorithms, not the rendering.

function makeGrid(rows, cols, oceanPattern) {
  // oceanPattern: 2D array of booleans or a function(r, c) => bool
  const oceanMask = [];
  for (let r = 0; r < rows; r++) {
    oceanMask[r] = [];
    for (let c = 0; c < cols; c++) {
      oceanMask[r][c] = typeof oceanPattern === 'function'
        ? oceanPattern(r, c)
        : oceanPattern[r][c];
    }
  }
  return oceanMask;
}

function initMines(rows, cols) {
  return Array.from({length: rows}, () => Array(cols).fill(false));
}

function hasPath(rows, cols, oceanMask, mines) {
  const visited = Array.from({length: rows}, () => Array(cols).fill(false));
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
}

function findCarvePath(rows, cols, oceanMask) {
  const visited = Array.from({length: rows}, () => Array(cols).fill(false));
  const parent = Array.from({length: rows}, () => Array(cols).fill(null));
  const queue = [];
  for (let r = 0; r < rows; r++) {
    if (oceanMask[r][0]) {
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
            !visited[nr][nc] && oceanMask[nr][nc]) {
          visited[nr][nc] = true;
          parent[nr][nc] = [r, c];
          queue.push([nr, nc]);
        }
      }
    }
  }
  return null;
}

function computeNumbers(rows, cols, oceanMask, mines) {
  const grid = Array.from({length: rows}, () => Array(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!oceanMask[r][c] || mines[r][c]) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && mines[nr][nc]) count++;
        }
      }
      grid[r][c] = count;
    }
  }
  return grid;
}

function placeMinesWithPath(rows, cols, oceanMask, mineRatio) {
  const oceanCells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (oceanMask[r][c]) oceanCells.push([r, c]);

  const mines = initMines(rows, cols);
  let mineCount = Math.floor(oceanCells.length * mineRatio);

  const shuffled = oceanCells.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < mineCount; i++) {
    const [r, c] = shuffled[i];
    mines[r][c] = true;
  }

  if (!hasPath(rows, cols, oceanMask, mines)) {
    const path = findCarvePath(rows, cols, oceanMask);
    if (path) {
      for (const [r, c] of path) {
        if (mines[r][c]) { mines[r][c] = false; mineCount--; }
      }
    }
  }

  return { mines, mineCount };
}

// --- Tests ---

describe('hasPath', () => {
  it('finds path through open ocean', () => {
    const ocean = makeGrid(3, 5, () => true);
    const mines = initMines(3, 5);
    assert.equal(hasPath(3, 5, ocean, mines), true);
  });

  it('returns false when mines block all routes', () => {
    const ocean = makeGrid(3, 5, () => true);
    const mines = initMines(3, 5);
    // Block column 2 entirely
    for (let r = 0; r < 3; r++) mines[r][2] = true;
    assert.equal(hasPath(3, 5, ocean, mines), false);
  });

  it('finds diagonal path', () => {
    const ocean = makeGrid(3, 5, () => true);
    const mines = initMines(3, 5);
    // Block all of col 2 except allow diagonal
    mines[0][2] = true;
    mines[2][2] = true;
    // Row 1, col 2 is open — diagonal path exists
    assert.equal(hasPath(3, 5, ocean, mines), true);
  });

  it('respects land cells', () => {
    // Land wall in the middle
    const ocean = makeGrid(3, 5, (r, c) => c !== 2);
    const mines = initMines(3, 5);
    assert.equal(hasPath(3, 5, ocean, mines), false);
  });
});

describe('findCarvePath', () => {
  it('finds path through all-ocean grid', () => {
    const ocean = makeGrid(3, 5, () => true);
    const path = findCarvePath(3, 5, ocean);
    assert.ok(path);
    assert.ok(path.some(([, c]) => c === 0));
    assert.ok(path.some(([, c]) => c === 4));
  });

  it('returns null when land blocks all routes', () => {
    const ocean = makeGrid(3, 5, (r, c) => c !== 2);
    const path = findCarvePath(3, 5, ocean);
    assert.equal(path, null);
  });
});

describe('computeNumbers', () => {
  it('counts adjacent mines correctly', () => {
    const ocean = makeGrid(3, 3, () => true);
    const mines = initMines(3, 3);
    mines[0][0] = true;
    mines[2][2] = true;
    const grid = computeNumbers(3, 3, ocean, mines);
    // Center cell (1,1) should see both mines
    assert.equal(grid[1][1], 2);
    // (0,1) should see mine at (0,0) only
    assert.equal(grid[0][1], 1);
    // Mine cells stay 0
    assert.equal(grid[0][0], 0);
  });

  it('ignores land cells in count', () => {
    const ocean = makeGrid(3, 3, (r, c) => !(r === 0 && c === 0));
    const mines = initMines(3, 3);
    mines[0][1] = true;
    const grid = computeNumbers(3, 3, ocean, mines);
    // Land cell (0,0) stays 0 even though adjacent to mine
    assert.equal(grid[0][0], 0);
  });
});

describe('placeMinesWithPath', () => {
  it('always produces a solvable board', () => {
    // Run multiple times to test randomness
    for (let i = 0; i < 50; i++) {
      const ocean = makeGrid(10, 15, () => true);
      const { mines } = placeMinesWithPath(10, 15, ocean, 0.25);
      assert.equal(hasPath(10, 15, ocean, mines), true,
        `Iteration ${i}: no path found`);
    }
  });

  it('handles narrow strait (single row ocean)', () => {
    // Only middle row is ocean
    const ocean = makeGrid(5, 10, (r) => r === 2);
    const { mines } = placeMinesWithPath(5, 10, ocean, 0.25);
    assert.equal(hasPath(5, 10, ocean, mines), true);
  });

  it('places approximately the right number of mines', () => {
    const ocean = makeGrid(10, 15, () => true);
    const { mineCount } = placeMinesWithPath(10, 15, ocean, 0.25);
    const expected = Math.floor(150 * 0.25);
    // Should be close to expected (may be slightly less if carving was needed)
    assert.ok(mineCount <= expected, `Too many mines: ${mineCount}`);
    assert.ok(mineCount >= expected - 20, `Too few mines: ${mineCount}`);
  });
});
