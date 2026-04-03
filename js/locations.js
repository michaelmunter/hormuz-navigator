// Canonical map locations in source-image pixels.
(function () {
  var G = (window.Game = window.Game || {});

  G.LOCATIONS = {
    Fujairah: {
      name: "Fujairah",
      country: "Oman",
      x: 3080,
      y: 1667,
      labelSide: "left",
      entryRowBias: -4,
      boardCrop: {
        x: 3098,
        y: 1578,
        w: 986,
        h: 721,
      },
      framing: {
        panX: 0,
        panY: 0,
      },
    },
    Dubai: {
      name: "Dubai",
      country: "United Arab Emirates",
      x: 2881,
      y: 1607,
    },
  };
})();
