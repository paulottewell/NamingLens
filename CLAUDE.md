# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**NamingLens** is a client-side React governance tool for UK schools and Multi-Academy Trusts (MATs) to evaluate, compare, and optimise pupil email naming conventions before deployment. IT admins enter pattern strings (e.g. `f.last`, `yylastNN`) and the app scores them across nine dimensions covering privacy, safeguarding, operational risk and usability, against a synthetic dataset of 16,500 fictitious pupils drawn from 31 real schools in South West England.

All computation is local — no backend, no authentication, no real pupil data.

## Commands

```bash
npm run dev              # start Vite dev server at http://localhost:5173
npm run build            # production build to dist/
npm run test             # run vitest unit tests (57 tests)
npm run test:watch       # vitest in watch mode
npm run generate:dataset # regenerate src/data/pupilDataset.json
npm run find:best        # run the address convention optimiser (~90s with new scoring)
npm run find:best-dn     # run the display name convention optimiser (~12s)
```

## High-level architecture

```
pupilDataset.json (16,500 pupils)
       │
       ▼
computeConventionResults()      ← called per convention on every keystroke (useMemo)
       │
       ├── parsePattern()            ← tokenises pattern string
       ├── runAddressCascade()       ← assigns unique addresses level by level
       ├── runDisplayNameCascade()
       └── computeAllScores()        ← new 9-dimension scoring engine
             │
             ├── 9 dimension scorers (src/scoring/dimensions/)
             ├── evaluateWarnings()  (src/scoring/warnings/)
             ├── classifyDecisionPosture() (src/scoring/profiles/)
             └── computeCompositeScore()  (src/scoring/overall/)
```

## File structure

```
src/
  components/
    App.jsx                  ← global settings, comparison table, convention list
    ConventionPanel.jsx      ← per-convention collapsible UI (inputs + all result sections)
    ScoreCard.jsx            ← individual dimension score card

  lib/
    parsePattern.js          ← tokeniser (do not change token ordering)
    generateAddress.js       ← renders tokens → addresses/display names
    computeConventionResults.js  ← cascade engine + top-level orchestration
    weights.js               ← re-exports from src/scoring/overall/weights.js
    score.js                 ← LEGACY: old 6-dimension scorer, no longer used by the app
                                       kept only as reference; do not import in new code

  scoring/                   ← NEW scoring architecture (added in refactor)
    index.js                 ← computeAllScores() — main entry point
    utils.js                 ← clamp, pctLabel, fmtPct
    exposure/
      piiHelpers.js          ← hasToken, piiElementsForTokens, weightedExposureFraction,
                                combinedExposureProduct, populationWeightedScore,
                                isPupilStatusVisible, computeFallbackStats, computeFairnessStats
    dimensions/
      collisionResilience.js
      privacyDataMinimisation.js
      safeguardingExposure.js
      recognisability.js
      enumerationResistance.js
      usabilityByPhase.js
      operationalRobustness.js
      changeabilityLifecycle.js
      interoperability.js
    warnings/
      warningRules.js        ← evaluateWarnings() → NamingWarning[]
    profiles/
      decisionPosture.js     ← classifyDecisionPosture(), buildDecisionProfile()
    overall/
      weights.js             ← DIMENSION_WEIGHTS, DIMENSION_LABELS, DIMENSION_ORDER, weightedOverall()
      compositeScore.js      ← computeCompositeScore() with hard caps
    __tests__/
      scoring.test.js        ← 57 vitest unit tests

  data/
    pupilDataset.json        ← generated; do not edit by hand
    pupils.js                ← 105 hand-crafted pupils for manual testing
    schools.js               ← 3-letter code → full name map (31 schools)

scripts/
  findBestConvention.js      ← optimiser: address + DN pairs (~299k), uses computeAllScores
  findBestDisplayName.js     ← optimiser: DN combos only (~1,470), uses inline scoring
  generatePupilDataset.js    ← dataset generator
```

## Pupil record shape

```js
{ id, gender, first, middle, last, year, school }
// middle is null for ~45% of pupils
// school is a lowercase 3-letter code (e.g. "ivy", "pls")
// year is intake year (e.g. 2024)
```

## Pattern token system

`parsePattern(pattern, { allowSpaces })` returns `{ tokens, error }`. Each token: `{ type, raw, value? }`.

