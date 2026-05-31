import { clamp } from "../utils.js"
import { hasToken } from "../exposure/piiHelpers.js"

// Tokens and their mutability risk.
// Surnames change through adoption, marriage, safeguarding identity changes and gender transition.
// First names change through preference, legal name changes and gender transition.
// School codes change when pupils transfer within a MAT.
// Year tokens are stable but can cause confusion when a pupil repeats or skips a year.

export function scoreChangeabilityLifecycle(allTokens, primaryTokens) {
  let score = 5
  const issues = []

  if (hasToken(allTokens, "last")) {
    score -= 1.5
    issues.push("surname")
  }

  if (hasToken(allTokens, "first")) {
    score -= 1.0
    issues.push("first name")
  }

  if (hasToken(allTokens, "middle")) {
    score -= 0.5
    issues.push("middle name")
  }

  if (hasToken(allTokens, "school", "schoolname")) {
    score -= 0.5
    issues.push("school")
  }

  // Year is relatively stable but can require address changes in edge cases.
  if (hasToken(allTokens, "yy", "yyyy")) {
    score -= 0.25
    issues.push("intake year")
  }

  return {
    score: clamp(parseFloat(score.toFixed(1)), 1, 5),
    mutableTokens: issues,
    rationale: buildRationale(score, issues),
  }
}

function buildRationale(score, issues) {
  if (issues.length === 0) {
    return "The convention contains no tokens based on personal data that typically changes. Addresses are highly stable across a pupil's school career — suitable for use as a long-term login identity."
  }

  const risk = []
  if (issues.includes("surname")) {
    risk.push("Surnames change through adoption, safeguarding-related identity changes, legal name changes and gender transition. Changing a surname-based address requires reprovisioning the email address, login UPN and any aliases, with associated access and continuity risks.")
  }
  if (issues.includes("first name")) {
    risk.push("First names change through legal name change, preferred name use and gender transition. If the login identity uses the legal first name, discrepancies between the address and a pupil's preferred identity can be distressing.")
  }
  if (issues.includes("school")) {
    risk.push("School codes change when a pupil transfers between schools within the same Trust. This creates a new address for an existing account, requiring alias management.")
  }
  if (issues.includes("intake year")) {
    risk.push("Intake year is generally stable but may need correction for in-year admissions or pupils who repeat a year.")
  }

  let r = `The convention embeds ${issues.join(", ")} — data that may change during a pupil's school career. ` + risk.join(" ")
  r += " Consider separating the login/UPN identity from the primary SMTP address, using aliases to preserve continuity when personal data changes."
  return r
}
