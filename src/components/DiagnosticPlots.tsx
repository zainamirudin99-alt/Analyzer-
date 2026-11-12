'use client';

import React, { useState, useRef } from 'react';
import { PlotDataPoints } from '../lib/regression-engine';
import { MRAResult } from '../lib/regression-moderation-mra';
import { ContingencyAnalysisResult } from '../lib/regression-contingency-chisquare';

interface DiagnosticPlotsProps {
  plots: PlotDataPoints;
  isTimeSeries?: boolean;
  yCol?: string;
  acfPacf?: Array<{
    lag: number;
    acf: number;
    pacf: number;
    ci?: number;
    confBound?: number;
  }>;
}

function downloadSvgElement(svgEl: SVGSVGElement | null, filename: string) {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgEl);
  if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const DiagnosticPlots: React.FC<DiagnosticPlotsProps> = ({
  plots,
  isTimeSeries = false,
  yCol,
  acfPacf = []
}) => {
  const [activeTab, setActiveTab] = useState<'pp' | 'qq' | 'hist' | 'res_fit' | 'actual_pred' | 'acf_pacf'>('pp');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const { ppPlot = [], qqPlot = [], histogram = [], resVsFit = [] } = plots;

  // SVG dimensions
  const width = 560;
  const height = 310;
  const padding = { top: 30, right: 30, bottom: 45, left: 58 };
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
            Grafik Diagnostik &amp; Visualisasi Statistik (Publikasi SVG)
          </h4>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
            Visualisasi distribusi error, linearitas, ketepatan prediksi (95% CI), dan korelogram
          </p>
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', background: 'var(--bg-secondary, #0f172a)', padding: '3px', borderRadius: '6px' }}>
          {([
            { id: 'pp', label: 'Normal P-P' },
            { id: 'qq', label: 'Normal Q-Q' },
            { id: 'hist', label: 'Histogram' },
            { id: 'res_fit', label: 'Residu vs Prediksi' },
            { id: 'actual_pred', label: 'Aktual vs Prediksi (95% CI)' },
            ...(acfPacf.length > 0 || isTimeSeries ? [{ id: 'acf_pacf', label: 'ACF & PACF' }] : [])
          ] as Array<{ id: typeof activeTab; label: string }>).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); setTooltip(null); }}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === tab.id ? 'var(--accent-primary, #10b981)' : 'transparent',
                color: activeTab === tab.id ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
              }}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => downloadSvgElement(svgRef.current, `diagnostik-${activeTab}.svg`)}
            title="Unduh grafik dalam format SVG resolusi publikasi"
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid var(--border-color, #334155)',
              cursor: 'pointer',
              background: 'var(--surface, #1e293b)',
              color: 'var(--text-primary, #f8fafc)'
            }}
          >
            ⬇ SVG
          </button>
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto', background: 'var(--bg-canvas, #090d16)', borderRadius: '6px', padding: '8px' }}>
        {activeTab === 'pp' && (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
            <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(148,163,184,0.2)" />
            <line
              x1={padding.left}
              y1={padding.top + plotH}
              x2={padding.left + plotW}
              y2={padding.top}
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
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
                />
              );
            })}
            <text x={padding.left + plotW / 2} y={height - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Probabilitas Kumulatif Teoretis Normal (Expected Cum Prob)
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Probabilitas Kumulatif Teramati (Observed Cum Prob)
            </text>
          </svg>
        )}

        {activeTab === 'qq' && (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
            {(() => {
              const ths = qqPlot.map(p => p.theoretical);
              const smps = qqPlot.map(p => p.sample);
              const minT = Math.min(...ths, -2.5);
              const maxT = Math.max(...ths, 2.5);
              const minS = Math.min(...smps, -2.5);
              const maxS = Math.max(...smps, 2.5);

              const scaleX = (v: number) => padding.left + ((v - minT) / (maxT - minT || 1)) * plotW;
              const scaleY = (v: number) => padding.top + plotH - ((v - minS) / (maxS - minS || 1)) * plotH;

              return (
                <>
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(148,163,184,0.2)" />
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
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
            {(() => {
              const maxCount = Math.max(...histogram.map(b => Math.max(b.count, b.normalDensity)), 1);
              const numBins = Math.max(1, histogram.length);
              const barW = (plotW / numBins) * 0.9;
              const gap = (plotW / numBins) * 0.1;

              return (
                <>
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(148,163,184,0.2)" />
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
                  {histogram.length > 0 && (
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
                  )}
                </>
              );
            })()}
            <text x={padding.left + plotW / 2} y={height - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Nilai Residu Terstandardisasi (ZRESID)
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Frekuensi Kasus
            </text>
          </svg>
        )}

        {activeTab === 'res_fit' && (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
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
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(148,163,184,0.2)" />
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
              Nilai Residu (e = Y - Yhat)
            </text>
          </svg>
        )}

        {activeTab === 'actual_pred' && (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
            {(() => {
              const pts = resVsFit.map(p => ({ fitted: p.fitted, actual: p.fitted + p.residual }));
              const allVals = pts.flatMap(p => [p.fitted, p.actual]);
              const minV = allVals.length > 0 ? Math.min(...allVals) : 0;
              const maxV = allVals.length > 0 ? Math.max(...allVals) : 1;
              const span = maxV - minV || 1;
              const rmse = pts.length > 0
                ? Math.sqrt(pts.reduce((s, p) => s + (p.actual - p.fitted) ** 2, 0) / pts.length)
                : 0;
              const ciBand = 1.96 * rmse;

              const scaleX = (v: number) => padding.left + ((v - minV) / span) * plotW;
              const scaleY = (v: number) => padding.top + plotH - ((v - minV) / span) * plotH;

              const polyPoints = [
                `${scaleX(minV)},${scaleY(minV + ciBand)}`,
                `${scaleX(maxV)},${scaleY(maxV + ciBand)}`,
                `${scaleX(maxV)},${scaleY(maxV - ciBand)}`,
                `${scaleX(minV)},${scaleY(minV - ciBand)}`
              ].join(' ');

              return (
                <>
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(148,163,184,0.2)" />
                  {/* 95% CI Band */}
                  <polygon points={polyPoints} fill="rgba(16, 185, 129, 0.14)" stroke="none" />
                  {/* 1:1 Fitted Line */}
                  <line
                    x1={scaleX(minV)}
                    y1={scaleY(minV)}
                    x2={scaleX(maxV)}
                    y2={scaleY(maxV)}
                    stroke="#10b981"
                    strokeWidth="2"
                  />
                  {pts.map((pt, i) => {
                    const cx = scaleX(pt.fitted);
                    const cy = scaleY(pt.actual);
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
                        onMouseEnter={() => setTooltip({ x: cx, y: cy - 10, text: `Pred: ${pt.fitted.toFixed(2)}, Aktual: ${pt.actual.toFixed(2)}` })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </>
              );
            })()}
            <text x={padding.left + plotW / 2} y={height - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Nilai Prediksi Model (Yhat)
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Nilai Aktual {yCol ? `(${yCol})` : '(Y)'} + Pita 95% CI
            </text>
          </svg>
        )}

        {activeTab === 'acf_pacf' && (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '340px' }}>
            {(() => {
              const lags = acfPacf.length > 0 ? acfPacf : [{ lag: 1, acf: 0, pacf: 0, confBound: 0.25 }];
              const midY = padding.top + plotH / 2;
              const scaleY = (v: number) => midY - v * (plotH / 2);
              const stepX = plotW / Math.max(1, lags.length + 1);
              const bound = lags[0]?.confBound ?? lags[0]?.ci ?? 0.25;

              return (
                <>
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(148,163,184,0.2)" />
                  {/* Zero line */}
                  <line x1={padding.left} y1={midY} x2={padding.left + plotW} y2={midY} stroke="#94a3b8" strokeWidth="1" />
                  {/* +95% and -95% Bartlett Bounds */}
                  <line x1={padding.left} y1={scaleY(bound)} x2={padding.left + plotW} y2={scaleY(bound)} stroke="#ef4444" strokeWidth="1.2" strokeDasharray="4 4" />
                  <line x1={padding.left} y1={scaleY(-bound)} x2={padding.left + plotW} y2={scaleY(-bound)} stroke="#ef4444" strokeWidth="1.2" strokeDasharray="4 4" />
                  {lags.map((item, idx) => {
                    const xAcf = padding.left + (idx + 1) * stepX - 5;
                    const xPacf = padding.left + (idx + 1) * stepX + 5;
                    const yAcf = scaleY(item.acf);
                    const yPacf = scaleY(item.pacf);
                    return (
                      <g key={item.lag}>
                        <line x1={xAcf} y1={midY} x2={xAcf} y2={yAcf} stroke="#10b981" strokeWidth="4" />
                        <circle
                          cx={xAcf}
                          cy={yAcf}
                          r="3.5"
                          fill="#10b981"
                          onMouseEnter={() => setTooltip({ x: xAcf, y: yAcf - 10, text: `Lag ${item.lag} — ACF: ${item.acf.toFixed(3)}` })}
                          onMouseLeave={() => setTooltip(null)}
                        />
                        <line x1={xPacf} y1={midY} x2={xPacf} y2={yPacf} stroke="#38bdf8" strokeWidth="4" />
                        <circle
                          cx={xPacf}
                          cy={yPacf}
                          r="3.5"
                          fill="#38bdf8"
                          onMouseEnter={() => setTooltip({ x: xPacf, y: yPacf - 10, text: `Lag ${item.lag} — PACF: ${item.pacf.toFixed(3)}` })}
                          onMouseLeave={() => setTooltip(null)}
                        />
                        <text x={padding.left + (idx + 1) * stepX} y={padding.top + plotH + 14} textAnchor="middle" fill="#94a3b8" fontSize="10">
                          {item.lag}
                        </text>
                      </g>
                    );
                  })}
                </>
              );
            })()}
            <text x={padding.left + plotW / 2} y={height - 6} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Lag Waktu (Hijau = ACF, Biru = PACF, Garis Merah = Batas Signifikansi ±1.96/√n)
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Korelasi Autokorelasi (-1 s/d +1)
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
        {activeTab === 'pp' && 'Normal P-P Plot: Jika residual berdistribusi normal, titik-titik menyebar rapat mengikuti garis diagonal merah 45 derajat.'}
        {activeTab === 'qq' && 'Normal Q-Q Plot: Menguji kesesuaian kuantil residual sampel dengan kurva normal teoretis. Deviasi di ujung menandakan ekor tebal (fat tails).'}
        {activeTab === 'hist' && 'Histogram: Menampilkan distribusi frekuensi residual. Kurva kuning menunjukkan kurva kepadatan normal baku teoretis.'}
        {activeTab === 'res_fit' && 'Residu vs Prediksi: Menguji homoskedastisitas dan linearitas. Titik-titik harus tersebar acak merata di atas dan di bawah garis merah nol.'}
        {activeTab === 'actual_pred' && 'Aktual vs Prediksi (95% CI): Menunjukkan ketepatan prediksi model terhadap nilai observasi aktual beserta pita interval kepercayaan 95%.'}
        {activeTab === 'acf_pacf' && 'Korelogram ACF & PACF: Batang yang melewati garis batas merah putus-putus (±1.96/√n) mengindikasikan autokorelasi residual yang signifikan pada lag tersebut.'}
      </div>
    </div>
  );
};

// ============================================================
// Moderation Plots: Simple Slope Interaction & Johnson-Neyman Floodlight
// ============================================================
export const ModerationPlots: React.FC<{ mra: MRAResult }> = ({ mra }) => {
  const [mode, setMode] = useState<'interaction' | 'jn'>('interaction');
  const svgRef = useRef<SVGSVGElement | null>(null);

  const width = 560;
  const height = 300;
  const padding = { top: 30, right: 35, bottom: 45, left: 60 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  return (
    <div style={{
      background: 'var(--bg-card, #1e293b)',
      borderRadius: '8px',
      border: '1px solid var(--border-color, #334155)',
      padding: '14px',
      marginTop: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
          Visualisasi Moderasi: Simple Slope &amp; Johnson-Neyman Floodlight
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setMode('interaction')}
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: mode === 'interaction' ? 'var(--accent-primary, #10b981)' : 'var(--surface-muted)',
              color: mode === 'interaction' ? '#ffffff' : 'var(--text-secondary)'
            }}
          >
            Interaction Plot (-1 SD, Mean, +1 SD)
          </button>
          <button
            type="button"
            onClick={() => setMode('jn')}
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: mode === 'jn' ? 'var(--accent-primary, #10b981)' : 'var(--surface-muted)',
              color: mode === 'jn' ? '#ffffff' : 'var(--text-secondary)'
            }}
          >
            Johnson-Neyman Floodlight
          </button>
          <button
            type="button"
            onClick={() => downloadSvgElement(svgRef.current, `mra-${mode}.svg`)}
            style={{
              padding: '5px 10px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              background: 'var(--surface)',
              color: 'var(--text-primary)'
            }}
          >
            ⬇ SVG
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--bg-canvas, #090d16)', borderRadius: '6px', padding: '8px' }}>
        {mode === 'interaction' ? (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '320px' }}>
            {(() => {
              const allPts = mra.simpleSlopes.flatMap(s => s.linePoints);
              const xs = allPts.map(p => p.xRaw);
              const ys = allPts.map(p => p.yPredicted);
              const minX = Math.min(...xs, -1);
              const maxX = Math.max(...xs, 1);
              const minY = Math.min(...ys, 0);
              const maxY = Math.max(...ys, 1);

              const scaleX = (v: number) => padding.left + ((v - minX) / (maxX - minX || 1)) * plotW;
              const scaleY = (v: number) => padding.top + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;
              const colors = ['#ef4444', '#38bdf8', '#10b981'];

              return (
                <>
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(148,163,184,0.2)" />
                  {mra.simpleSlopes.map((s, idx) => {
                    const p0 = s.linePoints[0];
                    const p1 = s.linePoints[s.linePoints.length - 1];
                    if (!p0 || !p1) return null;
                    return (
                      <g key={s.levelLabel}>
                        <line
                          x1={scaleX(p0.xRaw)}
                          y1={scaleY(p0.yPredicted)}
                          x2={scaleX(p1.xRaw)}
                          y2={scaleY(p1.yPredicted)}
                          stroke={colors[idx % colors.length]}
                          strokeWidth="2.5"
                        />
                        <circle cx={scaleX(p0.xRaw)} cy={scaleY(p0.yPredicted)} r="4" fill={colors[idx % colors.length]} />
                        <circle cx={scaleX(p1.xRaw)} cy={scaleY(p1.yPredicted)} r="4" fill={colors[idx % colors.length]} />
                      </g>
                    );
                  })}
                  <text x={padding.left + 10} y={padding.top + 18} fill="#ef4444" fontSize="11">● Rendah (-1 SD)</text>
                  <text x={padding.left + 125} y={padding.top + 18} fill="#38bdf8" fontSize="11">● Sedang (Mean)</text>
                  <text x={padding.left + 235} y={padding.top + 18} fill="#10b981" fontSize="11">● Tinggi (+1 SD)</text>
                </>
              );
            })()}
            <text x={padding.left + plotW / 2} y={height - 8} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Prediktor Utama ({mra.xCol}) {mra.centerVariables ? '[Mean-Centered]' : ''}
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Prediksi {mra.yCol}
            </text>
          </svg>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '320px' }}>
            {(() => {
              const curve = mra.johnsonNeyman.floodlightCurve;
              if (curve.length === 0) return null;
              const zs = curve.map(c => c.zRaw);
              const lows = curve.map(c => c.ciLower);
              const highs = curve.map(c => c.ciUpper);
              const minZ = Math.min(...zs);
              const maxZ = Math.max(...zs);
              const minY = Math.min(...lows, 0);
              const maxY = Math.max(...highs, 0);

              const scaleX = (v: number) => padding.left + ((v - minZ) / (maxZ - minZ || 1)) * plotW;
              const scaleY = (v: number) => padding.top + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;

              const upperPts = curve.map(c => `${scaleX(c.zRaw)},${scaleY(c.ciUpper)}`).join(' ');
              const lowerPts = [...curve].reverse().map(c => `${scaleX(c.zRaw)},${scaleY(c.ciLower)}`).join(' ');
              const slopePath = curve.map((c, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(c.zRaw)} ${scaleY(c.slope)}`).join(' ');

              return (
                <>
                  <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(148,163,184,0.2)" />
                  {/* Zero horizontal line */}
                  <line x1={padding.left} y1={scaleY(0)} x2={padding.left + plotW} y2={scaleY(0)} stroke="#ef4444" strokeWidth="1.4" strokeDasharray="4 4" />
                  {/* Confidence Band */}
                  <polygon points={`${upperPts} ${lowerPts}`} fill="rgba(56, 189, 248, 0.18)" />
                  {/* Conditional Slope Line */}
                  <path d={slopePath} fill="none" stroke="#10b981" strokeWidth="2.5" />
                  {/* Critical Roots */}
                  {mra.johnsonNeyman.criticalValuesRaw.map((r, idx) => (
                    <line
                      key={idx}
                      x1={scaleX(r)}
                      y1={padding.top}
                      x2={scaleX(r)}
                      y2={padding.top + plotH}
                      stroke="#fbbf24"
                      strokeWidth="1.8"
                      strokeDasharray="3 3"
                    />
                  ))}
                </>
              );
            })()}
            <text x={padding.left + plotW / 2} y={height - 8} textAnchor="middle" fill="#94a3b8" fontSize="11">
              Nilai Moderator ({mra.zCol}) — Garis Kuning = Batas Kritis Johnson-Neyman
            </text>
            <text x={18} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 18 ${padding.top + plotH / 2})`} fill="#94a3b8" fontSize="11">
              Efek Kondisional θ(X→Y) ± 95% CI
            </text>
          </svg>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Contingency Plots: Clustered Bar, 100% Stacked Bar, Residual Heatmap
// ============================================================
export const ContingencyPlots: React.FC<{ data: ContingencyAnalysisResult }> = ({ data }) => {
  const [chartType, setChartType] = useState<'clustered' | 'stacked' | 'heatmap'>('clustered');
  const svgRef = useRef<SVGSVGElement | null>(null);

  const width = 560;
  const height = 290;
  const padding = { top: 30, right: 30, bottom: 45, left: 60 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const palette = ['#10b981', '#38bdf8', '#a855f7', '#fbbf24', '#f43f5e', '#14b8a6'];

  return (
    <div style={{
      background: 'var(--bg-card, #1e293b)',
      borderRadius: '8px',
      border: '1px solid var(--border-color, #334155)',
      padding: '14px',
      marginTop: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
          Visualisasi Tabel Kontingensi ({data.rowVar} × {data.colVar})
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setChartType('clustered')}
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: chartType === 'clustered' ? 'var(--accent-primary, #10b981)' : 'var(--surface-muted)',
              color: chartType === 'clustered' ? '#ffffff' : 'var(--text-secondary)'
            }}
          >
            Clustered Bar
          </button>
          <button
            type="button"
            onClick={() => setChartType('stacked')}
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: chartType === 'stacked' ? 'var(--accent-primary, #10b981)' : 'var(--surface-muted)',
              color: chartType === 'stacked' ? '#ffffff' : 'var(--text-secondary)'
            }}
          >
            100% Stacked Bar
          </button>
          <button
            type="button"
            onClick={() => setChartType('heatmap')}
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: chartType === 'heatmap' ? 'var(--accent-primary, #10b981)' : 'var(--surface-muted)',
              color: chartType === 'heatmap' ? '#ffffff' : 'var(--text-secondary)'
            }}
          >
            Residual Heatmap (z_adj)
          </button>
          <button
            type="button"
            onClick={() => downloadSvgElement(svgRef.current, `contingency-${chartType}.svg`)}
            style={{
              padding: '5px 10px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              background: 'var(--surface)',
              color: 'var(--text-primary)'
            }}
          >
            ⬇ SVG
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--bg-canvas, #090d16)', borderRadius: '6px', padding: '8px' }}>
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '310px' }}>
          <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="none" stroke="rgba(148,163,184,0.2)" />
          {chartType === 'clustered' && (() => {
            const maxObs = Math.max(...data.cells.flatMap(r => r.map(c => c.observed)), 1);
            const rCount = Math.max(1, data.rowCategories.length);
            const cCount = Math.max(1, data.colCategories.length);
            const groupW = plotW / rCount;
            const barW = (groupW * 0.75) / cCount;

            return data.rowCategories.map((rLab, i) => {
              const gx = padding.left + i * groupW + groupW * 0.125;
              return (
                <g key={rLab}>
                  {data.colCategories.map((cLab, j) => {
                    const cell = data.cells[i][j];
                    const h = (cell.observed / maxObs) * (plotH - 15);
                    const x = gx + j * barW;
                    const y = padding.top + plotH - h;
                    return (
                      <rect
                        key={cLab}
                        x={x}
                        y={y}
                        width={Math.max(4, barW - 2)}
                        height={Math.max(2, h)}
                        fill={palette[j % palette.length]}
                        rx="2"
                      />
                    );
                  })}
                  <text x={padding.left + i * groupW + groupW / 2} y={height - 12} textAnchor="middle" fill="#94a3b8" fontSize="11">
                    {rLab}
                  </text>
                </g>
              );
            });
          })()}

          {chartType === 'stacked' && (() => {
            const rCount = Math.max(1, data.rowCategories.length);
            const groupW = plotW / rCount;
            const barW = Math.min(70, groupW * 0.65);

            return data.rowCategories.map((rLab, i) => {
              const x = padding.left + i * groupW + (groupW - barW) / 2;
              let cumPct = 0;
              return (
                <g key={rLab}>
                  {data.colCategories.map((cLab, j) => {
                    const pct = data.cells[i][j].rowPercent;
                    const h = (pct / 100) * plotH;
                    const y = padding.top + plotH - ((cumPct + pct) / 100) * plotH;
                    cumPct += pct;
                    return (
                      <rect
                        key={cLab}
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(1, h)}
                        fill={palette[j % palette.length]}
                      />
                    );
                  })}
                  <text x={padding.left + i * groupW + groupW / 2} y={height - 12} textAnchor="middle" fill="#94a3b8" fontSize="11">
                    {rLab}
                  </text>
                </g>
              );
            });
          })()}

          {chartType === 'heatmap' && (() => {
            const rCount = Math.max(1, data.rowCategories.length);
            const cCount = Math.max(1, data.colCategories.length);
            const cellW = plotW / cCount;
            const cellH = plotH / rCount;

            return data.rowCategories.map((rLab, i) => (
              <g key={rLab}>
                <text x={padding.left - 8} y={padding.top + i * cellH + cellH / 2 + 4} textAnchor="end" fill="#94a3b8" fontSize="11">
                  {rLab}
                </text>
                {data.colCategories.map((cLab, j) => {
                  const z = data.cells[i][j].adjustedResidual;
                  const intensity = Math.min(0.85, Math.abs(z) / 3.5);
                  const fill = z >= 0
                    ? `rgba(16, 185, 129, ${Math.max(0.15, intensity)})`
                    : `rgba(239, 68, 68, ${Math.max(0.15, intensity)})`;
                  return (
                    <g key={cLab}>
                      <rect
                        x={padding.left + j * cellW + 2}
                        y={padding.top + i * cellH + 2}
                        width={Math.max(10, cellW - 4)}
                        height={Math.max(10, cellH - 4)}
                        fill={fill}
                        rx="4"
                      />
                      <text
                        x={padding.left + j * cellW + cellW / 2}
                        y={padding.top + i * cellH + cellH / 2 + 4}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="11"
                        fontWeight="bold"
                      >
                        z={z.toFixed(2)} (O={data.cells[i][j].observed})
                      </text>
                      {i === rCount - 1 && (
                        <text x={padding.left + j * cellW + cellW / 2} y={height - 12} textAnchor="middle" fill="#94a3b8" fontSize="11">
                          {cLab}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            ));
          })()}
        </svg>
      </div>
    </div>
  );
};
