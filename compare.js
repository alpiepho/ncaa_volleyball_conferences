/* compare.js: viewer settings and every settings-dependent rule for the generic
 * site (REFACTOR_COMPARE.md §3, §5, §6), plus the viewer's saved schools and
 * their plain-text list (SAVE_SCHOOLS.md §4, §6). Copied to site2026/compare.js by
 * tools/build_site.py; loaded after site2026/data/schools.js (window.SITE_DATA).
 *
 * The build holds no player data (D8). Everything here that used to come from a
 * profile comes from the viewer's settings:
 *   {v, school: <Massey team name> | null, position: "S" | "OH" | ..., majors: "<text>",
 *    home: {city, state, lat, lon} | null, updated}
 *
 * Ported from the retired profile builder (build_reports.py: resolve_cost,
 * cost_flag, programs_for, program_lines, flag_cols, build_school). After any
 * change here run tools/check_compare.py, which checks these rules against the
 * answers frozen from that Python in tools/site/compare_fixtures.json.
 */
(function (root) {
  "use strict";

  var KEY = "ncaaCompare.v1";
  var HASH = "s=";

  var POSITIONS = [
    ["S", "Setter"], ["OH", "Outside Hitter"], ["OPP", "Opposite"],
    ["MB", "Middle Blocker"], ["L", "Libero / DS"]
  ];
  // §3 generic defaults for the settings that have no field yet
  var DEFAULTS = {
    weights: { academics: 0.25, athletics: 0.30, facilities: 0.15, culture: 0.20, afford: 0.10 },
    budget: { goodAtOrBelow: 15000, watchAtOrBelow: 43000, homeStatePublicAlwaysGood: true }
  };
  var WICHE = ["AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NV", "NM", "ND", "OR", "SD", "UT", "WA", "WY", "GU", "MP"];
  var STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", DC: "D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii",
    ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
    LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
    MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
    NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
    PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico"
  };
  var SENIOR = ["Sr", "Gr", "5th", "R-Sr", "R-Gr"];

  // §5 step 1: shorthand -> CIP codes. Keys are lowercase, spaces collapsed.
  var ALIASES = {
    "biomed": ["14.0501", "14.4501"], "biomedical": ["14.0501", "14.4501"],
    "bme": ["14.0501", "14.4501"], "bio/biomedical engineering": ["14.0501", "14.4501"],
    "me": ["14.1901"], "mech e": ["14.1901"], "mech eng": ["14.1901"], "mech. eng.": ["14.1901"],
    "mechanical": ["14.1901"],
    "ee": ["14.1001"], "ece": ["14.4701"], "ce": ["14.0801"], "civil": ["14.0801"],
    "cs": ["11.0701"], "comp sci": ["11.0701"], "computer science": ["11.0701"],
    "nursing": ["51.3801"], "rn": ["51.3801"], "bsn": ["51.3801"],
    "psych": ["42.0101"], "psychology": ["42.0101"],
    "business": ["52.0101", "52.0201"], "accounting": ["52.0301"], "finance": ["52.0801"],
    "kinesiology": ["31.0505", "26.0908", "31.0501"], "kines": ["31.0505", "26.0908", "31.0501"],
    "exercise science": ["31.0505", "26.0908"],
    "biology": ["26.0101"], "bio": ["26.0101"], "chemistry": ["40.0501"], "math": ["27.0101"],
    "physics": ["40.0801"], "economics": ["45.0601"], "econ": ["45.0601"]
  };

  function D() {
    if (!root.SITE_DATA) throw new Error("compare.js: load data/schools.js first");
    return root.SITE_DATA;
  }

  // ------------------------------------------------------------ settings
  function blank() {
    return { v: 1, school: null, position: "S", majors: "", home: null, updated: null };
  }

  function clean(s) {
    var out = blank();
    if (!s || typeof s !== "object") return out;
    if (typeof s.school === "string" && s.school) out.school = s.school;
    if (POSITIONS.some(function (p) { return p[0] === s.position; })) out.position = s.position;
    if (typeof s.majors === "string") out.majors = s.majors;
    var h = s.home;
    if (h && typeof h.city === "string" && typeof h.state === "string" && isFinite(h.lat) && isFinite(h.lon)) {
      out.home = { city: h.city, state: h.state, lat: +h.lat, lon: +h.lon };
    }
    if (s.updated) out.updated = String(s.updated);
    return out;
  }

  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64decode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    return decodeURIComponent(escape(atob(str)));
  }

  function fromHash(hash) {
    var h = hash === undefined ? (root.location ? root.location.hash : "") : hash;
    var m = /[#&]s=([A-Za-z0-9_-]+)/.exec(h || "");
    if (!m) return null;
    try { return clean(JSON.parse(b64decode(m[1]))); } catch (e) { return null; }
  }

  function hashFor(settings) {
    var s = clean(settings);
    delete s.updated;
    return "#" + HASH + b64encode(JSON.stringify(s));
  }

  // href with the settings carried in its hash (§3 origin caveat)
  function withSettings(href, settings) {
    return href.split("#")[0] + hashFor(settings || load());
  }

  var storageOk = null;
  function storage() {
    try {
      var ls = root.localStorage;
      ls.setItem(KEY + ".probe", "1");
      ls.removeItem(KEY + ".probe");
      storageOk = true;
      return ls;
    } catch (e) {
      storageOk = false;
      return null;
    }
  }

  // hash first, then storage, then defaults. A hash also refreshes storage, so a
  // shared link becomes this browser's settings.
  function load() {
    var h = fromHash();
    if (h) {
      save(h);
      // drop the consumed hash so a reload after editing elsewhere doesn't
      // bring the link's (older) settings back
      try {
        var loc = root.location, rest = loc.hash.replace(/(^#|&)s=[A-Za-z0-9_-]+/, "").replace(/^&/, "");
        root.history.replaceState(null, "", loc.pathname + loc.search + (rest && rest !== "#" ? "#" + rest.replace(/^#/, "") : ""));
      } catch (e) { /* file:// in some browsers, or no history API */ }
      return h;
    }
    var ls = storage();
    if (ls) {
      try { var raw = ls.getItem(KEY); if (raw) return clean(JSON.parse(raw)); } catch (e) { /* fall through */ }
    }
    return blank();
  }

  function save(settings) {
    var s = clean(settings);
    s.updated = new Date().toISOString();
    var ls = storage();
    if (ls) { try { ls.setItem(KEY, JSON.stringify(s)); } catch (e) { storageOk = false; } }
    return s;
  }

  function reset() {
    var ls = storage();
    if (ls) { try { ls.removeItem(KEY); } catch (e) { /* ignore */ } }
    return blank();
  }

  // ------------------------------------------------------------ majors (§5)
  var usedCips = null;
  function offeredSomewhere() {
    if (!usedCips) {
      usedCips = {};
      var ip = D().ipeds;
      Object.keys(ip).forEach(function (id) {
        Object.keys(ip[id].programs).forEach(function (c) { usedCips[c] = true; });
      });
    }
    return usedCips;
  }

  function norm(t) { return t.toLowerCase().replace(/\s+/g, " ").trim(); }

  function matchTerm(term) {
    var names = D().cipNames, used = offeredSomewhere();
    var key = norm(term), how = null, cips = [];
    if (!key) return null;
    if (ALIASES[key]) { cips = ALIASES[key].slice(); how = "alias"; }
    if (!cips.length && /^\d{2}\.\d{4}$/.test(key) && names[key]) { cips = [key]; how = "code"; }
    if (!cips.length) {
      Object.keys(names).forEach(function (c) { if (used[c] && norm(names[c]) === key) cips.push(c); });
      if (cips.length) how = "exact";
    }
    if (!cips.length) {
      // every term word starts some word of the title
      // split on any punctuation, so abbreviations like "Mechanical Eng." still match
      var words = key.split(/[^a-z0-9]+/).filter(function (w) { return w && w !== "and" && w !== "of"; });
      Object.keys(names).forEach(function (c) {
        if (!used[c]) return;
        var tw = norm(names[c]).split(/[^a-z0-9]+/);
        if (words.length && words.every(function (w) { return tw.some(function (x) { return x.indexOf(w) === 0; }); })) cips.push(c);
      });
      if (cips.length) how = "words";
    }
    cips.sort();
    return {
      term: term.trim(), how: how, cips: cips,
      titles: cips.map(function (c) { return names[c] || c; })
    };
  }

  // "Mechanical Engineering, Biomedical" -> [{key, label, term, how, cips, titles}];
  // terms with no match are kept with cips: [] so the editor can show them in red
  function matchMajors(text) {
    var seen = {};
    return (text || "").split(",").map(function (t) { return t.trim(); }).filter(function (t) {
      var k = norm(t);
      if (!k || seen[k]) return false;
      seen[k] = true;
      return true;
    }).map(function (t, i) {
      var m = matchTerm(t);
      m.key = "m" + i;
      m.label = m.term;
      return m;
    });
  }

  function activeMajors(majors) { return majors.filter(function (m) { return m.cips.length; }); }

  // ------------------------------------------------------------ schools
  function team(masseyName) { return D().teams[masseyName] || null; }

  // One record shape for researched and unresearched schools. Unresearched
  // fields are null so pages show "—" (D12).
  function schoolRecord(ref) {
    var d = D(), r = null, t = null, tname = null;
    if (d.researched[ref]) { r = d.researched[ref]; tname = r.masseyName; t = d.teams[tname]; }
    else if (d.teams[ref]) { tname = ref; t = d.teams[ref]; if (t.researched) r = d.researched[t.researched]; }
    else return null;
    var ip = t.ipedsId ? d.ipeds[String(t.ipedsId)] : null;
    var loc = t.campus || ip || {};
    var tuitionType = r ? r.tuitionType : inferTuitionType(t, ip);
    return {
      id: r ? r.id : "t-" + tname.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      masseyName: tname, researched: !!r,
      name: r ? r.name : t.name,
      division: t.division, masseyConf: t.conf, confSlug: r ? r.confSlug : null,
      region: r ? r.region : null, tuitionType: tuitionType, costNote: r ? r.costNote || null : null,
      niche: r ? r.niche : null, earnings: r ? r.earnings : null,
      // "scorecard": federal College Scorecard median 5 years after completion (Niche no longer shows earnings)
      earningsSource: r && r.earnings != null ? (r.earningsSource || "niche") : null,
      natRank: r ? r.natRank : t.rank, confRank: r ? r.confRank : null,
      // a hand-entered branch campus has no IPEDS locale of its own; leave it blank
      ipeds: { city: loc.city || null, state: loc.state || null, locale: t.campus ? (t.campus.locale || "") : (ip ? ip.locale : ""),
               lat: loc.lat, lon: loc.lon, zip: t.campus ? null : (ip ? ip.zip || null : null) },
      tuitionInState: ip ? ip.tuitionInState : null, tuitionOutOfState: ip ? ip.tuitionOutOfState : null,
      // books, food and housing, other expenses (IPEDS, same year as tuition): {parts, basis "on"|"off",
      // estimated: [part indexes from the state median], from}; null if IPEDS has no cost row
      living: ip && ip.living ? ip.living : null,
      programs: ip ? ip.programs : {},
      offenseNote: r ? r.offenseNote : null, coachStaff: r ? r.coachStaff : null,
      femaleCoachOnStaff: r ? r.femaleCoachOnStaff : null, aiaChapter: r ? r.aiaChapter : null,
      fcaChapter: r ? (r.fcaChapter === undefined ? null : r.fcaChapter) : null,
      beach: r ? (r.beach === undefined ? null : r.beach) : null,
      // every roster setter, most assists first (falls back to the older setter/secondSetter/thirdSetter)
      setters: r ? settersOf(r) : [],
      setter: r ? settersOf(r)[0] || null : null,
      // every rostered player with position groups and season stats (OTHER_POSITIONS.md)
      players: r && Array.isArray(r.players) ? r.players : [],
      links: r ? r.links : { niche: t.niche },
      // nearest NOAA stations (tools/build_site.py build_climate); null without a location
      climate: t.climate || null,
      // school spirit from home attendance (SPIRIT_PLAN.md); null if not researched or not pulled yet
      spirit: r ? spiritOf(r.id) : null,
      undergrads: ip ? ip.undergrads || null : null
    };
  }

  function settersOf(r) {
    if (Array.isArray(r.setters)) return r.setters;
    return [r.setter, r.secondSetter, r.thirdSetter].filter(Boolean);
  }

  function inferTuitionType(t, ip) {
    if (!ip) return null;
    if (/^United States .*Academy/.test(ip.name)) return "academy";
    if (ip.control !== 1) return "private";
    return ip.tuitionInState != null && ip.tuitionInState === ip.tuitionOutOfState ? "flat" : "public";
  }

  // ------------------------------------------------------------ cost (§4.1, D9)
  function join(items) {
    items = items.slice();
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(", ") + (items.length > 2 ? ", and " : " and ") + items[items.length - 1];
  }

  var IPEDS_BASIS = "2024-25 tuition + fees per IPEDS";

  // -> {cost, basis, kind, footnotes}. cost is null when IPEDS has no tuition.
  function resolveCost(s, settings, majors) {
    majors = activeMajors(majors || matchMajors(settings.majors));
    var res = settings.home ? settings.home.state : null;
    var tt = s.tuitionType;
    var out = function (cost, basis, kind, notes) { return { cost: cost, basis: basis, kind: kind, footnotes: notes || [] }; };
    if (tt === "academy") return out(0, s.costNote || "Service academy: no tuition, with a service commitment", "academy");
    if (tt === "private") return out(s.tuitionOutOfState, "Private (flat) — sticker price before any athletic or merit aid · " + IPEDS_BASIS, "private");
    if (tt === "flat") return out(s.tuitionOutOfState, "Flat tuition — same rate for in-state and out-of-state students · " + IPEDS_BASIS, "flat");
    if (tt === null) return out(null, "No IPEDS tuition data for this school", "unknown");
    var st = s.ipeds.state;
    if (!res) return out(s.tuitionOutOfState, "Out-of-state — set a home town for in-state/WUE rates · " + IPEDS_BASIS, "oos");
    if (st === res) return out(s.tuitionInState, "In-state (home state, " + res + ") · " + IPEDS_BASIS, "instate");

    var w = D().wue[s.name], reason;
    if (WICHE.indexOf(res) < 0) reason = res + " isn't a WICHE member state, so WUE never applies";
    else if (WICHE.indexOf(st) < 0) reason = (STATE_NAMES[st] || st) + " isn't a WICHE member state, so WUE never applies";
    else if (!s.researched && !w) reason = "WUE status not checked for this school";
    else if (!w || !w.participates) reason = "not a WUE-participating school" + (w && w.note ? " (" + w.note + ")" : "");
    else if (w.transfers === false) reason = "its WUE program excludes transfer students";
    else {
      var list = w.majors === undefined ? "all" : w.majors;
      var bits = ["transfers eligible" + (w.transfers === "specific" ? " for specific majors" : "")];
      var notes = [];
      if (list === "all") bits.push("all majors");
      else if (!majors.length) reason = "its WUE program covers only specific majors; enter a major to check";
      else {
        // D9: any listed major covered -> WUE rate; the rest are footnoted
        var status = majors.map(function (m) {
          var v = m.cips.map(function (c) { return list[c] === undefined ? "unchecked" : list[c]; });
          return v.indexOf(true) >= 0 ? true : v.indexOf("unconfirmed") >= 0 ? "unconfirmed"
               : v.indexOf("unchecked") >= 0 ? "unchecked" : false;
        });
        // a major WICHE's list was never checked for doesn't unlock WUE on its own
        var pick = function (v) { return majors.filter(function (m, i) { return status[i] === v; }).map(function (m) { return m.label; }); };
        var yes = majors.filter(function (m, i) { return status[i] === true; });
        var maybe = majors.filter(function (m, i) { return status[i] === "unconfirmed"; });
        if (!yes.length && !maybe.length) {
          var no = pick(false), unk = pick("unchecked");
          reason = (no.length ? "its WUE program doesn't cover " + join(no) : "its WUE program covers only specific majors")
                 + (unk.length ? "; " + join(unk) + " not checked against its WUE list" : "");
        } else {
          if (yes.length) bits.push(join(yes.map(function (m) { return m.label; })) + (yes.length > 1 ? " are" : " is") + " covered");
          else bits.push(join(maybe.map(function (m) { return m.label; })) + " not confirmed");
          majors.forEach(function (m, i) {
            if (status[i] === false) notes.push(m.label + " is not on this school's WUE list; that major would pay the out-of-state rate.");
            else if (status[i] === "unconfirmed" && yes.length) notes.push(m.label + " is not confirmed on this school's WUE list.");
            else if (status[i] === "unchecked") notes.push(m.label + " was not checked against this school's WUE list.");
          });
        }
      }
      if (!reason) {
        if (w.rate == null) reason = "no WUE rate recorded for this school";
        else {
          if (w.minGpa) bits.push("min. " + w.minGpa.toFixed(1) + " college GPA");
          if (w.note) bits.push(w.note);
          return out(w.rate, "WUE rate — " + bits.join("; ") + " · WICHE's WUE rate", "wue", notes);
        }
      }
    }
    return out(s.tuitionOutOfState, "Out-of-state — " + reason + " · " + IPEDS_BASIS, "oos");
  }

  function costFlag(cost, kind, s) {
    var b = DEFAULTS.budget;
    if (cost === null || cost === undefined) return "pending";
    if (kind === "instate" && s.tuitionType === "public" && b.homeStatePublicAlwaysGood) return "good";
    if (cost <= b.goodAtOrBelow) return "good";
    return cost <= b.watchAtOrBelow ? "warning" : "critical";
  }

  // ------------------------------------------------------------ programs + flags
  // per major key: [[cip, grads], ...] offered at this school
  function programsFor(s, majors) {
    var out = {};
    majors.forEach(function (m) {
      out[m.key] = m.cips.filter(function (c) { return c in s.programs; }).map(function (c) { return [c, s.programs[c]]; });
    });
    return out;
  }

  function programLines(offered, majors) {
    var names = D().cipNames, out = [];
    majors.forEach(function (m) {
      var got = offered[m.key];
      if (!got.length) out.push(m.label + ": not offered");
      got.forEach(function (g) {
        var label = m.cips.length === 1 ? m.label : (names[g[0]] || m.label);
        out.push(label + ": " + g[1] + " grads/yr" + (g[1] === 0 ? " (new program)" : ""));
      });
    });
    return out;
  }

  // Flag columns. Majors and cost are scored; Female coach and AiA are neutral
  // facts (§3); Beach keeps today's Good/Watch reading of the crossover.
  function flagCols(majors) {
    var cols = activeMajors(majors).map(function (m) { return { key: m.key, label: m.label, short: m.label, kind: "major" }; });
    cols.push({ key: "cost", label: "Affordability", short: "Cost", kind: "scored" });
    cols.push({ key: "coach", label: "Female coach", short: "Female coach", kind: "fact" });
    cols.push({ key: "beach", label: "Beach volleyball", short: "Beach", kind: "scored" });
    cols.push({ key: "aia", label: "AIA/FCA", short: "AIA/FCA", kind: "fact" });   // Athletes in Action, Fellowship of Christian Athletes
    return cols;
  }

  var BEACH_SHARE = { most: "Most", some: "Some", none: "None" };
  function beachLabel(b) {
    if (b === null || b === undefined) return null;
    if (!b.program) return "No program";
    return BEACH_SHARE[b.share] + " · " + b.crossover + " of " + b.courtSize;
  }
  function beachFlag(b) {
    if (b === null || b === undefined) return "pending";
    return b.program && (b.share === "most" || b.share === "some") ? "good" : "warning";
  }
  function factFlag(v) { return v === null || v === undefined ? "pending" : "info"; }
  function factText(v) { return v === null || v === undefined ? "—" : v ? "Yes" : "No"; }
  // AIA/FCA column: which of the two campus ministries is listed ("AIA", "FCA", "AIA + FCA"), "na" for
  // neither, null when the school hasn't been checked
  // ------------------------------------------------------------ climate (NOAA)
  // c: a team's climate (build_climate). Temperatures are the station's 1991-2020 normals; "sunny"
  // days are NOAA's Comparative Climatic Data clear + partly cloudy days a year.
  function climateTemps(c) {
    return c ? "Jul high " + c.julHigh + "°F · Jan low " + c.janLow + "°F" : "—";
  }
  function climateSky(c) {
    var k = c && c.sky;
    return k ? (k.clear + k.partly) + " sunny days/yr (" + k.clear + " clear, " + k.partly + " partly cloudy)" : null;
  }
  function climateWhere(c) {
    if (!c) return "";
    function mi(n) { return n < 1 ? "under 1 mi" : n + " mi"; }
    return "NOAA station " + c.station + " (" + mi(c.mi) + ")" +
      (c.sky ? "; sunny days: " + c.sky.station + " (" + mi(c.sky.mi) + ")" : "");
  }
  // NOAA's normals viewer opens on the station's monthly highs, lows, and precipitation
  function climateUrl(c) {
    return c ? "https://www.ncei.noaa.gov/access/us-climate-normals/#dataset=normals-monthly&timeframe=30&station=" + c.id : null;
  }

  function faithText(aia, fca) {
    if ((aia === null || aia === undefined) && (fca === null || fca === undefined)) return null;
    var p = [];
    if (aia) p.push("AIA");
    if (fca) p.push("FCA");
    return p.length ? p.join(" + ") : "na";
  }
  // a fact column shows green for a positive fact: "Yes" (female coach) or a listed ministry
  function factYes(d) { return d === "Yes" || /^(AIA|FCA)/.test(d || ""); }

  // ------------------------------------------------------------ school spirit (SPIRIT_PLAN.md)
  // Home attendance at football and men's and women's basketball, from each researched school's own
  // athletics site (tools/attendance.py), as a proxy for school spirit. Each sport is ranked among the
  // researched schools that play it at the same level (football: FBS, FCS, or D2; basketball: the
  // division), by average crowd and by crowd per 1,000 undergraduates. A school's score is the mean of
  // the two halves (mean crowd percentile, mean per-student percentile) over the sports it has, at least
  // SPIRIT_MIN_SPORTS of them; its band ranks that score among researched schools in its division.
  var SPIRIT_SPORTS = [
    { key: "football", label: "Football", short: "Football" },
    { key: "mbb", label: "Men's basketball", short: "Men's BB" },
    { key: "wbb", label: "Women's basketball", short: "Women's BB" }
    // volleyball was tried and dropped (user, 2026-11-11): only the ~50 schools on the WMT stats service have a figure
  ];
  // [lowest percentile, label], best first; bands, not scores, because the measure is rough
  var SPIRIT_BANDS = [[90, "Top 10%"], [65, "Above average"], [35, "Average"], [10, "Below average"], [0, "Bottom 10%"]];
  var SPIRIT_MIN_PEERS = 10, SPIRIT_MIN_SPORTS = 2;

  function spiritBand(p) {
    if (p === null || p === undefined) return null;
    for (var i = 0; i < SPIRIT_BANDS.length; i++) if (p >= SPIRIT_BANDS[i][0]) return SPIRIT_BANDS[i][1];
    return SPIRIT_BANDS[SPIRIT_BANDS.length - 1][1];
  }

  // percentile of v among list (which includes v), 0 = lowest, 100 = highest; ties share the middle rank
  function spiritPct(v, list) {
    if (list.length < 2) return null;
    var below = 0, same = 0;
    list.forEach(function (x) { if (x < v) below++; else if (x === v) same++; });
    return 100 * (below + (same - 1) / 2) / (list.length - 1);
  }

  function mean(xs) { return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length; }

  var spiritCache = null;
  // researched id -> {division, undergrads, sports: {key: entry}, score, pct, band, crowd, perStudent, counted}
  // entry: {status: "ok", avg, games, total, season, how, url, peer, perK, n, crowdPct, band, perKPct, perKBand}
  //        | {status: "noTeam"} | {status: "unread"}
  function spiritAll() {
    if (spiritCache) return spiritCache;
    var d = D(), out = {}, groups = {};
    Object.keys(d.researched).forEach(function (id) {
      var r = d.researched[id], a = r.attendance;
      if (!a) return;
      var t = d.teams[r.masseyName], ip = t && t.ipedsId ? d.ipeds[String(t.ipedsId)] : null;
      var ug = ip && ip.undergrads ? ip.undergrads : null;
      var s = out[id] = { division: t.division, undergrads: ug, sports: {} };
      SPIRIT_SPORTS.forEach(function (sp) {
        var f = a[sp.key];
        if (f && f.noTeam) { s.sports[sp.key] = { status: "noTeam" }; return; }
        if (!f || !f.games) { s.sports[sp.key] = { status: "unread" }; return; }
        var peer = sp.key === "football" ? (f.level || t.division) : t.division;
        var e = s.sports[sp.key] = { status: "ok", avg: f.avg, games: f.games, total: f.total, season: f.season,
                                     how: f.how, url: f.url || null, peer: peer, perK: ug ? f.avg / ug * 1000 : null };
        var g = groups[sp.key + "|" + peer] = groups[sp.key + "|" + peer] || { crowd: [], perK: [] };
        g.crowd.push(e.avg);
        if (e.perK !== null) g.perK.push(e.perK);
      });
    });
    var scores = {};
    Object.keys(out).forEach(function (id) {
      var s = out[id], crowd = [], per = [];
      SPIRIT_SPORTS.forEach(function (sp) {
        var e = s.sports[sp.key];
        if (e.status !== "ok") return;
        var g = groups[sp.key + "|" + e.peer];
        e.n = g.crowd.length;
        if (e.n < SPIRIT_MIN_PEERS) { e.crowdPct = e.perKPct = e.band = e.perKBand = null; return; }
        e.crowdPct = spiritPct(e.avg, g.crowd); e.band = spiritBand(e.crowdPct);
        e.perKPct = e.perK === null || g.perK.length < SPIRIT_MIN_PEERS ? null : spiritPct(e.perK, g.perK);
        e.perKBand = spiritBand(e.perKPct);
        if (sp.scored === false) return;
        crowd.push(e.crowdPct);
        if (e.perKPct !== null) per.push(e.perKPct);
      });
      s.counted = crowd.length;
      s.crowd = crowd.length ? mean(crowd) : null;
      s.perStudent = per.length ? mean(per) : null;
      s.score = crowd.length < SPIRIT_MIN_SPORTS ? null : s.perStudent === null ? s.crowd : (s.crowd + s.perStudent) / 2;
      if (s.score !== null) (scores[s.division] = scores[s.division] || []).push(s.score);
    });
    Object.keys(out).forEach(function (id) {
      var s = out[id], list = scores[s.division] || [];
      s.peers = list.length;
      s.pct = s.score === null || list.length < SPIRIT_MIN_PEERS ? null : spiritPct(s.score, list);
      s.band = spiritBand(s.pct);
    });
    spiritCache = out;
    return out;
  }

  function spiritOf(id) { return id ? spiritAll()[id] || null : null; }

  // who a sport's band compares against, e.g. "FBS football" or "D1 men's basketball"
  function spiritPeerText(key, e) {
    var sp = SPIRIT_SPORTS.filter(function (x) { return x.key === key; })[0];
    return e.peer + " " + (key === "football" ? "football" : sp.label.charAt(0).toLowerCase() + sp.label.slice(1));
  }

  // one line for the profile card
  function spiritText(s) {
    if (!s) return null;
    var parts = SPIRIT_SPORTS.filter(function (sp) { return s.sports[sp.key].status === "ok"; }).map(function (sp) {
      return sp.short + " " + s.sports[sp.key].avg.toLocaleString("en-US");
    });
    var crowds = parts.length ? " (average home crowd: " + parts.join(", ") + ")" : "";
    if (!s.band) return (s.score === null ? "Not enough sports to rate" : "Too few researched peers to rate") + crowds;
    return s.band + " of researched " + s.division + " schools" + crowds;
  }

  // ------------------------------------------------------------ report rows
  // The row a report page renders (was build_reports.build_school). conf: the
  // report's conference from SITE_DATA.conferences, or null.
  function buildSchool(s, settings, majors, conf, current) {
    majors = majors || matchMajors(settings.majors);
    var act = activeMajors(majors);
    var offered = programsFor(s, act);
    var c = resolveCost(s, settings, majors);
    var basis = c.basis;
    if (current) basis += " — comparison school, shown at its sticker price; actual aid varies";
    var isMember = !!(conf && s.confSlug && conf === D().conferences[s.confSlug]);
    var flags = {}, detail = {};
    act.forEach(function (m) { flags[m.key] = offered[m.key].length ? "good" : "warning"; });
    flags.cost = costFlag(c.cost, c.kind, s);
    flags.coach = factFlag(s.femaleCoachOnStaff); detail.coach = factText(s.femaleCoachOnStaff);
    flags.beach = beachFlag(s.beach); detail.beach = beachLabel(s.beach) || "—";
    var faith = faithText(s.aiaChapter, s.fcaChapter);
    flags.aia = faith === null ? "pending" : "info"; detail.aia = faith === null ? "—" : faith;
    var offeredMajors = {};
    act.forEach(function (m) { offeredMajors[m.key] = offered[m.key].length > 0; });
    var row = {
      id: s.id, name: s.name, current: !!current, researched: s.researched, masseyName: s.masseyName, confSlug: s.confSlug,
      conf: isMember ? conf.memberName : s.confSlug ? D().conferences[s.confSlug].memberName : s.masseyConf,
      division: s.division, region: s.region, niche: s.niche,
      cost: c.cost, costBasis: basis, costKind: c.kind, costFootnotes: c.footnotes,
      // total cost of attendance: the tuition + fees above plus living costs (a service academy covers
      // room and board too, so its total stays at its cost)
      livingParts: c.kind === "academy" ? [0, 0, 0] : (s.living ? s.living.parts : null),
      livingBasis: c.kind === "academy" ? "academy" : (s.living ? s.living.basis : null),
      livingEstimated: c.kind === "academy" || !s.living ? [] : s.living.estimated,
      livingFrom: s.living ? s.living.from : null,
      totalCost: c.cost == null ? null : c.kind === "academy" ? c.cost
        : s.living ? c.cost + s.living.parts[0] + s.living.parts[1] + s.living.parts[2] : null,
      earnings: s.earnings, earningsSource: s.earningsSource, natRank: s.natRank,
      confRank: isMember ? s.confRank : "—",
      ipeds: s.ipeds, programs: programLines(offered, act), offeredMajors: offeredMajors,
      offenseNote: s.offenseNote, coachStaff: s.coachStaff,
      flags: flags, flagDetail: detail, beach: s.beach, links: s.links, climate: s.climate,
      spirit: s.spirit, undergrads: s.undergrads
    };
    if (s.setter) row.setter = s.setter;
    row.setters = s.setters || [];
    row.players = s.players || [];
    return row;
  }

  // A report's rows: the conference's schools plus the comparison school when
  // it isn't a member (D2), comparison school first (§6 applyBaseline).
  function reportRows(slug, settings) {
    var d = D(), conf = d.conferences[slug];
    if (!conf) throw new Error("no conference " + slug);
    var majors = matchMajors(settings.majors);
    var base = settings.school ? schoolRecord(settings.school) : null;
    var rows = conf.schools.map(function (id) {
      var s = schoolRecord(id);
      return buildSchool(s, settings, majors, conf, !!base && base.id === s.id);
    });
    if (base && !rows.some(function (r) { return r.current; })) {
      rows.unshift(buildSchool(base, settings, majors, conf, true));
    }
    rows.sort(function (a, b) { return (b.current ? 1 : 0) - (a.current ? 1 : 0); });
    return rows;
  }

  // The saved-schools report (saved-report.html): one row per saved school, each built against its
  // own conference (so its conference rank shows), plus the comparison school; unresearched schools
  // get partial rows (D12). Order: comparison school, then the saved list's export order.
  function savedRows(settings, list) {
    var d = D(), majors = matchMajors(settings.majors);
    var base = settings.school ? schoolRecord(settings.school) : null;
    var own = function (s) { return s.confSlug ? d.conferences[s.confSlug] : null; };
    var rows = savedSort(list || savedLoad()).map(function (m) {
      var s = schoolRecord(m);
      return buildSchool(s, settings, majors, own(s), !!base && base.masseyName === s.masseyName);
    });
    if (base && !rows.some(function (r) { return r.current; })) rows.unshift(buildSchool(base, settings, majors, own(base), true));
    rows.sort(function (a, b) { return (b.current ? 1 : 0) - (a.current ? 1 : 0); });
    return rows;
  }

  // ------------------------------------------------------------ misc
  function milesBetween(a, b) {
    if (!a || !b || !isFinite(a.lat) || !isFinite(b.lat)) return null;
    var r = 3958.8, rad = Math.PI / 180;
    var p1 = a.lat * rad, p2 = b.lat * rad, dp = p2 - p1, dl = (b.lon - a.lon) * rad;
    var h = Math.pow(Math.sin(dp / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(dl / 2), 2);
    return Math.round(2 * r * Math.asin(Math.sqrt(h)));
  }

  // ------------------------------------------------------------ flights (FLIGHTS_PLAN.md)
  // F = SITE_FLIGHTS {airports: {code: {name, city, state, lat, lon, perMonth}}, routes: [[airline, from, to, perWeek]],
  //     schools: {id: [{code, miles, role: nearest|busiest|fallback}]}, months, fares: {t1, db1b}} (tools/flights.py);
  // fares = SITE_FARES[home airport] {t1: {code: [avg, lowAirline, lowFare, largest, perDay]},
  //     db: {code: [median, tickets, cheapAirline, itsMedian, nonstopMedian, oneStopMedian]}} (data/fares/<code>.js)
  var AIRLINES = { AA: "American", DL: "Delta", UA: "United", WN: "Southwest", AS: "Alaska", B6: "JetBlue",
                   F9: "Frontier", G4: "Allegiant", NK: "Spirit", SY: "Sun Country", MX: "Breeze", XP: "Avelo",
                   HA: "Hawaiian", "3M": "Silver", "9K": "Cape Air", ZW: "Air Wisconsin" };
  // FLY_HOME: the home airport is the big regional airport (the busiest) within this many miles of home
  var FLY_NEAR = 75, FLY_HOME = 100, FLY_MIN_TICKETS = 30, FLY_LEG_WEEKLY = 3;
  function airlineName(c) { return AIRLINES[c] || c; }
  // each airline's own site (its booking page); the airlines publish no stable link format that fills in a route
  var AIRLINE_SITES = { AA: "https://www.aa.com/", DL: "https://www.delta.com/", UA: "https://www.united.com/",
                        WN: "https://www.southwest.com/", AS: "https://www.alaskaair.com/", B6: "https://www.jetblue.com/",
                        F9: "https://www.flyfrontier.com/", G4: "https://www.allegiantair.com/", NK: "https://www.spirit.com/",
                        SY: "https://www.suncountry.com/", MX: "https://www.flybreeze.com/", XP: "https://www.aveloair.com/",
                        HA: "https://www.hawaiianairlines.com/" };
  function airlineUrl(c) { return AIRLINE_SITES[c] || null; }
  // a Google Flights search with the route filled in (one-way, no date: the viewer picks it there)
  function flightSearchUrl(from, to) {
    return "https://www.google.com/travel/flights?q=" + encodeURIComponent("one way flights from " + from + " to " + to);
  }

  var flightIdx = null;
  function flightIndex(F) {
    if (flightIdx && flightIdx.F === F) return flightIdx;
    var by = {};
    F.routes.forEach(function (r) { (by[r[1]] = by[r[1]] || []).push(r); });
    flightIdx = { F: F, byOrigin: by };
    return flightIdx;
  }

  // home airports: the big regional airport (the busiest, flights a month) within 100 miles of home, else the nearest
  // with flights; and the nearest airport as a smaller alternative when it's a different one (Fort Collins: Denver,
  // with Cheyenne as the alternative). {main: {code, miles}, alt: {code, miles} | null}
  function homeAirports(home, F) {
    if (!home || !F) return null;
    var best = null, near = null;
    Object.keys(F.airports).forEach(function (k) {
      var a = F.airports[k], mi = milesBetween(home, a);
      if (mi == null) return;
      if (!near || mi < near.miles) near = { code: k, miles: mi };
      if (mi <= FLY_HOME && (!best || a.perMonth > F.airports[best.code].perMonth)) best = { code: k, miles: mi };
    });
    var main = best || near;
    return main ? { main: main, alt: near && near.code !== main.code ? near : null } : null;
  }
  function homeAirport(home, F) { var h = homeAirports(home, F); return h ? h.main : null; }

  // airlines flying from -> to nonstop, most flights a week first: [{airline, perWeek}]
  function nonstopAirlines(F, from, to) {
    return (flightIndex(F).byOrigin[from] || []).filter(function (r) { return r[2] === to; })
      .sort(function (a, b) { return b[3] - a[3]; }).map(function (r) { return { airline: r[0], perWeek: r[3] }; });
  }

  // one stop on the same airline: both legs flown at least 3 times a week, and the trip at most 1.5 times the
  // nonstop distance plus 500 miles (so a short trip through a hub still counts): [{airline, via: [codes]}]
  function oneStopAirlines(F, from, to) {
    var ap = F.airports, idx = flightIndex(F).byOrigin, direct = milesBetween(ap[from], ap[to]);
    if (direct == null) return [];
    var out = {};
    (idx[from] || []).forEach(function (leg1) {
      var hub = leg1[2];
      if (hub === to || leg1[3] < FLY_LEG_WEEKLY || !ap[hub]) return;
      var ok = (idx[hub] || []).some(function (leg2) { return leg2[0] === leg1[0] && leg2[2] === to && leg2[3] >= FLY_LEG_WEEKLY; });
      if (!ok || milesBetween(ap[from], ap[hub]) + milesBetween(ap[hub], ap[to]) > 1.5 * direct + 500) return;
      (out[leg1[0]] = out[leg1[0]] || []).push(hub);
    });
    return Object.keys(out).sort().map(function (c) { return { airline: c, via: out[c].sort() }; });
  }

  // the fare to show for one school airport from the viewer's home airport (fares for that home airport)
  function fareAt(F, fares, code) {
    var t = fares.t1 && fares.t1[code], d = fares.db && fares.db[code];
    if (t) return { airport: code, source: "t1", period: F.fares.t1, typical: t[0], lowAirline: t[1], low: t[2], tickets: null };
    if (d) return { airport: code, source: "db1b", period: F.fares.db1b, typical: d[0], lowAirline: d[2], low: d[3], tickets: d[1],
                    nonstop: d[4], oneStop: d[5] };
    return null;
  }

  // everything panel 09 needs for one school row:
  // {status: nohome|nodata|notresearched|drive|ok, home: {code, miles}, airports: [{code, miles, role, nonstop, oneStop}],
  //  fare: {airport, source: t1|db1b, period, typical, low, lowAirline, tickets, thin, fallback} | null | "loading"}
  function schoolFlights(F, faresByHome, home, s) {
    if (!s.researched) return { status: "notresearched" };
    if (!F) return { status: "nodata" };
    var H = homeAirport(home, F);
    if (!H) return { status: "nohome" };
    var cands = F.schools[s.id] || [];
    if (!cands.length) return { status: "nodata", home: H };
    var near = cands.filter(function (c) { return c.role !== "fallback"; });
    var fb = cands.filter(function (c) { return c.role === "fallback"; })[0] || null;
    var homeMiles = milesBetween(home, s.ipeds);
    if (near.some(function (c) { return c.code === H.code; }) || (homeMiles != null && homeMiles <= FLY_NEAR))
      return { status: "drive", home: H, miles: homeMiles };
    function at(c, fallback) {
      return { code: c.code, miles: c.miles, role: c.role, fallback: !!fallback,
               nonstop: nonstopAirlines(F, H.code, c.code), oneStop: oneStopAirlines(F, H.code, c.code) };
    }
    var airports = near.map(function (c) { return at(c, false); });
    var any = airports.some(function (a) { return a.nonstop.length || a.oneStop.length; });
    if (!any && fb && fb.code !== H.code) airports.push(at(fb, true));
    var fares = faresByHome ? faresByHome[H.code] : null, fare = null;
    if (faresByHome && !fares) fare = "loading";
    if (fares) {
      var tries = near.map(function (c) { return fareAt(F, fares, c.code); }).filter(Boolean);
      fare = tries.filter(function (f) { return f.source === "t1"; })[0] ||
             tries.filter(function (f) { return f.tickets >= FLY_MIN_TICKETS; }).sort(function (a, b) { return b.tickets - a.tickets; })[0] || null;
      if (!fare && fb && fb.code !== H.code) {
        var f2 = fareAt(F, fares, fb.code);
        if (f2 && (f2.source === "t1" || f2.tickets >= FLY_MIN_TICKETS)) { fare = f2; fare.fallback = true; }
      }
      if (!fare && tries.length) { fare = tries.sort(function (a, b) { return b.tickets - a.tickets; })[0]; fare.thin = true; }
    }
    return { status: "ok", home: H, airports: airports, fare: fare };
  }

  // "$236, from $135 (Frontier)"
  function fareText(f) {
    if (!f || f === "loading") return f === "loading" ? "loading…" : "—";
    var t = "$" + f.typical.toLocaleString();
    // "99" is DB1B's code for an airline it can't identify: show no "from" price for it
    if (f.low != null && f.lowAirline && f.lowAirline !== "99" && f.low < f.typical) t += ", from $" + f.low.toLocaleString() + " (" + airlineName(f.lowAirline) + ")";
    return t;
  }

  // profile card line: "From DEN: nonstop United, Southwest to SMF · $236, from $135 (Frontier)"
  function flightsText(x) {
    if (!x || x.status === "notresearched" || x.status === "nodata") return null;
    if (x.status === "nohome") return "Set a home town to see flights";
    if (x.status === "drive") return "Near your home airport (" + x.home.code + ")" + (x.miles != null ? ": " + x.miles + " mi from home" : "") + " · drive";
    var ns = [], os = [];
    x.airports.forEach(function (a) {
      a.nonstop.forEach(function (n) { if (ns.indexOf(airlineName(n.airline)) < 0) ns.push(airlineName(n.airline)); });
      a.oneStop.forEach(function (o) { if (os.indexOf(airlineName(o.airline)) < 0) os.push(airlineName(o.airline)); });
    });
    os = os.filter(function (n) { return ns.indexOf(n) < 0; });
    var codes = x.airports.map(function (a) { return a.code; }).join("/");
    var parts = ["From " + x.home.code + " to " + codes + ": " + (ns.length ? "nonstop " + ns.join(", ") : "no nonstop") +
                 (os.length ? "; one stop " + os.join(", ") : "")];
    if (x.fare && x.fare !== "loading") parts.push(fareText(x.fare) + (x.fare.source === "db1b" ? " (" + x.fare.period[0] + "-" + x.fare.period[x.fare.period.length - 1] + ")" : ""));
    return parts.join(" · ");
  }

  // fall of next season: Oct 2026 -> 2027 (§3 target year)
  function targetYear(now) { return (now || new Date()).getFullYear() + 1; }

  function setterOpenings(rows) {
    return rows.filter(function (r) { return !r.current && r.setter && SENIOR.indexOf(r.setter.cls) >= 0; });
  }

  // ------------------------------------------------------------ positions other than setter
  // OTHER_POSITIONS.md §1/§8: which roster group each position lists, the stat it is ordered by,
  // and how many starters count for "openings" (a starter who is a senior or grad student).
  var POSITION_SPEC = {
    OH:  { group: "OH",  plural: "Outside hitters", one: "outside hitter", sort: "k",   statLabel: "Kills",  starters: 2 },
    OPP: { group: "OPP", plural: "Opposites",       one: "opposite",       sort: "k",   statLabel: "Kills",  starters: 1 },
    MB:  { group: "MB",  plural: "Middle blockers", one: "middle blocker", sort: "blk", statLabel: "Blocks", starters: 2 },
    L:   { group: "L",   plural: "Liberos / DS",    one: "libero/DS",      sort: "dig", statLabel: "Digs",   starters: 1 }
  };
  function positionSpec(code) { return POSITION_SPEC[code] || null; }

  // derived numbers, computed here so they always agree with the stored counts
  function totalBlocks(p) { return p.bs == null ? null : p.bs + 0.5 * (p.ba || 0); }   // NCAA: solo + ½ assist
  function hitPct(p) { return p.ta ? (p.k - p.e) / p.ta : null; }
  function playerStat(p, key) {
    if (key === "blk") return totalBlocks(p);
    if (key === "pct") return hitPct(p);
    if (key === "perSet") return null;
    return p[key] == null ? null : p[key];
  }
  function perSet(p, key) { var v = playerStat(p, key); return v == null || !p.sp ? null : v / p.sp; }

  // a school's players at a position, by the position's stat (most first); ties by sets played.
  // Players with no stats yet (null: not on the stats page) come last, in roster order.
  function positionPlayers(row, code) {
    var spec = positionSpec(code);
    if (!spec) return [];
    var list = (row.players || []).filter(function (p) { return (p.groups || []).indexOf(spec.group) >= 0; });
    return list.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) {
      var x = playerStat(a.p, spec.sort), y = playerStat(b.p, spec.sort);
      if ((x == null) !== (y == null)) return x == null ? 1 : -1;
      if (x != null && y !== x) return y - x;
      if ((b.p.sp || 0) !== (a.p.sp || 0)) return (b.p.sp || 0) - (a.p.sp || 0);
      return a.i - b.i;
    }).map(function (x) { return x.p; });
  }

  // schools where one of the top <starters> at the position is a senior or grad student
  function positionOpenings(rows, code) {
    var spec = positionSpec(code);
    if (!spec) return [];
    return rows.filter(function (r) { return !r.current; }).map(function (r) {
      var leaving = positionPlayers(r, code).slice(0, spec.starters).filter(function (p) {
        return p.sp && SENIOR.indexOf(p.cls) >= 0;
      });
      return { row: r, leaving: leaving };
    }).filter(function (x) { return x.leaving.length; });
  }

  function positionName(code) {
    var p = POSITIONS.filter(function (x) { return x[0] === code; })[0];
    return p ? p[1] : "";
  }

  // one-line summary for report/map/beach pages (§3)
  function summary(settings) {
    var parts = [], base = settings.school ? schoolRecord(settings.school) : null;
    parts.push(base ? "Comparing to " + base.name : "No comparison school");
    parts.push(positionName(settings.position));
    if (settings.majors.trim()) parts.push(matchMajors(settings.majors).map(function (m) { return m.term; }).join(", "));
    if (settings.home) parts.push("from " + settings.home.city + ", " + settings.home.state);
    return parts.join(" · ");
  }

  // ------------------------------------------------------------ school names and search
  // (moved from index.html so the type-ahead and the saved-list parser agree)
  function fold(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  // display name per Massey team: the report name when researched, else IPEDS
  function displayName(m) {
    var d = D(), t = d.teams[m];
    if (!t) return null;
    return t.researched ? d.researched[t.researched].name : t.name;
  }

  function teamWhere(m) {
    var d = D(), t = d.teams[m];
    var loc = t && (t.campus || (t.ipedsId ? d.ipeds[String(t.ipedsId)] : null));
    return loc ? loc.city + ", " + loc.state : "";
  }

  var schoolIdx = null;
  function schoolIndex() {
    if (!schoolIdx) {
      var d = D();
      schoolIdx = Object.keys(d.teams).map(function (m) {
        var t = d.teams[m], name = displayName(m);
        return { value: m, label: name, name: fold(name), alt: fold(m + " " + teamWhere(m)),
                 sub: t.division + " · " + t.conf + " · " + teamWhere(m) + " · Massey #" + t.rank,
                 division: t.division, conf: t.conf, researched: !!t.researched, rank: t.rank };
      });
    }
    return schoolIdx;
  }

  // every Massey team by report/IPEDS name, Massey name, or city; best first
  function searchSchools(q, limit) {
    var f = fold(q), words = f.split(" "), hits = [];
    if (!f) return [];
    schoolIndex().forEach(function (s) {
      var score;
      if (s.name.indexOf(f) === 0) score = 0;
      else if ((" " + s.name).indexOf(" " + f) >= 0) score = 1;
      else if (words.every(function (w) { return (" " + s.name + " " + s.alt).indexOf(" " + w) >= 0; })) score = 2;
      else return;
      hits.push([score, s]);
    });
    hits.sort(function (a, b) { return a[0] - b[0] || (b[1].researched - a[1].researched) || a[1].rank - b[1].rank; });
    return hits.slice(0, limit === undefined ? 12 : limit).map(function (h) { return h[1]; });
  }

  // ------------------------------------------------------------ saved schools (SAVE_SCHOOLS.md)
  // Six named lists (four until 2026-11-09; stored states with fewer are padded), one selected; a
  // separate key from the settings:
  //   {v: 2, active: 0-5, lists: [{name, schools: [Massey names, in the order saved], updated}, x6]}
  // Every saved-list call below acts on the selected list. Not carried in the URL hash (Q3); shared
  // only as plain text (savedText / parseSaved). The single list of v1 ("ncaaCompare.saved.v1") is
  // moved into List 1 the first time this loads, and that old key is left as it was.
  var SAVED_KEY = "ncaaCompare.savedLists.v1";
  var SAVED_KEY_V1 = "ncaaCompare.saved.v1";
  var SAVED_LISTS = 6, SAVED_NAME_MAX = 24;
  var savedMem = null;   // this page's lists when storage is blocked

  function savedClean(list) {
    var teams = D().teams, seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (m) {
      if (typeof m === "string" && teams[m] && !seen[m]) { seen[m] = true; out.push(m); }
    });
    return out;
  }

  function savedDefaultName(i) { return "List " + (i + 1); }
  function savedCleanName(name, i) {
    var n = String(name == null ? "" : name).replace(/\s+/g, " ").trim().slice(0, SAVED_NAME_MAX);
    return n || savedDefaultName(i);
  }

  // the stored state, cleaned: always SAVED_LISTS lists; names that are no longer Massey teams (renamed
  // in a later pull) are dropped
  function savedCleanState(raw) {
    var lists = [];
    for (var i = 0; i < SAVED_LISTS; i++) {
      var l = raw && Array.isArray(raw.lists) && raw.lists[i] ? raw.lists[i] : {};
      lists.push({ name: savedCleanName(l.name, i), schools: savedClean(l.schools), updated: l.updated || null });
    }
    var a = raw && typeof raw.active === "number" ? Math.floor(raw.active) : 0;
    return { v: 2, active: a >= 0 && a < SAVED_LISTS ? a : 0, lists: lists };
  }

  function savedWrite(state) {
    savedMem = JSON.parse(JSON.stringify(state));
    var ls = storage();
    if (ls) {
      try { ls.setItem(SAVED_KEY, JSON.stringify(state)); }
      catch (e) { storageOk = false; }
    }
    return state;
  }

  function savedState() {
    var ls = storage();
    if (ls) {
      try {
        var raw = ls.getItem(SAVED_KEY);
        if (raw) return savedCleanState(JSON.parse(raw));
        // first load since lists came in: the old single list becomes List 1
        var old = ls.getItem(SAVED_KEY_V1), st = savedCleanState(null);
        if (old) {
          var o = JSON.parse(old);
          st.lists[0].schools = savedClean(o.schools);
          st.lists[0].updated = o.updated || null;
          return savedWrite(st);
        }
        return st;
      } catch (e) { /* fall through */ }
    }
    return savedCleanState(savedMem);
  }

  function savedLoad() { var st = savedState(); return st.lists[st.active].schools.slice(); }

  function savedSave(list) {
    var st = savedState(), out = savedClean(list);
    st.lists[st.active].schools = out;
    st.lists[st.active].updated = new Date().toISOString();
    savedWrite(st);
    return out.slice();
  }

  // empties the selected list (its name stays)
  function savedReset() { return savedSave([]); }

  // which list is selected (0-3), and switching it
  function savedActive() { return savedState().active; }
  function savedSetActive(i) {
    var st = savedState();
    if (i >= 0 && i < SAVED_LISTS && i !== st.active) { st.active = i; savedWrite(st); }
    return st.lists[st.active].schools.slice();
  }
  // every list's name and size: [{name, count}], in list order
  function savedLists() {
    return savedState().lists.map(function (l) { return { name: l.name, count: l.schools.length }; });
  }
  function savedName(i) { var st = savedState(); return st.lists[i === undefined ? st.active : i].name; }
  function savedSetName(name, i) {
    var st = savedState(), k = i === undefined ? st.active : i;
    st.lists[k].name = savedCleanName(name, k);
    savedWrite(st);
    return st.lists[k].name;
  }

  function isSaved(m) { return savedLoad().indexOf(m) >= 0; }

  function setSaved(m, on) {
    var list = savedLoad(), i = list.indexOf(m);
    if (on && i < 0) list.push(m);
    else if (!on && i >= 0) list.splice(i, 1);
    else return list;
    return savedSave(list);
  }

  function toggleSaved(m) { return setSaved(m, !isSaved(m)); }

  // another tab (an index or map opened from this one) changed a list, its name, or the selection
  function onSavedChange(fn) {
    if (!root.addEventListener) return;
    root.addEventListener("storage", function (e) {
      if (e.key === SAVED_KEY || e.key === null) fn(savedLoad());
    });
  }

  var DIV_ORDER = { D1: 1, D2: 2, D3: 3 };
  // export order: division, conference, then name (how the research is done)
  function savedSort(list) {
    var d = D();
    return savedClean(list).sort(function (a, b) {
      var ta = d.teams[a], tb = d.teams[b];
      return (DIV_ORDER[ta.division] || 9) - (DIV_ORDER[tb.division] || 9) ||
        ta.conf.localeCompare(tb.conf) || displayName(a).localeCompare(displayName(b)) || a.localeCompare(b);
    });
  }

  function isoDay(now) {
    var t = now || new Date();
    return t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
  }

  // plain text, one school per line: "Name (D1, Conference)" plus " [researched]"; the "#" header
  // names the list when a name is given (imports skip "#" lines, so it never changes a list's name)
  function savedText(list, now, name) {
    var d = D(), sorted = savedSort(list);
    var lines = ["# NCAA women's volleyball: " + (name ? name + ", " : "") + sorted.length + " saved school" +
                 (sorted.length === 1 ? "" : "s") + " (" + isoDay(now) + ")"];
    sorted.forEach(function (m) {
      var t = d.teams[m];
      lines.push(displayName(m) + " (" + t.division + ", " + t.conf + ")" + (t.researched ? " [researched]" : ""));
    });
    return lines.join("\n") + "\n";
  }

  var exactIdx = null;   // fold(display / Massey / IPEDS name) -> [Massey names]
  function exactIndex() {
    if (!exactIdx) {
      var d = D();
      exactIdx = {};
      Object.keys(d.teams).forEach(function (m) {
        var seen = {};
        [displayName(m), m, d.teams[m].name].forEach(function (n) {
          var k = n && fold(n);
          if (!k || seen[k]) return;
          seen[k] = true;
          (exactIdx[k] = exactIdx[k] || []).push(m);
        });
      });
    }
    return exactIdx;
  }

  // Lenient import of a pasted list. Skips blank and "#" lines; strips bullets, numbers,
  // checkboxes, and trailing [tags]; a trailing "(D1, Conference)" only breaks ties.
  // Exact name first, then a single search hit; anything else is unmatched, never guessed.
  //   -> {schools: [Massey names, deduped, in order], lines: [{line, school, how, options}],
  //       unmatched: [those lines with no school]}
  // how: "exact" | "search" | "ambiguous" | "unknown"
  function parseSaved(text) {
    var d = D(), schools = [], seen = {}, lines = [];
    String(text || "").split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line || line.charAt(0) === "#") return;
      var name = line.replace(/^(?:[-*+•–·]+\s*|\d+\s*[.)]\s*)+/, "")
        .replace(/^\[[ xX]?\]\s*/, "");
      var m, hint = null;
      while ((m = /\s*\[[^\]]*\]\s*$/.exec(name)) && m.index > 0) name = name.slice(0, m.index);
      m = /\s*\((D[123])\s*,\s*([^()]+)\)\s*$/i.exec(name);
      if (m && m.index > 0) { hint = { division: m[1].toUpperCase(), conf: fold(m[2]) }; name = name.slice(0, m.index); }
      name = name.trim();
      function byHint(cands) {
        if (!hint || cands.length < 2) return cands;
        return cands.filter(function (c) { var t = d.teams[c]; return t.division === hint.division && fold(t.conf) === hint.conf; });
      }
      var entry = { line: line, school: null, how: "unknown", options: [] };
      var exact = name ? exactIndex()[fold(name)] || [] : [];
      if (exact.length) {
        var e = byHint(exact);
        if (e.length === 1) { entry.school = e[0]; entry.how = "exact"; }
        else { entry.how = "ambiguous"; entry.options = exact.slice(); }
      } else if (name) {
        var hits = byHint(searchSchools(name, Infinity).map(function (s) { return s.value; }));
        if (hits.length === 1) { entry.school = hits[0]; entry.how = "search"; }
        else if (hits.length > 1) { entry.how = "ambiguous"; entry.options = hits.slice(0, 5); }
      }
      if (entry.school && !seen[entry.school]) { seen[entry.school] = true; schools.push(entry.school); }
      lines.push(entry);
    });
    return { schools: schools, lines: lines, unmatched: lines.filter(function (l) { return !l.school; }) };
  }

  // ------------------------------------------------------------ filters (FILTER_PLAN.md)
  // "Create list…": filter every Massey team on facts the site has for all of them (phase 1:
  // division, conference, Massey rank, majors, size, type, setting, state/region, cost, distance,
  // climate). The filter object (kept per browser by the index, ncaaCompare.filters.v1):
  //   {divisions: ["D1",…], confs: ["D1|Big West",…], rankFrom: n|null, rankTo: n|"max"|null,
  //    majors: "nursing, kinesiology", majorsMode: "any"|"all", sizes: [1-5], types: ["public","private"],
  //    settings: ["city","suburb","town","rural"], states: ["ID",…], regions: ["West",…],
  //    costMax: n|null, costBasis: "tuition"|"total", distanceMax: n|null,
  //    sunnyMin: n|null, julyMax: n|null, janMin: n|null,
  //    researched-only (phase 3, from team sites, not Niche):
  //    confRankMax: n|null, openings: bool (the settings' position), offense: ["5-1","6-2","split"],
  //    beach: bool, faith: bool (AIA or FCA), femaleCoach: bool, includeUnresearched: bool,
  //    start from a school (§11): similarTo: Massey name|null, similarLimit: n, similarOff: [row keys],
  //    similarLevel: "same"|"stronger"|"weaker", similarIncludeSeed: bool}
  // Empty or null = not used. AND across filters, OR within one. While a researched-only filter is set,
  // schools not researched yet are left out unless includeUnresearched (then those filters skip them).
  var FILTER_KEY = "ncaaCompare.filters.v1";
  var SIZE_BANDS = { 1: "Under 1,000", 2: "1,000-4,999", 3: "5,000-9,999", 4: "10,000-19,999", 5: "20,000+" };
  var SETTINGS = ["city", "suburb", "town", "rural"];
  // U.S. Census regions, with "East" for the Northeast (the reports' word); for every school, from its state
  var REGIONS = {
    West: ["AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"],
    Midwest: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
    South: ["AL", "AR", "DE", "DC", "FL", "GA", "KY", "LA", "MD", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV", "PR"],
    East: ["CT", "ME", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"]
  };
  function stateRegion(st) {
    for (var r in REGIONS) if (REGIONS[r].indexOf(st) >= 0) return r;
    return null;
  }
  // the last rank in each division (its number of ranked teams)
  function divisionSizes() {
    var out = {}, t = D().teams;
    Object.keys(t).forEach(function (m) { var d = t[m].division; out[d] = Math.max(out[d] || 0, t[m].rank || 0); });
    return out;
  }
  function blankFilters() {
    return { divisions: [], confs: [], rankFrom: null, rankTo: null, majors: "", majorsMode: "any", sizes: [],
             types: [], settings: [], states: [], regions: [], costMax: null, costBasis: "tuition",
             distanceMax: null, sunnyMin: null, julyMax: null, janMin: null,
             confRankMax: null, openings: false, offense: [], beach: false, faith: false, femaleCoach: false,
             includeUnresearched: false,
             similarTo: null, similarLimit: SIMILAR_DEFAULT_LIMIT, similarOff: [], similarLevel: "same", similarIncludeSeed: true };
  }
  var OFFENSES = ["5-1", "6-2", "split"];
  // the offense call's family: "5-1" (5-1 and 5-1 leaning), "6-2", "split" (a 3-way split); null if none
  function offenseKind(note) {
    var n = String(note || "");
    return /^5-1/.test(n) ? "5-1" : /^6-2/.test(n) ? "6-2" : /^3-way/.test(n) ? "split" : null;
  }
  function researchedOnlySet(f) {
    return f.confRankMax !== null || f.openings || f.offense.length > 0 || f.beach || f.faith || f.femaleCoach;
  }
  function num(v) { if (v === "" || v === null || v === undefined) return null; v = +v; return isFinite(v) ? v : null; }
  function cleanFilters(f) {
    var o = blankFilters(); f = f || {};
    var arr = function (v, ok) { return (Array.isArray(v) ? v : []).filter(ok); };
    o.divisions = arr(f.divisions, function (d) { return DIV_ORDER[d]; });
    o.confs = arr(f.confs, function (c) { return typeof c === "string" && c.indexOf("|") > 0; });
    o.rankFrom = num(f.rankFrom);
    o.rankTo = f.rankTo === "max" ? "max" : num(f.rankTo);
    o.majors = typeof f.majors === "string" ? f.majors : "";
    o.majorsMode = f.majorsMode === "all" ? "all" : "any";
    o.sizes = arr(f.sizes, function (n) { return SIZE_BANDS[n]; }).map(Number);
    o.types = arr(f.types, function (t) { return t === "public" || t === "private"; });
    o.settings = arr(f.settings, function (x) { return SETTINGS.indexOf(x) >= 0; });
    o.states = arr(f.states, function (x) { return STATE_NAMES[x]; });
    o.regions = arr(f.regions, function (x) { return REGIONS[x]; });
    o.costMax = num(f.costMax);
    o.costBasis = f.costBasis === "total" ? "total" : "tuition";
    o.distanceMax = num(f.distanceMax);
    o.sunnyMin = num(f.sunnyMin); o.julyMax = num(f.julyMax); o.janMin = num(f.janMin);
    o.confRankMax = num(f.confRankMax);
    o.offense = arr(f.offense, function (x) { return OFFENSES.indexOf(x) >= 0; });
    ["openings", "beach", "faith", "femaleCoach", "includeUnresearched"].forEach(function (k) { o[k] = f[k] === true; });
    // a remembered starting school no longer in the data is dropped
    o.similarTo = typeof f.similarTo === "string" && D().teams[f.similarTo] ? f.similarTo : null;
    if (SIMILAR_LIMITS.indexOf(+f.similarLimit) >= 0) o.similarLimit = +f.similarLimit;
    o.similarOff = arr(f.similarOff, function (k) { return SIMILAR_ROWS.some(function (r) { return r.key === k; }); });
    if (f.similarLevel === "stronger" || f.similarLevel === "weaker") o.similarLevel = f.similarLevel;
    o.similarIncludeSeed = f.similarIncludeSeed !== false;
    return o;
  }
  function filtersLoad() {
    var ls = storage();
    try { return cleanFilters(ls ? JSON.parse(ls.getItem(FILTER_KEY)) : null); } catch (e) { return blankFilters(); }
  }
  function filtersSave(f) {
    f = cleanFilters(f);
    var ls = storage();
    if (ls) { try { ls.setItem(FILTER_KEY, JSON.stringify(f)); } catch (e) { /* storage full or blocked */ } }
    return f;
  }
  // how many filters are set (for the "N set" group labels and an empty modal's "all schools")
  function filtersActive(f) {
    f = cleanFilters(f);
    var n = 0;
    ["divisions", "confs", "sizes", "types", "settings", "states", "regions"].forEach(function (k) { if (f[k].length) n++; });
    ["costMax", "distanceMax", "sunnyMin", "julyMax", "janMin"].forEach(function (k) { if (f[k] !== null) n++; });
    if (f.rankFrom !== null || (f.rankTo !== null && f.rankTo !== "max")) n++;
    if (activeMajors(matchMajors(f.majors)).length) n++;
    ["openings", "beach", "faith", "femaleCoach"].forEach(function (k) { if (f[k]) n++; });
    if (f.confRankMax !== null) n++;
    if (f.offense.length) n++;
    if (f.similarTo) n++;
    return n;
  }
  function campusSetting(locale) {
    var m = /^(city|suburb|town|rural)/i.exec(String(locale || "").replace(/^(large|midsize|small)\s+/i, ""));
    return m ? m[1].toLowerCase() : null;
  }

  // ------------------------------------------------------------ similar schools (FILTER_PLAN.md §11)
  // Start from a school: each row below scores 0-1 against the starting school and the score is the
  // weighted average over the rows both schools have. A row a filter is set for stops being scored; the
  // filter is required instead. The score is about the two schools, never the viewer's settings.
  // Tuning is here: weight, and "span", the difference that scores 0.
  var SIMILAR_ROWS = [
    { key: "level", label: "Volleyball level", weight: 3, span: 0.25 },      // share of the division
    { key: "size", label: "Size", weight: 2, span: 2 },                      // size bands
    { key: "type", label: "Public/private", weight: 2 },
    { key: "cost", label: "Cost", weight: 2, span: Math.LN2 },               // log ratio: twice the price scores 0
    { key: "academics", label: "Academics", weight: 2, span: 0.5 },          // cosine of the program mixes
    { key: "kind", label: "School kind", weight: 2, span: 2 },               // KIND_STEP steps
    { key: "setting", label: "Setting", weight: 1, span: 2 },                // SETTINGS steps
    { key: "climate", label: "Climate", weight: 1, spans: { jul: 15, jan: 30, sunny: 80 } },
    { key: "location", label: "Location", weight: 1, span: 1500 }            // miles
  ];
  var SIMILAR_LIMITS = [10, 15, 20, 30, 50], SIMILAR_DEFAULT_LIMIT = 20;
  var SIMILAR_CLOSE = 0.80, SIMILAR_GOOD = 0.65;   // the Close / Good / Loose labels
  var SIMILAR_MIN_DATA = 0.6;                      // share of the starting school's usable weight a school must have
  var SIMILAR_LEVEL_SHIFT = 0.15;                  // stronger / weaker move the target by this share of the division
  // 2021 Carnegie class (IPEDS C21BASIC) -> step; special-focus and two-year classes have none
  var KIND_STEP = { 15: 0, 16: 1, 17: 2, 18: 3, 19: 3, 20: 3, 22: 4, 23: 4, 21: 5 };
  var KIND_LABEL = ["R1 research", "R2 research", "doctoral/professional", "master's", "baccalaureate", "arts & sciences"];
  var mixCache = {};

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  // the share of a school's bachelor's graduates in each 2-digit CIP field; null with no programs
  function programMix(ip, id) {
    if (id in mixCache) return mixCache[id];
    var mix = {}, any = false;
    Object.keys(ip.programs || {}).forEach(function (c) { var k = c.slice(0, 2); mix[k] = (mix[k] || 0) + ip.programs[c]; any = true; });
    return (mixCache[id] = any ? mix : null);
  }
  function cosine(a, b) {
    var s = 0, x = 0, y = 0, k;
    for (k in a) { x += a[k] * a[k]; if (k in b) s += a[k] * b[k]; }
    for (k in b) y += b[k] * b[k];
    return x && y ? s / Math.sqrt(x * y) : 0;
  }
  function similarFacts(m) {
    var d = D(), t = d.teams[m], s = schoolRecord(m), ip = t.ipedsId ? d.ipeds[String(t.ipedsId)] : null;
    var cs = campusSetting(s.ipeds.locale), kind = ip ? KIND_STEP[ip.carnegie] : undefined;
    return {
      name: m, division: t.division, rank: t.rank || null,
      size: ip && ip.size != null ? ip.size : null,
      isPublic: ip ? ip.control === 1 : null,
      cost: s.tuitionOutOfState > 0 ? s.tuitionOutOfState : null,
      mix: ip ? programMix(ip, t.ipedsId) : null,
      kind: kind === undefined ? null : kind,
      setting: cs ? SETTINGS.indexOf(cs) : null,
      climate: s.climate,
      place: isFinite(s.ipeds.lat) && isFinite(s.ipeds.lon) ? s.ipeds : null
    };
  }
  // the rows the starting school a has data for
  function similarHas(a, key) {
    return key === "level" ? a.rank !== null : key === "size" ? a.size !== null : key === "type" ? a.isPublic !== null :
           key === "cost" ? a.cost !== null : key === "academics" ? a.mix !== null : key === "kind" ? a.kind !== null :
           key === "setting" ? a.setting !== null : key === "climate" ? !!a.climate : !!a.place;
  }
  function similarRow(key) { return SIMILAR_ROWS.filter(function (r) { return r.key === key; })[0]; }
  // {row key: 0-1} for the rows both schools have; shift moves the volleyball target (a share of the division)
  function similarParts(a, b, sizes, shift) {
    var o = {}, near = function (d, span) { return clamp01(1 - Math.abs(d) / span); }, R = similarRow;
    if (a.rank !== null && b.rank !== null && a.division === b.division) {
      var n = sizes[a.division], target = Math.max(1, Math.min(n, a.rank + (shift || 0) * n));
      o.level = near(target - b.rank, R("level").span * n);
    }
    if (a.size !== null && b.size !== null) o.size = near(a.size - b.size, R("size").span);
    if (a.isPublic !== null && b.isPublic !== null) o.type = a.isPublic === b.isPublic ? 1 : 0;
    if (a.cost !== null && b.cost !== null) o.cost = near(Math.log(a.cost / b.cost), R("cost").span);
    if (a.mix && b.mix) o.academics = near(1 - cosine(a.mix, b.mix), R("academics").span);
    if (a.kind !== null && b.kind !== null) o.kind = near(a.kind - b.kind, R("kind").span);
    if (a.setting !== null && b.setting !== null) o.setting = near(a.setting - b.setting, R("setting").span);
    if (a.climate && b.climate) {
      var sp = R("climate").spans, v = [near(a.climate.julHigh - b.climate.julHigh, sp.jul), near(a.climate.janLow - b.climate.janLow, sp.jan)];
      if (a.climate.sky && b.climate.sky) v.push(near(a.climate.sky.clear + a.climate.sky.partly - b.climate.sky.clear - b.climate.sky.partly, sp.sunny));
      o.climate = v.reduce(function (x, y) { return x + y; }, 0) / v.length;
    }
    if (a.place && b.place) {
      var mi = milesBetween(a.place, b.place);
      if (mi !== null) o.location = near(mi, R("location").span);
    }
    return o;
  }
  // which rows a set filter takes over (it is required, so the row isn't scored)
  function similarOverrides(f, homeSet) {
    return {
      level: f.rankFrom !== null || (f.rankTo !== null && f.rankTo !== "max"),
      size: f.sizes.length > 0, type: f.types.length > 0, cost: f.costMax !== null,
      academics: false, kind: false, setting: f.settings.length > 0,
      climate: f.sunnyMin !== null || f.julyMax !== null || f.janMin !== null,
      location: f.states.length > 0 || f.regions.length > 0 || (f.distanceMax !== null && homeSet)
    };
  }
  function similarHint(a, key) {
    if (!similarHas(a, key)) return null;
    if (key === "level") return a.division + " #" + a.rank;
    if (key === "size") return SIZE_BANDS[a.size];
    if (key === "type") return a.isPublic ? "Public" : "Private";
    if (key === "cost") return "$" + a.cost.toLocaleString("en-US") + " out-of-state";
    if (key === "academics") return "program mix";
    if (key === "kind") return KIND_LABEL[a.kind];
    if (key === "setting") { var s = SETTINGS[a.setting]; return s.charAt(0).toUpperCase() + s.slice(1); }
    if (key === "climate") return a.climate.julHigh + "° July, " + a.climate.janLow + "° Jan" + (a.climate.sky ? ", " + (a.climate.sky.clear + a.climate.sky.partly) + " sunny days" : "");
    return [a.place.city, a.place.state].filter(Boolean).join(", ");
  }
  // the starting school and what each row will do: {facts, division, weight, active,
  //   rows: [{key, label, weight, hint, has, on, overridden, active}]}; null with no starting school.
  // active is false when no row is left to score (the list is then the plain filter list).
  function similarInfo(f, settings) {
    f = cleanFilters(f);
    if (!f.similarTo) return null;
    var a = similarFacts(f.similarTo), over = similarOverrides(f, !!(settings && settings.home)), weight = 0;
    var rows = SIMILAR_ROWS.map(function (r) {
      var has = similarHas(a, r.key), on = f.similarOff.indexOf(r.key) < 0, active = has && on && !over[r.key];
      if (active) weight += r.weight;
      return { key: r.key, label: r.label, weight: r.weight, hint: similarHint(a, r.key), has: has, on: on, overridden: over[r.key], active: active };
    });
    return { facts: a, name: f.similarTo, division: a.division, weight: weight, active: weight > 0, rows: rows,
             levelActive: rows[0].active };
  }
  function similarCloseness(score) { return score >= SIMILAR_CLOSE ? "Close" : score >= SIMILAR_GOOD ? "Good" : "Loose"; }
  // short reasons for the preview, heaviest rows first: {alike: [...], differ: [...]}
  function similarWhy(a, b, parts, rows) {
    var alike = [], differ = [];
    var say = {
      level: ["close in level", "far apart in level"],
      size: ["same size", "different size"],
      type: ["both " + (b.isPublic ? "public" : "private"), b.isPublic ? "public" : "private"],
      cost: ["similar cost", b.cost < a.cost ? "cheaper" : "costlier"],
      academics: ["similar programs", "different programs"],
      kind: ["both " + KIND_LABEL[b.kind], KIND_LABEL[b.kind]],
      setting: ["same setting", SETTINGS[b.setting]],
      climate: ["similar climate", "different climate"],
      location: ["nearby", "far away"]
    };
    rows.forEach(function (r) {
      if (!r.active || !(r.key in parts)) return;
      if (parts[r.key] >= 0.75) alike.push(say[r.key][0]);
      else if (parts[r.key] <= 0.25) differ.push(say[r.key][1]);
    });
    return { alike: alike, differ: differ };
  }
  // names passed the filters; -> {names: the list, scored: the same with scores, pool, leftOut}
  function similarCut(names, sim, f) {
    var a = sim.facts, sizes = divisionSizes(), leftOut = 0, scored = [];
    var dir = sim.levelActive && f.similarLevel !== "same" ? f.similarLevel : null;
    var shift = dir === "stronger" ? -SIMILAR_LEVEL_SHIFT : dir === "weaker" ? SIMILAR_LEVEL_SHIFT : 0;
    names.forEach(function (m) {
      if (m === a.name) return;
      var b = similarFacts(m);
      // stronger / weaker is required within the division; other divisions can't be compared by rank
      if (dir && b.division === a.division && (dir === "stronger" ? b.rank >= a.rank : b.rank <= a.rank)) return;
      var parts = similarParts(a, b, sizes, shift), w = 0, s = 0;
      sim.rows.forEach(function (r) { if (r.active && r.key in parts) { w += r.weight; s += r.weight * parts[r.key]; } });
      if (w < SIMILAR_MIN_DATA * sim.weight) { leftOut++; return; }
      scored.push({ name: m, score: s / w, parts: parts, facts: b });
    });
    scored.sort(function (x, y) { return y.score - x.score || x.name.localeCompare(y.name); });
    var kept = scored.slice(0, f.similarIncludeSeed ? f.similarLimit - 1 : f.similarLimit).map(function (x) {
      return { name: x.name, score: x.score, closeness: similarCloseness(x.score), parts: x.parts, why: similarWhy(a, x.facts, x.parts, sim.rows) };
    });
    if (kept.length && f.similarIncludeSeed) kept.unshift({ name: a.name, seed: true });
    return { names: kept.map(function (x) { return x.name; }), scored: kept, pool: scored.length, leftOut: leftOut };
  }

  // -> {matches: [Massey names, by division then Massey rank; closest first from a starting school],
  //     researched, notResearched, skipped: {filter: count of schools left out for missing data},
  //     majors: [{label, cips, schools}], unknownMajors: [terms], rank: {from, to, swapped}, homeSet, costRates,
  //     similar: null | {name, active, limit, scored, pool, leftOut}}
  function filterSchools(f, settings) {
    f = cleanFilters(f); settings = settings || blank();
    var d = D(), home = settings.home || null;
    var sim = similarInfo(f, settings), scoring = !!(sim && sim.active);
    // no division ticked (and no conference chosen): the starting school's division, because ranks only compare within one
    var divisions = f.divisions.length || !scoring || f.confs.length ? f.divisions : [sim.division];
    var majors = matchMajors(f.majors), useMajors = activeMajors(majors);
    var sizes = divisionSizes();
    var from = f.rankFrom, to = f.rankTo === "max" ? null : f.rankTo, swapped = false;
    if (from !== null && to !== null && from > to) { var x = from; from = to; to = x; swapped = true; }
    var costMajors = matchMajors(settings.majors);   // cost uses the settings' majors, as the reports do (WUE)
    var skipped = {}, offered = useMajors.map(function () { return 0; });
    var skip = function (k) { skipped[k] = (skipped[k] || 0) + 1; return false; };
    var rOnly = researchedOnlySet(f), leftOut = 0;
    var matches = Object.keys(d.teams).filter(function (m) {
      var t = d.teams[m];
      if (divisions.length && divisions.indexOf(t.division) < 0) return false;
      if (f.confs.length && f.confs.indexOf(t.division + "|" + t.conf) < 0) return false;
      if (from !== null && t.rank < from) return false;
      if (to !== null && to < sizes[t.division] && t.rank > to) return false;
      var s = schoolRecord(m), ip = t.ipedsId ? d.ipeds[String(t.ipedsId)] : null;
      if (useMajors.length) {
        var has = useMajors.map(function (mj) { return mj.cips.some(function (c) { return c in s.programs; }); });
        has.forEach(function (h, i) { if (h) offered[i]++; });
        if (!ip) return skip("majors");
        if (f.majorsMode === "all" ? has.indexOf(false) >= 0 : has.indexOf(true) < 0) return false;
      }
      if (f.sizes.length) {
        if (!ip || ip.size == null) return skip("size");
        if (f.sizes.indexOf(ip.size) < 0) return false;
      }
      if (f.types.length) {
        if (!ip) return skip("type");
        if (f.types.indexOf(ip.control === 1 ? "public" : "private") < 0) return false;
      }
      if (f.settings.length) {
        var cs = campusSetting(s.ipeds.locale);
        if (!cs) return skip("setting");
        if (f.settings.indexOf(cs) < 0) return false;
      }
      if (f.states.length || f.regions.length) {
        var st = s.ipeds.state;
        if (!st) return skip("state");
        var inState = f.states.indexOf(st) >= 0, inRegion = f.regions.indexOf(stateRegion(st)) >= 0;
        if (!inState && !inRegion) return false;
      }
      if (f.distanceMax !== null && home) {
        var mi = milesBetween(home, s.ipeds);
        if (mi === null) return skip("distance");
        if (mi > f.distanceMax) return false;
      }
      if (f.costMax !== null) {
        var c = resolveCost(s, settings, costMajors), cost = c.cost;
        if (cost !== null && f.costBasis === "total") cost = c.kind === "academy" ? 0 : s.living ? cost + s.living.parts[0] + s.living.parts[1] + s.living.parts[2] : null;
        if (cost === null) return skip("cost");
        if (cost > f.costMax) return false;
      }
      var cl = s.climate;
      if (f.sunnyMin !== null) {
        if (!cl || !cl.sky) return skip("sunny");
        if (cl.sky.clear + cl.sky.partly < f.sunnyMin) return false;
      }
      if (f.julyMax !== null || f.janMin !== null) {
        if (!cl) return skip("temperature");
        if (f.julyMax !== null && cl.julHigh > f.julyMax) return false;
        if (f.janMin !== null && cl.janLow < f.janMin) return false;
      }
      if (rOnly) {
        if (!s.researched) { if (!f.includeUnresearched) { leftOut++; return false; } return true; }
        if (f.confRankMax !== null) {
          var cr = parseInt(s.confRank, 10);
          if (!isFinite(cr)) return skip("confRank");
          if (cr > f.confRankMax) return false;
        }
        if (f.openings) {
          if (!s.players.length) return skip("openings");
          var open = settings.position === "S" ? setterOpenings([s]).length > 0 : positionOpenings([s], settings.position).length > 0;
          if (!open) return false;
        }
        if (f.offense.length) {
          var ok = offenseKind(s.offenseNote);
          if (!ok) return skip("offense");
          if (f.offense.indexOf(ok) < 0) return false;
        }
        if (f.beach) {
          if (s.beach === null) return skip("beach");
          if (!s.beach.program) return false;
        }
        if (f.faith) {
          if (s.aiaChapter === null && s.fcaChapter === null) return skip("faith");
          if (!s.aiaChapter && !s.fcaChapter) return false;
        }
        if (f.femaleCoach) {
          if (s.femaleCoachOnStaff === null || s.femaleCoachOnStaff === undefined) return skip("femaleCoach");
          if (!s.femaleCoachOnStaff) return false;
        }
      }
      return true;
    }).sort(function (a, b) {
      var ta = d.teams[a], tb = d.teams[b];
      return (DIV_ORDER[ta.division] || 9) - (DIV_ORDER[tb.division] || 9) || ta.rank - tb.rank || a.localeCompare(b);
    });
    var similar = sim ? { name: sim.name, active: scoring, limit: f.similarLimit, scored: [], pool: 0, leftOut: 0 } : null;
    if (scoring) {
      var cut = similarCut(matches, sim, f);
      matches = cut.names; similar.scored = cut.scored; similar.pool = cut.pool; similar.leftOut = cut.leftOut;
    }
    var nr = matches.filter(function (m) { return !!d.teams[m].researched; }).length;
    return {
      similar: similar,
      matches: matches, researched: nr, notResearched: matches.length - nr, skipped: skipped,
      majors: useMajors.map(function (mj, i) { return { label: mj.label, cips: mj.cips, schools: offered[i] }; }),
      unknownMajors: majors.filter(function (mj) { return !mj.cips.length; }).map(function (mj) { return mj.term; }),
      rank: { from: from, to: to, swapped: swapped, sizes: sizes },
      homeSet: !!home, distanceIgnored: f.distanceMax !== null && !home,
      // researched-only filters set: how many schools not researched yet they left out (0 with includeUnresearched)
      researchedOnly: rOnly, unresearchedLeftOut: leftOut,
      costRates: home ? "home" : "out-of-state"
    };
  }

  // a short name for the new list from the filters, at most SAVED_NAME_MAX characters
  function filterName(f) {
    f = cleanFilters(f);
    var bits = [];
    var sim = similarInfo(f);
    if (sim && sim.active) {
      bits.push(("Like " + f.similarTo).slice(0, SAVED_NAME_MAX));
      if (f.similarLevel !== "same") bits.push(f.similarLevel);
    }
    if (f.divisions.length && f.divisions.length < 3) bits.push(f.divisions.slice().sort().join("-"));
    if (f.confs.length === 1) bits.push(f.confs[0].split("|")[1]);
    if (f.regions.length === 1 && !f.states.length) bits.push(f.regions[0]);
    if (f.states.length === 1 && !f.regions.length) bits.push(f.states[0]);
    var mj = activeMajors(matchMajors(f.majors));
    if (mj.length) bits.push(mj.map(function (m) { return m.term.toLowerCase(); }).join("/"));
    if (f.costMax !== null) bits.push("<$" + (f.costMax >= 1000 ? Math.round(f.costMax / 1000) + "k" : f.costMax));
    if (f.sunnyMin !== null) bits.push(f.sunnyMin + "+ sun");
    if (f.confRankMax !== null) bits.push("top " + f.confRankMax);
    if (f.offense.length === 1) bits.push(f.offense[0] === "split" ? "3-way" : f.offense[0]);
    if (f.openings) bits.push("openings");
    if (f.beach) bits.push("beach");
    // whole parts only: a part that doesn't fit is left out rather than cut
    var name = "";
    bits.forEach(function (b) { var n = name ? name + " " + b : b; if (n.length <= SAVED_NAME_MAX) name = n; });
    return name || (bits[0] || "Filtered list").slice(0, SAVED_NAME_MAX);
  }

  root.Compare = {
    KEY: KEY, POSITIONS: POSITIONS, DEFAULTS: DEFAULTS, ALIASES: ALIASES, STATE_NAMES: STATE_NAMES,
    blank: blank, clean: clean, load: load, save: save, reset: reset,
    fromHash: fromHash, hashFor: hashFor, withSettings: withSettings,
    storageAvailable: function () { if (storageOk === null) storage(); return storageOk; },
    matchMajors: matchMajors, activeMajors: activeMajors,
    team: team, schoolRecord: schoolRecord,
    resolveCost: resolveCost, costFlag: costFlag, programsFor: programsFor, programLines: programLines,
    climateTemps: climateTemps, climateSky: climateSky, climateWhere: climateWhere,
    climateUrl: climateUrl,
    flagCols: flagCols, factYes: factYes, faithText: faithText, beachLabel: beachLabel, beachFlag: beachFlag,
    buildSchool: buildSchool, reportRows: reportRows,
    milesBetween: milesBetween, targetYear: targetYear, setterOpenings: setterOpenings,
    POSITION_SPEC: POSITION_SPEC, positionSpec: positionSpec, positionPlayers: positionPlayers,
    positionOpenings: positionOpenings, playerStat: playerStat, totalBlocks: totalBlocks, hitPct: hitPct, perSet: perSet,
    positionName: positionName, summary: summary, join: join,
    fold: fold, displayName: displayName, teamWhere: teamWhere, searchSchools: searchSchools,
    SAVED_KEY: SAVED_KEY, SAVED_KEY_V1: SAVED_KEY_V1, SAVED_LISTS: SAVED_LISTS, SAVED_NAME_MAX: SAVED_NAME_MAX,
    savedLoad: savedLoad, savedSave: savedSave, savedReset: savedReset,
    savedActive: savedActive, savedSetActive: savedSetActive, savedLists: savedLists,
    savedName: savedName, savedSetName: savedSetName,
    isSaved: isSaved, setSaved: setSaved, toggleSaved: toggleSaved, onSavedChange: onSavedChange,
    savedSort: savedSort, savedText: savedText, parseSaved: parseSaved, savedRows: savedRows,
    FILTER_KEY: FILTER_KEY, SIZE_BANDS: SIZE_BANDS, REGIONS: REGIONS, stateRegion: stateRegion,
    divisionSizes: divisionSizes, blankFilters: blankFilters, cleanFilters: cleanFilters,
    filtersLoad: filtersLoad, filtersSave: filtersSave, filtersActive: filtersActive,
    campusSetting: campusSetting, filterSchools: filterSchools, filterName: filterName,
    OFFENSES: OFFENSES, offenseKind: offenseKind, researchedOnlySet: researchedOnlySet,
    SIMILAR_ROWS: SIMILAR_ROWS, SIMILAR_LIMITS: SIMILAR_LIMITS, similarInfo: similarInfo, similarParts: similarParts,
    similarFacts: similarFacts,
    SPIRIT_SPORTS: SPIRIT_SPORTS, SPIRIT_BANDS: SPIRIT_BANDS, SPIRIT_MIN_PEERS: SPIRIT_MIN_PEERS,
    SPIRIT_MIN_SPORTS: SPIRIT_MIN_SPORTS, spiritBand: spiritBand, spiritPct: spiritPct, spiritAll: spiritAll,
    spiritOf: spiritOf, spiritPeerText: spiritPeerText, spiritText: spiritText,
    AIRLINES: AIRLINES, FLY_NEAR: FLY_NEAR, FLY_HOME: FLY_HOME, FLY_MIN_TICKETS: FLY_MIN_TICKETS, airlineName: airlineName,
    homeAirports: homeAirports,
    airlineUrl: airlineUrl, flightSearchUrl: flightSearchUrl,
    homeAirport: homeAirport, nonstopAirlines: nonstopAirlines, oneStopAirlines: oneStopAirlines,
    schoolFlights: schoolFlights, fareText: fareText, flightsText: flightsText
  };
})(typeof window !== "undefined" ? window : globalThis);
