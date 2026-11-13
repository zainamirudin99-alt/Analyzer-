'use client';

import React, { useState } from 'react';
import { ContingencyAnalysisResult } from '../lib/regression-contingency-chisquare';
import { ContingencyPlots } from './DiagnosticPlots';
import { ArrowLeft, RefreshCw, Download, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface ContingencyResultViewProps {
  result: ContingencyAnalysisResult;
  alpha?: number;
  onBackToConfig: () => void;
  onReRun: () => void;
  fileName?: string;
  selectedSheet?: string;
}

const formatSig = (val?: number): string => {
  if (val === undefined || val === null || isNaN(val)) return '-';
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

export const ContingencyResultView: React.FC<ContingencyResultViewProps> = ({
  result,
  alpha = 0.05,
  onBackToConfig,
  onReRun,
  fileName = 'Dataset.xlsx',
  selectedSheet = 'Sheet1'
}) => {
  const [activeTab, setActiveTab] = useState<'crosstab' | 'chisquare' | 'measures' | 'plots'>('crosstab');
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);

  const handleExport = async (format: 'docx' | 'xlsx') => {
    const setBusy = format === 'docx' ? setIsExportingDocx : setIsExportingXlsx;
    setBusy(true);
    try {
      const endpoint = format === 'docx' ? '/api/regression/export-docx' : '/api/regression/export-xlsx';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisType: 'contingency',
          contingencyResult: result,
          fileName,
          selectedSheet
        })
      });
      if (!res.ok) throw new Error(`Gagal mengekspor ${format.toUpperCase()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan-Kontingensi-${result.rowVar}-x-${result.colVar}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || `Gagal mengekspor ${format.toUpperCase()}`);
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: 'crosstab', label: '1. Case Summary & Crosstabulation' },
    { id: 'chisquare', label: '2. Chi-Square, Fisher & Monte Carlo' },
    { id: 'measures', label: '3. Efek, Cramér V & Risk Estimate' },
    { id: 'plots', label: '4. Grafik & Interpretasi' }
  ];

  const meetsAssumption = result.expectedCountDiagnostics.meetsChiSquareAssumption;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Action Header */}
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
            Hasil Analisis Tabel Kontingensi (Crosstabs &amp; Chi-Square) — Gaya IBM SPSS
          </span>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Baris: <strong>{result.rowVar}</strong> · Kolom: <strong>{result.colVar}</strong> · Dimensi: {result.tableDimensions.r}×{result.tableDimensions.c} · n valid = {result.sampleSize.validN} · α = {alpha}
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

      {/* Expected Frequency Diagnostics Alert */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: 'var(--radius)',
          border: `1px solid ${meetsAssumption ? 'var(--success-border)' : 'var(--warn-border)'}`,
          background: meetsAssumption ? 'var(--success-bg)' : 'var(--warn-bg)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}
      >
        {meetsAssumption ? (
          <CheckCircle2 size={20} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
        ) : (
          <AlertTriangle size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: '2px' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <strong style={{ fontSize: '14px', color: 'var(--text)' }}>
            Rekomendasi Uji Utama: {result.expectedCountDiagnostics.recommendedPrimaryTest}
          </strong>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {result.expectedCountDiagnostics.cellsBelow5Count} dari {result.expectedCountDiagnostics.totalCells} sel ({result.expectedCountDiagnostics.cellsBelow5Percent.toFixed(1)}%) memiliki Expected Count &lt; 5 (Minimum Expected Count = {result.expectedCountDiagnostics.minExpectedCount.toFixed(2)}).
          </span>
        </div>
      </div>

      {/* Tabs */}
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

      {activeTab === 'crosstab' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Case Processing Summary */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              Case Processing Summary
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={spssTableStyle}>
                <thead>
                  <tr>
                    <th style={spssThStyle}>Pasangan Variabel</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Valid (N / %)</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Missing (N / %)</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Total N</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '2px solid var(--text)' }}>
                    <td style={spssTdStyle}>{result.rowVar} * {result.colVar}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>
                      {result.sampleSize.validN} ({result.sampleSize.validPercent.toFixed(1)}%)
                    </td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>
                      {result.sampleSize.missingN} ({(100 - result.sampleSize.validPercent).toFixed(1)}%)
                    </td>
                    <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 700 }}>{result.sampleSize.totalN}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Crosstabulation Matrix */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              {result.rowVar} * {result.colVar} Crosstabulation
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={spssTableStyle}>
                <thead>
                  <tr>
                    <th style={spssThStyle}>{result.rowVar}</th>
                    <th style={spssThStyle}>Metrik Sel</th>
                    {result.colCategories.map(c => (
                      <th key={c} style={{ ...spssThStyle, textAlign: 'right' }}>{c}</th>
                    ))}
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rowCategories.map((rCat, rIdx) => (
                    <React.Fragment key={rCat}>
                      <tr>
                        <td style={{ ...spssTdStyle, fontWeight: 700 }} rowSpan={4}>{rCat}</td>
                        <td style={spssTdStyle}>Count</td>
                        {result.cells[rIdx].map(cell => (
                          <td key={cell.colCategory} style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{cell.observed}</td>
                        ))}
                        <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 700 }}>{result.rowTotals[rIdx].count}</td>
                      </tr>
                      <tr>
                        <td style={{ ...spssTdStyle, color: 'var(--text-muted)' }}>Expected Count</td>
                        {result.cells[rIdx].map(cell => (
                          <td key={cell.colCategory} style={{ ...spssTdStyle, textAlign: 'right', color: 'var(--text-muted)' }}>{cell.expected.toFixed(1)}</td>
                        ))}
                        <td style={{ ...spssTdStyle, textAlign: 'right', color: 'var(--text-muted)' }}>{result.rowTotals[rIdx].count.toFixed(1)}</td>
                      </tr>
                      <tr>
                        <td style={{ ...spssTdStyle, color: 'var(--text-muted)' }}>% within {result.rowVar}</td>
                        {result.cells[rIdx].map(cell => (
                          <td key={cell.colCategory} style={{ ...spssTdStyle, textAlign: 'right' }}>{cell.rowPercent.toFixed(1)}%</td>
                        ))}
                        <td style={{ ...spssTdStyle, textAlign: 'right' }}>100.0%</td>
                      </tr>
                      <tr>
                        <td style={{ ...spssTdStyle, color: 'var(--text-muted)' }}>Adjusted Residual</td>
                        {result.cells[rIdx].map(cell => {
                          const extreme = Math.abs(cell.adjustedResidual) >= 1.96;
                          return (
                            <td
                              key={cell.colCategory}
                              style={{
                                ...spssTdStyle,
                                textAlign: 'right',
                                fontWeight: extreme ? 700 : 400,
                                color: extreme ? (cell.adjustedResidual > 0 ? 'var(--success)' : 'var(--danger)') : 'var(--text-secondary)'
                              }}
                            >
                              {cell.adjustedResidual.toFixed(2)}
                            </td>
                          );
                        })}
                        <td style={spssTdStyle} />
                      </tr>
                    </React.Fragment>
                  ))}
                  <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface-muted)' }}>
                    <td style={{ ...spssTdStyle, fontWeight: 700 }} colSpan={2}>Total</td>
                    {result.colTotals.map(ct => (
                      <td key={ct.category} style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 700 }}>
                        {ct.count} ({ct.percent.toFixed(1)}%)
                      </td>
                    ))}
                    <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 700 }}>{result.sampleSize.validN} (100.0%)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'chisquare' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
            Chi-Square Tests
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={spssTableStyle}>
              <thead>
                <tr>
                  <th style={spssThStyle}>Metode Uji</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>Value</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>df</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>Asymptotic Sig. (2-sided)</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>Exact / MC Sig.</th>
                  <th style={spssThStyle}>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {result.chiSquareTests.map((row, i) => (
                  <tr
                    key={row.testName}
                    style={{ borderBottom: i === result.chiSquareTests.length - 1 ? '2px solid var(--text)' : undefined }}
                  >
                    <td style={{ ...spssTdStyle, fontWeight: 600 }}>{row.testName}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{row.value !== undefined ? row.value.toFixed(3) : '-'}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{row.df !== undefined ? row.df : '-'}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{formatSig(row.asympSig2Sided)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>
                      {row.exactSig2Sided !== undefined ? formatSig(row.exactSig2Sided) : row.monteCarloSig !== undefined ? formatSig(row.monteCarloSig) : '-'}
                    </td>
                    <td style={{ ...spssTdStyle, fontSize: '12px', color: 'var(--text-muted)' }}>{row.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'measures' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              Symmetric Measures (Kekuatan Asosiasi)
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={spssTableStyle}>
                <thead>
                  <tr>
                    <th style={spssThStyle}>Metrik Nominal-by-Nominal</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Value</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Approx. Sig.</th>
                    <th style={spssThStyle}>Interpretasi</th>
                  </tr>
                </thead>
                <tbody>
                  {result.symmetricMeasures.map((m, i) => (
                    <tr
                      key={m.measureName}
                      style={{ borderBottom: i === result.symmetricMeasures.length - 1 ? '2px solid var(--text)' : undefined }}
                    >
                      <td style={{ ...spssTdStyle, fontWeight: 600 }}>{m.measureName}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{m.value.toFixed(3)}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatSig(m.approxSig)}</td>
                      <td style={{ ...spssTdStyle, color: 'var(--text-secondary)' }}>{m.interpretation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.riskEstimates.is2x2 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                Risk Estimate (Tabel 2×2)
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={spssTableStyle}>
                  <thead>
                    <tr>
                      <th style={spssThStyle}>Ukuran Risiko</th>
                      <th style={{ ...spssThStyle, textAlign: 'right' }}>Value</th>
                      <th style={{ ...spssThStyle, textAlign: 'right' }}>95% Confidence Interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={spssTdStyle}>Odds Ratio (OR)</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{result.riskEstimates.oddsRatio ? result.riskEstimates.oddsRatio.value.toFixed(3) : '-'}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>
                        {result.riskEstimates.oddsRatio ? `[${result.riskEstimates.oddsRatio.ciLower.toFixed(3)}, ${result.riskEstimates.oddsRatio.ciUpper.toFixed(3)}]` : '-'}
                      </td>
                    </tr>
                    <tr>
                      <td style={spssTdStyle}>Relative Risk ({result.riskEstimates.relativeRiskCol1?.label || 'Kolom 1'})</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{result.riskEstimates.relativeRiskCol1 ? result.riskEstimates.relativeRiskCol1.value.toFixed(3) : '-'}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>
                        {result.riskEstimates.relativeRiskCol1 ? `[${result.riskEstimates.relativeRiskCol1.ciLower.toFixed(3)}, ${result.riskEstimates.relativeRiskCol1.ciUpper.toFixed(3)}]` : '-'}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '2px solid var(--text)' }}>
                      <td style={spssTdStyle}>Risk Difference</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{result.riskEstimates.riskDifference ? result.riskEstimates.riskDifference.value.toFixed(3) : '-'}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>
                        {result.riskEstimates.riskDifference ? `[${result.riskEstimates.riskDifference.ciLower.toFixed(3)}, ${result.riskEstimates.riskDifference.ciUpper.toFixed(3)}]` : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'plots' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <ContingencyPlots data={result} />
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Info size={16} color="var(--info)" />
              <strong style={{ fontSize: '14px', color: 'var(--text)' }}>Interpretasi Akademik (Asosiasi Non-Kausal)</strong>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              {result.academicInterpretation.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
