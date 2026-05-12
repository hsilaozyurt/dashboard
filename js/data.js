/* ================================================================
   data.js — Excel / CSV data loading, processing, risk calculations

   EXCEL-FIRST VERSION

   Main incident Excel:
   - Year              -> MC_Year
   - Month/Year        -> MC_Year_Month
   - Full date         -> MC_Date
   - Report type       -> Report_Type
   - Station / IATA    -> Loc only
   - Region            -> Bölge only
   - Occurrence count  -> unique Occurrence_No
   - Incident SPI      -> SPI_1 and SPI_2 only

   SPI Excel:
   - SPI code          -> SPI
   - SPI title         -> Title
   - SPI class         -> SPI_Class

   Flight Excel:
   - Station           -> Loc
   - Flight count      -> Uçuş Sayısı / 2nd column fallback

   Important:
   - Fake/empty Loc records are NOT deleted.
   - Fake/empty Loc records are included in KPIs, filters, SPI, trend.
   - Fake/empty Loc records are skipped only in station-based calculations.
   ================================================================ */

var SRD = SRD || {};

SRD.DATA = (function () {

  /* ── EXCEL LOADER ───────────────────────────────────────────── */

  function loadExcel(path, sheetName) {
    if (typeof XLSX === 'undefined') {
      throw new Error('XLSX library is not loaded. Add SheetJS script to index.html.');
    }

    return fetch(path)
      .then(function (resp) {
        if (!resp.ok) throw new Error('Failed to load Excel file: ' + path);
        return resp.arrayBuffer();
      })
      .then(function (buffer) {
        var workbook = XLSX.read(buffer, {
          type: 'array',
          cellDates: true
        });

        var targetSheet = sheetName || workbook.SheetNames[0];
        var sheet = workbook.Sheets[targetSheet];

        if (!sheet) {
          throw new Error('Sheet not found: ' + targetSheet + ' in ' + path);
        }

        return XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          raw: false,
          dateNF: 'dd.mm.yyyy'
        });
      });
  }

  /* ── CSV LOADER: fallback olarak kalıyor ─────────────────────── */

  function detectDelimiter(firstLine) {
    var commaCount = (firstLine.match(/,/g) || []).length;
    var semiCount  = (firstLine.match(/;/g) || []).length;
    return semiCount > commaCount ? ';' : ',';
  }

  function splitCSVRecords(text) {
    var records = [];
    var cur = '';
    var inQ = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var next = text[i + 1];

      if (ch === '"' && inQ && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = !inQ;
      } else if ((ch === '\n' || ch === '\r') && !inQ) {
        if (cur.trim()) records.push(cur);
        cur = '';
        if (ch === '\r' && next === '\n') i++;
      } else {
        cur += ch;
      }
    }

    if (cur.trim()) records.push(cur);
    return records;
  }

  function splitCSVLine(line, delim) {
    var cols = [];
    var cur = '';
    var inQ = false;

    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      var next = line[i + 1];

      if (ch === '"' && inQ && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = !inQ;
      } else if (ch === delim && !inQ) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }

    cols.push(cur.trim());
    return cols;
  }

  function makeUniqueHeaders(headers) {
    var seen = {};

    return headers.map(function (h) {
      h = String(h || '').replace(/^\uFEFF/, '').trim() || 'EMPTY';

      if (!seen[h]) {
        seen[h] = 1;
        return h;
      }

      seen[h]++;
      return h + '_' + seen[h];
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

      headers.forEach(function (h, i) {
        obj[h] = (cols[i] || '').trim();
      });

      return obj;
    }).filter(function (row) {
      return Object.values(row).some(function (v) {
        return String(v || '').trim() !== '';
      });
    });
  }

  function loadCSV(path) {
    return fetch(path)
      .then(function (resp) {
        if (!resp.ok) throw new Error('Failed to load CSV file: ' + path);
        return resp.text();
      })
      .then(parseCSV);
  }

  /* ── BASIC HELPERS ──────────────────────────────────────────── */

  function str(v) {
    if (v instanceof Date) {
      var dd = String(v.getDate()).padStart(2, '0');
      var mm = String(v.getMonth() + 1).padStart(2, '0');
      var yyyy = v.getFullYear();
      return dd + '.' + mm + '.' + yyyy;
    }

    return String(v || '').trim();
  }

  function pick(row, names) {
    for (var i = 0; i < names.length; i++) {
      var v = str(row[names[i]]);
      if (v) return v;
    }

    return '';
  }

  function byIndex(row, idx) {
    var key = Object.keys(row || {})[idx];
    return key ? str(row[key]) : '';
  }

  function parseNumber(value) {
    var v = str(value).replace(/\s/g, '');

    if (!v) return 0;

    if (v.indexOf(',') >= 0 && v.indexOf('.') >= 0) {
      v = v.replace(/\./g, '').replace(',', '.');
    } else if (v.indexOf(',') >= 0) {
      v = v.replace(',', '.');
    }

    v = v.replace(/[^0-9.\-]/g, '');

    return parseFloat(v) || 0;
  }

  /* ── STATION / LOC ──────────────────────────────────────────── */

  function cleanStation(value) {
    /*
      Station/IATA must come only from Loc.
      We accept only 3-letter alphabetic station codes.
      Fake values like 2026, 32, 1BLGE, 3E become empty string.
    */
    var raw = str(value).toUpperCase();

    if (!raw) return '';

    raw = raw.replace(/[^A-Z]/g, '');

    return raw.length === 3 ? raw : '';
  }

  function getIncidentLoc(row) {
    /*
      Incident station comes ONLY from Loc.
      No fallback to Location, Departure_Point, Destination_Point.
    */
    return cleanStation(row['Loc'] || row['LOC'] || row['loc'] || '');
  }

  function getFlightLoc(row) {
    /*
      Flight Excel station comes from Loc.
      If header is unexpected, use first column fallback.
    */
    return cleanStation(
      pick(row, ['Loc', 'LOC', 'loc', 'IATA', 'Station', 'Airport']) ||
      byIndex(row, 0)
    );
  }

  function getFlightCount(row) {
    /*
      Flight Excel:
      Loc + Uçuş Sayısı.
      If header is unexpected, use 2nd column fallback.
    */
    var v = pick(row, [
      'Uçuş Sayısı',
      'Ucus Sayisi',
      'Ucus_sayisi',
      'Uçuş_Sayısı',
      'Flight Count',
      'Flight_Count',
      'flight_count',
      'Flights',
      'flights',
      'Count',
      'count',
      'Sayı',
      'Sayi',
      'Adet'
    ]) || byIndex(row, 1);

    return parseNumber(v);
  }

  /* ── OCCURRENCE ─────────────────────────────────────────────── */

  function getOccNo(row) {
    return str(row['Occurrence_No'] || '');
  }

  function countUnique(rows) {
    var seen = {};
    var count = 0;

    (rows || []).forEach(function (row, i) {
      var key = str(row.occNo) || ('ROW_' + i);

      if (!seen[key]) {
        seen[key] = 1;
        count++;
      }
    });

    return count;
  }

  /* ── REGION ─────────────────────────────────────────────────── */

  function cleanRegion(value) {
    /*
      Region comes ONLY from Bölge.
      Allowed outputs:
      - 1.Bölge
      - 2.Bölge
      - -
    */
    var raw = str(value).replace(/\s+/g, ' ');

    if (!raw) return '';
    if (raw === '-') return '-';

    raw = raw
      .replace(/BOLGE/gi, 'Bölge')
      .replace(/BÖLGE/gi, 'Bölge');

    var m = raw.match(/^([0-9]+)\s*\.?\s*(Bölge|Bolge|bölge|bolge)$/i);

    return m ? m[1] + '.Bölge' : '';
  }

  /* ── DATE HELPERS ───────────────────────────────────────────── */

  function normalizeYear(row) {
    /*
      Year comes ONLY from MC_Year.
    */
    var y = str(row['MC_Year'] || '');

    return /^[0-9]{4}$/.test(y) ? y : '';
  }

  function normalizeYearMonth(row) {
    /*
      Month filter comes ONLY from MC_Year_Month.
      Supported:
      - 01.2026 -> 2026-01
      - 2026-01 -> 2026-01
      - 2026.01 -> 2026-01
    */
    var ym = str(row['MC_Year_Month'] || '');

    if (!ym) return '';

    var m1 = ym.match(/^([0-9]{1,2})[.\-\/]([0-9]{4})$/);
    if (m1) return m1[2] + '-' + m1[1].padStart(2, '0');

    var m2 = ym.match(/^([0-9]{4})[.\-\/]([0-9]{1,2})$/);
    if (m2) return m2[1] + '-' + m2[2].padStart(2, '0');

    if (/^[0-9]{4}-[0-9]{2}$/.test(ym)) return ym;

    return '';
  }

  function getDate(row) {
    /*
      Full date comes ONLY from first MC_Date column.
      Duplicate MC_Date_2 is ignored.
    */
    return str(row['MC_Date'] || '');
  }

  /* ── SPI HELPERS ────────────────────────────────────────────── */

  function normalizeSpiCode(value) {
    var raw = str(value);

    if (!raw) return '';

    raw = raw.replace(',', '.');

    /*
      Examples:
      6.7
      6,7
      6.7 - text
      SPI 6.7
    */
    var match = raw.match(/[0-9]+(?:\.[0-9]+)?/);

    return match ? match[0] : raw;
  }

  function extractSpiTags(value, spiMap) {
    var raw = str(value);

    if (!raw) return [];

    raw = raw.replace(/,/g, '.');

    var matches = raw.match(/[0-9]+(?:\.[0-9]+)?/g) || [];
    var tags = [];

    matches.forEach(function (code) {
      if (spiMap[code] && tags.indexOf(code) < 0) {
        tags.push(code);
      }
    });

    var direct = normalizeSpiCode(raw);

    if (direct && spiMap[direct] && tags.indexOf(direct) < 0) {
      tags.push(direct);
    }

    return tags;
  }

  /* ── RISK ───────────────────────────────────────────────────── */

  var SEV_COLOR = {
    A: '#e05555',
    B: '#d98a35',
    C: '#c0a030',
    D: '#38b272',
    E: '#4294cc'
  };

  var SEV_BG = {
    A: 'rgba(224,85,85,.13)',
    B: 'rgba(217,138,53,.13)',
    C: 'rgba(192,160,48,.13)',
    D: 'rgba(56,178,114,.13)',
    E: 'rgba(66,148,204,.13)'
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
    var first = str(raw).toUpperCase().charAt(0);

    return 'ABCDE'.indexOf(first) >= 0 ? first : null;
  }

  /* ── FORMAT ─────────────────────────────────────────────────── */

  function fmtNum(n, dec) {
    dec = dec == null ? 1 : dec;

    return parseFloat(n || 0).toLocaleString('tr-TR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }

  function fmtInt(n) {
    return parseInt(n || 0, 10).toLocaleString('tr-TR');
  }

  /* ── PROCESS DATA ───────────────────────────────────────────── */

  function processData(incidents, flightRows, spiRows) {
    incidents  = incidents  || [];
    flightRows = flightRows || [];
    spiRows    = spiRows    || [];

    /* Flight map */
    var flightMap = {};

    flightRows.forEach(function (row) {
      var loc = getFlightLoc(row);
      var cnt = getFlightCount(row);

      if (loc && cnt > 0) {
        flightMap[loc] = (flightMap[loc] || 0) + cnt;
      }
    });

    /* SPI map */
    var spiMap = {};

    spiRows.forEach(function (row) {
      /*
        SPI Excel:
        SPI | SPI Sayısı | Title | SPI_Class
      */
      var code = normalizeSpiCode(
        pick(row, ['SPI', 'SPI_Code', 'Code', 'code']) ||
        byIndex(row, 0)
      );

      if (!code) return;

      var title =
        pick(row, ['Title', 'title', 'Açıklama', 'Description']) ||
        byIndex(row, 2) ||
        code;

      var cls =
        pick(row, ['SPI_Class', 'SPI Class', 'Class', 'class']) ||
        byIndex(row, 3) ||
        '';

      spiMap[code] = {
        title: title,
        cls: cls
      };
    });

    /* Normalize incidents */
    var rows = incidents.map(function (inc, index) {
      var loc = getIncidentLoc(inc);

      var riskScore = parseNumber(pick(inc, [
        'RiskScore',
        'Risk_Score',
        'riskScore'
      ]));

      var lscore = parseNumber(pick(inc, [
        'likelihoodScore',
        'LikelihoodScore'
      ]));

      var sscore = parseNumber(pick(inc, [
        'severityScore',
        'SeverityScore'
      ]));

      if (!riskScore && lscore && sscore) {
        riskScore = lscore * sscore;
      }

      var riskLevel =
        parseRiskLevel(pick(inc, ['Risk_Level', 'RiskLevel', 'Risk Level'])) ||
        getRiskCat(riskScore);

      var nonSPIRaw = str(pick(inc, ['NonSPI', 'Non_SPI'])).toLowerCase();

      var isNonSPI =
        ['true', '1', 'yes', 'evet', 'nonspi'].indexOf(nonSPIRaw) >= 0;

      var spiRaw1 = inc['SPI_1'] || '';
      var spiRaw2 = inc['SPI_2'] || '';

      var spiTags = [];

      /*
        Incident SPI relation comes ONLY from SPI_1 and SPI_2.
        The main SPI column is intentionally ignored.
      */
      if (!isNonSPI) {
        extractSpiTags(spiRaw1, spiMap).forEach(function (code) {
          if (spiTags.indexOf(code) < 0) spiTags.push(code);
        });

        extractSpiTags(spiRaw2, spiMap).forEach(function (code) {
          if (spiTags.indexOf(code) < 0) spiTags.push(code);
        });
      }

      return {
        loc: loc,

        occNo: getOccNo(inc) || ('ROW_' + index),
        repNo: str(inc['Report_Number'] || ''),
        repType: str(inc['Report_Type'] || ''),
        dept: str(inc['Department'] || ''),
        status: str(inc['Status'] || ''),

        date: getDate(inc),
        year: normalizeYear(inc),
        yearMonth: normalizeYearMonth(inc),

        region: cleanRegion(inc['Bölge']),
        subRegion: str(inc['Alt Bölge'] || ''),

        fleet: str(inc['Fleet'] || ''),
        model: str(inc['Model'] || ''),

        likelihood: str(inc['likelihood'] || ''),
        likelihoodScore: lscore,
        severity: str(inc['severity'] || ''),
        severityScore: sscore,

        riskLevel: riskLevel,
        riskScore: riskScore,

        nonSPI: isNonSPI,
        spiTags: spiTags,

        opPhase: str(inc['Operational_Phase'] || '')
      };
    });

    /*
      IMPORTANT:
      Do NOT filter out records with empty loc.
      Empty/fake Loc records are included in:
      - total recorded events
      - year/month filters
      - region filters
      - SPI analysis
      - trend chart

      They are skipped only in station grouping below.
    */

    /* Station grouping */
    var stMap = {};

    rows.forEach(function (row) {
      if (!row.loc) return;

      if (!stMap[row.loc]) {
        stMap[row.loc] = {
          loc: row.loc,
          incidents: []
        };
      }

      stMap[row.loc].incidents.push(row);
    });

    var stations = Object.values(stMap).map(function (st) {
      var incs = st.incidents;

      var totalRisk = incs.reduce(function (acc, inc) {
        return acc + Number(inc.riskScore || 0);
      }, 0);

      var flights = flightMap[st.loc] || 0;

      var composite = flights > 0
        ? totalRisk / flights * 100
        : (incs.length ? totalRisk / incs.length : 0);

      var catCounts = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        E: 0
      };

      incs.forEach(function (inc) {
        if (catCounts[inc.riskLevel] != null) {
          catCounts[inc.riskLevel]++;
        }
      });

      return {
        loc: st.loc,
        incidents: incs,
        count: countUnique(incs),
        rowCount: incs.length,
        totalRisk: totalRisk,
        flights: flights,
        composite: composite,
        compLevel: getRiskCat(composite),
        catCounts: catCounts,
        highSev: (catCounts.A || 0) + (catCounts.B || 0)
      };
    });

    stations.sort(function (a, b) {
      return a.loc.localeCompare(b.loc);
    });

    console.log(
      '[SRD] raw:', incidents.length,
      '| normalized:', rows.length,
      '| unique:', countUnique(rows),
      '| stationRows:', stations.reduce(function (acc, s) { return acc + s.rowCount; }, 0),
      '| stations:', stations.length,
      '| flightLocs:', Object.keys(flightMap).length,
      '| spiCodes:', Object.keys(spiMap).length
    );

    return {
      rows: rows,
      stations: stations,
      flightMap: flightMap,
      spiMap: spiMap
    };
  }

  /* ── KPIs ───────────────────────────────────────────────────── */

  function calcKPIs(rows, stations) {
    rows = rows || [];
    stations = stations || [];

    return {
      totalInc: countUnique(rows),

      totalFlight: stations.reduce(function (acc, st) {
        return acc + Number(st.flights || 0);
      }, 0),

      avgRisk: rows.length
        ? rows.reduce(function (acc, row) {
            return acc + Number(row.riskScore || 0);
          }, 0) / rows.length
        : 0,

      stCount: stations.length
    };
  }

  /* ── FILTER ─────────────────────────────────────────────────── */

  function applyFilters(allRows, allStations, filters) {
    allRows = allRows || [];
    allStations = allStations || [];
    filters = filters || {};

    var rows = allRows.filter(function (row) {
      if (filters.year    && row.year      !== filters.year)    return false;
      if (filters.month   && row.yearMonth !== filters.month)   return false;
      if (filters.station && row.loc       !== filters.station) return false;
      if (filters.dept    && row.dept      !== filters.dept)    return false;
      if (filters.fleet   && row.fleet     !== filters.fleet)   return false;
      if (filters.rtype   && row.repType   !== filters.rtype)   return false;
      if (filters.region  && row.region    !== filters.region)  return false;
      if (filters.sev     && row.riskLevel !== filters.sev)     return false;
      if (filters.status  && row.status    !== filters.status)  return false;
      if (filters.spi     && row.spiTags.indexOf(filters.spi) < 0) return false;

      return true;
    });

    var stMap = {};

    rows.forEach(function (row) {
      if (!row.loc) return;

      if (!stMap[row.loc]) {
        stMap[row.loc] = {
          loc: row.loc,
          incidents: []
        };
      }

      stMap[row.loc].incidents.push(row);
    });

    var stations = Object.values(stMap).map(function (st) {
      var incs = st.incidents;

      var totalRisk = incs.reduce(function (acc, inc) {
        return acc + Number(inc.riskScore || 0);
      }, 0);

      var origSt = allStations.find(function (x) {
        return x.loc === st.loc;
      });

      var flights = origSt ? Number(origSt.flights || 0) : 0;

      var composite = flights > 0
        ? totalRisk / flights * 100
        : (incs.length ? totalRisk / incs.length : 0);

      var catCounts = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        E: 0
      };

      incs.forEach(function (inc) {
        if (catCounts[inc.riskLevel] != null) {
          catCounts[inc.riskLevel]++;
        }
      });

      return {
        loc: st.loc,
        incidents: incs,
        count: countUnique(incs),
        rowCount: incs.length,
        totalRisk: totalRisk,
        flights: flights,
        composite: composite,
        compLevel: getRiskCat(composite),
        catCounts: catCounts,
        highSev: (catCounts.A || 0) + (catCounts.B || 0)
      };
    });

    stations.sort(function (a, b) {
      return a.loc.localeCompare(b.loc);
    });

    return {
      rows: rows,
      stations: stations
    };
  }

  /* ── DONUT DATASETS ─────────────────────────────────────────── */

  function buildDonutSets(rows, spiMap) {
    rows = rows || [];
    spiMap = spiMap || {};

    var PALETTE = [
      '#e05555',
      '#d98a35',
      '#c0a030',
      '#38b272',
      '#4294cc',
      '#8b5cf6',
      '#06b6d4',
      '#ec4899',
      '#84cc16',
      '#f97316'
    ];

    var sev = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0
    };

    rows.forEach(function (row) {
      if (sev[row.riskLevel] != null) {
        sev[row.riskLevel]++;
      }
    });

    var spiClassMap = {};
    var fleetMap = {};

    rows.forEach(function (row) {
      var tags = row.spiTags && row.spiTags.length ? row.spiTags : [];

      tags.forEach(function (tag) {
        var cls = (spiMap[tag] && spiMap[tag].cls)
          ? spiMap[tag].cls
          : tag;

        spiClassMap[cls] = (spiClassMap[cls] || 0) + 1;
      });

      if (row.nonSPI || !tags.length) {
        spiClassMap.NonSPI = (spiClassMap.NonSPI || 0) + 1;
      }

      if (row.fleet) {
        fleetMap[row.fleet] = (fleetMap[row.fleet] || 0) + 1;
      }
    });

    function toSet(map, colors) {
      var keys = Object.keys(map).sort(function (a, b) {
        return map[b] - map[a];
      });

      return {
        labels: keys,
        data: keys.map(function (k) {
          return map[k];
        }),
        colors: keys.map(function (_, i) {
          return colors[i % colors.length];
        })
      };
    }

    return {
      sev: {
        labels: [
          'A — Critical',
          'B — High',
          'C — Medium',
          'D — Low',
          'E — Very Low'
        ],
        data: [sev.A, sev.B, sev.C, sev.D, sev.E],
        colors: [
          SEV_COLOR.A,
          SEV_COLOR.B,
          SEV_COLOR.C,
          SEV_COLOR.D,
          SEV_COLOR.E
        ]
      },

      spi: toSet(spiClassMap, PALETTE),
      fleet: toSet(fleetMap, PALETTE)
    };
  }

  /* ── UNIQUE ─────────────────────────────────────────────────── */

  function uniq(arr) {
    var seen = {};
    var out = [];

    (arr || []).forEach(function (v) {
      if (v && !seen[v]) {
        seen[v] = 1;
        out.push(v);
      }
    });

    return out;
  }

  return {
    loadExcel: loadExcel,
    loadCSV: loadCSV,
    parseCSV: parseCSV,
    processData: processData,
    calcKPIs: calcKPIs,
    applyFilters: applyFilters,
    buildDonutSets: buildDonutSets,
    uniq: uniq,
    fmtNum: fmtNum,
    fmtInt: fmtInt,
    SEV_COLOR: SEV_COLOR,
    SEV_BG: SEV_BG
  };

})();