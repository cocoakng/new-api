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

import React, { useEffect, useState, useRef } from 'react';
import { Banner, Button, Form, Row, Col, Spin } from '@douyinfe/semi-ui';
import {
  API,
  removeTrailingSlash,
  showError,
  showSuccess,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';

export default function SettingsPaymentGatewayXunhu(props) {
  const { t } = useTranslation();
  const sectionTitle = props.hideSectionTitle ? undefined : t('虎皮椒支付设置');
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    XunhuAppId: '',
    XunhuAppSecret: '',
    XunhuApiHost: '',
    XunhuUnitPrice: 7.3,
    XunhuMinTopUp: 1,
  });
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const currentInputs = {
        XunhuAppId: props.options.XunhuAppId || '',
        XunhuAppSecret: '',
        XunhuApiHost: props.options.XunhuApiHost || '',
        XunhuUnitPrice:
          props.options.XunhuUnitPrice !== undefined
            ? parseFloat(props.options.XunhuUnitPrice)
            : 7.3,
        XunhuMinTopUp:
          props.options.XunhuMinTopUp !== undefined
            ? parseInt(props.options.XunhuMinTopUp)
            : 1,
      };

      setInputs(currentInputs);
      formApiRef.current.setValues(currentInputs);
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitXunhuSetting = async () => {
    if (props.options.ServerAddress === '') {
      showError(t('请先填写服务器地址'));
      return;
    }

    setLoading(true);
    try {
      const options = [
        { key: 'XunhuAppId', value: inputs.XunhuAppId || '' },
      ];

      if (inputs.XunhuAppSecret && inputs.XunhuAppSecret !== '') {
        options.push({ key: 'XunhuAppSecret', value: inputs.XunhuAppSecret });
      }

      options.push({
        key: 'XunhuApiHost',
        value: removeTrailingSlash(inputs.XunhuApiHost),
      });

      options.push({ key: 'XunhuUnitPrice', value: String(inputs.XunhuUnitPrice) });
      options.push({ key: 'XunhuMinTopUp', value: String(inputs.XunhuMinTopUp) });

      const requestQueue = options.map((opt) =>
        API.put('/api/option/', {
          key: opt.key,
          value: opt.value,
        }),
      );

      const results = await Promise.all(requestQueue);

      const errorResults = results.filter((res) => !res.data.success);
      if (errorResults.length > 0) {
        errorResults.forEach((res) => {
          showError(res.data.message);
        });
      } else {
        showSuccess(t('更新成功'));
        props.refresh && props.refresh();
      }
    } catch (error) {
      showError(t('更新失败'));
    }
    setLoading(false);
  };

  const serverAddr = props.options.ServerAddress
    ? removeTrailingSlash(props.options.ServerAddress)
    : t('网站地址');

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={sectionTitle}>
          <Banner
            type='info'
            icon={<BookOpen size={16} />}
            description={
              <>
                虎皮椒支付接口配置，请在
                <a href='https://www.xunhupay.com' target='_blank' rel='noreferrer'>
                  虎皮椒官网
                </a>
                注册商户账号后获取对应密钥。
                <br />
                {t('回调地址（Webhook）')}：{serverAddr}/api/xunhu/webhook
              </>
            }
            style={{ marginBottom: 16 }}
          />
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='XunhuAppId'
                label={t('App ID')}
                placeholder={t('例如：1601111111')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='XunhuAppSecret'
                label={t('App Secret')}
                placeholder={t('敏感信息不会回显，留空表示保持不变')}
                type='password'
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='XunhuApiHost'
                label={t('API 地址')}
                placeholder={t('例如：https://api.xunhupay.com/payment/do.html')}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.InputNumber
                field='XunhuUnitPrice'
                precision={2}
                label={t('充值价格（x元/美金）')}
                placeholder={t('例如：7.3，就是7.3元/美金')}
                min={0}
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.InputNumber
                field='XunhuMinTopUp'
                label={t('最低充值美元数量')}
                placeholder={t('例如：1，就是最低充值1$')}
                min={0}
              />
            </Col>
          </Row>
          <Button onClick={submitXunhuSetting} style={{ marginTop: 16 }}>
            {t('更新虎皮椒支付设置')}
          </Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}
