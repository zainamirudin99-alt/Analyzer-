'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Link2,
  Play,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  UploadCloud
} from 'lucide-react';
import {
  autoDetectPanelLatentMapping,
  computePanelLatentEDA,
  DEFAULT_PREPROCESSING_OPTIONS,
  generateCO2PresetDataset,
  parsePastedTabularData,
  preparePanelLatentObservations,
  validatePanelLatentData
} from '@/lib/panel-latent-data';
import { generatePanelLatentCSV } from '@/lib/panel-latent-export-xlsx';
import { DEFAULT_PANEL_LATENT_SPEC } from '@/lib/panel-latent-mcmc';
import {
  IdentificationStrategy,
  LikelihoodFamily,
  MeasurementSourceKey,
  PanelLatentFitResult,
  PanelLatentMapping,
  PanelLatentModelSpec,
  PanelLatentPreprocessingOptions,
  PreprocessingCandidateScenario,
  PreprocessingRecommendationResult,
  PriorRegime
} from '@/lib/panel-latent-types';
import {
  PanelLatentDiagnosticPlots,
  PanelLatentEDACharts,
  PanelLatentFullVisualizations
} from './PanelLatentCharts';

const LATENT_STEPS = [
  { id: 1, short: 'Upload', title: '1. Data Upload' },
  { id: 2, short: 'Mapping', title: '2. Data Mapping' },
  { id: 3, short: 'Preprocess', title: '3. Data Preprocessing' },
  { id: 4, short: 'EDA', title: '4. Exploratory Data Analysis' },
  { id: 5, short: 'Model', title: '5. Model Specification' },
  { id: 6, short: 'Bayesian', title: '6. Bayesian Estimation' },
  { id: 7, short: 'Diagnostik', title: '7. Model Diagnostics' },
  { id: 8, short: 'Evaluasi', title: '8. Model Evaluation' },
  { id: 9, short: 'Hasil', title: '9. Final Results & Code' }
];

