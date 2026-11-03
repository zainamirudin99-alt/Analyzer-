'use client';
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, FC, DragEvent } from 'react';
import { UploadCloud, FileText, CheckCircle2, Sparkles, RefreshCw, ArrowRight, Copy, Check, Eye, Download, X, Settings2, Sliders, Cpu } from 'lucide-react';
import { CEDScores, INDICATOR_KEYS, CEDResultRecord, IndicatorPreset, CustomAISkill } from '@/lib/types';
import {
  getStoredPresets,
  saveStoredPresets,
  getActivePresetId,
  setActivePresetId,
  getActivePreset,
  getStoredSkills,
  getActiveSkillIds,
  setActiveSkillIds,
  getCombinedActiveSkillContent,
  DEFAULT_PRESET_ID
} from '@/lib/indicators-storage';
import {
  useLanguage,
  getPresetName,
  getIndicatorTitle,
  ensurePresetsTranslated
} from '@/lib/i18n';

interface UploadTabProps {
  onSuccessAnalysis: () => void;
  onNavigateToResults: () => void;
}

export const UploadTab: FC<UploadTabProps> = ({ onSuccessAnalysis, onNavigateToResults }) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
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
    scores: Record<string, number>;
    totalScore: number;
    disclosureLevel: string;
    modelUsed: string;
    presetId?: string;
    presetName?: string;
    extraction?: { page_count: number; total_characters: number; is_scanned: boolean };
    savedInDb: boolean;
  } | null>(null);

  const [activeProvider, setActiveProvider] = useState<'gemini' | 'openai' | 'claude'>('gemini');
  const [activeModel, setActiveModel] = useState<string>('gemini-3.7-flash');

  // Preset Indikator & Custom Skills State (Multi-Select)
  const [presets, setPresets] = useState<IndicatorPreset[]>([]);
  const [activePresetId, setActivePresetIdState] = useState<string>(DEFAULT_PRESET_ID);
  const [skills, setSkills] = useState<CustomAISkill[]>([]);
  const [activeSkillIds, setActiveSkillIdsState] = useState<string[]>([]);

  const syncAllState = () => {
    // 1. Sinkronisasi Model AI
    const provider = (typeof window !== 'undefined' ? localStorage.getItem('custom_ai_provider') || 'gemini' : 'gemini') as 'gemini' | 'openai' | 'claude';
    setActiveProvider(provider);
    if (provider === 'claude') {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('custom_claude_model') || 'claude-3-7-sonnet-20250219' : 'claude-3-7-sonnet-20250219';
      setActiveModel(stored);
    } else if (provider === 'openai') {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('custom_openai_model') || 'gpt-4o-mini' : 'gpt-4o-mini';
      setActiveModel(stored);
    } else {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_model') || 'gemini-3.7-flash' : 'gemini-3.7-flash';
      setActiveModel(stored);
    }

    // 2. Sinkronisasi Preset Indikator
    const storedPresets = getStoredPresets();
    const currentActivePreset = getActivePresetId();
    setPresets(storedPresets);
    setActivePresetIdState(currentActivePreset);

    // 3. Sinkronisasi Custom AI Skills (Multi-Skill)
    const storedSkills = getStoredSkills();
    const currentSkillIds = getActiveSkillIds();
    setSkills(storedSkills);
    setActiveSkillIdsState(currentSkillIds);
  };

  useEffect(() => {
    syncAllState();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', syncAllState);
      window.addEventListener('analyzer_presets_changed', syncAllState);
      window.addEventListener('analyzer_active_preset_changed', syncAllState);
      window.addEventListener('analyzer_skills_changed', syncAllState);
      window.addEventListener('analyzer_active_skill_changed', syncAllState);
      return () => {
        window.removeEventListener('storage', syncAllState);
        window.removeEventListener('analyzer_presets_changed', syncAllState);
        window.removeEventListener('analyzer_active_preset_changed', syncAllState);
        window.removeEventListener('analyzer_skills_changed', syncAllState);
        window.removeEventListener('analyzer_active_skill_changed', syncAllState);
      };
    }
  }, []);

  useEffect(() => {
    const currentPresets = getStoredPresets();
    ensurePresetsTranslated(currentPresets, lang).then(({ updatedPresets, changed }) => {
      if (changed) {
        saveStoredPresets(updatedPresets);
        setPresets(updatedPresets);
      }
    });
  }, [lang]);

  const handleProviderChange = (newProvider: 'gemini' | 'openai' | 'claude') => {
    setActiveProvider(newProvider);
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_ai_provider', newProvider);
      let defModel = 'gemini-3.7-flash';
      if (newProvider === 'claude') {
        defModel = localStorage.getItem('custom_claude_model') || 'claude-3-7-sonnet-20250219';
      } else if (newProvider === 'openai') {
        defModel = localStorage.getItem('custom_openai_model') || 'gpt-4o-mini';
      } else {
        defModel = localStorage.getItem('custom_gemini_model') || 'gemini-3.7-flash';
      }
      setActiveModel(defModel);
      window.dispatchEvent(new Event('storage'));
    }
  };

  const handleModelChange = (newModel: string) => {
    setActiveModel(newModel);
    if (typeof window !== 'undefined') {
      if (activeProvider === 'claude') {
        localStorage.setItem('custom_claude_model', newModel);
      } else if (activeProvider === 'openai') {
        localStorage.setItem('custom_openai_model', newModel);
      } else {
        localStorage.setItem('custom_gemini_model', newModel);
      }
      window.dispatchEvent(new Event('storage'));
    }
  };

  const handlePresetChange = (newPresetId: string) => {
    setActivePresetId(newPresetId);
    setActivePresetIdState(newPresetId);
  };

  const handleToggleSkill = (skillId: string) => {
    const exists = activeSkillIds.includes(skillId);
    const nextIds = exists
      ? activeSkillIds.filter(id => id !== skillId)
      : [...activeSkillIds, skillId];
    setActiveSkillIds(nextIds);
    setActiveSkillIdsState(nextIds);
  };

  const handleSelectAllSkills = () => {
    const allIds = skills.map(s => s.id);
    setActiveSkillIds(allIds);
    setActiveSkillIdsState(allIds);
  };

  const handleClearSkills = () => {
    setActiveSkillIds([]);
    setActiveSkillIdsState([]);
  };

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

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
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

    const provider = typeof window !== 'undefined' ? localStorage.getItem('custom_ai_provider') || 'gemini' : 'gemini';
    formData.append('provider', provider);

    if (provider === 'claude') {
      const storedKey = typeof window !== 'undefined' ? localStorage.getItem('custom_claude_key') : null;
      const storedModel = (typeof window !== 'undefined' ? localStorage.getItem('custom_claude_model') : null) || 'claude-3-7-sonnet-20250219';
      const storedBaseUrl = typeof window !== 'undefined' ? localStorage.getItem('custom_claude_base_url') : null;
      const storedEffort = typeof window !== 'undefined' ? localStorage.getItem('custom_claude_effort') || 'medium' : 'medium';
      if (storedKey) formData.append('apiKey', storedKey.trim());
      if (storedModel) formData.append('model', storedModel.trim());
      if (storedBaseUrl) formData.append('baseUrl', storedBaseUrl.trim());
      formData.append('effort', storedEffort);
    } else if (provider === 'openai') {
      const storedKey = typeof window !== 'undefined' ? localStorage.getItem('custom_openai_key') : null;
      const storedModel = (typeof window !== 'undefined' ? localStorage.getItem('custom_openai_model') : null) || activeModel || 'gpt-4o-mini';
      const storedBaseUrl = typeof window !== 'undefined' ? localStorage.getItem('custom_openai_base_url') : null;
      if (storedKey) formData.append('apiKey', storedKey.trim());
      if (storedModel) formData.append('model', storedModel.trim());
      if (storedBaseUrl) formData.append('baseUrl', storedBaseUrl.trim());
    } else {
      const storedKey = typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_key') : null;
      const storedModel = (typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_model') : null) || activeModel || 'gemini-3.7-flash';
      if (storedKey) formData.append('apiKey', storedKey.trim());
      if (storedModel) formData.append('model', storedModel.trim());
    }

    // Lampirkan Preset Indikator Aktif & Gabungan Multi-Skill (jika ada)
    const activePreset = getActivePreset();
    formData.append('presetId', activePreset.id);
    formData.append('presetName', activePreset.name);
    formData.append('indicatorsJson', JSON.stringify(activePreset.indicators));

    const combinedSkillContent = getCombinedActiveSkillContent();
    if (combinedSkillContent) {
      formData.append('skillContent', combinedSkillContent);
    }

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
        presetId: data.preset_id || activePreset.id,
        presetName: data.preset_name || activePreset.name,
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
            preset_id: data.preset_id || activePreset.id,
            preset_name: data.preset_name || activePreset.name,
            dynamic_scores: data.scores,
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

      const activeCount = activePreset.indicators.length || 18;
      const maxPts = activeCount * 5;
      setAlertInfo({
        type: 'success',
        message: isEn
          ? `Analysis for ${code} (${fiscalYear}) completed! Total score: ${data.total_score}/${maxPts}. Click the green button on the right to copy the ${activeCount} indicator scores.`
          : `Analisis untuk ${code} (${fiscalYear}) selesai! Total skor: ${data.total_score}/${maxPts}. Klik tombol hijau di kanan untuk menyalin ${activeCount} angka skor.`
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

  // Helper ambil keys indikator aktif
  const getActiveIndicatorCodes = (): string[] => {
    const activePreset = getActivePreset();
    if (activePreset?.indicators && activePreset.indicators.length > 0) {
      return activePreset.indicators.map(i => i.code.toLowerCase());
    }
    return INDICATOR_KEYS;
  };

  // 1. SALIN HANYA SKOR (Indikator Aktif) -> TANPA KODE & TANPA TAHUN
  const copyScoresOnly = () => {
    if (!scoreResult) return;
    const keys = getActiveIndicatorCodes();
    const scoresTsv = keys.map(k => scoreResult.scores[k] ?? scoreResult.scores[k.toUpperCase()] ?? 0).join('\t');
    navigator.clipboard.writeText(scoresTsv);
    setCopiedType('scores_only');
    setTimeout(() => setCopiedType(null), 3000);
  };

  // 2. SALIN SKOR + TOTAL -> TANPA KODE & TANPA TAHUN
  const copyScoresAndTotal = () => {
    if (!scoreResult) return;
    const keys = getActiveIndicatorCodes();
    const scoresArray = keys.map(k => scoreResult.scores[k] ?? scoreResult.scores[k.toUpperCase()] ?? 0);
    const scoresTsv = [...scoresArray, scoreResult.totalScore].join('\t');
    navigator.clipboard.writeText(scoresTsv);
    setCopiedType('scores_total');
    setTimeout(() => setCopiedType(null), 3000);
  };

  // 3. SALIN BARIS LENGKAP (Code, Year, Skor, Total)
  const copyFullRow = () => {
    if (!scoreResult) return;
    const keys = getActiveIndicatorCodes();
    const scoresArray = keys.map(k => scoreResult.scores[k] ?? scoreResult.scores[k.toUpperCase()] ?? 0);
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
          <span>{isEn ? '1. Document & Text Extraction (PDF ➔ TXT)' : '1. Dokumen & Ekstraksi Teks (PDF ➔ TXT)'}</span>
        </div>

        <div className="form-group">
          <label className="form-label">{isEn ? 'Issuer / Company Code (Ticker)' : 'Kode Emiten / Perusahaan (Ticker)'}</label>
          <input
            type="text"
            className="form-input font-mono"
            placeholder={isEn ? 'e.g., AKRA, TINS, ANTM, PTBA, ADRO' : 'Contoh: AKRA, TINS, ANTM, PTBA, ADRO'}
            value={companyCode}
            onChange={e => setCompanyCode(e.target.value.toUpperCase())}
            maxLength={12}
            disabled={isAnalyzing || isExtracting}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{isEn ? 'Fiscal Year' : 'Tahun Fiskal (Fiscal Year)'}</label>
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
          <label className="form-label">{isEn ? 'Additional Notes (Optional)' : 'Catatan Tambahan (Opsional)'}</label>
          <textarea
            className="form-textarea"
            placeholder={isEn ? 'e.g., Sustainability Report 2024...' : 'Contoh: Sustainability Report 2022...'}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isAnalyzing || isExtracting}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{isEn ? 'Upload PDF Report' : 'Unggah Laporan PDF'}</label>
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
              {selectedFile ? selectedFile.name : isEn ? 'Click or Drag PDF File Here' : 'Klik atau Tarik File PDF ke Sini'}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {selectedFile
                ? isEn
                  ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Click "1. Convert PDF to TXT" below`
                  : `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Klik "Ubah PDF ke TXT" di bawah`
                : isEn
                ? 'Supports Annual / Sustainability Reports in PDF (Max 25 MB)'
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

        {/* KONTROL KONFIGURASI: PRESET INDIKATOR, MODEL AI, & CUSTOM SKILL */}
        <div style={{
          background: 'var(--dew, #eef7eb)',
          border: '1.5px solid var(--border)',
          borderRadius: '12px',
          padding: '14px',
          marginTop: '14px',
          marginBottom: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '13.5px', color: 'var(--moss)' }}>
              <Sliders size={16} />
              <span>{isEn ? 'Indicator & AI Model Configuration' : 'Konfigurasi Indikator & Model Analisis'}</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--stone)' }}>
              {isEn ? 'Auto-Synchronized' : 'Tersinkronisasi Otomatis'}
            </span>
          </div>

          <div className="grid-2" style={{ gap: '10px', marginBottom: '12px' }}>
            {/* 1. Pemilih Preset Indikator */}
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--bark)', marginBottom: '4px' }}>
                🌱 {isEn ? 'Selected Indicator Preset' : 'Pilihan Indikator Digunakan'}
              </label>
              <select
                className="form-select font-mono"
                value={activePresetId}
                onChange={e => handlePresetChange(e.target.value)}
                disabled={isAnalyzing || isExtracting}
                style={{ background: '#ffffff', fontSize: '12.5px', padding: '7px 10px' }}
              >
                {presets.map(p => (
                  <option key={p.id} value={p.id}>
                    {getPresetName(p, lang)} ({p.indicators.length} {isEn ? 'Indicators' : 'Indikator'})
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Pemilih Bantuan AI Skill (Multi-Select: Bisa Pilih Lebih dari Satu) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '6px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--bark)', marginBottom: 0 }}>
                  🧠 {isEn ? 'AI Assistant Skills (Multi-Select)' : 'Skill Bantuan AI (Bisa Pilih > 1)'}
                </label>
                {skills.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: '999px',
                        background: activeSkillIds.length > 0 ? 'var(--fern)' : '#ffffff',
                        color: activeSkillIds.length > 0 ? '#ffffff' : 'var(--stone)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      {activeSkillIds.length > 0
                        ? isEn
                          ? `${activeSkillIds.length} Active`
                          : `${activeSkillIds.length} Aktif`
                        : isEn
                        ? 'None'
                        : '0 Aktif'}
                    </span>
                    {activeSkillIds.length < skills.length ? (
                      <button
                        type="button"
                        onClick={handleSelectAllSkills}
                        disabled={isAnalyzing || isExtracting}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--fern)',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                      >
                        {isEn ? 'Select All' : 'Pilih Semua'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleClearSkills}
                        disabled={isAnalyzing || isExtracting}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--stone)',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                      >
                        {isEn ? 'Reset' : 'Reset'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  minHeight: '38px',
                  maxHeight: '110px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  alignItems: 'center'
                }}
              >
                {skills.length === 0 ? (
                  <span style={{ fontSize: '12px', color: 'var(--stone)', fontStyle: 'italic' }}>
                    {isEn
                      ? 'No custom skills yet (upload in Settings)'
                      : 'Belum ada skill kustom (unggah di Pengaturan)'}
                  </span>
                ) : (
                  skills.map(s => {
                    const isChecked = activeSkillIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={isAnalyzing || isExtracting}
                        onClick={() => handleToggleSkill(s.id)}
                        title={s.description || s.name}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontSize: '11.5px',
                          fontWeight: isChecked ? 700 : 600,
                          background: isChecked ? 'var(--fern)' : 'var(--dew)',
                          color: isChecked ? '#ffffff' : 'var(--text)',
                          border: isChecked ? '1px solid var(--fern)' : '1px solid var(--border)',
                          cursor: isAnalyzing || isExtracting ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{isChecked ? '✅' : '✨'}</span>
                        <span>{s.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 3. Pemilih Mesin & Model AI Dua Arah */}
          <div>
            <label className="form-label" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--bark)', marginBottom: '6px' }}>
              🤖 {isEn ? 'AI Engine & Model (Two-Way Sync with Settings)' : 'Mesin & Model AI (Sinkron Dua Arah dengan Pengaturan)'}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.06)', borderRadius: '8px', padding: '3px' }}>
                <button
                  type="button"
                  style={{
                    padding: '6px 10px',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: activeProvider === 'gemini' ? 700 : 500,
                    background: activeProvider === 'gemini' ? '#ffffff' : 'transparent',
                    color: activeProvider === 'gemini' ? 'var(--fern)' : 'var(--stone)',
                    cursor: 'pointer',
                    boxShadow: activeProvider === 'gemini' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                  }}
                  onClick={() => handleProviderChange('gemini')}
                >
                  🌿 Gemini
                </button>
                <button
                  type="button"
                  style={{
                    padding: '6px 10px',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: activeProvider === 'openai' ? 700 : 500,
                    background: activeProvider === 'openai' ? '#ffffff' : 'transparent',
                    color: activeProvider === 'openai' ? 'var(--fern)' : 'var(--stone)',
                    cursor: 'pointer',
                    boxShadow: activeProvider === 'openai' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                  }}
                  onClick={() => handleProviderChange('openai')}
                >
                  ⚡ OpenAI
                </button>
                <button
                  type="button"
                  style={{
                    padding: '6px 10px',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: activeProvider === 'claude' ? 700 : 500,
                    background: activeProvider === 'claude' ? '#ffffff' : 'transparent',
                    color: activeProvider === 'claude' ? 'var(--fern)' : 'var(--stone)',
                    cursor: 'pointer',
                    boxShadow: activeProvider === 'claude' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                  }}
                  onClick={() => handleProviderChange('claude')}
                >
                  🎭 Claude
                </button>
              </div>

              <select
                className="form-select font-mono"
                style={{ flex: 1, minWidth: '180px', background: '#ffffff', padding: '6px 10px', fontSize: '12px' }}
                value={activeModel.split(' ')[0]}
                onChange={e => handleModelChange(e.target.value)}
                disabled={isAnalyzing || isExtracting}
              >
                {activeProvider === 'gemini' && (
                  <>
                    <option value="gemini-3.7-flash">gemini-3.7-flash ⭐ (Next-Gen High-Speed)</option>
                    <option value="gemini-3.7-pro">gemini-3.7-pro (Next-Gen Flagship)</option>
                    <option value="gemini-3.1-pro">gemini-3.1-pro (Deep Reasoning)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Enhanced 2.5)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash (Multimodal 2.0)</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash (Stabil, 1M Context)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (Penalaran Kompleks)</option>
                  </>
                )}
                {activeProvider === 'openai' && (
                  <>
                    <option value="gpt-4o">gpt-4o ⭐ (Flagship Multimodal)</option>
                    <option value="gpt-4o-mini">gpt-4o-mini (Ringan & Cepat)</option>
                    <option value="gpt-4-turbo">gpt-4-turbo (High Accuracy)</option>
                    <option value="o1-mini">o1-mini (Reasoning)</option>
                  </>
                )}
                {activeProvider === 'claude' && (
                  <>
                    <option value="claude-3-7-sonnet-20250219">Claude 3.7 Sonnet (Hybrid Reasoning)</option>
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                    <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                    <option value="claude-fable-5-1">Claude Fable 5.1 (Riset)</option>
                  </>
                )}
              </select>
            </div>
          </div>
        </div>

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
                  <span>{isEn ? 'Extracting PDF to TXT...' : 'Mengekstrak PDF ke TXT...'}</span>
                </>
              ) : (
                <>
                  <FileText size={18} />
                  <span>{isEn ? '1. Convert PDF to TXT' : '1. Ubah PDF ke TXT'}</span>
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
                    <span>{isEn ? 'AI is Analyzing...' : 'AI Sedang Menganalisis...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>
                      {isEn ? '2. Analyze with AI' : '2. Analisis dengan AI'}{' '}
                      {(extractedData?.totalCharacters ?? 0) < 50 ? '(Multimodal Vision)' : ''}
                    </span>
                  </>
                )}
              </button>

              <button
                className="btn btn-outline btn-lg"
                onClick={handleExtractToTxt}
                disabled={isExtracting || isAnalyzing}
                style={{ flex: 1 }}
                title={isEn ? 'Re-extract document' : 'Ekstrak ulang dokumen'}
              >
                <RefreshCw size={16} />
                <span>{isEn ? 'Re-convert TXT' : 'Ubah Ulang TXT'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Model Info Badge */}
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--stone)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span>🤖 {isEn ? 'Selected AI Model:' : 'Model AI Terpilih:'}</span>
          <span className="badge badge-primary font-mono" style={{ fontSize: '11px', padding: '2px 8px' }}>
            {activeModel}
          </span>
          <span style={{ fontSize: '11.5px', color: 'var(--stone)' }}>
            {isEn ? '(Synchronized with Settings tab)' : '(Tersinkronisasi dengan tab Pengaturan)'}
          </span>
        </div>
      </div>

      {/* Kolom Kanan: Hasil Skor / Preview Card */}
      {scoreResult ? (() => {
        const activeCodes = getActiveIndicatorCodes();
        const count = activeCodes.length || 18;
        const maxPossible = count * 5;
        const firstCode = (activeCodes[0] || 'CC1').toUpperCase();
        const lastCode = (activeCodes[count - 1] || 'ACC2').toUpperCase();

        return (
          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="ct-icon">🌿</div>
                <span>
                  {isEn ? 'Analysis Result:' : 'Hasil Analisis:'}{' '}
                  <strong style={{ color: 'var(--fern)' }}>{scoreResult.code} ({scoreResult.year})</strong>
                </span>
              </div>
              <span className="font-mono" style={{ fontSize: '12px', background: 'var(--dew)', padding: '4px 10px', borderRadius: '6px', color: 'var(--moss)' }}>
                Model: {scoreResult.modelUsed}
              </span>
            </div>

            <div className="grid-3" style={{ marginBottom: '20px' }}>
              <div className="stat-box s-green">
                <div className="stat-val">{scoreResult.totalScore}</div>
                <div className="stat-lbl">{isEn ? `Total Score / ${maxPossible}` : `Total Skor / ${maxPossible}`}</div>
              </div>
              <div className="stat-box s-teal">
                <div className="stat-val">{maxPossible > 0 ? ((scoreResult.totalScore / maxPossible) * 100).toFixed(1) : '0.0'}%</div>
                <div className="stat-lbl">{isEn ? 'Disclosure Index' : 'Indeks Pengungkapan'}</div>
              </div>
              <div className="stat-box s-sage">
                <div className="stat-val" style={{ fontSize: '17px', lineHeight: '1.3' }}>
                  {scoreResult.disclosureLevel.split(' ')[0]}
                </div>
                <div className="stat-lbl">{isEn ? 'Category Level' : 'Level Kategori'}</div>
              </div>
            </div>

            {/* Quick Copy Box */}
            <div style={{ background: '#f0f7ea', border: '1.5px solid var(--border)', borderRadius: '12px', padding: '14px', marginBottom: '18px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--moss)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📋</span>
                <span>
                  {isEn
                    ? 'Quick Copy Scores to Spreadsheet (Excel / Google Sheets):'
                    : 'Salin Cepat Nilai ke Spreadsheet (Excel / Google Sheets):'}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Tombol Utama: HANYA Skor Indikator Aktif */}
                <button
                  className="btn btn-primary"
                  onClick={copyScoresOnly}
                  style={{ justifyContent: 'center', fontSize: '13px', padding: '10px 16px' }}
                  title={
                    isEn
                      ? `Copy ONLY the ${count} indicator scores (${firstCode} to ${lastCode})`
                      : `Menyalin HANYA ${count} angka nilai indikator (${firstCode} s/d ${lastCode}), tanpa nama perusahaan atau tahun`
                  }
                >
                  {copiedType === 'scores_only' ? <Check size={16} /> : <Copy size={16} />}
                  <span>
                    {copiedType === 'scores_only'
                      ? isEn
                        ? `${count} Scores Copied! Ready to Paste (Ctrl+V) ✅`
                        : `${count} Nilai Skor Tersalin! Siap Paste (Ctrl+V) ✅`
                      : isEn
                      ? `📋 Copy ${count} Indicator Scores Only (${firstCode} to ${lastCode})`
                      : `📋 Salin ${count} Nilai Skor Saja (${firstCode} s/d ${lastCode})`}
                  </span>
                </button>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {/* Tombol Skor + Total */}
                  <button
                    className="btn btn-accent btn-sm"
                    onClick={copyScoresAndTotal}
                    style={{ flex: 1, minWidth: '150px' }}
                    title={isEn ? `Copy ${count} indicator scores + total score` : `Menyalin ${count} angka nilai indikator + total skor`}
                  >
                    {copiedType === 'scores_total' ? <Check size={14} /> : <Copy size={14} />}
                    <span>
                      {copiedType === 'scores_total'
                        ? isEn
                          ? `${count} Scores + Total Copied! ✅`
                          : `${count} Nilai + Total Tersalin! ✅`
                        : isEn
                        ? `Copy ${count} Scores + Total`
                        : `Salin ${count} Nilai + Total`}
                    </span>
                  </button>

                  {/* Tombol Baris Penuh */}
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={copyFullRow}
                    style={{ flex: 1, minWidth: '150px', background: '#ffffff' }}
                    title={isEn ? `Copy Code, Year, ${count} Scores, and Total` : `Menyalin Kode, Tahun, ${count} Nilai, dan Total`}
                  >
                    {copiedType === 'full_row' ? <Check size={14} /> : <Copy size={14} />}
                    <span>
                      {copiedType === 'full_row'
                        ? isEn
                          ? 'Full Row Copied! ✅'
                          : 'Baris Lengkap Tersalin! ✅'
                        : isEn
                        ? 'Copy Full Row (+Code & Year)'
                        : 'Salin Lengkap (+Kode & Tahun)'}
                    </span>
                  </button>
                </div>
              </div>

              {copiedType && (
                <div style={{ fontSize: '11.5px', color: 'var(--fern)', marginTop: '8px', fontWeight: 600 }}>
                  💡{' '}
                  {isEn ? (
                    <>
                      Data copied in TAB (<em>TSV</em>) format. Press <strong>Ctrl + V</strong> in Google Sheets / Excel to fill {count} columns horizontally!
                    </>
                  ) : (
                    <>
                      Data tersalin dalam format TAB (<em>TSV</em>). Tekan <strong>Ctrl + V</strong> di sel Google Sheets / Excel, nilai akan otomatis mengisi {count} kolom secara horizontal!
                    </>
                  )}
                </div>
              )}
            </div>

            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--stone)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {isEn ? `Indicator Breakdown (${count} Indicators · Scale 0 – 5):` : `Rincian Indikator (${count} Indikator · Skala 0 – 5):`}
            </div>

            <div className="ind-grid">
              {activeCodes.map(k => {
                const upper = k.toUpperCase();
                const score = scoreResult.scores[k] ?? scoreResult.scores[upper] ?? 0;
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
                <span>{isEn ? 'View in Results Table' : 'Lihat di Tabel Database'}</span>
                <ArrowRight size={16} />
              </button>
              <button className="btn btn-outline btn-sm" onClick={handleReset}>
                <RefreshCw size={14} />
                <span>{isEn ? 'Analyze Another Report' : 'Analisis Laporan Lain'}</span>
              </button>
            </div>
          </div>
        );
      })() : (
        <div
          className="card"
          style={{
            background: isAnalyzing ? 'linear-gradient(180deg, #f0fdf4 0%, #eef7eb 100%)' : isExtracting ? 'linear-gradient(180deg, #f8fafc 0%, #eef7eb 100%)' : 'var(--dew)',
            border: isAnalyzing || isExtracting ? '2px solid var(--sage)' : '2px dashed var(--mist)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '420px',
            textAlign: 'center',
            padding: '30px 20px',
            transition: 'all 0.3s ease'
          }}
        >
          {isAnalyzing ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="mascot-pulse-wrap">
                <img src="/logo.png" alt="AI Analyzing" className="mascot-loading-img" />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--fern)', marginTop: '18px' }}>
                AI Sedang Menilai 18 Indikator CED...
              </h3>
              <div style={{ fontSize: '13px', color: 'var(--stone)', maxWidth: '380px', marginTop: '8px', lineHeight: '1.6' }}>
                Google Gemini (<strong>{activeModel}</strong>) sedang memindai laporan dan menghitung bobot nilai CC, GHG, EC, RC, dan ACC secara mendalam.
              </div>
              <div className="mascot-status-pill">
                <span className="spinner" style={{ width: '14px', height: '14px' }} />
                <span>{progressLabel || 'Memproses Analisis...'}</span>
              </div>
            </div>
          ) : isExtracting ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="mascot-bounce-wrap">
                <img src="/logo.png" alt="Extracting PDF" className="mascot-loading-img" />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--moss)', marginTop: '18px' }}>
                Mengekstrak Konten PDF ke TXT...
              </h3>
              <div style={{ fontSize: '13px', color: 'var(--stone)', maxWidth: '380px', marginTop: '8px', lineHeight: '1.6' }}>
                Membaca teks dari setiap halaman dokumen langsung di browser lokal Anda tanpa limit server.
              </div>
              <div className="mascot-status-pill">
                <span className="spinner" style={{ width: '14px', height: '14px' }} />
                <span>{progressLabel || 'Membaca Halaman Dokumen...'}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="mascot-idle-wrap">
                <img src="/logo.png" alt="PDF Analyzer Mascot" className="mascot-idle-img" />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', marginTop: '10px' }}>
                Alur Ekstraksi & Analisis PDF
              </h3>
              <ol style={{ fontSize: '13px', color: 'var(--stone)', maxWidth: '360px', marginTop: '12px', textAlign: 'left', lineHeight: '1.8', paddingLeft: '24px' }}>
                <li>Upload file PDF laporan tahunan / keberlanjutan</li>
                <li>Klik tombol <strong>"1. Ubah PDF ke TXT"</strong></li>
                <li>Preview isi teks yang berhasil diekstrak</li>
                <li>Klik tombol <strong>"2. Analisis dengan AI"</strong></li>
              </ol>
            </>
          )}
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
