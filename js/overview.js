/* ================================================================
   overview.js — Overview page
   Bilingual version
   ================================================================ */

SRD.OVERVIEW = (function () {

  function getT() {
    if (SRD.I18N && typeof SRD.I18N.t === 'function') {
      return SRD.I18N.t;
    }

    return function (key) {
      var fallback = {
        overviewHeroTitle: 'Ground Operations Safety Risk Management',
        overviewHeroText: 'This dashboard monitors safety risk indicators across all ground operation stations. Data is sourced from occurrence reports and analyzed using the Table-6 risk matrix. Use the sidebar to navigate between the Dashboard, All Stations, and upcoming features.',
        riskMatrix: 'Risk Matrix',
        riskMatrixText: 'Risk scores are calculated using Table-6: Likelihood Score × Severity Score. Categories range from E (Very Low) to A (Critical).',
        compositeScore: 'Composite Score',
        compositeScoreText: 'Station composite score = (Σ RiskScore / Flight Count) × 100. This normalizes risk exposure by operational volume.',
        dataSources: 'Data Sources',
        dataSourcesText: 'All_Station_Info.csv contains occurrence reports. Ucus_sayilari.csv provides flight counts per station. SPI_kategorileri.csv maps SPI codes.',
        moreComing: 'More content coming soon',
        moreComingText: 'This section will include executive summaries, regulatory updates, and key safety metrics for management review.'
      };

      return fallback[key] || key;
    };
  }

  function render(container) {
    if (!container) return;

    var t = getT();

    /*
      ÖNEMLİ:
      container.className = 'overview-page' kullanmıyoruz.
      Çünkü bu, router için gerekli olan "page" ve "srd-active"
      class'larını silebilir.
    */
    container.innerHTML = '';
    container.classList.add('overview-page');

    /* Hero */
    var hero = document.createElement('div');
    hero.className = 'overview-hero';

    hero.innerHTML = [
      '<div class="overview-hero-icon overview-thy-logo-box">',
  '<img src="assets/thy-logo.png" alt="Turkish Airlines Logo" class="overview-thy-logo-img">',
       '</div>',

      '<div>',
        '<div class="overview-hero-title">',
          t('overviewHeroTitle'),
        '</div>',

        '<div class="overview-hero-sub">',
          t('overviewHeroText'),
        '</div>',
      '</div>'
    ].join('');

    /* Info cards */
    var cards = document.createElement('div');
    cards.className = 'overview-cards';

    [
      {
        title: t('riskMatrix'),
        text: t('riskMatrixText')
      },
      {
        title: t('compositeScore'),
        text: t('compositeScoreText')
      },
      {
        title: t('dataSources'),
        text: t('dataSourcesText')
      }
    ].forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'overview-info-card';

      card.innerHTML =
        '<h3>' + escapeHTML(item.title) + '</h3>' +
        '<p>' + escapeHTML(item.text) + '</p>';

      cards.appendChild(card);
    });

    /* Coming soon */
    var coming = document.createElement('div');
    coming.className = 'overview-coming';

    coming.innerHTML =
      '<h3>' + escapeHTML(t('moreComing')) + '</h3>' +
      '<p>' + escapeHTML(t('moreComingText')) + '</p>';

    container.appendChild(hero);
    container.appendChild(cards);
    container.appendChild(coming);

    /*
      Render sonrası güvenlik:
      Eğer başka işlem class'ları bozarsa tekrar ekliyoruz.
    */
    container.classList.add('page');
    container.classList.add('srd-active');
  }

  function escapeHTML(value) {
    return String(value)
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