'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
  buildActualStepInterpretationPoints,
  PANEL_ACCURACY_STEP_GUIDES
} from '@/lib/panel-accuracy-step-guides';
import {
  AccuracyPreprocessingOptions,
  ImportedSheetData,
  MeasurementSource,
  PanelAccuracyFitResult,
  PanelDataset,
  PreprocessingRecommendationBundle,
  PreprocessingScenarioCandidate,
  StepRecommendationAction
} from '@/lib/panel-accuracy-types';
import {
  autoDetectAccuracyDatasetConfig,
  DEFAULT_ACCURACY_PREPROCESSING,
  evaluateImportedWorkbookSheets,
  generateMultiSourceCO2PresetDataset,
  parsePastedAccuracyData,
  validatePanelAccuracyDataset
} from '@/lib/panel-accuracy-validation';
import {
  PanelAccuracyBlandAltmanChart,
  PanelAccuracyEDACharts,
  PanelAccuracyFullVisualizations,
  PanelAccuracyLossDecompositionChart,
  PanelAccuracyMcmcTraceChart
} from './PanelAccuracyCharts';
import { PanelAccuracyStepStataPanel } from './PanelAccuracyStepStataPanel';
import {
  RecommendationStatusBadge,
  runIntelligentMeasurementSourceEngine
} from '@/lib/panel-accuracy-intelligent-config';
import { STEP_ACRONYM_GLOSSARY } from '@/lib/panel-accuracy-glossary';
import { buildAllStepStataDocumentation } from '@/lib/panel-accuracy-step-stata';

const StepGlossaryButton: React.FC<{
  stepId: number;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ stepId, isOpen, onToggle }) => {
  const items = STEP_ACRONYM_GLOSSARY[stepId] || [];
  if (items.length === 0) return null;
  return (
    <button
      type="button"
      className={isOpen ? 'btn btn-primary' : 'btn btn-outline'}
      aria-expanded={isOpen}
      aria-label={`Keterangan singkatan Step ${stepId}`}
      onClick={onToggle}
      style={{
        minHeight: '44px',
        padding: '6px 12px',
        fontSize: '12.5px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap'
      }}
    >
      <Info size={15} />
      <span>Keterangan</span>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          padding: '1px 6px',
          borderRadius: '999px',
          background: isOpen ? 'rgba(255,255,255,0.22)' : 'var(--surface-muted)',
          color: isOpen ? '#ffffff' : 'var(--text-secondary)'
        }}
      >
        {items.length}
      </span>
    </button>
  );
};

