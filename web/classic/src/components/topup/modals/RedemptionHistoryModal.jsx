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
import React, { useState, useEffect } from 'react';
import {
  Modal,
  Table,
  Badge,
  Typography,
  Toast,
  Empty,
  Button,
  Input,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { IconSearch, IconCopy } from '@douyinfe/semi-icons';
import { API, timestamp2string, renderQuota, copy, showSuccess } from '../../../helpers';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
const { Text } = Typography;

// 状态映射配置 - 用户视角（查询的是已使用的兑换码，状态均为成功）
const STATUS_CONFIG = {
  2: { type: 'success', label: '成功' },
};

const RedemptionHistoryModal = ({ visible, onCancel, t }) => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const isMobile = useIsMobile();

  const loadRecords = async (currentPage, currentPageSize) => {
    setLoading(true);
    try {
      const qs =
        `p=${currentPage}&page_size=${currentPageSize}` +
        (keyword ? `&keyword=${encodeURIComponent(keyword)}` : '');
      const res = await API.get(`/api/user/redemptions?${qs}`);
      const { success, message, data } = res.data;
      if (success) {
        setRecords(data.items || []);
        setTotal(data.total || 0);
      } else {
        Toast.error({ content: message || t('加载失败') });
      }
    } catch (error) {
      Toast.error({ content: t('加载兑换记录失败') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadRecords(page, pageSize);
    }
  }, [visible, page, pageSize, keyword]);

  const handlePageChange = (currentPage) => {
    setPage(currentPage);
  };

  const handlePageSizeChange = (currentPageSize) => {
    setPageSize(currentPageSize);
    setPage(1);
  };

  const handleKeywordChange = (value) => {
    setKeyword(value);
    setPage(1);
  };

  const handleCopy = async (key) => {
    await copy(key);
    showSuccess(t('兑换码已复制到剪切板'));
  };

  const renderStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG[2];
    return (
      <span className='flex items-center gap-2'>
        <Badge dot type={config.type} />
        <span>{t(config.label)}</span>
      </span>
    );
  };

  const columns = [
    {
      title: t('名称'),
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (text) => <Text>{text || '-'}</Text>,
    },
    {
      title: t('兑换码'),
      dataIndex: 'key',
      key: 'key',
      width: 220,
      render: (text) => (
        <div className='flex items-center gap-1'>
          <Text ellipsis={{ showTooltip: { opts: { title: text } } }}>{text}</Text>
          <Button
            icon={<IconCopy />}
            theme='borderless'
            size='small'
            onClick={() => handleCopy(text)}
          />
        </div>
      ),
    },
    {
      title: t('额度'),
      dataIndex: 'quota',
      key: 'quota',
      width: 120,
      render: (quota) => <Text>{renderQuota(quota)}</Text>,
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatusBadge,
    },
    {
      title: t('兑换时间'),
      dataIndex: 'redeemed_time',
      key: 'redeemed_time',
      width: 180,
      render: (time) => (time ? timestamp2string(time) : '-'),
    },
  ];

  return (
    <Modal
      title={t('兑换记录')}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      size={isMobile ? 'full-width' : 'large'}
    >
      <div className='mb-3'>
        <Input
          prefix={<IconSearch />}
          placeholder={t('名称、兑换码或ID')}
          value={keyword}
          onChange={handleKeywordChange}
          showClear
        />
      </div>
      <Table
        columns={columns}
        dataSource={records}
        loading={loading}
        rowKey='id'
        pagination={{
          currentPage: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          pageSizeOpts: [10, 20, 50, 100],
          onPageChange: handlePageChange,
          onPageSizeChange: handlePageSizeChange,
        }}
        size='small'
        empty={
          <Empty
            image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
            darkModeImage={
              <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
            }
            description={t('暂无兑换记录')}
            style={{ padding: 30 }}
          />
        }
      />
    </Modal>
  );
};

export default RedemptionHistoryModal;
