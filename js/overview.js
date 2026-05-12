/* ================================================================
   overview.js — Overview page
   Hero + YouTube opening video version
   ================================================================ */

SRD.OVERVIEW = (function () {

  /*
    YouTube video linkini buradan değiştireceksin.

    Normal YouTube linki:
    https://www.youtube.com/watch?v=VIDEO_ID

    Embed linki şöyle olmalı:
    https://www.youtube.com/embed/VIDEO_ID
  */
  var OVERVIEW_VIDEO_URL = 'https://www.youtube.com/embed/VIDEO_ID';

  function getT() {
    if (SRD.I18N && typeof SRD.I18N.t === 'function') {
      return SRD.I18N.t;
    }

    return function (key) {
      var fallback = {
        overviewHeroTitle: 'Ground Operations Safety Risk Management',
        overviewHeroText: 'This dashboard monitors safety risk indicators across all ground operation stations and supports data-driven safety follow-up processes.',
        overviewVideoTitle: 'Ground Operations Safety Vision',
        overviewVideoText: 'Watch the opening video from our safety summit and explore the dashboard modules through the navigation menu.'
      };

      return fallback[key] || key;
    };
  }

  function render(container) {
    if (!container) return;

    var t = getT();

    container.innerHTML = '';
    container.classList.add('overview-page');

    var hero = document.createElement('div');
    hero.className = 'overview-landing';

    hero.innerHTML = [
      '<div class="overview-left">',
        '<div class="overview-logo-row">',
          '<div class="overview-hero-icon overview-thy-logo-box">',
            '<img src="assets/thy-logo.png" alt="Turkish Airlines Logo" class="overview-thy-logo-img">',
          '</div>',
          '<div>',
            '<div class="overview-kicker">GROUND OPERATIONS</div>',
            '<div class="overview-hero-title">' + escapeHTML(t('overviewHeroTitle')) + '</div>',
          '</div>',
        '</div>',

        '<div class="overview-hero-sub">',
          escapeHTML(t('overviewHeroText')),
        '</div>',

        '<div class="overview-actions">',
          '<button class="overview-primary-btn" type="button" onclick="SRD.ROUTER.go(\'dashboard\')">',
            'Dashboard',
          '</button>',
          '<button class="overview-secondary-btn" type="button" onclick="SRD.ROUTER.go(\'stations\')">',
            'All Stations',
          '</button>',
        '</div>',
      '</div>',

      '<div class="overview-video-card">',
        '<div class="overview-video-header">',
          '<div>',
            '<div class="overview-video-title">' + escapeHTML(t('overviewVideoTitle')) + '</div>',
            '<div class="overview-video-sub">' + escapeHTML(t('overviewVideoText')) + '</div>',
          '</div>',
        '</div>',

        '<div class="overview-video-wrap">',
          '<iframe ',
            'src="' + escapeHTML(OVERVIEW_VIDEO_URL) + '" ',
            'title="Ground Operations Safety Video" ',
            'frameborder="0" ',
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ',
            'allowfullscreen>',
          '</iframe>',
        '</div>',
      '</div>'
    ].join('');

    container.appendChild(hero);

    container.classList.add('page');
    container.classList.add('srd-active');
  }

  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    render: render
  };

})();