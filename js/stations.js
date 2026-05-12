/* ================================================================
   stations.js — All Stations list page
   Bilingual + redesigned version
   Safe fallback version
   ================================================================ */

SRD.STATIONS = (function () {

  var _sortKey   = 'loc';
  var _sortDir   = 'asc';
  var _sevFilter = 'all';
  var _search    = '';
  var _stations  = [];

  function getT() {
    var fallback = {
      stations: 'All Stations',
      stationsPageSub: 'Review station-level risk scores, flight exposure, event count and severity distribution.',
      stationCount: 'stations',
      searchIata: 'Search IATA...',
      clearFilters: 'Clear Filters',
      noStationsFound: 'No stations found',
      noStationsFoundSub: 'Try clearing filters or check whether CSV data is loaded correctly.',
      loadingData: 'Loading data...',
      all: 'All',
      events: 'Events',
      composite: 'Composite',
      flights: 'Flights',
      level: 'Level',
      highSeverity: 'A+B High Sev',
      distribution: 'Distribution',
      groundSafety: 'Ground Operations Safety'
    };

    return function (key) {
      if (SRD.I18N && typeof SRD.I18N.t === 'function') {
        var value = SRD.I18N.t(key);

        /*
          Eğer main.js içinde çeviri varsa onu kullan.
          Eğer yoksa SRD.I18N.t(key) genelde key'in kendisini döndürür.
          Bu durumda fallback'e düşüyoruz.
        */
        if (value && value !== key) {
          return value;
        }
      }

      return fallback[key] || key;
    };
  }

  function render(container, data) {
    if (!container) return;

    var t = getT();

    /*
      container.className = 'stations-page' kullanmıyoruz.
      Çünkü bu, router için gerekli olan "page" ve "srd-active"
      class'larını silebilir.
    */
    container.innerHTML = '';
    container.classList.add('stations-page');

    if (!data || !data.stations) {
      container.innerHTML =
        '<div class="stations-loading-card">' +
          '<div class="stations-loading-icon">⏳</div>' +
          '<h3>' + escapeHTML(t('loadingData')) + '</h3>' +
        '</div>';

      container.classList.add('page');
      container.classList.add('srd-active');
      return;
    }

    _stations  = data.stations || [];
    _sortKey   = 'loc';
    _sortDir   = 'asc';
    _sevFilter = 'all';
    _search    = '';

    /* ── PAGE HEADER ──────────────────────────────────────────── */

    var pageHeader = document.createElement('div');
    pageHeader.className = 'stations-page-header';

    pageHeader.innerHTML =
      '<div class="stations-page-heading">' +
        '<div class="stations-page-kicker">' + escapeHTML(t('groundSafety')) + '</div>' +
        '<h1>' + escapeHTML(t('stations')) + '</h1>' +
        '<p>' + escapeHTML(t('stationsPageSub')) + '</p>' +
      '</div>' +
      '<div class="stations-page-stat">' +
        '<span id="st-count-big">0</span>' +
        '<small>' + escapeHTML(t('stationCount')) + '</small>' +
      '</div>';

    container.appendChild(pageHeader);

    /* ── PANEL ───────────────────────────────────────────────── */

    var panel = document.createElement('div');
    panel.className = 'stations-panel';

    var header = document.createElement('div');
    header.className = 'stations-header';

    var titleWrap = document.createElement('div');
    titleWrap.innerHTML =
      '<div class="stations-title">' + escapeHTML(t('stations')) + '</div>' +
      '<div class="stations-count" id="st-count"></div>';

    var controls = document.createElement('div');
    controls.className = 'stations-controls';

    /* Search */
    var searchWrap = document.createElement('div');
    searchWrap.className = 'stations-search-wrap';

    var searchIcon = document.createElement('span');
    searchIcon.className = 'stations-search-icon';
    searchIcon.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">' +
        '<circle cx="11" cy="11" r="8"></circle>' +
        '<line x1="21" y1="21" x2="16.65" y2="16.65"></line>' +
      '</svg>';

    var search = document.createElement('input');
    search.type = 'text';
    search.placeholder = t('searchIata');
    search.className = 'search-input stations-search-input';

    search.oninput = function () {
      _search = this.value;
      refresh(container);
    };

    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(search);

    /* Severity filter buttons */
    var sevBtns = document.createElement('div');
    sevBtns.className = 'sev-btns stations-sev-btns';

    [
      ['all', t('all')],
      ['A', 'A'],
      ['B', 'B'],
      ['C', 'C'],
      ['D', 'D'],
      ['E', 'E']
    ].forEach(function (p) {
      var btn = document.createElement('button');

      btn.className = 'sev-btn' + (p[0] === 'all' ? ' on-all' : '');
      btn.textContent = p[1];

      btn.onclick = function () {
        sevBtns.querySelectorAll('.sev-btn').forEach(function (b) {
          b.className = 'sev-btn';
        });

        btn.className = 'sev-btn on-' + String(p[0]).toLowerCase();
        _sevFilter = p[0];

        refresh(container);
      };

      sevBtns.appendChild(btn);
    });

    /* Clear filters */
    var clearBtn = document.createElement('button');
    clearBtn.className = 'clear-btn';
    clearBtn.textContent = t('clearFilters');

    clearBtn.onclick = function () {
      _search = '';
      _sevFilter = 'all';
      search.value = '';

      sevBtns.querySelectorAll('.sev-btn').forEach(function (b) {
        b.className = 'sev-btn';
      });

      var firstBtn = sevBtns.querySelector('.sev-btn');
      if (firstBtn) firstBtn.className = 'sev-btn on-all';

      refresh(container);
    };

    controls.appendChild(searchWrap);
    controls.appendChild(sevBtns);
    controls.appendChild(clearBtn);

    header.appendChild(titleWrap);
    header.appendChild(controls);

    panel.appendChild(header);

    /* ── TABLE ───────────────────────────────────────────────── */

    var tableWrap = document.createElement('div');
    tableWrap.className = 'stations-table-wrap';

    var scroll = document.createElement('div');
    scroll.className = 'stations-table-scroll';

    var table = document.createElement('table');
    table.className = 'stations-table';

    var thead = document.createElement('thead');
    var hrow  = document.createElement('tr');

    function mkTh(label, key, defaultDir) {
      var th = document.createElement('th');
      th.textContent = label;

      if (key) {
        th.style.cursor = 'pointer';

        th.onclick = function () {
          if (_sortKey === key) {
            _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _sortKey = key;
            _sortDir = defaultDir || 'asc';
          }

          thead.querySelectorAll('th').forEach(function (tHead) {
            tHead.className = '';
          });

          th.className = 'sort-' + _sortDir;
          refresh(container);
        };
      }

      return th;
    }

    var thLoc = mkTh('IATA', 'loc', 'asc');
    thLoc.className = 'sort-asc';

    hrow.appendChild(thLoc);
    hrow.appendChild(mkTh(t('events'),       'count',     'desc'));
    hrow.appendChild(mkTh(t('composite'),    'composite', 'desc'));
    hrow.appendChild(mkTh(t('flights'),      'flights',   'desc'));
    hrow.appendChild(mkTh(t('level'),        'compLevel', 'asc'));
    hrow.appendChild(mkTh(t('highSeverity'), 'highSev',   'desc'));
    hrow.appendChild(mkTh(t('distribution'), null));

    thead.appendChild(hrow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    tbody.id = 'st-tbody';

    table.appendChild(tbody);
    scroll.appendChild(table);
    tableWrap.appendChild(scroll);
    panel.appendChild(tableWrap);

    container.appendChild(panel);

    refresh(container);

    container.classList.add('page');
    container.classList.add('srd-active');
  }

  function refresh(container) {
    var D = SRD.DATA;
    var t = getT();

    if (!_stations || !_stations.length) {
      updateCount(container, 0);

      var emptyTbody = container
        ? container.querySelector('#st-tbody')
        : document.getElementById('st-tbody');

      if (emptyTbody) {
        emptyTbody.innerHTML = getEmptyRow(t);
      }

      return;
    }

    var filteredData = _stations.slice();

    /* Filter by severity */
    if (_sevFilter !== 'all') {
      filteredData = filteredData.filter(function (s) {
        return s.compLevel === _sevFilter;
      });
    }

    /* Filter by search */
    if (_search) {
      var q = _search.toLowerCase();

      filteredData = filteredData.filter(function (s) {
        return String(s.loc || '').toLowerCase().indexOf(q) >= 0;
      });
    }

    /* Sort */
    filteredData.sort(function (a, b) {
      var va;
      var vb;

      if (_sortKey === 'loc') {
        return _sortDir === 'asc'
          ? String(a.loc || '').localeCompare(String(b.loc || ''))
          : String(b.loc || '').localeCompare(String(a.loc || ''));
      }

      if (_sortKey === 'compLevel') {
        va = 'ABCDE'.indexOf(a.compLevel);
        vb = 'ABCDE'.indexOf(b.compLevel);
      } else {
        va = Number(a[_sortKey] || 0);
        vb = Number(b[_sortKey] || 0);
      }

      return _sortDir === 'asc' ? va - vb : vb - va;
    });

    updateCount(container, filteredData.length);

    var tbody = container
      ? container.querySelector('#st-tbody')
      : document.getElementById('st-tbody');

    if (!tbody) return;

    if (!filteredData.length) {
      tbody.innerHTML = getEmptyRow(t);
      return;
    }

    var maxC = Math.max.apply(null, filteredData.map(function (s) {
      return Number(s.composite || 0);
    })) || 1;

    var CATS = ['A', 'B', 'C', 'D', 'E'];

    tbody.innerHTML = '';

    filteredData.forEach(function (s) {
      var composite = Number(s.composite || 0);
      var fw = Math.round(composite / maxC * 100);

      var tc = CATS.reduce(function (sum, c) {
        return sum + Number((s.catCounts && s.catCounts[c]) || 0);
      }, 0) || 1;

      var bars = CATS.map(function (c) {
        var count = Number((s.catCounts && s.catCounts[c]) || 0);
        var w = Math.round(count / tc * 56);

        return w > 0
          ? '<div class="dist-bar" title="' + escapeHTML(c + ': ' + count) + '" style="width:' + w + 'px;background:' + D.SEV_COLOR[c] + '"></div>'
          : '';
      }).join('');

      var level = s.compLevel || 'E';
      var loc = s.loc || '-';

      var tr = document.createElement('tr');

      tr.onclick = function () {
        SRD.ROUTER.go('station-detail', loc);
      };

      tr.innerHTML = [
        '<td>',
          '<span class="iata-code">' + escapeHTML(loc) + '</span>',
        '</td>',

        '<td class="mono text2">',
          Number(s.count || 0),
        '</td>',

        '<td>',
          '<div class="score-wrap">',
            '<div class="score-bg">',
              '<div class="score-fill" style="width:' + fw + '%;background:' + D.SEV_COLOR[level] + '"></div>',
            '</div>',
            '<span class="mono station-score-value">',
              composite.toFixed(2),
            '</span>',
          '</div>',
        '</td>',

        '<td class="mono text2">',
          D.fmtInt(Number(s.flights || 0)),
        '</td>',

        '<td>',
          '<span class="badge ' + String(level).toLowerCase() + '">' + escapeHTML(level) + '</span>',
        '</td>',

        '<td class="mono text2">',
          Number(s.highSev || 0),
        '</td>',

        '<td>',
          '<div class="dist-wrap">' + bars + '</div>',
        '</td>'
      ].join('');

      tbody.appendChild(tr);
    });
  }

  function getEmptyRow(t) {
    return [
      '<tr>',
        '<td colspan="7">',
          '<div class="stations-empty-state">',
            '<div class="stations-empty-icon">',
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="34" height="34">',
                '<circle cx="11" cy="11" r="8"></circle>',
                '<line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
              '</svg>',
            '</div>',
            '<h3>' + escapeHTML(t('noStationsFound')) + '</h3>',
            '<p>' + escapeHTML(t('noStationsFoundSub')) + '</p>',
          '</div>',
        '</td>',
      '</tr>'
    ].join('');
  }

  function updateCount(container, count) {
    var t = getT();

    var countEl = container
      ? container.querySelector('#st-count')
      : document.getElementById('st-count');

    var countBigEl = container
      ? container.querySelector('#st-count-big')
      : document.getElementById('st-count-big');

    if (countEl) {
      countEl.textContent = count + ' ' + t('stationCount');
    }

    if (countBigEl) {
      countBigEl.textContent = count;
    }
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