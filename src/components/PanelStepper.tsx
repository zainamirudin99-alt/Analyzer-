'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export interface StepItem {
  index: number;
  title: string;
  shortDesc: string;
}

export const PANEL_STEPS: StepItem[] = [
  { index: 0, title: 'Deteksi Struktur', shortDesc: 'Cross-section / Panel' },
  { index: 1, title: 'Impor Data', shortDesc: 'Unggah berkas / link' },
  { index: 2, title: 'Pilih Sheet', shortDesc: 'Lembar kerja aktif' },
  { index: 3, title: 'Petakan Kolom', shortDesc: 'ID, Waktu, Y, X' },
  { index: 4, title: 'Cleaning & Data 0', shortDesc: 'Missing, Duplikat, Nilai 0' },
  { index: 5, title: 'Transformasi LN & xtsum', shortDesc: 'Analisis LN & Deskriptif' },
  { index: 6, title: 'Korelasi Matriks', shortDesc: 'Pearson & Spearman' },
  { index: 7, title: 'Deklarasi xtset', shortDesc: 'xtset id year' },
  { index: 8, title: 'Panggil CEM, FEM, REM', shortDesc: 'Estimasi 3 Model Panel' },
  { index: 9, title: 'Uji Chow, Hausman, LM', shortDesc: 'Chow Dummy, Hausman, LM' },
  { index: 10, title: 'Model Terpilih', shortDesc: 'Gunakan variabel terakhir' },
  { index: 11, title: 'Asumsi, orthog & Normalitas', shortDesc: 'VIF, orthog, Histogram, sktest' },
  { index: 12, title: 'Hasil Robust & Interpretasi', shortDesc: 'vce(robust) & Bahasa Mudah' }
];

export interface PanelStepperProps {
  activeStep: number;
  maxReachedStep: number;
  onSelectStep: (step: number) => void;
  onToggleCollapse?: () => void;
}

export const PanelStepper: React.FC<PanelStepperProps> = ({
  activeStep,
  maxReachedStep,
  onSelectStep,
  onToggleCollapse
}) => {
  return (
    <div
      className="panel-stepper-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        background: 'var(--card, #ffffff)',
        border: '1px solid var(--border, #d2e2ca)',
        borderRadius: 'var(--radius, 16px)',
        padding: '16px',
        boxShadow: 'var(--shadow, 0 4px 20px rgba(30, 61, 20, 0.08))'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          paddingLeft: '6px',
          paddingRight: '2px'
        }}
      >
        <div
          style={{
            fontSize: '11.5px',
            fontWeight: 800,
            color: 'var(--stone, #687962)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}
        >
          Tahapan Stata (0-12)
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Sembunyikan Stepper untuk tampilan layar penuh"
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--primary)',
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease'
            }}
          >
            <span>◀ Tutup</span>
          </button>
        )}
      </div>

      <div
        className="panel-stepper-list"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}
      >
        {PANEL_STEPS.map(step => {
          const isActive = step.index === activeStep;
          const isCompleted = step.index < maxReachedStep;
          const isAccessible = step.index <= maxReachedStep;

          return (
            <button
              key={step.index}
              onClick={() => isAccessible && onSelectStep(step.index)}
              disabled={!isAccessible}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                minHeight: '44px',
                borderRadius: '10px',
                border: 'none',
                background: isActive
                  ? 'var(--primary)'
                  : isCompleted
                  ? 'var(--primary-glow)'
                  : 'transparent',
                color: isActive
                  ? '#ffffff'
                  : isCompleted
                  ? 'var(--primary)'
                  : isAccessible
                  ? 'var(--text)'
                  : 'var(--text-muted)',
                cursor: isAccessible ? 'pointer' : 'not-allowed',
                opacity: isAccessible ? 1 : 0.45,
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.2s ease'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  fontSize: '12px',
                  fontWeight: 700,
                  background: isActive
                    ? 'rgba(255, 255, 255, 0.25)'
                    : isCompleted
                    ? 'var(--primary)'
                    : 'var(--surface-sunken)',
                  color: isActive ? '#ffffff' : isCompleted ? '#ffffff' : 'var(--text-muted)'
                }}
              >
                {isCompleted && !isActive ? (
                  <CheckCircle2 size={16} />
                ) : (
                  step.index
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: isActive ? 700 : 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    opacity: isActive ? 0.85 : 0.75,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {step.shortDesc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
