import {
  hasToken,
  weightedExposureFraction,
  isPupilStatusVisible,
} from "../exposure/piiHelpers.js"

// ---------------------------------------------------------------------------
// Warning builder helpers
// ---------------------------------------------------------------------------
function w(id, severity, title, message, extras = {}) {
  return { id, severity, title, message, ...extras }
}

// ---------------------------------------------------------------------------
// Main warning evaluation
// ---------------------------------------------------------------------------
export function evaluateWarnings({
  primaryTokens,
  allAddressTokens,   // [primaryTokens, ...fallbackTokens]
  allDnTokens,        // [primaryDnTokens, ...dnFallbackTokens]
  addressLevels,
  dnLevels,
  totalPupils,
  subdomainMode,
  stats,
  fallbackStats,
  fairnessStats,
}) {
  const warnings = []
  const total = totalPupils || 1

  const addrFrac = (...t) => weightedExposureFraction(addressLevels, total, ...t)
  const dnFrac   = (...t) => weightedExposureFraction(dnLevels,      total, ...t)

  // Primary token checks
  const primaryHasRandom = hasToken(primaryTokens, "NN", "NNN", "NNNN", "A", "AA", "AAA", "AAAA", "seq")
  const primaryHasFullFirst  = hasToken(primaryTokens, "first")
  const primaryHasFullLast   = hasToken(primaryTokens, "last")
  const primaryHasYear       = hasToken(primaryTokens, "yy", "yyyy")
  const primaryHasSchool     = hasToken(primaryTokens, "school", "schoolname")
  const primaryCollisionRate = stats.collisionPct

  // Flattened union of all address and DN tokens across all levels
  const allAddrFlat = allAddressTokens.flat()
  const allDnFlat   = allDnTokens.flat()

  // ---------------------------------------------------------------------------
  // RED WARNINGS
  // ---------------------------------------------------------------------------

  // External email exposes school/location in the domain
  if (subdomainMode === "school") {
    warnings.push(w(
      "external-school-location",
      "red",
      "Domain discloses school location",
      "Using a per-school subdomain (e.g. ivy.westst.org.uk) makes the pupil's school directly visible in every sent and received email, including external correspondents. This discloses where a child attends school to anyone who sees their email address."
    ))
  }

  // External email exposes full first name and full surname for all or near-all pupils
  const primaryFullNameFrac = primaryHasFullFirst && primaryHasFullLast ? 1.0 : 0
  if (primaryFullNameFrac > 0.9) {
    warnings.push(w(
      "full-name-all-pupils",
      "red",
      "Full name exposed for all or near-all pupils at primary level",
      "The primary pattern exposes both the full first name and full surname for every pupil. This creates a direct link between the email address and the pupil's identity — visible to any external correspondent.",
      { affectedPupilFraction: 1.0, affectedPupilCount: totalPupils, dimension: "privacyDataMinimisation" }
    ))
  }

  // Intake year AND school both embedded in primary address
  if (primaryHasYear && primaryHasSchool) {
    warnings.push(w(
      "year-and-school-combined",
      "red",
      "Intake year and school data combined in address",
      "The primary pattern embeds both intake year and school/location data. Together these reveal the pupil's approximate age and institution to anyone who sees the address, significantly narrowing their identity.",
      { dimension: "privacyDataMinimisation" }
    ))
  }

  // Primary collision rate > 10%
  if (primaryCollisionRate > 10) {
    warnings.push(w(
      "collision-rate-critical",
      "red",
      `Critical collision rate: ${primaryCollisionRate.toFixed(1)}%`,
      `More than one in ten pupils would share a primary address before fallback resolution. This indicates the primary pattern is structurally inadequate for this dataset. ${stats.collisions.toLocaleString()} pupils are affected.`,
      { affectedPupilCount: stats.collisions, affectedPupilFraction: stats.collisionPct / 100, dimension: "collisionResilience" }
    ))
  }

  // Fallback depth ≥ 4
  if (fallbackStats.maxDepthUsed >= 4) {
    warnings.push(w(
      "deep-fallback-cascade",
      "red",
      `Fallback cascade reaches level ${fallbackStats.maxDepthUsed}`,
      "A convention that requires four or more fallback levels to achieve uniqueness is operationally unmanageable. Staff cannot easily understand or explain the address format, and the cascade creates multiple tiers of differently-formatted addresses.",
      { dimension: "operationalRobustness" }
    ))
  }

  // Fallback levels expose materially more PII than the primary pattern
  if (fairnessStats && fairnessStats.pct > 5) {
    const count = fairnessStats.count
    warnings.push(w(
      "fallback-increases-pii",
      "red",
      `Fallback pattern exposes more personal data (${fairnessStats.pct.toFixed(1)}% of pupils)`,
      `${count.toLocaleString()} pupils (${fairnessStats.pct.toFixed(1)}%) are assigned a fallback address that exposes more personal data than the primary pattern. Pupils with common names — who are often already more identifiable — receive less privacy protection.`,
      { affectedPupilCount: count, affectedPupilFraction: fairnessStats.pct / 100, dimension: "privacyDataMinimisation" }
    ))
  }

  // ---------------------------------------------------------------------------
  // AMBER WARNINGS
  // ---------------------------------------------------------------------------

  // Primary collision rate 5–10%
  if (primaryCollisionRate > 5 && primaryCollisionRate <= 10) {
    warnings.push(w(
      "collision-rate-high",
      "amber",
      `High collision rate: ${primaryCollisionRate.toFixed(1)}%`,
      `More than 5% of pupils cannot be assigned a unique primary address. ${stats.collisions.toLocaleString()} pupils require fallback resolution. Consider a stronger primary pattern.`,
      { affectedPupilCount: stats.collisions, affectedPupilFraction: stats.collisionPct / 100, dimension: "collisionResilience" }
    ))
  }

  // >2% require fallback level 2+
  if (fallbackStats.pctLevel2Plus > 2) {
    warnings.push(w(
      "high-fallback2-population",
      "amber",
      `${fallbackStats.pctLevel2Plus.toFixed(1)}% of pupils require fallback level 2 or beyond`,
      `${fallbackStats.level2PlusCount.toLocaleString()} pupils (${fallbackStats.pctLevel2Plus.toFixed(1)}%) cannot be resolved by the first fallback level. This group will receive differently-formatted addresses, which may be confusing for staff and parents.`,
      { affectedPupilCount: fallbackStats.level2PlusCount, affectedPupilFraction: fallbackStats.pctLevel2Plus / 100 }
    ))
  }

  // >1% receive greater PII exposure than primary pattern (but ≤5%)
  if (fairnessStats && fairnessStats.pct > 1 && fairnessStats.pct <= 5) {
    warnings.push(w(
      "fallback-increases-pii-amber",
      "amber",
      `Fallback increases PII exposure for ${fairnessStats.pct.toFixed(1)}% of pupils`,
      `${fairnessStats.count.toLocaleString()} pupils receive a fallback address that exposes more personal data than the primary pattern. Pupils with common surnames are disproportionately affected.`,
      { affectedPupilCount: fairnessStats.count, affectedPupilFraction: fairnessStats.pct / 100, dimension: "privacyDataMinimisation" }
    ))
  }

  // Intake year is exposed in address
  if (primaryHasYear) {
    warnings.push(w(
      "year-in-address",
      "amber",
      "Intake year embedded in email address",
      "Embedding the intake year reveals the pupil's approximate age (typically ±1 year) to any recipient. For most schools this is considered personal data under UK GDPR. It also creates a visible 'cohort' label.",
      { dimension: "privacyDataMinimisation" }
    ))
  }

  // Full surname exposed for near-all pupils
  if (addrFrac("last") > 0.9 || dnFrac("last") > 0.9) {
    if (!warnings.some((w) => w.id === "full-name-all-pupils")) {
      warnings.push(w(
        "surname-all-pupils",
        "amber",
        "Full surname exposed for all or near-all pupils",
        "The full surname is visible in the address or display name for virtually every pupil. Surnames can be sensitive in safeguarding contexts — for example, pupils who are looked after or have changed their name for safety reasons.",
        { dimension: "safeguardingExposure" }
      ))
    }
  }

  // No random element in primary pattern
  if (!primaryHasRandom) {
    warnings.push(w(
      "no-random-primary",
      "amber",
      "Primary pattern is fully deterministic",
      "The primary address format contains no random element. Any third party who knows a pupil's name can construct their email address without needing directory access. This significantly reduces enumeration resistance.",
      { dimension: "enumerationResistance" }
    ))
  }

  // Pattern may be hard to type for younger pupils
  const avgLen = stats.avgLength
  if (avgLen > 22) {
    warnings.push(w(
      "long-address",
      "amber",
      `Average address length is ${Math.round(avgLen)} characters`,
      `Addresses averaging ${Math.round(avgLen)} characters may be difficult for younger pupils to type, remember or communicate verbally. Consider the full school phase range this convention will serve.`,
      { dimension: "usabilityByPhase" }
    ))
  }

  // Pattern relies on full name — mutable data
  if (hasToken(allAddrFlat, "first") || hasToken(allAddrFlat, "last")) {
    warnings.push(w(
      "mutable-name-data",
      "amber",
      "Address pattern relies on mutable personal data",
      "This convention embeds the pupil's legal name in the email address. Names change through adoption, safeguarding-related identity changes, preferred name changes and gender transition. Address changes require reprovisioning the login identity and managing aliases.",
      { dimension: "changeabilityLifecycle" }
    ))
  }

  // ---------------------------------------------------------------------------
  // INFO WARNINGS
  // ---------------------------------------------------------------------------

  // Recognisability > 3 with privacy/safeguarding trade-off
  if (primaryHasFullFirst || primaryHasFullLast) {
    warnings.push(w(
      "recognisability-privacy-tradeoff",
      "info",
      "Convention favours adult recognisability over pupil privacy",
      "Using full names makes addresses easy to recognise and reduces directory dependence — but increases exposure of personal data. Consider whether the operational benefit justifies the additional privacy and safeguarding risk.",
      { dimension: "recognisability" }
    ))
  } else if (!hasToken(primaryTokens, "first", "last", "f", "l")) {
    warnings.push(w(
      "low-recognisability",
      "info",
      "Convention favours pupil privacy over adult recognisability",
      "The address format does not contain name components — staff, parents and helpdesk personnel cannot identify whose address it is without a directory lookup. Ensure strong address book and directory access is in place.",
      { dimension: "recognisability" }
    ))
  }

  // Visible pupil status
  if (isPupilStatusVisible(subdomainMode)) {
    warnings.push(w(
      "pupil-status-visible",
      "info",
      "Subdomain identifies account as a student account",
      `The subdomain '${subdomainMode}' makes it visible to any recipient that this is a student account. This is a minor additional exposure in most contexts, but worth noting in a DPIA.`,
      { dimension: "privacyDataMinimisation" }
    ))
  }

  // External mail restrictions would help
  if (primaryHasFullFirst || primaryHasFullLast || primaryHasSchool) {
    warnings.push(w(
      "controls-recommended",
      "info",
      "External mail controls or Address Book Policies could reduce risk",
      "Given the level of personal data in this convention, consider restricting external sending for younger pupils, applying Display Name sanitisation for outbound mail, or implementing Address Book Policies to limit cross-school directory visibility.",
      { dimension: "safeguardingExposure" }
    ))
  }

  return warnings
}
