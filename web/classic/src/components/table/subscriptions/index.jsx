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

import React, { useContext, useEffect, useState, useCallback } from 'react';
import { Banner, Tabs, TabPane, Toast } from '@douyinfe/semi-ui';
import CardPro from '../../common/ui/CardPro';
import SubscriptionsTable from './SubscriptionsTable';
import SubscriptionsActions from './SubscriptionsActions';
import SubscriptionsDescription from './SubscriptionsDescription';
import AddEditSubscriptionModal from './modals/AddEditSubscriptionModal';
import UserSubscriptionsTable from './UserSubscriptionsTable';
import { useSubscriptionsData } from '../../../hooks/subscriptions/useSubscriptionsData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';
import { StatusContext } from '../../../context/Status';
import { API, showError, showSuccess } from '../../../helpers';

const SubscriptionsPage = () => {
  const subscriptionsData = useSubscriptionsData();
  const isMobile = useIsMobile();
  const [statusState] = useContext(StatusContext);
  const enableEpay = !!statusState?.status?.enable_online_topup;
  const [enableWaffoPancake, setEnableWaffoPancake] = useState(false);
  const [complianceConfirmed, setComplianceConfirmed] = useState(true);
  const [activeTab, setActiveTab] = useState('plans');

  // User subscriptions state
  const [userSubscriptions, setUserSubscriptions] = useState([]);
  const [userSubLoading, setUserSubLoading] = useState(true);
  const [userSubPage, setUserSubPage] = useState(1);
  const [userSubPageSize] = useState(20);
  const [userSubTotal, setUserSubTotal] = useState(0);

  const {
    showEdit,
    editingPlan,
    sheetPlacement,
    closeEdit,
    refresh,
    openCreate,
    compactMode,
    setCompactMode,
    t,
  } = subscriptionsData;

  useEffect(() => {
    const loadComplianceStatus = async () => {
      try {
        const res = await API.get('/api/user/topup/info');
        if (res.data?.success) {
          setComplianceConfirmed(
            res.data.data?.payment_compliance_confirmed !== false,
          );
          setEnableWaffoPancake(
            res.data.data?.enable_waffo_pancake_topup || false,
          );
        }
      } catch (error) {
        // Keep the page usable if status loading fails; backend still enforces.
      }
    };
    loadComplianceStatus();
  }, []);

  const loadUserSubscriptions = useCallback(async (page = 1) => {
    setUserSubLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/users/all', {
        params: { page, page_size: userSubPageSize },
      });
      if (res.data?.success) {
        setUserSubscriptions(res.data.data?.data || []);
        setUserSubTotal(res.data.data?.total || 0);
        setUserSubPage(res.data.data?.page || page);
      }
    } catch {
      showError(t('加载用户订阅失败'));
    } finally {
      setUserSubLoading(false);
    }
  }, [userSubPageSize, t]);

  useEffect(() => {
    if (activeTab === 'userSubs') {
      void loadUserSubscriptions(userSubPage);
    }
  }, [activeTab, loadUserSubscriptions, userSubPage]);

  const handleInvalidate = async (id) => {
    try {
      const res = await API.post(
        `/api/subscription/admin/user_subscriptions/${id}/invalidate`,
      );
      if (res.data?.success) {
        showSuccess(t('订阅已取消'));
        void loadUserSubscriptions(userSubPage);
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch {
      showError(t('操作失败'));
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await API.delete(
        `/api/subscription/admin/user_subscriptions/${id}`,
      );
      if (res.data?.success) {
        showSuccess(t('订阅已删除'));
        void loadUserSubscriptions(userSubPage);
      } else {
        showError(res.data?.message || t('删除失败'));
      }
    } catch {
      showError(t('删除失败'));
    }
  };

  const handleUserSubPageChange = (page) => {
    setUserSubPage(page);
  };

  return (
    <>
      <AddEditSubscriptionModal
        visible={showEdit}
        handleClose={closeEdit}
        editingPlan={editingPlan}
        placement={sheetPlacement}
        refresh={refresh}
        t={t}
      />

      <Tabs
        type='line'
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
      >
        <TabPane tab={t('套餐管理')} itemKey='plans'>
          <CardPro
            type='type1'
            descriptionArea={
              <SubscriptionsDescription
                compactMode={compactMode}
                setCompactMode={setCompactMode}
                t={t}
              />
            }
            actionsArea={
              <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
                <div className='order-1 md:order-0 w-full md:w-auto'>
                  <SubscriptionsActions
                    openCreate={openCreate}
                    t={t}
                    disabled={!complianceConfirmed}
                  />
                </div>
                <Banner
                  type='info'
                  description={t('Stripe/Creem 需在第三方平台创建商品并填入 ID')}
                  closeIcon={null}
                  className='!rounded-lg order-2 md:order-1'
                  style={{ maxWidth: '100%' }}
                />
              </div>
            }
            paginationArea={createCardProPagination({
              currentPage: subscriptionsData.activePage,
              pageSize: subscriptionsData.pageSize,
              total: subscriptionsData.planCount,
              onPageChange: subscriptionsData.handlePageChange,
              onPageSizeChange: subscriptionsData.handlePageSizeChange,
              isMobile,
              t: subscriptionsData.t,
            })}
            t={t}
          >
            {!complianceConfirmed && (
              <Banner
                type='warning'
                description={t(
                  '订阅套餐创建和变更已锁定，管理员需先在支付设置中确认合规声明。',
                )}
                closeIcon={null}
                className='!rounded-lg mb-3'
              />
            )}
            <SubscriptionsTable
              {...subscriptionsData}
              enableEpay={enableEpay}
              enableWaffoPancake={enableWaffoPancake}
              complianceConfirmed={complianceConfirmed}
            />
          </CardPro>
        </TabPane>

        <TabPane tab={t('用户订阅')} itemKey='userSubs'>
          <UserSubscriptionsTable
            subscriptions={userSubscriptions}
            loading={userSubLoading}
            t={t}
            pagination={{
              currentPage: userSubPage,
              pageSize: userSubPageSize,
              total: userSubTotal,
            }}
            onPageChange={handleUserSubPageChange}
            onInvalidate={handleInvalidate}
            onDelete={handleDelete}
          />
        </TabPane>
      </Tabs>
    </>
  );
};

export default SubscriptionsPage;
