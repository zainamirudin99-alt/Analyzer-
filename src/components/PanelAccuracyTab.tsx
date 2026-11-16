'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  Link2,
  Play,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { computeAccuracyEDA } from '@/lib/panel-accuracy-correlation';
import { generatePanelAccuracyCSV } from '@/lib/panel-accuracy-export-xlsx';
import {
   evaluateAccuracyPreprocessingRecommendations,
  executePanelAccuracyPipeline
} from '@/lib/panel-accuracy-orchestrator';
import { preparePanelAccuracyObservations } from '@/lib/panel-accuracy-preprocessing';
import {
  AccuracyPreprocessingOptions,
  MeasurementSource,
  PanelAccuracyFitResult,
  PanelDataset,
  PreprocessingRecommendationBundle,
  PreprocessingScenarioCandidate
} from '@/lib/panel-accuracy-types';
import {
  autoDetectAccuracyDatasetConfig,
  DEFAULT_ACCURACY_PREPROCESSING,
  generateMultiSourceCO2PresetDataset,
  parsePastedAccuracyData,
  validatePanelAccuracyDataset
} from '@/lib/panel-accuracy-validation';
import {
  PanelAccuracyBlandAltmanChart,
  PanelAccuracyEDACharts,
  PanelAccuracyFullVisualizations
} from './PanelAccuracyCharts';

const ACCURACY_STEPS = [
  { id: 1, short: '1. Upload', title: 'Step 1 — Data Upload' },
  { id: 2, short: '2. Mapping & Ref', title: 'Step 2 — Data Mapping & Reference Selection' },
  { id: 3, short: '3. Audit & Prep', title: 'Step 3 — Data Quality Audit & Preprocessing' },
  { id: 4, short: '4. EDA', title: 'Step 4 — Exploratory Data Analysis' },
  { id: 5, short: '5. Accuracy', title: 'Step 5 — Measurement Error & Accuracy Assessment' },
  { id: 6, short: '6. Pair FE', title: 'Step 6 — Panel Fixed Effects Inferential Comparison' },
  { id: 7, short: '7. Diagnostics', title: 'Step 7 — Statistical Diagnostics & Inference' },
  { id: 8, short: '8. Ranking', title: 'Step 8 — Comparative Evaluation & Source Ranking' },
  { id: 9, short: '9. Final & Export', title: 'Step 9 — Final Results, Visualization, Code & Export' }
];

