// Sound effects using ZzFX — retro synth sounds
(function () {
  const G = window.Game;

  // Sound enabled flag
  G.soundEnabled = true;

  // Play a sound if enabled (wraps zzfx to handle AudioContext unlock)
  function playSound(params) {
    if (!G.soundEnabled) return;
    try { zzfx(...params); } catch (e) { /* ignore audio errors */ }
  }

  G.sounds = {
    // Minesweeper sounds
    reveal: function () {
      // Short soft click
      playSound([.3,,800,.01,,.01,,.5,,,,,,,,,,,,.01]);
    },
    flag: function () {
      // Snappy place sound
      playSound([.4,,600,.01,.01,.05,2,.5,,,,,,,,,.05,,.01]);
    },
    unflag: function () {
      // Softer reverse
      playSound([.3,,400,.01,.01,.05,2,.3,,,,,,,,,.05,,.01]);
    },
    mineExplode: function () {
      // Big boom — game over in minesweeper
      playSound([1.5,,69,.01,.08,.31,3,.3,6,,,,,1.4,,.4,.05,.43,.11,,637]);
    },
    minesweeperWin: function () {
      // Victory jingle — ascending tones
      playSound([.5,,700,.01,.1,.3,,2,,,,,.1,,,,,,.05]);
      setTimeout(function () { playSound([.5,,900,.01,.1,.3,,2,,,,,.1,,,,,,.05]); }, 150);
      setTimeout(function () { playSound([.5,,1200,.01,.15,.4,,2,,,,,.1,,,,,,.05]); }, 300);
    },

    // Transit sounds
    missileIncoming: function () {
      // Descending whistle
      playSound([.3,,600,.01,.05,.2,,1,-50,,,,,,,,,,,.01]);
    },
    missileImpact: function () {
      // Subtle water splash — low volume, noise-based, quick decay
      playSound([.15,,200,.01,.02,.12,4,.8,-5,,,,,,,,,,.03]);
    },
    shahedBuzz: function () {
      // Drone buzz — short
      playSound([.15,,150,.01,.03,.08,3,.5,,,,,,,5,,,.3,.02]);
    },
    shahedDestroyed: function () {
      playSound([1.7,,33,.07,.22,.21,2,.2,,,,,,1,,.2,.04,.46,.14]);
    },
    shipDestroyed: function () {
      // Same explosion as mine hit
      playSound([1.5,,69,.01,.08,.31,3,.3,6,,,,,1.4,,.4,.05,.43,.11,,637]);
    },
    transitComplete: function () {
      // Triumphant ascending
      playSound([.4,,500,.01,.1,.2,,2,,,,,.1,,,,,,.05]);
      setTimeout(function () { playSound([.4,,700,.01,.1,.2,,2,,,,,.1,,,,,,.05]); }, 120);
      setTimeout(function () { playSound([.5,,1000,.01,.2,.4,,2,,,,,.1,,,,,,.05]); }, 240);
    },
    speedChange: function () {
      // Quick blip
      playSound([.2,,500,.01,,.02,,.5,,,,,,,,,,,,.01]);
    }
  };
})();
