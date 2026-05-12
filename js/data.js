/* ================================================================
   data.js — CSV parser, data processing, risk calculations
   MC_Year_Month format: MM.YYYY (e.g. 05.2025)
   MC_Date format: DD.MM.YYYY (e.g. 04.05.2025)
   ================================================================ */

var SRD = SRD || {};

SRD.DATA = (function () {

  /* ── CSV PARSER ──────────────────────────────────────────────── */

  function detectDelimiter(firstLine) {
    var commaCount = (firstLine.match(/,/g) || []).length;
    var semiCount  = (firstLine.match(/;/g) || []).length;
    return semiCount > commaCount ? ';' : ',';
  }

  function splitCSVRecords(text) {
    var records = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], next = text[i + 1];
      if (ch === '"' && inQ && next === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = !inQ; }
      else if ((ch === '\n' || ch === '\r') && !inQ) {
        if (cur.trim()) records.push(cur);
        cur = '';
        if (ch === '\r' && next === '\n') i++;
      } else { cur += ch; }
    }
    if (cur.trim()) records.push(cur);
    return records;
  }

  function splitCSVLine(line, delim) {
    var cols = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], next = line[i + 1];
      if (ch === '"' && inQ && next === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = !inQ; }
      else if (ch === delim && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  }

  function makeUniqueHeaders(headers) {
    var seen = {};
    return headers.map(function (h) {
      h = String(h || '').replace(/^\uFEFF/, '').trim() || 'EMPTY';
      if (!seen[h]) { seen[h] = 1; return h; }
      return h + '_' + (++seen[h]);
    });
  }

  function parseCSV(text) {
    if (!text) return [];
    text = String(text).replace(/^\uFEFF/, '').trim();
    if (!text) return [];
    var records = splitCSVRecords(text);
    if (records.length < 2) return [];
    var delim = detectDelimiter(records[0]);
    var headers = makeUniqueHeaders(splitCSVLine(records[0], delim));
    return records.slice(1).map(function (rec) {
      var cols = splitCSVLine(rec, delim);
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = (cols[i] || '').trim(); });
      return obj;
    }).filter(function (r) {
      return Object.values(r).some(function (v) { return String(v || '').trim() !== ''; });
    });
  }

  function loadCSV(path) {
    return fetch(path)
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load: ' + path);
        return r.text();
      })
      .then(parseCSV);
  }

  /* ── HELPERS ─────────────────────────────────────────────────── */

  function pick(row, names) {
    for (var i = 0; i < names.length; i++) {
      var v = String(row[names[i]] || '').trim();
      if (v) return v;
    }
    return '';
  }

  function byIndex(row, idx) {
    var k = Object.keys(row || {})[idx];
    return k ? String(row[k] || '').trim() : '';
  }

  function s(v) { return String(v || '').trim(); }

  function parseNumber(value) {
    var str = String(value || '').trim().replace(/\s/g, '');
    if (!str) return 0;
    if (str.indexOf(',') >= 0 && str.indexOf('.') >= 0)
      str = str.replace(/\./g, '').replace(',', '.');
    else if (str.indexOf(',') >= 0)
      str = str.replace(',', '.');
    str = str.replace(/[^0-9.\-]/g, '');
    return parseFloat(str) || 0;
  }

  /* ── STATION CODE VALIDATION ─────────────────────────────────── */

  /* Strict IATA: exactly 3 uppercase letters only */
  function cleanStation(value) {
    var raw = s(value).toUpperCase().replace(/[^A-Z]/g, '');
    if (raw.length !== 3) return '';
    return raw;
  }

  /* ── LOCATION FROM INCIDENT ROW ──────────────────────────────── */

  function getIncidentLoc(row) {
    /* ONLY use Loc column — never fallback to Location or other cols
       because Location contains city names, not IATA codes */
    var loc = s(row['Loc'] || row['LOC'] || row['loc'] || '');
    return cleanStation(loc);
  }

  /* ── FLIGHT LOC & COUNT ──────────────────────────────────────── */

  function getFlightLoc(row) {
    var loc = pick(row, ['Loc','LOC','loc','IATA','Station','Airport'])
              || byIndex(row, 0);
    return cleanStation(loc);
  }

  function getFlightCount(row) {
    var v = pick(row, [
      'Uçuş Sayısı','Ucus Sayisi','Ucus_sayisi','Uçuş_Sayısı',
      'Flight Count','Flight_Count','flight_count','Flights','flights',
      'Count','count','Sayı','Sayi','Adet'
    ]) || byIndex(row, 1);
    return parseNumber(v);
  }

  /* ── OCCURRENCE NO ───────────────────────────────────────────── */

  function getOccNo(row) {
    return s(pick(row, [
      'Occurrence_No','Occurence_No','Occurrence No','Occurence No',
      'OccurrenceNo','OccurenceNo','OCCURRENCE_NO'
    ]));
  }

  /* Count unique by Occurrence_No — same occ_no = same incident */
  function countUnique(rows) {
    var seen = {}, count = 0;
    (rows || []).forEach(function (r, i) {
      /* If occNo exists use it, else treat each row as unique */
      var key = s(r.occNo);
      if (!key) key = 'ROW_' + i;
      if (!seen[key]) { seen[key] = 1; count++; }
    });
    return count;
  }

  /* ── REGION ──────────────────────────────────────────────────── */

  function cleanRegion(value) {
    var raw = s(value).replace(/\s+/g, ' ');
    if (!raw || raw === '-') return '';
    var m = raw.match(/^([0-9]+)\s*\.?\s*(Bölge|Bolge|bolge|bölge)$/i);
    return m ? m[1] + '.Bölge' : '';
  }

  /* ── DATE HELPERS ────────────────────────────────────────────── */

  /* MC_Year_Month = "05.2025" (MM.YYYY)
     MC_Date       = "04.05.2025" (DD.MM.YYYY)
     MC_Year       = "2025" */

  function normalizeYear(row) {
    /* 1. MC_Year direkt */
    var y = s(row['MC_Year'] || '');
    if (/^[0-9]{4}$/.test(y)) return y;

    /* 2. MC_Year_Month: MM.YYYY */
    var ym = s(row['MC_Year_Month'] || '');
    if (ym) {
      var m1 = ym.match(/^[0-9]{1,2}[.\-/]([0-9]{4})$/);
      if (m1) return m1[1];
      var m2 = ym.match(/^([0-9]{4})[.\-/][0-9]{1,2}$/);
      if (m2) return m2[1];
    }

    /* 3. MC_Date: DD.MM.YYYY */
    var d = s(row['MC_Date'] || '');
    var m3 = d.match(/^[0-9]{1,2}[.\-/][0-9]{1,2}[.\-/]([0-9]{4})/);
    if (m3) return m3[1];

    return '';
  }

  function normalizeYearMonth(row) {
    /* 1. MC_Year_Month: MM.YYYY → 2025-05 */
    var ym = s(row['MC_Year_Month'] || '');
    if (ym) {
      /* MM.YYYY */
      var m1 = ym.match(/^([0-9]{1,2})[.\-/]([0-9]{4})$/);
      if (m1) return m1[2] + '-' + m1[1].padStart(2, '0');
      /* YYYY.MM */
      var m2 = ym.match(/^([0-9]{4})[.\-/]([0-9]{1,2})$/);
      if (m2) return m2[1] + '-' + m2[2].padStart(2, '0');
      /* YYYY-MM already */
      if (/^[0-9]{4}-[0-9]{2}$/.test(ym)) return ym;
    }

    /* 2. MC_Date: DD.MM.YYYY → 2025-05 */
    var d = s(row['MC_Date'] || '');
    var m3 = d.match(/^([0-9]{1,2})[.\-/]([0-9]{1,2})[.\-/]([0-9]{4})/);
    if (m3) return m3[3] + '-' + m3[2].padStart(2, '0');

    return '';
  }

  /* ── RISK ────────────────────────────────────────────────────── */

  var SEV_COLOR = { A:'#e05555', B:'#d98a35', C:'#c0a030', D:'#38b272', E:'#4294cc' };
  var SEV_BG    = {
    A:'rgba(224,85,85,.13)', B:'rgba(217,138,53,.13)',
    C:'rgba(192,160,48,.13)', D:'rgba(56,178,114,.13)', E:'rgba(66,148,204,.13)'
  };

  function getRiskCat(score) {
    score = Number(score || 0);
    if (score >= 80) return 'A';
    if (score >= 45) return 'B';
    if (score >= 22) return 'C';
    if (score >= 10) return 'D';
    return 'E';
  }

  function parseRiskLevel(raw) {
    var r = s(raw).toUpperCase();
    var first = r.charAt(0);
    return 'ABCDE'.indexOf(first) >= 0 ? first : null;
  }

  /* ── FORMAT ──────────────────────────────────────────────────── */

  function fmtNum(n, dec) {
    dec = dec == null ? 1 : dec;
    return parseFloat(n || 0).toLocaleString('tr-TR', {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });
  }

  function fmtInt(n) {
    return parseInt(n || 0, 10).toLocaleString('tr-TR');
  }

  /* ── PROCESS DATA ────────────────────────────────────────────── */

  function processData(incidents, flightRows, spiRows) {
    incidents  = incidents  || [];
    flightRows = flightRows || [];
    spiRows    = spiRows    || [];

    /* ── Flight map ── */
    var flightMap = {};
    flightRows.forEach(function (r) {
      var loc = getFlightLoc(r);
      var cnt = getFlightCount(r);
      if (loc && cnt > 0) flightMap[loc] = (flightMap[loc] || 0) + cnt;
    });

    /* ── SPI map ── */
    var spiMap = {};
    spiRows.forEach(function (r) {
      /* SPI;SPI Sayısı;Title;SPI_Class */
      var code = s(pick(r, ['SPI','SPI_Code','Code','code']) || byIndex(r, 0));
      if (!code) return;
      var title = pick(r, ['Title','title','Açıklama','Description']) || byIndex(r, 2) || code;
      var cls   = pick(r, ['SPI_Class','SPI Class','Class','class']) || byIndex(r, 3) || '';
      spiMap[code] = { title: title, cls: cls };
    });

    /* ── Normalize incidents ──
       Key fix: getIncidentLoc ONLY reads Loc column with strict 3-letter IATA validation.
       This prevents fleet codes, city names, model names etc from becoming stations. */
    var rows = incidents.map(function (r) {
      var loc = getIncidentLoc(r);

      var riskScore = parseNumber(pick(r, ['RiskScore','Risk_Score','riskScore']));
      var lscore    = parseNumber(pick(r, ['likelihoodScore','LikelihoodScore']));
      var sscore    = parseNumber(pick(r, ['severityScore','SeverityScore']));
      if (!riskScore && lscore && sscore) riskScore = lscore * sscore;

      var riskLevel = parseRiskLevel(pick(r, ['Risk_Level','RiskLevel','Risk Level'])) ||
                      getRiskCat(riskScore);

      var nonSPIRaw = s(pick(r, ['NonSPI','Non_SPI'])).toLowerCase();
      var isNonSPI  = ['true','1','yes','evet','nonspi'].indexOf(nonSPIRaw) >= 0;

      var spi1 = s(pick(r, ['SPI_1','SPI1','SPI 1']));
      var spi2 = s(pick(r, ['SPI_2','SPI2','SPI 2']));
      var spiTags = [];
      if (!isNonSPI) {
        if (spi1 && spiMap[spi1] && spiTags.indexOf(spi1) < 0) spiTags.push(spi1);
        if (spi2 && spiMap[spi2] && spiTags.indexOf(spi2) < 0) spiTags.push(spi2);
      }

      return {
        loc:       loc,
        occNo:     getOccNo(r),
        repNo:     pick(r, ['Report_Number','Report Number']),
        repType:   pick(r, ['Report_Type','Report_type','Report Type']),
        dept:      pick(r, ['Department']),
        status:    pick(r, ['Status']),
        date:      s(row['MC_Date'] || ''),
        year:      normalizeYear(r),
        yearMonth: normalizeYearMonth(r),
        region:    cleanRegion(pick(r, ['Bölge','Bolge','Region'])),
        subRegion: pick(r, ['Alt Bölge','Alt_Bolge','Sub Region']),
        fleet:     pick(r, ['Fleet']),
        model:     pick(r, ['Model']),
        likelihood:      pick(r, ['likelihood','Likelihood']),
        likelihoodScore: lscore,
        severity:        pick(r, ['severity','Severity']),
        severityScore:   sscore,
        riskLevel:  riskLevel,
        riskScore:  riskScore,
        nonSPI:     isNonSPI,
        spiTags:    spiTags,
        opPhase:    pick(r, ['Operational_Phase','Operational Phase']),
      };
    }).filter(function (r) { return !!r.loc; });

    /* ── Station grouping ── */
    var stMap = {};
    rows.forEach(function (r) {
      if (!stMap[r.loc]) stMap[r.loc] = { loc: r.loc, incidents: [] };
      stMap[r.loc].incidents.push(r);
    });

    var stations = Object.values(stMap).map(function (st) {
      var incs      = st.incidents;
      var totalRisk = incs.reduce(function (acc, i) { return acc + Number(i.riskScore || 0); }, 0);
      var flights   = flightMap[st.loc] || 0;
      var composite = flights > 0
        ? totalRisk / flights * 100
        : (incs.length ? totalRisk / incs.length : 0);
      var catCounts = { A:0, B:0, C:0, D:0, E:0 };
      incs.forEach(function (i) { if (catCounts[i.riskLevel] != null) catCounts[i.riskLevel]++; });
      return {
        loc:       st.loc,
        incidents: incs,
        count:     countUnique(incs),
        rowCount:  incs.length,
        totalRisk: totalRisk,
        flights:   flights,
        composite: composite,
        compLevel: getRiskCat(composite),
        catCounts: catCounts,
        highSev:   (catCounts.A || 0) + (catCounts.B || 0)
      };
    });

    stations.sort(function (a, b) { return a.loc.localeCompare(b.loc); });

    /* Debug */
    console.log('[SRD] raw:', incidents.length,
      '| normalized:', rows.length,
      '| unique occ:', countUnique(rows),
      '| stations:', stations.length,
      '| flights:', Object.keys(flightMap).length);

    var dropped = incidents.length - rows.length;
    if (dropped > 0) {
      console.warn('[SRD] Dropped ' + dropped + ' rows (no valid Loc). Samples:');
      incidents.filter(function(r){ return !getIncidentLoc(r); })
        .slice(0,5).forEach(function(r){
          console.warn('  Loc=[' + r['Loc'] + '] Fleet=[' + r['Fleet'] + '] Model=[' + r['Model'] + ']');
        });
    }

    return { rows: rows, stations: stations, flightMap: flightMap, spiMap: spiMap };
  }

  /* ── KPIs ────────────────────────────────────────────────────── */

  function calcKPIs(rows, stations) {
    rows = rows || []; stations = stations || [];
    return {
      totalInc:    countUnique(rows),
      totalFlight: stations.reduce(function (acc, st) { return acc + Number(st.flights || 0); }, 0),
      avgRisk:     rows.length
        ? rows.reduce(function (acc, r) { return acc + Number(r.riskScore || 0); }, 0) / rows.length
        : 0,
      stCount: stations.length
    };
  }

  /* ── FILTER ──────────────────────────────────────────────────── */

  function applyFilters(allRows, allStations, filters) {
    allRows = allRows || []; allStations = allStations || []; filters = filters || {};

    var rows = allRows.filter(function (r) {
      if (filters.year    && r.year      !== filters.year)         return false;
      if (filters.month   && r.yearMonth !== filters.month)        return false;
      if (filters.station && r.loc       !== filters.station)      return false;
      if (filters.dept    && r.dept      !== filters.dept)         return false;
      if (filters.fleet   && r.fleet     !== filters.fleet)        return false;
      if (filters.rtype   && r.repType   !== filters.rtype)        return false;
      if (filters.region  && r.region    !== filters.region)       return false;
      if (filters.sev     && r.riskLevel !== filters.sev)          return false;
      if (filters.status  && r.status    !== filters.status)       return false;
      if (filters.spi     && r.spiTags.indexOf(filters.spi) < 0)  return false;
      return true;
    });

    var stMap = {};
    rows.forEach(function (r) {
      if (!stMap[r.loc]) stMap[r.loc] = { loc: r.loc, incidents: [] };
      stMap[r.loc].incidents.push(r);
    });

    var stations = Object.values(stMap).map(function (st) {
      var incs      = st.incidents;
      var totalRisk = incs.reduce(function (acc, i) { return acc + Number(i.riskScore || 0); }, 0);
      var origSt    = allStations.find(function (x) { return x.loc === st.loc; });
      var flights   = origSt ? Number(origSt.flights || 0) : 0;
      var composite = flights > 0
        ? totalRisk / flights * 100
        : (incs.length ? totalRisk / incs.length : 0);
      var catCounts = { A:0, B:0, C:0, D:0, E:0 };
      incs.forEach(function (i) { if (catCounts[i.riskLevel] != null) catCounts[i.riskLevel]++; });
      return {
        loc:       st.loc,
        incidents: incs,
        count:     countUnique(incs),
        rowCount:  incs.length,
        totalRisk: totalRisk,
        flights:   flights,
        composite: composite,
        compLevel: getRiskCat(composite),
        catCounts: catCounts,
        highSev:   (catCounts.A || 0) + (catCounts.B || 0)
      };
    });
    stations.sort(function (a, b) { return a.loc.localeCompare(b.loc); });
    return { rows: rows, stations: stations };
  }

  /* ── DONUT DATASETS ──────────────────────────────────────────── */

  function buildDonutSets(rows, spiMap) {
    rows = rows || []; spiMap = spiMap || {};
    var PALETTE = ['#e05555','#d98a35','#c0a030','#38b272','#4294cc',
                   '#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316'];

    var sev = { A:0, B:0, C:0, D:0, E:0 };
    rows.forEach(function (r) { if (sev[r.riskLevel] != null) sev[r.riskLevel]++; });

    var spiClassMap = {}, fleetMap = {};
    rows.forEach(function (r) {
      var tags = r.spiTags && r.spiTags.length ? r.spiTags : [];
      tags.forEach(function (tag) {
        var cls = (spiMap[tag] && spiMap[tag].cls) ? spiMap[tag].cls : tag;
        spiClassMap[cls] = (spiClassMap[cls] || 0) + 1;
      });
      if (r.nonSPI || !tags.length) spiClassMap['NonSPI'] = (spiClassMap['NonSPI'] || 0) + 1;
      if (r.fleet) fleetMap[r.fleet] = (fleetMap[r.fleet] || 0) + 1;
    });

    function toSet(map, colors) {
      var keys = Object.keys(map).sort(function (a,b) { return map[b]-map[a]; });
      return {
        labels: keys,
        data:   keys.map(function(k){ return map[k]; }),
        colors: keys.map(function(_,i){ return colors[i % colors.length]; })
      };
    }

    return {
      sev: {
        labels: ['A — Critical','B — High','C — Medium','D — Low','E — Very Low'],
        data:   [sev.A, sev.B, sev.C, sev.D, sev.E],
        colors: [SEV_COLOR.A, SEV_COLOR.B, SEV_COLOR.C, SEV_COLOR.D, SEV_COLOR.E]
      },
      spi:   toSet(spiClassMap, PALETTE),
      fleet: toSet(fleetMap,    PALETTE)
    };
  }

  /* ── UNIQUE ──────────────────────────────────────────────────── */

  function uniq(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (v) { if (v && !seen[v]) { seen[v]=1; out.push(v); } });
    return out;
  }

  return {
    loadCSV: loadCSV, parseCSV: parseCSV,
    processData: processData, calcKPIs: calcKPIs,
    applyFilters: applyFilters, buildDonutSets: buildDonutSets,
    uniq: uniq, fmtNum: fmtNum, fmtInt: fmtInt,
    SEV_COLOR: SEV_COLOR, SEV_BG: SEV_BG
  };

})();