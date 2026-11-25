'use client';

import React, { useState } from 'react';
import { Layers, Activity, ShieldCheck, Sparkles } from 'lucide-react';
import { PanelTab } from './PanelTab';
import { PanelAccuracyTab } from './PanelAccuracyTab';
import { PanelAdvancedAccuracyTab } from './PanelAdvancedAccuracyTab';
import { PanelMethodologyComparisonPanel } from './PanelMethodologyComparisonPanel';

/**
 * Hub selector inside menu "Regresi Data Panel Stata".
 * Strictly preserves Option 1 (existing Regresi Data Panel) and Option 2 (existing Latent Accuracy)
 * with zero changes, while adding Option 3 (Advanced Latent Measurement Model & Panel Accuracy Validation)
 * and the dedicated Option 2 vs Option 3 Comparative Methodology Evaluator as isolated siblings.
 */
export const PanelTabHub: React.FC = () => {
  const [selectedOption, setSelectedOption] = useState<
    'classic' | 'accuracy' | 'accuracy_v3' | 'compare_2_3'
  >('classic');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Option Switcher Banner */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
              Regresi Data Panel Stata
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Pilih metodologi analisis panel yang sesuai dengan rancangan penelitian Anda.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(265px, 1fr))', gap: '12px' }}>
          <button
            type="button"
            onClick={() => setSelectedOption('classic')}
            style={{
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: 'var(--radius)',
              border: selectedOption === 'classic' ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: selectedOption === 'classic' ? 'var(--info-bg)' : 'var(--surface-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              minHeight: '92px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>
              <Layers size={18} color="var(--primary)" />
              OPTION 1: REGRESI DATA PANEL
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Estimasi Common Effect, Fixed Effect, Random Effect, Uji Chow, Hausman, Mundlak CRE, Breusch-Pagan LM, diagnostik klasik, dan Cluster SE bergaya Stata.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedOption('accuracy')}
            style={{
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: 'var(--radius)',
              border: selectedOption === 'accuracy' ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: selectedOption === 'accuracy' ? 'var(--info-bg)' : 'var(--surface-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              minHeight: '92px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>
              <Activity size={18} color="var(--primary)" />
              OPTION 2: MODEL PENGUKURAN LATEN &amp; AKURASI PANEL
            </div>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--primary)' }}>
              Baseline Metodologi Eksisting (ISO 5725 — Tidak Diubah)
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Menilai dan memeringkatkan seluruh sumber pengukuran data panel secara setara tanpa variabel referensi terkunci — menguji Trueness (bias α), faktor skala (λ), presisi galat (σ_ε), Total Latent RMSE, Validasi LOSO, Lin&apos;s CCC, Audit Korelasi Galat, Pair Fixed Effects &amp; Driscoll-Kraay SE.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedOption('accuracy_v3')}
            style={{
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: 'var(--radius)',
              border: selectedOption === 'accuracy_v3' ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: selectedOption === 'accuracy_v3' ? 'var(--info-bg)' : 'var(--surface-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              minHeight: '92px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>
              <ShieldCheck size={18} color="var(--primary)" />
              OPTION 3: ADVANCED LATENT MEASUREMENT MODEL &amp; PANEL ACCURACY VALIDATION
            </div>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--primary)' }}>
              Metodologi Baru: Woodbury MCMC, Multi-Anchor, Holm FWER &amp; Monte Carlo
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Mesin Keputusan Otomatis 12 komponen, diagnostik konvergensi Vehtari (2021), seleksi ketergantungan galat WAIC/PSIS-LOO, rasio invarian R_j = σ_j/|λ_j|, audit multi-anchor, Pair FE terkoreksi Holm (1979), Mixed-Effects LoA, dan validasi Monte Carlo 7 keluarga.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedOption('compare_2_3')}
            style={{
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: 'var(--radius)',
              border: selectedOption === 'compare_2_3' ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: selectedOption === 'compare_2_3' ? 'var(--info-bg)' : 'var(--surface-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              minHeight: '92px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>
              <Sparkles size={18} color="var(--primary)" />
              KOMPARASI METODOLOGI: OPSI 2 VS OPSI 3
            </div>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--primary)' }}>
              Evaluasi Berdampingan pada Dataset Identik (19 Dimensi)
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Jalankan Opsi 2 secara terpisah, Opsi 3 secara terpisah, atau keduanya sekaligus pada dataset yang sama — membandingkan peringkat, ketidakpastian posterior, sensitivitas anchor, diagnostik, dan rekomendasi metodologi berbasis bukti.
            </span>
          </button>
        </div>
      </div>

      {/* Render selected module independently with zero shared mutable state */}
      {selectedOption === 'classic' && <PanelTab />}
      {selectedOption === 'accuracy' && <PanelAccuracyTab />}
      {selectedOption === 'accuracy_v3' && (
        <PanelAdvancedAccuracyTab onOpenComparison={() => setSelectedOption('compare_2_3')} />
      )}
      {selectedOption === 'compare_2_3' && <PanelMethodologyComparisonPanel />}
    </div>
  );
};

