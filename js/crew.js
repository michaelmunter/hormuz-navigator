// Crew system — character pool, hiring, roster management
(function () {
  const G = window.Game;

  // Individual portrait PNGs in sprites/crew/00.png – 27.png (256×340 each)
  var PORTRAIT_DIR = "sprites/crew/";

  // Base hire cost — every character starts from this, then weight × reputation
  var BASE_HIRE_COST = 200000; // $200K
  var INTERN_CHARACTER_ID = 10;
  var PORT_HIRE_POOL_SIZE = 3;

  // 28 characters with individual portraits (sprites/crew/00.png – 27.png, 256×256 each)
  // weight: cost multiplier (1.0 = average, higher = more expensive to hire)
  var CHARACTER_POOL = [
    // Sheet 1 — military / law enforcement
    {
      id: 0,
      name: "Sheriff",
      quirkLabel: "Law & Order",
      quirkStat: "intercept",
      quirkVal: 0.12,
      weight: 1.2,
    },
    {
      id: 1,
      name: "Agent",
      quirkLabel: "Cold Blooded",
      quirkStat: "intercept",
      quirkVal: 0.1,
      weight: 1.3,
    },
    {
      id: 2,
      name: "Sergeant",
      quirkLabel: "Medal of Honor",
      quirkStat: "hp",
      quirkVal: 2,
      weight: 1.7,
    },
    {
      id: 3,
      name: "Professor",
      quirkLabel: "Calculated Risk",
      quirkStat: "visibility",
      quirkVal: 0.15,
      weight: 1.4,
    },
    {
      id: 4,
      name: "Diplomat",
      quirkLabel: "Insider Trading",
      quirkStat: "market",
      quirkVal: 0.2,
      weight: 1.8,
    },
    {
      id: 5,
      name: "Operator",
      quirkLabel: "Breach & Clear",
      quirkStat: "firerate",
      quirkVal: 0.18,
      weight: 1.6,
    },
    {
      id: 6,
      name: "Deckhand",
      quirkLabel: "Steady Hands",
      quirkStat: "firerate",
      quirkVal: 0.1,
      weight: 0.8,
    },
    {
      id: 7,
      name: "Ensign",
      quirkLabel: "By the Book",
      quirkStat: "intercept",
      quirkVal: 0.08,
      weight: 0.9,
    },
    // Sheet 2 — sea creatures
    {
      id: 8,
      name: "Siren",
      quirkLabel: "Lucky Charm",
      quirkStat: "market",
      quirkVal: 0.22,
      weight: 2.0,
    },
    {
      id: 9,
      name: "Merman",
      quirkLabel: "Like mermaid, but sexier",
      quirkStat: "hp",
      quirkVal: 2,
      weight: 1.9,
    },
    // Sheet 3 — mixed crew
    {
      id: 10,
      name: "Intern",
      quirkLabel: "Cheap, plentiful, disposable",
      weight: 0,
      onDeath: "dump in water",
    },
    {
      id: 11,
      name: "Commando",
      quirkLabel: "Night Vision",
      quirkStat: "visibility",
      quirkVal: 0.15,
      weight: 1.4,
    },
    {
      id: 12,
      name: "Imam",
      quirkLabel: "Blessing?",
      quirkStat: "hp",
      quirkVal: 1,
      weight: 1.1,
    },
    {
      id: 13,
      name: "Smuggler",
      quirkLabel: "Quick on the Draw",
      quirkStat: "firerate",
      quirkVal: 0.14,
      weight: 1.2,
    },
    {
      id: 14,
      name: "Shadow",
      quirkLabel: "Ghost Step",
      quirkStat: "intercept",
      quirkVal: 0.15,
      weight: 1.5,
    },
    {
      id: 15,
      name: "Whiskers",
      quirkLabel: "Nine Lives",
      quirkStat: "hp",
      quirkVal: 1,
      weight: 0.6,
    },
    {
      id: 16,
      name: "The Baby",
      quirkLabel: "Surprisingly Quick",
      quirkStat: "firerate",
      quirkVal: 0.15,
      weight: 0.5,
    },
    {
      id: 17,
      name: "Neko",
      quirkLabel: "Cat Reflexes",
      quirkStat: "firerate",
      quirkVal: 0.12,
      weight: 1.1,
    },
    {
      id: 18,
      name: "Captain",
      quirkLabel: "Old Salt",
      quirkStat: "hp",
      quirkVal: 1,
      weight: 1.2,
    },
    // Sheet 4 — rugged crew
    {
      id: 19,
      name: "Cowboy",
      quirkLabel: "Dead Eye",
      quirkStat: "firerate",
      quirkVal: 0.2,
      weight: 1.8,
    },
    {
      id: 20,
      name: "The Pirate",
      quirkLabel: "Seen Worse",
      quirkStat: "hp",
      quirkVal: 1,
      weight: 0.8,
    },
    {
      id: 21,
      name: "Admiral",
      quirkLabel: "Fleet Command",
      quirkStat: "visibility",
      quirkVal: 0.18,
      weight: 1.6,
    },
    {
      id: 22,
      name: "Hard Hat",
      quirkLabel: "Structural Eye",
      quirkStat: "intercept",
      quirkVal: 0.1,
      weight: 1.0,
    },
    {
      id: 23,
      name: "Grizzly",
      quirkLabel: "Built Different",
      quirkStat: "hp",
      quirkVal: 1,
      weight: 1.0,
    },
    {
      id: 24,
      name: "Red Cap",
      quirkLabel: "Quick Fix",
      quirkStat: "intercept",
      quirkVal: 0.1,
      weight: 1.0,
    },
    {
      id: 25,
      name: "Sailor Boy",
      quirkLabel: "Sea Legs",
      quirkStat: "visibility",
      quirkVal: 0.12,
      weight: 0.7,
    },
    {
      id: 26,
      name: "Broker",
      quirkLabel: "Market Sense",
      quirkStat: "market",
      quirkVal: 0.18,
      weight: 1.5,
    },
    {
      id: 27,
      name: "Viper",
      quirkLabel: "Quick Draw",
      quirkStat: "firerate",
      quirkVal: 0.12,
      weight: 1.3,
    },
  ];

  // Roles available for assignment (assigned after hiring)
  G.CHARACTER_POOL = CHARACTER_POOL;
  // G.CREW_ROLES is now defined in roles.js
  G.BASE_HIRE_COST = BASE_HIRE_COST;
  G.INTERN_CHARACTER_ID = INTERN_CHARACTER_ID;

  function getFiniteHireIds() {
    return CHARACTER_POOL
      .filter(function (c) { return c.id !== INTERN_CHARACTER_ID; })
      .map(function (c) { return c.id; });
  }

  function sanitizeHirePool(player, ids, removeRostered) {
    if (!Array.isArray(ids)) ids = [];
    var rosterIds = {};
    var clean = [];
    for (var i = 0; removeRostered && player && player.crew && i < player.crew.length; i++) {
      rosterIds[player.crew[i].charId] = true;
    }
    for (var j = 0; j < ids.length; j++) {
      var id = ids[j];
      if (id === INTERN_CHARACTER_ID) continue;
      if (clean.indexOf(id) >= 0) continue;
      if (removeRostered && rosterIds[id]) continue;
      if (!CHARACTER_POOL.some(function (c) { return c.id === id; })) continue;
      clean.push(id);
    }
    return clean;
  }

  function drawHirePoolFromAvailable(player, count) {
    var available = sanitizeHirePool(player, player && player.availableHirePool, true).slice();
    for (var i = available.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = available[i];
      available[i] = available[j];
      available[j] = tmp;
    }
    return available.slice(0, count || PORT_HIRE_POOL_SIZE);
  }

  G.ensureHireState = function (player) {
    player = player || G.player;
    if (!player) return;
    if (typeof player.portVisitId !== 'number') player.portVisitId = 1;
    if (typeof player.hirePoolVisitId !== 'number') player.hirePoolVisitId = 1;
    if (!Array.isArray(player.availableHirePool)) {
      player.availableHirePool = getFiniteHireIds();
    }
    player.availableHirePool = sanitizeHirePool(player, player.availableHirePool, true);
    var missingCurrentPool = !Array.isArray(player.currentHirePool);
    if (missingCurrentPool) player.currentHirePool = [];
    player.currentHirePool = sanitizeHirePool(player, player.currentHirePool, true).filter(function (id) {
      return player.availableHirePool.indexOf(id) >= 0;
    });
    if (player.hirePoolVisitId !== player.portVisitId || missingCurrentPool) {
      player.currentHirePool = drawHirePoolFromAvailable(player, PORT_HIRE_POOL_SIZE);
      player.hirePoolVisitId = player.portVisitId;
    }
  };

  G.refreshHirePoolForPort = function () {
    if (!G.player) return;
    G.ensureHireState();
    G.player.portVisitId += 1;
    G.player.currentHirePool = drawHirePoolFromAvailable(G.player, PORT_HIRE_POOL_SIZE);
    G.player.hirePoolVisitId = G.player.portVisitId;
  };

  G.consumeHireCandidate = function (charId) {
    if (!G.player || charId === INTERN_CHARACTER_ID) return;
    G.ensureHireState();
    G.player.availableHirePool = G.player.availableHirePool.filter(function (id) {
      return id !== charId;
    });
    G.player.currentHirePool = G.player.currentHirePool.filter(function (id) {
      return id !== charId;
    });
  };

  // Get portrait image path for a character ID
  G.getPortraitSrc = function (charId) {
    var idx = charId < 10 ? "0" + charId : "" + charId;
    return PORTRAIT_DIR + idx + ".png";
  };

  // Calculate hire cost for a character
  G.getHireCost = function (charId) {
    var template = CHARACTER_POOL.find(function (c) {
      return c.id === charId;
    });
    if (!template) return BASE_HIRE_COST;
    if (template.weight === 0) return 0;
    var reputationMultiplier = 1 + 0.1 * (G.player.totalCrewDeaths || 0);
    return Math.round(BASE_HIRE_COST * template.weight * reputationMultiplier);
  };

  // Create a new crew member from pool (role assigned separately)
  G.hireCrewMember = function (charId, role) {
    var template = CHARACTER_POOL.find(function (c) {
      return c.id === charId;
    });
    if (!template) return null;
    return {
      charId: template.id,
      name: template.name,
      role: role || "Standby",
      quirkLabel: template.quirkLabel,
      quirkStat: template.quirkStat,
      quirkVal: template.quirkVal,
      onDeath: template.onDeath,
      hireCost: G.getHireCost(charId),
      alive: true,
    };
  };

  // Get N random candidates not already in the roster
  G.getHireCandidates = function (count) {
    G.ensureHireState();
    var ids = (G.player && G.player.currentHirePool) || [];
    return ids.slice(0, count || PORT_HIRE_POOL_SIZE).map(function (id) {
      return CHARACTER_POOL.find(function (c) { return c.id === id; });
    }).filter(Boolean);
  };

  // Dismiss a crew member by index
  G.dismissCrewMember = function (index) {
    if (index < 0 || index >= G.player.crew.length) return;
    G.player.crew.splice(index, 1);
    G.savePlayer();
  };

  // Change role of a crew member by index
  G.changeCrewRole = function (index, newRole) {
    if (index < 0 || index >= G.player.crew.length) return;
    G.player.crew[index].role = newRole;
    G.savePlayer();
  };

  // Hire a character and add to roster
  G.confirmHire = function (charId) {
    var cost = G.getHireCost(charId);
    if (G.player.bank < cost) return false;
    var member = G.hireCrewMember(charId);
    if (!member) return false;
    G.player.bank -= cost;
    G.player.crew.push(member);
    G.consumeHireCandidate(charId);
    G.savePlayer();
    return true;
  };

  // Hire a character directly into a specific role slot
  G.confirmHireForRole = function (charId, role) {
    var cost = G.getHireCost(charId);
    if (G.player.bank < cost) return false;
    var member = G.hireCrewMember(charId, role);
    if (!member) return false;
    G.player.bank -= cost;
    G.player.crew.push(member);
    G.consumeHireCandidate(charId);
    G.savePlayer();
    return true;
  };

  // Check if any living crew member has a given role
  G.hasCrewRole = function (role) {
    if (!G.player || !G.player.crew) return false;
    for (var i = 0; i < G.player.crew.length; i++) {
      if (G.player.crew[i].role === role && G.player.crew[i].alive !== false)
        return true;
    }
    return false;
  };

  // Find crew member assigned to a role
  G.getCrewForRole = function (role) {
    if (!G.player || !G.player.crew) return null;
    for (var i = 0; i < G.player.crew.length; i++) {
      if (G.player.crew[i].role === role) return G.player.crew[i];
    }
    return null;
  };

  // Find crew index for a role
  G.getCrewIndexForRole = function (role) {
    if (!G.player || !G.player.crew) return -1;
    for (var i = 0; i < G.player.crew.length; i++) {
      if (G.player.crew[i].role === role) return i;
    }
    return -1;
  };

  // No auto-fill — player must hire all crew manually
  G.ensureStartingCrew = function () {};
})();
