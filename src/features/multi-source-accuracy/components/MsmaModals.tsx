'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Info,
  Search,
  Terminal,
  X
} from 'lucide-react';
import {
  MsmaAuditTrailEntry,
  MsmaBibliographyEntry,
  MsmaStepStataBundle
} from '../types';
import {
  MSMA_BIBLIOGRAPHY_CATEGORIES,
  MSMA_GLOSSARY_ITEMS,
  MSMA_VERIFIED_BIBLIOGRAPHY
} from '../utils/bibliography';

/**
 * Native <dialog> wrapper following modern-web-guidance:
 * - Uses showModal() for focus containment, top-layer, Esc dismissal, and focus return
 * - Does NOT add redundant role="dialog" or aria-modal
 * - Implements light-dismiss pointer bounds fallback when native closedBy is unavailable
 */
export const MsmaNativeModal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: string;
  allowLightDismiss?: boolean;
  children: React.ReactNode;
}> = ({
  open,
  onClose,
  title,
  maxWidth = '780px',
  allowLightDismiss = true,
  children
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = `msma-dlg-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 36)}`;
  const pressedOutsideRef = useRef<boolean>(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleNativeClose = () => {
      el.returnValue = '';
      onClose();
    };
    el.addEventListener('close', handleNativeClose);
    return () => el.removeEventListener('close', handleNativeClose);
  }, [onClose]);

  const isOutside = (e: React.PointerEvent<HTMLDialogElement>, el: HTMLDialogElement) => {
    const r = el.getBoundingClientRect();
    return (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    );
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: allowLightDismiss ? 'any' : 'closerequest' } as Record<string, string>)}
      className="msma-dialog"
      style={{ maxWidth, width: 'calc(100vw - 28px)' }}
      onPointerDown={e => {
        if (!allowLightDismiss || !dialogRef.current) return;
        if (!('closedBy' in HTMLDialogElement.prototype)) {
          pressedOutsideRef.current = isOutside(e, dialogRef.current);
        }
      }}
      onPointerUp={e => {
        if (!allowLightDismiss || !dialogRef.current) return;
        if (!('closedBy' in HTMLDialogElement.prototype)) {
          if (pressedOutsideRef.current && isOutside(e, dialogRef.current)) {
            dialogRef.current.close();
          }
          pressedOutsideRef.current = false;
        }
      }}
    >
      <div className="msma-dialog-inner">
        <div className="msma-dialog-header">
          <h1 id={titleId} style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: 'var(--text)' }}>
            {title}
          </h1>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => dialogRef.current?.close()}
            aria-label="Tutup dialog"
            style={{ minHeight: '44px', minWidth: '44px', padding: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={17} />
          </button>
        </div>
        <div className="msma-dialog-body">{children}</div>
      </div>
    </dialog>
  );
};

export const StatTermButton: React.FC<{
  termKey: keyof typeof MSMA_GLOSSARY_ITEMS | string;
  labelOverride?: string;
  onOpenTerm: (termKey: string) => void;
}> = ({ termKey, labelOverride, onOpenTerm }) => {
  const item = MSMA_GLOSSARY_ITEMS[termKey];
  if (!item) return <span>{labelOverride ?? termKey}</span>;

  return (
    <button
      type="button"
      onClick={() => onOpenTerm(termKey)}
      title={`Klik untuk melihat penjelasan "${item.termLabel}"`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        minHeight: '30px',
        borderRadius: '999px',
        border: '1px solid var(--info-border)',
        background: 'var(--info-bg)',
        color: 'var(--primary)',
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
        verticalAlign: 'middle'
      }}
    >
      <span>{labelOverride ?? item.termLabel}</span>
      <Info size={13} aria-hidden="true" />
    </button>
  );
};

