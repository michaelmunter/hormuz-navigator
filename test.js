// Production-backed tests for Hormuz Navigator game logic
// Run with: node test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SCRIPT_ORDER = [
  'js/map.js',
  'js/ships.js',
  'js/roles.js',
  'js/crew.js',
  'js/game.js',
  'js/dock.js',
  'js/transit.js',
  'js/minesweeper.js'
];

function createClassList() {
  const classes = new Set();
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    toggle(name, force) {
      if (force === undefined) {
        if (classes.has(name)) {
          classes.delete(name);
          return false;
        }
        classes.add(name);
        return true;
      }
      if (force) classes.add(name);
      else classes.delete(name);
      return force;
    },
    contains(name) { return classes.has(name); }
  };
}

function createElement(tagName = 'div') {
  return {
    tagName: tagName.toUpperCase(),
    style: {},
    className: '',
    classList: createClassList(),
    children: [],
    listeners: new Map(),
    parentNode: null,
    textContent: '',
    innerHTML: '',
    offsetWidth: 120,
    width: 0,
    height: 0,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter(function (candidate) {
        return candidate !== child;
      });
      child.parentNode = null;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      if (this.listeners.has(type)) this.listeners.get(type).delete(handler);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, bottom: 0, width: 160, height: 40 };
    },
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getContext() {
      return {
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }),
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        arc() {},
        fill() {},
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        scale() {},
        fillText() {},
        strokeText() {}
      };
    }
  };
}

function createRuntime() {
  const elements = new Map();
  const documentListeners = new Map();

  function getOrCreateElement(id) {
    if (!elements.has(id)) elements.set(id, createElement(id.indexOf('Canvas') !== -1 ? 'canvas' : 'div'));
    return elements.get(id);
  }

  const document = {
    body: createElement('body'),
    createElement,
    getElementById: getOrCreateElement,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, new Set());
      documentListeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      if (documentListeners.has(type)) documentListeners.get(type).delete(handler);
    },
    getListenerCount(type) {
      return documentListeners.has(type) ? documentListeners.get(type).size : 0;
    }
  };

  class FakeImage {
    constructor() {
      this.onload = null;
      this.width = 0;
      this.height = 0;
      this._src = '';
    }

    set src(value) {
      this._src = value;
    }

    get src() {
      return this._src;
    }
  }

  const localStorageStore = new Map();
  const context = vm.createContext({
    console,
    Math,
    Uint8ClampedArray,
    window: { Game: {}, innerWidth: 1280, innerHeight: 720 },
    document,
    Image: FakeImage,
    localStorage: {
      getItem(key) { return localStorageStore.has(key) ? localStorageStore.get(key) : null; },
      setItem(key, value) { localStorageStore.set(key, String(value)); },
      removeItem(key) { localStorageStore.delete(key); }
    },
    navigator: { serviceWorker: { register() { return Promise.resolve(); } } },
    performance: { now() { return 0; } },
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {}
  });

  context.window.document = document;
  context.window.navigator = context.navigator;
  context.window.localStorage = context.localStorage;
  context.window.performance = context.performance;
  context.window.requestAnimationFrame = context.requestAnimationFrame;
  context.window.cancelAnimationFrame = context.cancelAnimationFrame;
  context.window.setTimeout = context.setTimeout;
  context.window.clearTimeout = context.clearTimeout;
  context.window.setInterval = context.setInterval;
  context.window.clearInterval = context.clearInterval;

  for (const script of SCRIPT_ORDER) {
    const source = fs.readFileSync(script, 'utf8');
    vm.runInContext(source, context, { filename: script });
  }

  const G = context.window.Game;
  G.ensureStartingCrew = function () {};
  G.sounds = {
    transitComplete() {},
    cargoLoad() {},
    cargoSell() {},
    missileImpact() {},
    missileIncoming() {},
    minesweeperWin() {},
    reveal() {},
    flag() {},
    unflag() {},
    mineExplode() {},
    shipDestroyed() {},
    speedChange() {},
    shahedDestroyed() {}
  };

  return { context, window: context.window, document, G };
}

