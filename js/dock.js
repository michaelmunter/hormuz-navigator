// Dock screen — UI rendering for the between-runs management screen
(function () {
  const G = window.Game;

  // Currently selected ship tier (not yet purchased)
  var _selectedTier = null;

  // --- News headlines by escalation phase ---
  var NEWS_POOL = {
    early: [
      'Oil prices steady at $82/barrel amid calm seas.',
      'Saudi Aramco reports record quarterly output.',
      'Maritime traffic through Hormuz up 12% this quarter.',
      'Gulf Cooperation Council holds routine summit in Riyadh.',
      'New deep-water berth opens at Ras Tanura terminal.',
      'Tanker insurance rates hold steady for third month.',
      'OPEC+ maintains current production quotas.',
      'Indian refineries increase Gulf crude imports by 8%.'
    ],
    mid: [
      'Iran conducts naval exercises near Strait of Hormuz.',
      'US deploys additional carrier group to Persian Gulf.',
      'Insurance premiums for Gulf tankers spike 40%.',
      'IRGC fast boats shadow commercial vessel near Qeshm.',
      'Satellite imagery shows new missile battery on Hormuz Island.',
      'Lloyds of London raises war-risk premium for Gulf transit.',
      'UAE Navy increases patrol frequency in shipping lanes.',
      'Oman calls for diplomatic talks amid rising tensions.'
    ],
    late: [
      'BREAKING: Iranian fast boats harass commercial tanker.',
      'Pentagon confirms missile battery activation on Qeshm Island.',
      'Oil futures surge past $120 on escalation fears.',
      'Multiple nations advise against non-essential Gulf transit.',
      'IRGC threatens to close strait if sanctions persist.',
      'Tanker crew reports drone buzzing at close range.',
      'Gulf maritime authority issues threat level CRITICAL.',
      'Shipping consortium suspends unescorted transit operations.'
    ]
  };

  G.getNewsHeadlines = function (turn) {
    var pool;
    if (turn < 3) pool = NEWS_POOL.early;
    else if (turn < 7) pool = NEWS_POOL.mid;
    else pool = NEWS_POOL.late;
    // Deterministic-ish shuffle based on turn so same turn = same news
    var shuffled = pool.slice().sort(function (a, b) {
      var ha = hashStr(a + turn), hb = hashStr(b + turn);
      return ha - hb;
    });
    return shuffled.slice(0, 4);
  };

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  G.getCaptainLog = function () {
    var p = G.player;
    if (p.turn === 0) {
      return 'First day at the dock. The sea air smells like diesel and opportunity. Time to pick a ship and make some money.';
    }
    var entries = [];
    entries.push('Turn ' + p.turn + ' complete.');
    entries.push('Bank stands at ' + G.formatMoney(p.bank) + '.');
    if (p.turn === 1) {
      entries.push('First run in the books. The strait is no joke.');
    } else if (p.turn < 4) {
      entries.push('Getting the hang of these waters.');
    } else if (p.turn < 8) {
      entries.push('Tensions are rising out there. Every run feels heavier.');
    } else {
      entries.push('How many more runs until we push our luck too far?');
    }
    return entries.join(' ');
  };

  // --- Main dock render ---
  G.renderDock = function () {
    _selectedTier = null;

    // News
    var newsEl = document.getElementById('newsEntries');
    var headlines = G.getNewsHeadlines(G.player.turn);
    newsEl.innerHTML = headlines.map(function (h) {
      return '<div class="news-item">' + h + '</div>';
    }).join('');

    // Captain's log
    document.getElementById('logEntries').textContent = G.getCaptainLog();

    // Bank
    document.getElementById('dockBankBalance').textContent = G.formatMoney(G.player.bank);

    // Ship panel
    G.renderDockShipPanel();

    // Fuel panel
    G.renderDockFuelPanel();

    // Crew + equipment placeholders
    document.getElementById('dockCrew').innerHTML =
      '<div class="placeholder-text">Crew system coming in a future update.</div>';
    document.getElementById('dockEquipment').innerHTML =
      '<div class="placeholder-text">Equipment slots coming in a future update.</div>';

    // Sail button state
    updateSailButton();
  };

  G.renderDockShipPanel = function () {
    var container = document.getElementById('dockShipContent');
    container.innerHTML = '';
    var list = document.createElement('div');
    list.className = 'dock-ship-list';
    var bank = G.player.bank;

    for (var i = 0; i < G.SHIP_TIERS.length; i++) {
      var s = G.SHIP_TIERS[i];
      var canAfford = bank >= s.cost;
      var btn = document.createElement('button');
      btn.className = 'dock-ship-btn' + (canAfford ? '' : ' disabled');
      btn.disabled = !canAfford;
      var weapons = 'Shotgun';
      if (s.hasGunner) weapons += ' + Auto Cannon';
      btn.innerHTML =
        '<b>' + s.name + '</b>' +
        '<span class="ship-meta">' + s.shipClass + ' &mdash; ' + G.formatMoney(s.cost) +
        ' | Cargo: ' + G.formatMoney(s.cargoValue) + ' | ' + weapons + '</span>';
      if (canAfford) {
        (function (tier) {
          btn.onclick = function () { selectShip(tier); };
        })(s.tier);
      }
      list.appendChild(btn);
    }
    container.appendChild(list);
  };

  function selectShip(tier) {
    _selectedTier = tier;
    // Update visual selection
    var btns = document.querySelectorAll('.dock-ship-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.remove('selected');
    }
    // tier is 1-indexed, buttons are 0-indexed
    if (btns[tier - 1]) btns[tier - 1].classList.add('selected');

    // Update fuel panel to show selected ship's cargo
    G.renderDockFuelPanel();
    updateSailButton();
  }

  function updateSailButton() {
    var btn = document.getElementById('dockSailBtn');
    if (_selectedTier) {
      btn.classList.remove('disabled');
      btn.disabled = false;
    } else {
      btn.classList.add('disabled');
      btn.disabled = true;
    }
  }

  G.renderDockFuelPanel = function () {
    var el = document.getElementById('dockFuelContent');
    if (!el) return;
    if (!_selectedTier) {
      el.innerHTML = '<div class="placeholder-text">Select a ship to load cargo.</div>';
      return;
    }
    var ship = G.getShipTier(_selectedTier);
    el.innerHTML =
      '<div class="fuel-row"><span class="fuel-label">Ship</span><span class="fuel-value">' + ship.name + '</span></div>' +
      '<div class="fuel-row"><span class="fuel-label">Cargo value</span><span class="fuel-value">' + G.formatMoney(ship.cargoValue) + '</span></div>' +
      '<div class="fuel-row"><span class="fuel-label">Ship cost</span><span class="fuel-value">' + G.formatMoney(ship.cost) + '</span></div>' +
      '<div class="fuel-row"><span class="fuel-label">After purchase</span><span class="fuel-value">' + G.formatMoney(G.player.bank - ship.cost) + '</span></div>';
  };

  // --- Set sail: confirm selected ship and start round ---
  G.dockSetSail = function () {
    if (!_selectedTier) return;
    var ship = G.getShipTier(_selectedTier);
    if (!ship || G.player.bank < ship.cost) return;
    document.getElementById('dockScreen').classList.remove('active');
    G.startRound(_selectedTier);
  };

  // Expose for HTML onclick
  window.dockSetSail = function () { G.dockSetSail(); };
})();
