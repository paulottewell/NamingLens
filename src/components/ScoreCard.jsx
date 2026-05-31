const SCORE_COLOURS = {
  1: { bg: "bg-red-100",    border: "border-red-400",    text: "text-red-700",    label: "Very poor" },
  2: { bg: "bg-orange-100", border: "border-orange-400", text: "text-orange-700", label: "Poor" },
  3: { bg: "bg-yellow-100", border: "border-yellow-400", text: "text-yellow-700", label: "Moderate" },
  4: { bg: "bg-green-100",  border: "border-green-500",  text: "text-green-700",  label: "Good" },
  5: { bg: "bg-green-100",  border: "border-green-600",  text: "text-green-800",  label: "Excellent" },
}

const ICONS = {
  collisionResilience:     "⊞",
  privacyDataMinimisation: "⚖",
  safeguardingExposure:    "🛡",
  recognisability:         "👤",
  enumerationResistance:   "🎯",
  usabilityByPhase:        "⌨",
  operationalRobustness:   "⚙",
  changeabilityLifecycle:  "↻",
  interoperability:        "🔗",
}

const TITLES = {
  collisionResilience:     "Collision resilience",
  privacyDataMinimisation: "Privacy / data minimisation",
  safeguardingExposure:    "Safeguarding exposure",
  recognisability:         "Recognisability",
  enumerationResistance:   "Enumeration resistance",
  usabilityByPhase:        "Usability by phase",
  operationalRobustness:   "Operational robustness",
  changeabilityLifecycle:  "Changeability / lifecycle",
  interoperability:        "Interoperability",
}

export default function ScoreCard({ dimension, score, rationale, populationWeightedScore, primaryPatternScore }) {
  const rounded = Math.round(score)
  const c = SCORE_COLOURS[rounded] ?? SCORE_COLOURS[3]
  const icon  = ICONS[dimension]  ?? "●"
  const title = TITLES[dimension] ?? dimension

  const showPopWeighted = populationWeightedScore != null &&
    Math.abs(populationWeightedScore - primaryPatternScore) > 0.2

  return (
    <div className={`rounded-lg border-2 p-4 ${c.bg} ${c.border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
          {icon} {title}
        </span>
        <span className={`text-2xl font-bold ${c.text}`}>{Number.isInteger(score) ? score : score.toFixed(1)}/5</span>
      </div>
      <p className={`text-xs font-medium mb-1 ${c.text}`}>{c.label}</p>
      {showPopWeighted && (
        <p className="text-xs text-amber-700 mb-1">
          Primary pattern: {Number.isInteger(primaryPatternScore) ? primaryPatternScore : primaryPatternScore?.toFixed(1)}/5 ·{" "}
          Population-weighted: {populationWeightedScore.toFixed(1)}/5
        </p>
      )}
      <p className="text-xs text-slate-600 leading-relaxed">{rationale}</p>
      {dimension === "privacyDataMinimisation" && (
        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed border-t border-current/20 pt-2">
          This score assesses data minimisation implications only. GDPR compliance also depends on lawful basis, transparency notices, access controls, retention periods, DPIAs and processor arrangements.
        </p>
      )}
    </div>
  )
}
