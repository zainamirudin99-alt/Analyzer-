'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Search, Trash2, Printer, Copy, Check, Table, FileSpreadsheet, FileText, ExternalLink, X } from 'lucide-react';
import {
  exportResultsToExcelFile,
  exportResultsToDocxFile,
  exportResultsToCSVFile,
  copyResultsToSpreadsheetClipboard,
  copyResultsToGoogleDocsClipboard,
  openInGoogleDocs,
  ResultsExportOptions,
  ResultsExportIndicator,
  ResultsExportRow
} from '@/lib/results-export-builder';
import {
  CEDResultRecord,
  INDICATOR_KEYS,
  IndicatorPreset,
  getPresetRubricType,
  isDisclosedQuantitativeValue,
  formatCleanDisclosureLevel,
  decodeRecordAnalyzerMeta,
  resolveRecordPresetId,
  doesRecordMatchPreset,
  getRecordScoreForPresetIndicator
} from '@/lib/types';
import {
  getStoredPresets,
  saveStoredPresets,
  getActivePresetId,
  setActivePresetId,
  DEFAULT_PRESET_ID,
  createDefaultCEDPreset
} from '@/lib/indicators-storage';
import { useLanguage, getPresetName, getIndicatorTitle, ensurePresetsTranslated } from '@/lib/i18n';
import {
  getAuthHeaders,
  getCurrentAccountOwner,
  normalizeAccountUsername,
  syncCurrentSnapshotToCloud
} from '@/lib/account-sync';

interface ResultsTabProps {
  refreshTrigger: number;
}

