// News headlines by escalation phase — pure data, no logic
(function () {
  var G = window.Game;

  G.NEWS_POOL = {
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
})();
