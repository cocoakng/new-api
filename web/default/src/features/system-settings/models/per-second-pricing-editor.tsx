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
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSystemConfigStore } from '@/stores/system-config-store'

type PerSecondTier = {
  label: string
  resolution: string | null
  maxWidth: number | null
  pricePerSecond: string
}

type PerSecondPricingEditorProps = {
  tiers: PerSecondTier[]
  onTiersChange: (tiers: PerSecondTier[]) => void
}

const numericDraftRegex = /^(\d+(\.\d*)?|\.\d*)?$/

export function PerSecondPricingEditor(props: PerSecondPricingEditorProps) {
  const { t } = useTranslation()
  const { tiers, onTiersChange } = props
  const currency = useSystemConfigStore((s) => s.config.currency)
  const currencySymbol = (() => {
    if (currency?.quotaDisplayType === 'CNY') return '¥'
    if (currency?.quotaDisplayType === 'CUSTOM') return currency.customCurrencySymbol ?? '¤'
    return '$'
  })()

  const handleTierChange = (
    index: number,
    field: keyof PerSecondTier,
    value: string | number | null
  ) => {
    const newTiers = [...tiers]
    newTiers[index] = { ...newTiers[index], [field]: value }
    onTiersChange(newTiers)
  }

  const addTier = () => {
    onTiersChange([
      ...tiers,
      { label: `tier_${tiers.length}`, resolution: null, maxWidth: null, pricePerSecond: '' },
    ])
  }

  const removeTier = (index: number) => {
    if (tiers.length <= 1) return
    const newTiers = tiers.filter((_, i) => i !== index)
    onTiersChange(newTiers)
  }

  return (
    <div className='space-y-4'>
      <Field>
        <FieldLabel>{t('Per-second pricing tiers')}</FieldLabel>
        <FieldDescription>
          {t(
            'Configure pricing for different resolution or width tiers. The last tier without a condition serves as the catch-all base price.'
          )}
        </FieldDescription>
        <div className='mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400'>
          ⚠️ {t('不同渠道、不同模型的参数及传值方式有区别，请谨慎确认！')}
        </div>
      </Field>

      {tiers.map((tier, index) => {
        // Normalize null/undefined to consistent state
        const hasResolution = tier.resolution != null && tier.resolution !== ''
        const hasWidth = !hasResolution && tier.maxWidth != null && tier.maxWidth !== '' && tier.maxWidth !== undefined

        return (
        <div
          key={index}
          className='flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end'
        >
          <div className='flex-1'>
            <label className='text-muted-foreground mb-1 block text-xs'>
              {t('Tier label')}
            </label>
            <Input
              value={tier.label}
              placeholder='base'
              onChange={(e) => handleTierChange(index, 'label', e.target.value)}
            />
          </div>

          <div className='w-40'>
            <label className='text-muted-foreground mb-1 block text-xs'>
              {t('Condition type')}
            </label>
            <Select
              value={
                hasResolution
                  ? 'resolution'
                  : hasWidth
                    ? 'width'
                    : 'none'
              }
              onValueChange={(value) => {
                if (value === 'none') {
                  onTiersChange(
                    tiers.map((t, i) =>
                      i === index
                        ? { ...t, resolution: null, maxWidth: null }
                        : t
                    )
                  )
                } else if (value === 'resolution') {
                  onTiersChange(
                    tiers.map((t, i) =>
                      i === index
                        ? { ...t, resolution: '1080', maxWidth: null }
                        : t
                    )
                  )
                } else {
                  onTiersChange(
                    tiers.map((t, i) =>
                      i === index
                        ? { ...t, maxWidth: 1920, resolution: null }
                        : t
                    )
                  )
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>{t('None (base)')}</SelectItem>
                <SelectItem value='resolution'>{t('Resolution')}</SelectItem>
                <SelectItem value='width'>{t('Width')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasResolution && (
            <div className='w-32'>
              <label className='text-muted-foreground mb-1 block text-xs'>
                {t('Resolution')}
              </label>
              <Input
                value={tier.resolution || ''}
                placeholder='1080'
                onChange={(e) =>
                  handleTierChange(index, 'resolution', e.target.value)
                }
              />
            </div>
          )}

          {hasWidth && (
            <div className='w-32'>
              <label className='text-muted-foreground mb-1 block text-xs'>
                {t('Max width')}
              </label>
              <Input
                value={tier.maxWidth?.toString() || ''}
                placeholder='1920'
                inputMode='numeric'
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '' || /^\d+$/.test(val)) {
                    handleTierChange(
                      index,
                      'maxWidth',
                      val === '' ? null : parseInt(val)
                    )
                  }
                }}
              />
            </div>
          )}

          <div className='w-40'>
            <label className='text-muted-foreground mb-1 block text-xs'>
              {t('Price per second')}
            </label>
            <InputGroup>
              <InputGroupAddon>{currencySymbol}</InputGroupAddon>
              <InputGroupInput
                inputMode='decimal'
                value={tier.pricePerSecond}
                placeholder='0.05'
                onChange={(e) => {
                  const value = e.target.value
                  if (numericDraftRegex.test(value)) {
                    handleTierChange(index, 'pricePerSecond', value)
                  }
                }}
              />
              <InputGroupAddon align='inline-end'>/{t('second')}</InputGroupAddon>
            </InputGroup>
          </div>

          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() => removeTier(index)}
            disabled={tiers.length <= 1}
          >
            <Trash2 className='size-4' />
          </Button>
        </div>
        );
      })}

      <Button type='button' variant='outline' size='sm' onClick={addTier}>
        <Plus className='mr-1 size-4' />
        {t('Add tier')}
      </Button>
    </div>
  )
}
