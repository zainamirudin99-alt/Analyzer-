'use client';

import React from 'react';
import { CheckCircle2, Circle, Clock } from 'lucide-react';

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
  { index: 4, title: 'Cek & Bersih Data', shortDesc: 'Duplikasi & Balance' },
  { index: 5, title: 'Deskriptif xtsum', shortDesc: 'Overall, Between, Within' },
  { index: 6, title: 'Korelasi Matriks', shortDesc: 'Pearson & Spearman' },
  { index: 7, title: 'Deklarasi xtset', shortDesc: 'Kunci struktur panel' },
  { index: 8, title: 'Estimasi Awal', shortDesc: 'CEM, FEM, REM' },
  { index: 9, title: 'Uji Pemilihan', shortDesc: 'Chow, Hausman, LM' },
  { index: 10, title: 'Model Terpilih', shortDesc: 'Estimasi model juara' },
  { index: 11, title: 'Asumsi & Remedial', shortDesc: 'VIF, Greene, Wooldridge' },
  { index: 12, title: 'Model Akhir', shortDesc: 'Cluster-Robust SE' }
];

interface PanelStepperProps {
  activeStep: number;
  maxReachedStep: number;
  onSelectStep: (step: number) => void;
}

export const PanelStepper: React.FC<PanelStepperProps> = ({
  activeStep,
  maxReachedStep,
  onSelectStep
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
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--stone, #687962)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
          paddingLeft: '8px'
        }}
      >
        Tahapan Ekonometrika (0 s/d 12)
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
                  ? 'var(--fern, #2e6922)'
                  : isCompleted
                  ? 'var(--dew, #eef7eb)'
                  : 'transparent',
                color: isActive
                  ? '#ffffff'
                  : isCompleted
                  ? 'var(--moss, #1e3d14)'
                  : isAccessible
                  ? 'var(--bark, #2b221a)'
                  : 'var(--stone, #687962)',
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
                    ? 'var(--sage, #7cb862)'
                    : 'var(--border, #d2e2ca)',
                  color: isActive ? '#ffffff' : isCompleted ? '#ffffff' : 'var(--stone, #687962)'
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
