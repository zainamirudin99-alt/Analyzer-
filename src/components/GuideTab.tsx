'use client';

import React, { useState, useEffect } from 'react';
import {
  SCORING_RUBRIC,
  DEFAULT_BINARY_RUBRIC,
  DEFAULT_QUANTITATIVE_RUBRIC,
  IndicatorItem,
  IndicatorPreset,
  RubricItem,
  RubricType,
  getPresetRubric,
  getPresetRubricType,
  getPresetMaxScore
} from '@/lib/types';
import {
  getStoredPresets,
  saveStoredPresets,
  getActivePresetId,
  setActivePresetId,
  DEFAULT_PRESET_ID,
  createDefaultCEDPreset
} from '@/lib/indicators-storage';
import {
  useLanguage,
  getPresetName,
  getPresetDescription,
  getIndicatorTitle,
  getIndicatorDesc,
  getIndicatorGroup,
  translateSingleIndicator,
  translateTextsBatch,
  ensurePresetsTranslated
} from '@/lib/i18n';
import {
  parseExcelBuffer,
  parseDocxBuffer,
  parseRawText,
  generateExcelTemplate,
  generateDocxTemplate
} from '@/lib/indicator-importer';
import {
  CheckCircle2,
  Plus,
  Copy,
  Trash2,
  Edit2,
  Check,
  X,
  ArrowRight,
  Globe,
  Sliders,
  RefreshCw,
  Upload,
  FileSpreadsheet,
  FileText,
  Download,
  Link2,
  Info
} from 'lucide-react';

