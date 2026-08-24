'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Search, Trash2, Printer, Copy, Check, Table } from 'lucide-react';
import { CEDResultRecord, INDICATOR_KEYS } from '@/lib/types';

interface ResultsTabProps {
  refreshTrigger: number;
}

export const ResultsTab: React.FC<ResultsTabProps> = ({ refreshTrigger }) => {
  const [results, setResults] = useState<CEDResultRecord[]>([]);
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

    // 3. Gabungkan data (prioritaskan Supabase jika ada ID, hilangkan duplikasi kode + tahun)
    const combinedMap = new Map<string, CEDResultRecord>();

    localData.forEach(item => {
      const key = `${item.company_code}_${item.fiscal_year}`;
      combinedMap.set(key, item);
    });

    supabaseData.forEach(item => {
      const key = `${item.company_code}_${item.fiscal_year}`;
      combinedMap.set(key, item);
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

  useEffect(() => {
    fetchResults();
  }, [refreshTrigger]);

  const handleDelete = async (record: CEDResultRecord) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus data ${record.company_code} (${record.fiscal_year})?`)) {
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

    setMessage({ type: 'success', text: `Data ${record.company_code} (${record.fiscal_year}) berhasil dihapus.` });
  };

  // 1. SALIN HANYA 18 NILAI SKOR (CC1 s/d ACC2) -> TANPA KODE & TAHUN
  const handleCopyScoresOnly = (row: CEDResultRecord, idKey: string) => {
    const scoresTsv = INDICATOR_KEYS.map(k => (row as any)[k] ?? 0).join('\t');
    navigator.clipboard.writeText(scoresTsv);
    setCopiedId(`scores_${idKey}`);
    setMessage({
      type: 'success',
      text: `18 Nilai skor untuk ${row.company_code} (${row.fiscal_year}) tersalin ke clipboard! Siap di-paste (Ctrl+V) ke spreadsheet.`
    });
    setTimeout(() => setCopiedId(null), 2500);
  };

  // 2. SALIN 1 BARIS LENGKAP (+Kode & Tahun)
  const handleCopyRow = (row: CEDResultRecord, idKey: string) => {
    const scores = INDICATOR_KEYS.map(k => (row as any)[k] ?? 0);
    const rowTsv = [
      row.company_code,
      row.fiscal_year,
      ...scores,
      row.total_score ?? 0
    ].join('\t');

    navigator.clipboard.writeText(rowTsv);
    setCopiedId(`row_${idKey}`);
    setMessage({
      type: 'success',
      text: `Baris lengkap ${row.company_code} (${row.fiscal_year}) tersalin ke clipboard!`
    });
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Salin Seluruh Tabel ke TSV (Format Paste Spreadsheet)
  const handleCopyAllTable = () => {
    if (filteredResults.length === 0) return;

    const headers = ['Code', 'Years', ...INDICATOR_KEYS.map(k => k.toUpperCase()), 'TOTAL'];
    const rows = filteredResults.map(r => {
      const scores = INDICATOR_KEYS.map(k => (r as any)[k] ?? 0);
      return [r.company_code, r.fiscal_year, ...scores, r.total_score ?? 0].join('\t');
    });

    const fullTsv = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(fullTsv);
    setCopiedAll(true);
    setMessage({
      type: 'success',
      text: `${filteredResults.length} baris data berhasil disalin! Siap di-paste ke Google Sheets / Excel.`
    });
    setTimeout(() => setCopiedAll(false), 3000);
  };

  const handleExportCSV = () => {
    if (results.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    const headers = [
      'Company Code', 'Fiscal Year', 'File Name',
      'CC1', 'CC2',
      'GHG1', 'GHG2', 'GHG3', 'GHG4', 'GHG5', 'GHG6', 'GHG7',
      'EC1', 'EC2', 'EC3',
      'RC1', 'RC2', 'RC3', 'RC4',
      'ACC1', 'ACC2',
      'Total Score (Max 90)', 'Disclosure Level', 'Model Used', 'Created At'
    ];

    const rows = filteredResults.map(r => [
      `"${r.company_code}"`,
      `"${r.fiscal_year}"`,
      `"${(r.file_name || '').replace(/"/g, '""')}"`,
      r.cc1 ?? 0, r.cc2 ?? 0,
      r.ghg1 ?? 0, r.ghg2 ?? 0, r.ghg3 ?? 0, r.ghg4 ?? 0, r.ghg5 ?? 0, r.ghg6 ?? 0, r.ghg7 ?? 0,
      r.ec1 ?? 0, r.ec2 ?? 0, r.ec3 ?? 0,
      r.rc1 ?? 0, r.rc2 ?? 0, r.rc3 ?? 0, r.rc4 ?? 0,
      r.acc1 ?? 0, r.acc2 ?? 0,
      r.total_score ?? 0,
      `"${r.disclosure_level || ''}"`,
      `"${r.model_used || ''}"`,
      `"${r.created_at || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CED_Scoring_Results_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredResults = results.filter(item => {
    const matchCode = !filterCode || item.company_code.toLowerCase().includes(filterCode.toLowerCase());
    const matchYear = !filterYear || item.fiscal_year === filterYear;
    return matchCode && matchYear;
  });

  const totalCount = filteredResults.length;
  const totalScoresArray = filteredResults.map(r => r.total_score || 0);
  const avgScore = totalCount > 0
    ? (totalScoresArray.reduce((a, b) => a + b, 0) / totalCount).toFixed(1)
    : '0.0';
  const maxScore = totalCount > 0 ? Math.max(...totalScoresArray) : 0;
  const minScore = totalCount > 0 ? Math.min(...totalScoresArray) : 0;
  const topCompany = filteredResults.find(r => (r.total_score || 0) === maxScore);
  const lowestCompany = filteredResults.find(r => (r.total_score || 0) === minScore);

  return (
    <div>
      {/* Summary Statistics Card */}
      {totalCount > 0 && (
        <div className="grid-4" style={{ marginBottom: '24px' }}>
          <div className="stat-box s-green">
            <div className="stat-val">{totalCount}</div>
            <div className="stat-lbl">Total Laporan Dianalisis</div>
          </div>
          <div className="stat-box s-teal">
            <div className="stat-val">{avgScore}</div>
            <div className="stat-lbl">Rata-Rata Skor Industri</div>
          </div>
          <div className="stat-box s-sage">
            <div className="stat-val">{maxScore}</div>
            <div className="stat-lbl">Skor Tertinggi {topCompany ? `(${topCompany.company_code})` : ''}</div>
          </div>
          <div className="stat-box s-gold">
            <div className="stat-val">{minScore}</div>
            <div className="stat-lbl">Skor Terendah {lowestCompany ? `(${lowestCompany.company_code})` : ''}</div>
          </div>
        </div>
      )}

      {/* Main Results Table Card */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="ct-icon">📋</div>
            <span>Database Hasil CED Scoring ({filteredResults.length} Entri)</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input font-mono"
                placeholder="Cari emiten..."
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
              <option value="">Semua Tahun</option>
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

            <button className="btn btn-primary btn-sm" onClick={handleCopyAllTable} title="Salin seluruh baris tabel untuk di-paste langsung ke Google Sheets">
              {copiedAll ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedAll ? 'Tersalin! ✅' : 'Salin Semua (Spreadsheet)'}</span>
            </button>

            <button className="btn btn-accent btn-sm" onClick={handleExportCSV}>
              <Download size={13} />
              <span>CSV</span>
            </button>

            <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
              <Printer size={13} />
              <span>Cetak</span>
            </button>
          </div>
        </div>

        {message && (
          <div className={`alert alert-${message.type}`}>
            <span>{message.type === 'success' ? '🌿' : '❌'}</span>
            <span>{message.text}</span>
          </div>
        )}

        {/* Tabel Data Responsif */}
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: '90px' }}>Code</th>
                <th style={{ minWidth: '90px' }}>Years</th>
                <th>CC1</th><th>CC2</th>
                <th>GHG1</th><th>GHG2</th><th>GHG3</th><th>GHG4</th><th>GHG5</th><th>GHG6</th><th>GHG7</th>
                <th>EC1</th><th>EC2</th><th>EC3</th>
                <th>RC1</th><th>RC2</th><th>RC3</th><th>RC4</th>
                <th>ACC1</th><th>ACC2</th>
                <th style={{ minWidth: '70px' }}>TOTAL</th>
                <th style={{ minWidth: '100px' }}>Level</th>
                <th style={{ minWidth: '190px' }}>Salin & Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={24} style={{ padding: '36px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: 'var(--primary)' }} />
                      <span>Memuat data hasil analisis...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={24} style={{ padding: '48px 20px', color: 'var(--stone)', fontStyle: 'italic' }}>
                    🌿 Belum ada data analisis. Silakan upload laporan tahunan pada tab <strong>"Upload & Analisis"</strong>.
                  </td>
                </tr>
              ) : (
                filteredResults.map((row, idx) => {
                  const rowKey = `${row.company_code}_${row.fiscal_year}_${idx}`;
                  const isCopiedRow = copiedId === `row_${rowKey}`;
                  const isCopiedScores = copiedId === `scores_${rowKey}`;

                  return (
                    <tr key={row.id || rowKey}>
                      <td className="td-code">{row.company_code}</td>
                      <td className="td-year">{row.fiscal_year}</td>
                      
                      {INDICATOR_KEYS.map(k => {
                        const score = (row as any)[k] ?? 0;
                        return (
                          <td key={k}>
                            <span className={`score-badge score-${score}`}>{score}</span>
                          </td>
                        );
                      })}

                      <td className="td-total">{row.total_score ?? 0}</td>
                      <td style={{ fontSize: '12px', fontWeight: 700, color: 'var(--moss)', whiteSpace: 'nowrap' }}>
                        {row.disclosure_level?.split(' ')[0] || 'Rendah'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '11.5px', fontWeight: 700 }}
                            title="Salin HANYA 18 Nilai Skor (CC1 s/d ACC2) untuk paste ke spreadsheet"
                            onClick={() => handleCopyScoresOnly(row, rowKey)}
                          >
                            {isCopiedScores ? <Check size={12} /> : <Table size={12} />}
                            <span>{isCopiedScores ? 'Tersalin!' : '📋 18 Skor'}</span>
                          </button>

                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: '4px 8px', fontSize: '11px', background: '#ffffff' }}
                            title="Salin Baris Lengkap (+Code & Tahun)"
                            onClick={() => handleCopyRow(row, rowKey)}
                          >
                            {isCopiedRow ? <Check size={12} /> : <Copy size={12} />}
                            <span>{isCopiedRow ? 'Tersalin!' : 'Lengkap'}</span>
                          </button>

                          <button
                            className="btn btn-danger btn-sm"
                            style={{ padding: '4px 8px' }}
                            title="Hapus data ini"
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
