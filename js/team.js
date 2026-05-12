/* ================================================================
   team.js — Ekibimiz / Our Team page
   ================================================================ */

SRD.TEAM = (function () {

  function getT() {
    if (SRD.I18N && typeof SRD.I18N.t === 'function') {
      return SRD.I18N.t;
    }

    return function (key) {
      var fallback = {
        ourTeamTitle: 'Our Team',
        ourTeamSub: 'Meet the team responsible for Ground Operations Safety Risk Management processes.',
        teamIntroTitle: 'Ground Operations Safety Team',
        teamIntroText: 'This page presents the team members involved in safety risk monitoring, data analysis, reporting, and operational follow-up processes.',
        responsibility: 'Responsibility',
        contactInfo: 'Contact'
      };

      return fallback[key] || key;
    };
  }

  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  var teamMembers = [
    {
      name: 'Ad Soyad',
      title: 'Müdür / Manager',
      department: 'Yer Operasyonları Emniyet',
      responsibility: 'Ekibin genel koordinasyonu, emniyet yönetimi süreçlerinin takibi ve karar destek süreçlerinin yürütülmesi.',
      email: 'mail@thy.com',
      image: 'assets/team/person1.jpg'
    },
    {
      name: 'Ad Soyad',
      title: 'Şef / Supervisor',
      department: 'Emniyet Takip Şefliği',
      responsibility: 'Olay raporlarının takibi, risk değerlendirme süreçlerinin koordinasyonu ve istasyon bazlı emniyet verilerinin izlenmesi.',
      email: 'mail@thy.com',
      image: 'assets/team/person2.jpg'
    },
    {
      name: 'Ad Soyad',
      title: 'Uzman / Specialist',
      department: 'Risk Analizi',
      responsibility: 'Risk skorlarının incelenmesi, SPI kategorilerinin analizi ve raporlama süreçlerine veri desteği sağlanması.',
      email: 'mail@thy.com',
      image: 'assets/team/person3.jpg'
    },
    {
      name: 'Ad Soyad',
      title: 'Uzman Yardımcısı / Assistant Specialist',
      department: 'Veri ve Raporlama',
      responsibility: 'Dashboard verilerinin hazırlanması, Excel kaynaklarının kontrolü ve görsel raporların güncellenmesi.',
      email: 'mail@thy.com',
      image: 'assets/team/person4.jpg'
    }
  ];

  function render(container) {
    if (!container) return;

    var t = getT();

    container.innerHTML = '';
    container.classList.add('team-page');
    container.classList.add('page');
    container.classList.add('srd-active');

    var hero = document.createElement('div');
    hero.className = 'team-hero';

    hero.innerHTML = [
      '<div class="team-hero-content">',
        '<div class="team-eyebrow">' + escapeHTML(t('groundOperations') || 'Ground Operations') + '</div>',
        '<h1>' + escapeHTML(t('ourTeamTitle')) + '</h1>',
        '<p>' + escapeHTML(t('ourTeamSub')) + '</p>',
      '</div>',
      '<div class="team-hero-icon">',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="34" height="34">',
          '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>',
          '<circle cx="9" cy="7" r="4"/>',
          '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
          '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        '</svg>',
      '</div>'
    ].join('');

    var intro = document.createElement('div');
    intro.className = 'team-intro-card';

    intro.innerHTML = [
      '<h2>' + escapeHTML(t('teamIntroTitle')) + '</h2>',
      '<p>' + escapeHTML(t('teamIntroText')) + '</p>'
    ].join('');

    var grid = document.createElement('div');
    grid.className = 'team-grid';

    teamMembers.forEach(function (person) {
      var card = document.createElement('div');
      card.className = 'team-card';

      card.innerHTML = [
        '<div class="team-photo-wrap">',
          '<img class="team-photo" src="' + escapeHTML(person.image) + '" alt="' + escapeHTML(person.name) + '" onerror="this.style.display=\'none\'; this.parentElement.classList.add(\'no-photo\');">',
          '<div class="team-photo-placeholder">',
            '<span>' + escapeHTML((person.name || '?').charAt(0)) + '</span>',
          '</div>',
        '</div>',

        '<div class="team-info">',
          '<h3>' + escapeHTML(person.name) + '</h3>',
          '<div class="team-title">' + escapeHTML(person.title) + '</div>',
          '<div class="team-department">' + escapeHTML(person.department) + '</div>',

          '<div class="team-section">',
            '<div class="team-section-label">' + escapeHTML(t('responsibility')) + '</div>',
            '<p>' + escapeHTML(person.responsibility) + '</p>',
          '</div>',

          '<div class="team-contact">',
            '<span>' + escapeHTML(t('contactInfo')) + ':</span>',
            '<a href="mailto:' + escapeHTML(person.email) + '">' + escapeHTML(person.email) + '</a>',
          '</div>',
        '</div>'
      ].join('');

      grid.appendChild(card);
    });

    container.appendChild(hero);
    container.appendChild(intro);
    container.appendChild(grid);
  }

  return {
    render: render
  };

})();