export const MsmaGlossaryModal: React.FC<{
  activeTermKey: string | null;
  onSelectTermKey: (key: string | null) => void;
}> = ({ activeTermKey, onSelectTermKey }) => {
  const [search, setSearch] = useState('');
  const allItems = useMemo(() => Object.values(MSMA_GLOSSARY_ITEMS), []);
  const selected = activeTermKey ? MSMA_GLOSSARY_ITEMS[activeTermKey] : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      it =>
        it.termLabel.toLowerCase().includes(q) ||
        it.fullExpansion.toLowerCase().includes(q) ||
        it.simpleDefinition.toLowerCase().includes(q)
    );
  }, [allItems, search]);

  return (
    <MsmaNativeModal
      open={Boolean(activeTermKey)}
      onClose={() => onSelectTermKey(null)}
      title={selected ? `Keterangan Statistik — ${selected.termLabel}` : 'Kamus Istilah Statistik'}
      maxWidth="760px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {selected && (
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div>
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>
                1. Kepanjangan Istilah
              </span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>
                {selected.fullExpansion}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--success)', textTransform: 'uppercase' }}>
                2. Definisi Sederhana
              </span>
              <p style={{ margin: '2px 0 0', fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.55 }}>
                {selected.simpleDefinition}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                3. Penjelasan Teknis
              </span>
              <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {selected.technicalExplanation}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--primary)' }}>4. Mengapa Penting</div>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selected.whyImportant}
                </p>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--warn)' }}>5. Contoh Sederhana</div>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selected.simpleExample}
                </p>
              </div>
            </div>

            <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--primary)' }}>
                6. Dampaknya terhadap Hasil Analisis
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.5 }}>
                {selected.impactOnAnalysis}
              </p>
            </div>
          </div>
        )}

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Jelajahi Istilah Statistik Lainnya ({filtered.length} istilah):
            </span>
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari istilah..."
                aria-label="Cari istilah statistik"
                style={{
                  width: '100%',
                  minHeight: '42px',
                  padding: '8px 10px 8px 30px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {filtered.map(it => (
              <button
                key={it.termKey}
                type="button"
                onClick={() => onSelectTermKey(it.termKey)}
                className={it.termKey === activeTermKey ? 'btn btn-primary' : 'btn btn-outline'}
                style={{ minHeight: '38px', padding: '6px 12px', fontSize: '12px' }}
              >
                {it.termLabel}
              </button>
            ))}
          </div>
        </div>
      </div>
    </MsmaNativeModal>
  );
};

export const MsmaBibliographyModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const [selectedCat, setSelectedCat] = useState<string>('ALL');
  const [query, setQuery] = useState<string>('');

  const items = useMemo(() => {
    return MSMA_VERIFIED_BIBLIOGRAPHY.filter(entry => {
      const catOk = selectedCat === 'ALL' || entry.category === selectedCat;
      const q = query.trim().toLowerCase();
      if (!q) return catOk;
      return (
        catOk &&
        (entry.title.toLowerCase().includes(q) ||
          entry.authors.toLowerCase().includes(q) ||
          entry.doi.toLowerCase().includes(q) ||
          entry.methodCovered.toLowerCase().includes(q))
      );
    });
  }, [selectedCat, query]);

  return (
    <MsmaNativeModal
      open={open}
      onClose={onClose}
      title="Referensi Metodologi & Jurnal Ilmiah Terverifikasi (Crossref)"
      maxWidth="960px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            fontSize: '12.5px',
            color: 'var(--text)'
          }}
        >
          Seluruh <strong>{MSMA_VERIFIED_BIBLIOGRAPHY.length} publikasi ilmiah</strong> di bawah ini (mencakup ke-11 seed bibliography dan 7 rujukan metodologis inti) telah diverifikasi metadatanya (penulis, tahun, jurnal, penerbit, dan DOI) secara langsung melalui <strong>Crossref REST API</strong>.
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setSelectedCat('ALL')}
              className={selectedCat === 'ALL' ? 'btn btn-primary' : 'btn btn-outline'}
              style={{ minHeight: '40px', padding: '6px 12px', fontSize: '12px' }}
            >
              Semua Kategori ({MSMA_VERIFIED_BIBLIOGRAPHY.length})
            </button>
            {MSMA_BIBLIOGRAPHY_CATEGORIES.map(cat => {
              const cnt = MSMA_VERIFIED_BIBLIOGRAPHY.filter(b => b.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCat(cat)}
                  className={selectedCat === cat ? 'btn btn-primary' : 'btn btn-outline'}
                  style={{ minHeight: '40px', padding: '6px 12px', fontSize: '12px' }}
                >
                  {cat} ({cnt})
                </button>
              );
            })}
          </div>

          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter penulis, judul, atau DOI..."
            aria-label="Filter referensi jurnal"
            style={{
              minWidth: '240px',
              minHeight: '42px',
              padding: '8px 12px',
              fontSize: '16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map((ref: MsmaBibliographyEntry) => (
            <div
              key={ref.id}
              style={{
                padding: '14px 16px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: '999px',
                    background: 'var(--info-bg)',
                    border: '1px solid var(--info-border)',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: 'var(--primary)'
                  }}
                >
                  {ref.category} · {ref.year}
                </span>
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>DOI: {ref.doi}</span>
                  <ExternalLink size={13} />
                </a>
              </div>

              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', lineHeight: 1.4 }}>
                {ref.title}
              </div>

              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                <strong>Penulis:</strong> {ref.authors} · <strong>Jurnal:</strong> <em>{ref.journal}</em> ({ref.publisher})
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong>Metode:</strong> {ref.methodCovered}
                <br />
                <strong>Kontribusi:</strong> {ref.contributionSummary}
                <br />
                <strong>Relevansi pada Fitur:</strong> {ref.relevanceToFeature}
              </div>
            </div>
          ))}
        </div>
      </div>
    </MsmaNativeModal>
  );
};

