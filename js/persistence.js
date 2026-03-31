// Save/load, migration, and localStorage persistence
(function () {
  var G = window.Game;
  var SAVE_KEY = "hormuz_save";
  var SAVE_VERSION = 11;

  G.savedMinesweeper = null;

  G.savePlayer = function () {
    if (G.devFlags && G.devFlags.disablePersistence) return;
    try {
      var stage =
        G.voyage && G.voyage.stages && G.voyage.stageIdx >= 0
          ? G.voyage.stages[G.voyage.stageIdx]
          : null;
      var shouldSaveMines =
        stage &&
        (stage.id === "mines_fwd" || stage.id === "mines_ret") &&
        G.ms &&
        G.ms.mines &&
        G.getMinesweeperSnapshot;
      var voyageSnapshot = {
        stageIdx: G.voyage.stageIdx,
        originPort: G.voyage.originPort,
        port: G.voyage.port,
        contract: G.voyage.contract,
        usesSuppliedShip: !!G.voyage.usesSuppliedShip,
        stages: G.voyage.stages,
        departureDay: G.voyage.departureDay,
        outboundDays: G.voyage.outboundDays,
        returnDays: G.voyage.returnDays,
        portBulletin: G.voyage.portBulletin,
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
    } catch (e) {
      /* localStorage unavailable or full */
    }
  };

  G.loadPlayer = function () {
    if (G.devFlags && G.devFlags.disablePersistence) {
      G.player = G.createFreshPlayer();
      G.voyage = G.createFreshVoyage();
      G.savedMinesweeper = null;
      return;
    }
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        G.player = G.createFreshPlayer();
        return;
      }
      var data = JSON.parse(raw);
      if (!data || !data.player) {
        G.player = G.createFreshPlayer();
        return;
      }
      if (data.version < SAVE_VERSION) {
        data = G.migrateSave(data);
      }
      G.player = data.player;
      if (G.ensureHireState) G.ensureHireState();
      if (!G.player.market) {
        G.player.market = G.createMarketForTurn(G.player.turn || 0, null);
      }
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
      if (typeof data.voyage.saleValue !== "number") data.voyage.saleValue = 0;
      data.version = 5;
    }
    if (data.version < 6) {
      data.minesweeper = null;
      data.version = 6;
    }
    if (data.version < 7) {
      data.player.market = G.createMarketForTurn(
        data.player.turn || 0,
        data.player.market || null
      );
      data.voyage = data.voyage || {};
      if (typeof data.voyage.cargoCost !== "number") data.voyage.cargoCost = 0;
      if (typeof data.voyage.saleStartPct !== "number") {
        data.voyage.saleStartPct = 0;
      }
      if (typeof data.player.conflictTier !== "number") {
        data.player.conflictTier = 0;
      }
      data.version = 7;
    }
    if (data.version < 8) {
      if (G.ensureHireState) {
        G.ensureHireState(data.player);
      }
      data.version = 8;
    }
    if (data.version < 9) {
      if (typeof data.player.calendarDay !== "number") {
        data.player.calendarDay = data.player.turn || 0;
      }
      if (data.player.latestBulletin === undefined) {
        data.player.latestBulletin = null;
      }
      data.version = 9;
    }
    if (data.version < 10) {
      if (data.player.homePort === undefined) {
        data.player.homePort = G.ORIGIN_PORT ? G.ORIGIN_PORT.name : "Persian Gulf";
      }
      if (data.player.onboardingDone === undefined) {
        if (data.player.tutorialDone !== undefined) {
          data.player.onboardingDone = !!data.player.tutorialDone;
        } else {
          data.player.onboardingDone = true;
        }
      }
      if (data.player.starterCrewGranted === undefined) {
        data.player.starterCrewGranted = true;
      }
      data.voyage = data.voyage || {};
      if (data.voyage.originPort === undefined) data.voyage.originPort = "";
      if (data.voyage.contract === undefined) data.voyage.contract = null;
      if (data.voyage.usesSuppliedShip === undefined) {
        data.voyage.usesSuppliedShip = false;
      }
      data.version = 10;
    }
    if (data.version < 11) {
      if (!Array.isArray(data.player.ownedShips)) data.player.ownedShips = [];
      if (!data.player.contractProgress) data.player.contractProgress = {};
      if (!data.player.tipFlags) data.player.tipFlags = {};
      if (
        data.player.tutorialDone !== undefined &&
        data.player.onboardingDone === undefined
      ) {
        data.player.onboardingDone = !!data.player.tutorialDone;
      }
      delete data.player.tutorialDone;
      if (data.voyage.usesSuppliedShip === undefined) {
        data.voyage.usesSuppliedShip = false;
      }
      data.version = 11;
    }
    return data;
  };

  G.deleteSave = function () {
    if (G.devFlags && G.devFlags.disablePersistence) return;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {}
  };
})();