export const ResultsTab: React.FC<ResultsTabProps> = ({ refreshTrigger }) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [results, setResults] = useState<CEDResultRecord[]>([]);
  const [presets, setPresets] = useState<IndicatorPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [isLoading, setIsLoading] = useState(false);
  const [filterCode, setFilterCode] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingGDocs, setIsExportingGDocs] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [showGDocsModal, setShowGDocsModal] = useState(false);
  const [copiedGDocsModal, setCopiedGDocsModal] = useState(false);

  const fetchResults = async () => {
    setIsLoading(true);
    setMessage(null);

    let supabaseData: CEDResultRecord[] = [];
    let localData: CEDResultRecord[] = [];
    const activeOwner = getCurrentAccountOwner();

    // 1. Ambil data dari LocalStorage (hanya milik akun aktif)
    if (typeof window !== 'undefined') {
      try {
        const rawLocal = localStorage.getItem('analyzer_records');
        if (rawLocal) {
          const parsedLocal = JSON.parse(rawLocal);
          if (Array.isArray(parsedLocal)) {
            localData = parsedLocal.filter(item => {
              if (!item || typeof item !== 'object') return false;
              const itemOwner = normalizeAccountUsername(item.owner_username);
              if (activeOwner && itemOwner && itemOwner !== activeOwner) return false;
              return true;
            });
          }
        }
      } catch (err) {
        console.warn('Error reading local cache:', err);
      }
    }

    // 2. Ambil data dari Backend / Supabase (terisolasi per akun)
    try {
      const ownerQuery = activeOwner ? `?owner=${encodeURIComponent(activeOwner)}` : '';
      const res = await fetch(`/api/results${ownerQuery}`, {
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        supabaseData = json.data.filter((item: CEDResultRecord) => {
          if (!activeOwner) return true;
          const itemOwner = normalizeAccountUsername(item?.owner_username);
          return itemOwner === activeOwner;
        });
      }
    } catch (err: any) {
      console.warn('Backend fetch notice:', err);
    }

    // 3. Gabungkan data secara terisolasi per Akun & Preset Indikator (company_code + fiscal_year + effectivePresetId)
    // agar hasil analisis dari satu akun atau pilihan indikator tidak pernah tercampur.
    const currentPresets = getStoredPresets();
    const combinedMap = new Map<string, CEDResultRecord>();

    localData.forEach(rawItem => {
      const item = decodeRecordAnalyzerMeta(rawItem);
      const itemOwner = normalizeAccountUsername(item.owner_username);
      if (activeOwner && itemOwner && itemOwner !== activeOwner) return;
      const effectivePresetId = resolveRecordPresetId(item, currentPresets);
      const normalizedItem: CEDResultRecord = {
        ...item,
        owner_username: activeOwner || itemOwner || undefined,
        preset_id: effectivePresetId,
        preset_name: effectivePresetId === DEFAULT_PRESET_ID ? undefined : item.preset_name
      };
      const key = `${normalizedItem.company_code}_${normalizedItem.fiscal_year}_${effectivePresetId}`;
      const existing = combinedMap.get(key);
      if (!existing || new Date(normalizedItem.created_at || 0).getTime() >= new Date(existing.created_at || 0).getTime()) {
        combinedMap.set(key, normalizedItem);
      }
    });

    supabaseData.forEach(rawSbItem => {
      const sbItem = decodeRecordAnalyzerMeta(rawSbItem);
      const sbOwner = normalizeAccountUsername(sbItem.owner_username);
      if (activeOwner && sbOwner !== activeOwner) return;
      const effectivePresetId = resolveRecordPresetId(sbItem, currentPresets);
      const normalizedSb: CEDResultRecord = {
        ...sbItem,
        owner_username: activeOwner || sbOwner || undefined,
        preset_id: effectivePresetId,
        preset_name: effectivePresetId === DEFAULT_PRESET_ID ? undefined : sbItem.preset_name
      };
      const key = `${normalizedSb.company_code}_${normalizedSb.fiscal_year}_${effectivePresetId}`;
      const existingLocal = combinedMap.get(key);
      if (existingLocal) {
        const localTime = new Date(existingLocal.created_at || 0).getTime();
        const sbTime = new Date(normalizedSb.created_at || 0).getTime();
        const newer = sbTime >= localTime ? normalizedSb : existingLocal;
        const older = sbTime >= localTime ? existingLocal : normalizedSb;
        const mergedDynamic =
          effectivePresetId !== DEFAULT_PRESET_ID
            ? { ...(older.dynamic_scores || {}), ...(newer.dynamic_scores || {}) }
            : newer.dynamic_scores || older.dynamic_scores;

        combinedMap.set(key, {
          ...older,
          ...newer,
          id: normalizedSb.id || existingLocal.id,
          preset_id: effectivePresetId,
          preset_name: newer.preset_name || older.preset_name,
          dynamic_scores: mergedDynamic
        });
      } else {
        combinedMap.set(key, normalizedSb);
      }
    });

    const mergedList = Array.from(combinedMap.values()).sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    setResults(mergedList);

    if (typeof window !== 'undefined') {
      localStorage.setItem('analyzer_records', JSON.stringify(mergedList));
    }

    setIsLoading(false);
  };

  const syncPresetsAndActive = () => {
    const p = getStoredPresets();
    const actId = getActivePresetId();
    setPresets(p);
    setSelectedPresetId(actId);
  };

  useEffect(() => {
    fetchResults();
    syncPresetsAndActive();
    if (typeof window !== 'undefined') {
      const handleRecordsSync = () => {
        syncPresetsAndActive();
        fetchResults();
      };
      window.addEventListener('analyzer_presets_changed', syncPresetsAndActive);
      window.addEventListener('analyzer_active_preset_changed', syncPresetsAndActive);
      window.addEventListener('analyzer_records_changed', handleRecordsSync);
      window.addEventListener('analyzer-settings-changed', handleRecordsSync);
      return () => {
        window.removeEventListener('analyzer_presets_changed', syncPresetsAndActive);
        window.removeEventListener('analyzer_active_preset_changed', syncPresetsAndActive);
        window.removeEventListener('analyzer_records_changed', handleRecordsSync);
        window.removeEventListener('analyzer-settings-changed', handleRecordsSync);
      };
    }
  }, [refreshTrigger]);

  useEffect(() => {
    const currentPresets = getStoredPresets();
    ensurePresetsTranslated(currentPresets, lang).then(({ updatedPresets, changed }) => {
      if (changed) {
        saveStoredPresets(updatedPresets);
        setPresets(updatedPresets);
      }
    });
  }, [lang]);

  // Saat pengguna memilih preset indikator di Tabel Hasil, sinkronkan ke seluruh sistem
  const handleSelectPresetInTable = (presetId: string) => {
    setSelectedPresetId(presetId);
    setActivePresetId(presetId);
  };

  const handleDelete = async (record: CEDResultRecord) => {
    const confirmMsg = isEn
      ? `Are you sure you want to delete data for ${record.company_code} (${record.fiscal_year})?`
      : `Apakah Anda yakin ingin menghapus data ${record.company_code} (${record.fiscal_year})?`;
    if (!confirm(confirmMsg)) {
      return;
    }

    const targetPresetId = resolveRecordPresetId(record, presets);
    const updatedLocal = results.filter(r => {
      if (record.id && r.id) return r.id !== record.id;
      const rPresetId = resolveRecordPresetId(r, presets);
      return !(r.company_code === record.company_code && r.fiscal_year === record.fiscal_year && rPresetId === targetPresetId);
    });
    setResults(updatedLocal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('analyzer_records', JSON.stringify(updatedLocal));
      window.dispatchEvent(new Event('analyzer_records_changed'));
      syncCurrentSnapshotToCloud();
    }

    try {
      const activeOwner = getCurrentAccountOwner();
      const ownerParam = activeOwner ? `&owner=${encodeURIComponent(activeOwner)}` : '';
      const url = record.id
        ? `/api/results?id=${record.id}${ownerParam}`
        : `/api/results?code=${record.company_code}&year=${record.fiscal_year}${ownerParam}`;

      await fetch(url, { method: 'DELETE', headers: getAuthHeaders() });
    } catch (err) {
      console.warn('Backend delete sync:', err);
    }

    setMessage({
      type: 'success',
      text: isEn
        ? `Data for ${record.company_code} (${record.fiscal_year}) deleted.`
        : `Data ${record.company_code} (${record.fiscal_year}) berhasil dihapus.`
    });
  };

  const currentPresetForColumns =
    presets.find(p => p.id === selectedPresetId) || presets[0] || createDefaultCEDPreset();

  const displayIndicatorItems: { code: string; title: string }[] =
    currentPresetForColumns && currentPresetForColumns.indicators.length > 0
      ? currentPresetForColumns.indicators.map(i => ({ code: i.code, title: getIndicatorTitle(i, lang) }))
      : INDICATOR_KEYS.map(k => ({ code: k.toUpperCase(), title: k.toUpperCase() }));

  const isQuantitativeMode =
    getPresetRubricType(currentPresetForColumns) === 'quantitative_count' ||
    getPresetRubricType(currentPresetForColumns) === 'binary_count';

  const maxPossibleScore = isQuantitativeMode ? displayIndicatorItems.length : displayIndicatorItems.length * 5;

  const getScoreForIndicator = (row: CEDResultRecord, code: string): string | number => {
    return getRecordScoreForPresetIndicator(row, code, currentPresetForColumns, presets);
  };

  const getRowTotalForActivePreset = (row: CEDResultRecord): number | string => {
    if (isQuantitativeMode) {
      const disclosedCount = displayIndicatorItems.filter(ind => {
        const val = getScoreForIndicator(row, ind.code);
        return isDisclosedQuantitativeValue(val);
      }).length;
      return `${disclosedCount}/${displayIndicatorItems.length}`;
    }
    const sum = displayIndicatorItems.reduce((acc, ind) => {
      const s = getScoreForIndicator(row, ind.code);
      return acc + (typeof s === 'number' ? s : parseFloat(String(s)) || 0);
    }, 0);
    return sum > 0 ? sum : row.total_score ?? 0;
  };

  // 1. SALIN HANYA NILAI SKOR (Sesuai Indikator Terpilih)
  const handleCopyScoresOnly = (row: CEDResultRecord, idKey: string) => {
    const scoresTsv = displayIndicatorItems.map(ind => getScoreForIndicator(row, ind.code)).join('\t');

    navigator.clipboard.writeText(scoresTsv);
    setCopiedId(`scores_${idKey}`);
    setMessage({
      type: 'success',
      text: isEn
        ? `${displayIndicatorItems.length} indicator scores for ${row.company_code} (${row.fiscal_year}) copied to clipboard! Ready to paste (Ctrl+V).`
        : `${displayIndicatorItems.length} nilai skor untuk ${row.company_code} (${row.fiscal_year}) tersalin ke clipboard! Siap di-paste (Ctrl+V) ke spreadsheet.`
    });
    setTimeout(() => setCopiedId(null), 2500);
  };

  // 2. SALIN 1 BARIS LENGKAP (+Kode & Tahun)
  const handleCopyRow = (row: CEDResultRecord, idKey: string) => {
    const scores = displayIndicatorItems.map(ind => getScoreForIndicator(row, ind.code));
    const rowTsv = [row.company_code, row.fiscal_year, ...scores, getRowTotalForActivePreset(row)].join('\t');

    navigator.clipboard.writeText(rowTsv);
    setCopiedId(`row_${idKey}`);
    setMessage({
      type: 'success',
      text: isEn
        ? `Full row for ${row.company_code} (${row.fiscal_year}) copied to clipboard!`
        : `Baris lengkap ${row.company_code} (${row.fiscal_year}) tersalin ke clipboard!`
    });
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filteredResults = results.filter(item => {
    const matchCode = !filterCode || item.company_code.toLowerCase().includes(filterCode.toLowerCase());
    const matchYear = !filterYear || item.fiscal_year === filterYear;
    const matchPreset = doesRecordMatchPreset(item, currentPresetForColumns, presets);
    return matchCode && matchYear && matchPreset;
  });

  const totalCount = filteredResults.length;
  const numericScoresArray = filteredResults.map(r => {
    const raw = getRowTotalForActivePreset(r);
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && raw.includes('/')) {
      const parts = raw.split('/');
      return parseFloat(parts[0]) || 0;
    }
    return parseFloat(String(raw)) || 0;
  });
  const avgScore = totalCount > 0 ? (numericScoresArray.reduce((a, b) => a + b, 0) / totalCount).toFixed(1) : '0.0';
  const maxScore = totalCount > 0 ? Math.max(...numericScoresArray) : 0;
  const minScore = totalCount > 0 ? Math.min(...numericScoresArray) : 0;
  const topCompany = filteredResults.find((_, idx) => numericScoresArray[idx] === maxScore);
  const lowestCompany = filteredResults.find((_, idx) => numericScoresArray[idx] === minScore);

  // Helper pembuat payload ekspor dinamis sesuai pilihan indikator aktif
  const buildExportPayload = (): ResultsExportOptions => {
    const exportIndicators: ResultsExportIndicator[] = displayIndicatorItems.map(ind => {
      const fullInd = currentPresetForColumns.indicators?.find(i => i.code === ind.code);
      return {
        code: ind.code,
        title: ind.title,
        group: fullInd?.group || (isEn ? 'General' : 'Umum'),
        fullDesc: fullInd?.fullDesc || ''
      };
    });

    const exportRows: ResultsExportRow[] = filteredResults.map(r => {
      const scoresMap: Record<string, string | number> = {};
      displayIndicatorItems.forEach(ind => {
        scoresMap[ind.code] = getScoreForIndicator(r, ind.code);
      });

      return {
        company_code: r.company_code,
        fiscal_year: r.fiscal_year,
        file_name: r.file_name,
        preset_name: r.preset_name || getPresetName(currentPresetForColumns, lang),
        scores: scoresMap,
        total_score: getRowTotalForActivePreset(r),
        disclosure_level: formatCleanDisclosureLevel(r.disclosure_level, isEn),
        model_used: r.model_used,
        created_at: r.created_at ? new Date(r.created_at).toLocaleString(isEn ? 'en-US' : 'id-ID') : '-'
      };
    });

    return {
      presetName: getPresetName(currentPresetForColumns, lang),
      presetId: currentPresetForColumns.id,
      rubricType: isQuantitativeMode ? (isEn ? 'Quantitative Real Metric' : 'Kuantitatif Riil (Angka + Satuan)') : (isEn ? 'Structured Weighted (0-5)' : 'Bobot Terstruktur (0-5)'),
      indicators: exportIndicators,
      rows: exportRows,
      stats: {
        total: totalCount,
        avg: avgScore,
        max: maxScore,
        min: minScore
      },
      filterCode,
      filterYear,
      lang
    };
  };

  // 1. Salin Seluruh Tabel ke Spreadsheet (HTML Table ber-styling + TSV)
  const handleCopyAllTable = async () => {
    if (filteredResults.length === 0) {
      alert(isEn ? 'No data available to copy.' : 'Tidak ada data untuk disalin.');
      return;
    }

    const payload = buildExportPayload();
    const ok = await copyResultsToSpreadsheetClipboard(payload);

    if (ok) {
      setCopiedAll(true);
      setMessage({
        type: 'success',
        text: isEn
          ? `${filteredResults.length} rows (${displayIndicatorItems.length} indicators) copied in rich spreadsheet format! Ready to paste (Ctrl+V) into Google Sheets / Excel.`
          : `${filteredResults.length} baris data (${displayIndicatorItems.length} indikator) berhasil disalin dengan format rapi! Siap di-paste (Ctrl+V) langsung ke Google Sheets / Excel.`
      });
      setTimeout(() => setCopiedAll(false), 3000);
    } else {
      setMessage({
        type: 'error',
        text: isEn ? 'Failed to copy table to clipboard.' : 'Gagal menyalin tabel ke clipboard.'
      });
    }
  };

  // 2. Ekspor Excel Multi-Sheet (.xlsx)
  const handleExportExcel = () => {
    if (filteredResults.length === 0) {
      alert(isEn ? 'No data available to export.' : 'Tidak ada data untuk diekspor.');
      return;
    }

    setIsExportingExcel(true);
    try {
      const payload = buildExportPayload();
      exportResultsToExcelFile(payload);
      setMessage({
        type: 'success',
        text: isEn
          ? `Excel workbook (.xlsx) successfully exported with ${displayIndicatorItems.length} indicators and Glossary Sheet!`
          : `Berkas Excel (.xlsx) berhasil diunduh dengan ${displayIndicatorItems.length} kolom indikator & Sheet Kamus Indikator!`
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: isEn ? 'Failed to export Excel file: ' + err.message : 'Gagal mengekspor file Excel: ' + (err?.message || '')
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  // 3. Ekspor Word Dokumen (.docx)
  const handleExportWord = async () => {
    if (filteredResults.length === 0) {
      alert(isEn ? 'No data available to export.' : 'Tidak ada data untuk diekspor.');
      return;
    }

    setIsExportingDocx(true);
    try {
      const payload = buildExportPayload();
      await exportResultsToDocxFile(payload, false);
      setMessage({
        type: 'success',
        text: isEn
          ? 'Word document (.docx) successfully exported in landscape layout!'
          : 'Dokumen Word (.docx) berhasil diunduh dalam tata letak Landscape yang rapi!'
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: isEn ? 'Failed to export Word document: ' + err.message : 'Gagal mengekspor file Word: ' + (err?.message || '')
      });
    } finally {
      setIsExportingDocx(false);
    }
  };

  // 4. Ekspor ke Google Docs (Buka docs.new + Salin Dokumen HTML Lengkap)
  const handleExportGDocs = async () => {
    if (filteredResults.length === 0) {
      alert(isEn ? 'No data available to export.' : 'Tidak ada data untuk diekspor.');
      return;
    }

    setIsExportingGDocs(true);
    try {
      const payload = buildExportPayload();
      await openInGoogleDocs(payload);
      setShowGDocsModal(true);
      setMessage({
        type: 'success',
        text: isEn
          ? 'Google Docs opened in a new tab! Press Ctrl + V in the document to paste the complete report.'
          : 'Google Docs berhasil dibuka di tab baru! Tekan Ctrl + V di dokumen tersebut untuk menempelkan seluruh laporan.'
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: isEn ? 'Failed to open Google Docs: ' + err.message : 'Gagal membuka Google Docs: ' + (err?.message || '')
      });
    } finally {
      setIsExportingGDocs(false);
    }
  };

  const handleCopyGDocsContentAgain = async () => {
    const payload = buildExportPayload();
    const ok = await copyResultsToGoogleDocsClipboard(payload);
    if (ok) {
      setCopiedGDocsModal(true);
      setTimeout(() => setCopiedGDocsModal(false), 2500);
    }
  };

  const handleDownloadDocxBackup = async () => {
    const payload = buildExportPayload();
    await exportResultsToDocxFile(payload, true);
  };

  // 5. Ekspor CSV Dinamis (.csv)
  const handleExportCSV = () => {
    if (filteredResults.length === 0) {
      alert(isEn ? 'No data available to export.' : 'Tidak ada data untuk diekspor.');
      return;
    }

    try {
      const payload = buildExportPayload();
      exportResultsToCSVFile(payload);
      setMessage({
        type: 'success',
        text: isEn
          ? `CSV file successfully exported with ${displayIndicatorItems.length} indicator columns!`
          : `Berkas CSV berhasil diunduh dengan ${displayIndicatorItems.length} kolom indikator dinamis!`
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: isEn ? 'Failed to export CSV: ' + err.message : 'Gagal mengekspor file CSV: ' + (err?.message || '')
      });
    }
  };

  return (
    <div>
      {/* Summary Statistics Card */}
      {totalCount > 0 && (
        <div className="grid-4" style={{ marginBottom: '24px' }}>
          <div className="stat-box s-green">
            <div className="stat-val">{totalCount}</div>
            <div className="stat-lbl">{isEn ? 'Total Analyzed Reports' : 'Total Laporan Dianalisis'}</div>
          </div>
          <div className="stat-box s-teal">
            <div className="stat-val">{avgScore}</div>
            <div className="stat-lbl">
              {isEn ? `Average Score (Max ${maxPossibleScore})` : `Rata-Rata Skor (Maks ${maxPossibleScore})`}
            </div>
          </div>
          <div className="stat-box s-sage">
            <div className="stat-val">{maxScore}</div>
            <div className="stat-lbl">
              {isEn ? 'Highest Score' : 'Skor Tertinggi'} {topCompany ? `(${topCompany.company_code})` : ''}
            </div>
          </div>
          <div className="stat-box s-gold">
            <div className="stat-val">{minScore}</div>
            <div className="stat-lbl">
              {isEn ? 'Lowest Score' : 'Skor Terendah'} {lowestCompany ? `(${lowestCompany.company_code})` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Main Results Table Card */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="ct-icon">📋</div>
            <span>
              {isEn
                ? `Analysis Results Table (${filteredResults.length} Entries)`
                : `Tabel Hasil Analisis (${filteredResults.length} Entri)`}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input font-mono"
                placeholder={isEn ? 'Search ticker...' : 'Cari emiten...'}
                style={{ width: '140px', paddingLeft: '32px' }}
                value={filterCode}
                onChange={e => setFilterCode(e.target.value)}
              />
              <Search size={14} color="#687962" style={{ position: 'absolute', left: '10px', top: '13px' }} />
            </div>

            <select
              className="form-select font-mono"
              style={{ width: '120px' }}
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
            >
              <option value="">{isEn ? 'All Years' : 'Semua Tahun'}</option>
              <option value="FY 2026">FY 2026</option>
              <option value="FY 2025">FY 2025</option>
              <option value="FY 2024">FY 2024</option>
              <option value="FY 2023">FY 2023</option>
              <option value="FY 2022">FY 2022</option>
              <option value="FY 2021">FY 2021</option>
              <option value="FY 2020">FY 2020</option>
            </select>

            <button className="btn btn-outline btn-sm" onClick={fetchResults} disabled={isLoading}>
              <RefreshCw size={13} className={isLoading ? 'spinner' : ''} />
              <span>Refresh</span>
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleCopyAllTable}
              title={isEn ? 'Copy formatted table to paste into Google Sheets / Excel' : 'Salin tabel berformat rapi (HTML + TSV) untuk langsung di-paste ke Google Sheets / Excel'}
            >
              {copiedAll ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedAll ? (isEn ? 'Copied! ✅' : 'Tersalin! ✅') : isEn ? 'Copy (Spreadsheet)' : 'Salin Semua (Spreadsheet)'}</span>
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: 'rgba(16, 185, 129, 0.16)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.45)',
                fontWeight: 700
              }}
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              title={isEn ? 'Export multi-sheet Excel (.xlsx) with dynamic indicators & glossary' : 'Unduh berkas Excel (.xlsx) rapi dengan seluruh kolom indikator & kamus glosarium'}
            >
              <FileSpreadsheet size={13} />
              <span>{isExportingExcel ? 'Excel...' : 'Excel (.xlsx)'}</span>
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: 'rgba(59, 130, 246, 0.16)',
                color: '#3b82f6',
                border: '1px solid rgba(59, 130, 246, 0.45)',
                fontWeight: 700
              }}
              onClick={handleExportWord}
              disabled={isExportingDocx}
              title={isEn ? 'Export formal landscape Word (.docx) document' : 'Unduh dokumen Word (.docx) formal landscape dengan tabel indikator'}
            >
              <FileText size={13} />
              <span>{isExportingDocx ? 'Word...' : 'Word (.docx)'}</span>
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: 'rgba(6, 182, 212, 0.16)',
                color: '#06b6d4',
                border: '1px solid rgba(6, 182, 212, 0.45)',
                fontWeight: 700
              }}
              onClick={handleExportGDocs}
              disabled={isExportingGDocs}
              title={isEn ? 'Open new Google Docs tab & copy formatted table (ready to Ctrl+V)' : 'Buka Google Docs di tab baru & salin seluruh isi laporan berformat rapi (tinggal Ctrl+V)'}
            >
              <ExternalLink size={13} />
              <span>{isExportingGDocs ? 'Opening Docs...' : 'Google Docs'}</span>
            </button>

            <button
              className="btn btn-accent btn-sm"
              onClick={handleExportCSV}
              title={isEn ? 'Export CSV with dynamic indicator columns' : 'Unduh berkas CSV dengan nama kolom sesuai indikator'}
            >
              <Download size={13} />
              <span>CSV</span>
            </button>

            <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
              <Printer size={13} />
              <span>{isEn ? 'Print' : 'Cetak'}</span>
            </button>
          </div>
        </div>

        {/* BAR SINKRONISASI PILIHAN INDIKATOR PADA TABEL HASIL */}
        <div
          style={{
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text)' }}>
              🌱 {isEn ? 'Active Indicator Columns:' : 'Pilihan Indikator Tabel:'}
            </span>
            <select
              className="form-select font-mono"
              style={{
                width: 'auto',
                minWidth: '260px',
                background: 'var(--surface)',
                color: 'var(--text)',
                border: '1.5px solid var(--border)',
                fontSize: '12.5px',
                padding: '7px 12px',
                fontWeight: 700
              }}
              value={selectedPresetId}
              onChange={e => handleSelectPresetInTable(e.target.value)}
            >
              {presets.map(p => (
                <option
                  key={p.id}
                  value={p.id}
                  style={{ background: 'var(--surface)', color: 'var(--text)' }}
                >
                  {getPresetName(p, lang)} ({p.indicators.length} {isEn ? 'Indicators' : 'Indikator'})
                </option>
              ))}
            </select>
            <span
              className="badge"
              style={{
                background: 'var(--dew)',
                color: 'var(--primary)',
                border: '1px solid var(--border)',
                fontSize: '11.5px',
                padding: '5px 12px',
                fontWeight: 800,
                borderRadius: '8px'
              }}
            >
              {displayIndicatorItems.length} {isEn ? 'Columns' : 'Kolom Indikator'} · {isEn ? 'Max Score:' : 'Skor Maks:'} {maxPossibleScore}
            </span>
          </div>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-muted)'
            }}
          >
            {isEn
              ? `Showing ${filteredResults.length} report(s) analyzed with this indicator preset`
              : `Menampilkan ${filteredResults.length} laporan yang dianalisis dengan pilihan indikator ini`}
          </span>
        </div>

        {message && (
          <div className={`alert alert-${message.type}`}>
            <span>{message.type === 'success' ? '🌿' : '❌'}</span>
            <span>{message.text}</span>
          </div>
        )}

        {/* Tabel Data Responsif dengan Kolom Sesuai Indikator yang Dipilih */}
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: '90px' }}>Code</th>
                <th style={{ minWidth: '92px' }}>Years</th>
                {displayIndicatorItems.map(ind => (
                  <th
                    key={ind.code}
                    title={`${ind.code} — ${ind.title}`}
                    style={{ minWidth: '88px', padding: '10px 12px' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                      <span className="font-mono" style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)' }}>
                        {ind.code}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                          maxWidth: '125px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.2
                        }}
                      >
                        {ind.title}
                      </span>
                    </div>
                  </th>
                ))}
                <th style={{ minWidth: '95px' }} title={`Max: ${maxPossibleScore}`}>
                  TOTAL / {maxPossibleScore}
                </th>
                <th style={{ minWidth: '125px' }}>Level</th>
                <th style={{ minWidth: '210px' }}>{isEn ? 'Copy & Actions' : 'Salin & Aksi'}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={displayIndicatorItems.length + 5} style={{ padding: '36px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: 'var(--primary)' }} />
                      <span>{isEn ? 'Loading analysis results...' : 'Memuat data hasil analisis...'}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={displayIndicatorItems.length + 5} style={{ padding: '48px 20px', color: 'var(--stone)', fontStyle: 'italic' }}>
                    {isEn ? (
                      <>
                        🌿 No reports have been analyzed using <strong>"{getPresetName(currentPresetForColumns, lang)}"</strong> yet. Analyze a report with this indicator preset in the <strong>"Upload & Analysis"</strong> tab, or switch the <strong>Active Indicator Columns</strong> dropdown above.
                      </>
                    ) : (
                      <>
                        🌿 Belum ada laporan yang dianalisis menggunakan pilihan indikator <strong>"{getPresetName(currentPresetForColumns, lang)}"</strong>. Silakan jalankan analisis dengan indikator ini pada tab <strong>"Upload & Analisis"</strong>, atau pilih indikator lain pada dropdown <strong>Pilihan Indikator Tabel</strong> di atas.
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                filteredResults.map((row, idx) => {
                  const rowKey = `${row.company_code}_${row.fiscal_year}_${idx}`;
                  const isCopiedRow = copiedId === `row_${rowKey}`;
                  const isCopiedScores = copiedId === `scores_${rowKey}`;
                  const rowTotal = getRowTotalForActivePreset(row);
                  const cleanLevel = formatCleanDisclosureLevel(row.disclosure_level, isEn);

                  return (
                    <tr key={row.id || rowKey}>
                      <td className="td-code">{row.company_code}</td>
                      <td className="td-year" style={{ whiteSpace: 'nowrap' }}>{row.fiscal_year}</td>

                      {displayIndicatorItems.map(ind => {
                        const rawScore = getScoreForIndicator(row, ind.code);
                        const isZero = !isDisclosedQuantitativeValue(rawScore) || rawScore === 0 || rawScore === '0';
                        const displayVal = isZero ? (isQuantitativeMode ? '0' : 0) : rawScore;
                        const isStringMetric = typeof displayVal === 'string' && displayVal !== '0';

                        return (
                          <td key={ind.code} title={`${ind.code} — ${ind.title}: ${displayVal}`} style={{ whiteSpace: 'nowrap' }}>
                            <span
                              className={`score-badge ${!isStringMetric ? `score-${Math.min(Number(displayVal) || 0, 5)}` : ''}`}
                              style={
                                isStringMetric
                                  ? {
                                      background: 'rgba(16, 185, 129, 0.16)',
                                      color: '#34d399',
                                      border: '1px solid rgba(16, 185, 129, 0.35)',
                                      padding: '4px 10px',
                                      borderRadius: '8px',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      whiteSpace: 'nowrap'
                                    }
                                  : undefined
                              }
                            >
                              {displayVal}
                            </span>
                          </td>
                        );
                      })}

                      <td className="td-total" style={{ whiteSpace: 'nowrap' }}>{rowTotal}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            background: 'var(--dew)',
                            color: 'var(--primary)',
                            border: '1px solid var(--border)',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {cleanLevel}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '11.5px', fontWeight: 700 }}
                            title={
                              isEn
                                ? `Copy ${displayIndicatorItems.length} indicator scores to paste into spreadsheet`
                                : `Salin ${displayIndicatorItems.length} Nilai Skor untuk paste ke spreadsheet`
                            }
                            onClick={() => handleCopyScoresOnly(row, rowKey)}
                          >
                            {isCopiedScores ? <Check size={12} /> : <Table size={12} />}
                            <span>
                              {isCopiedScores
                                ? isEn
                                  ? 'Copied!'
                                  : 'Tersalin!'
                                : `📋 ${displayIndicatorItems.length} ${isEn ? 'Scores' : 'Skor'}`}
                            </span>
                          </button>

                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--surface)' }}
                            title={isEn ? 'Copy Full Row (+Code & Year)' : 'Salin Baris Lengkap (+Code & Tahun)'}
                            onClick={() => handleCopyRow(row, rowKey)}
                          >
                            {isCopiedRow ? <Check size={12} /> : <Copy size={12} />}
                            <span>{isCopiedRow ? (isEn ? 'Copied!' : 'Tersalin!') : isEn ? 'Full' : 'Lengkap'}</span>
                          </button>

                          <button
                            className="btn btn-danger btn-sm"
                            style={{ padding: '4px 8px' }}
                            title={isEn ? 'Delete this record' : 'Hapus data ini'}
                            onClick={() => handleDelete(row)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PANDUAN & AKSI GOOGLE DOCS */}
      {showGDocsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowGDocsModal(false)}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1.5px solid var(--border)',
              borderRadius: '14px',
              padding: '24px',
              maxWidth: '540px',
              width: '100%',
              boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '9px',
                    background: 'rgba(6, 182, 212, 0.16)',
                    color: '#06b6d4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ExternalLink size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                  {isEn ? 'Google Docs Opened in New Tab! 🚀' : 'Google Docs Dibuka di Tab Baru! 🚀'}
                </h3>
              </div>
              <button
                type="button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
                onClick={() => setShowGDocsModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#10b981',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12.5px',
                fontWeight: 700,
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>✅</span>
              <span>
                {isEn
                  ? 'Complete report layout is copied to your clipboard!'
                  : 'Seluruh isi laporan lengkap telah disalin ke clipboard Anda!'}
              </span>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, marginBottom: '20px' }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>
                {isEn ? 'Next simple steps:' : 'Langkah mudah selanjutnya:'}
              </p>
              <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>
                  {isEn ? (
                    <>Switch to the newly opened <strong>docs.new</strong> tab in your browser.</>
                  ) : (
                    <>Beralih ke tab <strong>docs.new</strong> yang baru saja dibuka oleh sistem.</>
                  )}
                </li>
                <li>
                  {isEn ? (
                    <>Press <strong>Ctrl + V</strong> (or right-click → <em>Paste</em>).</>
                  ) : (
                    <>Tekan <strong>Ctrl + V</strong> (atau klik kanan → <em>Tempel / Paste</em>).</>
                  )}
                </li>
                <li>
                  {isEn ? (
                    <>The formal report with Kop, Summary, Analysis Table, and Glossary will appear instantly with neat styling!</>
                  ) : (
                    <>Kop laporan resmi, ringkasan, tabel hasil analisis, dan kamus indikator akan langsung tertata rapi seketika!</>
                  )}
                </li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleCopyGDocsContentAgain}
                title={isEn ? 'Copy formatted report again' : 'Salin ulang format dokumen ke clipboard'}
              >
                {copiedGDocsModal ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedGDocsModal ? (isEn ? 'Copied! ✅' : 'Tersalin! ✅') : (isEn ? 'Copy Again' : 'Salin Ulang')}</span>
              </button>

              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: 'rgba(6, 182, 212, 0.16)',
                  color: '#06b6d4',
                  border: '1px solid rgba(6, 182, 212, 0.45)',
                  fontWeight: 700
                }}
                onClick={() => window.open('https://docs.new', '_blank')}
                title={isEn ? 'Reopen docs.new in tab' : 'Buka tab baru Google Docs lagi'}
              >
                <ExternalLink size={13} />
                <span>{isEn ? 'Open docs.new' : 'Buka docs.new'}</span>
              </button>

              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleDownloadDocxBackup}
                title={isEn ? 'Download .docx as offline backup' : 'Unduh file .docx jika ingin upload manual via Drive'}
              >
                <Download size={13} />
                <span>{isEn ? 'Download .docx' : 'Unduh .docx'}</span>
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowGDocsModal(false)}
              >
                <span>{isEn ? 'Done' : 'Selesai'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
