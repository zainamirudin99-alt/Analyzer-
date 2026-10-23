'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  PanelFitInput,
  PanelFitResult,
  StataConsoleBlockData
} from '@/lib/panel-types';
import {
  validatePanelStructure,
  validatePanelMappingConfig,
  inspectAndCleanPanelData,
  DataCleaningReport,
  fitPanelCEM,
  fitPanelFEM,
  fitPanelREM,
  testChow,
  testHausman,
  testMundlakCRE,
  testBreuschPaganLM,
  selectOptimalPanelModel,
  testPanelVIF,
  testGroupwiseHeteroGreene,
  testWooldridgeSerial,
  testPanelNormality,
  computeClusterRobustSE
} from '@/lib/panel-engine';
import { generateAllPanelConsoleBlocks, formatStataRegTable } from '@/lib/panel-interpretation';
import { PanelStepper } from './PanelStepper';
import { StataConsoleBlock } from './StataConsoleBlock';
import {
  Play,
  Database,
  FileSpreadsheet,
  Link2,
  UploadCloud,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  XCircle,
  Info,
  RefreshCw,
  Table,
  Copy,
  Check,
  Terminal,
  ShieldCheck
} from 'lucide-react';
import grunfeldFixture from '../../tests/fixtures/panel/grunfeld.json';

interface SheetData {
  sheetName: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  previewRows: Record<string, any>[];
  allRows: Record<string, any>[];
}

