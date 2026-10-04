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
  UserCheck
} from 'lucide-react';
import { inspectColumn, validateRegressionConfig, ValidationSummary } from '@/lib/regression-validator';
import { RegressionResultsView } from './RegressionResultsView';
import { OLSFitResult } from '@/lib/regression-engine';
import { sanitizeCellValue } from '@/lib/file-signature';

interface RegressionTabProps {
  onNavigateHome?: () => void;
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
      const res = await fetch('/api/engine/fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: allRows,
          yCol,
          xCols,
          isTimeSeries,
          timeCol: isTimeSeries ? timeCol : undefined,
          frequency,
          alpha,
          missingPolicy
        })
      });

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || 'Gagal mengeksekusi estimasi OLS.');
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
      <div className="regression-banner card" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
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
                  Sistem mendukung format <strong>.xlsx</strong>, <strong>.xls</strong>, dan <strong>.csv</strong>. File diverifikasi berdasarkan tanda tangan biner (Magic Bytes) untuk keamanan.
                </p>

                {/* Tab Pilihan Upload vs Link */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  <button
                    className={`btn ${sourceType === 'upload' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ flex: 1, minHeight: '44px' }}
                    onClick={() => setSourceType('upload')}
                  >
                    <UploadCloud size={18} style={{ marginRight: '8px' }} />
                    Unggah File Lokal
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
                        Pilih file Excel / CSV dari perangkat Anda
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--stone)', marginTop: '4px' }}>
                        Maksimal ukuran file: 10 MB (.xlsx, .xls, .csv). Makro (.xlsm) ditolak.
                      </span>
                      <input 
                        id="regression-file-input"
                        type="file" 
                        accept=".xlsx,.xls,.csv"
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
                          background: selectedSheet === sheet ? 'var(--dew)' : '#ffffff',
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
                          border: selectedSheet === sheet ? '5px solid var(--fern)' : '2px solid var(--border)',
                          background: '#ffffff'
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
                    <span style={{ background: '#fef2f2', color: '#991b1b', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 800 }}>
                      Belum Ada Variabel X Terpilih (Pilih Minimal 1)
                    </span>
                  ) : xCols.length === 1 ? (
                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 800 }}>
                      Simple Linear Regression (SLR) — 1 Prediktor
                    </span>
                  ) : (
                    <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 800 }}>
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
                        style={{ paddingLeft: '30px', height: '34px', fontSize: '12px', borderRadius: '8px', border: '1px solid var(--border)', width: '100%' }}
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
                            background: isY ? 'var(--mist)' : (isSelected ? 'var(--dew)' : '#ffffff'),
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

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button className="btn btn-outline" onClick={() => setCurrentStep(3)} style={{ minHeight: '44px' }}>
                    <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => setCurrentStep(5)}
                    disabled={!yCol || xCols.length === 0}
                    style={{ minHeight: '44px' }}
                  >
                    Lanjut ke Konfigurasi <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                  </button>
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

                  {/* Pengaturan Tambahan jika Time Series */}
                  {isTimeSeries && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
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

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button className="btn btn-outline" onClick={() => setCurrentStep(4)} style={{ minHeight: '44px' }}>
                    <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Kembali
                  </button>
                  <button className="btn btn-primary" onClick={triggerValidation} style={{ minHeight: '44px' }}>
                    Validasi & Buat Ringkasan <ArrowRight size={16} style={{ marginLeft: '6px' }} />
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- STEP 6: RINGKASAN & VALIDASI ---------------- */}
            {currentStep === 6 && validationSummary && (
              <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px' }}>
                  Langkah 6: Ringkasan Validasi Konfigurasi Regresi
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--stone)', marginBottom: '20px' }}>
                  Pemeriksaan invarian sistem (I1, I2, I3, I5, I6) dan kecukupan ukuran sampel menurut Green (1991).
                </p>

                {/* Status Validasi Utama */}
                <div style={{
                  padding: '16px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '20px',
                  background: validationSummary.isValid ? '#dcfce7' : '#fee2e2',
                  border: validationSummary.isValid ? '1px solid #86efac' : '1px solid #fca5a5'
                }}>
                  {validationSummary.isValid ? (
                    <CheckCircle2 size={24} color="#166534" />
                  ) : (
                    <XCircle size={24} color="#991b1b" />
                  )}
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: validationSummary.isValid ? '#166534' : '#991b1b' }}>
                      {validationSummary.isValid ? 'Konfigurasi Memenuhi Syarat Estimasi Regresi OLS' : 'Konfigurasi Mengandung Kesalahan (Harus Diperbaiki)'}
                    </div>
                    <div style={{ fontSize: '12px', color: validationSummary.isValid ? '#14532d' : '#7f1d1d' }}>
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
                    <h5 style={{ fontSize: '13px', fontWeight: 800, color: '#991b1b', marginBottom: '6px' }}>
                      Kesalahan yang Memblokir ({validationSummary.errors.length}):
                    </h5>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#7f1d1d' }}>
                      {validationSummary.errors.map((err, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Pesan Peringatan (Non-blocking) */}
                {validationSummary.warnings.length > 0 && (
                  <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '10px', background: '#fef8ec', border: '1px solid #f0cc7a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <AlertTriangle size={16} color="#b45309" />
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#92400e' }}>
                        Catatan & Peringatan Metodologis ({validationSummary.warnings.length}):
                      </span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12.5px', color: '#78350f' }}>
                      {validationSummary.warnings.map((warn, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{warn}</li>
                      ))}
                    </ul>
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
                  <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', fontSize: '13px' }}>
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
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
