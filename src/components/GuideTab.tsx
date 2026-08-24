'use client';

import React from 'react';
import { CED_GROUPS, INDICATOR_DESCRIPTIONS, SCORING_RUBRIC } from '@/lib/types';

export const GuideTab: React.FC = () => {
  return (
    <div>
      {/* Rubrik Penilaian Skor 0 - 5 */}
      <div className="card">
        <div className="card-title">
          <div className="ct-icon">🎯</div>
          <span>Ketentuan Rubrik Penilaian Skor (0 – 5)</span>
        </div>

        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '18px' }}>
          Setiap indikator dinilai dalam rentang <strong>0 hingga 5</strong> berdasarkan luas dan kedalaman pengungkapan informasi dalam laporan tahunan/keberlanjutan:
        </p>

        <div className="grid-3">
          {SCORING_RUBRIC.map(item => (
            <div key={item.score} style={{ background: 'var(--dew)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span className={`score-badge score-${item.score}`}>{item.score}</span>
                <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>{item.label}</span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--stone)', lineHeight: '1.45' }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Rincian 18 Indikator CED */}
      <div className="card">
        <div className="card-title">
          <div className="ct-icon">🌱</div>
          <span>18 Indikator Carbon Emission Disclosure (CED)</span>
        </div>

        <div className="alert alert-info" style={{ marginBottom: '22px' }}>
          <span>🌲</span>
          <span>
            Total skor maksimal dari 18 indikator adalah <strong>90 Poin</strong> (18 × 5). Klasifikasi tingkat pengungkapan: <strong>Sangat Tinggi (≥72)</strong>, <strong>Tinggi (54–71)</strong>, <strong>Sedang (36–53)</strong>, <strong>Rendah (18–35)</strong>, dan <strong>Sangat Rendah (&lt;18)</strong>.
          </span>
        </div>

        {CED_GROUPS.map(group => (
          <div key={group.id} className="guide-group">
            <div className="guide-group-hd">
              <span style={{ fontSize: '18px' }}>{group.emoji}</span>
              <div>
                <div>{group.name}</div>
                <div style={{ fontSize: '11.5px', fontWeight: 500, opacity: 0.8, marginTop: '2px' }}>{group.description}</div>
              </div>
            </div>

            {group.keys.map(k => {
              const upper = k.toUpperCase();
              const info = INDICATOR_DESCRIPTIONS[k];
              return (
                <div key={k} className="guide-item">
                  <div className="guide-key">{upper}</div>
                  <div className="guide-desc">
                    <h4>{info.title}</h4>
                    <p>{info.fullDesc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
