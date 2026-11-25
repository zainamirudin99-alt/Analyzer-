'use client';

import React from 'react';
import {
  AdvAnchorSensitivitySummary,
  AdvMcmcDiagnosticsBundle,
  AdvMonteCarloBundle,
  AdvRepeatedMeasuresAgreementEntry,
  AdvSourceParameterEstimate,
  AdvSourceRankingRow
} from '@/lib/panel-adv-types';

const PALETTE = ['#059669', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#4f46e5', '#be123c'];

export const AdvRankingProbabilityHeatmap: React.FC<{
  rows: AdvSourceRankingRow[];
}> = ({ rows }) => {
  if (!rows.length) return null;
  const J = rows[0].cumulativeRankProbs.length || rows.length;

  return (
    <div
      className="card"
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      <div>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
          Matriks Probabilitas Peringkat Kumulatif P(R_j ≤ k | Data) &amp; Entropi Posterior
        </h4>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Menampilkan peluang posterior setiap sumber menempati minimal peringkat ke-k (k = 1..{J}) di seluruh undian MCMC.
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px' }}>Sumber</th>
              {Array.from({ length: J }, (_, k) => (
                <th key={k} style={{ padding: '8px 10px', textAlign: 'center' }}>
                  P(R ≤ {k + 1})
                </th>
              ))}
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>E[Rank] ± SD</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Entropi H</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.sourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text)' }}>
                  #{r.rank} {r.sourceName} ({r.sourceLabel})
                </td>
                {r.cumulativeRankProbs.map((cp, kIdx) => {
                  const pct = cp * 100;
                  const alpha = Math.max(0.08, Math.min(0.85, cp * 0.8));
                  return (
                    <td
                      key={kIdx}
                      style={{
                        padding: '8px 10px',
                        textAlign: 'center',
                        fontWeight: kIdx === 0 ? 800 : 600,
                        background: `rgba(5, 150, 105, ${alpha.toFixed(2)})`,
                        color: cp > 0.58 ? '#ffffff' : 'var(--text)'
                      }}
                    >
                      {pct.toFixed(1)}%
                    </td>
                  );
                })}
                <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {r.expectedRank.toFixed(2)} ± {r.rankSdDispersion.toFixed(2)}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {r.rankEntropyNormalized.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AdvAnchorTrajectoryChart: React.FC<{
  anchorSensitivity: AdvAnchorSensitivitySummary;
  sources: Array<{ id: string; name: string; label: string }>;
}> = ({ anchorSensitivity, sources }) => {
  const regimes = anchorSensitivity.evaluatedAnchors;
  if (!regimes.length || !sources.length) return null;

  const J = sources.length;
  const W = 760;
  const H = 260;
  const padL = 62;
  const padR = 155;
  const padT = 28;
  const padB = 56;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (idx: number) =>
    regimes.length <= 1 ? padL + plotW / 2 : padL + (idx / (regimes.length - 1)) * plotW;
  const yOfRank = (rk: number) =>
    J <= 1 ? padT + plotH / 2 : padT + ((rk - 1) / (J - 1)) * plotH;

  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
            Trajektori Sensitivitas Peringkat Lintas {regimes.length} Rezim Anchor (Total RMSE vs R_j Invarian)
          </h4>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Garis solid = peringkat Anchor Total RMSE (Kendall&apos;s W = {anchorSensitivity.kendallWTotalRmse.toFixed(3)}); garis putus-putus = peringkat R_j = σ_j/|λ_j| (Kendall&apos;s W = {anchorSensitivity.kendallWNoiseRatio.toFixed(3)}).
          </p>
        </div>
      </div>

      <svg
        role="img"
        aria-label="Grafik trajektori peringkat sumber lintas rezim anchor"
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {Array.from({ length: J }, (_, i) => {
          const rk = i + 1;
          const y = yOfRank(rk);
          return (
            <g key={rk}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth={1} />
              <text x={padL - 10} y={y + 4} textAnchor="end" fontSize="11" fontWeight="700" fill="#475569">
                Rank #{rk}
              </text>
            </g>
          );
        })}

        {regimes.map((reg, idx) => {
          const x = xOf(idx);
          const shortLbl =
            idx === 0
              ? 'GeoMean+Med'
              : idx === 1
                ? 'SumZero'
                : reg.anchorKey.replace('MARKER_SOURCE_', 'Marker ');
          return (
            <g key={reg.anchorKey}>
              <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#e2e8f0" strokeWidth={1} />
              <text x={x} y={H - padB + 18} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#334155">
                {shortLbl}
              </text>
            </g>
          );
        })}

        {sources.map((src, sIdx) => {
          const col = PALETTE[sIdx % PALETTE.length];
          const rmsePts = regimes
            .map((reg, rIdx) => `${xOf(rIdx).toFixed(1)},${yOfRank(reg.ranksByTotalRmse[src.id] ?? J).toFixed(1)}`)
            .join(' ');
          const ratioPts = regimes
            .map((reg, rIdx) => `${xOf(rIdx).toFixed(1)},${(yOfRank(reg.ranksByNoiseRatio[src.id] ?? J) + 3).toFixed(1)}`)
            .join(' ');
          const lastRank = regimes[regimes.length - 1]?.ranksByTotalRmse[src.id] ?? sIdx + 1;

          return (
            <g key={src.id}>
              <polyline fill="none" stroke={col} strokeWidth={1.6} strokeDasharray="5 4" opacity={0.55} points={ratioPts} />
              <polyline fill="none" stroke={col} strokeWidth={2.8} points={rmsePts} />
              {regimes.map((reg, rIdx) => (
                <circle
                  key={`${src.id}_${rIdx}`}
                  cx={xOf(rIdx)}
                  cy={yOfRank(reg.ranksByTotalRmse[src.id] ?? J)}
                  r={4.5}
                  fill={col}
                />
              ))}
              <text
                x={W - padR + 10}
                y={yOfRank(lastRank) + 4}
                fontSize="11"
                fontWeight="700"
                fill={col}
              >
                {src.name}: {src.label.slice(0, 18)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const AdvDualEstimandForestChart: React.FC<{
  sourceParameters: AdvSourceParameterEstimate[];
}> = ({ sourceParameters }) => {
  if (!sourceParameters.length) return null;
  const maxUpper = Math.max(
    ...sourceParameters.flatMap(s => [s.totalRmseCrIUpper, s.noiseRatioCrIUpper]),
    1e-3
  );
  const W = 740;
  const rowH = 54;
  const H = 56 + sourceParameters.length * rowH;
  const padL = 175;
  const padR = 45;
  const plotW = W - padL - padR;
  const xOf = (val: number) => padL + (Math.max(0, val) / (maxUpper * 1.08)) * plotW;

  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
          Forest Plot 95% Credible Interval: Anchor Total RMSE vs Scale-Invariant Noise Ratio (R_j = σ_j / |λ_j|)
        </h4>
        <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Hijau = R_j = σ_j/|λ_j| (bebas lokasi anchor); Biru = Anchor Total RMSE (memuat penalti bias α_j). Semakin kiri semakin presisi/akurat relatif.
        </p>
      </div>

      <svg
        role="img"
        aria-label="Forest plot interval kredibel 95 persen per sumber"
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const val = maxUpper * 1.08 * frac;
          const x = padL + frac * plotW;
          return (
            <g key={frac}>
              <line x1={x} y1={22} x2={x} y2={H - 24} stroke="#e2e8f0" strokeWidth={1} />
              <text x={x} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">
                {val.toFixed(2)}
              </text>
            </g>
          );
        })}

        {sourceParameters.map((sp, idx) => {
          const baseY = 36 + idx * rowH;
          const yRatio = baseY;
          const yRmse = baseY + 16;
          return (
            <g key={sp.sourceId}>
              <text x={padL - 12} y={baseY + 11} textAnchor="end" fontSize="11.5" fontWeight="700" fill="#1e293b">
                {sp.sourceName} ({sp.sourceLabel.slice(0, 18)})
              </text>
              {/* Noise Ratio CrI */}
              <line
                x1={xOf(sp.noiseRatioCrILower)}
                y1={yRatio}
                x2={xOf(sp.noiseRatioCrIUpper)}
                y2={yRatio}
                stroke="#059669"
                strokeWidth={3}
              />
              <circle cx={xOf(sp.scaleAdjustedNoiseRatio)} cy={yRatio} r={4.5} fill="#059669" />
              {/* Total RMSE CrI */}
              <line
                x1={xOf(sp.totalRmseCrILower)}
                y1={yRmse}
                x2={xOf(sp.totalRmseCrIUpper)}
                y2={yRmse}
                stroke="#2563eb"
                strokeWidth={3}
              />
              <rect x={xOf(sp.anchorConditionedTotalRmse) - 4} y={yRmse - 4} width={8} height={8} fill="#2563eb" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const AdvMixedLoaComparisonChart: React.FC<{
  entries: AdvRepeatedMeasuresAgreementEntry[];
}> = ({ entries }) => {
  if (!entries.length) return null;
  const allVals = entries.flatMap(e => [e.mixedEffectsLoaLower, e.mixedEffectsLoaUpper, e.meanBias]);
  const minV = Math.min(...allVals, -1);
  const maxV = Math.max(...allVals, 1);
  const span = Math.max(1e-3, (maxV - minV) * 1.16);
  const loAxis = minV - span * 0.08;

  const W = 740;
  const rowH = 52;
  const H = 56 + entries.length * rowH;
  const padL = 175;
  const padR = 45;
  const plotW = W - padL - padR;
  const xOf = (v: number) => padL + ((v - loAxis) / span) * plotW;

  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
          Repeated-Measures Mixed-Effects Bland-Altman 95% LoA vs Pooled Naif (Parker et al., 2020)
        </h4>
        <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Rentang tebal = Mixed-Effects 95% LoA (±1.96√(σ²_between + σ²_within)); titik tengah = Mean Bias terhadap sinyal laten konsensus.
        </p>
      </div>

      <svg
        role="img"
        aria-label="Perbandingan Mixed-Effects Limits of Agreement per sumber"
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {loAxis < 0 && loAxis + span > 0 && (
          <line
            x1={xOf(0)}
            y1={18}
            x2={xOf(0)}
            y2={H - 22}
            stroke="#dc2626"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
        )}
        {entries.map((e, idx) => {
          const y = 38 + idx * rowH;
          const naiveHalf = e.naivePooledLoaWidth / 2;
          return (
            <g key={e.sourceId}>
              <text x={padL - 12} y={y + 4} textAnchor="end" fontSize="11.5" fontWeight="700" fill="#1e293b">
                {e.sourceLabel.slice(0, 22)}
              </text>
              <line
                x1={xOf(e.meanBias - naiveHalf)}
                y1={y - 7}
                x2={xOf(e.meanBias + naiveHalf)}
                y2={y - 7}
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
              <line
                x1={xOf(e.mixedEffectsLoaLower)}
                y1={y + 4}
                x2={xOf(e.mixedEffectsLoaUpper)}
                y2={y + 4}
                stroke="#0f766e"
                strokeWidth={4}
              />
              <circle cx={xOf(e.meanBias)} cy={y + 4} r={5} fill="#0f766e" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const AdvVehtariMcmcTraceChart: React.FC<{
  diagnostics: AdvMcmcDiagnosticsBundle;
}> = ({ diagnostics }) => {
  if (!diagnostics.perSource.length) return null;

  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
          Jejak Multi-Rantai MCMC (Post-Warmup) &amp; Diagnostik Vehtari et al. (2021)
        </h4>
        <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Rantai paralel yang saling berbaur stasioner (tanpa tren hanyut) mengonfirmasi konvergensi Split R-hat ≤ 1.05–1.08.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '12px' }}>
        {diagnostics.perSource.map(ps => {
          const flat = ps.traceDraws.flat();
          const minY = Math.min(...flat, 0);
          const maxY = Math.max(...flat, minY + 1e-4);
          const span = Math.max(1e-5, maxY - minY);
          const W = 320;
          const H = 110;
          return (
            <div
              key={ps.sourceId}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <strong style={{ color: 'var(--text)' }}>{ps.sourceLabel}</strong>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--primary)' }}>
                  Split R̂={ps.rankNormalizedRhat.toFixed(3)} · Fold R̂={ps.foldedRhat.toFixed(3)}
                </span>
              </div>
              <svg
                role="img"
                aria-label={`Trace plot MCMC untuk ${ps.sourceLabel}`}
                viewBox={`0 0 ${W} ${H}`}
                style={{ width: '100%', height: 'auto', background: 'var(--surface)', borderRadius: '6px' }}
              >
                {ps.traceDraws.map((chain, cIdx) => {
                  if (!chain.length) return null;
                  const pts = chain
                    .map((v, i) => {
                      const x = 8 + (i / Math.max(1, chain.length - 1)) * (W - 16);
                      const y = H - 10 - ((v - minY) / span) * (H - 20);
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      key={cIdx}
                      fill="none"
                      stroke={PALETTE[cIdx % PALETTE.length]}
                      strokeWidth={1.25}
                      opacity={0.78}
                      points={pts}
                    />
                  );
                })}
              </svg>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Bulk-ESS: {ps.bulkEss}</span>
                <span>Tail-ESS: {ps.tailEss}</span>
                <span>MCSE(σ): {ps.mcseErrorSd.toFixed(4)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const AdvMonteCarloRecoveryChart: React.FC<{
  monteCarlo: AdvMonteCarloBundle;
}> = ({ monteCarlo }) => {
  if (!monteCarlo.scenarios.length) return null;
  const W = 760;
  const rowH = 30;
  const H = 48 + monteCarlo.scenarios.length * rowH;
  const padL = 250;
  const padR = 55;
  const plotW = W - padL - padR;
  const xOf = (pct: number) => padL + (Math.max(0, Math.min(100, pct)) / 100) * plotW;

  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
          Profil Performa Monte Carlo 7 Keluarga ({monteCarlo.totalReplicationsRun} Simulasi Terkalibrasi)
        </h4>
        <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Bar hijau = Pemulihan Peringkat #1 Sejati (%); titik biru = Cakupan Interval 95% (%); garis vertikal merah putus-putus = target nominal 95%.
        </p>
      </div>

      <svg
        role="img"
        aria-label="Grafik pemulihan peringkat dan cakupan interval Monte Carlo"
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <line
          x1={xOf(95)}
          y1={16}
          x2={xOf(95)}
          y2={H - 22}
          stroke="#dc2626"
          strokeDasharray="4 3"
          strokeWidth={1.4}
        />
        {monteCarlo.scenarios.map((sc, idx) => {
          const y = 26 + idx * rowH;
          const barW = Math.max(2, xOf(sc.top1RankingRecoveryPct) - padL);
          return (
            <g key={sc.scenarioId}>
              <text x={padL - 10} y={y + 10} textAnchor="end" fontSize="10.5" fontWeight="600" fill="#334155">
                {sc.scenarioTitle.slice(0, 36)}
              </text>
              <rect
                x={padL}
                y={y + 1}
                width={barW}
                height={12}
                rx={3}
                fill={sc.commonModeSensitivityFlag || sc.identificationFailurePct >= 100 ? '#d97706' : '#059669'}
                opacity={0.82}
              />
              <circle cx={xOf(sc.interval95CoveragePct)} cy={y + 7} r={4} fill="#1d4ed8" />
              <text x={W - padR + 6} y={y + 10} fontSize="10" fontFamily="monospace" fill="#475569">
                {sc.identificationFailurePct >= 100 ? 'UNID' : `${sc.top1RankingRecoveryPct.toFixed(0)}%`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