const StepGlossaryDrawer: React.FC<{
  stepId: number;
  isOpen: boolean;
}> = ({ stepId, isOpen }) => {
  const items = STEP_ACRONYM_GLOSSARY[stepId] || [];
  if (!isOpen || items.length === 0) return null;
  return (
    <div
      style={{
        padding: '14px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--primary)',
        background: 'var(--info-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: 'var(--primary)' }}>
        <BookOpen size={15} />
        Keterangan Singkatan &amp; Istilah Teknis pada Step {stepId}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '8px'
        }}
      >
        {items.map(it => (
          <div
            key={it.term}
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <code
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '6px',
                  background: 'var(--surface-muted)',
                  color: 'var(--primary)'
                }}
              >
                {it.term}
              </code>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{it.fullName}</span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {it.meaning}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

const ACCURACY_STEPS = [
  { id: 1, short: '1. Upload', title: 'Step 1 — Data Upload' },
  { id: 2, short: '2. Config All', title: 'Step 2 — Intelligent All-Source Mapping' },
  { id: 3, short: '3. Audit & Prep', title: 'Step 3 — Data Quality Audit & Preprocessing' },
  { id: 4, short: '4. EDA', title: 'Step 4 — Exploratory Data Analysis' },
  { id: 5, short: '5. Latent Bayes', title: 'Step 5 — Bayesian Latent Model & Agreement' },
  { id: 6, short: '6. Pair FE', title: 'Step 6 — Pair Fixed Effects & Posterior Contrasts' },
  { id: 7, short: '7. Diagnostics', title: 'Step 7 — MCMC & Statistical Diagnostics' },
  { id: 8, short: '8. Ranking', title: 'Step 8 — Evaluasi & Peringkat Seluruh Sumber' },
  { id: 9, short: '9. Final & Export', title: 'Step 9 — Final Results, Code & Export' }
];

const BulletCard: React.FC<{
  title: string;
  points: string[];
  accent?: boolean;
}> = ({ title, points, accent = true }) => (
  <div
    style={{
      padding: '14px',
      borderRadius: 'var(--radius-sm)',
      border: accent ? '1px solid var(--primary)' : '1px solid var(--border)',
      background: accent ? 'var(--info-bg)' : 'var(--surface-muted)',
      fontSize: '13px',
      lineHeight: 1.55
    }}
  >
    <strong style={{ display: 'block', marginBottom: '6px', color: accent ? 'var(--primary)' : 'var(--text)' }}>
      {title}
    </strong>
    <ul style={{ margin: '0 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {points.map((pt, idx) => (
        <li key={idx} style={{ color: 'var(--text)' }}>{pt}</li>
      ))}
    </ul>
  </div>
);

const RecommendationActionList: React.FC<{
  actions: StepRecommendationAction[];
  onAction: (actionType: StepRecommendationAction['actionType']) => void;
  disabled?: boolean;
}> = ({ actions, onAction, disabled }) => {
  const priorityStyle = (p: StepRecommendationAction['priority']) => {
    if (p === 'KRITIS') return { bg: '#ef4444', border: '#ef4444', cardBg: 'var(--danger-bg)' };
    if (p === 'TINGGI') return { bg: '#d97706', border: 'var(--warn-border)', cardBg: 'var(--warn-bg)' };
    if (p === 'DISARANKAN') return { bg: 'var(--primary)', border: 'var(--primary)', cardBg: 'var(--surface)' };
    return { bg: 'var(--success)', border: 'var(--border)', cardBg: 'var(--surface)' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {actions.map(act => {
        const st = priorityStyle(act.priority);
        return (
          <div
            key={act.id}
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${st.border}`,
              background: st.cardBg,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: st.bg,
                    color: '#fff',
                    fontSize: '10.5px',
                    fontWeight: 800
                  }}
                >
                  {act.priority}
                </span>
                <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>{act.title}</strong>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                <strong>Dasar Statistik:</strong> {act.statisticalBasis}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--primary)', fontWeight: 600 }}>
                <strong>Dampak Output:</strong> {act.expectedImpact}
              </div>
            </div>
            <button
              type="button"
              disabled={disabled}
              className={act.priority === 'OPTIMAL' ? 'btn btn-outline' : 'btn btn-primary'}
              onClick={() => onAction(act.actionType)}
              style={{ minHeight: '40px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              <Sparkles size={13} style={{ marginRight: '5px' }} /> {act.actionLabel}
            </button>
          </div>
        );
      })}
    </div>
  );
};

const BootstrapVerificationCard: React.FC<{
  activeResult: PanelAccuracyFitResult;
  feedback: {
    prevBootstrapReps: number;
    newBootstrapReps: number;
    prevMcmcIters: number;
    newMcmcIters: number;
    elapsedMs: number;
    maxBootPDelta: number;
    maxRhatDelta: number;
    bestSourceBefore: string | null;
    bestSourceAfter: string | null;
    executedAt: string;
  } | null;
}> = ({ activeResult, feedback }) => {
  if (!feedback) {
    return (
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-muted)',
          border: '1px solid var(--border)',
          fontSize: '12.5px',
          color: 'var(--text-secondary)',
          lineHeight: 1.5
        }}
      >
        <strong>Status Komputasi Saat Ini (Pratinjau Klien Otomatis):</strong>{' '}
        <code>{activeResult.pairFixedEffects.bootstrapReplications}</code> Replikasi Rademacher Wild Bootstrap &amp;{' '}
        <code>{activeResult.latentModel.iterationsPerChain}</code> Iterasi MCMC sudah otomatis dihitung agar seluruh grafik &amp; tabel langsung tampil. Klik tombol verifikasi server untuk menguji ulang dengan{' '}
        <strong>999 / 1.999 replikasi server</strong> dan melihat delta perubahannya.
      </div>
    );
  }

  const smallDelta = feedback.maxBootPDelta < 0.01 && feedback.bestSourceBefore === feedback.bestSourceAfter;

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--info-bg)',
        border: '1.5px solid var(--success)',
        fontSize: '12.5px',
        lineHeight: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <CheckCircle2 size={16} color="var(--success)" />
        <strong style={{ color: 'var(--text)', fontSize: '13.5px' }}>
          Verifikasi Server Berhasil ({feedback.newBootstrapReps} Replikasi Wild Bootstrap ·{' '}
          {feedback.newMcmcIters} Iterasi MCMC · {feedback.elapsedMs} ms · pukul {feedback.executedAt})
        </strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px', fontSize: '12px' }}>
        <div>
          <strong>Replikasi Bootstrap:</strong> {feedback.prevBootstrapReps} → <strong>{feedback.newBootstrapReps}</strong>
        </div>
        <div>
          <strong>Max |Δ p-value Bootstrap|:</strong> <strong>{feedback.maxBootPDelta.toFixed(4)}</strong>
        </div>
        <div>
          <strong>Δ Max MCMC R-hat:</strong> <strong>{feedback.maxRhatDelta.toFixed(4)}</strong> (Max R-hat ={' '}
          {activeResult.latentModel.maxRhat.toFixed(4)})
        </div>
        <div>
          <strong>Stabilitas Peringkat #1:</strong>{' '}
          <strong>{feedback.bestSourceAfter || 'Underidentified / Tie'}</strong>
        </div>
      </div>
      {smallDelta && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          <strong>Mengapa angkanya hampir tidak berubah?</strong> Tombol berjalan normal, namun pratinjau klien sudah menjalankan {feedback.prevBootstrapReps} replikasi Wild Bootstrap deterministik dengan pemisahan sinyal yang jelas antar sumber; peningkatan ke {feedback.newBootstrapReps} replikasi mengonfirmasi bahwa p-value dan peringkat #1 bersifat stabil (tidak bergantung pada jumlah replikasi acak).
        </div>
      )}
    </div>
  );
};

export const PanelAccuracyTab: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialPreset = useMemo(() => generateMultiSourceCO2PresetDataset(), []);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [sourceTab, setSourceTab] = useState<'preset' | 'upload' | 'link' | 'paste'>('preset');
  const [datasetName, setDatasetName] = useState<string>('panel_co2_multi_source_accuracy.xlsx');
  const [sheetsData, setSheetsData] = useState<ImportedSheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetSelectionNote, setSheetSelectionNote] = useState<string | null>(null);

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
  const [verificationFeedback, setVerificationFeedback] = useState<{
    prevBootstrapReps: number;
    newBootstrapReps: number;
    prevMcmcIters: number;
    newMcmcIters: number;
    elapsedMs: number;
    maxBootPDelta: number;
    maxRhatDelta: number;
    bestSourceBefore: string | null;
    bestSourceAfter: string | null;
    executedAt: string;
  } | null>(null);

  // Step 9 Sub-tabs & Export + Step 7 Advisor Audit Trail & Snapshot
  const [resultSubTab, setResultSubTab] = useState<'stata' | 'visuals' | 'interpret' | 'code'>('stata');
  const [codeTab, setCodeTab] = useState<'stata' | 'r' | 'stan'>('stata');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [previousConfigSnapshot, setPreviousConfigSnapshot] = useState<{
    preprocessing: AccuracyPreprocessingOptions;
    result: PanelAccuracyFitResult;
  } | null>(null);
  const [showBeforeAfterCompare, setShowBeforeAfterCompare] = useState<boolean>(false);
  const [advisorAuditTrail, setAdvisorAuditTrail] = useState<
    Array<{
      timestamp: string;
      actionTitle: string;
      beforeTop: string;
      afterTop: string;
      statusAfter: string;
    }>
  >([]);
  const [showAllStepGuides, setShowAllStepGuides] = useState<boolean>(false);
  const [step2ConfigNotice, setStep2ConfigNotice] = useState<string | null>(null);
  const [show14PointAudit, setShow14PointAudit] = useState<boolean>(false);
  const [manualConfigActive, setManualConfigActive] = useState<boolean>(false);
  const [openGlossaryStep, setOpenGlossaryStep] = useState<number | null>(null);
  const toggleGlossary = (stepId: number) =>
    setOpenGlossaryStep(prev => (prev === stepId ? null : stepId));

  const activeStepGuide = useMemo(
    () => PANEL_ACCURACY_STEP_GUIDES.find(g => g.id === currentStep) || PANEL_ACCURACY_STEP_GUIDES[0],
    [currentStep]
  );

  const columns = useMemo(
    () => (rawRows.length > 0 ? Object.keys(rawRows[0]).filter(Boolean) : []),
    [rawRows]
  );

  const intelligentConfig = useMemo(
    () =>
      runIntelligentMeasurementSourceEngine({
        columns,
        rows: rawRows,
        currentCityIdColumn: cityIdColumn,
        currentYearColumn: yearColumn,
        currentSources: sources
      }),
    [columns, rawRows, cityIdColumn, yearColumn, sources]
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

  const effectivePreprocBundle = useMemo<PreprocessingRecommendationBundle | null>(() => {
    if (recommendation) return recommendation;
    try {
      return evaluateAccuracyPreprocessingRecommendations({
        dataset: panelDataset,
        allowNegativeValues: preprocessing.allowNegativeValues
      });
    } catch {
      return null;
    }
  }, [recommendation, panelDataset, preprocessing.allowNegativeValues]);

  // Reactive live analysis result (automatically updates when Sources or Preprocessing changes)
  const liveFitResult = useMemo<PanelAccuracyFitResult | null>(() => {
    if (qualityReport.hasBlockingError) return null;
    try {
      return executePanelAccuracyPipeline({
        dataset: panelDataset,
        preprocessing,
        bootstrapReplications: 499,
        executionSource: 'client_live'
      });
    } catch {
      return null;
    }
  }, [panelDataset, preprocessing, qualityReport.hasBlockingError]);

  const activeResult = serverFitResult || liveFitResult;

  const stepPoints = useMemo(
    () => (activeResult ? buildActualStepInterpretationPoints(activeResult) : null),
    [activeResult]
  );

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

  const stepStataDocs = useMemo(
    () =>
      buildAllStepStataDocumentation({
        datasetName,
        cityIdColumn,
        yearColumn,
        sources,
        preprocessing,
        qualityReport,
        intelligentConfig,
        preprocBundle: effectivePreprocBundle,
        cleanedObservations: preparedPreview?.completeCaseObservations || [],
        fitResult: activeResult
      }),
    [
      datasetName,
      cityIdColumn,
      yearColumn,
      sources,
      preprocessing,
      qualityReport,
      intelligentConfig,
      effectivePreprocBundle,
      preparedPreview,
      activeResult
    ]
  );

  const sheetAudit = useMemo(
    () => evaluateImportedWorkbookSheets(sheetsData),
    [sheetsData]
  );

  const applyNewDataset = (
    name: string,
    rows: Record<string, unknown>[],
    sheetList: ImportedSheetData[] = [],
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
    setVerificationFeedback(null);
    setSourceError(null);
    setRecommendation(null);
    setAppliedNotice(null);
  };

  const loadWorkbookSheets = (resolvedName: string, sheets: ImportedSheetData[]) => {
    const evalSummary = evaluateImportedWorkbookSheets(sheets);
    const chosen =
      sheets.find(s => s.sheetName === evalSummary.recommendedSheetName) || sheets[0];
    const rows = chosen.allRows || chosen.previewRows || [];
    applyNewDataset(resolvedName, rows, sheets, chosen.sheetName);

    if (sheets.length > 1 && evalSummary.autoSwitchedFromFirst) {
      setSheetSelectionNote(
        `Workbook memiliki ${sheets.length} sheet. Sheet pertama ("${sheets[0].sheetName}") terdeteksi sebagai cover/dashboard (__EMPTY), sehingga sistem memilih otomatis sheet "${chosen.sheetName}". Anda tetap dapat mengganti sheet di bawah.`
      );
    } else if (sheets.length > 1) {
      setSheetSelectionNote(
        `Ditemukan ${sheets.length} sheet pada "${resolvedName}". Pilih sheet yang berisi tabel panel untuk analisis (aktif: "${chosen.sheetName}").`
      );
    } else {
      setSheetSelectionNote(
        `Workbook memuat 1 sheet aktif: "${chosen.sheetName}" (${chosen.rowCount} baris × ${chosen.columnCount} kolom).`
      );
    }
  };

  const handleSelectSheet = (sheetName: string) => {
    const target = sheetsData.find(s => s.sheetName === sheetName);
    if (!target) return;
    const rows = target.allRows || target.previewRows || [];
    applyNewDataset(datasetName, rows, sheetsData, target.sheetName);
    setSheetSelectionNote(
      `Sheet aktif beralih ke "${target.sheetName}" (${target.rowCount} baris × ${target.columnCount} kolom).`
    );
  };

  const handleLoadPreset = () => {
    setSourceTab('preset');
    setSheetSelectionNote(null);
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
      const sheets: ImportedSheetData[] = json.data?.sheets || [];
      if (sheets.length === 0) throw new Error('Berkas spreadsheet kosong.');
      const resolvedName = json.data?.originalName || json.data?.fileName || file.name;
      loadWorkbookSheets(resolvedName, sheets);
    } catch (err: any) {
      setSourceError(err.message || 'Gagal mengunggah berkas.');
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleImportLink = async () => {
    if (!sheetsUrl.trim()) {
      setSourceError('Masukkan tautan Google Sheets terlebih dahulu.');
      return;
    }
    setIsLoadingSource(true);
    setSourceError(null);
    try {
      const res = await fetch('/api/regression/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetsUrl.trim() })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal mengimpor Google Sheets.');
      const sheets: ImportedSheetData[] = json.data?.sheets || [];
      if (sheets.length === 0) throw new Error('Spreadsheet tidak memiliki data.');
      const resolvedName =
        json.data?.originalName || json.data?.fileName || 'Google_Sheets_Panel.xlsx';
      loadWorkbookSheets(resolvedName, sheets);
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
    setSheetSelectionNote(null);
    applyNewDataset('data_paste_panel_accuracy.csv', parsed.rows);
  };

  // Dynamic Source Management in Step 2 (All-Source Symmetric Evaluation)
  const handleUpdateSourceField = (
    id: string,
    field: keyof MeasurementSource,
    value: string
  ) => {
    setSources(prev =>
      prev.map(s => (s.id === id ? { ...s, [field]: value } : s))
    );
    setServerFitResult(null);
    setVerificationFeedback(null);
    setRecommendation(null);
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
      role: 'evaluated',
      methodDescription: 'Sumber pengukuran yang dievaluasi setara dalam model laten.'
    };
    setSources(prev => [...prev, newSource]);
    setServerFitResult(null);
    setVerificationFeedback(null);
    setRecommendation(null);
  };

  const handleRemoveSource = (id: string) => {
    if (sources.length <= 2) return;
    setSources(prev => prev.filter(s => s.id !== id));
    setServerFitResult(null);
    setVerificationFeedback(null);
    setRecommendation(null);
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
    setVerificationFeedback(null);
    setAppliedNotice(`Konfigurasi "${sc.label}" diterapkan pada Step 3.`);
  };

  // Full API execution (999 or 1.999 Wild Cluster Bootstrap replications + optional 800 MCMC)
  const handleRunServerPipeline = async (opts?: {
    bootstrapReplications?: 999 | 1999;
    mcmcIterations?: 450 | 800;
  }) => {
    const reqBoot = opts?.bootstrapReplications ?? 999;
    const reqMcmc = opts?.mcmcIterations ?? 450;
    const prevResult = activeResult;
    setIsRunningFit(true);
    setFitError(null);
    const t0 = performance.now();
    try {
      const res = await fetch('/api/panel-accuracy/fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: panelDataset,
          preprocessing,
          bootstrapReplications: reqBoot,
          mcmcIterations: reqMcmc
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Gagal menjalankan analisis di server.');
      }
      const nextResult = json.data as PanelAccuracyFitResult;
      const clientElapsed = Math.max(1, Math.round(performance.now() - t0));

      let maxBootPDelta = 0;
      if (prevResult) {
        maxBootPDelta = Math.abs(
          (prevResult.pairFixedEffects.omnibusWildBootstrapPValue ?? 0) -
            (nextResult.pairFixedEffects.omnibusWildBootstrapPValue ?? 0)
        );
        prevResult.pairFixedEffects.pairwiseContrasts.forEach(prevC => {
          const matchC = nextResult.pairFixedEffects.pairwiseContrasts.find(
            nc =>
              (nc.sourceAId === prevC.sourceAId && nc.sourceBId === prevC.sourceBId) ||
              (nc.sourceAId === prevC.sourceBId && nc.sourceBId === prevC.sourceAId)
          );
          if (matchC) {
            maxBootPDelta = Math.max(
              maxBootPDelta,
              Math.abs(prevC.wildBootstrapPValue - matchC.wildBootstrapPValue)
            );
          }
        });
      }

      const maxRhatDelta = prevResult
        ? Math.abs(prevResult.latentModel.maxRhat - nextResult.latentModel.maxRhat)
        : 0;

      setServerFitResult(nextResult);
      setVerificationFeedback({
        prevBootstrapReps: prevResult?.pairFixedEffects.bootstrapReplications ?? 499,
        newBootstrapReps: nextResult.pairFixedEffects.bootstrapReplications,
        prevMcmcIters: prevResult?.latentModel.iterationsPerChain ?? 450,
        newMcmcIters: nextResult.latentModel.iterationsPerChain,
        elapsedMs: nextResult.executionMeta?.elapsedMs ?? clientElapsed,
        maxBootPDelta,
        maxRhatDelta,
        bestSourceBefore: prevResult?.ranking.bestSourceLabel ?? null,
        bestSourceAfter: nextResult.ranking.bestSourceLabel ?? null,
        executedAt: new Date().toLocaleTimeString('id-ID')
      });
    } catch (err: any) {
      setFitError(err.message || 'Gagal menjalankan pipeline analisis.');
    } finally {
      setIsRunningFit(false);
    }
  };

  const recordAdvisorAudit = (
    actionTitle: string,
    nextPreproc: AccuracyPreprocessingOptions
  ) => {
    if (activeResult) {
      setPreviousConfigSnapshot({
        preprocessing: { ...preprocessing },
        result: activeResult
      });
    }
    const beforeTop = activeResult?.ranking.ranks[0]?.sourceLabel || '-';
    let afterTop = beforeTop;
    let statusAfter = activeResult?.ranking.canonicalStatus || '-';
    try {
      const simRes = executePanelAccuracyPipeline({
        dataset: panelDataset,
        preprocessing: nextPreproc,
        bootstrapReplications: 499,
        executionSource: 'client_live'
      });
      afterTop = simRes.ranking.ranks[0]?.sourceLabel || '-';
      statusAfter = simRes.ranking.canonicalStatus;
    } catch {
      // ignore if incomplete
    }
    setAdvisorAuditTrail(prev => [
      {
        timestamp: new Date().toLocaleTimeString('id-ID'),
        actionTitle,
        beforeTop,
        afterTop,
        statusAfter
      },
      ...prev.slice(0, 14)
    ]);
    setShowBeforeAfterCompare(true);
  };

  const handleRevertPreviousConfig = () => {
    if (!previousConfigSnapshot) return;
    const prevP = previousConfigSnapshot.preprocessing;
    recordAdvisorAudit('Kembali ke Pengaturan Sebelumnya', prevP);
    setPreprocessing({ ...prevP });
    setServerFitResult(null);
    setVerificationFeedback(null);
    setAppliedNotice('Pengaturan dikembalikan ke konfigurasi sebelumnya.');
  };

  const handleStepRecommendationAction = (
    actionType:
      | 'DROP_DUPLICATES'
      | 'APPLY_WINSORIZE'
      | 'APPLY_LOG1P'
      | 'RESET_RAW_BASELINE'
      | 'RUN_HIGH_PRECISION_VERIFICATION'
      | 'ADD_THIRD_SOURCE'
      | 'KEEP_CURRENT'
  ) => {
    if (actionType === 'DROP_DUPLICATES') {
      const nextP = { ...preprocessing, dropDuplicateCityYear: true };
      recordAdvisorAudit('Aktifkan Penghapusan Duplikat (City, Year)', nextP);
      setPreprocessing(nextP);
      setServerFitResult(null);
      setVerificationFeedback(null);
      setAppliedNotice('Penghapusan duplikat (City, Year) diaktifkan.');
      return;
    }
    if (actionType === 'APPLY_WINSORIZE') {
      const nextP = { ...preprocessing, applyWinsorize: true };
      recordAdvisorAudit('Terapkan Winsorization 2.5%', nextP);
      setPreprocessing(nextP);
      setServerFitResult(null);
      setVerificationFeedback(null);
      setAppliedNotice('Winsorization 2.5% diaktifkan untuk mengendalikan pengaruh outlier ekstrem.');
      return;
    }
    if (actionType === 'APPLY_LOG1P') {
      const nextP = { ...preprocessing, applyLog1p: true };
      recordAdvisorAudit('Terapkan Transformasi log(1 + x)', nextP);
      setPreprocessing(nextP);
      setServerFitResult(null);
      setVerificationFeedback(null);
      setAppliedNotice('Transformasi skala log(1 + x) diaktifkan untuk mengevaluasi kesalahan relatif proporsional.');
      return;
    }
    if (actionType === 'RESET_RAW_BASELINE') {
      const nextP: AccuracyPreprocessingOptions = {
        ...preprocessing,
        applyWinsorize: false,
        applyLog1p: false,
        dropDuplicateCityYear: qualityReport.duplicateKeys.length > 0
      };
      recordAdvisorAudit('Reset ke Baseline Satuan Fisik Asli', nextP);
      setPreprocessing(nextP);
      setServerFitResult(null);
      setVerificationFeedback(null);
      setAppliedNotice('Konfigurasi satuan fisik asli optimal diterapkan.');
      return;
    }
    if (actionType === 'ADD_THIRD_SOURCE') {
      setCurrentStep(2);
      return;
    }
    if (actionType === 'RUN_HIGH_PRECISION_VERIFICATION') {
      if (activeResult) {
        setPreviousConfigSnapshot({
          preprocessing: { ...preprocessing },
          result: activeResult
        });
      }
      setAdvisorAuditTrail(prev => [
        {
          timestamp: new Date().toLocaleTimeString('id-ID'),
          actionTitle: 'Jalankan Analisis Alternatif Presisi Tinggi (1.999 Bootstrap + 800 MCMC)',
          beforeTop: activeResult?.ranking.ranks[0]?.sourceLabel || '-',
          afterTop: activeResult?.ranking.ranks[0]?.sourceLabel || '-',
          statusAfter: activeResult?.ranking.canonicalStatus || '-'
        },
        ...prev.slice(0, 14)
      ]);
      void handleRunServerPipeline({ bootstrapReplications: 1999, mcmcIterations: 800 });
      return;
    }
    if (actionType === 'KEEP_CURRENT') {
      setCurrentStep(8);
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
    if (codeTab === 'stata') return activeResult.generatedCode.stataDoFile;
    if (codeTab === 'r') return activeResult.generatedCode.rScript;
    return activeResult.generatedCode.stanCode || stepStataDocs[5]?.companionStanCode || '';
  }, [activeResult, codeTab, stepStataDocs]);

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
        : codeTab === 'r'
          ? 'panel_comparative_accuracy.R'
          : 'panel_latent_accuracy.stan';
    triggerDownload(new Blob([activeCodeText], { type: 'text/plain;charset=utf-8' }), fname);
  };

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
          const reachable =
            s.id <= 2 ||
            (intelligentConfig.minimumRequirements.canProceed &&
              (s.id <= 4 || !qualityReport.hasBlockingError));
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

      {/* Kegunaan & Interpretasi Step Aktif + Peta 9 Step */}
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} color="var(--primary)" />
            <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>
              Kegunaan &amp; Cara Membaca: {activeStepGuide.fullTitle}
            </strong>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowAllStepGuides(v => !v)}
            style={{ minHeight: '36px', fontSize: '12px', padding: '4px 10px' }}
          >
            <Info size={14} style={{ marginRight: '5px' }} />
            {showAllStepGuides ? 'Tutup Peta 9 Step' : 'Lihat Kegunaan & Interpretasi Semua 9 Step'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', fontSize: '12.5px', lineHeight: 1.5 }}>
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border-light)' }}>
            <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>Kegunaan Tahap Ini:</strong>
            <ul style={{ margin: '0 0 0 16px', padding: 0, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {activeStepGuide.purposePoints.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border-light)' }}>
            <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>Interpretasi &amp; Maksud Hasil:</strong>
            <ul style={{ margin: '0 0 0 16px', padding: 0, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {activeStepGuide.interpretPoints.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--info-bg)', border: '1px solid var(--border-light)' }}>
            <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Catatan Metodologis:</strong>
            <ul style={{ margin: '0 0 0 16px', padding: 0, color: 'var(--text-secondary)' }}>
              <li>{activeStepGuide.keyCaveat}</li>
            </ul>
          </div>
        </div>

        {showAllStepGuides && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-light)' }}>
            {PANEL_ACCURACY_STEP_GUIDES.map(g => {
              const reachable = g.id <= 4 || !qualityReport.hasBlockingError;
              const isCur = g.id === currentStep;
              return (
                <div
                  key={g.id}
                  onClick={() => reachable && setCurrentStep(g.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: isCur ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                    background: isCur ? 'var(--info-bg)' : 'var(--surface-muted)',
                    cursor: reachable ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '12px',
                    lineHeight: 1.45
                  }}
                >
                  <strong style={{ color: isCur ? 'var(--primary)' : 'var(--text)' }}>{g.fullTitle}</strong>
                  <div>
                    <strong>Kegunaan:</strong>
                    <ul style={{ margin: '2px 0 0 16px', padding: 0, color: 'var(--text-secondary)' }}>
                      {g.purposePoints.map((p, idx) => <li key={idx}>{p}</li>)}
                    </ul>
                  </div>
                  <div>
                    <strong>Maksud &amp; Interpretasi:</strong>
                    <ul style={{ margin: '2px 0 0 16px', padding: 0, color: 'var(--text-secondary)' }}>
                      {g.interpretPoints.map((p, idx) => <li key={idx}>{p}</li>)}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                <StepGlossaryButton stepId={1} isOpen={openGlossaryStep === 1} onToggle={() => toggleGlossary(1)} />
              </div>
            </div>
            <StepGlossaryDrawer stepId={1} isOpen={openGlossaryStep === 1} />

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

            {/* Tahap Pemilihan Sheet Workbook (Berlaku untuk Upload Excel & Google Sheets) */}
            {(sourceTab === 'upload' || sourceTab === 'link') && sheetsData.length > 0 && (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Layers size={18} color="var(--primary)" />
                    <div>
                      <strong style={{ fontSize: '14px', color: 'var(--text)', display: 'block' }}>
                        Pemilihan Sheet Workbook ({sheetsData.length} Sheet Tersedia)
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Berkas: <strong>{datasetName}</strong> · Sheet Aktif: <strong>{selectedSheet || sheetsData[0]?.sheetName}</strong>
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <label htmlFor="option2-sheet-select" style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                      Pilih Sheet:
                    </label>
                    <select
                      id="option2-sheet-select"
                      value={selectedSheet}
                      onChange={e => handleSelectSheet(e.target.value)}
                      style={{
                        minHeight: '44px',
                        minWidth: '210px',
                        fontSize: '15px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)'
                      }}
                    >
                      {sheetAudit.evaluations.map(ev => (
                        <option key={ev.sheetName} value={ev.sheetName}>
                          {ev.sheetName} ({ev.rowCount} baris × {ev.columnCount} kol)
                          {ev.isRecommended ? ' ★ Disarankan' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {sheetSelectionNote && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: 'var(--info-bg)',
                      border: '1px solid var(--border)',
                      fontSize: '12.5px',
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      lineHeight: 1.45
                    }}
                  >
                    <Info size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                    <span>{sheetSelectionNote}</span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}>
                  {sheetAudit.evaluations.map(ev => {
                    const isActive = ev.sheetName === selectedSheet;
                    return (
                      <button
                        key={ev.sheetName}
                        type="button"
                        onClick={() => handleSelectSheet(ev.sheetName)}
                        aria-pressed={isActive}
                        style={{
                          minHeight: '56px',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                          background: isActive ? 'var(--info-bg)' : 'var(--surface)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', width: '100%' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: isActive ? 'var(--primary)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.sheetName}
                          </span>
                          {ev.isRecommended && (
                            <span style={{ padding: '2px 7px', borderRadius: '999px', background: 'var(--primary)', color: '#fff', fontSize: '10px', fontWeight: 800, flexShrink: 0 }}>
                              DISARANKAN
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', width: '100%', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                          <span>{ev.rowCount} baris × {ev.columnCount} kol</span>
                          <span style={{ fontWeight: 700, color: ev.isPanelReady ? 'var(--success)' : '#d97706', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            {ev.isPanelReady ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                            {ev.isPanelReady ? 'Siap Panel' : 'Non-Tabel'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ev.statusNote}</div>
                      </button>
                    );
                  })}
                </div>
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

            {stepPoints && (
              <BulletCard title="Interpretasi Ringkas Step 1 (Data Panel Aktual):" points={stepPoints.step1} />
            )}
          </>
        )}

        {/* STEP 2: INTELLIGENT DATA CONFIGURATION & SOURCE RECOMMENDATION */}
        {currentStep === 2 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 2 — Intelligent Measurement Source Configuration &amp; Source Recommendation
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Mesin konfigurasi cerdas menganalisis 14 karakteristik kolom secara otomatis untuk merekomendasikan City ID, Year, dan seluruh sumber pengukuran secara setara (tanpa Reference Source terkunci).
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ minHeight: '42px', fontSize: '12.5px' }}
                  onClick={() => {
                    setCityIdColumn(intelligentConfig.recommendedMapping.cityIdColumn);
                    setYearColumn(intelligentConfig.recommendedMapping.yearColumn);
                    setSources(intelligentConfig.recommendedMapping.sources.map(s => ({ ...s })));
                    setManualConfigActive(false);
                    setServerFitResult(null);
                    setVerificationFeedback(null);
                    setRecommendation(null);
                    setStep2ConfigNotice('Auto Configure: Konfigurasi kolom otomatis berhasil diterapkan dari hasil deteksi 14 dimensi.');
                  }}
                >
                  <Sparkles size={14} style={{ marginRight: '6px' }} /> Auto Configure
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: '42px', fontSize: '12.5px' }}
                  onClick={() => {
                    setCityIdColumn(intelligentConfig.recommendedMapping.cityIdColumn);
                    setYearColumn(intelligentConfig.recommendedMapping.yearColumn);
                    setSources(intelligentConfig.recommendedMapping.sources.map(s => ({ ...s })));
                    setPreprocessing({ ...intelligentConfig.blockEPreprocessing.recommendedPreprocessing });
                    setManualConfigActive(false);
                    setServerFitResult(null);
                    setVerificationFeedback(null);
                    setRecommendation(null);
                    setStep2ConfigNotice('Apply Recommendation: Rekomendasi pemetaan sumber beserta saran prapemrosesan berhasil diterapkan.');
                  }}
                >
                  <ShieldCheck size={14} style={{ marginRight: '6px' }} /> Apply Recommendation
                </button>
                <button
                  type="button"
                  className={manualConfigActive ? 'btn btn-primary' : 'btn btn-outline'}
                  style={{ minHeight: '42px', fontSize: '12.5px' }}
                  onClick={() => {
                    setManualConfigActive(v => !v);
                    setStep2ConfigNotice('Manual Configuration: Anda dapat menyesuaikan kolom, satuan, label, atau menambah/menghapus sumber secara bebas di bawah.');
                  }}
                >
                  <Sliders size={14} style={{ marginRight: '6px' }} /> Manual Configuration
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: '42px', fontSize: '12.5px' }}
                  onClick={() => {
                    if (sourceTab === 'preset') {
                      const p = generateMultiSourceCO2PresetDataset();
                      setCityIdColumn(p.cityIdColumn);
                      setYearColumn(p.yearColumn);
                      setSources(p.sources);
                    } else {
                      const detected = autoDetectAccuracyDatasetConfig(columns, rawRows);
                      setCityIdColumn(detected.cityIdColumn);
                      setYearColumn(detected.yearColumn);
                      setSources(detected.sources);
                    }
                    setPreprocessing(DEFAULT_ACCURACY_PREPROCESSING);
                    setManualConfigActive(false);
                    setServerFitResult(null);
                    setVerificationFeedback(null);
                    setRecommendation(null);
                    setStep2ConfigNotice('Reset Configuration: Pemetaan variabel dikembalikan ke kondisi awal.');
                  }}
                >
                  <RefreshCw size={14} style={{ marginRight: '6px' }} /> Reset Configuration
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: '42px', fontSize: '12.5px' }}
                  onClick={handleAddSource}
                >
                  <Plus size={14} style={{ marginRight: '6px' }} /> Tambah Sumber
                </button>
                <StepGlossaryButton stepId={2} isOpen={openGlossaryStep === 2} onToggle={() => toggleGlossary(2)} />
              </div>
            </div>
            <StepGlossaryDrawer stepId={2} isOpen={openGlossaryStep === 2} />

            {step2ConfigNotice && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--info-bg)', border: '1px solid var(--primary)', fontSize: '12.5px', fontWeight: 600 }}>
                {step2ConfigNotice}
              </div>
            )}

            {/* Minimum Requirements Validation Gate Banner */}
            {!intelligentConfig.minimumRequirements.canProceed && (
              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', border: '1.5px solid #ef4444', color: '#ef4444', fontSize: '13px' }}>
                <strong>Konfigurasi Belum Memenuhi Syarat Minimum (Analisis Diblokir):</strong>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  {intelligentConfig.minimumRequirements.blockingReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Intelligent Recommendation Engine Table */}
            <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <strong style={{ fontSize: '14px', color: 'var(--primary)', display: 'block' }}>
                    Intelligent Measurement Source Configuration Engine — Tabel Rekomendasi Sistem
                  </strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Evaluasi multi-kriteria (struktur identitas, kelengkapan pasangan, varians, keseragaman satuan, dan independensi galat — bukan skor korelasi tunggal).
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: '34px', fontSize: '12px', padding: '4px 10px' }}
                  onClick={() => setShow14PointAudit(v => !v)}
                >
                  {show14PointAudit ? 'Sembunyikan 14 Analisis Kolom Otomatis' : 'Lihat Detail 14 Analisis Otomatis & 5 Blok Rekomendasi'}
                </button>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)' }}>
                      {['Komponen', 'Rekomendasi Sistem', 'Alasan Statistik', 'Status'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {intelligentConfig.recommendationTable.map((row, idx) => {
                      const badgeBg =
                        row.status === 'Recommended'
                          ? 'var(--success)'
                          : row.status === 'Recommended with Warning'
                            ? '#0284c7'
                            : row.status === 'Needs Review'
                              ? '#f59e0b'
                              : '#ef4444';
                      return (
                        <tr key={idx}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{row.component}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>{row.systemRecommendation}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>{row.reason}</td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 9px',
                                borderRadius: '999px',
                                fontSize: '11px',
                                fontWeight: 800,
                                background: badgeBg,
                                color: '#fff',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 5 Recommendation Blocks (A-E) + Optional 14-Point Audit */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', fontSize: '12px', lineHeight: 1.5 }}>
                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>A. Rekomendasi Variabel Identitas</strong>
                  <ul style={{ margin: '0 0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <li><strong>City ID:</strong> {intelligentConfig.blockAIdentity.recommendedCityId} — {intelligentConfig.blockAIdentity.cityIdReason}</li>
                    <li><strong>Year:</strong> {intelligentConfig.blockAIdentity.recommendedYear} — {intelligentConfig.blockAIdentity.yearReason}</li>
                    {intelligentConfig.blockAIdentity.multiCandidateWarning && (
                      <li style={{ color: '#d97706' }}>{intelligentConfig.blockAIdentity.multiCandidateWarning}</li>
                    )}
                  </ul>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>B. Rekomendasi Sumber Pengukuran</strong>
                  <ul style={{ margin: '0 0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <li><strong>Kandidat Referensi (r):</strong> {intelligentConfig.blockBSources.recommendedReferenceCol}</li>
                    <li><strong>Layak Digunakan:</strong> {intelligentConfig.blockBSources.layakColumns.join(', ') || '-'}</li>
                    <li><strong>Perlu Diperiksa:</strong> {intelligentConfig.blockBSources.perluDiperiksaColumns.join(', ') || 'Tidak ada'}</li>
                    <li><strong>Tidak Direkomendasikan:</strong> {intelligentConfig.blockBSources.tidakDirekomendasikanColumns.join(', ') || 'Tidak ada'}</li>
                  </ul>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>C. Rekomendasi Konfigurasi Satuan</strong>
                  <ul style={{ margin: '0 0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {intelligentConfig.blockCUnits.recommendationPoints.map((pt, i) => <li key={i}>{pt}</li>)}
                  </ul>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>D. Rekomendasi Struktur Model</strong>
                  <ul style={{ margin: '0 0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <li>{intelligentConfig.blockDModelStructure.latentIdentificationNote}</li>
                    <li>{intelligentConfig.blockDModelStructure.missingnessNote}</li>
                    <li>{intelligentConfig.blockDModelStructure.bayesianFeasibilityNote}</li>
                  </ul>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>E. Rekomendasi Preprocessing</strong>
                  <ul style={{ margin: '0 0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {intelligentConfig.blockEPreprocessing.recommendationPoints.map((pt, i) => <li key={i}>{pt}</li>)}
                  </ul>
                </div>
              </div>

              {show14PointAudit && (
                <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-light)' }}>
                  <strong style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                    Hasil 14 Analisis Otomatis Karakteristik Dataset:
                  </strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px', fontSize: '12px' }}>
                    {intelligentConfig.fourteenPointAnalyses.map(item => (
                      <div key={item.stepNumber} style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '3px' }}>
                          <strong>{item.title}</strong>
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--primary)' }}>{item.status}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.summary}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* City & Year Identifier Selectors (No Reference Selection — All J Sources Evaluated Equally) */}
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
              <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--primary)', background: 'var(--info-bg)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--primary)' }}>MODE EVALUASI AKTIF (OPSI B)</span>
                <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>
                  Evaluasi Setara Seluruh J = {sources.length} Sumber (Tanpa Reference Terkunci)
                </strong>
              </div>
            </div>

            {/* Dynamic Sources List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sources.map((src, idx) => (
                <div
                  key={src.id}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-muted)',
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
                          background: 'var(--primary)',
                          color: '#fff'
                        }}
                      >
                        EVALUATED SOURCE #{idx + 1}
                      </span>
                      <strong style={{ fontSize: '14px' }}>{src.name} — {src.label}</strong>
                    </div>

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
              ))}
            </div>

            {stepPoints && (
              <BulletCard title="Interpretasi Ringkas Step 2 (Semua Sumber Dievaluasi Setara):" points={stepPoints.step2} />
            )}
          </>
        )}

        {/* STEP 3: DATA QUALITY AUDIT & EXPLICIT PREPROCESSING */}
        {currentStep === 3 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: '1 1 320px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 3 — Audit Kualitas Data, Identifiabilitas Laten &amp; Prapemrosesan Eksplisit
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Sistem memeriksa 10 indikator kualitas data panel dan kecukupan identifikasi model laten untuk seluruh J = {sources.length} sumber secara setara. Tidak ada transformasi otomatis tanpa persetujuan Anda.
                </p>
              </div>
              <StepGlossaryButton stepId={3} isOpen={openGlossaryStep === 3} onToggle={() => toggleGlossary(3)} />
            </div>
            <StepGlossaryDrawer stepId={3} isOpen={openGlossaryStep === 3} />

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
                          REKOMENDASI UTAMA (SKOR {recommendation.bestScenario.compositeQualityScore}/100)
                        </span>
                        <strong style={{ fontSize: '14px' }}>{recommendation.bestScenario.label}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {recommendation.bestScenario.rationale}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                        {recommendation.optimalChecklistNote}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleApplyPreprocessingScenario(recommendation.bestScenario)}
                      style={{ minHeight: '42px', fontSize: '13px' }}
                    >
                      <Sparkles size={14} style={{ marginRight: '6px' }} /> Terapkan Seluruh Rekomendasi Terbaik Step 3
                    </button>
                  </div>

                  {recommendation.actionItems && recommendation.actionItems.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--primary)' }}>
                        Rekomendasi Tindakan Optimal Step 3 (Berbasis Audit Kualitas &amp; Reliabilitas Bebas-Skala):
                      </strong>
                      <RecommendationActionList
                        actions={recommendation.actionItems}
                        onAction={handleStepRecommendationAction}
                      />
                    </div>
                  )}

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
                              {['Skenario', 'N (CC)', 'Sumber #1', 'Mean R²', 'Max R-hat', 'Prop Bias |t|', 'Shift Outlier (%)', 'Skor Statistik', 'Aksi'].map(h => (
                                <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Skenario' || h === 'Sumber #1' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {recommendation.scenarios.map(sc => (
                              <tr key={sc.id} style={{ background: sc.isRecommended ? 'var(--info-bg)' : 'transparent', borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 700 }}>{sc.label}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{sc.nCompletePairs}</td>
                                <td style={{ padding: '8px 10px' }}>{sc.bestComparisonLabel}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{(sc.meanReliabilityR2 * 100).toFixed(2)}%</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{sc.maxRhat.toFixed(3)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{sc.maxProportionalBiasAbsT.toFixed(2)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{sc.outlierSensitivityShiftPct.toFixed(1)}%</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>{sc.compositeQualityScore.toFixed(1)}/100</td>
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
                  onChange={e => {
                    setPreprocessing(p => ({ ...p, dropDuplicateCityYear: e.target.checked }));
                    setServerFitResult(null);
                    setVerificationFeedback(null);
                  }}
                />
                <span>Hapus baris duplikat (City, Year) dan pertahankan entri pertama</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', minHeight: '38px' }}>
                <input
                  type="checkbox"
                  checked={preprocessing.applyWinsorize}
                  onChange={e => {
                    setPreprocessing(p => ({ ...p, applyWinsorize: e.target.checked }));
                    setServerFitResult(null);
                    setVerificationFeedback(null);
                  }}
                />
                <span>Terapkan Winsorization 2.5% ekor bawah &amp; atas untuk meredam outlier input ekstrem</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', minHeight: '38px' }}>
                <input
                  type="checkbox"
                  checked={preprocessing.applyLog1p}
                  onChange={e => {
                    setPreprocessing(p => ({ ...p, applyLog1p: e.target.checked }));
                    setServerFitResult(null);
                    setVerificationFeedback(null);
                  }}
                />
                <span>Terapkan transformasi <code>log(1 + x)</code> pada seluruh sumber (evaluasi kesalahan relatif proporsional)</span>
              </label>
            </div>

            {stepPoints && (
              <BulletCard title="Interpretasi Ringkas Step 3 (Status Audit & Prapemrosesan):" points={stepPoints.step3} />
            )}
          </>
        )}

        {/* STEP 4: EXPLORATORY DATA ANALYSIS */}
        {currentStep === 4 && edaResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: '1 1 320px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 4 — Exploratory Data Analysis &amp; Matriks Korelasi Panel
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Statistik deskriptif {sources.length} sumber serta korelasi Overall Pearson, Spearman, Within-City Demeaned, dan First-Difference.
                </p>
              </div>
              <StepGlossaryButton stepId={4} isOpen={openGlossaryStep === 4} onToggle={() => toggleGlossary(4)} />
            </div>
            <StepGlossaryDrawer stepId={4} isOpen={openGlossaryStep === 4} />

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
                    <tr key={d.sourceId}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{d.sourceName} ({d.sourceLabel})</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>
                        Evaluasi Setara
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
              unitLabel={activeResult?.datasetMeta.workingUnitNote || sources[0]?.unit || 'kt CO₂'}
            />

            {stepPoints && (
              <BulletCard title="Interpretasi Hasil EDA & Korelasi Panel (Per Poin):" points={stepPoints.step4} />
            )}
          </>
        )}

        {/* STEP 5: BAYESIAN HIERARCHICAL LATENT MODEL & AGREEMENT ASSESSMENT */}
        {currentStep === 5 && activeResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: '1 1 320px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 5 — Bayesian Hierarchical Latent Model &amp; Agreement Assessment (All J = {activeResult.metrics.length} Sources)
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Seluruh <strong>J = {activeResult.metrics.length} sumber dievaluasi setara</strong> ({activeResult.latentModel.nChains} rantai MCMC × {activeResult.latentModel.iterationsPerChain} iterasi | max R-hat = {activeResult.latentModel.maxRhat.toFixed(4)} | min ESS = {activeResult.latentModel.minEss}) untuk mengungkap Total Latent RMSE, Error SD (σ_ε), Reliabilitas R², Bias α, dan Posterior Probabilitas Menjadi Terbaik.
                </p>
              </div>
              <StepGlossaryButton stepId={5} isOpen={openGlossaryStep === 5} onToggle={() => toggleGlossary(5)} />
            </div>
            <StepGlossaryDrawer stepId={5} isOpen={openGlossaryStep === 5} />

            {/* Latent Reliability & Total Error Table (ALL J Sources) */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)' }}>
                    {['Evaluated Source', 'Total Latent RMSE [95% CrI]', 'Error SD σ_ε [95% CrI]', 'Reliabilitas R² [95% CrI]', 'Bias Relatif (α)', 'Skala (λ)', 'Posterior Prob Best', 'LOSO MAE', 'Lin CCC [95% CI]'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Evaluated Source' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeResult.metrics.map(m => (
                    <tr key={m.sourceId}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{m.sourceLabel}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>
                        {m.totalLatentRmse.toFixed(2)} [{m.totalLatentRmseCiLower.toFixed(1)}, {m.totalLatentRmseCiUpper.toFixed(1)}]
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {m.errorSd.toFixed(2)} [{m.errorSdCiLower.toFixed(1)}, {m.errorSdCiUpper.toFixed(1)}]
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>
                        {(m.reliabilityR2 * 100).toFixed(2)}% [{(m.reliabilityCiLower * 100).toFixed(1)}–{(m.reliabilityCiUpper * 100).toFixed(1)}%]
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {m.latentInterceptBias >= 0 ? `+${m.latentInterceptBias.toFixed(2)}` : m.latentInterceptBias.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {m.latentLoading.toFixed(3)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: m.posteriorProbBest >= 0.5 ? 'var(--success)' : 'var(--text)', borderBottom: '1px solid var(--border-light)' }}>
                        {(m.posteriorProbBest * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {m.mae.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {m.ccc.ccc.toFixed(4)} [{m.ccc.ciLower.toFixed(3)}, {m.ccc.ciUpper.toFixed(3)}]
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Separate Available-Case vs Complete-Case Comparison */}
            <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
              <strong style={{ fontSize: '13.5px', display: 'block', marginBottom: '6px' }}>
                Perbandingan Terpisah: Leave-One-Source-Out Consensus Complete-Case vs Available-Case
              </strong>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['Sumber Evaluasi', 'N Complete-Case', 'LOSO MAE (CC)', 'N Available-Case', 'LOSO MAE (Avail)', 'LOSO RMSE (Avail)', 'LOSO MBE (Avail)', 'Lin CCC (Avail)'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Sumber Evaluasi' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
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

            <PanelAccuracyMcmcTraceChart
              latentModel={activeResult.latentModel}
              unitLabel={activeResult.datasetMeta.workingUnitNote}
            />

            {/* Residual Measurement Error Correlation Matrix (Section D3) */}
            {activeResult.latentModel.residualCorrelationMatrix.length > 0 && (
              <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                <strong style={{ fontSize: '13.5px', display: 'block', marginBottom: '4px' }}>
                  Pemeriksaan Independensi Galat &amp; Matriks Korelasi Residual Pengukuran Corr(ε̂_a, ε̂_b)
                </strong>
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Menguji apakah kesalahan pengukuran antarsumber saling independen setelah nilai laten θ̂_it diserap. Nilai |r_ε| &gt; 0.38 mengindikasikan ketergantungan instrumen/metodologi bersama.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '6px' }}>Sumber</th>
                        {activeResult.latentModel.sourceEstimates.map(s => (
                          <th key={s.sourceId} style={{ padding: '6px', borderBottom: '1px solid var(--border)' }}>{s.sourceName}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeResult.latentModel.sourceEstimates.map((rSrc, rIdx) => (
                        <tr key={rSrc.sourceId}>
                          <td style={{ padding: '6px', fontWeight: 700, textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>{rSrc.sourceLabel}</td>
                          {activeResult.latentModel.residualCorrelationMatrix[rIdx].map((val, cIdx) => (
                            <td
                              key={cIdx}
                              style={{
                                padding: '6px',
                                borderBottom: '1px solid var(--border-light)',
                                fontWeight: rIdx !== cIdx && Math.abs(val) > 0.38 ? 800 : 400,
                                color: rIdx !== cIdx && val > 0.38 ? '#ef4444' : 'var(--text)'
                              }}
                            >
                              {val.toFixed(3)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <PanelAccuracyBlandAltmanChart
              metrics={activeResult.metrics}
              referenceLabel="Konsensus Laten Leave-One-Source-Out (θ̂_-j)"
              unitLabel={activeResult.datasetMeta.workingUnitNote}
            />

            {stepPoints && (
              <BulletCard title="Interpretasi Bayesian Latent Model & Agreement (Per Poin):" points={stepPoints.step5} />
            )}
          </>
        )}

        {/* STEP 6: SOURCE ACCURACY COMPARISON & ECONOMETRIC PAIR FIXED EFFECTS */}
        {currentStep === 6 && activeResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: '1 1 320px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 6 — Komparasi Langsung Akurasi Sumber, Validasi LOSO &amp; Model Ekonometrika Pair FE
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Mengadu seluruh sumber secara langsung berdasarkan Total Latent RMSE, Dekomposisi Loss (Bias, Skala, Presisi), Validasi Prediktif LOSO, serta model komplementer Pair Fixed Effects (Cluster-Robust, Driscoll-Kraay, &amp; Wild Bootstrap).
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isRunningFit}
                  onClick={() => handleRunServerPipeline({ bootstrapReplications: 999, mcmcIterations: 450 })}
                  style={{ minHeight: '44px', fontSize: '13px' }}
                >
                  <Play size={15} style={{ marginRight: '6px' }} />
                  {isRunningFit ? 'Menjalankan 999 Wild Bootstrap...' : 'Verifikasi Penuh Server (999 Replikasi Bootstrap)'}
                </button>
                <StepGlossaryButton stepId={6} isOpen={openGlossaryStep === 6} onToggle={() => toggleGlossary(6)} />
              </div>
            </div>
            <StepGlossaryDrawer stepId={6} isOpen={openGlossaryStep === 6} />

            <BootstrapVerificationCard activeResult={activeResult} feedback={verificationFeedback} />

            {/* Direct Source Accuracy & Loss Decomposition Table (Section J Step 6) */}
            <div>
              <strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                Tabel Komparasi Langsung Akurasi Sumber &amp; Validasi Prediktif LOSO (Seluruh J = {activeResult.metrics.length} Sumber)
              </strong>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)' }}>
                      {[
                        'Sumber',
                        'Total Latent RMSE',
                        'Latent MSE',
                        'Bias Aditif (α)',
                        'Presisi (σ_ε)',
                        'Distorsi Skala',
                        'Expected Loss',
                        'LOSO MAE',
                        'LOSO RMSE',
                        'LOSO MBE',
                        '95% PI Coverage',
                        'Expected Rank'
                      ].map(h => (
                        <th key={h} style={{ padding: '7px 9px', textAlign: h === 'Sumber' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...activeResult.metrics]
                      .sort((a, b) => a.totalLatentRmse - b.totalLatentRmse)
                      .map((m, idx) => (
                        <tr key={m.sourceId} style={{ background: idx === 0 ? 'var(--info-bg)' : 'transparent' }}>
                          <td style={{ padding: '7px 9px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>
                            #{idx + 1} {m.sourceLabel}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>
                            {m.totalLatentRmse.toFixed(3)}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                            {(m.totalLatentRmse * m.totalLatentRmse).toFixed(3)}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                            {m.latentInterceptBias.toFixed(3)}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                            {m.errorSd.toFixed(3)}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                            {m.scaleDistortion.toFixed(3)}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>
                            {m.posteriorExpectedLoss.toFixed(3)}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                            {m.mae.toFixed(3)}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                            {m.rmse.toFixed(3)}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                            {m.mbe.toFixed(3)}
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>
                            {m.losoPredictiveCoverage95.toFixed(1)}%
                          </td>
                          <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 800, borderBottom: '1px solid var(--border-light)' }}>
                            {m.expectedRank.toFixed(2)} ({m.rankingStabilityPct.toFixed(0)}%)
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <PanelAccuracyLossDecompositionChart
              metrics={activeResult.metrics}
              unitLabel={activeResult.datasetMeta.workingUnitNote}
            />

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
            {stepPoints && (
              <BulletCard title="Interpretasi Model Pair Fixed Effects & Kontras (Per Poin):" points={stepPoints.step6} />
            )}
          </>
        )}

        {/* STEP 7: STATISTICAL DIAGNOSTICS & INFERENCE */}
        {currentStep === 7 && activeResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: '1 1 320px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 7 — Diagnostik Statistik, Sensitivitas Outlier &amp; Keterbatasan Inferensi
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Pemeriksaan heteroskedastisitas antarsumber, korelasi serial dalam-kota, ketergantungan lintas-kota (Pesaran CD), jumlah klaster, sensitivitas outlier, serta rekomendasi optimasi inferensi.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isRunningFit}
                  onClick={() => handleRunServerPipeline({ bootstrapReplications: 1999, mcmcIterations: 800 })}
                  style={{ minHeight: '44px', fontSize: '13px' }}
                >
                  <Play size={15} style={{ marginRight: '6px' }} />
                  {isRunningFit
                    ? 'Menjalankan 1.999 Bootstrap + 800 MCMC...'
                    : 'Verifikasi Presisi Penuh (1.999 Bootstrap + 800 MCMC)'}
                </button>
                <StepGlossaryButton stepId={7} isOpen={openGlossaryStep === 7} onToggle={() => toggleGlossary(7)} />
              </div>
            </div>
            <StepGlossaryDrawer stepId={7} isOpen={openGlossaryStep === 7} />

            <BootstrapVerificationCard activeResult={activeResult} feedback={verificationFeedback} />

            {appliedNotice && (
              <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'var(--info-bg)', border: '1px solid var(--primary)', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={15} color="var(--success)" /> {appliedNotice}
              </div>
            )}

            {fitError && (
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', color: '#ef4444', fontSize: '13px' }}>
                {fitError}
              </div>
            )}

            {activeResult.diagnostics.diagnosticAdvisor && (
              <div
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1.5px solid ${
                    activeResult.diagnostics.diagnosticAdvisor.overallHealthStatus === 'OPTIMAL'
                      ? 'var(--success)'
                      : activeResult.diagnostics.diagnosticAdvisor.overallHealthStatus === 'PERLU_PENYESUAIAN_RINGAN'
                        ? 'var(--primary)'
                        : '#ef4444'
                  }`,
                  background: 'var(--surface-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={18} color="var(--primary)" />
                    <strong style={{ fontSize: '14.5px' }}>
                      Rekomendasi Sistem Step 7 — Analisis Diagnostik &amp; Aksi Hasil Terbaik
                    </strong>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      background:
                        activeResult.diagnostics.diagnosticAdvisor.overallHealthStatus === 'OPTIMAL'
                          ? 'var(--success)'
                          : activeResult.diagnostics.diagnosticAdvisor.overallHealthStatus === 'PERLU_PENYESUAIAN_RINGAN'
                            ? 'var(--primary)'
                            : '#ef4444',
                      color: '#fff',
                      fontSize: '11.5px',
                      fontWeight: 800
                    }}
                  >
                    SKOR DIAGNOSTIK: {activeResult.diagnostics.diagnosticAdvisor.diagnosticScore}/100 (
                    {activeResult.diagnostics.diagnosticAdvisor.overallHealthStatus})
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                  {activeResult.diagnostics.diagnosticAdvisor.headline}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {activeResult.diagnostics.diagnosticAdvisor.statisticalPrincipleNote}
                </div>
                <RecommendationActionList
                  actions={activeResult.diagnostics.diagnosticAdvisor.actions}
                  onAction={handleStepRecommendationAction}
                  disabled={isRunningFit}
                />

                {/* 4 Mandatory Advisor Action Buttons (Section J Step 7) */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid var(--border-light)' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isRunningFit}
                    onClick={() => {
                      const firstAct = activeResult.diagnostics.diagnosticAdvisor?.actions[0];
                      if (firstAct) handleStepRecommendationAction(firstAct.actionType);
                    }}
                    style={{ minHeight: '40px', fontSize: '12.5px' }}
                  >
                    <Sparkles size={14} style={{ marginRight: '5px' }} /> Terapkan Rekomendasi
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={isRunningFit}
                    onClick={() => handleStepRecommendationAction('RUN_HIGH_PRECISION_VERIFICATION')}
                    style={{ minHeight: '40px', fontSize: '12.5px' }}
                  >
                    <Play size={14} style={{ marginRight: '5px' }} /> Jalankan Analisis Alternatif
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowBeforeAfterCompare(v => !v)}
                    style={{ minHeight: '40px', fontSize: '12.5px' }}
                  >
                    <Sliders size={14} style={{ marginRight: '5px' }} /> {showBeforeAfterCompare ? 'Tutup Perbandingan Hasil' : 'Bandingkan Hasil'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={!previousConfigSnapshot}
                    onClick={handleRevertPreviousConfig}
                    style={{ minHeight: '40px', fontSize: '12.5px' }}
                  >
                    <RefreshCw size={14} style={{ marginRight: '5px' }} /> Kembali ke Pengaturan Sebelumnya
                  </button>
                </div>

                {showBeforeAfterCompare && previousConfigSnapshot && (
                  <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <strong style={{ fontSize: '13px', display: 'block', marginBottom: '6px', color: 'var(--primary)' }}>
                      Perbandingan Hasil Sebelum vs Sesudah Tindakan Perbaikan
                    </strong>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-muted)' }}>
                            {['Sumber', 'Rank Sebelum', 'Total RMSE Sebelum', 'Rank Sesudah', 'Total RMSE Sesudah', 'Perubahan Status'].map(h => (
                              <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Sumber' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeResult.ranking.ranks.map(curR => {
                            const prevR = previousConfigSnapshot.result.ranking.ranks.find(p => p.sourceId === curR.sourceId);
                            const rankChanged = prevR && prevR.rank !== curR.rank;
                            return (
                              <tr key={curR.sourceId}>
                                <td style={{ padding: '6px 8px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{curR.sourceLabel}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>#{prevR?.rank ?? '-'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>{prevR ? prevR.totalLatentRmse.toFixed(3) : '-'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>#{curR.rank}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{curR.totalLatentRmse.toFixed(3)}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: rankChanged ? '#d97706' : 'var(--success)', borderBottom: '1px solid var(--border-light)' }}>
                                  {rankChanged ? `Bergeser (#${prevR?.rank} → #${curR.rank})` : 'Tetap Stabil'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {advisorAuditTrail.length > 0 && (
                  <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border-light)', fontSize: '12px' }}>
                    <strong style={{ display: 'block', marginBottom: '4px' }}>Audit Trail Tindakan Statistical Advisor:</strong>
                    <ul style={{ margin: '0 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '3px', color: 'var(--text-secondary)' }}>
                      {advisorAuditTrail.map((log, i) => (
                        <li key={i}>
                          <code>[{log.timestamp}]</code> <strong>{log.actionTitle}</strong> — Kandidat #1: {log.beforeTop} → <strong>{log.afterTop}</strong> (Status: <code>{log.statusAfter}</code>)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

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

            {stepPoints && (
              <BulletCard title="Interpretasi Diagnostik Inferensi (Per Poin):" points={stepPoints.step7} accent={false} />
            )}
          </>
        )}

        {/* STEP 8: EVALUASI AKHIR & PEMERINGKATAN SELURUH SUMBER (ALL J SOURCES) */}
        {currentStep === 8 && activeResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: '1 1 320px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Step 8 — Evaluasi Akhir &amp; Pemeringkatan Seluruh Sumber (All J = {activeResult.ranking.ranks.length} Variables)
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Diurutkan setara tanpa variabel referensi terkunci berdasarkan <strong>Total Latent RMSE</strong> &amp; <strong>Reliabilitas (R²)</strong>, diverifikasi dengan <strong>Posterior Probability of Being Best</strong> dan uji <strong>Pair Fixed Effects</strong>.
                </p>
              </div>
              <StepGlossaryButton stepId={8} isOpen={openGlossaryStep === 8} onToggle={() => toggleGlossary(8)} />
            </div>
            <StepGlossaryDrawer stepId={8} isOpen={openGlossaryStep === 8} />

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
                  STATUS: {activeResult.ranking.canonicalStatus} ({activeResult.ranking.conclusivenessStatus})
                </span>
                <strong style={{ fontSize: '15px' }}>
                  {activeResult.ranking.bestSourceLabel
                    ? `Variabel Paling Akurat Secara Relatif (Peringkat #1 dari ${activeResult.ranking.ranks.length} Sumber): ${activeResult.ranking.bestSourceLabel}`
                    : `Kandidat Estimasi Kesalahan Terendah Sementara: ${activeResult.ranking.bestCandidateLabel || activeResult.ranking.ranks[0]?.sourceLabel || '-'}`}
                </strong>
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.55 }}>{activeResult.ranking.rankingSummary}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {activeResult.ranking.methodologicalCaveat}
              </div>
              {!activeResult.ranking.isConclusive && (
                <div
                  style={{
                    marginTop: '6px',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '12px'
                  }}
                >
                  <strong style={{ color: 'var(--text)' }}>
                    Audit 4 Syarat agar Status Menjadi TERBUKTI_BERBEDA_SIGNIFIKAN:
                  </strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '6px' }}>
                    {[
                      {
                        label: `1. Sumber Independen J ≥ 3 (Saat ini J = ${activeResult.latentModel.nSources})`,
                        ok: activeResult.latentModel.nSources >= 3
                      },
                      {
                        label: `2. Konvergensi MCMC R-hat ≤ 1.10 (Saat ini ${activeResult.latentModel.maxRhat.toFixed(4)})`,
                        ok: activeResult.latentModel.converged
                      },
                      {
                        label: '3. Konsistensi Lintas Metrik & Bebas Outlier Flip',
                        ok: !activeResult.diagnostics.outlierSensitivityAudit.rankOrderChanged && activeResult.ranking.conclusivenessStatus !== 'KONFLIK_ANTAR_METRIK'
                      },
                      {
                        label: '4. P_Bayes(#1 vs #2) ≥ 95% & WildBoot p < 0.05',
                        ok: activeResult.ranking.ranks[1] ? !activeResult.ranking.ranks[1].isStatisticallyIndistinguishableFromTop : false
                      }
                    ].map(g => (
                      <div
                        key={g.label}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: `1px solid ${g.ok ? 'var(--success)' : '#d97706'}`,
                          background: g.ok ? 'var(--info-bg)' : 'var(--warn-bg)',
                          color: 'var(--text)',
                          fontWeight: 600
                        }}
                      >
                        {g.ok ? '✓ ' : '✗ '}
                        {g.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ranking Table (ALL J Sources #1..#J) */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)' }}>
                    {['Peringkat', 'Variabel / Sumber', 'Total Latent RMSE', 'Error SD (σ_ε)', 'Reliabilitas R²', 'Posterior P(Best)', 'LOSO MAE', 'P_Bayes vs #1', 'WildBoot p vs #1', 'Keterangan Evaluasi'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Variabel / Sumber' || h === 'Keterangan Evaluasi' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeResult.ranking.ranks.map(r => (
                    <tr key={r.sourceId} style={{ background: r.rank === 1 ? 'var(--info-bg)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, borderBottom: '1px solid var(--border-light)' }}>#{r.rank}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{r.sourceLabel}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)' }}>
                        {Math.abs(r.totalLatentRmse) < 10 ? r.totalLatentRmse.toFixed(3) : r.totalLatentRmse.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {Math.abs(r.errorSd) < 10 ? r.errorSd.toFixed(3) : r.errorSd.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>{(r.reliabilityR2 * 100).toFixed(2)}%</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: r.rank === 1 ? 'var(--success)' : 'var(--text)', borderBottom: '1px solid var(--border-light)' }}>
                        {(r.posteriorProbBest * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {Math.abs(r.mae) < 10 ? r.mae.toFixed(3) : r.mae.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                        {r.posteriorProbBetterThanSecond !== null ? `${(r.posteriorProbBetterThanSecond * 100).toFixed(1)}%` : '-'}
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

            {/* Dedicated Mandatory Section: MENGAPA SUMBER INI MENJADI YANG TERBAIK? (Section J Step 8) */}
            {activeResult.ranking.whyBestAnalysis && (
              <div
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--primary)',
                  background: 'var(--surface-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <ShieldCheck size={18} color="var(--primary)" />
                  <strong style={{ fontSize: '15px', color: 'var(--primary)' }}>
                    MENGAPA SUMBER INI MENJADI YANG TERBAIK? — {activeResult.ranking.whyBestAnalysis.headline}
                  </strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                  {activeResult.ranking.whyBestAnalysis.points.map((pt, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border-light)',
                        fontSize: '12.5px',
                        lineHeight: 1.5
                      }}
                    >
                      <strong style={{ display: 'block', color: 'var(--primary)', marginBottom: '3px' }}>{pt.label}</strong>
                      <span style={{ color: 'var(--text)' }}>{pt.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stepPoints && (
              <BulletCard title="Ringkasan Keputusan & Peringkat Seluruh Sumber (Per Poin):" points={stepPoints.step8} />
            )}
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
                <StepGlossaryButton stepId={9} isOpen={openGlossaryStep === 9} onToggle={() => toggleGlossary(9)} />
              </div>
            </div>
            <StepGlossaryDrawer stepId={9} isOpen={openGlossaryStep === 9} />

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              {([
                { id: 'stata', label: 'Tabel Hasil Bergaya Stata' },
                { id: 'visuals', label: 'Visualisasi Interaktif' },
                { id: 'interpret', label: 'Interpretasi Akademis Bahasa Indonesia' },
                { id: 'code', label: 'Stata .do & R Script Reproduksi' }
              ] as const).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setResultSubTab(t.id)}
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
                {activeResult.stataOutput.orderedStepOutputs && activeResult.stataOutput.orderedStepOutputs.length > 0 ? (
                  activeResult.stataOutput.orderedStepOutputs.map(st => (
                    <div
                      key={st.stepId}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          padding: '8px 14px',
                          background: 'var(--surface-muted)',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '8px'
                        }}
                      >
                        <strong style={{ fontSize: '12.5px', color: 'var(--text)' }}>{st.stepTitle}</strong>
                        <code
                          style={{
                            fontSize: '11.5px',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: 'var(--info-bg)',
                            color: 'var(--primary)'
                          }}
                        >
                          . {st.stataCommand}
                        </code>
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          padding: '14px',
                          background: '#0b1220',
                          color: '#e2e8f0',
                          fontSize: '12px',
                          overflowX: 'auto',
                          lineHeight: 1.5
                        }}
                      >
                        {st.outputTableText}
                      </pre>
                    </div>
                  ))
                ) : (
                  [
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
                  ))
                )}
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

            {resultSubTab === 'interpret' && stepPoints && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <BulletCard title="1. Data Panel & Sampel Lengkap (Step 1–2)" points={[...stepPoints.step1, ...stepPoints.step2]} accent={false} />
                <BulletCard title="2. Validitas Referensi & Audit Kualitas (Step 3)" points={stepPoints.step3} accent={false} />
                <BulletCard title="3. Korelasi Panel: Overall, Within-City & First-Diff (Step 4)" points={stepPoints.step4} accent={false} />
                <BulletCard title="4. Akurasi Berpasangan, Lin's CCC & Bland-Altman (Step 5)" points={stepPoints.step5} accent={false} />
                <BulletCard title="5. Model Inferensial Pair Fixed Effects & Wild Bootstrap (Step 6)" points={stepPoints.step6} accent={false} />
                <BulletCard title="6. Diagnostik Statistik & Sensitivitas Outlier (Step 7)" points={stepPoints.step7} accent={false} />
                <BulletCard title="7. Keputusan Pemeringkatan & Kesimpulan Akhir (Step 8)" points={[...stepPoints.step8, ...stepPoints.step9]} />
                <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--warn-border)', background: 'var(--warn-bg)', fontSize: '13px', lineHeight: 1.55 }}>
                  <strong style={{ display: 'block', marginBottom: '6px' }}>8. Keterbatasan Penelitian</strong>
                  <ul style={{ margin: '0 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                    <button
                      type="button"
                      className={codeTab === 'stan' ? 'btn btn-primary' : 'btn btn-outline'}
                      style={{ minHeight: '40px', fontSize: '12.5px' }}
                      onClick={() => setCodeTab('stan')}
                    >
                      Stan MCMC (.stan)
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" className="btn btn-outline" style={{ minHeight: '40px', fontSize: '12.5px' }} onClick={handleCopyCode}>
                      {copiedCode ? <><Check size={14} style={{ marginRight: '5px' }} />Tersalin</> : <><Copy size={14} style={{ marginRight: '5px' }} />Copy Code</>}
                    </button>
                    <button type="button" className="btn btn-outline" style={{ minHeight: '40px', fontSize: '12.5px' }} onClick={handleDownloadCode}>
                      <Download size={14} style={{ marginRight: '5px' }} /> Download {codeTab === 'stata' ? '.do' : codeTab === 'r' ? '.R' : '.stan'}
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

        {/* MANDATORY STATA COMMAND & STATISTICAL IMPLEMENTATION PANEL IN EVERY STEP */}
        {stepStataDocs[currentStep] && (
          <PanelAccuracyStepStataPanel bundle={stepStataDocs[currentStep]} />
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
              disabled={
                (currentStep >= 2 && !intelligentConfig.minimumRequirements.canProceed) ||
                (currentStep >= 4 && qualityReport.hasBlockingError)
              }
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
