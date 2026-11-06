'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Search, Trash2, Printer, Copy, Check, Table } from 'lucide-react';
import { CEDResultRecord, INDICATOR_KEYS, IndicatorPreset, getPresetRubricType } from '@/lib/types';
import {
  getStoredPresets,
  saveStoredPresets,
  getActivePresetId,
  setActivePresetId,
  DEFAULT_PRESET_ID,
  createDefaultCEDPreset
} from '@/lib/indicators-storage';
import { useLanguage, getPresetName, getIndicatorTitle, ensurePresetsTranslated } from '@/lib/i18n';

interface ResultsTabProps {
  refreshTrigger: number;
}

export const ResultsTab: React.FC<ResultsTabProps> = ({ refreshTrigger }) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [results, setResults] = useState<CEDResultRecord[]>([]);
  const [presets, setPresets] = useState<IndicatorPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [onlyMatchingPresetRows, setOnlyMatchingPresetRows] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [filterCode, setFilterCode] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const fetchResults = async () => {
    setIsLoading(true);
    setMessage(null);

    let supabaseData: CEDResultRecord[] = [];
    let localData: CEDResultRecord[] = [];

    // 1. Ambil data dari LocalStorage
    if (typeof window !== 'undefined') {
      try {
        const rawLocal = localStorage.getItem('analyzer_records');
        if (rawLocal) {
          localData = JSON.parse(rawLocal);
        }
      } catch (err) {
        console.warn('Error reading local cache:', err);
      }
    }

    // 2. Ambil data dari Backend / Supabase
    try {
      const res = await fetch('/api/results');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        supabaseData = json.data;
      }
    } catch (err: any) {
      console.warn('Backend fetch notice:', err);
    }

    // 3. Gabungkan data: pertahankan skor indikator kustom & preset_id dari localData agar tidak hilang oleh tabel standar Supabase
    const combinedMap = new Map<string, CEDResultRecord>();

    localData.forEach(item => {
      const key = `${item.company_code}_${item.fiscal_year}`;
      combinedMap.set(key, item);
    });

    supabaseData.forEach(sbItem => {
      const key = `${sbItem.company_code}_${sbItem.fiscal_year}`;
      const existingLocal = combinedMap.get(key);
      if (existingLocal) {
        combinedMap.set(key, {
          ...sbItem,
          ...existingLocal,
          id: sbItem.id || existingLocal.id,
          preset_id: existingLocal.preset_id || sbItem.preset_id,
          preset_name: existingLocal.preset_name || sbItem.preset_name,
          dynamic_scores: existingLocal.dynamic_scores || sbItem.dynamic_scores
        });
      } else {
        combinedMap.set(key, sbItem);
      }
    });

    const mergedList = Array.from(combinedMap.values()).sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    setResults(mergedList);

    if (typeof window !== 'undefined' && mergedList.length > 0) {
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
      window.addEventListener('analyzer_presets_changed', syncPresetsAndActive);
      window.addEventListener('analyzer_active_preset_changed', syncPresetsAndActive);
      return () => {
        window.removeEventListener('analyzer_presets_changed', syncPresetsAndActive);
        window.removeEventListener('analyzer_active_preset_changed', syncPresetsAndActive);
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

    const updatedLocal = results.filter(
      r => !(r.company_code === record.company_code && r.fiscal_year === record.fiscal_year)
    );
    setResults(updatedLocal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('analyzer_records', JSON.stringify(updatedLocal));
    }

    try {
      const url = record.id
        ? `/api/results?id=${record.id}`
        : `/api/results?code=${record.company_code}&year=${record.fiscal_year}`;

      await fetch(url, { method: 'DELETE' });
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
    const lower = code.toLowerCase();
    const upper = code.toUpperCase();
    const raw =
      (row as any)[lower] ??
      (row as any)[upper] ??
      (row.dynamic_scores ? row.dynamic_scores[lower] ?? row.dynamic_scores[upper] : undefined);
    if (raw !== undefined && raw !== null && raw !== '') {
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' && !isNaN(raw)) return raw;
    }
    return isQuantitativeMode ? '0 liter' : 0;
  };

  const getRowTotalForActivePreset = (row: CEDResultRecord): number | string => {
    if (isQuantitativeMode) {
      const disclosedCount = displayIndicatorItems.filter(ind => {
        const val = getScoreForIndicator(row, ind.code);
        const s = String(val).trim().toLowerCase();
        return s !== '0' && s !== '0 liter' && s !== '0 unit' && s !== '0 ton' && s !== '';
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

  // Salin Seluruh Tabel ke TSV (Format Paste Spreadsheet)
  const handleCopyAllTable = () => {
    if (filteredResults.length === 0) return;

    const headers = ['Code', 'Years', ...displayIndicatorItems.map(i => i.code), 'TOTAL'];
    const rows = filteredResults.map(r => {
      const scores = displayIndicatorItems.map(ind => getScoreForIndicator(r, ind.code));
      return [r.company_code, r.fiscal_year, ...scores, getRowTotalForActivePreset(r)].join('\t');
    });

    const fullTsv = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(fullTsv);
    setCopiedAll(true);
    setMessage({
      type: 'success',
      text: isEn
        ? `${filteredResults.length} rows (${displayIndicatorItems.length} indicators) copied! Ready to paste into Google Sheets / Excel.`
        : `${filteredResults.length} baris data (${displayIndicatorItems.length} indikator) berhasil disalin! Siap di-paste ke Google Sheets / Excel.`
    });
    setTimeout(() => setCopiedAll(false), 3000);
  };

  const handleExportCSV = () => {
    if (results.length === 0) {
      alert(isEn ? 'No data available to export.' : 'Tidak ada data untuk diekspor.');
      return;
    }

    const headers = [
      'Company Code',
      'Fiscal Year',
      'File Name',
      'Preset Name',
      ...displayIndicatorItems.map(i => i.code),
      'Total Score',
      'Disclosure Level',
      'Model Used',
      'Created At'
    ];

    const rows = filteredResults.map(r => {
      const scores = displayIndicatorItems.map(ind => getScoreForIndicator(r, ind.code));
      return [
        `"${r.company_code}"`,
        `"${r.fiscal_year}"`,
        `"${(r.file_name || '').replace(/"/g, '""')}"`,
        `"${(r.preset_name || getPresetName(currentPresetForColumns, lang)).replace(/"/g, '""')}"`,
        ...scores,
        getRowTotalForActivePreset(r),
        `"${r.disclosure_level || ''}"`,
        `"${r.model_used || ''}"`,
        `"${r.created_at || ''}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Scoring_Results_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredResults = results.filter(item => {
    const matchCode = !filterCode || item.company_code.toLowerCase().includes(filterCode.toLowerCase());
    const matchYear = !filterYear || item.fiscal_year === filterYear;
    const matchPreset = !onlyMatchingPresetRows
      ? true
      : item.preset_id
      ? item.preset_id === selectedPresetId
      : selectedPresetId === DEFAULT_PRESET_ID;
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
              title={isEn ? 'Copy all rows to paste into Google Sheets' : 'Salin seluruh baris tabel untuk di-paste langsung ke Google Sheets'}
            >
              {copiedAll ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedAll ? (isEn ? 'Copied! ✅' : 'Tersalin! ✅') : isEn ? 'Copy All (Spreadsheet)' : 'Salin Semua (Spreadsheet)'}</span>
            </button>

            <button className="btn btn-accent btn-sm" onClick={handleExportCSV}>
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
                minWidth: '240px',
                background: '#ffffff',
                fontSize: '12.5px',
                padding: '6px 10px',
                fontWeight: 700
              }}
              value={selectedPresetId}
              onChange={e => handleSelectPresetInTable(e.target.value)}
            >
              {presets.map(p => (
                <option key={p.id} value={p.id}>
                  {getPresetName(p, lang)} ({p.indicators.length} {isEn ? 'Indicators' : 'Indikator'})
                </option>
              ))}
            </select>
            <span
              className="badge"
              style={{
                background: '#ffffff',
                color: 'var(--fern)',
                border: '1px solid var(--border)',
                fontSize: '11.5px',
                padding: '4px 10px',
                fontWeight: 700
              }}
            >
              {displayIndicatorItems.length} {isEn ? 'Columns' : 'Kolom Indikator'} · {isEn ? 'Max Score:' : 'Skor Maks:'} {maxPossibleScore}
            </span>
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text)',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={onlyMatchingPresetRows}
              onChange={e => setOnlyMatchingPresetRows(e.target.checked)}
              style={{ accentColor: 'var(--fern)', cursor: 'pointer' }}
            />
            <span>
              {isEn
                ? 'Show only reports analyzed with this preset'
                : 'Tampilkan hanya laporan dari preset ini'}
            </span>
          </label>
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
                <th style={{ minWidth: '90px' }}>Years</th>
                {displayIndicatorItems.map(ind => (
                  <th key={ind.code} title={`${ind.code}: ${ind.title}`}>
                    {ind.code}
                  </th>
                ))}
                <th style={{ minWidth: '80px' }} title={`Max: ${maxPossibleScore}`}>
                  TOTAL / {maxPossibleScore}
                </th>
                <th style={{ minWidth: '100px' }}>Level</th>
                <th style={{ minWidth: '190px' }}>{isEn ? 'Copy & Actions' : 'Salin & Aksi'}</th>
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
                        🌿 No analysis records found for this filter. Upload a report in the <strong>"Upload & Analysis"</strong> tab.
                      </>
                    ) : (
                      <>
                        🌿 Belum ada data analisis untuk filter ini. Silakan upload laporan tahunan pada tab <strong>"Upload & Analisis"</strong>.
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

                  return (
                    <tr key={row.id || rowKey}>
                      <td className="td-code">{row.company_code}</td>
                      <td className="td-year">{row.fiscal_year}</td>

                      {displayIndicatorItems.map(ind => {
                        const score = getScoreForIndicator(row, ind.code);
                        const isString = typeof score === 'string';
                        const isZero = score === 0 || score === '0' || score === '0 liter' || score === '0 unit' || score === '0 ton';
                        return (
                          <td key={ind.code} title={`${ind.code} — ${ind.title}: ${score}`} style={{ whiteSpace: 'nowrap' }}>
                            <span
                              className={`score-badge ${!isString ? `score-${score}` : ''}`}
                              style={
                                isString
                                  ? {
                                      background: isZero ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.15)',
                                      color: isZero ? '#f87171' : '#34d399',
                                      border: `1px solid ${isZero ? 'rgba(239, 68, 68, 0.28)' : 'rgba(16, 185, 129, 0.3)'}`,
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: 700
                                    }
                                  : undefined
                              }
                            >
                              {score}
                            </span>
                          </td>
                        );
                      })}

                      <td className="td-total">{rowTotal}</td>
                      <td style={{ fontSize: '12px', fontWeight: 700, color: 'var(--moss)', whiteSpace: 'nowrap' }}>
                        {row.disclosure_level?.split(' ')[0] || (isEn ? 'Low' : 'Rendah')}
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
    </div>
  );
};
