import { useState, useMemo } from "react"
import PUPILS from "../data/pupilDataset.json"
import { computeConventionResults } from "../lib/computeConventionResults.js"
import { DIMENSION_ORDER, DIMENSION_LABELS, weightedOverall } from "../scoring/overall/weights.js"
import ConventionPanel from "./ConventionPanel.jsx"

const DEFAULT_DOMAIN = "westst.org.uk"

function subdomainPreview(mode, base) {
  if (mode === "stu")     return `stu.${base}`
  if (mode === "student") return `student.${base}`
  if (mode === "school")  return `{school}.${base}`
  return base
}

const MAX_CONVENTIONS = 3
const LABELS        = ["A", "B", "C"]
const LABEL_COLOURS = ["text-blue-700", "text-violet-700", "text-teal-700"]

function scoreColour(score) {
  if (score >= 4.5) return "text-green-700 font-bold"
  if (score >= 3.5) return "text-green-600 font-semibold"
  if (score >= 2.5) return "text-yellow-600 font-semibold"
  if (score >= 1.5) return "text-orange-600 font-semibold"
  return "text-red-600 font-bold"
}

function fmtScore(score) {
  return Number.isInteger(score) ? `${score}` : score.toFixed(1)
}

function buildComparison(allResults, conventions) {
  const valid = allResults
    .map((r, i) => ({ r, i, label: LABELS[i], conv: conventions[i] }))
    .filter((x) => x.r.stats && x.r.adjustedScore != null)

  if (valid.length < 2) return null

  const maxScore = Math.max(...valid.map((x) => x.r.adjustedScore))
  const winners  = valid.filter((x) => x.r.adjustedScore === maxScore)
  const isTied   = winners.length > 1

  if (!isTied) {
    const winner = winners[0]
    const others = valid.filter((x) => x.i !== winner.i)
    const dimEntries = DIMENSION_ORDER.map((d) => ({ d, s: winner.r.scores[d]?.score ?? 0 }))
    const strongest = dimEntries
      .filter((x) => x.s === Math.max(...dimEntries.map((y) => y.s)))
      .map((x) => DIMENSION_LABELS[x.d])
    const margin = (maxScore - Math.max(...others.map((x) => x.r.adjustedScore))).toFixed(2)
    return {
      type: "winner", label: winner.label, score: maxScore, margin, strongest,
      text: `Convention ${winner.label} scores highest overall (${maxScore.toFixed(2)}/5, leading by ${margin} points). Its strongest ${strongest.length > 1 ? "dimensions are" : "dimension is"} ${strongest.join(" and ")}.`,
    }
  }

  const tiedLabels = winners.map((x) => `Convention ${x.label}`).join(" and ")
  const diffDims = DIMENSION_ORDER.filter((d) => {
    const scores = winners.map((x) => x.r.scores[d]?.score ?? 0)
    return Math.max(...scores) !== Math.min(...scores)
  })

  const suggestions = []
  if (diffDims.length > 0) {
    const best = diffDims.map((d) => {
      const top = winners.reduce((a, b) =>
        (a.r.scores[d]?.score ?? 0) >= (b.r.scores[d]?.score ?? 0) ? a : b
      )
      return `${DIMENSION_LABELS[d]} (favours Convention ${top.label})`
    })
    suggestions.push(`Consider which dimension matters most to your Trust: ${best.join("; ")}.`)
  }

  const unresolvedDiff = winners.some(
    (x) => x.r.addressUnresolvedCount !== winners[0].r.addressUnresolvedCount
  )
  if (unresolvedDiff) {
    const fewest = winners.reduce((a, b) =>
      a.r.addressUnresolvedCount <= b.r.addressUnresolvedCount ? a : b
    )
    suggestions.push(`Convention ${fewest.label} leaves fewer pupils unresolved after all fallback levels.`)
  }

  if (suggestions.length === 0) {
    suggestions.push("The conventions are functionally equivalent on all measured dimensions. Choose based on operational preference.")
  }

  return {
    type: "tie", tiedLabels, score: maxScore, suggestions,
    text: `${tiedLabels} are tied overall (${maxScore.toFixed(2)}/5).`,
  }
}

function makeId() { return crypto.randomUUID() }
function makeConvention() {
  return { id: makeId(), primary: "", fallbacks: [], subdomainMode: "student", displayName: "", displayNameFallbacks: [] }
}

