'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Terminal
} from 'lucide-react';
import { StepStataDocumentationBundle } from '@/lib/panel-accuracy-step-stata';

interface PanelAccuracyStepStataPanelProps {
  bundle: StepStataDocumentationBundle;
}

export const PanelAccuracyStepStataPanel: React.FC<PanelAccuracyStepStataPanelProps> = ({
  bundle
}) => {
  const [activeCodeLang, setActiveCodeLang] = useState<'stata' | 'r' | 'stan'>('stata');
  const [copied, setCopied] = useState(false);

  const currentCode =
    activeCodeLang === 'r' && bundle.companionRCode
      ? bundle.companionRCode
      : activeCodeLang === 'stan' && bundle.companionStanCode
        ? bundle.companionStanCode
        : bundle.stataCode;

  const currentExt =
    activeCodeLang === 'r' && bundle.companionRCode
      ? 'R'
      : activeCodeLang === 'stan' && bundle.companionStanCode
        ? 'stan'
        : 'do';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `step_${bundle.stepId}_panel_accuracy.${currentExt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColor =
    bundle.stepConclusion.readinessStatus === 'LAYAK DILANJUTKAN'
      ? 'var(--success)'
      : bundle.stepConclusion.readinessStatus === 'LAYAK DENGAN CATATAN'
        ? '#f59e0b'
        : '#ef4444';

  return (
    <div
      style={{
        marginTop: '8px',
        padding: '18px',
        borderRadius: 'var(--radius)',
        border: '1.5px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={18} color="var(--primary)" />
          <div>
            <strong style={{ fontSize: '15px', color: 'var(--text)', display: 'block' }}>
              Stata Command &amp; Statistical Implementation — {bundle.stepTitle}
            </strong>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Dokumentasi kode Stata dinamis, penjelasan perintah, cara membaca output, dan interpretasi statistik per poin.
            </span>
          </div>
        </div>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '999px',
            background: statusColor,
            color: '#fff',
            fontSize: '11.5px',
            fontWeight: 800
          }}
        >
          {bundle.stepConclusion.readinessStatus}
        </span>
      </div>

      {/* 1. TUJUAN ANALISIS */}
      <div
        style={{
          padding: '14px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-muted)',
          border: '1px solid var(--border-light)',
          fontSize: '13px',
          lineHeight: 1.55
        }}
      >
        <strong style={{ display: 'block', marginBottom: '6px', color: 'var(--primary)', fontSize: '13.5px' }}>
          1. Tujuan Analisis (Step {bundle.stepId})
        </strong>
        <ul style={{ margin: '0 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <li>
            <strong>Apa yang dianalisis:</strong> {bundle.analysisPurpose.whatIsAnalyzed}
          </li>
          <li>
            <strong>Mengapa analisis diperlukan:</strong> {bundle.analysisPurpose.whyRequired}
          </li>
          <li>
            <strong>Masalah statistik yang dijawab:</strong> {bundle.analysisPurpose.statisticalQuestionAnswered}
          </li>
        </ul>
      </div>

      {/* 2. KONSEP STATISTIK (TEORI, RUMUS & ASUMSI) */}
      {bundle.statisticalConcepts && (
        <div
          style={{
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--info-bg)',
            border: '1px solid var(--border)',
            fontSize: '13px',
            lineHeight: 1.55
          }}
        >
          <strong style={{ display: 'block', marginBottom: '6px', color: 'var(--primary)', fontSize: '13.5px' }}>
            2. Konsep Statistik (Teori, Metode, Rumus &amp; Asumsi)
          </strong>
          <ul style={{ margin: '0 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <li>
              <strong>Teori &amp; Metode:</strong> {bundle.statisticalConcepts.theoryAndMethod}
            </li>
            <li>
              <strong>Rumus Matematis:</strong>{' '}
              <code style={{ fontWeight: 700, color: 'var(--primary)' }}>
                {bundle.statisticalConcepts.mathematicalFormula}
              </code>
            </li>
            {bundle.statisticalConcepts.keyAssumptions.map((asmp, i) => (
              <li key={i}>
                <strong>Asumsi {i + 1}:</strong> {asmp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. STATA COMMAND (+ R / STAN COMPANION IF AVAILABLE) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '13.5px', color: 'var(--primary)' }}>
              3. Stata Command &amp; Reproducible Implementation
            </strong>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={activeCodeLang === 'stata' ? 'btn btn-primary' : 'btn btn-outline'}
                style={{ minHeight: '34px', fontSize: '12px', padding: '4px 10px' }}
                onClick={() => setActiveCodeLang('stata')}
              >
                <FileText size={13} style={{ marginRight: '4px' }} /> Stata (.do)
              </button>
              {bundle.companionRCode && (
                <button
                  type="button"
                  className={activeCodeLang === 'r' ? 'btn btn-primary' : 'btn btn-outline'}
                  style={{ minHeight: '34px', fontSize: '12px', padding: '4px 10px' }}
                  onClick={() => setActiveCodeLang('r')}
                >
                  R Script (.R)
                </button>
              )}
              {bundle.companionStanCode && (
                <button
                  type="button"
                  className={activeCodeLang === 'stan' ? 'btn btn-primary' : 'btn btn-outline'}
                  style={{ minHeight: '34px', fontSize: '12px', padding: '4px 10px' }}
                  onClick={() => setActiveCodeLang('stan')}
                >
                  Companion Stan (.stan)
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ minHeight: '36px', fontSize: '12px', padding: '4px 10px' }}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check size={13} style={{ marginRight: '5px' }} /> Tersalin
                </>
              ) : (
                <>
                  <Copy size={13} style={{ marginRight: '5px' }} /> Copy Code
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ minHeight: '36px', fontSize: '12px', padding: '4px 10px' }}
              onClick={handleDownload}
            >
              <Download size={13} style={{ marginRight: '5px' }} /> Download .{currentExt}
            </button>
          </div>
        </div>

        <pre
          style={{
            margin: 0,
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            background: '#0b1220',
            color: '#e2e8f0',
            fontSize: '12px',
            overflowX: 'auto',
            maxHeight: '380px',
            lineHeight: 1.5
          }}
        >
          {currentCode}
        </pre>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '6px 10px', borderRadius: '6px', background: 'var(--surface-muted)', border: '1px solid var(--border-light)' }}>
          <strong>Versi &amp; Dependency:</strong> {bundle.dependenciesNote}
        </div>
      </div>

      {/* 4. PENJELASAN SETIAP KODE */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <strong style={{ fontSize: '13.5px', color: 'var(--primary)' }}>
          4. Penjelasan Setiap Kode (Perintah Stata &amp; Hubungannya dengan Tujuan Analisis)
        </strong>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted)' }}>
                {['Perintah Stata', 'Fungsi Perintah', 'Alasan Penggunaan', 'Hubungan dengan Tujuan Step'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bundle.commandUsages.map((u, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>
                    {u.command}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)' }}>{u.functionSummary}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>{u.reasonUsed}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>{u.linkToStepGoal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. OUTPUT DAN CARA MEMBACA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <strong style={{ fontSize: '13.5px', color: 'var(--primary)' }}>
          5. Output dan Cara Membaca Output Stata
        </strong>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted)' }}>
                {['Nama Output', 'Definisi Statistik', 'Satuan', 'Fungsi dalam Penelitian', 'Nilai yang Perlu Diperhatikan', 'Kondisi Baik vs Perlu Diwaspadai'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bundle.outputExplanations.map((o, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{o.outputName}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)' }}>{o.statisticalDefinition}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)' }}>{o.unit}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>{o.researchFunction}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>{o.keyValueToWatch}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>{o.goodVsWarningCondition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* OPTIONAL ROBUSTNESS & LEAVE-ONE-CITY-OUT TABLE (STEP 8) */}
      {bundle.robustnessSummary && bundle.robustnessSummary.leaveOneCityOutRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <strong style={{ fontSize: '13.5px', color: 'var(--primary)' }}>
            Tabel Analisis Sensitivitas &amp; Robustness Leave-One-City-Out (LOCO Jackknife)
          </strong>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            {bundle.robustnessSummary.locoSummary}
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)' }}>
                  {['Kota yang Dikeluarkan (LOCO)', 'N Pasangan Tersisa', 'Peringkat #1 LOCO', 'MAE #1 LOCO', 'Peringkat #2 LOCO', 'MAE #2 LOCO', 'Konsistensi vs Sampel Penuh'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: h.includes('MAE') || h.includes('N ') ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bundle.robustnessSummary.leaveOneCityOutRows.map(row => (
                  <tr key={row.droppedCity}>
                    <td style={{ padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>Tanpa {row.droppedCity}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{row.nRemainingPairs}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>{row.topSourceLabel}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{row.topSourceMae.toFixed(3)}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-light)' }}>{row.secondSourceLabel}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{row.secondSourceMae.toFixed(3)}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 700, color: row.rankConsistentWithFull ? 'var(--success)' : '#f59e0b', borderBottom: '1px solid var(--border-light)' }}>
                      {row.rankConsistentWithFull ? 'Konsisten (Stabil)' : 'Berubah (Sensitif)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. INTERPRETASI STATISTIK (PER POIN) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <strong style={{ fontSize: '13.5px', color: 'var(--primary)' }}>
          6. Interpretasi Statistik (Per Poin — Berdasarkan Data Aktual)
        </strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '10px' }}>
          {bundle.structuredInterpretations.map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: '13px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--info-bg)',
                fontSize: '12.5px',
                lineHeight: 1.5
              }}
            >
              <strong style={{ display: 'block', marginBottom: '6px', color: 'var(--primary)', fontSize: '13px' }}>
                {item.title}
              </strong>
              <ul style={{ margin: '0 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>
                  <strong>Nilai:</strong> {item.nilai}
                </li>
                <li>
                  <strong>Artinya:</strong> {item.artinya}
                </li>
                <li>
                  <strong>Cara membaca:</strong> {item.caraMembaca}
                </li>
                <li>
                  <strong>Implikasi:</strong> {item.implikasi}
                </li>
                <li>
                  <strong>Batasan:</strong> {item.batasan}
                </li>
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* 6. KESIMPULAN STEP */}
      <div
        style={{
          padding: '14px',
          borderRadius: 'var(--radius-sm)',
          border: `1.5px solid ${statusColor}`,
          background: 'var(--surface-muted)',
          fontSize: '13px',
          lineHeight: 1.55
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          {bundle.stepConclusion.readinessStatus === 'LAYAK DILANJUTKAN' ? (
            <CheckCircle2 size={16} color="var(--success)" />
          ) : (
            <AlertTriangle size={16} color={statusColor} />
          )}
          <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>
            Ringkasan Keputusan Step {bundle.stepId} ({bundle.stepConclusion.readinessStatus})
          </strong>
        </div>
        <ul style={{ margin: '0 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <li>
            <strong>Ringkasan Keputusan:</strong> {bundle.stepConclusion.decisionSummary}
          </li>
          <li>
            <strong>Status Kelayakan Melanjutkan Analisis:</strong> {bundle.stepConclusion.readinessStatus}
          </li>
          {bundle.stepConclusion.warnings.map((w, i) => (
            <li key={i} style={{ color: '#d97706', fontWeight: 600 }}>
              <strong>Peringatan:</strong> {w}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
