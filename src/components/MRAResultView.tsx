'use client';

import React, { useState, useMemo } from 'react';
import { MRAResult } from '../lib/regression-moderation-mra';
import { OLSFitResult } from '../lib/regression-engine';
import { generateMRARecommendations } from '../lib/regression-recommendation-engine';
import { ModerationPlots } from './DiagnosticPlots';
import { ArrowLeft, RefreshCw, Download, Info, CheckCircle2, AlertTriangle } from 'lucide-react';

interface MRAResultViewProps {
  mra: MRAResult;
  onBackToConfig: () => void;
  onReRun: () => void;
  fileName?: string;
  selectedSheet?: string;
}

const formatSig = (val?: number): string => {
  if (val === undefined || isNaN(val)) return '-';
  if (val < 0.001) return '.000';
  const s = val.toFixed(3);
  return s.startsWith('0.') ? s.slice(1) : s;
};

const spssTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
  color: 'var(--text)'
};

const spssThStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 700,
  borderTop: '2px solid var(--text)',
  borderBottom: '1px solid var(--border)',
  background: 'var(--surface-muted)',
  whiteSpace: 'nowrap'
};

const spssTdStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderBottom: '1px solid var(--border-light)'
};

export const MRAResultView: React.FC<MRAResultViewProps> = ({
  mra,
  onBackToConfig,
  onReRun,
  fileName = 'Dataset.xlsx',
  selectedSheet = 'Sheet1'
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'slopes' | 'assumptions' | 'recommendations' | 'plots'>('summary');
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);

  const model3Fit: OLSFitResult = mra.models.model3.fit;
  const maxVifModel3 = useMemo(() => {
    const vifs = model3Fit.coefficients.slice(1).map(c => c.collinearity.vif);
    return vifs.length > 0 ? Math.max(...vifs) : 1;
  }, [model3Fit]);

  const mraAdvisory = useMemo(() => {
    return generateMRARecommendations({
      xCol: mra.xCol,
      zCol: mra.zCol,
      yCol: mra.yCol,
      centerVariables: mra.centerVariables,
      isInteractionSignificant: mra.interactionEffect.isSignificant,
      sigFChange: mra.interactionEffect.sigFChange,
      alpha: mra.alpha,
      maxVifModel3
    });
  }, [mra, maxVifModel3]);

  const handleExport = async (format: 'docx' | 'xlsx') => {
    const setBusy = format === 'docx' ? setIsExportingDocx : setIsExportingXlsx;
    setBusy(true);
    try {
      const endpoint = format === 'docx' ? '/api/regression/export-docx' : '/api/regression/export-xlsx';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisType: 'mra',
          mraResult: mra,
          fileName,
          selectedSheet
        })
      });
      if (!res.ok) throw new Error(`Gagal mengekspor ${format.toUpperCase()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan-MRA-${mra.yCol}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || `Gagal mengekspor file ${format.toUpperCase()}`);
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: 'summary', label: '1. Model Hierarkis & Interaksi' },
    { id: 'slopes', label: '2. Simple Slope & Johnson-Neyman' },
    { id: 'assumptions', label: '3. Asumsi Klasik (Model 3)' },
    { id: 'recommendations', label: '4. Rekomendasi Metodologis' },
    { id: 'plots', label: '5. Grafik Moderasi' }
  ];

  const hierarchicalRows = [mra.models.model1, mra.models.model2, mra.models.model3];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Action Header Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 18px',
          borderRadius: 'var(--radius)',
          background: 'var(--surface)',
          border: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
            Hasil Moderated Regression Analysis (MRA) — Gaya IBM SPSS
          </span>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Y: <strong>{mra.yCol}</strong> · X: <strong>{mra.xCol}</strong> · Moderator Z: <strong>{mra.zCol}</strong> · n = {mra.nUsed} · α = {mra.alpha}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            onClick={onBackToConfig}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-muted)',
              color: 'var(--text)',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={14} /> Ubah Konfigurasi
          </button>

          <button
            type="button"
            onClick={onReRun}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-muted)',
              color: 'var(--text)',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} /> Hitung Ulang
          </button>

          <button
            type="button"
            onClick={() => handleExport('docx')}
            disabled={isExportingDocx}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--primary)',
              background: 'var(--primary)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: isExportingDocx ? 'not-allowed' : 'pointer',
              opacity: isExportingDocx ? 0.7 : 1
            }}
          >
            <Download size={14} /> {isExportingDocx ? 'Word...' : 'Word (.docx)'}
          </button>

          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            disabled={isExportingXlsx}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--accent-tertiary)',
              background: 'var(--accent-tertiary)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: isExportingXlsx ? 'not-allowed' : 'pointer',
              opacity: isExportingXlsx ? 0.7 : 1
            }}
          >
            <Download size={14} /> {isExportingXlsx ? 'Excel...' : 'Excel (.xlsx)'}
          </button>
        </div>
      </div>

      {/* Classification Banner */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: 'var(--radius)',
          border: `1px solid ${mra.interactionEffect.isSignificant ? 'var(--success-border)' : 'var(--warn-border)'}`,
          background: mra.interactionEffect.isSignificant ? 'var(--success-bg)' : 'var(--warn-bg)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}
      >
        {mra.interactionEffect.isSignificant ? (
          <CheckCircle2 size={20} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
        ) : (
          <AlertTriangle size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: '2px' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <strong style={{ fontSize: '14px', color: 'var(--text)' }}>
            Klasifikasi Moderator (Sharma et al., 1981): {mra.moderatorClassification.type}
          </strong>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {mra.moderatorClassification.rationale}
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: activeTab === t.id ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: activeTab === t.id ? 'var(--primary)' : 'var(--surface)',
              color: activeTab === t.id ? '#ffffff' : 'var(--text)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              Model Summary &amp; Hierarchical Change Statistics
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={spssTableStyle}>
                <thead>
                  <tr>
                    <th style={spssThStyle}>Model</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>R</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>R Square</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Adjusted R Square</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>R Square Change</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>F Change</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>df1</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>df2</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Sig. F Change</th>
                  </tr>
                </thead>
                <tbody>
                  {hierarchicalRows.map((step, i) => (
                    <tr key={step.modelNumber} style={{ borderBottom: i === 2 ? '2px solid var(--text)' : undefined }}>
                      <td style={spssTdStyle}>
                        <strong>Model {step.modelNumber}</strong>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{step.modelName}</div>
                      </td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{step.fit.modelSummary.r.toFixed(3)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{step.fit.modelSummary.rSquared.toFixed(3)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{step.fit.modelSummary.adjRSquared.toFixed(3)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 700 }}>{step.changeStats.rSquaredChange.toFixed(4)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{step.changeStats.fChange.toFixed(3)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{step.changeStats.df1}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{step.changeStats.df2}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 700 }}>{formatSig(step.changeStats.sigFChange)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              Coefficients (Model 3 — Full Interaction MRA{mra.referenceCategory ? `, Acuan: ${mra.referenceCategory}` : ''})
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={spssTableStyle}>
                <thead>
                  <tr>
                    <th style={spssThStyle}>Variabel</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>B</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Std. Error</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Beta</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>t</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Sig.</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Tolerance</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>VIF</th>
                  </tr>
                </thead>
                <tbody>
                  {model3Fit.coefficients.map((c, idx) => (
                    <tr
                      key={c.variable}
                      style={{ borderBottom: idx === model3Fit.coefficients.length - 1 ? '2px solid var(--text)' : undefined }}
                    >
                      <td style={{ ...spssTdStyle, fontWeight: c.variable.includes('_x_') ? 700 : 500 }}>{c.variable}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{c.b.toFixed(4)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{c.stdError.toFixed(4)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{c.variable === '(Constant)' ? '-' : c.beta.toFixed(3)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{c.t.toFixed(3)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: c.sig <= mra.alpha ? 700 : 400 }}>{formatSig(c.sig)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{c.variable === '(Constant)' ? '-' : c.collinearity.tolerance.toFixed(3)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{c.variable === '(Constant)' ? '-' : c.collinearity.vif.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
              Ringkasan Interpretasi Akademik
            </h3>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              {mra.academicInterpretation.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'slopes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              Conditional Effect / Simple Slope Analysis
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={spssTableStyle}>
                <thead>
                  <tr>
                    <th style={spssThStyle}>Level Moderator ({mra.zCol})</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Slope (b)</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Std. Error</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>t</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Sig.</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>CI {Math.round(mra.ciLevel * 100)}%</th>
                    <th style={spssThStyle}>Keputusan</th>
                  </tr>
                </thead>
                <tbody>
                  {mra.simpleSlopes.map((s, idx) => (
                    <tr
                      key={s.levelLabel}
                      style={{ borderBottom: idx === mra.simpleSlopes.length - 1 ? '2px solid var(--text)' : undefined }}
                    >
                      <td style={spssTdStyle}>{s.levelLabel}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{s.slope.toFixed(4)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{s.stdError.toFixed(4)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{s.tStat.toFixed(3)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatSig(s.pValue)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>[{s.ciLower.toFixed(3)}, {s.ciUpper.toFixed(3)}]</td>
                      <td style={spssTdStyle}>
                        <span style={{ fontWeight: 700, color: s.isSignificant ? 'var(--success)' : 'var(--text-muted)' }}>
                          {s.isSignificant ? 'Signifikan' : 'Tidak Signifikan'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              Wilayah Signifikansi Johnson-Neyman
            </h3>
            <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {mra.johnsonNeyman.regionsDescription}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'assumptions' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
            Uji Asumsi Klasik Model 3 (Full Interaction)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={spssTableStyle}>
              <thead>
                <tr>
                  <th style={spssThStyle}>Pengujian Asumsi</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>Statistik</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>Sig.</th>
                  <th style={spssThStyle}>Kriteria</th>
                  <th style={spssThStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {model3Fit.assumptions.map((a, i) => (
                  <tr key={a.name} style={{ borderBottom: i === model3Fit.assumptions.length - 1 ? '2px solid var(--text)' : undefined }}>
                    <td style={spssTdStyle}>
                      <strong>{a.name}</strong>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{a.reason}</div>
                    </td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{a.statistic.toFixed(3)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatSig(a.pValue)}</td>
                    <td style={spssTdStyle}>{a.criteria}</td>
                    <td style={spssTdStyle}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: a.status === 'lulus' ? 'var(--success)' : a.status === 'gagal' ? 'var(--danger)' : 'var(--text-muted)'
                        }}
                      >
                        {a.status === 'lulus' ? 'Lulus' : a.status === 'gagal' ? 'Pelanggaran' : 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'recommendations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={16} color="var(--info)" />
              <strong style={{ fontSize: '14px', color: 'var(--text)' }}>Panduan Centering &amp; Multikolinearitas MRA</strong>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{mraAdvisory.centeringAdvisory}</p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{mraAdvisory.sharmaGuidance}</p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--warn)', fontWeight: 600, lineHeight: 1.6 }}>{mraAdvisory.nonCausalityAdvisory}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '4px' }}>
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
                <strong style={{ fontSize: '12.5px', color: 'var(--success)' }}>Pro (Kelebihan):</strong>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {mraAdvisory.pros.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)' }}>
                <strong style={{ fontSize: '12.5px', color: 'var(--warn)' }}>Kontra (Batasan):</strong>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {mraAdvisory.cons.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'plots' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
          <ModerationPlots mra={mra} />
        </div>
      )}
    </div>
  );
};

