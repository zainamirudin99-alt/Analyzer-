'use client';

import React, { useMemo, useState } from 'react';
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
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Link2,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { executeAdvancedPanelAccuracyPipeline } from '@/lib/panel-adv-orchestrator';
import { OPTION3_STEP_GLOSSARY, VERIFIED_OPTION3_LITERATURE } from '@/lib/panel-adv-stata';
import {
  AdvAnchorStrategy,
  AdvBootstrapMethod,
  AdvDependencyModel,
  AdvLatentStructure,
  AdvManualOverrides,
  AdvOutlierStrategy,
  AdvPanelFitResult,
  AdvPriorStrategy,
  AdvStandardErrorMethod,
  AdvStepStataSection,
  AdvTransformationMethod,
  MeasurementSource,
  PanelDataset
} from '@/lib/panel-adv-types';
import { ImportedSheetData } from '@/lib/panel-accuracy-types';
import {
  autoDetectAccuracyDatasetConfig,
  evaluateImportedWorkbookSheets,
  generateMultiSourceCO2PresetDataset,
  parsePastedAccuracyData
} from '@/lib/panel-accuracy-validation';
import {
  AdvAnchorTrajectoryChart,
  AdvDualEstimandForestChart,
  AdvMixedLoaComparisonChart,
  AdvMonteCarloRecoveryChart,
  AdvRankingProbabilityHeatmap,
  AdvVehtariMcmcTraceChart
} from './PanelAdvancedAccuracyCharts';

const OPTION3_STEPS = [
  { id: 1, short: '1. Upload & Validasi', title: 'Step 1 — Data Upload and Data Validation' },
  { id: 2, short: '2. Auto Config', title: 'Step 2 — Automatic Data Configuration & Method Recommendation' },
  { id: 3, short: '3. Preprocessing', title: 'Step 3 — Preprocessing and Transformation' },
  { id: 4, short: '4. Latent Model', title: 'Step 4 — Latent Measurement Model & MCMC Diagnostics' },
  { id: 5, short: '5. Error Dependency', title: 'Step 5 — Dependency and Error Structure Analysis' },
  { id: 6, short: '6. Source Ranking', title: 'Step 6 — Source Ranking, Uncertainty & Anchor Sensitivity' },
  { id: 7, short: '7. Validation & LoA', title: 'Step 7 — LOSO, Pair FE Holm & Repeated-Measures Agreement' },
  { id: 8, short: '8. Robustness & MC', title: 'Step 8 — Common-Mode Bias & Monte Carlo Validation' },
  { id: 9, short: '9. Final Synthesis', title: 'Step 9 — Final Results, Multi-Method Conclusion & Reproducible Code' }
];

