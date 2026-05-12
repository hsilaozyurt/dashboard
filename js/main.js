/* ================================================================
   main.js — App init, routing, Excel loading, drawer, theme, language
   Final revised version:
   - Prevents pages from stacking
   - Restores missing "page" class if another file removes it
   - Drawer starts open and can be toggled
   - Drawer state is saved in localStorage
   - Theme button works
   - Language button updates header/sidebar + page texts
   - Exposes SRD.I18N.t() for page files
   - Includes Overview + Dashboard + Stations + Team translations
   - Header "Ekibimiz / Our Team" opens internal Team page
   - Header "Müdürlük" and "Şeflik" open SharePoint links
   - Loads data from Excel files using SRD.DATA.loadExcel()
   ================================================================ */

(function () {

  var _data        = null;
  var _currentPage = 'overview';
  var _currentLoc  = null;

  var _lang  = localStorage.getItem('srd_lang') || 'en';
  var _theme = localStorage.getItem('srd_theme') || 'dark';

  /* ── SHAREPOINT LINKS ───────────────────────────────────────── */

  /*
    BURAYI KENDİ SHAREPOINT SAYFA LİNKLERİNLE DEĞİŞTİR.

    Ekibimiz artık iç sayfaya yönlendiriliyor.
    Bu yüzden burada ekibimiz linki kullanılmıyor.
  */
  var SHAREPOINT_LINKS = {
    mudurluk: 'https://BURAYA-MUDURLUK-SAYFASI-LINKI',
    seflik: 'https://BURAYA-SEFLIK-SAYFASI-LINKI'
  };

  /* ── LANGUAGE DICTIONARY ────────────────────────────────────── */

  var LANG = {
    en: {
      /* Navigation / Header */
      overview: 'Overview',
      dashboard: 'Dashboard',
      stations: 'All Stations',
      stationDetail: 'Station Detail',
      team: 'Our Team',
      tahminleme: 'Prediction',
      soon: 'Soon',

      groundSafety: 'Ground Operations Safety',
      safetyRisk: 'Safety Risk',
      groundOperations: 'Ground Operations',
      navigation: 'Navigation',
      contact: 'Contact',
      lastUpdated: 'Last updated',

      /* Header buttons */
      mudurluk: 'Department',
      ekibimiz: 'Our Team',
      seflik: 'Unit',

      stationsBadge: 'Stations',
      loadingData: 'Loading data...',
      csvLoadError: 'Data load error:',
      runLocalServer: 'Run a local server: Live Server or',

      /* Overview page */
      overviewHeroTitle: 'Ground Operations Safety Risk Management',
      overviewHeroText: 'This dashboard monitors safety risk indicators across all ground operation stations. Data is sourced from occurrence reports and analyzed using the Table-6 risk matrix. Use the sidebar to navigate between the Dashboard, All Stations, and upcoming features.',
      riskMatrix: 'Risk Matrix',
      riskMatrixText: 'Risk scores are calculated using Table-6: Likelihood Score × Severity Score. Categories range from E (Very Low) to A (Critical).',
      compositeScore: 'Composite Score',
      compositeScoreText: 'Station composite score = (Σ RiskScore / Flight Count) × 100. This normalizes risk exposure by operational volume.',
      dataSources: 'Data Sources',
      dataSourcesText: 'All_Station_Info.xlsx contains occurrence reports. Ucus_sayilari.xlsx provides flight counts per station. SPI_kategorileri.xlsx maps SPI codes.',
      moreComing: 'More content coming soon',
      moreComingText: 'This section will include executive summaries, regulatory updates, and key safety metrics for management review.',

      /* Dashboard filters */
      filter: 'Filter',
      clearFilters: 'Clear Filters',
      allYears: 'All Years',
      allMonths: 'All Months',
      allStations: 'All Stations',
      allDepartments: 'All Departments',
      allFleets: 'All Fleets',
      allReportTypes: 'All Report Types',
      allRegions: 'All Regions',
      allLevels: 'All Levels',
      allStatuses: 'All Statuses',
      allSPI: 'All SPI',

      /* Dashboard KPI */
      totalRecordedEvents: 'Total Recorded Events',
      totalFlights: 'Total Flights',
      averageRiskScore: 'Average Risk Score',
      monitoredStations: 'Monitored Stations',
      allStationsLabel: 'All stations',
      stationTotal: 'Station total',
      likelihoodSeverity: 'Likelihood × Severity',
      active: 'Active',

      /* Dashboard charts */
      monthlyEventTrend: 'Monthly Event Trend',
      basedOnYearMonth: 'Based on MC_Year_Month',
      riskDistribution: 'Risk Distribution',
      levelSpiFleet: 'Level · SPI · Fleet',
      riskLevel: 'Risk Level',
      spiClass: 'SPI Class',
      fleet: 'Fleet',

      /* Dashboard bottom cards */
      spiCategorySummary: 'SPI Category Summary',
      spiSummarySub: 'Event count & average risk score by SPI',
      top10RiskStations: 'Top 10 Highest Risk Stations',
      compositeFormula: 'Composite = (Σ RiskScore / Flights) × 100',

      /* Dashboard / table common */
      title: 'Title',
      classText: 'Class',
      events: 'Events',
      avgRisk: 'Avg Risk',
      dist: 'Dist.',
      noSpiData: 'No SPI data available',
      nonSpiEvent: 'Non-SPI Event',
      composite: 'Composite',
      level: 'Level',

      /* Stations page */
      stationsPageSub: 'Review station-level risk scores, flight exposure, event count and severity distribution.',
      stationCount: 'stations',
      searchIata: 'Search IATA...',
      noStationsFound: 'No stations found',
      noStationsFoundSub: 'Try clearing filters or check whether Excel data is loaded correctly.',
      all: 'All',
      flights: 'Flights',
      highSeverity: 'A+B High Sev',
      distribution: 'Distribution',

      /* Station detail */
      backToStations: 'Back to All Stations',

      /* Team page */
      ourTeamTitle: 'Our Team',
      ourTeamSub: 'Meet the team responsible for Ground Operations Safety Risk Management processes.',
      teamIntroTitle: 'Ground Operations Safety Team',
      teamIntroText: 'This page presents the team members involved in safety risk monitoring, data analysis, reporting, and operational follow-up processes.',
      responsibility: 'Responsibility',
      contactInfo: 'Contact'
    },

    tr: {
      /* Navigation / Header */
      overview: 'Genel Bakış',
      dashboard: 'Panel',
      stations: 'Tüm İstasyonlar',
      stationDetail: 'İstasyon Detayı',
      team: 'Ekibimiz',
      tahminleme: 'Tahminleme',
      soon: 'Yakında',

      groundSafety: 'Yer Operasyonları Emniyeti',
      safetyRisk: 'Emniyet Riski',
      groundOperations: 'Yer Operasyonları',
      navigation: 'Navigasyon',
      contact: 'İletişim',
      lastUpdated: 'Son güncelleme',

      /* Header buttons */
      mudurluk: 'Müdürlük',
      ekibimiz: 'Ekibimiz',
      seflik: 'Şeflik',

      stationsBadge: 'İstasyon',
      loadingData: 'Veriler yükleniyor...',
      csvLoadError: 'Veri yükleme hatası:',
      runLocalServer: 'Yerel sunucu çalıştır: Live Server veya',

      /* Overview page */
      overviewHeroTitle: 'Yer Operasyonları Emniyet Risk Yönetimi',
      overviewHeroText: 'Bu panel, tüm yer operasyon istasyonlarındaki emniyet risk göstergelerini izler. Veriler olay raporlarından alınır ve Tablo-6 risk matrisi kullanılarak analiz edilir. Panel, Tüm İstasyonlar ve gelecek özellikler arasında geçiş yapmak için yan menüyü kullanabilirsiniz.',
      riskMatrix: 'Risk Matrisi',
      riskMatrixText: 'Risk skorları Tablo-6 kullanılarak hesaplanır: Olasılık Skoru × Şiddet Skoru. Kategoriler E (Çok Düşük) ile A (Kritik) arasında değişir.',
      compositeScore: 'Bileşik Skor',
      compositeScoreText: 'İstasyon bileşik skoru = (Σ Risk Skoru / Uçuş Sayısı) × 100. Bu hesaplama, operasyonel hacme göre risk maruziyetini normalize eder.',
      dataSources: 'Veri Kaynakları',
      dataSourcesText: 'All_Station_Info.xlsx olay raporlarını içerir. Ucus_sayilari.xlsx istasyon başına uçuş sayılarını sağlar. SPI_kategorileri.xlsx SPI kodlarını eşleştirir.',
      moreComing: 'Daha fazla içerik yakında',
      moreComingText: 'Bu bölümde yönetim incelemesi için özetler, mevzuat güncellemeleri ve temel emniyet metrikleri yer alacaktır.',

      /* Dashboard filters */
      filter: 'Filtre',
      clearFilters: 'Filtreleri Temizle',
      allYears: 'Tüm Yıllar',
      allMonths: 'Tüm Aylar',
      allStations: 'Tüm İstasyonlar',
      allDepartments: 'Tüm Departmanlar',
      allFleets: 'Tüm Filolar',
      allReportTypes: 'Tüm Rapor Türleri',
      allRegions: 'Tüm Bölgeler',
      allLevels: 'Tüm Seviyeler',
      allStatuses: 'Tüm Durumlar',
      allSPI: 'Tüm SPI',

      /* Dashboard KPI */
      totalRecordedEvents: 'Toplam Kaydedilen Olay',
      totalFlights: 'Toplam Uçuş',
      averageRiskScore: 'Ortalama Risk Skoru',
      monitoredStations: 'İzlenen İstasyonlar',
      allStationsLabel: 'Tüm istasyonlar',
      stationTotal: 'İstasyon toplamı',
      likelihoodSeverity: 'Olasılık × Şiddet',
      active: 'Aktif',

      /* Dashboard charts */
      monthlyEventTrend: 'Aylık Olay Trendi',
      basedOnYearMonth: 'MC_Year_Month alanına göre',
      riskDistribution: 'Risk Dağılımı',
      levelSpiFleet: 'Seviye · SPI · Filo',
      riskLevel: 'Risk Seviyesi',
      spiClass: 'SPI Sınıfı',
      fleet: 'Filo',

      /* Dashboard bottom cards */
      spiCategorySummary: 'SPI Kategori Özeti',
      spiSummarySub: 'SPI bazında olay sayısı ve ortalama risk skoru',
      top10RiskStations: 'En Yüksek Riskli İlk 10 İstasyon',
      compositeFormula: 'Bileşik = (Σ Risk Skoru / Uçuşlar) × 100',

      /* Dashboard / table common */
      title: 'Başlık',
      classText: 'Sınıf',
      events: 'Olaylar',
      avgRisk: 'Ort. Risk',
      dist: 'Dağ.',
      noSpiData: 'SPI verisi bulunamadı',
      nonSpiEvent: 'SPI dışı olay',
      composite: 'Bileşik',
      level: 'Seviye',

      /* Stations page */
      stationsPageSub: 'İstasyon bazlı risk skorlarını, uçuş maruziyetini, olay sayısını ve şiddet dağılımını inceleyin.',
      stationCount: 'istasyon',
      searchIata: 'IATA ara...',
      noStationsFound: 'İstasyon bulunamadı',
      noStationsFoundSub: 'Filtreleri temizlemeyi deneyin veya Excel verilerinin doğru yüklendiğini kontrol edin.',
      all: 'Tümü',
      flights: 'Uçuşlar',
      highSeverity: 'A+B Yüksek Şiddet',
      distribution: 'Dağılım',

      /* Station detail */
      backToStations: 'Tüm İstasyonlara Geri Dön',

      /* Team page */
      ourTeamTitle: 'Ekibimiz',
      ourTeamSub: 'Yer Operasyonları Emniyet Risk Yönetimi süreçlerinden sorumlu ekibi tanıyın.',
      teamIntroTitle: 'Yer Operasyonları Emniyet Ekibi',
      teamIntroText: 'Bu sayfada emniyet risk takibi, veri analizi, raporlama ve operasyonel takip süreçlerinde görev alan ekip üyeleri yer almaktadır.',
      responsibility: 'Sorumluluk',
      contactInfo: 'İletişim'
    }
  };

  function t(key) {
    if (LANG[_lang] && LANG[_lang][key]) {
      return LANG[_lang][key];
    }

    if (LANG.en && LANG.en[key]) {
      return LANG.en[key];
    }

    return key;
  }

  /*
    GLOBAL I18N ACCESS:
    Page files such as overview.js, dashboard.js, stations.js, team.js can use:
    SRD.I18N.t('overviewHeroTitle')
  */
  SRD.I18N = {
    t: t,

    getLang: function () {
      return _lang;
    },

    setLang: function (lang) {
      if (lang !== 'en' && lang !== 'tr') return;

      _lang = lang;
      localStorage.setItem('srd_lang', _lang);

      applyLanguage();

      if (SRD.ROUTER) {
        SRD.ROUTER.go(_currentPage, _currentLoc);
      }
    }
  };

  /* ── PAGE HELPERS ────────────────────────────────────────────── */

  function getPageId(page) {
    return page === 'station-detail' ? 'page-station-detail' : 'page-' + page;
  }

  function getPageElement(page) {
    return document.getElementById(getPageId(page));
  }

  function restorePageClasses() {
    var pageIds = [
      'page-overview',
      'page-dashboard',
      'page-stations',
      'page-station-detail',
      'page-team',
      'page-tahminleme'
    ];

    pageIds.forEach(function (id) {
      var el = document.getElementById(id);

      if (el && !el.classList.contains('page')) {
        el.classList.add('page');
      }
    });
  }

  function hideAll() {
    restorePageClasses();

    document.querySelectorAll('.page').forEach(function (p) {
      p.classList.remove('srd-active');
    });
  }

  function showPage(page) {
    var el = getPageElement(page);

    if (el) {
      el.classList.add('page');
      el.classList.add('srd-active');
    }

    return el;
  }

  function clearPageContent(target) {
    if (!target) return;
    target.innerHTML = '';
  }

  function renderLoading(target) {
    if (!target) return;

    target.innerHTML =
      '<div style="padding:60px;text-align:center;color:#4e6a84;font-size:14px">' +
        '<div style="font-size:32px;margin-bottom:12px">⏳</div>' +
        t('loadingData') +
      '</div>';
  }

  function renderError(message) {
    hideAll();

    var c = document.getElementById('content');

    if (c) {
      c.style.display = 'block';
      c.innerHTML =
        '<div style="padding:60px;text-align:center;color:#e05555;font-family:Consolas,monospace">' +
          '<div style="font-size:32px;margin-bottom:16px">⚠</div>' +
          '<strong>' + t('csvLoadError') + '</strong><br><br>' +
          escapeHTML(message) +
          '<br><br>' +
          '<span style="color:#4e6a84;font-size:12px">' +
            t('runLocalServer') + '<br>' +
            '<code>python -m http.server 5500</code>' +
          '</span>' +
        '</div>';
    }
  }

  /* ── TOPBAR / SIDEBAR HELPERS ───────────────────────────────── */

  function updateSidebar(page) {
    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.remove('active');
    });

    var navKey = page === 'station-detail' ? 'stations' : page;
    var nav = document.querySelector('[data-page="' + navKey + '"]');

    if (nav) {
      nav.classList.add('active');
    }
  }

  function updateTopbar(page, param) {
    var titles = {
      overview: t('overview'),
      dashboard: t('dashboard'),
      stations: t('stations'),
      'station-detail': t('stationDetail'),
      team: t('team'),
      tahminleme: t('tahminleme')
    };

    var titleEl = document.getElementById('topbar-title');

    if (titleEl) {
      titleEl.textContent = titles[page] || page;
    }

    var badge = document.getElementById('topbar-badge');

    if (badge) {
      if (page === 'dashboard' && _data && _data.stations) {
        badge.textContent = _data.stations.length + ' ' + t('stationsBadge');
        badge.style.display = 'inline-block';
      } else if (page === 'station-detail' && param) {
        badge.textContent = param;
        badge.style.display = 'inline-block';
      } else if (page === 'team') {
        badge.textContent = t('groundOperations');
        badge.style.display = 'inline-block';
      } else {
        badge.textContent = '';
        badge.style.display = 'none';
      }
    }
  }

  function setLastUpdate() {
    var el = document.getElementById('topbar-update');

    if (el) {
      el.textContent = t('lastUpdated') + ': ' + new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  /* ── LANGUAGE APPLY ─────────────────────────────────────────── */

  function applyLanguage() {
    var langBtn = document.getElementById('langBtn');

    if (langBtn) {
      langBtn.textContent = _lang === 'en' ? 'EN' : 'TR';
      langBtn.title = _lang === 'en' ? 'Türkçeye geç' : 'İngilizceye geç';
    }

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');

      if (key) {
        el.textContent = t(key);
      }
    });

    var logoTitle = document.querySelector('.sidebar-logo-title');
    if (logoTitle) logoTitle.textContent = t('safetyRisk');

    var logoSub = document.querySelector('.sidebar-logo-sub');
    if (logoSub) logoSub.textContent = t('groundOperations');

    var sidebarSection = document.querySelector('.sidebar-section');
    if (sidebarSection) sidebarSection.textContent = t('navigation');

    var contactLabel = document.querySelector('.sidebar-contact-label');
    if (contactLabel) contactLabel.textContent = t('contact');

    var breadcrumbRoot = document.querySelector('.topbar-breadcrumb-root');
    if (breadcrumbRoot) breadcrumbRoot.textContent = t('groundSafety');

    var mudurlukBtn = document.querySelector('[data-sp-link="mudurluk"]');
    if (mudurlukBtn) mudurlukBtn.textContent = t('mudurluk');

    var ekibimizBtn = document.querySelector('[data-sp-link="ekibimiz"]');
    if (ekibimizBtn) ekibimizBtn.textContent = t('ekibimiz');

    var seflikBtn = document.querySelector('[data-sp-link="seflik"]');
    if (seflikBtn) seflikBtn.textContent = t('seflik');

    updateTopbar(_currentPage, _currentLoc);
    setLastUpdate();
  }

  /* ── THEME APPLY ────────────────────────────────────────────── */

  function applyTheme() {
    document.body.classList.remove('theme-dark');
    document.body.classList.remove('theme-light');

    document.body.classList.add('theme-' + _theme);

    var themeBtn = document.getElementById('themeBtn');

    if (themeBtn) {
      if (_theme === 'dark') {
        themeBtn.textContent = '🌙';
        themeBtn.title = 'Açık temaya geç';
      } else {
        themeBtn.textContent = '☀️';
        themeBtn.title = 'Koyu temaya geç';
      }
    }
  }

  /* ── DRAWER APPLY ───────────────────────────────────────────── */

  function applySidebarState() {
    var sidebar = document.getElementById('sidebar');

    if (!sidebar) return;

    var savedState = localStorage.getItem('srd_sidebar_open');

    /*
      İlk açılışta drawer açık gelir.
      Kullanıcı kapatırsa bu tercih localStorage'da korunur.
    */
    if (savedState === null) {
      sidebar.classList.add('open');
      localStorage.setItem('srd_sidebar_open', 'true');
    } else if (savedState === 'true') {
      sidebar.classList.add('open');
    } else {
      sidebar.classList.remove('open');
    }
  }

  /* ── PAGE RENDERER ──────────────────────────────────────────── */

  function renderPage(page, target, param) {
    if (!target) return;

    clearPageContent(target);

    if (page === 'overview') {
      SRD.OVERVIEW.render(target);
    } else if (page === 'dashboard') {
      SRD.DASHBOARD.render(target, _data);
    } else if (page === 'stations') {
      SRD.STATIONS.render(target, _data);
    } else if (page === 'station-detail') {
      SRD.STATION_DETAIL.render(target, _data, param);
    } else if (page === 'team') {
      if (SRD.TEAM && typeof SRD.TEAM.render === 'function') {
        SRD.TEAM.render(target);
      } else {
        target.innerHTML =
          '<div style="padding:60px;text-align:center;color:#e05555">' +
            'Team page file is not loaded. Please add <code>js/team.js</code> before <code>js/main.js</code>.' +
          '</div>';
      }
    } else if (page === 'tahminleme') {
      SRD.TAHMINLEME.render(target);
    }

    target.classList.add('page');
    target.classList.add('srd-active');
  }

  /* ── ROUTER ─────────────────────────────────────────────────── */

  SRD.ROUTER = {
    go: function (page, param) {
      _currentPage = page;
      _currentLoc  = param || null;

      restorePageClasses();
      updateSidebar(page);
      updateTopbar(page, param);

      hideAll();

      var target = showPage(page);

      if (!target) {
        console.warn('SRD Router: page target not found:', page);
        return;
      }

      var needsData =
        page !== 'overview' &&
        page !== 'team' &&
        page !== 'tahminleme';

      if (!_data && needsData) {
        clearPageContent(target);
        renderLoading(target);
        return;
      }

      renderPage(page, target, param);

      updateTopbar(page, param);
      setLastUpdate();
    }
  };

  /* ── BUTTON EVENTS ──────────────────────────────────────────── */

  function bindButtons() {
    /* Sidebar nav */
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();

        if (this.classList.contains('disabled')) return;

        var page = this.getAttribute('data-page');

        if (page) {
          SRD.ROUTER.go(page);
        }
      });
    });

    /* Drawer toggle */
    var toggleBtn = document.getElementById('sidebarToggle');
    var sidebar   = document.getElementById('sidebar');

    if (toggleBtn && sidebar) {
      toggleBtn.onclick = function () {
        sidebar.classList.toggle('open');

        var isOpen = sidebar.classList.contains('open');
        localStorage.setItem('srd_sidebar_open', isOpen ? 'true' : 'false');
      };
    }

    /* Refresh */
    var refreshBtn = document.getElementById('refreshBtn');

    if (refreshBtn) {
      refreshBtn.onclick = function () {
        SRD.ROUTER.go(_currentPage, _currentLoc);
      };
    }

    /* Language */
    var langBtn = document.getElementById('langBtn');

    if (langBtn) {
      langBtn.onclick = function () {
        _lang = _lang === 'en' ? 'tr' : 'en';
        localStorage.setItem('srd_lang', _lang);

        applyLanguage();

        if (SRD.ROUTER) {
          SRD.ROUTER.go(_currentPage, _currentLoc);
        }
      };
    }

    /* Theme */
    var themeBtn = document.getElementById('themeBtn');

    if (themeBtn) {
      themeBtn.onclick = function () {
        _theme = _theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('srd_theme', _theme);
        applyTheme();
      };
    }

    /* Header buttons */
    document.querySelectorAll('[data-sp-link]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = this.getAttribute('data-sp-link');

        /*
          Ekibimiz butonu artık proje içindeki Team sayfasına gider.
        */
        if (key === 'ekibimiz') {
          SRD.ROUTER.go('team');
          return;
        }

        var url = SHAREPOINT_LINKS[key];

        if (!url || url.indexOf('BURAYA-') >= 0) {
          alert('Bu buton için SharePoint linki henüz tanımlanmadı: ' + key);
          return;
        }

        /*
          Yeni sekmede açmak için window.open kullanıyoruz.
          Aynı sekmede açılsın istersen:
          window.location.href = url;
        */
        window.open(url, '_blank');
      });
    });
  }

  /* ── UTIL ───────────────────────────────────────────────────── */

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ── INIT ───────────────────────────────────────────────────── */

  var config = window.SRD_CONFIG || {
    incidentsExcel: 'data/All_Station_Info.xlsx',
    stationsExcel:  'data/Ucus_sayilari.xlsx',
    spiExcel:       'data/SPI_kategorileri.xlsx'
  };

  restorePageClasses();
  applySidebarState();
  applyTheme();
  applyLanguage();
  bindButtons();

  SRD.ROUTER.go('overview');
  setLastUpdate();

  Promise.all([
    SRD.DATA.loadExcel(config.incidentsExcel),
    SRD.DATA.loadExcel(config.stationsExcel),
    SRD.DATA.loadExcel(config.spiExcel)
  ])
    .then(function (results) {
      _data = SRD.DATA.processData(results[0], results[1], results[2]);

      setLastUpdate();

      SRD.ROUTER.go(_currentPage, _currentLoc);
    })
    .catch(function (err) {
      console.error('SRD:', err);

      renderError(err && err.message ? err.message : String(err));
    });

})();