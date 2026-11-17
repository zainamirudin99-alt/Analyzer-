'use client';

import React, { useMemo, useState } from 'react';
import {
  CorrelationMatricesBundle,
  MeasurementSource,
  PanelAccuracyFitResult,
  SourceAccuracyMetricRow
} from '@/lib/panel-accuracy-types';

const PALETTE = [
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#f97316', // Orange
  '#14b8a6'  // Teal
];

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

export const PanelAccuracyEDACharts: React.FC<{
  eda: CorrelationMatricesBundle;
  sources: MeasurementSource[];
  unitLabel: string;
}> = ({ eda, sources, unitLabel }) => {
  const [selectedSrcId, setSelectedSrcId] = useState<string>(sources[0]?.id || '');

  const activeSrc =
    sources.find(s => s.id === selectedSrcId) || sources[0];

  const trendModel = useMemo(() => {
    const pts = eda.yearlyAverages;
    if (pts.length === 0) return null;
    const allVals = pts
      .flatMap(p => sources.map(s => p.values[s.id]))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (allVals.length === 0) return null;
    const minY = Math.min(...allVals);
    const maxY = Math.max(...allVals);
    const spanY = Math.max(1e-6, maxY - minY);
    const w = 520;
    const h = 220;
    const padL = 52;
    const padR = 16;
    const padT = 18;
    const padB = 34;

    const xOf = (idx: number) =>
      pts.length === 1 ? (padL + w - padR) / 2 : padL + (idx / (pts.length - 1)) * (w - padL - padR);
    const yOf = (val: number) => h - padB - ((val - minY) / spanY) * (h - padT - padB);

    const buildPath = (srcId: string) => {
      const segs: string[] = [];
      pts.forEach((p, idx) => {
        const v = p.values[srcId];
        if (v === null || !Number.isFinite(v)) return;
        segs.push(`${segs.length === 0 ? 'M' : 'L'} ${xOf(idx).toFixed(1)} ${yOf(v).toFixed(1)}`);
      });
      return segs.join(' ');
    };

    return { w, h, padL, padR, padT, padB, minY, maxY, xOf, yOf, buildPath, pts };
  }, [eda, sources]);

  // Scatter against Cross-Source Peer Median Consensus (excluding activeSrc!)
  const scatterPairs = useMemo(() => {
    if (!activeSrc) return [];
    const peers = sources.filter(s => s.id !== activeSrc.id);
    const pairs: Array<{ city: string; year: number; xConsensus: number; ySource: number }> = [];
    eda.cityTrends.forEach(ct => {
      ct.points.forEach(pt => {
        const yc = pt.values[activeSrc.id];
        if (yc === null || !Number.isFinite(yc)) return;
        const peerVals = peers
          .map(p => pt.values[p.id])
          .filter((v): v is number => v !== null && Number.isFinite(v))
          .sort((a, b) => a - b);
        if (peerVals.length === 0) return;
        const mid = Math.floor(peerVals.length / 2);
        const xConsensus =
          peerVals.length % 2 === 1
            ? peerVals[mid]
            : 0.5 * (peerVals[mid - 1] + peerVals[mid]);
        pairs.push({ city: ct.city, year: pt.year, xConsensus, ySource: yc });
      });
    });
    return pairs;
  }, [eda, sources, activeSrc]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
      <ChartCard
        title="1. Tren Rata-Rata Tahunan Seluruh J Sumber Pengukuran (Setara)"
        subtitle="Seluruh sumber ditampilkan setara dari tahun ke tahun tanpa ada satu variabel yang dikunci sebagai patokan mutlak."
        unit={unitLabel}
      >
        {trendModel && (
          <svg viewBox={`0 0 ${trendModel.w} ${trendModel.h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1={trendModel.padL} y1={trendModel.padT} x2={trendModel.padL} y2={trendModel.h - trendModel.padB} stroke="var(--border)" />
            <line x1={trendModel.padL} y1={trendModel.h - trendModel.padB} x2={trendModel.w - trendModel.padR} y2={trendModel.h - trendModel.padB} stroke="var(--border)" />
            <text x={6} y={trendModel.padT + 10} fontSize="10" fill="var(--text-muted)">{trendModel.maxY.toFixed(0)}</text>
            <text x={6} y={trendModel.h - trendModel.padB} fontSize="10" fill="var(--text-muted)">{trendModel.minY.toFixed(0)}</text>

            {sources.map((s, idx) => {
              const color = PALETTE[idx % PALETTE.length];
              return (
                <path
                  key={s.id}
                  d={trendModel.buildPath(s.id)}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.3"
                />
              );
            })}

            {trendModel.pts.map((p, idx) => (
              <g key={p.year}>
                <text x={trendModel.xOf(idx)} y={trendModel.h - 10} fontSize="10" textAnchor="middle" fill="var(--text-muted)">
                  {p.year}
                </text>
                {sources.map((s, sIdx) => {
                  const v = p.values[s.id];
                  if (v === null || !Number.isFinite(v)) return null;
                  const color = PALETTE[sIdx % PALETTE.length];
                  return (
                    <circle
                      key={s.id}
                      cx={trendModel.xOf(idx)}
                      cy={trendModel.yOf(v)}
                      r="3.2"
                      fill={color}
                    />
                  );
                })}
              </g>
            ))}
          </svg>
        )}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          {sources.map((s, idx) => {
            const color = PALETTE[idx % PALETTE.length];
            return (
              <span key={s.id}>
                <strong style={{ color }}>●</strong> {s.name} ({s.label})
              </span>
            );
          })}
        </div>
      </ChartCard>

      <ChartCard
        title="2. Scatterplot Sumber Terpilih vs Median Konsensus Rekan (Garis 45°)"
        subtitle="Titik yang rapat ke garis 45° menunjukkan kesepakatan tinggi terhadap median instrumen lain."
        unit={unitLabel}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>Pilih Sumber Evaluasi:</span>
          <select
            value={activeSrc?.id || ''}
            onChange={e => setSelectedSrcId(e.target.value)}
            style={{ minHeight: '38px', fontSize: '13px', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
          >
            {sources.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.label}) vs Peer Consensus
              </option>
            ))}
          </select>
        </div>

        {scatterPairs.length > 0 && (() => {
          const allVals = scatterPairs.flatMap(p => [p.xConsensus, p.ySource]);
          const minV = Math.min(...allVals);
          const maxV = Math.max(...allVals);
          const span = Math.max(1e-6, maxV - minV);
          const w = 480;
          const h = 195;
          const padL = 48;
          const padB = 28;
          const padT = 14;
          const padR = 16;
          const xOf = (v: number) => padL + ((v - minV) / span) * (w - padL - padR);
          const yOf = (v: number) => h - padB - ((v - minV) / span) * (h - padT - padB);
          return (
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="var(--border)" />
              <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="var(--border)" />
              <line x1={xOf(minV)} y1={yOf(minV)} x2={xOf(maxV)} y2={yOf(maxV)} stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" />
              {scatterPairs.map((p, idx) => (
                <circle key={idx} cx={xOf(p.xConsensus)} cy={yOf(p.ySource)} r="3.6" fill="#06b6d4" fillOpacity="0.82">
                  <title>{`${p.city} (${p.year}) — Peer Med: ${p.xConsensus.toFixed(2)}, ${activeSrc?.name}: ${p.ySource.toFixed(2)}`}</title>
                </circle>
              ))}
              <text x={w / 2} y={h - 6} fontSize="10" textAnchor="middle" fill="var(--text-muted)">
                Median Konsensus Instrumen Rekan (Tanpa {activeSrc?.name})
              </text>
            </svg>
          );
        })()}
      </ChartCard>
    </div>
  );
};

export const PanelAccuracyBlandAltmanChart: React.FC<{
  metrics: SourceAccuracyMetricRow[];
  referenceLabel: string;
  unitLabel: string;
}> = ({ metrics, referenceLabel, unitLabel }) => {
  const [selectedId, setSelectedId] = useState<string>(metrics[0]?.sourceId || '');
  const active = metrics.find(m => m.sourceId === selectedId) || metrics[0];
  if (!active) return null;

  const ba = active.blandAltman;
  const pts = ba.points;

  return (
    <ChartCard
      title={`Bland-Altman Agreement Plot — ${active.sourceLabel} vs ${referenceLabel}`}
      subtitle={`Mean Bias = ${ba.meanBias.toFixed(3)}, 95% LoA = [${ba.loaLower.toFixed(2)}, ${ba.loaUpper.toFixed(2)}], di luar LoA = ${ba.outsideLoaCount}/${ba.n} (${ba.outsideLoaPct.toFixed(1)}%).`}
      unit={unitLabel}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Proportional Bias Slope = <strong>{ba.propBiasSlope.toFixed(4)}</strong> (p = {ba.propBiasPValue.toFixed(4)}{' '}
          {ba.hasProportionalBias ? '— Terdeteksi Bias Proporsional' : '— Homogen / Stabil'})
        </span>
        <select
          value={active.sourceId}
          onChange={e => setSelectedId(e.target.value)}
          style={{ minHeight: '38px', fontSize: '13px', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
        >
          {metrics.map(m => (
            <option key={m.sourceId} value={m.sourceId}>
              {m.sourceLabel} (MAE={m.mae.toFixed(2)})
            </option>
          ))}
        </select>
      </div>

      {pts.length > 0 && (() => {
        const w = 560;
        const h = 225;
        const padL = 56;
        const padR = 24;
        const padT = 18;
        const padB = 32;

        const xs = pts.map(p => p.meanVal);
        const ys = [...pts.map(p => p.diffVal), ba.loaLower, ba.loaUpper, 0];
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const spanX = Math.max(1e-6, maxX - minX);
        const spanY = Math.max(1e-6, maxY - minY);

        const xOf = (v: number) => padL + ((v - minX) / spanX) * (w - padL - padR);
        const yOf = (v: number) => h - padB - ((v - minY) / spanY) * (h - padT - padB);

        const yZero = yOf(0);
        const yMean = yOf(ba.meanBias);
        const yHi = yOf(ba.loaUpper);
        const yLo = yOf(ba.loaLower);

        return (
          <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="var(--border)" />
            <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="var(--border)" />
            {/* Zero reference line */}
            <line x1={padL} y1={yZero} x2={w - padR} y2={yZero} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="2 3" />
            {/* Mean bias line */}
            <line x1={padL} y1={yMean} x2={w - padR} y2={yMean} stroke="#06b6d4" strokeWidth="2" />
            {/* 95% LoA lines */}
            <line x1={padL} y1={yHi} x2={w - padR} y2={yHi} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 4" />
            <line x1={padL} y1={yLo} x2={w - padR} y2={yLo} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 4" />

            <text x={6} y={yHi + 3} fontSize="9.5" fill="#f59e0b">+1.96 SD</text>
            <text x={6} y={yMean + 3} fontSize="9.5" fill="#06b6d4">Bias {ba.meanBias.toFixed(1)}</text>
            <text x={6} y={yLo + 3} fontSize="9.5" fill="#f59e0b">-1.96 SD</text>

            {pts.map((pt, i) => (
              <circle
                key={i}
                cx={xOf(pt.meanVal)}
                cy={yOf(pt.diffVal)}
                r={pt.isOutsideLoa ? '4.4' : '3.5'}
                fill={pt.isOutsideLoa ? '#ef4444' : '#10b981'}
                fillOpacity="0.85"
              >
                <title>{`${pt.city} (${pt.year}) — Mean: ${pt.meanVal.toFixed(2)}, Diff: ${pt.diffVal.toFixed(2)}`}</title>
              </circle>
            ))}

            <text x={w / 2} y={h - 6} fontSize="10" textAnchor="middle" fill="var(--text-muted)">
              Rata-Rata Pasangan (X_comp + X_ref) / 2
            </text>
          </svg>
        );
      })()}
    </ChartCard>
  );
};

export const PanelAccuracyFullVisualizations: React.FC<{
  result: PanelAccuracyFitResult;
}> = ({ result }) => {
  const unit = result.datasetMeta.workingUnitNote;
  const refTag = 'Konsensus Laten Leave-One-Out (θ̂_-j)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PanelAccuracyBlandAltmanChart
        metrics={result.metrics}
        referenceLabel={refTag}
        unitLabel={unit}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Total Latent RMSE & Error SD Bar Chart */}
        <ChartCard
          title="Perbandingan Total Latent RMSE & Error SD (Seluruh J Sumber)"
          subtitle="Mengukur keseluruhan akurasi (bias + skala + noise acak) dan simpangan baku error acak tiap sumber (lebih kecil = lebih akurat)."
          unit={unit}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(() => {
              const maxErr = Math.max(...result.metrics.map(m => Math.max(m.totalLatentRmseCiUpper, m.errorSdCiUpper)), 1e-6);
              return result.ranking.ranks.map((rk, idx) => {
                const m = result.metrics.find(x => x.sourceId === rk.sourceId)!;
                const totPct = Math.min(100, (m.totalLatentRmse / maxErr) * 100);
                const sdPct = Math.min(100, (m.errorSd / maxErr) * 100);
                const color = PALETTE[idx % PALETTE.length];
                return (
                  <div key={m.sourceId} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                      <strong>#{rk.rank} {m.sourceLabel}</strong>
                      <span>
                        TotRMSE: <strong>{m.totalLatentRmse.toFixed(2)}</strong> | ErrSD: {m.errorSd.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ height: '10px', borderRadius: '999px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
                      <div style={{ width: `${totPct}%`, height: '100%', background: color }} />
                    </div>
                    <div style={{ height: '6px', borderRadius: '999px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
                      <div style={{ width: `${sdPct}%`, height: '100%', background: color, opacity: 0.45 }} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </ChartCard>

        {/* Bayesian Reliability R^2 & Posterior Probability of Being Best */}
        <ChartCard
          title="Reliabilitas Laten (R²) & Posterior Probabilitas Menjadi Terbaik (%)"
          subtitle="R² mengukur kemurnian sinyal emisi (mendekati 100% = paling konsisten); P(Best) adalah peluang posterior Bayesian menjadi sumber paling akurat."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {result.ranking.ranks.map((rk, idx) => {
              const m = result.metrics.find(x => x.sourceId === rk.sourceId)!;
              const r2Pct = Math.max(0, Math.min(100, m.reliabilityR2 * 100));
              const pBestPct = Math.max(0, Math.min(100, m.posteriorProbBest * 100));
              const color = PALETTE[idx % PALETTE.length];
              return (
                <div key={m.sourceId} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                    <strong>#{rk.rank} {m.sourceLabel}</strong>
                    <span>
                      R² = <strong>{r2Pct.toFixed(2)}%</strong> | P(Best) = <strong>{pBestPct.toFixed(1)}%</strong> | CCC = {m.ccc.ccc.toFixed(3)}
                    </span>
                  </div>
                  <div style={{ height: '10px', borderRadius: '999px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
                    <div style={{ width: `${r2Pct}%`, height: '100%', background: color }} />
                  </div>
                  <div style={{ height: '6px', borderRadius: '999px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
                    <div style={{ width: `${pBestPct}%`, height: '100%', background: '#10b981' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        {/* Pairwise Contrasts Forest Plot */}
        {result.pairFixedEffects.pairwiseContrasts.length > 0 && (
          <ChartCard
            title="Forest Plot Kontras Pair Fixed Effects (ΔMAE = MAE_A − MAE_B)"
            subtitle="Interval yang tidak memotong garis 0 menunjukkan perbedaan akurasi yang signifikan secara statistik."
            unit={unit}
          >
            {(() => {
              const cs = result.pairFixedEffects.pairwiseContrasts;
              const allBounds = cs.flatMap(c => [c.ciLowerCluster, c.ciUpperCluster, 0]);
              const lo = Math.min(...allBounds);
              const hi = Math.max(...allBounds);
              const span = Math.max(1e-6, hi - lo);
              const zeroPct = ((0 - lo) / span) * 100;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {cs.map((c, idx) => {
                    const lPct = ((c.ciLowerCluster - lo) / span) * 100;
                    const rPct = ((c.ciUpperCluster - lo) / span) * 100;
                    const mPct = ((c.diffAminusB - lo) / span) * 100;
                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <strong>{c.sourceALabel} vs {c.sourceBLabel}</strong>
                          <span>
                            ΔMAE = {c.diffAminusB.toFixed(2)} (Cluster p={c.pValueCluster.toFixed(4)}, Wild p={c.wildBootstrapPValue.toFixed(4)})
                          </span>
                        </div>
                        <div style={{ position: 'relative', height: '16px', background: 'var(--surface-muted)', borderRadius: '999px' }}>
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: `${zeroPct}%`,
                              width: '1.5px',
                              background: '#ef4444'
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: '6px',
                              height: '4px',
                              left: `${lPct}%`,
                              width: `${Math.max(2, rPct - lPct)}%`,
                              background: c.isSignificant05 ? '#10b981' : 'var(--text-secondary)',
                              borderRadius: '2px'
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: '3px',
                              left: `calc(${mPct}% - 5px)`,
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: c.isSignificant05 ? '#10b981' : 'var(--primary)'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </ChartCard>
        )}
      </div>
    </div>
  );
};
