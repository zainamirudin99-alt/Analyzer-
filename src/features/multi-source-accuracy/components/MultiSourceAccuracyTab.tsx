'use client';

import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Database,
  FileSpreadsheet,
  Info,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud
} from 'lucide-react';
import {
  buildRawSheetFromMatrix,
  generateMsmaPresetCatalog,
  parseDelimitedTextToSheet,
  profileSheetColumns,
  validateWorkbookForMsma
} from '../engine/data-validation';
import {
  autoSuggestMeasurementSources,
  createBlankSourceFromColumn
} from '../engine/panel-detection';
import { runFullMsmaPipeline } from '../engine/report-generator';
import { useMsmaHistory } from '../hooks/use-msma-history';
import {
  MsmaConfigurableSnapshot,
  MsmaConstructClass,
  MsmaJournalReportSections,
  MsmaMethodId,
  MsmaPhysicalDimension,
  MsmaRawSheet,
  MsmaStepStatus,
  MsmaTransformationId,
  MsmaUploadedWorkbook
} from '../types';
import {
  isGoogleSheetsUrlCandidate,
  parseMsmaGoogleSheetsUrl
} from '../utils/gsheet-url';
import { fmtAdaptive } from '../utils/numerical';
import {
  MsmaBlandAltmanChart,
  MsmaCorrelationHeatmap,
  MsmaDistributionBoxplotChart,
  MsmaErrorVarianceChart,
  MsmaMissingnessHeatmap,
  MsmaPairwiseScatterChart,
  MsmaRankingStabilityChart,
  MsmaRelativeRankingChart,
  MsmaResidualDiagnosticsChart,
  MsmaSensitivityComparisonChart,
  MsmaTimeSeriesChart
} from './MsmaCharts';
import { MsmaFinalReportStep } from './MsmaFinalReportStep';
import {
  MsmaBibliographyModal,
  MsmaGlossaryModal,
  MsmaHistoryModal,
  MsmaResetConfirmModal,
  MsmaStepStataBanner,
  MsmaUsageGuideModal,
  StatTermButton
} from './MsmaModals';

const WORKFLOW_STEPS: Array<{ step: number; shortLabel: string; fullTitle: string }> = [
  { step: 0, shortLabel: '0. Pengantar & Referensi', fullTitle: 'Step 0 — Introduction, Methodology References & Presets' },
  { step: 1, shortLabel: '1. Upload Data', fullTitle: 'Step 1 — Data Upload, Sheet Selection & Type Validation' },
  { step: 2, shortLabel: '2. Struktur Panel', fullTitle: 'Step 2 — Panel Entity & Time Structure Identification' },
  { step: 3, shortLabel: '3. Sumber Pengukuran', fullTitle: 'Step 3 — Measurement Source Selection & Metadata' },
  { step: 4, shortLabel: '4. Klasifikasi Contoh A/B', fullTitle: 'Step 4 — Construct Equivalence (Contoh A vs Contoh B)' },
  { step: 5, shortLabel: '5. Deskriptif & Kualitas', fullTitle: 'Step 5 — Panel Descriptive Statistics & Visual Quality Audit' },
  { step: 6, shortLabel: '6. Asumsi & Diagnostik', fullTitle: 'Step 6 — Method-Specific Assumptions & Diagnostics' },
  { step: 7, shortLabel: '7. Transformasi Data', fullTitle: 'Step 7 — Data Preprocessing & Transformation Advisor' },
  { step: 8, shortLabel: '8. Estimasi Utama', fullTitle: 'Step 8 — Adaptive Method Selection & Main Error Estimation' },
  { step: 9, shortLabel: '9. Robustness & Sensitivitas', fullTitle: 'Step 9 — Robustness & Sensitivity Analysis (8 Scenarios)' },
  { step: 10, shortLabel: '10. Laporan & Jurnal', fullTitle: 'Step 10 — Final Statistical Report & Journal Generator' }
];

const PHYSICAL_DIMENSION_OPTIONS: Array<{ value: MsmaPhysicalDimension; label: string }> = [
  { value: 'EMISSION_FLUX_MASS_PER_TIME', label: 'Fluks Emisi Massa per Waktu (mis. ton/tahun, kt CO₂/tahun)' },
  { value: 'ATMOSPHERIC_MOLE_FRACTION', label: 'Fraksi Mol Kolom Atmosfer (mis. XCO₂ ppm, ppb)' },
  { value: 'SURFACE_CONCENTRATION', label: 'Konsentrasi Udara Ambien Permukaan (mis. ppm lokal, µg/m³)' },
  { value: 'ENERGY_INTENSITY', label: 'Konsumsi / Intensitas Energi (mis. TJ, MWh)' },
  { value: 'MONETARY_VALUE', label: 'Nilai Moneter / Ekonomi (mis. Rp Miliar, USD)' },
  { value: 'INDEX_SCORE', label: 'Skor Indeks / Rasio Tanpa Dimensi' },
  { value: 'OTHER_CUSTOM', label: 'Besaran Fisik Lainnya' }
];

function statusColorVars(status: MsmaStepStatus): { bg: string; border: string; fg: string } {
  switch (status) {
    case 'Selesai':
      return { bg: 'var(--success-bg)', border: 'var(--success-border)', fg: 'var(--success)' };
    case 'Perlu perhatian':
    case 'Sedang diproses':
      return { bg: 'var(--warn-bg)', border: 'var(--warn-border)', fg: 'var(--warn)' };
    case 'Tidak memenuhi':
    case 'Tidak dapat diidentifikasi':
      return { bg: 'var(--danger-bg)', border: 'var(--danger-border)', fg: 'var(--danger)' };
    default:
      return { bg: 'var(--surface-muted)', border: 'var(--border)', fg: 'var(--text-muted)' };
  }
}

