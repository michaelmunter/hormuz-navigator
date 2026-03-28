// Role definitions — single source of truth for all crew roles
// Equipment that unlocks or enhances a role references role.id from here.
// Roles never reference equipment — the dependency flows one way.
(function () {
  var G = window.Game;

  G.ROLES = {
    captain: {
      id: "captain",
      name: "Captain",
      phase: "transit",
      required: true,
      limit: 1,
      desc: "Sails the ship. Every ship needs one.",
      effect: "Counts toward crew cap. Ship cannot depart without a Captain.",
    },
    swimmer: {
      id: "swimmer",
      name: "Swimmer",
      phase: "minesweeper",
      required: true,
      limit: 1,
      desc: "Swims ahead to physically check cells for mines.",
      effect: "Provides safe cell reveals. Dies on mine hit.",
    },
    shotgunner: {
      id: "shotgunner",
      name: "Shotgunner",
      phase: "transit",
      required: true,
      limit: 1,
      desc: "Operates the anti-FPV shotgun on deck.",
      effect: "Player clicks FPVs to shoot. Without one, FPVs hit unopposed.",
    },
    gunner: {
      id: "gunner",
      name: "Gunner",
      phase: "transit",
      required: false,
      limit: 1,
      desc: "Operates the auto cannon against shaheds.",
      effect:
        "Shaheds only spawn when a Gunner is aboard. Can also shoot FPVs as backup.",
      minSlots: 1, // requires at least 1 equipment slot on ship
    },
    navigator: {
      id: "navigator",
      name: "Navigator",
      phase: "transit",
      required: false,
      limit: 1,
      desc: "Improves missile trajectory visibility.",
      effect: "May reveal shahed spawn points early. Extends trajectory lines.",
      minSlots: 2,
    },
    engineer: {
      id: "engineer",
      name: "Engineer",
      phase: "transit",
      required: false,
      limit: 1,
      desc: "Provides passive ship bonuses.",
      effect: "Extra HP, missile intercept chance, or both.",
      minSlots: 2,
    },
    broker: {
      id: "broker",
      name: "Broker",
      phase: "delivery",
      required: false,
      limit: 1,
      desc: "Manipulates oil markets on delivery.",
      effect:
        "Cargo value gets a multiplier with variance (0.8x-1.5x, averaging above 1.0).",
      minSlots: 3,
    },
    standby: {
      id: "standby",
      name: "Standby",
      phase: null,
      required: false,
      limit: null,
      desc: "On standby. Not assigned to any active duty.",
      effect: "No effect. Crew member is idle but available.",
    },
  };

  // Ordered list of role IDs (for UI cycling, dropdowns, etc.)
  G.ROLE_ORDER = [
    "captain",
    "swimmer",
    "shotgunner",
    "gunner",
    "navigator",
    "engineer",
    "broker",
    "standby",
  ];

  // Legacy compat: flat string array used by crew.js role cycling
  G.CREW_ROLES = G.ROLE_ORDER.map(function (id) {
    return G.ROLES[id].name;
  });

  // Lookup helpers
  G.getRoleById = function (id) {
    return G.ROLES[id] || null;
  };

  G.getRoleByName = function (name) {
    var key = name.toLowerCase();
    return G.ROLES[key] || null;
  };

  // Get roles relevant to a game phase
  G.getRolesForPhase = function (phase) {
    var result = [];
    for (var i = 0; i < G.ROLE_ORDER.length; i++) {
      var role = G.ROLES[G.ROLE_ORDER[i]];
      if (role.phase === phase) result.push(role);
    }
    return result;
  };

  // Check if a crew member's role is relevant to the current phase
  G.isRoleRelevant = function (roleName, phase) {
    var role = G.getRoleByName(roleName);
    if (!role) return false;
    if (role.id === "captain") return true; // captain always relevant
    return role.phase === phase;
  };

  // Get role names available for a given ship (filters by minSlots)
  // Standby is always available. Roles with minSlots > ship.slots are locked.
  G.getAvailableRoles = function (shipTierData) {
    var slots = shipTierData ? shipTierData.slots : 0;
    var result = [];
    for (var i = 0; i < G.ROLE_ORDER.length; i++) {
      var role = G.ROLES[G.ROLE_ORDER[i]];
      if (role.minSlots && slots < role.minSlots) continue;
      result.push(role.name);
    }
    return result;
  };
})();
