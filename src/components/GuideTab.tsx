'use client';

import React, { useState, useEffect } from 'react';
import { SCORING_RUBRIC, IndicatorItem, IndicatorPreset } from '@/lib/types';
import {
  getStoredPresets,
  saveStoredPresets,
  getActivePresetId,
  setActivePresetId,
  DEFAULT_PRESET_ID,
  createDefaultCEDPreset
} from '@/lib/indicators-storage';
import {
  CheckCircle2,
  Plus,
  Copy,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  X,
  FileSpreadsheet,
  Layers,
  Sparkles
} from 'lucide-react';

export const GuideTab: React.FC = () => {
  const [presets, setPresets] = useState<IndicatorPreset[]>([]);
  const [activePresetId, setActiveId] = useState<string>(DEFAULT_PRESET_ID);
  const [selectedPresetId, setSelectedId] = useState<string>(DEFAULT_PRESET_ID);

  // Modal State
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetFormName, setPresetFormName] = useState('');
  const [presetFormDesc, setPresetFormDesc] = useState('');

  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
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
    if (!selectedPresetId || !p.some(item => item.id === selectedPresetId)) {
      setSelectedId(actId);
    }
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

  const selectedPreset = presets.find(p => p.id === selectedPresetId) || presets[0] || createDefaultCEDPreset();

  const handleSelectActivePreset = (id: string) => {
    setActivePresetId(id);
    setActiveId(id);
    setSelectedId(id);
    const target = presets.find(p => p.id === id);
    setNoticeMessage({
      type: 'success',
      text: `Preset "${target?.name || id}" sekarang aktif digunakan untuk menu Analisis & Tabel Hasil!`
    });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Buat Preset Baru Kosong
  const handleCreatePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetFormName.trim()) return;

    const newPreset: IndicatorPreset = {
      id: `preset_${Date.now()}`,
      name: presetFormName.trim(),
      description: presetFormDesc.trim() || 'Kumpulan indikator kustom.',
      isDefault: false,
      indicators: [],
      createdAt: new Date().toISOString()
    };

    const updated = [...presets, newPreset];
    saveStoredPresets(updated);
    setPresets(updated);
    setSelectedId(newPreset.id);
    setShowPresetModal(false);
    setPresetFormName('');
    setPresetFormDesc('');
    setNoticeMessage({ type: 'success', text: `Preset baru "${newPreset.name}" berhasil dibuat. Silakan tambahkan indikator.` });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Duplikasi dari CED 18
  const handleDuplicateDefault = () => {
    const defaultPreset = presets.find(p => p.id === DEFAULT_PRESET_ID) || createDefaultCEDPreset();
    const copyPreset: IndicatorPreset = {
      id: `preset_custom_${Date.now()}`,
      name: `Salinan ${defaultPreset.name} (Kustom)`,
      description: 'Salinan indikator CED standar yang dapat Anda tambah, ubah, atau kurangi.',
      isDefault: false,
      indicators: JSON.parse(JSON.stringify(defaultPreset.indicators)),
      createdAt: new Date().toISOString()
    };

    const updated = [...presets, copyPreset];
    saveStoredPresets(updated);
    setPresets(updated);
    setSelectedId(copyPreset.id);
    setNoticeMessage({ type: 'success', text: `Berhasil menduplikasi 18 indikator CED ke preset "${copyPreset.name}".` });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Hapus Preset Kustom
  const handleDeletePreset = (id: string, name: string) => {
    if (id === DEFAULT_PRESET_ID) return;
    if (!confirm(`Hapus preset "${name}" beserta seluruh indikator di dalamnya?`)) return;

    const updated = presets.filter(p => p.id !== id);
    saveStoredPresets(updated);
    setPresets(updated);
    if (activePresetId === id) {
      setActivePresetId(DEFAULT_PRESET_ID);
      setActiveId(DEFAULT_PRESET_ID);
    }
    setSelectedId(DEFAULT_PRESET_ID);
    setNoticeMessage({ type: 'warn', text: `Preset "${name}" telah dihapus.` });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Buka Modal Tambah/Edit Indikator
  const openIndicatorModal = (ind?: IndicatorItem) => {
    if (ind) {
      setEditingIndicator(ind);
      setIndFormCode(ind.code);
      setIndFormTitle(ind.title);
      setIndFormDesc(ind.fullDesc);
      setIndFormGroup(ind.group || 'Umum');
    } else {
      setEditingIndicator(null);
      setIndFormCode('');
      setIndFormTitle('');
      setIndFormDesc('');
      setIndFormGroup('Umum');
    }
    setShowIndicatorModal(true);
  };

  // Simpan Indikator
  const handleSaveIndicator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!indFormCode.trim() || !indFormTitle.trim()) return;

    const cleanCode = indFormCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    const newItem: IndicatorItem = {
      id: editingIndicator ? editingIndicator.id : cleanCode.toLowerCase(),
      code: cleanCode,
      title: indFormTitle.trim(),
      fullDesc: indFormDesc.trim(),
      group: indFormGroup.trim() || 'Umum'
    };

    // Update dalam preset terpilih
    const updatedPresets = presets.map(p => {
      if (p.id === selectedPreset.id) {
        let newIndicators = [...p.indicators];
        if (editingIndicator) {
          newIndicators = newIndicators.map(item => item.id === editingIndicator.id ? newItem : item);
        } else {
          // Cegah duplikasi kode dalam satu preset
          if (newIndicators.some(item => item.code === cleanCode)) {
            alert(`Kode indikator ${cleanCode} sudah ada dalam preset ini.`);
            return p;
          }
          newIndicators.push(newItem);
        }
        return { ...p, indicators: newIndicators, updatedAt: new Date().toISOString() };
      }
      return p;
    });

    saveStoredPresets(updatedPresets);
    setPresets(updatedPresets);
    setShowIndicatorModal(false);
    setNoticeMessage({
      type: 'success',
      text: `Indikator ${cleanCode} berhasil disimpan ke preset "${selectedPreset.name}".`
    });
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Hapus Indikator dari Preset
  const handleDeleteIndicator = (indId: string, indCode: string) => {
    if (!confirm(`Hapus indikator ${indCode} dari preset "${selectedPreset.name}"?`)) return;

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
    setNoticeMessage({ type: 'warn', text: `Indikator ${indCode} telah dihapus.` });
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
            <div className="card-title">
              <div className="ct-icon">🌱</div>
              <span>Pilihan Indikator</span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Pilih kumpulan indikator yang akan disinkronkan ke <strong>Upload & Analisis</strong> serta <strong>Tabel Hasil</strong>:
            </p>

            {/* List Preset */}
            <div style={{ marginBottom: '18px' }}>
              {presets.map(p => {
                const isActive = p.id === activePresetId;
                const isSelected = p.id === selectedPresetId;

                return (
                  <div
                    key={p.id}
                    className={`preset-card-item ${isSelected ? 'selected' : ''} ${isActive ? 'is-active-preset' : ''}`}
                    onClick={() => setSelectedId(p.id)}
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
                            {p.name}
                          </label>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--stone)', marginLeft: '22px' }}>
                          <span className="badge" style={{ padding: '2px 8px', fontSize: '11px', background: 'var(--dew)', color: 'var(--fern)' }}>
                            {p.indicators.length} Indikator
                          </span>
                          {p.isDefault ? (
                            <span style={{ fontStyle: 'italic', opacity: 0.85 }}>Standar Baku</span>
                          ) : (
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Kustom</span>
                          )}
                        </div>
                      </div>

                      {isActive && (
                        <span title="Preset ini sedang aktif digunakan" style={{ color: 'var(--fern)', display: 'flex', alignItems: 'center' }}>
                          <CheckCircle2 size={16} />
                        </span>
                      )}
                    </div>

                    {!p.isDefault && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '10px' }} onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--danger)', borderColor: 'var(--border)' }}
                          onClick={() => handleDeletePreset(p.id, p.name)}
                          title="Hapus Preset Kustom"
                        >
                          <Trash2 size={12} /> Hapus
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
                title="Salin 18 indikator CED untuk membuat versi yang bisa diedit bebas"
              >
                <Copy size={14} />
                <span>Duplikasi dari CED 18</span>
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', fontSize: '12.5px' }}
                onClick={() => setShowPresetModal(true)}
              >
                <Plus size={14} />
                <span>Tambah Pilihan Indikator Baru</span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--bark)' }}>
                    {selectedPreset.name}
                  </h2>
                  {selectedPreset.id === activePresetId ? (
                    <span className="badge" style={{ background: 'var(--fern)', color: '#ffffff', padding: '3px 10px', fontSize: '11px', borderRadius: '20px' }}>
                      Sedang Aktif Digunakan ✅
                    </span>
                  ) : (
                    <span className="badge" style={{ background: 'var(--dew)', color: 'var(--stone)', padding: '3px 10px', fontSize: '11px', borderRadius: '20px' }}>
                      Pratinjau (Belum Aktif)
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {selectedPreset.description || 'Kumpulan indikator evaluasi keberlanjutan & pengungkapan.'}
                </p>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--stone)' }}>
                  Total Skor Maksimal: <strong>{selectedPreset.indicators.length * 5} Poin</strong> ({selectedPreset.indicators.length} Indikator × 5).
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
                    <span>Aktifkan Preset Ini</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => openIndicatorModal()}
                >
                  <Plus size={14} />
                  <span>Tambah Indikator</span>
                </button>
              </div>
            </div>
          </div>

          {/* Rubrik Penilaian Skor 0 - 5 */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-title">
              <div className="ct-icon">🎯</div>
              <span>Ketentuan Rubrik Penilaian Skor (0 – 5)</span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Setiap indikator dievaluasi dalam rentang <strong>0 hingga 5</strong> berdasarkan keluasan bukti pengungkapan:
            </p>

            <div className="grid-3">
              {SCORING_RUBRIC.map(item => (
                <div key={item.score} style={{ background: 'var(--dew)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span className={`score-badge score-${item.score}`}>{item.score}</span>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>{item.label}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--stone)', lineHeight: '1.4' }}>
                    {item.desc}
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
                <span>Daftar Indikator ({selectedPreset.indicators.length})</span>
              </div>
            </div>

            {selectedPreset.indicators.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--stone)', fontStyle: 'italic' }}>
                Belum ada indikator dalam preset ini. Silakan klik tombol <strong>"Tambah Indikator"</strong> di atas.
              </div>
            ) : (
              <div>
                {selectedPreset.indicators.map((ind, index) => (
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
                              {ind.title}
                            </h4>
                            {ind.group && (
                              <span style={{ fontSize: '11px', color: 'var(--stone)', background: 'var(--cream)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                {ind.group}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '12.5px', color: 'var(--stone)', marginTop: '4px', lineHeight: '1.5' }}>
                            {ind.fullDesc || 'Tidak ada deskripsi detail.'}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 8px', borderColor: 'var(--border)' }}
                          onClick={() => openIndicatorModal(ind)}
                          title="Edit Indikator"
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 8px', color: 'var(--danger)', borderColor: 'var(--border)' }}
                          onClick={() => handleDeleteIndicator(ind.id, ind.code)}
                          title="Hapus Indikator"
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
          MODAL: TAMBAH PRESET INDIKATOR BARU
          ======================================================== */}
      {showPresetModal && (
        <div className="modal-backdrop" onClick={() => setShowPresetModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🌱</span>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Tambah Pilihan Indikator (Preset Baru)</h3>
              </div>
              <button type="button" className="drawer-close-btn" onClick={() => setShowPresetModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePreset}>
              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>Nama Preset Indikator</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Misal: Standar GRI 2026 atau Indikator Sektor Batubara"
                  value={presetFormName}
                  onChange={e => setPresetFormName(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>Deskripsi (Opsional)</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Penjelasan singkat mengenai tujuan atau standar kumpulan indikator ini..."
                  value={presetFormDesc}
                  onChange={e => setPresetFormDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPresetModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Simpan Preset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: TAMBAH / EDIT INDIKATOR MANUAL
          ======================================================== */}
      {showIndicatorModal && (
        <div className="modal-backdrop" onClick={() => setShowIndicatorModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📋</span>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>
                  {editingIndicator ? `Edit Indikator ${editingIndicator.code}` : `Tambah Indikator ke "${selectedPreset.name}"`}
                </h3>
              </div>
              <button type="button" className="drawer-close-btn" onClick={() => setShowIndicatorModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveIndicator}>
              <div className="grid-2" style={{ gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>Kode Indikator (Singkat)</label>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder="Misal: WATER1, CC3, BIODIV"
                    value={indFormCode}
                    onChange={e => setIndFormCode(e.target.value.toUpperCase())}
                    required
                  />
                  <div style={{ fontSize: '11px', color: 'var(--stone)', marginTop: '2px' }}>Huruf kapital & angka tanpa spasi</div>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>Kelompok / Kategori</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Misal: Environmental, GHG, Governance"
                    value={indFormGroup}
                    onChange={e => setIndFormGroup(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>Judul Indikator</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Misal: Pengelolaan Daur Ulang Air & Konservasi"
                  value={indFormTitle}
                  onChange={e => setIndFormTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>Deskripsi Panduan Penilaian</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="Rincian panduan informasi apa yang harus dicari AI dalam dokumen dan bagaimana kriteria penilaiannya..."
                  value={indFormDesc}
                  onChange={e => setIndFormDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowIndicatorModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  {editingIndicator ? 'Simpan Perubahan' : 'Tambah Indikator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
