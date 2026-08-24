'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Sparkles, RefreshCw, ArrowRight } from 'lucide-react';
import { CEDScores, INDICATOR_KEYS_UPPER, INDICATOR_KEYS } from '@/lib/types';

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

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error' | 'warn' | 'info'; message: string } | null>(null);

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
    setAlertInfo({
      type: 'info',
      message: `File dipilih: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB). Sistem akan mengekstraknya otomatis ke format TXT sebelum dianalisis AI.`
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

  const handleStartAnalysis = async () => {
    const code = companyCode.trim().toUpperCase();
    if (!code) {
      setAlertInfo({ type: 'warn', message: 'Kode emiten / perusahaan wajib diisi (contoh: TINS, ANTM, PTBA).' });
      return;
    }
    if (!fiscalYear) {
      setAlertInfo({ type: 'warn', message: 'Tahun fiskal (FY) wajib dipilih.' });
      return;
    }
    if (!selectedFile) {
      setAlertInfo({ type: 'warn', message: 'Silakan upload file PDF laporan tahunan terlebih dahulu.' });
      return;
    }

    setIsLoading(true);
    setScoreResult(null);
    setProgress(15);
    setProgressLabel('Membaca file & mengekstrak PDF ke format TXT...');
    setAlertInfo(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('companyCode', code);
    formData.append('fiscalYear', fiscalYear);
    formData.append('notes', notes);

    // Ambil custom API key atau model dari localStorage jika ada
    const storedKey = typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_key') : null;
    const storedModel = typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_model') : null;
    if (storedKey) formData.append('apiKey', storedKey);
    if (storedModel) formData.append('model', storedModel);

    try {
      setProgress(40);
      setProgressLabel('AI sedang mengidentifikasi 18 indikator CED dari teks dokumen...');

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memproses analisis AI.');
      }

      setProgress(100);
      setProgressLabel('Analisis berhasil diselesaikan! 🌿');

      const data = json.data;
      setScoreResult({
        code: data.company_code,
        year: data.fiscal_year,
        scores: data.scores,
        totalScore: data.total_score,
        disclosureLevel: data.disclosure_level,
        modelUsed: data.model_used,
        extraction: data.extraction_summary,
        savedInDb: data.saved_in_supabase
      });

      setAlertInfo({
        type: 'success',
        message: `Analisis untuk ${code} (${fiscalYear}) selesai! Total skor: ${data.total_score}/90 (${data.disclosure_level}). ${data.saved_in_supabase ? 'Tersimpan otomatis di Supabase.' : 'Mode lokal aktif.'}`
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
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setCompanyCode('');
    setFiscalYear('FY 2024');
    setNotes('');
    setSelectedFile(null);
    setScoreResult(null);
    setAlertInfo(null);
    setProgress(0);
    setProgressLabel('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="grid-2">
      {/* Form Input Dokumen */}
      <div className="card">
        <div className="card-title">
          <div className="ct-icon">📝</div>
          <span>Informasi Dokumen & Laporan</span>
        </div>

        <div className="form-group">
          <label className="form-label">Kode Emiten / Perusahaan (Ticker)</label>
          <input
            type="text"
            className="form-input font-mono"
            placeholder="Contoh: TINS, ANTM, PTBA, ADRO, MEDC"
            value={companyCode}
            onChange={e => setCompanyCode(e.target.value.toUpperCase())}
            maxLength={12}
            disabled={isLoading}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Tahun Fiskal (Fiscal Year)</label>
          <select
            className="form-select font-mono"
            value={fiscalYear}
            onChange={e => setFiscalYear(e.target.value)}
            disabled={isLoading}
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
            placeholder="Contoh: Sustainability Report 2024, Mining Division..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isLoading}
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
              disabled={isLoading}
            />
            <div className="dz-icon-wrap">
              {selectedFile ? <FileText size={32} color="#2e6922" /> : <UploadCloud size={32} color="#687962" />}
            </div>
            <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
              {selectedFile ? selectedFile.name : 'Klik atau Tarik File PDF ke Sini'}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {selectedFile
                ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Siap diekstrak ke TXT`
                : 'Mendukung Laporan Tahunan / Keberlanjutan (Maks 25 MB)'}
            </div>
          </div>
        </div>

        {/* Progress Bar saat memproses */}
        {isLoading && (
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

        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={handleStartAnalysis}
          disabled={isLoading}
          style={{ marginTop: '12px' }}
        >
          {isLoading ? (
            <>
              <span className="spinner" />
              <span>Memproses dengan AI...</span>
            </>
          ) : (
            <>
              <Sparkles size={18} />
              <span>Mulai Ekstraksi & Analisis AI</span>
            </>
          )}
        </button>
      </div>

      {/* Hasil Skor / Preview Card */}
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

          {/* Info Ekstraksi TXT */}
          {scoreResult.extraction && (
            <div style={{ padding: '10px 14px', background: 'var(--dew)', borderRadius: '10px', fontSize: '12.5px', color: 'var(--moss)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="#2e6922" />
              <span>
                <strong>Pipeline PDF ➔ TXT Sukses:</strong> Berhasil mengekstrak {scoreResult.extraction.page_count} halaman ({scoreResult.extraction.total_characters.toLocaleString()} karakter) teks bersih untuk analisis AI.
              </span>
            </div>
          )}

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
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>Hasil Analisis CED Akan Tampil di Sini</h3>
          <p style={{ fontSize: '13px', color: 'var(--stone)', maxWidth: '340px', marginTop: '6px' }}>
            Pilih file PDF laporan tahunan atau keberlanjutan, lalu tekan tombol <strong>"Mulai Ekstraksi & Analisis AI"</strong>.
          </p>
        </div>
      )}
    </div>
  );
};