function setBoard(G, oceanMask) {
  G.rows = oceanMask.length;
  G.cols = oceanMask[0].length;
  G.oceanMask = oceanMask;
  G.distanceMap = null;
}

function makeGrid(rows, cols, value) {
  return Array.from({ length: rows }, function (_, r) {
    return Array.from({ length: cols }, function (_, c) {
      return typeof value === 'function' ? value(r, c) : value;
    });
  });
}

describe('production map logic', () => {
  it('finds a path through open water', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(3, 5, true));
    const mines = makeGrid(3, 5, false);
    assert.equal(G.hasPath(mines), true);
  });

  it('returns a revealed route from left to right', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(3, 5, true));
    const revealed = makeGrid(3, 5, true);
    const path = G.findRevealedPath(revealed);
    assert.ok(path);
    assert.equal(path[0][1], 0);
    assert.equal(path[path.length - 1][1], 4);
  });

  it('returns a revealed route from right to left for the return leg', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(3, 5, true));
    const revealed = makeGrid(3, 5, true);
    const path = G.findRevealedPath(revealed, 'return');
    assert.ok(path);
    assert.equal(path[0][1], 4);
    assert.equal(path[path.length - 1][1], 0);
  });

  it('computes adjacent mine numbers through the shipped minesweeper code', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(3, 3, true));
    const ms = {
      mines: makeGrid(3, 3, false),
      grid: makeGrid(3, 3, 0)
    };
    ms.mines[0][0] = true;
    ms.mines[2][2] = true;
    G.computeNumbers(ms);
    assert.equal(ms.grid[1][1], 2);
    assert.equal(ms.grid[0][1], 1);
  });

  it('allows probing from any previously cleared area', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(5, 5, true));
    G.ms = {
      revealed: makeGrid(5, 5, false),
      flagged: makeGrid(5, 5, false)
    };

    G.ms.revealed[2][0] = true;
    G.ms.revealed[0][2] = true;

    assert.equal(G.canProbeCell(2, 1), true);
    assert.equal(G.canProbeCell(0, 3), true);
    assert.equal(G.canProbeCell(4, 4), false);
  });

  it('contains oversized opening reveals with real mines', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(9, 9, true));
    G.drawCell = function () {};
    const ms = {
      mines: makeGrid(9, 9, false),
      grid: makeGrid(9, 9, 0),
      revealed: makeGrid(9, 9, false),
      flagged: makeGrid(9, 9, false),
      mineCount: 0,
      flagCount: 0
    };
    G.ms = ms;

    G.seedEntryFoothold(ms);
    G.computeNumbers(ms);
    G.containEntryFootholdReveal(ms);
    G.revealEntryFoothold(ms);

    let revealedCount = 0;
    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        if (ms.revealed[r][c] === true) revealedCount++;
      }
    }

    assert.ok(revealedCount <= 24);
    assert.ok(ms.mineCount > 0);
    assert.equal(G.hasPath(ms.mines), true);
  });
});

