/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/**
 * Parse a v2 per_second expression into displayable tier info.
 * Format: v2:tier("label", duration * price) or has(...)? tier(...) : tier(...)
 */
export function parsePerSecondTiers(expr: string): Array<{
  label: string
  pricePerSecond: string
}> {
  if (!expr || !expr.startsWith('v2:')) return []
  const body = expr.slice(3).trim()
  const tiers: Array<{ label: string; pricePerSecond: string }> = []
  const tierRegex = /tier\s*\(\s*"([^"]+)"\s*,\s*(.+?)\s*\)/g
  let match
  while ((match = tierRegex.exec(body)) !== null) {
    const label = match[1]
    const costExpr = match[2].trim()
    let pricePerSecond = ''
    const durMult = costExpr.match(/duration\s*\*\s*([\d.]+)/)
    const multDur = costExpr.match(/([\d.]+)\s*\*\s*duration/)
    if (durMult) pricePerSecond = durMult[1]
    else if (multDur) pricePerSecond = multDur[1]
    tiers.push({ label, pricePerSecond })
  }
  return tiers
}

/**
 * Format a per-second price summary for display.
 * Returns an array of display strings like "base $0.050/sec"
 */
export function formatPerSecondPrice(
  expr: string,
  options?: {
    groupRatio?: number
    priceRate?: number
    usdExchangeRate?: number
    quotaDisplayType?: string
    customCurrencySymbol?: string
    customCurrencyExchangeRate?: number
  }
): Array<{ label: string; formatted: string }> {
  const tiers = parsePerSecondTiers(expr)
  if (tiers.length === 0) return []

  const groupRatio = options?.groupRatio ?? 1
  const priceRate = options?.priceRate ?? 1
  const usdExchangeRate = options?.usdExchangeRate ?? 1
  const quotaDisplayType = options?.quotaDisplayType ?? 'USD'

  // Determine currency symbol and exchange rate
  let symbol = '$'
  let exchangeRate = 1
  if (quotaDisplayType === 'CNY') {
    symbol = '¥'
    exchangeRate = usdExchangeRate
  } else if (quotaDisplayType === 'CUSTOM') {
    symbol = options?.customCurrencySymbol ?? '¤'
    exchangeRate = options?.customCurrencyExchangeRate ?? 1
  } else {
    // USD
    exchangeRate = 1
  }

  return tiers
    .map((tier) => {
      const num = parseFloat(tier.pricePerSecond)
      if (!Number.isFinite(num)) return null
      const finalPrice = num * groupRatio * exchangeRate * priceRate
      return {
        label: tier.label,
        formatted: `${symbol}${finalPrice.toFixed(3)}`,
      }
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
}

/**
 * Build a v2 per_second expression from visual tiers.
 * Supports three condition types that can be mixed within the same expression:
 *   - resolution mode: has(param("resolution"), "1080") ? tier(...) : ...
 *   - width mode:      param("width") <= N ? tier(...) : ...
 *   - base (no condition): tier("base", duration * price)
 *
 * Ordering: resolution tiers first (sorted), then width tiers (sorted),
 * then base tier as fallback.
 */
export function buildPerSecondExprFromTiers(
  tiers: Array<{
    label: string
    resolution?: string | null
    maxWidth?: number | null
    pricePerSecond: string
  }>
): string {
  if (!tiers || tiers.length === 0) return ''
  const validTiers = tiers.filter((t) => t.pricePerSecond !== '')
  if (validTiers.length === 0) return ''

  const parseResolutionNum = (res: string | null | undefined): number => {
    if (!res) return Infinity
    const m = res.match(/(\d+)/)
    return m ? parseInt(m[1]) : Infinity
  }

  // Categorize tiers by condition type
  const resTiers = validTiers.filter(
    (t) => t.resolution !== null && t.resolution !== ''
  )
  const widthTiers = validTiers.filter(
    (t) => t.resolution === null && t.maxWidth !== null && t.maxWidth !== undefined
  )
  const baseTiers = validTiers.filter(
    (t) => (t.resolution === null || t.resolution === '') && (t.maxWidth === null || t.maxWidth === undefined || t.maxWidth === '')
  )

  // Sort within each category
  resTiers.sort((a, b) => parseResolutionNum(a.resolution) - parseResolutionNum(b.resolution))
  widthTiers.sort((a, b) => (a.maxWidth ?? Infinity) - (b.maxWidth ?? Infinity))

  // Build expression: resolve tiers → width tiers → base
  let expr = ''

  // Add base tier first (as fallback)
  if (baseTiers.length > 0) {
    expr = `tier("${baseTiers[0].label}", duration * ${baseTiers[0].pricePerSecond})`
  }

  // Add width tiers (each wraps previous expr)
  for (let i = widthTiers.length - 1; i >= 0; i--) {
    const tier = widthTiers[i]
    const tierExpr = `tier("${tier.label}", duration * ${tier.pricePerSecond})`
    if (expr) {
      expr = `param("width") <= ${tier.maxWidth} ? ${tierExpr} : ${expr}`
    } else {
      expr = `param("width") <= ${tier.maxWidth} ? ${tierExpr} : `
    }
  }

  // Add resolution tiers (each wraps previous expr)
  for (let i = resTiers.length - 1; i >= 0; i--) {
    const tier = resTiers[i]
    const tierExpr = `tier("${tier.label}", duration * ${tier.pricePerSecond})`
    if (expr) {
      expr = `has(param("resolution"), "${tier.resolution}") ? ${tierExpr} : ${expr}`
    } else {
      expr = `has(param("resolution"), "${tier.resolution}") ? ${tierExpr} : `
    }
  }

  if (expr.endsWith(': ')) {
    expr = expr.slice(0, -2)
  }

  return `v2:${expr}`
}

/**
 * Parse a v2 per_second expression back into visual tiers.
 * Handles mixed expressions with both resolution and width conditions.
 */
export function parsePerSecondExprToTiers(
  expr: string
): Array<{
  label: string
  resolution: string | null
  maxWidth: number | null
  pricePerSecond: string
}> {
  if (!expr || !expr.startsWith('v2:')) return []
  const body = expr.slice(3).trim()

  const tiers: Array<{
    label: string
    resolution: string | null
    maxWidth: number | null
    pricePerSecond: string
  }> = []
  const tierRegex = /tier\s*\(\s*"([^"]+)"\s*,\s*(.+?)\s*\)/g
  let match
  while ((match = tierRegex.exec(body)) !== null) {
    const label = match[1]
    const costExpr = match[2].trim()
    let pricePerSecond = ''
    const durMult = costExpr.match(/duration\s*\*\s*([\d.]+)/)
    const multDur = costExpr.match(/([\d.]+)\s*\*\s*duration/)
    if (durMult) pricePerSecond = durMult[1]
    else if (multDur) pricePerSecond = multDur[1]
    tiers.push({ label, resolution: null, maxWidth: null, pricePerSecond })
  }

  if (tiers.length > 0) {
    // Parse resolution conditions and map to tiers by order
    const resRegex = /has\s*\(\s*param\s*\(\s*"resolution"\s*\)\s*,\s*"([^"]+)"\s*\)/g
    let resMatch
    const resConditions: string[] = []
    while ((resMatch = resRegex.exec(body)) !== null) {
      resConditions.push(resMatch[1])
    }

    // Parse width conditions and map to tiers by order
    const condRegex = /param\s*\(\s*"width"\s*\)\s*([<>=]+)\s*(\d+)/g
    let condMatch
    const widthConditions: Array<{ op: string; value: number }> = []
    while ((condMatch = condRegex.exec(body)) !== null) {
      widthConditions.push({ op: condMatch[1], value: parseInt(condMatch[2]) })
    }

    // Assign conditions to tiers in order: resolution first, then width, then base
    let resIdx = 0
    let widthIdx = 0

    // First pass: assign resolution conditions
    for (let i = 0; i < tiers.length && resIdx < resConditions.length; i++) {
      if (tiers[i].resolution === null && tiers[i].maxWidth === null) {
        tiers[i].resolution = resConditions[resIdx]
        resIdx++
      }
    }

    // Second pass: assign width conditions to remaining unassigned tiers
    for (let i = 0; i < tiers.length && widthIdx < widthConditions.length; i++) {
      if (tiers[i].resolution === null && tiers[i].maxWidth === null) {
        const cond = widthConditions[widthIdx]
        if (cond.op === '<=') {
          tiers[i].maxWidth = cond.value
        } else if (cond.op === '<') {
          tiers[i].maxWidth = cond.value - 1
        }
        widthIdx++
      }
    }

    // Sort: resolution tiers (by value), then width tiers (by value), then base
    const parseResolutionNum = (res: string | null): number => {
      if (!res) return Infinity
      const m = res.match(/(\d+)/)
      return m ? parseInt(m[1]) : Infinity
    }

    tiers.sort((a, b) => {
      const aIsRes = a.resolution !== null
      const bIsRes = b.resolution !== null
      // Resolution tiers first
      if (aIsRes && !bIsRes) return -1
      if (!aIsRes && bIsRes) return 1
      // Within same category, sort by value
      if (aIsRes) {
        return parseResolutionNum(a.resolution) - parseResolutionNum(b.resolution)
      }
      const aVal = a.maxWidth ?? Infinity
      const bVal = b.maxWidth ?? Infinity
      if (aVal === Infinity && bVal !== Infinity) return 1
      if (bVal === Infinity && aVal !== Infinity) return -1
      return aVal - bVal
    })
  }

  return tiers
}