export const PanelAccuracyTab: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialPreset = useMemo(() => generateMultiSourceCO2PresetDataset(), []);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [sourceTab, setSourceTab] = useState<'preset' | 'upload' | 'link' | 'paste'>('preset');
  const [datasetName, setDatasetName] = useState<string>('panel_co2_multi_source_accuracy.xlsx');
  const [sheetsData, setSheetsData] = useState<any[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>(initialPreset.observations);
  const [cityIdColumn, setCityIdColumn] = useState<string>(initialPreset.cityIdColumn);
  const [yearColumn, setYearColumn] = useState<string>(initialPreset.yearColumn);
  const [sources, setSources] = useState<MeasurementSource[]>(initialPreset.sources);
  const [preprocessing, setPreprocessing] = useState<AccuracyPreprocessingOptions>(DEFAULT_ACCURACY_PREPROCESSING);

  const [sheetsUrl, setSheetsUrl] = useState<string>('');
  const [pasteText, setPasteText] = useState<string>(
    'City\tYear\tSelf_Reporting\tSatellite\tField_Sensor\tAlt_Satellite\nJakarta\t2021\t1240\t1295\t1270\t1276\nJakarta\t2022\t1280\t1340\t1315\t1321\nSurabaya\t2021\t910\t965\t945\t950\nSurabaya\t2022\t940\t990\t972\t977\nBandung\t2021\t720\t775\t755\t760\nBandung\t2022\t750\t805\t782\t788'
  );
  const [isLoadingSource, setIsLoadingSource] = useState<boolean>(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  // Step 3 Multi-Scenario Recommendation
  const [recommendation, setRecommendation] = useState<PreprocessingRecommendationBundle | null>(null);
  const [isRecommending, setIsRecommending] = useState<boolean>(false);
  const [showAllScenarios, setShowAllScenarios] = useState<boolean>(true);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  // Step 6-9 Server / Live Analysis State
  const [isRunningFit, setIsRunningFit] = useState<boolean>(false);
  const [fitError, setFitError] = useState<string | null>(null);
  const [serverFitResult, setServerFitResult] = useState<PanelAccuracyFitResult | null>(null);

  // Step 9 Sub-tabs & Export
  const [resultSubTab, setResultSubTab] = useState<'stata' | 'visuals' | 'interpret' | 'code'>('stata');
  const [codeTab, setCodeTab] = useState<'stata' | 'r'>('stata');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const columns = useMemo(
    () => (rawRows.length > 0 ? Object.keys(rawRows[0]).filter(Boolean) : []),
    [rawRows]
  );

  const panelDataset: PanelDataset = useMemo(
    () => ({
      cityIdColumn,
      yearColumn,
      sources,
      observations: rawRows
    }),
    [cityIdColumn, yearColumn, sources, rawRows]
  );

  const qualityReport = useMemo(
    () => validatePanelAccuracyDataset(panelDataset, preprocessing),
    [panelDataset, preprocessing]
  );

  // Reactive live analysis result (automatically updates when Reference Source, Sources, or Preprocessing changes)
  const liveFitResult = useMemo<PanelAccuracyFitResult | null>(() => {
    if (qualityReport.hasBlockingError) return null;
    try {
      return executePanelAccuracyPipeline({
        dataset: panelDataset,
        preprocessing,
        bootstrapReplications: 499
      });
    } catch {
      return null;
    }
  }, [panelDataset, preprocessing, qualityReport.hasBlockingError]);

  const activeResult = serverFitResult || liveFitResult;

  const preparedPreview = useMemo(() => {
    try {
      return preparePanelAccuracyObservations(panelDataset, preprocessing);
    } catch {
      return null;
    }
  }, [panelDataset, preprocessing]);

  const edaResult = useMemo(() => {
    if (activeResult) return activeResult.eda;
    if (!preparedPreview) return null;
    return computeAccuracyEDA(preparedPreview.completeCaseObservations, sources);
  }, [activeResult, preparedPreview, sources]);

  const applyNewDataset = (
    name: string,
    rows: Record<string, unknown>[],
    sheetList: any[] = [],
    sheetName = '',
    presetConfig?: { cityIdColumn: string; yearColumn: string; sources: MeasurementSource[] }
  ) => {
    setDatasetName(name);
    setRawRows(rows);
    setSheetsData(sheetList);
    setSelectedSheet(sheetName);
    if (presetConfig) {
      setCityIdColumn(presetConfig.cityIdColumn);
      setYearColumn(presetConfig.yearColumn);
      setSources(presetConfig.sources);
    } else if (rows.length > 0) {
      const detected = autoDetectAccuracyDatasetConfig(Object.keys(rows[0]), rows);
      setCityIdColumn(detected.cityIdColumn);
      setYearColumn(detected.yearColumn);
      setSources(detected.sources);
    }
    setServerFitResult(null);
    setSourceError(null);
    setRecommendation(null);
    setAppliedNotice(null);
  };

  const handleLoadPreset = () => {
    setSourceTab('preset');
    const p = generateMultiSourceCO2PresetDataset();
    applyNewDataset('panel_co2_multi_source_accuracy.xlsx', p.observations, [], '', p);
  };

  const handleFileUpload = async (file: File) => {
    setIsLoadingSource(true);
    setSourceError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/regression/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal membaca berkas.');
      const sheets = json.data?.sheets || [];
      if (sheets.length === 0) throw new Error('Berkas spreadsheet kosong.');
      const first = sheets[0];
      const rows = first.allRows || first.previewRows || [];
      applyNewDataset(json.data.fileName || file.name, rows, sheets, first.sheetName);
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
      applyNewDataset(json.data.fileName || 'Google_Sheets_Panel.xlsx', rows, sheets, first.sheetName);
    } catch (err: any) {
      setSourceError(err.message || 'Gagal mengimpor Google Sheets.');
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleApplyPaste = () => {
    const parsed = parsePastedAccuracyData(pasteText);
    if (parsed.error || parsed.rows.length === 0) {
      setSourceError(parsed.error || 'Data paste tidak valid.');
      return;
    }
    applyNewDataset('data_paste_panel_accuracy.csv', parsed.rows);
  };

  // Dynamic Source Management in Step 2
  const handleSelectReferenceSource = (targetId: string) => {
    setSources(prev =>
      prev.map(s => ({
        ...s,
        role: s.id === targetId ? 'reference' : 'comparison'
      }))
    );
    setServerFitResult(null);
  };

  const handleUpdateSourceField = (
    id: string,
    field: keyof MeasurementSource,
    value: string
  ) => {
    setSources(prev =>
      prev.map(s => (s.id === id ? { ...s, [field]: value } : s))
    );
    setServerFitResult(null);
  };

  const handleAddSource = () => {
    const usedCols = new Set([cityIdColumn, yearColumn, ...sources.map(s => s.columnKey)]);
    const nextCol = columns.find(c => !usedCols.has(c)) || columns[0] || '';
    const nextNum = sources.length + 1;
    const newSource: MeasurementSource = {
      id: `src_${Date.now()}_${nextNum}`,
      name: `X${nextNum}`,
      label: `Source ${nextNum}`,
      columnKey: nextCol,
      unit: sources[0]?.unit || 'kt CO₂',
      role: 'comparison',
      methodDescription: 'Sumber pengukuran pembanding tambahan.'
    };
    setSources(prev => [...prev, newSource]);
    setServerFitResult(null);
  };

  const handleRemoveSource = (id: string) => {
    if (sources.length <= 2) return;
    setSources(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (!filtered.some(s => s.role === 'reference') && filtered.length > 0) {
        filtered[filtered.length - 1] = {
          ...filtered[filtered.length - 1],
          role: 'reference'
        };
      }
      return filtered;
    });
    setServerFitResult(null);
  };

  // Step 3 Multi-Scenario Evaluation
  const handleRunScenarioRecommendation = useCallback(() => {
    if (rawRows.length === 0 || sources.length < 2) return;
    setIsRecommending(true);
    try {
      const rec = evaluateAccuracyPreprocessingRecommendations({
        dataset: panelDataset,
        allowNegativeValues: preprocessing.allowNegativeValues
      });
      setRecommendation(rec);
    } catch {
      // ignore if dataset incomplete
    } finally {
      setIsRecommending(false);
    }
  }, [rawRows.length, sources.length, panelDataset, preprocessing.allowNegativeValues]);

  useEffect(() => {
    if (currentStep === 3 && !recommendation && !isRecommending) {
      handleRunScenarioRecommendation();
    }
  }, [currentStep, recommendation, isRecommending, handleRunScenarioRecommendation]);

  const handleApplyPreprocessingScenario = (sc: PreprocessingScenarioCandidate) => {
    setPreprocessing({ ...sc.options });
    setServerFitResult(null);
    setAppliedNotice(`Konfigurasi "${sc.label}" diterapkan pada Step 3.`);
  };

  // Full API execution (999 Wild Cluster Bootstrap replications)
  const handleRunServerPipeline = async () => {
    setIsRunningFit(true);
    setFitError(null);
    try {
      const res = await fetch('/api/panel-accuracy/fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: panelDataset,
          preprocessing
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Gagal menjalankan analisis di server.');
      }
      setServerFitResult(json.data);
    } catch (err: any) {
      setFitError(err.message || 'Gagal menjalankan pipeline analisis.');
    } finally {
      setIsRunningFit(false);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportBinary = async (format: 'pdf' | 'docx' | 'xlsx') => {
    if (!activeResult) return;
    setIsExporting(format);
    try {
      const res = await fetch(`/api/panel-accuracy/export-${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: activeResult, datasetName })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Gagal mengekspor ${format.toUpperCase()}`);
      }
      const blob = await res.blob();
      triggerDownload(blob, `Laporan_Komparasi_Akurasi_Panel_CO2.${format}`);
    } catch (err: any) {
      setFitError(err.message || 'Gagal mengunduh laporan.');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportCSV = () => {
    if (!activeResult) return;
    const csv = generatePanelAccuracyCSV(activeResult);
    triggerDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      'Metrik_Akurasi_Pengukuran_Panel_CO2.csv'
    );
  };

  const activeCodeText = useMemo(() => {
    if (!activeResult) return '';
    return codeTab === 'stata'
      ? activeResult.generatedCode.stataDoFile
      : activeResult.generatedCode.rScript;
  }, [activeResult, codeTab]);

  const handleCopyCode = async () => {
    if (!activeCodeText) return;
    await navigator.clipboard.writeText(activeCodeText);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleDownloadCode = () => {
    if (!activeCodeText) return;
    const fname =
      codeTab === 'stata'
        ? 'panel_comparative_accuracy.do'
        : 'panel_comparative_accuracy.R';
    triggerDownload(new Blob([activeCodeText], { type: 'text/plain;charset=utf-8' }), fname);
  };

  const refSource = sources.find(s => s.role === 'reference');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '28px' }}>
      {/* Horizontal 9-Step Stepper */}
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
        {ACCURACY_STEPS.map(s => {
          const active = currentStep === s.id;
          const reachable = s.id <= 4 || !qualityReport.hasBlockingError;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && setCurrentStep(s.id)}
              style={{
                minHeight: '42px',
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
              {s.short}
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
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 1 — Data Upload Multi-Sumber Pengukuran Emisi CO₂
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Unggah berkas Excel/CSV, impor dari Google Sheets, tempel (paste) tabel, atau gunakan Dataset Preset 4 Sumber CO₂ Kota-Tahun.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['preset', 'upload', 'link', 'paste'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    className={sourceTab === tab ? 'btn btn-primary' : 'btn btn-outline'}
                    style={{ minHeight: '42px', fontSize: '12.5px' }}
                    onClick={() => (tab === 'preset' ? handleLoadPreset() : setSourceTab(tab))}
                  >
                    {tab === 'preset' && <><Sparkles size={14} style={{ marginRight: '6px' }} />Preset 4 Sumber CO₂</>}
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
                        if (target) applyNewDataset(datasetName, target.allRows || target.previewRows || [], sheetsData, target.sheetName);
                      }}
                      style={{ minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    >
                      {sheetsData.map(s => (
                        <option key={s.sheetName} value={s.sheetName}>
                          {s.sheetName} ({s.rowCount} baris)
                        </option>
                      ))}
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
                  placeholder="Tempel tabel dari Excel atau CSV (baris pertama = nama kolom)..."
                  style={{ width: '100%', fontSize: '13px', fontFamily: 'monospace', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                />
                <div>
                  <button type="button" className="btn btn-primary" onClick={handleApplyPaste} style={{ minHeight: '44px' }}>
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
                { label: 'Total Baris', val: qualityReport.nObsRaw },
                { label: 'Pasangan Lengkap (CC)', val: qualityReport.nCompleteCasePairs },
                { label: 'Jumlah Kota (G)', val: qualityReport.nCities },
                { label: 'Rentang Tahun (T)', val: qualityReport.yearMin && qualityReport.yearMax ? `${qualityReport.yearMin}–${qualityReport.yearMax} (${qualityReport.nYears})` : '-' },
                { label: 'Jumlah Sumber (J)', val: `${sources.length} Sumber` },
                { label: 'Status Panel', val: qualityReport.isBalanced ? 'Balanced' : 'Unbalanced / Parsial' }
              ].map(m => (
                <div key={m.label} style={{ padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>{m.label}</div>
                  <div style={{ fontSize: '16.5px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>{m.val}</div>
                </div>
              ))}
            </div>

            {/* Preview Table */}
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

        {/* STEP 2: DYNAMIC DATA MAPPING & REFERENCE SELECTION */}
        {currentStep === 2 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 2 — Pemetaan Variabel Dinamis & Pemilihan Sumber Referensi
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Tambahkan atau hapus sumber pengukuran (minimal 2 sumber), beri kode/label, dan pilih tepat <strong>1 Reference Source</strong> sebagai pembanding acuan.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: '44px', fontSize: '13px' }}
                  onClick={() => {
                    const detected = autoDetectAccuracyDatasetConfig(columns, rawRows);
                    setCityIdColumn(detected.cityIdColumn);
                    setYearColumn(detected.yearColumn);
                    setSources(detected.sources);
                  }}
                >
                  <RefreshCw size={14} style={{ marginRight: '6px' }} /> Deteksi Otomatis Kolom
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ minHeight: '44px', fontSize: '13px' }}
                  onClick={handleAddSource}
                >
                  <Plus size={15} style={{ marginRight: '6px' }} /> Tambah Sumber Pengukuran
                </button>
              </div>
            </div>

            {/* City & Year Identifier Selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Kolom Identitas Kota (City ID)</label>
                <select
                  value={cityIdColumn}
                  onChange={e => setCityIdColumn(e.target.value)}
                  style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                >
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Kolom Periode Tahun (Year)</label>
                <select
                  value={yearColumn}
                  onChange={e => setYearColumn(e.target.value)}
                  style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                >
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Sumber Referensi Aktif (Reference Source r)</label>
                <select
                  value={refSource?.id || ''}
                  onChange={e => handleSelectReferenceSource(e.target.value)}
                  style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--primary)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 700 }}
                >
                  {sources.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.label} ({s.columnKey})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic Sources List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sources.map((src, idx) => {
                const isRef = src.role === 'reference';
                return (
                  <div
                    key={src.id}
                    style={{
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      border: isRef ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: isRef ? 'var(--info-bg)' : 'var(--surface-muted)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            background: isRef ? 'var(--primary)' : 'var(--surface)',
                            color: isRef ? '#fff' : 'var(--text-secondary)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          {isRef ? 'REFERENCE SOURCE (r)' : `COMPARISON SOURCE #${idx + 1}`}
                        </span>
                        <strong style={{ fontSize: '14px' }}>{src.name} — {src.label}</strong>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {!isRef && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleSelectReferenceSource(src.id)}
                            style={{ minHeight: '38px', fontSize: '12px', padding: '4px 10px' }}
                          >
                            Jadikan Sumber Referensi
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={sources.length <= 2}
                          onClick={() => handleRemoveSource(src.id)}
                          title={sources.length <= 2 ? 'Minimal 2 sumber wajib dipertahankan' : 'Hapus sumber ini'}
                          style={{ minHeight: '38px', fontSize: '12px', padding: '4px 10px', color: sources.length <= 2 ? 'var(--text-muted)' : '#ef4444' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Kode Sumber</label>
                        <input
                          type="text"
                          value={src.name}
                          onChange={e => handleUpdateSourceField(src.id, 'name', e.target.value)}
                          placeholder="Mis. X1"
                          style={{ width: '100%', minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Label Sumber</label>
                        <input
                          type="text"
                          value={src.label}
                          onChange={e => handleUpdateSourceField(src.id, 'label', e.target.value)}
                          placeholder="Mis. Self-Reporting"
                          style={{ width: '100%', minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Kolom Dataset</label>
                        <select
                          value={src.columnKey}
                          onChange={e => handleUpdateSourceField(src.id, 'columnKey', e.target.value)}
                          style={{ width: '100%', minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        >
                          {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Satuan (Unit)</label>
                        <input
                          type="text"
                          value={src.unit}
                          onChange={e => handleUpdateSourceField(src.id, 'unit', e.target.value)}
                          placeholder="kt CO₂"
                          style={{ width: '100%', minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Kolom SE / Uncertainty (Opsional)</label>
                        <select
                          value={src.uncertaintyColumn || ''}
                          onChange={e => handleUpdateSourceField(src.id, 'uncertaintyColumn', e.target.value)}
                          style={{ width: '100%', minHeight: '42px', fontSize: '15px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        >
                          <option value="">Tanpa kolom SE</option>
                          {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Keterangan Metode Pengukuran / Kalibrasi / Agregasi</label>
                      <input
                        type="text"
                        value={src.methodDescription || ''}
                        onChange={e => handleUpdateSourceField(src.id, 'methodDescription', e.target.value)}
                        placeholder="Deskripsi instrumen, kalibrasi, atau cakupan..."
                        style={{ width: '100%', minHeight: '40px', fontSize: '14px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* STEP 3: DATA QUALITY AUDIT & EXPLICIT PREPROCESSING */}
        {currentStep === 3 && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                Step 3 — Audit Kualitas Data, Validitas Referensi &amp; Prapemrosesan Eksplisit
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Sistem memeriksa 10 indikator kualitas data panel dan kredibilitas sumber referensi ({refSource?.name} — {refSource?.label}). Tidak ada transformasi otomatis tanpa persetujuan eksplisit Anda.
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

            {/* Multi-Scenario Preprocessing Recommendation Panel */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--primary)',
                background: 'var(--surface-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sliders size={18} color="var(--primary)" />
                  <strong style={{ fontSize: '14.5px' }}>Rekomendasi Sistem — Evaluasi Skenario Prapemrosesan</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleRunScenarioRecommendation}
                  style={{ minHeight: '40px', fontSize: '12.5px' }}
                >
                  <RefreshCw size={14} style={{ marginRight: '6px' }} /> Evaluasi Ulang Skenario
                </button>
              </div>

              {appliedNotice && (
                <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'var(--info-bg)', border: '1px solid var(--primary)', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={15} color="var(--success)" /> {appliedNotice}
                </div>
              )}

              {recommendation && (
                <>
                  <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ flex: '1 1 280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '3px 9px', borderRadius: '999px', background: 'var(--primary)', color: '#fff', fontSize: '11.5px', fontWeight: 800 }}>
                          <ShieldCheck size={13} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />
                          REKOMENDASI UTAMA
                        </span>
                        <strong style={{ fontSize: '14px' }}>{recommendation.bestScenario.label}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {recommendation.bestScenario.rationale}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleApplyPreprocessingScenario(recommendation.bestScenario)}
                      style={{ minHeight: '42px', fontSize: '13px' }}
                    >
                      <Sparkles size={14} style={{ marginRight: '6px' }} /> Terapkan Rekomendasi
                    </button>
                  </div>

                  <div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setShowAllScenarios(v => !v)}
                      style={{ minHeight: '36px', fontSize: '12px', marginBottom: '8px' }}
                    >
                      {showAllScenarios ? <><ChevronUp size={14} style={{ marginRight: '5px' }} />Sembunyikan Tabel Skenario</> : <><ChevronDown size={14} style={{ marginRight: '5px' }} />Tampilkan Tabel Skenario</>}
                    </button>
                    {showAllScenarios && (
                      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                          <thead>
                            <tr style={{ background: 'var(--surface-muted)' }}>
                              {['Skenario', 'N (CC)', 'Sumber MAE Terbaik', 'MAE Terbaik', 'Lin CCC Terbaik', 'Shift Outlier (%)', 'Aksi'].map(h => (
                                <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Skenario' || h === 'Sumber MAE Terbaik' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {recommendation.scenarios.map(sc => (
                              <tr key={sc.id} style={{ background: sc.isRecommended ? 'var(--info-bg)' : 'transparent', borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 700 }}>{sc.label}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{sc.nCompletePairs}</td>
                                <td style={{ padding: '8px 10px' }}>{sc.bestComparisonLabel}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{sc.bestMae.toFixed(3)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{sc.bestCcc.toFixed(4)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{sc.outlierSensitivityShiftPct.toFixed(1)}%</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => handleApplyPreprocessingScenario(sc)}
                                    style={{ minHeight: '36px', fontSize: '12px', padding: '4px 10px' }}
                                  >
                                    Pilih
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Explicit Opt-In Preprocessing Checkboxes */}
            <div style={{ padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <strong style={{ fontSize: '14px' }}>Opsi Prapemrosesan (Persetujuan Eksplisit Pengguna)</strong>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', minHeight: '38px' }}>
                <input
                  type="checkbox"
                  checked={preprocessing.dropDuplicateCityYear}
                  onChange={e => setPreprocessing(p => ({ ...p, dropDuplicateCityYear: e.target.checked }))}
                />
                <span>Hapus baris duplikat (City, Year) dan pertahankan entri pertama</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', minHeight: '38px' }}>
                <input
                  type="checkbox"
                  checked={preprocessing.applyWinsorize}
                  onChange={e => setPreprocessing(p => ({ ...p, applyWinsorize: e.target.checked }))}
                />
                <span>Terapkan Winsorization 2.5% ekor bawah &amp; atas untuk meredam outlier input ekstrem</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', minHeight: '38px' }}>
                <input
                  type="checkbox"
                  checked={preprocessing.applyLog1p}
                  onChange={e => setPreprocessing(p => ({ ...p, applyLog1p: e.target.checked }))}
                />
                <span>Terapkan transformasi <code>log(1 + x)</code> pada seluruh sumber (evaluasi kesalahan relatif proporsional)</span>
              </label>
            </div>
          </>
        )}

        {/* STEP 4: EXPLORATORY DATA ANALYSIS */}
        {currentStep === 4 && edaResult && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                Step 4 — Exploratory Data Analysis &amp; Matriks Korelasi Panel
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Statistik deskriptif {sources.length} sumber serta korelasi Overall Pearson, Spearman, Within-City Demeaned, dan First-Difference.
              </p>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)' }}>
                    {['Sumber', 'Peran', 'N', 'Missing', 'Mean', 'SD', 'Median', 'IQR', 'Min', 'Max', 'CV', 'Skewness'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Sumber' || h === 'Peran' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {edaResult.descriptives.map(d => (
                    <tr key={d.sourceId} style={{ background: d.role === 'reference' ? 'var(--info-bg)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{d.sourceName} ({d.sourceLabel})</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: d.role === 'reference' ? 'var(--primary)' : 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                        {d.role === 'reference' ? 'Reference (r)' : 'Comparison'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.n}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{d.missing}</td>
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

            {/* 4 Correlation Matrices */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '12px' }}>
              {[
                { title: '1. Overall Pearson Correlation', mat: edaResult.overallPearson },
                { title: '2. Overall Spearman Rank Correlation', mat: edaResult.overallSpearman },
                { title: '3. Within-City Demeaned Correlation', mat: edaResult.withinCityPearson },
                { title: '4. First-Difference (ΔX_t) Correlation', mat: edaResult.firstDiffPearson }
              ].map(tbl => (
                <div key={tbl.title} style={{ padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', overflowX: 'auto' }}>
                  <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>{tbl.title}</strong>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '5px' }}></th>
                        {edaResult.sourceNames.map(n => <th key={n} style={{ padding: '5px' }}>{n}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {edaResult.sourceNames.map((rName, rIdx) => (
                        <tr key={rName}>
                          <td style={{ fontWeight: 700, padding: '5px' }}>{rName}</td>
                          {tbl.mat[rIdx].map((v, cIdx) => (
                            <td key={cIdx} style={{ padding: '5px', border: '1px solid var(--border-light)' }}>{v.toFixed(3)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <PanelAccuracyEDACharts
              eda={edaResult}
              sources={sources}
              unitLabel={activeResult?.datasetMeta.workingUnitNote || refSource?.unit || 'kt CO₂'}
            />
          </>
        )}

        {/* STEP 5: MEASUREMENT ERROR & ACCURACY ASSESSMENT */}
        {currentStep === 5 && activeResult && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                Step 5 — Measurement Error, Lin&apos;s CCC &amp; Bland-Altman Agreement Assessment
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Perbandingan terhadap Sumber Referensi <strong>{activeResult.referenceSource.name} ({activeResult.referenceSource.label})</strong> pada sampel berpasangan Complete-Case (N = {activeResult.datasetMeta.nCompletePairs}).
              </p>
            </div>

            {/* Primary Complete-Case Accuracy Table */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)' }}>
                    {['Comparison Source', 'N (CC / Avail)', 'MAE [95% Cluster CI]', 'RMSE [95% CI]', 'MBE (Bias)', 'MBE p-val', 'Pearson r', 'Within-City r', 'Lin CCC [95% CI]', 'Cb (Bias Corr)'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Comparison Source' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeResult.metrics.map(m => (
                    <tr key={m.sourceId}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{m.sourceLabel}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {m.nCompleteCase} / {m.nAvailableCase}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>
                        {m.mae.toFixed(3)} [{m.maeCiLower.toFixed(2)}, {m.maeCiUpper.toFixed(2)}]
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {m.rmse.toFixed(3)} [{m.rmseCiLower.toFixed(2)}, {m.rmseCiUpper.toFixed(2)}]
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {m.mbe >= 0 ? `+${m.mbe.toFixed(3)}` : m.mbe.toFixed(3)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{m.mbePValue.toFixed(4)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{m.pearsonR.toFixed(4)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{m.withinCityR.toFixed(4)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>
                        {m.ccc.ccc.toFixed(4)} [{m.ccc.ciLower.toFixed(3)}, {m.ccc.ciUpper.toFixed(3)}]
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{m.ccc.biasCorrectionFactorCb.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Separate Available-Case Table when N differs */}
            <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
              <strong style={{ fontSize: '13.5px', display: 'block', marginBottom: '6px' }}>
                Perbandingan Terpisah: Source-Specific Available-Case vs Complete-Case
              </strong>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['Sumber Pembanding', 'N Complete-Case', 'MAE (Complete-Case)', 'N Available-Case', 'MAE (Available-Case)', 'RMSE (Available-Case)', 'MBE (Available-Case)', 'Lin CCC (Available-Case)'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Sumber Pembanding' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeResult.metrics.map(m => (
                      <tr key={m.sourceId}>
                        <td style={{ padding: '6px 8px', fontWeight: 700 }}>{m.sourceLabel}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.nCompleteCase}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.mae.toFixed(3)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: m.missingGapVsComplete > 0 ? 800 : 400 }}>{m.availableCase.n}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.availableCase.mae.toFixed(3)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.availableCase.rmse.toFixed(3)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.availableCase.mbe.toFixed(3)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.availableCase.ccc.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <PanelAccuracyBlandAltmanChart
              metrics={activeResult.metrics}
              referenceLabel={`${activeResult.referenceSource.name} (${activeResult.referenceSource.label})`}
              unitLabel={activeResult.datasetMeta.workingUnitNote}
            />
          </>
        )}

        {/* STEP 6: PANEL FIXED EFFECTS INFERENTIAL COMPARISON */}
        {currentStep === 6 && activeResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 6 — Model Inferensial Panel: Pair Fixed Effects &amp; Wild Cluster Bootstrap
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Persamaan: <code>AE_ijt = α_it + Σ β_j Source_j + ε_ijt</code> dengan menyerap {activeResult.pairFixedEffects.nCompletePairs} efek tetap pasangan Kota-Tahun (α_it) dan mengelompokkan standar error pada {activeResult.pairFixedEffects.nClustersCity} klaster kota.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isRunningFit}
                onClick={handleRunServerPipeline}
                style={{ minHeight: '44px', fontSize: '13px' }}
              >
                <Play size={15} style={{ marginRight: '6px' }} />
                {isRunningFit ? 'Menjalankan 999 Wild Bootstrap...' : 'Verifikasi Penuh Server (999 Replikasi Bootstrap)'}
              </button>
            </div>

            {fitError && (
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', color: '#ef4444', fontSize: '13px' }}>
                {fitError}
              </div>
            )}

            {activeResult.pairFixedEffects.smallClusterWarning && (
              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', fontSize: '13px', lineHeight: 1.5 }}>
                <strong>Peringatan Small Cluster (G = {activeResult.pairFixedEffects.nClustersCity} &lt; 30):</strong>{' '}
                Karena jumlah kota di bawah 30, standar error klaster asimtotik berisiko mengalami <em>downward bias</em>. Sistem secara otomatis menyediakan <strong>Rademacher Wild Cluster Bootstrap ({activeResult.pairFixedEffects.bootstrapReplications} replikasi)</strong> untuk p-value dan interval kepercayaan yang tahan sampel kecil.
              </div>
            )}

            {/* Pair Fixed Effects Coefficients Table */}
            <div>
              <strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                Tabel Estimasi Pair Fixed Effects (Kategori Acuan: {activeResult.pairFixedEffects.baselineComparisonSourceLabel})
              </strong>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)' }}>
                      {['Sumber Pembanding', 'Mean AE (MAE)', 'Koefisien β (vs Acuan)', 'City Cluster SE', 't-stat', 'Cluster p-value', '95% Cluster CI', 'Wild Bootstrap p-val'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Sumber Pembanding' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeResult.pairFixedEffects.coefficients.map(c => (
                      <tr key={c.sourceId} style={{ background: c.isBaselineComparison ? 'var(--surface-muted)' : 'transparent' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>
                          {c.sourceLabel} {c.isBaselineComparison ? '(Kategori Acuan)' : ''}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{c.meanAe.toFixed(3)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                          {c.isBaselineComparison ? '0.000 (Ref)' : c.betaDiffVsBaseline.toFixed(3)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{c.seCluster.toFixed(3)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                          {c.isBaselineComparison ? '-' : c.tStat.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                          {c.isBaselineComparison ? '-' : c.pValue.toFixed(4)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                          [{c.ciLower.toFixed(3)}, {c.ciUpper.toFixed(3)}]
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>
                          {c.wildBootstrapPValue !== undefined ? c.wildBootstrapPValue.toFixed(4) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* All Pairwise Contrasts Table */}
            {activeResult.pairFixedEffects.pairwiseContrasts.length > 0 && (
              <div>
                <strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                  Kontras Berpasangan Seluruh Sumber Pembanding (ΔMAE = MAE_A − MAE_B)
                </strong>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-muted)' }}>
                        {['Pasangan Kontras (A vs B)', 'MAE A', 'MAE B', 'ΔMAE (A − B)', 'Cluster SE', 't-stat', 'Cluster p', 'Wild Bootstrap p', 'Wild 95% CI', 'Keputusan (α=0.05)'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Pasangan Kontras (A vs B)' || h === 'Keputusan (α=0.05)' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeResult.pairFixedEffects.pairwiseContrasts.map((c, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>
                            {c.sourceALabel} vs {c.sourceBLabel}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{c.maeA.toFixed(3)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{c.maeB.toFixed(3)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{c.diffAminusB.toFixed(3)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{c.seCluster.toFixed(3)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{c.tStat.toFixed(2)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{c.pValueCluster.toFixed(4)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>
                            {c.wildBootstrapPValue.toFixed(4)}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                            [{c.wildBootstrapCiLower.toFixed(2)}, {c.wildBootstrapCiUpper.toFixed(2)}]
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)', fontWeight: 700, color: c.isSignificant05 ? 'var(--success)' : 'var(--text-secondary)' }}>
                            {c.isSignificant05 ? `Berbeda Signifikan (${c.diffAminusB < 0 ? c.sourceALabel : c.sourceBLabel} Lebih Akurat)` : 'Tidak Berbeda Signifikan'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* STEP 7: STATISTICAL DIAGNOSTICS & INFERENCE */}
        {currentStep === 7 && activeResult && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                Step 7 — Diagnostik Statistik, Sensitivitas Outlier &amp; Keterbatasan Inferensi
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Pemeriksaan heteroskedastisitas antarsumber, korelasi serial dalam-kota, ketergantungan lintas-kota (Pesaran CD), jumlah klaster, sensitivitas outlier, serta sifat distribusi residual.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '12px' }}>
              {[
                activeResult.diagnostics.heteroskedasticityTest,
                activeResult.diagnostics.serialCorrelationTest,
                activeResult.diagnostics.crossSectionalDependenceTest
              ].map(d => (
                <div
                  key={d.testName}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${d.status === 'warning' ? 'var(--warn-border)' : 'var(--border)'}`,
                    background: d.status === 'warning' ? 'var(--warn-bg)' : 'var(--surface-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <strong style={{ fontSize: '13.5px' }}>{d.testName}</strong>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>
                    {d.statisticLabel} = {d.statisticValue.toFixed(3)} ({d.dfLabel}) | p = {(d.pValue ?? 1).toFixed(4)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{d.conclusion}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{d.implication}</div>
                </div>
              ))}
            </div>

            {/* Outlier Sensitivity Table */}
            <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
              <strong style={{ fontSize: '14px', display: 'block', marginBottom: '6px' }}>
                Audit Sensitivitas Outlier (Full Sample MAE vs 95% Trimmed MAE)
              </strong>
              <p style={{ margin: '0 0 8px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                {activeResult.diagnostics.outlierSensitivityAudit.summary}
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr>
                      {['Sumber Pembanding', 'MAE Penuh (100%)', 'Peringkat Penuh', 'MAE Trimmed (95%)', 'Peringkat Trimmed', 'Perubahan (%)'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Sumber Pembanding' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeResult.diagnostics.outlierSensitivityAudit.entries.map(e => (
                      <tr key={e.sourceId}>
                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>{e.sourceLabel}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{e.maeFull.toFixed(3)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>#{e.rankFull}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{e.maeTrimmed95.toFixed(3)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>#{e.rankTrimmed95}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{e.shiftPct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Normality & CLT Proportional Explanation */}
            <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--info-bg)', fontSize: '13px', lineHeight: 1.55 }}>
              <strong>Penjelasan Proporsional Normalitas &amp; Central Limit Theorem (CLT):</strong>{' '}
              {activeResult.diagnostics.normalityAndCltNote.explanation}
            </div>
          </>
        )}

        {/* STEP 8: COMPARATIVE EVALUATION & SOURCE RANKING */}
        {currentStep === 8 && activeResult && (
          <>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                Step 8 — Evaluasi Komparatif &amp; Pemeringkatan Sumber Pembanding
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Diurutkan berdasarkan <strong>MAE sebagai metrik utama</strong>, didukung RMSE, |MBE|, Lin&apos;s CCC, dan uji signifikansi Pair Fixed Effects (tanpa composite score artifisial).
              </p>
            </div>

            {/* Ranking Decision Banner */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                border: `2px solid ${activeResult.ranking.isConclusive ? 'var(--success)' : '#f59e0b'}`,
                background: activeResult.ranking.isConclusive ? 'var(--info-bg)' : 'var(--warn-bg)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: activeResult.ranking.isConclusive ? 'var(--success)' : '#f59e0b',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 800
                  }}
                >
                  STATUS: {activeResult.ranking.conclusivenessStatus}
                </span>
                <strong style={{ fontSize: '15px' }}>
                  {activeResult.ranking.bestSourceLabel
                    ? `Sumber Pembanding Terbaik Relatif terhadap ${activeResult.ranking.referenceSourceLabel}: ${activeResult.ranking.bestSourceLabel}`
                    : 'Belum Terdapat Bukti Statistik yang Cukup untuk Menetapkan Satu Sumber Terbaik Secara Mutlak'}
                </strong>
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.55 }}>{activeResult.ranking.rankingSummary}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <strong>Catatan Metodologis:</strong> {activeResult.ranking.methodologicalCaveat}
              </div>
            </div>

            {/* Ranking Table */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)' }}>
                    {['Peringkat', 'Sumber Pembanding', 'MAE (Utama)', 'RMSE', 'MBE', 'Lin CCC', 'Lebar 95% LoA', 'ΔMAE vs #1', 'Cluster p vs #1', 'WildBoot p vs #1', 'Keterangan Evaluasi'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Sumber Pembanding' || h === 'Keterangan Evaluasi' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeResult.ranking.ranks.map(r => (
                    <tr key={r.sourceId} style={{ background: r.rank === 1 ? 'var(--info-bg)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, borderBottom: '1px solid var(--border-light)' }}>#{r.rank}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{r.sourceLabel}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>{r.mae.toFixed(3)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.rmse.toFixed(3)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.mbe.toFixed(3)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.ccc.toFixed(4)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{r.loaWidth.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {r.rank === 1 ? '0.000' : `+${r.diffFromTopMae.toFixed(3)}`}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {r.pValueVsTopCluster !== null ? r.pValueVsTopCluster.toFixed(4) : '-'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>
                        {r.pValueVsTopWildBootstrap !== null ? r.pValueVsTopWildBootstrap.toFixed(4) : '-'}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>{r.rankNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* STEP 9: FINAL RESULTS, VISUALIZATIONS, STATA/R CODE & EXPORT */}
        {currentStep === 9 && activeResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 9 — Hasil Akhir, Tabel Gaya Stata, Visualisasi, Kode Stata/R &amp; Ekspor
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  Mesin Komputasi: {activeResult.engineAttribution}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" style={{ minHeight: '42px', fontSize: '12.5px' }} disabled={isExporting !== null} onClick={() => handleExportBinary('pdf')}>
                  <Download size={14} style={{ marginRight: '5px' }} /> {isExporting === 'pdf' ? 'Menyusun PDF...' : 'Export PDF'}
                </button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '42px', fontSize: '12.5px' }} disabled={isExporting !== null} onClick={() => handleExportBinary('docx')}>
                  <FileText size={14} style={{ marginRight: '5px' }} /> {isExporting === 'docx' ? 'Menyusun Word...' : 'Word (.docx)'}
                </button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '42px', fontSize: '12.5px' }} disabled={isExporting !== null} onClick={() => handleExportBinary('xlsx')}>
                  <FileSpreadsheet size={14} style={{ marginRight: '5px' }} /> {isExporting === 'xlsx' ? 'Menyusun Excel...' : 'Export Excel'}
                </button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '42px', fontSize: '12.5px' }} onClick={handleExportCSV}>
                  <Download size={14} style={{ marginRight: '5px' }} /> Export CSV
                </button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '42px', fontSize: '12.5px' }} onClick={() => window.print()}>
                  <Printer size={14} style={{ marginRight: '5px' }} /> Print
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              {[
                { id: 'stata', label: 'Tabel Hasil Bergaya Stata' },
                { id: 'visuals', label: 'Visualisasi Interaktif' },
                { id: 'interpret', label: 'Interpretasi Akademis Bahasa Indonesia' },
                { id: 'code', label: 'Stata .do & R Script Reproduksi' }
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  activeResult.stataOutput.headerConsoleText,
                  activeResult.stataOutput.accuracyMetricsTableText,
                  activeResult.stataOutput.cccAndBlandAltmanTableText,
                  activeResult.stataOutput.pairFixedEffectsTableText,
                  activeResult.stataOutput.pairwiseContrastsTableText,
                  activeResult.stataOutput.diagnosticsAndRankingText
                ].map((blk, i) => (
                  <pre
                    key={i}
                    style={{
                      margin: 0,
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      background: '#0b1220',
                      color: '#e2e8f0',
                      fontSize: '12px',
                      overflowX: 'auto',
                      lineHeight: 1.5
                    }}
                  >
                    {blk}
                  </pre>
                ))}
              </div>
            )}

            {resultSubTab === 'visuals' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <PanelAccuracyEDACharts
                  eda={activeResult.eda}
                  sources={sources}
                  unitLabel={activeResult.datasetMeta.workingUnitNote}
                />
                <PanelAccuracyFullVisualizations result={activeResult} />
              </div>
            )}

            {resultSubTab === 'interpret' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px', lineHeight: 1.65 }}>
                {[
                  { title: '1. Validitas Sumber Referensi & Kualitas Data', text: activeResult.interpretations.referenceValidityInterpretation },
                  { title: '2. Analisis Korelasi Panel (Overall, Within-City, First-Difference)', text: activeResult.interpretations.edaAndCorrelationInterpretation },
                  { title: '3. Evaluasi Akurasi (MAE, RMSE, MBE), Lin\'s CCC & Bland-Altman', text: activeResult.interpretations.accuracyAndAgreementInterpretation },
                  { title: '4. Model Inferensial Panel — Pair Fixed Effects & Wild Cluster Bootstrap', text: activeResult.interpretations.pairFixedEffectsInterpretation },
                  { title: '5. Diagnostik Statistik & Central Limit Theorem', text: activeResult.interpretations.diagnosticsInterpretation },
                  { title: '6. Keputusan Pemeringkatan Sumber Pembanding', text: activeResult.interpretations.rankingDecisionInterpretation },
                  { title: '7. Kesimpulan Akhir Penelitian', text: activeResult.interpretations.finalConclusion }
                ].map(sec => (
                  <div key={sec.title} style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                    <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--primary)' }}>{sec.title}</strong>
                    <div>{sec.text}</div>
                  </div>
                ))}
                <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--warn-border)', background: 'var(--warn-bg)' }}>
                  <strong style={{ display: 'block', marginBottom: '6px' }}>8. Keterbatasan Penelitian</strong>
                  <ul style={{ margin: '0 0 0 18px' }}>
                    {activeResult.interpretations.researchLimitations.map((lim, i) => <li key={i}>{lim}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {resultSubTab === 'code' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className={codeTab === 'stata' ? 'btn btn-primary' : 'btn btn-outline'}
                      style={{ minHeight: '40px', fontSize: '12.5px' }}
                      onClick={() => setCodeTab('stata')}
                    >
                      Stata Do-File (.do)
                    </button>
                    <button
                      type="button"
                      className={codeTab === 'r' ? 'btn btn-primary' : 'btn btn-outline'}
                      style={{ minHeight: '40px', fontSize: '12.5px' }}
                      onClick={() => setCodeTab('r')}
                    >
                      R Script (.R)
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" className="btn btn-outline" style={{ minHeight: '40px', fontSize: '12.5px' }} onClick={handleCopyCode}>
                      {copiedCode ? <><Check size={14} style={{ marginRight: '5px' }} />Tersalin</> : <><Copy size={14} style={{ marginRight: '5px' }} />Copy Code</>}
                    </button>
                    <button type="button" className="btn btn-outline" style={{ minHeight: '40px', fontSize: '12.5px' }} onClick={handleDownloadCode}>
                      <Download size={14} style={{ marginRight: '5px' }} /> Download {codeTab === 'stata' ? '.do' : '.R'}
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

          {currentStep < 9 && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={currentStep >= 4 && qualityReport.hasBlockingError}
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
