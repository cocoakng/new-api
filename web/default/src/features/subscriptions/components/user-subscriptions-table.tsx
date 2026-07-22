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
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DataTablePage } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { GroupBadge } from '@/components/group-badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { getAllUserSubscriptions, invalidateUserSubscription, deleteUserSubscription } from '../api'
import type { UserSubscriptionWithInfo } from '../types'
import { formatTimestamp } from '../lib'

export function UserSubscriptionsTable() {
  const { t } = useTranslation()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [confirmAction, setConfirmAction] = useState<{
    type: 'invalidate' | 'delete'
    subId: number
  } | null>(null)

  const columns = useMemo(
    (): Array<{
      id?: string
      accessorKey?: string
      meta?: { label: string; mobileHidden?: boolean; mobileTitle?: boolean; mobileBadge?: boolean }
      header: ((ctx: { column: { id: string } }) => React.ReactNode)
      cell: (ctx: { row: { original: UserSubscriptionWithInfo } }) => React.ReactNode
      size?: number
    }> => [
      {
        accessorKey: 'id',
        meta: { label: 'ID', mobileHidden: true },
        header: () => 'ID',
        cell: ({ row }) => <TableId value={row.original.id} />,
        size: 60,
      },
      {
        id: 'user',
        meta: { label: t('User') },
        header: () => t('User'),
        cell: ({ row }) => (
          <div>
            <div className='font-medium'>{row.original.username || '-'}</div>
            <div className='text-muted-foreground text-xs'>#{row.original.user_id}</div>
          </div>
        ),
        size: 120,
      },
      {
        id: 'plan',
        meta: { label: t('Plan') },
        header: () => t('Plan'),
        cell: ({ row }) => (
          <div>
            <div className='font-medium'>{row.original.plan_title || '-'}</div>
            <div className='text-muted-foreground text-xs'>#{row.original.plan_id}</div>
          </div>
        ),
        size: 140,
      },
      {
        accessorKey: 'money',
        id: 'money',
        meta: { label: t('Payment Amount') },
        header: () => t('Payment Amount'),
        cell: ({ row }) => (
          <span className='font-semibold text-emerald-600'>
            {row.original.money && row.original.money > 0
              ? `¥${row.original.money.toFixed(2)}`
              : '-'}
          </span>
        ),
        size: 120,
      },
      {
        accessorKey: 'amount_total',
        id: 'amount_total',
        meta: { label: t('Total Quota') },
        header: () => t('Total Quota'),
        cell: ({ row }) => {
          const total = Number(row.original.amount_total || 0)
          return <span>{total > 0 ? total.toLocaleString() : t('Unlimited')}</span>
        },
        size: 100,
      },
      {
        accessorKey: 'amount_used',
        id: 'amount_used',
        meta: { label: t('Used Quota') },
        header: () => t('Used Quota'),
        cell: ({ row }) => (
          <span>{Number(row.original.amount_used || 0).toLocaleString()}</span>
        ),
        size: 100,
      },
      {
        id: 'status',
        meta: { label: t('Status'), mobileBadge: true },
        header: () => t('Status'),
        cell: ({ row }) => {
          const status = row.original.status
          const variant = status === 'active' ? 'success' : status === 'cancelled' ? 'warning' : 'neutral'
          const label = status === 'active' ? t('Active') : status === 'cancelled' ? t('Cancelled') : t('Expired')
          return <StatusBadge label={label} variant={variant} copyable={false} />
        },
        size: 90,
      },
      {
        accessorKey: 'upgrade_group',
        id: 'upgrade_group',
        meta: { label: t('Upgrade Group'), mobileHidden: true },
        header: () => t('Upgrade Group'),
        cell: ({ row }) => {
          const group = row.original.upgrade_group
          if (!group) return <span className='text-muted-foreground'>-</span>
          return <GroupBadge group={group} />
        },
        size: 120,
      },
      {
        accessorKey: 'start_time',
        id: 'start_time',
        meta: { label: t('Start Time'), mobileHidden: true },
        header: () => t('Start Time'),
        cell: ({ row }) => (
          <span className='text-sm'>{formatTimestamp(row.original.start_time)}</span>
        ),
        size: 160,
      },
      {
        accessorKey: 'end_time',
        id: 'end_time',
        meta: { label: t('End Time'), mobileHidden: true },
        header: () => t('End Time'),
        cell: ({ row }) => {
          const endTime = row.original.end_time
          return (
            <span className='text-sm'>
              {endTime > 0 ? formatTimestamp(endTime) : t('Permanent')}
            </span>
          )
        },
        size: 160,
      },
      {
        id: 'actions',
        meta: { label: t('Actions') },
        header: () => t('Actions'),
        cell: ({ row }) => (
          <div className='flex gap-1'>
            {row.original.status === 'active' && (
              <Button
                size='sm'
                variant='outline'
                onClick={() =>
                  setConfirmAction({ type: 'invalidate', subId: row.original.id })
                }
              >
                {t('Invalidate')}
              </Button>
            )}
            <Button
              size='sm'
              variant='destructive'
              onClick={() =>
                setConfirmAction({ type: 'delete', subId: row.original.id })
              }
            >
              {t('Delete')}
            </Button>
          </div>
        ),
        size: 160,
      },
    ],
    [t]
  )

  const { data, isLoading } = useQuery({
    queryKey: ['admin-all-user-subscriptions'],
    queryFn: async () => {
      const result = await getAllUserSubscriptions({ page: 1, page_size: 100 })
      return {
        data: result.data?.data || [],
        total: result.data?.total || 0,
      }
    },
    placeholderData: (prev) => prev,
  })

  const items = useMemo(() => data?.data || [], [data])
  const total = data?.total || 0

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / 20),
  })

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    try {
      if (confirmAction.type === 'invalidate') {
        const res = await invalidateUserSubscription(confirmAction.subId)
        if (res.success) {
          toast.success(res.data?.message || t('Has been invalidated'))
          table.refetch?.()
        }
      } else {
        const res = await deleteUserSubscription(confirmAction.subId)
        if (res.success) {
          toast.success(t('Deleted'))
          table.refetch?.()
        }
      }
    } catch {
      toast.error(t('Operation failed'))
    } finally {
      setConfirmAction(null)
    }
  }

  return (
    <>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={isLoading}
        emptyTitle={t('No user subscriptions')}
        emptyDescription={t('User subscription records will appear here')}
        skeletonKeyPrefix='user-subscriptions-skeleton'
      />

      {confirmAction && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setConfirmAction(null)}
          title={
            confirmAction.type === 'invalidate'
              ? t('Confirm invalidate')
              : t('Confirm delete')
          }
          desc={
            confirmAction.type === 'invalidate'
              ? t('After invalidating, this subscription will be immediately deactivated. Historical records are not affected. Continue?')
              : t('Deleting will permanently remove this subscription record (including benefit details). Continue?')
          }
          handleConfirm={handleConfirmAction}
          destructive={confirmAction.type === 'delete'}
        />
      )}
    </>
  )
}
