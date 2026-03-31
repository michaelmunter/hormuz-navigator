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
  'js/worldmap.js',
  'js/campaign.js',
  'js/game.js',
  'js/news.js',
  'js/dock.js',
  'js/transit.js',
  'js/minesweeper.js',
  'js/input.js'
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

function createRuntime(options = {}) {
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
  if (options.stubStartingCrew !== false) {
    G.ensureStartingCrew = function () {};
  }
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

  it('prefers a straighter transit route over a zigzag with only slight clearance gains', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(3, 5, true));
    const revealed = makeGrid(3, 5, true);
    G.distanceMap = [
      [1, 10, 1, 10, 1],
      [3, 3, 3, 3, 3],
      [1, 1, 1, 1, 1]
    ];
    G.findEntryFootholdCenter = function () {
      return [1, 0];
    };

    const path = G.findRevealedPath(revealed);

    assert.ok(path);
    assert.deepEqual(Array.from(path, function (cell) { return cell[0]; }), [1, 1, 1, 1, 1]);
  });

  it('prefers a shorter route when the safer route is significantly longer', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(5, 5, true));
    const revealed = makeGrid(5, 5, false);
    var safeRoute = [
      [2, 0], [1, 1], [0, 2], [1, 3], [2, 4]
    ];
    var shortRoute = [
      [2, 0], [2, 1], [2, 2], [2, 3], [2, 4]
    ];
    for (const cell of safeRoute.concat(shortRoute)) {
      revealed[cell[0]][cell[1]] = true;
    }
    G.distanceMap = [
      [1, 1, 12, 1, 1],
      [1, 12, 12, 12, 1],
      [3, 3, 3, 3, 3],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1]
    ];
    G.findEntryFootholdCenter = function () {
      return [2, 0];
    };

    const path = G.findRevealedPath(revealed);

    assert.ok(path);
    assert.deepEqual(Array.from(path, function (cell) { return cell[0]; }), [2, 2, 2, 2, 2]);
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

  it('does not apply first-click safety after the starter opening is already revealed', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(3, 3, true));
    const ms = {
      revealed: makeGrid(3, 3, false)
    };

    assert.equal(G.shouldUseFirstClickSafety(ms), true);

    ms.revealed[1][0] = true;

    assert.equal(G.shouldUseFirstClickSafety(ms), false);
  });

  it('rejects starter openings that begin with only forced mine-flag logic', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(3, 3, true));
    const ms = {
      mines: makeGrid(3, 3, false),
      grid: makeGrid(3, 3, 0),
      revealed: makeGrid(3, 3, false),
      flagged: makeGrid(3, 3, false)
    };
    ms.revealed[1][0] = true;
    ms.revealed[0][0] = true;
    ms.revealed[2][0] = true;
    ms.grid[1][0] = 1;
    ms.grid[0][0] = 1;
    ms.grid[2][0] = 1;
    G.ms = ms;
    G.findEntryFootholdCenter = function () {
      return [1, 0];
    };

    assert.equal(G.isStarterOpeningAcceptable(ms), false);
  });

  it('rejects starter openings with only one deterministic safe probe', () => {
    const { G } = createRuntime();
    setBoard(G, [
      [true, true, false],
      [false, false, false],
      [false, false, false]
    ]);
    const ms = {
      mines: makeGrid(3, 3, false),
      grid: makeGrid(3, 3, 0),
      revealed: makeGrid(3, 3, false),
      flagged: makeGrid(3, 3, false)
    };
    ms.grid[0][0] = 0;
    ms.revealed[0][0] = true;
    G.ms = ms;
    G.findEntryFootholdCenter = function () {
      return [0, 0];
    };

    assert.equal(G.isStarterOpeningAcceptable(ms), false);
  });

  it('keeps a diagonal heading stable across stair-step entry cells', () => {
    const { G } = createRuntime();
    const path = [
      [6, 0],
      [6, 1],
      [5, 1],
      [5, 2],
      [4, 2],
      [4, 3],
      [3, 3],
      [3, 4]
    ];

    const earlyAngles = [0, 1].map(function (shipPos) {
      return G.getTransitPathHeading(path, shipPos, 1);
    });

    for (const angle of earlyAngles) {
      assert.ok(Math.abs(angle + Math.PI / 4) < 0.000001);
    }
  });

  it('prefers the dominant straight-ahead direction when entry has a small kink', () => {
    const { G } = createRuntime();
    const path = [
      [6, 0],
      [5, 1],
      [4, 1],
      [3, 1],
      [2, 1],
      [1, 1],
      [0, 1]
    ];

    const angle = G.getTransitPathHeading(path, 0, 1);

    assert.ok(angle < -Math.PI / 3);
  });

  it('keeps the sail-in position fixed even if the live heading changes', () => {
    const { G } = createRuntime();
    G.gridOffsetX = 0;
    G.gridOffsetY = 0;
    G.CELL = 20;

    const transit = {
      path: [[4, 0], [4, 1], [3, 2]],
      shipPos: 0,
      moveAccum: 0,
      entryOffset: 1.35,
      entryAngle: 0,
      shipAngle: 0
    };

    const initialPos = G.getShipPixelPos(transit);
    transit.shipAngle = -Math.PI / 4;
    const turnedPos = G.getShipPixelPos(transit);

    assert.equal(turnedPos.x, initialPos.x);
    assert.equal(turnedPos.y, initialPos.y);
  });

  it('blends heading through corners instead of lagging behind them', () => {
    const { G } = createRuntime();
    const path = [
      [4, 0],
      [4, 1],
      [3, 1],
      [2, 1]
    ];

    const startAngle = G.getTransitTravelAngle(path, 0, 0.2, 1, 0);
    const preTurnAngle = G.getTransitTravelAngle(path, 0, 0.9, 1, 0);
    const postTurnAngle = G.getTransitTravelAngle(path, 1, 0.2, 1, 0);
    const straightUpAngle = G.getTransitTravelAngle(path, 1, 0.6, 1, 0);

    assert.equal(startAngle, 0);
    assert.ok(preTurnAngle < 0 && preTurnAngle > -Math.PI / 2);
    assert.ok(postTurnAngle < 0 && postTurnAngle > -Math.PI / 2);
    assert.equal(straightUpAngle, -Math.PI / 2);
  });
});