| Written | type | Renders as |
|---|---|---|
| `first` / `First` / `firstname` | `first` | full first name (normalised) |
| `last` / `Last` / `lastname` | `last` | full surname (normalised) |
| `middle` / `Middle` | `middle` | full middle name (normalised; empty if none) |
| `f` / `F` | `f` | first initial |
| `ff` / `FF` | `ff` | first 2 letters |
| `fff` / `FFF` | `fff` | first 3 letters |
| `l` / `L` | `l` | surname initial |
| `m` / `M` | `m` | middle initial |
| `yy` | `yy` | 2-digit intake year |
| `yyyy` | `yyyy` | 4-digit intake year |
| `NN` `NNN` `NNNN` | same | random N-digit number (seeded, stable) |
| `A` `AA` `AAA` `AAAA` | same | random N-letter string (seeded, stable) |
| `seq` | `seq` | sequential disambiguator: A, B, C… (only meaningful in fallback levels) |
| `school` | `school` | school code uppercased (e.g. `IVY`) |
| `schoolname` | `schoolname` | full school name |
| `\X` | `literal` | the character X literally |

Email separators: any RFC 5321 special character.  
Display name separators (`allowSpaces: true`): space, comma, `.`, `-`, `_`.

**Critical ordering rule**: `TOKENS` in `parsePattern.js` is ordered longest-first. Never reorder.

## Multi-level cascade

1. All 16,500 pupils attempt level 0 (primary). Those who get a unique address are assigned; the rest become `pending`.
2. `pending` pupils attempt level 1 (fallback 1). Repeat until no more levels or no more pending.

**`seq` token** — pre-groups pending pupils by their address rendered with `seq → ""`, assigns rank 0→A, 1→B, … within each group. In a primary pattern `seq` gives everyone suffix "A" (useless).

**Random tokens** use seeded mulberry32 RNG keyed by `pupil.id × 9973 + attempt × 1000003`. Stable across re-renders, differs between levels.

**`middle` / `m`** return `""` for pupils without a middle name. `collapseEmptyTokens()` in `generateAddress.js` suppresses one adjacent separator automatically.

## Scoring system (nine dimensions)

`computeAllScores({ primaryTokens, allAddressTokens, allDnTokens, addressLevels, dnLevels, totalPupils, stats, subdomainMode, mode })` returns:

```js
{
  scores: {
    collisionResilience,       // { score, rationale, fallbackStats, primaryCollisionRate, ... }
    privacyDataMinimisation,   // { score, rationale }
    safeguardingExposure,      // { score, rationale }
    recognisability,           // { score, rationale, primaryPatternScore, populationWeightedScore }
    enumerationResistance,     // { score, rationale, randomSearchSpace }
    usabilityByPhase,          // { score, rationale, byPhase }  ← byPhase is per-phase breakdown
    operationalRobustness,     // { score, rationale }
    changeabilityLifecycle,    // { score, rationale, mutableTokens }
    interoperability,          // { score, rationale, issues }
  },
  warnings,          // NamingWarning[] — see below
  rawScore,          // weighted average before caps
  adjustedScore,     // rawScore with hard caps applied
  riskBand,          // "High risk" | "Elevated risk" | "Needs review" | "Acceptable" | "Good" | "Strong"
  decisionProfile,   // { posture, postureRationale, strengths[], concerns[], assumptions[] }
  fallbackStats,     // { distribution, maxDepthUsed, pctLevel2Plus, pctLevel3Plus, ... }
  fairnessStats,     // { count, pct }  — pupils receiving more PII than primary pattern
}
```

### Dimension weights

```js
{
  safeguardingExposure:    1.5,
  privacyDataMinimisation: 1.5,
  enumerationResistance:   1.25,
  usabilityByPhase:        1.0,
  operationalRobustness:   1.0,
  recognisability:         0.75,
  collisionResilience:     0.75,
  changeabilityLifecycle:  0.75,
  interoperability:        0.5,
}
```

Defined in `src/scoring/overall/weights.js`. Change only there.

### Dimension scoring logic (summary)

