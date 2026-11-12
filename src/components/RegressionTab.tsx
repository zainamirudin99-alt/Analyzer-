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
  Info, 
  Search, 
  Sparkles, 
  Layers, 
  Clock, 
  Sliders, 
  ShieldCheck, 
  Database,
  Lock,
  UserCheck,
  Activity,
  FileText
} from 'lucide-react';
import { inspectColumn, validateRegressionConfig, ValidationSummary } from '@/lib/regression-validator';
import { RegressionResultsView } from './RegressionResultsView';
import { OLSFitResult } from '@/lib/regression-engine';
import { sanitizeCellValue } from '@/lib/file-signature';
import {
  classifyAnalysisPath,
  validateAndProfileDataset,
  calculateDescriptiveStatistics,
  calculateCorrelationMatrix,
  generateVisualChartData,
  INTERNAL_MENU_STRUCTURE,
  DEFAULT_WORKFLOW_STEPS
} from '@/lib/regression-data-processor';

interface RegressionTabProps {
  onNavigateHome?: () => void;
  onNavigateToPanel?: () => void;
}

// Sample dataset untuk pengujian langsung tanpa perlu upload
const SAMPLE_DATASET: Record<string, any>[] = Array.from({ length: 65 }, (_, i) => {
  const x1 = Math.round((20 + i * 0.8 + Math.sin(i) * 5) * 10) / 10;
  const x2 = Math.round((50 + i * 1.2 + Math.cos(i) * 8) * 10) / 10;
  const error = Math.round((Math.sin(i * 2) * 3) * 10) / 10;
  const y = Math.round((15 + 0.65 * x1 + 0.42 * x2 + error) * 10) / 10;
  const year = 2020 + Math.floor(i / 12);
  const month = (i % 12) + 1;
  const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  return {
    ID: i + 1,
    Tanggal: dateStr,
    Pengeluaran_RND: x1,
    Biaya_Promosi: x2,
    Nilai_Penjualan_Y: y,
    Kategori_Sektor: i % 2 === 0 ? 'Teknologi' : 'Manufaktur'
  };
});

