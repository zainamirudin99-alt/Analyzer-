'use client';

import React, { useMemo, useState } from 'react';
import { computePearsonCorrelation } from '@/lib/panel-latent-data';
import {
  MCMCParameterSummary,
  MeasurementSourceKey,
  PanelLatentEDAResult,
  PanelLatentFitResult
} from '@/lib/panel-latent-types';

const COLORS = {
  X1: '#f59e0b', // Amber — Self-Reporting
  X2: '#06b6d4', // Cyan — Satellite
  X3: '#10b981', // Emerald — Sensor
  Y: '#22c55e', // Latent Emerald
  chains: ['#10b981', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444']
};

interface ChartCardProps {
  title: string;
  subtitle: string;
  unit?: string;
  children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, subtitle, unit, children }) => (
  <div
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
      <div>
        <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>{title}</h4>
        <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{subtitle}</p>
      </div>
      {unit && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '999px',
            background: 'var(--surface-muted)',
            border: '1px solid var(--border)',
            color: 'var(--primary)'
          }}
        >
          Satuan: {unit}
        </span>
      )}
    </div>
    {children}
  </div>
);

export const PanelLatentEDACharts: React.FC<{
  eda: PanelLatentEDAResult;
  unitLabel: string;
  labels: Record<MeasurementSourceKey, string>;
}> = ({ eda, unitLabel, labels }) => {
  const [scatterPair, setScatterPair] = useState<'X1_X2' | 'X1_X3' | 'X2_X3'>('X1_X3');

  const trendChart = useMemo(() => {
    const pts = eda.yearlyAverages;
    if (pts.length === 0) return null;
    const allVals = pts.flatMap(p => [p.x1, p.x2, p.x3]).filter((v): v is number => v !== null);
    const minY = Math.min(...allVals);
    const maxY = Math.max(...allVals);
    const spanY = Math.max(1e-6, maxY - minY);
    const w = 520;
    const h = 220;
    const padL = 54;
    const padR = 16;
    const padT = 18;
    const padB = 34;

    const xOf = (idx: number) =>
      pts.length === 1 ? (padL + w - padR) / 2 : padL + (idx / (pts.length - 1)) * (w - padL - padR);
    const yOf = (val: number) => h - padB - ((val - minY) / spanY) * (h - padT - padB);

    const buildPath = (key: 'x1' | 'x2' | 'x3') => {
      const segs: string[] = [];
      pts.forEach((p, idx) => {
        const v = p[key];
        if (v === null) return;
        segs.push(`${segs.length === 0 ? 'M' : 'L'} ${xOf(idx).toFixed(1)} ${yOf(v).toFixed(1)}`);
      });
      return segs.join(' ');
    };

    return { w, h, padL, padR, padT, padB, minY, maxY, xOf, yOf, buildPath, pts };
  }, [eda]);

  const scatterData = useMemo(() => {
    const pairs: Array<{ x: number; y: number; city: string; year: number }> = [];
    eda.cityTrends.forEach(ct => {
      ct.points.forEach(p => {
        const a = scatterPair.startsWith('X1') ? p.x1 : p.x2;
        const b = scatterPair.endsWith('X2') ? p.x2 : p.x3;
        if (a !== null && b !== null) pairs.push({ x: a, y: b, city: ct.city, year: p.year });
      });
    });
    return pairs;
  }, [eda, scatterPair]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
      {/* 1. CO2 Trend by Measurement Source */}
      <ChartCard
        title="1. Tren Emisi CO₂ Rata-Rata per Sumber Pengukuran"
        subtitle="Membandingkan pergerakan tahunan rata-rata kota untuk X1, X2, dan X3."
        unit={unitLabel}
      >
        {trendChart && (
          <svg viewBox={`0 0 ${trendChart.w} ${trendChart.h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1={trendChart.padL} y1={trendChart.padT} x2={trendChart.padL} y2={trendChart.h - trendChart.padB} stroke="var(--border)" />
            <line x1={trendChart.padL} y1={trendChart.h - trendChart.padB} x2={trendChart.w - trendChart.padR} y2={trendChart.h - trendChart.padB} stroke="var(--border)" />
            <text x={8} y={trendChart.padT + 10} fontSize="10" fill="var(--text-muted)">{trendChart.maxY.toFixed(0)}</text>
            <text x={8} y={trendChart.h - trendChart.padB} fontSize="10" fill="var(--text-muted)">{trendChart.minY.toFixed(0)}</text>

            {(['x1', 'x2', 'x3'] as const).map((k, idx) => {
              const col = idx === 0 ? COLORS.X1 : idx === 1 ? COLORS.X2 : COLORS.X3;
              return (
                <path key={k} d={trendChart.buildPath(k)} fill="none" stroke={col} strokeWidth="2.4" />
              );
            })}

            {trendChart.pts.map((p, idx) => (
              <g key={p.year}>
                <text x={trendChart.xOf(idx)} y={trendChart.h - 10} fontSize="10" textAnchor="middle" fill="var(--text-muted)">
                  {p.year}
                </text>
                {p.x1 !== null && <circle cx={trendChart.xOf(idx)} cy={trendChart.yOf(p.x1)} r="3" fill={COLORS.X1} />}
                {p.x2 !== null && <circle cx={trendChart.xOf(idx)} cy={trendChart.yOf(p.x2)} r="3" fill={COLORS.X2} />}
                {p.x3 !== null && <circle cx={trendChart.xOf(idx)} cy={trendChart.yOf(p.x3)} r="3" fill={COLORS.X3} />}
              </g>
            ))}
          </svg>
        )}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          <span><strong style={{ color: COLORS.X1 }}>●</strong> {labels.X1}</span>
          <span><strong style={{ color: COLORS.X2 }}>●</strong> {labels.X2}</span>
          <span><strong style={{ color: COLORS.X3 }}>●</strong> {labels.X3}</span>
        </div>
      </ChartCard>

      {/* 2. Three-Source Comparison (Mean ± 1 SD) + Scatter */}
      <ChartCard
        title="2. Perbandingan Variasi & Scatter Antarsumber"
        subtitle="Distribusi rata-rata ± 1 SD dan sebaran pasangan antar sumber."
        unit={unitLabel}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {eda.descriptives.map((d, i) => {
            const color = i === 0 ? COLORS.X1 : i === 1 ? COLORS.X2 : COLORS.X3;
            const globalMax = Math.max(...eda.descriptives.map(x => x.max), 1);
            const pct = Math.min(100, Math.max(4, (d.mean / globalMax) * 100));
            return (
              <div key={d.sourceKey} style={{ fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <strong>{d.label}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Mean {d.mean.toFixed(1)} ± {d.sd.toFixed(1)} (CV: {(d.cv * 100).toFixed(1)}%)
                  </span>
                </div>
                <div style={{ height: '10px', borderRadius: '999px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700 }}>Scatterplot Pasangan Sumber</span>
            <select
              value={scatterPair}
              onChange={e => setScatterPair(e.target.value as any)}
              style={{ minHeight: '34px', fontSize: '12px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
            >
              <option value="X1_X3">X1 (Self-Reporting) vs X3 (Sensor)</option>
              <option value="X2_X3">X2 (Satellite) vs X3 (Sensor)</option>
              <option value="X1_X2">X1 (Self-Reporting) vs X2 (Satellite)</option>
            </select>
          </div>
          {scatterData.length > 0 && (() => {
            const xs = scatterData.map(p => p.x);
            const ys = scatterData.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const w = 440;
            const h = 155;
            const pad = 28;
            return (
              <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="var(--border)" />
                <line x1={pad} y1={h - pad} x2={w - 14} y2={h - pad} stroke="var(--border)" />
                {scatterData.map((p, idx) => {
                  const cx = pad + ((p.x - minX) / Math.max(1e-6, maxX - minX)) * (w - pad - 20);
                  const cy = h - pad - ((p.y - minY) / Math.max(1e-6, maxY - minY)) * (h - 2 * pad);
                  return (
                    <circle key={idx} cx={cx} cy={cy} r="3.6" fill="var(--primary)" fillOpacity="0.72">
                      <title>{`${p.city} (${p.year}): (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`}</title>
                    </circle>
                  );
                })}
              </svg>
            );
          })()}
        </div>
      </ChartCard>
    </div>
  );
};

export const PanelLatentDiagnosticPlots: React.FC<{
  result: PanelLatentFitResult;
}> = ({ result }) => {
  const freeParams = result.parameters.filter(p => !p.isFixed);
  const [selectedParamName, setSelectedParamName] = useState<string>(freeParams[0]?.name || result.parameters[0]?.name || '');
  const param: MCMCParameterSummary | undefined =
    result.parameters.find(p => p.name === selectedParamName) || freeParams[0] || result.parameters[0];

  if (!param) return null;

  const traceW = 500;
  const traceH = 190;
  const allTraceVals = param.chainTraces.flat();
  const tMin = Math.min(...allTraceVals);
  const tMax = Math.max(...allTraceVals);
  const tSpan = Math.max(1e-8, tMax - tMin);

  const densW = 500;
  const densH = 190;
  const maxD = Math.max(...param.densityBins.map(b => b.density), 1e-6);
  const dMinX = param.densityBins[0]?.x ?? param.mean;
  const dMaxX = param.densityBins[param.densityBins.length - 1]?.x ?? param.mean;
  const dSpanX = Math.max(1e-8, dMaxX - dMinX);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '13px', fontWeight: 700 }}>Pilih Parameter MCMC:</label>
        <select
          value={param.name}
          onChange={e => setSelectedParamName(e.target.value)}
          style={{ minHeight: '44px', fontSize: '15px', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
        >
          {result.parameters.map(p => (
            <option key={p.name} value={p.name}>
              {p.label} {p.isFixed ? '(Fixed Anchor)' : `(R-hat=${p.rHat.toFixed(3)}, ESS=${p.essBulk})`}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
        <ChartCard
          title={`Trace Plot MCMC — ${param.label}`}
          subtitle="Pencampuran (mixing) seluruh rantai pasca-warmup. Rantai yang saling bertumpuk stabil menandakan konvergensi."
        >
          <svg viewBox={`0 0 ${traceW} ${traceH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1="46" y1="14" x2="46" y2={traceH - 26} stroke="var(--border)" />
            <line x1="46" y1={traceH - 26} x2={traceW - 12} y2={traceH - 26} stroke="var(--border)" />
            <text x="4" y="22" fontSize="10" fill="var(--text-muted)">{tMax.toFixed(2)}</text>
            <text x="4" y={traceH - 28} fontSize="10" fill="var(--text-muted)">{tMin.toFixed(2)}</text>
            {param.chainTraces.map((ch, cIdx) => {
              const path = ch
                .map((v, i) => {
                  const x = 46 + (i / Math.max(1, ch.length - 1)) * (traceW - 60);
                  const y = traceH - 26 - ((v - tMin) / tSpan) * (traceH - 42);
                  return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                })
                .join(' ');
              return (
                <path
                  key={cIdx}
                  d={path}
                  fill="none"
                  stroke={COLORS.chains[cIdx % COLORS.chains.length]}
                  strokeWidth="1.35"
                  strokeOpacity="0.82"
                />
              );
            })}
          </svg>
        </ChartCard>

        <ChartCard
          title={`Distribusi Posterior — ${param.label}`}
          subtitle={`Mean = ${param.mean.toFixed(3)}, SD = ${param.sd.toFixed(3)}, 95% CI = [${param.ciLower.toFixed(3)}, ${param.ciUpper.toFixed(3)}].`}
        >
          <svg viewBox={`0 0 ${densW} ${densH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1="36" y1={densH - 26} x2={densW - 14} y2={densH - 26} stroke="var(--border)" />
            {param.densityBins.map((b, idx) => {
              const bw = (densW - 56) / Math.max(1, param.densityBins.length);
              const bh = (b.density / maxD) * (densH - 46);
              const x = 36 + idx * bw;
              const y = densH - 26 - bh;
              return <rect key={idx} x={x} y={y} width={Math.max(2, bw - 1.5)} height={bh} fill="var(--primary)" fillOpacity="0.72" rx="2" />;
            })}
            <text x="36" y={densH - 8} fontSize="10" fill="var(--text-muted)">{dMinX.toFixed(2)}</text>
            <text x={densW / 2} y={densH - 8} fontSize="10" textAnchor="middle" fill="var(--text)">{param.mean.toFixed(2)}</text>
            <text x={densW - 14} y={densH - 8} fontSize="10" textAnchor="end" fill="var(--text-muted)">{dMaxX.toFixed(2)}</text>
          </svg>
        </ChartCard>
      </div>
    </div>
  );
};

export const PanelLatentFullVisualizations: React.FC<{
  result: PanelLatentFitResult;
}> = ({ result }) => {
  const cities = useMemo(() => Array.from(new Set(result.latentEstimates.map(e => e.city))), [result]);
  const [selectedCity, setSelectedCity] = useState<string>(cities[0] || '');
  const [selectedSource, setSelectedSource] = useState<MeasurementSourceKey>('X1');

  const cityRows = useMemo(
    () => result.latentEstimates.filter(e => e.city === selectedCity).sort((a, b) => a.year - b.year),
    [result, selectedCity]
  );

  // 4x4 Correlation Matrix among X1, X2, X3, Y*
  const corrMatrix = useMemo(() => {
    const valid = result.latentEstimates.filter(e => e.x1 !== null && e.x2 !== null && e.x3 !== null);
    const vecs = [
      valid.map(v => v.x1!),
      valid.map(v => v.x2!),
      valid.map(v => v.x3!),
      valid.map(v => v.latentMean)
    ];
    const names = ['X1 (Self-Rep)', 'X2 (Satellite)', 'X3 (Sensor)', 'Y* (Latent)'];
    const mat = vecs.map((a, i) => vecs.map((b, j) => (i === j ? 1 : computePearsonCorrelation(a, b))));
    return { names, mat };
  }, [result]);

  const unit = result.scaleContext.workingUnitNote;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Selector Kota untuk Grafik 3 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '13px', fontWeight: 700 }}>Filter Kota untuk Grafik Laten:</label>
        <select
          value={selectedCity}
          onChange={e => setSelectedCity(e.target.value)}
          style={{ minHeight: '44px', fontSize: '15px', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
        >
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '16px' }}>
        {/* 3. Estimated Latent CO2 Emission with 95% Credible Ribbon */}
        <ChartCard
          title={`3. Estimasi Emisi CO₂ Laten (Y*) — Kota ${selectedCity}`}
          subtitle="Garis hijau menunjukkan mean posterior Y* beserta pita 95% Credible Interval dibandingkan X1, X2, X3."
          unit={unit}
        >
          {cityRows.length > 0 && (() => {
            const w = 500;
            const h = 210;
            const padL = 52;
            const padR = 16;
            const padT = 16;
            const padB = 32;
            const allVals = cityRows
              .flatMap(r => [r.ciLower, r.ciUpper, r.x1, r.x2, r.x3])
              .filter((v): v is number => v !== null);
            const minV = Math.min(...allVals);
            const maxV = Math.max(...allVals);
            const span = Math.max(1e-6, maxV - minV);
            const xOf = (i: number) =>
              cityRows.length === 1 ? (padL + w - padR) / 2 : padL + (i / (cityRows.length - 1)) * (w - padL - padR);
            const yOf = (v: number) => h - padB - ((v - minV) / span) * (h - padT - padB);

            const ribbonTop = cityRows.map((r, i) => `${xOf(i).toFixed(1)},${yOf(r.ciUpper).toFixed(1)}`).join(' ');
            const ribbonBot = [...cityRows].reverse().map((r, idx) => `${xOf(cityRows.length - 1 - idx).toFixed(1)},${yOf(r.ciLower).toFixed(1)}`).join(' ');
            const yPath = cityRows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(r.latentMean).toFixed(1)}`).join(' ');

            return (
              <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="var(--border)" />
                <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="var(--border)" />
                <text x={6} y={padT + 10} fontSize="10" fill="var(--text-muted)">{maxV.toFixed(0)}</text>
                <text x={6} y={h - padB} fontSize="10" fill="var(--text-muted)">{minV.toFixed(0)}</text>
                {cityRows.length > 1 && <polygon points={`${ribbonTop} ${ribbonBot}`} fill={COLORS.Y} fillOpacity="0.18" />}
                <path d={yPath} fill="none" stroke={COLORS.Y} strokeWidth="2.8" />
                {cityRows.map((r, i) => (
                  <g key={r.year}>
                    <text x={xOf(i)} y={h - 10} fontSize="10" textAnchor="middle" fill="var(--text-muted)">{r.year}</text>
                    {r.x1 !== null && <circle cx={xOf(i)} cy={yOf(r.x1)} r="3" fill={COLORS.X1} />}
                    {r.x2 !== null && <circle cx={xOf(i)} cy={yOf(r.x2)} r="3" fill={COLORS.X2} />}
                    {r.x3 !== null && <circle cx={xOf(i)} cy={yOf(r.x3)} r="3" fill={COLORS.X3} />}
                    <circle cx={xOf(i)} cy={yOf(r.latentMean)} r="4" fill={COLORS.Y} />
                  </g>
                ))}
              </svg>
            );
          })()}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            <span><strong style={{ color: COLORS.Y }}>━━</strong> Estimasi Laten Y* (95% CI)</span>
            <span><strong style={{ color: COLORS.X1 }}>●</strong> X1</span>
            <span><strong style={{ color: COLORS.X2 }}>●</strong> X2</span>
            <span><strong style={{ color: COLORS.X3 }}>●</strong> X3</span>
          </div>
        </ChartCard>

        {/* 4. Credible Interval Forest Plot (Latest Year Across Cities) */}
        <ChartCard
          title="4. Forest Plot 95% Credible Interval Emisi Laten Antar Kota"
          subtitle="Membandingkan estimasi Y* beserta interval ketidakpastian posterior pada tahun terakhir pengamatan."
          unit={unit}
        >
          {(() => {
            const latestYear = Math.max(...result.latentEstimates.map(e => e.year));
            const rows = result.latentEstimates
              .filter(e => e.year === latestYear)
              .sort((a, b) => b.latentMean - a.latentMean)
              .slice(0, 10);
            const lo = Math.min(...rows.map(r => r.ciLower));
            const hi = Math.max(...rows.map(r => r.ciUpper));
            const span = Math.max(1e-6, hi - lo);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rows.map(r => {
                  const leftPct = ((r.ciLower - lo) / span) * 100;
                  const rightPct = ((r.ciUpper - lo) / span) * 100;
                  const midPct = ((r.latentMean - lo) / span) * 100;
                  return (
                    <div key={r.city} style={{ display: 'grid', gridTemplateColumns: '95px 1fr 78px', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                      <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.city}</strong>
                      <div style={{ position: 'relative', height: '14px', background: 'var(--surface-muted)', borderRadius: '999px' }}>
                        <div
                          style={{
                            position: 'absolute',
                            top: '5px',
                            height: '4px',
                            left: `${leftPct}%`,
                            width: `${Math.max(2, rightPct - leftPct)}%`,
                            background: 'var(--primary)',
                            borderRadius: '2px'
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: '2px',
                            left: `calc(${midPct}% - 5px)`,
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: COLORS.Y,
                            border: '1.5px solid var(--surface)'
                          }}
                        />
                      </div>
                      <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{r.latentMean.toFixed(1)}</span>
                    </div>
                  );
                })}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tahun referensi: {latestYear}</div>
              </div>
            );
          })()}
        </ChartCard>

        {/* 6. Source Reliability Comparison */}
        <ChartCard
          title="6. Perbandingan Reliabilitas Relatif Ketiga Sumber"
          subtitle="Proporsi varians sinyal laten terhadap total varians pengukuran: Reliability_j ∈ [0, 100%]."
          unit="%"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '4px' }}>
            {result.sourceComparison.map((s, idx) => {
              const col = idx === 0 ? COLORS.X1 : idx === 1 ? COLORS.X2 : COLORS.X3;
              const pct = Math.min(100, Math.max(0, s.reliability * 100));
              return (
                <div key={s.sourceKey}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                    <strong>{s.sourceLabel} {s.isAnchor ? '(Anchor)' : ''}</strong>
                    <span style={{ fontWeight: 700, color: col }}>{pct.toFixed(2)}%</span>
                  </div>
                  <div style={{ height: '12px', borderRadius: '999px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: col }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    Bias α: {s.relativeBiasMean.toFixed(2)} | Loading λ: {s.loadingMean.toFixed(3)} | Error SD: {s.errorSdMean.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        {/* 7. Measurement Error & Noise-to-Signal Plot */}
        <ChartCard
          title="7. Besaran Measurement Error (σ_ε) & Ketidakpastian"
          subtitle="Menunjukkan standar deviasi measurement error posterior masing-masing sumber (semakin kecil semakin presisi relatif)."
          unit={unit}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(() => {
              const maxErr = Math.max(...result.sourceComparison.map(s => s.errorSdMean), 1e-6);
              return result.sourceComparison.map((s, idx) => {
                const col = idx === 0 ? COLORS.X1 : idx === 1 ? COLORS.X2 : COLORS.X3;
                const pct = Math.min(100, (s.errorSdMean / maxErr) * 100);
                return (
                  <div key={s.sourceKey}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                      <span>{s.sourceLabel}</span>
                      <strong>σ_ε = {s.errorSdMean.toFixed(3)} (NSR: {s.noiseToSignalRatio.toFixed(3)})</strong>
                    </div>
                    <div style={{ height: '12px', borderRadius: '999px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: col, opacity: 0.85 }} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </ChartCard>

        {/* 8. Correlation Heatmap (X1, X2, X3, Y*) */}
        <ChartCard
          title="8. Correlation Heatmap (X1, X2, X3 & Estimasi Laten Y*)"
          subtitle="Korelasi Pearson antara ketiga indikator pengukuran dan skor laten posterior."
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Variabel</th>
                  {corrMatrix.names.map(n => (
                    <th key={n} style={{ padding: '6px' }}>{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corrMatrix.names.map((rowName, rIdx) => (
                  <tr key={rowName}>
                    <td style={{ padding: '6px', textAlign: 'left', fontWeight: 700 }}>{rowName}</td>
                    {corrMatrix.mat[rIdx].map((val, cIdx) => {
                      const alpha = Math.min(0.65, Math.abs(val) * 0.65);
                      return (
                        <td
                          key={cIdx}
                          style={{
                            padding: '8px 6px',
                            border: '1px solid var(--border-light)',
                            background: val >= 0 ? `rgba(16, 185, 129, ${alpha.toFixed(2)})` : `rgba(239, 68, 68, ${alpha.toFixed(2)})`,
                            fontWeight: 700
                          }}
                        >
                          {val.toFixed(3)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        {/* 9. Observed vs Estimated Latent Emission */}
        <ChartCard
          title="9. Observed Measurement vs Estimated Latent CO₂ (Y*)"
          subtitle="Scatter hubungan sumber teramati (sumbu Y) terhadap estimasi Y* (sumbu X) dengan garis referensi 45°."
          unit={unit}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
            <select
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value as MeasurementSourceKey)}
              style={{ minHeight: '36px', fontSize: '12.5px', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
            >
              <option value="X1">{result.mapping.x1Label}</option>
              <option value="X2">{result.mapping.x2Label}</option>
              <option value="X3">{result.mapping.x3Label}</option>
            </select>
          </div>
          {(() => {
            const pts = result.ppc.obsVsPred.filter(p => p.source === selectedSource);
            if (pts.length === 0) return null;
            const latMap = new Map(result.latentEstimates.map(e => [`${e.city}::${e.year}`, e.latentMean]));
            const pairs = pts
              .map(p => ({ yStar: latMap.get(`${p.city}::${p.year}`) ?? 0, obs: p.observed, city: p.city, year: p.year }));
            const all = pairs.flatMap(p => [p.yStar, p.obs]);
            const minV = Math.min(...all);
            const maxV = Math.max(...all);
            const span = Math.max(1e-6, maxV - minV);
            const w = 480;
            const h = 195;
            const padL = 46;
            const padB = 28;
            const padT = 14;
            const padR = 14;
            const xOf = (v: number) => padL + ((v - minV) / span) * (w - padL - padR);
            const yOf = (v: number) => h - padB - ((v - minV) / span) * (h - padT - padB);
            const dotCol = selectedSource === 'X1' ? COLORS.X1 : selectedSource === 'X2' ? COLORS.X2 : COLORS.X3;
            return (
              <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="var(--border)" />
                <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="var(--border)" />
                <line x1={xOf(minV)} y1={yOf(minV)} x2={xOf(maxV)} y2={yOf(maxV)} stroke="var(--text-muted)" strokeDasharray="4 4" />
                {pairs.map((p, i) => (
                  <circle key={i} cx={xOf(p.yStar)} cy={yOf(p.obs)} r="3.6" fill={dotCol} fillOpacity="0.8">
                    <title>{`${p.city} (${p.year}) — Y*: ${p.yStar.toFixed(1)}, Obs: ${p.obs.toFixed(1)}`}</title>
                  </circle>
                ))}
                <text x={w / 2} y={h - 6} fontSize="10" textAnchor="middle" fill="var(--text-muted)">Estimasi Laten Y*</text>
              </svg>
            );
          })()}
        </ChartCard>
      </div>
    </div>
  );
};