export const MsmaUsageGuideModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => (
  <MsmaNativeModal
    open={open}
    onClose={onClose}
    title="Panduan Penggunaan — Multi-Source Measurement Accuracy Analysis"
    maxWidth="780px"
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
      <p style={{ margin: 0, color: 'var(--text)', fontWeight: 600 }}>
        Fitur ini mengevaluasi akurasi relatif dua atau lebih sumber pengukuran pada struktur data panel tanpa memerlukan data Ground Truth yang bebas kesalahan.
      </p>
      <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 }}>
        <li>
          <strong>Step 1 (Upload Data):</strong> Unggah berkas Excel (<code>.xlsx</code>, <code>.xls</code>) atau <code>.csv</code>, pilih worksheet dan baris header, atau muat salah satu dari 5 Contoh Dataset Penelitian.
        </li>
        <li>
          <strong>Step 2 (Struktur Panel):</strong> Pastikan kolom ID Entitas (mis. Kota) dan Waktu (mis. Tahun) sesuai. Panel seimbang maupun tidak seimbang didukung dengan audit risiko missingness.
        </li>
        <li>
          <strong>Step 3 (Sumber Pengukuran):</strong> Pilih minimal 2 kolom sumber pengukuran serta lengkapi satuan, definisi variabel, dan cakupan wilayah. Jangan memasukkan variabel kontrol (seperti PDRB/Populasi) sebagai sumber.
        </li>
        <li>
          <strong>Step 4 (Klasifikasi Contoh A vs B):</strong> Sistem memeriksa apakah seluruh sumber mengukur konstruk fisik yang sama (Contoh A) atau berbeda (Contoh B, mis. ton/tahun vs ppm). Jika Contoh B tidak memiliki model konversi fisik, sistem menahan pemeringkatan semu.
        </li>
        <li>
          <strong>Step 5–7 (Deskriptif, Diagnostik &amp; Transformasi):</strong> Tinjau distribusi, korelasi, dan pengujian asumsi. Terapkan transformasi hanya bila disarankan secara statistik; gunakan tombol <strong>Undo/Redo</strong> kapan saja.
        </li>
        <li>
          <strong>Step 8–9 (Estimasi Utama &amp; Robustness):</strong> Sistem menjalankan <em>Bland-Altman &amp; Deming</em> (2 sumber), <em>Triple Collocation</em> (3 sumber), atau <em>N-Cornered Hat / Extended Collocation</em> (≥4 sumber) dengan <em>Entity-Cluster Bootstrap</em> dan 8 uji sensitivitas.
        </li>
        <li>
          <strong>Step 10 (Laporan Akhir &amp; Artikel Jurnal):</strong> Tinjau kompilasi output Stata, sunting draf artikel ilmiah 14 bagian, lalu ekspor ke PDF A4, DOCX (kompatibel Google Docs), Excel, atau Stata Do-File.
        </li>
      </ol>
    </div>
  </MsmaNativeModal>
);

