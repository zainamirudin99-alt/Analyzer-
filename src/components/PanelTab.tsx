'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  PanelFitInput,
  PanelFitResult,
  StataConsoleBlockData,
  ZeroValuePolicy,
  TransformMethod
} from '@/lib/panel-types';
import {
  validatePanelStructure,
  validatePanelMappingConfig,
  inspectAndCleanPanelData,
  analyzeAndTransformPanelLN,
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
  orthogPanelVariables,
  testGroupwiseHeteroGreene,
  testWooldridgeSerial,
  computePanelResiduals,
  testPanelNormality,
  computeClusterRobustSE,
  generateEasyPanelInterpretation
} from '@/lib/panel-engine';
import {
  generateAllPanelConsoleBlocks,
  formatStataRegTable,
  formatPanelClipboardSummary
} from '@/lib/panel-interpretation';
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
  RefreshCw,
  Table,
  Copy,
  Check,
  Terminal,
  ShieldCheck,
  Download,
  Printer,
  FileText,
  Sparkles,
  Lightbulb
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

  // Variable Mapping State (Step 1)
  const [idCol, setIdCol] = useState<string>('company');
  const [timeCol, setTimeCol] = useState<string>('year');
  const [yCol, setYCol] = useState<string>('invest');
  const [xCols, setXCols] = useState<string[]>(['mvalue', 'kstock']);

  // Step 2: Cleaning Data & Zero-Value Policy
  const [zeroPolicy, setZeroPolicy] = useState<ZeroValuePolicy>('true_zero');

  // Step 3: LN Transformation State
  const [selectedLnCols, setSelectedLnCols] = useState<string[]>([]);
  const [lnMode, setLnMode] = useState<'none' | 'auto' | 'custom'>('none');
  const [customTransformMap, setCustomTransformMap] = useState<Record<string, TransformMethod>>({});

  // Step 7: Orthog Multicollinearity State
  const [manualOrthogCols, setManualOrthogCols] = useState<string[] | undefined>(undefined);

  // Step 8: Residual Type Selector ('e' vs 'resid')
  const [activeResidMode, setActiveResidMode] = useState<'e' | 'resid'>('e');

  // Data Cleaning & Stata Log State
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

  // Export & Action State (P6)
  const [isExportingDocx, setIsExportingDocx] = useState<boolean>(false);
  const [docxExportError, setDocxExportError] = useState<string | null>(null);
  const [isCopiedSummary, setIsCopiedSummary] = useState<boolean>(false);

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

  // Data Cleaning & Zero Inspection Report (Step 2)
  const cleaningReport: DataCleaningReport = useMemo(() => {
    if (!dataRows || dataRows.length === 0 || !idCol || !timeCol || !yCol || xCols.length === 0) {
      return {
        totalRawObs: dataRows?.length || 0,
        validObs: 0,
        droppedObs: 0,
        duplicateCount: 0,
        missingSummary: {},
        zeroSummary: {},
        totalZeroCells: 0,
        zeroPolicyApplied: zeroPolicy,
        zeroHandledCount: 0,
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
      handleMissing: 'listwise',
      zeroPolicy
    });
  }, [dataRows, idCol, timeCol, yCol, xCols, zeroPolicy]);

  // Multi-Option Transformation Report (Step 3: Asli, LN, LN 1+X, Sqrt, Orthog, Inv, Std)
  const lnReport = useMemo(() => {
    if (!cleaningReport.cleanedRows || cleaningReport.cleanedRows.length === 0 || !yCol || xCols.length === 0) {
      return analyzeAndTransformPanelLN([], yCol || 'y', xCols, {});
    }
    if (lnMode === 'none') {
      const rawMap: Record<string, TransformMethod> = {};
      return analyzeAndTransformPanelLN(cleaningReport.cleanedRows, yCol, xCols, rawMap);
    }
    if (lnMode === 'auto') {
      const autoScan = analyzeAndTransformPanelLN(cleaningReport.cleanedRows, yCol, xCols);
      const autoMap: Record<string, TransformMethod> = {};
      for (const a of autoScan.analyses) {
        autoMap[a.variable] = a.recommendedMethod || 'asli';
      }
      return analyzeAndTransformPanelLN(cleaningReport.cleanedRows, yCol, xCols, autoMap);
    }
    return analyzeAndTransformPanelLN(cleaningReport.cleanedRows, yCol, xCols, customTransformMap);
  }, [cleaningReport.cleanedRows, yCol, xCols, lnMode, customTransformMap]);

  // Combined Stata Do Log (Cleaning + LN + Orthog)
  const combinedStataDoLog = useMemo(() => {
    const parts = [cleaningReport.stataDoLog];
    if (lnReport.stataCommands.length > 0) {
      parts.push('\n* Transformasi Logaritma Natural (LN)\n' + lnReport.stataCommands.join('\n'));
    }
    if (fitResult?.assumptions.orthogReport?.stataCommand) {
      parts.push('\n* Transformasi Orthogonal (orthog)\n' + fitResult.assumptions.orthogReport.stataCommand);
    }
    return parts.filter(Boolean).join('\n');
  }, [cleaningReport.stataDoLog, lnReport.stataCommands, fitResult?.assumptions.orthogReport?.stataCommand]);

  // Dynamic Stata console block to display (supports model switching in Step 8)
  const currentBlockToDisplay = useMemo(() => {
    if (!consoleBlocks || consoleBlocks.length === 0 || !consoleBlocks[activeStep]) {
      return null;
    }
    const baseBlock = consoleBlocks[activeStep];
    if (activeStep === 8 && fitResult) {
      const model = fitResult.models[step8ActiveModel];
      const activeY = fitResult.activeYCol || yCol;
      const activeX = fitResult.initialActiveXCols || xCols;
      const cmd = step8ActiveModel === 'cem'
        ? `reg ${activeY} ${activeX.join(' ')}`
        : step8ActiveModel === 'fem'
        ? `xtreg ${activeY} ${activeX.join(' ')}, fe`
        : `xtreg ${activeY} ${activeX.join(' ')}, re`;
      return {
        ...baseBlock,
        stataCommand: cmd,
        stataOutput: formatStataRegTable(model, activeY)
      };
    }
    return baseBlock;
  }, [consoleBlocks, activeStep, fitResult, step8ActiveModel, yCol, xCols]);

  // Handle Copy Stata .do Log to Clipboard
  const handleCopyStataLog = () => {
    if (!combinedStataDoLog) return;
    navigator.clipboard.writeText(combinedStataDoLog);
    setIsCopiedLog(true);
    setTimeout(() => setIsCopiedLog(false), 2500);
  };

  // Jalankan estimasi lengkap
  const runFullEstimation = (
    rowsToUse: Record<string, any>[],
    currentId: string,
    currentTime: string,
    currentY: string,
    currentX: string[],
    customZeroPolicy: ZeroValuePolicy = zeroPolicy,
    customLnMode: 'none' | 'auto' | 'custom' = lnMode,
    customLnCols: string[] = selectedLnCols,
    customOrthogCols: string[] | undefined = manualOrthogCols
  ) => {
    try {
      setIsCalculating(true);
      setCalculationError(null);

      // 1. Cleaning & Zero Policy
      const clean = inspectAndCleanPanelData(rowsToUse, currentId, currentTime, currentY, currentX, {
        dropDuplicates: true,
        handleMissing: 'listwise',
        zeroPolicy: customZeroPolicy
      });

      // 2. Multi-Option Transformation Analysis (LN, LN 1+X, Sqrt, Orthog, Inv, Std)
      const autoScan = analyzeAndTransformPanelLN(clean.cleanedRows, currentY, currentX);
      let effectiveTransforms: Record<string, TransformMethod> = {};
      if (customLnMode === 'none') {
        for (const a of autoScan.analyses) effectiveTransforms[a.variable] = 'asli';
      } else if (customLnMode === 'auto') {
        for (const a of autoScan.analyses) effectiveTransforms[a.variable] = a.recommendedMethod || 'asli';
      } else {
        effectiveTransforms = { ...autoScan.transformMap, ...customTransformMap };
      }

      const lnRes = analyzeAndTransformPanelLN(clean.cleanedRows, currentY, currentX, effectiveTransforms);
      const activeY = lnRes.activeYCol;
      const initialActiveX = lnRes.activeXCols;
      const workingRows = lnRes.transformedRows;

      // 3. Validate xtset
      const decl = validatePanelStructure(workingRows, currentId, currentTime);
      if (!decl.isValid) {
        throw new Error(decl.errors.join(' '));
      }

      const inputAfterLN: PanelFitInput = {
        rows: workingRows,
        idCol: currentId,
        timeCol: currentTime,
        yCol: activeY,
        xCols: initialActiveX,
        alpha: 0.05
      };

      // 4. Call CEM, FEM, REM
      const cem = fitPanelCEM(inputAfterLN);
      const fem = fitPanelFEM(inputAfterLN);
      const rem = fitPanelREM(inputAfterLN);

      // 5. Chow (with Dummy LSDV approach), Hausman, Mundlak, BP-LM
      const chow = testChow(cem, fem, 0.05, inputAfterLN);
      const hausman = testHausman(fem, rem, inputAfterLN, 0.05);
      const mundlak = testMundlakCRE(inputAfterLN, 0.05);
      const bp = testBreuschPaganLM(inputAfterLN, 0.05);
      const selection = selectOptimalPanelModel(chow, hausman, mundlak, bp, 0.05);

      // Set default residual mode based on selected model ('e' for FEM/REM, 'resid' for CEM)
      setActiveResidMode(selection.selectedModel === 'CEM' ? 'resid' : 'e');

      // 6. Multicollinearity (Uncentered for xtreg FEM/REM, Centered for reg CEM) + orthog Transformation
      const vif = testPanelVIF(inputAfterLN, selection.selectedModel);
      const orthogRes = orthogPanelVariables(
        workingRows,
        initialActiveX,
        vif,
        10.0,
        customOrthogCols
      );

      const finalActiveX = orthogRes.finalActiveXCols;
      const finalInput: PanelFitInput = {
        rows: orthogRes.transformedRows,
        idCol: currentId,
        timeCol: currentTime,
        yCol: activeY,
        xCols: finalActiveX,
        alpha: 0.05
      };

      // Use the latest transformed variables in the selected model
      let selectedModel =
        selection.selectedModel === 'FEM'
          ? fem
          : selection.selectedModel === 'REM'
          ? rem
          : cem;

      let postOrthogSelectedModel = selectedModel;
      if (orthogRes.triggered) {
        postOrthogSelectedModel =
          selection.selectedModel === 'FEM'
            ? fitPanelFEM(finalInput)
            : selection.selectedModel === 'REM'
            ? fitPanelREM(finalInput)
            : fitPanelCEM(finalInput);
        selectedModel = postOrthogSelectedModel;
      }

      const greene = testGroupwiseHeteroGreene(
        finalInput,
        selection.selectedModel === 'FEM' ? selectedModel : fitPanelFEM(finalInput),
        0.05
      );
      const serial = testWooldridgeSerial(finalInput, 0.05);

      // 7. Residual Normality (predict e, e vs predict resid, residuals) + Histogram + sktest + swilk + ksmirnov
      const resBoth = computePanelResiduals(selectedModel, finalInput);
      const primaryRes = selection.selectedModel === 'CEM' ? resBoth.compositeResiduals : resBoth.eResiduals;
      const altRes = selection.selectedModel === 'CEM' ? resBoth.eResiduals : resBoth.compositeResiduals;
      const normality = testPanelNormality(primaryRes, 0.05, selection.selectedModel, altRes);

      // 8. Final vce(robust) & Plain-Language Interpretation
      const robustFinal = computeClusterRobustSE(selectedModel, finalInput);
      const easyInterp = generateEasyPanelInterpretation(
        robustFinal,
        activeY,
        finalActiveX,
        0.05,
        lnRes.appliedVars,
        orthogRes.orthogMapping
      );

      const result: PanelFitResult = {
        success: true,
        declaration: decl,
        models: { cem, fem, rem },
        selection,
        selectedModel,
        postOrthogSelectedModel,
        finalModel: robustFinal,
        assumptions: {
          vif,
          centeredVif: vif.centeredVif,
          uncenteredVif: vif.uncenteredVif,
          orthogReport: orthogRes,
          greeneHetero: greene,
          wooldridgeSerial: serial,
          normality,
          clusterBiasWarning: robustFinal.clusterBiasWarning
        },
        lnReport: lnRes,
        activeYCol: activeY,
        initialActiveXCols: initialActiveX,
        finalActiveXCols: finalActiveX,
        easyInterpretation: easyInterp,
        consoleBlocks: []
      };

      const blocks = generateAllPanelConsoleBlocks(finalInput, result);
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
    runFullEstimation(grunfeldFixture, 'company', 'year', 'invest', ['mvalue', 'kstock'], 'true_zero', 'none', [], undefined);
  }, []);

  // Re-run automatically when zeroPolicy, lnMode, selectedLnCols, or manualOrthogCols changes
  useEffect(() => {
    if (mappingValidation.isValid && dataRows.length > 0) {
      runFullEstimation(dataRows, idCol, timeCol, yCol, xCols, zeroPolicy, lnMode, selectedLnCols, manualOrthogCols);
    }
  }, [zeroPolicy, lnMode, selectedLnCols, manualOrthogCols]);

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
    setZeroPolicy('true_zero');
    setLnMode('none');
    setSelectedLnCols([]);
    setManualOrthogCols(undefined);
    setIngestionError(null);
    runFullEstimation(grunfeldFixture, 'company', 'year', 'invest', ['mvalue', 'kstock'], 'true_zero', 'none', [], undefined);
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

      if (cols.length >= 4) {
        setIdCol(cols[0]);
        setTimeCol(cols[1]);
        setYCol(cols[2]);
        setXCols([cols[3]]);
      }
      setLnMode('none');
      setSelectedLnCols([]);
      setManualOrthogCols(undefined);
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

  // Set specific transformation method per variable
  const handleSelectTransformMethod = (col: string, method: TransformMethod) => {
    const currentMap = { ...(lnReport.transformMap || {}), ...customTransformMap };
    currentMap[col] = method;
    setCustomTransformMap(currentMap);
    setLnMode('custom');
  };

  // Apply smart system recommendations to all variables
  const handleApplySmartRecommendation = () => {
    const autoMap: Record<string, TransformMethod> = {};
    for (const a of lnReport.analyses) {
      autoMap[a.variable] = a.recommendedMethod || 'asli';
    }
    setCustomTransformMap(autoMap);
    setLnMode('auto');
  };

  // Reset all variables to raw
  const handleResetToRaw = () => {
    const rawMap: Record<string, TransformMethod> = {};
    for (const a of lnReport.analyses) {
      rawMap[a.variable] = 'asli';
    }
    setCustomTransformMap(rawMap);
    setLnMode('none');
  };

  // Legacy fallback toggle
  const handleToggleLnVar = (col: string) => {
    const currentMethod = customTransformMap[col] || lnReport.transformMap?.[col] || 'asli';
    const nextMethod: TransformMethod = currentMethod === 'asli' ? (lnReport.analyses.find(a => a.variable === col)?.recommendedMethod || 'ln') : 'asli';
    handleSelectTransformMethod(col, nextMethod);
  };

  // Toggle Orthog variable selection
  const handleToggleOrthogVar = (col: string) => {
    const currentList =
      manualOrthogCols !== undefined
        ? manualOrthogCols
        : fitResult?.assumptions.orthogReport?.collinearVars || [];
    const nextList = currentList.includes(col)
      ? currentList.filter(c => c !== col)
      : [...currentList, col];
    setManualOrthogCols(nextList);
  };

  // Handler Export DOCX (P6)
  const handleExportDocx = async () => {
    if (!fitResult) return;
    try {
      setIsExportingDocx(true);
      setDocxExportError(null);

      const res = await fetch('/api/panel/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fitResult,
          datasetName: fileName || 'Dataset_Panel.xlsx'
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan_Regresi_Panel_Stata_${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('[Export DOCX Error]:', err);
      setDocxExportError(err.message || 'Gagal mengunduh dokumen Word.');
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Handler Print PDF (P6)
  const handlePrintPdf = () => {
    window.print();
  };

  // Handler Copy Summary to Clipboard (P6)
  const handleCopySummary = async () => {
    if (!fitResult) return;
    try {
      const summaryText = formatPanelClipboardSummary(fitResult, fileName || 'Dataset_Panel.xlsx');
      await navigator.clipboard.writeText(summaryText);
      setIsCopiedSummary(true);
      setTimeout(() => setIsCopiedSummary(false), 2500);
    } catch (err) {
      console.error('Failed to copy summary:', err);
    }
  };

  // Normality active stats based on activeResidMode ('e' vs 'resid')
  const activeNormalityStats = useMemo(() => {
    const norm = fitResult?.assumptions.normality;
    if (!norm) return null;
    const isPrimaryMatch =
      (activeResidMode === 'e' && norm.predictCommand === 'predict e, e') ||
      (activeResidMode === 'resid' && norm.predictCommand === 'predict resid, residuals');

    if (isPrimaryMatch || !norm.altResiduals || norm.altResiduals.length === 0) {
      return norm;
    }
    return testPanelNormality(
      norm.altResiduals,
      0.05,
      activeResidMode === 'e' ? 'FEM' : 'CEM',
      norm.residualsUsed
    );
  }, [fitResult?.assumptions.normality, activeResidMode]);

  return (
    <div className="panel-tab-wrapper" style={{ padding: '8px 0 40px 0' }}>
      {/* Print Stylesheet & Header (P6) */}
      <style>{`
        @media print {
          header, nav, aside, #app-navigation-drawer, .no-print,
          .panel-stepper-container, button {
            display: none !important;
          }
          body, .panel-tab-wrapper, .panel-main-layout {
            background: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            box-shadow: none !important;
          }
          .panel-print-header {
            display: block !important;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid var(--primary);
          }
        }
        @media screen {
          .panel-print-header {
            display: none;
          }
        }
      `}</style>

      {/* Header Khusus Print Cetak PDF */}
      <div className="panel-print-header">
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', margin: '0 0 4px 0' }}>
          LAPORAN HASIL REGRESI DATA PANEL (STANDAR STATA)
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Berkas: {fileName} | Dimensi: {fitResult?.declaration.entityCount} Entitas, {fitResult?.declaration.tMax} Periode (N = {fitResult?.declaration.totalObs}) | Model: {fitResult?.selection.selectedModel} (vce(robust))
        </p>
      </div>

      {/* 1. Header Banner */}
      <div className="panel-header-banner no-print">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span
              style={{
                background: 'rgba(0, 229, 255, 0.15)',
                border: '1px solid rgba(0, 229, 255, 0.4)',
                color: '#67e8f9',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase'
              }}
            >
              Stata-Grade Econometric Engine
            </span>
            <h2 style={{ fontSize: '24px', fontWeight: 900, marginTop: '8px', marginBottom: '8px' }}>
              Regresi Data Panel (CEM, FEM, REM) — Standar Stata
            </h2>
            <p style={{ margin: 0, maxWidth: '780px' }}>
              Alur sistematis &amp; otomatis sesuai kaidah ekonometrika: Input Data &rarr; Cleaning Data &amp; Pilihan Nilai 0 &rarr; Analisis Multi-Transformasi (LN, LN 1+X, Sqrt, Orthog, Z-Score) &rarr; Deklarasi <code>xtset</code> &rarr; Estimasi CEM, FEM, REM &rarr; Uji Chow Dummy, Hausman, LM &rarr; Uji Asumsi Klasik, Transformasi <code>orthog</code>, Normalitas (<code>predict e, e</code> vs <code>resid</code> + Histogram + <code>sktest</code>/<code>swilk</code>/<code>ksmirnov</code>) &rarr; Hasil Akhir <code>vce(robust)</code> &amp; Interpretasi Bahasa Mudah.
            </p>
          </div>

          <button
            onClick={handleLoadGrunfeldPreset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--surface)',
              color: 'var(--primary)',
              border: '1.5px solid var(--border)',
              borderRadius: '10px',
              padding: '12px 18px',
              minHeight: '44px',
              fontWeight: 800,
              fontSize: '13.5px',
              cursor: 'pointer',
              boxShadow: 'var(--shadow)'
            }}
          >
            <Database size={16} />
            <span>Pakai Data Contoh: Grunfeld (10 Entitas, 20 Tahun)</span>
          </button>
        </div>
      </div>

      {/* 2. Kartu Step 1: Input Data & Pemetaan Variabel Awal */}
      <div
        className="no-print"
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
              Step 1: Input Data &amp; Pemetaan Variabel Awal
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--stone, #687962)', margin: '4px 0 0 0' }}>
              Unggah berkas Excel (.xlsx, .xls), CSV, atau tautan Google Sheets, lalu tentukan kolom Entitas, Waktu, Dependen (Y), dan Independen (X).
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
            className="panel-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <FileSpreadsheet size={38} color="var(--primary)" style={{ margin: '0 auto 10px auto' }} />
            <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
              {isLoadingFile ? 'Mengunggah & Memvalidasi Berkas...' : 'Klik untuk Memilih File (.xlsx, .xls, .csv)'}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
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
          <div style={{ marginTop: '16px', marginBottom: '20px' }}>
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

        {/* Variable Mapping Grid */}
        <div style={{ borderTop: '1px solid var(--border, #d2e2ca)', paddingTop: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
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

          {/* Live Validation Feedback */}
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

          {mappingValidation.isValid && (
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '10px',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                color: '#166534',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={18} color="#16a34a" />
                <span>
                  <strong>Input Terpenuhi:</strong> Struktur panel valid (N = {mappingValidation.summary.nEntities} entitas, T = {mappingValidation.summary.nPeriods} periode, {mappingValidation.summary.isBalanced ? 'Balanced' : 'Unbalanced'}).
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveStep(4);
                  const el = document.getElementById('panel-cleaning-card');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  minHeight: '40px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--fern, #2e6922)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <span>Lanjut ke Step 2: Cleaning Data</span>
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. Kartu Step 2: Cleaning Data & Pilihan Nilai 0 (Nol) */}
      <div
        id="panel-cleaning-card"
        className="no-print"
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
              Step 2: Cleaning Data, Cek Missing Value &amp; Pilihan Penanganan Nilai 0
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--stone, #687962)', margin: '4px 0 0 0' }}>
              Sistem menganalisis apa yang harus dibersihkan (duplikasi, missing value, dan sel bernilai <code>0</code>). Pilih apakah nilai <code>0</code> adalah angka <code>0</code> sebenarnya atau berarti tidak ada pengungkapan (No Disclosure).
            </p>
          </div>
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
              {cleaningReport.droppedObs === 0 ? 'Lengkap (0 baris dibuang)' : `${cleaningReport.droppedObs} baris dibuang (Missing/Dup/0)`}
            </div>
          </div>

          {/* Badge 2: Duplikasi */}
          <div style={{ background: 'var(--sage, #f7faf5)', border: '1px solid var(--border, #d2e2ca)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--stone, #687962)' }}>Duplikasi ({idCol}, {timeCol})</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: cleaningReport.duplicateCount === 0 ? 'var(--moss, #1e3d14)' : '#dc2626', marginTop: '4px' }}>
              {cleaningReport.duplicateCount} Observasi
            </div>
            <div style={{ fontSize: '12px', color: 'var(--stone, #687962)', marginTop: '2px' }}>
              {cleaningReport.duplicateCount === 0 ? 'Unik (Invarian I10 Terpenuhi)' : 'Telah dieliminasi via duplicates drop'}
            </div>
          </div>

          {/* Badge 3: Deteksi Nilai 0 */}
          <div style={{ background: cleaningReport.totalZeroCells > 0 ? '#fffbeb' : 'var(--sage, #f7faf5)', border: `1px solid ${cleaningReport.totalZeroCells > 0 ? '#fcd34d' : 'var(--border, #d2e2ca)'}`, borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: cleaningReport.totalZeroCells > 0 ? '#92400e' : 'var(--stone, #687962)' }}>
              Deteksi Sel Bernilai 0 (Nol)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: cleaningReport.totalZeroCells > 0 ? '#b45309' : 'var(--moss, #1e3d14)', marginTop: '4px' }}>
              {cleaningReport.totalZeroCells} Sel Bernilai 0
            </div>
            <div style={{ fontSize: '12px', color: cleaningReport.totalZeroCells > 0 ? '#92400e' : 'var(--stone, #687962)', marginTop: '2px' }}>
              {cleaningReport.totalZeroCells > 0 ? 'Pilih perlakuan nilai 0 di bawah' : 'Tidak ada nilai 0 pada Y dan X'}
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

        {/* Pilihan Penanganan Data Bernilai 0 (True Zero vs Tidak Ada Pengungkapan) */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid var(--border, #d2e2ca)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--bark, #2b221a)' }}>
              Pilihan Perlakuan Data Bernilai <code>0</code> (Nol): Apakah Benar <code>0</code> atau Tidak Ada Pengungkapan?
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#0369a1', background: '#e0f2fe', padding: '3px 10px', borderRadius: '999px' }}>
              Terdeteksi {cleaningReport.totalZeroCells} sel bernilai 0
            </span>
          </div>

          {/* Per-variable Missing & Zero summary pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {[yCol, ...xCols].filter(Boolean).map(col => {
              const missCount = cleaningReport.missingSummary[col] || 0;
              const zeroCount = cleaningReport.zeroSummary[col] || 0;
              return (
                <div
                  key={col}
                  style={{
                    fontSize: '12px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#334155'
                  }}
                >
                  <strong>{col}:</strong> Missing = {missCount}, Nilai 0 = <strong>{zeroCount}</strong>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
            {[
              {
                id: 'true_zero' as ZeroValuePolicy,
                title: '1. Data Benar 0 (True Zero)',
                desc: 'Angka 0 adalah nilai riil yang sah (misal: nilai pengungkapan/emisi memang 0). Baris tetap dipertahankan.'
              },
              {
                id: 'no_disclosure_drop' as ZeroValuePolicy,
                title: '2. Tidak Ada Pengungkapan (Hapus Baris)',
                desc: 'Angka 0 berarti perusahaan tidak mengungkapkan data (missing). Eliminasi baris dengan drop if var == 0.'
              },
              {
                id: 'no_disclosure_impute_mean' as ZeroValuePolicy,
                title: '3. Tidak Ada Pengungkapan (Imputasi Mean)',
                desc: 'Angka 0 dianggap tidak ada pengungkapan dan diganti dengan rata-rata (mean) variabel terkait.'
              },
              {
                id: 'no_disclosure_impute_median' as ZeroValuePolicy,
                title: '4. Tidak Ada Pengungkapan (Imputasi Median)',
                desc: 'Angka 0 dianggap tidak ada pengungkapan dan diganti dengan nilai tengah (median) variabel terkait.'
              }
            ].map(opt => {
              const isSelected = zeroPolicy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setZeroPolicy(opt.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: isSelected ? '2px solid var(--fern, #2e6922)' : '1px solid #cbd5e1',
                    background: isSelected ? 'var(--dew, #eef7eb)' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? 'var(--moss, #1e3d14)' : '#1e293b', marginBottom: '4px' }}>
                    {opt.title}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => {
              setActiveStep(5);
              const el = document.getElementById('panel-ln-card');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              minHeight: '42px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--fern, #2e6922)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <span>Lanjut ke Step 3: Analisis &amp; Transformasi LN</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {/* 4. Kartu Step 3: Analisis Data Lanjutan & Transformasi LN */}
      <div
        id="panel-ln-card"
        className="no-print"
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
              Step 3: Analisis Distribusi Data &amp; Transformasi Logaritma Natural (<code>LN</code>)
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--stone, #687962)', margin: '4px 0 0 0' }}>
              Setelah data dibersihkan, sistem menganalisis kemencengan (<em>skewness</em>), keruncingan (<em>kurtosis</em>), dan rentang skala tiap variabel untuk mendeteksi variabel mana yang perlu ditransformasi dengan <code>LN</code> sebelum masuk ke <code>xtset</code>.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleApplySmartRecommendation}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                minHeight: '40px',
                borderRadius: '8px',
                border: lnMode === 'auto' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: lnMode === 'auto' ? 'var(--primary)' : 'var(--surface-sunken)',
                color: lnMode === 'auto' ? '#ffffff' : 'var(--text)',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <Sparkles size={15} />
              <span>⚡ Terapkan Rekomendasi Terbaik Sistem (Auto)</span>
            </button>

            <button
              type="button"
              onClick={handleResetToRaw}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                minHeight: '40px',
                borderRadius: '8px',
                border: lnMode === 'none' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: lnMode === 'none' ? 'var(--primary-glow)' : 'var(--surface)',
                color: 'var(--text)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <span>🔄 Gunakan Variabel Asli (Tanpa Transformasi)</span>
            </button>

            <button
              type="button"
              onClick={handleCopyStataLog}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                minHeight: '40px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: isCopiedLog ? 'var(--primary-glow)' : 'var(--surface)',
                color: isCopiedLog ? 'var(--primary)' : 'var(--text)',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {isCopiedLog ? <Check size={15} color="var(--primary)" /> : <Copy size={15} />}
              <span>{isCopiedLog ? 'Tersalin!' : 'Salin Script Stata (.do)'}</span>
            </button>
          </div>
        </div>

        {/* Tabel Analisis Multi-Transformasi Per Variabel */}
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th style={{ width: '230px' }}>Pilihan Transformasi</th>
                <th>Variabel</th>
                <th>Min / Max</th>
                <th>Skewness</th>
                <th>Kurtosis</th>
                <th>Analisis &amp; Rekomendasi Terbaik Sistem</th>
              </tr>
            </thead>
            <tbody>
              {lnReport.analyses.map(item => {
                const isTransformed = item.selectedMethod && item.selectedMethod !== 'asli';
                return (
                  <tr
                    key={item.variable}
                    style={{
                      background: isTransformed ? 'var(--primary-glow)' : 'var(--surface)'
                    }}
                  >
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select
                          className="panel-transform-select"
                          value={item.selectedMethod || 'asli'}
                          onChange={e => handleSelectTransformMethod(item.variable, e.target.value as TransformMethod)}
                          style={{ width: '100%' }}
                        >
                          {item.availableOptions?.map(opt => (
                            <option key={opt.method} value={opt.method} disabled={!opt.isValid}>
                              {opt.isRecommended ? '⭐ ' : ''}{opt.label}{!opt.isValid ? ` (${opt.invalidReason})` : ''}
                            </option>
                          ))}
                        </select>
                        <span style={{ fontSize: '11.5px', color: isTransformed ? 'var(--primary)' : 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 700 }}>
                          Aktif: {item.activeVarName || item.lnVarName}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 800 }}>
                      <span style={{ color: 'var(--text)' }}>{item.variable}</span>{' '}
                      <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>({item.role})</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {item.min} s/d {item.max}
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        fontFamily: 'monospace',
                        fontWeight: Math.abs(item.skewness) > 1 ? 800 : 500,
                        background: Math.abs(item.skewness) > 1 ? 'var(--warn-bg)' : 'transparent',
                        color: Math.abs(item.skewness) > 1 ? 'var(--warn)' : 'var(--text)'
                      }}>
                        {item.skewness}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        fontFamily: 'monospace',
                        fontWeight: item.kurtosis > 4.5 ? 800 : 500,
                        background: item.kurtosis > 4.5 ? 'var(--warn-bg)' : 'transparent',
                        color: item.kurtosis > 4.5 ? 'var(--warn)' : 'var(--text)'
                      }}>
                        {item.kurtosis}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: item.recommendedMethod !== 'asli' ? 'var(--warn-bg)' : 'var(--success-bg)',
                              border: item.recommendedMethod !== 'asli' ? '1px solid var(--warn-border)' : '1px solid var(--success-border)',
                              color: item.recommendedMethod !== 'asli' ? 'var(--warn)' : 'var(--success)'
                            }}
                          >
                            ⭐ Rekomendasi: {item.availableOptions?.find(o => o.method === item.recommendedMethod)?.badge || 'Asli'}
                          </span>
                          {item.selectedMethod === item.recommendedMethod ? (
                            <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 700 }}>
                              ✓ Rekomendasi Aktif
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>
                              (Pilihan Kustom)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                          {item.recommendedReason || item.reason}
                        </div>
                        {item.stataCommand && item.selectedMethod !== 'asli' && (
                          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                            Stata: <code style={{ color: 'var(--primary)' }}>{item.stataCommand}</code>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Ringkasan Variabel Aktif Menuju xtset */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border)',
            marginBottom: '16px',
            fontSize: '13px',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div>
            <strong>Variabel yang Masuk ke <code>xtset</code> &amp; Pemanggilan CEM, FEM, REM:</strong>{' '}
            Dependen (Y) = <code>{lnReport.activeYCol}</code> | Independen (X) = <code>{lnReport.activeXCols.join(', ')}</code>
            {fitResult?.assumptions.orthogReport?.triggered && (
              <span style={{ marginLeft: '8px', color: '#166534', fontWeight: 700 }}>
                &rarr; Variabel Akhir (Post-orthog): <code>{fitResult.finalActiveXCols?.join(', ')}</code>
              </span>
            )}
          </div>
        </div>

        {/* Stata Do Script Container */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={15} color="var(--stone, #687962)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--bark, #2b221a)' }}>
                Log Transformasi Kode Stata Reproducible (.do) — Cleaning, LN &amp; Orthog
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
                maxHeight: '240px',
                overflowY: 'auto',
                border: '1px solid #334155'
              }}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {combinedStataDoLog}
              </pre>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--moss, #1e3d14)', fontSize: '13px', fontWeight: 600 }}>
            <ShieldCheck size={18} color="var(--fern, #2e6922)" />
            <span>
              Data siap dilanjutkan ke <code>xtset</code>, pemanggilan CEM/FEM/REM, Uji Chow Dummy/Hausman/LM, Asumsi Klasik (<code>orthog</code> &amp; Normalitas), hingga <code>vce(robust)</code>.
            </span>
          </div>

          <button
            onClick={() => {
              runFullEstimation(dataRows, idCol, timeCol, yCol, xCols, zeroPolicy, lnMode, selectedLnCols, manualOrthogCols);
              setActiveStep(7);
            }}
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
            <span>{isCalculating ? 'Menghitung Model...' : 'Lanjut ke xtset & Jalankan Regresi Panel Stata'}</span>
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

      {/* Quick Export & Actions Toolbar (P6) */}
      {fitResult && (
        <div
          className="no-print"
          style={{
            marginBottom: '20px',
            padding: '14px 20px',
            background: '#ffffff',
            border: '1px solid var(--border, #d2e2ca)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--dew, #eef7eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <FileText size={18} color="var(--fern, #2e6922)" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--bark, #2b221a)' }}>
                Hasil Regresi Panel Tersedia: Model Terpilih {fitResult.selection.selectedModel} — Variabel Akhir: Y = <code>{fitResult.activeYCol || yCol}</code>, X = <code>{(fitResult.finalActiveXCols || xCols).join(', ')}</code>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--stone, #687962)' }}>
                {fitResult.declaration.entityCount} Entitas, {fitResult.declaration.tMax} Periode, {fitResult.declaration.totalObs} Observasi ({fitResult.declaration.isBalanced ? 'Balanced' : 'Unbalanced'})
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleExportDocx}
              disabled={isExportingDocx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                minHeight: '40px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--fern, #2e6922)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isExportingDocx ? 'wait' : 'pointer',
                opacity: isExportingDocx ? 0.7 : 1,
                boxShadow: '0 1px 3px rgba(46, 105, 34, 0.2)'
              }}
              title="Unduh Laporan Lengkap Microsoft Word (.docx)"
            >
              {isExportingDocx ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
              <span>{isExportingDocx ? 'Membuat Dokumen Word...' : 'Unduh Word (.docx)'}</span>
            </button>

            <button
              onClick={handlePrintPdf}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                minHeight: '40px',
                borderRadius: '8px',
                border: '1px solid var(--border, #d2e2ca)',
                background: '#ffffff',
                color: 'var(--bark, #2b221a)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Cetak atau Simpan sebagai PDF"
            >
              <Printer size={14} color="var(--stone, #687962)" />
              <span>Cetak PDF</span>
            </button>

            <button
              onClick={handleCopySummary}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                minHeight: '40px',
                borderRadius: '8px',
                border: '1px solid var(--border, #d2e2ca)',
                background: isCopiedSummary ? '#ecfdf5' : '#ffffff',
                color: isCopiedSummary ? '#065f46' : 'var(--bark, #2b221a)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Salin Ringkasan Hasil ke Clipboard"
            >
              {isCopiedSummary ? <Check size={14} color="#059669" /> : <Copy size={14} color="var(--stone, #687962)" />}
              <span>{isCopiedSummary ? 'Tersalin ke Clipboard!' : 'Salin Ringkasan'}</span>
            </button>
          </div>
        </div>
      )}

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
        <div className="panel-stepper-container no-print">
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
                Pemanggilan 3 Model Panel:
              </span>
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
                1. CEM (Pooled OLS — reg)
              </button>
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
                2. FEM (Fixed Effects — xtreg, fe)
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
                3. REM (Random Effects — xtreg, re)
              </button>
            </div>
          )}

          {/* Step 9 Model Selection Decision Matrix Card (Chow Dummy, Hausman, LM) */}
          {activeStep === 9 && fitResult && (
            <div
              style={{
                marginBottom: '16px',
                padding: '18px',
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid var(--border, #d2e2ca)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '16px',
                  fontWeight: 800,
                  color: 'var(--bark, #2b221a)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap'
                }}
              >
                <span>Uji Pemilihan Model Adaptif (Chow Pendekatan Dummy, Hausman, &amp; LM)</span>
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
                  Disesuaikan dengan Keadaan Data
                </span>
              </h3>

              {/* Grid 3 Kartu Uji */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                  gap: '12px',
                  marginBottom: '16px'
                }}
              >
                {/* 1. Uji Chow + Pendekatan Dummy */}
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                    1. Uji Chow (Pendekatan Dummy LSDV)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    <code>{fitResult.selection.chow.dummyApproach?.stataCmd || 'reg y x i.id_num'}</code> &amp; <code>testparm i.id_num</code>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    F({fitResult.selection.chow.df1}, {fitResult.selection.chow.df2}) = {fitResult.selection.chow.stat}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: fitResult.selection.chow.p < 0.05 ? '#16a34a' : '#475569' }}>
                    Prob &gt; F = {fitResult.selection.chow.p < 0.0001 ? '0.0000' : fitResult.selection.chow.p.toFixed(4)}
                  </div>
                  {fitResult.selection.chow.dummyApproach && (
                    <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                      LSDV R² = {fitResult.selection.chow.dummyApproach.r2LSDV} ({fitResult.selection.chow.dummyApproach.nDummies} dummy entitas)
                    </div>
                  )}
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
                      Keputusan Chow: Pilih {fitResult.selection.chow.preferred}
                    </span>
                  </div>
                </div>

                {/* 2. Uji Hausman (Adaptif) */}
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                    2. Uji Hausman (FEM vs REM)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    <code>hausman fe_model re_model, sigmamore</code>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    chi2({fitResult.selection.hausman.df}) = {fitResult.selection.hausman.chi2}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: fitResult.selection.hausman.p < 0.05 ? '#16a34a' : '#475569' }}>
                    Prob &gt; chi2 = {fitResult.selection.hausman.p.toFixed(4)}
                  </div>
                  {fitResult.selection.hausman.dataConditionNote && (
                    <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                      {fitResult.selection.hausman.dataConditionNote}
                    </div>
                  )}
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
                      Keputusan Hausman: Pilih {fitResult.selection.hausman.preferred}
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
                        Non-PSD (Mundlak CRE Aktif)
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Uji Breusch-Pagan LM */}
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                    3. Uji Breusch-Pagan LM (xttest0)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    CEM (Pooled OLS) vs REM (Random Effects)
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    chibar2({fitResult.selection.breuschPaganLM.df}) = {fitResult.selection.breuschPaganLM.chibar2}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: fitResult.selection.breuschPaganLM.p < 0.05 ? '#16a34a' : '#475569' }}>
                    Prob &gt; chibar2 = {fitResult.selection.breuschPaganLM.p < 0.0001 ? '0.0000' : fitResult.selection.breuschPaganLM.p.toFixed(4)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                    {fitResult.selection.chow.preferred === 'CEM' || fitResult.selection.hausman.preferred === 'REM'
                      ? 'Uji LM menjadi penentu akhir antara CEM vs REM.'
                      : 'Konfirmasi pelengkap karena Chow & Hausman telah memilih FEM.'}
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
                      Keputusan LM: Pilih {fitResult.selection.breuschPaganLM.preferred}
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
                    Model Terpilih: {fitResult.selection.selectedModel} ({fitResult.selection.selectedModel === 'FEM' ? 'Fixed Effects — xtreg, fe' : fitResult.selection.selectedModel === 'REM' ? 'Random Effects — xtreg, re' : 'Common Effects — reg'})
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
                  Spesifikasi Model Terpilih (Menggunakan Variabel Terakhir):
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--bark, #2b221a)', marginTop: '2px' }}>
                  Model {fitResult.selection.selectedModel} — Y: <code>{fitResult.activeYCol || yCol}</code> | X: <code>{(fitResult.finalActiveXCols || xCols).join(', ')}</code>
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

          {/* Step 11 Classical Assumptions, Orthog Transformation & Full Residual Normality */}
          {activeStep === 11 && fitResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
              {/* Bagian A: Multikolinearitas (Uncentered vs Centered VIF) & Transformasi orthog */}
              <div
                style={{
                  padding: '18px',
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid var(--border, #d2e2ca)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--bark, #2b221a)' }}>
                      1. Uji Multikolinearitas &amp; Transformasi Orthogonal (<code>orthog</code>)
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#475569' }}>
                      Karena model terpilih adalah <strong>{fitResult.selection.selectedModel}</strong>, sistem otomatis menggunakan{' '}
                      <strong>
                        {fitResult.assumptions.vif.approach === 'uncentered'
                          ? 'Uncentered VIF (vif, uncentered — Pendekatan xtreg FEM/REM)'
                          : 'Centered VIF (estat vif — Pendekatan reg CEM)'}
                      </strong>. Jika terdapat multikolinearitas (VIF &gt; 10) atau dipilih pengguna, variabel ditransformasi dengan <code>orthog</code> dan model <code>xtreg</code> menggunakan variabel terakhir (<code>{(fitResult.finalActiveXCols || xCols).join(', ')}</code>).
                    </p>
                  </div>

                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '999px',
                      background: '#e0f2fe',
                      color: '#0369a1'
                    }}
                  >
                    Perintah Stata: {fitResult.assumptions.vif.stataCmd || 'vif, uncentered'}
                  </span>
                </div>

                {/* Tabel VIF Awal & Pilihan orthog */}
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Transformasi <code>orthog</code></th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Variabel Awal</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>VIF Awal ({fitResult.assumptions.vif.approach})</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>1/VIF (Tolerance)</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Variabel Akhir di Model</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>VIF Akhir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(fitResult.assumptions.vif.variables).map(([varName, v]) => {
                        const orthReport = fitResult.assumptions.orthogReport;
                        const orthName = orthReport?.orthogMapping[varName];
                        const finalName = orthName || varName;
                        const postVifItem = orthReport?.postOrthogVif.variables[finalName];
                        const isOrthogChecked = Boolean(orthName);
                        return (
                          <tr key={varName} style={{ borderBottom: '1px solid #f1f5f9', background: isOrthogChecked ? '#f0fdf4' : '#ffffff' }}>
                            <td style={{ padding: '8px 12px' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isOrthogChecked}
                                  onChange={() => handleToggleOrthogVar(varName)}
                                />
                                <span style={{ fontWeight: 600, color: isOrthogChecked ? '#166534' : '#475569' }}>
                                  {isOrthogChecked ? 'Di-orthog' : 'Asli'}
                                </span>
                              </label>
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 700 }}>{varName}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: v.vif > 10 ? '#dc2626' : '#1e293b' }}>
                              {v.vif.toFixed(2)} {v.vif > 10 ? '(Multiko > 10)' : ''}
                            </td>
                            <td style={{ padding: '8px 12px' }}>{v.tolerance.toFixed(4)}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: isOrthogChecked ? '#166534' : '#334155' }}>
                              <code>{finalName}</code>
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#166534' }}>
                              {postVifItem ? postVifItem.vif.toFixed(2) : v.vif.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Tombol Cepat Transformasi Orthog Semua X / Reset */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#065f46', fontWeight: 600 }}>
                    {fitResult.assumptions.orthogReport?.triggered
                      ? `Aktif: Variabel [${Object.entries(fitResult.assumptions.orthogReport.orthogMapping).map(([orig, orth]) => `${orig} -> ${orth}`).join(', ')}] telah diortogonalisasi (Gram-Schmidt) dan dipakai pada model ${fitResult.selection.selectedModel}.`
                      : `Mean VIF = ${fitResult.assumptions.vif.meanVif.toFixed(2)}. Tidak ada variabel dengan VIF > 10 (Anda tetap dapat mencentang variabel di atas jika ingin menerapkan orthog secara manual).`}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setManualOrthogCols(fitResult.initialActiveXCols || xCols)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--fern, #2e6922)',
                        background: 'var(--dew, #eef7eb)',
                        color: 'var(--moss, #1e3d14)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Terapkan <code>orthog</code> Semua Variabel X
                    </button>
                    {fitResult.assumptions.orthogReport?.triggered && (
                      <button
                        type="button"
                        onClick={() => setManualOrthogCols([])}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#475569',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Reset Tanpa <code>orthog</code>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Bagian B: Heteroskedastisitas (xttest3) & Autokorelasi (xtserial) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '14px', background: 'var(--surface-sunken)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                    2. Uji Heteroskedastisitas (Modified Wald — <code>xttest3</code>)
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    chi2({fitResult.assumptions.greeneHetero?.df || 10}) = {fitResult.assumptions.greeneHetero?.chi2} (Prob &gt; chi2 = {(fitResult.assumptions.greeneHetero?.p ?? 1) < 0.0001 ? '0.0000' : (fitResult.assumptions.greeneHetero?.p ?? 1).toFixed(4)})
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: fitResult.assumptions.greeneHetero?.hasHeteroskedasticity ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                    {fitResult.assumptions.greeneHetero?.hasHeteroskedasticity
                      ? 'Terdeteksi Heteroskedastisitas Kelompok -> Dinetralisir oleh vce(robust) di Step 12'
                      : 'Homoskedastis (Varians Galat Konstan)'}
                  </div>
                </div>

                <div style={{ padding: '14px', background: 'var(--surface-sunken)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                    3. Uji Autokorelasi Serial Wooldridge (<code>xtserial</code>)
                  </div>
                  {fitResult.assumptions.wooldridgeSerial?.skippedReason ? (
                    <div style={{ fontSize: '12px', color: 'var(--warn)' }}>{fitResult.assumptions.wooldridgeSerial.skippedReason}</div>
                  ) : (
                    <>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                        F({fitResult.assumptions.wooldridgeSerial?.df1}, {fitResult.assumptions.wooldridgeSerial?.df2}) = {fitResult.assumptions.wooldridgeSerial?.f} (Prob &gt; F = {(fitResult.assumptions.wooldridgeSerial?.p ?? 1) < 0.0001 ? '0.0000' : (fitResult.assumptions.wooldridgeSerial?.p ?? 1).toFixed(4)})
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '12px', color: fitResult.assumptions.wooldridgeSerial?.hasAutocorrelation ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                        {fitResult.assumptions.wooldridgeSerial?.hasAutocorrelation
                          ? 'Terdeteksi Autokorelasi AR(1) -> Dinetralisir oleh vce(robust) di Step 12'
                          : 'Bebas Autokorelasi Serial Orde-1'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Bagian C: Uji Normalitas Residual (predict e, e vs predict resid, residuals) + Histogram Visual + sktest + swilk + ksmirnov */}
              {activeNormalityStats && (
                <div
                  style={{
                    padding: '18px',
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid var(--border, #d2e2ca)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--bark, #2b221a)' }}>
                        4. Uji Normalitas Residual: <code>predict e, e</code> vs <code>predict resid, residuals</code>, Histogram, <code>sktest</code>, <code>swilk</code> &amp; <code>ksmirnov</code>
                      </h3>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#047857', fontWeight: 600 }}>
                        {activeNormalityStats.predictExplanation}
                      </p>
                    </div>

                    {/* Toggle predict e, e vs predict resid, residuals */}
                    <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setActiveResidMode('e')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: activeResidMode === 'e' ? 'var(--fern, #2e6922)' : 'transparent',
                          color: activeResidMode === 'e' ? '#ffffff' : '#334155',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        predict e, e {fitResult.selection.selectedModel !== 'CEM' ? '(Terbaik untuk FEM/REM)' : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveResidMode('resid')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: activeResidMode === 'resid' ? 'var(--fern, #2e6922)' : 'transparent',
                          color: activeResidMode === 'resid' ? '#ffffff' : '#334155',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        predict resid, residuals {fitResult.selection.selectedModel === 'CEM' ? '(Terbaik untuk CEM)' : ''}
                      </button>
                    </div>
                  </div>

                  {/* Visual SVG Histogram + Kurva Normal (histogram e, normal) */}
                  {activeNormalityStats.histogramBins && activeNormalityStats.histogramBins.length > 0 && (
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '16px',
                        marginBottom: '16px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                          Visualisasi Histogram Residual &amp; Kurva Normal (<code>histogram {activeResidMode === 'e' ? 'e' : 'resid'}, normal</code>)
                        </span>
                        <span style={{ fontSize: '12px', color: '#475569' }}>
                          Mean = {activeNormalityStats.meanResidual} | SD = {activeNormalityStats.sdResidual} | Skewness = {activeNormalityStats.skewness} | Kurtosis = {activeNormalityStats.kurtosis}
                        </span>
                      </div>

                      {(() => {
                        const bins = activeNormalityStats.histogramBins || [];
                        const maxVal = Math.max(
                          ...bins.map(b => Math.max(b.density, b.normalDensity)),
                          0.0001
                        );
                        const svgWidth = 640;
                        const svgHeight = 190;
                        const padLeft = 36;
                        const padRight = 20;
                        const padTop = 16;
                        const padBottom = 30;
                        const plotW = svgWidth - padLeft - padRight;
                        const plotH = svgHeight - padTop - padBottom;
                        const barW = plotW / bins.length;

                        const curvePoints = bins
                          .map((b, i) => {
                            const cx = padLeft + (i + 0.5) * barW;
                            const cy = padTop + plotH - (b.normalDensity / maxVal) * plotH;
                            return `${cx.toFixed(1)},${cy.toFixed(1)}`;
                          })
                          .join(' ');

                        return (
                          <svg
                            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                            style={{ width: '100%', height: '200px', display: 'block' }}
                          >
                            <line
                              x1={padLeft}
                              y1={padTop + plotH}
                              x2={padLeft + plotW}
                              y2={padTop + plotH}
                              stroke="#94a3b8"
                              strokeWidth="1.5"
                            />
                            {bins.map((b, i) => {
                              const h = (b.density / maxVal) * plotH;
                              const x = padLeft + i * barW + 2;
                              const y = padTop + plotH - h;
                              return (
                                <g key={i}>
                                  <rect
                                    x={x}
                                    y={y}
                                    width={Math.max(2, barW - 4)}
                                    height={Math.max(0, h)}
                                    fill="#86efac"
                                    stroke="#16a34a"
                                    strokeWidth="1"
                                    rx="2"
                                  />
                                  {i % 2 === 0 && (
                                    <text
                                      x={padLeft + (i + 0.5) * barW}
                                      y={padTop + plotH + 16}
                                      textAnchor="middle"
                                      fontSize="10"
                                      fill="#475569"
                                    >
                                      {b.mid}
                                    </text>
                                  )}
                                </g>
                              );
                            })}
                            <polyline
                              fill="none"
                              stroke="var(--primary)"
                              strokeWidth="2.5"
                              points={curvePoints}
                            />
                          </svg>
                        );
                      })()}
                    </div>
                  )}

                  {/* 3 Kartu Uji Normalitas Stata: sktest, swilk, dan ksmirnov */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    {activeNormalityStats.sktest && (
                      <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                          1. Skewness/Kurtosis Test (<code>sktest</code>)
                        </div>
                        <div style={{ fontSize: '12px', color: '#334155' }}>
                          Pr(Skewness) = {activeNormalityStats.sktest.prSkewness.toFixed(4)} | Pr(Kurtosis) = {activeNormalityStats.sktest.prKurtosis.toFixed(4)}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>
                          adj chi2(2) = {activeNormalityStats.sktest.adjChi2.toFixed(2)} (Prob &gt; chi2 = {activeNormalityStats.sktest.probChi2.toFixed(4)})
                        </div>
                        <div style={{ marginTop: '6px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: activeNormalityStats.sktest.isNormal ? '#dcfce7' : '#fef3c7',
                              color: activeNormalityStats.sktest.isNormal ? '#166534' : '#92400e'
                            }}
                          >
                            {activeNormalityStats.sktest.isNormal ? 'Normal (p >= 0.05)' : 'Tidak Normal (p < 0.05)'}
                          </span>
                        </div>
                      </div>
                    )}

                    {activeNormalityStats.swilk && (
                      <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                          2. Shapiro-Wilk W Test (<code>swilk</code>)
                        </div>
                        <div style={{ fontSize: '12px', color: '#334155' }}>
                          W = {activeNormalityStats.swilk.w.toFixed(5)} | V = {activeNormalityStats.swilk.v.toFixed(3)} | z = {activeNormalityStats.swilk.z.toFixed(3)}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>
                          Prob &gt; z = {activeNormalityStats.swilk.probZ.toFixed(5)}
                        </div>
                        <div style={{ marginTop: '6px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: activeNormalityStats.swilk.isNormal ? '#dcfce7' : '#fef3c7',
                              color: activeNormalityStats.swilk.isNormal ? '#166534' : '#92400e'
                            }}
                          >
                            {activeNormalityStats.swilk.isNormal ? 'Normal (p >= 0.05)' : 'Tidak Normal (p < 0.05)'}
                          </span>
                        </div>
                      </div>
                    )}

                    {activeNormalityStats.ksmirnov && (
                      <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                          3. Kolmogorov-Smirnov (<code>ksmirnov</code>)
                        </div>
                        <div style={{ fontSize: '12px', color: '#334155' }}>
                          Statistik D Maksimum = {activeNormalityStats.ksmirnov.dStat.toFixed(4)}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>
                          Combined K-S p-value = {activeNormalityStats.ksmirnov.correctedP.toFixed(4)}
                        </div>
                        <div style={{ marginTop: '6px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: activeNormalityStats.ksmirnov.isNormal ? '#dcfce7' : '#fef3c7',
                              color: activeNormalityStats.ksmirnov.isNormal ? '#166534' : '#92400e'
                            }}
                          >
                            {activeNormalityStats.ksmirnov.isNormal ? 'Normal (p >= 0.05)' : 'Tidak Normal (p < 0.05)'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 12 Easy Plain-Language Interpretation & Final vce(robust) Card */}
          {activeStep === 12 && fitResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
              {fitResult.easyInterpretation && (
                <div
                  style={{
                    padding: '22px',
                    background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                    borderRadius: '14px',
                    border: '2px solid #86efac',
                    boxShadow: '0 4px 16px rgba(30, 61, 20, 0.08)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <Lightbulb size={22} color="#166534" />
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#14532d' }}>
                      Interpretasi Hasil Akhir Regresi Data Panel (Bahasa Mudah &amp; Siap Masuk Pembahasan)
                    </h3>
                  </div>

                  <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#1e293b', margin: '0 0 12px 0' }}>
                    {fitResult.easyInterpretation.modelSummaryLine}
                  </p>

                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: '#ffffff',
                      border: '1px solid #bbf7d0',
                      fontSize: '13.5px',
                      lineHeight: 1.6,
                      color: '#166534',
                      marginBottom: '16px'
                    }}
                  >
                    <div><strong>1. Uji Simultan (Kelayakan Model):</strong> {fitResult.easyInterpretation.simultaneousTestLine}</div>
                    <div style={{ marginTop: '6px' }}><strong>2. Koefisien Determinasi (R²):</strong> {fitResult.easyInterpretation.rSquaredLine}</div>
                  </div>

                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#14532d', marginBottom: '10px' }}>
                    3. Penjelasan Pengaruh Tiap Variabel Independen (Uji Parsial Robust):
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                    {fitResult.easyInterpretation.predictorInterpretations.map(eff => (
                      <div
                        key={eff.variable}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '10px',
                          background: '#ffffff',
                          border: `1px solid ${eff.isSignificant ? '#86efac' : '#cbd5e1'}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>
                            Variabel <code>{eff.variable}</code>
                            {eff.originalVariable !== eff.variable ? ` (dari ${eff.originalVariable})` : ''}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '3px 10px',
                              borderRadius: '999px',
                              background: eff.isSignificant ? '#dcfce7' : '#f1f5f9',
                              color: eff.isSignificant ? '#166534' : '#475569'
                            }}
                          >
                            {eff.isSignificant ? `BERPENGARUH SIGNIFIKAN (${eff.direction.toUpperCase()})` : 'TIDAK BERPENGARUH SIGNIFIKAN'} | Coef = {eff.coef.toFixed(4)}, p = {eff.pValue < 0.0001 ? '0.0000' : eff.pValue.toFixed(4)}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                          {eff.easyMeaning}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: '#ecfdf5',
                      border: '1px solid #6ee7b7',
                      fontSize: '13px',
                      color: '#065f46',
                      lineHeight: 1.55
                    }}
                  >
                    <div><strong>Catatan Transformasi Variabel:</strong> {fitResult.easyInterpretation.transformationNotes.join(' ')}</div>
                    <div style={{ marginTop: '6px' }}><strong>{fitResult.easyInterpretation.overallConclusion}</strong></div>
                  </div>
                </div>
              )}

              {/* Step 12: Ekspor & Dokumentasi Laporan Word (.docx) */}
              <div
                className="no-print"
                style={{
                  padding: '20px',
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid var(--border, #d2e2ca)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={20} color="#166534" />
                      Ekspor &amp; Dokumentasi Laporan Panel Lengkap
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151', marginTop: '3px' }}>
                      Unduh berkas Word (.docx) dengan tabel ekonometrika resmi APA/Stata, cetak langsung ke format PDF, atau salin ringkasan eksekutif untuk draft skripsi / tesis.
                    </div>
                  </div>
                  {docxExportError && (
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>
                      {docxExportError}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleExportDocx}
                    disabled={isExportingDocx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      minHeight: '44px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--fern, #2e6922)',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: isExportingDocx ? 'wait' : 'pointer',
                      opacity: isExportingDocx ? 0.7 : 1,
                      boxShadow: '0 2px 6px rgba(46, 105, 34, 0.25)'
                    }}
                  >
                    {isExportingDocx ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                    <span>{isExportingDocx ? 'Membuat Dokumen Word...' : 'Unduh Laporan Word (.docx)'}</span>
                  </button>

                  <button
                    onClick={handlePrintPdf}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      minHeight: '44px',
                      borderRadius: '8px',
                      border: '1px solid var(--border, #d2e2ca)',
                      background: '#ffffff',
                      color: 'var(--bark, #2b221a)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Printer size={16} color="var(--stone, #687962)" />
                    <span>Cetak / Simpan PDF</span>
                  </button>

                  <button
                    onClick={handleCopySummary}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      minHeight: '44px',
                      borderRadius: '8px',
                      border: '1px solid var(--border, #d2e2ca)',
                      background: isCopiedSummary ? '#ecfdf5' : '#ffffff',
                      color: isCopiedSummary ? '#065f46' : 'var(--bark, #2b221a)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {isCopiedSummary ? <Check size={16} color="#059669" /> : <Copy size={16} color="var(--stone, #687962)" />}
                    <span>{isCopiedSummary ? 'Ringkasan Tersalin!' : 'Salin Ringkasan ke Clipboard'}</span>
                  </button>
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
              Klik tombol &quot;Lanjut ke xtset &amp; Jalankan Regresi Panel Stata&quot; untuk memulai analisis.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
