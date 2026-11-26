'use client';

import React, { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import {
  MsmaDescriptiveBundle,
  MsmaEstimationBundle,
  MsmaRobustnessBundle,
  MsmaSourceAccuracyEstimate,
  MsmaSourceConfig,
  MsmaTwoSourceResult
} from '../types';
import { fmtAdaptive } from '../utils/numerical';

const SERIES_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#4f46e5', '#be123c'];

function exportSvgElement(svgEl: SVGSVGElement | null, filenameBase: string, format: 'svg' | 'png') {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = svgEl.viewBox.baseVal;
  const width = vb && vb.width > 0 ? vb.width : 760;
  const height = vb && vb.height > 0 ? vb.height : 320;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  // Prepend crisp white background rect for clean publication export
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', '0');
  bgRect.setAttribute('y', '0');
  bgRect.setAttribute('width', String(width));
  bgRect.setAttribute('height', String(height));
  bgRect.setAttribute('fill', '#ffffff');
  clone.insertBefore(bgRect, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });

  if (format === 'svg') {
    const url = URL.createObjectURL(svgBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(pngBlob => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${filenameBase}.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    }
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

const ChartFrame: React.FC<{
  title: string;
  subtitle: string;
  interpretation: string;
  filenameBase: string;
  legendItems?: Array<{ label: string; color: string }>;
  children: (svgRef: React.RefObject<SVGSVGElement>) => React.ReactNode;
}> = ({ title, subtitle, interpretation, filenameBase, legendItems, children }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  return (
    <div
      className="card"
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        border: '1px solid var(--border)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>{title}</h4>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => exportSvgElement(svgRef.current, filenameBase, 'png')}
            style={{ minHeight: '38px', padding: '5px 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <Download size={13} />
            <span>PNG</span>
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => exportSvgElement(svgRef.current, filenameBase, 'svg')}
            style={{ minHeight: '38px', padding: '5px 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <Download size={13} />
            <span>SVG</span>
          </button>
        </div>
      </div>

      {legendItems && legendItems.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          {legendItems.map(li => (
            <span key={li.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: li.color, display: 'inline-block' }} />
              {li.label}
            </span>
          ))}
        </div>
      )}

      {children(svgRef)}

      <div
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          background: 'var(--surface-muted)',
          borderLeft: '3px solid var(--primary)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          lineHeight: 1.5
        }}
      >
        <strong>Interpretasi Grafik:</strong> {interpretation}
      </div>
    </div>
  );
};

// 1. Error Variance & 95% CI Comparison Chart
export const MsmaErrorVarianceChart: React.FC<{
  estimates: MsmaSourceAccuracyEstimate[];
}> = ({ estimates }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (estimates.length === 0) return null;

  const sorted = [...estimates].sort((a, b) => (a.relativeRank ?? 99) - (b.relativeRank ?? 99));
  const maxVal = Math.max(
    1e-6,
    ...sorted.map(e => Math.max(e.errorSdCi95[1], Math.abs(e.errorStandardDeviation)))
  ) * 1.15;

  const W = 740;
  const H = Math.max(230, 86 + sorted.length * 48);
  const padL = 195;
  const padR = 70;
  const padT = 26;
  const padB = 42;
  const plotW = W - padL - padR;
  const xOf = (v: number) => padL + (Math.max(0, v) / maxVal) * plotW;

  const unit = sorted[0]?.unit ?? 'unit';
  const best = sorted[0];

  return (
    <ChartFrame
      title="1. Error Standard Deviation & 95% Cluster-Bootstrap Confidence Interval"
      subtitle={`Perbandingan simpangan baku kesalahan terkalibrasi (σ̂_ε dalam ${unit}) beserta rentang ketidakpastian 95%`}
      filenameBase="MSMA_01_Error_SD_Comparison"
      legendItems={[
        { label: 'Estimasi Titik σ̂_ε', color: '#2563eb' },
        { label: 'Rentang 95% Entity-Cluster Bootstrap CI', color: '#0f172a' }
      ]}
      interpretation={
        best.relativeRank === 1
          ? `Sumber "${best.displayName}" memiliki simpangan galat terkalibrasi paling kecil (${fmtAdaptive(best.errorStandardDeviation)} ${unit}, 95% CI [${fmtAdaptive(best.errorSdCi95[0])}, ${fmtAdaptive(best.errorSdCi95[1])}]); semakin ke kiri posisi batang, semakin tinggi presisi relatif sumber.`
          : 'Estimasi varians galat mengalami kendala identifikasi sehingga pemeringkatan ditahan.'
      }
    >
      {svgRef => (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {[0, 0.25, 0.5, 0.75, 1].map(fr => {
            const x = padL + fr * plotW;
            const v = fr * maxVal;
            return (
              <g key={fr}>
                <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#cbd5e1" strokeDasharray="3 3" />
                <text x={x} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="#475569">
                  {fmtAdaptive(v)}
                </text>
              </g>
            );
          })}
          <text x={padL + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#334155">
            Calibrated Error Standard Deviation σ̂_ε ({unit})
          </text>

          {sorted.map((e, idx) => {
            const cy = padT + 26 + idx * 46;
            const barW = Math.max(2, xOf(Math.max(0, e.errorStandardDeviation)) - padL);
            const ciLo = xOf(Math.max(0, e.errorSdCi95[0]));
            const ciHi = xOf(Math.max(0, e.errorSdCi95[1]));
            const color = SERIES_COLORS[idx % SERIES_COLORS.length];
            return (
              <g
                key={e.sourceId}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                <text x={padL - 10} y={cy + 4} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">
                  {e.relativeRank ? `#${e.relativeRank} ` : ''}{e.displayName.slice(0, 24)}
                </text>
                <rect
                  x={padL}
                  y={cy - 12}
                  width={barW}
                  height={24}
                  rx={5}
                  fill={color}
                  opacity={hoverIdx === idx ? 0.95 : 0.78}
                >
                  <title>
                    {`${e.displayName}: Error SD = ${fmtAdaptive(e.errorStandardDeviation)} ${unit} | Error Var = ${fmtAdaptive(e.totalComparableErrorVariance)} | 95% CI [${fmtAdaptive(e.errorSdCi95[0])}, ${fmtAdaptive(e.errorSdCi95[1])}]`}
                  </title>
                </rect>
                <line x1={ciLo} y1={cy} x2={ciHi} y2={cy} stroke="#0f172a" strokeWidth={2} />
                <line x1={ciLo} y1={cy - 6} x2={ciLo} y2={cy + 6} stroke="#0f172a" strokeWidth={2} />
                <line x1={ciHi} y1={cy - 6} x2={ciHi} y2={cy + 6} stroke="#0f172a" strokeWidth={2} />
                <text x={Math.max(padL + barW, ciHi) + 8} y={cy + 4} fontSize="11" fontWeight="700" fill="#1e293b">
                  {fmtAdaptive(e.errorStandardDeviation)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </ChartFrame>
  );
};

// 2. Relative Accuracy Ranking & ETC R² / Bootstrap P(#1) Chart
export const MsmaRelativeRankingChart: React.FC<{
  estimates: MsmaSourceAccuracyEstimate[];
}> = ({ estimates }) => {
  if (estimates.length === 0) return null;
  const sorted = [...estimates].sort((a, b) => (a.relativeRank ?? 99) - (b.relativeRank ?? 99));
  const W = 740;
  const H = Math.max(230, 86 + sorted.length * 48);
  const padL = 195;
  const padR = 70;
  const padT = 24;
  const padB = 40;
  const plotW = W - padL - padR;

  return (
    <ChartFrame
      title="2. Relative Accuracy Score: ETC Signal Reliability (R²_ETC %) & Bootstrap P(Rank #1)"
      subtitle="Persentase variasi sinyal sebenarnya yang berhasil ditangkap masing-masing sumber (McColl et al., 2014) vs peluang menduduki peringkat #1"
      filenameBase="MSMA_02_Relative_Accuracy_Ranking"
      legendItems={[
        { label: 'Korelasi terhadap Variabel Laten R²_ETC (%)', color: '#059669' },
        { label: 'Probabilitas Bootstrap Peringkat #1 (%)', color: '#2563eb' }
      ]}
      interpretation="Semakin mendekati 100% nilai R²_ETC dan Probabilitas P(Rank #1), semakin konsisten sumber tersebut merepresentasikan sinyal laten bersama dengan gangguan derau minimal."
    >
      {svgRef => (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {[0, 25, 50, 75, 100].map(pct => {
            const x = padL + (pct / 100) * plotW;
            return (
              <g key={pct}>
                <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#cbd5e1" strokeDasharray="3 3" />
                <text x={x} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="#475569">
                  {pct}%
                </text>
              </g>
            );
          })}
          <text x={padL + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#334155">
            Persentase Reliabilitas Sinyal &amp; Keyakinan Peringkat (%)
          </text>

          {sorted.map((e, idx) => {
            const cy = padT + 24 + idx * 46;
            const r2W = Math.max(2, e.etcCorrelationR2 * plotW);
            const p1W = Math.max(2, (e.bootstrapRank1ProbPct / 100) * plotW);
            return (
              <g key={e.sourceId}>
                <text x={padL - 10} y={cy + 4} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">
                  {e.relativeRank ? `#${e.relativeRank} ` : ''}{e.displayName.slice(0, 24)}
                </text>
                <rect x={padL} y={cy - 13} width={r2W} height={11} rx={3} fill="#059669">
                  <title>{`${e.displayName} R²_ETC = ${(e.etcCorrelationR2 * 100).toFixed(2)}% (SNR = ${e.snrDb.toFixed(2)} dB)`}</title>
                </rect>
                <rect x={padL} y={cy + 1} width={p1W} height={11} rx={3} fill="#2563eb">
                  <title>{`${e.displayName} Bootstrap P(Rank #1) = ${e.bootstrapRank1ProbPct.toFixed(1)}%`}</title>
                </rect>
                <text x={padL + Math.max(r2W, p1W) + 8} y={cy + 4} fontSize="10.5" fontWeight="700" fill="#1e293b">
                  R²={(e.etcCorrelationR2 * 100).toFixed(1)}% · P(#1)={e.bootstrapRank1ProbPct.toFixed(0)}%
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </ChartFrame>
  );
};

// 3. Pairwise Scatterplot + Identity 1:1 + Calibration Line + Outlier Highlight
export const MsmaPairwiseScatterChart: React.FC<{
  descriptives: MsmaDescriptiveBundle;
  sources: MsmaSourceConfig[];
}> = ({ descriptives, sources }) => {
  const [pairIdx, setPairIdx] = useState(0);
  const scatters = descriptives.pairwiseScatters;
  if (scatters.length === 0) return null;
  const active = scatters[Math.min(pairIdx, scatters.length - 1)];
  const unitA = sources.find(s => s.id === active.sourceAId)?.unit ?? 'unit';
  const unitB = sources.find(s => s.id === active.sourceBId)?.unit ?? 'unit';

  const allVals = active.points.flatMap(p => [p.a, p.b]);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = Math.max(1e-6, maxV - minV);
  const lo = minV - 0.06 * span;
  const hi = maxV + 0.06 * span;

  const W = 740;
  const H = 320;
  const padL = 72;
  const padR = 36;
  const padT = 22;
  const padB = 48;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (v: number) => padL + ((v - lo) / (hi - lo)) * plotW;
  const yOf = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {scatters.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {scatters.map((sc, idx) => (
            <button
              key={`${sc.sourceAId}_${sc.sourceBId}`}
              type="button"
              onClick={() => setPairIdx(idx)}
              className={idx === pairIdx ? 'btn btn-primary' : 'btn btn-outline'}
              style={{ minHeight: '38px', padding: '5px 12px', fontSize: '12px' }}
            >
              {sc.sourceAName} vs {sc.sourceBName}
            </button>
          ))}
        </div>
      )}

      <ChartFrame
        title={`3. Pairwise Scatterplot & Calibration Line: ${active.sourceAName} vs ${active.sourceBName}`}
        subtitle={`N = ${active.nPairs} pasangan panel · Pearson r = ${active.pearsonR.toFixed(4)} · Spearman ρ = ${active.spearmanRho.toFixed(4)}`}
        filenameBase={`MSMA_03_Scatter_${pairIdx + 1}`}
        legendItems={[
          { label: 'Observasi Normal', color: '#2563eb' },
          { label: 'Outlier Residual (> 3.5 MAD)', color: '#dc2626' },
          { label: 'Garis Kesetaraan 1:1', color: '#64748b' },
          { label: 'Garis Regresi Linear', color: '#059669' }
        ]}
        interpretation={`Titik yang menyimpang jauh dari garis putus-putus 1:1 menandakan adanya pergeseran bias aditif/skala atau pencilan spesifik kota-tahun (ditandai merah). Korelasi tinggi semata (${active.pearsonR.toFixed(3)}) tidak membuktikan ketiadaan bias sistematis.`}
      >
        {svgRef => (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {[0, 0.25, 0.5, 0.75, 1].map(fr => {
              const v = lo + fr * (hi - lo);
              const x = xOf(v);
              const y = yOf(v);
              return (
                <g key={fr}>
                  <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#e2e8f0" />
                  <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" />
                  <text x={x} y={H - padB + 16} textAnchor="middle" fontSize="10.5" fill="#475569">{fmtAdaptive(v)}</text>
                  <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10.5" fill="#475569">{fmtAdaptive(v)}</text>
                </g>
              );
            })}

            <line x1={xOf(lo)} y1={yOf(lo)} x2={xOf(hi)} y2={yOf(hi)} stroke="#64748b" strokeWidth={1.5} strokeDasharray="5 4" />
            <line
              x1={xOf(lo)}
              y1={Math.max(padT, Math.min(H - padB, yOf(active.olsIntercept + active.olsSlope * lo)))}
              x2={xOf(hi)}
              y2={Math.max(padT, Math.min(H - padB, yOf(active.olsIntercept + active.olsSlope * hi)))}
              stroke="#059669"
              strokeWidth={2}
            />

            {active.points.slice(0, 450).map((pt, i) => (
              <circle
                key={i}
                cx={xOf(pt.a)}
                cy={yOf(pt.b)}
                r={pt.isOutlier ? 5 : 3.6}
                fill={pt.isOutlier ? '#dc2626' : '#2563eb'}
                opacity={0.78}
              >
                <title>{`${pt.entity} (${pt.period}): ${active.sourceAName}=${fmtAdaptive(pt.a)} ${unitA}, ${active.sourceBName}=${fmtAdaptive(pt.b)} ${unitB}${pt.isOutlier ? ' [Outlier >3.5 MAD]' : ''}`}</title>
              </circle>
            ))}

            <text x={padL + plotW / 2} y={H - 8} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#334155">
              {active.sourceAName} ({unitA})
            </text>
            <text
              x={16}
              y={padT + plotH / 2}
              textAnchor="middle"
              fontSize="11.5"
              fontWeight="700"
              fill="#334155"
              transform={`rotate(-90 16 ${padT + plotH / 2})`}
            >
              {active.sourceBName} ({unitB})
            </text>
          </svg>
        )}
      </ChartFrame>
    </div>
  );
};

// 4. Repeated-Measures Panel Bland-Altman Plot (for J = 2 or Pairwise Inspection)
export const MsmaBlandAltmanChart: React.FC<{
  twoSource: MsmaTwoSourceResult;
}> = ({ twoSource }) => {
  const pts = twoSource.points;
  if (pts.length === 0) return null;

  const minM = Math.min(...pts.map(p => p.meanPair));
  const maxM = Math.max(...pts.map(p => p.meanPair));
  const spanM = Math.max(1e-6, maxM - minM);
  const xLo = minM - 0.05 * spanM;
  const xHi = maxM + 0.05 * spanM;

  const allY = [
    ...pts.map(p => p.diffPair),
    twoSource.loaLowerRepeatedMeasures,
    twoSource.loaUpperRepeatedMeasures
  ];
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const spanY = Math.max(1e-6, maxY - minY);
  const yLo = minY - 0.12 * spanY;
  const yHi = maxY + 0.12 * spanY;

  const W = 740;
  const H = 310;
  const padL = 74;
  const padR = 44;
  const padT = 24;
  const padB = 48;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (v: number) => padL + ((v - xLo) / (xHi - xLo)) * plotW;
  const yOf = (v: number) => padT + plotH - ((v - yLo) / (yHi - yLo)) * plotH;

  return (
    <ChartFrame
      title={`4. Repeated-Measures Panel Bland-Altman Plot (${twoSource.source1Name} − ${twoSource.source2Name})`}
      subtitle={`Mean Bias = ${fmtAdaptive(twoSource.meanDifference)} ${twoSource.unit} · 95% RM-LoA = [${fmtAdaptive(twoSource.loaLowerRepeatedMeasures)}, ${fmtAdaptive(twoSource.loaUpperRepeatedMeasures)}]`}
      filenameBase="MSMA_04_Panel_Bland_Altman"
      legendItems={[
        { label: 'Mean Difference (Bias Rata-Rata)', color: '#2563eb' },
        { label: '95% Repeated-Measures LoA (Parker et al., 2020)', color: '#dc2626' },
        { label: '95% Naive Pooled LoA', color: '#94a3b8' }
      ]}
      interpretation={`Garis merah menunjukkan batas kesepakatan 95% yang telah memperhitungkan pengelompokan observasi berulang per kota. Plot ini mengukur kesepakatan bersama dan tidak mengklaim sumber mana yang mutlak lebih akurat.`}
    >
      {svgRef => (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <line x1={padL} y1={yOf(0)} x2={W - padR} y2={yOf(0)} stroke="#cbd5e1" strokeWidth={1} />
          <line x1={padL} y1={yOf(twoSource.meanDifference)} x2={W - padR} y2={yOf(twoSource.meanDifference)} stroke="#2563eb" strokeWidth={2} />
          <line x1={padL} y1={yOf(twoSource.loaUpperRepeatedMeasures)} x2={W - padR} y2={yOf(twoSource.loaUpperRepeatedMeasures)} stroke="#dc2626" strokeWidth={1.8} strokeDasharray="6 4" />
          <line x1={padL} y1={yOf(twoSource.loaLowerRepeatedMeasures)} x2={W - padR} y2={yOf(twoSource.loaLowerRepeatedMeasures)} stroke="#dc2626" strokeWidth={1.8} strokeDasharray="6 4" />
          <line x1={padL} y1={yOf(twoSource.loaUpperNaive)} x2={W - padR} y2={yOf(twoSource.loaUpperNaive)} stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="2 3" />
          <line x1={padL} y1={yOf(twoSource.loaLowerNaive)} x2={W - padR} y2={yOf(twoSource.loaLowerNaive)} stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="2 3" />

          {pts.slice(0, 450).map((p, idx) => (
            <circle key={idx} cx={xOf(p.meanPair)} cy={yOf(p.diffPair)} r={3.6} fill="#0f766e" opacity={0.76}>
              <title>{`${p.entity} (${p.period}): Mean=${fmtAdaptive(p.meanPair)}, Diff=${fmtAdaptive(p.diffPair)} ${twoSource.unit}`}</title>
            </circle>
          ))}

          {[0, 0.5, 1].map(fr => {
            const xv = xLo + fr * (xHi - xLo);
            const yv = yLo + fr * (yHi - yLo);
            return (
              <g key={fr}>
                <text x={xOf(xv)} y={H - padB + 16} textAnchor="middle" fontSize="10.5" fill="#475569">{fmtAdaptive(xv)}</text>
                <text x={padL - 8} y={yOf(yv) + 4} textAnchor="end" fontSize="10.5" fill="#475569">{fmtAdaptive(yv)}</text>
              </g>
            );
          })}

          <text x={padL + plotW / 2} y={H - 8} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#334155">
            Rerata Pasangan (X₁ + X₂)/2 ({twoSource.unit})
          </text>
          <text
            x={16}
            y={padT + plotH / 2}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            fill="#334155"
            transform={`rotate(-90 16 ${padT + plotH / 2})`}
          >
            Selisih X₁ − X₂ ({twoSource.unit})
          </text>
        </svg>
      )}
    </ChartFrame>
  );
};

// 5. Panel Time Series Trajectory Comparison
export const MsmaTimeSeriesChart: React.FC<{
  descriptives: MsmaDescriptiveBundle;
  sources: MsmaSourceConfig[];
}> = ({ descriptives, sources }) => {
  const pMeans = descriptives.periodMeans;
  if (pMeans.length < 2) return null;

  const allVals: number[] = [];
  for (const pm of pMeans) {
    for (const s of sources) {
      const v = pm.valuesBySource[s.id];
      if (v !== null && Number.isFinite(v)) allVals.push(v);
    }
  }
  if (allVals.length === 0) return null;
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = Math.max(1e-6, maxV - minV);
  const yLo = minV - 0.1 * span;
  const yHi = maxV + 0.1 * span;

  const W = 740;
  const H = 280;
  const padL = 74;
  const padR = 32;
  const padT = 22;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (idx: number) => padL + (idx / Math.max(1, pMeans.length - 1)) * plotW;
  const yOf = (v: number) => padT + plotH - ((v - yLo) / (yHi - yLo)) * plotH;

  return (
    <ChartFrame
      title="5. Time Series Comparison: Pergerakan Rata-Rata Lintas Tahun per Sumber"
      subtitle={`Membandingkan sinkronisasi arah tren temporal rata-rata pada ${pMeans.length} periode panel`}
      filenameBase="MSMA_05_Time_Series_Comparison"
      legendItems={sources.map((s, idx) => ({
        label: `${s.displayName} (${s.unit})`,
        color: SERIES_COLORS[idx % SERIES_COLORS.length]
      }))}
      interpretation="Pergerakan kurva yang paralel lintas tahun menunjukkan koherensi penangkapan guncangan makro temporal, sementara jarak vertikal konstan mencerminkan perbedaan intersep/bias aditif relatif."
    >
      {svgRef => (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {[0, 0.5, 1].map(fr => {
            const v = yLo + fr * (yHi - yLo);
            const y = yOf(v);
            return (
              <g key={fr}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" />
                <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10.5" fill="#475569">{fmtAdaptive(v)}</text>
              </g>
            );
          })}

          {pMeans.map((pm, idx) => (
            <text key={pm.period} x={xOf(idx)} y={H - padB + 18} textAnchor="middle" fontSize="11" fontWeight="600" fill="#334155">
              {pm.period}
            </text>
          ))}

          {sources.map((s, sIdx) => {
            const color = SERIES_COLORS[sIdx % SERIES_COLORS.length];
            const pts = pMeans
              .map((pm, idx) => {
                const v = pm.valuesBySource[s.id];
                return v !== null && Number.isFinite(v) ? { x: xOf(idx), y: yOf(v), period: pm.period, v } : null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);
            const dPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
            return (
              <g key={s.id}>
                <path d={dPath} fill="none" stroke={color} strokeWidth={2.4} />
                {pts.map(p => (
                  <circle key={p.period} cx={p.x} cy={p.y} r={4.2} fill={color}>
                    <title>{`${s.displayName} (${p.period}): Mean = ${fmtAdaptive(p.v)} ${s.unit}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}

          <text x={padL + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#334155">
            Periode Pengamatan Panel
          </text>
        </svg>
      )}
    </ChartFrame>
  );
};

// 6. Distribution Range & Boxplot Summary + Outlier Count
export const MsmaDistributionBoxplotChart: React.FC<{
  descriptives: MsmaDescriptiveBundle;
}> = ({ descriptives }) => {
  const stats = descriptives.sourceStats;
  if (stats.length === 0) return null;

  const minV = Math.min(...stats.map(s => s.min));
  const maxV = Math.max(...stats.map(s => s.max));
  const span = Math.max(1e-6, maxV - minV);
  const lo = minV - 0.05 * span;
  const hi = maxV + 0.08 * span;

  const W = 740;
  const H = Math.max(220, 82 + stats.length * 46);
  const padL = 185;
  const padR = 85;
  const padT = 22;
  const padB = 40;
  const plotW = W - padL - padR;
  const xOf = (v: number) => padL + ((v - lo) / (hi - lo)) * plotW;

  return (
    <ChartFrame
      title="6. Distribution, Boxplot Whiskers & Outlier Screening per Sumber"
      subtitle="Rentang Min–Max, kotak Mean ± 1 SD / Median-IQR, dan deteksi observasi pencilan (> 3.5 MAD)"
      filenameBase="MSMA_06_Distribution_Boxplot"
      legendItems={[
        { label: 'Rentang Min s.d. Max', color: '#94a3b8' },
        { label: 'Rentang Kuartil / ±0.5 IQR di sekitar Median', color: '#2563eb' },
        { label: 'Titik Mean', color: '#dc2626' }
      ]}
      interpretation="Memperlihatkan kemiringan sebaran (jarak Median terhadap Mean) dan apakah terdapat observasi pencilan ekstrem pada masing-masing sumber sebelum transformasi diterapkan."
    >
      {svgRef => (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {[0, 0.25, 0.5, 0.75, 1].map(fr => {
            const v = lo + fr * (hi - lo);
            const x = xOf(v);
            return (
              <g key={fr}>
                <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#e2e8f0" />
                <text x={x} y={H - padB + 16} textAnchor="middle" fontSize="10.5" fill="#475569">{fmtAdaptive(v)}</text>
              </g>
            );
          })}

          {stats.map((s, idx) => {
            const cy = padT + 24 + idx * 44;
            const xMin = xOf(s.min);
            const xMax = xOf(s.max);
            const qLo = xOf(Math.max(s.min, s.median - 0.5 * s.iqr));
            const qHi = xOf(Math.min(s.max, s.median + 0.5 * s.iqr));
            const xMed = xOf(s.median);
            const xMean = xOf(s.mean);
            const color = SERIES_COLORS[idx % SERIES_COLORS.length];

            return (
              <g key={s.sourceId}>
                <text x={padL - 10} y={cy + 4} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">
                  {s.displayName.slice(0, 23)}
                </text>
                <line x1={xMin} y1={cy} x2={xMax} y2={cy} stroke="#64748b" strokeWidth={2} />
                <line x1={xMin} y1={cy - 6} x2={xMin} y2={cy + 6} stroke="#64748b" strokeWidth={2} />
                <line x1={xMax} y1={cy - 6} x2={xMax} y2={cy + 6} stroke="#64748b" strokeWidth={2} />
                <rect x={qLo} y={cy - 11} width={Math.max(4, qHi - qLo)} height={22} rx={4} fill={color} opacity={0.35} stroke={color} strokeWidth={1.6}>
                  <title>{`${s.displayName}: Min=${fmtAdaptive(s.min)}, Median=${fmtAdaptive(s.median)}, Mean=${fmtAdaptive(s.mean)}, Max=${fmtAdaptive(s.max)}, Outliers=${s.outlierCountMad}`}</title>
                </rect>
                <line x1={xMed} y1={cy - 11} x2={xMed} y2={cy + 11} stroke="#0f172a" strokeWidth={2.2} />
                <circle cx={xMean} cy={cy} r={4} fill="#dc2626" />
                <text x={W - padR + 8} y={cy + 4} fontSize="10.5" fontWeight="700" fill={s.outlierCountMad > 0 ? '#b91c1c' : '#15803d'}>
                  Out:{s.outlierCountMad}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </ChartFrame>
  );
};

// 7. Correlation Heatmap (Pearson & Spearman)
export const MsmaCorrelationHeatmap: React.FC<{
  descriptives: MsmaDescriptiveBundle;
  sources: MsmaSourceConfig[];
}> = ({ descriptives, sources }) => {
  const [mode, setMode] = useState<'pearson' | 'spearman'>('pearson');
  const J = sources.length;
  if (J < 2) return null;

  const mat = mode === 'pearson' ? descriptives.pearsonMatrix : descriptives.spearmanMatrix;
  const cell = Math.min(76, Math.floor(380 / J));
  const padL = 175;
  const padT = 56;
  const W = padL + J * cell + 60;
  const H = padT + J * cell + 36;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          type="button"
          onClick={() => setMode('pearson')}
          className={mode === 'pearson' ? 'btn btn-primary' : 'btn btn-outline'}
          style={{ minHeight: '38px', padding: '5px 12px', fontSize: '12px' }}
        >
          Pearson Linear (r)
        </button>
        <button
          type="button"
          onClick={() => setMode('spearman')}
          className={mode === 'spearman' ? 'btn btn-primary' : 'btn btn-outline'}
          style={{ minHeight: '38px', padding: '5px 12px', fontSize: '12px' }}
        >
          Spearman Rank (ρ)
        </button>
      </div>

      <ChartFrame
        title={`7. Correlation Heatmap (${mode === 'pearson' ? 'Pearson r' : 'Spearman Rank ρ'})`}
        subtitle="Kekuatan asosiasi monotonik/linear antarsumber pada data panel"
        filenameBase={`MSMA_07_Correlation_Heatmap_${mode}`}
        interpretation="Korelasi positif yang kuat dan searah di seluruh sel luar-diagonal merupakan prasyarat agar sinyal bersama T teridentifikasi pada model collocation, namun korelasi tinggi BUKAN bukti independensi galat."
      >
        {svgRef => (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: '680px', height: 'auto', display: 'block' }}>
            {sources.map((s, idx) => (
              <g key={s.id}>
                <text x={padL - 8} y={padT + idx * cell + cell / 2 + 4} textAnchor="end" fontSize="11.5" fontWeight="700" fill="#0f172a">
                  {s.displayName.slice(0, 21)}
                </text>
                <text x={padL + idx * cell + cell / 2} y={padT - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">
                  S{idx + 1}
                </text>
              </g>
            ))}

            {mat.map((row, rIdx) =>
              row.map((val, cIdx) => {
                const abs = Math.min(1, Math.max(0, Math.abs(val)));
                const fill =
                  val >= 0
                    ? `rgba(37, 99, 235, ${(0.12 + 0.78 * abs).toFixed(2)})`
                    : `rgba(220, 38, 38, ${(0.12 + 0.78 * abs).toFixed(2)})`;
                return (
                  <g key={`${rIdx}_${cIdx}`}>
                    <rect
                      x={padL + cIdx * cell}
                      y={padT + rIdx * cell}
                      width={cell - 3}
                      height={cell - 3}
                      rx={6}
                      fill={fill}
                    >
                      <title>{`${sources[rIdx].displayName} × ${sources[cIdx].displayName}: ${val.toFixed(4)}`}</title>
                    </rect>
                    <text
                      x={padL + cIdx * cell + (cell - 3) / 2}
                      y={padT + rIdx * cell + (cell - 3) / 2 + 4}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="800"
                      fill={abs > 0.55 ? '#ffffff' : '#0f172a'}
                    >
                      {val.toFixed(3)}
                    </text>
                  </g>
                );
              })
            )}
          </svg>
        )}
      </ChartFrame>
    </div>
  );
};

// 8. Residual / Error Distribution Diagnostics Chart
export const MsmaResidualDiagnosticsChart: React.FC<{
  estimation: MsmaEstimationBundle;
  sources: MsmaSourceConfig[];
}> = ({ estimation, sources }) => {
  const entries = sources.filter(s => (estimation.residualsBySource[s.id]?.length ?? 0) > 0);
  if (entries.length === 0) return null;

  const allRes = entries.flatMap(s => estimation.residualsBySource[s.id].map(r => r.approxResidual));
  const maxAbs = Math.max(1e-6, ...allRes.map(v => Math.abs(v)));
  const W = 740;
  const H = Math.max(220, 80 + entries.length * 48);
  const padL = 185;
  const padR = 55;
  const padT = 22;
  const padB = 42;
  const plotW = W - padL - padR;
  const xOf = (v: number) => padL + ((v + maxAbs) / (2 * maxAbs)) * plotW;

  return (
    <ChartFrame
      title="8. Error Distribution & Consensus Residual Diagnostics"
      subtitle="Sebaran simpangan residual terkalibrasi terhadap konsensus laten (pusat nol = bebas pergeseran residual)"
      filenameBase="MSMA_08_Residual_Diagnostics"
      interpretation="Semakin rapat gugus titik residual sebuah sumber mengelilingi garis vertikal 0, semakin kecil varians kesalahan acaknya dan semakin bebas dari pencilan ekstrem."
    >
      {svgRef => (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <line x1={xOf(0)} y1={padT} x2={xOf(0)} y2={H - padB} stroke="#0f172a" strokeWidth={1.6} strokeDasharray="4 3" />
          {[-1, -0.5, 0, 0.5, 1].map(fr => {
            const v = fr * maxAbs;
            const x = xOf(v);
            return (
              <g key={fr}>
                <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#e2e8f0" />
                <text x={x} y={H - padB + 16} textAnchor="middle" fontSize="10.5" fill="#475569">{fmtAdaptive(v)}</text>
              </g>
            );
          })}

          {entries.map((s, idx) => {
            const cy = padT + 24 + idx * 46;
            const list = estimation.residualsBySource[s.id].slice(0, 180);
            const color = SERIES_COLORS[idx % SERIES_COLORS.length];
            return (
              <g key={s.id}>
                <text x={padL - 10} y={cy + 4} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">
                  {s.displayName.slice(0, 23)}
                </text>
                {list.map((r, rIdx) => {
                  const jitter = ((rIdx % 7) - 3) * 2.3;
                  return (
                    <circle key={rIdx} cx={xOf(r.approxResidual)} cy={cy + jitter} r={2.8} fill={color} opacity={0.58}>
                      <title>{`${s.displayName} — ${r.entity} (${r.period}): Residual = ${fmtAdaptive(r.approxResidual)}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}

          <text x={padL + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#334155">
            Deviasi Residual Terkalibrasi terhadap Sinyal Konsensus
          </text>
        </svg>
      )}
    </ChartFrame>
  );
};

// 9. Ranking Stability Trajectory Chart (Step 9)
export const MsmaRankingStabilityChart: React.FC<{
  robustness: MsmaRobustnessBundle;
  sources: MsmaSourceConfig[];
}> = ({ robustness, sources }) => {
  const validScenarios = robustness.scenarios.filter(s => s.identifiable);
  if (!robustness.evaluated || validScenarios.length === 0) return null;

  const J = sources.length;
  const W = 780;
  const H = 270;
  const padL = 62;
  const padR = 165;
  const padT = 26;
  const padB = 62;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (idx: number) =>
    validScenarios.length <= 1 ? padL + plotW / 2 : padL + (idx / (validScenarios.length - 1)) * plotW;
  const yOfRank = (rk: number) =>
    J <= 1 ? padT + plotH / 2 : padT + ((rk - 1) / (J - 1)) * plotH;

  return (
    <ChartFrame
      title={`9. Ranking Stability Trajectory Lintas ${validScenarios.length} Skenario Robustness`}
      subtitle={`Stabilitas Peringkat #1 = ${robustness.rankingStabilityPct.toFixed(1)}%`}
      filenameBase="MSMA_09_Ranking_Stability"
      legendItems={sources.map((s, idx) => ({
        label: s.displayName,
        color: SERIES_COLORS[idx % SERIES_COLORS.length]
      }))}
      interpretation={robustness.stabilityVerdict}
    >
      {svgRef => (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {Array.from({ length: J }, (_, i) => {
            const rk = i + 1;
            const y = yOfRank(rk);
            return (
              <g key={rk}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#cbd5e1" strokeDasharray="3 3" />
                <text x={padL - 10} y={y + 4} textAnchor="end" fontSize="11.5" fontWeight="700" fill="#334155">
                  Rank #{rk}
                </text>
              </g>
            );
          })}

          {validScenarios.map((sc, idx) => {
            const x = xOf(idx);
            return (
              <g key={sc.scenarioId}>
                <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#e2e8f0" />
                <text x={x} y={H - padB + 18} textAnchor="middle" fontSize="10" fontWeight="700" fill="#334155">
                  S{idx + 1}
                </text>
              </g>
            );
          })}

          {sources.map((s, sIdx) => {
            const color = SERIES_COLORS[sIdx % SERIES_COLORS.length];
            const pts = validScenarios
              .map((sc, idx) => {
                const rk = sc.ranksBySourceId[s.id];
                return rk !== null && rk !== undefined
                  ? { x: xOf(idx), y: yOfRank(rk), rk, label: sc.scenarioLabel }
                  : null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);
            const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
            const lastPt = pts[pts.length - 1];
            return (
              <g key={s.id}>
                <path d={path} fill="none" stroke={color} strokeWidth={2.5} />
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={4.5} fill={color}>
                    <title>{`${s.displayName} pada ${p.label}: Rank #${p.rk}`}</title>
                  </circle>
                ))}
                {lastPt && (
                  <text x={W - padR + 10} y={lastPt.y + 4} fontSize="11" fontWeight="700" fill={color}>
                    {s.displayName.slice(0, 20)}
                  </text>
                )}
              </g>
            );
          })}

          <text x={padL + plotW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#475569">
            Indeks Skenario Sensitivitas (S1 = Full Sample ... S{validScenarios.length})
          </text>
        </svg>
      )}
    </ChartFrame>
  );
};

// 10. Sensitivity Error SD Multi-Scenario Comparison & Missingness Heatmap
export const MsmaSensitivityComparisonChart: React.FC<{
  robustness: MsmaRobustnessBundle;
  sources: MsmaSourceConfig[];
}> = ({ robustness, sources }) => {
  // Exclude alternate non-linear scale scenario if units differ wildly so bar scaling stays meaningful
  const comparable = robustness.scenarios.filter(
    s => s.identifiable && s.category !== 'ALT_TRANSFORMATION'
  );
  if (!robustness.evaluated || comparable.length === 0) return null;

  const allSds = comparable.flatMap(sc =>
    sources.map(s => sc.errorSdBySourceId[s.id] ?? 0).filter(v => Number.isFinite(v))
  );
  const maxSd = Math.max(1e-6, ...allSds) * 1.12;

  const W = 780;
  const rowH = 38;
  const H = 74 + comparable.length * rowH;
  const padL = 240;
  const padR = 42;
  const padT = 22;
  const padB = 38;
  const plotW = W - padL - padR;
  const xOf = (v: number) => padL + (Math.max(0, v) / maxSd) * plotW;

  return (
    <ChartFrame
      title="10. Sensitivity Analysis: Perbandingan Error SD Lintas Subsampel & Perturbasi"
      subtitle="Membandingkan pergeseran magnitudo simpangan galat setiap sumber pada perubahan spesifikasi"
      filenameBase="MSMA_10_Sensitivity_ErrorSD"
      legendItems={sources.map((s, idx) => ({
        label: s.displayName,
        color: SERIES_COLORS[idx % SERIES_COLORS.length]
      }))}
      interpretation="Apabila urutan titik berwarna dari kiri ke kanan tetap konsisten di hampir seluruh baris skenario, maka kesimpulan sumber terbaik tidak bergantung pada kelompok kota atau periode tertentu."
    >
      {svgRef => (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {[0, 0.5, 1].map(fr => {
            const v = fr * maxSd;
            const x = xOf(v);
            return (
              <g key={fr}>
                <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#e2e8f0" />
                <text x={x} y={H - padB + 16} textAnchor="middle" fontSize="10.5" fill="#475569">{fmtAdaptive(v)}</text>
              </g>
            );
          })}

          {comparable.map((sc, idx) => {
            const cy = padT + 18 + idx * rowH;
            return (
              <g key={sc.scenarioId}>
                <line x1={padL} y1={cy} x2={W - padR} y2={cy} stroke="#cbd5e1" strokeDasharray="2 2" />
                <text x={padL - 10} y={cy + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="#1e293b">
                  {sc.scenarioLabel.slice(0, 34)}
                </text>
                {sources.map((s, sIdx) => {
                  const v = sc.errorSdBySourceId[s.id];
                  if (v === null || v === undefined) return null;
                  return (
                    <circle key={s.id} cx={xOf(v)} cy={cy} r={5.2} fill={SERIES_COLORS[sIdx % SERIES_COLORS.length]}>
                      <title>{`${sc.scenarioLabel} — ${s.displayName}: Error SD = ${fmtAdaptive(v)}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
    </ChartFrame>
  );
};

export const MsmaMissingnessHeatmap: React.FC<{
  descriptives: MsmaDescriptiveBundle;
  sources: MsmaSourceConfig[];
}> = ({ descriptives, sources }) => {
  const grid = descriptives.missingnessGrid;
  if (grid.length === 0) return null;

  const entities = Array.from(new Set(grid.map(g => g.entity))).slice(0, 20);
  const periods = Array.from(new Set(grid.map(g => g.period))).sort((a, b) => a - b);

  const cellW = Math.min(54, Math.max(26, Math.floor(420 / Math.max(1, periods.length))));
  const cellH = 18;
  const padL = 145;
  const padT = 38;
  const W = padL + periods.length * cellW + 40;
  const H = padT + entities.length * (cellH + 3) + 28;

  return (
    <ChartFrame
      title="Peta Kelengkapan Panel (Missingness Heatmap)"
      subtitle={`Menampilkan ketersediaan data seluruh ${sources.length} sumber per entitas × periode (sampel 20 entitas pertama)`}
      filenameBase="MSMA_Missingness_Heatmap"
      legendItems={[
        { label: 'Lengkap di Seluruh Sumber', color: '#16a34a' },
        { label: 'Sebagian Sumber Kosong', color: '#f59e0b' },
        { label: 'Seluruh Sumber Kosong', color: '#dc2626' }
      ]}
      interpretation="Sel berwarna hijau menunjukkan observasi complete-case yang masuk penuh ke estimasi matriks kovarians bersama."
    >
      {svgRef => (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: '680px', height: 'auto', display: 'block' }}>
          {periods.map((p, pIdx) => (
            <text key={p} x={padL + pIdx * cellW + cellW / 2} y={padT - 10} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#334155">
              {p}
            </text>
          ))}
          {entities.map((ent, eIdx) => {
            const y = padT + eIdx * (cellH + 3);
            return (
              <g key={ent}>
                <text x={padL - 8} y={y + 13} textAnchor="end" fontSize="10.5" fill="#1e293b">
                  {ent.slice(0, 18)}
                </text>
                {periods.map((p, pIdx) => {
                  const item = grid.find(g => g.entity === ent && g.period === p);
                  const presentCount = item
                    ? sources.filter(s => item.presentBySource[s.id]).length
                    : 0;
                  const fill =
                    presentCount === sources.length
                      ? '#16a34a'
                      : presentCount > 0
                        ? '#f59e0b'
                        : '#dc2626';
                  return (
                    <rect
                      key={p}
                      x={padL + pIdx * cellW}
                      y={y}
                      width={cellW - 3}
                      height={cellH}
                      rx={3}
                      fill={fill}
                      opacity={0.85}
                    >
                      <title>{`${ent} (${p}): ${presentCount}/${sources.length} sumber tersedia`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
    </ChartFrame>
  );
};
