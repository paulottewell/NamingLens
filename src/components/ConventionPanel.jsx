import { useState } from "react"
import ScoreCard from "./ScoreCard.jsx"
import { DIMENSION_ORDER } from "../scoring/overall/weights.js"

const SUBDOMAIN_OPTIONS = [
  { value: "blank",   label: "None" },
  { value: "stu",     label: "stu" },
  { value: "student", label: "student" },
  { value: "school",  label: "School code" },
]

function subdomainPreview(mode, base) {
  if (mode === "stu")     return `stu.${base}`
  if (mode === "student") return `student.${base}`
  if (mode === "school")  return `{school}.${base}`
  return base
}

const LABELS        = ["A", "B", "C"]
const LABEL_COLOURS = ["bg-blue-700 text-white", "bg-violet-700 text-white", "bg-teal-700 text-white"]

function levelLabel(i) {
  return i === 0 ? "Primary" : `Fallback ${i}`
}

// ── Collapsible section wrapper ───────────────────────────────────────────────
function Section({ title, defaultOpen = false, badge, children, dimmed = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`border rounded-lg overflow-hidden ${dimmed ? "border-slate-100" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors
          ${open
            ? dimmed ? "bg-slate-50" : "bg-slate-100"
            : dimmed ? "bg-white hover:bg-slate-50" : "bg-slate-50 hover:bg-slate-100"
          }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-semibold uppercase tracking-wide truncate ${dimmed ? "text-slate-400" : "text-slate-500"}`}>
            {title}
          </span>
          {badge}
        </span>
        <span className={`text-slate-400 text-xs ml-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="p-4 border-t border-slate-100 bg-white">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Small count badge ────────────────────────────────────────────────────────
function CountBadge({ count, colour }) {
  if (!count) return null
  const cls = {
    red:    "bg-red-100 text-red-700",
    amber:  "bg-amber-100 text-amber-700",
    green:  "bg-green-100 text-green-700",
    slate:  "bg-slate-100 text-slate-600",
  }[colour ?? "slate"]
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>{count}</span>
  )
}

// ── Risk band badge ───────────────────────────────────────────────────────────
function RiskBandBadge({ band }) {
  if (!band) return null
  const colours = {
    "High risk":     "bg-red-100 text-red-800 border-red-300",
    "Elevated risk": "bg-orange-100 text-orange-800 border-orange-300",
    "Needs review":  "bg-yellow-100 text-yellow-800 border-yellow-300",
    "Acceptable":    "bg-blue-100 text-blue-800 border-blue-300",
    "Good":          "bg-green-100 text-green-800 border-green-300",
    "Strong":        "bg-green-200 text-green-900 border-green-500",
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colours[band] ?? "bg-slate-100 text-slate-700 border-slate-300"}`}>
      {band}
    </span>
  )
}

// ── Posture badge ─────────────────────────────────────────────────────────────
function PostureBadge({ posture }) {
  if (!posture) return null
  const colours = {
    "High-risk":            "bg-red-100 text-red-800 border-red-300",
    "Needs controls":       "bg-orange-100 text-orange-800 border-orange-300",
    "Staff-friendly":       "bg-purple-100 text-purple-800 border-purple-300",
    "Child-protective":     "bg-teal-100 text-teal-800 border-teal-300",
    "Balanced":             "bg-blue-100 text-blue-800 border-blue-300",
    "Operationally robust": "bg-indigo-100 text-indigo-800 border-indigo-300",
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colours[posture] ?? "bg-slate-100 text-slate-700 border-slate-300"}`}>
      {posture}
    </span>
  )
}

// ── Warning row ───────────────────────────────────────────────────────────────
function WarningRow({ warning }) {
  const [expanded, setExpanded] = useState(false)
  const styles = {
    red:   { wrap: "bg-red-50 border-red-300",    icon: "✕", iconCls: "text-red-600",    title: "text-red-800" },
    amber: { wrap: "bg-amber-50 border-amber-300", icon: "⚠", iconCls: "text-amber-600", title: "text-amber-800" },
    info:  { wrap: "bg-blue-50 border-blue-200",  icon: "ℹ", iconCls: "text-blue-500",  title: "text-blue-700" },
  }
  const s = styles[warning.severity] ?? styles.info
  return (
    <div className={`rounded-lg border px-3 py-2 ${s.wrap}`}>
      <button
        type="button"
        className="w-full flex items-start gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`mt-0.5 shrink-0 font-bold text-sm ${s.iconCls}`}>{s.icon}</span>
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-semibold ${s.title}`}>{warning.title}</span>
          {warning.affectedPupilCount != null && (
            <span className="ml-2 text-[10px] text-slate-500">
              ({warning.affectedPupilCount.toLocaleString()} pupils)
            </span>
          )}
        </div>
        <span className="text-slate-400 text-xs shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <p className="mt-1.5 ml-5 text-xs text-slate-600 leading-relaxed">{warning.message}</p>
      )}
    </div>
  )
}

