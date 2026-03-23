// Game state machine, initialization, scoring, phase transitions
(function () {
  const G = window.Game;

  // Game states: MENU, AUTO_STAGE, MINESWEEPER, TRANSIT_FORWARD, TRANSIT_RETURN, SCORE, GAMEOVER
  G.state = 'MENU';
  G.activeShip = null; // current ship tier object for active run
  G.cumulativeScore = 0;
  G.roundScore = 0;

  // --- Player state & persistence ---
  var SAVE_KEY = 'hormuz_save';
  var SAVE_VERSION = 8;
  var STARTING_BANK = 1000000; // $1M — Rustbucket is free starter ship
  var MARKET_REFERENCE_PRICE = 82;
  var MARKET_CARGO_COST_SCALE = 0.09;

  G.player = null;

  G.createFreshVoyage = function () {
    return {
      stageIdx: -1,
      port: '',
      stages: [],
      timer: null,
      cargoLoaded: false,
      oilPct: 0,
      selling: false,
      loading: false,
      saleValue: 0,
      cargoCost: 0,
      targetOilPct: 0,
      saleStartPct: 0
    };
  };

  function _buildMarketHeadline(market, turn) {
    var spread = market.sellPrice - market.buyPrice;
    if (turn < 3) {
      return 'Gulf crude trades at $' + market.buyPrice + ' buy / $' + market.sellPrice + ' sell as shipping lanes stay open.';
    }
    if (turn < 7) {
      return 'War-risk jitters push Gulf crude to $' + market.buyPrice + ' buy / $' + market.sellPrice + ' sell.';
    }
    return 'Escalation sends Gulf crude to $' + market.buyPrice + ' buy / $' + market.sellPrice + ' sell with spreads at $' + spread + '.';
  }

  function _createMarketForTurn(turn, previousMarket) {
    var previousMid = previousMarket ? (previousMarket.buyPrice + previousMarket.sellPrice) / 2 : MARKET_REFERENCE_PRICE;
    var drift = turn < 3 ? 1.5 : (turn < 7 ? 3.5 : 5.5);
    var noise = Math.round((Math.random() * 10) - 5);
    var targetMid = Math.max(68, Math.round(previousMid + drift + noise));
    var spreadBase = turn < 3 ? 14 : (turn < 7 ? 19 : 26);
    var spread = spreadBase + Math.floor(Math.random() * 5);
    var buyPrice = Math.max(58, targetMid - Math.floor(spread / 2));
    var sellPrice = Math.max(buyPrice + 4, targetMid + Math.ceil(spread / 2));
    return {
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      headline: _buildMarketHeadline({ buyPrice: buyPrice, sellPrice: sellPrice }, turn)
    };
  }

  G.createFreshPlayer = function () {
    var market = _createMarketForTurn(0, null);
    var player = {
      bank: STARTING_BANK,
      crew: [],
      ownedShips: [{ tier: 1, hp: 1 }], // start with The Rustbucket
      activeShipIdx: 0,                  // index into ownedShips
      turn: 0,
      equipment: [],
      inRun: false,
      totalCrewDeaths: 0,
      conflictTier: 0,
      market: market
    };
    if (G.ensureHireState) G.ensureHireState(player);
    return player;
  };

  G.getMapTier = function () {
    if (!G.player || typeof G.player.conflictTier !== 'number') return 0;
    return Math.max(0, G.player.conflictTier);
  };

  // Convenience: get active ship data (tier object + current HP)
  G.getActivePlayerShip = function () {
    if (!G.player || !G.player.ownedShips || G.player.ownedShips.length === 0) return null;
    var owned = G.player.ownedShips[G.player.activeShipIdx];
    if (!owned) return null;
    var tierData = G.getShipTier(owned.tier);
    return { tierData: tierData, hp: owned.hp, maxHp: tierData.hp, owned: owned };
  };

  G.savePlayer = function () {
    try {
      var stage = (G.voyage && G.voyage.stages && G.voyage.stageIdx >= 0) ? G.voyage.stages[G.voyage.stageIdx] : null;
      var shouldSaveMines = stage && (stage.id === 'mines_fwd' || stage.id === 'mines_ret') &&
        G.ms && G.ms.mines && G.getMinesweeperSnapshot;
      var voyageSnapshot = {
        stageIdx: G.voyage.stageIdx,
        port: G.voyage.port,
        stages: G.voyage.stages,
        cargoLoaded: G.voyage.cargoLoaded,
        oilPct: G.voyage.oilPct,
        selling: G.voyage.selling,
        loading: G.voyage.loading,
        saleValue: G.voyage.saleValue,
        cargoCost: G.voyage.cargoCost,
        targetOilPct: G.voyage.targetOilPct,
        saleStartPct: G.voyage.saleStartPct
      };
      var payload = {
        version: SAVE_VERSION,
        player: G.player,
        voyage: voyageSnapshot,
        minesweeper: shouldSaveMines ? G.getMinesweeperSnapshot() : null
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (e) { /* localStorage unavailable or full */ }
  };

  G.loadPlayer = function () {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { G.player = G.createFreshPlayer(); return; }
      var data = JSON.parse(raw);
      if (!data || !data.player) { G.player = G.createFreshPlayer(); return; }
      if (data.version < SAVE_VERSION) {
        data = G.migrateSave(data);
      }
      G.player = data.player;
      if (G.ensureHireState) G.ensureHireState();
      if (!G.player.market) G.player.market = _createMarketForTurn(G.player.turn || 0, null);
      G.voyage = Object.assign(G.createFreshVoyage(), data.voyage || {});
      G.savedMinesweeper = data.minesweeper || null;
    } catch (e) {
      G.player = G.createFreshPlayer();
      G.voyage = G.createFreshVoyage();
      G.savedMinesweeper = null;
    }
  };

  G.migrateSave = function (data) {
    if (data.version < 2) {
      data.player.ship = null;
      data.version = 2;
    }
    if (data.version < 3) {
      var tier = data.player.ship || 1;
      data.player.ownedShips = [{ tier: tier, hp: 1 }];
      data.player.activeShipIdx = 0;
      delete data.player.ship;
      data.version = 3;
    }
    if (data.version < 4) {
      data.player.totalCrewDeaths = data.player.totalCrewDeaths || 0;
      for (var i = 0; i < data.player.ownedShips.length; i++) {
        var s = data.player.ownedShips[i];
        var td = G.getShipTier(s.tier);
        if (td && s.hp === 1) s.hp = td.hp;
      }
      data.version = 4;
    }
    if (data.version < 5) {
      data.voyage = data.voyage || {};
      if (typeof data.voyage.saleValue !== 'number') data.voyage.saleValue = 0;
      data.version = 5;
    }
    if (data.version < 6) {
      data.minesweeper = null;
      data.version = 6;
    }
    if (data.version < 7) {
      data.player.market = _createMarketForTurn(data.player.turn || 0, data.player.market || null);
      data.voyage = data.voyage || {};
      if (typeof data.voyage.cargoCost !== 'number') data.voyage.cargoCost = 0;
      if (typeof data.voyage.saleStartPct !== 'number') data.voyage.saleStartPct = 0;
      if (typeof data.player.conflictTier !== 'number') data.player.conflictTier = 0;
      data.version = 7;
    }
    if (data.version < 8) {
      if (G.ensureHireState) {
        G.ensureHireState(data.player);
      }
      data.version = 8;
    }
    return data;
  };

  G.deleteSave = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  };

  G.formatMoney = function (amount) {
    return '$' + amount.toLocaleString();
  };

  G.CRUDE_PRICE_PER_BARREL = MARKET_REFERENCE_PRICE;

  G.getCurrentBuyPrice = function () {
    return (G.player && G.player.market && G.player.market.buyPrice) || MARKET_REFERENCE_PRICE;
  };

  G.getCurrentSellPrice = function () {
    return (G.player && G.player.market && G.player.market.sellPrice) || (MARKET_REFERENCE_PRICE + 8);
  };

  G.getCargoPurchaseCost = function (shipTierData) {
    if (!shipTierData) return 0;
    return Math.round(shipTierData.cargoValue * MARKET_CARGO_COST_SCALE * (G.getCurrentBuyPrice() / MARKET_REFERENCE_PRICE));
  };

  G.getCargoSaleValue = function (shipTierData) {
    if (!shipTierData) return 0;
    return Math.round(shipTierData.cargoValue * MARKET_CARGO_COST_SCALE * (G.getCurrentSellPrice() / MARKET_REFERENCE_PRICE));
  };

  G.getAffordableLoadRatio = function (shipTierData) {
    var fullCost = G.getCargoPurchaseCost(shipTierData);
    if (!fullCost) return 0;
    return Math.max(0, Math.min(1, G.player.bank / fullCost));
  };

  G.rollMarket = function () {
    if (!G.player) return;
    G.player.market = _createMarketForTurn(G.player.turn, G.player.market || null);
  };

  function _formatBarrels(amount) {
    return Math.round(amount).toLocaleString() + ' bbl';
  }

  function _getCargoCapacityBarrels(ship) {
    if (!ship) return 0;
    return (ship.cargoValue * MARKET_CARGO_COST_SCALE) / MARKET_REFERENCE_PRICE;
  }

  function _buildCargoSummary(options) {
    var price = options.priceText || ('$' + MARKET_REFERENCE_PRICE + '/bbl');
    var transferLabel = options.transferLabel || 'Transferred';
    var transferText = options.transferText || '0 bbl';
    var totalLabel = options.totalLabel || 'Trade total';
    var totalText = options.totalText || '$0';
    var totalClass = options.totalClass || '';
    var extraRows = options.extraRows || [];
    var extraHtml = '';
    for (var i = 0; i < extraRows.length; i++) {
      var row = extraRows[i];
      extraHtml += '<div class="cargo-summary-row"><span class="cargo-summary-label">' + row.label + '</span><span class="cargo-summary-value' + (row.className ? ' ' + row.className : '') + '">' + row.text + '</span></div>';
    }

    return (
      '<div class="cargo-summary">' +
        '<div class="cargo-summary-title">Cargo Summary</div>' +
        '<div class="cargo-summary-row"><span class="cargo-summary-label">Crude price</span><span class="cargo-summary-value">' + price + '</span></div>' +
        '<div class="cargo-summary-row"><span class="cargo-summary-label">' + transferLabel + '</span><span class="cargo-summary-value">' + transferText + '</span></div>' +
        '<div class="cargo-summary-row"><span class="cargo-summary-label">' + totalLabel + '</span><span class="cargo-summary-value' + (totalClass ? ' ' + totalClass : '') + '">' + totalText + '</span></div>' +
        extraHtml +
      '</div>'
    );
  }

  G.setStatus = function (text, className) {
    var el = document.getElementById('statusBar');
    el.textContent = text;
    el.className = 'status-bar' + (className ? ' ' + className : '');
  };

  // Wait for both map images to load before init
  var imgLoaded = 0;
  function onMapImgLoad() {
    imgLoaded++;
    if (imgLoaded === 2) {
      G.initCanvases();
      G.initInput();
      G.loadPlayer();
      G.initBoard(G.getMapTier());
      G.cumulativeScore = G.player.bank;

      if (G.player.inRun && G.voyage && G.voyage.stages && G.voyage.stageIdx >= 0) {
        var restoredStage = G.voyage.stages[G.voyage.stageIdx];
        if (restoredStage && restoredStage.id === 'manage_port') {
          G.activeShip = G.getActivePlayerShip() ? G.getActivePlayerShip().tierData : null;
          G.roundScore = G.voyage.saleValue || 0;
          if (G.voyage.selling && G.voyage.selling !== 'done') {
            var remainingPct = Math.max(0, Math.min(100, Math.round(G.voyage.oilPct || 0)));
            var saleStartPct = Math.max(0, Math.min(100, Math.round(G.voyage.saleStartPct || 0)));
            var remainingValue = saleStartPct > 0
              ? Math.round((G.voyage.saleValue || 0) * (remainingPct / saleStartPct))
              : 0;
            if (remainingValue > 0) G.player.bank += remainingValue;
            G.voyage.oilPct = 0;
            G.voyage.cargoLoaded = false;
            G.voyage.selling = 'done';
            G.voyage.saleStartPct = 0;
            G.state = 'MENU';
            G.updateBarMode('menu');
            G.savePlayer();
          } else {
            G.state = G.voyage.selling === 'done' ? 'MENU' : 'AUTO_STAGE';
            G.updateBarMode(G.voyage.selling === 'done' ? 'menu' : 'auto');
          }
          G.renderDock();
          G.updateMapStageCard();
          return;
        }
        if (restoredStage && (restoredStage.id === 'mines_fwd' || restoredStage.id === 'mines_ret') && G.savedMinesweeper) {
          G.activeShip = G.getActivePlayerShip() ? G.getActivePlayerShip().tierData : null;
          G.state = 'MINESWEEPER';
          G.updateBarMode('gameplay');
          G.restoreMinesweeper(G.savedMinesweeper);
          G.renderDock();
          G.updateMapStageCard();
          return;
        }
      }

      if (G.player.inRun) {
        G.player.inRun = false;
        G.voyage = G.createFreshVoyage();
        G.savePlayer();
      }

      if (G.player.bank !== STARTING_BANK || G.player.turn > 0) {
        G.showReturningMenu();
      } else {
        G.showMenu();
      }
    }
  }
  G.oceanImg.onload = onMapImgLoad;
  G.landImg.onload = onMapImgLoad;
  G.oceanImg.src = 'hormuz-ocean.png';
  G.landImg.src = 'hormuz-land.png';

  // Load PNG sprites
  var spriteSrcs = {
    ship: 'sprites/ships/ship-1.png',
    shahed: 'sprites/shahed.png',
    fpv: 'sprites/fpv.png',
    missile: 'sprites/missile.png',
    explosion: 'sprites/explosion.png',
    missileOceanDrop: 'sprites/missile_oceandrop.png'
  };
  Object.keys(spriteSrcs).forEach(function (name) {
    G.sprites[name].src = spriteSrcs[name];
  });

  G.initBoard = function (turn) {
    var barHeight = 56;
    var maxW = window.innerWidth;
    var maxH = window.innerHeight - barHeight;

    var grid = G.getGridSize(turn);
    G.cols = grid.cols;
    G.rows = grid.rows;

    var cellW = Math.floor(maxW / G.cols);
    var cellH = Math.floor(maxH / G.rows);
    G.CELL = Math.max(16, Math.min(38, Math.min(cellW, cellH)));

    var canvasW = G.cols * G.CELL;
    var canvasH = G.rows * G.CELL;

    G.sizeCanvases(canvasW, canvasH);
    G.buildOceanMask(canvasW, canvasH);
    G.drawLayers(canvasW, canvasH);
  };

  // ──────────────────────────────────────────────────────────
  //  VOYAGE STAGE SYSTEM
  // ──────────────────────────────────────────────────────────

  // Stage definitions — {port} replaced with random delivery port
  var STAGE_DEFS = [
    { id: 'sailing_out',   label: 'Sailing to Hormuz',  auto: 2500 },
    { id: 'mines_fwd',     label: 'Clearing mines' },
    { id: 'transit_fwd',   label: 'Running the strait' },
    { id: 'sailing_to',    label: 'Sailing to {port}',  auto: 2000 },
    { id: 'manage_port',   label: 'In port at {port}' },
    { id: 'sailing_back',  label: 'Sailing back',       auto: 2000 },
    { id: 'mines_ret',     label: 'Clearing mines' },
    { id: 'transit_ret',   label: 'Running the strait' },
    { id: 'arriving',      label: 'Arriving home',      auto: 2000 }
  ];

  G.voyage = G.createFreshVoyage();

  function buildVoyageStages(port) {
    return STAGE_DEFS.map(function (def) {
      return {
        id: def.id,
        label: def.label.replace('{port}', port),
        auto: def.auto || 0
      };
    });
  }

  // Stage trail — now rendered via map stage card instead of top bar
  G.renderStageTrail = function () {
    // No-op; stage info is shown in the map overlay card
  };

  // Animate oil bar from startPct to endPct over duration ms
  function _animateOil(startPct, endPct, duration, onDone) {
    var startTime = performance.now();
    function tick(now) {
      var elapsed = now - startTime;
      var t = Math.min(1, elapsed / duration);
      // Ease out
      t = 1 - Math.pow(1 - t, 2);
      G.voyage.oilPct = startPct + (endPct - startPct) * t;
      _updateOilBar();
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        G.voyage.oilPct = endPct;
        _updateOilBar();
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(tick);
  }

  function _updateOilBar() {
    var fill = document.querySelector('.ship-oil-fill');
    if (fill) fill.style.width = Math.round(G.voyage.oilPct) + '%';
  }

  // Start a new voyage or continue from management stage
  G.startVoyage = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip) return;
    var ship = playerShip.tierData;

    G.activeShip = ship;

    // Switch to gameplay bar mode
    G.updateBarMode('gameplay');

    // Load ship sprite
    G.sprites.ship.src = ship.sprite;

    // Pick random delivery port
    G.voyage.port = G.getRandomPort();
    G.voyage.stages = buildVoyageStages(G.voyage.port);
    G.voyage.stageIdx = -1; // will be incremented by advanceStage

    // Init board
    G.initBoard(G.getMapTier());

    G.player.inRun = true;
    G.savePlayer();

    // Advance to first stage (loading cargo)
    G.advanceStage();
  };

  // Advance to the next voyage stage
  G.advanceStage = function () {
    var v = G.voyage;
    if (v.timer) { clearTimeout(v.timer); v.timer = null; }

    v.stageIdx++;

    // Voyage complete — award cargo and start next loop
    if (v.stageIdx >= v.stages.length) {
      G.completeVoyage();
      return;
    }

    var stage = v.stages[v.stageIdx];

    if (stage.auto) {
      // Auto-advance after delay
      G.state = 'AUTO_STAGE';
      G.updateBarMode('auto');
      G.renderTacticalCrewBar();
      if (G.renderShipButton) G.renderShipButton();
      G.updateMapStageCard();
      v.timer = setTimeout(function () {
        G.advanceStage();
      }, stage.auto);
    } else {
      // Interactive stage
      switch (stage.id) {
        case 'mines_fwd':
          G.updateBarMode('gameplay');
          G.initBoard(G.getMapTier());
          G.state = 'MINESWEEPER';
          var diff = G.getDifficulty(G.player.turn);
          G.initMinesweeper(diff.mineRatio);
          G.renderTacticalCrewBar();
          G.updateMapStageCard();
          break;

        case 'transit_fwd':
          G.updateBarMode('gameplay');
          G.startTransit('forward');
          G.updateMapStageCard();
          break;

        case 'mines_ret':
          G.updateBarMode('gameplay');
          // Fresh minefield for return trip
          G.initBoard(G.getMapTier());
          G.state = 'MINESWEEPER';
          var diffRet = G.getDifficulty(G.player.turn);
          G.initMinesweeper(diffRet.mineRatio);
          G.renderTacticalCrewBar();
          G.updateMapStageCard();
          break;

        case 'transit_ret':
          G.updateBarMode('gameplay');
          G.startTransit('return');
          G.updateMapStageCard();
          break;

        case 'manage_port':
          // Arrive in port and immediately begin selling the cargo.
          if (G.refreshHirePoolForPort) G.refreshHirePoolForPort();
          G.state = 'AUTO_STAGE';
          G.updateBarMode('auto');
          G.voyage.saleStartPct = Math.max(0, Math.min(100, Math.round(G.voyage.oilPct || 0)));
          G.voyage.oilPct = G.voyage.saleStartPct;
          G.voyage.selling = false;
          G.voyage.saleValue = G.activeShip ? Math.round(G.getCargoSaleValue(G.activeShip) * (G.voyage.saleStartPct / 100)) : 0;
          G.roundScore = G.voyage.saleValue;
          G.renderTacticalCrewBar();
          G.updateMapStageCard();
          G.savePlayer();
          window.sellAndReturn();
          break;
      }
    }
  };

  // ──────────────────────────────────────────────────────────
  //  SELL CARGO IN CHUNKS (used in manage_port)
  // ──────────────────────────────────────────────────────────
  function _sellCargoChunks(onDone) {
    var v = G.voyage;
    var chunks = 5;
    var totalValue = v.saleValue || G.roundScore;
    var startPct = Math.max(0, Math.min(100, Math.round(v.saleStartPct || v.oilPct || 0)));
    var chunkValue = Math.floor(totalValue / chunks);
    var chunkIdx = 0;
    function tick() {
      chunkIdx++;
      var earned = (chunkIdx === chunks) ? totalValue - chunkValue * (chunks - 1) : chunkValue;
      G.player.bank += earned;
      G.voyage.oilPct = startPct * (1 - (chunkIdx / chunks));
      _updateOilBar();
      G.sounds.cargoSell();
      document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
      G.updateMapStageCard();
      G.savePlayer();
      if (chunkIdx < chunks) {
        v.timer = setTimeout(tick, 350);
      } else {
        G.voyage.cargoLoaded = false;
        G.voyage.oilPct = 0;
        G.savePlayer();
        if (G.renderShipButton) G.renderShipButton();
        v.timer = setTimeout(onDone, 600);
      }
    }
    v.timer = setTimeout(tick, 400);
  }

  function _loadCargoChunks(onDone) {
    var v = G.voyage;
    var chunks = 5;
    var totalCost = v.cargoCost || 0;
    var chunkCost = Math.floor(totalCost / chunks);
    var targetPct = Math.max(0, Math.min(100, Math.round(v.targetOilPct || 0)));
    var chunkIdx = 0;
    function tick() {
      chunkIdx++;
      var spent = (chunkIdx === chunks) ? totalCost - chunkCost * (chunks - 1) : chunkCost;
      G.player.bank -= spent;
      G.voyage.oilPct = (chunkIdx / chunks) * targetPct;
      _updateOilBar();
      G.sounds.cargoLoad();
      document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
      G.updateMapStageCard();
      G.savePlayer();
      if (chunkIdx < chunks) {
        v.timer = setTimeout(tick, 350);
      } else {
        G.voyage.cargoLoaded = targetPct > 0;
        G.voyage.oilPct = targetPct;
        G.savePlayer();
        if (G.renderShipButton) G.renderShipButton();
        v.timer = setTimeout(onDone, 400);
      }
    }
    v.timer = setTimeout(tick, 250);
  }

  // ──────────────────────────────────────────────────────────
  //  CARGO LOADING IN DOCK (called from Set Sail button)
  // ──────────────────────────────────────────────────────────
  function _loadCargoAndSail() {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip) return;
    var fullCost = G.getCargoPurchaseCost(playerShip.tierData);
    var loadRatio = G.getAffordableLoadRatio(playerShip.tierData);
    var targetOilPct = Math.max(0, Math.min(100, Math.round(loadRatio * 100)));
    var cargoCost = Math.round(fullCost * loadRatio);
    if (targetOilPct <= 0 || cargoCost <= 0) return;
    G.voyage.loading = true;
    G.voyage.oilPct = 0;
    G.voyage.cargoLoaded = false;
    G.voyage.saleValue = 0;
    G.voyage.cargoCost = cargoCost;
    G.voyage.targetOilPct = targetOilPct;
    G.updateMapStageCard();
    G.savePlayer();
    _loadCargoChunks(function () {
      G.voyage.loading = false;
      G.savePlayer();
      // Now actually start the voyage
      G.startVoyage();
    });
  }

  window.loadCargoAndSail = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip || playerShip.hp <= 0) return;
    if (!G.hasCrewRole('Captain')) return;
    _loadCargoAndSail();
  };

  window.sellAndReturn = function () {
    var v = G.voyage;
    if (!v.stages || v.stages[v.stageIdx].id !== 'manage_port') return;

    v.selling = true;
    G.state = 'AUTO_STAGE';
    G.updateBarMode('auto');
    G.renderTacticalCrewBar();
    G.savePlayer();
    _sellCargoChunks(function () {
      v.selling = 'done';
      G.state = 'MENU';
      G.updateBarMode('menu');
      G.updateMapStageCard();
      G.savePlayer();
    });
  };

  G.animateRoutePlot = function (path, onDone) {
    if (!path || path.length < 2) {
      if (onDone) onDone();
      return;
    }
    var preDelay = 1000;
    var drawDuration = 2000;
    var holdDuration = 260;
    var startTime = 0;

    function animate(now) {
      if (!startTime) startTime = now;
      var elapsed = now - startTime;
      if (elapsed < preDelay) {
        G.drawBoard();
        requestAnimationFrame(animate);
        return;
      }
      var progress = Math.min(1, (elapsed - preDelay) / drawDuration);
      G.drawBoard();
      G.drawTransitRoute(path, G.gctx, progress);
      if (progress < 1) {
        requestAnimationFrame(animate);
        return;
      }
      setTimeout(function () {
        if (onDone) onDone();
      }, holdDuration);
    }

    requestAnimationFrame(animate);
  };

  // ──────────────────────────────────────────────────────────
  //  MINES -> TRANSIT HANDOFF
  //  Fade from the solved board to a clean world-only overlay, then reveal transit.
  // ──────────────────────────────────────────────────────────
  G.transitionMinesToTransit = function (path) {
    var wrap = document.getElementById('boardWrap');
    if (!wrap) { G.advanceStage(); return; }
    var rect = wrap.getBoundingClientRect();
    var overlay = document.createElement('canvas');
    overlay.className = 'board-crossfade';
    overlay.width = rect.width;
    overlay.height = rect.height;
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.opacity = '0';
    var ovCtx = overlay.getContext('2d');
    var revealFadeDuration = 180;
    var holdDuration = 220;

    ovCtx.clearRect(0, 0, rect.width, rect.height);
    if (G.oceanCanvas) ovCtx.drawImage(G.oceanCanvas, 0, 0, rect.width, rect.height);
    if (path) G.drawTransitRoute(path, ovCtx, 1);
    if (path && path.length && G.drawShipOnContext) {
      var first = path[0];
      var shipPx = first[1] * G.CELL + G.CELL / 2;
      var shipPy = first[0] * G.CELL + G.CELL / 2;
      var shipAngle = 0;
      if (path.length >= 2) {
        shipAngle = Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]);
      }
      G.drawShipOnContext(ovCtx, shipPx, shipPy, shipAngle);
    }
    if (G.landCanvas) ovCtx.drawImage(G.landCanvas, 0, 0, rect.width, rect.height);

    wrap.appendChild(overlay);
    overlay.offsetHeight;
    overlay.style.transition = 'opacity ' + revealFadeDuration + 'ms ease-out';
    requestAnimationFrame(function () {
      overlay.style.opacity = '1';
    });

    setTimeout(function () {
      overlay.style.transition = 'opacity 0.32s ease-out';
      overlay.classList.add('fading');
      var startedTransit = false;
      overlay.addEventListener('transitionend', function () {
        if (!startedTransit) {
          startedTransit = true;
          setTimeout(function () {
            G.advanceStage();
          }, 90);
        }
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      });
      setTimeout(function () {
        if (!startedTransit) {
          startedTransit = true;
          G.advanceStage();
        }
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 700);
    }, holdDuration);
  };

  // ──────────────────────────────────────────────────────────
  //  SHIP DESTRUCTION & SHIPWRECK
  // ──────────────────────────────────────────────────────────

  var SURVIVOR_STORIES = [
    '{name} tamed a shark and rode it back to port.',
    '{name} floated on a barrel of crude for three days.',
    '{name} was rescued by a passing fishing boat.',
    '{name} swam 12 miles to shore and hitched a ride.',
    '{name} held onto a refrigerator door. Don\'t ask.',
    '{name} was found clinging to the ship\'s flag.',
    '{name} fashioned a raft from debris and sailed home.',
    '{name} was plucked from the water by a helicopter.',
    '{name} washed ashore on Qeshm Island and bribed a fisherman.',
    '{name} doggy-paddled for 6 hours straight.'
  ];

  var DEATH_STORIES = [
    '{name} went down with the ship.',
    '{name} was never found.',
    '{name} didn\'t make it.',
    'No trace of {name} was recovered.',
    '{name} was last seen heading below deck.'
  ];

  function pickStory(pool, name) {
    var s = pool[Math.floor(Math.random() * pool.length)];
    return s.replace(/\{name\}/g, name);
  }

  G.processShipDestruction = function (cause) {
    var playerShip = G.getActivePlayerShip();
    var shipName = playerShip ? playerShip.tierData.name : 'Unknown';

    G.player.ownedShips.splice(G.player.activeShipIdx, 1);
    if (G.player.ownedShips.length > 0) {
      G.player.activeShipIdx = Math.min(G.player.activeShipIdx, G.player.ownedShips.length - 1);
    } else {
      G.player.activeShipIdx = 0;
    }

    var survivors = [];
    var dead = [];
    var crewResults = [];

    for (var i = 0; i < G.player.crew.length; i++) {
      var member = G.player.crew[i];
      if (member.alive === false) {
        dead.push(member);
        crewResults.push({ member: member, survived: false, story: pickStory(DEATH_STORIES, member.name) });
        continue;
      }
      if (Math.random() < 0.6) {
        survivors.push(member);
        crewResults.push({ member: member, survived: true, story: pickStory(SURVIVOR_STORIES, member.name) });
      } else {
        member.alive = false;
        dead.push(member);
        crewResults.push({ member: member, survived: false, story: pickStory(DEATH_STORIES, member.name) });
      }
    }

    G.player.totalCrewDeaths = (G.player.totalCrewDeaths || 0) + dead.length;
    G.player.crew = survivors;
    G.player.inRun = false;

    // Clear voyage state
    G.voyage.stageIdx = -1;
    G.voyage.stages = [];
    if (G.voyage.timer) { clearTimeout(G.voyage.timer); G.voyage.timer = null; }

    G.savePlayer();

    var cheapestShipCost = G.SHIP_TIERS[0].cost;
    var isRetired = G.player.ownedShips.length === 0 && G.player.bank < cheapestShipCost;

    return {
      cause: cause,
      shipName: shipName,
      crewResults: crewResults,
      survivors: survivors,
      dead: dead,
      isRetired: isRetired
    };
  };

  G.showShipwreckOverlay = function (result) {
    var overlay = document.getElementById('shipwreckOverlay');
    document.getElementById('shipwreckTitle').textContent =
      result.cause === 'mine' ? 'Mine Strike!' : 'Ship Destroyed!';
    document.getElementById('shipwreckCause').textContent =
      result.shipName + ' has been lost' +
      (result.cause === 'mine' ? ' to a mine.' : ' in the strait.');

    var listEl = document.getElementById('shipwreckCrewList');
    listEl.innerHTML = '';

    for (var i = 0; i < result.crewResults.length; i++) {
      var cr = result.crewResults[i];
      var row = document.createElement('div');
      row.className = 'shipwreck-crew-row' + (cr.survived ? ' survived' : ' dead');

      var portrait = document.createElement('div');
      portrait.className = 'shipwreck-portrait';
      portrait.style.backgroundImage = 'url(' + G.getPortraitSrc(cr.member.charId) + ')';
      row.appendChild(portrait);

      var info = document.createElement('div');
      info.className = 'shipwreck-crew-info';
      var nameEl = document.createElement('div');
      nameEl.className = 'shipwreck-crew-name';
      nameEl.textContent = cr.member.name + (cr.survived ? '' : ' \u2020');
      info.appendChild(nameEl);
      var storyEl = document.createElement('div');
      storyEl.className = 'shipwreck-crew-story';
      storyEl.textContent = cr.story;
      info.appendChild(storyEl);
      row.appendChild(info);

      listEl.appendChild(row);
    }

    document.getElementById('shipwreckBank').textContent =
      'Bank: ' + G.formatMoney(G.player.bank);

    var btn = document.getElementById('shipwreckContinueBtn');
    if (result.isRetired) {
      btn.textContent = 'Game Over \u2014 Cash Out';
    } else {
      btn.textContent = 'Return to Port';
    }

    overlay.classList.add('active');
  };

  G.onShipwreckContinue = function () {
    document.getElementById('shipwreckOverlay').classList.remove('active');
    var cheapestShipCost = G.SHIP_TIERS[0].cost;
    var isRetired = G.player.ownedShips.length === 0 && G.player.bank < cheapestShipCost;
    if (isRetired) {
      G.showGameOver();
    } else {
      G.cumulativeScore = G.player.bank;
      if (G.refreshHirePoolForPort) G.refreshHirePoolForPort();
      G.showMenu();
    }
  };

  // Game over — no ship, no funds
  G.showGameOver = function () {
    G.saveHighScore(G.player.bank);
    var overlay = document.getElementById('gameOverOverlay');
    document.getElementById('gameOverBank').textContent = G.formatMoney(G.player.bank);
    document.getElementById('gameOverWeeks').textContent = G.player.turn;
    overlay.classList.add('active');
  };

  G.onGameOverRestart = function () {
    document.getElementById('gameOverOverlay').classList.remove('active');
    G.deleteSave();
    G.player = G.createFreshPlayer();
    G.cumulativeScore = G.player.bank;
    G.showMenu();
  };

  // Retreat to port — costs 1 day, allows hiring at nearest port
  G.showRetreatOption = function () {
    var overlay = document.getElementById('retreatOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
  };

  G.onRetreatContinue = function () {
    // Continue without swimmer
    document.getElementById('retreatOverlay').classList.remove('active');
    if (G.resolvePendingClearedMine) G.resolvePendingClearedMine();
  };

  G.onRetreatToPort = function () {
    document.getElementById('retreatOverlay').classList.remove('active');
    // Cost: 1 day
    G.player.turn++;
    // Stop minesweeper
    var ms = G.ms;
    ms.gameOver = true;
    clearInterval(ms.timerInterval);
    // Remove dead crew so player can hire replacements
    G.player.crew = G.player.crew.filter(function (m) { return m.alive !== false; });
    // Clear voyage and return to menu
    G.voyage.stageIdx = -1;
    G.voyage.stages = [];
    if (G.voyage.timer) { clearTimeout(G.voyage.timer); G.voyage.timer = null; }
    G.player.inRun = false;
    if (G.refreshHirePoolForPort) G.refreshHirePoolForPort();
    G.savePlayer();
    G.showMenu();
  };

  // ──────────────────────────────────────────────────────────
  //  MENU / DOCK
  // ──────────────────────────────────────────────────────────

  G.showMenu = function () {
    G.state = 'MENU';
    G.resetCounterStyle();
    // Clear voyage state
    if (G.voyage.timer) { clearTimeout(G.voyage.timer); G.voyage.timer = null; }
    G.voyage = G.createFreshVoyage();
    if (G.ensureHireState) G.ensureHireState();
    G.updateBarMode('menu');
    G.initBoard(G.getMapTier());
    G.renderDock();
    G.updateMapStageCard();
  };

  G.showReturningMenu = function () {
    G.showMenu();
  };

  G.activeDestination = null; // legacy compat

  // Legacy compat — old startRound redirects to startVoyage
  G.startRound = function () {
    G.startVoyage();
  };

  // Called when voyage completes (all stages done) — awards cargo and starts next loop
  G.completeVoyage = function () {
    var t = G.transit;
    var ship = G.activeShip;

    // roundScore and bank already updated during selling stage
    G.player.turn++;
    G.rollMarket();
    G.player.inRun = false;
    if (G.refreshHirePoolForPort) G.refreshHirePoolForPort();

    // Sync transit HP back to owned ship
    var playerShip = G.getActivePlayerShip();
    if (playerShip) {
      playerShip.owned.hp = Math.max(1, t.hp);
    }
    G.cumulativeScore = G.player.bank;

    G.savePlayer();
    G.saveHighScore(G.player.bank);

    // Immediately start next voyage loop
    G.showMenu();
  };

  // Legacy compat
  G.showScore = G.completeVoyage;

  G.goAgain = function () {
    document.getElementById('scoreOverlay').classList.remove('active');
    G.showMenu();
  };

  G.continueGame = function () {
    G.showMenu();
  };

  G.cashOut = function () {
    // Close any open overlays
    var scoreOvl = document.getElementById('scoreOverlay');
    if (scoreOvl) scoreOvl.classList.remove('active');
    G.saveHighScore(G.player.bank);
    G.deleteSave();
    G.player = G.createFreshPlayer();
    G.cumulativeScore = G.player.bank;
    G.showMenu();
  };

  G.newGame = function () {
    if (G.transit.active) {
      G.transit.active = false;
      cancelAnimationFrame(G.transit.animFrame);
      clearInterval(G.transit.transitTimerInterval);
    }
    clearInterval(G.ms.timerInterval);
    if (G.voyage.timer) { clearTimeout(G.voyage.timer); G.voyage.timer = null; }
    G.resetCounterStyle();
    document.getElementById('scoreOverlay').classList.remove('active');
    document.getElementById('shipwreckOverlay').classList.remove('active');

    // Always reset to fresh player
    G.deleteSave();
    G.player = G.createFreshPlayer();
    G.cumulativeScore = G.player.bank;
    G.showMenu();
  };

  // High scores
  G.saveHighScore = function (score) {
    try {
      var scores = JSON.parse(localStorage.getItem('hormuz_highscores') || '[]');
      scores.push(score);
      scores.sort(function (a, b) { return b - a; });
      scores = scores.slice(0, 10);
      localStorage.setItem('hormuz_highscores', JSON.stringify(scores));
    } catch (e) {}
  };

  G.getHighScores = function () {
    try {
      return JSON.parse(localStorage.getItem('hormuz_highscores') || '[]');
    } catch (e) { return []; }
  };

  G.showHelp = function () {
    document.getElementById('helpModal').classList.add('active');
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  // Test mode
  G.startTestMode = function () {
    G.activeShip = G.getShipTier(4);
    G.sprites.ship.src = G.activeShip.sprite;
    G.player.turn = 5;
    G.updateBarMode('gameplay');
    G.initBoard(G.getMapTier());
    G.state = 'MINESWEEPER';
    G.initMinesweeper(0);
    for (var r = 0; r < G.rows; r++) {
      for (var c = 0; c < G.cols; c++) {
        if (G.oceanMask[r][c]) G.ms.revealed[r][c] = true;
      }
    }
    // Set up minimal voyage for stage trail
    G.voyage.port = 'Fujairah';
    G.voyage.stages = [
      { id: 'test', label: 'Test mode' },
      { id: 'transit_fwd', label: 'Running the strait' }
    ];
    G.voyage.stageIdx = 1;
    G.renderStageTrail();
    G.startTransit('forward');
  };

  G.toggleMute = function () {
    G.soundEnabled = !G.soundEnabled;
    var soundGlyph = document.getElementById('soundGlyph');
    if (soundGlyph) {
      soundGlyph.classList.toggle('sound-on', G.soundEnabled);
      soundGlyph.classList.toggle('sound-off', !G.soundEnabled);
    }
  };

  G.transitControl = function (action) {
    if (action === 'forward') G.handleTransitKey('ArrowUp');
    else if (action === 'reverse') G.handleTransitKey('ArrowDown');
    else if (action === 'stop') G.handleTransitKey(' ');
  };

  // Highlight the active transit direction button
  G.updateTransitButtons = function () {
    var t = G.transit;
    if (!t) return;
    var fwd = document.getElementById('btnForward');
    var stop = document.getElementById('btnStop');
    var rev = document.getElementById('btnReverse');
    if (!fwd) return;
    fwd.classList.toggle('engaged', t.shipSpeedTarget === 1);
    stop.classList.toggle('engaged', t.shipSpeedTarget === 0);
    rev.classList.toggle('engaged', t.shipSpeedTarget === -1);
  };

  G.updateTransitControls = function () {
    var el = document.getElementById('transitControls');
    if (G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  };

  var origSetStatus = G.setStatus;
  G.setStatus = function (text, className) {
    origSetStatus(text, className);
    G.updateTransitControls();
  };

  // --- Bar mode toggling (menu vs gameplay) ---
  G.updateBarMode = function (mode) {
    var newsTicker = document.getElementById('newsTicker');
    var transitControls = document.getElementById('transitControls');
    var boardWrap = document.getElementById('boardWrap');
    var mapCard = document.getElementById('mapStageCard');

    if (mode === 'gameplay') {
      newsTicker.classList.remove('active');
      if (transitControls) transitControls.classList.remove('active');
      if (boardWrap) boardWrap.classList.remove('map-dimmed');
      if (mapCard) mapCard.classList.remove('active');
    } else if (mode === 'auto') {
      newsTicker.classList.remove('active');
      if (transitControls) transitControls.classList.remove('active');
      if (boardWrap) boardWrap.classList.add('map-dimmed');
    } else {
      // Menu — dim map, show news
      newsTicker.classList.add('active');
      if (transitControls) transitControls.classList.remove('active');
      if (boardWrap) boardWrap.classList.add('map-dimmed');
    }
  };

  // --- Port action helpers ---
  function _buildPortActions(playerShip, sailAction, sailLabel, disabled) {
    sailLabel = sailLabel || 'Set Sail';
    var html = '<div class="stage-actions">';
    var sailDisabled = disabled || !G.hasCrewRole('Captain');
    html += '<button class="stage-sail-btn' + (sailDisabled ? ' disabled' : '') + '" onclick="' + sailAction + '">' + sailLabel + '</button>';
    if (playerShip) {
      var needsRepair = playerShip.hp < playerShip.maxHp;
      var repairCost = needsRepair ? G.getRepairCost(playerShip) : 0;
      var canRepair = needsRepair && !disabled && G.player.bank >= repairCost;
      html += '<button class="stage-repair-btn' + (canRepair ? '' : ' disabled') + '" onclick="repairShip()" title="' + (needsRepair ? 'Repair hull' : 'Hull intact') + '">';
      html += needsRepair ? ('🔧 ' + G.formatMoney(repairCost)) : '🔧 Repair';
      html += '</button>';
    }
    html += '</div>';
    return html;
  }

  function _buildShipUpgrades(playerShip, disabled) {
    if (!playerShip) return '';
    var currentTier = playerShip.tierData.tier;
    var html = '';
    var hasUpgrades = false;

    for (var i = 0; i < G.SHIP_TIERS.length; i++) {
      var s = G.SHIP_TIERS[i];
      if (s.tier <= currentTier) continue;
      if (!hasUpgrades) {
        html += '<div class="stage-section-label">Upgrade Ship</div>';
        hasUpgrades = true;
      }
      var canAfford = !disabled && G.player.bank >= s.cost;
      html += '<div class="stage-ship-upgrade' + (canAfford ? '' : ' disabled') + '" onclick="upgradeShip(' + s.tier + ')">';
      html += '<div><div class="stage-ship-upgrade-name">' + s.name + '</div>';
      html += '<div class="stage-ship-upgrade-info">' + s.hp + ' HP · ' + s.crewSlots.length + ' crew · Cargo ' + G.formatMoney(s.cargoValue) + '</div></div>';
      html += '<div class="stage-ship-upgrade-cost">' + G.formatMoney(s.cost) + '</div>';
      html += '</div>';
    }
    return html;
  }

  G.purchaseShip = function (tier) {
    var tierData = G.getShipTier(tier);
    if (!tierData || G.player.bank < tierData.cost) return false;
    G.player.bank -= tierData.cost;
    G.player.ownedShips.push({ tier: tierData.tier, hp: tierData.hp });
    G.player.activeShipIdx = G.player.ownedShips.length - 1;
    G.savePlayer();
    return true;
  };

  window.upgradeShip = function (tier) {
    if (!G.purchaseShip(tier)) return;
    document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
    if (G.renderShipButton) G.renderShipButton();
    G.renderDock();
    G.updateMapStageCard();
  };

  window.buyShip = function (tier) {
    if (!G.purchaseShip(tier)) return;
    document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
    if (G.renderShipButton) G.renderShipButton();
    G.renderTacticalCrewBar();
    G.renderDock();
    G.updateMapStageCard();
  };

  // --- Map stage card (overlay on map with contextual info) ---
  G.updateMapStageCard = function () {
    var card = document.getElementById('mapStageCard');
    if (!card) return;

    var v = G.voyage;
    var stage = (v.stages && v.stageIdx >= 0) ? v.stages[v.stageIdx] : null;

    // Hide during active gameplay
    if (G.state === 'MINESWEEPER' || G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
      card.classList.remove('active');
      return;
    }

    var playerShip = G.getActivePlayerShip();
    var html = '';
    var cargoValue = G.activeShip ? G.activeShip.cargoValue : (playerShip ? playerShip.tierData.cargoValue : 0);
    var cargoCapacity = playerShip ? _getCargoCapacityBarrels(playerShip.tierData) : 0;
    var cargoCapacityText = playerShip ? _formatBarrels(cargoCapacity) : 'No ship';

    if (!stage) {
      // At port, no voyage started
      html += '<h3>At Port</h3>';
      html += '<div class="stage-subtitle">Persian Gulf</div>';
      if (playerShip) {
        var loadedPct = Math.round(G.voyage.oilPct || 0);
        var loadedBarrels = cargoCapacity * loadedPct / 100;
        var fullLoadCost = G.getCargoPurchaseCost(playerShip.tierData);
        html += _buildCargoSummary({
          priceText: '$' + G.getCurrentBuyPrice() + '/bbl',
          transferLabel: 'Loaded',
          transferText: _formatBarrels(loadedBarrels) + ' / ' + cargoCapacityText,
          totalLabel: 'Full load cost',
          totalText: G.formatMoney(fullLoadCost)
        });
      }

      if (!playerShip) {
        // No ship — show buy options
        html += '<div class="stage-detail" style="color:var(--dock-text-muted)">You need a ship to set sail.</div>';
        // Show all ships as purchase options
        for (var si = 0; si < G.SHIP_TIERS.length; si++) {
          var s = G.SHIP_TIERS[si];
          var canAfford = G.player.bank >= s.cost;
          html += '<div class="stage-ship-upgrade' + (canAfford ? '' : ' disabled') + '" onclick="buyShip(' + s.tier + ')">';
          html += '<div><div class="stage-ship-upgrade-name">' + s.name + '</div>';
          html += '<div class="stage-ship-upgrade-info">' + s.hp + ' HP · ' + s.crewSlots.length + ' crew · Cargo ' + G.formatMoney(s.cargoValue) + '</div></div>';
          html += '<div class="stage-ship-upgrade-cost">' + G.formatMoney(s.cost) + '</div>';
          html += '</div>';
        }
      } else {
        var cargoAffordable = G.getAffordableLoadRatio(playerShip.tierData) > 0;
        html += _buildPortActions(playerShip, 'loadCargoAndSail()', v.loading ? 'Loading cargo…' : 'Load & Set Sail', v.loading || !cargoAffordable);
        html += _buildShipUpgrades(playerShip, v.loading);
      }
    } else if (stage.id === 'manage_port') {
      html += '<h3>In Port — ' + (v.port || '') + '</h3>';
      if (playerShip) {
        var saleStartPct = Math.max(0, Math.min(100, Math.round(v.saleStartPct || 0)));
        var oilLeft = Math.round(G.voyage.oilPct || 0);
        var soldPct = Math.max(0, saleStartPct - oilLeft);
        var loadedBarrels = cargoCapacity * saleStartPct / 100;
        var soldBarrels = cargoCapacity * soldPct / 100;
        var totalSaleValue = v.saleValue || G.getCargoSaleValue(playerShip.tierData);
        var soldValue = saleStartPct > 0 ? Math.round(totalSaleValue * (soldPct / saleStartPct)) : 0;
        var totalPurchaseCost = Math.round(v.cargoCost || 0);
        var purchaseCost = saleStartPct > 0 ? Math.round(totalPurchaseCost * (soldPct / saleStartPct)) : 0;
        var profit = soldValue - purchaseCost;
        html += _buildCargoSummary({
          priceText: '$' + G.getCurrentSellPrice() + '/bbl',
          transferLabel: 'Sold',
          transferText: _formatBarrels(soldBarrels) + ' / ' + _formatBarrels(loadedBarrels),
          totalLabel: 'Revenue',
          totalText: G.formatMoney(soldValue),
          totalClass: '',
          extraRows: [
            { label: 'Purchase cost', text: G.formatMoney(purchaseCost), className: 'cost' },
            { label: 'Profit', text: G.formatMoney(profit), className: profit >= 0 ? 'positive' : 'negative' }
          ]
        });
      }

      var saleStatus = '&nbsp;';
      if (v.selling) {
        saleStatus = 'Selling cargo…';
      }
      html += '<div class="stage-auto-label">' + saleStatus + '</div>';
      html += _buildPortActions(playerShip, 'continueVoyage()', 'Sail Home', v.selling !== 'done');
    } else if (stage.auto) {
      // Auto stage — just show what's happening
      html += '<div class="stage-auto-label">' + stage.label + '…</div>';
    }

    card.innerHTML = html;
    card.classList.add('active');
  };

  G.getRepairCost = function (playerShip) {
    var missing = playerShip.maxHp - playerShip.hp;
    // 10% of ship cost per HP point
    var costPerHp = Math.round(playerShip.tierData.cost * 0.1);
    return missing * costPerHp;
  };

  G.syncTransitHpToActiveShip = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip) return;
    if (typeof G.transit.hp !== 'number') return;
    playerShip.owned.hp = Math.max(0, Math.min(playerShip.maxHp, G.transit.hp));
  };

  G.syncActiveShipHpToTransit = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip) return;
    G.transit.hp = playerShip.owned.hp;
    G.transit.maxHp = playerShip.maxHp;
  };

  window.continueVoyage = function () {
    if (G.voyage && G.voyage.stages[G.voyage.stageIdx] &&
        G.voyage.stages[G.voyage.stageIdx].id === 'manage_port') {
      G.advanceStage();
    }
  };

  window.repairShip = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip || playerShip.hp >= playerShip.maxHp) return;
    var cost = G.getRepairCost(playerShip);
    if (G.player.bank < cost) return;
    G.player.bank -= cost;
    playerShip.owned.hp = playerShip.maxHp;
    G.syncActiveShipHpToTransit();
    G.savePlayer();
    document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
    if (G.renderShipButton) G.renderShipButton();
    G.renderDock();
    G.updateMapStageCard();
  };

  function _getRoleReloadState(role) {
    if ((G.state !== 'TRANSIT_FORWARD' && G.state !== 'TRANSIT_RETURN') || !G.transit) return null;
    if (role === 'Shotgunner') {
      var elapsedSinceShot = G.transit.elapsed - G.transit.lastShotTime;
      var cooldown = G.transit.shotgunCooldown || 1.5;
      if (elapsedSinceShot < cooldown) {
        return { label: 'Reloading', className: 'reloading' };
      }
    }
    return null;
  }

  G.getCrewActionState = function (role) {
    var member = G.getCrewForRole ? G.getCrewForRole(role) : null;
    if (member && member.alive === false) {
      return { label: 'Dead', className: 'dead' };
    }

    var reload = _getRoleReloadState(role);
    if (reload) return reload;

    if (G.state === 'AUTO_STAGE') {
      if (role === 'Captain') return { label: 'Sailing' };
      return { label: '' };
    }
    if (G.state === 'MINESWEEPER') {
      if (role === 'Swimmer') return { label: 'In the water', className: 'deployed' };
      if (role === 'Captain') return { label: 'At helm' };
      return { label: '' };
    }
    if (G.state === 'TRANSIT_FORWARD' || G.state === 'TRANSIT_RETURN') {
      if (role === 'Captain') {
        var t = G.transit;
        if (t.shipSpeedTarget > 0) return { label: '▲ Forward' };
        if (t.shipSpeedTarget < 0) return { label: '▼ Reverse' };
        return { label: '⏸ Holding' };
      }
      if (role === 'Shotgunner') return { label: 'Ready' };
      if (role === 'Gunner') return { label: 'Scanning' };
      if (role === 'Navigator') return { label: 'Plotting' };
      return { label: '' };
    }
    return { label: '' };
  };

  function _renderCrewActionContent(actionEl, role) {
    if (!actionEl) return;
    var state = G.getCrewActionState(role);
    var label = state && state.label ? state.label : '';
    actionEl.textContent = label || '';
    actionEl.className = 'crew-slot-action' + (state && state.className ? ' ' + state.className : '');
  }

  G.updateCrewAction = function (role) {
    var actionEl = document.querySelector('.crew-slot[data-role="' + role + '"] .crew-slot-action');
    if (actionEl) {
      _renderCrewActionContent(actionEl, role);
    }
  };

  G.updateCaptainAction = function () {
    G.updateCrewAction('Captain');
  };

  G.updateCrewActions = function () {
    var container = document.getElementById('tacticalCrewSlots');
    if (!container) return;
    var slots = container.querySelectorAll('.crew-slot[data-role]');
    for (var i = 0; i < slots.length; i++) {
      G.updateCrewAction(slots[i].getAttribute('data-role'));
    }
  };

  function _getCrewSlotHeaderLabel(role) {
    if (role === 'Shotgunner') return 'Shotgun';
    return role;
  }

  // --- Unified crew bar (all states) ---
  G.renderTacticalCrewBar = function () {
    var container = document.getElementById('tacticalCrewSlots');
    if (!container) return;
    container.innerHTML = '';

    if (!G.player || !G.player.crew) return;

    var isMenu = (G.state === 'MENU');
    var isPortHover = isMenu || (G.voyage && G.voyage.stages && G.voyage.stageIdx >= 0 &&
      G.voyage.stages[G.voyage.stageIdx] &&
      G.voyage.stages[G.voyage.stageIdx].id === 'manage_port');

    var playerShip = G.getActivePlayerShip();
    if (!playerShip) return;
    var slots = playerShip.tierData.crewSlots;

    for (var i = 0; i < slots.length; i++) {
      (function (role) {
        var member = G.getCrewForRole(role);
        var slotEl = document.createElement('div');
        slotEl.className = 'crew-slot';
        slotEl.setAttribute('data-role', role);

        if (member) {
          // Portrait
          var card = _buildCrewCard(member, isMenu);
          slotEl.appendChild(card);

          // Text info beside portrait
          var info = document.createElement('div');
          info.className = 'crew-slot-info';

          var topGroup = document.createElement('div');
          topGroup.className = 'crew-slot-top';

          var header = document.createElement('div');
          header.className = 'crew-slot-header';
          header.textContent = _getCrewSlotHeaderLabel(role).toUpperCase();
          topGroup.appendChild(header);

          var nameEl = document.createElement('div');
          nameEl.className = 'crew-slot-name';
          nameEl.textContent = member.name;
          topGroup.appendChild(nameEl);

          info.appendChild(topGroup);

          // Dynamic action text (only during gameplay)
          var actionEl = document.createElement('div');
          actionEl.className = 'crew-slot-action';
          _renderCrewActionContent(actionEl, role);
          info.appendChild(actionEl);

          slotEl.appendChild(info);

          slotEl.addEventListener('mouseenter', function () {
            G.showCrewPopover(member, role, slotEl, { dismissible: isPortHover });
          });
          slotEl.addEventListener('mouseleave', function () {
            if (G.hideCrewPopoverSoon) G.hideCrewPopoverSoon();
          });
        } else {
          // Empty hire slot — same structure as filled to prevent layout shift
          var empty = document.createElement('div');
          empty.className = 'crew-slot-empty';
          empty.textContent = 'HIRE';
          slotEl.appendChild(empty);

          var emptyInfo = document.createElement('div');
          emptyInfo.className = 'crew-slot-info';
          var emptyTop = document.createElement('div');
          emptyTop.className = 'crew-slot-top';
          var emptyHeader = document.createElement('div');
          emptyHeader.className = 'crew-slot-header';
          emptyHeader.textContent = _getCrewSlotHeaderLabel(role).toUpperCase();
          emptyTop.appendChild(emptyHeader);
          var emptyName = document.createElement('div');
          emptyName.className = 'crew-slot-name';
          emptyName.innerHTML = '&nbsp;';
          emptyTop.appendChild(emptyName);
          emptyInfo.appendChild(emptyTop);
          // Spacer for action line to match filled slot height
          var emptySpacer = document.createElement('div');
          emptySpacer.className = 'crew-slot-action';
          _renderCrewActionContent(emptySpacer, role);
          emptyInfo.appendChild(emptySpacer);
          slotEl.appendChild(emptyInfo);

          slotEl.addEventListener('mouseenter', function () {
            G.showCrewPopover(null, role, slotEl, { dismissible: false });
          });
          slotEl.addEventListener('mouseleave', function () {
            if (G.hideCrewPopoverSoon) G.hideCrewPopoverSoon();
          });
          if (isPortHover) {
            slotEl.addEventListener('click', function (e) {
              e.stopPropagation();
              G.showHireModal(role);
            });
          }
        }

        container.appendChild(slotEl);
      })(slots[i]);
    }
  };

  function _buildCrewCard(member, clickable) {
    var card = document.createElement('div');
    var classes = 'crew-card';
    if (clickable) classes += ' clickable';
    if (member.alive === false) classes += ' crew-dead';
    if (G.state === 'MINESWEEPER' && member.role === 'Swimmer' && member.alive !== false) classes += ' crew-deployed';
    card.className = classes;
    var portrait = document.createElement('div');
    portrait.className = 'crew-card-portrait';
    portrait.style.backgroundImage = 'url(' + G.getPortraitSrc(member.charId) + ')';
    card.appendChild(portrait);

    return card;
  }

  // --- Tactical menu ---
  // Expose for HTML onclick
  window.newGame = G.newGame;
  window.showHelp = G.showHelp;
  window.startRound = function () { G.startVoyage(); };
  window.startTestMode = function () { G.startTestMode(); };
  window.goAgain = function () { G.goAgain(); };
  window.cashOut = function () { G.cashOut(); };
  window.continueGame = function () { G.continueGame(); };
  window.toggleMute = function () { G.toggleMute(); };
  window.transitControl = function (a) { G.transitControl(a); };
  window.onShipwreckContinue = function () { G.onShipwreckContinue(); };
  window.onRetreatToPort = function () { G.onRetreatToPort(); };
  window.onRetreatContinue = function () { G.onRetreatContinue(); };
  window.onGameOverRestart = function () { G.onGameOverRestart(); };
})();
