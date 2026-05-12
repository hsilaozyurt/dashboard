/* ================================================================
   station-detail.js — Station detail page
   ================================================================ */

SRD.STATION_DETAIL = (function () {

  function render(container, data, loc) {
    var D = SRD.DATA;
    var station = data.stations.find(function(s){ return s.loc === loc; });
    if (!station) {
      container.innerHTML = '<div style="padding:40px;color:#4e6a84">Station not found: ' + loc + '</div>';
      return;
    }

    container.innerHTML = '';
    container.className = 'detail-page';

    /* Header */
    var header = document.createElement('div');
    header.className = 'detail-header';

    var left = document.createElement('div');
    left.className = 'detail-header-left';
    left.innerHTML = [
      '<div class="detail-iata-badge">' + loc + '</div>',
      '<div>',
        '<div class="detail-station-name">' + loc + ' Station</div>',
        '<div class="detail-station-sub">Risk summary · ' + station.count + ' recorded events</div>',
      '</div>',
    ].join('');

    var backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg> Back to All Stations';
    backBtn.onclick = function() { SRD.ROUTER.go('stations'); };

    header.appendChild(left);
    header.appendChild(backBtn);
    container.appendChild(header);

    /* KPI grid */
    var kpiGrid = document.createElement('div');
    kpiGrid.className = 'detail-kpi-grid';

    var kpis = [
      { cls:'blue',   label:'Total Events',     val: D.fmtInt(station.count),           sub:'Recorded occurrences' },
      { cls:'orange', label:'Composite Score',  val: station.composite.toFixed(2),       sub:'(Σ Risk / Flights) × 100' },
      { cls:'green',  label:'Total Flights',    val: D.fmtInt(station.flights),          sub:'Flight count' },
      { cls:'purple', label:'Risk Level',       val: station.compLevel,                  sub:'Composite category' },
    ];

    kpis.forEach(function(k) {
      var div = document.createElement('div');
      div.className = 'kpi-card ' + k.cls;
      div.innerHTML = [
        '<div class="kpi-top">',
          '<div class="kpi-label">' + k.label + '</div>',
        '</div>',
        '<div class="kpi-value">' + k.val + '</div>',
        '<div class="kpi-sub">' + k.sub + '</div>',
      ].join('');
      kpiGrid.appendChild(div);
    });
    container.appendChild(kpiGrid);

    /* Charts row */
    var chartsRow = document.createElement('div');
    chartsRow.className = 'detail-charts-row';

    /* Trend chart */
    var trendCard = document.createElement('div');
    trendCard.className = 'card';
    trendCard.innerHTML = [
      '<div class="card-header">',
        '<div>',
          '<div class="card-title"><span class="card-dot" style="background:#3b82f6"></span>Monthly Event Trend</div>',
          '<div class="card-sub">' + loc + ' — monthly event count</div>',
        '</div>',
      '</div>',
      '<div class="card-body"><div class="chart-wrap"><canvas id="det-line"></canvas></div></div>',
    ].join('');

    /* Risk distribution donut */
    var distCard = document.createElement('div');
    distCard.className = 'card';
    distCard.innerHTML = [
      '<div class="card-header">',
        '<div>',
          '<div class="card-title"><span class="card-dot" style="background:#8b5cf6"></span>Risk Distribution</div>',
          '<div class="card-sub">A / B / C / D / E breakdown</div>',
        '</div>',
      '</div>',
      '<div class="card-body">',
        '<div class="donut-wrap">',
          '<div class="donut-canvas"><canvas id="det-donut"></canvas></div>',
          '<div class="donut-legend" id="det-donut-leg"></div>',
        '</div>',
      '</div>',
    ].join('');

    chartsRow.appendChild(trendCard);
    chartsRow.appendChild(distCard);
    container.appendChild(chartsRow);

    /* Render charts */
    var incs = station.incidents;

    /* Line chart */
    var monthMap = {};
    incs.forEach(function(r) {
      var m = (r.yearMonth || r.date || '').slice(0,7);
      if (m) monthMap[m] = (monthMap[m]||0) + 1;
    });
    var labels = Object.keys(monthMap).sort();
    var mdata  = labels.map(function(k){return monthMap[k];});

    var exL = Chart.getChart('det-line');
    if (exL) exL.destroy();
    new Chart(document.getElementById('det-line'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Events', data: mdata,
          borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.07)',
          borderWidth: 1.5, pointRadius: 2, pointHoverRadius: 4,
          tension: 0.4, fill: true,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend:{display:false} },
        scales: {
          x: { grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#4e6a84',font:{size:9}} },
          y: { grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#4e6a84',font:{size:10}}, min:0 },
        },
      },
    });

    /* Donut */
    var CATS   = ['A','B','C','D','E'];
    var LABELS = ['A — Critical','B — High','C — Medium','D — Low','E — Very Low'];
    var ddata  = CATS.map(function(c){return station.catCounts[c]||0;});
    var colors = CATS.map(function(c){return D.SEV_COLOR[c];});
    var total  = ddata.reduce(function(a,b){return a+b;},0);

    var exD = Chart.getChart('det-donut');
    if (exD) exD.destroy();
    new Chart(document.getElementById('det-donut'), {
      type: 'doughnut',
      data: {
        labels: LABELS,
        datasets: [{ data: ddata, backgroundColor: colors, borderWidth: 2, borderColor: '#1a2740' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: { legend:{display:false} },
      },
    });

    var leg = document.getElementById('det-donut-leg');
    if (leg) {
      leg.innerHTML = '';
      LABELS.forEach(function(lbl, i) {
        var pct = total ? (ddata[i]/total*100).toFixed(1) : '0';
        var row = document.createElement('div');
        row.className = 'legend-row';
        row.innerHTML = [
          '<div class="legend-left">',
            '<div class="legend-dot" style="background:'+colors[i]+'"></div>',
            '<span class="legend-name">'+lbl+'</span>',
          '</div>',
          '<div class="legend-right">',
            '<span class="legend-val">'+ddata[i]+'</span>',
            '<span class="legend-pct">%'+pct+'</span>',
          '</div>',
        ].join('');
        leg.appendChild(row);
      });
    }
  }

  return { render: render };

})();