'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Link2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud
} from 'lucide-react';
import { executePanelAccuracyPipeline } from '@/lib/panel-accuracy-orchestrator';
import { ImportedSheetData, MeasurementSource, PanelAccuracyFitResult, PanelDataset } from '@/lib/panel-accuracy-types';
import {
  autoDetectAccuracyDatasetConfig,
  evaluateImportedWorkbookSheets,
  generateMultiSourceCO2PresetDataset,
  parsePastedAccuracyData
} from '@/lib/panel-accuracy-validation';
import { executeAdvancedPanelAccuracyPipeline } from '@/lib/panel-adv-orchestrator';
import { AdvPanelFitResult, ComparativeMethodologyEvaluationResult } from '@/lib/panel-adv-types';
import { evaluateOption2VsOption3Methodology } from '@/lib/panel-methodology-comparison';

export const PanelMethodologyComparisonPanel: React.FC = () => {
  const initialPreset = useMemo(() => generateMultiSourceCO2PresetDataset(), []);

  const [datasetName, setDatasetName] = useState<string>('panel_co2_multi_source_accuracy.xlsx');
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>(initialPreset.observations);
  const [entityColumn, setEntityColumn] = useState<string>(initialPreset.cityIdColumn);
  const [timeColumn, setTimeColumn] = useState<string>(initialPreset.yearColumn);
  const [sources, setSources] = useState<MeasurementSource[]>(initialPreset.sources);

  const [importTab, setImportTab] = useState<'preset' | 'upload' | 'sheets' | 'paste'>('preset');
  const [sheetsUrl, setSheetsUrl] = useState<string>('');
  const [pasteText, setPasteText] = useState<string>(
    'City\tYear\tSelf_Reporting\tSatellite\tField_Sensor\tAlt_Satellite\nJakarta\t2021\t1240\t1295\t1270\t1276\nJakarta\t2022\t1280\t1340\t315\t1321\nSurabaya\t2021\t910\t965\t945\t950\nSurabaya\t2022\t940\t990\t972\t977\nBandung\t2021\t720\t775\t755\t760\nBandung\t2022\t750\t805\t782\t788'
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [runMode, setRunMode] = useState<'both' | 'only_opt2' | 'only_opt3'>('both');
  const [opt2OnlyResult, setOpt2OnlyResult] = useState<PanelAccuracyFitResult | null>(null);
  const [opt3OnlyResult, setOpt3OnlyResult] = useState<AdvPanelFitResult | null>(null);
  const [serverCompareBundle, setServerCompareBundle] = useState<{
    option2: PanelAccuracyFitResult;
    option3: AdvPanelFitResult;
    comparison: ComparativeMethodologyEvaluationResult;
  } | null>(null);

  const columns = useMemo(
    () => (rawRows.length > 0 ? Object.keys(rawRows[0]).filter(Boolean) : []),
    [rawRows]
  );

  const sharedDataset: PanelDataset = useMemo(
    () => ({
      cityIdColumn: entityColumn,
      yearColumn: timeColumn,
      sources,
      observations: rawRows
    }),
    [entityColumn, timeColumn, sources, rawRows]
  );

  const liveComparison = useMemo(() => {
    if (runMode !== 'both') return null;
    try {
      return evaluateOption2VsOption3Methodology({
        dataset: sharedDataset,
        datasetName,
        highPrecision: false
      });
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err.message : 'Gagal mengevaluasi komparasi dataset.'
      };
    }
  }, [sharedDataset, datasetName, runMode]);

  const activeBundle =
    serverCompareBundle ??
    (liveComparison && 'comparison' in liveComparison ? liveComparison : null);

  const applyDataset = (
    name: string,
    rows: Record<string, unknown>[],
    preset?: { cityIdColumn: string; yearColumn: string; sources: MeasurementSource[] }
  ) => {
    setDatasetName(name);
    setRawRows(rows);
    if (preset) {
      setEntityColumn(preset.cityIdColumn);
      setTimeColumn(preset.yearColumn);
      setSources(preset.sources);
    } else if (rows.length > 0) {
      const det = autoDetectAccuracyDatasetConfig(Object.keys(rows[0]), rows);
      setEntityColumn(det.cityIdColumn);
      setTimeColumn(det.yearColumn);
      setSources(det.sources);
    }
    setServerCompareBundle(null);
    setOpt2OnlyResult(null);
    setOpt3OnlyResult(null);
    setErrorMsg(null);
  };

  const handleUpload = async (file: File) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/regression/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal membaca berkas.');
      const sheets: ImportedSheetData[] = json.data?.sheets || [];
      if (!sheets.length) throw new Error('Berkas kosong.');
      const evalOut = evaluateImportedWorkbookSheets(sheets);
      const chosen = sheets.find(s => s.sheetName === evalOut.recommendedSheetName) || sheets[0];
      applyDataset(json.data?.originalName || file.name, chosen.allRows || chosen.previewRows || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal unggah berkas.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportSheets = async () => {
    if (!sheetsUrl.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/regression/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetsUrl.trim() })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal impor Google Sheets.');
      const sheets: ImportedSheetData[] = json.data?.sheets || [];
      if (!sheets.length) throw new Error('Spreadsheet kosong.');
      const evalOut = evaluateImportedWorkbookSheets(sheets);
      const chosen = sheets.find(s => s.sheetName === evalOut.recommendedSheetName) || sheets[0];
      applyDataset(json.data?.originalName || 'Google_Sheets_Compare.xlsx', chosen.allRows || chosen.previewRows || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal impor tautan.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunOnlyOption2 = () => {
    setErrorMsg(null);
    try {
      setRunMode('only_opt2');
      const out2 = executePanelAccuracyPipeline({
        dataset: sharedDataset,
        preprocessing: { dropDuplicateCityYear: true }
      });
      setOpt2OnlyResult(out2);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Eksekusi Opsi 2 gagal.');
    }
  };

  const handleRunOnlyOption3 = () => {
    setErrorMsg(null);
    try {
      setRunMode('only_opt3');
      const out3 = executeAdvancedPanelAccuracyPipeline({
        dataset: sharedDataset,
        datasetName
      });
      setOpt3OnlyResult(out3);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Eksekusi Opsi 3 gagal.');
    }
  };

  const handleRunServerCompare = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      setRunMode('both');
      const res = await fetch('/api/panel-adv-accuracy/fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'compare_2_and_3',
          dataset: sharedDataset,
          datasetName,
          highPrecision: true
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Komparasi server gagal.');
      setServerCompareBundle(json.data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menjalankan komparasi server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header & Dataset Loader */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '999px', background: 'var(--info-bg)', color: 'var(--primary)' }}>
            EVALUASI METODOLOGI KOMPARATIF · DATASET MENTAH IDENTIK
          </span>
          <h3 style={{ margin: '6px 0 2px', fontSize: '16.5px', fontWeight: 800, color: 'var(--text)' }}>
            Komparasi Metodologi: Option 2 (Baseline Utuh) vs Option 3 (Advanced Latent Model)
          </h3>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Menjalankan Opsi 2 secara terpisah, Opsi 3 secara terpisah, atau keduanya secara paralel pada dataset yang sama persis tanpa mengubah kode atau state Opsi 2.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'preset', label: 'Dataset Preset CO₂', icon: Sparkles },
            { key: 'upload', label: 'Unggah Berkas Sama', icon: UploadCloud },
            { key: 'sheets', label: 'Tautan Google Sheets', icon: Link2 },
            { key: 'paste', label: 'Tempel Data Tabel', icon: FileSpreadsheet }
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                className={importTab === t.key ? 'btn btn-primary' : 'btn btn-outline'}
                onClick={() => {
                  setImportTab(t.key as typeof importTab);
                  if (t.key === 'preset') {
                    const p = generateMultiSourceCO2PresetDataset();
                    applyDataset('panel_co2_multi_source_accuracy.xlsx', p.observations, p);
                  }
                }}
                style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {importTab === 'upload' && (
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
            style={{ fontSize: '16px', minHeight: '44px' }}
          />
        )}

        {importTab === 'sheets' && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="url"
              value={sheetsUrl}
              onChange={e => setSheetsUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              style={{ flex: 1, minHeight: '44px', fontSize: '16px', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}
            />
            <button type="button" className="btn btn-primary" onClick={handleImportSheets} style={{ minHeight: '44px', padding: '8px 14px' }}>
              Impor
            </button>
          </div>
        )}

        {importTab === 'paste' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea
              rows={4}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              style={{ width: '100%', fontSize: '16px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', fontFamily: 'monospace' }}
            />
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const p = parsePastedAccuracyData(pasteText);
                  if (p.error || !p.rows.length) setErrorMsg(p.error || 'Data tidak valid.');
                  else applyDataset('Pasted_Shared_Dataset.csv', p.rows);
                }}
                style={{ minHeight: '44px', padding: '8px 14px' }}
              >
                Terapkan Data Bersama
              </button>
            </div>
          </div>
        )}

        {/* Quick Column Summary & 3 Independent Execution Modes */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Dataset Aktif: <strong>{datasetName}</strong> · Baris={rawRows.length} · Entitas=<code>{entityColumn}</code> · Waktu=<code>{timeColumn}</code> · Sumber J={sources.length} ({columns.length} kolom tersedia)
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={runMode === 'only_opt2' ? 'btn btn-primary' : 'btn btn-outline'}
              onClick={handleRunOnlyOption2}
              style={{ minHeight: '44px', padding: '8px 12px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Activity size={14} />
              <span>1. Jalankan Opsi 2 Saja</span>
            </button>

            <button
              type="button"
              className={runMode === 'only_opt3' ? 'btn btn-primary' : 'btn btn-outline'}
              onClick={handleRunOnlyOption3}
              style={{ minHeight: '44px', padding: '8px 12px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <ShieldCheck size={14} />
              <span>2. Jalankan Opsi 3 Saja</span>
            </button>

            <button
              type="button"
              className={runMode === 'both' ? 'btn btn-primary' : 'btn btn-outline'}
              onClick={handleRunServerCompare}
              disabled={isLoading}
              style={{ minHeight: '44px', padding: '8px 14px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {isLoading ? <RefreshCw size={14} /> : <Play size={14} />}
              <span>3. Jalankan Keduanya &amp; Bandingkan (Presisi Tinggi)</span>
            </button>
          </div>
        </div>
      </div>

      {(errorMsg || (liveComparison && 'error' in liveComparison && liveComparison.error)) && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          <span>{errorMsg || (liveComparison && 'error' in liveComparison ? liveComparison.error : '')}</span>
        </div>
      )}

      {/* Standalone Option 2 Summary View */}
      {runMode === 'only_opt2' && opt2OnlyResult && (
        <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
            Hasil Eksekusi Independen Opsi 2 (Baseline Tidak Diubah)
          </h4>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Status: <strong>{opt2OnlyResult.ranking.canonicalStatus}</strong> · Sumber Teratas: <strong>{opt2OnlyResult.ranking.bestSourceLabel || opt2OnlyResult.ranking.bestCandidateLabel}</strong> · Max R-hat = {opt2OnlyResult.latentModel.maxRhat.toFixed(4)}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Rank Opsi 2</th>
                  <th style={{ padding: '8px' }}>Sumber</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Total Latent RMSE</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Error SD</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>P(Best) %</th>
                </tr>
              </thead>
              <tbody>
                {opt2OnlyResult.ranking.ranks.map(r => (
                  <tr key={r.sourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', fontWeight: 800 }}>#{r.rank}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{r.sourceName} ({r.sourceLabel})</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.totalLatentRmse.toFixed(4)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.errorSd.toFixed(4)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{(r.posteriorProbBest * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Standalone Option 3 Summary View */}
      {runMode === 'only_opt3' && opt3OnlyResult && (
        <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
            Hasil Eksekusi Independen Opsi 3 (Tanpa Ketergantungan pada Opsi 2)
          </h4>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Status: <strong>{opt3OnlyResult.ranking.verdictStatus}</strong> · Sumber Teratas: <strong>{opt3OnlyResult.ranking.leaderSourceLabel || 'Inkonklusif'}</strong> · Vehtari Split R-hat = {opt3OnlyResult.estimation.mcmcDiagnostics.maxRankNormalizedRhat.toFixed(4)}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Rank Opsi 3</th>
                  <th style={{ padding: '8px' }}>Sumber</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Anchor Total RMSE</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>R_j = σ/|λ|</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>P(Rank=1) %</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Max Shift Anchor</th>
                </tr>
              </thead>
              <tbody>
                {opt3OnlyResult.ranking.rows.map(r => (
                  <tr key={r.sourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', fontWeight: 800 }}>#{r.rank}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{r.sourceName} ({r.sourceLabel})</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.anchorTotalRmse.toFixed(4)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 700 }}>{r.scaleAdjustedNoiseRatio.toFixed(4)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{(r.probRank1 * 100).toFixed(1)}%</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.maxAnchorRankShift}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full Side-by-Side Comparative Evaluation (Option 2 vs Option 3) */}
      {runMode === 'both' && activeBundle && (
        <>
          {/* Evidence-Based Verdict Card */}
          <div
            className="card"
            style={{
              padding: '18px 20px',
              borderLeft: '4px solid var(--primary)',
              background: 'var(--info-bg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 800, color: 'var(--primary)' }}>
              <CheckCircle2 size={18} />
              <span>Kesimpulan Evaluasi Metodologi: {activeBundle.comparison.conclusion.categoryLabel}</span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text)', lineHeight: 1.55 }}>
              {activeBundle.comparison.conclusion.evidenceSummary}
            </p>
            <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
              Rekomendasi Metodologis: {activeBundle.comparison.conclusion.methodologicalRecommendation}
            </p>
            <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '6px', color: 'var(--warn)' }} />
              {activeBundle.comparison.conclusion.noGroundTruthDisclaimer}
            </div>
          </div>

          {/* Preprocessing Parity Check */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>
              Audit Kesetaraan Input &amp; Konsekuensi Prapemrosesan
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', fontSize: '12px' }}>
              <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--surface-muted)' }}>
                <strong>Prapemrosesan Opsi 2:</strong> {activeBundle.comparison.datasetMeta.option2PreprocessingSummary}
              </div>
              <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--surface-muted)' }}>
                <strong>Prapemrosesan Opsi 3:</strong> {activeBundle.comparison.datasetMeta.option3PreprocessingSummary}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
              {activeBundle.comparison.datasetMeta.preprocessingDiffImpact}
            </p>
          </div>

          {/* Side-by-Side Ranking & Uncertainty Table */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800 }}>
                Perbandingan Peringkat Sumber &amp; Ketidakpastian Posterior (Spearman ρ = {activeBundle.comparison.rankingComparison.spearmanRankConcordance.toFixed(3)})
              </h4>
              <span style={{ fontSize: '12px', fontWeight: 800, color: activeBundle.comparison.rankingComparison.sameTopRankedSource ? 'var(--success)' : 'var(--warn)' }}>
                {activeBundle.comparison.rankingComparison.sameTopRankedSource ? 'Peringkat #1 Selaras' : 'Peringkat #1 Berbeda'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              {activeBundle.comparison.rankingComparison.divergenceExplanation}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Sumber</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Rank Opsi 2</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Rank Opsi 3</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Δ Rank</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Opsi 2 Total RMSE</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Opsi 2 P(Best)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Opsi 3 Total RMSE</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Opsi 3 R_j (σ/|λ|)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Opsi 3 P(Rank=1)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Shift Anchor Maks</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBundle.comparison.rankingComparison.rows.map(r => (
                    <tr key={r.sourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{r.sourceLabel}</td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: 800 }}>#{r.option2Rank}</td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: 800, color: 'var(--primary)' }}>#{r.option3Rank}</td>
                      <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace' }}>
                        {r.rankShift === 0 ? '0' : r.rankShift > 0 ? `+${r.rankShift}` : r.rankShift}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.option2MetricValue.toFixed(4)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.option2ProbBestPct.toFixed(1)}%</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.option3TotalRmse.toFixed(4)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{r.option3NoiseRatio.toFixed(4)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{r.option3ProbRank1Pct.toFixed(1)}%</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.option3AnchorMaxShift}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 10 Diagnostic Comparisons */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800 }}>
              Perbandingan 10 Kriteria Diagnostik &amp; Ketahanan Statistik
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Kriteria Diagnostik</th>
                    <th style={{ padding: '8px' }}>Opsi 2 (Baseline)</th>
                    <th style={{ padding: '8px' }}>Opsi 3 (Advanced)</th>
                    <th style={{ padding: '8px' }}>Evaluasi Komparatif</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBundle.comparison.diagnosticComparison.map(dc => (
                    <tr key={dc.criterion} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{dc.criterion}</td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{dc.option2Summary}</td>
                      <td style={{ padding: '8px', color: 'var(--text)' }}>{dc.option3Summary}</td>
                      <td style={{ padding: '8px', color: 'var(--primary)', fontWeight: 600 }}>{dc.assessment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 19-Aspect Full Methodological Table */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={16} />
              <span>Tabel Komparasi 19 Dimensi Metodologi: Opsi 2 vs Opsi 3</span>
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Aspek Metodologi</th>
                    <th style={{ padding: '8px' }}>Opsi 2</th>
                    <th style={{ padding: '8px' }}>Opsi 3</th>
                    <th style={{ padding: '8px' }}>Implikasi Metodologis</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBundle.comparison.aspectComparisonTable.map(row => (
                    <tr key={row.aspect} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 800 }}>{row.aspect}</td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{row.option2Value}</td>
                      <td style={{ padding: '8px', color: 'var(--text)' }}>{row.option3Value}</td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{row.methodologicalImplication}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