// ── Risk band badge (shared) ─────────────────────────────────────────────────
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colours[band] ?? "bg-slate-100 text-slate-700 border-slate-300"}`}>
      {band}
    </span>
  )
}

export default function App() {
  const [conventions, setConventions] = useState(() => [
    { id: makeId(), primary: "yylast", fallbacks: ["yylastf"], subdomainMode: "school", displayName: "school \\- first last", displayNameFallbacks: [] },
  ])
  const [mode, setMode]               = useState("pupil")
  const [baseDomain, setBaseDomain]   = useState(DEFAULT_DOMAIN)

  const allResults = useMemo(
    () => conventions.map((conv) => computeConventionResults(conv, PUPILS, conv.subdomainMode, mode, baseDomain)),
    [conventions, mode, baseDomain]
  )

  function updateConvention(id, field, value) {
    setConventions((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }
  function removeConvention(id) {
    setConventions((prev) => prev.filter((c) => c.id !== id))
  }
  function addConvention() {
    if (conventions.length >= MAX_CONVENTIONS) return
    setConventions((prev) => [...prev, makeConvention()])
  }

  function addFallback(id) {
    setConventions((prev) => prev.map((c) => c.id === id ? { ...c, fallbacks: [...c.fallbacks, ""] } : c))
  }
  function removeFallback(id, idx) {
    setConventions((prev) => prev.map((c) => c.id === id ? { ...c, fallbacks: c.fallbacks.filter((_, i) => i !== idx) } : c))
  }
  function updateFallback(id, idx, val) {
    setConventions((prev) => prev.map((c) => c.id === id ? { ...c, fallbacks: c.fallbacks.map((f, i) => i === idx ? val : f) } : c))
  }

  function addDnFallback(id) {
    setConventions((prev) => prev.map((c) => c.id === id ? { ...c, displayNameFallbacks: [...c.displayNameFallbacks, ""] } : c))
  }
  function removeDnFallback(id, idx) {
    setConventions((prev) => prev.map((c) => c.id === id ? { ...c, displayNameFallbacks: c.displayNameFallbacks.filter((_, i) => i !== idx) } : c))
  }
  function updateDnFallback(id, idx, val) {
    setConventions((prev) => prev.map((c) => c.id === id ? { ...c, displayNameFallbacks: c.displayNameFallbacks.map((f, i) => i === idx ? val : f) } : c))
  }

  const validResults   = allResults.filter((r) => r.stats !== null)
  const showComparison = validResults.length >= 2
  const comparison     = buildComparison(allResults, conventions)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <img src="/LargeLogo.png" alt="NamingLens" className="h-12 w-auto" />
          <div>
            <span className="text-sm text-slate-400">Email naming convention evaluator</span>
            <p className="text-[10px] text-slate-300 mt-0.5">Governance tool for school and MAT decision-makers</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── Global settings ── */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-5">Global settings</h2>
          <div className="flex flex-wrap gap-8 items-start">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Base domain</label>
              <input
                type="text"
                value={baseDomain}
                onChange={(e) => setBaseDomain(e.target.value.trim() || DEFAULT_DOMAIN)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={DEFAULT_DOMAIN}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Account type</label>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg text-sm font-medium border bg-blue-700 text-white border-blue-700">Pupil</button>
                <button disabled className="px-4 py-2 rounded-lg text-sm font-medium border bg-white text-slate-300 border-slate-200 cursor-not-allowed" title="Staff mode not yet implemented">Staff</button>
              </div>
            </div>
            <div className="flex-1 min-w-60">
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="font-medium text-slate-500">Tokens:</span>{" "}
                <code>first</code>/<code>First</code>, <code>last</code>/<code>Last</code>, <code>middle</code>/<code>Middle</code>,{" "}
                <code>f</code>/<code>ff</code>/<code>fff</code>, <code>l</code>/<code>L</code>, <code>m</code>/<code>M</code>,{" "}
                <code>yy</code>, <code>yyyy</code>, <code>NN</code>, <code>NNN</code>,{" "}
                <code>NNNN</code>, <code>A</code>–<code>AAAA</code>, <code>seq</code>, <code>school</code>, <code>schoolname</code>.{" "}
                Separators: any RFC 5321 special character (<code>. - _ + ! # $ % &amp; ' * / = ? ^ ` {'{'} | {'}'} ~</code>).{" "}
                Use <code>\X</code> to insert <code>X</code> literally.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold">Important: </span>
            This tool evaluates naming conventions across privacy, safeguarding, operational and usability dimensions.
            It is not a legal compliance determination. The Privacy / data minimisation score reflects data minimisation principles under UK GDPR —
            compliance also requires lawful basis, transparency notices, DPIAs, access controls and processor due diligence.
            Scores should inform, not replace, professional judgement and governance processes.
          </div>
        </section>

        {/* ── Comparison grid ── */}
        {showComparison && (
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-3 pr-6 text-left text-xs text-slate-500 font-medium uppercase tracking-wide w-48">Dimension</th>
                    {allResults.map((r, i) => r.stats && (
                      <th key={conventions[i].id} className="pb-3 px-4 text-center">
                        <span className={`text-sm font-bold ${LABEL_COLOURS[i]}`}>{LABELS[i]}</span>
                        <span className="block text-xs font-mono font-normal text-slate-400 mt-0.5 max-w-36 truncate mx-auto">{conventions[i].primary}</span>
                        <span className="block text-xs font-mono font-normal text-slate-300 mt-0.5 max-w-36 truncate mx-auto">{subdomainPreview(conventions[i].subdomainMode, baseDomain)}</span>
                        <div className="mt-1 flex justify-center">
                          {r.riskBand && <RiskBandBadge band={r.riskBand} />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DIMENSION_ORDER.map((dim) => (
                    <tr key={dim} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-6 text-xs text-slate-500 font-medium">{DIMENSION_LABELS[dim]}</td>
                      {allResults.map((r, i) => r.stats && (
                        <td key={conventions[i].id} className="py-2.5 px-4 text-center">
                          {r.scores?.[dim] ? (
                            <span className={`text-base ${scoreColour(r.scores[dim].score)}`}>
                              {fmtScore(r.scores[dim].score)}/5
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-b border-slate-100">
                    <td className="py-2.5 pr-6 text-xs text-slate-500 font-medium">Unresolved (all levels)</td>
                    {allResults.map((r, i) => r.stats && (
                      <td key={conventions[i].id} className="py-2.5 px-4 text-center">
                        <span className={`text-base font-semibold ${r.addressUnresolvedCount > 0 ? "text-red-600" : "text-green-700"}`}>
                          {r.addressUnresolvedCount}
                        </span>
                        <span className="block text-xs text-slate-400">pupils</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2.5 pr-6 text-xs text-slate-500 font-medium">Warnings</td>
                    {allResults.map((r, i) => r.stats && (
                      <td key={conventions[i].id} className="py-2.5 px-4 text-center">
                        {(r.warnings ?? []).filter(w => w.severity === "red").length > 0 && (
                          <span className="inline-block mr-1 text-xs font-semibold text-red-700">
                            {(r.warnings ?? []).filter(w => w.severity === "red").length} red
                          </span>
                        )}
                        {(r.warnings ?? []).filter(w => w.severity === "amber").length > 0 && (
                          <span className="inline-block text-xs font-semibold text-amber-600">
                            {(r.warnings ?? []).filter(w => w.severity === "amber").length} amber
                          </span>
                        )}
                        {(r.warnings ?? []).filter(w => w.severity !== "info").length === 0 && (
                          <span className="text-xs text-green-600">None</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="py-3 pr-6 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      <span>Overall (adjusted)</span>
                    </td>
                    {allResults.map((r, i) => r.stats && (
                      <td key={conventions[i].id} className="py-3 px-4 text-center">
                        {r.adjustedScore != null ? (
                          comparison?.label === LABELS[i] && comparison.type === "winner" ? (
                            <span className="inline-flex flex-col items-center gap-1">
                              <span className="text-lg font-bold text-green-700">{r.adjustedScore.toFixed(2)}/5</span>
                              <span className="text-xs text-green-600 font-medium">Best</span>
                            </span>
                          ) : (
                            <span className={`text-lg font-bold ${scoreColour(r.adjustedScore)}`}>{r.adjustedScore.toFixed(2)}/5</span>
                          )
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {comparison && (
              <div className={`mt-5 rounded-lg px-4 py-3 border text-sm leading-relaxed ${
                comparison.type === "winner" ? "bg-green-50 border-green-200 text-green-900" : "bg-amber-50 border-amber-200 text-amber-900"
              }`}>
                <p className="font-semibold mb-1">{comparison.type === "winner" ? "Recommendation" : "No clear winner"}</p>
                <p>{comparison.text}</p>
                {comparison.type === "tie" && comparison.suggestions.length > 0 && (
                  <ul className="mt-2 space-y-1 list-disc list-inside text-xs">
                    {comparison.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
                <p className="mt-2 text-xs opacity-75">
                  The highest scoring convention is not necessarily the right choice. Review warnings, decision profiles and dimension rationales before making a deployment decision.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── Convention panels ── */}
        <div className="space-y-6">
          {conventions.map((conv, i) => (
            <ConventionPanel
              key={conv.id}
              index={i}
              convention={conv}
              results={allResults[i]}
              baseDomain={baseDomain}
              onUpdate={(field, value) => updateConvention(conv.id, field, value)}
              onRemove={() => removeConvention(conv.id)}
              canRemove={conventions.length > 1}
              onAddFallback={() => addFallback(conv.id)}
              onRemoveFallback={(idx) => removeFallback(conv.id, idx)}
              onUpdateFallback={(idx, val) => updateFallback(conv.id, idx, val)}
              onAddDnFallback={() => addDnFallback(conv.id)}
              onRemoveDnFallback={(idx) => removeDnFallback(conv.id, idx)}
              onUpdateDnFallback={(idx, val) => updateDnFallback(conv.id, idx, val)}
            />
          ))}
        </div>

        {conventions.length < MAX_CONVENTIONS && (
          <div className="text-center">
            <button
              onClick={addConvention}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Add convention to compare
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 mt-16 px-6 py-4 text-center text-xs text-slate-400">
        <span className="inline-flex items-center justify-center gap-2">
          <img src="/Logo.png" alt="" className="h-5 w-auto opacity-50" />
          All data is fictitious · Client-side only · Not a legal compliance tool
        </span>
      </footer>
    </div>
  )
}
