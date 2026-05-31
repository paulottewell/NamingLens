#!/usr/bin/env node
/**
 * NamingLens — Convention Optimiser
 *
 * Two-phase search over curated address and display-name pattern combinations:
 *
 *   Phase 1 — Pre-compute cascades
 *     For every candidate address combo and every candidate display-name combo,
 *     run the full 16,500-pupil cascade once and store the resulting level data.
 *
 *   Phase 2 — Score all pairs
 *     Combine each pre-computed address cascade with each pre-computed DN cascade
 *     and call computeAllScores() (near-O(1) per pair given the cached level data).
 *
 * Dimensions and weights (from src/scoring/overall/weights.js):
 *   Safeguarding exposure       ×1.50
 *   Privacy / data minimisation ×1.50
 *   Enumeration resistance      ×1.25
 *   Usability by phase          ×1.00
 *   Operational robustness      ×1.00
 *   Recognisability             ×0.75
 *   Collision resilience        ×0.75
 *   Changeability / lifecycle   ×0.75
 *   Interoperability            ×0.50
 *
 * Usage: node scripts/findBestConvention.js
 */

import { createRequire }         from "module"
import { parsePattern }          from "../src/lib/parsePattern.js"
import { generateAddress }       from "../src/lib/generateAddress.js"
import { runAddressCascade,
         runDisplayNameCascade } from "../src/lib/computeConventionResults.js"
import { computeAllScores }      from "../src/scoring/index.js"
import { DIMENSION_WEIGHTS,
         DIMENSION_LABELS,
         DIMENSION_ORDER }       from "../src/scoring/overall/weights.js"

const require    = createRequire(import.meta.url)
const PUPILS     = require("../src/data/pupilDataset.json")

const SUBDOMAIN_MODE = "stu"
const BASE_DOMAIN    = "westst.org.uk"
const DOMAIN         = `${SUBDOMAIN_MODE}.${BASE_DOMAIN}`
const MODE           = "pupil"
const domainFn       = () => DOMAIN

// ─────────────────────────────────────────────────────────────────────────────
// Candidate pools
// ─────────────────────────────────────────────────────────────────────────────

// Primary email address patterns. Ordered loosely by ascending PII exposure.
const ADDR_PRIMARY = [
  // Initials + surname
  "f.last", "ff.last", "fff.last",
  // Full name
  "first.last",
  // Initials only
  "f.l", "fl",
  // Full first + surname initial
  "first.l",
  // Year + surname (no first name)
  "yylast", "yy.last",
  // Year + initial + surname
  "yyflast", "yy.f.last", "yyfflast", "yy.ff.last",
  // Year + surname + initial
  "yylastf", "yy.last.f",
  // Year + full name
  "yy.first.last",
  // Random-augmented primaries — with and without dot separator
  "f.lastNN",  "flastNN",
  "f.lastNNN", "flastNNN",
  "ff.lastNN", "fflastNN",
  // School-scoped
  "school.f.last", "school.ff.last",
]

// Fallback level 1. Should add the MINIMUM extra PII needed to disambiguate.
// `seq` is meaningful here (only colliders reach this level).
const ADDR_FALLBACK1 = [
  "f.last.seq",           // add sequential letter — no new PII
  "ff.last.seq",
  "fff.last.seq",
  "first.last.seq",
  "f.last.yy",            // add intake year
  "ff.last.yy",
  "first.last.yy",
  "f.last.yy.seq",        // year + sequential
  "first.last.yy.seq",
  "f.lastNN",  "flastNN",
  "f.lastNNN", "flastNNN",
  "first.lastNN",
  "f.m.last",             // add middle initial
  "f.last.m",
  "ff.last.m",
]

// Fallback level 2. Only reached by the hardest collisions.
const ADDR_FALLBACK2 = [
  "f.last.yy.seq",
  "first.last.seq",
  "first.last.yy",
  "first.last.yy.seq",
  "first.lastNN", "firstlastNN",
  "f.m.last.seq",
  "first.m.last.seq",
]

// Primary display-name patterns.
const DN_PRIMARY = [
  "",                               // no display-name convention
  "first last",
  "school \\- first last",
  "first last yy",
  "school \\- first last yy",
  "f. last",
  "first m. last",
  "first middle last",
  "school \\- first middle last",
]

// Display-name fallback patterns.
const DN_FALLBACK1 = [
  "first last yy",
  "first last seq",
  "first last yy seq",
  "school \\- first last yy",
  "school \\- first last seq",
  "school \\- first last yy seq",
  "first middle last",
  "first middle last seq",
  "first m. last seq",
]