// ── Decision profile card ─────────────────────────────────────────────────────
function DecisionProfileContent({ profile }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <PostureBadge posture={profile.posture} />
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{profile.postureRationale}</p>
      {profile.strengths.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">Strengths</p>
          <ul className="space-y-0.5">
            {profile.strengths.map((s, i) => (
              <li key={i} className="text-xs text-green-800 flex gap-1.5">
                <span className="text-green-500 shrink-0">✓</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile.concerns.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1">Concerns</p>
          <ul className="space-y-0.5">
            {profile.concerns.map((c, i) => (
              <li key={i} className="text-xs text-red-800 flex gap-1.5">
                <span className="text-red-500 shrink-0">✕</span>{c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile.assumptions.length > 0 && (
        <div className="border-t border-slate-200 pt-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Assumptions</p>
          <ul className="space-y-0.5">
            {profile.assumptions.map((a, i) => (
              <li key={i} className="text-[11px] text-slate-500 leading-relaxed">{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Phase usability chips ─────────────────────────────────────────────────────
function PhaseUsabilityRow({ byPhase }) {
  if (!byPhase) return null
  const COLOURS = {
    1: "bg-red-100 text-red-700",
    2: "bg-orange-100 text-orange-700",
    3: "bg-yellow-100 text-yellow-700",
    4: "bg-green-100 text-green-700",
    5: "bg-green-200 text-green-800",
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(byPhase).map(([phase, score]) => (
        <span key={phase} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${COLOURS[score] ?? "bg-slate-100 text-slate-600"}`}>
          {phase}: {score}/5
        </span>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ConventionPanel({
  index, convention, results, baseDomain,
  onUpdate, onRemove, canRemove,
  onAddFallback, onRemoveFallback, onUpdateFallback,
  onAddDnFallback, onRemoveDnFallback, onUpdateDnFallback,
}) {
  const label       = LABELS[index]
  const labelColour = LABEL_COLOURS[index]
  const { primary, fallbacks, subdomainMode, displayName, displayNameFallbacks } = convention

  const {
    error, fallbackErrors,
    primaryDnError, dnFallbackErrors,
    addressLevels, addressUnresolvedCount, addressUnresolvedPupils,
    dnLevels, dnUnresolvedCount, dnUnresolvedPupils,
    examplesByLevel,
    displayNameAssessment, stats, scores, resolvable,
    warnings = [], decisionProfile,
    rawScore, adjustedScore, riskBand,
    fallbackStats, fairnessStats,
  } = results

  const hasResults = stats !== null
  const hasDn      = displayName?.trim().length > 0

  const redWarnings   = warnings.filter((w) => w.severity === "red")
  const amberWarnings = warnings.filter((w) => w.severity === "amber")
  const infoWarnings  = warnings.filter((w) => w.severity === "info")

  const warningBadge = (
    <span className="flex gap-1 items-center">
      {redWarnings.length   > 0 && <CountBadge count={`${redWarnings.length} red`}   colour="red" />}
      {amberWarnings.length > 0 && <CountBadge count={`${amberWarnings.length} amber`} colour="amber" />}
      {redWarnings.length === 0 && amberWarnings.length === 0 && hasResults && (
        <CountBadge count="None" colour="green" />
      )}
    </span>
  )

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">

      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${labelColour}`}>{label}</span>
          <span className="text-sm font-semibold text-slate-700">Convention {label}</span>
          {hasResults && <span className="font-mono text-xs text-slate-400">{primary}</span>}
          {hasResults && adjustedScore != null && (
            <>
              <span className="text-sm font-bold text-slate-700">{adjustedScore.toFixed(2)}/5</span>
              <RiskBandBadge band={riskBand} />
            </>
          )}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Remove</button>
        )}
      </div>

      <div className="p-4 space-y-2">

        {/* ── Address pattern (default open — must be editable) ── */}
        <Section title="Address pattern" defaultOpen={true}>
          <div className="space-y-3">
            <div>
              <input
                type="text"
                value={primary}
                onChange={(e) => onUpdate("primary", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. f.last or yylast"
              />
              {error && <p className="mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
            </div>
            {fallbacks.map((fb, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1">
                  <span className="text-xs text-slate-400 font-medium block mb-1">Fallback {idx + 1}</span>
                  <input
                    type="text"
                    value={fb}
                    onChange={(e) => onUpdateFallback(idx, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. f.lastNN or first.last"
                  />
                  {fallbackErrors?.[idx] && (
                    <p className="mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{fallbackErrors[idx]}</p>
                  )}
                </div>
                <button type="button" onClick={() => onRemoveFallback(idx)} className="mt-6 text-xs text-slate-400 hover:text-red-500 transition-colors shrink-0">Remove</button>
              </div>
            ))}
            <button
              type="button"
              onClick={onAddFallback}
              className="text-xs text-slate-500 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-400 rounded-lg px-3 py-1.5 transition-colors"
            >
              + Add fallback level
            </button>
          </div>
        </Section>

        {/* ── Display name ── */}
        <Section title="Display name pattern" defaultOpen={true}>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Tokens: <code>first</code>, <code>last</code>, <code>middle</code>, <code>f</code>/<code>ff</code>/<code>fff</code>, <code>l</code>, <code>m</code>, <code>yy</code>, <code>seq</code>, <code>school</code>, <code>schoolname</code>. Spaces and commas are valid separators.
            </p>
            <div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => onUpdate("displayName", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder='e.g. school \- first last'
              />
              {primaryDnError && <p className="mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{primaryDnError}</p>}
            </div>
            {displayNameFallbacks.map((fb, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1">
                  <span className="text-xs text-slate-400 font-medium block mb-1">Display name fallback {idx + 1}</span>
                  <input
                    type="text"
                    value={fb}
                    onChange={(e) => onUpdateDnFallback(idx, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder='e.g. school \- first last yy'
                  />
                  {dnFallbackErrors?.[idx] && (
                    <p className="mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{dnFallbackErrors[idx]}</p>
                  )}
                </div>
                <button type="button" onClick={() => onRemoveDnFallback(idx)} className="mt-6 text-xs text-slate-400 hover:text-red-500 transition-colors shrink-0">Remove</button>
              </div>
            ))}
            <button
              type="button"
              onClick={onAddDnFallback}
              className="text-xs text-slate-500 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-400 rounded-lg px-3 py-1.5 transition-colors"
            >
              + Add display name fallback
            </button>
          </div>
        </Section>

        {/* ── Subdomain ── */}
        <Section title="Subdomain" defaultOpen={true}>
          <div className="space-y-2">
            <div className="flex gap-2">
              {SUBDOMAIN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdate("subdomainMode", opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    subdomainMode === opt.value
                      ? "bg-blue-700 text-white border-blue-700"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 font-mono">{subdomainPreview(subdomainMode, baseDomain)}</p>
          </div>
        </Section>

        {!hasResults && !error && (
          <p className="text-sm text-slate-400 text-center py-4">Enter a pattern above to see results.</p>
        )}

        {hasResults && (
          <>
            {/* ── Warnings ── */}
            {(redWarnings.length > 0 || amberWarnings.length > 0) && (
              <Section
                title="Warnings"
                badge={warningBadge}
                defaultOpen={redWarnings.length > 0}
              >
                <div className="space-y-2">
                  {redWarnings.map((w) => <WarningRow key={w.id} warning={w} />)}
                  {amberWarnings.map((w) => <WarningRow key={w.id} warning={w} />)}
                </div>
              </Section>
            )}

            {/* ── Decision profile ── */}
            {decisionProfile && (
              <Section
                title="Decision profile"
                badge={<PostureBadge posture={decisionProfile.posture} />}
              >
                <DecisionProfileContent profile={decisionProfile} />
              </Section>
            )}

            {/* ── Evaluation ── */}
            <Section
              title="Evaluation"
              badge={
                adjustedScore != null && (
                  <span className="text-xs font-semibold text-slate-600">
                    {adjustedScore.toFixed(2)}/5
                    {rawScore != null && Math.abs(rawScore - adjustedScore) > 0.05 && (
                      <span className="text-slate-400 font-normal ml-1">(raw {rawScore.toFixed(2)})</span>
                    )}
                  </span>
                )
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DIMENSION_ORDER.map((dim) => scores[dim] && (
                  <ScoreCard
                    key={dim}
                    dimension={dim}
                    score={scores[dim].score}
                    rationale={scores[dim].rationale}
                    primaryPatternScore={scores[dim].primaryPatternScore}
                    populationWeightedScore={scores[dim].populationWeightedScore}
                  />
                ))}
              </div>
            </Section>

            {/* ── Usability by phase ── */}
            {scores?.usabilityByPhase?.byPhase && (
              <Section title="Usability by school phase">
                <PhaseUsabilityRow byPhase={scores.usabilityByPhase.byPhase} />
              </Section>
            )}

            {/* ── Fairness ── */}
            {fairnessStats && fairnessStats.pct >= 0.5 && (
              <Section
                title="Fairness"
                badge={<CountBadge count={`${fairnessStats.pct.toFixed(1)}% affected`} colour={fairnessStats.pct > 1 ? "amber" : "slate"} />}
              >
                <p className={`text-xs leading-relaxed ${fairnessStats.pct > 1 ? "text-amber-800" : "text-blue-700"}`}>
                  <span className="font-semibold">Disparate impact: </span>
                  {fairnessStats.count.toLocaleString()} pupils ({fairnessStats.pct.toFixed(1)}%) receive greater personal data exposure than pupils on the primary pattern.
                  {fairnessStats.pct > 1 && " Pupils with common names bear a disproportionate privacy burden."}
                </p>
              </Section>
            )}

            {/* ── Address cascade ── */}
            <Section
              title="Address cascade"
              badge={
                addressUnresolvedCount > 0
                  ? <CountBadge count={`${addressUnresolvedCount} unresolved`} colour="red" />
                  : <CountBadge count="All resolved" colour="green" />
              }
            >
              <div className="space-y-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-400 uppercase tracking-wide">
                      <th className="pb-2 pr-4 font-medium">Level</th>
                      <th className="pb-2 pr-4 font-medium">Pattern</th>
                      <th className="pb-2 pr-4 font-medium text-right">Incoming</th>
                      <th className="pb-2 pr-4 font-medium text-right">Assigned</th>
                      <th className="pb-2 font-medium text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addressLevels.map((lvl, i) => {
                      const remaining = lvl.incoming - lvl.count
                      return (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-1.5 pr-4 text-slate-500">{levelLabel(i)}</td>
                          <td className="py-1.5 pr-4 font-mono text-slate-600">{i === 0 ? primary : (fallbacks[i - 1] || "—")}</td>
                          <td className="py-1.5 pr-4 text-right text-slate-500">{lvl.incoming.toLocaleString()}</td>
                          <td className="py-1.5 pr-4 text-right text-slate-700 font-medium">{lvl.count.toLocaleString()}</td>
                          <td className={`py-1.5 text-right font-medium ${remaining > 0 ? "text-amber-600" : "text-slate-400"}`}>
                            {remaining > 0 ? remaining.toLocaleString() : "—"}
                          </td>
                        </tr>
                      )
                    })}
                    {addressUnresolvedCount > 0 && (
                      <tr className="border-t border-red-200 bg-red-50">
                        <td className="py-1.5 pr-4 text-red-700 font-semibold">Unresolved</td>
                        <td className="py-1.5 pr-4 text-red-400 text-xs">no unique address found</td>
                        <td colSpan={2} />
                        <td className="py-1.5 text-right font-bold text-red-600">{addressUnresolvedCount.toLocaleString()}</td>
                      </tr>
                    )}
                    {addressUnresolvedCount === 0 && addressLevels.length > 1 && (
                      <tr className="border-t border-green-200 bg-green-50">
                        <td colSpan={5} className="py-1.5 px-1 text-green-700 font-medium">All pupils assigned a unique address</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Avg length" value={`${Math.round(stats.avgLength)} chars`} />
                  <Stat label="Longest" value={`${Math.round(stats.longestLength)} chars`} />
                  {fallbackStats && fallbackStats.pctLevel2Plus > 0 && (
                    <Stat label="Need level 2+" value={`${fallbackStats.pctLevel2Plus.toFixed(1)}%`} highlight={fallbackStats.pctLevel2Plus > 2} />
                  )}
                </div>
              </div>
            </Section>

            {/* ── Example addresses ── */}
            <Section title={`Example addresses${examplesByLevel?.length > 1 ? " — by level" : ""}`}>
              <div className="space-y-3">
                {(examplesByLevel ?? []).map(({ level, entries }) => (
                  <div key={level}>
                    {level > 0 && (
                      <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">
                        Fallback {level} — {fallbacks[level - 1] || ""}
                      </p>
                    )}
                    <ul className="space-y-0.5">
                      {entries.map(({ address, dn }, i) => (
                        <li key={i} className="text-xs font-mono py-1 border-b border-slate-100 last:border-0 text-slate-600">
                          {dn?.name && (
                            <>
                              <span className={dn.level > 0 ? "text-amber-700" : "text-slate-800"}>{dn.name}</span>
                              {dn.level > 0 && <span className="ml-1 font-sans text-[10px] text-amber-500">(DN F{dn.level})</span>}
                              {" "}
                            </>
                          )}
                          <span className={level > 0 ? "text-amber-700" : ""}>{address}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>

            {/* ── Display name assessment ── */}
            {displayNameAssessment && (
              <Section
                title="Display name assessment"
                badge={
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                    displayNameAssessment.risk === "high"     ? "bg-red-100 text-red-700"
                    : displayNameAssessment.risk === "elevated" ? "bg-orange-100 text-orange-700"
                    : displayNameAssessment.risk === "moderate" ? "bg-yellow-100 text-yellow-700"
                    : "bg-green-100 text-green-700"
                  }`}>{displayNameAssessment.risk}</span>
                }
              >
                <div className={`flex gap-2 items-start rounded-lg px-3 py-2.5 border text-xs leading-relaxed ${
                  displayNameAssessment.risk === "high"     ? "bg-red-50 border-red-200 text-red-900"
                  : displayNameAssessment.risk === "elevated" ? "bg-orange-50 border-orange-200 text-orange-900"
                  : displayNameAssessment.risk === "moderate" ? "bg-yellow-50 border-yellow-200 text-yellow-900"
                  : "bg-green-50 border-green-200 text-green-900"
                }`}>
                  <span className="mt-0.5 shrink-0">
                    {displayNameAssessment.risk === "high" ? "✕" : displayNameAssessment.risk === "elevated" ? "⚠" : displayNameAssessment.risk === "moderate" ? "◐" : "✓"}
                  </span>
                  <div>
                    <span className="font-semibold capitalize">{displayNameAssessment.risk} privacy/safeguarding exposure. </span>
                    {displayNameAssessment.note}
                  </div>
                </div>
              </Section>
            )}

            {/* ── DN cascade ── */}
            {hasDn && (dnLevels.length > 1 || dnUnresolvedCount > 0) && (
              <Section
                title="Display name cascade"
                badge={dnUnresolvedCount > 0 ? <CountBadge count={`${dnUnresolvedCount} unresolved`} colour="red" /> : null}
              >
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-400 uppercase tracking-wide">
                      <th className="pb-2 pr-4 font-medium">Level</th>
                      <th className="pb-2 pr-4 font-medium">Pattern</th>
                      <th className="pb-2 pr-4 font-medium text-right">Incoming</th>
                      <th className="pb-2 pr-4 font-medium text-right">Assigned</th>
                      <th className="pb-2 font-medium text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dnLevels.map((lvl, i) => {
                      const remaining = lvl.incoming - lvl.count
                      return (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-1.5 pr-4 text-slate-500">{levelLabel(i)}</td>
                          <td className="py-1.5 pr-4 font-mono text-slate-600">
                            {i === 0 ? displayName : (displayNameFallbacks[i - 1] || "—")}
                          </td>
                          <td className="py-1.5 pr-4 text-right text-slate-500">{lvl.incoming.toLocaleString()}</td>
                          <td className="py-1.5 pr-4 text-right text-slate-700 font-medium">{lvl.count.toLocaleString()}</td>
                          <td className={`py-1.5 text-right font-medium ${remaining > 0 ? "text-amber-600" : "text-slate-400"}`}>
                            {remaining > 0 ? remaining.toLocaleString() : "—"}
                          </td>
                        </tr>
                      )
                    })}
                    {dnUnresolvedCount > 0 && (
                      <tr className="border-t border-red-200 bg-red-50">
                        <td className="py-1.5 pr-4 text-red-700 font-semibold">Unresolved</td>
                        <td className="py-1.5 pr-4 text-red-400 text-xs">no unique display name found</td>
                        <td colSpan={2} />
                        <td className="py-1.5 text-right font-bold text-red-600">{dnUnresolvedCount.toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Section>
            )}

            {/* ── Unresolved address pupils ── */}
            {addressUnresolvedCount > 0 && (
              <Section
                title={`Unresolved address collisions (first ${addressUnresolvedPupils.length})`}
                badge={<CountBadge count={addressUnresolvedCount} colour="red" />}
              >
                {!resolvable && (
                  <div className="mb-3 flex gap-2 items-start rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                    <span className="text-red-600 mt-0.5">✕</span>
                    <p className="text-xs text-red-800 leading-relaxed">
                      <strong>Unresolvable automatically.</strong> The primary pattern has no random element — each remaining collision requires a manual exception.
                    </p>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500 uppercase tracking-wide">
                        <th className="pb-2 pr-3 font-medium">First</th>
                        <th className="pb-2 pr-3 font-medium">Surname</th>
                        <th className="pb-2 pr-3 font-medium">Year</th>
                        <th className="pb-2 pr-3 font-medium">School</th>
                        {addressUnresolvedPupils[0]?.attempts.map((_, i) => (
                          <th key={i} className="pb-2 pr-3 font-medium">{levelLabel(i)} (taken)</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {addressUnresolvedPupils.map(({ pupil, attempts }, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-1.5 pr-3 text-slate-700">{pupil.first}</td>
                          <td className="py-1.5 pr-3 text-slate-700">{pupil.last}</td>
                          <td className="py-1.5 pr-3 text-slate-500">{pupil.year}</td>
                          <td className="py-1.5 pr-3 font-mono text-slate-500">{pupil.school.toUpperCase()}</td>
                          {attempts.map((attempt, j) => (
                            <td key={j} className="py-1.5 pr-3 font-mono text-red-500 line-through">
                              <PupilTooltip pupil={attempt.owner} address={attempt.address}>
                                {attempt.address}
                              </PupilTooltip>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── Notes (info warnings) ── */}
            {infoWarnings.length > 0 && (
              <Section
                title="Notes"
                badge={<CountBadge count={infoWarnings.length} colour="slate" />}
                dimmed
              >
                <div className="space-y-2">
                  {infoWarnings.map((w) => <WarningRow key={w.id} warning={w} />)}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </section>
  )
}

// ── Utility components ────────────────────────────────────────────────────────

function PupilTooltip({ pupil, address, children }) {
  const [visible, setVisible] = useState(false)
  if (!pupil) return <>{children}</>
  return (
    <span className="relative cursor-default" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <span className="absolute z-10 left-0 top-full mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-lg p-3 text-xs text-slate-700 leading-relaxed pointer-events-none">
          <span className="block font-semibold text-slate-800 mb-1">{pupil.first} {pupil.last}</span>
          <span className="block text-slate-500">School: {pupil.school?.toUpperCase()}</span>
          <span className="block text-slate-500">Intake year: {pupil.year}</span>
          <span className="block font-mono text-slate-600 mt-1 break-all">{address}</span>
        </span>
      )}
    </span>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div className="text-center bg-slate-50 rounded-lg py-3 px-2">
      <p className={`text-xl font-bold ${highlight ? "text-red-600" : "text-slate-800"}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}
