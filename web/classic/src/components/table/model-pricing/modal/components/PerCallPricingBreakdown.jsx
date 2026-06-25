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

import React from 'react';
import { Avatar, Table, Typography } from '@douyinfe/semi-ui';
import { IconPriceTag } from '@douyinfe/semi-icons';
import { getCurrencyConfig } from '../../../../../helpers';

const { Text } = Typography;

export default function PerCallPricingBreakdown({ perCallMatrix, groupRatio, selectedGroup, t }) {
  const { symbol, rate } = getCurrencyConfig();
  const matrix = perCallMatrix;

  // Use the selected group ratio if available, otherwise fall back to the first group ratio
  let singleRatio = 1;
  if (groupRatio && selectedGroup && selectedGroup !== 'all' && groupRatio[selectedGroup] !== undefined) {
    singleRatio = groupRatio[selectedGroup];
  } else if (groupRatio) {
    const ratioKeys = Object.keys(groupRatio);
    singleRatio = ratioKeys.length > 0 ? groupRatio[ratioKeys[0]] : 1;
  }

  if (!matrix || !matrix.resolutions || matrix.resolutions.length === 0) {
    return (
      <div>
        <div className='flex items-center mb-3'>
          <Avatar size='small' color='green' className='mr-2 shadow-md'>
            <IconPriceTag size={16} />
          </Avatar>
          <Text className='text-lg font-medium'>{t('按次矩阵计费')}</Text>
        </div>
      </div>
    );
  }

  // Build columns: resolution + each duration column
  const columns = [
    {
      title: t('分辨率'),
      dataIndex: 'resolution',
      render: (text) => <Text strong>{text}</Text>,
    },
    ...matrix.durations.map((dur) => ({
      title: `${dur}s (${symbol}/${t('次')})`,
      dataIndex: `dur_${dur}`,
      render: (v) => {
        const num = parseFloat(v);
        if (!Number.isFinite(num) || num === 0) return '-';
        const finalPrice = singleRatio ? num * singleRatio : num;
        return <Text strong>{`${symbol}${(finalPrice * rate).toFixed(3)}`}</Text>;
      },
    })),
  ];

  // Build rows from the matrix
  const dataSource = matrix.resolutions.map((res, ri) => {
    const row = { key: `res-${ri}`, resolution: res };
    matrix.durations.forEach((dur, ci) => {
      row[`dur_${dur}`] = matrix.prices[ri]?.[ci] ?? 0;
    });
    return row;
  });

  return (
    <div>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='green' className='mr-2 shadow-md'>
          <IconPriceTag size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>{t('按次矩阵计费')}</Text>
          <div className='text-xs text-gray-600'>
            {t('配置视频生成的固定价格（按分辨率和时长）。每次调用按矩阵中的价格扣费。')}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Text strong className='text-sm' style={{ display: 'block', marginBottom: 8 }}>
          {t('价格矩阵')}
        </Text>
        <Table
          dataSource={dataSource}
          columns={columns}
          pagination={false}
          size='small'
          bordered={false}
          className='!rounded-lg'
          scroll={{ x: true }}
        />
      </div>
    </div>
  );
}
