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
import { useState } from 'react'
import { Search, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import { useRedemptionHistory } from '../../hooks/use-redemption-history'
import { formatTimestamp } from '../../lib/billing'

interface RedemptionHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getRedemptionStatusConfig(status: number) {
  // 用户视角：查询的是已使用的兑换码，状态均为成功
  return { label: 'Success', variant: 'success' as const }
}

export function RedemptionHistoryDialog({
  open,
  onOpenChange,
}: RedemptionHistoryDialogProps) {
  const { t } = useTranslation()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const {
    records,
    total,
    page,
    pageSize,
    keyword,
    loading,
    handlePageChange,
    handlePageSizeChange,
    handleSearch,
  } = useRedemptionHistory()

  const totalPages = Math.ceil(total / pageSize)

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedId(key)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col max-sm:h-dvh max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4 sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Redemption History')}</DialogTitle>
          <DialogDescription>
            {t('View your redemption code usage records')}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-3 sm:space-y-4'>
          {/* Search and Filter Bar */}
          <div className='flex items-center gap-2'>
            <div className='relative flex-1'>
              <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                placeholder={t('Search by name or code...')}
                value={keyword}
                onChange={(e) => handleSearch(e.target.value)}
                className='h-9 pl-10'
              />
            </div>
            <select
              className='h-9 rounded-md border bg-background px-3 text-sm'
              value={pageSize}
              onChange={(e) =>
                handlePageSizeChange(parseInt(e.target.value))
              }
            >
              <option value={10}>{t('10 / page')}</option>
              <option value={20}>{t('20 / page')}</option>
              <option value={50}>{t('50 / page')}</option>
            </select>
          </div>

          {/* Records List */}
          <ScrollArea className='h-[calc(100dvh-15rem)] pr-3 sm:h-[450px] sm:pr-4'>
            {loading ? (
              <div className='space-y-3'>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className='rounded-lg border p-3 sm:p-4'>
                    <div className='flex items-start justify-between'>
                      <div className='flex-1 space-y-2'>
                        <Skeleton className='h-4 w-36' />
                        <Skeleton className='h-3 w-48' />
                      </div>
                      <Skeleton className='h-5 w-16' />
                    </div>
                    <div className='mt-3 grid grid-cols-2 gap-3 sm:gap-4'>
                      <Skeleton className='h-3 w-full' />
                      <Skeleton className='h-3 w-full' />
                    </div>
                  </div>
                ))}
              </div>
            ) : records.length === 0 ? (
              <div className='text-muted-foreground flex h-[320px] flex-col items-center justify-center text-center sm:h-[400px]'>
                <p className='text-sm font-medium'>
                  {t('No redemption records found')}
                </p>
                <p className='mt-1 text-xs'>
                  {keyword
                    ? t('Try adjusting your search')
                    : t('Your redemption history will appear here')}
                </p>
              </div>
            ) : (
              <div className='space-y-3'>
                {records.map((record) => {
                  const statusConfig = getRedemptionStatusConfig(record.status)
                  return (
                    <div
                      key={record.id}
                      className='hover:bg-muted/50 rounded-lg border p-3 transition-colors sm:p-4'
                    >
                      {/* Header Row */}
                      <div className='flex items-start justify-between gap-2'>
                        <div className='flex-1 space-y-1'>
                          <div className='text-sm font-medium'>{record.name}</div>
                          <div className='flex items-center gap-2'>
                            <span className='font-mono text-xs text-muted-foreground'>
                              {record.key}
                            </span>
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-5 w-5 p-0'
                              onClick={() => handleCopy(record.key)}
                            >
                              {copiedId === record.key ? (
                                <Check className='h-3 w-3 text-green-600' />
                              ) : (
                                <Copy className='h-3 w-3' />
                              )}
                            </Button>
                          </div>
                        </div>
                        <StatusBadge
                          label={t(statusConfig.label)}
                          variant={statusConfig.variant}
                          showDot
                          copyable={false}
                        />
                      </div>

                      {/* Details Grid */}
                      <div className='mt-3 grid grid-cols-2 gap-3 sm:gap-4'>
                        <div className='space-y-1'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Quota')}
                          </Label>
                          <div className='text-sm font-semibold'>
                            {formatQuotaWithCurrency(record.quota)}
                          </div>
                        </div>
                        <div className='space-y-1'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Redeemed Time')}
                          </Label>
                          <div className='text-sm'>
                            {record.redeemed_time
                              ? formatTimestamp(record.redeemed_time)
                              : '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>

          {/* Pagination */}
          {!loading && records.length > 0 && (
            <div className='flex flex-col items-center gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='text-muted-foreground text-xs sm:text-sm'>
                {t('Showing')} {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, total)} {t('of')} {total}
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className='h-8 w-8 p-0'
                >
                  <ChevronLeft className='h-4 w-4' />
                </Button>
                <div className='text-muted-foreground flex items-center gap-1 text-sm'>
                  <span className='font-medium'>{page}</span>
                  <span>/</span>
                  <span>{totalPages}</span>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className='h-8 w-8 p-0'
                >
                  <ChevronRight className='h-4 w-4' />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
