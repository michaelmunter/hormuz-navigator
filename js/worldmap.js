// World map — delivery port pool for flavor text in stage trail
(function () {
  var G = window.Game;

  // Origin port
  G.ORIGIN_PORT = { name: 'Ras Tanura' };

  // Delivery port pool — random port picked each voyage for stage labels
  G.DELIVERY_PORTS = [
    'Fujairah', 'Muscat', 'Jebel Ali', 'Dubai', 'Abu Dhabi',
    'Doha', 'Salalah', 'Sohar', 'Karachi', 'Mumbai'
  ];

  G.getRandomPort = function () {
    return G.DELIVERY_PORTS[Math.floor(Math.random() * G.DELIVERY_PORTS.length)];
  };

  // Stubs for backward compat (called by old dock code, safe to no-op)
  G.stopWorldMapAnim = function () {};
  G.resizeWorldMap = function () {};
  G.getSelectedDestination = function () { return null; };
  G.initWorldMap = function () {};
})();
