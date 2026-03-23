// Dock screen — simplified: top bar with role slots, ship dropdown, news ticker
(function () {
  const G = window.Game;

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
    var shuffled = pool.slice().sort(function (a, b) {
      var ha = hashStr(a + turn), hb = hashStr(b + turn);
      return ha - hb;
    });
    var headlines = shuffled.slice(0, 3);
    if (G.player && G.player.market && G.player.market.headline) {
      headlines.unshift(G.player.market.headline);
    }
    return headlines;
  };

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  function closeShipOnOutside(e) {
    if (!e.target.closest('.menu-ship-wrap')) {
      closeShipMenu();
    }
  }

  var shipOutsideListenerBound = false;

  // --- Main dock render ---
  G.renderDock = function () {
    // Bank & day
    document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
    document.getElementById('menuWeek').textContent = 'Day ' + G.player.turn;

    // Ensure starting crew exists
    G.ensureStartingCrew();

    // Crew role slots (unified — rendered via game.js renderTacticalCrewBar)
    G.renderTacticalCrewBar();

    // Ship button
    renderShipButton();

    // News ticker
    renderNewsTicker();

    // Close ship menu when clicking outside
    if (!shipOutsideListenerBound) {
      document.addEventListener('click', closeShipOnOutside);
      shipOutsideListenerBound = true;
    }
  };

  // --- Crew hover card ---
  var _activePopover = null;
  var _popoverCloseTimer = null;

  function isPortState() {
    if (G.state === 'MENU') return true;
    return !!(G.voyage && G.voyage.stages && G.voyage.stageIdx >= 0 &&
      G.voyage.stages[G.voyage.stageIdx] &&
      G.voyage.stages[G.voyage.stageIdx].id === 'manage_port');
  }

  function formatTraitValue(member) {
    if (member.quirkVal === undefined || member.quirkVal === null || member.quirkVal === '') return '';
    return member.quirkVal < 1
      ? Math.round(member.quirkVal * 100) + '%'
      : member.quirkVal;
  }

  function hasTraitLine(member) {
    return !!(member &&
      member.quirkStat && member.quirkStat !== 'undefined' &&
      member.quirkVal !== undefined && member.quirkVal !== null && member.quirkVal !== '' &&
      member.quirkVal !== 'undefined');
  }

  function getCrewFlavor(member) {
    return member.quirkLabel || '';
  }

  function getDeadCrewDisposition(member) {
    if (member && member.onDeath) return member.onDeath;
    var options = [
      'Commit to the sea',
      'Cremate remains',
      'Hold a short funeral',
      'Wrap for burial'
    ];
    var seed = member && member.charId !== undefined ? member.charId : 0;
    return options[Math.abs(seed) % options.length];
  }

  function buildCrewPopoverHtml(member, role) {
    var roleMeta = G.getRoleByName ? G.getRoleByName(role) : null;
    var html = '';

    if (roleMeta) {
      html += '<div class="crew-popover-role">' + roleMeta.name + '</div>';
      html += '<div class="crew-popover-role-desc">' + roleMeta.desc + '</div>';
      html += '<div class="crew-popover-role-effect">' + roleMeta.effect + '</div>';
    } else {
      html += '<div class="crew-popover-role">' + role + '</div>';
    }

    html += '<div class="crew-popover-sep"></div>';

    if (member) {
      html += '<div class="crew-popover-name">' + member.name + '</div>';
      if (getCrewFlavor(member)) {
        html += '<div class="crew-popover-crew-desc">' + getCrewFlavor(member) + '</div>';
      }
      if (hasTraitLine(member)) {
        html += '<div class="crew-popover-quirk">' + member.quirkStat + ' +' + formatTraitValue(member) + '</div>';
      }
    } else {
      html += '<div class="crew-popover-empty">No crew assigned. Hire someone to fill this role.</div>';
    }

    return html;
  }

  function positionCrewPopover(popover, anchorEl) {
    var cardRect = anchorEl.getBoundingClientRect();
    var left = cardRect.left + Math.round(cardRect.width / 2) - 115;
    if (left < 6) left = 6;
    if (left + 230 > window.innerWidth) left = window.innerWidth - 236;
    popover.style.left = left + 'px';
    popover.style.top = (cardRect.bottom + 6) + 'px';
  }

  function cancelCrewPopoverClose() {
    if (_popoverCloseTimer) {
      clearTimeout(_popoverCloseTimer);
      _popoverCloseTimer = null;
    }
  }

  G.hideCrewPopoverSoon = function () {
    cancelCrewPopoverClose();
    _popoverCloseTimer = setTimeout(function () {
      closeCrewPopover();
    }, 120);
  };

  G.showCrewPopover = function (member, role, cardEl, options) {
    options = options || {};
    if (options.dismissible == null) options.dismissible = isPortState();
    closeCrewPopover();

    var popover = document.createElement('div');
    popover.className = 'crew-popover';
    var info = document.createElement('div');
    info.innerHTML = buildCrewPopoverHtml(member, role);
    popover.appendChild(info);

    if (options.dismissible && member) {
      var dismissBtn = document.createElement('button');
      dismissBtn.className = 'crew-popover-dismiss';
      dismissBtn.textContent = member.alive === false ? getDeadCrewDisposition(member) : 'Dismiss';
      dismissBtn.onclick = function (e) {
        e.stopPropagation();
        var idx = G.getCrewIndexForRole(role);
        if (idx >= 0) G.dismissCrewMember(idx);
        closeCrewPopover();
        G.renderTacticalCrewBar();
        updateSetSailBtn();
        document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
      };
      popover.appendChild(dismissBtn);
    }

    document.body.appendChild(popover);
    positionCrewPopover(popover, cardEl);

    popover.addEventListener('mouseenter', cancelCrewPopoverClose);
    popover.addEventListener('mouseleave', function () {
      G.hideCrewPopoverSoon();
    });

    _activePopover = { el: popover, cardEl: cardEl };
  };

  function closeCrewPopover() {
    cancelCrewPopoverClose();
    if (_activePopover) {
      _activePopover.el.remove();
      _activePopover = null;
    }
  }

  // --- Ship button & dropdown ---
  function renderShipButton() {
    var btn = document.getElementById('menuShipBtn');
    var playerShip = G.getActivePlayerShip();
    if (playerShip) {
      var ship = playerShip.tierData;
      var owned = playerShip.owned;
      var damaged = owned.hp < ship.hp;

      // HP blocks
      var blocks = '';
      for (var i = 0; i < ship.hp; i++) {
        blocks += '<div class="ship-hp-block ' + (i < owned.hp ? 'full' : 'empty') + '"></div>';
      }

      // Oil fill from voyage state
      var oilPct = (G.voyage && typeof G.voyage.oilPct === 'number') ? Math.round(G.voyage.oilPct) : 0;

      btn.innerHTML =
        '<div class="ship-panel-head">' +
          '<span class="ship-panel-icon ship-icon" aria-hidden="true"></span>' +
          '<div class="ship-panel-class">' + ship.shipClass + '</div>' +
        '</div>' +
        '<div class="ship-cargo-row">' +
          '<span class="ship-cargo-icon" aria-hidden="true"></span>' +
          '<div class="ship-oil-bar"><div class="ship-oil-fill" style="width:' + oilPct + '%"></div></div>' +
        '</div>' +
        '<div class="ship-hp-row">' +
          '<span class="ship-hp-label">HP</span>' +
          '<div class="ship-hp-blocks">' + blocks + '</div>' +
        '</div>';
    } else {
      btn.innerHTML =
        '<div class="ship-panel-head">' +
          '<span class="ship-panel-icon ship-icon" aria-hidden="true"></span>' +
          '<div class="ship-panel-class">No Ship</div>' +
        '</div>';
    }
  }

  // Expose for external updates
  G.renderShipButton = renderShipButton;

  G.toggleShipMenu = function () {
    var menu = document.getElementById('menuShipMenu');
    if (!menu) return;
    if (menu.classList.contains('active')) {
      closeShipMenu();
    } else {
      renderShipMenu();
      menu.classList.add('active');
    }
  };

  function closeShipMenu() {
    var el = document.getElementById('menuShipMenu');
    if (el) el.classList.remove('active');
  }

  function renderShipMenu() {
    var menu = document.getElementById('menuShipMenu');
    menu.innerHTML = '';

    var playerShip = G.getActivePlayerShip();

    if (playerShip) {
      var ship = playerShip.tierData;
      var owned = playerShip.owned;

      // Ship info header
      var info = document.createElement('div');
      info.className = 'ship-menu-info';
      info.innerHTML =
        '<div class="ship-menu-name">' + ship.name + '</div>' +
        '<div class="ship-menu-stats">Cargo: ' + G.formatMoney(ship.cargoValue) +
        ' | Crew: ' + ship.crewSlots.length + ' | HP: ' + owned.hp + '/' + ship.hp + '</div>';
      menu.appendChild(info);

      // Repair
      if (owned.hp < ship.hp) {
        var repairCost = G.getRepairCost(playerShip);
        var canRepair = G.player.bank >= repairCost;
        var repairBtn = document.createElement('button');
        repairBtn.className = 'ship-menu-btn' + (canRepair ? '' : ' disabled');
        repairBtn.textContent = 'Repair (' + G.formatMoney(repairCost) + ')';
        repairBtn.disabled = !canRepair;
        if (canRepair) {
          repairBtn.onclick = function () {
            window.repairShip();
            closeShipMenu();
            G.renderDock();
          };
        }
        menu.appendChild(repairBtn);
      }

      // Separator
      var sep = document.createElement('div');
      sep.className = 'ship-menu-sep';
      sep.textContent = 'Upgrade';
      menu.appendChild(sep);

      // Upgrade options
      var hasUpgrades = false;
      for (var i = 0; i < G.SHIP_TIERS.length; i++) {
        var s = G.SHIP_TIERS[i];
        if (s.tier <= ship.tier) continue;
        hasUpgrades = true;
        (function (tierData) {
          var canAfford = G.player.bank >= tierData.cost;
          var btn = document.createElement('button');
          btn.className = 'ship-menu-btn' + (canAfford ? '' : ' disabled');
          btn.disabled = !canAfford;
          btn.innerHTML = tierData.name + ' <small>' + tierData.shipClass +
            ' — ' + G.formatMoney(tierData.cost) + '</small>';
          if (canAfford) {
            btn.onclick = function () {
              G.purchaseShip(tierData.tier);
              closeShipMenu();
              G.renderDock();
            };
          }
          menu.appendChild(btn);
        })(s);
      }

      if (!hasUpgrades) {
        var maxMsg = document.createElement('div');
        maxMsg.className = 'ship-menu-note';
        maxMsg.textContent = 'Maximum tier reached.';
        menu.appendChild(maxMsg);
      }

      // Drydock: switch between owned ships
      if (G.player.ownedShips.length > 1) {
        var dockSep = document.createElement('div');
        dockSep.className = 'ship-menu-sep';
        dockSep.textContent = 'Fleet';
        menu.appendChild(dockSep);

        for (var j = 0; j < G.player.ownedShips.length; j++) {
          (function (idx) {
            var ownedShip = G.player.ownedShips[idx];
            var td = G.getShipTier(ownedShip.tier);
            var isActive = idx === G.player.activeShipIdx;
            var btn = document.createElement('button');
            btn.className = 'ship-menu-btn' + (isActive ? ' active' : '');
            btn.textContent = td.name + (isActive ? ' (active)' : '');
            if (!isActive) {
              btn.onclick = function () {
                G.player.activeShipIdx = idx;
                G.savePlayer();
                closeShipMenu();
                G.renderDock();
              };
            }
            menu.appendChild(btn);
          })(j);
        }
      }
    } else {
      // No ship — purchase list
      var noShipMsg = document.createElement('div');
      noShipMsg.className = 'ship-menu-info';
      noShipMsg.innerHTML = '<div class="ship-menu-name" style="color:var(--dock-red)">No Ship</div>' +
        '<div class="ship-menu-stats">Purchase a ship to continue.</div>';
      menu.appendChild(noShipMsg);

      for (var k = 0; k < G.SHIP_TIERS.length; k++) {
        (function (tierData) {
          var canAfford = G.player.bank >= tierData.cost;
          var btn = document.createElement('button');
          btn.className = 'ship-menu-btn' + (canAfford ? '' : ' disabled');
          btn.disabled = !canAfford;
          btn.innerHTML = tierData.name + ' <small>' + tierData.shipClass +
            ' — ' + G.formatMoney(tierData.cost) + '</small>';
          if (canAfford) {
            btn.onclick = function () {
              G.purchaseShip(tierData.tier);
              closeShipMenu();
              G.renderDock();
            };
          }
          menu.appendChild(btn);
        })(G.SHIP_TIERS[k]);
      }
    }
  }

  // --- News ticker ---
  function renderNewsTicker() {
    var ticker = document.getElementById('newsTicker');
    var headlines = G.getNewsHeadlines(G.player.turn);
    ticker.textContent = headlines.join('  \u00b7  ');
  }

  // --- Set sail button ---
  function updateSetSailBtn() {
    // Sail button is now in the map stage card — refresh it
    if (G.updateMapStageCard) G.updateMapStageCard();
  }

  // --- Hire modal ---
  G.showHireModal = function (role) {
    var modal = document.getElementById('hireModal');
    var list = document.getElementById('hireCandidateList');
    list.innerHTML = '';
    modal.setAttribute('data-role', role);

    document.getElementById('hireModalTitle').textContent = 'Hire ' + role;

    var candidates = G.getHireCandidates(3);
    if (candidates.length === 0) {
      list.innerHTML = '<div class="placeholder-text">No crew available for hire.</div>';
      modal.classList.add('active');
      return;
    }

    for (var i = 0; i < candidates.length; i++) {
      (function (c) {
        var cost = G.getHireCost(c.id);
        var canAfford = G.player.bank >= cost;

        var card = document.createElement('div');
        card.className = 'hire-card' + (canAfford ? '' : ' disabled');

        card.innerHTML =
          '<div class="hire-portrait" style="background-image:url(' + G.getPortraitSrc(c.id) + ')"></div>' +
          '<div class="hire-info">' +
            '<span class="hire-name">' + c.name + '</span>' +
            '<span class="hire-quirk">' + c.quirkLabel +
            ' <small>(' + c.quirkStat + ' +' +
            (c.quirkVal < 1 ? Math.round(c.quirkVal * 100) + '%' : c.quirkVal) +
            ')</small></span>' +
            '<span class="hire-cost">' + G.formatMoney(cost) + '</span>' +
          '</div>';

        if (canAfford) {
          card.onclick = function () {
            G.confirmHireForRole(c.id, role);
            G.closeHireModal();
            G.renderTacticalCrewBar();
            updateSetSailBtn();
            document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
          };
        }

        list.appendChild(card);
      })(candidates[i]);
    }

    modal.classList.add('active');
  };

  G.closeHireModal = function () {
    document.getElementById('hireModal').classList.remove('active');
  };
  window.closeHireModal = function () { G.closeHireModal(); };
  window.hireIntern = function () {
    var modal = document.getElementById('hireModal');
    var role = modal ? modal.getAttribute('data-role') : '';
    if (!role) return;
    if (!G.confirmHireForRole(10, role)) return;
    G.closeHireModal();
    G.renderTacticalCrewBar();
    updateSetSailBtn();
    document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
  };

  // --- Set sail ---
  G.dockSetSail = function () {
    var playerShip = G.getActivePlayerShip();
    if (!playerShip || playerShip.hp <= 0) return;
    if (!G.hasCrewRole('Captain')) return;
    closeCrewPopover();
    closeShipMenu();
    G.startVoyage();
  };

  window.dockSetSail = function () { G.dockSetSail(); };
  window.toggleShipMenu = function () { G.toggleShipMenu(); };
})();
