/* ================================================================
   data.js — CSV parser, data processing, risk calculations
   ================================================================ */

var SRD = SRD || {};

SRD.DATA = (function () {

  /* ── CSV PARSER ──────────────────────────────────────────────── */
  function parseCSV(text) {
    var lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    var headers = lines[0].split(',').map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (line) {
      var cols = [], cur = '', inQ = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      cols.push(cur.trim());
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = (cols[i] || '').trim(); });
      return obj;
    }).filter(function (r) {
      return Object.values(r).some(function (v) { return v !== ''; });
    });
  }

  function loadCSV(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('Failed to load: ' + path);
      return r.text();
    }).then(parseCSV);
  }

  /* ── RISK MATRIX ─────────────────────────────────────────────── */
  var SEV_COLOR = {
    A: '#e05555', B: '#d98a35', C: '#c0a030', D: '#38b272', E: '#4294cc'
  };
  var SEV_BG = {
    A: 'rgba(224,85,85,.13)', B: 'rgba(217,138,53,.13)',
    C: 'rgba(192,160,48,.13)', D: 'rgba(56,178,114,.13)', E: 'rgba(66,148,204,.13)'
  };

  function getRiskCategory(score) {
    if (score >= 80) return 'A';
    if (score >= 45) return 'B';
    if (score >= 22) return 'C';
    if (score >= 10) return 'D';
    return 'E';
  }

  function parseRiskLevel(raw) {
    var r = (raw || '').trim().toUpperCase();
    var first = r.charAt(0);
    return 'ABCDE'.indexOf(first) >= 0 ? first : null;
  }

  /* ── FORMAT ──────────────────────────────────────────────────── */
  function fmtNum(n, dec) {
    dec = dec == null ? 1 : dec;
    return parseFloat(n).toLocaleString('tr-TR', {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });
  }
  function fmtInt(n) {
    return parseInt(n || 0).toLocaleString('tr-TR');
  }

  /* ── PROCESS DATA ────────────────────────────────────────────── */
  function processData(incidents, flightRows, spiRows) {

    /* Flight map */
    var flightMap = {};
    flightRows.forEach(function (r) {
      var loc = (r['Loc'] || r['LOC'] || '').toUpperCase().trim();
      var cnt = parseFloat((r['Uçuş Sayısı'] || r['flight_count'] || '0')
        .toString().replace(/[^0-9.]/g, '')) || 0;
      if (loc) flightMap[loc] = cnt;
    });

    /* SPI map */
    var spiMap = {};
    spiRows.forEach(function (r) {
      var code = (r['SPI'] || '').trim();
      if (code) spiMap[code] = { title: r['title'] || code, cls: r['SPI_Class'] || '' };
    });

    /* Normalize incidents */
    var rows = incidents.map(function (r) {
      var loc = (r['Loc'] || r['LOC'] || '').toUpperCase().trim();
      var riskScore = parseFloat(
        (r['RiskScore'] || r['Risk_Score'] || '0').toString().replace(',', '.')
      ) || 0;
      var riskLevel = parseRiskLevel(r['Risk_Level'] || r['RiskLevel']) ||
                      getRiskCategory(riskScore);

      var nonSPI = (r['NonSPI'] || '').toLowerCase();
      var isNonSPI = (nonSPI === 'true' || nonSPI === '1');
      var spi1 = (r['SPI_1'] || r['SPI1'] || '').trim();
      var spi2 = (r['SPI_2'] || r['SPI2'] || '').trim();
      var spiTags = [];
      if (!isNonSPI) {
        if (spi1) spiTags.push(spi1);
        if (spi2) spiTags.push(spi2);
      }

      return {
        loc:       loc,
        occNo:     r['Occurence_No'] || r['Occurrence_No'] || '',
        repType:   r['Report_Type'] || r['Report_type'] || '',
        dept:      r['Department'] || '',
        status:    r['Status'] || '',
        date:      r['MC_Date'] || '',
        year:      r['MC_Year'] || '',
        yearMonth: r['MC_Year_Month'] || '',
        region:    r['Bölge'] || r['Bolge'] || r['Region'] || '',
        subRegion: r['Alt Bölge'] || r['Alt_Bolge'] || '',
        fleet:     r['Fleet'] || '',
        likelihood:      r['likelihood'] || '',
        likelihoodScore: parseFloat(r['likelihoodScore'] || 0) || 0,
        severity:        r['severity'] || '',
        severityScore:   parseFloat(r['severityScore'] || 0) || 0,
        riskLevel:  riskLevel,
        riskScore:  riskScore,
        nonSPI:     isNonSPI,
        spiTags:    spiTags,
        opPhase:    r['Operational_Phase'] || '',
      };
    }).filter(function (r) { return r.loc; });

    /* Station grouping */
    var stMap = {};
    rows.forEach(function (r) {
      if (!stMap[r.loc]) stMap[r.loc] = { loc: r.loc, incidents: [] };
      stMap[r.loc].incidents.push(r);
    });

    var stations = Object.values(stMap).map(function (st) {
      var incs = st.incidents;
      var totalRisk = incs.reduce(function (s, i) { return s + i.riskScore; }, 0);
      var flights = flightMap[st.loc] || 0;
      var composite = flights > 0
        ? (totalRisk / flights * 100)
        : (incs.length ? totalRisk / incs.length : 0);
      var catCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      incs.forEach(function (i) {
        if (catCounts[i.riskLevel] != null) catCounts[i.riskLevel]++;
      });
      return {
        loc: st.loc,
        incidents: incs,
        count: incs.length,
        totalRisk: totalRisk,
        flights: flights,
        composite: composite,
        compLevel: getRiskCategory(composite),
        catCounts: catCounts,
        highSev: (catCounts.A || 0) + (catCounts.B || 0),
      };
    });

    /* Sort alphabetically by default */
    stations.sort(function (a, b) { return a.loc.localeCompare(b.loc); });

    return { rows: rows, stations: stations, flightMap: flightMap, spiMap: spiMap };
  }

  /* ── KPIs ────────────────────────────────────────────────────── */
  function calcKPIs(rows, stations) {
    var totalInc    = rows.length;
    var totalFlight = stations.reduce(function (s, st) { return s + st.flights; }, 0);
    var avgRisk     = rows.length
      ? rows.reduce(function (s, r) { return s + r.riskScore; }, 0) / rows.length : 0;
    var stCount     = stations.length;
    return { totalInc: totalInc, totalFlight: totalFlight, avgRisk: avgRisk, stCount: stCount };
  }

  /* ── FILTER ──────────────────────────────────────────────────── */
  function applyFilters(allRows, allStations, filters) {
    var rows = allRows.filter(function (r) {
      if (filters.year   && r.year      !== filters.year)      return false;
      if (filters.month  && r.yearMonth !== filters.month)     return false;
      if (filters.dept   && r.dept      !== filters.dept)      return false;
      if (filters.fleet  && r.fleet     !== filters.fleet)     return false;
      if (filters.rtype  && r.repType   !== filters.rtype)     return false;
      if (filters.region && r.region    !== filters.region)    return false;
      if (filters.sev    && r.riskLevel !== filters.sev)       return false;
      if (filters.status && r.status    !== filters.status)    return false;
      if (filters.spi    && !r.spiTags.includes(filters.spi)) return false;
      return true;
    });

    var stMap = {};
    rows.forEach(function (r) {
      if (!stMap[r.loc]) stMap[r.loc] = { loc: r.loc, incidents: [] };
      stMap[r.loc].incidents.push(r);
    });

    var stations = Object.values(stMap).map(function (st) {
      var incs = st.incidents;
      var totalRisk = incs.reduce(function (s, i) { return s + i.riskScore; }, 0);
      var origSt = allStations.find(function (s) { return s.loc === st.loc; });
      var flights = origSt ? origSt.flights : 0;
      var composite = flights > 0 ? totalRisk / flights * 100
        : (incs.length ? totalRisk / incs.length : 0);
      var catCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      incs.forEach(function (i) {
        if (catCounts[i.riskLevel] != null) catCounts[i.riskLevel]++;
      });
      return {
        loc: st.loc, incidents: incs, count: incs.length,
        totalRisk: totalRisk, flights: flights, composite: composite,
        compLevel: getRiskCategory(composite), catCounts: catCounts,
        highSev: (catCounts.A || 0) + (catCounts.B || 0),
      };
    });

    return { rows: rows, stations: stations };
  }

  /* ── DONUT DATASETS ──────────────────────────────────────────── */
  function buildDonutSets(rows, spiMap) {
    var PALETTE = ['#e05555','#d98a35','#c0a030','#38b272','#4294cc',
                   '#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316'];

    var sev = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    rows.forEach(function (r) { if (sev[r.riskLevel] != null) sev[r.riskLevel]++; });

    var spiClassMap = {};
    rows.forEach(function (r) {
      var tags = r.spiTags.length ? r.spiTags : [];
      tags.forEach(function (tag) {
        var cls = (spiMap[tag] && spiMap[tag].cls) ? spiMap[tag].cls : tag;
        spiClassMap[cls] = (spiClassMap[cls] || 0) + 1;
      });
      if (r.nonSPI || !r.spiTags.length) {
        spiClassMap['NonSPI'] = (spiClassMap['NonSPI'] || 0) + 1;
      }
    });

    var fleetMap = {};
    rows.forEach(function (r) {
      if (r.fleet) fleetMap[r.fleet] = (fleetMap[r.fleet] || 0) + 1;
    });

    function toSet(map, colors) {
      var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
      return {
        labels: keys,
        data: keys.map(function (k) { return map[k]; }),
        colors: keys.map(function (_, i) { return colors[i % colors.length]; })
      };
    }

    return {
      sev: {
        labels: ['A — Critical', 'B — High', 'C — Medium', 'D — Low', 'E — Very Low'],
        data: [sev.A, sev.B, sev.C, sev.D, sev.E],
        colors: [SEV_COLOR.A, SEV_COLOR.B, SEV_COLOR.C, SEV_COLOR.D, SEV_COLOR.E]
      },
      spi:   toSet(spiClassMap, PALETTE),
      fleet: toSet(fleetMap, PALETTE),
    };
  }

  /* ── UNIQUE ──────────────────────────────────────────────────── */
  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
  }

  return {
    loadCSV: loadCSV,
    processData: processData,
    calcKPIs: calcKPIs,
    applyFilters: applyFilters,
    buildDonutSets: buildDonutSets,
    uniq: uniq,
    fmtNum: fmtNum,
    fmtInt: fmtInt,
    SEV_COLOR: SEV_COLOR,
    SEV_BG: SEV_BG,
  };

})();