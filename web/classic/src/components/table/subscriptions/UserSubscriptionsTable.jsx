/*
Copyright (C) 2025 QuantumNous

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

import React, { useMemo } from 'react';
import { Empty, Tag } from '@douyinfe/semi-ui';
import CardTable from '../../common/ui/CardTable';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';

const statusColorMap = {
  active: 'green',
  expired: 'grey',
  cancelled: 'orange',
};

const UserSubscriptionsTable = ({
  subscriptions,
  loading,
  pagination,
  onPageChange,
  onInvalidate,
  onDelete,
  t,
}) => {
  const columns = useMemo(() => {
    return [
      {
        title: t('用户'),
        dataIndex: 'username',
        width: 120,
        render: (v, record) => (
          <div>
            <div>{v || '-'}</div>
            <div style={{ color: '#999', fontSize: 12 }}>#{record.user_id}</div>
          </div>
        ),
      },
      {
        title: t('套餐'),
        dataIndex: 'plan_title',
        width: 140,
        render: (v, record) => (
          <div>
            <div>{v || '-'}</div>
            <div style={{ color: '#999', fontSize: 12 }}>#{record.plan_id}</div>
          </div>
        ),
      },
      {
        title: t('支付金额'),
        dataIndex: 'money',
        width: 100,
        render: (v) => (v > 0 ? `¥${v.toFixed(2)}` : '-'),
      },
      {
        title: t('总额度'),
        dataIndex: 'amount_total',
        width: 100,
        render: (v) => (v > 0 ? v.toLocaleString() : t('不限')),
      },
      {
        title: t('已用额度'),
        dataIndex: 'amount_used',
        width: 100,
        render: (v) => v.toLocaleString(),
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        width: 90,
        render: (v) => (
          <Tag color={statusColorMap[v] || 'grey'} shape='circle' size='small'>
            {v || '-'}
          </Tag>
        ),
      },
      {
        title: t('升级分组'),
        dataIndex: 'upgrade_group',
        width: 120,
        render: (v) => v || '-',
      },
      {
        title: t('开始时间'),
        dataIndex: 'start_time',
        width: 160,
        render: (v) => (v ? new Date(v * 1000).toLocaleString() : '-'),
      },
      {
        title: t('到期时间'),
        dataIndex: 'end_time',
        width: 160,
        render: (v) => (v > 0 ? new Date(v * 1000).toLocaleString() : t('永久')),
      },
      {
        title: t('操作'),
        dataIndex: 'operate',
        fixed: 'right',
        width: 120,
        render: (_, record) => (
          <div className='flex gap-2'>
            {record.status === 'active' && (
              <Tag
                color='orange'
                shape='circle'
                size='small'
                className='cursor-pointer'
                onClick={() => onInvalidate(record.id)}
              >
                {t('取消')}
              </Tag>
            )}
            <Tag
              color='red'
              shape='circle'
              size='small'
              className='cursor-pointer'
              onClick={() => onDelete(record.id)}
            >
              {t('删除')}
            </Tag>
          </div>
        ),
      },
    ];
  }, [t, onInvalidate, onDelete]);

  return (
    <CardTable
      columns={columns}
      dataSource={subscriptions}
      scroll={{ x: 'max-content' }}
      pagination={pagination}
      loading={loading}
      rowKey={(row) => row?.id}
      onPageChange={onPageChange}
      empty={
        <Empty
          image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
          darkModeImage={
            <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
          }
          description={t('暂无用户订阅记录')}
        />
      }
    />
  );
};

export default UserSubscriptionsTable;
