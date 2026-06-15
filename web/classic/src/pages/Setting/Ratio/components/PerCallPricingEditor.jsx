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

import React, { useState, useCallback } from 'react';
import { Card, Input, Button, Typography, Tag, Popconfirm } from '@douyinfe/semi-ui';
import { IconPlus, IconDelete } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// Common video resolutions
const COMMON_RESOLUTIONS = ['480p', '720p', '1080p', '4k'];
// Common video durations (seconds)
const COMMON_DURATIONS = [4, 6, 8, 10, 15];

/**
 * Per-call 2D pricing matrix editor.
 * Admins configure resolutions (rows) × durations (columns) → fixed price per call.
 */
function PerCallPricingEditor({ model, onMatrixChange, t }) {
  const matrix = model.perCallMatrix || { resolutions: [], durations: [], prices: [] };
  const [resolutions, setResolutions] = useState(matrix.resolutions || []);
  const [durations, setDurations] = useState(matrix.durations || []);
  // Store prices as string[][] for controlled input display
  const initPrices = (matrix.prices || []).map(row => row.map(v => v.toString()));
  const [prices, setPrices] = useState(initPrices);

  // Initialize prices grid when dimensions change
  const ensurePricesGrid = useCallback((rows, cols, oldPrices) => {
    const newPrices = [];
    for (let r = 0; r < rows; r++) {
      newPrices[r] = [];
      for (let c = 0; c < cols; c++) {
        newPrices[r][c] = (oldPrices[r] && oldPrices[r][c]) || '';
      }
    }
    return newPrices;
  }, []);

  // Convert string prices to number prices for parent
  const toNumberMatrix = (strPrices) => strPrices.map(row => row.map(v => {
    const num = parseFloat(v);
    return isNaN(num) ? 0 : num;
  }));

  const updateAndNotify = useCallback((newResolutions, newDurations, newPrices) => {
    setResolutions(newResolutions);
    setDurations(newDurations);
    setPrices(newPrices);
    onMatrixChange({
      resolutions: newResolutions,
      durations: newDurations,
      prices: toNumberMatrix(newPrices),
    });
  }, [onMatrixChange]);

  // Add resolution row
  const addResolution = (value) => {
    const norm = value.toLowerCase().trim();
    if (!norm || resolutions.includes(norm)) return;
    const newResolutions = [...resolutions, norm];
    const newPrices = ensurePricesGrid(newResolutions.length, durations.length, prices);
    updateAndNotify(newResolutions, durations, newPrices);
  };

  // Remove resolution row
  const removeResolution = (index) => {
    if (resolutions.length <= 1) return;
    const newResolutions = resolutions.filter((_, i) => i !== index);
    const newPrices = prices.filter((_, i) => i !== index);
    updateAndNotify(newResolutions, durations, newPrices);
  };

  // Add duration column
  const addDuration = (value) => {
    const num = parseInt(value);
    if (!num || durations.includes(num)) return;
    const newDurations = [...durations, num].sort((a, b) => a - b);
    const newPrices = ensurePricesGrid(resolutions.length, newDurations.length, prices);
    updateAndNotify(resolutions, newDurations, newPrices);
  };

  // Remove duration column
  const removeDuration = (index) => {
    if (durations.length <= 1) return;
    const newDurations = durations.filter((_, i) => i !== index);
    const newPrices = prices.map(row => row.filter((_, i) => i !== index));
    updateAndNotify(resolutions, newDurations, newPrices);
  };

  // Update a single cell price - store raw string
  const updatePrice = (rowIndex, colIndex, value) => {
    const newPrices = prices.map((row, r) =>
      r === rowIndex ? row.map((cell, c) => (c === colIndex ? value : cell)) : [...row]
    );
    setPrices(newPrices);
    onMatrixChange({ resolutions, durations, prices: toNumberMatrix(newPrices) });
  };

  // Quick add common values
  const addCommonResolutions = () => {
    const missing = COMMON_RESOLUTIONS.filter(r => !resolutions.includes(r));
    if (missing.length === 0) return;
    const newResolutions = [...resolutions, ...missing];
    const newPrices = ensurePricesGrid(newResolutions.length, durations.length, prices);
    updateAndNotify(newResolutions, durations, newPrices);
  };

  const addCommonDurations = () => {
    const missing = COMMON_DURATIONS.filter(d => !durations.includes(d));
    if (missing.length === 0) return;
    const newDurations = [...durations, ...missing].sort((a, b) => a - b);
    const newPrices = ensurePricesGrid(resolutions.length, newDurations.length, prices);
    updateAndNotify(resolutions, newDurations, newPrices);
  };

  return (
    <div>
      <Card
        bodyStyle={{ padding: 16 }}
        style={{ marginBottom: 16, background: 'var(--semi-color-fill-0)' }}
      >
        <div className='flex items-center gap-2 mb-3'>
          <div className='w-2 h-2 rounded-full bg-emerald-500' />
          <span className='text-sm font-medium'>{t('按次矩阵计费')}</span>
        </div>
        <p className='text-xs text-gray-500 mb-0'>
          {t('配置视频生成的固定价格（按分辨率和时长）。每次调用按矩阵中的价格扣费，不按秒计算。')}
        </p>
      </Card>

      {/* Resolution rows */}
      <div style={{ marginBottom: 16 }}>
        <div className='mb-1 font-medium text-gray-700 flex items-center justify-between'>
          <span>{t('分辨率（行）')}</span>
          <Button
            type='tertiary'
            size='small'
            onClick={addCommonResolutions}
            style={{ fontSize: 11 }}
          >
            + {t('添加常用')}
          </Button>
        </div>
        <div className='flex flex-wrap gap-2 mb-2'>
          {resolutions.map((res, index) => (
            <Tag
              key={res}
              color='blue'
              closable={resolutions.length > 1}
              onClose={() => removeResolution(index)}
              style={{ cursor: 'default' }}
            >
              {res}
            </Tag>
          ))}
        </div>
        <div className='text-xs text-gray-400 mb-2'>
          {t('如果模型不按分辨率区分价格，只添加一行 "any" 作为占位，后端会自动匹配该行。')}
        </div>
        <div className='flex gap-2 items-center'>
          <Input
            placeholder={t('输入分辨率，如 720p、1080p')}
            style={{ width: 200 }}
            size='small'
            onEnterPress={(e) => {
              addResolution(e.target.value);
              e.target.value = '';
            }}
          />
          <Button
            type='primary'
            size='small'
            onClick={() => {
              const input = document.querySelector('input[placeholder*="分辨率"]');
              if (input && input.value) {
                addResolution(input.value);
                input.value = '';
              }
            }}
            icon={<IconPlus />}
          >
            {t('添加')}
          </Button>
        </div>
      </div>

      {/* Duration columns */}
      <div style={{ marginBottom: 16 }}>
        <div className='mb-1 font-medium text-gray-700 flex items-center justify-between'>
          <span>{t('时长（列/秒）')}</span>
          <Button
            type='tertiary'
            size='small'
            onClick={addCommonDurations}
            style={{ fontSize: 11 }}
          >
            + {t('添加常用')}
          </Button>
        </div>
        <div className='flex flex-wrap gap-2 mb-2'>
          {durations.map((dur, index) => (
            <Tag
              key={dur}
              color='orange'
              closable={durations.length > 1}
              onClose={() => removeDuration(index)}
              style={{ cursor: 'default' }}
            >
              {dur}s
            </Tag>
          ))}
        </div>
        <div className='flex gap-2 items-center'>
          <Input
            placeholder={t('输入时长秒数，如 4、6、10')}
            type='number'
            style={{ width: 200 }}
            size='small'
            onEnterPress={(e) => {
              addDuration(e.target.value);
              e.target.value = '';
            }}
          />
          <Button
            type='primary'
            size='small'
            onClick={() => {
              const input = document.querySelector('input[placeholder*="时长"]');
              if (input && input.value) {
                addDuration(input.value);
                input.value = '';
              }
            }}
            icon={<IconPlus />}
          >
            {t('添加')}
          </Button>
        </div>
      </div>

      {/* Price matrix table */}
      {resolutions.length > 0 && durations.length > 0 && (
        <div>
          <div className='mb-2 font-medium text-gray-700'>{t('价格矩阵（$/次）')}</div>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                maxWidth: 600,
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      background: 'var(--semi-color-fill-1)',
                      fontWeight: 600,
                      minWidth: 80,
                    }}
                  >
                    {t('分辨率')}
                  </th>
                  {durations.map((dur) => (
                    <th
                      key={dur}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'center',
                        background: 'var(--semi-color-fill-1)',
                        fontWeight: 600,
                        minWidth: 80,
                      }}
                    >
                      {dur}s
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resolutions.map((res, ri) => (
                  <tr key={res}>
                    <td
                      style={{
                        padding: '6px 12px',
                        fontWeight: 500,
                        borderBottom: '1px solid var(--semi-color-border)',
                      }}
                    >
                      {res}
                    </td>
                    {durations.map((_, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '4px 8px',
                          textAlign: 'center',
                          borderBottom: '1px solid var(--semi-color-border)',
                        }}
                      >
                        <input
                          type='text'
                          inputMode='decimal'
                          value={prices[ri]?.[ci] ?? ''}
                          placeholder='0.00'
                          style={{
                            width: 80,
                            textAlign: 'center',
                            padding: '4px 8px',
                            border: '1px solid var(--semi-color-border)',
                            borderRadius: 4,
                            fontSize: 13,
                            outline: 'none',
                            background: 'var(--semi-color-fill-0)',
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = 'var(--semi-color-primary)';
                            e.target.style.background = 'var(--semi-color-bg-0)';
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = 'var(--semi-color-border)';
                            e.target.style.background = 'var(--semi-color-fill-0)';
                          }}
                          onChange={(e) => {
                            updatePrice(ri, ci, e.target.value);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className='mt-2 text-xs text-gray-500'>
            {t('填写每个分辨率和时长组合的固定价格。价格为 $/次。')}
          </div>
        </div>
      )}

      {/* Validation warning */}
      {resolutions.length > 0 && durations.length > 0 && (
        (() => {
          const emptyCells = [];
          for (let r = 0; r < resolutions.length; r++) {
            for (let c = 0; c < durations.length; c++) {
              if (!prices[r]?.[c]) {
                emptyCells.push(`${resolutions[r]}/${durations[c]}s`);
              }
            }
          }
          if (emptyCells.length > 0) {
            return (
              <div
                className='mt-3 text-xs p-2 rounded'
                style={{
                  background: 'var(--semi-color-warning-light-default)',
                  color: 'var(--semi-color-warning)',
                }}
              >
                {t('以下组合尚未设置价格：')} {emptyCells.join(', ')}
              </div>
            );
          }
          return null;
        })()
      )}

      {/* Generated expression preview */}
      {resolutions.length > 0 && durations.length > 0 && (
        <details className='mt-3'>
          <summary className='text-xs text-gray-500 cursor-pointer'>
            {t('查看生成的表达式')}
          </summary>
          <pre className='text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto' style={{ maxHeight: 120 }}>
            {generateExprPreview(resolutions, durations, prices)}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Generate a preview expression from the matrix (for debugging/validation).
 */
function generateExprPreview(resolutions, durations, prices) {
  if (!resolutions.length || !durations.length) return '';

  let expr = '';
  const lastIndex = resolutions.length - 1;

  for (let ri = 0; ri < resolutions.length; ri++) {
    const res = resolutions[ri];
    const lastCi = durations.length - 1;

    for (let ci = 0; ci < durations.length; ci++) {
      const dur = durations[ci];
      const price = prices[ri]?.[ci] ?? 0;
      const tierLabel = `${res}_${dur}s`;

      if (ri === lastIndex && ci === lastCi) {
        // Last tier: no ternary wrapper
        if (expr) {
          expr += ` : tier("${tierLabel}", ${price})`;
        } else {
          expr = `tier("${tierLabel}", ${price})`;
        }
      } else if (ci === lastCi && ri < lastIndex) {
        // Last duration in a resolution group: only check resolution
        const tierExpr = `tier("${tierLabel}", ${price})`;
        if (expr) {
          expr = `resolution == "${res}" ? ${tierExpr} : ${expr}`;
        } else {
          expr = `resolution == "${res}" ? ${tierExpr} : `;
        }
      } else {
        // Normal cell: check both resolution and duration
        const tierExpr = `tier("${tierLabel}", ${price})`;
        const cond = `resolution == "${res}" && duration == ${dur}`;
        if (expr) {
          expr = `${cond} ? ${tierExpr} : ${expr}`;
        } else {
          expr = `${cond} ? ${tierExpr} : `;
        }
      }
    }
  }

  return `v2:${expr}`;
}

export default PerCallPricingEditor;
