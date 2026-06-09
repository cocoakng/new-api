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
 * Supports two modes:
 *   - resolution mode: has(param("resolution"), "1080") ? tier(...) : ...
 *   - width mode:      param("width") <= N ? tier(...) : ...
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

  const useResolution = validTiers.some(
    (t) => t.resolution !== null && t.resolution !== ''
  )

  const parseResolutionNum = (res: string | null | undefined): number => {
    if (!res) return Infinity
    const m = res.match(/(\d+)/)
    return m ? parseInt(m[1]) : Infinity
  }

  const sorted = [...validTiers].sort((a, b) => {
    const aVal = useResolution
      ? parseResolutionNum(a.resolution)
      : a.maxWidth ?? Infinity
    const bVal = useResolution
      ? parseResolutionNum(b.resolution)
      : b.maxWidth ?? Infinity
    if (aVal === Infinity && bVal !== Infinity) return 1
    if (bVal === Infinity && aVal !== Infinity) return -1
    return aVal - bVal
  })

  let expr = ''
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i]
    const tierExpr = `tier("${tier.label}", duration * ${tier.pricePerSecond})`
    const matchValue = useResolution ? tier.resolution : tier.maxWidth

    if (matchValue !== null && matchValue !== undefined && matchValue !== '') {
      if (useResolution) {
        if (expr) {
          expr = `has(param("resolution"), "${matchValue}") ? ${tierExpr} : ${expr}`
        } else {
          expr = `has(param("resolution"), "${matchValue}") ? ${tierExpr} : `
        }
      } else {
        if (expr) {
          expr = `param("width") <= ${matchValue} ? ${tierExpr} : ${expr}`
        } else {
          expr = `param("width") <= ${matchValue} ? ${tierExpr} : `
        }
      }
    } else {
      if (expr) {
        expr = expr + tierExpr
      } else {
        expr = tierExpr
      }
    }
  }

  if (expr.endsWith(': ')) {
    expr = expr.slice(0, -2)
  }

  return `v2:${expr}`
}

/**
 * Parse a v2 per_second expression back into visual tiers.
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
    const resRegex = /has\s*\(\s*param\s*\(\s*"resolution"\s*\)\s*,\s*"([^"]+)"\s*\)/g
    let resMatch
    const resConditions: string[] = []
    while ((resMatch = resRegex.exec(body)) !== null) {
      resConditions.push(resMatch[1])
    }

    const condRegex = /param\s*\(\s*"width"\s*\)\s*([<>=]+)\s*(\d+)/g
    let condMatch
    const widthConditions: Array<{ op: string; value: number }> = []
    while ((condMatch = condRegex.exec(body)) !== null) {
      widthConditions.push({ op: condMatch[1], value: parseInt(condMatch[2]) })
    }

    const parseResolutionNum = (res: string): number => {
      const m = res.match(/(\d+)/)
      return m ? parseInt(m[1]) : Infinity
    }

    if (resConditions.length > 0) {
      for (let i = 0; i < tiers.length && i < resConditions.length; i++) {
        tiers[i].resolution = resConditions[i]
      }
    } else if (widthConditions.length > 0) {
      for (let i = 0; i < tiers.length && i < widthConditions.length; i++) {
        const cond = widthConditions[i]
        if (cond.op === '<=') {
          tiers[i].maxWidth = cond.value
        } else if (cond.op === '<') {
          tiers[i].maxWidth = cond.value - 1
        }
      }
    }

    tiers.sort((a, b) => {
      const aVal =
        a.resolution !== null
          ? parseResolutionNum(a.resolution)
          : a.maxWidth ?? Infinity
      const bVal =
        b.resolution !== null
          ? parseResolutionNum(b.resolution)
          : b.maxWidth ?? Infinity
      if (aVal === Infinity && bVal !== Infinity) return 1
      if (bVal === Infinity && aVal !== Infinity) return -1
      return aVal - bVal
    })
  }

  return tiers
}
