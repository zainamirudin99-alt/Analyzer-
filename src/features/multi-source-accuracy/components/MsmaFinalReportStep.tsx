'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Terminal
} from 'lucide-react';
import {
  MsmaFullAnalysisResult,
  MsmaJournalReportSections,
  MsmaSourceConfig
} from '../types';
import { fmtAdaptive } from '../utils/numerical';

export const MsmaFinalReportStep: React.FC<{
  datasetName: string;
  sources: MsmaSourceConfig[];
  result: MsmaFullAnalysisResult;
  journalDraft: MsmaJournalReportSections;
  onUpdateJournalField: (field: keyof MsmaJournalReportSections, value: string) => void;
  onResetJournalToComputed: () => void;
}> = ({
  datasetName,
  sources,
  result,
  journalDraft,
  onUpdateJournalField,
  onResetJournalToComputed
}) => {
  const [subTab, setSubTab] = useState<'report' | 'stata' | 'journal' | 'export'>('report');
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [copiedDo, setCopiedDo] = useState(false);

  const tabBaseId = 'msma-final-report';
  const mainTableCaptionId = 'msma-final-main-table-caption';

  const triggerDownload = async (format: 'pdf' | 'docx' | 'gdocs' | 'xlsx' | 'do') => {
    try {
      setExportBusy(format);
      setExportMessage(null);
      const res = await fetch('/api/msma/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          journal: journalDraft,
          format,
          datasetName
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Gagal mengekspor berkas (${res.status}).`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `Laporan_MSMA.${format === 'gdocs' ? 'docx' : format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      if (format === 'gdocs') {
        setExportMessage(
          'Berkas DOCX kompatibel Google Docs berhasil diunduh. Unggah berkas ini ke Google Drive → klik kanan → "Buka dengan Google Dokumen" (integrasi langsung OAuth Google Drive belum diaktifkan pada akun ini).'
        );
      } else {
        setExportMessage(`Berkas "${filename}" berhasil diunduh.`);
      }
    } catch (err: unknown) {
      setExportMessage(err instanceof Error ? err.message : 'Ekspor gagal dijalankan.');
    } finally {
      setExportBusy(null);
    }
  };

  const handleDownloadCompleteBundle = async () => {
    await triggerDownload('pdf');
    await triggerDownload('docx');
    await triggerDownload('xlsx');
    await triggerDownload('do');
    setExportMessage('Paket lengkap (PDF Jurnal A4 + DOCX + Excel Multi-Sheet + Master Stata .do) telah diunduh.');
  };

  const handleAiPolishNarrative = async () => {
    try {
      setAiBusy(true);
      setAiNote(null);
      const savedKey =
        typeof window !== 'undefined' ? window.localStorage.getItem('gemini_api_key') ?? '' : '';

      const activeEsts =
        result.estimation.tcaResult?.estimates ?? result.estimation.multiSourceResult?.estimates ?? [];

      const res = await fetch('/api/msma/ai-interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: savedKey,
          summaryPayload: {
            datasetName,
            nEntities: result.panel.nEntities,
            nPeriods: result.panel.nPeriods,
            nCompleteCases: result.descriptives.nCompleteCasesAllSources,
            classification: result.classification.finalClassification,
            executedMethod: result.estimation.executedMethodLabel,
            rankingAllowed:
              Boolean(result.estimation.tcaResult?.rankingAllowed) ||
              Boolean(result.estimation.multiSourceResult?.rankingAllowed),
            estimates: activeEsts.map(e => ({
              name: e.displayName,
              unit: e.unit,
              errorVariance: e.totalComparableErrorVariance,
              errorSd: e.errorStandardDeviation,
              etcR2: e.etcCorrelationR2,
              rank: e.relativeRank
            })),
            twoSource: result.estimation.twoSourceResult
              ? {
                  meanDiff: result.estimation.twoSourceResult.meanDifference,
                  rmLoa: [
                    result.estimation.twoSourceResult.loaLowerRepeatedMeasures,
                    result.estimation.twoSourceResult.loaUpperRepeatedMeasures
                  ],
                  demingSlope: result.estimation.twoSourceResult.demingSlope
                }
              : null,
            rankingStabilityPct: result.robustness.rankingStabilityPct
          }
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Penyempurnaan AI tidak tersedia saat ini.');
      }

      if (json.data?.discussion) {
        onUpdateJournalField(
          'discussion',
          `[Interpretasi Berbantuan AI — Berdasarkan Angka Komputasi Tervalidasi]\n${json.data.discussion}`
        );
      }
      if (json.data?.conclusion) {
        onUpdateJournalField('conclusion', json.data.conclusion);
      }
      setAiNote('Narasi Discussion & Conclusion berhasil diperhalus oleh AI tanpa mengubah satu pun angka hasil komputasi.');
    } catch (err: unknown) {
      setAiNote(err instanceof Error ? err.message : 'Gagal menghubungi layanan AI.');
    } finally {
      setAiBusy(false);
    }
  };

  const activeEsts =
    result.estimation.tcaResult?.estimates ?? result.estimation.multiSourceResult?.estimates ?? [];
  const winner = activeEsts.find(e => e.relativeRank === 1);

  const journalFields: Array<{ key: keyof MsmaJournalReportSections; label: string; rows: number }> = [
    { key: 'title', label: '1. Title (Judul Artikel Ilmiah)', rows: 2 },
    { key: 'abstractText', label: '2. Abstract (Abstrak Terstruktur)', rows: 5 },
    { key: 'keywords', label: '3. Keywords (Kata Kunci)', rows: 2 },
    { key: 'introduction', label: '4. Introduction (Pendahuluan)', rows: 6 },
    { key: 'literatureReview', label: '5. Literature Review (Tinjauan Pustaka Terverifikasi)', rows: 7 },
    { key: 'researchMethodology', label: '6. Research Methodology (Kerangka Metodologi & Model)', rows: 6 },
    { key: 'dataAndVariables', label: '7. Data and Variables (Deskripsi Panel & Sumber)', rows: 5 },
    { key: 'statisticalResults', label: '8. Statistical Results (Hasil Empiris Utama)', rows: 6 },
    { key: 'discussion', label: '9. Discussion (Pembahasan — Terpisah dari Komputasi Mentah)', rows: 6 },
    { key: 'robustnessAnalysis', label: '10. Robustness Analysis (Analisis Ketahanan & Sensitivitas)', rows: 6 },
    { key: 'conclusion', label: '11. Conclusion (Kesimpulan)', rows: 4 },
    { key: 'limitations', label: '12. Limitations (Keterbatasan Metodologis)', rows: 5 },
    { key: 'referencesText', label: '13. References (Daftar Pustaka Crossref Terverifikasi)', rows: 8 },
    { key: 'appendixStataCommands', label: '14. Appendix: Stata Commands (Master Stata 17/18 + Mata)', rows: 10 }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Scientific Banner */}
      <div
        className="card"
        style={{
          padding: '18px 20px',
          borderLeft: '4px solid var(--primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          FINAL STATISTICAL REPORT &amp; JOURNAL GENERATOR
        </div>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>
          {journalDraft.title}
        </h3>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {result.simpleInterpretation}
        </p>
      </div>

      {/* Accessible Single-Row Scrolling Tablist (modern-web-guidance `tabs` compliant) */}
      <div role="tablist" aria-label="Bagian Laporan Akhir dan Ekspor Ilmiah" className="msma-tablist">
        {[
          { id: 'report' as const, label: 'J.1–J.9 Ringkasan & Hasil Ilmiah Lengkap' },
          { id: 'stata' as const, label: 'J.8 Kompilasi Output Stata (9 Bagian)' },
          { id: 'journal' as const, label: 'J.10 Editor Artikel Jurnal (14 Bagian)' },
          { id: 'export' as const, label: 'J.11 Ekspor PDF / DOCX / GDocs / Excel / .do' }
        ].map(t => (
          <button
            key={t.id}
            id={`${tabBaseId}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={subTab === t.id}
            className="msma-tab-btn"
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel 1: Comprehensive Scientific Synthesis (J.1 - J.7 & J.9) */}
      <div
        role="tabpanel"
        aria-labelledby={`${tabBaseId}-tab-report`}
        hidden={subTab !== 'report'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* J.1 Executive Summary */}
          <section className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
              J.1. Executive Summary
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
              {[
                { k: 'Dataset', v: datasetName },
                { k: 'Struktur Panel', v: `G = ${result.panel.nEntities} entitas × T = ${result.panel.nPeriods} periode (${result.panel.isBalanced ? 'Balanced' : 'Unbalanced'})` },
                { k: 'Observasi Lengkap (N_CC)', v: `${result.descriptives.nCompleteCasesAllSources} dari ${result.panel.validPanelRows} baris panel` },
                { k: 'Jumlah Sumber (J)', v: `${sources.length} sumber pengukuran` },
                { k: 'Klasifikasi Konstruk', v: result.classification.finalClassification },
                { k: 'Metode Digunakan', v: result.estimation.executedMethodLabel },
                { k: 'Status Asumsi', v: result.diagnostics.overallStatus },
                { k: 'Kesimpulan Utama', v: winner ? `#1 Relatif: ${winner.displayName} (Error SD = ${fmtAdaptive(winner.errorStandardDeviation)} ${winner.unit})` : 'Klaim Peringkat Individual Ditahan' }
              ].map(item => (
                <div key={item.k} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>{item.k}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginTop: '3px' }}>{item.v}</div>
                </div>
              ))}
            </div>
          </section>

          {/* J.2 & J.3 Dataset + Methodological Framework */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
            <section className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>
                J.2. Dataset Description &amp; Transformation Summary
              </h4>
              <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>
                {journalDraft.dataAndVariables}
              </p>
            </section>

            <section className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>
                J.3. Methodological Framework
              </h4>
              <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>
                {journalDraft.researchMethodology}
              </p>
            </section>
          </div>

          {/* J.6 Main Statistical Results Table */}
          <section className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
              J.6. Main Statistical Results ({result.estimation.executedMethodLabel})
            </h4>

            {result.estimation.twoSourceResult ? (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 8px' }}>{result.estimation.twoSourceResult.agreementInterpretation}</p>
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', color: 'var(--text)' }}>
                  {result.estimation.twoSourceResult.identificationBoundaryWarning}
                </div>
              </div>
            ) : activeEsts.length > 0 ? (
              <div tabIndex={0} role="region" aria-labelledby={mainTableCaptionId} className="msma-table-wrapper">
                <table className="msma-table">
                  <caption id={mainTableCaptionId}>
                    Tabel Hasil Estimasi Kalibrasi, Error Variance, Error SD, &amp; Peringkat Relatif
                  </caption>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Calibration (α, β)</th>
                      <th>Calibrated Error Variance (95% CI)</th>
                      <th>Error SD (95% CI)</th>
                      <th>Relative Error</th>
                      <th>ETC R² / SNR</th>
                      <th>P(Rank #1)</th>
                      <th>Relative Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeEsts.map(e => (
                      <tr key={e.sourceId}>
                        <th scope="row" style={{ fontWeight: 800 }}>{e.displayName} ({e.unit})</th>
                        <td>α={fmtAdaptive(e.calibrationInterceptAlpha)}, β={e.calibrationSlopeBeta.toFixed(3)}</td>
                        <td>
                          {fmtAdaptive(e.totalComparableErrorVariance)}
                          <br />
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            [{fmtAdaptive(e.errorVarianceCi95[0])}, {fmtAdaptive(e.errorVarianceCi95[1])}]
                          </span>
                        </td>
                        <td>
                          <strong>{fmtAdaptive(e.errorStandardDeviation)}</strong>
                          <br />
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            [{fmtAdaptive(e.errorSdCi95[0])}, {fmtAdaptive(e.errorSdCi95[1])}]
                          </span>
                        </td>
                        <td>{e.relativeErrorPct.toFixed(2)}%</td>
                        <td>{(e.etcCorrelationR2 * 100).toFixed(2)}% ({e.snrDb.toFixed(1)} dB)</td>
                        <td>{e.bootstrapRank1ProbPct.toFixed(1)}%</td>
                        <td style={{ fontWeight: 800, color: e.relativeRank === 1 ? 'var(--success)' : 'var(--text)' }}>
                          {e.relativeRank ? `#${e.relativeRank}` : 'Tidak Teridentifikasi'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', fontSize: '13px' }}>
                Estimasi utama ditahan karena sumber pengukuran belum memenuhi kesepadanan konstruk fisik (Contoh B) atau syarat sampel minimum.
              </div>
            )}
          </section>

          {/* J.9 Dual-Level Interpretation */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
            <section className="card" style={{ padding: '16px 18px', borderLeft: '4px solid var(--primary)' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
                J.9a. Technical Interpretation (Peneliti Statistik &amp; Ekonometrika)
              </h4>
              <p style={{ margin: 0, fontSize: '12.8px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {result.technicalInterpretation}
              </p>
            </section>

            <section className="card" style={{ padding: '16px 18px', borderLeft: '4px solid var(--success)' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
                J.9b. Simple Interpretation (Pengguna Umum &amp; Pengambil Kebijakan)
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                {result.simpleInterpretation}
              </p>
            </section>
          </div>
        </div>
      </div>

      {/* Panel 2: Stata Output Compilation (J.8) */}
      <div
        role="tabpanel"
        aria-labelledby={`${tabBaseId}-tab-stata`}
        hidden={subTab !== 'stata'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'var(--info-bg)',
              border: '1px solid var(--info-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div style={{ fontSize: '12.5px', color: 'var(--text)' }}>
              <strong>Transparansi Replikasi:</strong> Seluruh 9 bagian output di bawah ini berlabel eksplisit <code>Stata-compatible replicated output</code> (dihitung oleh mesin deterministik internal aplikasi) beserta sintaks Stata 17/18 + Mata siap eksekusi.
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                navigator.clipboard?.writeText(result.completeStataDoFile);
                setCopiedDo(true);
                setTimeout(() => setCopiedDo(false), 1800);
              }}
              style={{ minHeight: '42px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {copiedDo ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedDo ? 'Master .do Tersalin' : 'Salin Seluruh Master .do'}</span>
            </button>
          </div>

          {result.stataCompilation.map(sec => (
            <div key={sec.sectionNumber} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>{sec.sectionTitle}</div>
              <pre
                style={{
                  margin: 0,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#0f172a',
                  color: '#93c5fd',
                  fontSize: '11.5px',
                  overflowX: 'auto'
                }}
              >
                <code>{sec.stataCommand}</code>
              </pre>
              <pre
                style={{
                  margin: 0,
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '11.5px',
                  lineHeight: 1.5,
                  overflowX: 'auto'
                }}
              >
                <code>{sec.replicatedOutput}</code>
              </pre>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <strong>Keterangan:</strong> {sec.resultNote} · <strong>Interpretasi:</strong> {sec.interpretation}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel 3: Editable 14-Section Journal Article Generator (J.10) */}
      <div
        role="tabpanel"
        aria-labelledby={`${tabBaseId}-tab-journal`}
        hidden={subTab !== 'journal'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="card" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
                Editor Naskah Artikel Jurnal Ilmiah (14 Bagian — Siap Diedit Sebelum Diekspor)
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Seluruh angka draf bersumber dari mesin komputasi aktual dan hanya mengutip literatur terverifikasi Crossref. Anda bebas menyunting setiap bagian sebelum mengekspor ke PDF / DOCX.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleAiPolishNarrative}
                disabled={aiBusy}
                style={{ minHeight: '44px', padding: '8px 14px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={15} />
                <span>{aiBusy ? 'Memperhalus Narasi...' : 'Perhalus Discussion via AI (Opsional)'}</span>
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={onResetJournalToComputed}
                style={{ minHeight: '44px', padding: '8px 14px', fontSize: '12.5px' }}
              >
                Kembalikan Draf Otomatis
              </button>
            </div>
          </div>

          {aiNote && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--info-bg)', border: '1px solid var(--info-border)', fontSize: '12.5px' }}>
              {aiNote}
            </div>
          )}

          {journalFields.map(field => (
            <div key={field.key} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor={`${tabBaseId}-jf-${field.key}`} style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                {field.label}
              </label>
              <textarea
                id={`${tabBaseId}-jf-${field.key}`}
                rows={field.rows}
                value={journalDraft[field.key]}
                onChange={e => onUpdateJournalField(field.key, e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '16px',
                  lineHeight: 1.55,
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontFamily: field.key === 'appendixStataCommands' ? 'monospace' : 'inherit'
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Panel 4: Export Center (J.11) */}
      <div
        role="tabpanel"
        aria-labelledby={`${tabBaseId}-tab-export`}
        hidden={subTab !== 'export'}
      >
        <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: 'var(--text)' }}>
              J.11. Pusat Ekspor Laporan Ilmiah &amp; Kode Reproduksibilitas
            </h4>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Seluruh ekspor menyertakan perubahan teks yang telah Anda sunting pada Editor Artikel Jurnal di atas serta dilindungi dari formula injection spreadsheet.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))', gap: '12px' }}>
            {(
              [
                { fmt: 'pdf', cls: 'btn btn-primary', icon: <FileText size={17} />, idle: 'Export PDF (Artikel A4)', busy: 'Menyusun PDF...' },
                { fmt: 'docx', cls: 'btn btn-primary', icon: <BookOpen size={17} />, idle: 'Export DOCX (Word)', busy: 'Menyusun DOCX...' },
                { fmt: 'gdocs', cls: 'btn btn-outline', icon: <FileText size={17} />, idle: 'Google Docs Compatible (.docx)', busy: 'Menyusun...' },
                { fmt: 'xlsx', cls: 'btn btn-outline', icon: <FileSpreadsheet size={17} />, idle: 'Export Excel Results (.xlsx)', busy: 'Menyusun XLSX...' },
                { fmt: 'do', cls: 'btn btn-outline', icon: <Terminal size={17} />, idle: 'Download Stata Do-File (.do)', busy: 'Menyusun .do...' }
              ] as const
            ).map(btn => (
              <button
                key={btn.fmt}
                type="button"
                className={btn.cls}
                disabled={exportBusy !== null}
                onClick={() => triggerDownload(btn.fmt)}
                style={{ minHeight: '52px', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 700 }}
              >
                {btn.icon}
                <span>{exportBusy === btn.fmt ? btn.busy : btn.idle}</span>
              </button>
            ))}

            <button
              type="button"
              className="btn btn-outline"
              disabled={exportBusy !== null}
              onClick={handleDownloadCompleteBundle}
              style={{ minHeight: '52px', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 800, borderColor: 'var(--primary)', color: 'var(--primary)' }}
            >
              <Download size={17} />
              <span>Export Complete Report (Semua Format)</span>
            </button>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <strong>Catatan Ekspor Grafik (PNG &amp; SVG):</strong> Setiap grafik pada Step 5, Step 8, dan Step 9 memiliki tombol unduh langsung <strong>PNG (Resolusi Tinggi 2×)</strong> dan <strong>SVG Vektor</strong> di sudut kanan atas masing-masing kartu grafik. Untuk Google Docs: aplikasi menghasilkan berkas <code>.docx</code> standar terbuka yang kompatibel penuh saat diunggah ke Google Docs tanpa mengklaim penulisan otomatis ke Google Drive pengguna.
          </div>

          {exportMessage && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', fontSize: '12.5px', color: 'var(--text)' }}>
              {exportMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
