'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  Link2,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Search,
  Layers,
  Clock,
  Sliders,
  ShieldCheck,
  Database,
  RefreshCw,
  Sparkles,
  LayoutGrid
} from 'lucide-react';
import {
  inspectColumn,
  validateRegressionConfig,
  validateTimeSeriesSequence,
  validateMRAConfig,
  validateContingencyConfig,
  ValidationSummary
} from '@/lib/regression-validator';
import { OLSFitResult, applyMissingPolicyToRows } from '@/lib/regression-engine';
import { runModeratedRegressionAnalysis, MRAResult } from '@/lib/regression-moderation-mra';
import { runContingencyAnalysis, ContingencyAnalysisResult } from '@/lib/regression-contingency-chisquare';
import { RegressionResultsView } from './RegressionResultsView';
import { MRAResultView } from './MRAResultView';
import { ContingencyResultView } from './ContingencyResultView';
import { sanitizeCellValue } from '@/lib/file-signature';
import {
  validateAndProfileDataset,
  calculateDescriptiveStatistics,
  calculateCorrelationMatrix,
  generateVisualChartData
} from '@/lib/regression-data-processor';

export type AnalysisMethodChoice = 'SLR' | 'MLR' | 'MRA' | 'Contingency';
export type MissingPolicyChoice = 'listwise' | 'impute_mean' | 'impute_median' | 'linear_interpolation';

interface RegressionTabProps {
  onNavigateHome?: () => void;
  onNavigateToPanel?: () => void;
}

