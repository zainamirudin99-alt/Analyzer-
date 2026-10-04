'use client';

import React, { useState } from 'react';
import { PlotDataPoints } from '../lib/regression-engine';

interface DiagnosticPlotsProps {
  plots: PlotDataPoints;
  isTimeSeries?: boolean;
  yCol?: string;
}

export const DiagnosticPlots: React.FC<DiagnosticPlotsProps> = ({ plots, isTimeSeries = false, yCol }) => {
  const [activeTab, setActiveTab] = useState<'pp' | 'qq' | 'hist' | 'res_fit'>('pp');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const { ppPlot = [], qqPlot = [], histogram = [], resVsFit = [] } = plots;

  // SVG dimensions
  const width = 540;
  const height = 300;
  const padding = { top: 30, right: 30, bottom: 45, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  return (
    <div style={{
      background: 'var(--bg-card, #1e293b)',
      borderRadius: '8px',
      border: '1px solid var(--border-color, #334155)',
      padding: '16px',
      marginTop: '16px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>
            Grafik Diagnostik Asumsi Residu
          </h4>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
            Visualisasi bentuk distribusi, keacakan error, dan homoskedastisitas
          </p>
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary, #0f172a)', padding: '3px', borderRadius: '6px' }}>
          <button
            type="button"
            onClick={() => { setActiveTab('pp'); setTooltip(null); }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'pp' ? 'var(--accent-primary, #10b981)' : 'transparent',
              color: activeTab === 'pp' ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
            }}
          >
            Normal P-P
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('qq'); setTooltip(null); }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'qq' ? 'var(--accent-primary, #10b981)' : 'transparent',
              color: activeTab === 'qq' ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
            }}
          >
            Normal Q-Q
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('hist'); setTooltip(null); }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'hist' ? 'var(--accent-primary, #10b981)' : 'transparent',
              color: activeTab === 'hist' ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
            }}
          >
            Histogram
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('res_fit'); setTooltip(null); }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'res_fit' ? 'var(--accent-primary, #10b981)' : 'transparent',
              color: activeTab === 'res_fit' ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
            }}
          >
            Residu vs Prediksi
          </button>
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto', background: 'var(--bg-canvas, #090d16)', borderRadius: '6px', padding: '8px' }}>
        {activeTab === 'pp' && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
            {/* Grid & Axis */}
            <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(255,255,255,0.08)" />
            {/* 45-degree Reference Line */}
            <line
              x1={padding.left}
              y1={padding.top + plotH}
              x2={padding.left + plotW}
              y2={padding.top}
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {/* Points */}
            {ppPlot.map((pt, i) => {
              const cx = padding.left + pt.expected * plotW;
              const cy = padding.top + plotH - pt.observed * plotH;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r="4"
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth="0.8"
                  style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                  onMouseEnter={() => setTooltip({ x: cx, y: cy - 10, text: `E: ${pt.expected.toFixed(3)}, Obs: ${pt.observed.toFixed(3)}` })}
                  onMouseLeave={() => setTooltip(null)}
                  onTouchStart={() => setTooltip({ x: cx, y: cy - 10, text: `E: ${pt.expected.toFixed(3)}, Obs: ${pt.observed.toFixed(3)}` })}
                />
              );
            })}
            {/* Labels */}
            <text x={padding.left + plotW / 2} y={height - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Probabilitas Kumulatif Teoretis Normal
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Probabilitas Kumulatif Teramati (P-P)
            </text>
          </svg>
        )}

        {activeTab === 'qq' && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
            {/* Scaled Q-Q Plot */}
            {(() => {
              const ths = qqPlot.map(p => p.theoretical);
              const smps = qqPlot.map(p => p.sample);
              const minT = Math.min(...ths, -2.5);
              const maxT = Math.max(...ths, 2.5);
              const minS = Math.min(...smps, -2.5);
              const maxS = Math.max(...smps, 2.5);

              const scaleX = (v: number) => padding.left + ((v - minT) / (maxT - minT)) * plotW;
              const scaleY = (v: number) => padding.top + plotH - ((v - minS) / (maxS - minS)) * plotH;

              return (
                <>
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(255,255,255,0.08)" />
                  {/* Diagonal reference line */}
                  <line
                    x1={scaleX(minT)}
                    y1={scaleY(minT)}
                    x2={scaleX(maxT)}
                    y2={scaleY(maxT)}
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  {qqPlot.map((pt, i) => {
                    const cx = scaleX(pt.theoretical);
                    const cy = scaleY(pt.sample);
                    return (
                      <circle
                        key={i}
                        cx={cx}
                        cy={cy}
                        r="4"
                        fill="#38bdf8"
                        stroke="#ffffff"
                        strokeWidth="0.8"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setTooltip({ x: cx, y: cy - 10, text: `Teoretis: ${pt.theoretical.toFixed(2)}, Sampel: ${pt.sample.toFixed(2)}` })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </>
              );
            })()}
            <text x={padding.left + plotW / 2} y={height - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Kuantil Teoretis Normal Baku
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Kuantil Residu Teramati (Q-Q)
            </text>
          </svg>
        )}

        {activeTab === 'hist' && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
            {(() => {
              const maxCount = Math.max(...histogram.map(b => Math.max(b.count, b.normalDensity)), 1);
              const numBins = histogram.length;
              const barW = (plotW / numBins) * 0.9;
              const gap = (plotW / numBins) * 0.1;

              return (
                <>
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(255,255,255,0.08)" />
                  {histogram.map((b, i) => {
                    const x = padding.left + i * (barW + gap) + gap / 2;
                    const h = (b.count / maxCount) * plotH;
                    const y = padding.top + plotH - h;
                    return (
                      <rect
                        key={i}
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(2, h)}
                        fill="#10b981"
                        opacity="0.85"
                        rx="2"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setTooltip({ x: x + barW / 2, y: y - 10, text: `Bin [${b.binStart.toFixed(1)}, ${b.binEnd.toFixed(1)}]: ${b.count} kasus` })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                  {/* Normal density overlay line */}
                  <path
                    d={histogram.map((b, i) => {
                      const x = padding.left + i * (barW + gap) + barW / 2;
                      const y = padding.top + plotH - (b.normalDensity / maxCount) * plotH;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="2"
                  />
                </>
              );
            })()}
            <text x={padding.left + plotW / 2} y={height - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Nilai Residu Terstandardisasi (Z-Resid)
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Frekuensi Kasus
            </text>
          </svg>
        )}

        {activeTab === 'res_fit' && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
            {(() => {
              const fits = resVsFit.map(p => p.fitted);
              const ress = resVsFit.map(p => p.residual);
              const minF = Math.min(...fits, 0);
              const maxF = Math.max(...fits, 1);
              const maxAbsRes = Math.max(...ress.map(Math.abs), 0.1);

              const scaleX = (v: number) => padding.left + ((v - minF) / (maxF - minF || 1)) * plotW;
              const scaleY = (v: number) => padding.top + plotH / 2 - (v / maxAbsRes) * (plotH / 2);

              return (
                <>
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(255,255,255,0.08)" />
                  {/* Horizontal Zero reference line */}
                  <line
                    x1={padding.left}
                    y1={padding.top + plotH / 2}
                    x2={padding.left + plotW}
                    y2={padding.top + plotH / 2}
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  {resVsFit.map((pt, i) => {
                    const cx = scaleX(pt.fitted);
                    const cy = scaleY(pt.residual);
                    return (
                      <circle
                        key={i}
                        cx={cx}
                        cy={cy}
                        r="4"
                        fill="#a855f7"
                        stroke="#ffffff"
                        strokeWidth="0.8"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setTooltip({ x: cx, y: cy - 10, text: `Fit: ${pt.fitted.toFixed(2)}, Res: ${pt.residual.toFixed(2)}` })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </>
              );
            })()}
            <text x={padding.left + plotW / 2} y={height - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Nilai Prediksi Terpasang (Fitted Value Yhat)
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Nilai Residu Terstandardisasi
            </text>
          </svg>
        )}

        {/* Floating Tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: `${tooltip.x}px`,
              top: `${tooltip.y - 25}px`,
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid #38bdf8',
              color: '#ffffff',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              zIndex: 10
            }}
          >
            {tooltip.text}
          </div>
        )}
      </div>

      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5 }}>
        {activeTab === 'pp' && 'Normal P-P Plot: Jika residual berdistribusi normal, titik-titik akan menyebar rapat mengikuti garis diagonal merah 45 derajat.'}
        {activeTab === 'qq' && 'Normal Q-Q Plot: Menguji kesesuaian kuantil residual sampel dengan kurva normal teoretis. Deviasi di ujung menandakan ekor tebal (fat tails).'}
        {activeTab === 'hist' && 'Histogram: Menampilkan distribusi frekuensi residual. Kurva kuning menunjukkan kurva kepadatan normal baku teoretis.'}
        {activeTab === 'res_fit' && 'Residu vs Prediksi: Menguji homoskedastisitas dan linearitas. Titik-titik harus tersebar acak merata di atas dan di bawah garis merah nol.'}
      </div>
    </div>
  );
};
