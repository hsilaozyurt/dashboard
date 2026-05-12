/* ================================================================
   dashboard.js — Dashboard page
   Bilingual + corrected filter version
   - Adds station filter
   - Adds clear filters button only
   - SPI filter displays SPI code + title from SPI CSV
   - Region filter uses cleaned region values from data.js
   - Year / Month filters use normalized values from data.js
   - Works with data.js filters.station
   ================================================================ */

SRD.DASHBOARD = (function () {

  var _donutChart = null;
  var _donutSets  = null;

  function getT() {
    if (SRD.I18N && typeof SRD.I18N.t === 'function') {
      return SRD.I18N.t;
    }

    return function (key) {
      var fallback = {
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

        totalRecordedEvents: 'Total Recorded Events',
        totalFlights: 'Total Flights',
        averageRiskScore: 'Average Risk Score',
        monitoredStations: 'Monitored Stations',
        stationTotal: 'Station total',
        likelihoodSeverity: 'Likelihood × Severity',
        active: 'Active',

        monthlyEventTrend: 'Monthly Event Trend',
        basedOnYearMonth: 'Based on MC_Year_Month',
        riskDistribution: 'Risk Distribution',
        levelSpiFleet: 'Level · SPI · Fleet',
        riskLevel: 'Risk Level',
        spiClass: 'SPI Class',
        fleet: 'Fleet',

        spiCategorySummary: 'SPI Category Summary',
        spiSummarySub: 'Event count & average risk score by SPI',
        top10RiskStations: 'Top 10 Highest Risk Stations',
        compositeFormula: 'Composite = (Σ RiskScore / Flights) × 100',

        title: 'Title',
        classText: 'Class',
        events: 'Events',
        avgRisk: 'Avg Risk',
        dist: 'Dist.',
        noSpiData: 'No SPI data available',
        nonSpiEvent: 'Non-SPI Event',

        compositeScore: 'Composite Score',
        composite: 'Composite',
        level: 'Level'
      };

      return fallback[key] || key;
    };
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cleanOptionList(arr) {
    return SRD.DATA.uniq((arr || []).filter(function (v) {
      return v !== undefined && v !== null && String(v).trim() !== '';
    })).sort();
  }

  /* ── FILTER BAR ──────────────────────────────────────────────── */

  function buildFilterBar(container, rows, stations, spiMap, onChange) {
    var D = SRD.DATA;
    var t = getT();

    var years = cleanOptionList(rows.map(function (r) {
      return r.year;
    })).sort().reverse();

    var months = cleanOptionList(rows.map(function (r) {
      return r.yearMonth;
    })).sort().reverse();

    var stationCodes = cleanOptionList((stations || []).map(function (s) {
      return s.loc;
    }));

    var depts = cleanOptionList(rows.map(function (r) {
      return r.dept;
    }));

    var fleets = cleanOptionList(rows.map(function (r) {
      return r.fleet;
    }));

    var rtypes = cleanOptionList(rows.map(function (r) {
      return r.repType;
    }));

    /*
      Region artık data.js içinde temizleniyor.
      Buraya sadece 1.Bölge, 2.Bölge, - gibi geçerli değerler gelmeli.
    */
    var regions = cleanOptionList(rows.map(function (r) {
      return r.region;
    }));

    var spiCodes = D.uniq(rows.reduce(function (arr, r) {
      return arr.concat(r.spiTags || []);
    }, [])).filter(function (code) {
      return !!code && !!spiMap[code];
    }).sort();

    var spiOptions = spiCodes.map(function (code) {
      var info = spiMap[code] || {};
      var label = info.title ? code + ' — ' + info.title : code;

      return {
        value: code,
        label: label
      };
    });

    function mkSel(id, label, opts) {
      var s = document.createElement('select');
      s.id = id;
      s.onchange = onChange;

      var def = document.createElement('option');
      def.value = '';
      def.textContent = label;
      s.appendChild(def);

      (opts || []).forEach(function (o) {
        var op = document.createElement('option');

        if (typeof o === 'object') {
          op.value = o.value;
          op.textContent = o.label;
          if (o.title) op.title = o.title;
        } else {
          op.value = o;
          op.textContent = o;
        }

        s.appendChild(op);
      });

      return s;
    }

    function clearAllFilters() {
      [
        'f-year',
        'f-month',
        'f-station',
        'f-dept',
        'f-fleet',
        'f-rtype',
        'f-region',
        'f-sev',
        'f-status',
        'f-spi'
      ].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });

      onChange();
    }

    container.innerHTML = '';

    var lbl = document.createElement('div');
    lbl.className = 'filter-label';
    lbl.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">' +
        '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>' +
      '</svg> ' + escapeHTML(t('filter'));

    container.appendChild(lbl);

    [
      mkSel('f-year',    t('allYears'),       years),
      mkSel('f-month',   t('allMonths'),      months),
      mkSel('f-station', t('allStations'),    stationCodes),
      mkSel('f-dept',    t('allDepartments'), depts),
      mkSel('f-fleet',   t('allFleets'),      fleets),
      mkSel('f-rtype',   t('allReportTypes'), rtypes),
      mkSel('f-region',  t('allRegions'),     regions),
      mkSel('f-sev',     t('allLevels'),      ['A', 'B', 'C', 'D', 'E']),
      mkSel('f-status',  t('allStatuses'),    ['Open', 'Closed', 'In Progress']),
      mkSel('f-spi',     t('allSPI'),         spiOptions)
    ].forEach(function (s) {
      container.appendChild(s);
    });

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'filter-clear-btn';
    clearBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">' +
        '<path d="M3 6h18"/>' +
        '<path d="M8 6V4h8v2"/>' +
        '<path d="M19 6l-1 14H6L5 6"/>' +
      '</svg>' +
      '<span>' + escapeHTML(t('clearFilters')) + '</span>';

    clearBtn.onclick = clearAllFilters;

    container.appendChild(clearBtn);
  }

  function getFilters() {
    function v(id) {
      var el = document.getElementById(id);
      return el ? el.value : '';
    }

    return {
      year: v('f-year'),
      month: v('f-month'),
      station: v('f-station'),
      dept: v('f-dept'),
      fleet: v('f-fleet'),
      rtype: v('f-rtype'),
      region: v('f-region'),
      sev: v('f-sev'),
      status: v('f-status'),
      spi: v('f-spi')
    };
  }

  /* ── KPI CARDS ───────────────────────────────────────────────── */

  function renderKPIs(container, kpis) {
    var D = SRD.DATA;
    var t = getT();

    container.innerHTML = '';

    var cards = [
      {
        cls: 'blue',
        label: t('totalRecordedEvents'),
        val: D.fmtInt(kpis.totalInc),
        sub: t('allStations'),
        icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
      },
      {
        cls: 'green',
        label: t('totalFlights'),
        val: D.fmtInt(kpis.totalFlight),
        sub: t('stationTotal'),
        icon: '<path d="M21 16v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><polyline points="3 16 12 22 21 16"/><line x1="12" y1="12" x2="12" y2="22"/>'
      },
      {
        cls: 'orange',
        label: t('averageRiskScore'),
        val: D.fmtNum(kpis.avgRisk, 1),
        sub: t('likelihoodSeverity'),
        icon: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
      },
      {
        cls: 'purple',
        label: t('monitoredStations'),
        val: String(kpis.stCount),
        sub: t('active'),
        icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>'
      }
    ];

    cards.forEach(function (c) {
      var div = document.createElement('div');
      div.className = 'kpi-card ' + c.cls;

      div.innerHTML = [
        '<div class="kpi-top">',
          '<div class="kpi-label">' + escapeHTML(c.label) + '</div>',
          '<div class="kpi-icon">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">' + c.icon + '</svg>',
          '</div>',
        '</div>',
        '<div class="kpi-value">' + escapeHTML(c.val) + '</div>',
        '<div class="kpi-sub">' + escapeHTML(c.sub) + '</div>'
      ].join('');

      container.appendChild(div);
    });
  }

  /* ── BAR CHART ───────────────────────────────────────────────── */

  function renderBarChart(canvasId, stations) {
    var D = SRD.DATA;
    var t = getT();

    var top10 = stations.slice()
      .sort(function (a, b) { return b.composite - a.composite; })
      .slice(0, 10);

    var ex = Chart.getChart(canvasId);
    if (ex) ex.destroy();

    new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels: top10.map(function (s) { return s.loc; }),
        datasets: [{
          label: t('compositeScore'),
          data: top10.map(function (s) { return parseFloat(s.composite.toFixed(2)); }),
          backgroundColor: top10.map(function (s) { return D.SEV_BG[s.compLevel]; }),
          borderColor: top10.map(function (s) { return D.SEV_COLOR[s.compLevel]; }),
          borderWidth: 1,
          borderRadius: 3,
          barThickness: 14
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                return ' ' + t('composite') + ': ' + c.raw.toFixed(2);
              },
              afterLabel: function (c) {
                var s = top10[c.dataIndex];
                return ' ' + t('level') + ': ' + s.compLevel + '  |  ' + t('events') + ': ' + s.count;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,.05)' },
            ticks: { color: '#4e6a84', font: { size: 10 } }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#dde6f0', font: { size: 11, weight: '700' } }
          }
        }
      }
    });
  }

  /* ── DONUT CHART ─────────────────────────────────────────────── */

  function renderDonut(canvasId, legendId, key) {
    if (!_donutSets) return;

    var d = _donutSets[key];

    if (_donutChart) _donutChart.destroy();

    _donutChart = new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: {
        labels: d.labels,
        datasets: [{
          data: d.data,
          backgroundColor: d.colors,
          borderWidth: 2,
          borderColor: '#1a2740'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                var tot = c.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                var pct = tot ? (c.raw / tot * 100).toFixed(1) : '0';
                return ' ' + c.raw.toLocaleString('tr-TR') + ' (%' + pct + ')';
              }
            }
          }
        }
      }
    });

    var leg = document.getElementById(legendId);
    if (!leg) return;

    var total = d.data.reduce(function (a, b) { return a + b; }, 0);

    leg.innerHTML = '';

    d.labels.forEach(function (lbl, i) {
      var pct = total ? (d.data[i] / total * 100).toFixed(1) : '0';

      var row = document.createElement('div');
      row.className = 'legend-row';

      row.innerHTML = [
        '<div class="legend-left">',
          '<div class="legend-dot" style="background:' + d.colors[i] + '"></div>',
          '<span class="legend-name">' + escapeHTML(lbl) + '</span>',
        '</div>',
        '<div class="legend-right">',
          '<span class="legend-val">' + d.data[i].toLocaleString('tr-TR') + '</span>',
          '<span class="legend-pct">%' + pct + '</span>',
        '</div>'
      ].join('');

      leg.appendChild(row);
    });
  }

  /* ── LINE CHART ──────────────────────────────────────────────── */

  function renderLineChart(canvasId, rows) {
    var t = getT();

    var monthMap = {};

    rows.forEach(function (r) {
      var m = r.yearMonth || '';

      if (m) {
        monthMap[m] = (monthMap[m] || 0) + 1;
      }
    });

    var labels = Object.keys(monthMap).sort();
    var data   = labels.map(function (k) { return monthMap[k]; });

    var ex = Chart.getChart(canvasId);
    if (ex) ex.destroy();

    new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: t('events'),
          data: data,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,.07)',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                return ' ' + c.raw + ' ' + t('events').toLowerCase();
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,.05)' },
            ticks: { color: '#4e6a84', font: { size: 9 }, maxTicksLimit: 10 }
          },
          y: {
            grid: { color: 'rgba(255,255,255,.05)' },
            ticks: { color: '#4e6a84', font: { size: 10 } },
            min: 0
          }
        }
      }
    });
  }

  /* ── SPI TABLE ───────────────────────────────────────────────── */

  function renderSPITable(tbodyId, rows, spiMap) {
    var D = SRD.DATA;
    var t = getT();

    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    var agg = {};

    rows.forEach(function (r) {
      var tags = r.spiTags && r.spiTags.length ? r.spiTags : ['NonSPI'];

      tags.forEach(function (tag) {
        if (!agg[tag]) {
          agg[tag] = {
            code: tag,
            count: 0,
            totalRisk: 0,
            levels: { A: 0, B: 0, C: 0, D: 0, E: 0 }
          };
        }

        agg[tag].count++;
        agg[tag].totalRisk += Number(r.riskScore || 0);

        if (agg[tag].levels[r.riskLevel] != null) {
          agg[tag].levels[r.riskLevel]++;
        }
      });
    });

    var total = rows.length || 1;
    var items = Object.values(agg).sort(function (a, b) { return b.totalRisk - a.totalRisk; });
    var maxC  = Math.max.apply(null, items.map(function (i) { return i.count; })) || 1;
    var CATS  = ['A', 'B', 'C', 'D', 'E'];

    tbody.innerHTML = '';

    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;padding:24px;color:#4e6a84">' +
          escapeHTML(t('noSpiData')) +
        '</td></tr>';
      return;
    }

    items.forEach(function (item) {
      var info  = spiMap[item.code] || {};
      var title = info.title || (item.code === 'NonSPI' ? t('nonSpiEvent') : item.code);
      var cls   = info.cls || '—';
      var avg   = item.count ? (item.totalRisk / item.count) : 0;
      var bw    = Math.round(item.count / maxC * 100);
      var pct   = ((item.count / total) * 100).toFixed(1);

      var bars = CATS.map(function (c) {
        var w = Math.round((item.levels[c] || 0) / item.count * 48);

        return w > 0
          ? '<div style="height:5px;width:' + w + 'px;background:' + D.SEV_COLOR[c] + ';border-radius:1px;display:inline-block;margin-right:1px"></div>'
          : '';
      }).join('');

      var tr = document.createElement('tr');

      tr.innerHTML = [
        '<td><span style="font-family:Consolas,monospace;font-size:11px;font-weight:700;color:' + (item.code === 'NonSPI' ? '#4e6a84' : '#60a5fa') + '">' + escapeHTML(item.code) + '</span></td>',
        '<td style="font-size:11px;color:#8aa4c0;max-width:180px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis" title="' + escapeHTML(title) + '">' + escapeHTML(title) + '</td>',
        '<td><span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;background:rgba(255,255,255,.06);color:#8aa4c0">' + escapeHTML(cls) + '</span></td>',
        '<td>',
          '<div style="display:flex;align-items:center;gap:7px">',
            '<div style="flex:1;background:rgba(255,255,255,.06);border-radius:2px;height:5px;min-width:50px">',
              '<div style="width:' + bw + '%;height:100%;background:#3b82f6;border-radius:2px"></div>',
            '</div>',
            '<span style="font-family:Consolas,monospace;font-size:11px;color:#dde6f0;min-width:24px">' + item.count + '</span>',
            '<span style="font-size:10px;color:#4e6a84">' + pct + '%</span>',
          '</div>',
        '</td>',
        '<td style="font-family:Consolas,monospace;font-size:11px;color:#8aa4c0">' + avg.toFixed(2) + '</td>',
        '<td><div style="display:flex;gap:1px">' + bars + '</div></td>'
      ].join('');

      tbody.appendChild(tr);
    });
  }

  /* ── RENDER ──────────────────────────────────────────────────── */

  function render(container, data) {
    if (!container || !data) return;

    var t = getT();

    container.innerHTML = '';
    container.classList.add('dashboard-page');

    var fb = document.createElement('div');
    fb.className = 'filterbar';
    container.appendChild(fb);

    var main = document.createElement('div');
    main.className = 'dashboard-main';

    var kpiGrid = document.createElement('div');
    kpiGrid.className = 'kpi-grid';
    main.appendChild(kpiGrid);

    var chartsRow = document.createElement('div');
    chartsRow.className = 'charts-row';

    var lineCard = document.createElement('div');
    lineCard.className = 'card';

    lineCard.innerHTML = [
      '<div class="card-header">',
        '<div>',
          '<div class="card-title"><span class="card-dot" style="background:#3b82f6"></span>' + escapeHTML(t('monthlyEventTrend')) + '</div>',
          '<div class="card-sub">' + escapeHTML(t('basedOnYearMonth')) + '</div>',
        '</div>',
      '</div>',
      '<div class="card-body"><div class="chart-wrap"><canvas id="db-line"></canvas></div></div>'
    ].join('');

    var dtabs = document.createElement('div');
    dtabs.className = 'dtabs';

    [
      ['sev', t('riskLevel')],
      ['spi', t('spiClass')],
      ['fleet', t('fleet')]
    ].forEach(function (p) {
      var btn = document.createElement('button');
      btn.className = 'dtab' + (p[0] === 'sev' ? ' active' : '');
      btn.textContent = p[1];
      btn.setAttribute('data-key', p[0]);

      btn.onclick = function () {
        dtabs.querySelectorAll('.dtab').forEach(function (b) {
          b.classList.remove('active');
        });

        btn.classList.add('active');
        renderDonut('db-donut', 'db-donut-leg', p[0]);
      };

      dtabs.appendChild(btn);
    });

    var donutCard = document.createElement('div');
    donutCard.className = 'card';

    var donutBody = document.createElement('div');
    donutBody.className = 'card-body';

    var donutHeader = document.createElement('div');
    donutHeader.className = 'card-header';

    donutHeader.innerHTML =
      '<div>' +
        '<div class="card-title"><span class="card-dot" style="background:#3b82f6"></span>' + escapeHTML(t('riskDistribution')) + '</div>' +
        '<div class="card-sub">' + escapeHTML(t('levelSpiFleet')) + '</div>' +
      '</div>';

    var donutWrap = document.createElement('div');
    donutWrap.className = 'donut-wrap';

    donutWrap.innerHTML = [
      '<div class="donut-canvas"><canvas id="db-donut"></canvas></div>',
      '<div class="donut-legend" id="db-donut-leg"></div>'
    ].join('');

    donutBody.appendChild(dtabs);
    donutBody.appendChild(donutWrap);

    donutCard.appendChild(donutHeader);
    donutCard.appendChild(donutBody);

    chartsRow.appendChild(lineCard);
    chartsRow.appendChild(donutCard);
    main.appendChild(chartsRow);

    var bottomRow = document.createElement('div');
    bottomRow.className = 'bottom-row';

    var spiCard = document.createElement('div');
    spiCard.className = 'card';

    spiCard.innerHTML = [
      '<div class="card-header">',
        '<div>',
          '<div class="card-title"><span class="card-dot" style="background:#8b5cf6"></span>' + escapeHTML(t('spiCategorySummary')) + '</div>',
          '<div class="card-sub">' + escapeHTML(t('spiSummarySub')) + '</div>',
        '</div>',
      '</div>',
      '<div class="tbl-wrap" style="max-height:260px">',
        '<table>',
          '<thead><tr>',
            '<th>SPI</th>',
            '<th>' + escapeHTML(t('title')) + '</th>',
            '<th>' + escapeHTML(t('classText')) + '</th>',
            '<th>' + escapeHTML(t('events')) + '</th>',
            '<th>' + escapeHTML(t('avgRisk')) + '</th>',
            '<th>' + escapeHTML(t('dist')) + '</th>',
          '</tr></thead>',
          '<tbody id="db-spi-tbody"></tbody>',
        '</table>',
      '</div>'
    ].join('');

    var topCard = document.createElement('div');
    topCard.className = 'card';

    topCard.innerHTML = [
      '<div class="card-header">',
        '<div>',
          '<div class="card-title"><span class="card-dot" style="background:#d98a35"></span>' + escapeHTML(t('top10RiskStations')) + '</div>',
          '<div class="card-sub">' + escapeHTML(t('compositeFormula')) + '</div>',
        '</div>',
      '</div>',
      '<div class="card-body"><div class="chart-wrap-lg"><canvas id="db-bar"></canvas></div></div>'
    ].join('');

    bottomRow.appendChild(spiCard);
    bottomRow.appendChild(topCard);

    main.appendChild(bottomRow);
    container.appendChild(main);

    buildFilterBar(fb, data.rows, data.stations, data.spiMap, function () {
      var filtered = SRD.DATA.applyFilters(data.rows, data.stations, getFilters());
      var kpis = SRD.DATA.calcKPIs(filtered.rows, filtered.stations);

      renderKPIs(kpiGrid, kpis);

      _donutSets = SRD.DATA.buildDonutSets(filtered.rows, data.spiMap);

      var activeBtn = dtabs.querySelector('.dtab.active');
      var activeKey = activeBtn ? activeBtn.getAttribute('data-key') : 'sev';

      renderDonut('db-donut', 'db-donut-leg', activeKey);
      renderLineChart('db-line', filtered.rows);
      renderBarChart('db-bar', filtered.stations);
      renderSPITable('db-spi-tbody', filtered.rows, data.spiMap);
    });

    var kpis = SRD.DATA.calcKPIs(data.rows, data.stations);

    _donutSets = SRD.DATA.buildDonutSets(data.rows, data.spiMap);

    renderKPIs(kpiGrid, kpis);
    renderDonut('db-donut', 'db-donut-leg', 'sev');
    renderLineChart('db-line', data.rows);
    renderBarChart('db-bar', data.stations);
    renderSPITable('db-spi-tbody', data.rows, data.spiMap);

    container.classList.add('page');
    container.classList.add('srd-active');
  }

  return {
    render: render
  };

})();