| Dimension | Key logic |
|---|---|
| **Collision resilience** | Thresholds: >10%→1, >5%→2, >2%→3, >0.5%→4, ≤0.5%→5. Penalised further for high fallback depth or heavy level-2+ population |
| **Privacy / data minimisation** | Starts at 5, deducts per PII element × population-weighted exposure fraction using product formula `1-(1-addr)(1-dn)`. School/location double-weight. Context multiplier for school subdomain. NOT a legal compliance score |
| **Safeguarding exposure** | Similar to privacy but different weights. Flat −1.0 if primary has no random element (enumerable). Flat −0.5 if subdomain visibly identifies pupil status |
| **Recognisability** | Token scoring: full first+last→5, mix of full/initial→4, initials only→3, one component→2, none→1. Shows population-weighted variant if fallbacks differ |
| **Enumeration resistance** | Exact random search space from token grammar. Full name present: −1. Initials only: +1. Year+school combined: −1 |
| **Usability by phase** | Five phases (Primary/KS1 through Sixth form) with phase-appropriate length and random-size thresholds. `byPhase` object shows per-phase score |
| **Operational robustness** | Penalises random tokens (−0.5), fallback depth (−0.75 to −2), heavy fallback population, full name tokens (normalisation risk), long addresses |
| **Changeability / lifecycle** | Deducts for surname (−1.5), first name (−1.0), middle name (−0.5), school token (−0.5), year (−0.25) |
| **Interoperability** | Penalises underscore, plus sign, exotic separators, schoolname token, long addresses, full name tokens (non-ASCII risk) |

### Warnings

`evaluateWarnings()` returns an array of `{ id, severity, title, message, affectedPupilCount?, affectedPupilFraction?, dimension? }`.

**Severity levels**: `"red"` (hard gate — caps adjusted score), `"amber"` (advisory), `"info"` (contextual note).

Key red warnings:
- `external-school-location` — school subdomain makes institution visible to external recipients
- `full-name-all-pupils` — full first+last in primary pattern for all pupils
- `year-and-school-combined` — both year and school in primary pattern
- `collision-rate-critical` — primary collision rate > 10%
- `deep-fallback-cascade` — fallback depth ≥ 4
- `fallback-increases-pii` — fallback exposes more PII for >5% of pupils

### Composite score caps

Applied in `compositeScore.js` before the adjusted score is shown:
- Any red warning → max 3.0
- School subdomain warning → max 3.5
- Critical collision rate → max 3.0
- Deep fallback cascade → max 2.5
- Full name for all pupils → privacy dimension capped at 3

### Decision profiles

`classifyDecisionPosture()` returns one of:
`"High-risk"` | `"Needs controls"` | `"Staff-friendly"` | `"Child-protective"` | `"Balanced"` | `"Operationally robust"`

`buildDecisionProfile()` adds top-3 strengths, top-3 concerns and assumptions list.

## Convention state shape (App.jsx)

```js
{
  id: string,           // crypto.randomUUID()
  primary: string,      // pattern string
  fallbacks: string[],
  subdomainMode: "blank" | "stu" | "student" | "school",
  displayName: string,
  displayNameFallbacks: string[],
}
```

Up to 3 conventions can be compared simultaneously.

## computeConventionResults return shape

```js
{
  // Parse/error state
  primaryTokens, error, fallbackErrors,
  primaryDnTokens, primaryDnError, dnFallbackErrors,

  // Cascade output
  addressLevels, addressUnresolvedCount, addressUnresolvedPupils,
  dnLevels, dnUnresolvedCount, dnUnresolvedPupils,
  examplesByLevel,          // [{ level, entries: [{ address, pupil, dn }] }]
  displayNameAssessment,    // { exposed[], risk, note } or null

  // Stats
  stats,      // { total, unique, collisions, collisionPct, longestLength, avgLength }
  resolvable, // boolean — primary pattern has random element

  // New scoring output (all from computeAllScores)
  scores, warnings, rawScore, adjustedScore, riskBand,
  decisionProfile, fallbackStats, fairnessStats,
}
```

## UI structure (ConventionPanel)

Each convention renders as a card with collapsible `Section` components. Default open state:

