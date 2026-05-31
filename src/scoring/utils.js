export function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val))
}

export function pctLabel(fraction) {
  if (fraction <= 0) return null
  const p = Math.round(fraction * 100)
  return p < 1 ? "<1%" : `${p}%`
}

export function fmtPct(fraction) {
  return `${(fraction * 100).toFixed(1)}%`
}
