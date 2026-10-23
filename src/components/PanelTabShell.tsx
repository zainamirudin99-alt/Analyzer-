'use client';

import React from 'react';

export const PanelTabShell: React.FC = () => {
  return (
    <div className="panel-tab-shell" style={{
      maxWidth: '900px',
      margin: '40px auto',
      padding: '48px 32px',
      background: 'var(--card, #ffffff)',
      borderRadius: 'var(--radius, 16px)',
      boxShadow: 'var(--shadow, 0 4px 20px rgba(30, 61, 20, 0.08))',
      border: '1px solid var(--border, #d2e2ca)',
      textAlign: 'center'
    }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '72px',
        height: '72px',
        borderRadius: '20px',
        background: 'var(--dew, #eef7eb)',
        color: 'var(--fern, #2e6922)',
        fontSize: '32px',
        marginBottom: '20px'
      }}>
        📈
      </div>

      <div style={{ marginBottom: '12px' }}>
        <span style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: '999px',
          background: 'var(--mist, #c2e2b3)',
          color: 'var(--moss, #1e3d14)',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.5px',
          textTransform: 'uppercase'
        }}>
          Fase P0 — Cangkang Siap
        </span>
      </div>

      <h2 style={{
        fontSize: '24px',
        fontWeight: 800,
        color: 'var(--bark, #2b221a)',
        marginBottom: '12px'
      }}>
        Regresi Data Panel Stata
      </h2>

      <p style={{
        fontSize: '15px',
        color: 'var(--text-muted, #687962)',
        maxWidth: '560px',
        margin: '0 auto 28px',
        lineHeight: 1.6
      }}>
        Modul analisis ekonometrika data panel bergaya Stata (Common Effect, Fixed Effects, Random Effects, Uji Chow, Uji Hausman, Mundlak CRE, Uji Breusch-Pagan LM, dan Standard Error Ter-cluster Arellano). Alur kerja impor data dan pemetaan variabel akan diisi mulai Fase P1.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        textAlign: 'left',
        marginTop: '24px',
        borderTop: '1px solid var(--border-light, #e4efe0)',
        paddingTop: '24px'
      }}>
        <div style={{ padding: '12px', background: 'var(--cream, #f8faf6)', borderRadius: '10px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--fern, #2e6922)', marginBottom: '4px' }}>
            P1 — Impor & Pemetaan
          </div>
          <div style={{ fontSize: '12px', color: 'var(--stone, #687962)' }}>
            Dukungan .xlsx, .csv, dan link Google Sheets dengan proteksi SSRF.
          </div>
        </div>

        <div style={{ padding: '12px', background: 'var(--cream, #f8faf6)', borderRadius: '10px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--fern, #2e6922)', marginBottom: '4px' }}>
            P2 — Cek & Sanitasi
          </div>
          <div style={{ fontSize: '12px', color: 'var(--stone, #687962)' }}>
            Deteksi duplikat kunci (id, year), missing values, dan keseimbangan panel.
          </div>
        </div>

        <div style={{ padding: '12px', background: 'var(--cream, #f8faf6)', borderRadius: '10px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--fern, #2e6922)', marginBottom: '4px' }}>
            P3 s/d P6 — Mesin & Stata Block
          </div>
          <div style={{ fontSize: '12px', color: 'var(--stone, #687962)' }}>
            Estimasi OLS/GLS, diagnostik model, tampilan 4 blok Stata, dan ekspor.
          </div>
        </div>
      </div>
    </div>
  );
};
