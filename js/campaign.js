// Campaign calendar, voyage factories, and oil-market helpers
(function () {
  var G = window.Game = window.Game || {};

  G.STARTING_BANK = 0;
  G.MARKET_REFERENCE_PRICE = 82;
  G.MARKET_CARGO_COST_SCALE = 0.09;
  G.CAMPAIGN_MONTHS = [
    { name: "June", shortName: "Jun", days: 30 },
    { name: "July", shortName: "Jul", days: 31 },
    { name: "August", shortName: "Aug", days: 31 },
    { name: "September", shortName: "Sep", days: 30 },
    { name: "October", shortName: "Oct", days: 31 },
    { name: "November", shortName: "Nov", days: 30 },
    { name: "December", shortName: "Dec", days: 31 },
    { name: "January", shortName: "Jan", days: 31 },
    { name: "February", shortName: "Feb", days: 28 },
    { name: "March", shortName: "Mar", days: 31 },
    { name: "April", shortName: "Apr", days: 30 },
    { name: "May", shortName: "May", days: 31 }
  ];
  G.player = null;

  G.createFreshVoyage = function () {
    return {
      stageIdx: -1,
      originPort: "",
      port: "",
      contract: null,
      usesSuppliedShip: false,
      stages: [],
      departureDay: 0,
      outboundDays: 0,
      returnDays: 0,
      portBulletin: null,
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

  function buildMarketHeadline(market, turn) {
    var spread = market.sellPrice - market.buyPrice;
    if (turn < 3) {
      return (
        "Gulf crude trades at $" +
        market.buyPrice +
        " buy / $" +
        market.sellPrice +
        " sell as shipping lanes stay open."
      );
    }
    if (turn < 7) {
      return (
        "War-risk jitters push Gulf crude to $" +
        market.buyPrice +
        " buy / $" +
        market.sellPrice +
        " sell."
      );
    }
    return (
      "Escalation sends Gulf crude to $" +
      market.buyPrice +
      " buy / $" +
      market.sellPrice +
      " sell with spreads at $" +
      spread +
      "."
    );
  }

  G.createMarketForTurn = function (turn, previousMarket) {
    var previousMid = previousMarket
      ? (previousMarket.buyPrice + previousMarket.sellPrice) / 2
      : G.MARKET_REFERENCE_PRICE;
    var noise = Math.round(Math.random() * 10 - 5);
    var targetMid = Math.max(68, Math.round(previousMid + noise));
    var spreadBase = turn < 3 ? 14 : turn < 7 ? 19 : 26;
    var spread = spreadBase + Math.floor(Math.random() * 5);
    var buyPrice = Math.max(58, targetMid - Math.floor(spread / 2));
    var sellPrice = Math.max(buyPrice + 4, targetMid + Math.ceil(spread / 2));
    return {
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      headline: buildMarketHeadline(
        { buyPrice: buyPrice, sellPrice: sellPrice },
        turn
      )
    };
  };

  G.createFreshPlayer = function () {
    var market = G.createMarketForTurn(0, null);
    var player = {
      bank: G.STARTING_BANK,
      crew: [],
      ownedShips: [],
      activeShipIdx: 0,
      turn: 0,
      calendarDay: 0,
      equipment: [],
      inRun: false,
      totalCrewDeaths: 0,
      conflictTier: 0,
      market: market,
      latestBulletin: null,
      homePort: G.ORIGIN_PORT ? G.ORIGIN_PORT.name : "Persian Gulf",
      onboardingDone: true,
      starterCrewGranted: false,
      contractProgress: {},
      tipFlags: {}
    };
    if (G.ensureHireState) G.ensureHireState(player);
    return player;
  };

  G.getCampaignDateParts = function (calendarDay) {
    var dayIndex = Math.max(0, Math.floor(calendarDay || 0));
    var year = 1;
    while (dayIndex >= 365) {
      dayIndex -= 365;
      year++;
    }
    for (var i = 0; i < G.CAMPAIGN_MONTHS.length; i++) {
      if (dayIndex < G.CAMPAIGN_MONTHS[i].days) {
        return {
          year: year,
          monthIndex: i,
          monthName: G.CAMPAIGN_MONTHS[i].name,
          monthShortName: G.CAMPAIGN_MONTHS[i].shortName,
          day: dayIndex + 1
        };
      }
      dayIndex -= G.CAMPAIGN_MONTHS[i].days;
    }
    return {
      year: year,
      monthIndex: G.CAMPAIGN_MONTHS.length - 1,
      monthName: "May",
      monthShortName: "May",
      day: 31
    };
  };

  G.formatCampaignDate = function (calendarDay) {
    var parts = G.getCampaignDateParts(calendarDay);
    return parts.monthShortName + " " + parts.day + ", Y" + parts.year;
  };

  G.formatCampaignDateRange = function (startDay, endDay) {
    var start = G.getCampaignDateParts(startDay);
    var end = G.getCampaignDateParts(endDay);
    if (start.year === end.year && start.monthIndex === end.monthIndex) {
      if (start.day === end.day) {
        return start.monthShortName + " " + start.day + ", Y" + start.year;
      }
      return (
        start.monthShortName +
        " " +
        start.day +
        "-" +
        end.day +
        ", Y" +
        start.year
      );
    }
    if (start.year === end.year) {
      return (
        start.monthShortName +
        " " +
        start.day +
        " - " +
        end.monthShortName +
        " " +
        end.day +
        ", Y" +
        start.year
      );
    }
    return (
      start.monthShortName +
      " " +
      start.day +
      ", Y" +
      start.year +
      " - " +
      end.monthShortName +
      " " +
      end.day +
      ", Y" +
      end.year
    );
  };

  G.getDisplayCalendarDay = function () {
    if (G.voyage && G.voyage.stages && G.voyage.stageIdx >= 0) {
      var stage = G.voyage.stages[G.voyage.stageIdx];
      if (
        stage &&
        stage.id === "manage_port" &&
        typeof G.voyage.departureDay === "number"
      ) {
        return G.voyage.departureDay + Math.max(1, G.voyage.outboundDays || 0);
      }
    }
    if (G.player && typeof G.player.calendarDay === "number") {
      return G.player.calendarDay;
    }
    return 0;
  };

  G.getMapTier = function () {
    if (!G.player || typeof G.player.conflictTier !== "number") return 0;
    return Math.max(0, G.player.conflictTier);
  };

  G.formatMoney = function (amount) {
    return "$" + amount.toLocaleString();
  };

  G.getCurrentBuyPrice = function () {
    return (
      (G.player && G.player.market && G.player.market.buyPrice) ||
      G.MARKET_REFERENCE_PRICE
    );
  };

  G.getCurrentSellPrice = function () {
    return (
      (G.player && G.player.market && G.player.market.sellPrice) ||
      G.MARKET_REFERENCE_PRICE + 8
    );
  };

  G.getCargoPurchaseCost = function (shipTierData) {
    if (!shipTierData) return 0;
    return Math.round(
      shipTierData.cargoValue *
        G.MARKET_CARGO_COST_SCALE *
        (G.getCurrentBuyPrice() / G.MARKET_REFERENCE_PRICE)
    );
  };

  G.getCargoSaleValue = function (shipTierData) {
    if (!shipTierData) return 0;
    return Math.round(
      shipTierData.cargoValue *
        G.MARKET_CARGO_COST_SCALE *
        (G.getCurrentSellPrice() / G.MARKET_REFERENCE_PRICE)
    );
  };

  G.getAffordableLoadRatio = function (shipTierData) {
    var fullCost = G.getCargoPurchaseCost(shipTierData);
    if (!fullCost) return 0;
    return Math.max(0, Math.min(1, G.player.bank / fullCost));
  };

  G.rollMarket = function () {
    if (!G.player) return;
    G.player.market = G.createMarketForTurn(
      G.player.turn,
      G.player.market || null
    );
  };
})();
