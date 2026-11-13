'use client';

import React, { useState } from 'react';
import { Layers, Activity } from 'lucide-react';
import { PanelTab } from './PanelTab';
import { PanelLatentTab } from './PanelLatentTab';

/**
 * Hub selector inside menu "Regresi Data Panel Stata".
 * Strictly preserves Option 1 (existing Regresi Data Panel) with zero changes,
 * while offering Option 2 (Panel Latent Variable Measurement Model) separately.
 */
export const PanelTabHub: React.FC = () => {
  const [selectedOption, setSelectedOption] = useState<'classic' | 'latent'>('classic');

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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
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
            onClick={() => setSelectedOption('latent')}
            style={{
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: 'var(--radius)',
              border: selectedOption === 'latent' ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: selectedOption === 'latent' ? 'var(--info-bg)' : 'var(--surface-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              minHeight: '92px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14.5px', fontWeight: 800, color: 'var(--text)' }}>
              <Activity size={18} color="var(--primary)" />
              OPTION 2: PANEL LATENT VARIABLE MEASUREMENT MODEL
            </div>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--primary)' }}>
              Bayesian Hierarchical Measurement Model for Multi-Source Data Integration
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Integrasi tiga sumber pengukuran CO₂ (Self-Reporting, Satellite, Sensor) untuk mengestimasi nilai laten Y*, bias relatif, reliabilitas, dan ketidakpastian tiap sumber.
            </span>
          </button>
        </div>
      </div>

      {/* Render selected module independently */}
      {selectedOption === 'classic' ? <PanelTab /> : <PanelLatentTab />}
    </div>
  );
};