export const RegressionTab: React.FC<RegressionTabProps> = () => {
  // Stepper state (1 sampai 6)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Authentication & Tenant Isolation Demo State
  const [currentUser, setCurrentUser] = useState<'user_a' | 'user_b'>('user_a');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

  // Step 1: Data Ingestion State
  const [sourceType, setSourceType] = useState<'upload' | 'link'>('upload');
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [ingestionError, setIngestionError] = useState<string | null>(null);
  const [ingestionWarning, setIngestionWarning] = useState<string | null>(null);

  // Parsed Data State
  const [fileName, setFileName] = useState<string>('sample_data_penelitian.xlsx');
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(14500);
  const [sheetsList, setSheetsList] = useState<string[]>(['Sheet1_Penelitian']);
  const [selectedSheet, setSelectedSheet] = useState<string>('Sheet1_Penelitian');
  const [availableSheetsData, setAvailableSheetsData] = useState<any[]>([
    {
      sheetName: 'Sheet1_Penelitian',
      rowCount: SAMPLE_DATASET.length,
      columnCount: Object.keys(SAMPLE_DATASET[0]).length,
      columns: Object.keys(SAMPLE_DATASET[0]),
      previewRows: SAMPLE_DATASET.slice(0, 10),
      allRows: SAMPLE_DATASET
    }
  ]);
  const [allRows, setAllRows] = useState<Record<string, any>[]>(SAMPLE_DATASET);

  // Step 4: Variable Selection State
  const [yCol, setYCol] = useState<string>('Nilai_Penjualan_Y');
  const [xCols, setXCols] = useState<string[]>(['Pengeluaran_RND', 'Biaya_Promosi']);
  const [refCategories, setRefCategories] = useState<Record<string, string>>({});
  const [columnSearchQuery, setColumnSearchQuery] = useState<string>('');
  const [isMobilePickerOpen, setIsMobilePickerOpen] = useState<boolean>(false);

  // Step 5: Time Series & Regression Options
  const [isTimeSeries, setIsTimeSeries] = useState<boolean>(false);
  const [timeCol, setTimeCol] = useState<string>('Tanggal');
  const [frequency, setFrequency] = useState<'harian' | 'mingguan' | 'bulanan' | 'kuartalan' | 'tahunan' | 'tidak_beraturan'>('bulanan');
  const [alpha, setAlpha] = useState<number>(0.05);
  const [missingPolicy, setMissingPolicy] = useState<'listwise' | 'impute_mean' | 'impute_median'>('listwise');
  const [normalityTest, setNormalityTest] = useState<'auto' | 'shapiro' | 'lilliefors'>('auto');
  const [entryMethod, setEntryMethod] = useState<'enter' | 'forward' | 'backward' | 'stepwise'>('enter');

  // Step 6: Validation Result
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);

  // Step 7: Statistical Fit Result
  const [isFitting, setIsFitting] = useState(false);
  const [fitError, setFitError] = useState<string | null>(null);
  const [fitResult, setFitResult] = useState<OLSFitResult | null>(null);

  // Tahap 1: State Tambahan (Struktur Internal & Visualisasi)
  const [showInternalStructure, setShowInternalStructure] = useState<boolean>(false);
  const [step6SubTab, setStep6SubTab] = useState<'validation' | 'descriptives' | 'correlation' | 'charts'>('validation');

  // List of columns in current sheet
  const availableColumns = useMemo(() => {
    if (!allRows || allRows.length === 0) return [];
    return Object.keys(allRows[0]);
  }, [allRows]);

  // Detected column types
  const columnTypeMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof inspectColumn>> = {};
    availableColumns.forEach(col => {
      const vals = allRows.map(r => r[col]);
      map[col] = inspectColumn(col, vals);
    });
    return map;
  }, [availableColumns, allRows]);

  // Profiling & Validasi Dataset Lengkap
  const datasetProfile = useMemo(() => {
    return validateAndProfileDataset(allRows, fileName);
  }, [allRows, fileName]);

  // Klasifikasi 4 Jalur Analisis
  const analysisPath = useMemo(() => {
    return classifyAnalysisPath(isTimeSeries, xCols.length);
  }, [isTimeSeries, xCols.length]);

  // Variabel Aktif (Y + X)
  const activeVariables = useMemo(() => {
    return [yCol, ...xCols].filter(c => c && availableColumns.includes(c));
  }, [yCol, xCols, availableColumns]);

  // 8 Parameter Statistik Deskriptif SPSS
  const descriptiveStats = useMemo(() => {
    if (activeVariables.length === 0) return [];
    return calculateDescriptiveStatistics(allRows, activeVariables);
  }, [allRows, activeVariables]);

  // Matriks Korelasi (Pearson & Spearman)
  const correlationData = useMemo(() => {
    if (activeVariables.length < 2) return null;
    return calculateCorrelationMatrix(allRows, activeVariables);
  }, [allRows, activeVariables]);

  // Visual Chart Data (Histogram, Boxplot, Scatterplot)
  const visualChartData = useMemo(() => {
    if (!yCol) return null;
    return generateVisualChartData(allRows, yCol, xCols[0], isTimeSeries ? timeCol : undefined);
  }, [allRows, yCol, xCols, isTimeSeries, timeCol]);

  // Handler pemilihan sheet yang memperbarui baris data dan variabel
  const selectSheetByName = (sheetName: string, sheetsSource?: any[]) => {
    setSelectedSheet(sheetName);
    const sheets = sheetsSource || availableSheetsData;
    const targetSheet = sheets.find((s: any) => s.sheetName === sheetName);
    if (targetSheet) {
      const rows = targetSheet.allRows || targetSheet.previewRows || [];
      setAllRows(rows);
      
      const cols: string[] = targetSheet.columns || (rows.length > 0 ? Object.keys(rows[0]) : []);
      const validCols = cols.filter(c => c && typeof c === 'string');

      const numericCols = validCols.filter(c => {
        const vals = rows.map((r: any) => r[c]);
        return inspectColumn(c, vals).type === 'numeric';
      });

      if (numericCols.length >= 2) {
        setYCol(numericCols[0]);
        setXCols([numericCols[1]]);
      } else if (numericCols.length === 1) {
        setYCol(numericCols[0]);
        setXCols([]);
      } else if (validCols.length >= 2) {
        setYCol(validCols[0]);
        setXCols([validCols[1]]);
      } else {
        setYCol(validCols[0] || '');
        setXCols([]);
      }
    }
  };

  // Invarian: Pastikan xCols dan yCol SELALU tersinkronisasi dengan availableColumns yang aktif
  useEffect(() => {
    if (availableColumns.length > 0) {
      // 1. Bersihkan xCols dari kolom yang tidak ada di dataset aktif atau sama dengan yCol
      setXCols(prev => {
        const validX = prev.filter(c => availableColumns.includes(c) && c !== yCol);
        if (validX.length !== prev.length) {
          return validX;
        }
        return prev;
      });

      // 2. Pastikan yCol valid dan ada di availableColumns
      if (yCol && !availableColumns.includes(yCol)) {
        const firstNumeric = availableColumns.find(c => columnTypeMap[c]?.type === 'numeric');
        setYCol(firstNumeric || availableColumns[0] || '');
      }
    } else {
      setXCols([]);
      setYCol('');
    }
  }, [availableColumns, yCol, columnTypeMap]);

  // Handle Local File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setIngestionError(null);
    setIngestionWarning(null);

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
        setIsLoading(false);
        return;
      }

      setFileName(json.data.originalName);
      setFileSizeBytes(json.data.sizeBytes);
      const sheetNames = json.data.sheetNames || [];
      setSheetsList(sheetNames);
      const sheets = json.data.sheets || [];
      setAvailableSheetsData(sheets);

      if (sheetNames.length > 0) {
        selectSheetByName(sheetNames[0], sheets);
      }

      setCurrentStep(2); // Lanjut ke step pilih sheet
    } catch (err: any) {
      setIngestionError(`Terjadi kesalahan jaringan: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Sheets Import
  const handleGoogleSheetsImport = async () => {
    if (!googleSheetsUrl.trim()) {
      setIngestionError('Masukkan URL spreadsheet Google Sheets yang valid.');
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
        if (json.statusNote) {
          setIngestionWarning(json.statusNote);
        }
        setIsLoading(false);
        return;
      }

      setFileName(json.data.originalName);
      setFileSizeBytes(json.data.sizeBytes);
      const sheetNames = json.data.sheetNames || [];
      setSheetsList(sheetNames);
      const sheets = json.data.sheets || [];
      setAvailableSheetsData(sheets);

      if (sheetNames.length > 0) {
        selectSheetByName(sheetNames[0], sheets);
      }

      setCurrentStep(2);
    } catch (err: any) {
      setIngestionError(`Gagal menghubungi server: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Run Validation on Step 6
  const triggerValidation = () => {
    const summary = validateRegressionConfig(allRows, {
      yCol,
      xCols,
      isTimeSeries,
      timeCol: isTimeSeries ? timeCol : undefined,
      frequency,
      alpha,
      missingPolicy
    });
    setValidationSummary(summary);
    setCurrentStep(6);
  };

  // Run Statistical Regression Engine (Tahap 2)
  const handleRunOLS = async () => {
    setIsFitting(true);
    setFitError(null);
    try {
      // Kirim hanya kolom relevan untuk menghemat bandwidth jaringan dan mencegah payload limit
      const relevantCols = Array.from(new Set([yCol, ...xCols, ...(isTimeSeries && timeCol ? [timeCol] : [])]));
      const trimmedRows = allRows.map(row => {
        const cleanRow: Record<string, any> = {};
        for (const col of relevantCols) {
          cleanRow[col] = row[col];
        }
        return cleanRow;
      });

      const res = await fetch('/api/engine/fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: trimmedRows,
          yCol,
          xCols,
          isTimeSeries,
          timeCol: isTimeSeries ? timeCol : undefined,
          frequency,
          alpha,
          missingPolicy
        })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const rawText = await res.text();
        throw new Error(`Server mengembalikan respon non-JSON (${res.status}): ${rawText.slice(0, 150)}`);
      }

      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || `Gagal mengeksekusi estimasi OLS (Status ${res.status}).`);
      }

      setFitResult(json.data);
      setCurrentStep(7);
    } catch (err: any) {
      setFitError(err.message || 'Terjadi kesalahan sistem saat menjalankan estimasi OLS.');
    } finally {
      setIsFitting(false);
    }
  };

  // Toggle X Column
  const toggleXColumn = (col: string) => {
    if (col === yCol) return; // Invarian I5: Y tidak boleh menjadi X
    if (!availableColumns.includes(col)) return; // Hanya kolom yang benar-benar ada di dataset aktif
    setXCols(prev => {
      const cleanPrev = prev.filter(c => availableColumns.includes(c) && c !== yCol);
      if (cleanPrev.includes(col)) {
        return cleanPrev.filter(c => c !== col);
      } else {
        return [...cleanPrev, col];
      }
    });
  };

  // Filtered Columns for Search
  const filteredColumns = availableColumns.filter(c => 
    c.toLowerCase().includes(columnSearchQuery.toLowerCase())
  );

  return (
    <div className="regression-wrapper" style={{ padding: '8px 0 60px 0' }}>
      
      {/* Header Bar Modul Regresi */}
      <div className="regression-banner card" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>📊</span>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--moss)', margin: 0 }}>
                Analisis Regresi Statistik (SLR & MLR)
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--stone)', margin: '4px 0 0 0' }}>
                Mesin regresi linear OLS bergaya SPSS, uji asumsi klasik komprehensif, dan pelaporan jujur M0.
              </p>
              
              {/* Dynamic 4-Path Badge & 15-Module Structure Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isTimeSeries ? 'var(--info-bg)' : 'var(--success-bg)',
                  border: isTimeSeries ? '1px solid var(--info-border)' : '1px solid var(--success-border)',
                  color: isTimeSeries ? 'var(--info)' : 'var(--success)',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '11.5px',
                  fontWeight: 800
                }}>
                  <Activity size={13} />
                  {analysisPath.label}
                </span>

                <button
                  type="button"
                  onClick={() => setShowInternalStructure(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'var(--dew)',
                    border: '1px solid var(--border)',
                    color: 'var(--moss)',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Klik untuk melihat 15 komponen modul dan status workflow"
                >
                  <Info size={13} />
                  Struktur 15 Modul & Workflow
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tenant Isolation Switcher Demo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--dew)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <ShieldCheck size={16} color="var(--fern)" />
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Tenant RLS:</span>
          <button 
            className={`btn btn-sm ${currentUser === 'user_a' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '4px 10px', fontSize: '11px', height: '28px' }}
            onClick={() => setCurrentUser('user_a')}
          >
            Pengguna A
          </button>
          <button 
            className={`btn btn-sm ${currentUser === 'user_b' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '4px 10px', fontSize: '11px', height: '28px' }}
            onClick={() => setCurrentUser('user_b')}
          >
            Pengguna B
          </button>
        </div>
      </div>

      {/* Advisory Banner: Potensi Data Panel */}
      {datasetProfile.isPotentialPanel && (
        <div style={{
          marginBottom: '20px',
          padding: '14px 18px',
          borderRadius: '12px',
          background: 'var(--warn-bg)',
          border: '1.5px solid var(--warn-border)',
          color: 'var(--warn)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <AlertTriangle size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '2px' }}>
              Perhatian Ekonometrika: Potensi Struktur Data Panel Terdeteksi!
            </div>
            <div style={{ fontSize: '12.5px', lineHeight: 1.5 }}>
              {datasetProfile.panelAdvisoryMessage}
            </div>
          </div>
        </div>
      )}

      {/* Auth Guard Card if not logged in */}
      {!isAuthenticated && (
        <div className="card" style={{ maxWidth: '540px', margin: '40px auto', textAlign: 'center', padding: '36px' }}>
          <Lock size={44} color="var(--fern)" style={{ marginBottom: '16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>Autentikasi Diperlukan</h3>
          <p style={{ fontSize: '13.5px', color: 'var(--stone)', marginBottom: '24px', lineHeight: 1.6 }}>
            Modul Analisis Regresi Statistik menerapkan <strong>Row Level Security (RLS)</strong>. Silakan masuk untuk mengakses workspace dan dataset privat Anda.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setIsAuthenticated(true)}>
            Masuk dengan Supabase Auth
          </button>
        </div>
      )}

      {/* Main 3-Column / Mobile Responsive Grid */}
      {isAuthenticated && (
        <div className="regression-grid-layout" style={{ display: 'grid', gridTemplateColumns: '260px 1fr 280px', gap: '20px', alignItems: 'start' }}>
          
          {/* ========================================================
              KOLOM KIRI: VERTICAL STEPPER (DESKTOP)
             ======================================================== */}
          <div className="card stepper-sidebar" style={{ padding: '16px', position: 'sticky', top: '20px' }}>
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--stone)', marginBottom: '16px', fontWeight: 800 }}>
              Alur Wizard Regresi
            </h4>
            
            <div className="stepper-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { step: 1, title: 'Sumber Data', desc: 'Unggah file / Google Sheets' },
                { step: 2, title: 'Pilih Sheet', desc: 'Pilih lembar kerja aktif' },
                { step: 3, title: 'Pratinjau Data', desc: 'Cek 10 baris & tipe kolom' },
                { step: 4, title: 'Pilih Kolom', desc: 'Tentukan variabel Y & X' },
                { step: 5, title: 'Konfigurasi', desc: 'Time series, alpha, missing' },
                { step: 6, title: 'Ringkasan & Validasi', desc: 'Kecukupan Green (1991)' },
                { step: 7, title: 'Hasil Analisis', desc: 'Tabel SPSS & Diagnostik' }
              ].map(item => {
                const isActive = currentStep === item.step;
                const isPassed = currentStep > item.step;
                return (
                  <div 
                    key={item.step}
                    onClick={() => {
                      if (item.step < currentStep || item.step === currentStep) {
                        setCurrentStep(item.step);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      cursor: item.step <= currentStep ? 'pointer' : 'default',
                      background: isActive ? 'var(--dew)' : 'transparent',
                      border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 800,
                      backgroundColor: isPassed ? 'var(--fern)' : (isActive ? 'var(--moss)' : 'var(--mist)'),
                      color: isPassed || isActive ? '#ffffff' : 'var(--stone)'
                    }}>
                      {isPassed ? '✓' : item.step}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: isActive ? 800 : 600, color: isActive ? 'var(--moss)' : 'var(--text)' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--stone)' }}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ========================================================
              KOLOM TENGAH: KONTEN STEP AKTIF
             ======================================================== */}
          <div className="stepper-main-content">
            
            {/* ---------------- STEP 1: SUMBER DATA ---------------- */}
            {currentStep === 1 && (
              <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                  Langkah 1: Masukkan Sumber Data Spreadsheet
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--stone)', marginBottom: '20px' }}>
                  Sistem mendukung format <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong>, SPSS <strong>.sav</strong>, dan Stata <strong>.dta</strong>. File diverifikasi berdasarkan tanda tangan biner (Magic Bytes) untuk keamanan.
                </p>

                {/* Tab Pilihan Upload vs Link */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  <button
                    className={`btn ${sourceType === 'upload' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ flex: 1, minHeight: '44px' }}
                    onClick={() => setSourceType('upload')}
                  >
                    <UploadCloud size={18} style={{ marginRight: '8px' }} />
                    Unggah File Lokal (.xlsx, .csv, .sav, .dta)
                  </button>
                  <button
                    className={`btn ${sourceType === 'link' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ flex: 1, minHeight: '44px' }}
                    onClick={() => setSourceType('link')}
                  >
                    <Link2 size={18} style={{ marginRight: '8px' }} />
                    Link Google Sheets
                  </button>
                </div>

                {/* Opsi Upload File */}
                {sourceType === 'upload' && (
                  <div>
                    <label 
                      htmlFor="regression-file-input"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px 20px',
                        border: '2px dashed var(--sage)',
                        borderRadius: '16px',
                        background: 'var(--dew)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s'
                      }}
                    >
                      <FileSpreadsheet size={48} color="var(--fern)" style={{ marginBottom: '12px' }} />
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--moss)' }}>
                        Pilih file Excel, CSV, SPSS (.sav), atau Stata (.dta)
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--stone)', marginTop: '4px' }}>
                        Maksimal ukuran file: 10 MB (.xlsx, .xls, .csv, .sav, .dta). Makro (.xlsm) ditolak.
                      </span>
                      <input 
                        id="regression-file-input"
                        type="file" 
                        accept=".xlsx,.xls,.csv,.sav,.dta"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                )}

                {/* Opsi Link Google Sheets */}
                {sourceType === 'link' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                      URL Google Sheets (Akses Publik / Anyone with link)
                    </label>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                      <input
                        type="url"
                        className="form-control"
                        placeholder="https://docs.google.com/spreadsheets/d/ID_SPREADSHEET/edit"
                        value={googleSheetsUrl}
                        onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                        style={{ flex: 1, minHeight: '44px', fontSize: '16px' }}
                      />
                      <button 
                        className="btn btn-primary"
                        onClick={handleGoogleSheetsImport}
                        disabled={isLoading}
                        style={{ minHeight: '44px', padding: '0 20px' }}
                      >
                        {isLoading ? 'Mengunduh...' : 'Impor Data'}
                      </button>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--stone)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                      <Info size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>
                        URL harus berasal dari <code>docs.google.com</code> dengan izin berbagi minimal &quot;Siapa saja dengan link dapat melihat&quot;. Server menerapkan timeout 15s dan proteksi anti-SSRF.
                      </span>
                    </div>
                  </div>
                )}

                {/* Tombol Dataset Sampel Demo */}
                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--stone)' }}>
                    Ingin langsung mencoba tanpa file sendiri?
                  </span>
                  <button 
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      const demoSheets = [{
                        sheetName: 'Sheet1_Penelitian',
                        rowCount: SAMPLE_DATASET.length,
                        columnCount: Object.keys(SAMPLE_DATASET[0]).length,
                        columns: Object.keys(SAMPLE_DATASET[0]),
                        previewRows: SAMPLE_DATASET.slice(0, 10),
                        allRows: SAMPLE_DATASET
                      }];
                      setFileName('sample_data_penelitian.xlsx');
                      setFileSizeBytes(14500);
                      setSheetsList(['Sheet1_Penelitian']);
                      setAvailableSheetsData(demoSheets);
                      selectSheetByName('Sheet1_Penelitian', demoSheets);
                      setCurrentStep(2);
                    }}
                    style={{ minHeight: '38px' }}
                  >
                    <Sparkles size={15} style={{ marginRight: '6px' }} />
                    Muat Dataset Sampel (N=65)
                  </button>
                </div>

                {/* Error & Warning Display */}
                {ingestionError && (
                  <div className="alert-box alert-error" style={{ marginTop: '16px' }}>
                    <XCircle size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Kesalahan Validasi:</strong> {ingestionError}
                      {ingestionWarning && <p style={{ margin: '6px 0 0 0', fontSize: '12px' }}>{ingestionWarning}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ---------------- STEP 2: PILIH SHEET ---------------- */}
            {currentStep === 2 && (
              <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                  Langkah 2: Pilih Lembar Kerja (Sheet)
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--stone)', marginBottom: '20px' }}>
                  File: <strong>{fileName}</strong> ({(fileSizeBytes / 1024).toFixed(1)} KB) memuat {sheetsList.length} lembar kerja. Pilih sheet yang akan dianalisis:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                  {sheetsList.map((sheet) => {
                    const sheetObj = availableSheetsData.find(s => s.sheetName === sheet);
                    const rowsCount = sheetObj?.allRows?.length || sheetObj?.rowCount || (selectedSheet === sheet ? allRows.length : 0);
                    return (
                      <div
                        key={sheet}
                        onClick={() => selectSheetByName(sheet)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 18px',
                          borderRadius: '12px',
                          border: selectedSheet === sheet ? '2px solid var(--fern)' : '1px solid var(--border)',
                          background: selectedSheet === sheet ? 'var(--dew)' : 'var(--surface-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <FileSpreadsheet size={20} color="var(--fern)" />
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{sheet}</div>
                            <div style={{ fontSize: '12px', color: 'var(--stone)' }}>
                              {rowsCount > 0 ? `${rowsCount} baris data terdeteksi` : 'Lembar kerja aktif'}
                            </div>
                          </div>
                        </div>
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: selectedSheet === sheet ? '5px solid var(--primary)' : '2px solid var(--border)',
                          background: 'var(--surface)'
                        }} />
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button className="btn btn-outline" onClick={() => setCurrentStep(1)} style={{ minHeight: '44px' }}>
                    <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                  </button>
                  <button className="btn btn-primary" onClick={() => setCurrentStep(3)} style={{ minHeight: '44px' }}>
                    Lanjut ke Pratinjau <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- STEP 3: PRATINJAU DATA & TIPE KOLOM ---------------- */}
            {currentStep === 3 && (
              <div className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss)', margin: 0 }}>
                    Langkah 3: Pratinjau 10 Baris Pertama & Deteksi Tipe Data
                  </h3>
                  <span style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--dew)', borderRadius: '20px', fontWeight: 700, color: 'var(--fern)' }}>
                    Total: {allRows.length} baris, {availableColumns.length} kolom
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--stone)', marginBottom: '16px' }}>
                  Sel yang diawali karakter formula (<code>=</code>, <code>+</code>, <code>-</code>, <code>@</code>) telah dinetralkan demi keamanan data.
                </p>

                {/* Ringkasan Profiling Dataset */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ background: 'var(--dew)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--stone)', fontWeight: 700 }}>Total Observasi (N)</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--moss)' }}>{datasetProfile.totalObservations}</div>
                  </div>
                  <div style={{ background: 'var(--dew)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--stone)', fontWeight: 700 }}>Total Variabel (k)</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--fern)' }}>{datasetProfile.totalVariables}</div>
                  </div>
                  <div style={{ background: 'var(--dew)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--stone)', fontWeight: 700 }}>Baris Duplikat</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: datasetProfile.duplicateCount > 0 ? '#b45309' : 'var(--fern)' }}>
                      {datasetProfile.duplicateCount} ({datasetProfile.duplicatePercent}%)
                    </div>
                  </div>
                  <div style={{ background: 'var(--dew)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--stone)', fontWeight: 700 }}>Sel Kosong (Missing)</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: datasetProfile.hasMissing ? '#b45309' : 'var(--fern)' }}>
                      {datasetProfile.totalMissingCells}
                    </div>
                  </div>
                  <div style={{ background: 'var(--dew)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--stone)', fontWeight: 700 }}>Kolom Waktu</div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: datasetProfile.dateTimeColumns.length > 0 ? '#1d4ed8' : 'var(--stone)' }}>
                      {datasetProfile.dateTimeColumns.length > 0 ? datasetProfile.dateTimeColumns.join(', ') : 'Tidak ada'}
                    </div>
                  </div>
                </div>

                {/* Tabel Pratinjau Data Semantik */}
                <div className="result-table-wrap" style={{ maxHeight: '340px', overflowY: 'auto', marginBottom: '20px' }}>
                  <table className="result-table" style={{ fontSize: '12.5px' }}>
                    <thead>
                      <tr>
                        {availableColumns.map(col => {
                          const colType = columnTypeMap[col]?.type || 'text';
                          return (
                            <th key={col} style={{ textAlign: 'left', padding: '10px 12px' }}>
                              <div>{col}</div>
                              <span style={{
                                fontSize: '10px',
                                textTransform: 'uppercase',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: colType === 'numeric' ? '#166534' : '#475569',
                                color: '#ffffff',
                                display: 'inline-block',
                                marginTop: '4px',
                                fontWeight: 700
                              }}>
                                {colType}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {allRows.slice(0, 10).map((row, rIdx) => (
                        <tr key={rIdx}>
                          {availableColumns.map(col => (
                            <td key={col} style={{ textAlign: typeof row[col] === 'number' ? 'right' : 'left', padding: '8px 12px' }}>
                              {String(sanitizeCellValue(row[col]) ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button className="btn btn-outline" onClick={() => setCurrentStep(2)} style={{ minHeight: '44px' }}>
                    <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                  </button>
                  <button className="btn btn-primary" onClick={() => setCurrentStep(4)} style={{ minHeight: '44px' }}>
                    Lanjut Pilih Variabel <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- STEP 4: PILIH VARIABEL Y & X ---------------- */}
            {currentStep === 4 && (
              <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                  Langkah 4: Tentukan Variabel Dependen (Y) dan Independen (X)
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--stone)', marginBottom: '20px' }}>
                  Variabel dependen <strong>Y wajib tepat 1</strong> dan bertipe <strong>numerik kontinu</strong>. Variabel independen <strong>X minimal 1</strong>. Model secara otomatis diklasifikasikan sebagai SLR atau MLR.
                </p>

                {/* SLR / MLR Auto Detection Badge */}
                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Klasifikasi Model:</span>
                  {xCols.length === 0 ? (
                    <span style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 800 }}>
                      Belum Ada Variabel X Terpilih (Pilih Minimal 1)
                    </span>
                  ) : xCols.length === 1 ? (
                    <span style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)', color: 'var(--info)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 800 }}>
                      Simple Linear Regression (SLR) — 1 Prediktor
                    </span>
                  ) : (
                    <span style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 800 }}>
                      Multiple Linear Regression (MLR) — {xCols.length} Prediktor
                    </span>
                  )}
                </div>

                {/* Pemilih Variabel Dependen Y */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                    Variabel Dependen (Y) — Wajib 1 Kolom Numerik Kontinu:
                  </label>
                  <select
                    className="form-control"
                    value={yCol}
                    onChange={(e) => {
                      const newY = e.target.value;
                      setYCol(newY);
                      // Invarian I5: Hapus Y dari X jika ada
                      setXCols(prev => prev.filter(c => c !== newY && availableColumns.includes(c)));
                    }}
                    style={{ minHeight: '44px', fontSize: '16px' }}
                  >
                    {availableColumns.map(col => {
                      const info = columnTypeMap[col];
                      const isNumeric = info?.type === 'numeric';
                      return (
                        <option key={col} value={col} disabled={!isNumeric}>
                          {col} ({info?.type || 'unknown'}) {!isNumeric ? '— (Tidak kontinu)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Pemilih Variabel Independen X */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--moss)', margin: 0 }}>
                      Variabel Independen (X) — Minimal 1 Kolom ({xCols.length} dipilih):
                    </label>
                    <div style={{ position: 'relative', width: '200px' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--stone)' }} />
                      <input 
                        type="text"
                        placeholder="Cari kolom..."
                        value={columnSearchQuery}
                        onChange={(e) => setColumnSearchQuery(e.target.value)}
                        style={{ paddingLeft: '30px', height: '34px', fontSize: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', maxHeight: '220px', overflowY: 'auto', padding: '4px' }}>
                    {filteredColumns.map(col => {
                      const isY = col === yCol;
                      const isSelected = xCols.includes(col);
                      const info = columnTypeMap[col];
                      return (
                        <div
                          key={col}
                          onClick={() => !isY && toggleXColumn(col)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: isSelected ? '1.5px solid var(--fern)' : '1px solid var(--border)',
                            background: isY ? 'var(--mist)' : (isSelected ? 'var(--dew)' : 'var(--surface-muted)'),
                            cursor: isY ? 'not-allowed' : 'pointer',
                            opacity: isY ? 0.5 : 1
                          }}
                        >
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            disabled={isY}
                            onChange={() => {}} // Controlled via parent onClick
                            style={{ width: '18px', height: '18px', accentColor: 'var(--fern)' }}
                          />
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {col}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--stone)' }}>
                              {isY ? 'Dipakai sebagai Y' : (info?.type || 'data')}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <button className="btn btn-outline" onClick={() => setCurrentStep(3)} style={{ minHeight: '44px' }}>
                    <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                  </button>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button 
                      className="btn btn-outline" 
                      onClick={() => setCurrentStep(5)}
                      disabled={!yCol || xCols.length === 0}
                      style={{ minHeight: '44px' }}
                    >
                      Atur Time Series &amp; &alpha; <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                    </button>
                    <button 
                      className="btn btn-primary" 
                      onClick={handleRunOLS}
                      disabled={!yCol || xCols.length === 0 || isFitting}
                      style={{ minHeight: '44px' }}
                    >
                      <Sparkles size={15} style={{ marginRight: '6px' }} />
                      {isFitting ? 'Mengestimasi...' : 'Langsung Jalankan Analisis OLS (Hasil SPSS)'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- STEP 5: KONFIGURASI & TIME SERIES ---------------- */}
            {currentStep === 5 && (
              <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                  Langkah 5: Pertanyaan Time Series & Konfigurasi Dasar
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--stone)', marginBottom: '24px' }}>
                  Atur asumsi urutan baris data, batas signifikansi $\alpha$, dan kebijakan data hilang sesuai kaidah <code>regresi-statistik-inti</code>.
                </p>

                {/* Pertanyaan Eksplisit Time Series */}
                <div style={{ padding: '18px', borderRadius: '14px', background: 'var(--dew)', border: '1px solid var(--border)', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Clock size={20} color="var(--fern)" />
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--moss)' }}>
                      Apakah data ini merupakan data Time Series (Runtun Waktu)?
                    </span>
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--stone)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    Pilihan ini menentukan aktivasi uji autokorelasi Breusch-Godfrey, uji stasioneritas (ADF & KPSS), dan remedi HAC Newey-West.
                  </p>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      className={`btn ${isTimeSeries ? 'btn-primary' : 'btn-outline'}`}
                      style={{ flex: 1, minHeight: '44px' }}
                      onClick={() => setIsTimeSeries(true)}
                    >
                      Ya, Data Time Series
                    </button>
                    <button
                      className={`btn ${!isTimeSeries ? 'btn-primary' : 'btn-outline'}`}
                      style={{ flex: 1, minHeight: '44px' }}
                      onClick={() => setIsTimeSeries(false)}
                    >
                      Tidak, Data Cross-Section
                    </button>
                  </div>

                  {/* Pengaturan Tambahan & Panduan Kaidah Statistika jika Time Series */}
                  {isTimeSeries && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>
                            Kolom Penunjuk Waktu:
                          </label>
                          <select 
                            className="form-control"
                            value={timeCol}
                            onChange={(e) => setTimeCol(e.target.value)}
                            style={{ minHeight: '40px', fontSize: '15px' }}
                          >
                            {availableColumns.map(col => (
                              <option key={col} value={col} disabled={col === yCol || xCols.includes(col)}>
                                {col} {col === yCol ? '(Y)' : (xCols.includes(col) ? '(X)' : '')}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>
                            Frekuensi Data:
                          </label>
                          <select 
                            className="form-control"
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as any)}
                            style={{ minHeight: '40px', fontSize: '15px' }}
                          >
                            <option value="harian">Harian (Daily)</option>
                            <option value="mingguan">Mingguan (Weekly)</option>
                            <option value="bulanan">Bulanan (Monthly)</option>
                            <option value="kuartalan">Kuartalan (Quarterly)</option>
                            <option value="tahunan">Tahunan (Yearly)</option>
                            <option value="tidak_beraturan">Tidak Beraturan</option>
                          </select>
                        </div>
                      </div>

                      {/* Kaidah Statistika Wajib Time Series */}
                      <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--surface-sunken)', border: '1px solid var(--border)', fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.55 }}>
                        <div style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '6px' }}>
                          ✅ Kaidah Statistika Wajib Data Time Series (Otomatis Diterapkan Sistem):
                        </div>
                        <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <li><strong>Pengurutan Kronologis (t = 1..T):</strong> Data wajib berurut waktu agar perhitungan selisih dan lag valid.</li>
                          <li><strong>Uji Stasioneritas (ADF &amp; KPSS):</strong> Mengecek akar unit (unit root I(1)). Jika tidak stasioner, gunakan tombol <strong>First-Difference (&Delta;Y, &Delta;X)</strong> di menu Remedial.</li>
                          <li><strong>Deteksi Regresi Lancung (Spurious Regression Granger-Newbold):</strong> Mengecek kondisi bahaya R&sup2; &gt; Durbin-Watson serta kointegrasi residual Engle-Granger.</li>
                          <li><strong>Uji Autokorelasi Serial:</strong> Menguji Durbin-Watson, Breusch-Godfrey LM (serial correlation orde-p), Ljung-Box Q, dan plot ACF/PACF.</li>
                          <li><strong>Uji Efek ARCH (Engle ARCH-LM):</strong> Mendeteksi pengelompokan volatilitas (heteroskedastisitas bersyarat) pada residual runtun waktu.</li>
                          <li><strong>Perbaikan Time Series Sah:</strong> Tersedia koreksi <strong>Cochrane-Orcutt / Prais-Winsten AR(1)</strong>, <strong>Galat Baku HAC Newey-West</strong>, dan <strong>First-Difference</strong> pada halaman hasil.</li>
                        </ol>
                      </div>
                    </div>
                  )}

                  {!isTimeSeries && (
                    <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--stone)' }}>
                      ℹ️ <em>Catatan: Baris data dianggap independen. Uji Durbin-Watson hanya ditampilkan sebagai pelengkap deskriptif bergaya SPSS.</em>
                    </div>
                  )}
                </div>

                {/* Konfigurasi Alpha & Missing Policy */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                      Tingkat Signifikansi (&alpha;):
                    </label>
                    <select
                      className="form-control"
                      value={alpha}
                      onChange={(e) => setAlpha(parseFloat(e.target.value))}
                      style={{ minHeight: '44px', fontSize: '16px' }}
                    >
                      <option value={0.05}>0.05 (Default - Tingkat Keyakinan 95%)</option>
                      <option value={0.01}>0.01 (Konservatif - Tingkat Keyakinan 99%)</option>
                      <option value={0.10}>0.10 (Eksploratori - Tingkat Keyakinan 90%)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                      Penanganan Data Hilang (Missing Data):
                    </label>
                    <select
                      className="form-control"
                      value={missingPolicy}
                      onChange={(e) => setMissingPolicy(e.target.value as any)}
                      style={{ minHeight: '44px', fontSize: '16px' }}
                    >
                      <option value="listwise">Listwise Deletion (Default SPSS)</option>
                      <option value="impute_mean">Imputasi Rata-rata (Mean)</option>
                      <option value="impute_median">Imputasi Median</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <button className="btn btn-outline" onClick={() => setCurrentStep(4)} style={{ minHeight: '44px' }}>
                    <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                  </button>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline" onClick={triggerValidation} style={{ minHeight: '44px' }}>
                      Cek Ringkasan Validasi <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                    </button>
                    <button className="btn btn-primary" onClick={handleRunOLS} disabled={isFitting} style={{ minHeight: '44px' }}>
                      <Sparkles size={15} style={{ marginRight: '6px' }} />
                      {isFitting ? 'Mengestimasi...' : 'Jalankan Analisis OLS (Hasil SPSS)'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- STEP 6: RINGKASAN & VALIDASI ---------------- */}
            {currentStep === 6 && validationSummary && (
              <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                  Langkah 6: Ringkasan Validasi Konfigurasi Regresi
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--stone)', marginBottom: '16px' }}>
                  Pemeriksaan invarian sistem (I1, I2, I3, I5, I6), kecukupan ukuran sampel menurut Green (1991), statistik deskriptif 8 parameter, dan matriks korelasi.
                </p>

                {/* Sub-Tab Navigasi Step 6 */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${step6SubTab === 'validation' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setStep6SubTab('validation')}
                    style={{ minHeight: '38px', fontSize: '12px' }}
                  >
                    <CheckCircle2 size={14} style={{ marginRight: '5px' }} />
                    Validasi Invarian & Green (1991)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${step6SubTab === 'descriptives' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setStep6SubTab('descriptives')}
                    style={{ minHeight: '38px', fontSize: '12px' }}
                  >
                    <FileText size={14} style={{ marginRight: '5px' }} />
                    Statistik Deskriptif (8 Parameter)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${step6SubTab === 'correlation' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setStep6SubTab('correlation')}
                    style={{ minHeight: '38px', fontSize: '12px' }}
                  >
                    <Activity size={14} style={{ marginRight: '5px' }} />
                    Matriks Korelasi
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${step6SubTab === 'charts' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setStep6SubTab('charts')}
                    style={{ minHeight: '38px', fontSize: '12px' }}
                  >
                    <Sliders size={14} style={{ marginRight: '5px' }} />
                    Visualisasi & Boxplot
                  </button>
                </div>

                {/* Sub-Tab 1: Validasi Invarian & Green */}
                {step6SubTab === 'validation' && (
                  <div>
                    {/* Status Validasi Utama */}
                    <div style={{
                      padding: '16px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '20px',
                      background: validationSummary.isValid ? 'var(--success-bg)' : 'var(--danger-bg)',
                      border: validationSummary.isValid ? '1px solid var(--success-border)' : '1px solid var(--danger-border)'
                    }}>
                      {validationSummary.isValid ? (
                        <CheckCircle2 size={24} color="var(--success)" />
                      ) : (
                        <XCircle size={24} color="var(--danger)" />
                      )}
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: validationSummary.isValid ? 'var(--success)' : 'var(--danger)' }}>
                          {validationSummary.isValid ? 'Konfigurasi Memenuhi Syarat Estimasi Regresi OLS' : 'Konfigurasi Mengandung Kesalahan (Harus Diperbaiki)'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {validationSummary.isValid ? 'Semua asumsi minimal terpenuhi. Siap dieksekusi oleh mesin statistik.' : 'Tinjau daftar kesalahan di bawah sebelum melanjutkan.'}
                        </div>
                      </div>
                    </div>

                    {/* Ringkasan Parameter */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                      <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--dew)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--stone)', fontWeight: 700 }}>Tipe Model</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--fern)' }}>{validationSummary.modelType}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text)' }}>k = {validationSummary.kPredictors} prediktor</div>
                      </div>

                      <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--dew)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--stone)', fontWeight: 700 }}>Sampel Terpakai (N)</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--moss)' }}>{validationSummary.sampleSize.nUsed}</div>
                        <div style={{ fontSize: '11px', color: 'var(--stone)' }}>dari {validationSummary.sampleSize.nInitial} baris</div>
                      </div>

                      <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--dew)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--stone)', fontWeight: 700 }}>Missing Data</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: validationSummary.sampleSize.pctMissing > 20 ? '#d97706' : 'var(--text)' }}>
                          {validationSummary.sampleSize.pctMissing}%
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--stone)' }}>{validationSummary.sampleSize.rowsDropped} baris terbuang</div>
                      </div>

                      <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--dew)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--stone)', fontWeight: 700 }}>Signifikansi (&alpha;)</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--fern)' }}>{validationSummary.alpha}</div>
                        <div style={{ fontSize: '11px', color: 'var(--stone)' }}>Keyakinan {(1 - validationSummary.alpha) * 100}%</div>
                      </div>
                    </div>

                    {/* Pesan Kesalahan (Blocking) */}
                    {validationSummary.errors.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <h5 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--danger)', marginBottom: '6px' }}>
                          Kesalahan yang Memblokir ({validationSummary.errors.length}):
                        </h5>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--danger)' }}>
                          {validationSummary.errors.map((err, idx) => (
                            <li key={idx} style={{ marginBottom: '4px' }}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Pesan Peringatan (Non-blocking) */}
                    {validationSummary.warnings.length > 0 && (
                      <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '10px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <AlertTriangle size={16} color="var(--warn)" />
                          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--warn)' }}>
                            Catatan & Peringatan Metodologis ({validationSummary.warnings.length}):
                          </span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                          {validationSummary.warnings.map((warn, idx) => (
                            <li key={idx} style={{ marginBottom: '4px' }}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-Tab 2: Statistik Deskriptif (8 Parameter SPSS) */}
                {step6SubTab === 'descriptives' && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                      Tabel Statistik Deskriptif (Standar SPSS)
                    </h4>
                    <p style={{ fontSize: '12.5px', color: 'var(--stone)', marginBottom: '12px' }}>
                      Menampilkan 8 parameter statistik: N, Min, Max, Mean, Variance, Std. Deviation, Skewness (G1), dan Kurtosis (G2).
                    </p>
                    <div className="result-table-wrap" style={{ overflowX: 'auto' }}>
                      <table className="result-table" style={{ fontSize: '12px', width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '8px 10px' }}>Variabel</th>
                            <th style={{ textAlign: 'right', padding: '8px 10px' }}>N</th>
                            <th style={{ textAlign: 'right', padding: '8px 10px' }}>Min</th>
                            <th style={{ textAlign: 'right', padding: '8px 10px' }}>Max</th>
                            <th style={{ textAlign: 'right', padding: '8px 10px' }}>Mean</th>
                            <th style={{ textAlign: 'right', padding: '8px 10px' }}>Std. Dev</th>
                            <th style={{ textAlign: 'right', padding: '8px 10px' }}>Variance</th>
                            <th style={{ textAlign: 'right', padding: '8px 10px' }}>Skewness</th>
                            <th style={{ textAlign: 'right', padding: '8px 10px' }}>Kurtosis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {descriptiveStats.map(s => (
                            <tr key={s.variable} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700 }}>{s.variable}</td>
                              <td style={{ textAlign: 'right', padding: '8px 10px' }}>{s.n}</td>
                              <td style={{ textAlign: 'right', padding: '8px 10px' }}>{s.min}</td>
                              <td style={{ textAlign: 'right', padding: '8px 10px' }}>{s.max}</td>
                              <td style={{ textAlign: 'right', padding: '8px 10px' }}>{s.mean}</td>
                              <td style={{ textAlign: 'right', padding: '8px 10px' }}>{s.stdDev}</td>
                              <td style={{ textAlign: 'right', padding: '8px 10px' }}>{s.variance}</td>
                              <td style={{ textAlign: 'right', padding: '8px 10px' }}>{s.skewness}</td>
                              <td style={{ textAlign: 'right', padding: '8px 10px' }}>{s.kurtosis}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sub-Tab 3: Matriks Korelasi */}
                {step6SubTab === 'correlation' && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                      Matriks Korelasi (Pearson & Spearman)
                    </h4>
                    <p style={{ fontSize: '12.5px', color: 'var(--stone)', marginBottom: '12px' }}>
                      Koefisien korelasi linier (Pearson) dan peringkat monoton (Spearman) antar pasangan variabel terpilih.
                    </p>
                    {correlationData ? (
                      <div className="result-table-wrap" style={{ overflowX: 'auto' }}>
                        <table className="result-table" style={{ fontSize: '12px', width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                              <th style={{ textAlign: 'left', padding: '8px 10px' }}>Variabel</th>
                              {correlationData.variables.map(v => (
                                <th key={v} style={{ textAlign: 'right', padding: '8px 10px' }}>{v}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {correlationData.variables.map(v1 => (
                              <tr key={v1} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700 }}>
                                  {v1}
                                  <div style={{ fontSize: '10px', color: 'var(--stone)' }}>Pearson / Spearman</div>
                                </td>
                                {correlationData.variables.map(v2 => {
                                  const rP = correlationData.pearson[v1]?.[v2] ?? 0;
                                  const rS = correlationData.spearman[v1]?.[v2] ?? 0;
                                  return (
                                    <td key={v2} style={{ textAlign: 'right', padding: '8px 10px' }}>
                                      <div style={{ fontWeight: 700, color: 'var(--fern)' }}>{rP.toFixed(4)}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--stone)' }}>&rho; = {rS.toFixed(4)}</div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--stone)' }}>
                        Pilih minimal 1 variabel independen (X) untuk menghitung korelasi.
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-Tab 4: Visualisasi Grafik & Boxplot */}
                {step6SubTab === 'charts' && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                      Visualisasi Distribusi & Ringkasan 5 Angka (Boxplot)
                    </h4>
                    {visualChartData ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* Boxplot Card */}
                        <div style={{ background: 'var(--dew)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                          <h5 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                            Boxplot Ringkasan 5 Angka ({yCol})
                          </h5>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                            <div>Minimum: <strong>{visualChartData.boxplot.min}</strong></div>
                            <div>Kuartil 1 (Q1): <strong>{visualChartData.boxplot.q1}</strong></div>
                            <div>Median (Q2): <strong>{visualChartData.boxplot.median}</strong></div>
                            <div>Kuartil 3 (Q3): <strong>{visualChartData.boxplot.q3}</strong></div>
                            <div>Maksimum: <strong>{visualChartData.boxplot.max}</strong></div>
                            <div>IQR: <strong>{visualChartData.boxplot.iqr}</strong></div>
                          </div>
                          {visualChartData.boxplot.outliers.length > 0 ? (
                            <div style={{ marginTop: '8px', fontSize: '11px', color: '#b45309' }}>
                              Terdeteksi {visualChartData.boxplot.outliers.length} potensi outlier (&gt;1.5 IQR).
                            </div>
                          ) : (
                            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--fern)' }}>
                              Tidak ada outlier ekstrem di luar pagar IQR.
                            </div>
                          )}
                        </div>

                        {/* Histogram Frequency Card */}
                        <div style={{ background: 'var(--dew)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                          <h5 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                            Frekuensi Histogram ({yCol})
                          </h5>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>
                            {visualChartData.histogram.map((bin, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                                <span style={{ width: '90px', color: 'var(--stone)' }}>{bin.binStart} s/d {bin.binEnd}</span>
                                <div style={{ flex: 1, background: 'var(--surface)', height: '12px', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(100, bin.count * 15)}%`, background: 'var(--fern)', height: '100%' }} />
                                </div>
                                <span style={{ width: '30px', textAlign: 'right', fontWeight: 700 }}>{bin.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--stone)' }}>Pilih variabel dependen Y terlebih dahulu.</div>
                    )}
                  </div>
                )}

                {/* Catatan Time Series */}
                {validationSummary.timeSeriesSummary && (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--dew)', fontSize: '12.5px', color: 'var(--moss)', marginBottom: '24px' }}>
                    <strong>Struktur Waktu:</strong> {validationSummary.timeSeriesSummary.notice}
                  </div>
                )}

                {/* Pesan Kesalahan Komputasi (Jika ada) */}
                {fitError && (
                  <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '13px' }}>
                    <strong>Kesalahan Komputasi:</strong> {fitError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                  <button className="btn btn-outline" onClick={() => setCurrentStep(5)} style={{ minHeight: '44px' }}>
                    <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Ubah Konfigurasi
                  </button>
                  <button 
                    className="btn btn-primary"
                    disabled={!validationSummary.isValid || isFitting}
                    onClick={handleRunOLS}
                    style={{ minHeight: '44px' }}
                  >
                    {isFitting ? 'Sedang Mengestimasi OLS...' : 'Jalankan Analisis OLS (Hasil SPSS)'} <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- STEP 7: HASIL ANALISIS GAYA SPSS ---------------- */}
            {currentStep === 7 && fitResult && (
              <RegressionResultsView
                result={fitResult}
                onBackToConfig={() => setCurrentStep(5)}
                onReRun={handleRunOLS}
                allRows={allRows}
                yCol={yCol}
                xCols={xCols}
                isTimeSeries={isTimeSeries}
                timeCol={timeCol}
                frequency={frequency}
                alpha={alpha}
                fileName={fileName}
                selectedSheet={selectedSheet}
              />
            )}

          </div>

          {/* ========================================================
              KOLOM KANAN: RINGKASAN KONFIGURASI DINAMIS (DESKTOP)
             ======================================================== */}
          <div className="card dynamic-summary-panel" style={{ padding: '16px', position: 'sticky', top: '20px' }}>
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--stone)', marginBottom: '14px', fontWeight: 800 }}>
              Ringkasan Live
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12.5px' }}>
              <div>
                <span style={{ color: 'var(--stone)', display: 'block', fontSize: '11px' }}>File Dataset:</span>
                <strong style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{fileName}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--stone)', display: 'block', fontSize: '11px' }}>Sheet Terpilih:</span>
                <strong style={{ color: 'var(--fern)' }}>{selectedSheet}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--stone)', display: 'block', fontSize: '11px' }}>Variabel Dependen (Y):</span>
                <strong style={{ color: 'var(--moss)' }}>{yCol || 'Belum dipilih'}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--stone)', display: 'block', fontSize: '11px' }}>Variabel Independen (X):</span>
                {xCols.length === 0 ? (
                  <span style={{ color: '#ef4444' }}>Belum dipilih</span>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                    {xCols.map(x => (
                      <span key={x} style={{ background: 'var(--dew)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: '1px solid var(--border)' }}>
                        {x}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span style={{ color: 'var(--stone)', display: 'block', fontSize: '11px' }}>Tipe Model:</span>
                <strong>{xCols.length === 0 ? 'Belum Ada X' : xCols.length === 1 ? 'SLR (Simple)' : `MLR (${xCols.length} Prediktor)`}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--stone)', display: 'block', fontSize: '11px' }}>Struktur Waktu:</span>
                <strong>{isTimeSeries ? `Time Series (${frequency})` : 'Cross-Section'}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--stone)', display: 'block', fontSize: '11px' }}>Level Signifikansi (&alpha;):</span>
                <strong>{alpha}</strong>
              </div>

              {yCol && xCols.length > 0 && currentStep < 7 && (
                <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleRunOLS}
                    disabled={isFitting}
                    style={{ width: '100%', minHeight: '42px', fontSize: '12.5px', justifyContent: 'center' }}
                  >
                    <Sparkles size={14} style={{ marginRight: '6px' }} />
                    {isFitting ? 'Mengestimasi...' : 'Jalankan Analisis OLS Sekarang'}
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Modal Struktur Arsitektur 15 Modul & 12 Langkah Workflow */}
      {showInternalStructure && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => setShowInternalStructure(false)}
        >
          <div 
            style={{
              background: 'var(--surface)',
              border: '1.5px solid var(--border)',
              borderRadius: '16px',
              maxWidth: '780px',
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss)', margin: 0 }}>
                  Struktur Arsitektur 15 Modul & Workflow Tahap 1
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--stone)', margin: '4px 0 0 0' }}>
                  Fondasi sistem Analisis Regresi Statistik OLS (Cross-Section & Time Series)
                </p>
              </div>
              <button 
                type="button" 
                className="btn btn-outline btn-sm"
                onClick={() => setShowInternalStructure(false)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                Tutup
              </button>
            </div>

            {/* 15 Modul Internal */}
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--fern)', fontWeight: 800, marginBottom: '8px' }}>
              A. 15 Bagian Struktur Internal
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', marginBottom: '24px' }}>
              {INTERNAL_MENU_STRUCTURE.map(m => (
                <div key={m.id} style={{ background: 'var(--dew)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>{m.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--stone)', marginTop: '2px' }}>{m.desc}</div>
                </div>
              ))}
            </div>

            {/* 12 Langkah Workflow */}
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--fern)', fontWeight: 800, marginBottom: '8px' }}>
              B. 12 Langkah Next Step Workflow
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {DEFAULT_WORKFLOW_STEPS.map(step => {
                const isPassed = currentStep > step.id;
                const isActive = currentStep === step.id;
                return (
                  <div 
                    key={step.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: isActive ? 'var(--dew)' : 'transparent',
                      border: isActive ? '1px solid var(--border)' : '1px solid transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: isPassed ? 'var(--fern)' : (isActive ? 'var(--moss)' : 'var(--mist)'),
                        color: isPassed || isActive ? '#ffffff' : 'var(--stone)'
                      }}>
                        {isPassed ? '✓' : step.id}
                      </span>
                      <div>
                        <span style={{ fontSize: '12.5px', fontWeight: isActive ? 800 : 600, color: 'var(--text)' }}>
                          {step.title}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--stone)', marginLeft: '8px' }}>
                          — {step.description}
                        </span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '10.5px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 700,
                      background: isPassed ? 'var(--success-bg)' : (isActive ? 'var(--info-bg)' : 'var(--mist)'),
                      color: isPassed ? 'var(--success)' : (isActive ? 'var(--info)' : 'var(--stone)')
                    }}>
                      {isPassed ? 'Completed' : (isActive ? 'Active' : 'Pending')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
