'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, Sparkles, RefreshCw, ArrowRight, Copy, Check, Eye, Download, X } from 'lucide-react';
import { CEDScores, INDICATOR_KEYS, CEDResultRecord } from '@/lib/types';

interface UploadTabProps {
  onSuccessAnalysis: () => void;
  onNavigateToResults: () => void;
}

export const UploadTab: React.FC<UploadTabProps> = ({ onSuccessAnalysis, onNavigateToResults }) => {
  const [companyCode, setCompanyCode] = useState('');
  const [fiscalYear, setFiscalYear] = useState('FY 2024');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Status Ekstraksi PDF ke TXT
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<{
    text: string;
    pageCount: number;
    totalCharacters: number;
    isScanned: boolean;
    fileName: string;
  } | null>(null);

  // Status Modal Preview TXT
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [copiedTxt, setCopiedTxt] = useState(false);

  // Status Analisis AI
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error' | 'warn' | 'info'; message: string } | null>(null);

  const [copiedType, setCopiedType] = useState<'scores_only' | 'scores_total' | 'full_row' | null>(null);

  const [scoreResult, setScoreResult] = useState<{
    code: string;
    year: string;
    scores: CEDScores;
    totalScore: number;
    disclosureLevel: string;
    modelUsed: string;
    extraction?: { page_count: number; total_characters: number; is_scanned: boolean };
    savedInDb: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setAlertInfo({ type: 'error', message: 'Hanya file format PDF yang didukung.' });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setAlertInfo({ type: 'error', message: 'Ukuran file melebihi 25 MB.' });
      return;
    }

    setSelectedFile(file);
    setExtractedData(null);
    setScoreResult(null);
    setAlertInfo({
      type: 'info',
      message: `File dipilih: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB). Silakan klik tombol "📄 1. Ubah PDF ke TXT" di bawah.`
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Ekstraksi PDF langsung di browser (Bebas limit upload 4.5 MB)
  const extractPdfInBrowser = async (
    file: File,
    onProgressUpdate?: (percent: number, label: string) => void
  ): Promise<{ text: string; pageCount: number; totalCharacters: number; isScanned: boolean }> => {
    if (typeof window === 'undefined') {
      throw new Error('Ekstraksi browser hanya dapat berjalan di client.');
    }

    if (!(window as any).pdfjsLib) {
      if (onProgressUpdate) onProgressUpdate(15, 'Menyiapkan modul pembaca PDF di browser...');
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve();
        };
        script.onerror = () => reject(new Error('Gagal memuat engine PDF browser.'));
        document.head.appendChild(script);
      });
    }

    if (onProgressUpdate) onProgressUpdate(30, 'Membaca dokumen PDF lokal...');
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = (window as any).pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    let fullText = '';

    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageStrings = textContent.items.map((item: any) => item.str).join(' ');
        if (pageStrings && pageStrings.trim().length > 0) {
          fullText += `--- HALAMAN ${i} ---\n${pageStrings.trim()}\n\n`;
        }
      } catch (pageErr) {
        console.warn(`Gagal membaca halaman ${i}:`, pageErr);
      }

      if (onProgressUpdate) {
        const pct = Math.min(95, 30 + Math.round((i / numPages) * 65));
        onProgressUpdate(pct, `Membaca halaman ${i} dari ${numPages}...`);
      }
    }

    const cleanText = fullText.trim();
    return {
      text: cleanText,
      pageCount: numPages,
      totalCharacters: cleanText.length,
      isScanned: cleanText.length < 50
    };
  };

  // LANGKAH 1: Ekstraksi PDF ke TXT
  const handleExtractToTxt = async () => {
    if (!selectedFile) {
      setAlertInfo({ type: 'warn', message: 'Pilih file PDF terlebih dahulu.' });
      return;
    }

    setIsExtracting(true);
    setAlertInfo(null);
    setProgress(10);
    setProgressLabel('Mengekstrak teks PDF langsung di browser...');

    try {
      // 1. Coba ekstraksi client-side (Cepat, aman tanpa limit upload 4.5 MB)
      let extracted: { text: string; pageCount: number; totalCharacters: number; isScanned: boolean };
      try {
        extracted = await extractPdfInBrowser(selectedFile, (pct, lbl) => {
          setProgress(pct);
          setProgressLabel(lbl);
        });
      } catch (clientErr) {
        console.warn('[Client Extract Error, mencoba server fallback]:', clientErr);
        // Fallback ke server jika PDF < 4.2 MB
        if (selectedFile.size > 4.2 * 1024 * 1024) {
          throw new Error('File PDF terlalu besar (> 4.5 MB) untuk diproses di server. Silakan pastikan koneksi internet stabil.');
        }

        const formData = new FormData();
        formData.append('file', selectedFile);
        const res = await fetch('/api/extract', { method: 'POST', body: formData });
        const raw = await res.text();
        let json: any;
        try {
          json = JSON.parse(raw);
        } catch {
          throw new Error(res.status === 413 ? 'Ukuran file melebihi batas 4.5 MB.' : `Server Error: ${raw.slice(0, 100)}`);
        }
        if (!res.ok || !json.success) throw new Error(json.error || 'Gagal mengekstrak PDF.');
        extracted = {
          text: json.data.text || '',
          pageCount: json.data.pageCount || 1,
          totalCharacters: json.data.totalCharacters || 0,
          isScanned: json.data.isScanned || false
        };
      }

      setExtractedData({
        text: extracted.text,
        pageCount: extracted.pageCount,
        totalCharacters: extracted.totalCharacters,
        isScanned: extracted.isScanned,
        fileName: selectedFile.name
      });

      if (extracted.totalCharacters < 50) {
        setAlertInfo({
          type: 'info',
          message: `📄 PDF ini berisi ${extracted.pageCount} Halaman dengan format grafis/vektor layer. Mode Google Gemini Multimodal Vision aktif dan siap membaca seluruh halaman secara visual. Silakan klik tombol "✨ 2. Analisis dengan AI" di bawah!`
        });
      } else {
        setAlertInfo({
          type: 'success',
          message: `Ekstraksi TXT Sukses! Berhasil membaca ${extracted.pageCount} halaman (${extracted.totalCharacters.toLocaleString()} karakter). Anda dapat melihat preview teks atau langsung klik "✨ 2. Analisis dengan AI".`
        });
      }
    } catch (err: any) {
      console.error(err);
      setAlertInfo({
        type: 'error',
        message: err?.message || 'Gagal mengubah PDF ke TXT.'
      });
    } finally {
      setIsExtracting(false);
      setProgress(0);
      setProgressLabel('');
    }
  };

  // LANGKAH 2: Analisis Teks dengan Gemini AI
  const handleStartAnalysis = async () => {
    const code = companyCode.trim().toUpperCase();
    if (!code) {
      setAlertInfo({ type: 'warn', message: 'Kode emiten / perusahaan wajib diisi (contoh: AKRA, TINS, ANTM).' });
      return;
    }
    if (!fiscalYear) {
      setAlertInfo({ type: 'warn', message: 'Tahun fiskal (FY) wajib dipilih.' });
      return;
    }
    if (!selectedFile && !extractedData?.text) {
      setAlertInfo({ type: 'warn', message: 'Silakan pilih file PDF dan ubah ke TXT terlebih dahulu.' });
      return;
    }

    setIsAnalyzing(true);
    setScoreResult(null);
    setProgress(50);
    setProgressLabel('AI sedang mengidentifikasi 18 indikator CED dari teks laporan...');
    setAlertInfo(null);

    const formData = new FormData();
    formData.append('fileName', selectedFile?.name || 'document.pdf');
    formData.append('companyCode', code);
    formData.append('fiscalYear', fiscalYear);
    formData.append('notes', notes);

    // Kirim hanya teks jika teks tersedia (sangat ringan, hanya ~50 KB)
    if (extractedData?.text && extractedData.text.length >= 50) {
      formData.append('pdfText', extractedData.text);
    } else if (selectedFile) {
      if (selectedFile.size > 4.2 * 1024 * 1024) {
        setAlertInfo({
          type: 'error',
          message: `Ukuran file PDF (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas upload 4.5 MB. Silakan klik tombol "1. Ubah PDF ke TXT" terlebih dahulu agar teksnya diekstrak secara lokal.`
        });
        setIsAnalyzing(false);
        setProgress(0);
        return;
      }
      formData.append('file', selectedFile);
    }

    const storedKey = typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_key') : null;
    let storedModel = typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_model') : null;
    if (storedModel === 'gemini-2.5-flash') {
      storedModel = 'gemini-3.6-flash';
      localStorage.setItem('custom_gemini_model', 'gemini-3.6-flash');
    }
    if (storedKey) formData.append('apiKey', storedKey);
    if (storedModel) formData.append('model', storedModel);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      const raw = await res.text();
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        if (res.status === 413 || raw.includes('Request Entity Too Large')) {
          throw new Error('Ukuran payload terlalu besar (Maks 4.5 MB). Pastikan teks sudah diekstrak via Langkah 1 terlebih dahulu.');
        }
        throw new Error(`Server Error (${res.status}): ${raw.slice(0, 150)}`);
      }

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memproses analisis AI.');
      }

      setProgress(100);
      setProgressLabel('Analisis berhasil diselesaikan! 🌿');

      const data = json.data;
      const resultObj = {
        code: data.company_code,
        year: data.fiscal_year,
        scores: data.scores,
        totalScore: data.total_score,
        disclosureLevel: data.disclosure_level,
        modelUsed: data.model_used,
        extraction: data.extraction_summary,
        savedInDb: data.saved_in_supabase
      };

      setScoreResult(resultObj);

      // Simpan ke LocalStorage
      if (typeof window !== 'undefined') {
        try {
          const newRecord: CEDResultRecord = {
            id: data.id || `local_${Date.now()}`,
            company_code: data.company_code,
            fiscal_year: data.fiscal_year,
            file_name: data.file_name,
            notes: data.notes,
            status: 'completed',
            ...data.scores,
            total_score: data.total_score,
            disclosure_level: data.disclosure_level,
            model_used: data.model_used,
            created_at: data.created_at || new Date().toISOString()
          };

          const rawExisting = localStorage.getItem('analyzer_records');
          const existingList: CEDResultRecord[] = rawExisting ? JSON.parse(rawExisting) : [];
          const updatedList = [newRecord, ...existingList.filter(r => !(r.company_code === newRecord.company_code && r.fiscal_year === newRecord.fiscal_year))];
          localStorage.setItem('analyzer_records', JSON.stringify(updatedList));
        } catch (storageErr) {
          console.warn('Gagal menyimpan cache lokal:', storageErr);
        }
      }

      setAlertInfo({
        type: 'success',
        message: `Analisis untuk ${code} (${fiscalYear}) selesai! Total skor: ${data.total_score}/90. Klik tombol hijau di kanan untuk menyalin 18 angka skor.`
      });

      onSuccessAnalysis();
    } catch (err: any) {
      console.error(err);
      setProgress(100);
      setProgressLabel('Terjadi kesalahan saat analisis.');
      setAlertInfo({
        type: 'error',
        message: err?.message || 'Terjadi kesalahan sistem saat menganalisis dokumen.'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setCompanyCode('');
    setFiscalYear('FY 2024');
    setNotes('');
    setSelectedFile(null);
    setExtractedData(null);
    setScoreResult(null);
    setAlertInfo(null);
    setProgress(0);
    setProgressLabel('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 1. SALIN HANYA 18 SKOR (CC1 s/d ACC2) -> TANPA KODE & TANPA TAHUN
  const copyScoresOnly = () => {
    if (!scoreResult) return;
    const scoresTsv = INDICATOR_KEYS.map(k => scoreResult.scores[k] ?? 0).join('\t');
    navigator.clipboard.writeText(scoresTsv);
    setCopiedType('scores_only');
    setTimeout(() => setCopiedType(null), 3000);
  };

  // 2. SALIN 18 SKOR + TOTAL -> TANPA KODE & TANPA TAHUN
  const copyScoresAndTotal = () => {
    if (!scoreResult) return;
    const scoresArray = INDICATOR_KEYS.map(k => scoreResult.scores[k] ?? 0);
    const scoresTsv = [...scoresArray, scoreResult.totalScore].join('\t');
    navigator.clipboard.writeText(scoresTsv);
    setCopiedType('scores_total');
    setTimeout(() => setCopiedType(null), 3000);
  };

  // 3. SALIN BARIS LENGKAP (Code, Year, 18 Skor, Total)
  const copyFullRow = () => {
    if (!scoreResult) return;
    const scoresArray = INDICATOR_KEYS.map(k => scoreResult.scores[k] ?? 0);
    const rowTsv = [
      scoreResult.code,
      scoreResult.year,
      ...scoresArray,
      scoreResult.totalScore
    ].join('\t');

    navigator.clipboard.writeText(rowTsv);
    setCopiedType('full_row');
    setTimeout(() => setCopiedType(null), 3000);
  };

  // Download File TXT Hasil Ekstraksi
  const handleDownloadTxt = () => {
    if (!extractedData?.text) return;
    const element = document.createElement('a');
    const file = new Blob([extractedData.text], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `${companyCode || 'extract'}_${fiscalYear || 'CED'}_text.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Salin Seluruh Teks TXT
  const handleCopyFullTxt = () => {
    if (!extractedData?.text) return;
    navigator.clipboard.writeText(extractedData.text);
    setCopiedTxt(true);
    setTimeout(() => setCopiedTxt(false), 2500);
  };

  return (
    <div className="grid-2">
      {/* Form Input Dokumen */}
      <div className="card">
        <div className="card-title">
          <div className="ct-icon">📝</div>
          <span>1. Dokumen & Ekstraksi Teks (PDF ➔ TXT)</span>
        </div>

        <div className="form-group">
          <label className="form-label">Kode Emiten / Perusahaan (Ticker)</label>
          <input
            type="text"
            className="form-input font-mono"
            placeholder="Contoh: AKRA, TINS, ANTM, PTBA, ADRO"
            value={companyCode}
            onChange={e => setCompanyCode(e.target.value.toUpperCase())}
            maxLength={12}
            disabled={isAnalyzing || isExtracting}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Tahun Fiskal (Fiscal Year)</label>
          <select
            className="form-select font-mono"
            value={fiscalYear}
            onChange={e => setFiscalYear(e.target.value)}
            disabled={isAnalyzing || isExtracting}
          >
            <option value="FY 2026">FY 2026</option>
            <option value="FY 2025">FY 2025</option>
            <option value="FY 2024">FY 2024</option>
            <option value="FY 2023">FY 2023</option>
            <option value="FY 2022">FY 2022</option>
            <option value="FY 2021">FY 2021</option>
            <option value="FY 2020">FY 2020</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Catatan Tambahan (Opsional)</label>
          <textarea
            className="form-textarea"
            placeholder="Contoh: Sustainability Report 2022..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isAnalyzing || isExtracting}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Unggah Laporan PDF</label>
          <div
            className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
              disabled={isAnalyzing || isExtracting}
            />
            <div className="dz-icon-wrap">
              {selectedFile ? <FileText size={32} color="#2e6922" /> : <UploadCloud size={32} color="#687962" />}
            </div>
            <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
              {selectedFile ? selectedFile.name : 'Klik atau Tarik File PDF ke Sini'}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {selectedFile
                ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Klik "Ubah PDF ke TXT" di bawah`
                : 'Mendukung Laporan Tahunan / Keberlanjutan PDF (Maks 25 MB)'}
            </div>
          </div>
        </div>

        {/* Status Ekstraksi TXT Banner & Actions */}
        {extractedData && (
          <div style={{ background: '#f0f7ea', border: '1.5px solid var(--border)', borderRadius: '12px', padding: '14px', margin: '14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fern)', fontWeight: 800, fontSize: '13.5px', marginBottom: '6px' }}>
              <CheckCircle2 size={17} />
              <span>PDF Berhasil Diubah ke TXT! ✅</span>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--moss)', marginBottom: '10px' }}>
              Terbaca <strong>{extractedData?.pageCount || 1} Halaman</strong> ({(extractedData?.totalCharacters || 0).toLocaleString()} Karakter).
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowPreviewModal(true)}
                style={{ background: '#ffffff', borderColor: 'var(--border)' }}
              >
                <Eye size={14} />
                <span>👁️ Preview Konten TXT</span>
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={handleDownloadTxt}
                style={{ background: '#ffffff', borderColor: 'var(--border)' }}
              >
                <Download size={14} />
                <span>Unduh File .TXT</span>
              </button>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {(isExtracting || isAnalyzing) && (
          <div style={{ margin: '18px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)' }}>
              <span>{progressLabel}</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Alert Pesan */}
        {alertInfo && (
          <div className={`alert alert-${alertInfo.type}`}>
            <span>{alertInfo.type === 'success' ? '🌿' : alertInfo.type === 'error' ? '❌' : alertInfo.type === 'warn' ? '⚠️' : 'ℹ️'}</span>
            <span>{alertInfo.message}</span>
          </div>
        )}

        {/* Action Buttons: 2-Step Workflow */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
          {!extractedData ? (
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleExtractToTxt}
              disabled={isExtracting || !selectedFile}
            >
              {isExtracting ? (
                <>
                  <span className="spinner" />
                  <span>Mengekstrak PDF ke TXT...</span>
                </>
              ) : (
                <>
                  <FileText size={18} />
                  <span>1. Ubah PDF ke TXT</span>
                </>
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
              <button
                className="btn btn-accent btn-lg"
                onClick={handleStartAnalysis}
                disabled={isAnalyzing}
                style={{ flex: 2, minWidth: '220px' }}
              >
                {isAnalyzing ? (
                  <>
                    <span className="spinner" />
                    <span>AI Sedang Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>2. Analisis dengan AI {(extractedData?.totalCharacters ?? 0) < 50 ? '(Multimodal Vision)' : ''}</span>
                  </>
                )}
              </button>

              <button
                className="btn btn-outline btn-lg"
                onClick={handleExtractToTxt}
                disabled={isExtracting || isAnalyzing}
                style={{ flex: 1 }}
                title="Ekstrak ulang dokumen"
              >
                <RefreshCw size={16} />
                <span>Ubah Ulang TXT</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kolom Kanan: Hasil Skor / Preview Card */}
      {scoreResult ? (
        <div className="card">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="ct-icon">🌿</div>
              <span>Hasil Analisis CED: <strong style={{ color: 'var(--fern)' }}>{scoreResult.code} ({scoreResult.year})</strong></span>
            </div>
            <span className="font-mono" style={{ fontSize: '12px', background: 'var(--dew)', padding: '4px 10px', borderRadius: '6px', color: 'var(--moss)' }}>
              Model: {scoreResult.modelUsed}
            </span>
          </div>

          <div className="grid-3" style={{ marginBottom: '20px' }}>
            <div className="stat-box s-green">
              <div className="stat-val">{scoreResult.totalScore}</div>
              <div className="stat-lbl">Total Skor / 90</div>
            </div>
            <div className="stat-box s-teal">
              <div className="stat-val">{((scoreResult.totalScore / 90) * 100).toFixed(1)}%</div>
              <div className="stat-lbl">Indeks Pengungkapan</div>
            </div>
            <div className="stat-box s-sage">
              <div className="stat-val" style={{ fontSize: '17px', lineHeight: '1.3' }}>
                {scoreResult.disclosureLevel.split(' ')[0]}
              </div>
              <div className="stat-lbl">Level Kategori</div>
            </div>
          </div>

          {/* Quick Copy Box */}
          <div style={{ background: '#f0f7ea', border: '1.5px solid var(--border)', borderRadius: '12px', padding: '14px', marginBottom: '18px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📋</span>
              <span>Salin Cepat Nilai ke Spreadsheet (Excel / Google Sheets):</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Tombol Utama: HANYA 18 Skor (Tanpa Nama & Tanpa Tahun) */}
              <button
                className="btn btn-primary"
                onClick={copyScoresOnly}
                style={{ justifyContent: 'center', fontSize: '13px', padding: '10px 16px' }}
                title="Menyalin HANYA 18 angka nilai indikator (CC1 s/d ACC2), tanpa nama perusahaan atau tahun"
              >
                {copiedType === 'scores_only' ? <Check size={16} /> : <Copy size={16} />}
                <span>
                  {copiedType === 'scores_only'
                    ? '18 Nilai Skor Tersalin! Siap Paste (Ctrl+V) ✅'
                    : '📋 Salin 18 Nilai Skor Saja (CC1 s/d ACC2)'}
                </span>
              </button>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {/* Tombol 18 Skor + Total */}
                <button
                  className="btn btn-accent btn-sm"
                  onClick={copyScoresAndTotal}
                  style={{ flex: 1, minWidth: '150px' }}
                  title="Menyalin 18 angka nilai indikator + total skor"
                >
                  {copiedType === 'scores_total' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedType === 'scores_total' ? '18 Nilai + Total Tersalin! ✅' : 'Salin 18 Nilai + Total'}</span>
                </button>

                {/* Tombol Baris Penuh */}
                <button
                  className="btn btn-outline btn-sm"
                  onClick={copyFullRow}
                  style={{ flex: 1, minWidth: '150px', background: '#ffffff' }}
                  title="Menyalin Kode, Tahun, 18 Nilai, dan Total"
                >
                  {copiedType === 'full_row' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedType === 'full_row' ? 'Baris Lengkap Tersalin! ✅' : 'Salin Lengkap (+Kode & Tahun)'}</span>
                </button>
              </div>
            </div>

            {copiedType && (
              <div style={{ fontSize: '11.5px', color: 'var(--fern)', marginTop: '8px', fontWeight: 600 }}>
                💡 Data tersalin dalam format TAB (*TSV*). Tekan <strong>Ctrl + V</strong> di sel Google Sheets / Excel, nilai akan otomatis mengisi 18 kolom secara horizontal!
              </div>
            )}
          </div>

          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--stone)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Rincian 18 Indikator (Skala 0 – 5):
          </div>

          <div className="ind-grid">
            {INDICATOR_KEYS.map(k => {
              const upper = k.toUpperCase();
              const score = scoreResult.scores[k] || 0;
              return (
                <div key={k} className="ind-item">
                  <div className="ind-code">{upper}</div>
                  <div className={`score-badge score-${score}`}>{score}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
            <button className="btn btn-accent btn-sm" onClick={onNavigateToResults}>
              <span>Lihat di Tabel Database</span>
              <ArrowRight size={16} />
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleReset}>
              <RefreshCw size={14} />
              <span>Analisis Laporan Lain</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            background: 'var(--dew)',
            border: '2px dashed var(--mist)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '380px',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '52px', marginBottom: '16px', opacity: 0.7 }}>🌲</div>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>Alur Ekstraksi & Analisis</h3>
          <ol style={{ fontSize: '13px', color: 'var(--stone)', maxWidth: '340px', marginTop: '10px', textAlign: 'left', lineHeight: '1.8', paddingLeft: '20px' }}>
            <li>Upload file PDF laporan tahunan</li>
            <li>Klik tombol <strong>"1. Ubah PDF ke TXT"</strong></li>
            <li>Preview isi teks yang berhasil diekstrak</li>
            <li>Klik tombol <strong>"2. Analisis dengan AI"</strong></li>
          </ol>
        </div>
      )}

      {/* Modal Preview TXT */}
      {showPreviewModal && extractedData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '850px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '1px solid var(--border)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                  📄 Preview Konten Teks Hasil Ekstraksi TXT
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--stone)', marginTop: '3px' }}>
                  {extractedData?.fileName} · {extractedData?.pageCount || 1} Halaman · {(extractedData?.totalCharacters || 0).toLocaleString()} Karakter
                </div>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--stone)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: Text Area */}
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
              {(extractedData?.totalCharacters || 0) < 50 && (
                <div style={{ padding: '16px 18px', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '10px', color: '#92400e', marginBottom: '14px', fontSize: '13px', lineHeight: '1.6' }}>
                  <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📷</span>
                    <span>Laporan Menggunakan Format Gambar / Vektor / InDesign</span>
                  </div>
                  <div>
                    File PDF ini memiliki <strong>{extractedData?.pageCount || 1} halaman</strong> namun teksnya tersusun dalam layer gambar/vektor khusus (bukan plain text ASCII standar).
                    <br />
                    <strong>✨ Keunggulan Sistem:</strong> Saat Anda mengklik <strong>"2. Analisis dengan AI"</strong>, sistem otomatis mengaktifkan mode <strong>Google Gemini Multimodal Vision</strong> untuk memindai dan membaca seluruh {extractedData?.pageCount || 1} halaman secara visual dan menghitung ke-18 indikator secara akurat!
                  </div>
                </div>
              )}

              <textarea
                readOnly
                placeholder={(extractedData?.totalCharacters || 0) < 50 ? 'Konten PDF berbasis visual/vektor layer. Gemini AI akan menganalisis langsung via Multimodal PDF Vision...' : ''}
                value={extractedData?.text || ''}
                style={{
                  width: '100%',
                  height: (extractedData?.totalCharacters || 0) < 50 ? '260px' : '420px',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '12px',
                  lineHeight: '1.6',
                  padding: '14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: '#f8fafc',
                  color: '#1e293b',
                  resize: 'none',
                  outline: 'none'
                }}
              />
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 22px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8faf9',
              borderBottomLeftRadius: '16px',
              borderBottomRightRadius: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--stone)' }}>
                Teks ini yang akan dibaca dan dinilai oleh Google Gemini AI.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline btn-sm" onClick={handleCopyFullTxt}>
                  {copiedTxt ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedTxt ? 'Tersalin! ✅' : 'Salin Seluruh Teks'}</span>
                </button>
                <button className="btn btn-accent btn-sm" onClick={handleDownloadTxt}>
                  <Download size={14} />
                  <span>Download .TXT</span>
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowPreviewModal(false)}>
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