export const PanelLatentTab: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [sourceTab, setSourceTab] = useState<'preset' | 'upload' | 'link' | 'paste'>('preset');
  const [datasetName, setDatasetName] = useState<string>('simulasi_co2_kota_indonesia.xlsx');
  const [sheetsData, setSheetsData] = useState<any[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rawRows, setRawRows] = useState<Record<string, any>[]>(() => generateCO2PresetDataset());

  const [sheetsUrl, setSheetsUrl] = useState<string>('');
  const [pasteText, setPasteText] = useState<string>(
    'City\tYear\tSelf_Reporting\tSatellite\tSensor\nJakarta\t2020\t1250\t1190\t1210\nJakarta\t2021\t1300\t1260\t1275\nSemarang\t2020\t850\t820\t835\nSemarang\t2021\t890\t860\t870\nSurabaya\t2020\t1100\t1050\t1070\nSurabaya\t2021\t1140\t1095\t1115'
  );
  const [isLoadingSource, setIsLoadingSource] = useState<boolean>(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const columns = useMemo(() => (rawRows.length > 0 ? Object.keys(rawRows[0]).filter(Boolean) : []), [rawRows]);

  const [mapping, setMapping] = useState<PanelLatentMapping>(() =>
    autoDetectPanelLatentMapping(Object.keys(generateCO2PresetDataset()[0]))
  );
  const [preprocessing, setPreprocessing] = useState<PanelLatentPreprocessingOptions>(DEFAULT_PREPROCESSING_OPTIONS);
  const [spec, setSpec] = useState<PanelLatentModelSpec>(DEFAULT_PANEL_LATENT_SPEC);

  const [isEstimating, setIsEstimating] = useState<boolean>(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [fitResult, setFitResult] = useState<PanelLatentFitResult | null>(null);

  // Step 3 Multi-Scenario Recommendation
  const [recommendation, setRecommendation] = useState<PreprocessingRecommendationResult | null>(null);
  const [isRecommending, setIsRecommending] = useState<boolean>(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [recSignature, setRecSignature] = useState<string>('');
  const [showAllScenarios, setShowAllScenarios] = useState<boolean>(true);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  // Step 9 tabs
  const [resultSubTab, setResultSubTab] = useState<'stata' | 'visuals' | 'interpret' | 'code'>('stata');
  const [codeTab, setCodeTab] = useState<'stan' | 'r' | 'brms' | 'prep'>('stan');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const datasetSignature = useMemo(
    () =>
      `${datasetName}|${rawRows.length}|${mapping.cityCol}|${mapping.yearCol}|${mapping.x1Col}|${mapping.x2Col}|${mapping.x3Col}|${spec.anchorSource}`,
    [datasetName, rawRows.length, mapping.cityCol, mapping.yearCol, mapping.x1Col, mapping.x2Col, mapping.x3Col, spec.anchorSource]
  );

  const qualityReport = useMemo(
    () => validatePanelLatentData(rawRows, mapping, preprocessing),
    [rawRows, mapping, preprocessing]
  );

  const preparedPreview = useMemo(
    () => preparePanelLatentObservations(rawRows, mapping, preprocessing),
    [rawRows, mapping, preprocessing]
  );

  const edaResult = useMemo(
    () => computePanelLatentEDA(preparedPreview.observations, mapping),
    [preparedPreview.observations, mapping]
  );

  const applyNewRows = (name: string, rows: Record<string, any>[], sheetList: any[] = [], sheetName = '') => {
    setDatasetName(name);
    setRawRows(rows);
    setSheetsData(sheetList);
    setSelectedSheet(sheetName);
    if (rows.length > 0) {
      setMapping(autoDetectPanelLatentMapping(Object.keys(rows[0])));
    }
    setFitResult(null);
    setSourceError(null);
    setRecommendation(null);
    setRecSignature('');
    setRecommendError(null);
    setAppliedNotice(null);
  };

  const handleEvaluateScenarios = useCallback(async () => {
    if (rawRows.length === 0) return;
    setIsRecommending(true);
    setRecommendError(null);
    try {
      const res = await fetch('/api/panel-latent/recommend-preprocessing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rawRows,
          mapping,
          spec,
          allowNegativeValues: preprocessing.allowNegativeValues
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Gagal mengevaluasi skenario prapemrosesan.');
      }
      setRecommendation(json.data);
      setRecSignature(datasetSignature);
    } catch (err: any) {
      setRecommendError(err.message || 'Terjadi kesalahan saat mengevaluasi kombinasi prapemrosesan.');
    } finally {
      setIsRecommending(false);
    }
  }, [rawRows, mapping, spec, preprocessing.allowNegativeValues, datasetSignature]);

  useEffect(() => {
    if (
      currentStep === 3 &&
      rawRows.length > 0 &&
      recSignature !== datasetSignature &&
      !isRecommending
    ) {
      handleEvaluateScenarios();
    }
  }, [currentStep, rawRows.length, recSignature, datasetSignature, isRecommending, handleEvaluateScenarios]);

  const isScenarioCurrentlyActive = useCallback(
    (s: PreprocessingCandidateScenario) =>
      s.preprocessing.applyLog1p === preprocessing.applyLog1p &&
      s.preprocessing.applyWinsorize === preprocessing.applyWinsorize &&
      s.preprocessing.applyStandardize === preprocessing.applyStandardize &&
      s.preprocessing.dropDuplicateCityYear === preprocessing.dropDuplicateCityYear &&
      s.recommendedLikelihood === spec.likelihood &&
      s.recommendedIdentification === spec.identification,
    [preprocessing, spec.likelihood, spec.identification]
  );

  const handleApplyScenario = (s: PreprocessingCandidateScenario) => {
    setPreprocessing({ ...s.preprocessing });
    setSpec(prev => ({
      ...prev,
      likelihood: s.recommendedLikelihood,
      identification: s.recommendedIdentification
    }));
    setFitResult(null);
    setAppliedNotice(
      `Konfigurasi "${s.label}" diterapkan ke Step 3 & Step 5 (${s.recommendedLikelihood === 'student_t' ? 'Student-t Likelihood' : 'Normal Likelihood'}, identifikasi ${s.recommendedIdentification === 'standardized' ? 'Standardized Factor' : `Anchor ${spec.anchorSource}`}).`
    );
  };

  const handleLoadPreset = () => {
    setSourceTab('preset');
    applyNewRows('simulasi_co2_kota_indonesia.xlsx', generateCO2PresetDataset());
  };

  const handleFileUpload = async (file: File) => {
    setIsLoadingSource(true);
    setSourceError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/regression/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal membaca file.');
      const sheets = json.data?.sheets || [];
      if (sheets.length === 0) throw new Error('Sheet kosong atau tidak terbaca.');
      const first = sheets[0];
      const rows = first.allRows || first.previewRows || [];
      applyNewRows(json.data.fileName || file.name, rows, sheets, first.sheetName);
    } catch (err: any) {
      setSourceError(err.message || 'Gagal mengunggah berkas.');
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleImportLink = async () => {
    setIsLoadingSource(true);
    setSourceError(null);
    try {
      const res = await fetch('/api/regression/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetsUrl })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal mengimpor Google Sheets.');
      const sheets = json.data?.sheets || [];
      if (sheets.length === 0) throw new Error('Spreadsheet tidak memiliki data.');
      const first = sheets[0];
      const rows = first.allRows || first.previewRows || [];
      applyNewRows(json.data.fileName || 'Google_Sheets_Panel.xlsx', rows, sheets, first.sheetName);
    } catch (err: any) {
      setSourceError(err.message || 'Gagal mengimpor Google Sheets.');
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleApplyPastedData = () => {
    const parsed = parsePastedTabularData(pasteText);
    if (parsed.error || parsed.rows.length === 0) {
      setSourceError(parsed.error || 'Data paste tidak valid.');
      return;
    }
    applyNewRows('data_paste_panel.csv', parsed.rows);
  };

  const handleRunBayesianEstimation = async () => {
    setIsEstimating(true);
    setEstimateError(null);
    try {
      const res = await fetch('/api/panel-latent/fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rawRows,
          mapping,
          preprocessing,
          spec
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Gagal menjalankan estimasi Bayesian.');
      }
      setFitResult(json.data);
      setCurrentStep(7);
    } catch (err: any) {
      setEstimateError(err.message || 'Terjadi kesalahan saat menjalankan MCMC.');
    } finally {
      setIsEstimating(false);
    }
  };

  const triggerDownloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportBinary = async (format: 'xlsx' | 'docx' | 'pdf') => {
    if (!fitResult) return;
    setIsExporting(format);
    try {
      const res = await fetch(`/api/panel-latent/export-${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: fitResult, datasetName })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Gagal mengekspor ${format.toUpperCase()}`);
      }
      const blob = await res.blob();
      triggerDownloadBlob(blob, `Laporan_Panel_Latent_CO2.${format}`);
    } catch (err: any) {
      setEstimateError(err.message || 'Gagal mengunduh berkas.');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportCSV = () => {
    if (!fitResult) return;
    const csv = generatePanelLatentCSV(fitResult);
    triggerDownloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'Estimasi_Emisi_CO2_Laten.csv');
  };

  const activeCodeText = useMemo(() => {
    if (!fitResult) return '';
    if (codeTab === 'stan') return fitResult.generatedCode.stanCode;
    if (codeTab === 'r') return fitResult.generatedCode.rScript;
    if (codeTab === 'brms') return fitResult.generatedCode.brmsSnippet;
    return fitResult.generatedCode.preprocessingCodeR;
  }, [fitResult, codeTab]);

  const handleCopyCode = async () => {
    if (!activeCodeText) return;
    await navigator.clipboard.writeText(activeCodeText);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleDownloadCodeFile = () => {
    if (!activeCodeText) return;
    const ext = codeTab === 'stan' ? 'stan' : 'R';
    const fname = codeTab === 'stan' ? 'panel_latent_co2.stan' : `panel_latent_${codeTab}.R`;
    triggerDownloadBlob(new Blob([activeCodeText], { type: 'text/plain;charset=utf-8' }), fname);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '28px' }}>
      {/* Progress Horizontal Stepper */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          padding: '10px 12px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)'
        }}
      >
        {LATENT_STEPS.map(s => {
          const active = currentStep === s.id;
          const reachable = s.id <= 6 || fitResult !== null;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && setCurrentStep(s.id)}
              style={{
                minHeight: '40px',
                padding: '6px 12px',
                borderRadius: '999px',
                whiteSpace: 'nowrap',
                border: active ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                background: active ? 'var(--primary)' : currentStep > s.id ? 'var(--info-bg)' : 'var(--surface-muted)',
                color: active ? '#fff' : reachable ? 'var(--text)' : 'var(--text-muted)',
                fontSize: '12.5px',
                fontWeight: active ? 700 : 600,
                cursor: reachable ? 'pointer' : 'not-allowed'
              }}
            >
              {s.id}. {s.short}
            </button>
          );
        })}
      </div>

      {/* Main Content Card */}
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* STEP 1: DATA UPLOAD */}
        {currentStep === 1 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Step 1 — Data Upload Multi-Sumber Panel CO₂</h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Unggah Excel/CSV, impor Google Sheets, tempel (paste) data langsung, atau uji dengan Dataset Simulasi CO₂ Kota-Tahun.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['preset', 'upload', 'link', 'paste'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    className={sourceTab === tab ? 'btn btn-primary' : 'btn btn-outline'}
                    style={{ minHeight: '40px', fontSize: '12.5px' }}
                    onClick={() => (tab === 'preset' ? handleLoadPreset() : setSourceTab(tab))}
                  >
                    {tab === 'preset' && <><Sparkles size={14} style={{ marginRight: '6px' }} />Simulasi CO₂</>}
                    {tab === 'upload' && <><UploadCloud size={14} style={{ marginRight: '6px' }} />Upload Excel/CSV</>}
                    {tab === 'link' && <><Link2 size={14} style={{ marginRight: '6px' }} />Google Sheets</>}
                    {tab === 'paste' && <><FileText size={14} style={{ marginRight: '6px' }} />Paste Data</>}
                  </button>
                ))}
              </div>
            </div>

            {sourceTab === 'upload' && (
              <div style={{ padding: '20px', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', textAlign: 'center' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isLoadingSource}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ minHeight: '44px' }}
                >
                  <UploadCloud size={16} style={{ marginRight: '8px' }} />
                  {isLoadingSource ? 'Memproses Berkas...' : 'Pilih Berkas (.xlsx, .xls, .csv)'}
                </button>
                {sheetsData.length > 1 && (
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>Pilih Sheet:</span>
                    <select
                      value={selectedSheet}
                      onChange={e => {
                        const target = sheetsData.find(s => s.sheetName === e.target.value);
                        if (target) applyNewRows(datasetName, target.allRows || target.previewRows || [], sheetsData, target.sheetName);
                      }}
                      style={{ minHeight: '40px', fontSize: '14px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    >
                      {sheetsData.map(s => <option key={s.sheetName} value={s.sheetName}>{s.sheetName} ({s.rowCount} baris)</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {sourceTab === 'link' && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="url"
                  value={sheetsUrl}
                  onChange={e => setSheetsUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  style={{ flex: 1, minWidth: '240px', minHeight: '44px', fontSize: '16px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                />
                <button type="button" className="btn btn-primary" disabled={isLoadingSource} onClick={handleImportLink} style={{ minHeight: '44px' }}>
                  {isLoadingSource ? 'Mengunduh...' : 'Impor Google Sheets'}
                </button>
              </div>
            )}

            {sourceTab === 'paste' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  rows={6}
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Tempel tabel dari Excel atau CSV di sini (baris pertama = header kolom)..."
                  style={{ width: '100%', fontSize: '13px', fontFamily: 'monospace', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                />
                <div>
                  <button type="button" className="btn btn-primary" onClick={handleApplyPastedData} style={{ minHeight: '44px' }}>
                    Terapkan Data Paste
                  </button>
                </div>
              </div>
            )}

            {sourceError && (
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', color: '#ef4444', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} /> {sourceError}
              </div>
            )}

            {/* Dataset Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
              {[
                { label: 'Observasi', val: qualityReport.nObsRaw },
                { label: 'Jumlah Kota', val: qualityReport.nCities },
                { label: 'Rentang Tahun', val: qualityReport.yearMin && qualityReport.yearMax ? `${qualityReport.yearMin}–${qualityReport.yearMax}` : '-' },
                { label: 'Variabel', val: columns.length },
                { label: 'Struktur Panel', val: qualityReport.isBalanced ? 'Balanced' : 'Unbalanced' }
              ].map(m => (
                <div key={m.label} style={{ padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>{m.label}</div>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>{m.val}</div>
                </div>
              ))}
            </div>

            {/* Data Preview Table */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)' }}>
                    {columns.map(c => (
                      <th key={c} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 8).map((row, idx) => (
                    <tr key={idx}>
                      {columns.map(c => (
                        <td key={c} style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-light)' }}>
                          {String(row[c] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* STEP 2: DATA MAPPING */}
        {currentStep === 2 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Step 2 — Pemetaan Kolom Panel & Tiga Sumber CO₂</h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Tentukan kolom identitas kota, tahun, dan tiga sumber pengukuran (bukan sebagai variabel regresi biasa, melainkan indikator variabel laten Y*).
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ minHeight: '42px' }}
                onClick={() => setMapping(autoDetectPanelLatentMapping(columns))}
              >
                <Sparkles size={14} style={{ marginRight: '6px' }} /> Deteksi Otomatis
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
              {[
                { key: 'cityCol', label: 'City ID (Identitas Kota)' },
                { key: 'yearCol', label: 'Year (Periode Tahun)' },
                { key: 'x1Col', label: 'X1 — Self-Reporting' },
                { key: 'x2Col', label: 'X2 — Satellite-Based' },
                { key: 'x3Col', label: 'X3 — Sensor-Based' }
              ].map(item => (
                <div key={item.key}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '5px' }}>{item.label}</label>
                  <select
                    value={(mapping as any)[item.key] || ''}
                    onChange={e => setMapping(prev => ({ ...prev, [item.key]: e.target.value }))}
                    style={{ width: '100%', minHeight: '44px', fontSize: '15px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                  >
                    <option value="">-- Pilih Kolom --</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Optional Measurement Uncertainty & Unit Labels */}
            <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
              {[
                { seKey: 'se1Col', unitKey: 'x1Unit', title: 'X1 (Self-Reporting)' },
                { seKey: 'se2Col', unitKey: 'x2Unit', title: 'X2 (Satellite)' },
                { seKey: 'se3Col', unitKey: 'x3Unit', title: 'X3 (Sensor)' }
              ].map(u => (
                <div key={u.title} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <strong style={{ fontSize: '12.5px' }}>{u.title} — Opsi Satuan & SE</strong>
                  <input
                    type="text"
                    value={(mapping as any)[u.unitKey] || ''}
                    onChange={e => setMapping(prev => ({ ...prev, [u.unitKey]: e.target.value }))}
                    placeholder="Satuan (mis. kt CO₂)"
                    style={{ minHeight: '40px', fontSize: '14px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                  />
                  <select
                    value={(mapping as any)[u.seKey] || ''}
                    onChange={e => setMapping(prev => ({ ...prev, [u.seKey]: e.target.value || undefined }))}
                    style={{ minHeight: '40px', fontSize: '14px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                  >
                    <option value="">Tanpa kolom SE/Uncertainty</option>
                    {columns.map(c => <option key={c} value={c}>SE: {c}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        {/* STEP 3: DATA PREPROCESSING (10 CHECKS + OPT-IN) */}
        {currentStep === 3 && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Step 3 — Audit Kualitas Data & Prapemrosesan Eksplisit</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Sistem memeriksa 10 potensi risiko data panel. Transformasi tidak pernah dilakukan otomatis tanpa persetujuan Anda.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '10px' }}>
              {qualityReport.checks.map(chk => (
                <div
                  key={chk.id}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${chk.severity === 'error' ? '#ef4444' : chk.severity === 'warning' ? 'var(--warn-border)' : 'var(--border)'}`,
                    background: chk.severity === 'error' ? 'var(--danger-bg)' : chk.severity === 'warning' ? 'var(--warn-bg)' : 'var(--surface-muted)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '13px' }}>{chk.title}</strong>
                    {chk.severity === 'ok' ? <CheckCircle2 size={16} color="var(--success)" /> : <AlertTriangle size={16} color="#f59e0b" />}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{chk.message}</div>
                  {chk.recommendation && (
                    <div style={{ fontSize: '11.5px', color: 'var(--primary)', marginTop: '4px', fontWeight: 600 }}>
                      Saran: {chk.recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Multi-Scenario System Recommendation Panel */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--primary)',
                background: 'var(--surface-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ flex: '1 1 320px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sliders size={18} color="var(--primary)" />
                    <strong style={{ fontSize: '15px', color: 'var(--text)' }}>
                      Rekomendasi Sistem Multi-Skenario (Simulasi Semua Kemungkinan Terbaik)
                    </strong>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Sistem menguji seluruh kombinasi prapemrosesan (<code>Asli</code>, <code>Winsorization 2.5%</code>, <code>log(1+x)</code>, <code>Z-Score</code>, serta gabungannya) bersama <code>Normal</code> vs <code>Student-t Likelihood</code> via Bayesian MCMC cepat untuk menemukan konfigurasi paling konvergen, reliabel, dan akurat pada skala asli.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={isRecommending || rawRows.length === 0}
                  onClick={handleEvaluateScenarios}
                  style={{ minHeight: '44px', fontSize: '13px', whiteSpace: 'nowrap' }}
                >
                  <RefreshCw size={15} style={{ marginRight: '6px' }} />
                  {isRecommending ? 'Memproses Kemungkinan...' : 'Evaluasi Ulang Semua Kemungkinan'}
                </button>
              </div>

              {isRecommending && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)'
                  }}
                >
                  Menjalankan screening Bayesian MCMC lintas kombinasi prapemrosesan &amp; likelihood...
                </div>
              )}

              {recommendError && (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', color: '#ef4444', fontSize: '13px' }}>
                  {recommendError}
                </div>
              )}

              {appliedNotice && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--info-bg)',
                    border: '1px solid var(--primary)',
                    fontSize: '12.5px',
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <CheckCircle2 size={16} color="var(--success)" />
                  <span>{appliedNotice}</span>
                </div>
              )}

              {recommendation && !isRecommending && (
                <>
                  {/* Best Recommendation Highlight Card */}
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--primary)',
                      background: 'var(--surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            background: 'var(--primary)',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 800
                          }}
                        >
                          <ShieldCheck size={14} /> REKOMENDASI TERBAIK (#1 dari {recommendation.evaluatedCount})
                        </span>
                        <strong style={{ fontSize: '14.5px', color: 'var(--text)' }}>
                          {recommendation.bestScenario.label}
                        </strong>
                      </div>

                      {isScenarioCurrentlyActive(recommendation.bestScenario) ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--success)',
                            background: 'var(--info-bg)',
                            color: 'var(--success)',
                            fontSize: '13px',
                            fontWeight: 700,
                            minHeight: '44px'
                          }}
                        >
                          <CheckCircle2 size={16} /> Konfigurasi Terbaik Aktif
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleApplyScenario(recommendation.bestScenario)}
                          style={{ minHeight: '44px', fontSize: '13.5px' }}
                        >
                          <Sparkles size={15} style={{ marginRight: '6px' }} />
                          Terapkan Rekomendasi Terbaik
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px' }}>
                      {[
                        { label: 'Skor Komposit', val: `${recommendation.bestScenario.compositeScore.toFixed(1)} / 100` },
                        { label: 'Reliabilitas Rata-Rata', val: `${(recommendation.bestScenario.meanReliability * 100).toFixed(1)}%` },
                        { label: 'NRMSE Skala Asli', val: `${(recommendation.bestScenario.nrmseOriginalScale * 100).toFixed(1)}%` },
                        { label: 'Max R-hat', val: recommendation.bestScenario.maxRHat.toFixed(3) },
                        { label: 'Max |r Residu|', val: recommendation.bestScenario.maxResidualCorr.toFixed(3) },
                        { label: 'Waktu Evaluasi', val: `${recommendation.elapsedMs} ms` }
                      ].map(kpi => (
                        <div
                          key={kpi.label}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--surface-muted)'
                          }}
                        >
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>{kpi.label}</div>
                          <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>{kpi.val}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <strong>Alasan Pemilihan:</strong> {recommendation.bestScenario.rationale}{' '}
                      <span style={{ color: 'var(--text-muted)' }}>
                        (Menerapkan rekomendasi ini menyelaraskan opsi Step 3 serta rekomendasi{' '}
                        <code>{recommendation.bestScenario.recommendedLikelihood === 'student_t' ? 'Student-t Likelihood' : 'Normal Likelihood'}</code> &amp; identifikasi{' '}
                        <code>{recommendation.bestScenario.recommendedIdentification === 'standardized' ? 'Standardized Factor' : `Anchor ${spec.anchorSource}`}</code> di Step 5.)
                      </span>
                    </div>
                  </div>

                  {/* Toggle & Full Ranked Candidate Matrix */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <strong style={{ fontSize: '13px', color: 'var(--text)' }}>
                      Perbandingan Seluruh {recommendation.evaluatedCount} Skenario yang Diproses
                    </strong>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setShowAllScenarios(v => !v)}
                      style={{ minHeight: '38px', fontSize: '12.5px' }}
                    >
                      {showAllScenarios ? (
                        <>
                          <ChevronUp size={15} style={{ marginRight: '5px' }} /> Sembunyikan Matriks Skenario
                        </>
                      ) : (
                        <>
                          <ChevronDown size={15} style={{ marginRight: '5px' }} /> Tampilkan Semua Skenario
                        </>
                      )}
                    </button>
                  </div>

                  {showAllScenarios && (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-muted)' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>#</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Kombinasi Skenario</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Skor</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Reliabilitas</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>NRMSE Asli</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Max R-hat</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Max |r Residu|</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recommendation.scenarios.map((s, idx) => {
                            const active = isScenarioCurrentlyActive(s);
                            return (
                              <tr
                                key={s.id}
                                style={{
                                  background: idx === 0 ? 'var(--info-bg)' : 'transparent',
                                  borderBottom: '1px solid var(--border-light)'
                                }}
                              >
                                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>
                                  #{idx + 1}
                                </td>
                                <td style={{ padding: '8px 10px', minWidth: '230px' }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text)' }}>{s.label}</div>
                                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    {s.shortTag} • PPC p=({s.ppcPMean.toFixed(2)}, {s.ppcPSd.toFixed(2)})
                                    {s.warnings.length > 0 ? ` • ${s.warnings.join(', ')}` : ''}
                                  </div>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', minWidth: '105px' }}>
                                  <div style={{ fontWeight: 800, color: idx === 0 ? 'var(--primary)' : 'var(--text)' }}>
                                    {s.compositeScore.toFixed(1)}
                                  </div>
                                  <div style={{ height: '5px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden', marginTop: '3px' }}>
                                    <div
                                      style={{
                                        width: `${Math.min(100, Math.max(0, s.compositeScore))}%`,
                                        height: '100%',
                                        background: idx === 0 ? 'var(--primary)' : 'var(--text-secondary)'
                                      }}
                                    />
                                  </div>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                                  {(s.meanReliability * 100).toFixed(1)}%
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                  {(s.nrmseOriginalScale * 100).toFixed(1)}%
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: s.isConverged ? 'var(--success)' : '#ef4444', fontWeight: 700 }}>
                                  {s.maxRHat.toFixed(3)}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: s.maxResidualCorr > 0.35 ? '#f59e0b' : 'var(--text)' }}>
                                  {s.maxResidualCorr.toFixed(3)}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  {active ? (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '5px 10px',
                                        borderRadius: '999px',
                                        border: '1px solid var(--success)',
                                        color: 'var(--success)',
                                        fontSize: '12px',
                                        fontWeight: 700
                                      }}
                                    >
                                      <Check size={13} /> Aktif
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className={idx === 0 ? 'btn btn-primary' : 'btn btn-outline'}
                                      onClick={() => handleApplyScenario(s)}
                                      style={{ minHeight: '38px', fontSize: '12px', padding: '4px 12px' }}
                                    >
                                      Terapkan
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Opt-In Preprocessing Toggles */}
            <div style={{ padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <strong style={{ fontSize: '14px' }}>Opsi Prapemrosesan (Persetujuan Eksplisit Pengguna)</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Step 5 Aktif: <code>{spec.likelihood === 'student_t' ? 'Student-t' : 'Normal'}</code> •{' '}
                  <code>{spec.identification === 'standardized' ? 'Standardized Y*' : `Anchor ${spec.anchorSource}`}</code>
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', minHeight: '36px' }}>
                <input
                  type="checkbox"
                  checked={preprocessing.dropDuplicateCityYear}
                  onChange={e => setPreprocessing(p => ({ ...p, dropDuplicateCityYear: e.target.checked }))}
                />
                <span>Hapus baris duplikat (City, Year) dan pertahankan entri pertama</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', minHeight: '36px' }}>
                <input
                  type="checkbox"
                  checked={preprocessing.applyLog1p}
                  onChange={e => setPreprocessing(p => ({ ...p, applyLog1p: e.target.checked }))}
                />
                <span>Terapkan <code>log(1 + x)</code> pada X1, X2, X3 (cocok bila distribusi sangat miring ke kanan)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', minHeight: '36px' }}>
                <input
                  type="checkbox"
                  checked={preprocessing.applyWinsorize}
                  onChange={e => setPreprocessing(p => ({ ...p, applyWinsorize: e.target.checked }))}
                />
                <span>Terapkan Winsorization (potong ekstrem 2.5% ekor bawah & atas)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', minHeight: '36px' }}>
                <input
                  type="checkbox"
                  checked={preprocessing.applyStandardize}
                  onChange={e => setPreprocessing(p => ({ ...p, applyStandardize: e.target.checked }))}
                />
                <span>Standardization Z-score (wajib dipertimbangkan jika perbedaan satuan antarsumber &gt; 10×)</span>
              </label>
            </div>
          </>
        )}

        {/* STEP 4: EXPLORATORY DATA ANALYSIS */}
        {currentStep === 4 && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Step 4 — Exploratory Data Analysis (EDA)</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Ringkasan statistik deskriptif, matriks korelasi Pearson & Spearman antarsumber, serta tren emisi CO₂ sebelum estimasi laten.
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)' }}>
                    {['Sumber', 'N', 'Mean', 'SD', 'Median', 'IQR', 'Min', 'Max', 'CV', 'Skewness'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Sumber' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {edaResult.descriptives.map(d => (
                    <tr key={d.sourceKey}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{d.label}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.n}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.mean.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.sd.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.median.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.iqr.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.min.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.max.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{(d.cv * 100).toFixed(1)}%</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.skewness.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pearson & Spearman Correlation Table */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {[
                { title: 'Korelasi Pearson Antarsumber', mat: edaResult.pearsonMatrix },
                { title: 'Korelasi Spearman Rank Antarsumber', mat: edaResult.spearmanMatrix }
              ].map(tbl => (
                <div key={tbl.title} style={{ padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                  <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>{tbl.title}</strong>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'center' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '4px' }}></th>
                        <th>X1</th>
                        <th>X2</th>
                        <th>X3</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['X1', 'X2', 'X3'].map((rName, rIdx) => (
                        <tr key={rName}>
                          <td style={{ fontWeight: 700, padding: '6px' }}>{rName}</td>
                          {tbl.mat[rIdx].map((v, cIdx) => (
                            <td key={cIdx} style={{ padding: '6px', border: '1px solid var(--border-light)' }}>{v.toFixed(3)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <PanelLatentEDACharts
              eda={edaResult}
              unitLabel={preprocessing.applyStandardize ? 'Z-Score' : mapping.x3Unit || 'Unit Data'}
              labels={{ X1: mapping.x1Label, X2: mapping.x2Label, X3: mapping.x3Label }}
            />
          </>
        )}

        {/* STEP 5: MODEL SPECIFICATION */}
        {currentStep === 5 && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Step 5 — Spesifikasi Model Bayesian & Identifikasi</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Konfigurasikan strategi identifikasi variabel laten Y* (wajib karena tanpa ground truth), komponen panel hierarkis, likelihood, dan sampler MCMC.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Strategi Identifikasi (Skala & Lokasi Y*)</label>
                <select
                  value={spec.identification}
                  onChange={e => setSpec(s => ({ ...s, identification: e.target.value as IdentificationStrategy }))}
                  style={{ width: '100%', minHeight: '44px', fontSize: '15px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                >
                  <option value="anchor">Anchor Reference Source (α_anchor=0, λ_anchor=1)</option>
                  <option value="standardized">Standardized Latent Factor (μ=0, SD(Y*)=1)</option>
                </select>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Anchor mempertahankan satuan fisik sumber jangkar; Standardized cocok bila satuan sumber berbeda.
                </span>
              </div>

              {spec.identification === 'anchor' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Sumber Jangkar (Reference Source)</label>
                  <select
                    value={spec.anchorSource}
                    onChange={e => setSpec(s => ({ ...s, anchorSource: e.target.value as MeasurementSourceKey }))}
                    style={{ width: '100%', minHeight: '44px', fontSize: '15px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                  >
                    <option value="X3">X3 — {mapping.x3Label} (Direkomendasikan)</option>
                    <option value="X2">X2 — {mapping.x2Label}</option>
                    <option value="X1">X1 — {mapping.x1Label}</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Rezim Prior Bayesian</label>
                <select
                  value={spec.priorRegime}
                  onChange={e => setSpec(s => ({ ...s, priorRegime: e.target.value as PriorRegime }))}
                  style={{ width: '100%', minHeight: '44px', fontSize: '15px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                >
                  <option value="weakly_informative">Weakly Informative (Half-Cauchy + Normal, Default)</option>
                  <option value="skeptical_tight">Skeptical Tight Prior (Regularisasi Kuat)</option>
                  <option value="diffuse_wide">Diffuse Wide Prior (Minim Asumsi Awal)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Keluarga Likelihood</label>
                <select
                  value={spec.likelihood}
                  onChange={e => setSpec(s => ({ ...s, likelihood: e.target.value as LikelihoodFamily }))}
                  style={{ width: '100%', minHeight: '44px', fontSize: '15px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                >
                  <option value="normal">Normal / Gaussian Likelihood</option>
                  <option value="student_t">Student-t Likelihood (Tahan Outlier / Ekor Berat)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
              {[
                { key: 'sourceSpecificBias', label: 'Source-Specific Bias (α_j)', desc: 'Mengestimasi bias aditif relatif sumber non-jangkar.' },
                { key: 'sourceSpecificLoading', label: 'Source-Specific Loading (λ_j)', desc: 'Mengestimasi sensitivitas proporsional tiap sumber.' },
                { key: 'includeCityIntercept', label: 'Random Intercept Kota (u_i)', desc: 'Mengakomodasi perbedaan tingkat emisi baseline antar kota.' },
                { key: 'includeTimeEffect', label: 'Time Effect Tahunan (γ_t)', desc: 'Mengakomodasi guncangan makro bersama tiap tahun.' },
                { key: 'includeAR1', label: 'Komponen Temporal AR(1) (ρ)', desc: `Ketergantungan antarwaktu Y*_t terhadap Y*_t-1 (syarat T≥3; saat ini T=${preparedPreview.years.length}).` }
              ].map(t => (
                <label key={t.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer', padding: '8px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={(spec as any)[t.key]}
                      disabled={t.key === 'includeAR1' && preparedPreview.years.length < 3}
                      onChange={e => setSpec(prev => ({ ...prev, [t.key]: e.target.checked }))}
                    />
                    {t.label}
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{t.desc}</span>
                </label>
              ))}
            </div>

            {/* MCMC Sampler Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>MCMC Chains</label>
                <select
                  value={spec.chains}
                  onChange={e => setSpec(s => ({ ...s, chains: Number(e.target.value) }))}
                  style={{ width: '100%', minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                >
                  <option value={2}>2 Chains</option>
                  <option value={4}>4 Chains (Standar Stan)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Warmup Iterations</label>
                <select
                  value={spec.warmup}
                  onChange={e => setSpec(s => ({ ...s, warmup: Number(e.target.value) }))}
                  style={{ width: '100%', minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                >
                  <option value={300}>300</option>
                  <option value={500}>500 (Standar)</option>
                  <option value={1000}>1000 (Ketat)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Post-Warmup Draws / Chain</label>
                <select
                  value={spec.draws}
                  onChange={e => setSpec(s => ({ ...s, draws: Number(e.target.value) }))}
                  style={{ width: '100%', minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                >
                  <option value={300}>300</option>
                  <option value={500}>500 (Standar)</option>
                  <option value={1000}>1000 (Ketat)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Credible Interval</label>
                <select
                  value={spec.ciLevel}
                  onChange={e => setSpec(s => ({ ...s, ciLevel: Number(e.target.value) }))}
                  style={{ width: '100%', minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                >
                  <option value={0.9}>90% CI</option>
                  <option value={0.95}>95% CI (Standar)</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* STEP 6: BAYESIAN ESTIMATION */}
        {currentStep === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Step 6 — Eksekusi Estimasi Bayesian MCMC</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Sampler akan menjalankan {spec.chains} rantai independen × ({spec.warmup} warmup + {spec.draws} draws), sekaligus menghitung Prior Sensitivity (3 rezim) dan Model Comparison (WAIC).
              </p>
            </div>

            <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', background: 'var(--info-bg)', border: '1px solid var(--primary)', fontSize: '13px', lineHeight: 1.55 }}>
              <strong>Transparansi Mesin Komputasi:</strong> Estimasi posterior aktual dijalankan langsung oleh <em>Native TypeScript Blocked-Gibbs/Slice MCMC Engine</em> pada API server Next.js. Skrip R (<code>cmdstanr</code>/<code>brms</code>) dan Stan (<code>.stan</code>) yang identik akan dibuat otomatis di Step 9 agar dapat direplikasi di lingkungan R/CmdStan lokal.
            </div>

            {qualityReport.hasBlockingError && (
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', color: '#ef4444', fontSize: '13px' }}>
                <strong>Estimasi diblokir oleh validasi data:</strong> Periksa Step 2 dan Step 3 terlebih dahulu.
              </div>
            )}

            {estimateError && (
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', color: '#ef4444', fontSize: '13px' }}>
                {estimateError}
              </div>
            )}

            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isEstimating || qualityReport.hasBlockingError}
                onClick={handleRunBayesianEstimation}
                style={{ minHeight: '48px', fontSize: '15px', padding: '10px 22px' }}
              >
                <Play size={16} style={{ marginRight: '8px' }} />
                {isEstimating ? 'Menjalankan Multi-Chain MCMC & Prior Sensitivity...' : 'Jalankan Estimasi Bayesian Hierarchical'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 7: MODEL DIAGNOSTICS */}
        {currentStep === 7 && fitResult && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Step 7 — Diagnostik Konvergensi MCMC & Posterior Predictive Check</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Memverifikasi R-hat (≤ 1.05), Effective Sample Size (ESS), Monte Carlo Standard Error (MCSE), Trace Plot, dan PPC.
              </p>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                background: fitResult.diagnostics.isConverged ? 'var(--info-bg)' : 'var(--danger-bg)',
                border: `1.5px solid ${fitResult.diagnostics.isConverged ? 'var(--primary)' : '#ef4444'}`,
                fontSize: '13px'
              }}
            >
              <strong>Status Konvergensi: {fitResult.diagnostics.convergenceStatusLabel}</strong>
              <div style={{ marginTop: '4px' }}>{fitResult.diagnostics.convergenceMessages.join(' ')}</div>
              {fitResult.diagnostics.ar1SkippedReason && (
                <div style={{ marginTop: '4px', color: '#f59e0b' }}>{fitResult.diagnostics.ar1SkippedReason}</div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {[
                { label: 'Max Split R-hat', val: fitResult.diagnostics.maxRHat.toFixed(4) },
                { label: 'Min Bulk ESS', val: fitResult.diagnostics.minEssBulk },
                { label: 'Min Tail ESS', val: fitResult.diagnostics.minEssTail },
                { label: 'Max MCSE / SD', val: `${(fitResult.diagnostics.maxMcseRatio * 100).toFixed(2)}%` },
                { label: 'PPC p-value (Mean)', val: fitResult.ppc.bayesianPValueMean.toFixed(3) },
                { label: 'PPC p-value (SD)', val: fitResult.ppc.bayesianPValueSd.toFixed(3) }
              ].map(card => (
                <div key={card.label} style={{ padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>{card.label}</div>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>{card.val}</div>
                </div>
              ))}
            </div>

            <PanelLatentDiagnosticPlots result={fitResult} />
          </>
        )}

        {/* STEP 8: MODEL EVALUATION & PRIOR SENSITIVITY */}
        {currentStep === 8 && fitResult && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Step 8 — Evaluasi Model, Audit Identifikasi & Sensitivitas Prior</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Evaluasi stabilitas parameter terhadap perubahan prior, perbandingan WAIC antar spesifikasi, dan pemeriksaan conditional independence.
              </p>
            </div>

            {/* Identification Audit Banner */}
            <div
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                background: fitResult.identificationAudit.status === 'teridentifikasi' ? 'var(--surface-muted)' : 'var(--warn-bg)',
                border: `1px solid ${fitResult.identificationAudit.status === 'teridentifikasi' ? 'var(--border)' : 'var(--warn-border)'}`,
                fontSize: '13px',
                lineHeight: 1.5
              }}
            >
              <strong>Status Identifikasi Model: {fitResult.identificationAudit.status.toUpperCase()}</strong>
              <div>{fitResult.interpretations.methodologyAndIdentificationNote}</div>
              {fitResult.identificationAudit.warnings.length > 0 && (
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {fitResult.identificationAudit.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>

            {/* Prior Sensitivity Table */}
            <div>
              <strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>Prior Sensitivity Analysis (3 Rezim Prior)</strong>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)' }}>
                      {['Rezim Prior', 'λ X1', 'λ X2', 'λ X3', 'σ_ε X1', 'σ_ε X2', 'σ_ε X3', 'Rata-Rata Y*', 'Shift Maks (%)'].map(h => (
                        <th key={h} style={{ padding: '8px', textAlign: h === 'Rezim Prior' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fitResult.sensitivity.map(s => (
                      <tr key={s.regime}>
                        <td style={{ padding: '8px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{s.regimeLabel}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{s.loadingMeans.X1.toFixed(3)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{s.loadingMeans.X2.toFixed(3)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{s.loadingMeans.X3.toFixed(3)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{s.errorSdMeans.X1.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{s.errorSdMeans.X2.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{s.errorSdMeans.X3.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{s.latentGrandMean.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{s.maxRelativeShiftPct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Alternative Specification Comparison */}
            <div>
              <strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>Perbandingan Spesifikasi Model (WAIC & RMSE)</strong>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)' }}>
                      {['Spesifikasi Model', 'Likelihood', 'AR(1)', 'WAIC (Lebih Kecil Lebih Baik)', 'RMSE', 'Max R-hat', 'Min ESS'].map(h => (
                        <th key={h} style={{ padding: '8px', textAlign: h === 'Spesifikasi Model' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fitResult.modelComparison.map(m => (
                      <tr key={m.id}>
                        <td style={{ padding: '8px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{m.specLabel}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{m.likelihood}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{m.includeAR1 ? 'Ya' : 'Tidak'}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{m.waic.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{m.rmseOverall.toFixed(3)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{m.maxRHat.toFixed(4)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{m.minESS}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* STEP 9: FINAL RESULTS, STATA TABLES, VISUALIZATIONS, INTERPRETATION & CODE */}
        {currentStep === 9 && fitResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Step 9 — Hasil Akhir, Tabel Gaya Stata, Visualisasi & Reproducible Code</h3>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  Mesin Komputasi: {fitResult.engineAttribution}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" style={{ minHeight: '40px', fontSize: '12.5px' }} disabled={isExporting !== null} onClick={() => handleExportBinary('pdf')}>
                  <Download size={14} style={{ marginRight: '5px' }} /> {isExporting === 'pdf' ? 'Menyusun PDF...' : 'Export PDF'}
                </button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '40px', fontSize: '12.5px' }} disabled={isExporting !== null} onClick={() => handleExportBinary('docx')}>
                  <FileText size={14} style={{ marginRight: '5px' }} /> {isExporting === 'docx' ? 'Menyusun Word...' : 'Word (.docx)'}
                </button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '40px', fontSize: '12.5px' }} disabled={isExporting !== null} onClick={() => handleExportBinary('xlsx')}>
                  <FileSpreadsheet size={14} style={{ marginRight: '5px' }} /> {isExporting === 'xlsx' ? 'Menyusun Excel...' : 'Export Excel'}
                </button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '40px', fontSize: '12.5px' }} onClick={handleExportCSV}>
                  <Download size={14} style={{ marginRight: '5px' }} /> CSV Laten
                </button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '40px', fontSize: '12.5px' }} onClick={() => window.print()}>
                  <Printer size={14} style={{ marginRight: '5px' }} /> Cetak
                </button>
              </div>
            </div>

            {/* Sub-Tabs */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              {[
                { id: 'stata', label: 'Tabel Gaya Stata (8.1–8.3)' },
                { id: 'visuals', label: 'Visualisasi Interaktif (9 Grafik)' },
                { id: 'interpret', label: 'Interpretasi & Kesimpulan Akademis' },
                { id: 'code', label: 'Stan & R Code Reproduksi' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setResultSubTab(t.id as any)}
                  style={{
                    minHeight: '40px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: resultSubTab === t.id ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                    background: resultSubTab === t.id ? 'var(--info-bg)' : 'var(--surface-muted)',
                    color: resultSubTab === t.id ? 'var(--primary)' : 'var(--text)',
                    fontWeight: resultSubTab === t.id ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {resultSubTab === 'stata' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <pre style={{ margin: 0, padding: '14px', borderRadius: 'var(--radius-sm)', background: '#0b1220', color: '#e2e8f0', fontSize: '12px', overflowX: 'auto', lineHeight: 1.5 }}>
                  {`${fitResult.stataOutput.headerConsoleText}\n\n${fitResult.stataOutput.parameterTableText}`}
                </pre>

                <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '13px', lineHeight: 1.55 }}>
                  <strong>Interpretasi Estimasi Parameter:</strong> {fitResult.interpretations.parameterInterpretation}
                </div>

                {/* Source Reliability Table */}
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: '14.5px', fontWeight: 800 }}>Tabel 8.2 Perbandingan Reliabilitas & Bias Relatif Ketiga Sumber</h4>
                  <pre style={{ margin: 0, padding: '14px', borderRadius: 'var(--radius-sm)', background: '#0b1220', color: '#e2e8f0', fontSize: '12px', overflowX: 'auto', lineHeight: 1.5 }}>
                    {fitResult.stataOutput.reliabilityTableText}
                  </pre>
                  <div style={{ marginTop: '8px', padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '13px', lineHeight: 1.55 }}>
                    <strong>Evaluasi Reliabilitas:</strong> {fitResult.interpretations.reliabilityInterpretation}
                  </div>
                </div>

                {/* Latent Emission Estimation Full Table */}
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: '14.5px', fontWeight: 800 }}>Tabel 8.3 Estimasi Emisi CO₂ Laten (Y*) per Kota dan Tahun</h4>
                  <div style={{ maxHeight: '360px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-muted)' }}>
                        <tr>
                          {['City', 'Year', 'X1', 'X2', 'X3', 'Estimated Y*', '95% Cred. Interval', 'R-hat', 'ESS'].map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: h === 'City' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fitResult.latentEstimates.map((r, idx) => (
                          <tr key={`${r.city}-${r.year}-${idx}`}>
                            <td style={{ padding: '7px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{r.city}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.year}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.x1 === null ? 'NA' : r.x1.toFixed(2)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.x2 === null ? 'NA' : r.x2.toFixed(2)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.x3 === null ? 'NA' : r.x3.toFixed(2)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>{r.latentMean.toFixed(2)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>[{r.ciLower.toFixed(2)}, {r.ciUpper.toFixed(2)}]</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.rHat.toFixed(3)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.ess}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {resultSubTab === 'visuals' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <PanelLatentEDACharts
                  eda={edaResult}
                  unitLabel={fitResult.scaleContext.workingUnitNote}
                  labels={{ X1: mapping.x1Label, X2: mapping.x2Label, X3: mapping.x3Label }}
                />
                <PanelLatentDiagnosticPlots result={fitResult} />
                <PanelLatentFullVisualizations result={fitResult} />
              </div>
            )}

            {resultSubTab === 'interpret' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px', lineHeight: 1.65 }}>
                {[
                  { title: '1. Interpretasi Estimasi Parameter', text: fitResult.interpretations.parameterInterpretation },
                  { title: '2. Interpretasi Reliabilitas & Bias Relatif Sumber', text: fitResult.interpretations.reliabilityInterpretation },
                  { title: '3. Interpretasi Estimasi Emisi Laten (Y*)', text: fitResult.interpretations.latentEmissionInterpretation },
                  { title: '4. Status Konvergensi & Diagnostik MCMC', text: fitResult.interpretations.diagnosticsInterpretation },
                  { title: '5. Sensitivitas Prior & Perbandingan Model', text: fitResult.interpretations.sensitivityInterpretation },
                  { title: '6. Identifikasi & Asumsi Conditional Independence', text: fitResult.interpretations.methodologyAndIdentificationNote },
                  { title: '7. Kesimpulan Akhir Penelitian', text: fitResult.interpretations.finalConclusion }
                ].map(sec => (
                  <div key={sec.title} style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                    <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--primary)' }}>{sec.title}</strong>
                    <div>{sec.text}</div>
                  </div>
                ))}
                <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--warn-border)', background: 'var(--warn-bg)' }}>
                  <strong style={{ display: 'block', marginBottom: '6px' }}>8. Keterbatasan Penelitian</strong>
                  <ul style={{ margin: '0 0 0 18px' }}>
                    {fitResult.interpretations.researchLimitations.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {resultSubTab === 'code' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'stan', label: 'Stan Model (.stan)' },
                      { id: 'r', label: 'R Script (cmdstanr)' },
                      { id: 'brms', label: 'brms Reference (.R)' },
                      { id: 'prep', label: 'R Preprocessing' }
                    ].map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={codeTab === c.id ? 'btn btn-primary' : 'btn btn-outline'}
                        style={{ minHeight: '38px', fontSize: '12.5px' }}
                        onClick={() => setCodeTab(c.id as any)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" className="btn btn-outline" style={{ minHeight: '38px', fontSize: '12.5px' }} onClick={handleCopyCode}>
                      {copiedCode ? <><Check size={14} style={{ marginRight: '5px' }} />Tersalin</> : <><Copy size={14} style={{ marginRight: '5px' }} />Copy Code</>}
                    </button>
                    <button type="button" className="btn btn-outline" style={{ minHeight: '38px', fontSize: '12.5px' }} onClick={handleDownloadCodeFile}>
                      <Download size={14} style={{ marginRight: '5px' }} />Download Code
                    </button>
                  </div>
                </div>

                <pre style={{ margin: 0, padding: '14px', borderRadius: 'var(--radius-sm)', background: '#0b1220', color: '#e2e8f0', fontSize: '12px', overflowX: 'auto', maxHeight: '460px', lineHeight: 1.5 }}>
                  {activeCodeText}
                </pre>
              </div>
            )}
          </>
        )}

        {/* Footer Step Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
          <button
            type="button"
            className="btn btn-outline"
            disabled={currentStep === 1}
            onClick={() => setCurrentStep(s => Math.max(1, s - 1))}
            style={{ minHeight: '44px' }}
          >
            <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Sebelumnya
          </button>

          {currentStep < 9 && currentStep !== 6 && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={currentStep >= 6 && !fitResult}
              onClick={() => setCurrentStep(s => Math.min(9, s + 1))}
              style={{ minHeight: '44px' }}
            >
              Lanjut ke Step {currentStep + 1} <ArrowRight size={16} style={{ marginLeft: '6px' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