| Section | Default |
|---|---|
| Address pattern | Open |
| Display name pattern | Open |
| Subdomain | Open |
| Warnings | Open if any red warnings; collapsed otherwise |
| Decision profile | Collapsed (posture badge visible in header) |
| Evaluation (score cards) | Collapsed (adjusted score visible in header) |
| Usability by phase | Collapsed |
| Fairness | Collapsed (shown only if ≥0.5% of pupils affected) |
| Address cascade | Collapsed (resolved/unresolved count in header) |
| Example addresses | Collapsed |
| Display name assessment | Collapsed (risk level in header) |
| Display name cascade | Collapsed (shown only if DN has fallbacks or collisions) |
| Unresolved collisions | Collapsed (shown only if addressUnresolvedCount > 0) |
| Notes (info warnings) | Collapsed |

The `Section` component lives in `ConventionPanel.jsx` (not extracted). It takes `{ title, defaultOpen, badge, dimmed, children }`.

## Optimiser scripts

Both use a two-phase approach: pre-compute cascades (O(n_pupils) per combo), then score all pairs in near-O(1) using cached level data.

`findBestConvention.js` — imports `computeAllScores` from `src/scoring/index.js`. Searches ~299k address+DN pairs. Output tables include adjusted score, risk band, per-dimension scores, red warning count.

`findBestDisplayName.js` — uses its own inline scoring (privacy, safeguarding, recognisability, uniqueness) since it only has DN levels, not address levels. Searches ~1,470 DN combos.

To add candidate patterns, edit the `ADDR_PRIMARY`, `ADDR_FALLBACK1`, `ADDR_FALLBACK2`, `DN_PRIMARY`, `DN_FALLBACK1`, `DN_FALLBACK2` arrays at the top of each script.

### Optimiser findings (current best)

From last run against 16,500-pupil dataset, `stu.westst.org.uk` subdomain:

- **Best address convention**: `f.lastNNN → f.last.seq` · adjusted **3.58/5** · Acceptable · 0 unresolved · avg 29 chars
- **Best display name convention**: `f. last → f. last seq` · overall **3.86/5** · 100% resolved · privacy 3.5 · safeguarding 3.5 · recognisability 4

No convention reaches 4/5 overall under the current model. Any convention exposing a full surname in an externally routable address is penalised under privacy and safeguarding dimensions, which together carry weight 3.0 of the 9.0 total.

## Adding a new token

1. Add to `TOKENS` in `parsePattern.js` — before any shorter string it could shadow (longest-first).
2. Add a `case` in `generateLocalPart` and `generateDisplayName` in `generateAddress.js`.
3. If it can produce `""` for some pupils (like `middle`), `collapseEmptyTokens` handles separator suppression automatically.
4. If it exposes PII, add it to the relevant dimension scorers in `src/scoring/dimensions/` and to `assessDisplayName` in `computeConventionResults.js`.
5. Update the token reference hint in `App.jsx` and the display-name hint in `ConventionPanel.jsx`.
6. Add it to the optimiser candidate pools if appropriate.
7. Add a test case in `src/scoring/__tests__/scoring.test.js`.

## Adding a new scoring dimension

1. Create `src/scoring/dimensions/yourDimension.js` exporting a `scoreYourDimension(...)` function returning `{ score, rationale, ...extras }`.
2. Import and call it in `src/scoring/index.js` inside `computeAllScores`, add to the `scores` object.
3. Add `yourDimension` to `DIMENSION_WEIGHTS`, `DIMENSION_LABELS` and `DIMENSION_ORDER` in `src/scoring/overall/weights.js`.
4. Update `ScoreCard.jsx` (`ICONS`, `TITLES` objects).
5. Add tests.

## Regenerating the dataset

Edit `scripts/generatePupilDataset.js` (name pools, school weights, MIDDLE_NAME_PROBABILITY, TOTAL), then:

```bash
npm run generate:dataset
```

Deterministic seed: `naminglens-southwest-3000-v1`. Includes `gender` ("F"/"M"), `middle` (string or null, ~55% have a middle name), 31 South West England schools.

## Tests

57 unit tests in `src/scoring/__tests__/scoring.test.js` (vitest). Cover:
- Collision resilience thresholds and fallback stats
- Random search space calculation
- Enumeration resistance scoring
- Privacy and safeguarding exposure (population-weighting, product formula, context multipliers)
- Usability by phase (phase thresholds, underscore penalty)
- Recognisability
- Interoperability penalties
- Changeability/lifecycle scoring and mutableTokens output
- Fairness stats (fallback-induced PII escalation)
- Warning rules (all red and key amber warnings)
- Composite score capping and risk bands

Run with `npm test`.