describe('shared ship state', () => {
  it('repairs using the shared repair flow and syncs transit HP', () => {
    const { G, window } = createRuntime();
    G.player = {
      bank: 999999999,
      crew: [],
      ownedShips: [{ tier: 2, hp: 1 }],
      activeShipIdx: 0
    };
    G.transit = { hp: 1, maxHp: 3 };
    G.renderDock = function () {};
    G.renderShipButton = function () {};
    G.updateMapStageCard = function () {};
    const repairCost = G.getRepairCost(G.getActivePlayerShip());

    window.repairShip();

    assert.equal(G.player.bank, 999999999 - repairCost);
    assert.equal(G.player.ownedShips[0].hp, 3);
    assert.equal(G.transit.hp, 3);
  });

  it('syncs transit damage back to the owned ship when a leg completes', () => {
    const { G } = createRuntime();
    G.player = {
      bank: 999999999,
      crew: [],
      ownedShips: [{ tier: 2, hp: 3 }],
      activeShipIdx: 0
    };
    G.transit = {
      active: true,
      animFrame: 1,
      transitTimerInterval: 1,
      direction: 'forward',
      hp: 1
    };
    G.advanceStage = function () {};

    G.onTransitComplete();

    assert.equal(G.player.ownedShips[0].hp, 1);
  });

  it('uses one ship-purchase path for buy and upgrade actions', () => {
    const { G, window } = createRuntime();
    G.player = {
      bank: 999999999,
      crew: [],
      ownedShips: [{ tier: 1, hp: 1 }],
      activeShipIdx: 0
    };
    G.renderDock = function () {};
    G.renderTacticalCrewBar = function () {};
    G.renderShipButton = function () {};
    G.updateMapStageCard = function () {};

    window.upgradeShip(2);
    window.buyShip(3);

    assert.equal(G.player.ownedShips.length, 3);
    assert.equal(G.player.ownedShips[1].tier, 2);
    assert.equal(G.player.ownedShips[2].tier, 3);
    assert.equal(G.player.activeShipIdx, 2);
  });

  it('persists minesweeper state during an active mine-clearing stage', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(3, 4, true));
    G.player = G.createFreshPlayer();
    G.voyage = G.createFreshVoyage();
    G.voyage.stages = [{ id: 'mines_fwd' }];
    G.voyage.stageIdx = 0;
    G.ms = {
      grid: makeGrid(3, 4, 0),
      mines: makeGrid(3, 4, false),
      revealed: makeGrid(3, 4, false),
      flagged: makeGrid(3, 4, false),
      gameOver: false,
      gameWon: false,
      mineCount: 3,
      flagCount: 1,
      started: true,
      seconds: 12
    };
    G.ms.revealed[1][1] = true;
    G.ms.flagged[0][2] = true;

    G.savePlayer();

    G.player = null;
    G.voyage = null;
    G.savedMinesweeper = null;
    G.loadPlayer();

    assert.ok(G.savedMinesweeper);
    assert.equal(G.savedMinesweeper.revealed[1][1], true);
    assert.equal(G.savedMinesweeper.flagged[0][2], true);
    assert.equal(G.savedMinesweeper.seconds, 12);
  });

  it('keeps the same hire offers for the whole port visit', () => {
    const { G } = createRuntime();
    G.player = G.createFreshPlayer();
    G.player.availableHirePool = [0, 1, 2];
    G.player.currentHirePool = [0, 1, 2];
    G.player.portVisitId = 4;
    G.player.hirePoolVisitId = 4;

    const first = Array.from(G.getHireCandidates(3), function (c) { return c.id; });
    const second = Array.from(G.getHireCandidates(3), function (c) { return c.id; });

    assert.deepEqual(first, [0, 1, 2]);
    assert.deepEqual(second, [0, 1, 2]);
  });

  it('removes hired crew from the global pool permanently while leaving interns infinite', () => {
    const { G } = createRuntime();
    G.player = G.createFreshPlayer();
    G.player.bank = 999999999;
    G.player.availableHirePool = [0, 1, 2];
    G.player.currentHirePool = [0, 1, 2];
    G.player.portVisitId = 2;
    G.player.hirePoolVisitId = 2;

    assert.equal(G.confirmHireForRole(1, 'Captain'), true);
    assert.deepEqual(Array.from(G.player.availableHirePool), [0, 2]);
    assert.deepEqual(Array.from(G.player.currentHirePool).sort(function (a, b) { return a - b; }), [0, 2]);

    G.refreshHirePoolForPort();

    assert.deepEqual(Array.from(G.player.currentHirePool).sort(function (a, b) { return a - b; }), [0, 2]);
    assert.equal(G.confirmHireForRole(G.INTERN_CHARACTER_ID, 'Swimmer'), true);
    assert.deepEqual(Array.from(G.player.availableHirePool), [0, 2]);
  });
});

describe('dock listener lifecycle', () => {
  it('binds the outside-click ship handler only once across rerenders', () => {
    const { G, document } = createRuntime();
    G.player = {
      bank: 999999999,
      turn: 0,
      crew: [],
      ownedShips: [{ tier: 1, hp: 1 }],
      activeShipIdx: 0
    };
    G.renderTacticalCrewBar = function () {};

    const baseline = document.getListenerCount('click');
    G.renderDock();
    G.renderDock();

    assert.equal(document.getListenerCount('click'), baseline + 1);
  });
});