const CollapsibleStataGuideCard: React.FC<{
  guide: AdvStepStataSection;
  defaultOpen?: boolean;
}> = ({ guide, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(guide.stataCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadDo = () => {
    const blob = new Blob([guide.stataCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Option3_Step${guide.stepNumber}_Stata.do`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
      <div
        className="card"
        style={{
          padding: '14px 16px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
              Implementasi Reproduksibilitas Stata 17/18 — Step {guide.stepNumber}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Metode: {guide.methodName} · {guide.limitationsAndNativeGap.hasExactNativeStata ? '100% Native Stata' : 'Native Stata + Catatan Gap Mesin Bayesian'}
            </div>
          </div>
          <button
            type="button"
            className={isOpen ? 'btn btn-primary' : 'btn btn-outline'}
            onClick={() => setIsOpen(v => !v)}
            aria-expanded={isOpen}
            style={{ minHeight: '44px', padding: '8px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={15} />
            <span>Kode Stata</span>
            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>

        {isOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>
                1. Skrip Stata (.do) Siap Eksekusi
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCopy}
                  style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Tersalin' : 'Salin Kode'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleDownloadDo}
                  style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={14} />
                  <span>Unduh .do</span>
                </button>
              </div>
            </div>

            <pre
              style={{
                margin: 0,
                padding: '14px',
                borderRadius: '8px',
                background: '#0f172a',
                color: '#e2e8f0',
                fontSize: '12px',
                lineHeight: 1.55,
                overflowX: 'auto'
              }}
            >
              <code>{guide.stataCode}</code>
            </pre>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Input &amp; Output yang Diharapkan</div>
                <p style={{ margin: '0 0 6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong>Input:</strong> {guide.requiredInputs}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong>Output:</strong> {guide.expectedOutputs}
                </p>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Cara Membaca Output Stata</div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>{guide.howToReadOutput}</p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '7px 8px' }}>Perintah Stata</th>
                    <th style={{ padding: '7px 8px' }}>Penjelasan Metodologis</th>
                  </tr>
                </thead>
                <tbody>
                  {guide.codeWalkthrough.map((cw, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                        {cw.command}
                      </td>
                      <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{cw.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: guide.limitationsAndNativeGap.hasExactNativeStata ? 'var(--success-bg)' : 'var(--warn-bg)',
                border: '1px solid var(--border)',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <strong style={{ color: 'var(--text)' }}>
                Transparansi Native Stata vs Mesin Statistik Internal Option 3:
              </strong>
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong>Mesin Internal:</strong> {guide.limitationsAndNativeGap.internalEngineMethod}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong>Catatan Kapabilitas Stata:</strong> {guide.limitationsAndNativeGap.whyNoExactNativeStata}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong>Alternatif Stata Terdekat:</strong> <code>{guide.limitationsAndNativeGap.closestStataAlternative}</code> — {guide.limitationsAndNativeGap.expectedNumericalDifferences}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Step Synthesis & Next Step Recommendation (Always Visible) */}
      <div
        className="card"
        style={{
          padding: '14px 16px',
          background: 'var(--info-bg)',
          border: '1px solid var(--primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircle2 size={16} />
          <span>Kesimpulan Data Aktual Step {guide.stepNumber} &amp; Langkah Selanjutnya</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.5 }}>
          {guide.pointByPointInterpretation.map((pt, idx) => (
            <li key={idx}>{pt}</li>
          ))}
        </ul>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', marginTop: '2px' }}>
          Rekomendasi Step Berikutnya: {guide.nextStepRecommendation}
        </div>
      </div>
    </div>
  );
};

export const PanelAdvancedAccuracyTab: React.FC<{
  onOpenComparison?: () => void;
}> = ({ onOpenComparison }) => {
  const initialPreset = useMemo(() => generateMultiSourceCO2PresetDataset(), []);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [sourceMode, setSourceMode] = useState<'preset' | 'upload' | 'sheets' | 'paste'>('preset');
  const [datasetName, setDatasetName] = useState<string>('panel_co2_multi_source_accuracy.xlsx');
  const [sheetsData, setSheetsData] = useState<ImportedSheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetNote, setSheetNote] = useState<string | null>(null);

  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>(initialPreset.observations);
  const [entityColumn, setEntityColumn] = useState<string>(initialPreset.cityIdColumn);
  const [timeColumn, setTimeColumn] = useState<string>(initialPreset.yearColumn);
  const [sources, setSources] = useState<MeasurementSource[]>(initialPreset.sources);

  const [sheetsUrl, setSheetsUrl] = useState<string>('');
  const [pasteText, setPasteText] = useState<string>(
    'City\tYear\tSelf_Reporting\tSatellite\tField_Sensor\tAlt_Satellite\nJakarta\t2021\t1240\t1295\t1270\t1276\nJakarta\t2022\t1280\t1340\t1315\t1321\nSurabaya\t2021\t910\t965\t945\t950\nSurabaya\t2022\t940\t990\t972\t977\nBandung\t2021\t720\t775\t755\t760\nBandung\t2022\t750\t805\t782\t788'
  );
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [overrides, setOverrides] = useState<AdvManualOverrides>({});
  const [overrideUndoStack, setOverrideUndoStack] = useState<AdvManualOverrides[]>([]);
  const [mcRepsOverride, setMcRepsOverride] = useState<number>(28);

  const [serverResult, setServerResult] = useState<AdvPanelFitResult | null>(null);
  const [isRunningServer, setIsRunningServer] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [openGlossaryStep, setOpenGlossaryStep] = useState<number | null>(null);
  const [showMethodReferences, setShowMethodReferences] = useState<boolean>(false);
  const [codeTab, setCodeTab] = useState<'stata' | 'r' | 'stan'>('stata');
  const [copiedMaster, setCopiedMaster] = useState<boolean>(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  const columns = useMemo(
    () => (rawRows.length > 0 ? Object.keys(rawRows[0]).filter(Boolean) : []),
    [rawRows]
  );

  const panelDataset: PanelDataset = useMemo(
    () => ({
      cityIdColumn: entityColumn,
      yearColumn: timeColumn,
      sources,
      observations: rawRows
    }),
    [entityColumn, timeColumn, sources, rawRows]
  );

  const liveResult = useMemo<{ result: AdvPanelFitResult | null; error: string | null }>(() => {
    try {
      const res = executeAdvancedPanelAccuracyPipeline({
        dataset: panelDataset,
        datasetName,
        overrides,
        highPrecisionMode: false,
        monteCarloReplications: mcRepsOverride,
        executionMode: 'client_reactive'
      });
      return { result: res, error: null };
    } catch (err: unknown) {
      return {
        result: null,
        error: err instanceof Error ? err.message : 'Konfigurasi dataset belum memenuhi syarat minimum.'
      };
    }
  }, [panelDataset, datasetName, overrides, mcRepsOverride]);

  const activeResult = serverResult ?? liveResult.result;

  const updateOverridesWithHistory = (next: AdvManualOverrides) => {
    setOverrideUndoStack(prev => [overrides, ...prev].slice(0, 12));
    setOverrides(next);
    setServerResult(null);
  };

  const handleUndoOverride = () => {
    if (!overrideUndoStack.length) return;
    const [prevTop, ...rest] = overrideUndoStack;
    setOverrides(prevTop);
    setOverrideUndoStack(rest);
    setServerResult(null);
  };

  const handleRestoreInitialAuto = () => {
    if (Object.keys(overrides).length === 0) return;
    setOverrideUndoStack(prev => [overrides, ...prev].slice(0, 12));
    setOverrides({});
    setServerResult(null);
  };

  const applyImportedRows = (
    name: string,
    rows: Record<string, unknown>[],
    sheets: ImportedSheetData[] = [],
    chosenSheet = '',
    preset?: { cityIdColumn: string; yearColumn: string; sources: MeasurementSource[] }
  ) => {
    setDatasetName(name);
    setRawRows(rows);
    setSheetsData(sheets);
    setSelectedSheet(chosenSheet);
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
    setOverrides({});
    setOverrideUndoStack([]);
    setServerResult(null);
    setDataError(null);
  };

  const handleWorkbookLoaded = (name: string, sheets: ImportedSheetData[]) => {
    const evalOut = evaluateImportedWorkbookSheets(sheets);
    const chosen = sheets.find(s => s.sheetName === evalOut.recommendedSheetName) || sheets[0];
    const rows = chosen.allRows || chosen.previewRows || [];
    applyImportedRows(name, rows, sheets, chosen.sheetName);
    if (sheets.length > 1) {
      setSheetNote(`Workbook memiliki ${sheets.length} sheet; aktif pada "${chosen.sheetName}" (${chosen.rowCount} baris).`);
    } else {
      setSheetNote(null);
    }
  };

  const handleUploadFile = async (file: File) => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/regression/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal membaca berkas.');
      const sheets: ImportedSheetData[] = json.data?.sheets || [];
      if (!sheets.length) throw new Error('Spreadsheet tidak berisi sheet data.');
      handleWorkbookLoaded(json.data?.originalName || file.name, sheets);
    } catch (err: unknown) {
      setDataError(err instanceof Error ? err.message : 'Gagal mengunggah berkas.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleImportGoogleSheets = async () => {
    if (!sheetsUrl.trim()) {
      setDataError('Masukkan tautan publik Google Sheets terlebih dahulu.');
      return;
    }
    setIsLoadingData(true);
    setDataError(null);
    try {
      const res = await fetch('/api/regression/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetsUrl.trim() })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal mengimpor Google Sheets.');
      const sheets: ImportedSheetData[] = json.data?.sheets || [];
      if (!sheets.length) throw new Error('Google Sheets kosong.');
      handleWorkbookLoaded(json.data?.originalName || 'Google_Sheets_Panel_Option3.xlsx', sheets);
    } catch (err: unknown) {
      setDataError(err instanceof Error ? err.message : 'Gagal mengimpor tautan.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleApplyPasted = () => {
    const parsed = parsePastedAccuracyData(pasteText);
    if (parsed.error || !parsed.rows.length) {
      setDataError(parsed.error || 'Teks tempel tidak valid.');
      return;
    }
    setSheetNote(null);
    applyImportedRows('Pasted_Panel_Option3.csv', parsed.rows);
  };

  const handleRunHighPrecisionServer = async () => {
    setIsRunningServer(true);
    setServerError(null);
    try {
      const res = await fetch('/api/panel-adv-accuracy/fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'option3',
          dataset: panelDataset,
          datasetName,
          overrides,
          highPrecisionMode: true,
          monteCarloReplications: Math.max(50, mcRepsOverride)
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal menjalankan estimasi server.');
      setServerResult(json.data);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Kesalahan eksekusi server.');
    } finally {
      setIsRunningServer(false);
    }
  };

  const handleExportReport = async (format: 'pdf' | 'docx' | 'xlsx' | 'csv') => {
    if (!activeResult) return;
    setExportingFormat(format);
    try {
      const res = await fetch('/api/panel-adv-accuracy/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: activeResult, format, datasetName })
      });
      if (!res.ok) throw new Error('Gagal membuat dokumen ekspor.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Option3_Advanced_Latent_Panel.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Ekspor gagal.');
    } finally {
      setExportingFormat(null);
    }
  };

  const activeGlossary = OPTION3_STEP_GLOSSARY[currentStep] || [];
  const activeStepGuide = activeResult?.stepStataGuides.find(g => g.stepNumber === currentStep);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Option 3 Methodology Banner */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          borderLeft: '4px solid var(--primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '999px',
                background: 'var(--info-bg)',
                color: 'var(--primary)'
              }}
            >
              OPTION 3 · METODOLOGI INDEPENDEN BARU
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {activeResult?.executionMode === 'server_high_precision'
                ? `Terverifikasi Server Presisi Tinggi (${activeResult.elapsedMs} ms)`
                : activeResult
                  ? `Mode Reaktif Instan (${activeResult.elapsedMs} ms)`
                  : 'Menunggu konfigurasi data'}
            </span>
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: '16.5px', fontWeight: 800, color: 'var(--text)' }}>
            Option 3: Advanced Latent Measurement Model and Panel Accuracy Validation
          </h3>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Woodbury Bayesian MCMC · Diagnostik Vehtari (2021) · Seleksi Ketergantungan WAIC/LOO · Multi-Anchor Sensitivity · Holm (1979) Pair FE · Mixed-Effects LoA · Validasi Monte Carlo 7 Keluarga.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunHighPrecisionServer}
            disabled={isRunningServer || !activeResult}
            style={{ minHeight: '44px', padding: '8px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {isRunningServer ? <RefreshCw size={15} /> : <Play size={15} />}
            <span>{isRunningServer ? 'Menjalankan MCMC Presisi Tinggi...' : 'Verifikasi Server Presisi Tinggi'}</span>
          </button>
          {onOpenComparison && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={onOpenComparison}
              style={{ minHeight: '44px', padding: '8px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Layers size={15} />
              <span>Bandingkan dgn Opsi 2</span>
            </button>
          )}
        </div>
      </div>

      {/* Horizontal 9-Step Stepper */}
      <div
        className="card"
        style={{
          padding: '10px 12px',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto'
        }}
      >
        {OPTION3_STEPS.map(st => {
          const active = st.id === currentStep;
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setCurrentStep(st.id)}
              style={{
                minHeight: '44px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: active ? 'var(--info-bg)' : 'var(--surface-muted)',
                color: active ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: active ? 800 : 600,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {st.short}
            </button>
          );
        })}
      </div>

      {(dataError || serverError || liveResult.error) && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <AlertCircle size={16} />
          <span>{dataError || serverError || liveResult.error}</span>
        </div>
      )}

      {/* Main Step Card Header + Keterangan Button */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
              {OPTION3_STEPS[currentStep - 1]?.title}
            </h3>
            {activeStepGuide && (
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                {activeStepGuide.purpose}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {currentStep === 1 && (
              <button
                type="button"
                className={showMethodReferences ? 'btn btn-primary' : 'btn btn-outline'}
                aria-expanded={showMethodReferences}
                aria-label="Buka atau tutup daftar referensi metode Option 3"
                onClick={() => setShowMethodReferences(prev => !prev)}
                style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <BookOpen size={15} />
                <span>Referensi Metode ({VERIFIED_OPTION3_LITERATURE.length})</span>
              </button>
            )}

            {activeGlossary.length > 0 && (
              <button
                type="button"
                className={openGlossaryStep === currentStep ? 'btn btn-primary' : 'btn btn-outline'}
                aria-expanded={openGlossaryStep === currentStep}
                onClick={() => setOpenGlossaryStep(prev => (prev === currentStep ? null : currentStep))}
                style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Info size={15} />
                <span>Keterangan ({activeGlossary.length})</span>
              </button>
            )}
          </div>
        </div>

        {currentStep === 1 && showMethodReferences && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              background: 'var(--surface-muted)',
              border: '1px solid var(--primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BookOpen size={15} />
                <span>Referensi Metode Ilmiah Peer-Reviewed Option 3 ({VERIFIED_OPTION3_LITERATURE.length} Rujukan)</span>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowMethodReferences(false)}
                style={{ minHeight: '36px', padding: '4px 10px', fontSize: '12px' }}
              >
                Tutup
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
              Landasan metodologi statistik yang digunakan untuk membangun mesin estimasi Bayesian Woodbury, diagnostik Vehtari (2021), seleksi WAIC/PSIS-LOO, koreksi Holm (1979), Mixed-Effects LoA, dan validasi Monte Carlo pada Option 3.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: 'var(--surface)', borderRadius: '6px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Penulis &amp; Tahun</th>
                    <th style={{ padding: '8px' }}>Judul &amp; Jurnal</th>
                    <th style={{ padding: '8px' }}>DOI</th>
                    <th style={{ padding: '8px' }}>Peran pada Option 3</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeResult?.literature || VERIFIED_OPTION3_LITERATURE).map(lit => (
                    <tr key={lit.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{lit.authors} ({lit.year})</td>
                      <td style={{ padding: '8px' }}>
                        {lit.title}. <em>{lit.journal}</em>, {lit.volumePages}.
                      </td>
                      <td style={{ padding: '8px', fontFamily: 'monospace' }}>
                        <a href={`https://doi.org/${lit.doi}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                          {lit.doi}
                        </a>
                      </td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{lit.roleInOption3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {openGlossaryStep === currentStep && activeGlossary.length > 0 && (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: 'var(--info-bg)',
              border: '1px solid var(--primary)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '8px'
            }}
          >
            {activeGlossary.map(g => (
              <div key={g.term} style={{ padding: '10px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)' }}>
                  {g.term} — <span style={{ color: 'var(--text)' }}>{g.fullName}</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {g.meaning}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ==================== STEP 1 ==================== */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { key: 'preset', label: 'Preset Panel CO₂ (4 Sumber)', icon: Sparkles },
                { key: 'upload', label: 'Unggah Excel / CSV', icon: UploadCloud },
                { key: 'sheets', label: 'Impor Google Sheets', icon: Link2 },
                { key: 'paste', label: 'Tempel Data Tabel', icon: FileSpreadsheet }
              ].map(tb => {
                const Icon = tb.icon;
                const active = sourceMode === tb.key;
                return (
                  <button
                    key={tb.key}
                    type="button"
                    className={active ? 'btn btn-primary' : 'btn btn-outline'}
                    onClick={() => {
                      setSourceMode(tb.key as typeof sourceMode);
                      if (tb.key === 'preset') {
                        const p = generateMultiSourceCO2PresetDataset();
                        applyImportedRows('panel_co2_multi_source_accuracy.xlsx', p.observations, [], '', p);
                      }
                    }}
                    style={{ minHeight: '44px', padding: '8px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Icon size={15} />
                    <span>{tb.label}</span>
                  </button>
                );
              })}
            </div>

            {sourceMode === 'upload' && (
              <div style={{ padding: '16px', borderRadius: '8px', border: '1px dashed var(--primary)', background: 'var(--surface-muted)' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  <span>Pilih Berkas .xlsx, .xls, atau .csv (Maks 10 MB):</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    disabled={isLoadingData}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadFile(f);
                    }}
                    style={{ fontSize: '16px', minHeight: '44px' }}
                  />
                </label>
              </div>
            )}

            {sourceMode === 'sheets' && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="url"
                  value={sheetsUrl}
                  onChange={e => setSheetsUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  style={{ flex: 1, minWidth: '240px', minHeight: '44px', fontSize: '16px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isLoadingData}
                  onClick={handleImportGoogleSheets}
                  style={{ minHeight: '44px', padding: '8px 16px', fontSize: '13px' }}
                >
                  {isLoadingData ? 'Mengimpor...' : 'Muat Google Sheets'}
                </button>
              </div>
            )}

            {sourceMode === 'paste' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  rows={5}
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  style={{ width: '100%', fontSize: '16px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontFamily: 'monospace', background: 'var(--surface)', color: 'var(--text)' }}
                />
                <div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleApplyPasted}
                    style={{ minHeight: '44px', padding: '8px 16px', fontSize: '13px' }}
                  >
                    Terapkan Data Tempel
                  </button>
                </div>
              </div>
            )}

            {sheetsData.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-muted)' }}>
                <strong style={{ fontSize: '12.5px' }}>Pilih Sheet Workbook:</strong>
                <select
                  value={selectedSheet}
                  onChange={e => {
                    const sh = sheetsData.find(s => s.sheetName === e.target.value);
                    if (sh) {
                      applyImportedRows(datasetName, sh.allRows || sh.previewRows || [], sheetsData, sh.sheetName);
                    }
                  }}
                  style={{ minHeight: '44px', fontSize: '16px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                >
                  {sheetsData.map(s => (
                    <option key={s.sheetName} value={s.sheetName}>
                      {s.sheetName} ({s.rowCount} baris)
                    </option>
                  ))}
                </select>
                {sheetNote && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sheetNote}</span>}
              </div>
            )}

            {/* Column & Sources Mapping */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', fontWeight: 700 }}>
                <span>Kolom ID Entitas Panel (i):</span>
                <select
                  value={entityColumn}
                  onChange={e => setEntityColumn(e.target.value)}
                  style={{ minHeight: '44px', fontSize: '16px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                >
                  {columns.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', fontWeight: 700 }}>
                <span>Kolom Periode Waktu (t):</span>
                <select
                  value={timeColumn}
                  onChange={e => setTimeColumn(e.target.value)}
                  style={{ minHeight: '44px', fontSize: '16px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                >
                  {columns.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <strong style={{ fontSize: '13px' }}>
                  Daftar Sumber Pengukuran yang Dievaluasi Setara Tanpa Ground Truth (J = {sources.length}):
                </strong>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    const unusedCol = columns.find(
                      c => c !== entityColumn && c !== timeColumn && !sources.some(s => s.columnKey === c)
                    ) || columns[0] || '';
                    const idx = sources.length + 1;
                    setSources(prev => [
                      ...prev,
                      {
                        id: `src_${Date.now()}`,
                        name: `X${idx}`,
                        label: unusedCol || `Source ${idx}`,
                        columnKey: unusedCol,
                        unit: prev[0]?.unit || 'satuan',
                        role: 'evaluated'
                      }
                    ]);
                  }}
                  style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={14} />
                  <span>Tambah Sumber</span>
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Kode</th>
                      <th style={{ padding: '8px' }}>Label Instrumen / Sumber</th>
                      <th style={{ padding: '8px' }}>Kolom Dataset</th>
                      <th style={{ padding: '8px' }}>Satuan</th>
                      <th style={{ padding: '8px' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map(src => (
                      <tr key={src.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 800 }}>{src.name}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            value={src.label}
                            onChange={e =>
                              setSources(prev => prev.map(s => (s.id === src.id ? { ...s, label: e.target.value } : s)))
                            }
                            style={{ minHeight: '44px', fontSize: '16px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', width: '100%' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <select
                            value={src.columnKey}
                            onChange={e =>
                              setSources(prev => prev.map(s => (s.id === src.id ? { ...s, columnKey: e.target.value } : s)))
                            }
                            style={{ minHeight: '44px', fontSize: '16px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', width: '100%' }}
                          >
                            {columns.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            value={src.unit}
                            onChange={e =>
                              setSources(prev => prev.map(s => (s.id === src.id ? { ...s, unit: e.target.value } : s)))
                            }
                            style={{ minHeight: '44px', fontSize: '16px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', width: '110px' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={sources.length <= 2}
                            onClick={() => setSources(prev => prev.filter(s => s.id !== src.id))}
                            aria-label={`Hapus ${src.label}`}
                            style={{ minHeight: '44px', minWidth: '44px', padding: '6px' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {activeResult && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '10px' }}>
                {[
                  { label: 'Entitas Panel (G)', val: activeResult.datasetSummary.nEntities },
                  { label: 'Periode Waktu (T)', val: activeResult.datasetSummary.nPeriods },
                  { label: 'Sumber Pengukuran (J)', val: activeResult.datasetSummary.nSources },
                  { label: 'Complete-Case (N_CC)', val: `${activeResult.datasetSummary.nCompletePairs} / ${activeResult.datasetSummary.nRawRows}` },
                  { label: 'Keseimbangan Panel', val: activeResult.datasetSummary.isBalanced ? 'Balanced' : 'Unbalanced' },
                  { label: 'Status Identifikasi', val: activeResult.autoDecision.overallIdentifiabilityStatus }
                ].map(kpi => (
                  <div key={kpi.label} style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{kpi.label}</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginTop: '3px' }}>{kpi.val}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== STEP 2 ==================== */}
        {currentStep === 2 && activeResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
                  {activeResult.autoDecision.summaryHeadline}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Hierarki Prioritas: <strong>{activeResult.autoDecision.hierarchyRule}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {overrideUndoStack.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleUndoOverride}
                    style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12.5px' }}
                  >
                    Batalkan Perubahan Terakhir ({overrideUndoStack.length})
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!activeResult.autoDecision.hasManualOverrides}
                  onClick={handleRestoreInitialAuto}
                  style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12.5px' }}
                >
                  Kembalikan Rekomendasi Otomatis Awal
                </button>
              </div>
            </div>

            {/* Manual Override Controls */}
            <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sliders size={15} />
                <span>Kontrol Manual Override (Opsional — Untuk Uji Sensitivitas Peneliti)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                  <span>Transformasi Skala Kerja:</span>
                  <select
                    value={activeResult.autoDecision.activeConfig.transformation}
                    onChange={e => updateOverridesWithHistory({ ...overrides, transformation: e.target.value as AdvTransformationMethod })}
                    style={{ minHeight: '44px', fontSize: '16px', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    {['none', 'robust_student_t', 'winsorize_2_5', 'log1p', 'log', 'sqrt', 'box_cox', 'yeo_johnson', 'z_standardize', 'robust_median_iqr'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                  <span>Struktur Laten Panel:</span>
                  <select
                    value={activeResult.autoDecision.activeConfig.latentStructure}
                    onChange={e => updateOverridesWithHistory({ ...overrides, latentStructure: e.target.value as AdvLatentStructure })}
                    style={{ minHeight: '44px', fontSize: '16px', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    <option value="TWO_WAY_PANEL_HIERARCHICAL">TWO_WAY_PANEL_HIERARCHICAL</option>
                    <option value="DYNAMIC_PANEL_STATE_SPACE">DYNAMIC_PANEL_STATE_SPACE</option>
                    <option value="POOLED_CONGENERIC">POOLED_CONGENERIC</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                  <span>Rezim Anchor Utama:</span>
                  <select
                    value={activeResult.autoDecision.activeConfig.anchorStrategy}
                    onChange={e => updateOverridesWithHistory({ ...overrides, anchorStrategy: e.target.value as AdvAnchorStrategy })}
                    style={{ minHeight: '44px', fontSize: '16px', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    <option value="SYMMETRIC_GEOMEAN_MEDIAN">SYMMETRIC_GEOMEAN_MEDIAN</option>
                    <option value="SUM_TO_ZERO_EQUAL_MEAN">SUM_TO_ZERO_EQUAL_MEAN</option>
                    {sources.map(s => (
                      <option key={s.id} value={`MARKER_SOURCE_${s.id}`}>MARKER: {s.label}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                  <span>Prior Bayesian:</span>
                  <select
                    value={activeResult.autoDecision.activeConfig.priorStrategy}
                    onChange={e => updateOverridesWithHistory({ ...overrides, priorStrategy: e.target.value as AdvPriorStrategy })}
                    style={{ minHeight: '44px', fontSize: '16px', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    <option value="WEAKLY_INFORMATIVE_HALF_T">WEAKLY_INFORMATIVE_HALF_T</option>
                    <option value="DIFFUSE_LOG_SCALE">DIFFUSE_LOG_SCALE</option>
                    <option value="SKEPTICAL_BSEM_SHRINKAGE">SKEPTICAL_BSEM_SHRINKAGE</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                  <span>Standar Error Pair FE:</span>
                  <select
                    value={activeResult.autoDecision.activeConfig.standardErrorMethod}
                    onChange={e => updateOverridesWithHistory({ ...overrides, standardErrorMethod: e.target.value as AdvStandardErrorMethod })}
                    style={{ minHeight: '44px', fontSize: '16px', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    <option value="CLUSTER_ENTITY">CLUSTER_ENTITY</option>
                    <option value="TWO_WAY_ENTITY_TIME">TWO_WAY_ENTITY_TIME</option>
                    <option value="DRISCOLL_KRAAY_HAC">DRISCOLL_KRAAY_HAC</option>
                    <option value="ROBUST_HC3">ROBUST_HC3</option>
                    <option value="CONVENTIONAL_OLS">CONVENTIONAL_OLS</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                  <span>Wild Cluster Bootstrap:</span>
                  <select
                    value={activeResult.autoDecision.activeConfig.bootstrapMethod}
                    onChange={e => updateOverridesWithHistory({ ...overrides, bootstrapMethod: e.target.value as AdvBootstrapMethod })}
                    style={{ minHeight: '44px', fontSize: '16px', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    <option value="WEBB_SIX_POINT_WILD_CLUSTER">WEBB_SIX_POINT_WILD_CLUSTER</option>
                    <option value="RADEMACHER_WILD_CLUSTER">RADEMACHER_WILD_CLUSTER</option>
                    <option value="NONE_ASYMPTOTIC">NONE_ASYMPTOTIC</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                  <span>Strategi Pencilan:</span>
                  <select
                    value={activeResult.autoDecision.activeConfig.outlierStrategy}
                    onChange={e => updateOverridesWithHistory({ ...overrides, outlierStrategy: e.target.value as AdvOutlierStrategy })}
                    style={{ minHeight: '44px', fontSize: '16px', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    <option value="AUDIT_ONLY_PRESERVE_RAW">AUDIT_ONLY_PRESERVE_RAW</option>
                    <option value="ROBUST_STUDENT_T_LIKELIHOOD">ROBUST_STUDENT_T_LIKELIHOOD</option>
                    <option value="SYMMETRIC_WINSOR_2_5">SYMMETRIC_WINSOR_2_5</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                  <span>Model Ketergantungan Galat:</span>
                  <select
                    value={activeResult.autoDecision.activeConfig.dependencyModel}
                    onChange={e => updateOverridesWithHistory({ ...overrides, dependencyModel: e.target.value as AdvDependencyModel })}
                    style={{ minHeight: '44px', fontSize: '16px', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    <option value="M1_INDEPENDENT">M1_INDEPENDENT</option>
                    <option value="M2_TEMPORAL_AR1">M2_TEMPORAL_AR1</option>
                    <option value="M3_ENTITY_SOURCE_RE">M3_ENTITY_SOURCE_RE</option>
                    <option value="M4_SPARSE_CORRELATED_RESIDUAL">M4_SPARSE_CORRELATED_RESIDUAL</option>
                  </select>
                </label>
              </div>
            </div>

            {/* 12 Automatic Decision Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '12px' }}>
              {activeResult.autoDecision.decisions.map(dec => (
                <div
                  key={dec.dimensionKey}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: dec.isOverriddenByUser ? '2px solid var(--warn)' : '1px solid var(--border)',
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                    <strong style={{ fontSize: '13px', color: 'var(--text)' }}>{dec.dimensionLabel}</strong>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: dec.isOverriddenByUser ? 'var(--warn-bg)' : 'var(--info-bg)',
                        color: dec.isOverriddenByUser ? 'var(--warn)' : 'var(--primary)'
                      }}
                    >
                      {dec.isOverriddenByUser ? 'MANUAL OVERRIDE' : dec.confidenceLevel}
                    </span>
                  </div>
                  <div style={{ fontSize: '12.5px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                    {dec.selectedMethod}
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    <strong>Alasan:</strong> {dec.whySelected}
                  </p>
                  <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    <strong>Basis Empiris:</strong> {dec.empiricalDataBasis}
                  </p>
                  <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    <strong>Dampak:</strong> {dec.impactOnResults}
                  </p>
                  {dec.alternativesConsidered.length > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      <strong>Alternatif ditolak:</strong>{' '}
                      {dec.alternativesConsidered.map(a => `${a.method} (${a.reasonNotSelected})`).join('; ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== STEP 3 ==================== */}
        {currentStep === 3 && activeResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text)' }}>Mengapa Uji Grubbs Pooled Tidak Dipakai sebagai Default: </strong>
              {activeResult.preprocessing.whyNotDefaultGrubbsNote}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Sumber</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>N Valid</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Missing %</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Mean ± SD</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Median (MAD)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Skew / Kurt</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Panel MAD Outliers</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Within IQR Outliers</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.preprocessing.sourceProfiles.map(sp => (
                    <tr key={sp.sourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{sp.sourceName} ({sp.sourceLabel})</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{sp.nValid}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{sp.missingPct.toFixed(1)}%</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {sp.mean.toFixed(2)} ± {sp.sd.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {sp.median.toFixed(2)} ({sp.mad.toFixed(2)})
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {sp.skewness.toFixed(2)} / {sp.excessKurtosis.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: sp.panelMadOutlierCount > 0 ? 'var(--warn)' : 'var(--success)' }}>
                        {sp.panelMadOutlierCount}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{sp.withinEntityIqrOutlierCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 800 }}>
              Evaluasi 10 Kandidat Skala &amp; Transformasi (Raymaekers &amp; Rousseeuw, 2021 — Estimand-First)
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Kandidat</th>
                    <th style={{ padding: '8px' }}>Pelestarian Estimand</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Skor Normalitas</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>|t| Heteroskedastisitas</th>
                    <th style={{ padding: '8px' }}>Keputusan &amp; Dampak Estimand</th>
                    <th style={{ padding: '8px' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.preprocessing.transformationEvaluations.map(tr => (
                    <tr
                      key={tr.method}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: tr.selected ? 'var(--info-bg)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '8px', fontWeight: 700 }}>
                        {tr.label} {tr.selected ? '★' : ''}
                      </td>
                      <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '11px' }}>
                        {tr.estimandPreservation}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {tr.eligible ? tr.centralNormalityScore.toFixed(3) : 'N/A'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {tr.eligible ? tr.proportionalHeteroscedasticityAbsT.toFixed(2) : '-'}
                      </td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                        {tr.eligible ? `${tr.decisionReason} — ${tr.estimandImpactNote}` : tr.ineligibleReason}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <button
                          type="button"
                          className={tr.selected ? 'btn btn-primary' : 'btn btn-outline'}
                          disabled={!tr.eligible}
                          onClick={() => updateOverridesWithHistory({ ...overrides, transformation: tr.method })}
                          style={{ minHeight: '44px', padding: '6px 10px', fontSize: '12px' }}
                        >
                          {tr.selected ? 'Aktif' : 'Pilih'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== STEP 4 ==================== */}
        {currentStep === 4 && activeResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '10px' }}>
              {[
                { label: 'Max Split R-hat (Vehtari)', val: activeResult.estimation.mcmcDiagnostics.maxRankNormalizedRhat.toFixed(4) },
                { label: 'Max Folded R-hat (Skala)', val: activeResult.estimation.mcmcDiagnostics.maxFoldedRhat.toFixed(4) },
                { label: 'Min Bulk-ESS / Tail-ESS', val: `${activeResult.estimation.mcmcDiagnostics.minBulkEss} / ${activeResult.estimation.mcmcDiagnostics.minTailEss}` },
                { label: 'Posterior Predictive p', val: activeResult.estimation.mcmcDiagnostics.posteriorPredictivePValue.toFixed(3) },
                { label: 'Varians θ Antar-Entitas', val: `${activeResult.estimation.latentVarianceDecomposition.betweenEntitySharePct.toFixed(1)}%` },
                { label: 'Persistensi Temporal φ', val: activeResult.estimation.latentVarianceDecomposition.temporalPersistencePhi.toFixed(3) }
              ].map(k => (
                <div key={k.label} style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{k.label}</div>
                  <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--text)', marginTop: '3px', fontFamily: 'monospace' }}>{k.val}</div>
                </div>
              ))}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Sumber</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Bias α [95% CrI]</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Loading λ [95% CrI]</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Error SD σ [95% CrI]</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>R_j = σ/|λ|</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Anchor Total RMSE</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Reliabilitas R²</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Split R̂ / Bulk-ESS</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.estimation.sourceParameters.map(sp => {
                    const mc = activeResult.estimation.mcmcDiagnostics.perSource.find(x => x.sourceId === sp.sourceId);
                    return (
                      <tr key={sp.sourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px', fontWeight: 700 }}>{sp.sourceName} ({sp.sourceLabel})</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {sp.biasAlpha.toFixed(3)} [{sp.biasCrILower.toFixed(2)}, {sp.biasCrIUpper.toFixed(2)}]
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {sp.loadingLambda.toFixed(3)} [{sp.loadingCrILower.toFixed(2)}, {sp.loadingCrIUpper.toFixed(2)}]
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {sp.errorSd.toFixed(3)} [{sp.errorSdCrILower.toFixed(2)}, {sp.errorSdCrIUpper.toFixed(2)}]
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                          {sp.scaleAdjustedNoiseRatio.toFixed(4)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                          {sp.anchorConditionedTotalRmse.toFixed(4)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {(sp.reliabilityR2 * 100).toFixed(2)}%
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {mc ? `${mc.rankNormalizedRhat.toFixed(3)} / ${mc.bulkEss}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <AdvDualEstimandForestChart sourceParameters={activeResult.estimation.sourceParameters} />
            <AdvVehtariMcmcTraceChart diagnostics={activeResult.estimation.mcmcDiagnostics} />

            {/* Prior Sensitivity */}
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <strong style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                Audit Sensitivitas Spesifikasi Prior (van Erp et al., 2018):
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                {activeResult.estimation.priorSensitivity.map(pr => (
                  <div key={pr.priorStrategy} style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '12px' }}>
                    <div style={{ fontWeight: 700 }}>{pr.priorStrategy}</div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Pergeseran maks σ: {pr.maxAbsParameterShiftPct.toFixed(2)}% · Konkordan #1: {pr.rankConcordantWithPrimary ? 'YA' : 'BERGESER'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== STEP 5 ==================== */}
        {currentStep === 5 && activeResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>
              Seleksi Formal Kandidat Struktur Ketergantungan Galat M1–M4 (Marginal WAIC &amp; PSIS-LOO)
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Kandidat Model</th>
                    <th style={{ padding: '8px' }}>Teridentifikasi?</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>df_cov</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Marginal WAIC</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>PSIS-LOO ELPD</th>
                    <th style={{ padding: '8px' }}>Alasan Seleksi</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.estimation.candidateModels.map(cm => (
                    <tr
                      key={cm.modelId}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: cm.selected ? 'var(--info-bg)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '8px', fontWeight: 700 }}>
                        {cm.modelLabel} {cm.selected ? '★' : ''}
                      </td>
                      <td style={{ padding: '8px', fontWeight: 700, color: cm.isIdentifiable ? 'var(--success)' : 'var(--danger)' }}>
                        {cm.isIdentifiable ? 'YA' : 'TIDAK'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{cm.degreesOfFreedomCov}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{cm.marginalWaic.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{cm.looElpd.toFixed(2)}</td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{cm.selectionReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>
              Matriks Korelasi Galat Residual Antarsumber Corr(ε̂_a, ε̂_b) &amp; Autokorelasi AR(1)
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Sumber</th>
                    {sources.map(s => (
                      <th key={s.id} style={{ padding: '8px', textAlign: 'right' }}>{s.name}</th>
                    ))}
                    <th style={{ padding: '8px', textAlign: 'right' }}>AR(1) ρ_j</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Entity-Source RE SD</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.estimation.sourceParameters.map((sp, rIdx) => (
                    <tr key={sp.sourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{sp.sourceName} ({sp.sourceLabel})</td>
                      {activeResult.estimation.residualCorrelationMatrix[rIdx]?.map((corr, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: '8px',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            fontWeight: rIdx !== cIdx && Math.abs(corr) > 0.25 ? 800 : 400,
                            color: rIdx !== cIdx && Math.abs(corr) > 0.25 ? 'var(--warn)' : 'var(--text)'
                          }}
                        >
                          {corr.toFixed(3)}
                        </td>
                      ))}
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{sp.ar1RhoResidual.toFixed(3)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{sp.entitySourceReSd.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== STEP 6 ==================== */}
        {currentStep === 6 && activeResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                background: activeResult.ranking.verdictStatus === 'CREDIBLE_RELATIVE_LEADER' ? 'var(--success-bg)' : 'var(--warn-bg)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800 }}>
                <ShieldCheck size={18} />
                <span>Status Keputusan Keandalan Relatif: {activeResult.ranking.verdictStatus}</span>
              </div>
              <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text)' }}>
                {activeResult.ranking.rankingSynthesisNarrative}
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Rank</th>
                    <th style={{ padding: '8px' }}>Sumber</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Anchor Total RMSE [95% CrI]</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>R_j = σ/|λ| [95% CrI]</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>P(R=1)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Stabilitas Entitas / Waktu</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Max Shift Anchor</th>
                    <th style={{ padding: '8px' }}>Status Pembedaan</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.ranking.rows.map(r => (
                    <tr key={r.sourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 800 }}>#{r.rank}</td>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{r.sourceName} ({r.sourceLabel})</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {r.anchorTotalRmse.toFixed(3)} [{r.anchorTotalRmseCrI[0].toFixed(2)}, {r.anchorTotalRmseCrI[1].toFixed(2)}]
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 700 }}>
                        {r.scaleAdjustedNoiseRatio.toFixed(3)} [{r.noiseRatioCrI[0].toFixed(2)}, {r.noiseRatioCrI[1].toFixed(2)}]
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>
                        {(r.probRank1 * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {r.entityStabilityPct.toFixed(0)}% / {r.temporalStabilityPct.toFixed(0)}%
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {r.maxAnchorRankShift}
                      </td>
                      <td style={{ padding: '8px', fontSize: '11.5px', color: r.statisticallyIndistinguishableFromTop && r.rank > 1 ? 'var(--warn)' : 'var(--text-secondary)' }}>
                        {r.rank === 1
                          ? 'Kandidat #1'
                          : r.statisticallyIndistinguishableFromTop
                            ? 'Tumpang-tindih dgn #1 (Seri)'
                            : 'Terpisah jelas'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <AdvRankingProbabilityHeatmap rows={activeResult.ranking.rows} />
            <AdvAnchorTrajectoryChart anchorSensitivity={activeResult.estimation.anchorSensitivity} sources={sources} />
          </div>
        )}

        {/* ==================== STEP 7 ==================== */}
        {currentStep === 7 && activeResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '12px' }}>
              <strong>{activeResult.validation.losoVarianceFormulaNote}</strong>
            </div>

            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>
              1. Leave-One-Source-Out (LOSO) Validation &amp; Covariance Term Audit
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Sumber Dikeluarkan</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Corr(θ̂_-j, θ̂_full)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>LOSO MAE</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>LOSO RMSE</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Audit 2·λ·Cov(ε, θ̂_-j)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Debiased σ vs Full σ</th>
                    <th style={{ padding: '8px' }}>Urutan Peer Stabil?</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.validation.losoEntries.map(l => (
                    <tr key={l.leftOutSourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{l.leftOutSourceLabel}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{l.latentCorrelationWithFull.toFixed(4)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{l.losoPredictiveMae.toFixed(3)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{l.losoPredictiveRmse.toFixed(3)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{l.covarianceTermAudit.toFixed(4)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {l.debiasedImpliedErrorSd.toFixed(3)} / {l.fullModelErrorSd.toFixed(3)}
                      </td>
                      <td style={{ padding: '8px', fontWeight: 700, color: l.rankChangedAmongPeers ? 'var(--warn)' : 'var(--success)' }}>
                        {l.rankChangedAmongPeers ? 'Bergeser' : 'Stabil'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>
              2. Kontras Berpasangan Pair Fixed Effects + Koreksi Sekuensial Holm (1979) &amp; Wild Bootstrap
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Pasangan Sumber</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Δ |e| (A − B)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>SE ({activeResult.validation.selectedSeMethod})</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>p Wild Bootstrap</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>p Holm (FWER)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Simultaneous 95% CI</th>
                    <th style={{ padding: '8px' }}>Signifikan α=5%?</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.validation.pairwiseHolmContrasts.map((c, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{c.sourceALabel} vs {c.sourceBLabel}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{c.diffAbsErrorAminusB.toFixed(4)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{c.seSelected.toFixed(4)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{c.pWildBootstrap.toFixed(4)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>
                        {c.pHolmAdjusted.toFixed(4)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        [{c.simultaneous95Ci[0].toFixed(3)}, {c.simultaneous95Ci[1].toFixed(3)}]
                      </td>
                      <td style={{ padding: '8px', fontWeight: 700, color: c.significantFamilywise05 ? 'var(--success)' : 'var(--text-muted)' }}>
                        {c.significantFamilywise05 ? 'YA (Terpisah)' : 'TIDAK (Seri)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>
              3. Repeated-Measures Mixed-Effects Bland-Altman LoA &amp; Lin&apos;s CCC (Parker et al., 2020)
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Sumber</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Lin&apos;s CCC [95% CI]</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Within-Entity r</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>SD Between / Within</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Mixed 95% LoA</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Lebar Mixed vs Naive</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.validation.repeatedMeasuresAgreement.map(rm => (
                    <tr key={rm.sourceId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{rm.sourceLabel}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {rm.linsCcc.toFixed(4)} [{rm.linsCccCi[0].toFixed(3)}, {rm.linsCccCi[1].toFixed(3)}]
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{rm.withinEntityR.toFixed(4)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {rm.betweenEntityDiffSd.toFixed(2)} / {rm.withinEntityDiffSd.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        [{rm.mixedEffectsLoaLower.toFixed(2)}, {rm.mixedEffectsLoaUpper.toFixed(2)}]
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {rm.mixedEffectsLoaWidth.toFixed(2)} vs {rm.naivePooledLoaWidth.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <AdvMixedLoaComparisonChart entries={activeResult.validation.repeatedMeasuresAgreement} />
          </div>
        )}

        {/* ==================== STEP 8 ==================== */}
        {currentStep === 8 && activeResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12.5px' }}>
                <strong>{activeResult.monteCarlo.overallValidationSummary}</strong>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700 }}>
                <span>Replikasi per Skenario:</span>
                <select
                  value={mcRepsOverride}
                  onChange={e => {
                    setMcRepsOverride(Number(e.target.value));
                    setServerResult(null);
                  }}
                  style={{ minHeight: '44px', fontSize: '16px', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                >
                  <option value={28}>28 reps (Cepat)</option>
                  <option value={50}>50 reps (Standar)</option>
                  <option value={90}>90 reps ( Mendalam)</option>
                </select>
              </label>
            </div>

            <AdvMonteCarloRecoveryChart monteCarlo={activeResult.monteCarlo} />

            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>
              Tabel Lengkap Validasi Monte Carlo 7 Keluarga Skenario (A–G)
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '7px' }}>Skenario</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Bias σ</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Cakupan 95%</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Rank #1 Recovery</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Type I / Power</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Gagal ID</th>
                    <th style={{ padding: '7px' }}>Temuan Validasi</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.monteCarlo.scenarios.map(sc => (
                    <tr key={sc.scenarioId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px', fontWeight: 700 }}>{sc.scenarioTitle}</td>
                      <td style={{ padding: '7px', textAlign: 'right', fontFamily: 'monospace' }}>{sc.parameterBiasMean.toFixed(3)}</td>
                      <td style={{ padding: '7px', textAlign: 'right', fontFamily: 'monospace' }}>{sc.interval95CoveragePct.toFixed(1)}%</td>
                      <td style={{ padding: '7px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{sc.top1RankingRecoveryPct.toFixed(1)}%</td>
                      <td style={{ padding: '7px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {sc.empiricalTypeIErrorPct > 0 ? `T1: ${sc.empiricalTypeIErrorPct.toFixed(1)}%` : `Pwr: ${sc.empiricalPowerPct.toFixed(1)}%`}
                      </td>
                      <td style={{ padding: '7px', textAlign: 'right', fontFamily: 'monospace' }}>{sc.identificationFailurePct.toFixed(0)}%</td>
                      <td style={{ padding: '7px', color: 'var(--text-secondary)' }}>{sc.interpretation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>
              10 Skenario Audit Batas Epistemologis Common-Mode Bias
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '7px' }}>Kode</th>
                    <th style={{ padding: '7px' }}>Skenario Bias Bersama</th>
                    <th style={{ padding: '7px' }}>Terdeteksi #1 oleh Model</th>
                    <th style={{ padding: '7px' }}>Terbaik Fisik di Simulasi</th>
                    <th style={{ padding: '7px' }}>Terdeteksi Tanpa GT?</th>
                    <th style={{ padding: '7px' }}>Implikasi Epistemologis</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.ranking.commonModeBiasScenarios.map(cm => (
                    <tr key={cm.scenarioCode} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px', fontFamily: 'monospace', fontWeight: 700 }}>{cm.scenarioCode}</td>
                      <td style={{ padding: '7px', fontWeight: 700 }}>{cm.title}</td>
                      <td style={{ padding: '7px' }}>{cm.detectedTopSourceLabel}</td>
                      <td style={{ padding: '7px' }}>{cm.trueBestUnderSimulationLabel}</td>
                      <td style={{ padding: '7px', fontWeight: 800, color: cm.biasesRecoverableWithoutGroundTruth ? 'var(--success)' : 'var(--warn)' }}>
                        {cm.biasesRecoverableWithoutGroundTruth ? 'PARSIAL' : 'TIDAK (Butuh GT)'}
                      </td>
                      <td style={{ padding: '7px', color: 'var(--text-secondary)' }}>{cm.epistemologicalFinding}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== STEP 9 ==================== */}
        {currentStep === 9 && activeResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Integrated Verdict & Multi-Method Final Narrative */}
            <div
              style={{
                padding: '18px',
                borderRadius: '10px',
                background: 'var(--info-bg)',
                border: '2px solid var(--primary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15.5px', fontWeight: 800, color: 'var(--primary)' }}>
                  <ShieldCheck size={20} />
                  <span>
                    {activeResult.scientificConclusion.selectedVariableName
                      ? `Kesimpulan Akhir: Mengapa ${activeResult.scientificConclusion.selectedVariableName} Terpilih Paling Akurat (Relatif)`
                      : 'Kesimpulan Akhir Evaluasi Pengukuran Panel'}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: 'var(--primary)',
                    color: '#ffffff'
                  }}
                >
                  {activeResult.scientificConclusion.passedMethodsCount} / {activeResult.scientificConclusion.totalMethodsCount} Tahap Metode Lulus Penuh
                </span>
              </div>

              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                {activeResult.scientificConclusion.headline}
              </div>

              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text)', lineHeight: 1.65 }}>
                {activeResult.scientificConclusion.finalNarrativeConclusion}
              </p>

              {/* Compact #1 vs #2 Comparison Strip */}
              {activeResult.scientificConclusion.topVsRunnerUp && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '10px',
                    paddingTop: '6px'
                  }}
                >
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Anchor Total RMSE (#1 vs #2)
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace', marginTop: '3px' }}>
                      {activeResult.scientificConclusion.topVsRunnerUp.topTotalRmse.toFixed(3)}
                      {activeResult.scientificConclusion.topVsRunnerUp.runnerUpTotalRmse !== null
                        ? ` vs ${activeResult.scientificConclusion.topVsRunnerUp.runnerUpTotalRmse.toFixed(3)}`
                        : ''}
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Presisi Bebas-Anchor R_j = σ/|λ|
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace', marginTop: '3px' }}>
                      {activeResult.scientificConclusion.topVsRunnerUp.topNoiseRatio.toFixed(3)}
                      {activeResult.scientificConclusion.topVsRunnerUp.runnerUpNoiseRatio !== null
                        ? ` vs ${activeResult.scientificConclusion.topVsRunnerUp.runnerUpNoiseRatio.toFixed(3)}`
                        : ''}
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Peluang Posterior P(Rank=1) &amp; Reliabilitas R²
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--success)', fontFamily: 'monospace', marginTop: '3px' }}>
                      {activeResult.scientificConclusion.topVsRunnerUp.topProbRank1Pct.toFixed(1)}% · R² {activeResult.scientificConclusion.topVsRunnerUp.topReliabilityR2Pct.toFixed(2)}%
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Uji Pair FE Holm (#1 vs #2) &amp; Lin&apos;s CCC
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace', marginTop: '3px' }}>
                      {activeResult.scientificConclusion.topVsRunnerUp.holmPValueVsRunnerUp !== null
                        ? `p=${activeResult.scientificConclusion.topVsRunnerUp.holmPValueVsRunnerUp.toFixed(4)}`
                        : 'N/A'}
                      {activeResult.scientificConclusion.topVsRunnerUp.topCcc !== null
                        ? ` · CCC ${activeResult.scientificConclusion.topVsRunnerUp.topCcc.toFixed(3)}`
                        : ''}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'var(--warn-bg)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text)' }}>
                <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                {activeResult.scientificConclusion.epistemologicalGroundTruthBoundary}
              </div>
            </div>

            {/* Step-by-Step Multi-Method Justification Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} color="var(--primary)" />
                  <span>Rincian Pembuktian Lintas Metode (Step 1–8) hingga Terpilihnya Variabel</span>
                </h4>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Setiap metode berikut menguji aspek berbeda (struktur panel, model laten Bayesian, ketergantungan galat, ketahanan anchor, validasi LOSO/Holm/LoA, dan simulasi Monte Carlo) untuk memastikan keputusan tidak bertumpu pada satu metrik tunggal.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                {activeResult.scientificConclusion.whySelectedEvidence.map((ev, idx) => {
                  const statusBg =
                    ev.status === 'LULUS'
                      ? 'var(--success-bg)'
                      : ev.status === 'CATATAN'
                        ? 'var(--warn-bg)'
                        : 'var(--danger-bg)';
                  const statusColor =
                    ev.status === 'LULUS'
                      ? 'var(--success)'
                      : ev.status === 'CATATAN'
                        ? 'var(--warn)'
                        : 'var(--danger)';
                  return (
                    <div
                      key={ev.stageCode}
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '7px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text)' }}>
                            {idx + 1}. {ev.stageLabel}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {ev.methodName}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: statusBg,
                            color: statusColor,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {ev.status}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: '11.5px',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          padding: '5px 8px',
                          borderRadius: '6px',
                          background: 'var(--surface-muted)',
                          color: 'var(--primary)'
                        }}
                      >
                        {ev.keyMetricBadge}
                      </div>

                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--text)' }}>Hasil Uji:</strong> {ev.finding}
                      </p>

                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--primary)' }}>Kontribusi Keputusan:</strong> {ev.selectionReason}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Key Limitations Box */}
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <strong style={{ fontSize: '12.5px', color: 'var(--text)' }}>Keterbatasan Metodologis yang Wajib Dilaporkan:</strong>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {activeResult.scientificConclusion.keyLimitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>

            {/* Multi-Format Export Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <strong style={{ fontSize: '13px', marginRight: '6px' }}>Ekspor Laporan Lengkap Step 1–9:</strong>
              {(['pdf', 'docx', 'xlsx', 'csv'] as const).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  className="btn btn-primary"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExportReport(fmt)}
                  style={{ minHeight: '44px', padding: '8px 14px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={14} />
                  <span>{exportingFormat === fmt ? `Menyiapkan ${fmt.toUpperCase()}...` : `Unduh ${fmt.toUpperCase()}`}</span>
                </button>
              ))}
            </div>

            {/* Master Code Tabs */}
            <div className="card" style={{ padding: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { key: 'stata', label: 'Master Stata 17/18 (.do)' },
                    { key: 'stan', label: 'Companion Stan Bayesian (.stan)' },
                    { key: 'r', label: 'Companion R Script (.R)' }
                  ].map(t => (
                    <button
                      key={t.key}
                      type="button"
                      className={codeTab === t.key ? 'btn btn-primary' : 'btn btn-outline'}
                      onClick={() => setCodeTab(t.key as typeof codeTab)}
                      style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12.5px' }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    const txt =
                      codeTab === 'stata'
                        ? activeResult.masterStataDoFile
                        : codeTab === 'stan'
                          ? activeResult.companionStanCode
                          : activeResult.companionRScript;
                    navigator.clipboard?.writeText(txt);
                    setCopiedMaster(true);
                    setTimeout(() => setCopiedMaster(false), 1800);
                  }}
                  style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {copiedMaster ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedMaster ? 'Kode Tersalin' : 'Salin Skrip'}</span>
                </button>
              </div>
              <pre style={{ margin: 0, padding: '14px', borderRadius: '8px', background: '#0f172a', color: '#e2e8f0', fontSize: '12px', maxHeight: '360px', overflow: 'auto' }}>
                <code>
                  {codeTab === 'stata'
                    ? activeResult.masterStataDoFile
                    : codeTab === 'stan'
                      ? activeResult.companionStanCode
                      : activeResult.companionRScript}
                </code>
              </pre>
            </div>
          </div>
        )}

        {/* Per-Step Collapsible Stata Guide + Always-Visible Step Conclusion */}
        {activeStepGuide && (
          <CollapsibleStataGuideCard guide={activeStepGuide} defaultOpen={currentStep === 9} />
        )}

        {/* Step Navigation Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--border)', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            disabled={currentStep <= 1}
            onClick={() => setCurrentStep(s => Math.max(1, s - 1))}
            style={{ minHeight: '44px', padding: '8px 16px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={15} />
            <span>Step Sebelumnya</span>
          </button>

          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Langkah {currentStep} dari {OPTION3_STEPS.length}
          </span>

          <button
            type="button"
            className="btn btn-primary"
            disabled={currentStep >= OPTION3_STEPS.length}
            onClick={() => setCurrentStep(s => Math.min(OPTION3_STEPS.length, s + 1))}
            style={{ minHeight: '44px', padding: '8px 16px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Lanjut ke Step {Math.min(OPTION3_STEPS.length, currentStep + 1)}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