const SAMPLE_CROSS_SECTION_DATASET: Record<string, any>[] = Array.from({ length: 65 }, (_, i) => {
  const x1 = Math.round((20 + i * 0.8 + Math.sin(i) * 5) * 10) / 10;
  const x2 = Math.round((35 + (i % 9) * 4.5 + Math.cos(i) * 6) * 10) / 10;
  const mod = Math.round((4.0 + Math.sin(i * 0.7) * 1.5) * 100) / 100;
  const error = Math.round((Math.sin(i * 2) * 3) * 10) / 10;
  const y = Math.round((12 + 0.55 * x1 + 0.38 * x2 + 0.14 * x1 * mod + error) * 10) / 10;
  const sectors = ['Teknologi', 'Manufaktur', 'Jasa Keuangan'];
  const skala = i % 2 === 0 ? 'Besar' : 'Menengah';
  return {
    ID: i + 1,
    Periode: `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
    Pengeluaran_RND: x1,
    Biaya_Promosi: x2,
    Indeks_Inovasi_Z: mod,
    Nilai_Penjualan_Y: y,
    Kategori_Sektor: sectors[i % 3],
    Skala_Usaha: skala
  };
});

const SAMPLE_TIME_SERIES_DATASET: Record<string, any>[] = Array.from({ length: 48 }, (_, i) => {
  const year = 2021 + Math.floor(i / 12);
  const month = (i % 12) + 1;
  const t = i + 1;
  const inflasi = Math.round((2.4 + Math.sin(t * 0.4) * 0.9 + t * 0.02) * 100) / 100;
  const sukuBunga = Math.round((4.5 + Math.cos(t * 0.3) * 0.6) * 100) / 100;
  const kurs = Math.round((14200 + t * 28 + Math.sin(t * 0.5) * 140) * 10) / 10;
  const ihsg = Math.round((6100 + t * 18 - 65 * inflasi + 0.12 * kurs + Math.sin(t) * 55) * 100) / 100;
  return {
    Bulan: `${year}-${String(month).padStart(2, '0')}-01`,
    Inflasi_Persen: inflasi,
    BI_Rate: sukuBunga,
    Kurs_USD: kurs,
    Indeks_Pasar_Y: ihsg
  };
});

const WIZARD_STEPS = [
  { id: 1, title: 'Sumber Data & Sheet', shortTitle: 'Data' },
  { id: 2, title: 'Pratinjau & Pembersihan', shortTitle: 'Bersihkan' },
  { id: 3, title: 'Jenis Struktur Data', shortTitle: 'Struktur' },
  { id: 4, title: 'Metode Analisis', shortTitle: 'Metode' },
  { id: 5, title: 'Variabel & Parameter', shortTitle: 'Variabel' },
  { id: 6, title: 'Ringkasan & Validasi', shortTitle: 'Validasi' },
  { id: 7, title: 'Hasil Gaya SPSS', shortTitle: 'Hasil' }
];

export const RegressionTab: React.FC<RegressionTabProps> = () => {
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: Data Source State
  const [sourceType, setSourceType] = useState<'upload' | 'link' | 'sample'>('sample');
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [ingestionError, setIngestionError] = useState<string | null>(null);
  const [ingestionWarning, setIngestionWarning] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string>('sample_cross_section_penelitian.xlsx');
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(15200);
  const [sheetsList, setSheetsList] = useState<string[]>(['Data_Utama']);
  const [selectedSheet, setSelectedSheet] = useState<string>('Data_Utama');
  const [availableSheetsData, setAvailableSheetsData] = useState<any[]>([
    {
      sheetName: 'Data_Utama',
      rowCount: SAMPLE_CROSS_SECTION_DATASET.length,
      columnCount: Object.keys(SAMPLE_CROSS_SECTION_DATASET[0]).length,
      columns: Object.keys(SAMPLE_CROSS_SECTION_DATASET[0]),
      allRows: SAMPLE_CROSS_SECTION_DATASET
    }
  ]);

  // Step 2: Snapshot & Working Dataset State
  const [originalRows, setOriginalRows] = useState<Record<string, any>[]>(SAMPLE_CROSS_SECTION_DATASET);
  const [allRows, setAllRows] = useState<Record<string, any>[]>(SAMPLE_CROSS_SECTION_DATASET);
  const [missingPolicy, setMissingPolicy] = useState<MissingPolicyChoice>('listwise');
  const [cleaningNotice, setCleaningNotice] = useState<string | null>(null);

  // Step 3: Cross Section vs Time Series
  const [isTimeSeries, setIsTimeSeries] = useState<boolean>(false);
  const [timeCol, setTimeCol] = useState<string>('Periode');
  const [frequency, setFrequency] = useState<'harian' | 'mingguan' | 'bulanan' | 'kuartalan' | 'tahunan' | 'tidak_beraturan'>('bulanan');

  // Step 4: Selected Statistical Method
  const [analysisMethod, setAnalysisMethod] = useState<AnalysisMethodChoice>('MLR');
  const [analysisMode, setAnalysisMode] = useState<'basic' | 'advanced'>('basic');

  // Step 5: Variable & Parameter Configuration
  const [yCol, setYCol] = useState<string>('Nilai_Penjualan_Y');
  const [xCols, setXCols] = useState<string[]>(['Pengeluaran_RND', 'Biaya_Promosi']);
  const [refCategories, setRefCategories] = useState<Record<string, string>>({});
  const [alpha, setAlpha] = useState<number>(0.05);
  const [ciLevel, setCiLevel] = useState<number>(0.95);
  const [entryMethod, setEntryMethod] = useState<'enter' | 'forward' | 'backward' | 'stepwise'>('enter');
  const [columnSearchQuery, setColumnSearchQuery] = useState<string>('');
  const [isMobilePickerOpen, setIsMobilePickerOpen] = useState<boolean>(false);

  // MRA Variables
  const [mraXCol, setMraXCol] = useState<string>('Pengeluaran_RND');
  const [mraZCol, setMraZCol] = useState<string>('Indeks_Inovasi_Z');
  const [mraCovariates, setMraCovariates] = useState<string[]>([]);
  const [mraCenterVariables, setMraCenterVariables] = useState<boolean>(true);
  const [mraIsCategoricalMod, setMraIsCategoricalMod] = useState<boolean>(false);
  const [mraCategoricalCoding, setMraCategoricalCoding] = useState<'dummy' | 'contrast'>('dummy');
  const [mraRefCategory, setMraRefCategory] = useState<string>('');

  // Contingency Variables
  const [contRowCol, setContRowCol] = useState<string>('Kategori_Sektor');
  const [contColCol, setContColCol] = useState<string>('Skala_Usaha');

  // Step 6 & 7 Results
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [extraValidation, setExtraValidation] = useState<{ isValid: boolean; errors: string[]; warnings: string[] }>({
    isValid: true,
    errors: [],
    warnings: []
  });
  const [step6SubTab, setStep6SubTab] = useState<'validation' | 'descriptives' | 'correlation' | 'charts'>('validation');

  const [isFitting, setIsFitting] = useState<boolean>(false);
  const [fitError, setFitError] = useState<string | null>(null);
  const [fitResult, setFitResult] = useState<OLSFitResult | null>(null);
  const [mraResult, setMraResult] = useState<MRAResult | null>(null);
  const [contingencyResult, setContingencyResult] = useState<ContingencyAnalysisResult | null>(null);

  const availableColumns = useMemo(() => {
    if (!allRows || allRows.length === 0) return [];
    return Object.keys(allRows[0]);
  }, [allRows]);

  const columnTypeMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof inspectColumn>> = {};
    availableColumns.forEach(col => {
      map[col] = inspectColumn(col, allRows.map(r => r[col]));
    });
    return map;
  }, [availableColumns, allRows]);

  const datasetProfile = useMemo(() => validateAndProfileDataset(allRows, fileName), [allRows, fileName]);

  const timeSeriesSeqCheck = useMemo(() => {
    if (!isTimeSeries || !timeCol || !availableColumns.includes(timeCol)) return null;
    return validateTimeSeriesSequence(allRows, timeCol, frequency);
  }, [isTimeSeries, timeCol, frequency, allRows, availableColumns]);

  const categoricalUniqueMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    availableColumns.forEach(col => {
      const info = columnTypeMap[col];
      if (info && info.type !== 'numeric') {
        const cats = Array.from(
          new Set(
            allRows
              .map(r => r[col])
              .filter(v => v !== null && v !== undefined && v !== '')
              .map(v => String(v).trim())
          )
        ).sort();
        map[col] = cats;
      }
    });
    return map;
  }, [availableColumns, columnTypeMap, allRows]);

  const activeVariables = useMemo(() => {
    if (analysisMethod === 'MRA') {
      return [yCol, mraXCol, mraZCol, ...mraCovariates].filter(c => c && availableColumns.includes(c));
    }
    if (analysisMethod === 'Contingency') {
      return [contRowCol, contColCol].filter(c => c && availableColumns.includes(c));
    }
    return [yCol, ...xCols].filter(c => c && availableColumns.includes(c));
  }, [analysisMethod, yCol, xCols, mraXCol, mraZCol, mraCovariates, contRowCol, contColCol, availableColumns]);

  const descriptiveStats = useMemo(() => {
    if (activeVariables.length === 0 || analysisMethod === 'Contingency') return [];
    return calculateDescriptiveStatistics(allRows, activeVariables);
  }, [allRows, activeVariables, analysisMethod]);

  const correlationData = useMemo(() => {
    if (activeVariables.length < 2 || analysisMethod === 'Contingency') return null;
    return calculateCorrelationMatrix(allRows, activeVariables);
  }, [allRows, activeVariables, analysisMethod]);

  const visualChartData = useMemo(() => {
    if (!yCol || analysisMethod === 'Contingency') return null;
    const xFocus = analysisMethod === 'MRA' ? mraXCol : xCols[0];
    return generateVisualChartData(allRows, yCol, xFocus, isTimeSeries ? timeCol : undefined);
  }, [allRows, yCol, xCols, mraXCol, analysisMethod, isTimeSeries, timeCol]);

  const autoSelectVariablesForRows = (rows: Record<string, any>[]) => {
    if (!rows || rows.length === 0) return;
    const cols = Object.keys(rows[0]).filter(Boolean);
    const numCols = cols.filter(c => inspectColumn(c, rows.map(r => r[c])).type === 'numeric');
    const catCols = cols.filter(c => {
      const t = inspectColumn(c, rows.map(r => r[c])).type;
      return t === 'categorical' || t === 'binary' || t === 'text';
    });
    const dtCols = cols.filter(c => inspectColumn(c, rows.map(r => r[c])).type === 'datetime');

    setYCol(numCols[numCols.length - 1] || numCols[0] || cols[0] || '');
    setXCols(numCols.length >= 3 ? numCols.slice(0, 2) : numCols.slice(0, 1));
    setMraXCol(numCols[0] || cols[0] || '');
    setMraZCol(numCols[1] || catCols[0] || cols[1] || '');
    setContRowCol(catCols[0] || cols[0] || '');
    setContColCol(catCols[1] || catCols[0] || cols[1] || '');
    setTimeCol(dtCols[0] || cols[0] || '');
    setRefCategories({});
  };

  const applyNewDataset = (name: string, size: number, sheets: any[]) => {
    setFileName(name);
    setFileSizeBytes(size);
    const names = sheets.map((s: any) => s.sheetName);
    setSheetsList(names);
    setAvailableSheetsData(sheets);
    if (sheets.length > 0) {
      const first = sheets[0];
      const rows = first.allRows || first.previewRows || [];
      setSelectedSheet(first.sheetName);
      setOriginalRows(rows);
      setAllRows(rows);
      setCleaningNotice(null);
      autoSelectVariablesForRows(rows);
    }
  };

  const selectSheetByName = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const targetSheet = availableSheetsData.find((s: any) => s.sheetName === sheetName);
    if (targetSheet) {
      const rows = targetSheet.allRows || targetSheet.previewRows || [];
      setOriginalRows(rows);
      setAllRows(rows);
      setCleaningNotice(null);
      autoSelectVariablesForRows(rows);
    }
  };

  useEffect(() => {
    if (availableColumns.length > 0) {
      setXCols(prev => prev.filter(c => availableColumns.includes(c) && c !== yCol));
      if (yCol && !availableColumns.includes(yCol)) {
        const firstNum = availableColumns.find(c => columnTypeMap[c]?.type === 'numeric');
        setYCol(firstNum || availableColumns[0] || '');
      }
    }
  }, [availableColumns, yCol, columnTypeMap]);

  const handleLoadSample = (variant: 'cross_section' | 'time_series') => {
    setIngestionError(null);
    setIngestionWarning(null);
    if (variant === 'cross_section') {
      applyNewDataset('sample_cross_section_penelitian.xlsx', 15200, [
        { sheetName: 'Data_Utama', rowCount: SAMPLE_CROSS_SECTION_DATASET.length, allRows: SAMPLE_CROSS_SECTION_DATASET }
      ]);
      setIsTimeSeries(false);
      setYCol('Nilai_Penjualan_Y');
      setXCols(['Pengeluaran_RND', 'Biaya_Promosi']);
      setMraXCol('Pengeluaran_RND');
      setMraZCol('Indeks_Inovasi_Z');
      setContRowCol('Kategori_Sektor');
      setContColCol('Skala_Usaha');
      setAnalysisMethod('MLR');
    } else {
      applyNewDataset('sample_time_series_makro.xlsx', 11400, [
        { sheetName: 'Makro_Bulanan', rowCount: SAMPLE_TIME_SERIES_DATASET.length, allRows: SAMPLE_TIME_SERIES_DATASET }
      ]);
      setIsTimeSeries(true);
      setTimeCol('Bulan');
      setFrequency('bulanan');
      setYCol('Indeks_Pasar_Y');
      setXCols(['Inflasi_Persen', 'Kurs_USD']);
      setAnalysisMethod('MLR');
    }
    setCurrentStep(2);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setIngestionError(null);
    setIngestionWarning(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/regression/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!json.success) {
        setIngestionError(json.error || 'Gagal memproses file.');
        return;
      }
      applyNewDataset(json.data.originalName, json.data.sizeBytes, json.data.sheets || []);
      setCurrentStep(2);
    } catch (err: any) {
      setIngestionError(`Terjadi kesalahan jaringan: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSheetsImport = async () => {
    if (!googleSheetsUrl.trim()) {
      setIngestionError('Masukkan URL Google Sheets yang valid.');
      return;
    }
    setIsLoading(true);
    setIngestionError(null);
    setIngestionWarning(null);
    try {
      const res = await fetch('/api/regression/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: googleSheetsUrl.trim() })
      });
      const json = await res.json();
      if (!json.success) {
        setIngestionError(json.error || 'Gagal mengimpor dari Google Sheets.');
        if (json.statusNote) setIngestionWarning(json.statusNote);
        return;
      }
      applyNewDataset(json.data.originalName, json.data.sizeBytes, json.data.sheets || []);
      setCurrentStep(2);
    } catch (err: any) {
      setIngestionError(`Gagal menghubungi server: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyDataCleaning = () => {
    const numCols = availableColumns.filter(c => columnTypeMap[c]?.type === 'numeric');
    const otherCols = availableColumns.filter(c => !numCols.includes(c));
    const res = applyMissingPolicyToRows(originalRows, numCols, missingPolicy, otherCols);
    setAllRows(res.cleanedRows);
    setCleaningNotice(
      `Pembersihan (${missingPolicy}) diterapkan: ${res.cleanedRows.length} baris aktif, ${res.rowsDropped} baris dihapus, ${res.imputedCellsCount} sel diimputasi.`
    );
  };

  const handleResetCleaning = () => {
    setAllRows(originalRows);
    setCleaningNotice('Dataset dikembalikan ke kondisi asli awal (sebelum pembersihan).');
  };

  const handleDeleteRowManual = (rowIdx: number) => {
    const next = allRows.filter((_, i) => i !== rowIdx);
    setAllRows(next);
    setCleaningNotice(`Baris ke-${rowIdx + 1} dihapus manual. Baris tersisa: ${next.length}.`);
  };

  const triggerValidationStep6 = () => {
    setFitError(null);
    if (analysisMethod === 'SLR' || analysisMethod === 'MLR') {
      const effectiveX = analysisMethod === 'SLR' ? xCols.slice(0, 1) : xCols;
      const summary = validateRegressionConfig(allRows, {
        yCol,
        xCols: effectiveX,
        isTimeSeries,
        timeCol: isTimeSeries ? timeCol : undefined,
        frequency,
        alpha,
        missingPolicy
      });
      setValidationSummary(summary);
      setExtraValidation({ isValid: summary.isValid, errors: summary.errors, warnings: summary.warnings });
    } else if (analysisMethod === 'MRA') {
      const v = validateMRAConfig({
        rows: allRows,
        yCol,
        xCol: mraXCol,
        zCol: mraZCol,
        covariateCols: mraCovariates,
        isModeratorCategorical: mraIsCategoricalMod,
        alpha
      });
      setValidationSummary(null);
      setExtraValidation(v);
    } else {
      const v = validateContingencyConfig({
        rows: allRows,
        rowCol: contRowCol,
        colCol: contColCol,
        alpha
      });
      setValidationSummary(null);
      setExtraValidation(v);
    }
    setCurrentStep(6);
  };

  const handleExecuteAnalysis = async () => {
    setIsFitting(true);
    setFitError(null);
    try {
      if (analysisMethod === 'SLR' || analysisMethod === 'MLR') {
        const chosenX = analysisMethod === 'SLR' ? xCols.slice(0, 1) : xCols;
        const relevantCols = Array.from(new Set([yCol, ...chosenX, ...(isTimeSeries && timeCol ? [timeCol] : [])]));
        const trimmedRows = allRows.map(row => {
          const cleanRow: Record<string, any> = {};
          for (const col of relevantCols) cleanRow[col] = row[col];
          return cleanRow;
        });

        const res = await fetch('/api/engine/fit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: trimmedRows,
            yCol,
            xCols: chosenX,
            isTimeSeries,
            timeCol: isTimeSeries ? timeCol : undefined,
            frequency,
            alpha,
            ciLevel,
            missingPolicy,
            refCategories
          })
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const txt = await res.text();
          throw new Error(`Respon server non-JSON (${res.status}): ${txt.slice(0, 120)}`);
        }
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || 'Gagal menjalankan estimasi regresi OLS.');
        }
        setFitResult(json.data);
        setMraResult(null);
        setContingencyResult(null);
      } else if (analysisMethod === 'MRA') {
        const res = runModeratedRegressionAnalysis({
          rows: allRows,
          yCol,
          xCol: mraXCol,
          zCol: mraZCol,
          covariateCols: mraCovariates,
          centerVariables: mraCenterVariables,
          isModeratorCategorical: mraIsCategoricalMod,
          categoricalCoding: mraCategoricalCoding,
          referenceCategory: mraRefCategory || undefined,
          alpha,
          ciLevel
        });
        setMraResult(res);
        setFitResult(null);
        setContingencyResult(null);
      } else {
        const res = runContingencyAnalysis({
          rows: allRows,
          rowVar: contRowCol,
          colVar: contColCol,
          alpha,
          ciLevel
        });
        setContingencyResult(res);
        setFitResult(null);
        setMraResult(null);
      }
      setCurrentStep(7);
    } catch (err: any) {
      setFitError(err.message || 'Terjadi kesalahan saat menjalankan analisis.');
    } finally {
      setIsFitting(false);
    }
  };

  const toggleXColumn = (col: string) => {
    if (col === yCol) return;
    if (analysisMethod === 'SLR') {
      setXCols([col]);
      return;
    }
    setXCols(prev => (prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]));
  };

  const filteredColumns = availableColumns.filter(c =>
    c.toLowerCase().includes(columnSearchQuery.toLowerCase())
  );

  const selectedCategoricXCols = xCols.filter(c => {
    const t = columnTypeMap[c]?.type;
    return t === 'categorical' || t === 'text' || t === 'binary';
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '28px' }}>
      {/* Mobile Compact Stepper Header */}
      <div
        className="mobile-only-stepper"
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: '6px',
          padding: '10px 12px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)'
        }}
      >
        {WIZARD_STEPS.map(s => {
          const active = currentStep === s.id;
          const passed = currentStep > s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={s.id > currentStep && !(s.id === 7 && (fitResult || mraResult || contingencyResult))}
              onClick={() => {
                if (s.id <= currentStep) setCurrentStep(s.id);
              }}
              style={{
                minHeight: '44px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: active ? 'var(--primary)' : passed ? 'var(--success-bg)' : 'var(--surface-muted)',
                color: active ? '#ffffff' : passed ? 'var(--success)' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                cursor: s.id <= currentStep ? 'pointer' : 'default'
              }}
            >
              {s.id}. {s.shortTitle}
            </button>
          );
        })}
      </div>

      {/* Main 3-Column Responsive Grid (Stepper Left | Main Stage Center | Config Summary Right on Step 1-6) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: currentStep === 7 ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '16px',
          alignItems: 'start'
        }}
      >
        {/* Center / Full Stage Container */}
        <div
          style={{
            gridColumn: currentStep === 7 ? '1 / -1' : 'span 2',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            minWidth: 0
          }}
        >
          {/* STEP 1: SUMBER DATA & SHEET */}
          {currentStep === 1 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                  Langkah 1 — Pilih Sumber Data &amp; Lembar Kerja (Sheet)
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: 'var(--text-muted)' }}>
                  Unggah file Excel/CSV, tautkan Google Sheets, atau coba langsung dengan dataset penelitian siap pakai.
                </p>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { id: 'upload' as const, label: 'Unggah File (.xlsx / .csv)', icon: UploadCloud },
                  { id: 'link' as const, label: 'Impor Google Sheets', icon: Link2 },
                  { id: 'sample' as const, label: 'Dataset Contoh Siap Uji', icon: Sparkles }
                ].map(tab => {
                  const Icon = tab.icon;
                  const active = sourceType === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSourceType(tab.id)}
                      style={{
                        minHeight: '44px',
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-sm)',
                        border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                        background: active ? 'var(--primary)' : 'var(--surface-muted)',
                        color: active ? '#ffffff' : 'var(--text)',
                        fontSize: '13px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      <Icon size={16} /> {tab.label}
                    </button>
                  );
                })}
              </div>

              {sourceType === 'upload' && (
                <div style={{ padding: '20px', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-muted)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileSpreadsheet size={20} color="var(--primary)" />
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>Unggah Dataset (.xlsx, .xls, .csv — Maks. 10 MB)</strong>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    disabled={isLoading}
                    style={{ fontSize: '16px', color: 'var(--text)', minHeight: '44px' }}
                  />
                  {isLoading && <span style={{ fontSize: '13px', color: 'var(--primary)' }}>Sedang memproses &amp; membaca sheet file...</span>}
                </div>
              )}

              {sourceType === 'link' && (
                <div style={{ padding: '18px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-muted)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text)' }}>
                    Tautan Google Sheets (Pastikan akses &quot;Anyone with the link can view&quot;)
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <input
                      type="url"
                      value={googleSheetsUrl}
                      onChange={e => setGoogleSheetsUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      style={{
                        flex: 1,
                        minWidth: '220px',
                        minHeight: '44px',
                        padding: '10px 12px',
                        fontSize: '16px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)'
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleGoogleSheetsImport}
                      disabled={isLoading}
                      style={{ minHeight: '44px' }}
                    >
                      {isLoading ? 'Mengimpor...' : 'Impor Spreadsheet'}
                    </button>
                  </div>
                </div>
              )}

              {sourceType === 'sample' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div style={{ padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <strong style={{ fontSize: '14px', color: 'var(--text)' }}>1. Sampel Cross-Section, MRA &amp; Kontingensi (n = 65)</strong>
                      <p style={{ margin: '6px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Memuat variabel numerik (`Pengeluaran_RND`, `Biaya_Promosi`, `Indeks_Inovasi_Z`, `Nilai_Penjualan_Y`) serta kategorik (`Kategori_Sektor`, `Skala_Usaha`).
                      </p>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => handleLoadSample('cross_section')} style={{ minHeight: '44px' }}>
                      Muat Sampel Cross-Section
                    </button>
                  </div>
                  <div style={{ padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <strong style={{ fontSize: '14px', color: 'var(--text)' }}>2. Sampel Time Series Bulanan (n = 48)</strong>
                      <p style={{ margin: '6px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Data makroekonomi bulanan (`Bulan`, `Inflasi_Persen`, `BI_Rate`, `Kurs_USD`, `Indeks_Pasar_Y`) siap uji stasioneritas &amp; autokorelasi.
                      </p>
                    </div>
                    <button type="button" className="btn btn-outline" onClick={() => handleLoadSample('time_series')} style={{ minHeight: '44px' }}>
                      Muat Sampel Time Series
                    </button>
                  </div>
                </div>
              )}

              {ingestionError && (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '13px' }}>
                  <strong>Gagal:</strong> {ingestionError}
                </div>
              )}
              {ingestionWarning && (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', color: 'var(--warn)', fontSize: '13px' }}>
                  {ingestionWarning}
                </div>
              )}

              {sheetsList.length > 0 && allRows.length > 0 && (
                <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                      File Aktif: {fileName} ({allRows.length} baris, {availableColumns.length} kolom)
                    </span>
                    {sheetsList.length > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <label style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Pilih Sheet:</label>
                        <select
                          value={selectedSheet}
                          onChange={e => selectSheetByName(e.target.value)}
                          style={{ minHeight: '44px', fontSize: '16px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        >
                          {sheetsList.map(sh => <option key={sh} value={sh}>{sh}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => setCurrentStep(2)} style={{ minHeight: '44px' }}>
                    Lanjut ke Pembersihan Data <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PRATINJAU & PEMBERSIHAN DATA */}
          {currentStep === 2 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                    Langkah 2 — Pratinjau &amp; Pembersihan Data
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    Tangani data kosong (missing values) atau baris anomali. Snapshot awal selalu terjaga untuk tombol Reset.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleResetCleaning}
                  style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={14} /> Reset ke Data Awal ({originalRows.length} baris)
                </button>
              </div>

              {/* Quick Audit Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Baris Aktif / Awal</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{allRows.length} / {originalRows.length}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Jumlah Kolom</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{availableColumns.length}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Sel Kosong</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: datasetProfile.totalMissingCells > 0 ? 'var(--warn)' : 'var(--success)' }}>
                    {datasetProfile.totalMissingCells}
                  </div>
                </div>
                <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ukuran File</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{(fileSizeBytes / 1024).toFixed(1)} KB</div>
                </div>
              </div>

              {/* Policy Controls */}
              <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Kebijakan Missing Values:</label>
                  <select
                    value={missingPolicy}
                    onChange={e => setMissingPolicy(e.target.value as MissingPolicyChoice)}
                    style={{ minHeight: '44px', fontSize: '16px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                  >
                    <option value="listwise">Listwise Deletion (Hapus Baris Kosong — Standar SPSS)</option>
                    <option value="impute_mean">Imputasi Rata-rata (Mean Imputation)</option>
                    <option value="impute_median">Imputasi Median (Tahan Outlier)</option>
                    <option value="linear_interpolation">Interpolasi Linear (Disarankan untuk Time Series)</option>
                  </select>
                </div>
                <button type="button" className="btn btn-primary" onClick={handleApplyDataCleaning} style={{ minHeight: '44px' }}>
                  Terapkan ke Preview
                </button>
              </div>

              {cleaningNotice && (
                <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--info-bg)', border: '1px solid var(--info-border)', color: 'var(--info)', fontSize: '13px' }}>
                  {cleaningNotice}
                </div>
              )}

              {/* Preview Table */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                      {availableColumns.map(c => (
                        <th key={c} style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                          {c} <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>({columnTypeMap[c]?.type})</span>
                        </th>
                      ))}
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.slice(0, 10).map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                        {availableColumns.map(c => (
                          <td key={c} style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                            {row[c] === null || row[c] === undefined || row[c] === ''
                              ? <span style={{ color: 'var(--danger)', fontStyle: 'italic' }}>null</span>
                              : String(sanitizeCellValue(row[c]) ?? '')}
                          </td>
                        ))}
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteRowManual(idx)}
                            style={{ minHeight: '32px', padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px', border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', cursor: 'pointer' }}
                          >
                            Hapus Baris
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" onClick={() => setCurrentStep(1)} style={{ minHeight: '44px' }}>
                  <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setCurrentStep(3)} disabled={allRows.length < 4} style={{ minHeight: '44px' }}>
                  Lanjut: Tentukan Jenis Data <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: CROSS SECTION VS TIME SERIES */}
          {currentStep === 3 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                  Langkah 3 — Struktur Data: Cross Section atau Time Series?
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: 'var(--text-muted)' }}>
                  Pilihan ini menentukan apakah sistem menjalankan uji stasioneritas (ADF &amp; KPSS), Breusch-Godfrey, dan ARCH-LM secara otomatis.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsTimeSeries(false)}
                  style={{
                    minHeight: '110px',
                    textAlign: 'left',
                    padding: '16px',
                    borderRadius: 'var(--radius)',
                    border: !isTimeSeries ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: !isTimeSeries ? 'var(--info-bg)' : 'var(--surface-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', fontWeight: 800, fontSize: '15px' }}>
                    <Database size={18} color="var(--primary)" /> Cross Section (Potong Lintang)
                  </div>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Observasi dikumpulkan pada satu titik waktu (misal: banyak perusahaan/responden dalam satu tahun). Durbin-Watson hanya menjadi acuan deskriptif.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsTimeSeries(true)}
                  style={{
                    minHeight: '110px',
                    textAlign: 'left',
                    padding: '16px',
                    borderRadius: 'var(--radius)',
                    border: isTimeSeries ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: isTimeSeries ? 'var(--info-bg)' : 'var(--surface-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', fontWeight: 800, fontSize: '15px' }}>
                    <Clock size={18} color="var(--primary)" /> Time Series (Runtun Waktu)
                  </div>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Data berurutan kronologis (harian, bulanan, tahunan). Sistem otomatis mengurutkan waktu, menguji stasioneritas ADF/KPSS, dan mewaspadai spurious regression.
                  </span>
                </button>
              </div>

              {isTimeSeries && (
                <div style={{ padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Pilih Kolom Penunjuk Waktu (Wajib)</label>
                      <select
                        value={timeCol}
                        onChange={e => setTimeCol(e.target.value)}
                        style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                      >
                        {availableColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Frekuensi Periode</label>
                      <select
                        value={frequency}
                        onChange={e => setFrequency(e.target.value as any)}
                        style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                      >
                        <option value="harian">Harian</option>
                        <option value="mingguan">Mingguan</option>
                        <option value="bulanan">Bulanan</option>
                        <option value="kuartalan">Kuartalan</option>
                        <option value="tahunan">Tahunan</option>
                        <option value="tidak_beraturan">Tidak Beraturan</option>
                      </select>
                    </div>
                  </div>

                  {timeSeriesSeqCheck && (
                    <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: timeSeriesSeqCheck.warnings.length > 0 ? 'var(--warn-bg)' : 'var(--success-bg)', border: `1px solid ${timeSeriesSeqCheck.warnings.length > 0 ? 'var(--warn-border)' : 'var(--success-border)'}`, fontSize: '12.5px' }}>
                      <strong style={{ display: 'block', marginBottom: '4px' }}>
                        Audit Sekuens Time Series ({timeSeriesSeqCheck.isChronological ? 'Terurut Kronologis' : 'Perlu Pengurutan Otomatis'})
                      </strong>
                      <div>{timeSeriesSeqCheck.sortedPreviewNote}</div>
                      {timeSeriesSeqCheck.warnings.map((w, i) => (
                        <div key={i} style={{ marginTop: '4px', color: 'var(--warn)' }}>• {w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setCurrentStep(2)} style={{ minHeight: '44px' }}>
                  <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setCurrentStep(4)} style={{ minHeight: '44px' }}>
                  Lanjut: Pilih Metode Statistik <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: PILIH METODE ANALISIS */}
          {currentStep === 4 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                  Langkah 4 — Pilih Metode Analisis Statistik
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: 'var(--text-muted)' }}>
                  Setiap metode memiliki formulir variabel serta format tabel SPSS tersendiri.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
                {[
                  {
                    id: 'SLR' as const,
                    title: 'Simple Linear Regression (SLR)',
                    desc: 'Menguji hubungan linear 1 variabel independen (X) terhadap 1 variabel dependen numerik kontinu (Y).',
                    icon: Sparkles
                  },
                  {
                    id: 'MLR' as const,
                    title: 'Multiple Linear Regression (MLR)',
                    desc: 'Menguji pengaruh simultan dan parsial 2 atau lebih variabel X (numerik maupun kategorik/dummy) terhadap Y.',
                    icon: Layers
                  },
                  {
                    id: 'MRA' as const,
                    title: 'Moderated Regression Analysis (MRA)',
                    desc: 'Menguji apakah variabel moderator Z memperkuat/memperlemah hubungan X ke Y melalui uji interaksi X*Z, Simple Slope & Johnson-Neyman.',
                    icon: Sliders
                  },
                  {
                    id: 'Contingency' as const,
                    title: 'Analisis Kontingensi & Chi-Square',
                    desc: 'Prosedur terpisah (Crosstabs) untuk menguji asosiasi antara dua variabel kategorikal dengan Chi-Square, Fisher Exact, Cramér V & OR/RR.',
                    icon: LayoutGrid
                  }
                ].map(card => {
                  const Icon = card.icon;
                  const active = analysisMethod === card.id;
                  const disabledContingencyTS = isTimeSeries && card.id === 'Contingency';
                  return (
                    <button
                      key={card.id}
                      type="button"
                      disabled={disabledContingencyTS}
                      onClick={() => {
                        setAnalysisMethod(card.id);
                        if (card.id === 'SLR' && xCols.length > 1) setXCols(xCols.slice(0, 1));
                      }}
                      style={{
                        minHeight: '130px',
                        textAlign: 'left',
                        padding: '16px',
                        borderRadius: 'var(--radius)',
                        border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: active ? 'var(--info-bg)' : 'var(--surface-muted)',
                        opacity: disabledContingencyTS ? 0.55 : 1,
                        cursor: disabledContingencyTS ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14.5px', color: 'var(--text)' }}>
                        <Icon size={18} color="var(--primary)" /> {card.title}
                      </div>
                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{card.desc}</span>
                      {disabledContingencyTS && (
                        <span style={{ fontSize: '11.5px', color: 'var(--warn)', fontWeight: 600 }}>
                          Tidak berlaku untuk struktur Time Series.
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setCurrentStep(3)} style={{ minHeight: '44px' }}>
                  <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setCurrentStep(5)} style={{ minHeight: '44px' }}>
                  Lanjut: Pilih Variabel <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: KONFIGURASI VARIABEL & PARAMETER */}
          {currentStep === 5 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                    Langkah 5 — Konfigurasi Variabel ({analysisMethod})
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    Pilih peran variabel sesuai metode terpilih. Mode Dasar menyembunyikan opsi teknis lanjutan.
                  </p>
                </div>

                {/* Mode Basic vs Advanced */}
                <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setAnalysisMode('basic')}
                    style={{
                      minHeight: '44px',
                      padding: '8px 14px',
                      border: 'none',
                      background: analysisMode === 'basic' ? 'var(--primary)' : 'var(--surface-muted)',
                      color: analysisMode === 'basic' ? '#ffffff' : 'var(--text)',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Mode Dasar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalysisMode('advanced')}
                    style={{
                      minHeight: '44px',
                      padding: '8px 14px',
                      border: 'none',
                      background: analysisMode === 'advanced' ? 'var(--primary)' : 'var(--surface-muted)',
                      color: analysisMode === 'advanced' ? '#ffffff' : 'var(--text)',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Mode Lanjutan
                  </button>
                </div>
              </div>

              {/* Form SLR / MLR */}
              {(analysisMethod === 'SLR' || analysisMethod === 'MLR') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                      Variabel Dependen (Y) — Wajib Numerik Kontinu
                    </label>
                    <select
                      value={yCol}
                      onChange={e => setYCol(e.target.value)}
                      style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                    >
                      {availableColumns
                        .filter(c => !isTimeSeries || c !== timeCol)
                        .map(c => (
                          <option key={c} value={c}>
                            {c} ({columnTypeMap[c]?.type || 'unknown'})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                      <label style={{ fontSize: '13px', fontWeight: 700 }}>
                        Variabel Independen (X) — {analysisMethod === 'SLR' ? 'Pilih tepat 1 variabel' : `Terpilih: ${xCols.length} variabel`}
                      </label>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setIsMobilePickerOpen(true)}
                        style={{ minHeight: '44px', fontSize: '13px' }}
                      >
                        <Search size={14} style={{ marginRight: '6px' }} /> Cari Variabel X
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: '8px' }}>
                      {availableColumns
                        .filter(c => c !== yCol && (!isTimeSeries || c !== timeCol))
                        .map(col => {
                          const selected = xCols.includes(col);
                          const cType = columnTypeMap[col]?.type;
                          return (
                            <button
                              key={col}
                              type="button"
                              onClick={() => toggleXColumn(col)}
                              style={{
                                minHeight: '44px',
                                padding: '8px 12px',
                                borderRadius: 'var(--radius-sm)',
                                border: selected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                background: selected ? 'var(--info-bg)' : 'var(--surface-muted)',
                                color: 'var(--text)',
                                textAlign: 'left',
                                fontSize: '13px',
                                fontWeight: selected ? 700 : 500,
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{col}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{cType}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* Reference Category Pickers for Selected Categorical X */}
                  {selectedCategoricXCols.length > 0 && (
                    <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--text)' }}>
                        Dummy Coding Otomatis — Pilih Kategori Acuan (Reference Category):
                      </strong>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                        {selectedCategoricXCols.map(catCol => {
                          const cats = categoricalUniqueMap[catCol] || [];
                          return (
                            <div key={catCol}>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Acuan untuk {catCol}:</label>
                              <select
                                value={refCategories[catCol] || cats[0] || ''}
                                onChange={e => setRefCategories(prev => ({ ...prev, [catCol]: e.target.value }))}
                                style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                              >
                                {cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Form MRA */}
              {analysisMethod === 'MRA' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Variabel Dependen (Y)</label>
                    <select
                      value={yCol}
                      onChange={e => setYCol(e.target.value)}
                      style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                    >
                      {availableColumns.map(c => <option key={c} value={c}>{c} ({columnTypeMap[c]?.type})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Prediktor Utama (X)</label>
                    <select
                      value={mraXCol}
                      onChange={e => setMraXCol(e.target.value)}
                      style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                    >
                      {availableColumns.filter(c => c !== yCol).map(c => <option key={c} value={c}>{c} ({columnTypeMap[c]?.type})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Variabel Moderator (Z)</label>
                    <select
                      value={mraZCol}
                      onChange={e => {
                        const val = e.target.value;
                        setMraZCol(val);
                        const t = columnTypeMap[val]?.type;
                        setMraIsCategoricalMod(t === 'categorical' || t === 'text');
                      }}
                      style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                    >
                      {availableColumns.filter(c => c !== yCol && c !== mraXCol).map(c => <option key={c} value={c}>{c} ({columnTypeMap[c]?.type})</option>)}
                    </select>
                  </div>

                  <div style={{ gridColumn: '1 / -1', padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, minHeight: '44px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={mraCenterVariables} onChange={e => setMraCenterVariables(e.target.checked)} />
                      Gunakan Mean Centering (Direkomendasikan agar bebas multikolinearitas struktural)
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, minHeight: '44px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={mraIsCategoricalMod} onChange={e => setMraIsCategoricalMod(e.target.checked)} />
                      Moderator Z Bersifat Kategorikal
                    </label>
                    {mraIsCategoricalMod && (categoricalUniqueMap[mraZCol]?.length ?? 0) >= 2 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Acuan Z:</label>
                        <select
                          value={mraRefCategory || categoricalUniqueMap[mraZCol]?.[0] || ''}
                          onChange={e => setMraRefCategory(e.target.value)}
                          style={{ minHeight: '44px', fontSize: '16px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        >
                          {(categoricalUniqueMap[mraZCol] || []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Form Contingency */}
              {analysisMethod === 'Contingency' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Variabel Baris (Rows)</label>
                    <select
                      value={contRowCol}
                      onChange={e => setContRowCol(e.target.value)}
                      style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                    >
                      {availableColumns.map(c => (
                        <option key={c} value={c}>
                          {c} ({columnTypeMap[c]?.uniqueCount ?? '?'} kategori)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Variabel Kolom (Columns)</label>
                    <select
                      value={contColCol}
                      onChange={e => setContColCol(e.target.value)}
                      style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                    >
                      {availableColumns.filter(c => c !== contRowCol).map(c => (
                        <option key={c} value={c}>
                          {c} ({columnTypeMap[c]?.uniqueCount ?? '?'} kategori)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Advanced Mode Technical Parameters */}
              {analysisMode === 'advanced' && (
                <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Tingkat Signifikansi (α)</label>
                    <select
                      value={alpha}
                      onChange={e => setAlpha(Number(e.target.value))}
                      style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    >
                      <option value={0.01}>0.01 (1%)</option>
                      <option value={0.05}>0.05 (5% — Standar SPSS)</option>
                      <option value={0.10}>0.10 (10%)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Confidence Interval</label>
                    <select
                      value={ciLevel}
                      onChange={e => setCiLevel(Number(e.target.value))}
                      style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    >
                      <option value={0.90}>90%</option>
                      <option value={0.95}>95% (Standar SPSS)</option>
                      <option value={0.99}>99%</option>
                    </select>
                  </div>
                  {(analysisMethod === 'SLR' || analysisMethod === 'MLR') && (
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>Metode Entry</label>
                      <select
                        value={entryMethod}
                        onChange={e => setEntryMethod(e.target.value as any)}
                        style={{ width: '100%', minHeight: '44px', fontSize: '16px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                      >
                        <option value="enter">Enter (Simultaneous)</option>
                        <option value="forward">Forward (Eksploratori)</option>
                        <option value="backward">Backward (Eksploratori)</option>
                        <option value="stepwise">Stepwise (Eksploratori)</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setCurrentStep(4)} style={{ minHeight: '44px' }}>
                  <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                </button>
                <button type="button" className="btn btn-primary" onClick={triggerValidationStep6} style={{ minHeight: '44px' }}>
                  Validasi &amp; Lihat Ringkasan <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: RINGKASAN, VALIDASI & PRATINJAU PRA-ANALISIS */}
          {currentStep === 6 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                  Langkah 6 — Ringkasan &amp; Validasi Pra-Estimasi ({analysisMethod})
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                  Sistem memverifikasi seluruh invarian matematis dan kelayakan sampel sebelum estimasi dijalankan.
                </p>
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { id: 'validation' as const, label: 'Validasi Aturan & Sampel' },
                  ...(analysisMethod !== 'Contingency'
                    ? [
                        { id: 'descriptives' as const, label: 'Deskriptif SPSS (8 Metrik)' },
                        { id: 'correlation' as const, label: 'Matriks Korelasi' },
                        { id: 'charts' as const, label: 'Histogram & Boxplot' }
                      ]
                    : [])
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStep6SubTab(tab.id)}
                    style={{
                      minHeight: '44px',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: step6SubTab === tab.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: step6SubTab === tab.id ? 'var(--primary)' : 'var(--surface-muted)',
                      color: step6SubTab === tab.id ? '#ffffff' : 'var(--text)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {step6SubTab === 'validation' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {extraValidation.isValid ? (
                    <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', background: 'var(--success-bg)', border: '1px solid var(--success-border)', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success)' }}>
                      <CheckCircle2 size={20} />
                      <strong>Lolos Validasi! Seluruh invarian metode {analysisMethod} terpenuhi.</strong>
                    </div>
                  ) : (
                    <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <XCircle size={18} /> Estimasi Diblokir karena Pelanggaran Invarian:
                      </strong>
                      <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', fontSize: '13px' }}>
                        {extraValidation.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}

                  {extraValidation.warnings.length > 0 && (
                    <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', color: 'var(--warn)' }}>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={18} /> Peringatan Metodologis:
                      </strong>
                      <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', fontSize: '13px' }}>
                        {extraValidation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  {validationSummary?.timeSeriesSummary && (
                    <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <strong>Struktur Waktu:</strong> {validationSummary.timeSeriesSummary.notice}
                    </div>
                  )}
                </div>
              )}

              {step6SubTab === 'descriptives' && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--surface-muted)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Variabel</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>N</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Min</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Max</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Mean</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Std. Dev</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Skewness</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Kurtosis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {descriptiveStats.map(s => (
                        <tr key={s.variable} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>{s.variable}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.n}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.min}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.max}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.mean}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.stdDev}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.skewness}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.kurtosis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {step6SubTab === 'correlation' && (
                <div style={{ overflowX: 'auto' }}>
                  {correlationData ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--surface-muted)' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Variabel</th>
                          {correlationData.variables.map(v => <th key={v} style={{ padding: '8px 10px', textAlign: 'right' }}>{v}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {correlationData.variables.map(v1 => (
                          <tr key={v1} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>{v1}</td>
                            {correlationData.variables.map(v2 => (
                              <td key={v2} style={{ padding: '8px 10px', textAlign: 'right' }}>
                                {(correlationData.pearson[v1]?.[v2] ?? 0).toFixed(3)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Pilih minimal 2 variabel numerik.</span>
                  )}
                </div>
              )}

              {step6SubTab === 'charts' && visualChartData && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                    <strong style={{ fontSize: '13px' }}>Ringkasan Boxplot ({yCol})</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px', fontSize: '12.5px' }}>
                      <span>Min: <strong>{visualChartData.boxplot.min}</strong></span>
                      <span>Q1: <strong>{visualChartData.boxplot.q1}</strong></span>
                      <span>Median: <strong>{visualChartData.boxplot.median}</strong></span>
                      <span>Q3: <strong>{visualChartData.boxplot.q3}</strong></span>
                      <span>Max: <strong>{visualChartData.boxplot.max}</strong></span>
                      <span>Outlier (&gt;1.5 IQR): <strong>{visualChartData.boxplot.outliers.length}</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {fitError && (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '13px' }}>
                  <strong>Kesalahan Komputasi:</strong> {fitError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" onClick={() => setCurrentStep(5)} style={{ minHeight: '44px' }}>
                  <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Ubah Konfigurasi
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!extraValidation.isValid || isFitting}
                  onClick={handleExecuteAnalysis}
                  style={{ minHeight: '44px' }}
                >
                  {isFitting ? 'Sedang Menghitung...' : `Jalankan Analisis ${analysisMethod} (Hasil SPSS)`}
                  <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 7: HASIL ANALISIS GAYA SPSS (ADAPTIVE ROUTER) */}
          {currentStep === 7 && (analysisMethod === 'SLR' || analysisMethod === 'MLR') && fitResult && (
            <RegressionResultsView
              result={fitResult}
              onBackToConfig={() => setCurrentStep(5)}
              onReRun={handleExecuteAnalysis}
              allRows={allRows}
              yCol={yCol}
              xCols={analysisMethod === 'SLR' ? xCols.slice(0, 1) : xCols}
              isTimeSeries={isTimeSeries}
              timeCol={timeCol}
              frequency={frequency}
              alpha={alpha}
              fileName={fileName}
              selectedSheet={selectedSheet}
              analysisMode={analysisMode}
              refCategories={refCategories}
            />
          )}

          {currentStep === 7 && analysisMethod === 'MRA' && mraResult && (
            <MRAResultView
              mra={mraResult}
              onBackToConfig={() => setCurrentStep(5)}
              onReRun={handleExecuteAnalysis}
              fileName={fileName}
              selectedSheet={selectedSheet}
            />
          )}

          {currentStep === 7 && analysisMethod === 'Contingency' && contingencyResult && (
            <ContingencyResultView
              result={contingencyResult}
              alpha={alpha}
              onBackToConfig={() => setCurrentStep(5)}
              onReRun={handleExecuteAnalysis}
              fileName={fileName}
              selectedSheet={selectedSheet}
            />
          )}
        </div>

        {/* Right Summary Panel (visible on Steps 1-6) */}
        {currentStep !== 7 && (
          <aside
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
              <ShieldCheck size={18} color="var(--primary)" />
              <strong style={{ fontSize: '14px', color: 'var(--text)' }}>Ringkasan Konfigurasi</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              <div><strong>Dataset:</strong> {fileName} ({allRows.length} baris)</div>
              <div><strong>Struktur:</strong> {isTimeSeries ? `Time Series (${timeCol}, ${frequency})` : 'Cross Section'}</div>
              <div><strong>Metode:</strong> {analysisMethod} ({analysisMode === 'basic' ? 'Mode Dasar' : 'Mode Lanjutan'})</div>
              {(analysisMethod === 'SLR' || analysisMethod === 'MLR') && (
                <>
                  <div><strong>Dependen (Y):</strong> {yCol || '-'}</div>
                  <div><strong>Independen (X):</strong> {xCols.join(', ') || '-'}</div>
                </>
              )}
              {analysisMethod === 'MRA' && (
                <>
                  <div><strong>Y / X / Z:</strong> {yCol} / {mraXCol} / {mraZCol}</div>
                  <div><strong>Mean Centering:</strong> {mraCenterVariables ? 'Aktif' : 'Nonaktif'}</div>
                </>
              )}
              {analysisMethod === 'Contingency' && (
                <div><strong>Tabel:</strong> {contRowCol} × {contColCol}</div>
              )}
              <div><strong>Missing Policy:</strong> {missingPolicy}</div>
              <div><strong>Alpha (α):</strong> {alpha} | CI: {Math.round(ciLevel * 100)}%</div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <strong style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tahapan Wizard (7 Langkah)</strong>
              {WIZARD_STEPS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  disabled={s.id > currentStep}
                  onClick={() => s.id <= currentStep && setCurrentStep(s.id)}
                  style={{
                    minHeight: '36px',
                    textAlign: 'left',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: currentStep === s.id ? '1px solid var(--primary)' : '1px solid transparent',
                    background: currentStep === s.id ? 'var(--info-bg)' : 'transparent',
                    color: currentStep === s.id ? 'var(--primary)' : s.id < currentStep ? 'var(--success)' : 'var(--text-muted)',
                    fontSize: '12.5px',
                    fontWeight: currentStep === s.id ? 700 : 500,
                    cursor: s.id <= currentStep ? 'pointer' : 'default'
                  }}
                >
                  {s.id < currentStep ? '✓ ' : `${s.id}. `}{s.title}
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Bottom Sheet / Search Picker Modal for X Predictors */}
      {isMobilePickerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              background: 'var(--surface)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxHeight: '80vh'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '15px', color: 'var(--text)' }}>Cari &amp; Pilih Variabel Independen (X)</strong>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setIsMobilePickerOpen(false)}
                style={{ minHeight: '44px' }}
              >
                Tutup
              </button>
            </div>
            <input
              type="text"
              value={columnSearchQuery}
              onChange={e => setColumnSearchQuery(e.target.value)}
              placeholder="Ketik nama variabel..."
              style={{
                minHeight: '44px',
                fontSize: '16px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                color: 'var(--text)'
              }}
            />
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredColumns
                .filter(c => c !== yCol && (!isTimeSeries || c !== timeCol))
                .map(col => {
                  const selected = xCols.includes(col);
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => toggleXColumn(col)}
                      style={{
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: selected ? '1px solid var(--primary)' : '1px solid var(--border)',
                        background: selected ? 'var(--info-bg)' : 'var(--surface-muted)',
                        color: 'var(--text)',
                        textAlign: 'left',
                        fontSize: '13.5px',
                        fontWeight: selected ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      {selected ? '✓ ' : ''}{col} ({columnTypeMap[col]?.type})
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
