#!/usr/bin/env node
/**
 * NamingLens — Display Name Optimiser
 *
 * Searches over candidate display-name primary + fallback combinations and
 * scores each on four dimensions specific to display names:
 *
 *   Uniqueness         — fraction of pupils with a unique display name (0–5)
 *   Privacy            — population-weighted PII exposure across all levels (0–5)
 *   Safeguarding       — population-weighted exposure, higher weight on name/school (0–5)
 *   Recognisability    — does the primary pattern immediately identify the person? (0–5)
 *
 * Weights: Safeguarding 1.5 · Privacy 1.25 · Recognisability 1.0 · Uniqueness 0.75
 *
 * The two-phase approach mirrors findBestConvention.js:
 *   Phase 1 — pre-compute the DN cascade for each candidate combo
 *   Phase 2 — score all combos (O(1) per combo from cached level data)
 *
 * Usage: node scripts/findBestDisplayName.js
 */

import { createRequire }           from "module"
import { parsePattern }            from "../src/lib/parsePattern.js"
import { runDisplayNameCascade }   from "../src/lib/computeConventionResults.js"

const require = createRequire(import.meta.url)
const PUPILS  = require("../src/data/pupilDataset.json")

// ─────────────────────────────────────────────────────────────────────────────
// Scoring constants
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS      = { uniqueness: 0.75, privacy: 1.25, safeguarding: 1.5, recognisability: 1.0 }
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((s, w) => s + w, 0)

// ─────────────────────────────────────────────────────────────────────────────
// Candidate pools
// ─────────────────────────────────────────────────────────────────────────────

// Primary display-name patterns.
// Note: `seq` in a primary would give every pupil the suffix "A" because all
// pupils form single-member groups at level 0.  seq belongs in fallbacks only.
const DN_PRIMARY = [
  // Full name — most recognisable, highest PII
  "first last",
  "first middle last",
  "first m. last",

  // School-prefixed — adds geographic context
  "school \\- first last",
  "school \\- first m. last",
  "school \\- first last yy",
  "schoolname \\- first last",

  // Abbreviated first name
  "f. last",
  "ff. last",
  "fff. last",

  // Full first + surname initial
  "first l.",

  // Name + year — useful in large multi-school deployments
  "first last yy",
  "school \\- f. last",
  "f. last yy",
]

// Fallback level 1 — used when primary DN collides.
// Good fallbacks add the MINIMUM extra PII needed to break the tie.
const DN_FALLBACK1 = [
  "first last seq",           // sequential letter — no new PII
  "first last yy seq",        // year + seq
  "f. last seq",              // initial + surname + seq
  "first last yy",
  "f. last yy",
  "first m. last",            // add middle initial
  "first m. last seq",
  "first middle last",        // full middle name
  "school \\- first last",
  "school \\- first last seq",
  "school \\- first last yy",
  "school \\- first last yy seq",
  "school \\- first m. last",
]

// Fallback level 2 — reached only by the hardest collisions.
const DN_FALLBACK2 = [
  "first last yy seq",
  "first middle last seq",
  "first m. last yy seq",
  "school \\- first last seq",
  "school \\- first last yy seq",
  "school \\- first m. last seq",
  "school \\- first middle last",
]

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

