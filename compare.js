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
      natRank: r ? r.natRank : t.rank, confRank: r ? r.confRank : null,
      // a hand-entered branch campus has no IPEDS locale of its own; leave it blank
      ipeds: { city: loc.city || null, state: loc.state || null, locale: t.campus ? (t.campus.locale || "") : (ip ? ip.locale : ""),
               lat: loc.lat, lon: loc.lon },
      tuitionInState: ip ? ip.tuitionInState : null, tuitionOutOfState: ip ? ip.tuitionOutOfState : null,
      programs: ip ? ip.programs : {},
      offenseNote: r ? r.offenseNote : null, coachStaff: r ? r.coachStaff : null,
      femaleCoachOnStaff: r ? r.femaleCoachOnStaff : null, aiaChapter: r ? r.aiaChapter : null,
      beach: r ? (r.beach === undefined ? null : r.beach) : null,
      setter: r ? r.setter || null : null, secondSetter: r ? r.secondSetter || null : null,
      thirdSetter: r ? r.thirdSetter || null : null,
      links: r ? r.links : { niche: t.niche }
    };
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
    cols.push({ key: "aia", label: "AiA chapter", short: "AiA", kind: "fact" });
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
    flags.aia = factFlag(s.aiaChapter); detail.aia = factText(s.aiaChapter);
    var offeredMajors = {};
    act.forEach(function (m) { offeredMajors[m.key] = offered[m.key].length > 0; });
    var row = {
      id: s.id, name: s.name, current: !!current, researched: s.researched, masseyName: s.masseyName,
      conf: isMember ? conf.memberName : s.confSlug ? D().conferences[s.confSlug].memberName : s.masseyConf,
      division: s.division, region: s.region, niche: s.niche,
      cost: c.cost, costBasis: basis, costKind: c.kind, costFootnotes: c.footnotes,
      earnings: s.earnings, natRank: s.natRank,
      confRank: isMember ? s.confRank : "—",
      ipeds: s.ipeds, programs: programLines(offered, act), offeredMajors: offeredMajors,
      offenseNote: s.offenseNote, coachStaff: s.coachStaff,
      flags: flags, flagDetail: detail, beach: s.beach, links: s.links
    };
    ["setter", "secondSetter", "thirdSetter"].forEach(function (k) { if (s[k]) row[k] = s[k]; });
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

  // ------------------------------------------------------------ misc
  function milesBetween(a, b) {
    if (!a || !b || !isFinite(a.lat) || !isFinite(b.lat)) return null;
    var r = 3958.8, rad = Math.PI / 180;
    var p1 = a.lat * rad, p2 = b.lat * rad, dp = p2 - p1, dl = (b.lon - a.lon) * rad;
    var h = Math.pow(Math.sin(dp / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(dl / 2), 2);
    return Math.round(2 * r * Math.asin(Math.sqrt(h)));
  }

  // fall of next season: Oct 2026 -> 2027 (§3 target year)
  function targetYear(now) { return (now || new Date()).getFullYear() + 1; }

  function setterOpenings(rows) {
    return rows.filter(function (r) { return !r.current && r.setter && SENIOR.indexOf(r.setter.cls) >= 0; });
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
  // A separate key from the settings: {v, schools: [Massey names, in the order saved], updated}.
  // Not carried in the URL hash (Q3); shared only as plain text (savedText / parseSaved).
  var SAVED_KEY = "ncaaCompare.saved.v1";
  var savedMem = null;   // this page's list when storage is blocked

  function savedClean(list) {
    var teams = D().teams, seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (m) {
      if (typeof m === "string" && teams[m] && !seen[m]) { seen[m] = true; out.push(m); }
    });
    return out;
  }

  // names that are no longer Massey teams (renamed in a later pull) are dropped
  function savedLoad() {
    var ls = storage();
    if (ls) {
      try {
        var raw = ls.getItem(SAVED_KEY);
        if (raw) return savedClean(JSON.parse(raw).schools);
        return [];
      } catch (e) { /* fall through */ }
    }
    return savedMem ? savedMem.slice() : [];
  }

  function savedSave(list) {
    var out = savedClean(list);
    savedMem = out.slice();
    var ls = storage();
    if (ls) {
      try { ls.setItem(SAVED_KEY, JSON.stringify({ v: 1, schools: out, updated: new Date().toISOString() })); }
      catch (e) { storageOk = false; }
    }
    return out;
  }

  function savedReset() {
    savedMem = [];
    var ls = storage();
    if (ls) { try { ls.removeItem(SAVED_KEY); } catch (e) { /* ignore */ } }
    return [];
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

  // another tab (an index or map opened from this one) changed the list
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

  // plain text, one school per line: "Name (D1, Conference)" plus " [researched]"
  function savedText(list, now) {
    var d = D(), sorted = savedSort(list);
    var lines = ["# NCAA women's volleyball: " + sorted.length + " saved school" + (sorted.length === 1 ? "" : "s") +
                 " (" + isoDay(now) + ")"];
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

  root.Compare = {
    KEY: KEY, POSITIONS: POSITIONS, DEFAULTS: DEFAULTS, ALIASES: ALIASES, STATE_NAMES: STATE_NAMES,
    blank: blank, clean: clean, load: load, save: save, reset: reset,
    fromHash: fromHash, hashFor: hashFor, withSettings: withSettings,
    storageAvailable: function () { if (storageOk === null) storage(); return storageOk; },
    matchMajors: matchMajors, activeMajors: activeMajors,
    team: team, schoolRecord: schoolRecord,
    resolveCost: resolveCost, costFlag: costFlag, programsFor: programsFor, programLines: programLines,
    flagCols: flagCols, beachLabel: beachLabel, beachFlag: beachFlag,
    buildSchool: buildSchool, reportRows: reportRows,
    milesBetween: milesBetween, targetYear: targetYear, setterOpenings: setterOpenings,
    positionName: positionName, summary: summary, join: join,
    fold: fold, displayName: displayName, teamWhere: teamWhere, searchSchools: searchSchools,
    SAVED_KEY: SAVED_KEY, savedLoad: savedLoad, savedSave: savedSave, savedReset: savedReset,
    isSaved: isSaved, setSaved: setSaved, toggleSaved: toggleSaved, onSavedChange: onSavedChange,
    savedSort: savedSort, savedText: savedText, parseSaved: parseSaved
  };
})(typeof window !== "undefined" ? window : globalThis);
