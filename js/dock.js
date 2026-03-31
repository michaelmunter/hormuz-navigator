// Dock screen — simplified: top bar with role slots, ship dropdown, news ticker
(function () {
  const G = window.Game;

  function getNewsPoolForTurn(turn) {
    var pool = G.NEWS_POOL;
    if (turn < 3) return pool.early;
    if (turn < 7) return pool.mid;
    return pool.late;
  }

  G.getNewsHeadlines = function (turn) {
    var pool = getNewsPoolForTurn(turn);
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

  G.getVoyageHeadlineCount = function (days) {
    var span = Math.max(1, Math.floor(days || 1));
    return Math.max(1, Math.min(5, Math.ceil(span / 2)));
  };

  G.buildPortBulletin = function (options) {
    options = options || {};
    var startDay = Math.max(0, Math.floor(options.startDay || 0));
    var days = Math.max(1, Math.floor(options.days || 1));
    var turn = Math.max(0, Math.floor(options.turn || 0));
    var pool = getNewsPoolForTurn(turn);
    var itemCount = G.getVoyageHeadlineCount(days);
    var reserveMarketSlot = options.marketHeadline ? 1 : 0;
    var poolQuota = Math.max(0, itemCount - reserveMarketSlot);
    var used = {};
    var items = [];

    for (var i = 0; i < poolQuota; i++) {
      var dayOffset = Math.floor(((i + 0.5) * days) / poolQuota);
      if (dayOffset >= days) dayOffset = days - 1;
      var dayNumber = startDay + dayOffset + 1;
      var ranked = pool.slice().sort(function (a, b) {
        var ha = hashStr(a + '|' + turn + '|' + dayNumber);
        var hb = hashStr(b + '|' + turn + '|' + dayNumber);
        return ha - hb;
      });
      var text = ranked[0];
      for (var j = 0; j < ranked.length; j++) {
        if (!used[ranked[j]]) {
          text = ranked[j];
          break;
        }
      }
      used[text] = true;
      items.push({ day: dayNumber, text: text, order: 0 });
    }

    if (options.marketHeadline) {
      items.push({
        day: startDay + days,
        text: options.marketHeadline,
        order: 1
      });
    }

    items.sort(function (a, b) {
      if (a.day !== b.day) return a.day - b.day;
      return a.order - b.order;
    });

    var normalizedItems = items.map(function (item) {
      return {
        day: item.day,
        text: item.text
      };
    });

    return {
      title: options.title || 'Port Bulletin',
      startDay: startDay,
      endDay: startDay + days,
      rangeLabel: G.formatCampaignDateRange(startDay + 1, startDay + days),
      items: normalizedItems
    };
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
    G.updateDockDate();

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

  G.updateDockDate = function () {
    var label = document.getElementById('menuWeek');
    if (!label || !G.player) return;
    label.textContent = G.formatCampaignDate(G.getDisplayCalendarDay());
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
    if (!member) return '';
    if (member.bio) return member.bio;
    var template = G.getCrewTemplate ? G.getCrewTemplate(member.charId) : null;
    if (template && template.bio) return template.bio;
    return G.DEFAULT_CREW_SNIPPET || '';
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
    var displayShip = G.getDisplayedShip ? G.getDisplayedShip() : G.getActivePlayerShip();
    if (displayShip) {
      var ship = displayShip.tierData;
      var hp = typeof displayShip.hp === 'number' ? displayShip.hp : ship.hp;
      var maxHp = typeof displayShip.maxHp === 'number' ? displayShip.maxHp : ship.hp;

      // HP blocks
      var blocks = '';
      for (var i = 0; i < ship.hp; i++) {
        blocks += '<div class="ship-hp-block ' + (i < hp ? 'full' : 'empty') + '"></div>';
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

    var displayShip = G.getDisplayedShip ? G.getDisplayedShip() : G.getActivePlayerShip();

    if (displayShip) {
      var ship = displayShip.tierData;
      var owned = displayShip.owned;
      var hp = typeof displayShip.hp === 'number' ? displayShip.hp : ship.hp;
      var maxHp = typeof displayShip.maxHp === 'number' ? displayShip.maxHp : ship.hp;

      // Ship info header
      var info = document.createElement('div');
      info.className = 'ship-menu-info';
      info.innerHTML =
        '<div class="ship-menu-name">' + ship.name + '</div>' +
        '<div class="ship-menu-stats">Cargo: ' + G.formatMoney(ship.cargoValue) +
        ' | Crew: ' + ship.crewSlots.length + ' | HP: ' + hp + '/' + maxHp + '</div>';
      menu.appendChild(info);

      // Repair
      if (owned && hp < ship.hp) {
        var repairCost = G.getRepairCost(displayShip);
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
  function formatHireTrait(candidate) {
    if (!candidate || candidate.quirkVal === undefined || candidate.quirkVal === null || candidate.quirkVal === '') {
      return '';
    }
    return candidate.quirkVal < 1
      ? Math.round(candidate.quirkVal * 100) + '%'
      : candidate.quirkVal;
  }

  function buildHireCard(candidate, role, options) {
    options = options || {};
    var cost = G.getHireCost(candidate.id);
    var canAfford = G.player.bank >= cost;
    var card = document.createElement('div');
    var classes = ['hire-card'];
    if (!canAfford) classes.push('disabled');
    if (options.isRecurring) classes.push('hire-card-recurring');
    card.className = classes.join(' ');

    var quirkHtml = candidate.quirkLabel;
    if (candidate.quirkStat && formatHireTrait(candidate)) {
      quirkHtml += ' <small>(' + candidate.quirkStat + ' +' + formatHireTrait(candidate) + ')</small>';
    }

    var recurringBadge = options.isRecurring
      ? '<div class="hire-recurring-badge-wrap"><div class="hire-recurring-badge" aria-hidden="true">\u221e</div></div>'
      : '';

    card.innerHTML =
      '<div class="hire-portrait-wrap">' +
        '<div class="hire-portrait" style="background-image:url(' + G.getPortraitSrc(candidate.id) + ')"></div>' +
      '</div>' +
      '<div class="hire-info">' +
        '<span class="hire-name-row"><span class="hire-name">' + candidate.name + '</span></span>' +
        '<span class="hire-quirk">' + quirkHtml + '</span>' +
        '<span class="hire-cost">' + G.formatMoney(cost) + '</span>' +
      '</div>' +
      recurringBadge;

    if (canAfford) {
      card.onclick = function () {
        G.confirmHireForRole(candidate.id, role);
        G.closeHireModal();
        G.renderTacticalCrewBar();
        updateSetSailBtn();
        document.getElementById('menuBankBalance').textContent = G.formatMoney(G.player.bank);
      };
    }

    return card;
  }

  G.showHireModal = function (role) {
    var modal = document.getElementById('hireModal');
    var list = document.getElementById('hireCandidateList');
    list.innerHTML = '';
    modal.setAttribute('data-role', role);

    document.getElementById('hireModalTitle').textContent = 'Hire ' + role;

    var candidates = G.getHireCandidates(3);
    for (var i = 0; i < candidates.length; i++) {
      list.appendChild(buildHireCard(candidates[i], role));
    }

    var intern = G.CHARACTER_POOL.find(function (c) { return c.id === G.INTERN_CHARACTER_ID; });
    if (intern) list.appendChild(buildHireCard(intern, role, { isRecurring: true }));

    modal.classList.add('active');
  };

  G.closeHireModal = function () {
    document.getElementById('hireModal').classList.remove('active');
  };
  window.closeHireModal = function () { G.closeHireModal(); };

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
