import { clamp } from "../utils.js"
import { computeFallbackStats } from "../exposure/piiHelpers.js"

export function scoreCollisionResilience(stats, addressLevels, totalPupils) {
  const rate = stats.collisionPct

  let score
  if (rate > 10)   score = 1
  else if (rate > 5)   score = 2
  else if (rate > 2)   score = 3
  else if (rate > 0.5) score = 4
  else                 score = 5

  const fallbackStats = computeFallbackStats(addressLevels, totalPupils)

  // Heavy fallback usage degrades the score further.
  if (fallbackStats.pctLevel2Plus > 15) score = Math.min(score, 2)
  else if (fallbackStats.pctLevel2Plus > 5) score = Math.min(score, 3)

  // Extreme fallback depth is operationally unacceptable.
  if (fallbackStats.maxDepthUsed >= 4) score = Math.min(score, 2)

  return {
    score: clamp(score, 1, 5),
    primaryCollisionRate: rate,
    primaryCollisionCount: stats.collisions,
    fallbackStats,
    rationale: buildRationale(score, stats, fallbackStats),
  }
}

function buildRationale(score, stats, fs) {
  const pct = stats.collisionPct.toFixed(1)
  const labels = ["", "Critical", "High", "Moderate", "Low", "Very low"]
  let r = `${labels[score] ?? "—"} collision risk at primary level. ` +
    `${stats.collisions.toLocaleString()} collision${stats.collisions !== 1 ? "s" : ""} ` +
    `across ${stats.total.toLocaleString()} addresses (${pct}%).`

  if (fs.maxDepthUsed >= 3) {
    r += ` Fallback cascade reaches level ${fs.maxDepthUsed} — high operational complexity.`
  } else if (fs.pctLevel2Plus > 2) {
    r += ` ${fs.pctLevel2Plus.toFixed(1)}% of pupils require fallback level 2 or beyond.`
  } else if (fs.maxDepthUsed > 0) {
    r += ` Fallback resolution contained to level ${fs.maxDepthUsed}.`
  }

  return r
}
