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

import React, { useState } from 'react';
import { Card, Input, Button, Typography, RadioGroup, Radio } from '@douyinfe/semi-ui';
import { IconChevronDown, IconChevronUp } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// Resolution mode uses "resolution" field (e.g. "1080p", "720p")
// Width mode uses "width" field (e.g. 1920, 1280) for OpenAI-compatible APIs.
function PerSecondPricingEditor({ model, onTiersChange, t }) {
  const tiers = model.perSecondTiers || [];
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Detect mode from existing tiers: if any tier has resolution, use resolution mode
  const hasResolution = tiers.some(tier => tier.resolution !== null && tier.resolution !== '');
  const hasWidth = tiers.some(tier => tier.maxWidth !== null && tier.maxWidth !== undefined && tier.maxWidth !== '');
  const defaultMode = hasWidth ? 'width' : (hasResolution ? 'resolution' : 'width');
  const [tierMode, setTierMode] = useState(defaultMode);
  const userSetModeRef = React.useRef(false);

  // Sync tierMode when external tiers change (e.g. after loading saved data)
  // Only auto-sync if user hasn't manually switched mode
  React.useEffect(() => {
    if (userSetModeRef.current) return;
    const res = tiers.some(tier => tier.resolution !== null && tier.resolution !== '');
    const w = tiers.some(tier => tier.maxWidth !== null && tier.maxWidth !== undefined && tier.maxWidth !== '');
    if (res && tierMode !== 'resolution') {
      setTierMode('resolution');
    } else if (!res && w && tierMode !== 'width') {
      setTierMode('width');
    } else if (!res && !w && tierMode !== 'width') {
      setTierMode('width');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers]);

  // Single base price — the last tier (or the only one if it has no condition)
  const baseTier = tiers.find((t) => {
    if (tierMode === 'resolution') return t.resolution === null || t.resolution === '';
    return t.maxWidth === null || t.maxWidth === '';
  }) || tiers[tiers.length - 1];
  const basePrice = baseTier?.pricePerSecond || '';

  const handleBasePriceChange = (value) => {
    if (!tiers.length) return;
    const next = [...tiers];
    const idx = next.findIndex((t) => {
      if (tierMode === 'resolution') return t.resolution === null || t.resolution === '';
      return t.maxWidth === null || t.maxWidth === '';
    });
    if (idx >= 0) {
      next[idx] = { ...next[idx], pricePerSecond: value };
    } else {
      next[next.length - 1] = { ...next[next.length - 1], pricePerSecond: value };
    }
    onTiersChange(next);
  };

  const updateTier = (index, field, value) => {
    const next = [...tiers];
    next[index] = { ...next[index], [field]: value };
    onTiersChange(next);
  };

  const addTier = () => {
    const tierData = { label: `tier_${tiers.length}`, pricePerSecond: '' };
    if (tierMode === 'resolution') {
      tierData.resolution = '';
      tierData.maxWidth = null;
    } else {
      tierData.maxWidth = '';
      tierData.resolution = null;
    }
    onTiersChange([...tiers, { ...tierData }]);
  };

  const removeTier = (index) => {
    if (tiers.length <= 1) return;
    onTiersChange(tiers.filter((_, i) => i !== index));
  };

  return (
    <div>
      <Card
        bodyStyle={{ padding: 16 }}
        style={{
          marginBottom: 16,
          background: 'var(--semi-color-fill-0)',
        }}
      >
        <div className='flex items-center gap-2 mb-3'>
          <div className='w-2 h-2 rounded-full bg-blue-500' />
          <span className='text-sm font-medium'>{t('按秒计费')}</span>
        </div>
        <p className='text-xs text-gray-500 mb-0'>
          {t('配置视频生成的每秒价格。预扣额度即为最终扣费额度，不做差额结算。')}
        </p>
      </Card>

      <div style={{ marginBottom: 16 }}>
        <div className='mb-1 font-medium text-gray-700'>{t('每秒价格')}</div>
        <Input
          value={basePrice}
          placeholder='0.05'
          onChange={handleBasePriceChange}
          suffix={t('$/秒')}
          style={{ width: 200 }}
        />
        <div className='mt-1 text-xs text-gray-500'>
          {t('如 $0.05/秒，生成 10 秒视频扣费 $0.50')}
          {tiers.length > 1 && (
            <span className='block mt-1' style={{ color: 'var(--semi-color-warning)' }}>
              {t('若已配置分辨率阶梯定价，此价格为兜底价格（参数不匹配任何档位时生效）')}
            </span>
          )}
        </div>
      </div>

      <div>
        <Button
          type='tertiary'
          size='small'
          onClick={() => setShowAdvanced(!showAdvanced)}
          icon={showAdvanced ? <IconChevronUp /> : <IconChevronDown />}
          style={{ padding: '4px 0' }}
        >
          {showAdvanced ? t('收起高级设置') : t('高级设置：按分辨率阶梯定价')}
        </Button>

        {showAdvanced && (
          <div style={{ marginTop: 12 }}>
            <Card bodyStyle={{ padding: 12 }} style={{ background: 'var(--semi-color-fill-0)' }}>
              <div className='text-xs text-gray-500 mb-3'>
                {t('可以按视频分辨率设置不同的每秒价格。')}
              </div>

              {/* Mode switch */}
              <div className='mb-3'>
                <div style={{ color: '#dc2626', fontWeight: 600, fontSize: 12, marginBottom: 8 }}>
                  ⚠️ {t('不同渠道、不同模型的参数及传值方式有区别，请谨慎确认！')}
                </div>
                <div className='text-xs font-medium text-gray-700 mb-1'>{t('匹配方式')}</div>
                <RadioGroup value={tierMode} onChange={(e) => {
                  userSetModeRef.current = true;
                  const newMode = e.target.value;
                  // Clear stale fields from the other mode to avoid misclassification
                  const cleaned = tiers.map(t => {
                    if (newMode === 'resolution') {
                      return { ...t, maxWidth: null };
                    } else {
                      return { ...t, resolution: null };
                    }
                  });
                  onTiersChange(cleaned);
                  setTierMode(newMode);
                }}>
                  <Radio value='resolution'>{t('按分辨率字符串（如 1080p、720p）')}</Radio>
                  <Radio value='width'>{t('按宽度像素（如 width ≤ 1920）')}</Radio>
                </RadioGroup>
              </div>

              {/* Tips based on mode */}
              {tierMode === 'resolution' && (
                <div className='text-xs text-gray-500 mb-3 p-2 rounded' style={{ background: 'var(--semi-color-fill-1)' }}>
                  <div className='mb-1' style={{ fontWeight: 500 }}>{t('💡 匹配方式：has(param("resolution"), "1080")')}</div>
                  <div>{t('系统会用 has() 函数匹配请求中的 resolution 字段（如 "1080p"、"720p"）。')}</div>
                  <div className='mt-1'>{t('只需填写分辨率的关键数字，如 1080、720、480。')}</div>
                </div>
              )}
              {tierMode === 'width' && (
                <div className='text-xs text-gray-500 mb-3 p-2 rounded' style={{ background: 'var(--semi-color-fill-1)' }}>
                  <div className='mb-1' style={{ fontWeight: 500 }}>{t('💡 常见分辨率对应的宽度（width）')}</div>
                  <div>{t('• 480P 视频（短边 480px）：横屏 16:9 → width=854；竖屏 9:16 → width=480')}</div>
                  <div>{t('• 720P 视频（短边 720px）：横屏 16:9 → width=1280；竖屏 9:16 → width=720')}</div>
                  <div>{t('• 1080P 视频（短边 1080px）：横屏 16:9 → width=1920；竖屏 9:16 → width=1080')}</div>
                  <div className='mt-1' style={{ color: 'var(--semi-color-text-2)' }}>
                    {t('系统会用 param("width") 匹配请求中的 width 字段。配置时按短边对应的 width 填写即可。')}
                  </div>
                </div>
              )}

              <div className='space-y-2'>
                {tiers.map((tier, index) => {
                  const isLast = index === tiers.length - 1;
                  const matchValue = tierMode === 'resolution' ? tier.resolution : tier.maxWidth;
                  return (
                    <div key={index} className='flex gap-2 items-start'>
                      <Input
                        value={tier.label || ''}
                        placeholder={t('档位名')}
                        onChange={(v) => updateTier(index, 'label', v)}
                        size='small'
                        style={{ width: 100 }}
                      />
                      {tierMode === 'resolution' ? (
                        <Input
                          value={matchValue ?? ''}
                          placeholder={isLast ? t('兜底价格') : t('例如 1080、720、480')}
                          onChange={(v) => updateTier(index, 'resolution', v)}
                          size='small'
                          style={{ width: 140 }}
                        />
                      ) : (
                        <Input
                          value={matchValue ?? ''}
                          placeholder={isLast ? t('兜底价格') : t('例如 720、1080、1920')}
                          onChange={(v) => {
                            const num = v === '' ? '' : Number(v)
                            updateTier(index, 'maxWidth', isNaN(num) ? '' : num)
                          }}
                          size='small'
                          style={{ width: 160 }}
                          type='number'
                        />
                      )}
                      <Input
                        value={tier.pricePerSecond ?? ''}
                        placeholder={t('$/秒')}
                        onChange={(v) => updateTier(index, 'pricePerSecond', v)}
                        size='small'
                        style={{ width: 100 }}
                        suffix={t('$/秒')}
                      />
                      <Button
                        type='danger'
                        size='small'
                        disabled={tiers.length <= 1}
                        onClick={() => removeTier(index)}
                      >
                        {t('删除')}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button
                type='tertiary'
                size='small'
                onClick={addTier}
                style={{ marginTop: 8 }}
              >
                + {t('添加档位')}
              </Button>
            </Card>
          </div>
        )}
      </div>

      {model.billingExpr && (
        <details className='mt-3'>
          <summary className='text-xs text-gray-500 cursor-pointer'>
            {t('查看生成的表达式')}
          </summary>
          <pre className='text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto'>
            {model.billingExpr}
          </pre>
        </details>
      )}
    </div>
  );
}

export default PerSecondPricingEditor;
