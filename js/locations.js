// Canonical map locations in source-image pixels.
(function () {
  var G = (window.Game = window.Game || {});

  G.LOCATIONS = {
    Dubai: {
      name: "Dubai",
      x: 1944,
      y: 1558,
    },
    Fujairah: {
      name: "Fujairah",
      x: 3080,
      y: 1667,
      labelSide: "left",
      entryRowBias: -4,
      camera: {
        x: 3098,
        y: 1578,
        w: 986,
        h: 721,
      },
    },
  };
})();
