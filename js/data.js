/* ================================================================
   data.js — CSV parser, data processing, risk calculations
   Revised version:
   - Safer CSV parser
   - Handles comma / semicolon separated files
   - Handles duplicate headers
   - Prevents description text from becoming station code
   - Reads Loc column correctly from All_Station_Info.csv
   - More flexible flight count mapping
   ================================================================ */

var SRD = SRD || {};

SRD.DATA = (function () {

  /* ── CSV PARSER ──────────────────────────────────────────────── */

  function detectDelimiter(firstLine) {
    var commaCount = (firstLine.match(/,/g) || []).length;
    var semiCount  = (firstLine.match(/;/g) || []).length;

    return semiCount > commaCount ? ';' : ',';
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

    text = String(text).replace(/\r/g, '').trim();

    if (!text) return [];

    var lines = text.split('\n').filter(function (line) {
      return String(line || '').trim() !== '';
    });

    if (lines.length < 2) return [];

    var delimiter = detectDelimiter(lines[0]);

    var headers = makeUniqueHeaders(splitCSVLine(lines[0], delimiter));

    return lines.slice(1).map(function (line) {
      var cols = splitCSVLine(line, delimiter);
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

        if (val !== '') {
          return val;
        }
      }
    }

    return '';
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function parseNumber(value) {
    if (value === undefined || value === null) return 0;

    var s = String(value)
      .trim()
      .replace(/\s/g, '');

    if (!s) return 0;

    /*
      Handles:
      1234
      1,234
      1.234
      1234,56
      1234.56
    */
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

    raw = raw.toUpperCase();

    /*
      Eğer alan uzun açıklama gibi geldiyse istasyon kodu olarak kullanma.
      Örnek: "AFTER PARKING 32 POSITION..."
    */
    if (raw.length > 8) return '';

    /*
      Sadece istasyon kodu gibi duran değerleri kabul et.
      ACC, ADB, IST, SAW, 3E gibi kısa kodlar olabilir.
    */
    raw = raw.replace(/[^A-Z0-9]/g, '');

    if (raw.length < 2 || raw.length > 5) return '';

    return raw;
  }

  function getIncidentLoc(row) {
    /*
      Senin All_Station_Info.csv header'ına göre ana kolon:
      Loc

      Location da var ama bazı dosyalarda metinsel lokasyon/yer adı olabilir.
      Bu yüzden Loc en önde.
    */
    return (
      cleanStationCode(pick(row, ['Loc', 'LOC', 'loc'])) ||
      cleanStationCode(pick(row, ['IATA', 'IATA_Code', 'IATA Code', 'Station', 'Station_Code', 'Station Code'])) ||
      cleanStationCode(pick(row, ['Departure_Point', 'Departure Point'])) ||
      cleanStationCode(pick(row, ['Destination_Point', 'Destination Point'])) ||
      cleanStationCode(pick(row, ['Location']))
    );
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
      ]))
    );
  }

  function getFlightCount(row) {
    return parseNumber(pick(row, [
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
      'Adet'
    ]));
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

    /* ── FLIGHT MAP ───────────────────────────────────────────── */

    var flightMap = {};

    flightRows.forEach(function (r) {
      var loc = getFlightLoc(r);
      var cnt = getFlightCount(r);

      if (!loc) return;

      flightMap[loc] = (flightMap[loc] || 0) + cnt;
    });

    /* ── SPI MAP ──────────────────────────────────────────────── */

    var spiMap = {};

    spiRows.forEach(function (r) {
      var code = normalizeText(pick(r, [
        'SPI',
        'SPI_Code',
        'SPI Code',
        'Code',
        'code'
      ]));

      if (!code) return;

      spiMap[code] = {
        title: pick(r, [
          'title',
          'Title',
          'SPI_Title',
          'SPI Title',
          'Açıklama',
          'Aciklama',
          'Description'
        ]) || code,

        cls: pick(r, [
          'SPI_Class',
          'SPI Class',
          'Class',
          'class',
          'Sınıf',
          'Sinif'
        ]) || ''
      };
    });

    /* ── NORMALIZE INCIDENTS ──────────────────────────────────── */

    var rows = incidents.map(function (r) {
      var loc = getIncidentLoc(r);

      var riskScore = parseNumber(pick(r, [
        'RiskScore',
        'Risk_Score',
        'Risk Score',
        'riskScore',
        'risk_score'
      ]));

      /*
        Eğer RiskScore boşsa likelihoodScore × severityScore üzerinden hesapla.
      */
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
        parseRiskLevel(pick(r, [
          'Risk_Level',
          'RiskLevel',
          'Risk Level',
          'riskLevel'
        ])) || getRiskCategory(riskScore);

      var nonSPI = normalizeText(pick(r, [
        'NonSPI',
        'Non_SPI',
        'Non SPI'
      ])).toLowerCase();

      var isNonSPI =
        nonSPI === 'true' ||
        nonSPI === '1' ||
        nonSPI === 'yes' ||
        nonSPI === 'evet' ||
        nonSPI === 'nonspi';

      var spi1 = normalizeText(pick(r, ['SPI_1', 'SPI1', 'SPI 1']));
      var spi2 = normalizeText(pick(r, ['SPI_2', 'SPI2', 'SPI 2']));
      var spiMain = normalizeText(pick(r, ['SPI']));

      var spiTags = [];

      if (!isNonSPI) {
        if (spiMain) spiTags.push(spiMain);
        if (spi1 && spiTags.indexOf(spi1) < 0) spiTags.push(spi1);
        if (spi2 && spiTags.indexOf(spi2) < 0) spiTags.push(spi2);
      }

      return {
        loc:       loc,

        occNo:     pick(r, ['Occurrence_No', 'Occurence_No', 'Occurrence No', 'Occ No']),
        repNo:     pick(r, ['Report_Number', 'Report Number']),
        repType:   pick(r, ['Report_Type', 'Report_type', 'Report Type']),
        dept:      pick(r, ['Department']),
        status:    pick(r, ['Status']),

        descript:  pick(r, ['Descript', 'Description', 'Description_of_damage']),
        result:    pick(r, ['Result']),

        date:      pick(r, ['MC_Date', 'MC_Date_2']),
        year:      pick(r, ['MC_Year']),
        yearMonth: pick(r, ['MC_Year_Month']),

        originator: pick(r, ['Originator']),
        owner:      pick(r, ['OccurrenceOwner', 'Owner_1']),

        locationRaw: pick(r, ['Location']),
        region:    pick(r, ['Bölge', 'Bolge', 'Region']),
        subRegion: pick(r, ['Alt Bölge', 'Alt_Bolge', 'Sub Region', 'SubRegion']),

        flightNo:  pick(r, ['Flight_Number', 'Flight Number']),
        depPoint:  pick(r, ['Departure_Point', 'Departure Point']),
        destPoint: pick(r, ['Destination_Point', 'Destination Point']),

        registration: pick(r, ['Registration_Mark', 'Registration Mark']),
        model:        pick(r, ['Model']),
        fleet:        pick(r, ['Fleet']),

        likelihood:      pick(r, ['likelihood', 'Likelihood']),
        likelihoodScore: likelihoodScore,
        severity:        pick(r, ['severity', 'Severity']),
        severityScore:   severityScore,

        riskLevel: riskLevel,
        riskScore: riskScore,

        nonSPI:  isNonSPI,
        spiTags: spiTags,

        opPhase: pick(r, ['Operational_Phase', 'Operational Phase']),
        effectOnFlight: pick(r, ['effect_on_flight', 'Effect_on_flight', 'Effect on flight'])
      };
    }).filter(function (r) {
      /*
        Loc yoksa bu satırı istasyon hesaplamasına alma.
        Böylece açıklama metinleri istasyon gibi görünmez.
      */
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

      /*
        Uçuş sayısı yoksa composite'i ortalama risk olarak gösteriyoruz.
        Uçuş sayısı varsa gerçek normalize skor:
        (Σ RiskScore / Flights) × 100
      */
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
        count: incs.length,
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

    console.log('[SRD DATA] incidents raw:', incidents.length);
    console.log('[SRD DATA] incidents normalized:', rows.length);
    console.log('[SRD DATA] stations:', stations.length);
    console.log('[SRD DATA] flight rows:', flightRows.length);
    console.log('[SRD DATA] flightMap:', flightMap);

    return {
      rows: rows,
      stations: stations,
      flightMap: flightMap,
      spiMap: spiMap
    };
  }

  /* ── KPIs ────────────────────────────────────────────────────── */

  function calcKPIs(rows, stations) {
    rows = rows || [];
    stations = stations || [];

    var totalInc = rows.length;

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
      if (filters.year   && r.year      !== filters.year)      return false;
      if (filters.month  && r.yearMonth !== filters.month)     return false;
      if (filters.dept   && r.dept      !== filters.dept)      return false;
      if (filters.fleet  && r.fleet     !== filters.fleet)     return false;
      if (filters.rtype  && r.repType   !== filters.rtype)     return false;
      if (filters.region && r.region    !== filters.region)    return false;
      if (filters.sev    && r.riskLevel !== filters.sev)       return false;
      if (filters.status && r.status    !== filters.status)    return false;
      if (filters.spi    && r.spiTags.indexOf(filters.spi) < 0) return false;

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
        count: incs.length,
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
        var cls = spiMap[tag] && spiMap[tag].cls
          ? spiMap[tag].cls
          : tag;

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