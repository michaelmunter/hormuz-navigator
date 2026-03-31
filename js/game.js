// Game state machine, initialization, scoring, phase transitions
(function () {
  const G = window.Game;

  // Game states: MENU, AUTO_STAGE, MINESWEEPER, TRANSIT_FORWARD, TRANSIT_RETURN, SCORE, GAMEOVER
  G.state = "MENU";
  G.activeShip = null; // current ship tier object for active run
  G.cumulativeScore = 0;
  G.roundScore = 0;

  function _getContractProgress(contractId) {
    if (!G.player || !G.player.contractProgress || !contractId) return null;
    return G.player.contractProgress[contractId] || null;
  }

  function _setContractProgress(contractId, snapshot) {
    if (!G.player || !contractId) return;
    if (!G.player.contractProgress) G.player.contractProgress = {};
    G.player.contractProgress[contractId] = snapshot;
  }

  function _clearContractProgress(contractId) {
    if (!G.player || !G.player.contractProgress || !contractId) return;
    delete G.player.contractProgress[contractId];
  }

  function _setTipSeen(tipId) {
    if (!G.player || !tipId) return;
    if (!G.player.tipFlags) G.player.tipFlags = {};
    G.player.tipFlags[tipId] = true;
  }

  function _hasSeenTip(tipId) {
    return !!(G.player && G.player.tipFlags && G.player.tipFlags[tipId]);
  }

  G._incidentTipOnClose = null;

  G.showIncidentTip = function (title, body, onClose) {
    var overlay = document.getElementById("incidentTipOverlay");
    if (!overlay) {
      if (onClose) onClose();
      return;
    }
    document.getElementById("incidentTipTitle").textContent = title || "Incident";
    document.getElementById("incidentTipBody").textContent = body || "";
    G._incidentTipOnClose = onClose || null;
    overlay.classList.add("active");
  };

  G.closeIncidentTip = function () {
    var overlay = document.getElementById("incidentTipOverlay");
    if (overlay) overlay.classList.remove("active");
    var onClose = G._incidentTipOnClose;
    G._incidentTipOnClose = null;
    if (onClose) onClose();
  };

  // Convenience: get active ship data (tier object + current HP)
  G.getActivePlayerShip = function () {
    if (!G.player || !G.player.ownedShips || G.player.ownedShips.length === 0)
      return null;
    var owned = G.player.ownedShips[G.player.activeShipIdx];
    if (!owned) return null;
    var tierData = G.getShipTier(owned.tier);
    return {
      tierData: tierData,
      hp: owned.hp,
      maxHp: tierData.hp,
      owned: owned,
    };
  };

  G.isOwnedShipOperable = function (ownedShip) {
    return !!(
      ownedShip &&
      ownedShip.wrecked !== true &&
      typeof ownedShip.hp === "number" &&
      ownedShip.hp > 0
    );
  };

  G.getSailablePlayerShip = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip || !G.isOwnedShipOperable(playerShip.owned)) return null;
    return playerShip;
  };

  G.getDisplayedShip = function () {
    var playerShip = G.getSailablePlayerShip();
    if (playerShip) return playerShip;
    if (G.voyage && G.voyage.usesSuppliedShip && G.activeShip) {
      return {
        tierData: G.activeShip,
        hp: G.activeShip.hp,
        maxHp: G.activeShip.hp,
        owned: null,
        isSupplied: true,
      };
    }
    return null;
  };

  function _formatBarrels(amount) {
    return Math.round(amount).toLocaleString() + " bbl";
  }

  function _buildPortBulletin(bulletin) {
    if (!bulletin || !bulletin.items || !bulletin.items.length) return "";

    var itemsHtml = "";
    for (var i = 0; i < bulletin.items.length; i++) {
      itemsHtml +=
        '<div class="port-bulletin-item">' + bulletin.items[i].text + "</div>";
    }
    return '<div class="port-bulletin-list">' + itemsHtml + "</div>";
  }

  function _buildStageDate(bulletin) {
    if (!bulletin || !bulletin.rangeLabel) return "";
    return '<div class="stage-date">' + bulletin.rangeLabel + "</div>";
  }

  function _buildEventLabel(bulletin) {
    if (!bulletin || !bulletin.items || !bulletin.items.length) return "";
    return '<div class="stage-subtitle">Events</div>';
  }

  function _buildPortHeader(title, bulletin) {
    return (
      '<div class="port-header">' +
      "<h3>" +
      title +
      "</h3>" +
      _buildStageDate(bulletin) +
      "</div>"
    );
  }

  function _buildContractPanel(contract) {
    if (!contract) return "";
    return (
      '<div class="port-events">' +
      '<div class="stage-subtitle">' +
      contract.name +
      "</div>" +
      '<div class="port-bulletin-list">' +
      '<div class="port-bulletin-item">' +
      contract.origin +
      " → " +
      contract.destination +
      "</div>" +
      '<div class="port-bulletin-item">' +
      contract.cargo +
      ". " +
      contract.brief +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function _buildPortEventsBlock(bulletin) {
    if (!bulletin || !bulletin.items || !bulletin.items.length) return "";
    return (
      '<div class="port-events">' +
      _buildEventLabel(bulletin) +
      _buildPortBulletin(bulletin) +
      "</div>"
    );
  }

  function _buildPortTopGrid(leftHtml, rightHtml) {
    return (
      '<div class="port-top-grid">' +
      '<div class="port-panel port-panel-summary">' +
      leftHtml +
      "</div>" +
      '<div class="port-panel port-panel-events">' +
      rightHtml +
      "</div>" +
      "</div>"
    );
  }

  function _getCargoCapacityBarrels(ship) {
    if (!ship) return 0;
    return (
      (ship.cargoValue * G.MARKET_CARGO_COST_SCALE) / G.MARKET_REFERENCE_PRICE
    );
  }

  function _buildCargoSummary(options) {
    var price = options.priceText || "$" + G.MARKET_REFERENCE_PRICE + "/bbl";
    var transferLabel = options.transferLabel || "Transferred";
    var transferText = options.transferText || "0 bbl";
    var totalLabel = options.totalLabel || "Trade total";
    var totalText = options.totalText || "$0";
    var totalClass = options.totalClass || "";
    var extraRows = options.extraRows || [];
    var extraHtml = "";
    for (var i = 0; i < extraRows.length; i++) {
      var row = extraRows[i];
      extraHtml +=
        '<div class="cargo-summary-row"><span class="cargo-summary-label">' +
        row.label +
        '</span><span class="cargo-summary-value' +
        (row.className ? " " + row.className : "") +
        '">' +
        row.text +
        "</span></div>";
    }

    return (
      '<div class="cargo-summary">' +
      '<div class="cargo-summary-title">Cargo Summary</div>' +
      '<div class="cargo-summary-row"><span class="cargo-summary-label">Crude price</span><span class="cargo-summary-value">' +
      price +
      "</span></div>" +
      '<div class="cargo-summary-row"><span class="cargo-summary-label">' +
      transferLabel +
      '</span><span class="cargo-summary-value">' +
      transferText +
      "</span></div>" +
      '<div class="cargo-summary-row"><span class="cargo-summary-label">' +
      totalLabel +
      '</span><span class="cargo-summary-value' +
      (totalClass ? " " + totalClass : "") +
      '">' +
      totalText +
      "</span></div>" +
      extraHtml +
      "</div>"
    );
  }

  function setStatusBar(text, className) {
    var el = document.getElementById("statusBar");
    el.textContent = text;
    el.className = "status-bar" + (className ? " " + className : "");
  }

  G.setStatus = setStatusBar;

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

      if (
        G.player.inRun &&
        G.voyage &&
        G.voyage.stages &&
        G.voyage.stageIdx >= 0
      ) {
        var restoredStage = G.voyage.stages[G.voyage.stageIdx];
        if (restoredStage && restoredStage.id === "manage_port") {
          G.activeShip = G.getActivePlayerShip()
            ? G.getActivePlayerShip().tierData
            : G.voyage &&
                G.voyage.contract &&
                typeof G.voyage.contract.suppliedShipTier === "number"
              ? G.getShipTier(G.voyage.contract.suppliedShipTier)
              : null;
          if (G.activeShip) G.sprites.ship.src = G.activeShip.sprite;
          G.roundScore = G.voyage.saleValue || 0;
          if (G.voyage.selling && G.voyage.selling !== "done") {
            var remainingPct = Math.max(
              0,
              Math.min(100, Math.round(G.voyage.oilPct || 0)),
            );
            var saleStartPct = Math.max(
              0,
              Math.min(100, Math.round(G.voyage.saleStartPct || 0)),
            );
            var remainingValue =
              saleStartPct > 0
                ? Math.round(
                    (G.voyage.saleValue || 0) * (remainingPct / saleStartPct),
                  )
                : 0;
            if (remainingValue > 0) G.player.bank += remainingValue;
            G.voyage.oilPct = 0;
            G.voyage.cargoLoaded = false;
            G.voyage.selling = "done";
            G.voyage.saleStartPct = 0;
            G.state = "MENU";
            G.updateBarMode("menu");
            G.savePlayer();
          } else {
            G.state = G.voyage.selling === "done" ? "MENU" : "AUTO_STAGE";
            G.updateBarMode(G.voyage.selling === "done" ? "menu" : "auto");
          }
          G.renderDock();
          G.updateMapStageCard();
          return;
        }
        if (
          restoredStage &&
          (restoredStage.id === "mines_fwd" ||
            restoredStage.id === "mines_ret") &&
          G.savedMinesweeper
        ) {
          G.activeShip = G.getActivePlayerShip()
            ? G.getActivePlayerShip().tierData
            : G.voyage &&
                G.voyage.contract &&
                typeof G.voyage.contract.suppliedShipTier === "number"
              ? G.getShipTier(G.voyage.contract.suppliedShipTier)
              : null;
          if (G.activeShip) G.sprites.ship.src = G.activeShip.sprite;
          G.state = "MINESWEEPER";
          G.updateBarMode("gameplay");
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

      if (G.player.bank !== G.STARTING_BANK || G.player.turn > 0) {
        G.showReturningMenu();
      } else {
        G.showMenu();
      }
    }
  }
  G.oceanImg.onload = onMapImgLoad;
  G.landImg.onload = onMapImgLoad;
  G.oceanImg.src = "hormuz-ocean.png";
  G.landImg.src = "hormuz-land.png";

  // Load PNG sprites
  var spriteSrcs = {
    ship: "sprites/ships/ship-1.png",
    shahed: "sprites/shahed.png",
    fpv: "sprites/fpv.png",
    missile: "sprites/missile.png",
    explosion: "sprites/explosion.png",
    missileOceanDrop: "sprites/missile_oceandrop.svg",
  };
  Object.keys(spriteSrcs).forEach(function (name) {
    G.sprites[name].src = spriteSrcs[name];
  });

  G.initBoard = function (turn) {
    var barHeight = 56;
    var maxW = window.innerWidth;
    var maxH = window.innerHeight - barHeight;

    // Set crop region based on campaign tier
    G.crop = G.getCropForContext ? G.getCropForContext(turn) : G.getCropForTier(turn);

    var grid = G.getGridSize(turn);
    G.cols = grid.cols;
    G.rows = grid.rows;

    var cellW = Math.floor(maxW / G.cols);
    var cellH = Math.floor(maxH / G.rows);
    G.CELL = Math.max(12, Math.min(29, Math.floor(Math.min(cellW, cellH) * 0.75)));

    // Grid pixel dimensions
    G.gridW = G.cols * G.CELL;
    G.gridH = G.rows * G.CELL;

    // Canvas fills viewport; grid is centered within it
    var canvasW = maxW;
    var canvasH = maxH;
    G.gridOffsetX = Math.floor((canvasW - G.gridW) / 2);
    G.gridOffsetY = Math.floor((canvasH - G.gridH) / 2);

    // Compute expanded crop that maps the full viewport to source image space.
    // The grid portion (gridOffsetX..gridOffsetX+gridW) maps to G.crop in source space.
    var scaleX = G.crop.w / G.gridW;
    var scaleY = G.crop.h / G.gridH;
    G.viewportCrop = {
      x: G.crop.x - G.gridOffsetX * scaleX,
      y: G.crop.y - G.gridOffsetY * scaleY,
      w: canvasW * scaleX,
      h: canvasH * scaleY
    };

    G.sizeCanvases(canvasW, canvasH);
    G.buildOceanMask(canvasW, canvasH);
    G.drawLayers(canvasW, canvasH);
  };

  // ──────────────────────────────────────────────────────────
  //  VOYAGE STAGE SYSTEM
  // ──────────────────────────────────────────────────────────

  // Stage definitions — {port} replaced with random delivery port
  var STAGE_DEFS = [
    { id: "mines_fwd", label: "Clearing mines" },
    { id: "transit_fwd", label: "Running the strait" },
    { id: "sailing_to", label: "Sailing to {port}", auto: 2000 },
    { id: "manage_port", label: "In port at {port}" },
    { id: "sailing_back", label: "Sailing back", auto: 2000 },
    { id: "mines_ret", label: "Clearing mines" },
    { id: "transit_ret", label: "Running the strait" },
    { id: "arriving", label: "Arriving home", auto: 2000 },
  ];

  G.voyage = G.createFreshVoyage();

  function buildVoyageStages(port) {
    return STAGE_DEFS.map(function (def) {
      return {
        id: def.id,
        label: def.label.replace("{port}", port),
        auto: def.auto || 0,
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
    var fill = document.querySelector(".ship-oil-fill");
    if (fill) fill.style.width = Math.round(G.voyage.oilPct) + "%";
  }

  function _rollVoyageLegDays() {
    return 3 + Math.floor(Math.random() * 3);
  }

  // Start a new voyage or continue from management stage
  G.startVoyage = function () {
    var playerShip = G.getSailablePlayerShip();
    var scriptedContract = G.getPendingContract ? G.getPendingContract() : null;
    var suppliedShipTier = G.getContractShipTier ? G.getContractShipTier(scriptedContract) : null;
    var usesSuppliedShip = !playerShip && suppliedShipTier != null;
    var ship = playerShip ? playerShip.tierData : (usesSuppliedShip ? G.getShipTier(suppliedShipTier) : null);
    if (!ship) return;
    var destination = scriptedContract
      ? scriptedContract.destination
      : G.getRandomPort();
    var originPort = G.getHomePortName ? G.getHomePortName(G.player) : "Persian Gulf";

    G.activeShip = ship;

    // Switch to gameplay bar mode
    G.updateBarMode("gameplay");

    // Load ship sprite
    G.sprites.ship.src = ship.sprite;
    if (!G.sprites.ship.complete && G.sprites.ship.addEventListener) {
      G.sprites.ship.addEventListener("load", function onVoyageShipLoad() {
        G.sprites.ship.removeEventListener("load", onVoyageShipLoad);
        if (G.state === "MINESWEEPER" && G.drawMinesweeperEntryShip) {
          G.drawMinesweeperEntryShip();
        } else if (
          (G.state === "TRANSIT_FORWARD" || G.state === "TRANSIT_RETURN") &&
          G.drawTransitBoard
        ) {
          G.drawTransitBoard(G.transit);
        }
      });
    }

    G.voyage.originPort = originPort;
    G.voyage.port = destination;
    G.voyage.contract = scriptedContract
      ? {
          id: scriptedContract.id,
          name: scriptedContract.name,
          origin: originPort,
          destination: scriptedContract.destination,
          cargo: scriptedContract.cargo,
          brief: scriptedContract.brief,
          suppliedShipTier: suppliedShipTier,
        }
      : {
          id: "standard-voyage",
          name: "Open Contract",
          origin: originPort,
          destination: destination,
          cargo: "Conventional crude",
          brief: "Commercial work through increasingly hostile waters.",
        };
    G.voyage.usesSuppliedShip = !!usesSuppliedShip;
    G.voyage.stages = buildVoyageStages(G.voyage.port);
    G.voyage.stageIdx = -1; // will be incremented by advanceStage
    G.voyage.departureDay =
      typeof G.player.calendarDay === "number" ? G.player.calendarDay : 0;
    G.voyage.outboundDays = _rollVoyageLegDays();
    G.voyage.returnDays = _rollVoyageLegDays();
    G.voyage.portBulletin = null;
    if (scriptedContract && suppliedShipTier != null) {
      G.voyage.cargoLoaded = true;
      G.voyage.oilPct = 100;
      G.voyage.targetOilPct = 100;
      G.voyage.cargoCost = 0;
    }

    // Init board
    G.initBoard(G.getMapTier());
    if (G.renderShipButton) G.renderShipButton();

    G.player.inRun = true;
    G.savePlayer();

    // Advance to first stage (loading cargo)
    G.advanceStage();
  };

  // Advance to the next voyage stage
  G.advanceStage = function () {
    var v = G.voyage;
    if (v.timer) {
      clearTimeout(v.timer);
      v.timer = null;
    }

    v.stageIdx++;

    // Voyage complete — award cargo and start next loop
    if (v.stageIdx >= v.stages.length) {
      G.completeVoyage();
      return;
    }

    var stage = v.stages[v.stageIdx];

    if (stage.auto) {
      // Auto-advance after delay
      G.state = "AUTO_STAGE";
      G.updateBarMode("auto");
      G.renderTacticalCrewBar();
      if (G.renderShipButton) G.renderShipButton();
      G.updateMapStageCard();
      v.timer = setTimeout(function () {
        G.advanceStage();
      }, stage.auto);
    } else {
      // Interactive stage
      switch (stage.id) {
        case "mines_fwd":
          G.updateBarMode("gameplay");
          G.initBoard(G.getMapTier());
          G.state = "MINESWEEPER";
          var diff = G.getDifficulty(G.player.turn);
          var savedContractProgress =
            G.voyage.contract && G.voyage.contract.id
              ? _getContractProgress(G.voyage.contract.id)
              : null;
          if (savedContractProgress && savedContractProgress.minesweeper) {
            G.restoreMinesweeper(savedContractProgress.minesweeper);
          } else {
            G.initMinesweeper(diff.mineRatio);
          }
          G.renderTacticalCrewBar();
          G.updateCrewActions();
          G.drawBoard();
          G.updateMapStageCard();
          break;

        case "transit_fwd":
          G.updateBarMode("gameplay");
          G.startTransit("forward");
          G.updateMapStageCard();
          break;

        case "mines_ret":
          G.updateBarMode("gameplay");
          // Fresh minefield for return trip
          G.initBoard(G.getMapTier());
          G.state = "MINESWEEPER";
          var diffRet = G.getDifficulty(G.player.turn);
          G.initMinesweeper(diffRet.mineRatio);
          G.renderTacticalCrewBar();
          G.updateCrewActions();
          G.drawBoard();
          G.updateMapStageCard();
          break;

        case "transit_ret":
          G.updateBarMode("gameplay");
          G.startTransit("return");
          G.updateMapStageCard();
          break;

        case "manage_port":
          // Arrive in port and immediately begin selling the cargo.
          G.portUpgradesOpen = false;
          if (G.refreshHirePoolForPort) G.refreshHirePoolForPort();
          G.state = "AUTO_STAGE";
          G.updateBarMode("auto");
          G.voyage.saleStartPct = Math.max(
            0,
            Math.min(100, Math.round(G.voyage.oilPct || 0)),
          );
          G.voyage.oilPct = G.voyage.saleStartPct;
          G.voyage.selling = false;
          G.voyage.saleValue = G.activeShip
            ? Math.round(
                G.getCargoSaleValue(G.activeShip) *
                  (G.voyage.saleStartPct / 100),
              )
            : 0;
          if (G.buildPortBulletin) {
            G.voyage.portBulletin = G.buildPortBulletin({
              startDay: G.voyage.departureDay,
              days: G.voyage.outboundDays,
              turn: G.player.turn,
              marketHeadline: G.player.market ? G.player.market.headline : "",
              title: v.port || "Destination Port",
            });
          }
          G.roundScore = G.voyage.saleValue;
          G.renderTacticalCrewBar();
          G.updateMapStageCard();
          G.savePlayer();
          var incidentTitle = "";
          var incidentBody = "";
          if (
            !_hasSeenTip("arrival_with_dead_crew") &&
            G.player &&
            G.player.crew &&
            G.player.crew.some(function (member) { return member.alive === false; })
          ) {
            _setTipSeen("arrival_with_dead_crew");
            incidentTitle = "Casualties";
            incidentBody =
              "You made port, but not everyone did. Dead crew stay dead until you replace them back at home port.";
          }
          if (incidentTitle) {
            G.showIncidentTip(incidentTitle, incidentBody, function () {
              window.sellAndReturn();
            });
          } else {
            window.sellAndReturn();
          }
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
    var startPct = Math.max(
      0,
      Math.min(100, Math.round(v.saleStartPct || v.oilPct || 0)),
    );
    var chunkValue = Math.floor(totalValue / chunks);
    var chunkIdx = 0;
    function tick() {
      chunkIdx++;
      var earned =
        chunkIdx === chunks
          ? totalValue - chunkValue * (chunks - 1)
          : chunkValue;
      G.player.bank += earned;
      G.voyage.oilPct = startPct * (1 - chunkIdx / chunks);
      _updateOilBar();
      G.sounds.cargoSell();
      document.getElementById("menuBankBalance").textContent = G.formatMoney(
        G.player.bank,
      );
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
      var spent =
        chunkIdx === chunks ? totalCost - chunkCost * (chunks - 1) : chunkCost;
      G.player.bank -= spent;
      G.voyage.oilPct = (chunkIdx / chunks) * targetPct;
      _updateOilBar();
      G.sounds.cargoLoad();
      document.getElementById("menuBankBalance").textContent = G.formatMoney(
        G.player.bank,
      );
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
    if (!G.hasCrewRole("Captain")) return;
    _loadCargoAndSail();
  };

  window.beginPendingContract = function () {
    if (!G.hasCrewRole("Captain")) return;
    G.startVoyage();
  };

  window.sellAndReturn = function () {
    var v = G.voyage;
    if (!v.stages || v.stages[v.stageIdx].id !== "manage_port") return;

    v.selling = true;
    G.state = "AUTO_STAGE";
    G.updateBarMode("auto");
    G.renderTacticalCrewBar();
    G.savePlayer();
    _sellCargoChunks(function () {
      v.selling = "done";
      G.state = "MENU";
      G.updateBarMode("menu");
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
      G.drawBoard();
      G.drawTransitRoute(path, G.gctx, 1);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          setTimeout(function () {
            if (onDone) onDone();
          }, holdDuration);
        });
      });
    }

    requestAnimationFrame(animate);
  };

  // ──────────────────────────────────────────────────────────
  //  MINES -> TRANSIT HANDOFF
  //  Fade from the solved board to a clean world-only overlay, then reveal transit.
  // ──────────────────────────────────────────────────────────
  G.transitionMinesToTransit = function (path) {
    var wrap = document.getElementById("boardWrap");
    if (!wrap) {
      G.advanceStage();
      return;
    }
    var rect = wrap.getBoundingClientRect();
    var overlay = document.createElement("canvas");
    overlay.className = "board-crossfade";
    overlay.width = rect.width;
    overlay.height = rect.height;
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.opacity = "1";
    var ovCtx = overlay.getContext("2d");
    var revealFadeDuration = 220;
    var holdDuration = 220;

    ovCtx.clearRect(0, 0, rect.width, rect.height);
    if (G.oceanCanvas)
      ovCtx.drawImage(G.oceanCanvas, 0, 0, rect.width, rect.height);
    if (G.gameCanvas)
      ovCtx.drawImage(G.gameCanvas, 0, 0, rect.width, rect.height);
    if (G.spriteCanvas)
      ovCtx.drawImage(G.spriteCanvas, 0, 0, rect.width, rect.height);
    if (G.landCanvas)
      ovCtx.drawImage(G.landCanvas, 0, 0, rect.width, rect.height);

    wrap.appendChild(overlay);

    setTimeout(function () {
      overlay.style.transition = "opacity " + revealFadeDuration + "ms ease-out";
      requestAnimationFrame(function () {
        overlay.style.opacity = "0";
      });
      setTimeout(function () {
        G.advanceStage();
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, revealFadeDuration + 40);
    }, holdDuration);
  };

  // ──────────────────────────────────────────────────────────
  //  SHIP DESTRUCTION & SHIPWRECK
  // ──────────────────────────────────────────────────────────

  var SURVIVOR_STORIES = [
    "{name} tamed a shark and rode it back to port.",
    "{name} floated on a barrel of crude for three days.",
    "{name} was rescued by a passing fishing boat.",
    "{name} swam 12 miles to shore and hitched a ride.",
    "{name} held onto a refrigerator door. Don't ask.",
    "{name} was found clinging to the ship's flag.",
    "{name} fashioned a raft from debris and sailed home.",
    "{name} was plucked from the water by a helicopter.",
    "{name} washed ashore on Qeshm Island and bribed a fisherman.",
    "{name} doggy-paddled for 6 hours straight.",
  ];

  var DEATH_STORIES = [
    "{name} went down with the ship.",
    "{name} was never found.",
    "{name} didn't make it.",
    "No trace of {name} was recovered.",
    "{name} was last seen heading below deck.",
  ];

  function pickStory(pool, name) {
    var s = pool[Math.floor(Math.random() * pool.length)];
    return s.replace(/\{name\}/g, name);
  }

  G.processShipDestruction = function (cause) {
    var playerShip = G.getActivePlayerShip();
    var isSuppliedRun = !!(
      G.voyage &&
      G.voyage.usesSuppliedShip &&
      G.voyage.contract &&
      typeof G.voyage.contract.suppliedShipTier === "number"
    );
    var shipName = G.activeShip ? G.activeShip.name : (playerShip ? playerShip.tierData.name : "Unknown");

    if (!isSuppliedRun && playerShip && playerShip.owned) {
      playerShip.owned.hp = 0;
      playerShip.owned.wrecked = true;
    }

    var survivors = [];
    var dead = [];
    var crewResults = [];

    for (var i = 0; i < G.player.crew.length; i++) {
      var member = G.player.crew[i];
      if (member.alive === false) {
        dead.push(member);
        crewResults.push({
          member: member,
          survived: false,
          story: pickStory(DEATH_STORIES, member.name),
        });
        continue;
      }
      if (Math.random() < 0.6) {
        survivors.push(member);
        crewResults.push({
          member: member,
          survived: true,
          story: pickStory(SURVIVOR_STORIES, member.name),
        });
      } else {
        member.alive = false;
        dead.push(member);
        crewResults.push({
          member: member,
          survived: false,
          story: pickStory(DEATH_STORIES, member.name),
        });
      }
    }

    G.player.totalCrewDeaths = (G.player.totalCrewDeaths || 0) + dead.length;
    G.player.crew = survivors;
    G.player.inRun = false;

    // Clear voyage state
    G.voyage.stageIdx = -1;
    G.voyage.stages = [];
    if (G.voyage.timer) {
      clearTimeout(G.voyage.timer);
      G.voyage.timer = null;
    }

    G.savePlayer();

    var hasOperableOwnedShip = G.hasOperableOwnedShip
      ? G.hasOperableOwnedShip(G.player)
      : false;
    var hasFallbackContract = !!(
      G.getPendingContract &&
      G.getPendingContract(G.player)
    );

    return {
      cause: cause,
      shipName: shipName,
      crewResults: crewResults,
      survivors: survivors,
      dead: dead,
      isRetired: !hasOperableOwnedShip && !hasFallbackContract,
      isSuppliedRun: isSuppliedRun,
    };
  };

  G.showShipwreckOverlay = function (result) {
    var overlay = document.getElementById("shipwreckOverlay");
    document.getElementById("shipwreckTitle").textContent =
      result.cause === "mine" ? "Mine Strike!" : "Ship Destroyed!";
    document.getElementById("shipwreckCause").textContent =
      result.shipName +
      (result.isSuppliedRun ? " has been written off" : " is wrecked") +
      (result.cause === "mine" ? " after a mine strike." : " in the strait.");

    var listEl = document.getElementById("shipwreckCrewList");
    listEl.innerHTML = "";

    for (var i = 0; i < result.crewResults.length; i++) {
      var cr = result.crewResults[i];
      var row = document.createElement("div");
      row.className =
        "shipwreck-crew-row" + (cr.survived ? " survived" : " dead");

      var portrait = document.createElement("div");
      portrait.className = "shipwreck-portrait";
      portrait.style.backgroundImage =
        "url(" + G.getPortraitSrc(cr.member.charId) + ")";
      row.appendChild(portrait);

      var info = document.createElement("div");
      info.className = "shipwreck-crew-info";
      var nameEl = document.createElement("div");
      nameEl.className = "shipwreck-crew-name";
      nameEl.textContent = cr.member.name + (cr.survived ? "" : " \u2020");
      info.appendChild(nameEl);
      var storyEl = document.createElement("div");
      storyEl.className = "shipwreck-crew-story";
      storyEl.textContent = cr.story;
      info.appendChild(storyEl);
      row.appendChild(info);

      listEl.appendChild(row);
    }

    document.getElementById("shipwreckBank").textContent =
      "Bank: " + G.formatMoney(G.player.bank);

    var btn = document.getElementById("shipwreckContinueBtn");
    if (result.isRetired) {
      btn.textContent = "Game Over \u2014 Cash Out";
    } else {
      btn.textContent = "Return to Port";
    }

    overlay.classList.add("active");
  };

  G.onShipwreckContinue = function () {
    document.getElementById("shipwreckOverlay").classList.remove("active");
    var isRetired = !(
      (G.hasOperableOwnedShip && G.hasOperableOwnedShip(G.player)) ||
      (G.getPendingContract && G.getPendingContract(G.player))
    );
    if (isRetired) {
      G.showGameOver();
    } else {
      G.cumulativeScore = G.player.bank;
      if (G.refreshHirePoolForPort) G.refreshHirePoolForPort();
      G.showMenu();
      if (
        !_hasSeenTip("first_recovery_contract") &&
        G.getPendingContract &&
        G.getPendingContract(G.player) &&
        !G.hasOperableOwnedShip(G.player)
      ) {
        _setTipSeen("first_recovery_contract");
        G.showIncidentTip(
          "Fallback Contract",
          "Your own ship is out of action. The dock will keep posting terminal charters until you can afford repairs or buy back into the route yourself.",
        );
      }
    }
  };

  // Game over — no ship, no funds
  G.showGameOver = function () {
    G.saveHighScore(G.player.bank);
    var overlay = document.getElementById("gameOverOverlay");
    document.getElementById("gameOverBank").textContent = G.formatMoney(
      G.player.bank,
    );
    document.getElementById("gameOverWeeks").textContent = G.player.turn;
    overlay.classList.add("active");
  };

  G.onGameOverRestart = function () {
    document.getElementById("gameOverOverlay").classList.remove("active");
    G.deleteSave();
    G.player = G.createFreshPlayer();
    G.cumulativeScore = G.player.bank;
    G.showMenu();
  };

  // Retreat to port — costs 1 day, allows hiring at nearest port
  G.showRetreatOption = function () {
    var overlay = document.getElementById("retreatOverlay");
    if (!overlay) return;
    var text = overlay.querySelector("p");
    if (text) {
      if (!_hasSeenTip("retreat_after_swimmer_loss")) {
        text.textContent =
          "Your mine-clearer is gone. You can retreat to port, keep the cleared water, and hire a replacement, or press on and let the ship absorb the next mistake.";
        _setTipSeen("retreat_after_swimmer_loss");
      } else {
        text.textContent =
          "Retreat to the nearest port to hire a replacement and preserve your progress, or press on without one.";
      }
    }
    overlay.classList.add("active");
    G.savePlayer();
  };

  G.onRetreatContinue = function () {
    // Continue without swimmer
    document.getElementById("retreatOverlay").classList.remove("active");
    if (G.resolvePendingClearedMine) G.resolvePendingClearedMine();
  };

  G.onRetreatToPort = function () {
    document.getElementById("retreatOverlay").classList.remove("active");
    // Cost: 1 day
    G.player.turn++;
    G.player.calendarDay = (G.player.calendarDay || 0) + 1;
    // Stop minesweeper
    var ms = G.ms;
    ms.gameOver = true;
    clearInterval(ms.timerInterval);
    if (
      G.voyage &&
      G.voyage.contract &&
      G.voyage.contract.id &&
      G.getMinesweeperSnapshot
    ) {
      _setContractProgress(G.voyage.contract.id, {
        minesweeper: G.getMinesweeperSnapshot(),
      });
    }
    // Remove dead crew so player can hire replacements
    G.player.crew = G.player.crew.filter(function (m) {
      return m.alive !== false;
    });
    // Clear voyage and return to menu
    G.voyage.stageIdx = -1;
    G.voyage.stages = [];
    if (G.voyage.timer) {
      clearTimeout(G.voyage.timer);
      G.voyage.timer = null;
    }
    G.player.inRun = false;
    if (G.refreshHirePoolForPort) G.refreshHirePoolForPort();
    G.savePlayer();
    G.showMenu();
  };

  // ──────────────────────────────────────────────────────────
  //  MENU / DOCK
  // ──────────────────────────────────────────────────────────

  G.showMenu = function () {
    G.state = "MENU";
    G.portUpgradesOpen = false;
    G.resetCounterStyle();
    // Clear voyage state
    if (G.voyage.timer) {
      clearTimeout(G.voyage.timer);
      G.voyage.timer = null;
    }
    G.voyage = G.createFreshVoyage();
    if (G.ensureHireState) G.ensureHireState();
    G.updateBarMode("menu");
    G.initBoard(G.getMapTier());
    G.renderDock();
    G.updateMapStageCard();
    G.savePlayer();
  };

  G.showReturningMenu = function () {
    G.showMenu();
  };

  // Called when voyage completes (all stages done) — awards cargo and starts next loop
  G.completeVoyage = function () {
    var t = G.transit;
    var returnStartDay =
      typeof G.voyage.departureDay === "number"
        ? G.voyage.departureDay + Math.max(1, G.voyage.outboundDays || 0)
        : G.player.calendarDay || 0;
    var returnDays = Math.max(1, G.voyage.returnDays || 0);

    if (G.buildPortBulletin) {
      G.player.latestBulletin = G.buildPortBulletin({
        startDay: returnStartDay,
        days: returnDays,
        turn: G.player.turn,
        marketHeadline: G.player.market ? G.player.market.headline : "",
        title: "Persian Gulf",
      });
    }
    G.player.calendarDay = returnStartDay + returnDays;

    // roundScore and bank already updated during selling stage
    G.player.turn++;
    if (G.voyage.contract && G.voyage.contract.id) {
      _clearContractProgress(G.voyage.contract.id);
    }
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

  G.goAgain = function () {
    document.getElementById("scoreOverlay").classList.remove("active");
    G.showMenu();
  };

  G.cashOut = function () {
    // Close any open overlays
    var scoreOvl = document.getElementById("scoreOverlay");
    if (scoreOvl) scoreOvl.classList.remove("active");
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
    if (G.voyage.timer) {
      clearTimeout(G.voyage.timer);
      G.voyage.timer = null;
    }
    G.resetCounterStyle();
    document.getElementById("scoreOverlay").classList.remove("active");
    document.getElementById("shipwreckOverlay").classList.remove("active");

    // Always reset to fresh player
    G.deleteSave();
    G.player = G.createFreshPlayer();
    G.cumulativeScore = G.player.bank;
    G.showMenu();
  };

  // High scores
  G.saveHighScore = function (score) {
    try {
      var scores = JSON.parse(
        localStorage.getItem("hormuz_highscores") || "[]",
      );
      scores.push(score);
      scores.sort(function (a, b) {
        return b - a;
      });
      scores = scores.slice(0, 10);
      localStorage.setItem("hormuz_highscores", JSON.stringify(scores));
    } catch (e) {}
  };

  G.getHighScores = function () {
    try {
      return JSON.parse(localStorage.getItem("hormuz_highscores") || "[]");
    } catch (e) {
      return [];
    }
  };

  G.showHelp = function () {
    document.getElementById("helpModal").classList.add("active");
  };

  if ("serviceWorker" in navigator) {
    var hostname =
      (typeof window !== "undefined" &&
        window.location &&
        window.location.hostname) ||
      (typeof location !== "undefined" && location.hostname) ||
      "";
    var isLocalDevHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1";

    if (isLocalDevHost) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) {
          reg.unregister();
        });
      }).catch(function () {});
      if (window.caches && caches.keys) {
        caches.keys().then(function (keys) {
          keys.forEach(function (key) {
            caches.delete(key);
          });
        }).catch(function () {});
      }
    } else {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  // Test mode
  G.startTestMode = function () {
    G.activeShip = G.getShipTier(4);
    G.sprites.ship.src = G.activeShip.sprite;
    G.player.turn = 5;
    G.updateBarMode("gameplay");
    G.initBoard(G.getMapTier());
    G.state = "MINESWEEPER";
    G.initMinesweeper(0);
    for (var r = 0; r < G.rows; r++) {
      for (var c = 0; c < G.cols; c++) {
        if (G.oceanMask[r][c]) G.ms.revealed[r][c] = true;
      }
    }
    // Set up minimal voyage for stage trail
    G.voyage.port = "Fujairah";
    G.voyage.stages = [
      { id: "test", label: "Test mode" },
      { id: "transit_fwd", label: "Running the strait" },
    ];
    G.voyage.stageIdx = 1;
    G.renderStageTrail();
    G.startTransit("forward");
  };

  G.toggleMute = function () {
    G.soundEnabled = !G.soundEnabled;
    var soundGlyph = document.getElementById("soundGlyph");
    if (soundGlyph) {
      soundGlyph.classList.toggle("sound-on", G.soundEnabled);
      soundGlyph.classList.toggle("sound-off", !G.soundEnabled);
    }
  };

  G.transitControl = function (action) {
    if (action === "forward") G.handleTransitKey("ArrowUp");
    else if (action === "reverse") G.handleTransitKey("ArrowDown");
    else if (action === "stop") G.handleTransitKey(" ");
  };

  // Highlight the active transit direction button
  G.updateTransitButtons = function () {
    var t = G.transit;
    if (!t) return;
    var fwd = document.getElementById("btnForward");
    var stop = document.getElementById("btnStop");
    var rev = document.getElementById("btnReverse");
    if (!fwd) return;
    fwd.classList.toggle("engaged", t.shipSpeedTarget === 1);
    stop.classList.toggle("engaged", t.shipSpeedTarget === 0);
    rev.classList.toggle("engaged", t.shipSpeedTarget === -1);
  };

  G.updateTransitControls = function () {
    var el = document.getElementById("transitControls");
    if (G.state === "TRANSIT_FORWARD" || G.state === "TRANSIT_RETURN") {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  };

  G.setStatus = function (text, className) {
    setStatusBar(text, className);
    G.updateTransitControls();
  };

  // --- Bar mode toggling (menu vs gameplay) ---
  G.updateBarMode = function (mode) {
    var newsTicker = document.getElementById("newsTicker");
    var transitControls = document.getElementById("transitControls");
    var boardWrap = document.getElementById("boardWrap");
    var mapCard = document.getElementById("mapStageCard");

    if (mode === "gameplay") {
      newsTicker.classList.remove("active");
      if (transitControls) transitControls.classList.remove("active");
      if (boardWrap) boardWrap.classList.remove("map-dimmed");
      if (mapCard) mapCard.classList.remove("active");
    } else if (mode === "auto") {
      newsTicker.classList.remove("active");
      if (transitControls) transitControls.classList.remove("active");
      if (boardWrap) boardWrap.classList.add("map-dimmed");
    } else {
      // Menu — dim map, show news
      newsTicker.classList.add("active");
      if (transitControls) transitControls.classList.remove("active");
      if (boardWrap) boardWrap.classList.add("map-dimmed");
    }
  };

  // --- Port action helpers ---
  function _buildPortActions(
    playerShip,
    sailAction,
    sailLabel,
    disabled,
    options,
  ) {
    options = options || {};
    sailLabel = sailLabel || "Set Sail";
    var repairShip = options.repairShip || (playerShip && !playerShip.isSupplied ? playerShip : null);
    var html = '<div class="stage-actions">';
    var sailDisabled = disabled || !G.hasCrewRole("Captain");
    html +=
      '<button class="stage-sail-btn' +
      (sailDisabled ? " disabled" : "") +
      '" onclick="' +
      sailAction +
      '">' +
      sailLabel +
      "</button>";
    html += '<div class="stage-secondary-actions">';
    if (repairShip) {
      var needsRepair = repairShip.hp < repairShip.maxHp;
      var repairCost = needsRepair ? G.getRepairCost(repairShip) : 0;
      var canRepair = needsRepair && !disabled && G.player.bank >= repairCost;
      html +=
        '<button class="stage-repair-btn' +
        (canRepair ? "" : " disabled") +
        '" onclick="repairShip()" title="' +
        (needsRepair ? "Repair hull" : "Hull intact") +
        '">';
      html += needsRepair ? "🔧 " + G.formatMoney(repairCost) : "🔧 Repair";
      html += "</button>";
    }
    if (playerShip && !playerShip.isSupplied) {
      if (options.showShip !== false && _hasShipUpgrades(playerShip)) {
        html +=
          '<button class="stage-ship-btn' +
          (disabled ? " disabled" : "") +
          (G.portUpgradesOpen ? " active" : "") +
          '" onclick="togglePortUpgrades()" aria-expanded="' +
          (G.portUpgradesOpen ? "true" : "false") +
          '">';
        html +=
          '<span class="stage-ship-btn-icon" aria-hidden="true"></span><span>Ships</span>';
        html += "</button>";
      } else if (options.reserveShipSpace) {
        html += '<div class="stage-ship-spacer" aria-hidden="true"></div>';
      }
    }
    html += "</div>";
    html += "</div>";
    return html;
  }

  function _buildShipUpgrades(playerShip, disabled) {
    if (!playerShip) return "";
    var currentTier = playerShip.tierData.tier;
    var html = "";
    var isPortLayout = false;
    var hasUpgrades = false;

    for (var i = 0; i < G.SHIP_TIERS.length; i++) {
      var s = G.SHIP_TIERS[i];
      if (s.tier <= currentTier) continue;
      if (!hasUpgrades) {
        html += '<div class="stage-section-label">Upgrade Ship</div>';
        hasUpgrades = true;
      }
      var canAfford = !disabled && G.player.bank >= s.cost;
      if (s.purchasable === false) continue;
      html +=
        '<div class="stage-ship-upgrade' +
        (canAfford ? "" : " disabled") +
        '" onclick="upgradeShip(' +
        s.tier +
        ')">';
      html += '<div><div class="stage-ship-upgrade-name">' + s.name + "</div>";
      html +=
        '<div class="stage-ship-upgrade-info">' +
        s.hp +
        " HP · " +
        s.crewSlots.length +
        " crew · Cargo " +
        G.formatMoney(s.cargoValue) +
        "</div></div>";
      html +=
        '<div class="stage-ship-upgrade-cost">' +
        G.formatMoney(s.cost) +
        "</div>";
      html += "</div>";
    }
    return html;
  }

  function _hasShipUpgrades(playerShip) {
    if (!playerShip) return false;
    var currentTier = playerShip.tierData.tier;
    for (var i = 0; i < G.SHIP_TIERS.length; i++) {
      if (G.SHIP_TIERS[i].tier > currentTier) return true;
    }
    return false;
  }

  function _buildUpgradePanel(playerShip, disabled) {
    if (!_hasShipUpgrades(playerShip) || !G.portUpgradesOpen) return "";
    return (
      '<div class="stage-upgrade-panel">' +
      _buildShipUpgrades(playerShip, disabled) +
      "</div>"
    );
  }

  G.purchaseShip = function (tier) {
    var tierData = G.getShipTier(tier);
    if (!tierData || G.player.bank < tierData.cost) return false;
    G.player.bank -= tierData.cost;
    G.player.ownedShips.push({ tier: tierData.tier, hp: tierData.hp, wrecked: false });
    G.player.activeShipIdx = G.player.ownedShips.length - 1;
    G.savePlayer();
    return true;
  };

  window.upgradeShip = function (tier) {
    if (!G.purchaseShip(tier)) return;
    document.getElementById("menuBankBalance").textContent = G.formatMoney(
      G.player.bank,
    );
    if (G.renderShipButton) G.renderShipButton();
    G.renderDock();
    G.updateMapStageCard();
  };

  window.buyShip = function (tier) {
    if (!G.purchaseShip(tier)) return;
    G.portUpgradesOpen = false;
    document.getElementById("menuBankBalance").textContent = G.formatMoney(
      G.player.bank,
    );
    if (G.renderShipButton) G.renderShipButton();
    G.renderTacticalCrewBar();
    G.renderDock();
    G.updateMapStageCard();
  };

  window.togglePortUpgrades = function () {
    G.portUpgradesOpen = !G.portUpgradesOpen;
    G.updateMapStageCard();
  };

  // --- Map stage card (overlay on map with contextual info) ---
  G.updateMapStageCard = function () {
    var card = document.getElementById("mapStageCard");
    if (!card) return;
    if (G.updateDockDate) G.updateDockDate();

    var v = G.voyage;
    var stage = v.stages && v.stageIdx >= 0 ? v.stages[v.stageIdx] : null;

    // Hide during active gameplay
    if (
      G.state === "MINESWEEPER" ||
      G.state === "TRANSIT_FORWARD" ||
      G.state === "TRANSIT_RETURN"
    ) {
      card.classList.remove("active");
      return;
    }

    var playerShip = G.getActivePlayerShip();
    var sailablePlayerShip = G.getSailablePlayerShip();
    var voyageShip = sailablePlayerShip || playerShip;
    if (
      stage &&
      v.usesSuppliedShip &&
      v.contract &&
      typeof v.contract.suppliedShipTier === "number"
    ) {
      var suppliedTierData = G.getShipTier(v.contract.suppliedShipTier);
      if (suppliedTierData) {
        voyageShip = {
          tierData: suppliedTierData,
          hp: suppliedTierData.hp,
          maxHp: suppliedTierData.hp,
          owned: null,
          isSupplied: true,
        };
      }
    }
    var html = "";
    var isCompactLayout = !!(stage && stage.auto);
    var cargoValue = G.activeShip
      ? G.activeShip.cargoValue
      : voyageShip
        ? voyageShip.tierData.cargoValue
        : 0;
    var cargoCapacity = voyageShip
      ? _getCargoCapacityBarrels(voyageShip.tierData)
      : 0;
    var cargoCapacityText = voyageShip
      ? _formatBarrels(cargoCapacity)
      : "No ship";

    if (!stage) {
      // At port, no voyage started
      var pendingContract = G.getPendingContract ? G.getPendingContract(G.player) : null;
      var pendingShipTier = pendingContract ? G.getContractShipTier(pendingContract) : null;
      var cardShip =
        sailablePlayerShip ||
        (pendingShipTier != null
          ? {
              tierData: G.getShipTier(pendingShipTier),
              hp: G.getShipTier(pendingShipTier).hp,
              maxHp: G.getShipTier(pendingShipTier).hp,
              owned: null,
              isSupplied: true,
            }
          : playerShip);
      html += _buildPortHeader(
        (G.getHomePortName ? G.getHomePortName(G.player) : "Persian Gulf"),
        G.player.latestBulletin,
      );
      html += '<div class="stage-card-body">';
      if (playerShip && G.portUpgradesOpen && _hasShipUpgrades(playerShip)) {
        // Ships tab — replace body with upgrade list
        html += _buildShipUpgrades(playerShip, v.loading);
      } else if (cardShip) {
        html += _buildContractPanel(pendingContract);
        html += _buildPortEventsBlock(G.player.latestBulletin);
        var loadedPct = Math.round(G.voyage.oilPct || 0);
        var localCapacity = _getCargoCapacityBarrels(cardShip.tierData);
        var loadedBarrels = (localCapacity * loadedPct) / 100;
        var fullLoadCost = pendingContract ? 0 : G.getCargoPurchaseCost(cardShip.tierData);
        html += _buildCargoSummary({
          priceText: pendingContract ? "Cargo supplied" : "$" + G.getCurrentBuyPrice() + "/bbl",
          transferLabel: pendingContract ? "Contract load" : "Loaded",
          transferText:
            _formatBarrels(loadedBarrels) + " / " + _formatBarrels(localCapacity),
          totalLabel: pendingContract ? "Upfront cost" : "Full load cost",
          totalText: G.formatMoney(fullLoadCost),
        });
      } else {
        // No ship — show buy options
        html +=
          '<div class="stage-detail" style="color:var(--dock-text-muted)">You need a ship to set sail.</div>';
        for (var si = 0; si < G.SHIP_TIERS.length; si++) {
          var s = G.SHIP_TIERS[si];
          if (s.purchasable === false) continue;
          var canAfford = G.player.bank >= s.cost;
          html +=
            '<div class="stage-ship-upgrade' +
            (canAfford ? "" : " disabled") +
            '" onclick="buyShip(' +
            s.tier +
            ')">';
          html +=
            '<div><div class="stage-ship-upgrade-name">' + s.name + "</div>";
          html +=
            '<div class="stage-ship-upgrade-info">' +
            s.hp +
            " HP · " +
            s.crewSlots.length +
            " crew · Cargo " +
            G.formatMoney(s.cargoValue) +
            "</div></div>";
          html +=
            '<div class="stage-ship-upgrade-cost">' +
            G.formatMoney(s.cost) +
            "</div>";
          html += "</div>";
        }
      }
      html += '</div>';
      if (cardShip) {
        var cargoAffordable = pendingContract
          ? true
          : G.getAffordableLoadRatio(cardShip.tierData) > 0;
        var shipUnavailable = !!(
          playerShip &&
          playerShip.owned &&
          !G.isOwnedShipOperable(playerShip.owned) &&
          !pendingContract
        );
        if (
          playerShip &&
          playerShip.owned &&
          !G.isOwnedShipOperable(playerShip.owned)
        ) {
          html +=
            '<div class="stage-detail" style="color:var(--dock-text-muted)">Your ship is wrecked. Repair it or take supplied work until you can afford the yard bill.</div>';
        }
        html += _buildPortActions(
          cardShip,
          pendingContract ? "beginPendingContract()" : "loadCargoAndSail()",
          pendingContract ? "Start Contract" : v.loading ? "Loading…" : "Load & Sail",
          v.loading || !cargoAffordable || shipUnavailable,
          {
            showShip: !pendingContract,
            repairShip: playerShip && playerShip.owned ? playerShip : null,
          },
        );
      }
    } else if (stage.id === "manage_port") {
      html += _buildPortHeader(v.port || "Port", v.portBulletin);
      html += '<div class="stage-card-body">';
      html += _buildPortEventsBlock(v.portBulletin);
      if (voyageShip) {
        var saleStartPct = Math.max(
          0,
          Math.min(100, Math.round(v.saleStartPct || 0)),
        );
        var oilLeft = Math.round(G.voyage.oilPct || 0);
        var soldPct = Math.max(0, saleStartPct - oilLeft);
        var loadedBarrels = (cargoCapacity * saleStartPct) / 100;
        var soldBarrels = (cargoCapacity * soldPct) / 100;
        var totalSaleValue =
          v.saleValue || G.getCargoSaleValue(voyageShip.tierData);
        var soldValue =
          saleStartPct > 0
            ? Math.round(totalSaleValue * (soldPct / saleStartPct))
            : 0;
        var totalPurchaseCost = Math.round(v.cargoCost || 0);
        var purchaseCost =
          saleStartPct > 0
            ? Math.round(totalPurchaseCost * (soldPct / saleStartPct))
            : 0;
        var profit = soldValue - purchaseCost;
        html += _buildCargoSummary({
          priceText: "$" + G.getCurrentSellPrice() + "/bbl",
          transferLabel: "Sold",
          transferText:
            _formatBarrels(soldBarrels) + " / " + _formatBarrels(loadedBarrels),
          totalLabel: "Revenue",
          totalText: G.formatMoney(soldValue),
          totalClass: "",
          extraRows: [
            {
              label: "Purchase cost",
              text: G.formatMoney(purchaseCost),
              className: "cost",
            },
            {
              label: "Profit",
              text: G.formatMoney(profit),
              className: profit >= 0 ? "positive" : "negative",
            },
          ],
        });
      }
      html += '</div>';
      if (voyageShip) {
        html += _buildPortActions(
          voyageShip,
          "continueVoyage()",
          "Sail Home",
          v.selling !== "done",
          { showShip: false, reserveShipSpace: true },
        );
      }
    } else if (stage.auto) {
      // Auto stage — just show what's happening
      html += '<div class="stage-auto-label">' + stage.label + "…</div>";
    }

    card.classList.remove("port-layout");
    card.classList.toggle("compact-layout", isCompactLayout);
    card.innerHTML = '<div class="map-stage-card-inner">' + html + "</div>";
    card.classList.add("active");

  };

  G.getRepairCost = function (playerShip) {
    var missing = playerShip.maxHp - playerShip.hp;
    // 10% of ship cost per HP point
    var costPerHp = Math.round(playerShip.tierData.cost * 0.1);
    return missing * costPerHp;
  };

  G.syncTransitHpToActiveShip = function () {
    if (G.voyage && G.voyage.usesSuppliedShip) return;
    var playerShip = G.getActivePlayerShip();
    if (!playerShip) return;
    if (typeof G.transit.hp !== "number") return;
    playerShip.owned.hp = Math.max(0, Math.min(playerShip.maxHp, G.transit.hp));
  };

  G.syncActiveShipHpToTransit = function () {
    if (G.voyage && G.voyage.usesSuppliedShip) return;
    var playerShip = G.getActivePlayerShip();
    if (!playerShip) return;
    G.transit.hp = playerShip.owned.hp;
    G.transit.maxHp = playerShip.maxHp;
  };

  window.continueVoyage = function () {
    if (
      G.voyage &&
      G.voyage.stages[G.voyage.stageIdx] &&
      G.voyage.stages[G.voyage.stageIdx].id === "manage_port"
    ) {
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
    playerShip.owned.wrecked = false;
    G.syncActiveShipHpToTransit();
    G.savePlayer();
    document.getElementById("menuBankBalance").textContent = G.formatMoney(
      G.player.bank,
    );
    if (G.renderShipButton) G.renderShipButton();
    G.renderDock();
    G.updateMapStageCard();
  };

  function _getRoleReloadState(role) {
    if (
      (G.state !== "TRANSIT_FORWARD" && G.state !== "TRANSIT_RETURN") ||
      !G.transit
    )
      return null;
    if (role === "Shotgunner") {
      var elapsedSinceShot = G.transit.elapsed - G.transit.lastShotTime;
      var cooldown = G.transit.shotgunCooldown || 1.5;
      if (elapsedSinceShot < cooldown) {
        return { label: "Reloading", className: "reloading" };
      }
    }
    return null;
  }

  G.getCrewActionState = function (role) {
    var member = G.getCrewForRole ? G.getCrewForRole(role) : null;
    if (member && member.alive === false) {
      return { label: "Dead", className: "dead" };
    }

    var reload = _getRoleReloadState(role);
    if (reload) return reload;

    if (G.state === "AUTO_STAGE") {
      if (role === "Captain") return { label: "Sailing" };
      return { label: "" };
    }
    if (G.state === "MINESWEEPER") {
      if (role === "Swimmer" || role === "Sonar")
        return { label: "In the water", className: "deployed" };
      if (role === "Captain") {
        if (G.ms && G.ms.gameWon) return { label: "Plotting" };
        return { label: "At helm" };
      }
      return { label: "" };
    }
    if (G.state === "TRANSIT_FORWARD" || G.state === "TRANSIT_RETURN") {
      if (role === "Captain") {
        var t = G.transit;
        if (t.shipSpeedTarget > 0) return { label: "▲ Forward" };
        if (t.shipSpeedTarget < 0) return { label: "▼ Reverse" };
        return { label: "⏸ Holding" };
      }
      if (role === "Shotgunner") return { label: "Ready" };
      if (role === "Gunner") return { label: "Scanning" };
      if (role === "Navigator") return { label: "Plotting" };
      return { label: "" };
    }
    return { label: "" };
  };

  function _renderCrewActionContent(actionEl, role) {
    if (!actionEl) return;
    var state = G.getCrewActionState(role);
    var label = state && state.label ? state.label : "";
    actionEl.textContent = label || "";
    actionEl.className =
      "crew-slot-action" +
      (state && state.className ? " " + state.className : "");
  }

  G.updateCrewAction = function (role) {
    var actionEl = document.querySelector(
      '.crew-slot[data-role="' + role + '"] .crew-slot-action',
    );
    if (actionEl) {
      _renderCrewActionContent(actionEl, role);
    }
  };

  G.updateCaptainAction = function () {
    G.updateCrewAction("Captain");
  };

  G.updateCrewActions = function () {
    var container = document.getElementById("tacticalCrewSlots");
    if (!container) return;
    var slots = container.querySelectorAll(".crew-slot[data-role]");
    for (var i = 0; i < slots.length; i++) {
      G.updateCrewAction(slots[i].getAttribute("data-role"));
    }
  };

  function _getCrewSlotHeaderLabel(role) {
    if (role === "Shotgunner") return "Shotgun";
    if (role === "Coffee Boy") return "Coffee";
    return role;
  }

  // --- Unified crew bar (all states) ---
  G.renderTacticalCrewBar = function () {
    var container = document.getElementById("tacticalCrewSlots");
    if (!container) return;
    container.innerHTML = "";

    if (!G.player || !G.player.crew) return;

    var isMenu = G.state === "MENU";
    var isPortHover =
      isMenu ||
      (G.voyage &&
        G.voyage.stages &&
        G.voyage.stageIdx >= 0 &&
        G.voyage.stages[G.voyage.stageIdx] &&
        G.voyage.stages[G.voyage.stageIdx].id === "manage_port");

    var playerShip = G.getActivePlayerShip();
    var shipData = playerShip ? playerShip.tierData : null;
    if (!shipData && G.voyage && G.voyage.usesSuppliedShip && G.activeShip) {
      shipData = G.activeShip;
    }
    if (!shipData && isMenu && G.getPendingContract && G.getContractShipTier) {
      var pendingContract = G.getPendingContract(G.player);
      var pendingShipTier = pendingContract ? G.getContractShipTier(pendingContract) : null;
      if (pendingShipTier != null) shipData = G.getShipTier(pendingShipTier);
    }
    if (!shipData) return;
    var slots = shipData.crewSlots;

    for (var i = 0; i < slots.length; i++) {
      (function (role) {
        var member = G.getCrewForRole(role);
        var slotEl = document.createElement("div");
        slotEl.className = "crew-slot";
        slotEl.setAttribute("data-role", role);

        if (member) {
          // Portrait
          var card = _buildCrewCard(member, isMenu);
          slotEl.appendChild(card);

          // Text info beside portrait
          var info = document.createElement("div");
          info.className = "crew-slot-info";

          var topGroup = document.createElement("div");
          topGroup.className = "crew-slot-top";

          var header = document.createElement("div");
          header.className = "crew-slot-header";
          header.textContent = _getCrewSlotHeaderLabel(role).toUpperCase();
          topGroup.appendChild(header);

          var nameEl = document.createElement("div");
          nameEl.className = "crew-slot-name";
          nameEl.textContent = member.name;
          topGroup.appendChild(nameEl);

          info.appendChild(topGroup);

          // Dynamic action text (only during gameplay)
          var actionEl = document.createElement("div");
          actionEl.className = "crew-slot-action";
          _renderCrewActionContent(actionEl, role);
          info.appendChild(actionEl);

          slotEl.appendChild(info);

          slotEl.addEventListener("mouseenter", function () {
            G.showCrewPopover(member, role, slotEl, {
              dismissible: isPortHover,
            });
          });
          slotEl.addEventListener("mouseleave", function () {
            if (G.hideCrewPopoverSoon) G.hideCrewPopoverSoon();
          });
        } else {
          // Empty hire slot — same structure as filled to prevent layout shift
          var empty = document.createElement("div");
          empty.className = "crew-slot-empty";
          empty.textContent = "HIRE";
          slotEl.appendChild(empty);

          var emptyInfo = document.createElement("div");
          emptyInfo.className = "crew-slot-info";
          var emptyTop = document.createElement("div");
          emptyTop.className = "crew-slot-top";
          var emptyHeader = document.createElement("div");
          emptyHeader.className = "crew-slot-header";
          emptyHeader.textContent = _getCrewSlotHeaderLabel(role).toUpperCase();
          emptyTop.appendChild(emptyHeader);
          var emptyName = document.createElement("div");
          emptyName.className = "crew-slot-name";
          emptyName.innerHTML = "&nbsp;";
          emptyTop.appendChild(emptyName);
          emptyInfo.appendChild(emptyTop);
          // Spacer for action line to match filled slot height
          var emptySpacer = document.createElement("div");
          emptySpacer.className = "crew-slot-action";
          _renderCrewActionContent(emptySpacer, role);
          emptyInfo.appendChild(emptySpacer);
          slotEl.appendChild(emptyInfo);

          slotEl.addEventListener("mouseenter", function () {
            G.showCrewPopover(null, role, slotEl, { dismissible: false });
          });
          slotEl.addEventListener("mouseleave", function () {
            if (G.hideCrewPopoverSoon) G.hideCrewPopoverSoon();
          });
          if (isPortHover) {
            slotEl.addEventListener("click", function (e) {
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
    var card = document.createElement("div");
    var classes = "crew-card";
    if (clickable) classes += " clickable";
    if (member.alive === false) classes += " crew-dead";
    if (
      G.state === "MINESWEEPER" &&
      member.role === "Swimmer" &&
      member.alive !== false
    )
      classes += " crew-deployed";
    card.className = classes;
    var portrait = document.createElement("div");
    portrait.className = "crew-card-portrait";
    portrait.style.backgroundImage =
      "url(" + G.getPortraitSrc(member.charId) + ")";
    card.appendChild(portrait);

    return card;
  }

  // --- Tactical menu ---
  // Expose for HTML onclick
  window.newGame = G.newGame;
  window.showHelp = G.showHelp;
  window.startTestMode = function () {
    G.startTestMode();
  };
  window.goAgain = function () {
    G.goAgain();
  };
  window.cashOut = function () {
    G.cashOut();
  };
  window.toggleMute = function () {
    G.toggleMute();
  };
  window.transitControl = function (a) {
    G.transitControl(a);
  };
  window.onShipwreckContinue = function () {
    G.onShipwreckContinue();
  };
  window.onRetreatToPort = function () {
    G.onRetreatToPort();
  };
  window.onRetreatContinue = function () {
    G.onRetreatContinue();
  };
  window.closeIncidentTip = function () {
    G.closeIncidentTip();
  };
  window.onGameOverRestart = function () {
    G.onGameOverRestart();
  };
})();