function tryParse(pattern) {
  if (!pattern) return { tokens: [], error: null }
  return parsePattern(pattern, { allowSpaces: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

function hasToken(tokens, ...types) {
  return types.some((t) => tokens.some((tok) => tok.type === t))
}

// Fraction of pupils whose assigned DN level exposes any of the given token types.
function exposureFraction(levels, total, ...types) {
  if (!total) return 0
  let count = 0
  for (const { tokens, count: n } of levels) {
    if (tokens && tokens.length && hasToken(tokens, ...types)) count += n
  }
  return Math.min(1, count / total)
}

function scoreCombo(levels, unresolvedCount, totalPupils) {
  const total = totalPupils || 1

  // ── Uniqueness ────────────────────────────────────────────────────────────
  const assignedFraction = (total - unresolvedCount) / total
  const uniqueness = parseFloat((1 + 4 * assignedFraction).toFixed(2))

  // ── Privacy / data minimisation ───────────────────────────────────────────
  // Population-weighted PII deduction using product formula per element.
  // Display names use a single channel so product formula simplifies to direct fraction.
  const exp = (...t) => exposureFraction(levels, total, ...t)
  const privacyDeduction =
    exp("first")                  * 1   +
    exp("middle", "m")            * 1   +
    exp("last")                   * 1   +
    exp("yy", "yyyy")             * 1   +
    exp("school", "schoolname")   * 2   +  // geographic — double weight
    0.5                                     // pupil-mode constant
  const privacy = parseFloat(Math.max(1, 5 - privacyDeduction).toFixed(1))

  // ── Safeguarding exposure ─────────────────────────────────────────────────
  const safeDeduction =
    exp("first")                  * 1   +
    exp("middle", "m")            * 0.5 +
    exp("last")                   * 1   +
    exp("school", "schoolname")   * 1   +
    exp("yy", "yyyy")             * 0.5 +
    0.5                                     // pupil-mode constant
  const safeguarding = parseFloat(Math.max(1, 5 - safeDeduction).toFixed(1))

  // ── Recognisability ───────────────────────────────────────────────────────
  // Based on the primary pattern only: can a recipient immediately identify
  // whose display name this is without a directory lookup?
  const primary      = levels[0]?.tokens ?? []
  const hasFullFirst = hasToken(primary, "first")
  const hasFullLast  = hasToken(primary, "last")
  const hasInitFirst = hasToken(primary, "f", "ff", "fff")
  const hasInitLast  = hasToken(primary, "l")

  let recognisability
  if (hasFullFirst && hasFullLast)        recognisability = 5
  else if (hasFullFirst && hasInitLast)   recognisability = 4
  else if (hasInitFirst && hasFullLast)   recognisability = 4  // e.g. "O. Smith"
  else if (hasFullFirst || hasFullLast)   recognisability = 3
  else if (hasInitFirst && hasInitLast)   recognisability = 2
  else if (hasInitFirst || hasInitLast)   recognisability = 2
  else                                    recognisability = 1

  // ── Overall ──────────────────────────────────────────────────────────────
  const overall = parseFloat((
    (uniqueness     * WEIGHTS.uniqueness +
     privacy        * WEIGHTS.privacy +
     safeguarding   * WEIGHTS.safeguarding +
     recognisability * WEIGHTS.recognisability) / TOTAL_WEIGHT
  ).toFixed(2))

  return { uniqueness, privacy, safeguarding, recognisability, overall }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build candidate combos
// ─────────────────────────────────────────────────────────────────────────────

function buildCombos() {
  const seen   = new Set()
  const combos = []

  function add(patterns, allTokens) {
    const key = patterns.join("|")
    if (seen.has(key)) return
    seen.add(key)
    combos.push({ patterns, allTokens })
  }

  for (const p of DN_PRIMARY) {
    const { tokens: pt, error: pe } = tryParse(p)
    if (pe || !pt.length) continue
    add([p], [pt])

    for (const fb1 of DN_FALLBACK1) {
      const { tokens: f1t, error: f1e } = tryParse(fb1)
      if (f1e) continue
      add([p, fb1], [pt, f1t])

      for (const fb2 of DN_FALLBACK2) {
        const { tokens: f2t, error: f2e } = tryParse(fb2)
        if (f2e) continue
        add([p, fb1, fb2], [pt, f1t, f2t])
      }
    }
  }
  return combos
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

function progress(label, done, total) {
  const pct = Math.floor((done / total) * 30)
  process.stdout.write(`\r  ${label} [${"█".repeat(pct)}${"░".repeat(30 - pct)}] ${done}/${total}   `)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const t0 = Date.now()
console.log("\n\x1b[1m🔍  NamingLens Display Name Optimiser\x1b[0m\n")

const combos = buildCombos()
console.log(`  Candidate combos: ${combos.length}\n`)

const results = []
for (let i = 0; i < combos.length; i++) {
  progress("Computing cascades", i + 1, combos.length)
  const { patterns, allTokens } = combos[i]

  const cascade = runDisplayNameCascade(allTokens, PUPILS)
  const scores  = scoreCombo(cascade.levels, cascade.unresolvedCount, PUPILS.length)

  const levelStats = cascade.levels.map((lvl, idx) => ({
    pattern:   patterns[idx] ?? "—",
    assigned:  lvl.count,
    incoming:  lvl.incoming,
    remaining: lvl.incoming - lvl.count,
  }))

  results.push({
    patterns,
    levels: cascade.levels,
    levelStats,
    unresolvedCount:   cascade.unresolvedCount,
    primaryCollisions: (cascade.levels[0]?.incoming ?? 0) - (cascade.levels[0]?.count ?? 0),
    ...scores,
  })
}
console.log()

results.sort((a, b) => b.overall - a.overall || a.unresolvedCount - b.unresolvedCount)
console.log(`  Scored in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

const W_TABLE = 146

function pad(s, n)   { return String(s).padEnd(n) }
function padL(s, n)  { return String(s).padStart(n) }
function fmtPct(n)   { return `${(n * 100).toFixed(0)}%` }
function fmtScore(s) {
  if (typeof s !== "number") return String(s)
  return Number.isInteger(s) ? String(s) : s.toFixed(1)
}
function fmtPatterns(arr, maxLen = 62) {
  const s = arr.join(" → ")
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s
}

function printTable(title, rows, limit = 20) {
  console.log(`\n${"─".repeat(W_TABLE)}`)
  console.log(` \x1b[1m${title}\x1b[0m`)
  console.log("─".repeat(W_TABLE))

  const hdr = [
    padL("Rank", 4),
    pad("Pattern(s)", 64),
    padL("Overall", 8),
    padL("Priv", 6),
    padL("Safe", 6),
    padL("Recog", 6),
    padL("Unique", 7),
    padL("1°Cols", 7),
    padL("Unres", 6),
  ].join("  ")
  console.log(hdr)
  console.log("─".repeat(W_TABLE))

  rows.slice(0, limit).forEach((r, i) => {
    const line = [
      padL(i + 1, 4),
      pad(fmtPatterns(r.patterns), 64),
      padL(r.overall.toFixed(2), 8),
      padL(fmtScore(r.privacy), 6),
      padL(fmtScore(r.safeguarding), 6),
      padL(fmtScore(r.recognisability), 6),
      padL(fmtScore(r.uniqueness.toFixed(1)), 7),
      padL(r.primaryCollisions, 7),
      padL(r.unresolvedCount, 6),
    ].join("  ")

    if (i === 0)      process.stdout.write(`\x1b[32m${line}\x1b[0m\n`)
    else if (i < 3)   process.stdout.write(`\x1b[36m${line}\x1b[0m\n`)
    else if (i < 10)  process.stdout.write(`\x1b[2m${line}\x1b[0m\n`)
    else              console.log(line)
  })
  console.log("─".repeat(W_TABLE))
}

// Main tables
printTable("TOP 20 — Overall weighted score", results, 20)

printTable(
  "TOP 10 — Best privacy / data minimisation (least PII exposure)",
  [...results].sort((a, b) => b.privacy - a.privacy || b.overall - a.overall),
  10,
)

printTable(
  "TOP 10 — Best safeguarding exposure",
  [...results].sort((a, b) => b.safeguarding - a.safeguarding || b.overall - a.overall),
  10,
)

printTable(
  "TOP 10 — Best recognisability",
  [...results].sort((a, b) => b.recognisability - a.recognisability || b.overall - a.overall),
  10,
)

const fullyResolved = results.filter((r) => r.unresolvedCount === 0)
printTable(
  `TOP 10 — Fully resolved (0 unresolved) — ${fullyResolved.length.toLocaleString("en-GB")} qualifying combos`,
  fullyResolved,
  10,
)

// High-uniqueness, acceptable privacy: ≥98% unique and privacy ≥ 2.
const efficient = results.filter((r) => r.uniqueness >= 4.9 && r.privacy >= 2)
printTable(
  `TOP 10 — ≥98% unique AND privacy ≥ 2.0 — ${efficient.length.toLocaleString("en-GB")} qualifying combos`,
  [...efficient].sort((a, b) => b.privacy - a.privacy || b.overall - a.overall),
  10,
)

// ─────────────────────────────────────────────────────────────────────────────
// Winner detail
// ─────────────────────────────────────────────────────────────────────────────

const winner = results[0]
console.log(`\n${"═".repeat(W_TABLE)}`)
console.log("  \x1b[1m🏆  WINNER\x1b[0m")
console.log(`${"═".repeat(W_TABLE)}`)
console.log()

winner.levelStats.forEach((lvl, i) => {
  const label   = i === 0 ? "Primary " : `Fallback ${i}`
  const pct     = lvl.incoming > 0 ? fmtPct(lvl.assigned / lvl.incoming) : "—"
  const toks    = winner.levels[i]?.tokens ?? []
  const piiNote = [
    hasToken(toks, "first")               && "first name",
    hasToken(toks, "middle", "m")         && "middle name/initial",
    hasToken(toks, "last")                && "surname",
    hasToken(toks, "yy", "yyyy")         && "intake year",
    hasToken(toks, "school", "schoolname") && "school",
  ].filter(Boolean)

  console.log(
    `  ${pad(label, 10)}  ${pad(lvl.pattern, 40)}` +
    `  ${padL(lvl.incoming.toLocaleString("en-GB"), 6)} incoming` +
    `  ${padL(lvl.assigned.toLocaleString("en-GB"), 6)} assigned (${pct})` +
    `  ${padL(lvl.remaining > 0 ? lvl.remaining.toLocaleString("en-GB") : "—", 6)} remaining` +
    (piiNote.length ? `   PII: ${piiNote.join(", ")}` : "   PII: none")
  )
})

if (winner.unresolvedCount > 0) {
  console.log(`\n  \x1b[31m${winner.unresolvedCount} pupils remain unresolved after all levels\x1b[0m`)
} else {
  console.log(`\n  \x1b[32m✓ All pupils assigned a unique display name\x1b[0m`)
}

console.log()
console.log(`  ${"─".repeat(50)}`)
console.log(`  Overall:              \x1b[32m${winner.overall.toFixed(2)}/5\x1b[0m`)
console.log(`  Privacy:              ${fmtScore(winner.privacy)}/5`)
console.log(`  Safeguarding:         ${fmtScore(winner.safeguarding)}/5`)
console.log(`  Recognisability:      ${winner.recognisability}/5`)
console.log(`  Uniqueness:           ${winner.uniqueness.toFixed(2)}/5  (${fmtPct((PUPILS.length - winner.unresolvedCount) / PUPILS.length)} of pupils)`)
console.log()

// ─────────────────────────────────────────────────────────────────────────────
// Trade-off summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`${"═".repeat(W_TABLE)}`)
console.log("  \x1b[1mTrade-off summary\x1b[0m  (comparing fully-resolved combos by privacy score)")
console.log(`${"═".repeat(W_TABLE)}`)

const best5 = [...fullyResolved]
  .sort((a, b) => b.privacy - a.privacy || b.overall - a.overall)
  .slice(0, 5)

if (!best5.length) {
  console.log("  No fully-resolved combos found in the candidate pool.")
} else {
  best5.forEach((r, i) => {
    const bar = "▓".repeat(Math.round(r.privacy)) + "░".repeat(5 - Math.round(r.privacy))
    console.log()
    console.log(`  ${i + 1}. \x1b[36m${r.patterns.join(" → ")}\x1b[0m`)
    console.log(`     Privacy ${bar} ${r.privacy.toFixed(1)}   Safeguarding ${r.safeguarding.toFixed(1)}   Recognisability ${r.recognisability}   Overall ${r.overall.toFixed(2)}`)
  })
}

console.log()
console.log("  Dimension weights applied:")
for (const [dim, w] of Object.entries(WEIGHTS)) {
  console.log(`    ${pad(dim, 18)} × ${w}`)
}
console.log(`\n  Dataset: ${PUPILS.length.toLocaleString("en-GB")} pupils`)
console.log()
