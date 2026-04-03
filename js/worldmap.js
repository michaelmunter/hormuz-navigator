// World map — delivery port pool for flavor text in stage trail
(function () {
  var G = window.Game;

  G.ORIGIN_PORT = { name: 'Fujairah' };

  G.getFallbackContract = function (player) {
    player = player || G.player;
    var origin = G.getHomePortName ? G.getHomePortName(player) : G.ORIGIN_PORT.name;
    var destination = origin === 'Dubai' ? 'Fujairah' : 'Dubai';
    return {
      id: 'fallback-charter',
      name: 'Terminal Charter',
      origin: origin,
      destination: destination,
      cargo: 'Third-party crude',
      brief: 'The terminal supplies a Rustbucket. Thin pay, somebody else\'s cargo, and just enough margin to keep you moving.',
      suppliedShipTier: 1,
      isFallback: true
    };
  };

  G.PORTS = Object.assign({}, G.LOCATIONS || {});

  // Delivery port pool — random port picked each voyage for stage labels
  G.DELIVERY_PORTS = [
    'Muscat', 'Jebel Ali', 'Dubai', 'Abu Dhabi',
    'Doha', 'Salalah', 'Sohar', 'Karachi', 'Mumbai'
  ];

  G.getHomePortName = function (player) {
    player = player || G.player;
    if (player && player.homePort) return player.homePort;
    return G.ORIGIN_PORT.name;
  };

  G.hasOperableOwnedShip = function (player) {
    player = player || G.player;
    if (!player || !Array.isArray(player.ownedShips)) return false;
    for (var i = 0; i < player.ownedShips.length; i++) {
      if (G.isOwnedShipOperable && G.isOwnedShipOperable(player.ownedShips[i])) return true;
    }
    return false;
  };

  G.getPendingContract = function (player) {
    if (!G.hasOperableOwnedShip(player) && G.getFallbackContract) {
      return G.getFallbackContract(player);
    }
    return null;
  };

  G.getContractShipTier = function (contract) {
    if (!contract) return null;
    return typeof contract.suppliedShipTier === 'number' ? contract.suppliedShipTier : null;
  };

  G.getRandomPort = function () {
    return G.DELIVERY_PORTS[Math.floor(Math.random() * G.DELIVERY_PORTS.length)];
  };

  G.getPortByName = function (name) {
    return name && G.PORTS[name] ? G.PORTS[name] : null;
  };

  G.getCurrentContract = function () {
    return (
      (G.voyage && G.voyage.contract) ||
      (G.getPendingContract ? G.getPendingContract(G.player) : null)
    );
  };

  G.getVoyageDeparturePortName = function (direction) {
    var contract = G.getCurrentContract ? G.getCurrentContract() : null;
    if (!contract) return null;
    return direction === 'return' ? contract.destination : contract.origin;
  };

  G.getVoyageArrivalPortName = function (direction) {
    var contract = G.getCurrentContract ? G.getCurrentContract() : null;
    if (!contract) return null;
    return direction === 'return' ? contract.origin : contract.destination;
  };

  G.getMapFocusPortName = function () {
    var stage =
      G.voyage && G.voyage.stages && G.voyage.stageIdx >= 0
        ? G.voyage.stages[G.voyage.stageIdx]
        : null;
    if (stage && stage.id === 'manage_port') return G.getVoyageArrivalPortName('forward');
    if (stage && stage.id === 'mines_ret') return G.getVoyageArrivalPortName('return');
    if (stage && stage.id === 'transit_ret') return G.getVoyageArrivalPortName('return');
    return G.getVoyageDeparturePortName('forward');
  };

  G.getPortBoardCrop = function () {
    var portName = G.getMapFocusPortName ? G.getMapFocusPortName() : null;
    var port = G.getPortByName ? G.getPortByName(portName) : null;
    if (!port) return null;
    return port.boardCrop || port.camera || null;
  };

  // Backward-compatible alias while data moves from "camera" to "boardCrop".
  G.getPortCameraCrop = function () {
    return G.getPortBoardCrop ? G.getPortBoardCrop() : null;
  };

  G.getPortViewportFraming = function () {
    var portName = G.getMapFocusPortName ? G.getMapFocusPortName() : null;
    var port = G.getPortByName ? G.getPortByName(portName) : null;
    return {
      panX: port && port.framing && typeof port.framing.panX === 'number' ? port.framing.panX : 0,
      panY: port && port.framing && typeof port.framing.panY === 'number' ? port.framing.panY : 0
    };
  };

  G.getHighlightedPorts = function () {
    var focusPortName = G.getMapFocusPortName ? G.getMapFocusPortName() : null;
    var focusPort = G.getPortByName ? G.getPortByName(focusPortName) : null;
    return focusPort ? [focusPort] : [];
  };
})();