export const MsmaHistoryModal: React.FC<{
  open: boolean;
  onClose: () => void;
  auditTrail: MsmaAuditTrailEntry[];
}> = ({ open, onClose, auditTrail }) => (
  <MsmaNativeModal
    open={open}
    onClose={onClose}
    title="Riwayat Analisis & Audit Trail Perubahan"
    maxWidth="680px"
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {auditTrail.map(entry => (
        <div
          key={entry.id}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--surface-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap'
          }}
        >
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
              {entry.actionLabel} {entry.stepNumber > 0 ? `(Step ${entry.stepNumber})` : ''}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{entry.detail}</div>
          </div>
          <span style={{ fontSize: '11.5px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            {entry.timestamp}
          </span>
        </div>
      ))}
    </div>
  </MsmaNativeModal>
);

export const MsmaResetConfirmModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirmReset: () => void;
}> = ({ open, onClose, onConfirmReset }) => (
  <MsmaNativeModal
    open={open}
    onClose={onClose}
    title="Konfirmasi Reset Seluruh Analisis"
    maxWidth="500px"
    allowLightDismiss={false}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
          padding: '12px',
          borderRadius: '10px',
          background: 'var(--warn-bg)',
          border: '1px solid var(--warn-border)',
          fontSize: '13px',
          color: 'var(--text)'
        }}
      >
        <AlertTriangle size={18} color="var(--warn)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          Tindakan ini akan mengembalikan seluruh pengaturan sumber, klasifikasi Contoh A/B, dan transformasi ke kondisi awal saat dataset dimuat. Data asli Anda tidak akan terhapus dan Anda masih dapat menekan <strong>Undo</strong> setelahnya.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button
          type="button"
          autoFocus
          className="btn btn-outline"
          onClick={onClose}
          style={{ minHeight: '44px', padding: '8px 16px' }}
        >
          Batal
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            onConfirmReset();
            onClose();
          }}
          style={{ minHeight: '44px', padding: '8px 16px', background: 'var(--danger)', borderColor: 'var(--danger)' }}
        >
          Ya, Reset Analisis
        </button>
      </div>
    </div>
  </MsmaNativeModal>
);

export const MsmaStepStataBanner: React.FC<{
  bundle: MsmaStepStataBundle | undefined;
}> = ({ bundle }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!bundle) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(bundle.stataCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadStepDo = () => {
    const blob = new Blob([bundle.stataCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MSMA_Step${bundle.stepNumber}_Stata.do`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const originBadge =
    bundle.commandOrigin === 'BUILT_IN_STATA'
      ? 'Built-in Stata Command'
      : bundle.commandOrigin === 'BUILT_IN_STATA_AND_MATA'
        ? 'Built-in Stata + Mata Matrix Function'
        : 'Built-in Stata + Paket Komunitas Opsional';

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '12px',
        background: 'var(--surface-muted)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Terminal size={17} color="var(--primary)" />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
              Stata Commands for This Step
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              {bundle.stataVersionCompatibility} · <strong>{originBadge}</strong> · Output dikompilasi penuh pada Step Akhir
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleCopy}
            style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Tersalin' : 'Salin Command'}</span>
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>{open ? 'Sembunyikan Sintaks' : 'Lihat Sintaks Stata'}</span>
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
          <pre
            style={{
              margin: 0,
              padding: '12px 14px',
              borderRadius: '8px',
              background: '#0f172a',
              color: '#e2e8f0',
              fontSize: '12px',
              lineHeight: 1.55,
              overflowX: 'auto'
            }}
          >
            <code>{bundle.stataCode}</code>
          </pre>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {bundle.explanationBullets.map((b, idx) => (
                <li key={idx}>{b}</li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleDownloadStepDo}
              style={{ minHeight: '40px', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} />
              <span>Unduh Step .do</span>
            </button>
          </div>

          {bundle.requiredExternalPackages.length > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--info-bg)', border: '1px solid var(--info-border)', fontSize: '12px' }}>
              <strong>Paket Komunitas Opsional:</strong>
              {bundle.requiredExternalPackages.map(pkg => (
                <div key={pkg.name} style={{ marginTop: '4px' }}>
                  <code>{pkg.name}</code> ({pkg.purpose}) — Instalasi: <code>{pkg.installCmd}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
