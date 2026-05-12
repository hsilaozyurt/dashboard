/* ================================================================
   data.js — CSV parser, data processing, risk calculations
   Final corrected version:
   - Robust CSV parser for comma / semicolon files
   - Handles quoted multiline CSV records
   - Uses Loc as station code
   - Filters fake station values such as 2026, 32, 1BLGE
   - Region filter only uses Bölge / Bolge / Region fields
   - Incident SPI relation uses only SPI_1 and SPI_2
   - SPI names/classes come from SPI_kategorileri.csv
   - Total recorded events calculated from unique Occurrence_No
   - Supports filters.station for dashboard station filter
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
    var records = [];
    var cur = '';
    var inQ = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var next = text[i + 1];

      if (ch === '"' && inQ && next === '"') {
        cur += '""';
        i++;
      } else if (ch === '"') {
        inQ = !inQ;
        cur += ch;
      } else if ((ch === '\n' || ch === '\r') && !inQ) {
        if (cur.trim() !== '') records.push(cur);
        cur = '';

        if (ch === '\r' && next === '\n') i++;
      } else {
        cur += ch;
      }
    }

    if (cur.trim() !== '') records.push(cur);

    return records;
  }

  function splitCSVLine(line, delimiter) {
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
      } else if (ch === delimiter && !inQ) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }

    cols.push(cur.trim());

    return cols;
  }

  function normalizeHeaderName(h) {
    return String(h || '')
      .replace(/^\uFEFF/, '')
      .trim();
  }

  function makeUniqueHeaders(headers) {
    var seen = {};

    return headers.map(function (h) {
      h = normalizeHeaderName(h);

      if (!h) h = 'EMPTY';

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

    var delimiter = detectDelimiter(records[0]);
    var headers = makeUniqueHeaders(splitCSVLine(records[0], delimiter));

    return records.slice(1).map(function (record) {
      var cols = splitCSVLine(record, delimiter);
      var obj = {};

      headers.forEach(function (h, i) {
        obj[h] = (cols[i] || '').trim();
      });

      return obj;
    }).filter(function (r) {
      return Object.values(r).some(function (v) {
        return String(v || '').trim() !== '';
      });
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

  /* ── HELPERS ────────────────────────────────────────────────── */

  function pick(row, names) {
    for (var i = 0; i < names.length; i++) {
      var key = names[i];

      if (row[key] !== undefined && row[key] !== null) {
        var val = String(row[key]).trim();

        if (val !== '') return val;
      }
    }

    return '';
  }

  function getByIndex(row, index) {
    var keys = Object.keys(row || {});
    var key = keys[index];

    if (!key) return '';

    return String(row[key] || '').trim();
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function normalizeSpiCode(value) {
    return String(value || '').trim();
  }

  function parseNumber(value) {
    if (value === undefined || value === null) return 0;

    var s = String(value)
      .trim()
      .replace(/\s/g, '');

    if (!s) return 0;

    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.indexOf(',') >= 0) {
      s = s.replace(',', '.');
    }

    s = s.replace(/[^0-9.\-]/g, '');

    return parseFloat(s) || 0;
  }

  function cleanStationCode(value) {
    var raw = normalizeText(value);

    if (!raw) return '';

    raw = raw.toUpperCase().trim();

    /*
      Fake station values:
      2026, 32, 6559, 1BLGE, 2BLGE, Bölge values etc.
    */
    if (/^[0-9]+$/.test(raw)) return '';
    if (/^[0-9]+BLGE$/.test(raw)) return '';
    if (/BOLGE|BÖLGE|BLGE/.test(raw)) return '';

    /*
      Long descriptions cannot be station codes.
    */
    if (raw.length > 8) return '';

    raw = raw.replace(/[^A-Z0-9]/g, '');

    /*
      Real station/IATA-like values are usually 3 letters.
      2-character values like 3E are rejected to prevent false stations.
    */
    if (raw.length < 3 || raw.length > 5) return '';

    if (!/[A-Z]/.test(raw)) return '';

    return raw;
  }

  function cleanRegion(value) {
    var raw = normalizeText(value);

    if (!raw) return '';

    raw = raw
      .replace(/\s+/g, ' ')
      .replace(/BOLGE/gi, 'Bölge')
      .replace(/BÖLGE/gi, 'Bölge')
      .trim();

    if (raw === '-') return '-';

    /*
      Only values like 1.Bölge, 2.Bölge, 1. Bölge are valid.
      IATA codes must not appear in region filter.
    */
    var m = raw.match(/^([0-9]+)\s*\.?\s*(Bölge|Bolge)$/i);

    if (m) {
      return m[1] + '.Bölge';
    }

    return '';
  }

  function getIncidentLoc(row, validLocs) {
    var candidates = [
      pick(row, ['Loc', 'LOC', 'loc']),
      pick(row, ['IATA', 'IATA_Code', 'IATA Code', 'Station', 'Station_Code', 'Station Code']),
      pick(row, ['Departure_Point', 'Departure Point']),
      pick(row, ['Destination_Point', 'Destination Point']),
      pick(row, ['Location'])
    ];

    for (var i = 0; i < candidates.length; i++) {
      var loc = cleanStationCode(candidates[i]);

      if (!loc) continue;

      /*
        If validLocs exists, accept only stations from flight CSV.
        This blocks fake values such as 2026, 32, 1BLGE.
      */
      if (validLocs && Object.keys(validLocs).length > 0) {
        if (validLocs[loc]) return loc;
      } else {
        return loc;
      }
    }

    return '';
  }

  function getFlightLoc(row) {
    return (
      cleanStationCode(pick(row, [
        'Loc',
        'LOC',
        'loc',
        'IATA',
        'IATA Code',
        'IATA_Code',
        'Station',
        'Station Code',
        'Station_Code',
        'İstasyon',
        'Istasyon',
        'İstasyon Kodu',
        'Istasyon Kodu',
        'Airport',
        'Airport Code',
        'Airport_Code'
      ])) ||
      cleanStationCode(getByIndex(row, 0))
    );
  }

  function getFlightCount(row) {
    var val = pick(row, [
      'Uçuş Sayısı',
      'Ucus Sayisi',
      'Ucus_sayisi',
      'Ucus Sayısı',
      'Uçuş_Sayısı',
      'Flight Count',
      'Flight_Count',
      'flight_count',
      'Flights',
      'flights',
      'Total Flights',
      'Total_Flights',
      'Count',
      'count',
      'Sayı',
      'Sayi',
      'Adet',
      'U�u? Say?s?',
      'U?u? Say?s?',
      'Uçu? Say?s?',
      'U�uş Sayısı',
      'UÃ§uÅŸ SayÄ±sÄ±'
    ]);

    /*
      Ucus_sayilari.csv:
      0: Loc
      1: Uçuş Sayısı
    */
    if (!val) val = getByIndex(row, 1);

    return parseNumber(val);
  }

  function getOccurrenceNo(row) {
    return normalizeText(pick(row, [
      'Occurrence_No',
      'Occurence_No',
      'Occurrence No',
      'Occurence No',
      'OccurrenceNo',
      'OccurenceNo',
      'OCCURRENCE_NO',
      'Occ No',
      'OccNo'
    ]));
  }

  function countUniqueOccurrences(rows) {
    var seen = {};
    var count = 0;

    (rows || []).forEach(function (r, index) {
      var key = normalizeText(r.occNo);

      if (!key) {
        key = 'ROW_' + index + '_' + normalizeText(r.repNo || '');
      }

      if (!seen[key]) {
        seen[key] = 1;
        count++;
      }
    });

    return count;
  }

  /* ── RISK MATRIX ─────────────────────────────────────────────── */

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

  function getRiskCategory(score) {
    score = Number(score || 0);

    if (score >= 80) return 'A';
    if (score >= 45) return 'B';
    if (score >= 22) return 'C';
    if (score >= 10) return 'D';

    return 'E';
  }

  function parseRiskLevel(raw) {
    var r = normalizeText(raw).toUpperCase();

    if (!r) return null;

    var first = r.charAt(0);

    return 'ABCDE'.indexOf(first) >= 0 ? first : null;
  }

  function normalizeYear(row) {
    var y = normalizeText(pick(row, ['MC_Year', 'Year', 'year']));

    if (/^[0-9]{4}$/.test(y)) return y;

    var ym = normalizeText(pick(row, ['MC_Year_Month', 'Year_Month', 'yearMonth']));

    var m1 = ym.match(/^([0-9]{4})/);
    if (m1) return m1[1];

    var d = normalizeText(pick(row, ['MC_Date', 'MC_Date_2', 'Date', 'date']));

    var m2 = d.match(/([0-9]{4})/);
    if (m2) return m2[1];

    return '';
  }

  function normalizeYearMonth(row) {
    var ym = normalizeText(pick(row, ['MC_Year_Month', 'Year_Month', 'yearMonth']));

    if (ym) return ym;

    var d = normalizeText(pick(row, ['MC_Date', 'MC_Date_2', 'Date', 'date']));

    /*
      Supports formats:
      2026-01-15
      15.01.2026
      01/15/2026
    */
    var m1 = d.match(/^([0-9]{4})[-/.]([0-9]{1,2})/);
    if (m1) return m1[1] + '-' + String(m1[2]).padStart(2, '0');

    var m2 = d.match(/^([0-9]{1,2})[-/.]([0-9]{1,2})[-/.]([0-9]{4})/);
    if (m2) return m2[3] + '-' + String(m2[2]).padStart(2, '0');

    return '';
  }

  /* ── FORMAT ──────────────────────────────────────────────────── */

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

  /* ── PROCESS DATA ────────────────────────────────────────────── */

  function processData(incidents, flightRows, spiRows) {
    incidents  = incidents || [];
    flightRows = flightRows || [];
    spiRows    = spiRows || [];

    /* ── FLIGHT MAP / VALID STATIONS ──────────────────────────── */

    var flightMap = {};

    flightRows.forEach(function (r) {
      var loc = getFlightLoc(r);
      var cnt = getFlightCount(r);

      if (!loc) return;

      flightMap[loc] = (flightMap[loc] || 0) + cnt;
    });

    var validLocs = {};

    Object.keys(flightMap).forEach(function (loc) {
      if (loc) validLocs[loc] = true;
    });

    /* ── SPI MAP ──────────────────────────────────────────────── */

    var spiMap = {};

    spiRows.forEach(function (r) {
      /*
        SPI CSV:
        0: SPI
        1: SPI Sayısı
        2: Title
        3: SPI_Class
      */
      var code = normalizeSpiCode(
        pick(r, ['SPI', 'SPI_Code', 'SPI Code', 'Code', 'code']) ||
        getByIndex(r, 0)
      );

      if (!code) return;

      var title =
        pick(r, ['title', 'Title', 'SPI_Title', 'SPI Title', 'Açıklama', 'Aciklama', 'Description']) ||
        getByIndex(r, 2) ||
        code;

      var cls =
        pick(r, ['SPI_Class', 'SPI Class', 'Class', 'class', 'Sınıf', 'Sinif']) ||
        getByIndex(r, 3) ||
        '';

      spiMap[code] = {
        title: title,
        cls: cls
      };
    });

    /* ── NORMALIZE INCIDENTS ──────────────────────────────────── */

    var rejectedLocSamples = {};
    var rows = incidents.map(function (r) {
      var loc = getIncidentLoc(r, validLocs);

      if (!loc) {
        var rawLoc = pick(r, ['Loc', 'LOC', 'loc', 'Location']);
        if (rawLoc && Object.keys(rejectedLocSamples).length < 20) {
          rejectedLocSamples[rawLoc] = true;
        }
      }

      var riskScore = parseNumber(pick(r, [
        'RiskScore',
        'Risk_Score',
        'Risk Score',
        'riskScore',
        'risk_score'
      ]));

      var likelihoodScore = parseNumber(pick(r, [
        'likelihoodScore',
        'LikelihoodScore',
        'Likelihood_Score',
        'Likelihood Score'
      ]));

      var severityScore = parseNumber(pick(r, [
        'severityScore',
        'SeverityScore',
        'Severity_Score',
        'Severity Score'
      ]));

      if (!riskScore && likelihoodScore && severityScore) {
        riskScore = likelihoodScore * severityScore;
      }

      var riskLevel =
        parseRiskLevel(pick(r, ['Risk_Level', 'RiskLevel', 'Risk Level', 'riskLevel'])) ||
        getRiskCategory(riskScore);

      var nonSPI = normalizeText(pick(r, ['NonSPI', 'Non_SPI', 'Non SPI'])).toLowerCase();

      var isNonSPI =
        nonSPI === 'true' ||
        nonSPI === '1' ||
        nonSPI === 'yes' ||
        nonSPI === 'evet' ||
        nonSPI === 'nonspi';

      var spi1 = normalizeSpiCode(pick(r, ['SPI_1', 'SPI1', 'SPI 1']));
      var spi2 = normalizeSpiCode(pick(r, ['SPI_2', 'SPI2', 'SPI 2']));

      var spiTags = [];

      /*
        Do NOT use incident CSV's "SPI" column.
        Real incident-SPI relation must come only from SPI_1 and SPI_2.
        Only SPI codes existing in SPI CSV are accepted.
      */
      if (!isNonSPI) {
        if (spi1 && spiMap[spi1] && spiTags.indexOf(spi1) < 0) {
          spiTags.push(spi1);
        }

        if (spi2 && spiMap[spi2] && spiTags.indexOf(spi2) < 0) {
          spiTags.push(spi2);
        }
      }

      return {
        loc: loc,

        occNo: getOccurrenceNo(r),
        repNo: pick(r, ['Report_Number', 'Report Number']),
        repType: pick(r, ['Report_Type', 'Report_type', 'Report Type']),
        dept: pick(r, ['Department']),
        status: pick(r, ['Status']),

        descript: pick(r, ['Descript', 'Description', 'Description_of_damage']),
        result: pick(r, ['Result']),

        date: pick(r, ['MC_Date', 'MC_Date_2']),
        year: normalizeYear(r),
        yearMonth: normalizeYearMonth(r),

        originator: pick(r, ['Originator']),
        owner: pick(r, ['OccurrenceOwner', 'Owner_1']),

        locationRaw: pick(r, ['Location']),
        region: cleanRegion(pick(r, ['Bölge', 'Bolge', 'Region'])),
        subRegion: pick(r, ['Alt Bölge', 'Alt_Bolge', 'Sub Region', 'SubRegion']),

        flightNo: pick(r, ['Flight_Number', 'Flight Number']),
        depPoint: pick(r, ['Departure_Point', 'Departure Point']),
        destPoint: pick(r, ['Destination_Point', 'Destination Point']),

        registration: pick(r, ['Registration_Mark', 'Registration Mark']),
        model: pick(r, ['Model']),
        fleet: pick(r, ['Fleet']),

        likelihood: pick(r, ['likelihood', 'Likelihood']),
        likelihoodScore: likelihoodScore,
        severity: pick(r, ['severity', 'Severity']),
        severityScore: severityScore,

        riskLevel: riskLevel,
        riskScore: riskScore,

        nonSPI: isNonSPI,
        spiTags: spiTags,

        opPhase: pick(r, ['Operational_Phase', 'Operational Phase']),
        effectOnFlight: pick(r, ['effect_on_flight', 'Effect_on_flight', 'Effect on flight'])
      };
    }).filter(function (r) {
      return !!r.loc;
    });

    /* ── STATION GROUPING ─────────────────────────────────────── */

    var stMap = {};

    rows.forEach(function (r) {
      if (!stMap[r.loc]) {
        stMap[r.loc] = {
          loc: r.loc,
          incidents: []
        };
      }

      stMap[r.loc].incidents.push(r);
    });

    var stations = Object.values(stMap).map(function (st) {
      var incs = st.incidents;

      var totalRisk = incs.reduce(function (sum, item) {
        return sum + Number(item.riskScore || 0);
      }, 0);

      var flights = flightMap[st.loc] || 0;

      var composite = flights > 0
        ? (totalRisk / flights * 100)
        : (incs.length ? totalRisk / incs.length : 0);

      var catCounts = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        E: 0
      };

      incs.forEach(function (i) {
        if (catCounts[i.riskLevel] != null) {
          catCounts[i.riskLevel]++;
        }
      });

      return {
        loc: st.loc,
        incidents: incs,
        count: countUniqueOccurrences(incs),
        rowCount: incs.length,
        totalRisk: totalRisk,
        flights: flights,
        composite: composite,
        compLevel: getRiskCategory(composite),
        catCounts: catCounts,
        highSev: (catCounts.A || 0) + (catCounts.B || 0)
      };
    });

    stations.sort(function (a, b) {
      return a.loc.localeCompare(b.loc);
    });

    console.log('[SRD DATA] raw incident rows:', incidents.length);
    console.log('[SRD DATA] normalized incident rows:', rows.length);
    console.log('[SRD DATA] unique occurrences:', countUniqueOccurrences(rows));
    console.log('[SRD DATA] stations:', stations.length);
    console.log('[SRD DATA] valid station locs:', Object.keys(validLocs));
    console.log('[SRD DATA] rejected loc samples:', Object.keys(rejectedLocSamples));
    console.log('[SRD DATA] flightMap:', flightMap);
    console.log('[SRD DATA] spiMap:', spiMap);

    return {
      rows: rows,
      stations: stations,
      flightMap: flightMap,
      spiMap: spiMap,
      validLocs: validLocs
    };
  }

  /* ── KPIs ────────────────────────────────────────────────────── */

  function calcKPIs(rows, stations) {
    rows = rows || [];
    stations = stations || [];

    var totalInc = countUniqueOccurrences(rows);

    var totalFlight = stations.reduce(function (sum, st) {
      return sum + Number(st.flights || 0);
    }, 0);

    var avgRisk = rows.length
      ? rows.reduce(function (sum, r) {
          return sum + Number(r.riskScore || 0);
        }, 0) / rows.length
      : 0;

    var stCount = stations.length;

    return {
      totalInc: totalInc,
      totalFlight: totalFlight,
      avgRisk: avgRisk,
      stCount: stCount
    };
  }

  /* ── FILTER ──────────────────────────────────────────────────── */

  function applyFilters(allRows, allStations, filters) {
    allRows = allRows || [];
    allStations = allStations || [];
    filters = filters || {};

    var rows = allRows.filter(function (r) {
      if (filters.year    && r.year      !== filters.year)       return false;
      if (filters.month   && r.yearMonth !== filters.month)      return false;
      if (filters.station && r.loc       !== filters.station)    return false;
      if (filters.dept    && r.dept      !== filters.dept)       return false;
      if (filters.fleet   && r.fleet     !== filters.fleet)      return false;
      if (filters.rtype   && r.repType   !== filters.rtype)      return false;
      if (filters.region  && r.region    !== filters.region)     return false;
      if (filters.sev     && r.riskLevel !== filters.sev)        return false;
      if (filters.status  && r.status    !== filters.status)     return false;
      if (filters.spi     && r.spiTags.indexOf(filters.spi) < 0) return false;

      return true;
    });

    var stMap = {};

    rows.forEach(function (r) {
      if (!stMap[r.loc]) {
        stMap[r.loc] = {
          loc: r.loc,
          incidents: []
        };
      }

      stMap[r.loc].incidents.push(r);
    });

    var stations = Object.values(stMap).map(function (st) {
      var incs = st.incidents;

      var totalRisk = incs.reduce(function (sum, item) {
        return sum + Number(item.riskScore || 0);
      }, 0);

      var origSt = allStations.find(function (s) {
        return s.loc === st.loc;
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

      incs.forEach(function (i) {
        if (catCounts[i.riskLevel] != null) {
          catCounts[i.riskLevel]++;
        }
      });

      return {
        loc: st.loc,
        incidents: incs,
        count: countUniqueOccurrences(incs),
        rowCount: incs.length,
        totalRisk: totalRisk,
        flights: flights,
        composite: composite,
        compLevel: getRiskCategory(composite),
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

  /* ── DONUT DATASETS ──────────────────────────────────────────── */

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

    rows.forEach(function (r) {
      if (sev[r.riskLevel] != null) {
        sev[r.riskLevel]++;
      }
    });

    var spiClassMap = {};

    rows.forEach(function (r) {
      var tags = r.spiTags && r.spiTags.length ? r.spiTags : [];

      tags.forEach(function (tag) {
        var info = spiMap[tag] || {};
        var cls = info.cls || tag;

        spiClassMap[cls] = (spiClassMap[cls] || 0) + 1;
      });

      if (r.nonSPI || !tags.length) {
        spiClassMap.NonSPI = (spiClassMap.NonSPI || 0) + 1;
      }
    });

    var fleetMap = {};

    rows.forEach(function (r) {
      if (r.fleet) {
        fleetMap[r.fleet] = (fleetMap[r.fleet] || 0) + 1;
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

  /* ── UNIQUE ──────────────────────────────────────────────────── */

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
    loadCSV: loadCSV,
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