describe('shared ship state', () => {
  it('starts a fresh save in the fallback charter lane without an owned ship', () => {
    const { G } = createRuntime();
    G.player = G.createFreshPlayer();
    G.updateBarMode = function () {};
    G.initBoard = function () {};
    G.savePlayer = function () {};
    G.advanceStage = function () {};

    G.startVoyage();

    assert.equal(G.player.bank, 0);
    assert.equal(G.player.ownedShips.length, 0);
    assert.equal(G.voyage.originPort, 'Fujairah');
    assert.equal(G.voyage.port, 'Dubai');
    assert.equal(G.voyage.contract.id, 'fallback-charter');
    assert.equal(G.voyage.contract.suppliedShipTier, 1);
  });

  it('grants a fixed starter crew once for a fresh save', () => {
    const { G } = createRuntime({ stubStartingCrew: false });
    G.player = G.createFreshPlayer();

    G.ensureStartingCrew();

    assert.equal(G.player.starterCrewGranted, true);
    assert.deepEqual(
      Array.from(G.player.crew, function (member) {
        return [member.name, member.role];
      }),
      [
        ['Captain', 'Captain'],
        ['Agent', 'Sonar'],
        ['Sergeant', 'Shotgunner'],
        ['Intern', 'Coffee Boy'],
        ['Sailor Boy', 'Sailor']
      ]
    );
  });

  it('completing a supplied charter does not auto-grant an owned ship', () => {
    const { G } = createRuntime();
    G.player = G.createFreshPlayer();
    G.transit = { hp: 1 };
    G.voyage = G.createFreshVoyage();
    G.voyage.contract = { id: 'fallback-charter', suppliedShipTier: 1 };
    G.voyage.usesSuppliedShip = true;
    G.voyage.departureDay = 0;
    G.voyage.outboundDays = 3;
    G.voyage.returnDays = 2;
    G.rollMarket = function () {};
    G.savePlayer = function () {};
    G.saveHighScore = function () {};
    G.showMenu = function () {};

    G.completeVoyage();

    assert.equal(G.player.homePort, 'Fujairah');
    assert.equal(G.player.turn, 1);
    assert.equal(G.player.ownedShips.length, 0);
    assert.equal(G.getPendingContract(G.player).id, 'fallback-charter');
  });

  it('offers a supplied fallback charter when the player has no operable ship', () => {
    const { G } = createRuntime();
    G.player = G.createFreshPlayer();
    G.player.homePort = 'Ras Tanura';
    G.player.ownedShips = [{ tier: 1, hp: 0, wrecked: true }];

    const contract = G.getPendingContract(G.player);

    assert.ok(contract);
    assert.equal(contract.id, 'fallback-charter');
    assert.equal(contract.origin, 'Ras Tanura');
    assert.equal(contract.destination, 'Dubai');
    assert.equal(contract.suppliedShipTier, 1);
  });

  it('preserves fallback contract minefield progress when retreating after a swimmer loss', () => {
    const { G } = createRuntime();
    setBoard(G, makeGrid(3, 4, true));
    G.player = G.createFreshPlayer();
    G.voyage = G.createFreshVoyage();
    G.voyage.contract = { id: 'fallback-charter', suppliedShipTier: 1 };
    G.voyage.stages = [{ id: 'mines_fwd' }];
    G.voyage.stageIdx = 0;
    G.ms = {
      grid: makeGrid(3, 4, 0),
      mines: makeGrid(3, 4, false),
      revealed: makeGrid(3, 4, false),
      flagged: makeGrid(3, 4, false),
      gameOver: false,
      gameWon: false,
      mineCount: 2,
      flagCount: 0,
      pendingClearedMine: { r: 1, c: 1 },
      timerInterval: 1
    };
    G.ms.revealed[1][0] = true;
    G.savePlayer = function () {};
    G.showMenu = function () {};

    G.onRetreatToPort();

    assert.ok(G.player.contractProgress['fallback-charter']);
    assert.equal(
      G.player.contractProgress['fallback-charter'].minesweeper.revealed[1][0],
      true,
    );
  });

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
    assert.equal(G.player.ownedShips[0].wrecked, false);
    assert.equal(G.transit.hp, 3);
  });

  it('wrecks an owned ship instead of deleting it on destruction', () => {
    const { G } = createRuntime();
    G.player = G.createFreshPlayer();
    G.player.crew = [{ name: 'Captain', role: 'Captain', alive: true }];
    G.player.ownedShips = [{ tier: 2, hp: 3, wrecked: false }];
    G.player.activeShipIdx = 0;
    G.activeShip = G.getShipTier(2);
    G.voyage = G.createFreshVoyage();

    const result = G.processShipDestruction('transit');

    assert.equal(result.isSuppliedRun, false);
    assert.equal(G.player.ownedShips.length, 1);
    assert.equal(G.player.ownedShips[0].hp, 0);
    assert.equal(G.player.ownedShips[0].wrecked, true);
    assert.equal(G.getPendingContract(G.player).id, 'fallback-charter');
  });

  it('does not sync supplied-contract transit damage onto a wrecked owned ship', () => {
    const { G } = createRuntime();
    G.player = G.createFreshPlayer();
    G.player.ownedShips = [{ tier: 1, hp: 0, wrecked: true }];
    G.player.activeShipIdx = 0;
    G.voyage = G.createFreshVoyage();
    G.voyage.usesSuppliedShip = true;
    G.transit = { hp: 1, maxHp: 1 };

    G.syncTransitHpToActiveShip();

    assert.equal(G.player.ownedShips[0].hp, 0);
    assert.equal(G.player.ownedShips[0].wrecked, true);
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

  it('persists the latest home-port bulletin across save and reload', () => {
    const { G } = createRuntime();
    G.player = G.createFreshPlayer();
    G.player.latestBulletin = {
      startDay: 3,
      endDay: 6,
      rangeLabel: 'Jun 4-6, Y1',
      items: [
        { day: 4, text: 'Insurance premiums for Gulf tankers spike 40%.' },
        { day: 6, text: 'Market close: War-risk premiums hold above last month.' }
      ]
    };
    G.voyage = G.createFreshVoyage();

    G.savePlayer();

    G.player = null;
    G.voyage = null;
    G.savedMinesweeper = null;
    G.loadPlayer();

    assert.ok(G.player.latestBulletin);
    assert.equal(G.player.latestBulletin.rangeLabel, 'Jun 4-6, Y1');
    assert.equal(G.player.latestBulletin.items.length, 2);
    assert.equal(G.player.latestBulletin.items[0].text, 'Insurance premiums for Gulf tankers spike 40%.');
  });

  it('persists the destination-port bulletin fields across save and reload', () => {
    const { G } = createRuntime();
    G.player = G.createFreshPlayer();
    G.voyage = G.createFreshVoyage();
    G.voyage.stageIdx = 0;
    G.voyage.stages = [{ id: 'manage_port' }];
    G.voyage.port = 'Karachi';
    G.voyage.departureDay = 1;
    G.voyage.outboundDays = 5;
    G.voyage.returnDays = 4;
    G.voyage.portBulletin = {
      startDay: 1,
      endDay: 6,
      rangeLabel: 'Jun 2-6, Y1',
      items: [
        { day: 2, text: 'Indian refineries increase Gulf crude imports by 8%.' }
      ]
    };

    G.savePlayer();

    G.player = null;
    G.voyage = null;
    G.savedMinesweeper = null;
    G.loadPlayer();

    assert.equal(G.voyage.port, 'Karachi');
    assert.equal(G.voyage.departureDay, 1);
    assert.equal(G.voyage.outboundDays, 5);
    assert.equal(G.voyage.returnDays, 4);
    assert.equal(G.voyage.portBulletin.rangeLabel, 'Jun 2-6, Y1');
    assert.equal(G.voyage.portBulletin.items[0].text, 'Indian refineries increase Gulf crude imports by 8%.');
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

  it('does not add automatic upward drift to market rolls', () => {
    const { G, context } = createRuntime();
    G.player = G.createFreshPlayer();
    G.player.market = { buyPrice: 80, sellPrice: 100, headline: '' };

    const originalRandom = context.Math.random;
    context.Math.random = function () { return 0.5; };
    G.rollMarket();
    context.Math.random = originalRandom;

    assert.equal(G.player.market.buyPrice, 82);
    assert.equal(G.player.market.sellPrice, 98);
  });

  it('formats campaign dates from a fictional June Y1 calendar', () => {
    const { G } = createRuntime();

    assert.equal(G.formatCampaignDate(0), 'Jun 1, Y1');
    assert.equal(G.formatCampaignDate(30), 'Jul 1, Y1');
    assert.equal(G.formatCampaignDateRange(0, 4), 'Jun 1-5, Y1');
  });

  it('builds port bulletins in chronological order with volume tied to voyage length', () => {
    const { G } = createRuntime();

    const shortBulletin = G.buildPortBulletin({
      startDay: 0,
      days: 2,
      turn: 0,
      marketHeadline: 'Market close: Gulf crude steadies into the weekend.'
    });
    const longBulletin = G.buildPortBulletin({
      startDay: 10,
      days: 6,
      turn: 4,
      marketHeadline: 'Market close: War-risk premiums hold above last month.'
    });

    assert.equal(shortBulletin.items.length, 1);
    assert.equal(longBulletin.items.length, 3);
    assert.ok(longBulletin.items[0].day < longBulletin.items[1].day);
    assert.ok(longBulletin.items[1].day <= longBulletin.items[2].day);
    assert.equal(longBulletin.items[2].text, 'Market close: War-risk premiums hold above last month.');
  });

  it('omits internal sort metadata from saved bulletin items', () => {
    const { G } = createRuntime();

    const bulletin = G.buildPortBulletin({
      startDay: 3,
      days: 4,
      turn: 1,
      marketHeadline: 'Market close: Tanker rates steady.'
    });

    assert.equal('order' in bulletin.items[0], false);
  });
});

describe('boot flow', () => {
  it('boots a fresh save to the main menu after both map images load', () => {
    const { G } = createRuntime();
    let menuCalls = 0;
    let returningCalls = 0;

    G.initCanvases = function () {};
    G.initInput = function () {};
    G.initBoard = function () {};
    G.loadPlayer = function () {
      G.player = G.createFreshPlayer();
      G.voyage = G.createFreshVoyage();
    };
    G.showMenu = function () { menuCalls++; };
    G.showReturningMenu = function () { returningCalls++; };

    G.oceanImg.onload();
    G.landImg.onload();

    assert.equal(menuCalls, 1);
    assert.equal(returningCalls, 0);
  });

  it('boots a progressed save to the returning menu after both map images load', () => {
    const { G } = createRuntime();
    let menuCalls = 0;
    let returningCalls = 0;

    G.initCanvases = function () {};
    G.initInput = function () {};
    G.initBoard = function () {};
    G.loadPlayer = function () {
      G.player = G.createFreshPlayer();
      G.player.bank = G.STARTING_BANK + 1;
      G.voyage = G.createFreshVoyage();
    };
    G.showMenu = function () { menuCalls++; };
    G.showReturningMenu = function () { returningCalls++; };

    G.oceanImg.onload();
    G.landImg.onload();

    assert.equal(menuCalls, 0);
    assert.equal(returningCalls, 1);
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
