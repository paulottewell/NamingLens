import { clamp } from "../utils.js"
import { hasToken } from "../exposure/piiHelpers.js"

// RFC 5321 local-part max is 64 characters.
const LOCAL_PART_MAX = 64

export function scoreInteroperability(primaryTokens, stats) {
  let score = 5
  const issues = []

  // Underscore: causes display problems in some systems; confusing verbally.
  if (primaryTokens.some((t) => t.raw === "_")) {
    score -= 0.5
    issues.push("underscore separator")
  }

  // Plus sign: some mail systems interpret + as a sub-address delimiter.
  if (primaryTokens.some((t) => t.raw === "+")) {
    score -= 0.25
    issues.push("plus sign (may be treated as sub-address delimiter)")
  }

  // Characters beyond [a-z0-9.-_+] in local part can fail in legacy systems.
  const hasExoticSep = primaryTokens.some((t) =>
    t.type === "separator" && /[!#$%&'*\/?=^`{|}~]/.test(t.raw)
  )
  if (hasExoticSep) {
    score -= 0.75
    issues.push("unusual separator characters (may fail in MIS or legacy systems)")
  }

  // Full schoolname token can produce very long local parts.
  if (hasToken(primaryTokens, "schoolname")) {
    score -= 0.5
    issues.push("full school name (may produce long local parts or normalisation inconsistencies)")
  }

  // Average local part length (estimated — full address minus @domain)
  const avgLocal = stats.avgLength  // addresses include domain but local is the primary length driver
  if (avgLocal > 50) {
    score -= 1.0
    issues.push(`average local part likely approaching RFC limit (estimated ${Math.round(avgLocal)} chars)`)
  } else if (avgLocal > 35) {
    score -= 0.5
    issues.push(`long average local part (${Math.round(avgLocal)} chars) — may truncate in some systems`)
  }

  // Full name tokens introduce non-ASCII risk from accented characters.
  if (hasToken(primaryTokens, "first", "last", "middle")) {
    score -= 0.25
    issues.push("full name tokens require normalisation for non-ASCII characters (accents, ligatures)")
  }

  return {
    score: clamp(parseFloat(score.toFixed(1)), 1, 5),
    issues,
    rationale: buildRationale(score, issues),
  }
}

function buildRationale(score, issues) {
  if (issues.length === 0) {
    return "The pattern uses straightforward characters and moderate length — likely to work cleanly across M365, Google Workspace, MIS, LMS and catering/library systems."
  }
  return `Potential interoperability concerns: ${issues.join("; ")}. ` +
    "Test against your MIS export, provisioning tool and any third-party systems that consume email addresses before deploying."
}
