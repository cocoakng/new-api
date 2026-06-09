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
import { Avatar, Tag, Table, Typography } from '@douyinfe/semi-ui';
import { IconPriceTag } from '@douyinfe/semi-icons';
import { getCurrencyConfig } from '../../../../../helpers';

const { Text } = Typography;

// Parse v2 per_second expression: v2:tier("label", duration * price)
const parsePerSecondTiers = (expr) => {
  if (!expr || !expr.startsWith('v2:')) return [];
  const body = expr.slice(3).trim();
  const tiers = [];
  const tierRegex = /tier\s*\(\s*"([^"]+)"\s*,\s*(.+?)\s*\)/g;
  let match;
  while ((match = tierRegex.exec(body)) !== null) {
    const label = match[1];
    const costExpr = match[2].trim();
    let pricePerSecond = '';
    const durMult = costExpr.match(/duration\s*\*\s*([\d.]+)/);
    const multDur = costExpr.match(/([\d.]+)\s*\*\s*duration/);
    if (durMult) {
      pricePerSecond = durMult[1];
    } else if (multDur) {
      pricePerSecond = multDur[1];
    }
    let maxWidth = null;
    tiers.push({ label, maxWidth, pricePerSecond });
  }

  // Extract width conditions from ternary conditions
  const condRegex = /param\s*\(\s*"width"\s*\)\s*([<>=]+)\s*(\d+)\s*\?\s*tier\s*\(\s*"([^"]+)"/g;
  let condMatch;
  const conditions = [];
  while ((condMatch = condRegex.exec(body)) !== null) {
    conditions.push({ op: condMatch[1], value: parseInt(condMatch[2]), label: condMatch[3] });
  }
  // Assign maxWidth based on conditions
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const cond = conditions.find((c) => c.label === tier.label);
    if (cond) {
      if (cond.op === '<=') {
        tier.maxWidth = cond.value;
      } else if (cond.op === '<') {
        tier.maxWidth = cond.value - 1;
      }
    }
  }
  // Sort by maxWidth ascending (null = catch-all = last)
  tiers.sort((a, b) => {
    if (a.maxWidth === null) return 1;
    if (b.maxWidth === null) return -1;
    return a.maxWidth - b.maxWidth;
  });

  return tiers;
};

export default function PerSecondPricingBreakdown({ billingExpr, groupRatio, t }) {
  const { symbol, rate } = getCurrencyConfig();
  const tiers = parsePerSecondTiers(billingExpr || '');

  // groupRatio is a map like {default: 1.5, vip: 2}, extract a single ratio value
  const ratioKeys = groupRatio ? Object.keys(groupRatio) : [];
  const singleRatio = ratioKeys.length > 0 ? groupRatio[ratioKeys[0]] : 1;

  if (!tiers || tiers.length === 0) {
    return (
      <div>
        <div className='flex items-center mb-3'>
          <Avatar size='small' color='amber' className='mr-2 shadow-md'>
            <IconPriceTag size={16} />
          </Avatar>
          <Text className='text-lg font-medium'>{t('按秒计费')}</Text>
        </div>
      </div>
    );
  }

  const columns = [
    {
      title: t('档位'),
      dataIndex: 'label',
      render: (text, record) => (
        <div>
          <Tag color='blue' size='small'>{text || t('默认')}</Tag>
          {record.maxWidth !== null && (
            <div className='text-xs text-gray-500 mt-1'>
              {t('宽度')} &le; {record.maxWidth}
            </div>
          )}
        </div>
      ),
    },
    {
      title: `${t('价格')} (${symbol}/${t('秒')})`,
      dataIndex: 'pricePerSecond',
      render: (v) => {
        const num = parseFloat(v);
        if (!Number.isFinite(num)) return '-';
        const finalPrice = singleRatio ? num * singleRatio : num;
        return <Text strong>{`${symbol}${(finalPrice * rate).toFixed(3)}`}</Text>;
      },
    },
  ];

  const tierData = tiers.map((tier, i) => ({
    key: `tier-${i}`,
    label: tier.label,
    maxWidth: tier.maxWidth,
    pricePerSecond: tier.pricePerSecond || '0',
  }));

  return (
    <div>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='amber' className='mr-2 shadow-md'>
          <IconPriceTag size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>{t('按秒计费')}</Text>
          <div className='text-xs text-gray-600'>
            {t('价格根据分辨率档位按秒计费')}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Text strong className='text-sm' style={{ display: 'block', marginBottom: 8 }}>
          {t('分档价格表')}
        </Text>
        <Table
          dataSource={tierData}
          columns={columns}
          pagination={false}
          size='small'
          bordered={false}
          className='!rounded-lg'
        />
      </div>
    </div>
  );
}
