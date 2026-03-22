// Ship tier definitions — data model for all tanker classes
// Difficulty stats (mineRatio, missileRate, etc.) are turn-based, not ship-based.
// See getDifficulty() in transit.js for the scaling formulas.
(function () {
  var G = window.Game;

  G.SHIP_TIERS = [
    {
      tier: 1, name: 'The Rustbucket', shipClass: 'Coastal Tanker',
      cost: 5000000, cargoValue: 8000000, gridWidth: 1,
      crewSlots: ['Captain', 'Swimmer', 'Shotgunner'],
      hp: 1, speed: 3.5,
      sprite: 'sprites/ships/ship-1.png',
      flavorText: "Iran doesn't even bother with you."
    },
    {
      tier: 2, name: 'The Workhorse', shipClass: 'Handymax',
      cost: 20000000, cargoValue: 30000000, gridWidth: 1,
      crewSlots: ['Captain', 'Swimmer', 'Shotgunner', 'Gunner'],
      hp: 3, speed: 3.0,
      sprite: 'sprites/ships/ship-2.png',
      flavorText: 'Room for a Gunner. Shaheds start spawning.'
    },
    {
      tier: 3, name: 'The Canal Runner', shipClass: 'Panamax',
      cost: 40000000, cargoValue: 50000000, gridWidth: 1,
      crewSlots: ['Captain', 'Swimmer', 'Shotgunner', 'Gunner'],
      hp: 4, speed: 2.5,
      sprite: 'sprites/ships/ship-2.png',
      flavorText: 'Named for the Panama Canal, which is nowhere near here.'
    },
    {
      tier: 4, name: 'The Bread & Butter', shipClass: 'Aframax',
      cost: 55000000, cargoValue: 75000000, gridWidth: 1,
      crewSlots: ['Captain', 'Swimmer', 'Shotgunner', 'Gunner', 'Navigator'],
      hp: 5, speed: 2.0,
      sprite: 'sprites/ships/ship-3.png',
      flavorText: 'Iran is paying attention now.'
    },
    {
      tier: 5, name: 'The Big Boy', shipClass: 'Suezmax',
      cost: 80000000, cargoValue: 100000000, gridWidth: 2,
      crewSlots: ['Captain', 'Swimmer', 'Shotgunner', 'Gunner', 'Navigator'],
      hp: 6, speed: 1.5,
      sprite: 'sprites/ships/ship-3.png',
      flavorText: 'Named for the Suez Canal, also not here.'
    },
    {
      tier: 6, name: 'The Whale', shipClass: 'VLCC',
      cost: 120000000, cargoValue: 200000000, gridWidth: 2,
      crewSlots: ['Captain', 'Swimmer', 'Shotgunner', 'Gunner', 'Navigator', 'Engineer'],
      hp: 8, speed: 1.2,
      sprite: 'sprites/ships/ship-3.png',
      flavorText: 'One trip doubles your money. One mistake sinks $320M.'
    }
  ];

  // Derived properties for backward compat
  G.SHIP_TIERS.forEach(function (s) {
    s.crewCap = s.crewSlots.length;
    s.hasGunner = s.crewSlots.indexOf('Gunner') !== -1;
    s.slots = Math.max(0, s.crewSlots.length - 3); // legacy compat
  });

  G.getShipTier = function (tier) {
    return G.SHIP_TIERS[tier - 1];
  };
})();