export const MultiSourceAccuracyTab: React.FC = () => {
  const presetCatalog = useMemo(() => generateMsmaPresetCatalog(), []);
  const initialPreset = presetCatalog[0];

  const [workbook, setWorkbook] = useState<MsmaUploadedWorkbook>(initialPreset.workbook);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [visitedMaxStep, setVisitedMaxStep] = useState<number>(0);

  // Modals state
  const [refsModalOpen, setRefsModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [activeGlossaryKey, setActiveGlossaryKey] = useState<string | null>(null);
  const [showClassReasons, setShowClassReasons] = useState(false);
  const [beforeAfterTransformPreviewId, setBeforeAfterTransformPreviewId] = useState<MsmaTransformationId | null>(null);

  // Step 1 upload helpers
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const gsheetInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'upload' | 'gsheet' | 'paste'>('upload');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sheetStatusNotice, setSheetStatusNotice] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [gsheetUrl, setGsheetUrl] = useState('');
  const [gsheetTouched, setGsheetTouched] = useState(false);
  const [gsheetFieldError, setGsheetFieldError] = useState<string | null>(null);
  const [gsheetBusy, setGsheetBusy] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const initialSnapshot: MsmaConfigurableSnapshot = useMemo(
    () => ({
      activeSheetName: initialPreset.workbook.activeSheetName,
      headerRowIndex: 0,
      entityColumn: initialPreset.entityColumn,
      timeColumn: initialPreset.timeColumn,
      sources: initialPreset.presetSources.map(s => ({ ...s })),
      classificationOverride: null,
      userConfirmedClassification: true,
      activeTransformation: 'NONE',
      rejectedTransformations: [],
      dropDuplicates: false,
      outlierHandling: 'KEEP_ALL',
      missingHandling: 'COMPLETE_CASE',
      preferredMethodOverride: null,
      demingLambdaRatio: 1,
      demingLambdaExternalKnown: false,
      bootstrapReplications: 250
    }),
    [initialPreset]
  );

  const {
    config,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    auditTrail,
    reinitializeWithWorkbook,
    commitChange,
    undo,
    redo,
    resetStep,
    restoreOriginalData,
    resetEntireAnalysis
  } = useMsmaHistory(initialSnapshot);

  // Deterministic full pipeline computation
  const analysis = useMemo(() => runFullMsmaPipeline(workbook, config), [workbook, config]);

  const [journalOverrides, setJournalOverrides] = useState<Partial<MsmaJournalReportSections>>({});
  const journalDraft = useMemo<MsmaJournalReportSections>(
    () => ({ ...analysis.journalDefault, ...journalOverrides }),
    [analysis.journalDefault, journalOverrides]
  );

  const goToStep = (step: number) => {
    const clamped = Math.max(0, Math.min(10, step));
    setCurrentStep(clamped);
    setVisitedMaxStep(prev => Math.max(prev, clamped));
  };

  // Load one of the 5 research presets
  const handleSelectPreset = (presetId: typeof presetCatalog[number]['presetId']) => {
    const chosen = presetCatalog.find(p => p.presetId === presetId) ?? presetCatalog[0];
    setWorkbook(chosen.workbook);
    setUploadError(null);
    setJournalOverrides({});
    reinitializeWithWorkbook(
      {
        activeSheetName: chosen.workbook.activeSheetName,
        headerRowIndex: 0,
        entityColumn: chosen.entityColumn,
        timeColumn: chosen.timeColumn,
        sources: chosen.presetSources.map(s => ({ ...s })),
        classificationOverride: null,
        userConfirmedClassification: true,
        activeTransformation: 'NONE',
        rejectedTransformations: [],
        dropDuplicates: false,
        outlierHandling: 'KEEP_ALL',
        missingHandling: 'COMPLETE_CASE',
        preferredMethodOverride: null,
        demingLambdaRatio: 1,
        demingLambdaExternalKnown: false,
        bootstrapReplications: 250
      },
      chosen.workbook.fileName
    );
    goToStep(1);
  };

  // Parse local .xlsx / .xls / .csv file
  const handleUploadedFile = async (file: File) => {
    setUploadError(null);
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Ukuran berkas melebihi batas 10 MB untuk paket hosting gratis.');
      return;
    }

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      let rawSheets: MsmaRawSheet[] = [];

      if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
        const text = await file.text();
        rawSheets = [parseDelimitedTextToSheet(text, 'CSV_Sheet1')];
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          setUploadError('Berkas spreadsheet tidak memiliki worksheet yang dapat dibaca.');
          return;
        }
        rawSheets = wb.SheetNames.map(sName => {
          const ws = wb.Sheets[sName];
          const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
          return buildRawSheetFromMatrix(sName, matrix, 0);
        });
      } else {
        setUploadError('Format berkas tidak didukung. Unggah berkas .xlsx, .xls, atau .csv.');
        return;
      }

      const validated = validateWorkbookForMsma(file.name, file.size, 'upload', rawSheets);
      setWorkbook(validated);
      setJournalOverrides({});

      if (validated.isValid) {
        const activeSheet =
          validated.sheets.find(s => s.sheetName === validated.activeSheetName) ?? validated.sheets[0];
        const profiles = profileSheetColumns(activeSheet);
        const entCol = profiles.find(p => p.suggestedRole === 'entity_id')?.columnName ?? activeSheet.columns[0] ?? '';
        const timeCol =
          profiles.find(p => p.suggestedRole === 'time_id' && p.columnName !== entCol)?.columnName ??
          activeSheet.columns.find(c => c !== entCol) ??
          '';
        const autoSrcs = autoSuggestMeasurementSources(profiles, entCol, timeCol);

        reinitializeWithWorkbook(
          {
            activeSheetName: activeSheet.sheetName,
            headerRowIndex: 0,
            entityColumn: entCol,
            timeColumn: timeCol,
            sources: autoSrcs,
            classificationOverride: null,
            userConfirmedClassification: false,
            activeTransformation: 'NONE',
            rejectedTransformations: [],
            dropDuplicates: false,
            outlierHandling: 'KEEP_ALL',
            missingHandling: 'COMPLETE_CASE',
            preferredMethodOverride: null,
            demingLambdaRatio: 1,
            demingLambdaExternalKnown: false,
            bootstrapReplications: 250
          },
          file.name
        );
        setSheetStatusNotice(
          validated.sheets.length > 1
            ? `Berhasil memuat ${validated.sheets.length} worksheet dari "${file.name}". Sheet aktif: "${activeSheet.sheetName}" (${activeSheet.rowCount} baris × ${activeSheet.columnCount} kolom). Pilih sheet lain di bawah jika diperlukan.`
            : `Berhasil memuat berkas "${file.name}" — 1 worksheet aktif: "${activeSheet.sheetName}" (${activeSheet.rowCount} baris × ${activeSheet.columnCount} kolom).`
        );
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Gagal membaca struktur berkas unggahan.');
    }
  };

  // Multi-sheet Google Sheets public XLSX importer via isolated SSRF-guarded /api/msma/import-link
  const handleImportGoogleSheet = async (overrideUrl?: string) => {
    const trimmed = (overrideUrl ?? gsheetUrl).trim();
    setGsheetTouched(true);
    const urlCheck = parseMsmaGoogleSheetsUrl(trimmed);
    if (!urlCheck.isValid) {
      setGsheetFieldError(urlCheck.error || 'Tautan Google Sheets tidak valid.');
      gsheetInputRef.current?.focus();
      return;
    }

    setGsheetFieldError(null);
    try {
      setGsheetBusy(true);
      setUploadError(null);
      setSheetStatusNotice(null);
      const res = await fetch('/api/msma/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed })
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data?.fileBase64) {
        throw new Error(
          json.error ||
            'Tautan Google Sheets tidak dapat diakses publik. Pastikan pengaturan berbagi diubah ke "Anyone with the link (Viewer)" atau unduh berkas sebagai .xlsx lalu unggah pada tab Excel.'
        );
      }
      const binStr = window.atob(json.data.fileBase64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      const wb = XLSX.read(bytes, { type: 'array' });
      const rawSheets = wb.SheetNames.map(sName => {
        const ws = wb.Sheets[sName];
        const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
        return buildRawSheetFromMatrix(sName, matrix, 0);
      });
      const validated = validateWorkbookForMsma(
        json.data.originalName || 'Google_Sheets_Import.xlsx',
        json.data.sizeBytes || bytes.length,
        'google_sheets',
        rawSheets
      );
      setWorkbook(validated);
      setJournalOverrides({});
      if (validated.isValid) {
        const activeSheet =
          validated.sheets.find(s => s.sheetName === validated.activeSheetName) ?? validated.sheets[0];
        const profiles = profileSheetColumns(activeSheet);
        const entCol = profiles.find(p => p.suggestedRole === 'entity_id')?.columnName ?? activeSheet.columns[0] ?? '';
        const timeCol =
          profiles.find(p => p.suggestedRole === 'time_id' && p.columnName !== entCol)?.columnName ??
          activeSheet.columns.find(c => c !== entCol) ??
          '';
        reinitializeWithWorkbook(
          {
            activeSheetName: activeSheet.sheetName,
            headerRowIndex: 0,
            entityColumn: entCol,
            timeColumn: timeCol,
            sources: autoSuggestMeasurementSources(profiles, entCol, timeCol),
            classificationOverride: null,
            userConfirmedClassification: false,
            activeTransformation: 'NONE',
            rejectedTransformations: [],
            dropDuplicates: false,
            outlierHandling: 'KEEP_ALL',
            missingHandling: 'COMPLETE_CASE',
            preferredMethodOverride: null,
            demingLambdaRatio: 1,
            demingLambdaExternalKnown: false,
            bootstrapReplications: 250
          },
          validated.fileName
        );
        setSheetStatusNotice(
          validated.sheets.length > 1
            ? `Berhasil mengimpor ${validated.sheets.length} worksheet dari Google Sheets! Sheet aktif: "${activeSheet.sheetName}" (${activeSheet.rowCount} baris × ${activeSheet.columnCount} kolom). Pilih nomor/nama sheet lain pada panel Pilihan Worksheet di bawah.`
            : `Berhasil mengimpor Google Sheets — 1 worksheet ditemukan: "${activeSheet.sheetName}" (${activeSheet.rowCount} baris × ${activeSheet.columnCount} kolom).`
        );
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Gagal mengimpor tautan Google Sheets.');
    } finally {
      setGsheetBusy(false);
    }
  };

  // Switch active sheet or header row index in Step 1 without auto-merging sheets
  const handleChangeSheetOrHeader = (sheetName: string, headerIdx: number) => {
    const updatedSheets = workbook.sheets.map(s =>
      s.sheetName === sheetName ? buildRawSheetFromMatrix(s.sheetName, s.rawMatrix, headerIdx) : s
    );
    const validated = validateWorkbookForMsma(
      workbook.fileName,
      workbook.fileSizeBytes,
      workbook.sourceKind,
      updatedSheets,
      sheetName
    );
    setWorkbook(validated);
    const targetSheet =
      validated.sheets.find(s => s.sheetName === sheetName) ?? validated.sheets[0];
    const targetIdx = validated.sheets.findIndex(s => s.sheetName === targetSheet.sheetName);
    const profiles = profileSheetColumns(targetSheet);
    const entCol = profiles.find(p => p.suggestedRole === 'entity_id')?.columnName ?? targetSheet.columns[0] ?? '';
    const timeCol =
      profiles.find(p => p.suggestedRole === 'time_id' && p.columnName !== entCol)?.columnName ??
      targetSheet.columns.find(c => c !== entCol) ??
      '';
    const autoSrcs = autoSuggestMeasurementSources(profiles, entCol, timeCol);

    commitChange(
      prev => ({
        ...prev,
        activeSheetName: sheetName,
        headerRowIndex: headerIdx,
        entityColumn: entCol,
        timeColumn: timeCol,
        sources: autoSrcs,
        classificationOverride: null
      }),
      1,
      'Ubah Sheet / Baris Header',
      `Sheet aktif: "${sheetName}" (baris header ke-${headerIdx + 1}).`
    );
    setSheetStatusNotice(
      `Sheet aktif beralih ke Sheet ${targetIdx + 1}: "${targetSheet.sheetName}" (${targetSheet.rowCount} baris × ${targetSheet.columnCount} kolom, header baris ke-${headerIdx + 1}).`
    );
  };

  const activeSheet =
    workbook.sheets.find(s => s.sheetName === config.activeSheetName) ?? workbook.sheets[0];

  // Compute per-step status badges
  const getStepStatus = (stepNum: number): MsmaStepStatus => {
    if (stepNum > visitedMaxStep && stepNum !== currentStep) return 'Belum dikerjakan';
    if (stepNum === currentStep) return 'Sedang diproses';
    if (stepNum === 1) return workbook.isValid ? 'Selesai' : 'Tidak memenuhi';
    if (stepNum === 2) return analysis.panel.nEntities >= 2 && analysis.panel.nPeriods >= 2 ? (analysis.panel.isBalanced ? 'Selesai' : 'Perlu perhatian') : 'Tidak memenuhi';
    if (stepNum === 3) return config.sources.length >= 2 ? 'Selesai' : 'Tidak memenuhi';
    if (stepNum === 4) return analysis.classification.allowsJointCollocationRanking ? 'Selesai' : 'Tidak memenuhi';
    if (stepNum === 6) return analysis.diagnostics.overallStatus;
    if (stepNum === 8) return analysis.decision.eligibilityStatus;
    return 'Selesai';
  };

  const previewTableCaptionId = 'msma-preview-table-cap';
  const typeTableCaptionId = 'msma-type-table-cap';
  const descTableCaptionId = 'msma-desc-table-cap';
  const diagTableCaptionId = 'msma-diag-table-cap';
  const transTableCaptionId = 'msma-trans-table-cap';
  const estTableCaptionId = 'msma-est-table-cap';
  const robTableCaptionId = 'msma-rob-table-cap';

  const activeEstimates =
    analysis.estimation.tcaResult?.estimates ??
    analysis.estimation.multiSourceResult?.estimates ??
    [];

  const identifiabilityBadgeText = !analysis.classification.allowsJointCollocationRanking
    ? 'Diblokir (Contoh B)'
    : config.sources.length === 2
      ? 'Agreement Teridentifikasi (Ranking Individual Under-ID)'
      : analysis.estimation.tcaResult?.isIdentifiable || analysis.estimation.multiSourceResult?.isIdentifiable
        ? 'Teridentifikasi Penuh'
        : 'Tidak Dapat Diidentifikasi';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Feature Concept & 6 Real-Time Status Indicators (Section C) */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              OPTION 4 · ISOLATED MODULE
            </div>
            <h3 style={{ margin: '2px 0 0', fontSize: '19px', fontWeight: 800, color: 'var(--text)' }}>
              Multi-Source Measurement Accuracy Analysis
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>
              Statistical Evaluation of Multiple Measurement Sources Without Ground Truth Using Panel Data.
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '880px', lineHeight: 1.5 }}>
              Membandingkan akurasi relatif dua atau lebih sumber pengukuran berdasarkan estimasi varians galat terkalibrasi, pemeriksaan konstruk fisik (Contoh A vs Contoh B), dan pendekatan collocation adaptif sesuai jumlah sumber serta struktur data panel.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setRefsModalOpen(true)}
              style={{ minHeight: '44px', padding: '8px 13px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <BookOpen size={15} />
              <span>Referensi Jurnal (18)</span>
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setActiveGlossaryKey('ground_truth')}
              style={{ minHeight: '44px', padding: '8px 13px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Info size={15} />
              <span>Keterangan Istilah</span>
            </button>
          </div>
        </div>

        {/* 6 Mandatory Badges (Section C) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '8px' }}>
          {[
            { label: '1. Jumlah Sumber', value: `J = ${config.sources.length} Sumber Aktif` },
            { label: '2. Struktur Data Panel', value: `${analysis.panel.nEntities} Kota × ${analysis.panel.nPeriods} Periode (${analysis.panel.isBalanced ? 'Balanced' : 'Unbalanced'})` },
            { label: '3. Kesamaan Pengukuran', value: analysis.classification.finalClassification === 'CONTOH_A' ? 'Contoh A (Same Construct)' : analysis.classification.finalClassification === 'CONTOH_B' ? 'Contoh B (Different Construct)' : 'Belum Ditentukan' },
            { label: '4. Metode Direkomendasikan', value: analysis.decision.recommendedMethod.replace(/_/g, ' ') },
            { label: '5. Status Kelayakan Asumsi', value: analysis.diagnostics.overallStatus },
            { label: '6. Status Identifikasi Model', value: identifiabilityBadgeText }
          ].map(badge => (
            <div
              key={badge.label}
              style={{
                padding: '9px 12px',
                borderRadius: '10px',
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>{badge.label}</div>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>{badge.value}</div>
            </div>
          ))}
        </div>

        {/* Global Undo / Redo / Restore / Audit Trail Bar (Section I) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            paddingTop: '10px',
            borderTop: '1px solid var(--border)'
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!canUndo}
              onClick={undo}
              style={{ minHeight: '42px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <ArrowLeft size={14} />
              <span>Undo ({undoCount})</span>
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!canRedo}
              onClick={redo}
              style={{ minHeight: '42px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <ArrowRight size={14} />
              <span>Redo ({redoCount})</span>
            </button>
            {currentStep >= 2 && currentStep <= 8 && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => resetStep(currentStep)}
                style={{ minHeight: '42px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <RefreshCw size={14} />
                <span>Reset Step {currentStep}</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline"
              onClick={restoreOriginalData}
              style={{ minHeight: '42px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <Database size={14} />
              <span>Restore Original Data</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setHistoryModalOpen(true)}
              style={{ minHeight: '42px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <Clock size={14} />
              <span>Riwayat ({auditTrail.length})</span>
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setResetModalOpen(true)}
              style={{ minHeight: '42px', padding: '6px 12px', fontSize: '12px', color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
            >
              Reset Entire Analysis
            </button>
          </div>
        </div>
      </div>

      {/* Main Layout: Left Stepper + Right Active Step Workspace */}
      <div className="msma-layout-grid">
        {/* Progress Stepper Sidebar */}
        <nav aria-label="Tahapan Analisis Multi-Sumber" className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-muted)', padding: '4px 6px' }}>
            PROGRESS WORKFLOW ({Math.round((currentStep / 10) * 100)}%)
          </div>
          <div style={{ height: '6px', borderRadius: '999px', background: 'var(--surface-sunken)', overflow: 'hidden', margin: '0 6px 6px' }}>
            <div style={{ width: `${(currentStep / 10) * 100}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.2s ease' }} />
          </div>

          {WORKFLOW_STEPS.map(ws => {
            const st = getStepStatus(ws.step);
            const colors = statusColorVars(st);
            const active = ws.step === currentStep;
            return (
              <button
                key={ws.step}
                type="button"
                onClick={() => goToStep(ws.step)}
                aria-current={active ? 'step' : undefined}
                style={{
                  textAlign: 'left',
                  minHeight: '46px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: active ? '2px solid var(--primary)' : `1px solid ${colors.border}`,
                  background: active ? 'var(--info-bg)' : 'var(--surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text)' }}>{ws.shortLabel}</span>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: colors.fg }}>{st}</span>
              </button>
            );
          })}
        </nav>

        {/* Active Step Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {/* Step Header Card */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)' }}>
                TAHAP {currentStep} DARI 10 · STATUS: {getStepStatus(currentStep).toUpperCase()}
              </div>
              <h3 style={{ margin: '2px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>
                {WORKFLOW_STEPS[currentStep]?.fullTitle}
              </h3>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <StatTermButton termKey="ground_truth" onOpenTerm={setActiveGlossaryKey} />
              <StatTermButton termKey="identifiability" onOpenTerm={setActiveGlossaryKey} />
              {config.sources.length === 3 && (
                <StatTermButton termKey="triple_collocation" onOpenTerm={setActiveGlossaryKey} />
              )}
              {config.sources.length === 2 && (
                <StatTermButton termKey="bland_altman" onOpenTerm={setActiveGlossaryKey} />
              )}
              {config.sources.length >= 4 && (
                <StatTermButton termKey="extended_collocation" onOpenTerm={setActiveGlossaryKey} />
              )}
            </div>
          </div>

          {/* Per-Step Stata Command Banner (Steps 1-9) */}
          {currentStep >= 1 && currentStep <= 9 && (
            <MsmaStepStataBanner bundle={analysis.stepStataCommands[currentStep - 1]} />
          )}

          {/* =========================================================
              STEP 0: INTRODUCTION, REFERENCES & PRESET DATASETS
              ========================================================= */}
          {currentStep === 0 && (
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                  Evaluasi Akurasi Pengukuran Multi-Sumber Tanpa Ground Truth pada Data Panel
                </h4>
                <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Dalam banyak studi lingkungan, ekonomi regional, dan penginderaan jauh (contohnya data emisi CO₂ seluruh kota di Indonesia selama enam tahun dari <strong>Pelaporan Mandiri Pemkot</strong>, <strong>Pengukuran Satelit</strong>, dan <strong>Sensor Lapangan</strong>), tidak tersedia satu pun data referensi yang bebas kesalahan mutlak (<StatTermButton termKey="ground_truth" onOpenTerm={setActiveGlossaryKey} />). Modul ini memeriksa karakteristik panel dan kesamaan besaran fisik terlebih dahulu sebelum memilih metode estimasi <StatTermButton termKey="error_variance" onOpenTerm={setActiveGlossaryKey} /> yang teridentifikasi secara statistik.
                </p>
              </div>

              {/* 4 Required Step 0 Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => goToStep(1)}
                  style={{ minHeight: '52px', fontSize: '13.5px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Play size={16} />
                  <span>1. Mulai Analisis</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRefsModalOpen(true)}
                  style={{ minHeight: '52px', fontSize: '13.5px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <BookOpen size={16} />
                  <span>2. Referensi Metodologi</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setGuideModalOpen(true)}
                  style={{ minHeight: '52px', fontSize: '13.5px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Info size={16} />
                  <span>3. Panduan Penggunaan</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleSelectPreset('CONTOH_A_CO2_3SRC')}
                  style={{ minHeight: '52px', fontSize: '13.5px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Database size={16} />
                  <span>4. Contoh Dataset (CO₂ Kota)</span>
                </button>
              </div>

              {/* Preset Selector Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                  Pilih Cepat Skenario Contoh Dataset Tervalidasi (5 Skenario Metodologis):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {presetCatalog.map(p => (
                    <button
                      key={p.presetId}
                      type="button"
                      onClick={() => handleSelectPreset(p.presetId)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: workbook.fileName === p.workbook.fileName ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: 'var(--surface-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text)' }}>{p.title}</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{p.subtitle}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              STEP 1: DATA UPLOAD, GOOGLE SHEETS MULTI-SHEET IMPORT, WORKSHEET & HEADER SELECTION
              ========================================================= */}
          {currentStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadedFile(f);
                    e.target.value = '';
                  }}
                />

                {/* First-Class 3-Mode Source Importer Tablist */}
                <div role="tablist" aria-label="Pilih metode sumber data Step 1" className="msma-tablist">
                  {(
                    [
                      { id: 'upload', label: 'Unggah Excel / CSV', icon: UploadCloud },
                      { id: 'gsheet', label: 'Link Google Sheets (Multi-Sheet)', icon: Link2 },
                      { id: 'paste', label: 'Tempel Teks CSV / Tabel', icon: FileSpreadsheet }
                    ] as const
                  ).map(tab => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        id={`msma-step1-tab-${tab.id}`}
                        type="button"
                        role="tab"
                        aria-selected={importMode === tab.id}
                        className="msma-tab-btn"
                        onClick={() => {
                          setImportMode(tab.id);
                          setUploadError(null);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}
                      >
                        <Icon size={15} aria-hidden="true" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab Panel 1: Excel / CSV File Upload */}
                <div
                  role="tabpanel"
                  aria-labelledby="msma-step1-tab-upload"
                  hidden={importMode !== 'upload'}
                >
                  <div
                    onDragOver={e => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragActive(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleUploadedFile(f);
                    }}
                    style={{
                      padding: '24px 18px',
                      borderRadius: '12px',
                      border: dragActive ? '2px dashed var(--primary)' : '2px dashed var(--border)',
                      background: dragActive ? 'var(--info-bg)' : 'var(--surface-muted)',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <UploadCloud size={28} color="var(--primary)" aria-hidden="true" />
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
                      Tarik &amp; Lepas Berkas Excel (<code>.xlsx</code>, <code>.xls</code>) atau <code>.csv</code> di Sini
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Maksimal 10 MB · Seluruh worksheet dalam workbook akan terbaca agar Anda bisa memilih sheet dan baris header secara manual.
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ minHeight: '44px', padding: '8px 16px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <UploadCloud size={15} aria-hidden="true" />
                        <span>Browse / Ganti File</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setImportMode('gsheet')}
                        style={{ minHeight: '44px', padding: '8px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Link2 size={15} aria-hidden="true" />
                        <span>Ambil dari Link Google Sheets</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setSheetStatusNotice(null);
                          handleSelectPreset('CONTOH_A_CO2_3SRC');
                        }}
                        style={{ minHeight: '44px', padding: '8px 14px', fontSize: '13px' }}
                      >
                        Reset ke Contoh CO₂
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tab Panel 2: Google Sheets Multi-Sheet Link Importer */}
                <div
                  role="tabpanel"
                  aria-labelledby="msma-step1-tab-gsheet"
                  hidden={importMode !== 'gsheet'}
                >
                  <form
                    method="POST"
                    noValidate
                    onSubmit={e => {
                      e.preventDefault();
                      handleImportGoogleSheet();
                    }}
                    style={{
                      padding: '16px 18px',
                      borderRadius: '12px',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label htmlFor="msma-gsheet-url" style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
                        Tautan Google Sheets Publik (Semua Sheet Otomatis Terdeteksi){' '}
                        <span aria-hidden="true" style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <span id="msma-gsheet-hint" style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Tempel link lengkap (contoh: <code>https://docs.google.com/spreadsheets/d/ID/edit?usp=sharing</code>). Pastikan izin berbagi disetel ke <strong>Anyone with the link (Viewer)</strong>. Sistem mengunduh seluruh workbook (<code>.xlsx</code>) sehingga Anda bebas memilih sheet mana pun pada panel di bawah.
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch' }}>
                      <div style={{ flex: 1, minWidth: '240px' }}>
                        <input
                          ref={gsheetInputRef}
                          id="msma-gsheet-url"
                          name="gsheetUrl"
                          type="url"
                          required
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          enterKeyHint="go"
                          className="msma-input"
                          value={gsheetUrl}
                          onChange={e => {
                            const val = e.target.value;
                            setGsheetUrl(val);
                            if (gsheetFieldError) {
                              const recheck = parseMsmaGoogleSheetsUrl(val);
                              if (recheck.isValid) setGsheetFieldError(null);
                            }
                          }}
                          onBlur={() => {
                            if (gsheetUrl.trim().length > 0) {
                              setGsheetTouched(true);
                              const check = parseMsmaGoogleSheetsUrl(gsheetUrl);
                              setGsheetFieldError(check.isValid ? null : check.error || 'Tautan tidak valid.');
                            }
                          }}
                          aria-invalid={gsheetTouched && Boolean(gsheetFieldError) ? 'true' : 'false'}
                          aria-describedby={
                            gsheetTouched && gsheetFieldError
                              ? 'msma-gsheet-hint msma-gsheet-error'
                              : 'msma-gsheet-hint'
                          }
                          placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
                        />
                      </div>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={gsheetBusy}
                        style={{ minHeight: '48px', padding: '10px 18px', fontSize: '13px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Link2 size={15} aria-hidden="true" />
                        <span>{gsheetBusy ? 'Mengunduh Semua Sheet...' : 'Impor & Baca Semua Sheet'}</span>
                      </button>
                    </div>

                    {gsheetTouched && gsheetFieldError && (
                      <div
                        id="msma-gsheet-error"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', fontSize: '12.5px', fontWeight: 700 }}
                      >
                        <AlertCircle size={15} aria-hidden="true" />
                        <span>Error: {gsheetFieldError}</span>
                      </div>
                    )}
                  </form>
                </div>

                {/* Tab Panel 3: Direct Tabular CSV / TSV Paste (with smart Google Sheets URL auto-routing) */}
                <div
                  role="tabpanel"
                  aria-labelledby="msma-step1-tab-paste"
                  hidden={importMode !== 'paste'}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label htmlFor="msma-paste-csv" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                      Tempel Baris Data CSV / Tab-Separated (bukan tautan URL)
                    </label>
                    <span id="msma-paste-hint" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Salin langsung sel tabel (baris 1 = nama kolom, baris berikutnya = data panel). Jika Anda menempel link Google Sheets di sini, sistem otomatis mengalihkannya ke tab Link Google Sheets.
                    </span>
                    <textarea
                      id="msma-paste-csv"
                      rows={5}
                      aria-describedby="msma-paste-hint"
                      className="msma-input"
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      placeholder="Kota,Tahun,Emisi_Pemkot,Emisi_Satelit,Emisi_Sensor&#10;Jakarta,2020,1240,1295,1270"
                      style={{ fontFamily: 'monospace' }}
                    />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={gsheetBusy}
                        onClick={() => {
                          const trimmed = pasteText.trim();
                          if (isGoogleSheetsUrlCandidate(trimmed)) {
                            setImportMode('gsheet');
                            setGsheetUrl(trimmed);
                            setPasteText('');
                            handleImportGoogleSheet(trimmed);
                            return;
                          }
                          setUploadError(null);
                          const sh = parseDelimitedTextToSheet(pasteText, 'Pasted_Sheet');
                          const val = validateWorkbookForMsma('Tempel_Data_Panel.csv', pasteText.length, 'paste', [sh]);
                          setWorkbook(val);
                          setJournalOverrides({});
                          if (val.isValid) {
                            const profs = profileSheetColumns(sh);
                            const ent = profs.find(p => p.suggestedRole === 'entity_id')?.columnName ?? sh.columns[0] ?? '';
                            const tm = profs.find(p => p.suggestedRole === 'time_id' && p.columnName !== ent)?.columnName ?? sh.columns[1] ?? '';
                            reinitializeWithWorkbook(
                              {
                                activeSheetName: sh.sheetName,
                                headerRowIndex: 0,
                                entityColumn: ent,
                                timeColumn: tm,
                                sources: autoSuggestMeasurementSources(profs, ent, tm),
                                classificationOverride: null,
                                userConfirmedClassification: false,
                                activeTransformation: 'NONE',
                                rejectedTransformations: [],
                                dropDuplicates: false,
                                outlierHandling: 'KEEP_ALL',
                                missingHandling: 'COMPLETE_CASE',
                                preferredMethodOverride: null,
                                demingLambdaRatio: 1,
                                demingLambdaExternalKnown: false,
                                bootstrapReplications: 250
                              },
                              val.fileName
                            );
                            setSheetStatusNotice(
                              `Data tempel berhasil dimuat: ${sh.rowCount} baris × ${sh.columnCount} kolom.`
                            );
                          }
                        }}
                        style={{ minHeight: '44px', padding: '8px 16px' }}
                      >
                        Muat Data Tempel
                      </button>
                    </div>
                  </div>
                </div>

                {uploadError && (
                  <div
                    role="alert"
                    style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {sheetStatusNotice && (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--text)', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <CheckCircle2 size={16} color="var(--success)" aria-hidden="true" />
                    <span>{sheetStatusNotice}</span>
                  </div>
                )}

                {/* Prominent Multi-Sheet Selector (Visible Radio Cards for 2-5 sheets + Select Dropdown for 6+ / quick jump) */}
                {workbook.sheets.length >= 2 && workbook.sheets.length <= 5 && (
                  <fieldset className="msma-sheet-fieldset">
                    <legend>
                      Pilih Worksheet Aktif ({workbook.sheets.length} Sheet Terdeteksi pada{' '}
                      {workbook.sourceKind === 'google_sheets' ? 'Google Sheets' : workbook.fileName})
                    </legend>
                    <div className="msma-sheet-grid">
                      {workbook.sheets.map((sh, idx) => {
                        const isSelected = sh.sheetName === config.activeSheetName;
                        const radioId = `msma-sheet-radio-${idx}`;
                        return (
                          <label
                            key={sh.sheetName}
                            htmlFor={radioId}
                            className="msma-sheet-option"
                            data-selected={isSelected ? 'true' : 'false'}
                          >
                            <input
                              id={radioId}
                              type="radio"
                              name="msma-active-sheet"
                              value={sh.sheetName}
                              checked={isSelected}
                              onChange={() => handleChangeSheetOrHeader(sh.sheetName, config.headerRowIndex)}
                            />
                            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <strong style={{ fontSize: '12.5px', color: 'var(--text)' }}>
                                Sheet {idx + 1}: {sh.sheetName}
                              </strong>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                {sh.rowCount} baris × {sh.columnCount} kolom
                                {isSelected ? ' · Aktif' : ''}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                {/* File Summary, Dropdown Sheet Selector (always usable for 1 or 6+ sheets) & Header Row Selector */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '10px' }}>
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Sumber &amp; Nama Berkas ({workbook.sourceKind === 'google_sheets' ? 'Google Sheets' : workbook.sourceKind === 'upload' ? 'Excel/CSV' : workbook.sourceKind === 'paste' ? 'Tempel CSV' : 'Preset'})
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                      {workbook.fileName} ({(workbook.fileSizeBytes / 1024).toFixed(1)} KB)
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Jumlah Worksheet &amp; Dimensi Aktif</div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                      {workbook.sheets.length} Sheet · {activeSheet?.rowCount ?? 0} Baris × {activeSheet?.columnCount ?? 0} Kolom
                    </div>
                  </div>
                  <div>
                    <label htmlFor="msma-sheet-select" style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Pilih Sheet ({workbook.sheets.length} Tersedia):
                    </label>
                    <select
                      id="msma-sheet-select"
                      className="msma-input"
                      value={config.activeSheetName}
                      onChange={e => handleChangeSheetOrHeader(e.target.value, config.headerRowIndex)}
                    >
                      {workbook.sheets.map((sh, idx) => (
                        <option key={sh.sheetName} value={sh.sheetName}>
                          Sheet {idx + 1}: {sh.sheetName} ({sh.rowCount} baris × {sh.columnCount} kolom)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="msma-header-row" style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Baris Header Nama Variabel:
                    </label>
                    <select
                      id="msma-header-row"
                      className="msma-input"
                      value={config.headerRowIndex}
                      onChange={e => handleChangeSheetOrHeader(config.activeSheetName, Number(e.target.value))}
                    >
                      {[0, 1, 2, 3, 4].map(rIdx => (
                        <option key={rIdx} value={rIdx}>
                          Baris ke-{rIdx + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {workbook.validationMessages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: workbook.isValid ? 'var(--success-bg)' : 'var(--danger-bg)',
                      border: `1px solid ${workbook.isValid ? 'var(--success-border)' : 'var(--danger-border)'}`,
                      fontSize: '12.5px',
                      color: 'var(--text)'
                    }}
                  >
                    {msg}
                  </div>
                ))}
              </div>

              {/* Column Type Detection Table */}
              <div tabIndex={0} role="region" aria-labelledby={typeTableCaptionId} className="msma-table-wrapper">
                <table className="msma-table">
                  <caption id={typeTableCaptionId}>
                    Deteksi Tipe Data &amp; Validasi Kolom Numerik / Kategorik ({workbook.columnProfiles.length} Kolom)
                  </caption>
                  <thead>
                    <tr>
                      <th>Nama Kolom</th>
                      <th>Tipe Terdeteksi</th>
                      <th>Valid / Total</th>
                      <th>Missing (%)</th>
                      <th>Nilai Unik</th>
                      <th>Peran Disarankan</th>
                      <th>Contoh Nilai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workbook.columnProfiles.map(col => (
                      <tr key={col.columnName}>
                        <th scope="row" style={{ fontWeight: 800 }}>{col.columnName}</th>
                        <td>{col.detectedType.toUpperCase()}</td>
                        <td>{col.validCount} / {col.totalCount}</td>
                        <td>{col.missingPct.toFixed(1)}%</td>
                        <td>{col.uniqueCount}</td>
                        <td>{col.suggestedRole}</td>
                        <td>{col.sampleValues.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Data Preview >= 20 Rows */}
              {activeSheet && (
                <div tabIndex={0} role="region" aria-labelledby={previewTableCaptionId} className="msma-table-wrapper">
                  <table className="msma-table">
                    <caption id={previewTableCaptionId}>
                      Pratinjau 25 Baris Pertama dari Total {activeSheet.rowCount} Baris × {activeSheet.columnCount} Kolom (Sheet: {activeSheet.sheetName})
                    </caption>
                    <thead>
                      <tr>
                        <th>#</th>
                        {activeSheet.columns.map(c => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSheet.rows.slice(0, 25).map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td>{rIdx + 1}</td>
                          {activeSheet.columns.map(c => (
                            <td key={c}>{row[c] === null || row[c] === undefined ? '—' : String(row[c])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              STEP 2: IDENTIFIKASI STRUKTUR PANEL
              ========================================================= */}
          {currentStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  <span>Rekomendasi otomatis mendeteksi kolom ID Entitas: <strong>{analysis.panel.recommendedEntityColumn}</strong> dan Waktu: <strong>{analysis.panel.recommendedTimeColumn}</strong>.</span>
                  <StatTermButton termKey="balanced_panel" onOpenTerm={setActiveGlossaryKey} />
                  <StatTermButton termKey="unbalanced_panel" onOpenTerm={setActiveGlossaryKey} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div>
                    <label htmlFor="msma-ent-col" style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                      Panel ID / Entity ID (mis. Kota):
                    </label>
                    <select
                      id="msma-ent-col"
                      value={analysis.panel.entityColumn}
                      onChange={e =>
                        commitChange(
                          prev => ({ ...prev, entityColumn: e.target.value }),
                          2,
                          'Ubah Kolom Entity ID',
                          `Entity ID diubah ke "${e.target.value}".`
                        )
                      }
                      style={{ width: '100%', minHeight: '44px', padding: '8px 10px', fontSize: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    >
                      {activeSheet?.columns.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="msma-time-col" style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                      Time ID / Periode (mis. Tahun):
                    </label>
                    <select
                      id="msma-time-col"
                      value={analysis.panel.timeColumn}
                      onChange={e =>
                        commitChange(
                          prev => ({ ...prev, timeColumn: e.target.value }),
                          2,
                          'Ubah Kolom Time ID',
                          `Time ID diubah ke "${e.target.value}".`
                        )
                      }
                      style={{ width: '100%', minHeight: '44px', padding: '8px 10px', fontSize: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    >
                      {activeSheet?.columns
                        .filter(c => c !== analysis.panel.entityColumn)
                        .map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Panel KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '10px' }}>
                  {[
                    { k: 'Jumlah Entitas (Kota)', v: `${analysis.panel.nEntities} entitas` },
                    { k: 'Jumlah Periode (Tahun)', v: `${analysis.panel.nPeriods} periode` },
                    { k: 'Observasi Tersedia', v: `${analysis.panel.validPanelRows} baris` },
                    { k: 'Sel Panel Hilang', v: `${analysis.panel.missingPanelCells} sel` },
                    { k: 'Duplikat Entitas-Waktu', v: `${analysis.panel.duplicatePairsCount} duplikat` },
                    { k: 'Entitas Ber-Gap Periode', v: `${analysis.panel.periodGapEntitiesCount} entitas` },
                    { k: 'Struktur Keseimbangan', v: analysis.panel.isBalanced ? 'Balanced Panel' : 'Unbalanced Panel' },
                    { k: 'Risiko Bias Missingness', v: analysis.panel.potentialMissingnessBiasRisk }
                  ].map(kpi => (
                    <div key={kpi.k} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>{kpi.k}</div>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>{kpi.v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--info-bg)', border: '1px solid var(--info-border)', fontSize: '12.5px', color: 'var(--text)' }}>
                  <strong>Evaluasi Struktur Panel:</strong> {analysis.panel.unbalancedEvaluationNote}
                </div>
              </div>

              {/* Per-Entity Observation Distribution Table */}
              <div tabIndex={0} role="region" aria-label="Distribusi observasi per entitas" className="msma-table-wrapper">
                <table className="msma-table">
                  <caption>Distribusi Observasi per Entitas ({analysis.panel.entityDistribution.length} Entitas)</caption>
                  <thead>
                    <tr>
                      <th>Entitas</th>
                      <th>Jumlah Observasi</th>
                      <th>Periode Awal</th>
                      <th>Periode Akhir</th>
                      <th>Jeda (Gap) Periode?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.panel.entityDistribution.slice(0, 35).map(ent => (
                      <tr key={ent.entityId}>
                        <th scope="row">{ent.entityId}</th>
                        <td>{ent.obsCount}</td>
                        <td>{ent.minPeriod}</td>
                        <td>{ent.maxPeriod}</td>
                        <td>{ent.hasGap ? 'Ada Gap' : 'Kontinu'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================
              STEP 3: PEMILIHAN & KONFIGURASI SUMBER PENGUKURAN
              ========================================================= */}
          {currentStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="card" style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
                    Terpilih <strong>J = {config.sources.length} Sumber Pengukuran</strong> · Rekomendasi Metode Sementara: <strong>{analysis.decision.recommendedMethodLabel}</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Pastikan kolom ID (<code>{analysis.panel.entityColumn}</code>), Waktu (<code>{analysis.panel.timeColumn}</code>), maupun variabel kontrol tidak dimasukkan sebagai sumber pengukuran.
                  </div>
                </div>

                {activeSheet && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const usedCols = new Set([
                        analysis.panel.entityColumn,
                        analysis.panel.timeColumn,
                        ...config.sources.map(s => s.columnKey)
                      ]);
                      const nextCol = activeSheet.columns.find(c => !usedCols.has(c));
                      if (!nextCol) return;
                      commitChange(
                        prev => ({
                          ...prev,
                          sources: [...prev.sources, createBlankSourceFromColumn(nextCol, prev.sources.length + 1)]
                        }),
                        3,
                        'Tambah Sumber Pengukuran',
                        `Menambahkan kolom "${nextCol}" sebagai sumber pengukuran.`
                      );
                    }}
                    style={{ minHeight: '44px', padding: '8px 14px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={15} />
                    <span>Tambah Sumber</span>
                  </button>
                )}
              </div>

              {config.sources.map((src, idx) => (
                <div key={src.id} className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)' }}>
                      Source {idx + 1}: {src.displayName} (<code>{src.columnKey}</code>)
                    </div>
                    {config.sources.length > 2 && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() =>
                          commitChange(
                            prev => ({ ...prev, sources: prev.sources.filter(s => s.id !== src.id) }),
                            3,
                            'Hapus Sumber Pengukuran',
                            `Menghapus sumber "${src.displayName}".`
                          )
                        }
                        style={{ minHeight: '40px', padding: '6px 12px', fontSize: '12px', color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <Trash2 size={14} />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
                    <div>
                      <label htmlFor={`msma-src-col-${src.id}`} style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                        Kolom Dataset
                      </label>
                      <select
                        id={`msma-src-col-${src.id}`}
                        value={src.columnKey}
                        onChange={e =>
                          commitChange(
                            prev => ({
                              ...prev,
                              sources: prev.sources.map(s => (s.id === src.id ? { ...s, columnKey: e.target.value } : s))
                            }),
                            3,
                            'Ubah Kolom Sumber',
                            `Kolom sumber #${idx + 1} diubah ke "${e.target.value}".`
                          )
                        }
                        style={{ width: '100%', minHeight: '42px', padding: '7px 10px', fontSize: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                      >
                        {activeSheet?.columns
                          .filter(c => c !== analysis.panel.entityColumn && c !== analysis.panel.timeColumn)
                          .map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`msma-src-dim-${src.id}`} style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                        Dimensi Besaran Fisik
                      </label>
                      <select
                        id={`msma-src-dim-${src.id}`}
                        value={src.physicalDimension}
                        onChange={e =>
                          commitChange(
                            prev => ({
                              ...prev,
                              sources: prev.sources.map(s =>
                                s.id === src.id ? { ...s, physicalDimension: e.target.value as MsmaPhysicalDimension } : s
                              )
                            }),
                            3,
                            'Ubah Dimensi Fisik',
                            `Dimensi "${src.displayName}" diubah ke ${e.target.value}.`
                          )
                        }
                        style={{ width: '100%', minHeight: '42px', padding: '7px 10px', fontSize: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                      >
                        {PHYSICAL_DIMENSION_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    {(
                      [
                        { key: 'displayName', label: 'Nama Tampilan Sumber', action: 'Ubah Nama Sumber' },
                        { key: 'unit', label: 'Satuan (Unit)', action: 'Ubah Satuan Sumber' },
                        { key: 'constructDefinition', label: 'Definisi Variabel', action: 'Ubah Definisi Variabel' },
                        { key: 'spatialScope', label: 'Cakupan Spasial', action: 'Ubah Cakupan Spasial' },
                        { key: 'temporalPeriod', label: 'Periode Pengukuran', action: 'Ubah Periode Sumber' },
                        { key: 'sourceOriginInfo', label: 'Informasi Asal Instrumen', action: 'Ubah Informasi Sumber' }
                      ] as const
                    ).map(metaField => (
                      <div key={metaField.key}>
                        <label
                          htmlFor={`msma-src-${metaField.key}-${src.id}`}
                          style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}
                        >
                          {metaField.label}
                        </label>
                        <input
                          id={`msma-src-${metaField.key}-${src.id}`}
                          type="text"
                          value={src[metaField.key]}
                          onChange={e =>
                            commitChange(
                              prev => ({
                                ...prev,
                                sources: prev.sources.map(s =>
                                  s.id === src.id ? { ...s, [metaField.key]: e.target.value } : s
                                )
                              }),
                              3,
                              metaField.action,
                              `${metaField.label} "${src.displayName}" diperbarui menjadi "${e.target.value}".`
                            )
                          }
                          style={{ width: '100%', minHeight: '42px', padding: '7px 10px', fontSize: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* =========================================================
              STEP 4: KLASIFIKASI CONTOH A ATAU CONTOH B & HARMONISASI FISIK
              ========================================================= */}
          {currentStep === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                className="card"
                style={{
                  padding: '18px 20px',
                  borderLeft: `4px solid ${analysis.classification.allowsJointCollocationRanking ? 'var(--success)' : 'var(--danger)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)' }}>
                      HASIL DETEKSI OTOMATIS: {analysis.classification.autoClassification}
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>
                      Klasifikasi Aktif: {analysis.classification.finalClassification === 'CONTOH_A'
                        ? 'Contoh A — Same Measurement Construct (Besaran Fisik Sepadan)'
                        : analysis.classification.finalClassification === 'CONTOH_B'
                          ? 'Contoh B — Different Measurement Construct (Besaran Fisik Berbeda)'
                          : 'Belum Dapat Ditentukan'}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowClassReasons(v => !v)}
                    style={{ minHeight: '42px', padding: '6px 14px', fontSize: '12.5px' }}
                  >
                    {showClassReasons ? 'Sembunyikan Alasan Klasifikasi' : 'Lihat Alasan Klasifikasi'}
                  </button>
                </div>

                {analysis.classification.primaryWarning && (
                  <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>
                    {analysis.classification.primaryWarning}
                  </div>
                )}

                {showClassReasons && (
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {analysis.classification.classificationReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}

                {/* 5-Aspect Classification Check Table */}
                <div tabIndex={0} role="region" aria-label="Pemeriksaan 5 aspek kesamaan konstruk" className="msma-table-wrapper">
                  <table className="msma-table">
                    <thead>
                      <tr>
                        <th>Aspek Pemeriksaan</th>
                        <th>Status</th>
                        <th>Keterangan Evaluasi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.classification.checks.map(ch => (
                        <tr key={ch.aspect}>
                          <th scope="row">{ch.aspect}</th>
                          <td style={{ fontWeight: 800, color: ch.passed ? 'var(--success)' : 'var(--danger)' }}>{ch.statusLabel}</td>
                          <td>{ch.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Manual Correction & User Confirmation */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700 }}>Koreksi Manual Klasifikasi:</span>
                    {(['AUTO', 'CONTOH_A', 'CONTOH_B'] as const).map(opt => {
                      const active =
                        (opt === 'AUTO' && config.classificationOverride === null) ||
                        config.classificationOverride === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            commitChange(
                              prev => ({
                                ...prev,
                                classificationOverride: opt === 'AUTO' ? null : (opt as MsmaConstructClass)
                              }),
                              4,
                              'Koreksi Klasifikasi Contoh A/B',
                              `Klasifikasi diatur ke ${opt}.`
                            )
                          }
                          className={active ? 'btn btn-primary' : 'btn btn-outline'}
                          style={{ minHeight: '40px', padding: '6px 12px', fontSize: '12px' }}
                        >
                          {opt === 'AUTO' ? 'Otomatis Sistem' : opt.replace('_', ' ')}
                        </button>
                      );
                    })}
                  </div>

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.userConfirmedClassification}
                      onChange={e =>
                        commitChange(
                          prev => ({ ...prev, userConfirmedClassification: e.target.checked }),
                          4,
                          'Konfirmasi Klasifikasi Konstruk',
                          `Konfirmasi pengguna: ${e.target.checked ? 'Disetujui' : 'Belum disetujui'}.`
                        )
                      }
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span>Saya mengonfirmasi hasil klasifikasi besaran pengukuran di atas</span>
                  </label>
                </div>
              </div>

              {/* Physical Conversion Model Form when Contoh B */}
              {analysis.classification.finalClassification === 'CONTOH_B' && (
                <div className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>
                      Pemeriksaan Model Konversi Fisik &amp; Propagasi Uncertainty (Contoh B)
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Standardisasi Z-score, Min-Max, atau normalisasi persentil <strong>ditolak</strong> karena tidak menyamakan konstruk fisik. Jika Anda memiliki persamaan konversi fisik terverifikasi (mis. hasil model inversi transpor atmosfer dengan simpangan baku ketidakpastian konversi), aktifkan di bawah ini.
                    </p>
                  </div>

                  {config.sources.slice(1).map(src => (
                    <div key={src.id} style={{ padding: '12px', borderRadius: '10px', background: 'var(--surface-muted)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800 }}>
                        <input
                          type="checkbox"
                          checked={src.conversionModelEnabled}
                          onChange={e =>
                            commitChange(
                              prev => ({
                                ...prev,
                                sources: prev.sources.map(s =>
                                  s.id === src.id ? { ...s, conversionModelEnabled: e.target.checked } : s
                                )
                              }),
                              4,
                              'Toggle Model Konversi Fisik',
                              `Model konversi "${src.displayName}": ${e.target.checked}.`
                            )
                          }
                        />
                        <span>Aktifkan Konversi Fisik untuk {src.displayName} ({src.unit} → {config.sources[0]?.unit})</span>
                      </label>

                      {src.conversionModelEnabled && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '8px' }}>
                          <div>
                            <label htmlFor={`msma-conv-slope-${src.id}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                              Slope Konversi Fisik
                            </label>
                            <input
                              id={`msma-conv-slope-${src.id}`}
                              type="number"
                              step="any"
                              value={src.conversionSlope}
                              onChange={e =>
                                commitChange(
                                  prev => ({
                                    ...prev,
                                    sources: prev.sources.map(s =>
                                      s.id === src.id ? { ...s, conversionSlope: Number(e.target.value) || 1 } : s
                                    )
                                  }),
                                  4,
                                  'Ubah Slope Konversi',
                                  `Slope konversi ${src.displayName} = ${e.target.value}`
                                )
                              }
                              style={{ width: '100%', minHeight: '40px', padding: '6px 8px', fontSize: '16px', borderRadius: '6px', border: '1px solid var(--border)' }}
                            />
                          </div>
                          <div>
                            <label htmlFor={`msma-conv-int-${src.id}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                              Intercept Konversi
                            </label>
                            <input
                              id={`msma-conv-int-${src.id}`}
                              type="number"
                              step="any"
                              value={src.conversionIntercept}
                              onChange={e =>
                                commitChange(
                                  prev => ({
                                    ...prev,
                                    sources: prev.sources.map(s =>
                                      s.id === src.id ? { ...s, conversionIntercept: Number(e.target.value) || 0 } : s
                                    )
                                  }),
                                  4,
                                  'Ubah Intercept Konversi',
                                  `Intercept konversi ${src.displayName} = ${e.target.value}`
                                )
                              }
                              style={{ width: '100%', minHeight: '40px', padding: '6px 8px', fontSize: '16px', borderRadius: '6px', border: '1px solid var(--border)' }}
                            />
                          </div>
                          <div>
                            <label htmlFor={`msma-conv-sd-${src.id}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                              Uncertainty Konversi SD (σ_conv)
                            </label>
                            <input
                              id={`msma-conv-sd-${src.id}`}
                              type="number"
                              step="any"
                              min="0"
                              value={src.conversionUncertaintySd}
                              onChange={e =>
                                commitChange(
                                  prev => ({
                                    ...prev,
                                    sources: prev.sources.map(s =>
                                      s.id === src.id ? { ...s, conversionUncertaintySd: Math.max(0, Number(e.target.value) || 0) } : s
                                    )
                                  }),
                                  4,
                                  'Ubah Uncertainty Konversi',
                                  `Uncertainty SD ${src.displayName} = ${e.target.value}`
                                )
                              }
                              style={{ width: '100%', minHeight: '40px', padding: '6px 8px', fontSize: '16px', borderRadius: '6px', border: '1px solid var(--border)' }}
                            />
                          </div>
                          <div>
                            <label htmlFor={`msma-conv-eq-${src.id}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                              Dokumentasi Persamaan
                            </label>
                            <input
                              id={`msma-conv-eq-${src.id}`}
                              type="text"
                              placeholder="Mis. Box-model mass balance..."
                              value={src.conversionFormulaNote}
                              onChange={e =>
                                commitChange(
                                  prev => ({
                                    ...prev,
                                    sources: prev.sources.map(s =>
                                      s.id === src.id ? { ...s, conversionFormulaNote: e.target.value } : s
                                    )
                                  }),
                                  4,
                                  'Dokumentasi Model Konversi',
                                  'Catatan rumus konversi diperbarui.'
                                )
                              }
                              style={{ width: '100%', minHeight: '40px', padding: '6px 8px', fontSize: '16px', borderRadius: '6px', border: '1px solid var(--border)' }}
                            />
                          </div>
                          <div>
                            <label htmlFor={`msma-conv-ref-${src.id}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                              Referensi Ilmiah Konversi
                            </label>
                            <input
                              id={`msma-conv-ref-${src.id}`}
                              type="text"
                              placeholder="Mis. Yang et al. (2023)"
                              value={src.conversionLiteratureRef}
                              onChange={e =>
                                commitChange(
                                  prev => ({
                                    ...prev,
                                    sources: prev.sources.map(s =>
                                      s.id === src.id ? { ...s, conversionLiteratureRef: e.target.value } : s
                                    )
                                  }),
                                  4,
                                  'Referensi Konversi',
                                  'Sumber literatur konversi diperbarui.'
                                )
                              }
                              style={{ width: '100%', minHeight: '40px', padding: '6px 8px', fontSize: '16px', borderRadius: '6px', border: '1px solid var(--border)' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {analysis.classification.alternativeResearchRecommendations.length > 0 && (
                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', fontSize: '12.5px' }}>
                      <strong>Rekomendasi Penelitian Alternatif (Tanpa Konversi Langsung):</strong>
                      <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                        {analysis.classification.alternativeResearchRecommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              STEP 5: ANALISIS DESKRIPTIF, KUALITAS DATA & VISUALISASI AWAL
              ========================================================= */}
          {currentStep === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div tabIndex={0} role="region" aria-labelledby={descTableCaptionId} className="msma-table-wrapper">
                <table className="msma-table">
                  <caption id={descTableCaptionId}>
                    Statistik Deskriptif Lengkap, Variasi Antarkota vs Dalam-Kota (xtsum), &amp; Skrining Outlier (Irisan Lengkap N_CC = {analysis.descriptives.nCompleteCasesAllSources})
                  </caption>
                  <thead>
                    <tr>
                      <th>Sumber</th>
                      <th>N Valid (Miss%)</th>
                      <th>Mean</th>
                      <th>Median</th>
                      <th>SD</th>
                      <th>Variance</th>
                      <th>Min / Max</th>
                      <th>Skew / Kurt</th>
                      <th>Between SD / Within SD</th>
                      <th>Outlier (&gt;3.5 MAD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.descriptives.sourceStats.map(s => (
                      <tr key={s.sourceId}>
                        <th scope="row" style={{ fontWeight: 800 }}>{s.displayName} ({s.unit})</th>
                        <td>{s.nValid} ({s.missingPct.toFixed(1)}%)</td>
                        <td>{fmtAdaptive(s.mean)}</td>
                        <td>{fmtAdaptive(s.median)}</td>
                        <td>{fmtAdaptive(s.sd)}</td>
                        <td>{fmtAdaptive(s.variance)}</td>
                        <td>{fmtAdaptive(s.min)} / {fmtAdaptive(s.max)}</td>
                        <td>{s.skewness.toFixed(2)} / {s.kurtosisExcess.toFixed(2)}</td>
                        <td>{fmtAdaptive(s.betweenEntitySd)} / {fmtAdaptive(s.withinEntitySd)}</td>
                        <td>{s.outlierCountMad} ({s.outlierPctMad.toFixed(1)}%)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <MsmaDistributionBoxplotChart descriptives={analysis.descriptives} />
              <MsmaCorrelationHeatmap descriptives={analysis.descriptives} sources={config.sources} />
              <MsmaPairwiseScatterChart descriptives={analysis.descriptives} sources={config.sources} />
              <MsmaTimeSeriesChart descriptives={analysis.descriptives} sources={config.sources} />
              <MsmaMissingnessHeatmap descriptives={analysis.descriptives} sources={config.sources} />
            </div>
          )}

          {/* =========================================================
              STEP 6: PEMERIKSAAN ASUMSI & DIAGNOSTIK METODE
              ========================================================= */}
          {currentStep === 6 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>Istilah Kunci Diagnostik:</span>
                  <StatTermButton termKey="orthogonality" onOpenTerm={setActiveGlossaryKey} />
                  <StatTermButton termKey="autocorrelation" onOpenTerm={setActiveGlossaryKey} />
                  <StatTermButton termKey="heteroskedasticity" onOpenTerm={setActiveGlossaryKey} />
                  <StatTermButton termKey="representativeness_error" onOpenTerm={setActiveGlossaryKey} />
                </div>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {analysis.diagnostics.summaryNote} Tabel membedakan secara tegas antara asumsi yang dapat diuji secara <strong>EMPIRIS</strong>, dinilai secara <strong>TIDAK LANGSUNG</strong>, dan asumsi yang <strong>TIDAK DAPAT DIUJI TANPA GROUND TRUTH</strong>.
                </p>
              </div>

              <div tabIndex={0} role="region" aria-labelledby={diagTableCaptionId} className="msma-table-wrapper">
                <table className="msma-table">
                  <caption id={diagTableCaptionId}>
                    Tabel Pengujian Asumsi &amp; Diagnostik ({analysis.estimation.executedMethodLabel})
                  </caption>
                  <thead>
                    <tr>
                      <th>Pengujian</th>
                      <th>Hasil &amp; Tingkat Keterujian</th>
                      <th>Status</th>
                      <th>Interpretasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.diagnostics.items.map(item => (
                      <tr key={item.id}>
                        <th scope="row" style={{ fontWeight: 800 }}>
                          {item.testName}
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>{item.applicableMethods}</div>
                        </th>
                        <td>
                          <div><strong>{item.statisticLabel}:</strong> {item.statisticValue !== null ? fmtAdaptive(item.statisticValue) : '—'}</div>
                          {item.pValue !== null && <div style={{ fontSize: '11px' }}>p = {item.pValue.toFixed(4)}</div>}
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--primary)' }}>[{item.testabilityTier}]</span>
                        </td>
                        <td
                          style={{
                            fontWeight: 800,
                            color:
                              item.status === 'Memenuhi'
                                ? 'var(--success)'
                                : item.status === 'Tidak memenuhi'
                                  ? 'var(--danger)'
                                  : item.status === 'Perlu perhatian'
                                    ? 'var(--warn)'
                                    : 'var(--text-muted)'
                          }}
                        >
                          {item.status}
                        </td>
                        <td>{item.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================
              STEP 7: REKOMENDASI TRANSFORMASI & PERBAIKAN DATA
              ========================================================= */}
          {currentStep === 7 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="card" style={{ padding: '16px 18px', borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
                  Rekomendasi Utama Sistem: <code>{analysis.transformation.primaryRecommendationId}</code>
                </div>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {analysis.transformation.primarySelectionReason}
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={restoreOriginalData}
                    style={{ minHeight: '40px', padding: '6px 12px', fontSize: '12px' }}
                  >
                    Kembali ke Data Asli (NONE)
                  </button>
                </div>
              </div>

              <div tabIndex={0} role="region" aria-labelledby={transTableCaptionId} className="msma-table-wrapper">
                <table className="msma-table">
                  <caption id={transTableCaptionId}>
                    Evaluasi 12 Opsi Transformasi &amp; Prapemrosesan Data Panel (Persetujuan Eksplisit Pengguna)
                  </caption>
                  <thead>
                    <tr>
                      <th>Rekomendasi &amp; Masalah</th>
                      <th>Alasan Statistik &amp; Konsekuensi Interpretasi</th>
                      <th>Command Stata</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.transformation.recommendations.map(rec => (
                      <tr key={rec.id}>
                        <th scope="row">
                          <div style={{ fontWeight: 800 }}>
                            {rec.recommendationLabel} {rec.isPrimaryRecommendation ? '⭐ (Utama)' : ''}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            <strong>Masalah:</strong> {rec.issueDetected}
                          </div>
                          {!rec.eligibleOnCurrentData && (
                            <div style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 700, marginTop: '3px' }}>
                              {rec.ineligibilityReason}
                            </div>
                          )}
                        </th>
                        <td>
                          <div><strong>Alasan:</strong> {rec.statisticalRationale}</div>
                          <div style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>
                            <strong>Konsekuensi:</strong> {rec.interpretationConsequence}
                          </div>
                          {beforeAfterTransformPreviewId === rec.id && (
                            <div style={{ marginTop: '6px', padding: '8px', borderRadius: '6px', background: 'var(--info-bg)', fontSize: '11.5px' }}>
                              <strong>Sebelum:</strong> |Skew|={rec.beforeAfterPreview.meanSkewnessBefore.toFixed(2)}, N_CC={rec.beforeAfterPreview.completeCasesBefore} ({rec.beforeAfterPreview.scaleSummaryBefore})
                              <br />
                              <strong>Sesudah:</strong> |Skew|={rec.beforeAfterPreview.meanSkewnessAfter.toFixed(2)}, N_CC={rec.beforeAfterPreview.completeCasesAfter} ({rec.beforeAfterPreview.scaleSummaryAfter})
                            </div>
                          )}
                        </td>
                        <td>
                          <code style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>{rec.stataCommand}</code>
                        </td>
                        <td style={{ fontWeight: 800 }}>{rec.status}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <button
                              type="button"
                              className={rec.status === 'Diterapkan' ? 'btn btn-primary' : 'btn btn-outline'}
                              disabled={!rec.eligibleOnCurrentData}
                              onClick={() => {
                                if (rec.id === 'OUTLIER_WINSORIZE_SENSITIVITY') {
                                  commitChange(
                                    prev => ({
                                      ...prev,
                                      outlierHandling: prev.outlierHandling === 'WINSORIZE_2_5' ? 'KEEP_ALL' : 'WINSORIZE_2_5'
                                    }),
                                    7,
                                    'Toggle Sensitivitas Winsorize 2.5%',
                                    'Mengubah kebijakan outlier Winsorize 2.5%.'
                                  );
                                } else if (rec.id === 'MISSING_LISTWISE_COMPLETE') {
                                  commitChange(
                                    prev => ({
                                      ...prev,
                                      missingHandling: prev.missingHandling === 'COMPLETE_CASE' ? 'WITHIN_ENTITY_INTERPOLATE' : 'COMPLETE_CASE'
                                    }),
                                    7,
                                    'Toggle Penanganan Missing',
                                    'Mengubah kebijakan missing data.'
                                  );
                                } else {
                                  commitChange(
                                    prev => ({
                                      ...prev,
                                      activeTransformation: rec.id,
                                      rejectedTransformations: prev.rejectedTransformations.filter(x => x !== rec.id)
                                    }),
                                    7,
                                    `Terapkan Transformasi ${rec.id}`,
                                    `Transformasi "${rec.recommendationLabel}" diterapkan.`
                                  );
                                }
                              }}
                              style={{ minHeight: '36px', padding: '4px 10px', fontSize: '11.5px' }}
                            >
                              {rec.status === 'Diterapkan' ? 'Aktif ✓' : 'Terapkan'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() =>
                                commitChange(
                                  prev => ({
                                    ...prev,
                                    activeTransformation: prev.activeTransformation === rec.id ? 'NONE' : prev.activeTransformation,
                                    rejectedTransformations: prev.rejectedTransformations.includes(rec.id)
                                      ? prev.rejectedTransformations
                                      : [...prev.rejectedTransformations, rec.id]
                                  }),
                                  7,
                                  `Tolak Transformasi ${rec.id}`,
                                  `Menolak opsi "${rec.recommendationLabel}".`
                                )
                              }
                              style={{ minHeight: '36px', padding: '4px 10px', fontSize: '11.5px' }}
                            >
                              Tolak
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() =>
                                setBeforeAfterTransformPreviewId(prev => (prev === rec.id ? null : rec.id))
                              }
                              style={{ minHeight: '36px', padding: '4px 10px', fontSize: '11.5px' }}
                            >
                              Sebelum vs Sesudah
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================
              STEP 8: PEMILIHAN METODE ADAPTIF & ESTIMASI UTAMA
              ========================================================= */}
          {currentStep === 8 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Adaptive Decision Engine Summary Card */}
              <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--primary)' }}>
                      KEPUTUSAN MESIN METODOLOGI ADAPTIF (selectMeasurementMethod)
                    </div>
                    <h4 style={{ margin: '2px 0 0', fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                      {analysis.estimation.executedMethodLabel}
                    </h4>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <StatTermButton termKey="bootstrap" onOpenTerm={setActiveGlossaryKey} />
                    <StatTermButton termKey="confidence_interval" onOpenTerm={setActiveGlossaryKey} />
                    <select
                      aria-label="Jumlah replikasi Entity-Cluster Bootstrap"
                      value={config.bootstrapReplications}
                      onChange={e =>
                        commitChange(
                          prev => ({ ...prev, bootstrapReplications: Number(e.target.value) }),
                          8,
                          'Ubah Replikasi Cluster Bootstrap',
                          `Bootstrap diatur ke ${e.target.value} replikasi klaster kota.`
                        )
                      }
                      style={{ minHeight: '42px', padding: '6px 10px', fontSize: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    >
                      <option value={150}>150 Cluster Bootstrap</option>
                      <option value={250}>250 Cluster Bootstrap</option>
                      <option value={500}>500 Cluster Bootstrap</option>
                      <option value={800}>800 Cluster Bootstrap</option>
                    </select>

                    {config.sources.length >= 4 && analysis.classification.allowsJointCollocationRanking && (
                      <select
                        aria-label="Pilihan metode J >= 4"
                        value={config.preferredMethodOverride ?? 'AUTO'}
                        onChange={e =>
                          commitChange(
                            prev => ({
                              ...prev,
                              preferredMethodOverride: e.target.value === 'AUTO' ? null : (e.target.value as MsmaMethodId)
                            }),
                            8,
                            'Pilih Estimator Multi-Sumber',
                            `Estimator dipilih: ${e.target.value}.`
                          )
                        }
                        style={{ minHeight: '42px', padding: '6px 10px', fontSize: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                      >
                        <option value="AUTO">Otomatis Sistem ({analysis.decision.recommendedMethod})</option>
                        <option value="N_CORNERED_HAT">N-Cornered Hat (PSD)</option>
                        <option value="EXTENDED_COLLOCATION">Extended Collocation (EC)</option>
                      </select>
                    )}
                  </div>
                </div>

                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {analysis.decision.methodJustification.map((j, i) => (
                    <li key={i}>{j}</li>
                  ))}
                </ul>
              </div>

              {/* Branch A: Two Sources (J = 2) */}
              {analysis.estimation.twoSourceResult && (
                <>
                  <div className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                        Hasil Repeated-Measures Bland-Altman &amp; Deming Regression (J = 2)
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <StatTermButton termKey="deming_regression" onOpenTerm={setActiveGlossaryKey} />
                        <label htmlFor="msma-deming-lambda" style={{ fontSize: '12px', fontWeight: 700 }}>
                          Rasio λ = σ²_ε2/σ²_ε1:
                        </label>
                        <input
                          id="msma-deming-lambda"
                          type="number"
                          step="0.1"
                          min="0.05"
                          value={config.demingLambdaRatio}
                          onChange={e =>
                            commitChange(
                              prev => ({
                                ...prev,
                                demingLambdaRatio: Math.max(0.05, Number(e.target.value) || 1),
                                demingLambdaExternalKnown: Number(e.target.value) !== 1
                              }),
                              8,
                              'Ubah Rasio Varians Deming λ',
                              `Rasio λ Deming diatur ke ${e.target.value}.`
                            )
                          }
                          style={{ width: '90px', minHeight: '40px', padding: '5px 8px', fontSize: '16px', borderRadius: '6px', border: '1px solid var(--border)' }}
                        />
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {analysis.estimation.twoSourceResult.agreementInterpretation}
                    </p>

                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                      {analysis.estimation.twoSourceResult.identificationBoundaryWarning}
                    </div>
                  </div>

                  <MsmaBlandAltmanChart twoSource={analysis.estimation.twoSourceResult} />
                </>
              )}

              {/* Branch B & C: J = 3 TCA or J >= 4 N-Cornered Hat / Extended Collocation */}
              {activeEstimates.length > 0 && (
                <>
                  {analysis.estimation.tcaResult?.suspectedErrorCorrelationFlag && (
                    <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', fontSize: '12.5px', color: 'var(--text)' }}>
                      <strong>Catatan Korelasi Galat TCA:</strong> {analysis.estimation.tcaResult.correlatedTcNote}
                    </div>
                  )}

                  {analysis.estimation.multiSourceResult &&
                    analysis.estimation.multiSourceResult.estimatedErrorCovariances.length > 0 && (
                      <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--info-bg)', border: '1px solid var(--info-border)', fontSize: '12.5px', color: 'var(--text)' }}>
                        <strong>Kovarians Galat Lintas-Sumber Teridentifikasi (Extended Collocation):</strong>{' '}
                        {analysis.estimation.multiSourceResult.estimatedErrorCovariances
                          .map(
                            c =>
                              `${c.sourceAName} × ${c.sourceBName}: Cov(ε) = ${fmtAdaptive(c.estimatedErrorCovariance)} (r̂_ε = ${c.estimatedErrorCorrelation.toFixed(3)}, Kuartet Saksi ${c.identifiedByQuartet})`
                          )
                          .join(' | ')}
                      </div>
                    )}

                  <div tabIndex={0} role="region" aria-labelledby={estTableCaptionId} className="msma-table-wrapper">
                    <table className="msma-table">
                      <caption id={estTableCaptionId}>
                        Tabel Estimasi Kalibrasi, Varians Kesalahan Terkalibrasi, Uncertainty 95% CI, &amp; Peringkat Akurasi Relatif
                      </caption>
                      <thead>
                        <tr>
                          <th>Sumber Pengukuran</th>
                          <th>Kalibrasi (α̂, β̂)</th>
                          <th>Raw Error Var (σ̂²_ε)</th>
                          <th>Comparable Calibrated Error Var (95% CI)</th>
                          <th>Error SD (95% CI)</th>
                          <th>Relative Error</th>
                          <th>ETC R² / SNR</th>
                          <th>Bootstrap P(#1)</th>
                          <th>Relative Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeEstimates.map(est => (
                          <tr key={est.sourceId}>
                            <th scope="row" style={{ fontWeight: 800 }}>
                              {est.displayName} ({est.unit})
                            </th>
                            <td>
                              α = {fmtAdaptive(est.calibrationInterceptAlpha)}
                              <br />
                              β = {est.calibrationSlopeBeta.toFixed(3)}
                            </td>
                            <td>{fmtAdaptive(est.rawErrorVariance)}</td>
                            <td>
                              <strong>{fmtAdaptive(est.totalComparableErrorVariance)}</strong>
                              <br />
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                [{fmtAdaptive(est.errorVarianceCi95[0])}, {fmtAdaptive(est.errorVarianceCi95[1])}]
                              </span>
                            </td>
                            <td>
                              <strong>{fmtAdaptive(est.errorStandardDeviation)}</strong>
                              <br />
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                [{fmtAdaptive(est.errorSdCi95[0])}, {fmtAdaptive(est.errorSdCi95[1])}]
                              </span>
                            </td>
                            <td>{est.relativeErrorPct.toFixed(2)}%</td>
                            <td>{(est.etcCorrelationR2 * 100).toFixed(2)}% ({est.snrDb.toFixed(1)} dB)</td>
                            <td>{est.bootstrapRank1ProbPct.toFixed(1)}%</td>
                            <td style={{ fontWeight: 800, color: est.relativeRank === 1 ? 'var(--success)' : 'var(--text)' }}>
                              {est.relativeRank ? `Peringkat #${est.relativeRank}` : 'Ditahan / Under-ID'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <MsmaErrorVarianceChart estimates={activeEstimates} />
                  <MsmaRelativeRankingChart estimates={activeEstimates} />
                  <MsmaResidualDiagnosticsChart estimation={analysis.estimation} sources={config.sources} />
                </>
              )}

              {!analysis.classification.allowsJointCollocationRanking && (
                <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', fontSize: '13px', fontWeight: 700 }}>
                  Pemeringkatan akurasi bersama ditahan karena sumber termasuk Contoh B (besaran fisik berbeda) tanpa model konversi fisik terverifikasi pada Step 4.
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              STEP 9: ROBUSTNESS & SENSITIVITY ANALYSIS
              ========================================================= */}
          {currentStep === 9 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card" style={{ padding: '16px 18px', borderLeft: '4px solid var(--primary)' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
                  Evaluasi Ketahanan Peringkat Sumber (Step 9)
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {analysis.robustness.stabilityVerdict}
                </p>
              </div>

              {analysis.robustness.evaluated && analysis.robustness.scenarios.length > 0 && (
                <>
                  <div tabIndex={0} role="region" aria-labelledby={robTableCaptionId} className="msma-table-wrapper">
                    <table className="msma-table">
                      <caption id={robTableCaptionId}>
                        Perbandingan Peringkat &amp; Error SD Lintas {analysis.robustness.scenarios.length} Skenario Sensitivitas
                      </caption>
                      <thead>
                        <tr>
                          <th>Skenario Analisis</th>
                          <th>N Obs</th>
                          {config.sources.map(s => (
                            <th key={s.id}>{s.displayName} (Rank / SD)</th>
                          ))}
                          <th>Sumber #1</th>
                          <th>Catatan Perubahan Kesimpulan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.robustness.scenarios.map(sc => (
                          <tr key={sc.scenarioId}>
                            <th scope="row" style={{ fontWeight: 800 }}>{sc.scenarioLabel}</th>
                            <td>{sc.nObs}</td>
                            {config.sources.map(s => (
                              <td key={s.id}>
                                {sc.identifiable && sc.ranksBySourceId[s.id]
                                  ? `#${sc.ranksBySourceId[s.id]} (${fmtAdaptive(sc.errorSdBySourceId[s.id])})`
                                  : 'N/A'}
                              </td>
                            ))}
                            <td style={{ fontWeight: 800, color: sc.rankChangedFromBaseline ? 'var(--warn)' : 'var(--success)' }}>
                              {sc.topSourceName ?? 'Tidak Teridentifikasi'}
                            </td>
                            <td>{sc.conclusionNote}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <MsmaRankingStabilityChart robustness={analysis.robustness} sources={config.sources} />
                  <MsmaSensitivityComparisonChart robustness={analysis.robustness} sources={config.sources} />
                </>
              )}
            </div>
          )}

          {/* =========================================================
              STEP 10: FINAL STATISTICAL REPORT & JOURNAL GENERATOR
              ========================================================= */}
          {currentStep === 10 && (
            <MsmaFinalReportStep
              datasetName={workbook.fileName}
              sources={config.sources}
              result={analysis}
              journalDraft={journalDraft}
              onUpdateJournalField={(field, value) => {
                setJournalOverrides(prev => ({ ...prev, [field]: value }));
              }}
              onResetJournalToComputed={() => {
                setJournalOverrides({});
              }}
            />
          )}

          {/* Step Navigation Footer */}
          <div
            className="card"
            style={{
              padding: '12px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap'
            }}
          >
            <button
              type="button"
              className="btn btn-outline"
              disabled={currentStep === 0}
              onClick={() => goToStep(currentStep - 1)}
              style={{ minHeight: '44px', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowLeft size={15} />
              <span>Kembali</span>
            </button>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {canUndo && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={undo}
                  style={{ minHeight: '44px', padding: '8px 14px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={14} />
                  <span>Undo Perubahan</span>
                </button>
              )}

              {currentStep < 10 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => goToStep(currentStep + 1)}
                  style={{ minHeight: '44px', padding: '8px 18px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>Lanjut ke Step {currentStep + 1}</span>
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Native <dialog> Modals */}
      <MsmaBibliographyModal open={refsModalOpen} onClose={() => setRefsModalOpen(false)} />
      <MsmaUsageGuideModal open={guideModalOpen} onClose={() => setGuideModalOpen(false)} />
      <MsmaHistoryModal open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} auditTrail={auditTrail} />
      <MsmaResetConfirmModal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirmReset={resetEntireAnalysis}
      />
      <MsmaGlossaryModal activeTermKey={activeGlossaryKey} onSelectTermKey={setActiveGlossaryKey} />
    </div>
  );
};
