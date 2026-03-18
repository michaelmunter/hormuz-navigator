// Ship tier definitions — data model for all tanker classes
// Difficulty stats (mineRatio, missileRate, etc.) are turn-based, not ship-based.
// See getDifficulty() in transit.js for the scaling formulas.
(function () {
  var G = window.Game;

  G.SHIP_TIERS = [
    {
      tier: 1, name: 'The Rustbucket', shipClass: 'Coastal Tanker',
      cost: 5000000, cargoValue: 8000000, gridWidth: 1,
      crewCap: 3, slots: 0, hp: 1, speed: 3.5, hasGunner: false,
      sprite: 'sprites/ships/ship-1.png',
      flavorText: "Captain, Swimmer, Shotgunner. Iran doesn't even bother with you."
    },
    {
      tier: 2, name: 'The Workhorse', shipClass: 'Handymax',
      cost: 20000000, cargoValue: 30000000, gridWidth: 1,
      crewCap: 3, slots: 1, hp: 1, speed: 3.0, hasGunner: true,
      sprite: 'sprites/ships/ship-2.png',
      flavorText: 'Room for a Gunner. Shaheds start spawning.'
    },
    {
      tier: 3, name: 'The Canal Runner', shipClass: 'Panamax',
      cost: 40000000, cargoValue: 50000000, gridWidth: 1,
      crewCap: 4, slots: 2, hp: 1, speed: 2.5, hasGunner: true,
      sprite: 'sprites/ships/ship-2.png',
      flavorText: 'Named for the Panama Canal, which is nowhere near here.'
    },
    {
      tier: 4, name: 'The Bread & Butter', shipClass: 'Aframax',
      cost: 55000000, cargoValue: 75000000, gridWidth: 1,
      crewCap: 5, slots: 3, hp: 1, speed: 2.0, hasGunner: true,
      sprite: 'sprites/ships/ship-3.png',
      flavorText: 'Iran is paying attention now.'
    },
    {
      tier: 5, name: 'The Big Boy', shipClass: 'Suezmax',
      cost: 80000000, cargoValue: 100000000, gridWidth: 2,
      crewCap: 5, slots: 4, hp: 1, speed: 1.5, hasGunner: true,
      sprite: 'sprites/ships/ship-3.png',
      flavorText: 'Named for the Suez Canal, also not here.'
    },
    {
      tier: 6, name: 'The Whale', shipClass: 'VLCC',
      cost: 120000000, cargoValue: 200000000, gridWidth: 2,
      crewCap: 5, slots: 5, hp: 1, speed: 1.2, hasGunner: true,
      sprite: 'sprites/ships/ship-3.png',
      flavorText: 'One trip doubles your money. One mistake sinks $320M.'
    }
  ];

  G.getShipTier = function (tier) {
    return G.SHIP_TIERS[tier - 1];
  };
})();