export const GuideTab: React.FC = () => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [presets, setPresets] = useState<IndicatorPreset[]>([]);
  const [activePresetId, setActiveId] = useState<string>(DEFAULT_PRESET_ID);
  const [selectedPresetId, setSelectedId] = useState<string>(DEFAULT_PRESET_ID);
  const [isTranslating, setIsTranslating] = useState(false);

  // Modal State
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetFormName, setPresetFormName] = useState('');
  const [presetFormDesc, setPresetFormDesc] = useState('');
  const [presetFormRubricType, setPresetFormRubricType] = useState<RubricType>('weighted');

  // Rubric Modal State
  const [showRubricModal, setShowRubricModal] = useState(false);
  const [rubricModalType, setRubricModalType] = useState<RubricType>('weighted');
  const [rubricModalItems, setRubricModalItems] = useState<RubricItem[]>([]);

  // Template & Panduan Modal State
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<'file' | 'link' | 'paste'>('file');
  const [importLinkUrl, setImportLinkUrl] = useState('');
  const [importPasteText, setImportPasteText] = useState('');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  const [parsedImportItems, setParsedImportItems] = useState<IndicatorItem[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStatusNote, setImportStatusNote] = useState<string | null>(null);

  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const [isChainedFromPreset, setIsChainedFromPreset] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<IndicatorItem | null>(null);
  const [indFormCode, setIndFormCode] = useState('');
  const [indFormTitle, setIndFormTitle] = useState('');
  const [indFormDesc, setIndFormDesc] = useState('');
  const [indFormGroup, setIndFormGroup] = useState('Umum');

  const [noticeMessage, setNoticeMessage] = useState<{ type: 'success' | 'warn'; text: string } | null>(null);

  const loadData = () => {
    const p = getStoredPresets();
    const actId = getActivePresetId();
    setPresets(p);
    setActiveId(actId);
    setSelectedId(prev => (!prev || !p.some(item => item.id === prev) ? actId : prev));
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('analyzer_presets_changed', handleUpdate);
    window.addEventListener('analyzer_active_preset_changed', handleUpdate);
    return () => {
      window.removeEventListener('analyzer_presets_changed', handleUpdate);
      window.removeEventListener('analyzer_active_preset_changed', handleUpdate);
    };
  }, []);

  // Translasi otomatis dua arah saat bahasa berubah atau terdapat indikator kustom yang belum punya terjemahan
  useEffect(() => {
    let cancelled = false;
    const currentPresets = getStoredPresets();
    const needsTranslation = currentPresets.some(p => {
      if (p.isDefault || p.id === DEFAULT_PRESET_ID) return false;
      if (lang === 'en' && (!p.name_en || p.indicators.some(i => !i.title_en))) return true;
      if (lang === 'id' && (!p.name_id || p.indicators.some(i => !i.title_id))) return true;
      return false;
    });

    if (!needsTranslation) return;

    setIsTranslating(true);
    ensurePresetsTranslated(currentPresets, lang)
      .then(({ updatedPresets, changed }) => {
        if (!cancelled && changed) {
          saveStoredPresets(updatedPresets);
          setPresets(updatedPresets);
        }
      })
      .finally(() => {
        if (!cancelled) setIsTranslating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lang, presets.length]);

  const selectedPreset = presets.find(p => p.id === selectedPresetId) || presets[0] || createDefaultCEDPreset();

  const handleSelectActivePreset = (id: string) => {
    setActivePresetId(id);
    setActiveId(id);
    setSelectedId(id);
    const target = presets.find(p => p.id === id);
    const displayName = target ? getPresetName(target, lang) : id;
    setNoticeMessage({
      type: 'success',
      text: isEn
        ? `Preset "${displayName}" is now active for Upload & Analysis and Results Table!`
        : `Preset "${displayName}" sekarang aktif digunakan untuk menu Analisis & Tabel Hasil!`
    });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Buat Preset Baru (Dukungan alur fleksibel: atur rubrik, input indikator, atau simpan langsung)
  const handleCreatePreset = async (e?: React.FormEvent, nextAction: 'rubric' | 'indicators' | 'none' = 'none') => {
    if (e) e.preventDefault();
    if (!presetFormName.trim()) return;

    const rawName = presetFormName.trim();
    const rawDesc = presetFormDesc.trim() || (isEn ? 'Custom indicator collection.' : 'Kumpulan indikator kustom.');
    const initialRubric = (presetFormRubricType === 'quantitative_count' || presetFormRubricType === 'binary_count')
      ? DEFAULT_QUANTITATIVE_RUBRIC.map(item => ({ ...item }))
      : SCORING_RUBRIC.map(item => ({ ...item }));

    const newPreset: IndicatorPreset = {
      id: `preset_${Date.now()}`,
      name: rawName,
      description: rawDesc,
      name_id: isEn ? undefined : rawName,
      name_en: isEn ? rawName : undefined,
      description_id: isEn ? undefined : rawDesc,
      description_en: isEn ? rawDesc : undefined,
      isDefault: false,
      rubricType: presetFormRubricType,
      rubric: initialRubric,
      indicators: [],
      createdAt: new Date().toISOString()
    };

    const updated = [...presets, newPreset];
    saveStoredPresets(updated);
    setPresets(updated);
    setSelectedId(newPreset.id);
    setActivePresetId(newPreset.id);
    setActiveId(newPreset.id);

    // Reset form preset
    setShowPresetModal(false);
    setPresetFormName('');
    setPresetFormDesc('');
    setPresetFormRubricType('weighted');

    if (nextAction === 'rubric') {
      // Langsung buka modal editor rubrik untuk preset baru ini
      setRubricModalType(newPreset.rubricType || 'weighted');
      setRubricModalItems((newPreset.rubric || SCORING_RUBRIC).map(item => ({ ...item })));
      setShowRubricModal(true);
    } else if (nextAction === 'indicators') {
      // Lanjut ke modal input manual indikator
      setEditingIndicator(null);
      setIndFormCode('');
      setIndFormTitle('');
      setIndFormDesc('');
      setIndFormGroup(isEn ? 'General' : 'Umum');
      setIsChainedFromPreset(true);
      setShowIndicatorModal(true);
    }

    setNoticeMessage({
      type: 'success',
      text: isEn
        ? `Preset "${rawName}" created and saved successfully!`
        : `Preset "${rawName}" berhasil dibuat dan tersimpan aman!`
    });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Duplikasi dari CED 18
  const handleDuplicateDefault = () => {
    const defaultPreset = presets.find(p => p.id === DEFAULT_PRESET_ID) || createDefaultCEDPreset();
    const copyPreset: IndicatorPreset = {
      id: `preset_custom_${Date.now()}`,
      name: isEn ? `Copy of ${getPresetName(defaultPreset, 'en')} (Custom)` : `Salinan ${defaultPreset.name} (Kustom)`,
      description: isEn
        ? 'Editable copy of the standard 18 CED indicators.'
        : 'Salinan indikator CED standar yang dapat Anda tambah, ubah, atau kurangi.',
      name_id: `Salinan ${defaultPreset.name_id || defaultPreset.name} (Kustom)`,
      name_en: `Copy of ${defaultPreset.name_en || '18 CED Indicators'} (Custom)`,
      description_id: 'Salinan indikator CED standar yang dapat Anda tambah, ubah, atau kurangi.',
      description_en: 'Editable copy of the standard 18 CED indicators.',
      isDefault: false,
      rubricType: defaultPreset.rubricType || 'weighted',
      rubric: getPresetRubric(defaultPreset).map(item => ({ ...item })),
      indicators: JSON.parse(JSON.stringify(defaultPreset.indicators)),
      createdAt: new Date().toISOString()
    };

    const updated = [...presets, copyPreset];
    saveStoredPresets(updated);
    setPresets(updated);
    setSelectedId(copyPreset.id);
    setActivePresetId(copyPreset.id);
    setActiveId(copyPreset.id);
    setNoticeMessage({
      type: 'success',
      text: isEn
        ? `Duplicated 18 CED indicators into "${getPresetName(copyPreset, lang)}".`
        : `Berhasil menduplikasi 18 indikator CED ke preset "${getPresetName(copyPreset, lang)}".`
    });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Buka Modal Edit Rubrik (bisa spesifik untuk preset tertentu)
  const openRubricModal = (customPreset?: IndicatorPreset) => {
    const target = customPreset || presets.find(p => p.id === selectedPresetId) || selectedPreset;
    setSelectedId(target.id);
    const currentRubric = getPresetRubric(target);
    const currentType = getPresetRubricType(target);
    setRubricModalType(currentType);
    setRubricModalItems(currentRubric.map(item => ({ ...item })));
    setShowRubricModal(true);
  };

  // Tambah Tingkat Rubrik (Tak Terbatas)
  const handleAddRubricTier = () => {
    setRubricModalItems(prev => {
      const highestScore = prev.length > 0 ? Math.max(...prev.map(p => Number(p.score) || 0)) : 0;
      const nextScore = highestScore + 1;
      return [
        ...prev,
        {
          score: nextScore,
          label: `${nextScore}: ${isEn ? 'Tier ' + nextScore : 'Tingkat ' + nextScore}`,
          desc: isEn ? 'Describe criteria for this rubric tier...' : 'Jelaskan kriteria untuk tingkatan rubrik ini...',
          label_en: `${nextScore}: Tier ${nextScore}`,
          desc_en: 'Describe criteria for this rubric tier...'
        }
      ];
    });
  };

  // Hapus Tingkat Rubrik
  const handleRemoveRubricTier = (index: number) => {
    if (rubricModalItems.length <= 2) {
      alert(isEn ? 'Rubric must have at least 2 tiers.' : 'Rubrik harus memiliki minimal 2 tingkatan.');
      return;
    }
    setRubricModalItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Edit Field Rubrik
  const handleRubricItemChange = (index: number, field: keyof RubricItem, value: any) => {
    setRubricModalItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Reset ke Standar CED 0-5
  const handleResetRubricToCED = () => {
    if (!confirm(isEn ? 'Reset rubric tiers to CED Standard (0–5)?' : 'Kembalikan susunan rubrik ke Standar CED (0–5)?')) return;
    setRubricModalType('weighted');
    setRubricModalItems(SCORING_RUBRIC.map(item => ({ ...item })));
  };

  // Beralih Mode Rubrik (Weighted vs Binary Count)
  const handleSwitchRubricMode = (newType: RubricType) => {
    setRubricModalType(newType);
    if (newType === 'quantitative_count' || newType === 'binary_count') {
      setRubricModalItems(DEFAULT_QUANTITATIVE_RUBRIC.map(item => ({ ...item })));
    } else if (rubricModalItems.length <= 2) {
      setRubricModalItems(SCORING_RUBRIC.map(item => ({ ...item })));
    }
  };

  // Simpan Perubahan Rubrik
  const handleSaveRubric = (e: React.FormEvent) => {
    e.preventDefault();
    if (rubricModalItems.length < 2) {
      alert(isEn ? 'Rubric must have at least 2 tiers.' : 'Rubrik harus memiliki minimal 2 tingkatan.');
      return;
    }

    // Urutkan tingkatan rubrik berdasarkan nilai skor secara ascending
    const sortedItems = [...rubricModalItems].sort((a, b) => Number(a.score) - Number(b.score));

    const updatedPresets = presets.map(p => {
      if (p.id === selectedPreset.id) {
        return {
          ...p,
          rubricType: rubricModalType,
          rubric: sortedItems,
          updatedAt: new Date().toISOString()
        };
      }
      return p;
    });

    saveStoredPresets(updatedPresets);
    setPresets(updatedPresets);
    setShowRubricModal(false);

    setNoticeMessage({
      type: 'success',
      text: isEn
        ? `Rubric guidelines for "${getPresetName(selectedPreset, lang)}" updated successfully!`
        : `Ketentuan rubrik untuk "${getPresetName(selectedPreset, lang)}" berhasil diperbarui!`
    });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Handler Download Template Excel (.xlsx)
  const handleDownloadExcelTemplate = () => {
    try {
      const buffer = generateExcelTemplate();
      const blob = new Blob([buffer as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Template_Indikator_Analyzer.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(isEn ? 'Failed to download Excel template: ' + e.message : 'Gagal mengunduh template Excel: ' + e.message);
    }
  };

  // Handler Download Template Word (.docx)
  const handleDownloadDocxTemplate = async () => {
    try {
      const blob = await generateDocxTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Template_Indikator_Analyzer.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(isEn ? 'Failed to download Word template: ' + e.message : 'Gagal mengunduh template Word: ' + e.message);
    }
  };

  // Handler Unggah Berkas Impor (Excel / Word / CSV)
  const handleImportFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportStatusNote(null);
    setIsProcessingImport(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileNameLower = file.name.toLowerCase();

      if (fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.doc')) {
        const result = await parseDocxBuffer(arrayBuffer);
        if (result.warning && result.indicators.length === 0) {
          setImportError(result.warning);
        } else {
          setParsedImportItems(result.indicators);
        }
      } else {
        const result = parseExcelBuffer(arrayBuffer);
        if (result.warning && result.indicators.length === 0) {
          setImportError(result.warning);
        } else {
          setParsedImportItems(result.indicators);
        }
      }
    } catch (err: any) {
      setImportError(isEn ? 'Failed to process file: ' + err.message : 'Gagal memproses berkas: ' + err.message);
    } finally {
      setIsProcessingImport(false);
      e.target.value = '';
    }
  };

  // Handler Impor dari Link (Google Sheets / Google Docs)
  const handleImportLinkFetch = async () => {
    if (!importLinkUrl.trim()) return;
    setImportError(null);
    setImportStatusNote(null);
    setIsProcessingImport(true);

    try {
      const res = await fetch('/api/indicators/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importLinkUrl.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setImportError(data.error || (isEn ? 'Failed to fetch indicators from link.' : 'Gagal mengambil indikator dari link.'));
        if (data.statusNote) setImportStatusNote(data.statusNote);
        return;
      }
      setParsedImportItems(data.indicators || []);
    } catch (err: any) {
      setImportError(isEn ? 'Network error: ' + err.message : 'Kendala jaringan: ' + err.message);
    } finally {
      setIsProcessingImport(false);
    }
  };

  // Handler Impor dari Salin-Tempel Teks
  const handleImportPasteProcess = () => {
    if (!importPasteText.trim()) return;
    setImportError(null);
    const items = parseRawText(importPasteText);
    if (items.length === 0) {
      setImportError(isEn ? 'No valid indicators detected. Check the format or template.' : 'Tidak ada indikator valid yang terdeteksi. Periksa format atau gunakan template.');
      return;
    }
    setParsedImportItems(items);
  };

  // Konfirmasi dan Simpan Hasil Impor ke Preset Terpilih
  const handleConfirmImport = () => {
    if (parsedImportItems.length === 0) return;

    const targetPresetId = selectedPreset.id;
    const updatedPresets = presets.map(p => {
      if (p.id === targetPresetId) {
        let combined: IndicatorItem[];
        if (importMode === 'replace') {
          combined = [...parsedImportItems];
        } else {
          // Append with deduplication by code
          const existingCodes = new Set(p.indicators.map(i => i.code.toUpperCase()));
          const newItems = parsedImportItems.filter(i => !existingCodes.has(i.code.toUpperCase()));
          combined = [...p.indicators, ...newItems];
        }
        return {
          ...p,
          indicators: combined,
          updatedAt: new Date().toISOString()
        };
      }
      return p;
    });

    saveStoredPresets(updatedPresets);
    setPresets(updatedPresets);
    setShowImportModal(false);
    setParsedImportItems([]);
    setImportLinkUrl('');
    setImportPasteText('');

    setNoticeMessage({
      type: 'success',
      text: isEn
        ? `Successfully imported ${parsedImportItems.length} indicators into "${getPresetName(selectedPreset, lang)}"!`
        : `Berhasil mengimpor ${parsedImportItems.length} indikator ke preset "${getPresetName(selectedPreset, lang)}"!`
    });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Hapus Preset Kustom
  const handleDeletePreset = (id: string, name: string) => {
    if (id === DEFAULT_PRESET_ID) return;
    const confirmMsg = isEn
      ? `Delete preset "${name}" and all its indicators?`
      : `Hapus preset "${name}" beserta seluruh indikator di dalamnya?`;
    if (!confirm(confirmMsg)) return;

    const updated = presets.filter(p => p.id !== id);
    saveStoredPresets(updated);
    setPresets(updated);
    if (activePresetId === id) {
      setActivePresetId(DEFAULT_PRESET_ID);
      setActiveId(DEFAULT_PRESET_ID);
    }
    setSelectedId(DEFAULT_PRESET_ID);
    setNoticeMessage({
      type: 'warn',
      text: isEn ? `Preset "${name}" has been deleted.` : `Preset "${name}" telah dihapus.`
    });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Buka Modal Tambah/Edit Indikator
  const openIndicatorModal = (ind?: IndicatorItem) => {
    setIsChainedFromPreset(false);
    if (ind) {
      setEditingIndicator(ind);
      setIndFormCode(ind.code);
      setIndFormTitle(getIndicatorTitle(ind, lang));
      setIndFormDesc(getIndicatorDesc(ind, lang));
      setIndFormGroup(getIndicatorGroup(ind, lang));
    } else {
      setEditingIndicator(null);
      setIndFormCode('');
      setIndFormTitle('');
      setIndFormDesc('');
      setIndFormGroup(isEn ? 'General' : 'Umum');
    }
    setShowIndicatorModal(true);
  };

  // Simpan Indikator (mendukung input beruntun + translasi otomatis dua arah ID <-> EN)
  const handleSaveIndicator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!indFormCode.trim() || !indFormTitle.trim()) return;

    const cleanCode = indFormCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const rawTitle = indFormTitle.trim();
    const rawDesc = indFormDesc.trim();
    const rawGroup = indFormGroup.trim() || (isEn ? 'General' : 'Umum');

    const baseItem: IndicatorItem = {
      id: editingIndicator ? editingIndicator.id : cleanCode.toLowerCase(),
      code: cleanCode,
      title: rawTitle,
      fullDesc: rawDesc,
      group: rawGroup,
      title_id: isEn ? editingIndicator?.title_id : rawTitle,
      title_en: isEn ? rawTitle : editingIndicator?.title_en,
      fullDesc_id: isEn ? editingIndicator?.fullDesc_id : rawDesc,
      fullDesc_en: isEn ? rawDesc : editingIndicator?.fullDesc_en,
      group_id: isEn ? editingIndicator?.group_id : rawGroup,
      group_en: isEn ? rawGroup : editingIndicator?.group_en
    };

    const currentTargetPresetId = selectedPreset.id;
    let duplicateError = false;

    const updatedPresets = presets.map(p => {
      if (p.id === currentTargetPresetId) {
        let newIndicators = [...p.indicators];
        if (editingIndicator) {
          newIndicators = newIndicators.map(item => (item.id === editingIndicator.id ? baseItem : item));
        } else {
          if (newIndicators.some(item => item.code === cleanCode)) {
            duplicateError = true;
            return p;
          }
          newIndicators.push(baseItem);
        }
        return { ...p, indicators: newIndicators, updatedAt: new Date().toISOString() };
      }
      return p;
    });

    if (duplicateError) {
      alert(
        isEn
          ? `Indicator code ${cleanCode} already exists in this preset.`
          : `Kode indikator ${cleanCode} sudah ada dalam preset ini.`
      );
      return;
    }

    saveStoredPresets(updatedPresets);
    setPresets(updatedPresets);

    if (editingIndicator) {
      setShowIndicatorModal(false);
    } else {
      // Kosongkan form agar bisa langsung lanjut tambah indikator berikutnya di pop-up yang sama
      setIndFormCode('');
      setIndFormTitle('');
      setIndFormDesc('');
    }

    setNoticeMessage({
      type: 'success',
      text: isEn
        ? `Indicator ${cleanCode} saved to "${getPresetName(selectedPreset, lang)}".`
        : `Indikator ${cleanCode} berhasil disimpan ke preset "${getPresetName(selectedPreset, lang)}".`
    });
    setTimeout(() => setNoticeMessage(null), 4000);

    // Terjemahkan otomatis ke bahasa pasangan di latar belakang dan simpan ke localStorage
    translateSingleIndicator(baseItem, lang).then(translatedItem => {
      const latestPresets = getStoredPresets().map(p => {
        if (p.id !== currentTargetPresetId) return p;
        return {
          ...p,
          indicators: p.indicators.map(item => (item.code === translatedItem.code ? translatedItem : item))
        };
      });
      saveStoredPresets(latestPresets);
      setPresets(latestPresets);
    });
  };

  // Hapus Indikator dari Preset
  const handleDeleteIndicator = (indId: string, indCode: string) => {
    const confirmMsg = isEn
      ? `Delete indicator ${indCode} from preset "${getPresetName(selectedPreset, lang)}"?`
      : `Hapus indikator ${indCode} dari preset "${getPresetName(selectedPreset, lang)}"?`;
    if (!confirm(confirmMsg)) return;

    const updatedPresets = presets.map(p => {
      if (p.id === selectedPreset.id) {
        return {
          ...p,
          indicators: p.indicators.filter(item => item.id !== indId),
          updatedAt: new Date().toISOString()
        };
      }
      return p;
    });

    saveStoredPresets(updatedPresets);
    setPresets(updatedPresets);
    setNoticeMessage({
      type: 'warn',
      text: isEn ? `Indicator ${indCode} has been removed.` : `Indikator ${indCode} telah dihapus.`
    });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  return (
    <div style={{ paddingBottom: '36px' }}>
      {noticeMessage && (
        <div className={`alert alert-${noticeMessage.type}`} style={{ marginBottom: '20px' }}>
          <span>{noticeMessage.type === 'success' ? '🌿' : '⚠️'}</span>
          <span>{noticeMessage.text}</span>
        </div>
      )}

      {/* Layout Split 2 Kolom */}
      <div className="indicators-layout">
        {/* ========================================================
            KOLOM KIRI: KUMPULAN PILIHAN INDIKATOR (PRESET MANAGER)
            ======================================================== */}
        <div>
          <div className="card" style={{ position: 'sticky', top: '16px' }}>
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="ct-icon">🌱</div>
                <span>{isEn ? 'Indicator Presets' : 'Pilihan Indikator'}</span>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'var(--dew)',
                  color: 'var(--fern)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title={isEn ? 'Auto-translated to English' : 'Diterjemahkan otomatis ke Bahasa Indonesia'}
              >
                <Globe size={11} />
                {isEn ? 'EN' : 'ID'}
              </span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {isEn ? (
                <>
                  Select the indicator collection synced to <strong>Upload & Analysis</strong> and <strong>Results Table</strong>:
                </>
              ) : (
                <>
                  Pilih kumpulan indikator yang akan disinkronkan ke <strong>Upload & Analisis</strong> serta <strong>Tabel Hasil</strong>:
                </>
              )}
            </p>

            {/* List Preset */}
            <div style={{ marginBottom: '18px' }}>
              {presets.map(p => {
                const isActive = p.id === activePresetId;
                const isSelected = p.id === selectedPresetId;
                const displayPresetName = getPresetName(p, lang);

                return (
                  <div
                    key={p.id}
                    className={`preset-card-item ${isSelected ? 'selected' : ''} ${isActive ? 'is-active-preset' : ''}`}
                    onClick={() => handleSelectActivePreset(p.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <input
                            type="radio"
                            name="active_indicator_preset"
                            checked={isActive}
                            onChange={() => handleSelectActivePreset(p.id)}
                            onClick={e => e.stopPropagation()}
                            id={`radio_${p.id}`}
                            style={{ cursor: 'pointer', accentColor: 'var(--fern)' }}
                          />
                          <label
                            htmlFor={`radio_${p.id}`}
                            style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text)', cursor: 'pointer' }}
                          >
                            {displayPresetName}
                          </label>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--stone)', marginLeft: '22px' }}>
                          <span className="badge" style={{ padding: '2px 8px', fontSize: '11px', background: 'var(--dew)', color: 'var(--fern)' }}>
                            {p.indicators.length} {isEn ? 'Indicators' : 'Indikator'}
                          </span>
                          {p.isDefault ? (
                            <span style={{ fontStyle: 'italic', opacity: 0.85 }}>
                              {isEn ? 'Standard Preset' : 'Standar Baku'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                              {isEn ? 'Custom' : 'Kustom'}
                            </span>
                          )}
                        </div>
                      </div>

                      {isActive && (
                        <span
                          title={isEn ? 'Currently active preset' : 'Preset ini sedang aktif digunakan'}
                          style={{ color: 'var(--fern)', display: 'flex', alignItems: 'center' }}
                        >
                          <CheckCircle2 size={16} />
                        </span>
                      )}
                    </div>

                    {!p.isDefault && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--fern)', borderColor: 'var(--border)' }}
                          onClick={() => openRubricModal(p)}
                          title={isEn ? 'Edit Scoring Rubric' : 'Edit Rubrik Penilaian'}
                        >
                          <Edit2 size={12} /> {isEn ? 'Rubric' : 'Rubrik'}
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--primary)', borderColor: 'var(--border)' }}
                          onClick={() => {
                            setSelectedId(p.id);
                            setParsedImportItems([]);
                            setImportError(null);
                            setImportStatusNote(null);
                            setShowImportModal(true);
                          }}
                          title={isEn ? 'Import indicators into this preset' : 'Impor indikator ke preset ini'}
                        >
                          <Upload size={12} /> {isEn ? 'Import' : 'Impor'}
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--danger)', borderColor: 'var(--border)' }}
                          onClick={() => handleDeletePreset(p.id, displayPresetName)}
                          title={isEn ? 'Delete Custom Preset' : 'Hapus Preset Kustom'}
                        >
                          <Trash2 size={12} /> {isEn ? 'Delete' : 'Hapus'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Tombol Aksi Preset */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', fontSize: '12.5px' }}
                onClick={handleDuplicateDefault}
                title={isEn ? 'Duplicate 18 CED indicators into an editable custom preset' : 'Salin 18 indikator CED untuk membuat versi yang bisa diedit bebas'}
              >
                <Copy size={14} />
                <span>{isEn ? 'Duplicate from CED 18' : 'Duplikasi dari CED 18'}</span>
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', fontSize: '12.5px' }}
                onClick={() => setShowPresetModal(true)}
              >
                <Plus size={14} />
                <span>{isEn ? 'Add New Indicator Preset' : 'Tambah Pilihan Indikator Baru'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================
            KOLOM KANAN: RUBRIK SKOR & DAFTAR RINCIAN INDIKATOR
            ======================================================== */}
        <div>
          {/* Header Preset yang Sedang Dipilih */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--bark)' }}>
                    {getPresetName(selectedPreset, lang)}
                  </h2>
                  {selectedPreset.id === activePresetId ? (
                    <span className="badge" style={{ background: 'var(--fern)', color: '#ffffff', padding: '3px 10px', fontSize: '11px', borderRadius: '20px' }}>
                      {isEn ? 'Currently Active ✅' : 'Sedang Aktif Digunakan ✅'}
                    </span>
                  ) : (
                    <span className="badge" style={{ background: 'var(--dew)', color: 'var(--stone)', padding: '3px 10px', fontSize: '11px', borderRadius: '20px' }}>
                      {isEn ? 'Preview (Not Active)' : 'Pratinjau (Belum Aktif)'}
                    </span>
                  )}
                  {isTranslating && (
                    <span style={{ fontSize: '11px', color: 'var(--fern)', fontWeight: 600 }}>
                      ⟳ {isEn ? 'Translating indicators...' : 'Menerjemahkan indikator...'}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {getPresetDescription(selectedPreset, lang)}
                </p>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--stone)' }}>
                  {getPresetRubricType(selectedPreset) === 'binary_count' || getPresetRubricType(selectedPreset) === 'quantitative_count' ? (
                    <>
                      {isEn ? 'Evaluation Mode:' : 'Metode Penilaian:'}{' '}
                      <strong style={{ color: 'var(--fern)' }}>
                        {isEn ? 'Quantitative Real Values (Actual Value + Unit / 0 if none)' : 'Nilai Riil Kuantitatif (Angka + Satuan Sesuai Laporan / 0 jika tidak ada)'}
                      </strong>{' '}
                      • {isEn ? 'Total Indicators:' : 'Total Indikator:'} <strong>{selectedPreset.indicators.length}</strong>
                    </>
                  ) : (
                    <>
                      {isEn ? 'Maximum Total Score:' : 'Total Skor Maksimal:'}{' '}
                      <strong>
                        {getPresetMaxScore(selectedPreset)} {isEn ? 'Points' : 'Poin'}
                      </strong>{' '}
                      ({selectedPreset.indicators.length} {isEn ? 'Indicators' : 'Indikator'} × {getPresetRubric(selectedPreset).length > 0 ? Math.max(...getPresetRubric(selectedPreset).map(r => Number(r.score) || 0)) : 5}).
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedPreset.id !== activePresetId && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSelectActivePreset(selectedPreset.id)}
                  >
                    <Check size={14} />
                    <span>{isEn ? 'Activate This Preset' : 'Aktifkan Preset Ini'}</span>
                  </button>
                )}

                {!selectedPreset.isDefault && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => openRubricModal()}
                    title={isEn ? 'Customize scoring rubric tiers or switch to binary presence count' : 'Sesuaikan tingkatan nilai rubrik atau ubah ke mode hitung pengungkapan tanpa nilai'}
                  >
                    <Edit2 size={13} />
                    <span>{isEn ? 'Edit Rubric' : 'Edit Rubrik'}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => openIndicatorModal()}
                >
                  <Plus size={14} />
                  <span>{isEn ? 'Add Indicator' : 'Tambah Indikator'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setParsedImportItems([]);
                    setImportError(null);
                    setImportStatusNote(null);
                    setShowImportModal(true);
                  }}
                  title={isEn ? 'Import indicators from Excel, Word, Google Sheets, or Google Docs' : 'Impor indikator dari Excel, Word, Google Sheets, atau Google Docs'}
                >
                  <Upload size={14} />
                  <span>{isEn ? 'Import' : 'Impor'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowTemplateModal(true)}
                  title={isEn ? 'Download template files (Excel, Word) and format guides' : 'Unduh template berkas (Excel, Word) dan panduan format Google Sheets/Docs'}
                >
                  <FileSpreadsheet size={14} />
                  <span>{isEn ? 'Template & Guide' : 'Panduan & Template'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Rubrik Penilaian Skor Dinamis */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div className="card-title" style={{ margin: 0 }}>
                <div className="ct-icon">🎯</div>
                <span>
                  {getPresetRubricType(selectedPreset) === 'binary_count' || getPresetRubricType(selectedPreset) === 'quantitative_count'
                    ? (isEn ? 'Rubric: Quantitative Real Metric Disclosure' : 'Ketentuan Rubrik: Nilai Riil Kuantitatif Pengungkapan')
                    : (isEn
                        ? `Scoring Rubric Guidelines (${getPresetRubric(selectedPreset).length > 0 ? Math.min(...getPresetRubric(selectedPreset).map(r => Number(r.score) || 0)) : 0} – ${getPresetRubric(selectedPreset).length > 0 ? Math.max(...getPresetRubric(selectedPreset).map(r => Number(r.score) || 0)) : 5})`
                        : `Ketentuan Rubrik Penilaian Skor (${getPresetRubric(selectedPreset).length > 0 ? Math.min(...getPresetRubric(selectedPreset).map(r => Number(r.score) || 0)) : 0} – ${getPresetRubric(selectedPreset).length > 0 ? Math.max(...getPresetRubric(selectedPreset).map(r => Number(r.score) || 0)) : 5})`)}
                </span>
              </div>

              {!selectedPreset.isDefault && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => openRubricModal()}
                >
                  <Edit2 size={13} />
                  <span>{isEn ? 'Edit Rubric Guidelines' : 'Edit Rubrik Penilaian'}</span>
                </button>
              )}
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              {getPresetRubricType(selectedPreset) === 'binary_count' || getPresetRubricType(selectedPreset) === 'quantitative_count' ? (
                isEn ? (
                  <>
                    Indicators are evaluated by <strong>extracting actual quantitative values and units</strong> found in the report analysis result (e.g. 1000000 liters, 25000 ton CO2e, 50000 kWh). If not disclosed, recorded simply as <strong>0</strong>:
                  </>
                ) : (
                  <>
                    Setiap indikator yang ada isinya disesuaikan dengan <strong>nilai dan satuan yang ada pada hasil analisis laporan</strong> (misal: 1000000 liter, 25000 ton CO2e, 50000 kWh). Jika tidak ada pengungkapan (hasil 0), cukup ditulis <strong>0</strong>:
                  </>
                )
              ) : (
                isEn ? (
                  <>
                    Each indicator is evaluated on a scale of <strong>{getPresetRubric(selectedPreset).length > 0 ? Math.min(...getPresetRubric(selectedPreset).map(r => Number(r.score) || 0)) : 0} to {getPresetRubric(selectedPreset).length > 0 ? Math.max(...getPresetRubric(selectedPreset).map(r => Number(r.score) || 0)) : 5}</strong> based on the breadth and depth of disclosure evidence:
                  </>
                ) : (
                  <>
                    Setiap indikator dievaluasi dalam rentang <strong>{getPresetRubric(selectedPreset).length > 0 ? Math.min(...getPresetRubric(selectedPreset).map(r => Number(r.score) || 0)) : 0} hingga {getPresetRubric(selectedPreset).length > 0 ? Math.max(...getPresetRubric(selectedPreset).map(r => Number(r.score) || 0)) : 5}</strong> berdasarkan keluasan bukti pengungkapan:
                  </>
                )
              )}
            </p>

            <div className="grid-3" style={{ gridTemplateColumns: getPresetRubric(selectedPreset).length <= 2 ? 'repeat(auto-fit, minmax(280px, 1fr))' : undefined }}>
              {getPresetRubric(selectedPreset).map(item => (
                <div key={item.score} style={{ background: 'var(--dew)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span
                      className={`score-badge score-${Math.min(Number(item.score) || 0, 5)}`}
                      style={{ minWidth: '28px', textAlign: 'center', padding: '2px 8px', borderRadius: '6px' }}
                    >
                      {item.score}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                      {isEn ? (item.label_en || item.label) : item.label}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--stone)', lineHeight: '1.4' }}>
                    {isEn ? (item.desc_en || item.desc) : item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Rincian Daftar Indikator Milik Preset */}
          <div className="card">
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="ct-icon">📋</div>
                <span>
                  {isEn
                    ? `Indicator List (${selectedPreset.indicators.length})`
                    : `Daftar Indikator (${selectedPreset.indicators.length})`}
                </span>
              </div>
            </div>

            {selectedPreset.indicators.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--stone)', fontStyle: 'italic' }}>
                {isEn ? (
                  <>
                    No indicators in this preset yet. Click <strong>"Add Indicator"</strong> above to add one.
                  </>
                ) : (
                  <>
                    Belum ada indikator dalam preset ini. Silakan klik tombol <strong>"Tambah Indikator"</strong> di atas.
                  </>
                )}
              </div>
            ) : (
              <div>
                {selectedPreset.indicators.map(ind => (
                  <div key={ind.id || ind.code} className="indicator-edit-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div
                          style={{
                            background: 'var(--dew)',
                            color: 'var(--fern)',
                            fontWeight: 800,
                            fontSize: '13px',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            minWidth: '60px',
                            textAlign: 'center',
                            border: '1px solid var(--border)'
                          }}
                        >
                          {ind.code}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                              {getIndicatorTitle(ind, lang)}
                            </h4>
                            {ind.group && (
                              <span style={{ fontSize: '11px', color: 'var(--stone)', background: 'var(--cream)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                {getIndicatorGroup(ind, lang)}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '12.5px', color: 'var(--stone)', marginTop: '4px', lineHeight: '1.5' }}>
                            {getIndicatorDesc(ind, lang) || (isEn ? 'No detailed description.' : 'Tidak ada deskripsi detail.')}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 8px', borderColor: 'var(--border)' }}
                          onClick={() => openIndicatorModal(ind)}
                          title={isEn ? 'Edit Indicator' : 'Edit Indikator'}
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 8px', color: 'var(--danger)', borderColor: 'var(--border)' }}
                          onClick={() => handleDeleteIndicator(ind.id, ind.code)}
                          title={isEn ? 'Delete Indicator' : 'Hapus Indikator'}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================
          MODAL POP-UP TENGAH: LANGKAH 1 — TAMBAH PRESET INDIKATOR BARU
          ======================================================== */}
      {showPresetModal && (
        <div className="modal-backdrop" onClick={() => setShowPresetModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🌱</span>
                <div>
                  <span className="modal-step-pill" style={{ marginBottom: '4px' }}>
                    {isEn ? 'Step 1 of 2 • Preset Identity' : 'Langkah 1 dari 2 • Identitas Preset'}
                  </span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--bark)' }}>
                    {isEn ? 'Add New Indicator Preset' : 'Tambah Pilihan Indikator (Preset Baru)'}
                  </h3>
                </div>
              </div>
              <button type="button" className="drawer-close-btn" onClick={() => setShowPresetModal(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12.5px', color: 'var(--stone)', marginBottom: '16px' }}>
              {isEn
                ? 'Fill in the preset name and description first. In the next step, this pop-up will immediately proceed to input your custom indicators.'
                : 'Isi nama dan deskripsi kumpulan indikator terlebih dahulu. Setelah disimpan, pop-up ini otomatis berlanjut ke pengisian daftar indikator.'}
            </p>

            <form onSubmit={handleCreatePreset}>
              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>
                  {isEn ? 'INDICATOR PRESET NAME' : 'NAMA PRESET INDIKATOR'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={
                    isEn
                      ? 'e.g., GRI Standards 2026 or Coal Sector Indicators'
                      : 'Misal: Standar GRI 2026 atau Indikator Sektor Batubara'
                  }
                  value={presetFormName}
                  onChange={e => setPresetFormName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>
                  {isEn ? 'INITIAL SCORING RUBRIC TYPE' : 'TIPE RUBRIK PENILAIAN AWAL'}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setPresetFormRubricType('weighted')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: `1.5px solid ${presetFormRubricType === 'weighted' ? 'var(--fern)' : 'var(--border)'}`,
                      background: presetFormRubricType === 'weighted' ? 'var(--dew)' : 'var(--surface)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px' }}>⭐</span>
                      <strong style={{ fontSize: '12.5px', color: 'var(--text)' }}>
                        {isEn ? 'Weighted Score (0–5)' : 'Skala Skor Berbobot'}
                      </strong>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--stone)', lineHeight: '1.3' }}>
                      {isEn
                        ? 'Standard 0–5 CED scale, can be customized up to 100 with unlimited tiers.'
                        : 'Default skala 0–5 CED, dapat diedit hingga 100 dengan tingkatan tak terbatas.'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPresetFormRubricType('quantitative_count')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: `1.5px solid ${presetFormRubricType === 'quantitative_count' || presetFormRubricType === 'binary_count' ? 'var(--fern)' : 'var(--border)'}`,
                      background: presetFormRubricType === 'quantitative_count' || presetFormRubricType === 'binary_count' ? 'var(--dew)' : 'var(--surface)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px' }}>📋</span>
                      <strong style={{ fontSize: '12.5px', color: 'var(--text)' }}>
                        {isEn ? 'Quantitative Disclosure (Real Values)' : 'Hitung Pengungkapan (Nilai Riil)'}
                      </strong>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--stone)', lineHeight: '1.3' }}>
                      {isEn
                        ? 'Extracts actual quantitative metric and unit from report. If not disclosed, records 0.'
                        : 'Isi disesuaikan dengan nilai dan satuan pada hasil analisis laporan. Jika hasil 0, cukup ditulis 0.'}
                    </div>
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>
                  {isEn ? 'DESCRIPTION (OPTIONAL)' : 'DESKRIPSI (OPSIONAL)'}
                </label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder={
                    isEn
                      ? 'Brief explanation of the purpose or standard of this indicator set...'
                      : 'Penjelasan singkat mengenai tujuan atau standar kumpulan indikator ini...'
                  }
                  value={presetFormDesc}
                  onChange={e => setPresetFormDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPresetModal(false)}>
                  {isEn ? 'Cancel' : 'Batal'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ color: 'var(--fern)', borderColor: 'var(--border)' }}
                  onClick={() => handleCreatePreset(undefined, 'rubric')}
                >
                  <Sliders size={13} />
                  <span>{isEn ? 'Save & Edit Rubric' : 'Simpan & Atur Rubrik'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => handleCreatePreset(undefined, 'indicators')}
                >
                  <span>{isEn ? 'Save & Input Indicators' : 'Simpan & Lanjut Input Indikator'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL POP-UP TENGAH: LANGKAH 2 — TAMBAH / EDIT INDIKATOR MANUAL
          ======================================================== */}
      {showIndicatorModal && (
        <div className="modal-backdrop" onClick={() => setShowIndicatorModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📋</span>
                <div>
                  {isChainedFromPreset && !editingIndicator && (
                    <span className="modal-step-pill" style={{ marginBottom: '4px' }}>
                      {isEn ? 'Step 2 of 2 • Input Indicators' : 'Langkah 2 dari 2 • Input Indikator'}
                    </span>
                  )}
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--bark)' }}>
                    {editingIndicator
                      ? isEn
                        ? `Edit Indicator ${editingIndicator.code}`
                        : `Edit Indikator ${editingIndicator.code}`
                      : isEn
                        ? `Add Indicator to "${getPresetName(selectedPreset, lang)}"`
                        : `Tambah Indikator ke "${getPresetName(selectedPreset, lang)}"`}
                  </h3>
                </div>
              </div>
              <button type="button" className="drawer-close-btn" onClick={() => setShowIndicatorModal(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Ringkasan indikator yang sudah masuk ke preset ini */}
            {!editingIndicator && selectedPreset.indicators.length > 0 && (
              <div
                style={{
                  background: 'var(--dew)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginBottom: '14px'
                }}
              >
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--fern)', marginBottom: '6px' }}>
                  {isEn
                    ? `Indicators added in "${getPresetName(selectedPreset, lang)}" (${selectedPreset.indicators.length}):`
                    : `Indikator tersimpan di "${getPresetName(selectedPreset, lang)}" (${selectedPreset.indicators.length}):`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selectedPreset.indicators.map(item => (
                    <span
                      key={item.code}
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        color: 'var(--text)'
                      }}
                    >
                      <strong>{item.code}</strong>: {getIndicatorTitle(item, lang)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveIndicator}>
              <div className="grid-2" style={{ gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>
                    {isEn ? 'Indicator Code (Short)' : 'Kode Indikator (Singkat)'}
                  </label>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder={isEn ? 'e.g., WATER1, CC3, BIODIV' : 'Misal: WATER1, CC3, BIODIV'}
                    value={indFormCode}
                    onChange={e => setIndFormCode(e.target.value.toUpperCase())}
                    autoFocus
                    required
                  />
                  <div style={{ fontSize: '11px', color: 'var(--stone)', marginTop: '2px' }}>
                    {isEn ? 'Uppercase letters & numbers without spaces' : 'Huruf kapital & angka tanpa spasi'}
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>
                    {isEn ? 'Group / Category' : 'Kelompok / Kategori'}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={isEn ? 'e.g., Environmental, GHG, Governance' : 'Misal: Environmental, GHG, Governance'}
                    value={indFormGroup}
                    onChange={e => setIndFormGroup(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>
                  {isEn ? 'Indicator Title' : 'Judul Indikator'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={
                    isEn
                      ? 'e.g., Water Recycling & Conservation Management'
                      : 'Misal: Pengelolaan Daur Ulang Air & Konservasi'
                  }
                  value={indFormTitle}
                  onChange={e => setIndFormTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>
                  {isEn ? 'Assessment Guideline Description' : 'Deskripsi Panduan Penilaian'}
                </label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder={
                    isEn
                      ? 'Detailed criteria of what information the AI should look for in the report and how to score it...'
                      : 'Rincian panduan informasi apa yang harus dicari AI dalam dokumen dan bagaimana kriteria penilaiannya...'
                  }
                  value={indFormDesc}
                  onChange={e => setIndFormDesc(e.target.value)}
                />
                <div style={{ fontSize: '11px', color: 'var(--fern)', marginTop: '4px' }}>
                  🌐{' '}
                  {isEn
                    ? 'Input in Indonesian or English — automatically translated when switching display language.'
                    : 'Dapat diisi dalam Bahasa Indonesia maupun Inggris — otomatis diterjemahkan saat bahasa tampilan diubah.'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  {!editingIndicator && selectedPreset.indicators.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ borderColor: 'var(--fern)', color: 'var(--fern)', fontWeight: 700 }}
                      onClick={() => setShowIndicatorModal(false)}
                    >
                      <Check size={14} />
                      <span>
                        {isEn
                          ? `Done (${selectedPreset.indicators.length} Saved)`
                          : `Selesai (${selectedPreset.indicators.length} Tersimpan)`}
                      </span>
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowIndicatorModal(false)}>
                    {editingIndicator
                      ? isEn
                        ? 'Cancel'
                        : 'Batal'
                      : isEn
                        ? 'Close'
                        : 'Tutup'}
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm">
                    {editingIndicator ? (
                      isEn ? 'Save Changes' : 'Simpan Perubahan'
                    ) : (
                      <>
                        <Plus size={14} />
                        <span>{isEn ? 'Save & Add Indicator' : 'Simpan & Tambah Indikator'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ========================================================
          MODAL POP-UP: EDIT RUBRIK PENILAIAN INDIKATOR
          ======================================================== */}
      {showRubricModal && (
        <div className="modal-backdrop" onClick={() => setShowRubricModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="ct-icon" style={{ fontSize: '20px' }}>🎯</div>
                <div>
                  <h3 style={{ fontSize: '16.5px', fontWeight: 800, color: 'var(--bark)' }}>
                    {isEn ? 'Edit Scoring Rubric' : 'Edit Rubrik Penilaian'}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--stone)' }}>
                    {getPresetName(selectedPreset, lang)}
                  </div>
                </div>
              </div>
              <button type="button" className="drawer-close-btn" onClick={() => setShowRubricModal(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Pilihan Mode Rubrik */}
            <div style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '6px' }}>
                {isEn ? 'SCORING METHOD & RUBRIC MODE' : 'METODE PENILAIAN & MODE RUBRIK'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => handleSwitchRubricMode('weighted')}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: `2px solid ${rubricModalType === 'weighted' ? 'var(--fern)' : 'var(--border)'}`,
                    background: rubricModalType === 'weighted' ? 'var(--dew)' : 'var(--surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span>⭐</span>
                    <strong style={{ fontSize: '13px', color: 'var(--text)' }}>
                      {isEn ? 'Weighted Score Scale' : 'Skala Skor Berbobot'}
                    </strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--stone)', lineHeight: '1.4' }}>
                    {isEn
                      ? 'Custom point levels (e.g. 0–5, 0–10, up to 100) with unlimited tiers.'
                      : 'Tingkatan poin berbobot (misal 0–5, 0–10, hingga nilai 100), tingkatan tak terbatas.'}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSwitchRubricMode('quantitative_count')}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: `2px solid ${rubricModalType === 'quantitative_count' || rubricModalType === 'binary_count' ? 'var(--fern)' : 'var(--border)'}`,
                    background: rubricModalType === 'quantitative_count' || rubricModalType === 'binary_count' ? 'var(--dew)' : 'var(--surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span>📋</span>
                    <strong style={{ fontSize: '13px', color: 'var(--text)' }}>
                      {isEn ? 'Quantitative Disclosure (Real Values)' : 'Hitung Pengungkapan (Nilai Riil)'}
                    </strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--stone)', lineHeight: '1.4' }}>
                    {isEn
                      ? 'Extracts actual value & unit from report analysis. If no disclosure, records 0.'
                      : 'Isi disesuaikan dengan nilai & satuan pada hasil analisis laporan. Jika hasil 0, cukup ditulis 0.'}
                  </div>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveRubric}>
              {/* Petunjuk / Action Bar Rubrik */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--stone)' }}>
                  {isEn
                    ? `Rubric Tiers (${rubricModalItems.length} Levels):`
                    : `Tingkatan Rubrik (${rubricModalItems.length} Level):`}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {rubricModalType === 'weighted' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                        onClick={handleResetRubricToCED}
                        title={isEn ? 'Reset to CED Standard (0–5)' : 'Kembalikan ke Standar CED (0–5)'}
                      >
                        <RefreshCw size={12} />
                        <span>{isEn ? 'Reset to CED (0–5)' : 'Reset ke CED (0–5)'}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                        onClick={handleAddRubricTier}
                      >
                        <Plus size={12} />
                        <span>{isEn ? 'Add Tier' : 'Tambah Tingkat'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Banner Info jika Quantitative / Disclosure Count */}
              {(rubricModalType === 'quantitative_count' || rubricModalType === 'binary_count') && (
                <div
                  style={{
                    background: 'var(--dew)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)'
                  }}
                >
                  💡 <strong>{isEn ? 'Quantitative Disclosure Mode (Real Values):' : 'Mode Nilai Riil Pengungkapan (Kuantitatif):'}</strong>{' '}
                  {isEn
                    ? 'AI extracts the exact quantitative number and unit stated in the report file (e.g. 1000000 liters, 25000 ton CO2e). If not disclosed, it records 0.'
                    : 'Untuk indikator yang ada isinya disesuaikan dengan nilai dan satuan pada hasil analisis laporan (misal: 1000000 liter, 25000 ton CO2e). Jika tidak ada pengungkapan, cukup ditulis 0.'}
                </div>
              )}

              {/* Daftar Tingkatan Rubrik */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px', marginBottom: '16px' }}>
                {rubricModalItems.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      background: 'var(--dew)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ minWidth: '85px' }}>
                        <label style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--stone)', display: 'block', marginBottom: '2px' }}>
                          {isEn ? 'SCORE VALUE' : 'NILAI SKOR'}
                        </label>
                        <input
                          type="text"
                          className="form-input font-mono"
                          style={{
                            padding: '4px 8px',
                            fontWeight: 800,
                            fontSize: '13px',
                            textAlign: 'center',
                            background: 'var(--surface)',
                            color: 'var(--text)'
                          }}
                          value={item.score}
                          onChange={e => handleRubricItemChange(index, 'score', e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--stone)', display: 'block', marginBottom: '2px' }}>
                          {isEn ? 'TIER LABEL' : 'LABEL TINGKATAN'}
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ padding: '4px 8px', fontSize: '12.5px', background: 'var(--surface)', color: 'var(--text)' }}
                          placeholder={isEn ? 'e.g. 5: > 1 Full A4 Page' : 'Misal: 5: > 1 Halaman A4'}
                          value={isEn ? (item.label_en || item.label) : item.label}
                          onChange={e => handleRubricItemChange(index, isEn ? 'label_en' : 'label', e.target.value)}
                          required
                        />
                      </div>

                      {rubricModalType === 'weighted' && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{
                            padding: '6px 8px',
                            color: 'var(--danger)',
                            borderColor: 'var(--border)',
                            alignSelf: 'flex-end',
                            marginBottom: '2px'
                          }}
                          onClick={() => handleRemoveRubricTier(index)}
                          disabled={rubricModalItems.length <= 2}
                          title={isEn ? 'Delete Tier' : 'Hapus Tingkat'}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--stone)', display: 'block', marginBottom: '2px' }}>
                        {isEn ? 'EVALUATION CRITERIA & EVIDENCE DESCRIPTION' : 'KRITERIA PENILAIAN & KELUASAN BUKTI'}
                      </label>
                      <textarea
                        className="form-textarea"
                        rows={2}
                        style={{ padding: '6px 8px', fontSize: '12px', background: 'var(--surface)', color: 'var(--text)' }}
                        placeholder={isEn ? 'Describe the criteria for awarding this score...' : 'Jelaskan kriteria dan bukti untuk memperoleh skor ini...'}
                        value={isEn ? (item.desc_en || item.desc) : item.desc}
                        onChange={e => handleRubricItemChange(index, isEn ? 'desc_en' : 'desc', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Ringkasan Skor Maksimal */}
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '12px'
                }}
              >
                <span style={{ color: 'var(--stone)' }}>
                  {isEn ? 'Total Preset Calculation:' : 'Kalkulasi Total Preset:'}
                </span>
                <strong style={{ color: 'var(--fern)' }}>
                  {rubricModalType === 'quantitative_count' || rubricModalType === 'binary_count'
                    ? `${selectedPreset.indicators.length} ${isEn ? 'Quantitative Disclosed Indicators Max' : 'Indikator Nilai Riil Maksimal'}`
                    : `${selectedPreset.indicators.length * (rubricModalItems.length > 0 ? Math.max(...rubricModalItems.map(r => Number(r.score) || 0)) : 5)} ${isEn ? 'Points Max' : 'Poin Maksimal'} (${selectedPreset.indicators.length} × ${rubricModalItems.length > 0 ? Math.max(...rubricModalItems.map(r => Number(r.score) || 0)) : 5})`}
                </strong>
              </div>

              {/* Tombol Aksi */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowRubricModal(false)}>
                  {isEn ? 'Cancel' : 'Batal'}
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={14} />
                  <span>{isEn ? 'Save Rubric Guidelines' : 'Simpan Rubrik Penilaian'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL POP-UP: PANDUAN FORMAT & TEMPLATE UNDUHAN
          ======================================================== */}
      {showTemplateModal && (
        <div className="modal-backdrop" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="ct-icon" style={{ fontSize: '20px' }}>📄</div>
                <div>
                  <h3 style={{ fontSize: '16.5px', fontWeight: 800, color: 'var(--bark)' }}>
                    {isEn ? 'Indicator Template & Formatting Guide' : 'Panduan Format & Template Indikator'}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--stone)' }}>
                    {isEn
                      ? 'Download ready-to-use template files or configure Google Sheets / Docs'
                      : 'Unduh berkas template siap pakai atau sesuaikan Google Sheets / Docs Anda'}
                  </div>
                </div>
              </div>
              <button type="button" className="drawer-close-btn" onClick={() => setShowTemplateModal(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Template Download Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              {/* Card 1: Excel */}
              <div
                style={{
                  background: 'var(--dew)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <FileSpreadsheet size={20} style={{ color: 'var(--fern)' }} />
                    <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>
                      {isEn ? 'Microsoft Excel Template' : 'Template Microsoft Excel'}
                    </strong>
                  </div>
                  <p style={{ fontSize: '11.5px', color: 'var(--stone)', lineHeight: '1.4', margin: '0 0 12px 0' }}>
                    {isEn
                      ? 'Pre-configured .xlsx spreadsheet with column headers, sample rows, and guidelines.'
                      : 'Format tabel .xlsx siap pakai dengan tajuk kolom, contoh baris indikator, dan lembar panduan.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700 }}
                  onClick={handleDownloadExcelTemplate}
                >
                  <Download size={14} />
                  <span>{isEn ? 'Download .xlsx Template' : 'Unduh Template .xlsx'}</span>
                </button>
              </div>

              {/* Card 2: Word */}
              <div
                style={{
                  background: 'var(--dew)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <FileText size={20} style={{ color: 'var(--fern)' }} />
                    <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>
                      {isEn ? 'Microsoft Word Template' : 'Template Microsoft Word'}
                    </strong>
                  </div>
                  <p style={{ fontSize: '11.5px', color: 'var(--stone)', lineHeight: '1.4', margin: '0 0 12px 0' }}>
                    {isEn
                      ? 'Pre-formatted .docx document containing a clean 4-column structured table.'
                      : 'Format berkas .docx dengan tabel rapi 4 kolom (Kode, Judul, Kategori, Deskripsi).'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700 }}
                  onClick={handleDownloadDocxTemplate}
                >
                  <Download size={14} />
                  <span>{isEn ? 'Download .docx Template' : 'Unduh Template .docx'}</span>
                </button>
              </div>
            </div>

            {/* Panduan Struktur Kolom */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '12px',
                lineHeight: '1.5'
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--bark)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Info size={15} style={{ color: 'var(--fern)' }} />
                <span>{isEn ? 'Standard Column Structure Requirements:' : 'Ketentuan Struktur Kolom Standar:'}</span>
              </div>
              <ul style={{ margin: '0 0 10px 0', paddingLeft: '18px', color: 'var(--text-secondary)' }}>
                <li>
                  <strong>{isEn ? 'Column 1 (Code):' : 'Kolom 1 (Kode):'}</strong> {isEn ? 'Unique indicator code (e.g. CC1, GHG2, IND_01). Required.' : 'Kode unik indikator (misal CC1, GHG2, IND_01). Wajib diisi.'}
                </li>
                <li>
                  <strong>{isEn ? 'Column 2 (Title):' : 'Kolom 2 (Judul):'}</strong> {isEn ? 'Full indicator title / parameter name. Required.' : 'Nama lengkap atau judul parameter indikator. Wajib diisi.'}
                </li>
                <li>
                  <strong>{isEn ? 'Column 3 (Group / Category):' : 'Kolom 3 (Kategori):'}</strong> {isEn ? 'Category or group name (e.g. Environmental, Social). Optional (default "General").' : 'Kelompok pengungkapan (misal Lingkungan, Tata Kelola). Opsional (default "Umum").'}
                </li>
                <li>
                  <strong>{isEn ? 'Column 4 (Description):' : 'Kolom 4 (Deskripsi):'}</strong> {isEn ? 'Detailed scoring guidance and evaluation context for Gemini AI. Recommended.' : 'Pedoman penilaian dan konteks yang dicari AI di laporan PDF. Sangat dianjurkan.'}
                </li>
              </ul>

              <div style={{ fontSize: '11.5px', color: 'var(--stone)', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                🔗 <strong>{isEn ? 'Using Google Sheets / Google Docs Links:' : 'Menggunakan Link Google Sheets / Docs:'}</strong>{' '}
                {isEn
                  ? 'Set share access to "Anyone with the link can view". Paste the spreadsheet or document URL in the Import tab.'
                  : 'Pastikan akses berbagi disetel ke "Siapa saja yang memiliki link dapat melihat". Tempel link spreadsheet atau dokumen pada tab Impor.'}
              </div>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowTemplateModal(false)}>
                {isEn ? 'Close' : 'Tutup'}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={() => {
                  setShowTemplateModal(false);
                  setParsedImportItems([]);
                  setImportError(null);
                  setImportStatusNote(null);
                  setShowImportModal(true);
                }}
              >
                <Upload size={14} />
                <span>{isEn ? 'Open Import Tool' : 'Buka Menu Impor'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL POP-UP: IMPOR INDIKATOR (FILE / LINK / PASTE)
          ======================================================== */}
      {showImportModal && (
        <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '740px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="ct-icon" style={{ fontSize: '20px' }}>📥</div>
                <div>
                  <h3 style={{ fontSize: '16.5px', fontWeight: 800, color: 'var(--bark)' }}>
                    {isEn ? 'Import Indicators' : 'Impor Pilihan Indikator'}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--stone)' }}>
                    {isEn ? 'Target Preset:' : 'Preset Tujuan:'} <strong style={{ color: 'var(--fern)' }}>{getPresetName(selectedPreset, lang)}</strong>
                  </div>
                </div>
              </div>
              <button type="button" className="drawer-close-btn" onClick={() => setShowImportModal(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Tab Selector */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`btn btn-sm ${importTab === 'file' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setImportTab('file')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Upload size={13} />
                <span>{isEn ? 'Upload File (Excel / Word / CSV)' : 'Unggah File (Excel / Word / CSV)'}</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${importTab === 'link' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setImportTab('link')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Link2 size={13} />
                <span>{isEn ? 'Google Sheets / Docs Link' : 'Link Google Sheets / Docs'}</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${importTab === 'paste' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setImportTab('paste')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <FileText size={13} />
                <span>{isEn ? 'Paste Text' : 'Salin & Tempel'}</span>
              </button>
            </div>

            {/* Error & Warning Note */}
            {importError && (
              <div className="alert alert-danger" style={{ marginBottom: '14px', fontSize: '12px' }}>
                <span>⚠️</span>
                <span>{importError}</span>
              </div>
            )}
            {importStatusNote && (
              <div className="alert alert-info" style={{ marginBottom: '14px', fontSize: '12px' }}>
                <span>ℹ️</span>
                <span>{importStatusNote}</span>
              </div>
            )}

            {/* Tab 1: File Upload */}
            {importTab === 'file' && (
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: '12px',
                    padding: '24px 16px',
                    textAlign: 'center',
                    background: 'var(--dew)',
                    transition: 'border-color 0.2s',
                    position: 'relative'
                  }}
                >
                  <FileSpreadsheet size={36} style={{ color: 'var(--fern)', margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                    {isEn ? 'Choose or drop your indicator spreadsheet or document' : 'Pilih atau letakkan berkas spreadsheet / dokumen indikator'}
                  </p>
                  <p style={{ fontSize: '11.5px', color: 'var(--stone)', marginBottom: '14px' }}>
                    {isEn ? 'Supported formats: .xlsx, .xls, .csv, .docx, .doc' : 'Format didukung: .xlsx, .xls, .csv, .docx, .doc'}
                  </p>

                  <label
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                  >
                    <Upload size={14} />
                    <span>{isProcessingImport ? (isEn ? 'Reading File...' : 'Membaca Berkas...') : (isEn ? 'Select File' : 'Pilih Berkas')}</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.docx,.doc,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                      onChange={handleImportFileUpload}
                      disabled={isProcessingImport}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px' }}>
                  <span style={{ color: 'var(--stone)' }}>
                    {isEn ? 'Need the official format structure?' : 'Belum memiliki format yang sesuai?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTemplateModal(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--fern)', cursor: 'pointer', fontWeight: 700, padding: 0 }}
                  >
                    📄 {isEn ? 'Download Templates & Guidelines' : 'Unduh Template & Panduan'}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Online Link Fetch */}
            {importTab === 'link' && (
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '6px' }}>
                  {isEn ? 'GOOGLE SHEETS OR GOOGLE DOCS LINK' : 'LINK GOOGLE SHEETS ATAU GOOGLE DOCS'}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://docs.google.com/spreadsheets/d/... atau https://docs.google.com/document/d/..."
                    value={importLinkUrl}
                    onChange={e => setImportLinkUrl(e.target.value)}
                    style={{ flex: 1, fontSize: '12.5px' }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleImportLinkFetch}
                    disabled={isProcessingImport || !importLinkUrl.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {isProcessingImport ? (
                      <span>⟳ {isEn ? 'Fetching...' : 'Mengambil...'}</span>
                    ) : (
                      <>
                        <Download size={14} />
                        <span>{isEn ? 'Fetch Data' : 'Ambil Data'}</span>
                      </>
                    )}
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--stone)', marginTop: '6px', lineHeight: '1.4' }}>
                  💡 {isEn
                    ? 'Ensure link sharing permission is set to "Anyone with the link can view". Google Docs must contain a 4-column table.'
                    : 'Pastikan akses tautan disetel "Siapa saja yang memiliki link dapat melihat". Google Docs harus memuat tabel 4 kolom.'}
                </div>
              </div>
            )}

            {/* Tab 3: Paste Raw Text */}
            {importTab === 'paste' && (
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '6px' }}>
                  {isEn ? 'PASTE TEXT / TAB-SEPARATED ROWS' : 'SALIN & TEMPEL TEKS / BARIS PEMISAH TAB ATAU PIPA'}
                </label>
                <textarea
                  className="form-textarea font-mono"
                  rows={5}
                  placeholder={
                    isEn
                      ? "CC1\tClimate Change Commitment\tEnvironmental\tCompany disclosure of emissions...\nGHG1\tScope 1 Emissions\tGHG\tDirect emissions from operations..."
                      : "CC1\tKomitmen Perubahan Iklim\tLingkungan\tPengungkapan komitmen reduksi emisi...\nGHG1\tEmisi Cakupan 1\tGRK\tRincian data emisi langsung..."
                  }
                  value={importPasteText}
                  onChange={e => setImportPasteText(e.target.value)}
                  style={{ fontSize: '12px', marginBottom: '8px' }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleImportPasteProcess}
                  disabled={!importPasteText.trim()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Check size={14} />
                  <span>{isEn ? 'Extract Indicators' : 'Ekstrak Indikator'}</span>
                </button>
              </div>
            )}

            {/* Preview & Import Options (If items are parsed) */}
            {parsedImportItems.length > 0 && (
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px' }}>✅</span>
                    <strong style={{ fontSize: '13px', color: 'var(--fern)' }}>
                      {parsedImportItems.length} {isEn ? 'Indicators Successfully Detected' : 'Indikator Berhasil Terbaca'}
                    </strong>
                  </div>

                  {/* Mode Impor: Append vs Replace */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px' }}>
                    <span style={{ color: 'var(--stone)', fontWeight: 600 }}>
                      {isEn ? 'Import Mode:' : 'Mode Penggabungan:'}
                    </span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="importMode"
                        value="append"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                      />
                      <span>{isEn ? 'Append' : 'Tambahkan'}</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                      />
                      <span>{isEn ? 'Replace All' : 'Gantikan Seluruhnya'}</span>
                    </label>
                  </div>
                </div>

                {/* Table Preview */}
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <table className="results-table" style={{ fontSize: '11px', margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>#</th>
                        <th style={{ width: '80px' }}>{isEn ? 'Code' : 'Kode'}</th>
                        <th style={{ width: '110px' }}>{isEn ? 'Category' : 'Kategori'}</th>
                        <th>{isEn ? 'Indicator Title' : 'Judul Indikator'}</th>
                        <th>{isEn ? 'Description' : 'Deskripsi'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedImportItems.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ textAlign: 'center', color: 'var(--stone)' }}>{idx + 1}</td>
                          <td>
                            <strong className="font-mono" style={{ color: 'var(--fern)' }}>{item.code}</strong>
                          </td>
                          <td style={{ color: 'var(--stone)' }}>{item.group}</td>
                          <td style={{ fontWeight: 600 }}>{item.title}</td>
                          <td style={{ color: 'var(--text-muted)', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.fullDesc || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setShowImportModal(false);
                  setParsedImportItems([]);
                  setImportError(null);
                  setImportStatusNote(null);
                }}
              >
                {isEn ? 'Cancel' : 'Batal'}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmImport}
                disabled={parsedImportItems.length === 0 || isProcessingImport}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Check size={14} />
                <span>
                  {isEn
                    ? `Save & Apply (${parsedImportItems.length} Indicators)`
                    : `Simpan & Terapkan (${parsedImportItems.length} Indikator)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