// ─────────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

function tryParse(pattern, opts = {}) {
  if (!pattern) return { tokens: [], error: null }
  return parsePattern(pattern, opts)
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary-address stats (cached per primary pattern)
// ─────────────────────────────────────────────────────────────────────────────

const _statsCache = new Map()

function getPrimaryStats(primaryTokens) {
  const key = primaryTokens.map((t) => t.type + (t.raw ?? "")).join("|")
  if (!_statsCache.has(key)) {
    const addrs   = PUPILS.map((p) => generateAddress(primaryTokens, p, DOMAIN, 1))
    const total   = addrs.length
    const unique  = new Set(addrs).size
    const cols    = total - unique
    const lengths = addrs.map((a) => a.length)
    _statsCache.set(key, {
      total,
      unique,
      collisions:   cols,
      collisionPct: total > 0 ? (cols / total) * 100 : 0,
      longestLength: Math.max(...lengths),
      avgLength:     lengths.reduce((s, l) => s + l, 0) / lengths.length,
    })
  }
  return _statsCache.get(key)
}

// ─────────────────────────────────────────────────────────────────────────────
// Build candidate combo lists
// ─────────────────────────────────────────────────────────────────────────────

function buildAddressCombos() {
  const seen   = new Set()
  const combos = []

  function add(patterns, allTokens) {
    const key = patterns.join("|")
    if (seen.has(key)) return
    seen.add(key)
    combos.push({ patterns, allTokens })
  }

  for (const p of ADDR_PRIMARY) {
    const { tokens: pt, error: pe } = tryParse(p)
    if (pe || !pt.length) continue
    add([p], [pt])

    for (const fb1 of ADDR_FALLBACK1) {
      const { tokens: f1t, error: f1e } = tryParse(fb1)
      if (f1e) continue
      add([p, fb1], [pt, f1t])

      for (const fb2 of ADDR_FALLBACK2) {
        const { tokens: f2t, error: f2e } = tryParse(fb2)
        if (f2e) continue
        add([p, fb1, fb2], [pt, f1t, f2t])
      }
    }
  }
  return combos
}

function buildDnCombos() {
  const seen   = new Set()
  const combos = []

  function add(patterns, allTokens) {
    const key = patterns.join("|")
    if (seen.has(key)) return
    seen.add(key)
    combos.push({ patterns, allTokens })
  }

  add([], [])   // no display-name convention

  for (const dp of DN_PRIMARY) {
    if (!dp) continue
    const { tokens: dt, error: de } = tryParse(dp, { allowSpaces: true })
    if (de || !dt.length) continue
    add([dp], [dt])

    for (const df1 of DN_FALLBACK1) {
      const { tokens: df1t, error: df1e } = tryParse(df1, { allowSpaces: true })
      if (df1e) continue
      add([dp, df1], [dt, df1t])
    }
  }
  return combos
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────────────────────

function progress(label, done, total) {
  const pct = Math.floor((done / total) * 30)
  process.stdout.write(`\r  ${label} [${"█".repeat(pct)}${"░".repeat(30 - pct)}] ${done}/${total}   `)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const t0 = Date.now()
console.log("\n\x1b[1m🔍  NamingLens Convention Optimiser\x1b[0m\n")

const addrCombos = buildAddressCombos()
const dnCombos   = buildDnCombos()

console.log(`  Address pattern combos : ${addrCombos.length}`)
console.log(`  Display-name combos    : ${dnCombos.length}`)
console.log(`  Total pairs to score   : ${(addrCombos.length * dnCombos.length).toLocaleString("en-GB")}`)
console.log()

// ── Phase 1a: address cascades ───────────────────────────────────────────────
const addrResults = []
for (let i = 0; i < addrCombos.length; i++) {
  progress("Address cascades  ", i + 1, addrCombos.length)
  const combo   = addrCombos[i]
  const cascade = runAddressCascade(combo.allTokens, PUPILS, domainFn)
  const stats   = getPrimaryStats(combo.allTokens[0])
  addrResults.push({ ...combo, levels: cascade.levels, unresolvedCount: cascade.unresolvedCount, stats })
}
console.log()

// ── Phase 1b: DN cascades ────────────────────────────────────────────────────
const dnResults = []
for (let i = 0; i < dnCombos.length; i++) {
  progress("Display-name cascades", i + 1, dnCombos.length)
  const combo = dnCombos[i]
  if (!combo.allTokens.length) {
    dnResults.push({ ...combo, levels: [], unresolvedCount: 0 })
    continue
  }
  const cascade = runDisplayNameCascade(combo.allTokens, PUPILS)
  dnResults.push({ ...combo, levels: cascade.levels, unresolvedCount: cascade.unresolvedCount })
}
console.log()

// ── Phase 2: scoring ─────────────────────────────────────────────────────────
process.stdout.write("  Scoring all pairs      …")
const results = []
for (const addr of addrResults) {
  for (const dn of dnResults) {
    const scoringResult = computeAllScores({
      primaryTokens:    addr.allTokens[0],
      allAddressTokens: addr.allTokens,
      allDnTokens:      dn.allTokens,
      addressLevels:    addr.levels,
      dnLevels:         dn.levels,
      totalPupils:      PUPILS.length,
      stats:            addr.stats,
      subdomainMode:    SUBDOMAIN_MODE,
      mode:             MODE,
    })
    results.push({
      addrPatterns:    addr.patterns,
      dnPatterns:      dn.patterns,
      overall:         scoringResult.adjustedScore,
      rawScore:        scoringResult.rawScore,
      scores:          scoringResult.scores,
      warnings:        scoringResult.warnings,
      riskBand:        scoringResult.riskBand,
      unresolvedCount: addr.unresolvedCount,
      dnUnresolved:    dn.unresolvedCount ?? 0,
      stats:           addr.stats,
    })
  }
}
results.sort((a, b) => b.overall - a.overall || a.unresolvedCount - b.unresolvedCount)
console.log(` done  (${((Date.now() - t0) / 1000).toFixed(1)}s total)\n`)

// ─────────────────────────────────────────────────────────────────────────────
// Output helpers
// ─────────────────────────────────────────────────────────────────────────────

// Short abbreviations for the table header.
const DIM_ABBREV = {
  safeguardingExposure:    "Safe",
  privacyDataMinimisation: "Priv",
  enumerationResistance:   "Enum",
  usabilityByPhase:        "UX",
  operationalRobustness:   "Ops",
  recognisability:         "Recog",
  collisionResilience:     "Col",
  changeabilityLifecycle:  "Chg",
  interoperability:        "Intr",
}

function pad(s, n)   { return String(s).padEnd(n) }
function padL(s, n)  { return String(s).padStart(n) }
function fmtScore(s) {
  if (typeof s !== "number") return String(s)
  return Number.isInteger(s) ? String(s) : s.toFixed(1)
}
function fmtPattern(arr, maxLen = 50) {
  const s = arr.length ? arr.join(" → ") : "(none)"
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s
}
function redCount(warnings)   { return warnings.filter((w) => w.severity === "red").length }
function amberCount(warnings) { return warnings.filter((w) => w.severity === "amber").length }

function printTable(title, rows, limit = 20) {
  const W = 168
  console.log(`\n${"─".repeat(W)}`)
  console.log(` \x1b[1m${title}\x1b[0m`)
  console.log("─".repeat(W))

  const hdr = [
    padL("Rank", 4),
    pad("Address pattern(s)",      48),
    pad("Display-name pattern(s)", 36),
    padL("Score", 6),
    padL("Band", 12),
    ...DIMENSION_ORDER.map((d) => padL(DIM_ABBREV[d], 5)),
    padL("⚠R", 3),
    padL("Unres", 6),
    padL("AvgL", 5),
  ].join("  ")
  console.log(hdr)
  console.log("─".repeat(W))

  rows.slice(0, limit).forEach((r, i) => {
    const line = [
      padL(i + 1, 4),
      pad(fmtPattern(r.addrPatterns, 48), 48),
      pad(fmtPattern(r.dnPatterns,   36), 36),
      padL(r.overall != null ? r.overall.toFixed(2) : "—", 6),
      pad(r.riskBand ?? "—", 12),
      ...DIMENSION_ORDER.map((d) => padL(fmtScore(r.scores[d]?.score ?? "—"), 5)),
      padL(redCount(r.warnings), 3),
      padL(r.unresolvedCount, 6),
      padL(Math.round(r.stats.avgLength), 5),
    ].join("  ")

    if (i === 0)      process.stdout.write(`\x1b[32m${line}\x1b[0m\n`)
    else if (i < 3)   process.stdout.write(`\x1b[36m${line}\x1b[0m\n`)
    else if (i < 10)  process.stdout.write(`\x1b[2m${line}\x1b[0m\n`)
    else              console.log(line)
  })
  console.log("─".repeat(W))
}

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

printTable("TOP 20 — Overall adjusted score", results, 20)

printTable(
  "TOP 10 — Best privacy / data minimisation",
  [...results].sort((a, b) =>
    (b.scores.privacyDataMinimisation?.score ?? 0) - (a.scores.privacyDataMinimisation?.score ?? 0) ||
    b.overall - a.overall
  ),
  10,
)

printTable(
  "TOP 10 — Best safeguarding exposure",
  [...results].sort((a, b) =>
    (b.scores.safeguardingExposure?.score ?? 0) - (a.scores.safeguardingExposure?.score ?? 0) ||
    b.overall - a.overall
  ),
  10,
)

printTable(
  "TOP 10 — Best recognisability",
  [...results].sort((a, b) =>
    (b.scores.recognisability?.score ?? 0) - (a.scores.recognisability?.score ?? 0) ||
    b.overall - a.overall
  ),
  10,
)

printTable(
  "TOP 10 — Best enumeration resistance",
  [...results].sort((a, b) =>
    (b.scores.enumerationResistance?.score ?? 0) - (a.scores.enumerationResistance?.score ?? 0) ||
    b.overall - a.overall
  ),
  10,
)

const fullyUnique = results.filter((r) => r.unresolvedCount === 0)
printTable(
  `TOP 10 — Fully resolved (0 unresolved) — ${fullyUnique.length.toLocaleString("en-GB")} qualifying combos`,
  fullyUnique,
  10,
)

// No-PII-in-primary-address strategy (display name carries identification).
const noPiiInAddr = results.filter((r) => {
  const pt = r.addrPatterns[0]
  return !pt.includes("first") && !pt.includes("last") && !pt.includes("school")
})
printTable(
  `TOP 10 — No PII in primary address token — ${noPiiInAddr.length.toLocaleString("en-GB")} qualifying combos`,
  noPiiInAddr,
  10,
)

// No red warnings.
const noRedWarnings = results.filter((r) => redCount(r.warnings) === 0)
printTable(
  `TOP 10 — No red-flag warnings — ${noRedWarnings.length.toLocaleString("en-GB")} qualifying combos`,
  noRedWarnings,
  10,
)

// ─────────────────────────────────────────────────────────────────────────────
// Winner summary
// ─────────────────────────────────────────────────────────────────────────────

const winner = results[0]
const W = 80
console.log(`\n${"═".repeat(W)}`)
console.log("  \x1b[1m🏆  WINNER\x1b[0m")
console.log(`${"═".repeat(W)}`)
console.log(`  Address cascade:    ${winner.addrPatterns.join(" → ")}`)
console.log(`  Display name:       ${winner.dnPatterns.join(" → ") || "(none)"}`)
console.log(`  Adjusted score:     \x1b[32m${winner.overall?.toFixed(2)}/5\x1b[0m  (raw ${winner.rawScore?.toFixed(2)}/5)`)
console.log(`  Risk band:          ${winner.riskBand}`)
console.log(`  Unresolved pupils:  ${winner.unresolvedCount}`)
console.log(`  Avg address length: ${Math.round(winner.stats.avgLength)} chars`)
console.log(`  Red warnings:       ${redCount(winner.warnings)}`)
console.log(`  Amber warnings:     ${amberCount(winner.warnings)}`)
console.log()
console.log("  Dimension scores:")
for (const dim of DIMENSION_ORDER) {
  const s   = winner.scores[dim]
  const bar = s ? "▓".repeat(Math.round(s.score)) + "░".repeat(5 - Math.round(s.score)) : "░░░░░"
  const lbl = DIMENSION_LABELS[dim] ?? dim
  console.log(`    ${pad(lbl, 28)} ${bar}  ${s ? fmtScore(s.score) : "—"}/5`)
}

if (winner.warnings.length > 0) {
  console.log()
  console.log("  Warnings:")
  for (const w of winner.warnings.filter((w) => w.severity !== "info")) {
    const prefix = w.severity === "red" ? "\x1b[31m✕\x1b[0m" : "\x1b[33m⚠\x1b[0m"
    console.log(`    ${prefix}  ${w.title}`)
  }
}

console.log(`\n${"═".repeat(W)}`)

// Dimension weights
console.log("\n  Dimension weights applied:")
for (const [dim, w] of Object.entries(DIMENSION_WEIGHTS)) {
  const lbl = DIMENSION_LABELS[dim] ?? dim
  console.log(`    ${pad(lbl, 30)} × ${w}`)
}
console.log(`\n  Subdomain: ${SUBDOMAIN_MODE}.${BASE_DOMAIN}`)
console.log(`  Dataset:   ${PUPILS.length.toLocaleString("en-GB")} pupils`)
console.log()