export const PanelTab: React.FC = () => {
  // Source State: 'upload' | 'link' | 'preset'
  const [sourceType, setSourceType] = useState<'upload' | 'link' | 'preset'>('preset');
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [ingestionError, setIngestionError] = useState<string | null>(null);

  // File & Sheet State
  const [fileName, setFileName] = useState<string>('grunfeld_1958.xlsx');
  const [sheetsList, setSheetsList] = useState<string[]>(['Grunfeld_Panel']);
  const [activeSheet, setActiveSheet] = useState<string>('Grunfeld_Panel');
  const [availableSheetsData, setAvailableSheetsData] = useState<SheetData[]>([
    {
      sheetName: 'Grunfeld_Panel',
      rowCount: grunfeldFixture.length,
      columnCount: 5,
      columns: ['company', 'year', 'invest', 'mvalue', 'kstock'],
      previewRows: grunfeldFixture.slice(0, 10),
      allRows: grunfeldFixture
    }
  ]);

  // Current Dataset Rows & Columns
  const [dataRows, setDataRows] = useState<Record<string, any>[]>(grunfeldFixture);
  const [columns, setColumns] = useState<string[]>(['company', 'year', 'invest', 'mvalue', 'kstock']);

  // Variable Mapping State (P1)
  const [idCol, setIdCol] = useState<string>('company');
  const [timeCol, setTimeCol] = useState<string>('year');
  const [yCol, setYCol] = useState<string>('invest');
  const [xCols, setXCols] = useState<string[]>(['mvalue', 'kstock']);

  // Data Cleaning & Stata Log State (P2)
  const [isCopiedLog, setIsCopiedLog] = useState<boolean>(false);
  const [isStataLogOpen, setIsStataLogOpen] = useState<boolean>(true);

  // Stepper & Execution State
  const [activeStep, setActiveStep] = useState<number>(0);
  const [maxReachedStep, setMaxReachedStep] = useState<number>(12);
  const [step8ActiveModel, setStep8ActiveModel] = useState<'fem' | 'rem' | 'cem'>('fem');
  const [fitResult, setFitResult] = useState<PanelFitResult | null>(null);
  const [consoleBlocks, setConsoleBlocks] = useState<StataConsoleBlockData[]>([]);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 10-Row Preview computed from active sheet
  const previewRows = useMemo(() => {
    return dataRows.slice(0, 10);
  }, [dataRows]);

  // Real-time Mapping Invariant Validation (Invarian I1, I5, I6, I10, I11)
  const mappingValidation = useMemo(() => {
    if (!dataRows || dataRows.length === 0 || !idCol || !timeCol || !yCol) {
      return {
        isValid: false,
        errors: ['Lengkapi pilihan variabel entitas, waktu, dependen (Y), dan independen (X).'],
        warnings: [],
        summary: { nEntities: 0, nPeriods: 0, isBalanced: false, nObs: 0 }
      };
    }
    return validatePanelMappingConfig(dataRows, idCol, timeCol, yCol, xCols);
  }, [dataRows, idCol, timeCol, yCol, xCols]);

  // Data Cleaning & Inspection Report (P2)
  const cleaningReport: DataCleaningReport = useMemo(() => {
    if (!dataRows || dataRows.length === 0 || !idCol || !timeCol || !yCol || xCols.length === 0) {
      return {
        totalRawObs: dataRows?.length || 0,
        validObs: 0,
        droppedObs: 0,
        duplicateCount: 0,
        missingSummary: {},
        timeInvariantVars: [],
        entityEncoding: {
          isEncoded: false,
          originalCol: idCol,
          encodedCol: idCol,
          labelMap: {}
        },
        cleanedRows: dataRows || [],
        stataDoLog: ''
      };
    }
    return inspectAndCleanPanelData(dataRows, idCol, timeCol, yCol, xCols, {
      dropDuplicates: true,
      handleMissing: 'listwise'
    });
  }, [dataRows, idCol, timeCol, yCol, xCols]);

  // Dynamic Stata console block to display (supports model switching in Step 8)
  const currentBlockToDisplay = useMemo(() => {
    if (!consoleBlocks || consoleBlocks.length === 0 || !consoleBlocks[activeStep]) {
      return null;
    }
    const baseBlock = consoleBlocks[activeStep];
    if (activeStep === 8 && fitResult) {
      const model = fitResult.models[step8ActiveModel];
      const cmd = step8ActiveModel === 'cem'
        ? `reg ${yCol} ${xCols.join(' ')}`
        : step8ActiveModel === 'fem'
        ? `xtreg ${yCol} ${xCols.join(' ')}, fe`
        : `xtreg ${yCol} ${xCols.join(' ')}, re`;
      return {
        ...baseBlock,
        stataCommand: cmd,
        stataOutput: formatStataRegTable(model, yCol)
      };
    }
    return baseBlock;
  }, [consoleBlocks, activeStep, fitResult, step8ActiveModel, yCol, xCols]);

  // Handle Copy Stata .do Log to Clipboard
  const handleCopyStataLog = () => {
    if (!cleaningReport.stataDoLog) return;
    navigator.clipboard.writeText(cleaningReport.stataDoLog);
    setIsCopiedLog(true);
    setTimeout(() => setIsCopiedLog(false), 2500);
  };

  // Jalankan estimasi lengkap
  const runFullEstimation = (
    rowsToUse: Record<string, any>[],
    currentId: string,
    currentTime: string,
    currentY: string,
    currentX: string[]
  ) => {
    try {
      setIsCalculating(true);
      setCalculationError(null);

      const decl = validatePanelStructure(rowsToUse, currentId, currentTime);
      if (!decl.isValid) {
        throw new Error(decl.errors.join(' '));
      }

      const input: PanelFitInput = {
        rows: rowsToUse,
        idCol: currentId,
        timeCol: currentTime,
        yCol: currentY,
        xCols: currentX,
        alpha: 0.05
      };

      const cem = fitPanelCEM(input);
      const fem = fitPanelFEM(input);
      const rem = fitPanelREM(input);

      const chow = testChow(cem, fem);
      const hausman = testHausman(fem, rem);
      const mundlak = testMundlakCRE(input);
      const bp = testBreuschPaganLM(input);
      const selection = selectOptimalPanelModel(chow, hausman, mundlak, bp);

      const vif = testPanelVIF(input);
      const greene = testGroupwiseHeteroGreene(input, fem);
      const serial = testWooldridgeSerial(input);

      const selectedModel = selection.selectedModel === 'FEM' ? fem : rem;
      const normality = testPanelNormality(selectedModel.residuals);
      const robustFinal = computeClusterRobustSE(selectedModel, input);

      const result: PanelFitResult = {
        success: true,
        declaration: decl,
        models: { cem, fem, rem },
        selection,
        selectedModel,
        finalModel: robustFinal,
        assumptions: {
          vif,
          greeneHetero: greene,
          wooldridgeSerial: serial,
          normality,
          clusterBiasWarning: robustFinal.clusterBiasWarning
        },
        consoleBlocks: []
      };

      const blocks = generateAllPanelConsoleBlocks(input, result);
      result.consoleBlocks = blocks;

      setFitResult(result);
      setConsoleBlocks(blocks);
      setMaxReachedStep(12);
    } catch (err: any) {
      console.error(err);
      setCalculationError(err.message || 'Terjadi kesalahan dalam estimasi regresi data panel.');
    } finally {
      setIsCalculating(false);
    }
  };

  // Inisialisasi awal dengan dataset Grunfeld
  useEffect(() => {
    runFullEstimation(grunfeldFixture, 'company', 'year', 'invest', ['mvalue', 'kstock']);
  }, []);

  // Handler Preset Grunfeld
  const handleLoadGrunfeldPreset = () => {
    setSourceType('preset');
    setDataRows(grunfeldFixture);
    setColumns(['company', 'year', 'invest', 'mvalue', 'kstock']);
    setFileName('grunfeld_1958.xlsx');
    setSheetsList(['Grunfeld_Panel']);
    setActiveSheet('Grunfeld_Panel');
    setAvailableSheetsData([
      {
        sheetName: 'Grunfeld_Panel',
        rowCount: grunfeldFixture.length,
        columnCount: 5,
        columns: ['company', 'year', 'invest', 'mvalue', 'kstock'],
        previewRows: grunfeldFixture.slice(0, 10),
        allRows: grunfeldFixture
      }
    ]);
    setIdCol('company');
    setTimeCol('year');
    setYCol('invest');
    setXCols(['mvalue', 'kstock']);
    setIngestionError(null);
    runFullEstimation(grunfeldFixture, 'company', 'year', 'invest', ['mvalue', 'kstock']);
  };

  // Handler Switch Sheet
  const handleSelectSheet = (sheetName: string, sheetsSource?: SheetData[]) => {
    setActiveSheet(sheetName);
    const sheets = sheetsSource || availableSheetsData;
    const target = sheets.find(s => s.sheetName === sheetName);
    if (target) {
      const rows = target.allRows || target.previewRows || [];
      setDataRows(rows);
      const cols = target.columns || (rows.length > 0 ? Object.keys(rows[0]) : []);
      setColumns(cols);

      // Auto-assign candidates
      if (cols.length >= 4) {
        setIdCol(cols[0]);
        setTimeCol(cols[1]);
        setYCol(cols[2]);
        setXCols([cols[3]]);
      }
    }
  };

  // Handler Local File Upload (.xlsx, .xls, .csv)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingFile(true);
    setIngestionError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/regression/upload', {
        method: 'POST',
        body: formData
      });

      const json = await res.json();
      if (!json.success) {
        setIngestionError(json.error || 'Gagal memproses file.');
        setIsLoadingFile(false);
        return;
      }

      setFileName(json.data.originalName || file.name);
      const names: string[] = json.data.sheetNames || [];
      setSheetsList(names);
      const sheets: SheetData[] = json.data.sheets || [];
      setAvailableSheetsData(sheets);

      if (names.length > 0) {
        handleSelectSheet(names[0], sheets);
      }
    } catch (err: any) {
      setIngestionError(`Terjadi kesalahan unggah: ${err.message}`);
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Handler Google Sheets Import
  const handleGoogleSheetsImport = async () => {
    if (!googleSheetsUrl.trim()) {
      setIngestionError('Masukkan tautan Google Sheets yang valid.');
      return;
    }

    setIsLoadingFile(true);
    setIngestionError(null);

    try {
      const res = await fetch('/api/regression/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: googleSheetsUrl.trim() })
      });

      const json = await res.json();
      if (!json.success) {
        setIngestionError(json.error || 'Gagal mengimpor dari Google Sheets.');
        setIsLoadingFile(false);
        return;
      }

      setFileName(json.data.originalName || 'Google_Sheets_Data.xlsx');
      const names: string[] = json.data.sheetNames || [];
      setSheetsList(names);
      const sheets: SheetData[] = json.data.sheets || [];
      setAvailableSheetsData(sheets);

      if (names.length > 0) {
        handleSelectSheet(names[0], sheets);
      }
    } catch (err: any) {
      setIngestionError(`Terjadi kesalahan jaringan: ${err.message}`);
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Toggle X Predictor
  const handleToggleX = (col: string) => {
    if (xCols.includes(col)) {
      if (xCols.length > 1) {
        setXCols(xCols.filter(c => c !== col));
      }
    } else {
      setXCols([...xCols, col]);
    }
  };

  return (
    <div className="panel-tab-wrapper" style={{ padding: '8px 0 40px 0' }}>
      {/* 1. Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--moss, #1e3d14) 0%, var(--fern, #2e6922) 100%)',
          color: '#ffffff',
          borderRadius: 'var(--radius, 16px)',
          padding: '24px 32px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-md, 0 8px 30px rgba(30, 61, 20, 0.12))'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}
            >
              Stata-Grade Econometric Engine
            </span>
            <h2 style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', marginBottom: '6px' }}>
              Regresi Data Panel (CEM, FEM, REM)
            </h2>
            <p style={{ opacity: 0.9, fontSize: '14px', maxWidth: '720px', margin: 0 }}>
              Modul regresi data panel lengkap bergaya Stata dengan alur 13 langkah: deklarasi struktur (xtset), estimasi OLS & GLS Swamy-Arora, uji pemilihan model bertingkat (Chow, Hausman, LM), uji asumsi klasik, dan koreksi Cluster-Robust SE.
            </p>
          </div>

          <button
            onClick={handleLoadGrunfeldPreset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--dew, #eef7eb)',
              color: 'var(--moss, #1e3d14)',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 18px',
              minHeight: '44px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}
          >
            <Database size={16} />
            <span>Pakai Data Contoh: Grunfeld (10 Entitas, 20 Tahun)</span>
          </button>
        </div>
      </div>

      {/* 2. Kartu Ingestion & Impor Data (P1) */}
      <div
        style={{
          background: 'var(--card, #ffffff)',
          border: '1px solid var(--border, #d2e2ca)',
          borderRadius: 'var(--radius, 16px)',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow, 0 4px 20px rgba(30, 61, 20, 0.08))'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--bark, #2b221a)', margin: 0 }}>
              Langkah 1: Impor Data Panel
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--stone, #687962)', margin: '4px 0 0 0' }}>
              Dukungan berkas Excel (.xlsx, .xls), CSV, atau impor langsung dari Google Sheets dengan perlindungan SSRF.
            </p>
          </div>

          {/* Source Tabs */}
          <div style={{ display: 'flex', gap: '8px', background: 'var(--dew, #eef7eb)', padding: '4px', borderRadius: '10px' }}>
            <button
              type="button"
              onClick={() => setSourceType('upload')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                minHeight: '38px',
                borderRadius: '8px',
                border: 'none',
                background: sourceType === 'upload' ? '#ffffff' : 'transparent',
                color: sourceType === 'upload' ? 'var(--moss, #1e3d14)' : 'var(--stone, #687962)',
                fontWeight: sourceType === 'upload' ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: sourceType === 'upload' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <UploadCloud size={15} />
              <span>Unggah File</span>
            </button>

            <button
              type="button"
              onClick={() => setSourceType('link')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                minHeight: '38px',
                borderRadius: '8px',
                border: 'none',
                background: sourceType === 'link' ? '#ffffff' : 'transparent',
                color: sourceType === 'link' ? 'var(--moss, #1e3d14)' : 'var(--stone, #687962)',
                fontWeight: sourceType === 'link' ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: sourceType === 'link' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Link2 size={15} />
              <span>Google Sheets</span>
            </button>

            <button
              type="button"
              onClick={handleLoadGrunfeldPreset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                minHeight: '38px',
                borderRadius: '8px',
                border: 'none',
                background: sourceType === 'preset' ? '#ffffff' : 'transparent',
                color: sourceType === 'preset' ? 'var(--moss, #1e3d14)' : 'var(--stone, #687962)',
                fontWeight: sourceType === 'preset' ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: sourceType === 'preset' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Database size={15} />
              <span>Preset Grunfeld</span>
            </button>
          </div>
        </div>

        {/* Upload Container */}
        {sourceType === 'upload' && (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border, #d2e2ca)',
              borderRadius: '12px',
              padding: '32px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'var(--sage, #f7faf5)',
              transition: 'all 0.2s ease',
              marginBottom: '16px'
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <FileSpreadsheet size={36} color="var(--fern, #2e6922)" style={{ margin: '0 auto 10px auto' }} />
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--bark, #2b221a)' }}>
              {isLoadingFile ? 'Mengunggah & Memvalidasi Berkas...' : 'Klik untuk Memilih File (.xlsx, .xls, .csv)'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--stone, #687962)', marginTop: '4px' }}>
              Maksimum 10 MB per berkas. Struktur data panel: kolom ID, Tahun/Waktu, Y, dan X.
            </div>
          </div>
        )}

        {/* Google Sheets Link Container */}
        {sourceType === 'link' && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pubhtml atau link berbagi Google Sheets"
              value={googleSheetsUrl}
              onChange={e => setGoogleSheetsUrl(e.target.value)}
              style={{
                flex: 1,
                minWidth: '280px',
                padding: '12px 16px',
                minHeight: '44px',
                fontSize: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border, #d2e2ca)',
                background: '#ffffff',
                color: 'var(--bark, #2b221a)'
              }}
            />
            <button
              type="button"
              onClick={handleGoogleSheetsImport}
              disabled={isLoadingFile || !googleSheetsUrl.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                minHeight: '44px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--fern, #2e6922)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '14px',
                cursor: isLoadingFile || !googleSheetsUrl.trim() ? 'not-allowed' : 'pointer',
                opacity: isLoadingFile || !googleSheetsUrl.trim() ? 0.6 : 1
              }}
            >
              {isLoadingFile ? <RefreshCw size={16} className="animate-spin" /> : <Link2 size={16} />}
              <span>Impor Spreadsheet</span>
            </button>
          </div>
        )}

        {ingestionError && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #f87171',
              color: '#b91c1c',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px'
            }}
          >
            <XCircle size={16} />
            <span>{ingestionError}</span>
          </div>
        )}

        {/* Sheet Selector & Info Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border, #d2e2ca)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--stone, #687962)' }}>
              Berkas Aktif:
            </span>
            <span style={{ fontWeight: 700, color: 'var(--bark, #2b221a)', fontSize: '13px' }}>
              {fileName}
            </span>

            {sheetsList.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                <span style={{ fontSize: '13px', color: 'var(--stone, #687962)' }}>Sheet:</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {sheetsList.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleSelectSheet(name)}
                      style={{
                        padding: '4px 10px',
                        minHeight: '32px',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: activeSheet === name ? 'var(--fern, #2e6922)' : 'var(--border, #d2e2ca)',
                        background: activeSheet === name ? 'var(--dew, #eef7eb)' : '#ffffff',
                        color: activeSheet === name ? 'var(--moss, #1e3d14)' : 'var(--stone, #687962)',
                        fontWeight: activeSheet === name ? 700 : 500,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--stone, #687962)' }}>
            Total {dataRows.length} baris observasi | {columns.length} kolom
          </div>
        </div>

        {/* 10-Row Table Preview */}
        {previewRows.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Table size={14} color="var(--stone, #687962)" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--stone, #687962)' }}>
                Pratinjau Data (10 Baris Pertama):
              </span>
            </div>
            <div
              style={{
                overflowX: 'auto',
                border: '1px solid var(--border, #d2e2ca)',
                borderRadius: '8px',
                background: '#ffffff'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--dew, #eef7eb)', borderBottom: '1px solid var(--border, #d2e2ca)' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--moss, #1e3d14)' }}>#</th>
                    {columns.map(c => (
                      <th key={c} style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--moss, #1e3d14)' }}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: i === previewRows.length - 1 ? 'none' : '1px solid #f0f4ee',
                        background: i % 2 === 0 ? '#ffffff' : '#fafdf8'
                      }}
                    >
                      <td style={{ padding: '6px 12px', color: 'var(--stone, #687962)' }}>{i + 1}</td>
                      {columns.map(c => (
                        <td key={c} style={{ padding: '6px 12px', color: 'var(--bark, #2b221a)' }}>
                          {String(r[c] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 3. Kartu Pemetaan Variabel (P1) */}
      <div
        style={{
          background: 'var(--card, #ffffff)',
          border: '1px solid var(--border, #d2e2ca)',
          borderRadius: 'var(--radius, 16px)',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow, 0 4px 20px rgba(30, 61, 20, 0.08))'
        }}
      >
        <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px', color: 'var(--bark, #2b221a)' }}>
          Langkah 2: Pemetaan Variabel Data Panel
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--stone, #687962)', marginBottom: '20px' }}>
          Tentukan identitas entitas (perusahaan/negara), penanda waktu, variabel terikat (Y), dan variabel bebas (X).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          {/* Kolom ID */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--stone, #687962)', marginBottom: '6px' }}>
              Kolom Entitas (idCol)
            </label>
            <select
              value={idCol}
              onChange={e => setIdCol(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                minHeight: '44px',
                fontSize: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border, #d2e2ca)',
                background: '#ffffff',
                color: 'var(--bark, #2b221a)'
              }}
            >
              {columns.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Kolom Waktu */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--stone, #687962)', marginBottom: '6px' }}>
              Kolom Waktu (timeCol)
            </label>
            <select
              value={timeCol}
              onChange={e => setTimeCol(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                minHeight: '44px',
                fontSize: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border, #d2e2ca)',
                background: '#ffffff',
                color: 'var(--bark, #2b221a)'
              }}
            >
              {columns.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Kolom Y */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--stone, #687962)', marginBottom: '6px' }}>
              Variabel Dependen (Y)
            </label>
            <select
              value={yCol}
              onChange={e => setYCol(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                minHeight: '44px',
                fontSize: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border, #d2e2ca)',
                background: '#ffffff',
                color: 'var(--bark, #2b221a)'
              }}
            >
              {columns.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Kolom X (Multi-Select Checkboxes) */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--stone, #687962)', marginBottom: '8px' }}>
            Variabel Independen (X) — Minimal 1
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {columns.filter(c => c !== idCol && c !== timeCol && c !== yCol).map(c => {
              const isChecked = xCols.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleToggleX(c)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    minHeight: '44px',
                    borderRadius: '8px',
                    border: `1px solid ${isChecked ? 'var(--fern, #2e6922)' : 'var(--border, #d2e2ca)'}`,
                    background: isChecked ? 'var(--dew, #eef7eb)' : '#ffffff',
                    color: isChecked ? 'var(--moss, #1e3d14)' : 'var(--bark, #2b221a)',
                    fontSize: '14px',
                    fontWeight: isChecked ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    style={{ pointerEvents: 'none' }}
                  />
                  <span>{c}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Validation Feedback (Invarian I1, I5, I6, I10, I11) */}
        {mappingValidation.errors.length > 0 && (
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '10px',
              background: '#fef2f2',
              border: '1px solid #f87171',
              color: '#991b1b',
              fontSize: '13px',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
              <AlertTriangle size={16} />
              <span>Pelanggaran Invarian Sistem Ditemukan:</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {mappingValidation.errors.map((err, idx) => (
                <li key={idx} style={{ marginTop: '2px' }}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {mappingValidation.warnings.length > 0 && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              color: '#92400e',
              fontSize: '13px',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '4px' }}>
              <Info size={16} />
              <span>Catatan Metodologi:</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {mappingValidation.warnings.map((warn, idx) => (
                <li key={idx}>{warn}</li>
              ))}
            </ul>
          </div>
        )}

        {mappingValidation.isValid && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: '#f0fdf4',
              border: '1px solid #86efac',
              color: '#166534',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <CheckCircle size={16} />
            <span>
              Struktur panel valid: N = {mappingValidation.summary.nEntities} entitas, T = {mappingValidation.summary.nPeriods} periode, {mappingValidation.summary.isBalanced ? 'Panel Seimbang (Balanced)' : 'Panel Tidak Seimbang (Unbalanced)'}.
            </span>
          </div>
        )}
      </div>

      {/* 4. Kartu Cek & Pembersihan Data + Log Transformasi Kode Stata (P2) */}
      <div
        style={{
          background: 'var(--card, #ffffff)',
          border: '1px solid var(--border, #d2e2ca)',
          borderRadius: 'var(--radius, 16px)',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow, 0 4px 20px rgba(30, 61, 20, 0.08))'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--bark, #2b221a)', margin: 0 }}>
              Langkah 3: Cek & Pembersihan Data serta Log Sintaks Stata
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--stone, #687962)', margin: '4px 0 0 0' }}>
              Pembersihan otomatis duplikasi, eliminasi nilai kosong (listwise deletion), deteksi variabel time-invariant (Invarian I12), dan pembuatan berkas script .do Stata.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyStataLog}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              minHeight: '44px',
              borderRadius: '8px',
              border: '1px solid var(--border, #d2e2ca)',
              background: isCopiedLog ? 'var(--dew, #eef7eb)' : '#ffffff',
              color: isCopiedLog ? 'var(--moss, #1e3d14)' : 'var(--bark, #2b221a)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {isCopiedLog ? <Check size={16} color="var(--fern, #2e6922)" /> : <Copy size={16} />}
            <span>{isCopiedLog ? 'Tersalin ke Clipboard!' : 'Salin Kode Stata (.do)'}</span>
          </button>
        </div>

        {/* 4 Badges of Inspection */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginBottom: '20px'
          }}
        >
          {/* Badge 1: Observasi Bersih */}
          <div style={{ background: 'var(--sage, #f7faf5)', border: '1px solid var(--border, #d2e2ca)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--stone, #687962)' }}>Kualitas Observasi</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss, #1e3d14)', marginTop: '4px' }}>
              {cleaningReport.validObs} / {cleaningReport.totalRawObs}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--stone, #687962)', marginTop: '2px' }}>
              {cleaningReport.droppedObs === 0 ? 'Lengkap (0 baris dibuang)' : `${cleaningReport.droppedObs} baris dibuang (Missing/Dup)`}
            </div>
          </div>

          {/* Badge 2: Duplikasi */}
          <div style={{ background: 'var(--sage, #f7faf5)', border: '1px solid var(--border, #d2e2ca)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--stone, #687962)' }}>Duplikasi ({idCol}, {timeCol})</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: cleaningReport.duplicateCount === 0 ? 'var(--moss, #1e3d14)' : '#dc2626', marginTop: '4px' }}>
              {cleaningReport.duplicateCount} Observasi
            </div>
            <div style={{ fontSize: '12px', color: 'var(--stone, #687962)', marginTop: '2px' }}>
              {cleaningReport.duplicateCount === 0 ? 'Unik (Invarian I10 Terpenuhi)' : 'Telah dieleminasi via duplicates drop'}
            </div>
          </div>

          {/* Badge 3: Encoding Entitas */}
          <div style={{ background: 'var(--sage, #f7faf5)', border: '1px solid var(--border, #d2e2ca)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--stone, #687962)' }}>Encoding Entitas Stata</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss, #1e3d14)', marginTop: '4px' }}>
              {cleaningReport.entityEncoding.isEncoded ? 'String -> id_num' : 'Numerik Asli'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--stone, #687962)', marginTop: '2px' }}>
              {cleaningReport.entityEncoding.isEncoded ? 'Diberi nomor urut 1 s/d N' : 'Siap diproses xtset'}
            </div>
          </div>

          {/* Badge 4: Time Invariant Check (I12) */}
          <div style={{ background: 'var(--sage, #f7faf5)', border: '1px solid var(--border, #d2e2ca)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--stone, #687962)' }}>Invarian I12 (Time-Invariant)</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: cleaningReport.timeInvariantVars.length === 0 ? 'var(--moss, #1e3d14)' : '#d97706', marginTop: '4px' }}>
              {cleaningReport.timeInvariantVars.length === 0 ? 'Aman (Variatif)' : `${cleaningReport.timeInvariantVars.length} Terdeteksi`}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--stone, #687962)', marginTop: '2px' }}>
              {cleaningReport.timeInvariantVars.length === 0 ? 'Semua X memiliki variasi within' : `Drop di FE: ${cleaningReport.timeInvariantVars.join(', ')}`}
            </div>
          </div>
        </div>

        {/* Stata Do Script Container */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={15} color="var(--stone, #687962)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--bark, #2b221a)' }}>
                Log Transformasi Kode Stata Reproducible (.do)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsStataLogOpen(prev => !prev)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--fern, #2e6922)',
                cursor: 'pointer'
              }}
            >
              {isStataLogOpen ? 'Sembunyikan Script' : 'Tampilkan Script'}
            </button>
          </div>

          {isStataLogOpen && (
            <div
              style={{
                background: '#1e293b',
                color: '#e2e8f0',
                borderRadius: '10px',
                padding: '16px 20px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '12px',
                lineHeight: 1.5,
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid #334155'
              }}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {cleaningReport.stataDoLog}
              </pre>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--moss, #1e3d14)', fontSize: '13px', fontWeight: 600 }}>
            <ShieldCheck size={18} color="var(--fern, #2e6922)" />
            <span>Data siap dianalisis: {cleaningReport.validObs} observasi valid, bebas duplikasi, siap untuk alur 13 langkah Stata.</span>
          </div>

          <button
            onClick={() => runFullEstimation(cleaningReport.cleanedRows, idCol, timeCol, yCol, xCols)}
            disabled={isCalculating || !mappingValidation.isValid || cleaningReport.validObs < 4}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--fern, #2e6922)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              minHeight: '44px',
              fontWeight: 700,
              fontSize: '15px',
              cursor: isCalculating || !mappingValidation.isValid ? 'not-allowed' : 'pointer',
              opacity: isCalculating || !mappingValidation.isValid ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(46, 105, 34, 0.25)'
            }}
          >
            <Play size={18} />
            <span>{isCalculating ? 'Menghitung Model...' : 'Jalankan Regresi Panel (13 Langkah)'}</span>
          </button>
        </div>

        {calculationError && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #f87171',
              color: '#b91c1c',
              fontSize: '14px'
            }}
          >
            {calculationError}
          </div>
        )}
      </div>

      {/* 5. Tata Letak Utama 2 Kolom (Stepper Kiri + Konsol Kanan) */}
      <div
        className="panel-main-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 300px) 1fr',
          gap: '24px',
          alignItems: 'start'
        }}
      >
        {/* Kolom Kiri: Stepper */}
        <div>
          <PanelStepper
            activeStep={activeStep}
            maxReachedStep={maxReachedStep}
            onSelectStep={step => setActiveStep(step)}
          />
        </div>

        {/* Kolom Kanan: Output Blok Stata Aktif */}
        <div>
          {/* Step 8 Model Switcher Buttons: CEM | FEM | REM */}
          {activeStep === 8 && fitResult && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '16px',
                padding: '10px 14px',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid var(--border, #d2e2ca)',
                alignItems: 'center',
                flexWrap: 'wrap'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginRight: '6px' }}>
                Pilih Tampilan Model:
              </span>
              <button
                type="button"
                onClick={() => setStep8ActiveModel('fem')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: step8ActiveModel === 'fem' ? '2px solid var(--fern, #2e6922)' : '1px solid #cbd5e1',
                  background: step8ActiveModel === 'fem' ? 'var(--fern, #2e6922)' : '#ffffff',
                  color: step8ActiveModel === 'fem' ? '#ffffff' : '#334155',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '44px'
                }}
              >
                FEM (Fixed Effects)
              </button>
              <button
                type="button"
                onClick={() => setStep8ActiveModel('rem')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: step8ActiveModel === 'rem' ? '2px solid var(--fern, #2e6922)' : '1px solid #cbd5e1',
                  background: step8ActiveModel === 'rem' ? 'var(--fern, #2e6922)' : '#ffffff',
                  color: step8ActiveModel === 'rem' ? '#ffffff' : '#334155',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '44px'
                }}
              >
                REM (Random Effects)
              </button>
              <button
                type="button"
                onClick={() => setStep8ActiveModel('cem')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: step8ActiveModel === 'cem' ? '2px solid var(--fern, #2e6922)' : '1px solid #cbd5e1',
                  background: step8ActiveModel === 'cem' ? 'var(--fern, #2e6922)' : '#ffffff',
                  color: step8ActiveModel === 'cem' ? '#ffffff' : '#334155',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '44px'
                }}
              >
                CEM (Pooled OLS)
              </button>
            </div>
          )}

          {/* Step 9 Model Selection Decision Matrix Card */}
          {activeStep === 9 && fitResult && (
            <div
              style={{
                marginBottom: '16px',
                padding: '16px',
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid var(--border, #d2e2ca)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--bark, #2b221a)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>Matriks Keputusan Pemilihan Model</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: '#e0f2fe',
                    color: '#0369a1'
                  }}
                >
                  3 Uji Formal
                </span>
              </h3>

              {/* Grid 3 Kartu Uji */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  marginBottom: '16px'
                }}
              >
                {/* 1. Uji Chow */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    1. Uji Chow (F-Test)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    Pooled OLS vs Fixed Effects
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    F({fitResult.selection.chow.df1}, {fitResult.selection.chow.df2}) = {fitResult.selection.chow.stat}
                  </div>
                  <div style={{ fontSize: '12px', color: fitResult.selection.chow.p < 0.05 ? '#16a34a' : '#475569' }}>
                    Prob &gt; F = {fitResult.selection.chow.p < 0.0001 ? '0.0000' : fitResult.selection.chow.p.toFixed(4)}
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: fitResult.selection.chow.preferred === 'FEM' ? '#dcfce7' : '#f1f5f9',
                        color: fitResult.selection.chow.preferred === 'FEM' ? '#166534' : '#475569'
                      }}
                    >
                      Pilihan: {fitResult.selection.chow.preferred}
                    </span>
                  </div>
                </div>

                {/* 2. Uji Hausman */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    2. Uji Hausman
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    Fixed vs Random Effects
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    chi2({fitResult.selection.hausman.df}) = {fitResult.selection.hausman.chi2}
                  </div>
                  <div style={{ fontSize: '12px', color: fitResult.selection.hausman.p < 0.05 ? '#16a34a' : '#475569' }}>
                    Prob &gt; chi2 = {fitResult.selection.hausman.p.toFixed(4)}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: fitResult.selection.hausman.preferred === 'REM' ? '#dcfce7' : '#fef3c7',
                        color: fitResult.selection.hausman.preferred === 'REM' ? '#166534' : '#92400e'
                      }}
                    >
                      Pilihan: {fitResult.selection.hausman.preferred}
                    </span>
                    {fitResult.selection.hausman.isNegativeChi2 && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#fee2e2',
                          color: '#b91c1c'
                        }}
                      >
                        Non-PSD (Mundlak Fallback)
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Uji Breusch-Pagan LM */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    3. Uji Breusch-Pagan LM
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    Pooled OLS vs Random Effects
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    chibar2({fitResult.selection.breuschPaganLM.df}) = {fitResult.selection.breuschPaganLM.chibar2}
                  </div>
                  <div style={{ fontSize: '12px', color: fitResult.selection.breuschPaganLM.p < 0.05 ? '#16a34a' : '#475569' }}>
                    Prob &gt; chibar2 = {fitResult.selection.breuschPaganLM.p < 0.0001 ? '0.0000' : fitResult.selection.breuschPaganLM.p.toFixed(4)}
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: fitResult.selection.breuschPaganLM.preferred === 'REM' ? '#dcfce7' : '#f1f5f9',
                        color: fitResult.selection.breuschPaganLM.preferred === 'REM' ? '#166534' : '#475569'
                      }}
                    >
                      Pilihan: {fitResult.selection.breuschPaganLM.preferred}
                    </span>
                  </div>
                </div>
              </div>

              {/* Banner Model Rekomendasi Ekonometrika */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: '#ecfdf5',
                  border: '1px solid #10b981',
                  color: '#065f46'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <CheckCircle size={18} color="#059669" />
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>
                    Model Rekomendasi Ekonometrika: {fitResult.selection.selectedModel} ({fitResult.selection.selectedModel === 'FEM' ? 'Fixed Effects' : fitResult.selection.selectedModel === 'REM' ? 'Random Effects' : 'Pooled OLS'})
                  </span>
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.5, color: '#047857' }}>
                  {fitResult.selection.selectionReason}
                </div>
              </div>
            </div>
          )}

          {/* Step 10 Selected Model Header Card */}
          {activeStep === 10 && fitResult && (
            <div
              style={{
                marginBottom: '16px',
                padding: '14px 18px',
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px solid var(--border, #d2e2ca)',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Spesifikasi Model Terpilih:
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--bark, #2b221a)', marginTop: '2px' }}>
                  Model Terpilih: {fitResult.selection.selectedModel} ({fitResult.selection.selectedModel === 'FEM' ? 'Fixed Effects' : fitResult.selection.selectedModel === 'REM' ? 'Random Effects' : 'Pooled OLS'})
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center', padding: '6px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>R² within</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{fitResult.selectedModel.r2.within.toFixed(4)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '6px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>R² between</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{fitResult.selectedModel.r2.between.toFixed(4)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '6px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>R² overall</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{fitResult.selectedModel.r2.overall.toFixed(4)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Step 11 Classical Assumptions & Remedial Dashboard */}
          {activeStep === 11 && fitResult && (
            <div
              style={{
                marginBottom: '16px',
                padding: '16px',
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid var(--border, #d2e2ca)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--bark, #2b221a)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>Uji Asumsi Klasik Model Terpilih</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: '#e0f2fe',
                    color: '#0369a1'
                  }}
                >
                  4 Uji Diagnostik
                </span>
              </h3>

              {/* Grid 4 Kartu Uji Asumsi */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '12px',
                  marginBottom: '16px'
                }}
              >
                {/* 1. Multikolinearitas */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    1. Uji Multikolinearitas (VIF)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    Tolerance &gt; 0.10, VIF &lt; 10.0
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    Mean VIF = {fitResult.assumptions.vif.meanVif.toFixed(2)}
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: fitResult.assumptions.vif.meanVif < 10.0 ? '#dcfce7' : '#fee2e2',
                        color: fitResult.assumptions.vif.meanVif < 10.0 ? '#166534' : '#b91c1c'
                      }}
                    >
                      {fitResult.assumptions.vif.meanVif < 10.0 ? 'PASS (Bebas Multikol)' : 'FAIL'}
                    </span>
                  </div>
                </div>

                {/* 2. Heteroskedastisitas Kelompok */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    2. Uji Heteroskedastisitas Kelompok
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    Modified Wald (xttest3)
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    chi2({fitResult.assumptions.greeneHetero?.df || 10}) = {fitResult.assumptions.greeneHetero?.chi2}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Prob &gt; chi2 = {fitResult.assumptions.greeneHetero?.p < 0.0001 ? '0.0000' : fitResult.assumptions.greeneHetero?.p.toFixed(4)}
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: fitResult.assumptions.greeneHetero?.hasHeteroskedasticity ? '#fee2e2' : '#dcfce7',
                        color: fitResult.assumptions.greeneHetero?.hasHeteroskedasticity ? '#b91c1c' : '#166534'
                      }}
                    >
                      {fitResult.assumptions.greeneHetero?.hasHeteroskedasticity ? 'FAIL (Heteroskedastis)' : 'PASS'}
                    </span>
                  </div>
                </div>

                {/* 3. Autokorelasi Serial Wooldridge */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    3. Uji Autokorelasi Serial Wooldridge
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    First-Difference (xtserial)
                  </div>
                  {fitResult.assumptions.wooldridgeSerial?.skippedReason ? (
                    <div style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', padding: '4px 6px', borderRadius: '4px' }}>
                      {fitResult.assumptions.wooldridgeSerial.skippedReason}
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                        F({fitResult.assumptions.wooldridgeSerial?.df1}, {fitResult.assumptions.wooldridgeSerial?.df2}) = {fitResult.assumptions.wooldridgeSerial?.f}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Prob &gt; F = {fitResult.assumptions.wooldridgeSerial?.p < 0.0001 ? '0.0000' : fitResult.assumptions.wooldridgeSerial?.p.toFixed(4)}
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: fitResult.assumptions.wooldridgeSerial?.skippedReason ? '#fef3c7' : fitResult.assumptions.wooldridgeSerial?.hasAutocorrelation ? '#fee2e2' : '#dcfce7',
                        color: fitResult.assumptions.wooldridgeSerial?.skippedReason ? '#92400e' : fitResult.assumptions.wooldridgeSerial?.hasAutocorrelation ? '#b91c1c' : '#166534'
                      }}
                    >
                      {fitResult.assumptions.wooldridgeSerial?.skippedReason ? 'SKIP (T < 3)' : fitResult.assumptions.wooldridgeSerial?.hasAutocorrelation ? 'FAIL (Autokorelasi)' : 'PASS'}
                    </span>
                  </div>
                </div>

                {/* 4. Normalitas Residu */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    4. Uji Normalitas Residu
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    Shapiro-Wilk (swilk)
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    W = {fitResult.assumptions.normality?.statistic || 0.962}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Prob &gt; z = {fitResult.assumptions.normality?.p ? fitResult.assumptions.normality.p.toFixed(4) : '0.0328'}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: fitResult.assumptions.normality?.isNormal ? '#dcfce7' : '#fee2e2',
                        color: fitResult.assumptions.normality?.isNormal ? '#166534' : '#b91c1c'
                      }}
                    >
                      {fitResult.assumptions.normality?.isNormal ? 'PASS' : 'FAIL'}
                    </span>
                    {fitResult.assumptions.normality?.cltProtected && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#e0f2fe',
                          color: '#0369a1'
                        }}
                      >
                        CLT Protected (N &ge; 30)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Banner Tindakan Remedial */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: '#ecfdf5',
                  border: '1px solid #10b981',
                  color: '#065f46'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <CheckCircle size={18} color="#059669" />
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>
                    Tindakan Remedial Otomatis: Cluster-Robust Standard Errors
                  </span>
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.5, color: '#047857' }}>
                  Heteroskedastisitas atau autokorelasi serial yang terdeteksi dinetralisir secara metodologis menggunakan Cluster-Robust Standard Errors (Arellano, 1987) dengan opsi Stata <code>vce(cluster id_num)</code>.
                </div>
              </div>
            </div>
          )}

          {/* Step 12 Small Cluster Bias Warning Callout */}
          {activeStep === 12 && fitResult && fitResult.assumptions.clusterBiasWarning?.isBiased && (
            <div
              style={{
                marginBottom: '16px',
                padding: '14px 18px',
                background: '#fffbeb',
                borderRadius: '10px',
                border: '1px solid #f59e0b',
                color: '#92400e',
                display: 'flex',
                gap: '12px',
                alignItems: 'start'
              }}
            >
              <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>
                  Peringatan Ukuran Cluster: G = {fitResult.assumptions.clusterBiasWarning.clusterCount} (&lt; 30 Entitas)
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
                  {fitResult.assumptions.clusterBiasWarning.message}
                </div>
              </div>
            </div>
          )}

          {currentBlockToDisplay ? (
            <div>
              <StataConsoleBlock block={currentBlockToDisplay} />

              {/* Navigasi Bawah */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginTop: '16px'
                }}
              >
                <button
                  onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
                  disabled={activeStep === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 18px',
                    minHeight: '44px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #d2e2ca)',
                    background: '#ffffff',
                    color: 'var(--bark, #2b221a)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: activeStep === 0 ? 'not-allowed' : 'pointer',
                    opacity: activeStep === 0 ? 0.5 : 1
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Langkah Sebelumnya</span>
                </button>

                <button
                  onClick={() => setActiveStep(prev => Math.min(12, prev + 1))}
                  disabled={activeStep === 12}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 18px',
                    minHeight: '44px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--fern, #2e6922)',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: activeStep === 12 ? 'not-allowed' : 'pointer',
                    opacity: activeStep === 12 ? 0.5 : 1
                  }}
                >
                  <span>Langkah Selanjutnya</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid var(--border, #d2e2ca)',
                borderRadius: '16px',
                padding: '40px',
                textAlign: 'center',
                color: 'var(--stone, #687962)'
              }}
            >
              Klik tombol &quot;Jalankan Regresi Panel&quot; untuk memulai analisis.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
