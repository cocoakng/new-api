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
import { useCallback, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { useSystemConfigStore } from '@/stores/system-config-store'

type PerCallMatrix = {
  resolutions: string[]
  durations: number[]
  prices: (number | string)[][]
}

type PerCallPricingEditorProps = {
  matrix: PerCallMatrix | null
  onChange: (matrix: PerCallMatrix) => void
}

const COMMON_RESOLUTIONS = ['480p', '720p', '1080p', '4k']
const COMMON_DURATIONS = [4, 6, 8, 10, 15]
const numericDraftRegex = /^(\d+(\.\d*)?|\.\d*)?$/

function ensurePricesGrid(rows: number, cols: number, oldPrices: (number | string)[][]): (number | string)[][] {
  const newPrices: (number | string)[][] = []
  for (let r = 0; r < rows; r++) {
    newPrices[r] = []
    for (let c = 0; c < cols; c++) {
      newPrices[r][c] = (oldPrices[r]?.[c]) ?? ''
    }
  }
  return newPrices
}

function generateExprPreview(resolutions: string[], durations: number[], prices: (number | string)[][]): string {
  if (!resolutions.length || !durations.length) return ''

  let expr = ''
  const lastIndex = resolutions.length - 1

  for (let ri = 0; ri < resolutions.length; ri++) {
    const res = resolutions[ri]
    const lastCi = durations.length - 1

    for (let ci = 0; ci < durations.length; ci++) {
      const dur = durations[ci]
      const rawPrice = prices[ri]?.[ci] ?? 0
      const price = typeof rawPrice === 'string' ? (parseFloat(rawPrice) || 0) : rawPrice
      const tierLabel = `${res}_${dur}s`

      if (ri === lastIndex && ci === lastCi) {
        if (expr) {
          expr += ` : tier("${tierLabel}", ${price})`
        } else {
          expr = `tier("${tierLabel}", ${price})`
        }
      } else if (ci === lastCi && ri < lastIndex) {
        const tierExpr = `tier("${tierLabel}", ${price})`
        if (expr) {
          expr = `resolution == "${res}" ? ${tierExpr} : ${expr}`
        } else {
          expr = `resolution == "${res}" ? ${tierExpr} : `
        }
      } else {
        const tierExpr = `tier("${tierLabel}", ${price})`
        const cond = `resolution == "${res}" && duration == ${dur}`
        if (expr) {
          expr = `${cond} ? ${tierExpr} : ${expr}`
        } else {
          expr = `${cond} ? ${tierExpr} : `
        }
      }
    }
  }

  return `v2:${expr}`
}

export function PerCallPricingEditor(props: PerCallPricingEditorProps) {
  const { t } = useTranslation()
  const { matrix, onChange } = props
  const currency = useSystemConfigStore((s) => s.config.currency)
  const currencySymbol = (() => {
    if (currency?.quotaDisplayType === 'CNY') return '¥'
    if (currency?.quotaDisplayType === 'CUSTOM') return currency.customCurrencySymbol ?? '¤'
    return '$'
  })()

  const resolutions = matrix?.resolutions ?? []
  const durations = matrix?.durations ?? []
  const prices = matrix?.prices ?? []

  const addResolution = (value: string) => {
    const norm = value.toLowerCase().trim()
    if (!norm || resolutions.includes(norm)) return
    const newResolutions = [...resolutions, norm]
    const newPrices = ensurePricesGrid(newResolutions.length, durations.length, prices)
    onChange({ resolutions: newResolutions, durations, prices: newPrices })
  }

  const removeResolution = (index: number) => {
    if (resolutions.length <= 1) return
    const newResolutions = resolutions.filter((_, i) => i !== index)
    const newPrices = prices.filter((_, i) => i !== index)
    onChange({ resolutions: newResolutions, durations, prices: newPrices })
  }

  const addDuration = (value: string) => {
    const num = parseInt(value, 10)
    if (!num || durations.includes(num)) return
    const newDurations = [...durations, num].sort((a, b) => a - b)
    const newPrices = ensurePricesGrid(resolutions.length, newDurations.length, prices)
    onChange({ resolutions, durations: newDurations, prices: newPrices })
  }

  const removeDuration = (index: number) => {
    if (durations.length <= 1) return
    const newDurations = durations.filter((_, i) => i !== index)
    const newPrices = prices.map((row) => row.filter((_, i) => i !== index))
    onChange({ resolutions, durations: newDurations, prices: newPrices })
  }

  const updatePrice = (rowIndex: number, colIndex: number, value: string) => {
    const newPrices = prices.map((row, r) =>
      r === rowIndex ? row.map((cell, c) => (c === colIndex ? value : cell)) : [...row]
    )
    onChange({ resolutions, durations, prices: newPrices })
  }

  const addCommonResolutions = useCallback(() => {
    const missing = COMMON_RESOLUTIONS.filter((r) => !resolutions.includes(r))
    if (missing.length === 0) return
    const newResolutions = [...resolutions, ...missing]
    const newPrices = ensurePricesGrid(newResolutions.length, durations.length, prices)
    onChange({ resolutions: newResolutions, durations, prices: newPrices })
  }, [resolutions, durations, prices, onChange])

  const addCommonDurations = useCallback(() => {
    const missing = COMMON_DURATIONS.filter((d) => !durations.includes(d))
    if (missing.length === 0) return
    const newDurations = [...durations, ...missing].sort((a, b) => a - b)
    const newPrices = ensurePricesGrid(resolutions.length, newDurations.length, prices)
    onChange({ resolutions, durations: newDurations, prices: newPrices })
  }, [resolutions, durations, prices, onChange])

  const emptyCells = useMemo(() => {
    if (!resolutions.length || !durations.length) return []
    const cells: string[] = []
    for (let r = 0; r < resolutions.length; r++) {
      for (let c = 0; c < durations.length; c++) {
        const rawPrice = prices[r]?.[c]
        const price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice
        if (!price || isNaN(price)) {
          cells.push(`${resolutions[r]}/${durations[c]}s`)
        }
      }
    }
    return cells
  }, [resolutions, durations, prices])

  const exprPreview = useMemo(
    () => generateExprPreview(resolutions, durations, prices),
    [resolutions, durations, prices]
  )

  return (
    <div className='space-y-4'>
      <Field>
        <FieldLabel>{t('Per-call pricing matrix')}</FieldLabel>
        <FieldDescription>
          {t(
            'Configure fixed prices for video generation by resolution and duration. Each call is charged at the matrix price, not per second.'
          )}
        </FieldDescription>
        <div className='mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400'>
          ⚠️ {t('不同渠道、不同模型的参数及传值方式有区别，请谨慎确认！')}
        </div>
      </Field>

      {/* Resolution rows */}
      <div>
        <div className='mb-2 flex items-center justify-between'>
          <label className='text-muted-foreground text-sm font-medium'>
            {t('Resolutions (rows)')}
          </label>
          <Button type='button' variant='ghost' size='sm' onClick={addCommonResolutions}>
            <Plus className='mr-1 size-3' />
            {t('Add common')}
          </Button>
        </div>
        <div className='mb-2 flex flex-wrap gap-2'>
          {resolutions.map((res, index) => (
            <span
              key={res}
              className='inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200'
            >
              {res}
              {resolutions.length > 1 && (
                <button
                  type='button'
                  className='ml-0.5 text-blue-500 hover:text-blue-700'
                  onClick={() => removeResolution(index)}
                >
                  <Trash2 className='size-3' />
                </button>
              )}
            </span>
          ))}
        </div>
        <div className='flex gap-2 items-center'>
          <Input
            placeholder={t('e.g. 720p, 1080p')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value) {
                addResolution(e.currentTarget.value)
                e.currentTarget.value = ''
              }
            }}
          />
          <Button
            type='button'
            variant='default'
            size='sm'
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[placeholder*="720p"]')
              if (input && input.value) {
                addResolution(input.value)
                input.value = ''
              }
            }}
          >
            <Plus className='mr-1 size-3' />
            {t('Add')}
          </Button>
        </div>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t('If the model doesn\'t differentiate prices by resolution, add a single "any" row as a placeholder — the backend will auto-match it.')}
        </p>
      </div>

      {/* Duration columns */}
      <div>
        <div className='mb-2 flex items-center justify-between'>
          <label className='text-muted-foreground text-sm font-medium'>
            {t('Durations (columns, seconds)')}
          </label>
          <Button type='button' variant='ghost' size='sm' onClick={addCommonDurations}>
            <Plus className='mr-1 size-3' />
            {t('Add common')}
          </Button>
        </div>
        <div className='mb-2 flex flex-wrap gap-2'>
          {durations.map((dur, index) => (
            <span
              key={dur}
              className='inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200'
            >
              {dur}s
              {durations.length > 1 && (
                <button
                  type='button'
                  className='ml-0.5 text-amber-500 hover:text-amber-700'
                  onClick={() => removeDuration(index)}
                >
                  <Trash2 className='size-3' />
                </button>
              )}
            </span>
          ))}
        </div>
        <div className='flex gap-2 items-center'>
          <Input
            type='number'
            placeholder={t('e.g. 4, 6, 10')}
            inputMode='numeric'
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value) {
                addDuration(e.currentTarget.value)
                e.currentTarget.value = ''
              }
            }}
          />
          <Button
            type='button'
            variant='default'
            size='sm'
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[placeholder*="4, 6"]')
              if (input && input.value) {
                addDuration(input.value)
                input.value = ''
              }
            }}
          >
            <Plus className='mr-1 size-3' />
            {t('Add')}
          </Button>
        </div>
      </div>

      {/* Price matrix table */}
      {resolutions.length > 0 && durations.length > 0 && (
        <div>
          <label className='text-muted-foreground mb-2 block text-sm font-medium'>
            {t('Price matrix ({symbol}/call)', { symbol: currencySymbol })}
          </label>
          <div className='overflow-x-auto'>
            <table className='w-full max-w-lg border-collapse text-sm'>
              <thead>
                <tr>
                  <th className='bg-muted px-3 py-2 text-left text-xs font-semibold'>
                    {t('Resolution')}
                  </th>
                  {durations.map((dur) => (
                    <th
                      key={dur}
                      className='bg-muted px-3 py-2 text-center text-xs font-semibold'
                    >
                      {dur}s
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resolutions.map((res, ri) => (
                  <tr key={res}>
                    <td className='border-b px-3 py-1.5 font-medium'>
                      {res}
                    </td>
                    {durations.map((_, ci) => (
                      <td
                        key={ci}
                        className='border-b px-2 py-1 text-center'
                      >
                        <InputGroup>
                          <InputGroupAddon>{currencySymbol}</InputGroupAddon>
                          <InputGroupInput
                            inputMode='decimal'
                            placeholder='0.00'
                            value={prices[ri]?.[ci]?.toString() ?? ''}
                            onChange={(e) => {
                              const val = e.target.value
                              if (val === '' || numericDraftRegex.test(val)) {
                                updatePrice(ri, ci, val)
                              }
                            }}
                          />
                        </InputGroup>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {emptyCells.length > 0 && (
            <div className='mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400'>
              {t('Missing prices for: {cells}', { cells: emptyCells.join(', ') })}
            </div>
          )}
        </div>
      )}

      {/* Expression preview (collapsible) */}
      {resolutions.length > 0 && durations.length > 0 && exprPreview && (
        <details>
          <summary className='cursor-pointer text-xs text-muted-foreground'>
            {t('View generated expression')}
          </summary>
          <pre className='mt-1 max-h-28 overflow-x-auto rounded-md bg-muted p-2 text-xs'>
            {exprPreview}
          </pre>
        </details>
      )}
    </div>
  )
}
