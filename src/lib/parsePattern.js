// Ordered by length descending so longer tokens match before shorter prefixes.
// Title-case aliases (First, Last, Middle, F, L, M) sit alongside their lowercase forms.
const TOKENS = [
  "firstname",  // alias
  "lastname",
  "schoolname",
  "Middle",     // before middle and M so "Middle" matches before "M"
  "middle",     // before m
  "seq",        // sequential disambiguator (A, B, C…)
  "First",
  "Last",
  "first",
  "last",
  "school",
  "yyyy",
  "yy",
  "NNNN",
  "NNN",
  "NN",
  "AAAA",
  "AAA",
  "AA",
  "A",
  "FFF",        // before FF and F so longer match wins
  "FF",
  "F",
  "L",
  "M",          // after Middle/middle
  "fff",        // before ff and f
  "ff",
  "f",
  "l",
  "m",          // after middle/Middle/M
]

// RFC 5321 local-part special characters plus the already-supported . - _
const SEPARATORS_EMAIL        = /^[.!#$%&'*+\-/=?^_`{|}~]+/
const SEPARATORS_DISPLAY_NAME = /^[ ,.\-_]+/

/**
 * Parse a pattern string into an array of token objects.
 * Returns { tokens, error }.
 * tokens: Array<{ type: string, raw: string, value?: string }>
 * error: string | null
 *
 * Backslash escapes: \X emits a literal token with value X (e.g. \f → literal "f").
 * Pass { allowSpaces: true } for display name patterns where spaces and
 * commas are valid separators (e.g. "first last" or "last, first").
 */
export function parsePattern(pattern, { allowSpaces = false } = {}) {
  if (!pattern || !pattern.trim()) {
    return { tokens: [], error: "Please enter a pattern." }
  }

  const SEPARATORS = allowSpaces ? SEPARATORS_DISPLAY_NAME : SEPARATORS_EMAIL

  const tokens = []
  let remaining = pattern.trim()

  while (remaining.length > 0) {
    // Backslash escape: \X → literal character X
    if (remaining[0] === "\\") {
      if (remaining.length < 2) {
        return { tokens: [], error: 'Trailing backslash at end of pattern. Use \\\\ for a literal backslash.' }
      }
      const escaped = remaining[1]
      tokens.push({ type: "literal", raw: `\\${escaped}`, value: escaped })
      remaining = remaining.slice(2)
      continue
    }

    // Try separator
    const sepMatch = remaining.match(SEPARATORS)
    if (sepMatch) {
      tokens.push({ type: "separator", raw: sepMatch[0] })
      remaining = remaining.slice(sepMatch[0].length)
      continue
    }

    // Try each known token
    let matched = false
    for (const tok of TOKENS) {
      if (remaining.startsWith(tok)) {
        const type =
          tok === "firstname" || tok === "First"  ? "first"  :
          tok === "lastname"  || tok === "Last"   ? "last"   :
          tok === "Middle"                         ? "middle" :
          tok === "FFF"                            ? "fff"    :
          tok === "FF"                             ? "ff"     :
          tok === "F"                              ? "f"      :
          tok === "L"                              ? "l"      :
          tok === "M"                              ? "m"      :
          tok
        tokens.push({ type, raw: tok })
        remaining = remaining.slice(tok.length)
        matched = true
        break
      }
    }

    if (!matched) {
      const badChar = remaining[0]
      return {
        tokens: [],
        error: `Unrecognised token starting with "${badChar}" in pattern "${pattern}". Supported tokens: first/First, last/Last, middle/Middle, f/ff/fff (F/FF/FFF), l/L, m/M, yy, yyyy, NN, NNN, NNNN, A, AA, AAA, AAAA, school, schoolname, seq. Use \\X to insert the character X literally.`,
      }
    }
  }

  if (tokens.length === 0) {
    return { tokens: [], error: "Pattern produced no tokens." }
  }

  return { tokens, error: null }
}
