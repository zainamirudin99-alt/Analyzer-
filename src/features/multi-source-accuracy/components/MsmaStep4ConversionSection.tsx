'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Sparkles
} from 'lucide-react';
import {
  MsmaConstructClassificationResult,
  MsmaSourceConfig,
  MsmaStep4ConversionAdvisor,
  MsmaStep4SourceRecommendation
} from '../types';
import { fmtAdaptive } from '../utils/numerical';

interface Props {
  sources: MsmaSourceConfig[];
  classification: MsmaConstructClassificationResult;
  advisor: MsmaStep4ConversionAdvisor;
  onApplyAllRecommendations: () => void;
  onApplySingleRecommendation: (rec: MsmaStep4SourceRecommendation) => void;
  onDisableAllConversions: () => void;
  onUpdateSource: (
    sourceId: string,
    updater: (src: MsmaSourceConfig) => MsmaSourceConfig,
    actionLabel: string,
    detail: string
  ) => void;
  onGoToStep3: () => void;
}

function tierBadgeStyle(tier: MsmaStep4SourceRecommendation['tier']): {
  bg: string;
  fg: string;
  border: string;
  label: string;
} {
  if (tier === 'EXACT_METRIC') {
    return {
      bg: 'var(--success-bg)',
      fg: 'var(--success)',
      border: 'var(--success-border)',
      label: 'Konversi Metrik SI Eksak'
    };
  }
  if (tier === 'EMPIRICAL_SAME_GAS_BRIDGE') {
    return {
      bg: 'var(--info-bg)',
      fg: 'var(--primary)',
      border: 'var(--info-border)',
      label: 'Jembatan Empiris Gas Sama (Eksploratori)'
    };
  }
  return {
    bg: 'var(--warn-bg)',
    fg: 'var(--warn)',
    border: 'var(--warn-border)',
    label: 'Lintas-Polutan / Korelasi Lemah (Tidak Disarankan)'
  };
}

function parseFiniteInput(raw: string, fallback: number): number {
  if (raw.trim() === '' || raw.trim() === '-') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const MsmaStep4ConversionSection: React.FC<Props> = ({
  sources,
  classification,
  advisor,
  onApplyAllRecommendations,
  onApplySingleRecommendation,
  onDisableAllConversions,
  onUpdateSource,
  onGoToStep3
}) => {
  const refSource = sources[0];
  const anyEnabled = sources.slice(1).some(s => s.conversionModelEnabled);

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
          Pemeriksaan Model Konversi Fisik &amp; Propagasi Uncertainty (Contoh B)
        </h4>
        <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Standardisasi Z-score, Min-Max, atau normalisasi persentil <strong>ditolak</strong> karena tidak menyamakan konstruk fisik. Untuk hasil terbaik dan mencegah isian kosong (<code>Slope = 1, σ_conv = 0</code>), sistem menganalisis pasangan data panel Anda terhadap sumber acuan (<strong>{refSource?.displayName}</strong> [{refSource?.unit}]) dan menyajikan rekomendasi pengisian otomatis di bawah ini.
        </p>
      </div>

      {/* System Smart Conversion Advisor Banner */}
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '14px 16px',
          borderRadius: '10px',
          borderLeft: `4px solid ${
            advisor.overallTier === 'EXACT_METRIC_READY'
              ? 'var(--success)'
              : advisor.overallTier === 'EXPLORATORY_SAME_GAS'
                ? 'var(--primary)'
                : 'var(--warn)'
          }`,
          background:
            advisor.overallTier === 'CROSS_POLLUTANT_NOT_RECOMMENDED'
              ? 'var(--warn-bg)'
              : 'var(--info-bg)',
          borderTop: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
            <Sparkles size={18} color="var(--primary)" aria-hidden="true" />
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
              {advisor.headlineRecommendation}
            </span>
          </div>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: '999px',
              fontSize: '11.5px',
              fontWeight: 800,
              background: advisor.probeIdentifiableIfApplied ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: advisor.probeIdentifiableIfApplied ? 'var(--success)' : 'var(--danger)',
              border: `1px solid ${advisor.probeIdentifiableIfApplied ? 'var(--success-border)' : 'var(--danger-border)'}`
            }}
          >
            {advisor.probeIdentifiableIfApplied
              ? `Pratinjau Jika Diisi: Step 8 Teridentifikasi ✓ (${advisor.probeTopSourceIfApplied ?? 'Siap'})`
              : 'Pratinjau Jika Diisi: Tetap Terkena Heywood / Tidak Teridentifikasi'}
          </span>
        </div>

        <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {advisor.scientificExplanation}
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {advisor.overallTier === 'CROSS_POLLUTANT_NOT_RECOMMENDED' ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={anyEnabled ? onDisableAllConversions : onGoToStep3}
                style={{ minHeight: '44px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>
                  {anyEnabled
                    ? 'Ikuti Rekomendasi Terbaik: Nonaktifkan Konversi Paksa (Gunakan Analisis Alternatif)'
                    : 'Ikuti Rekomendasi Terbaik: Pilih Sumber Sepadan di Step 3'}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={onApplyAllRecommendations}
                style={{ minHeight: '44px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Sliders size={15} aria-hidden="true" />
                <span>Isi Otomatis Nilai Jembatan Empiris &amp; σ_conv (Mode Eksploratori)</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onApplyAllRecommendations}
              style={{ minHeight: '44px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={15} aria-hidden="true" />
              <span>
                {advisor.overallTier === 'EXACT_METRIC_READY'
                  ? 'Terapkan Semua Rekomendasi Konversi Metrik SI Eksak'
                  : 'Isi Otomatis Semua Rekomendasi Kalibrasi & σ_conv Terbaik'}
              </span>
            </button>
          )}
          {anyEnabled && advisor.overallTier !== 'CROSS_POLLUTANT_NOT_RECOMMENDED' && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={onDisableAllConversions}
              style={{ minHeight: '44px', padding: '8px 14px', fontSize: '12px' }}
            >
              Nonaktifkan Semua Konversi
            </button>
          )}
        </div>
      </div>

      {/* Per-Source Conversion Form + Embedded Recommendation */}
      {sources.slice(1).map(src => {
        const rec = advisor.sourceRecommendations.find(r => r.sourceId === src.id);
        const badge = rec ? tierBadgeStyle(rec.tier) : null;
        const slopeValid = Number.isFinite(src.conversionSlope) && Math.abs(src.conversionSlope) > 0;
        const formulaValid = src.conversionFormulaNote.trim().length >= 5;
        const refValid = src.conversionLiteratureRef.trim().length >= 4;
        const uncValid =
          rec?.tier === 'EXACT_METRIC' || src.conversionUncertaintySd > 0;
        const allValid = src.conversionModelEnabled && slopeValid && formulaValid && refValid;

        return (
          <div
            key={src.id}
            style={{
              padding: '14px',
              borderRadius: '10px',
              background: 'var(--surface-muted)',
              border: src.conversionModelEnabled && !allValid ? '1px solid var(--warn-border)' : '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label
                htmlFor={`msma-conv-enable-${src.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
              >
                <input
                  id={`msma-conv-enable-${src.id}`}
                  type="checkbox"
                  checked={src.conversionModelEnabled}
                  onChange={e => {
                    const checked = e.target.checked;
                    onUpdateSource(
                      src.id,
                      s => {
                        const needsPrefill =
                          checked &&
                          rec &&
                          rec.tier === 'EXACT_METRIC' &&
                          !s.conversionFormulaNote.trim();
                        if (needsPrefill && rec) {
                          return {
                            ...s,
                            conversionModelEnabled: true,
                            conversionSlope: rec.recommendedSlope,
                            conversionIntercept: rec.recommendedIntercept,
                            conversionUncertaintySd: rec.recommendedUncertaintySd,
                            conversionFormulaNote: rec.recommendedFormulaNote,
                            conversionLiteratureRef: rec.recommendedLiteratureRef
                          };
                        }
                        return { ...s, conversionModelEnabled: checked };
                      },
                      'Toggle Model Konversi Fisik',
                      `Model konversi "${src.displayName}": ${checked ? 'Diaktifkan' : 'Dinonaktifkan'}.`
                    );
                  }}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                />
                <span>
                  Aktifkan Konversi Fisik untuk {src.displayName} ({src.unit} ke {refSource?.unit})
                </span>
              </label>

              {badge && (
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 800,
                    background: badge.bg,
                    color: badge.fg,
                    border: `1px solid ${badge.border}`
                  }}
                >
                  {badge.label}
                </span>
              )}
            </div>

            {rec && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text)', fontWeight: 700 }}>
                    Estimasi Data Panel ({rec.nPairedObs} pasangan, r = {rec.pearsonR.toFixed(3)}, R² = {(rec.rSquared * 100).toFixed(1)}%):{' '}
                    <code>
                      Y = {fmtAdaptive(rec.recommendedIntercept)} + {fmtAdaptive(rec.recommendedSlope)} · X (± σ_conv = {fmtAdaptive(rec.recommendedUncertaintySd)})
                    </code>
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => onApplySingleRecommendation(rec)}
                    style={{ minHeight: '36px', padding: '5px 12px', fontSize: '11.5px', fontWeight: 800 }}
                  >
                    {rec.shouldApplyConversion
                      ? 'Isi Form Dengan Nilai Rekomendasi Ini'
                      : 'Isi Nilai Jembatan Empiris (Eksploratori)'}
                  </button>
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{rec.rationale}</div>
              </div>
            )}

            {src.conversionModelEnabled && (
              <>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px', fontWeight: 700 }}>
                  <span style={{ color: slopeValid ? 'var(--success)' : 'var(--danger)' }}>
                    {slopeValid ? 'Slope ≠ 0 ✓' : 'Slope tidak boleh 0 ✗'}
                  </span>
                  <span style={{ color: uncValid ? 'var(--success)' : 'var(--warn)' }}>
                    {uncValid ? 'σ_conv Tercatat ✓' : 'Disarankan isi σ_conv > 0 agar error konversi ikut dihitung'}
                  </span>
                  <span style={{ color: formulaValid ? 'var(--success)' : 'var(--danger)' }}>
                    {formulaValid ? 'Dokumentasi Persamaan ✓' : 'Wajib isi Dokumentasi Persamaan (≥ 5 karakter) ✗'}
                  </span>
                  <span style={{ color: refValid ? 'var(--success)' : 'var(--danger)' }}>
                    {refValid ? 'Referensi Ilmiah ✓' : 'Wajib isi Referensi Ilmiah (≥ 4 karakter) ✗'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))', gap: '10px' }}>
                  <div>
                    <label htmlFor={`msma-conv-slope-${src.id}`} style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                      Slope Konversi Fisik <span aria-hidden="true" style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      id={`msma-conv-slope-${src.id}`}
                      type="number"
                      step="any"
                      className="msma-input"
                      value={src.conversionSlope}
                      onChange={e =>
                        onUpdateSource(
                          src.id,
                          s => ({ ...s, conversionSlope: parseFiniteInput(e.target.value, s.conversionSlope) }),
                          'Ubah Slope Konversi',
                          `Slope konversi ${src.displayName} = ${e.target.value}`
                        )
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`msma-conv-int-${src.id}`} style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                      Intercept Konversi
                    </label>
                    <input
                      id={`msma-conv-int-${src.id}`}
                      type="number"
                      step="any"
                      className="msma-input"
                      value={src.conversionIntercept}
                      onChange={e =>
                        onUpdateSource(
                          src.id,
                          s => ({ ...s, conversionIntercept: parseFiniteInput(e.target.value, 0) }),
                          'Ubah Intercept Konversi',
                          `Intercept konversi ${src.displayName} = ${e.target.value}`
                        )
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`msma-conv-sd-${src.id}`} style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                      Uncertainty Konversi SD (σ_conv)
                    </label>
                    <input
                      id={`msma-conv-sd-${src.id}`}
                      type="number"
                      step="any"
                      min="0"
                      className="msma-input"
                      value={src.conversionUncertaintySd}
                      onChange={e =>
                        onUpdateSource(
                          src.id,
                          s => ({
                            ...s,
                            conversionUncertaintySd: Math.max(0, parseFiniteInput(e.target.value, 0))
                          }),
                          'Ubah Uncertainty Konversi',
                          `Uncertainty SD ${src.displayName} = ${e.target.value}`
                        )
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`msma-conv-eq-${src.id}`} style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                      Dokumentasi Persamaan <span aria-hidden="true" style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      id={`msma-conv-eq-${src.id}`}
                      type="text"
                      className="msma-input"
                      placeholder="Mis. Box-model mass balance / Jembatan Empiris"
                      value={src.conversionFormulaNote}
                      onChange={e =>
                        onUpdateSource(
                          src.id,
                          s => ({ ...s, conversionFormulaNote: e.target.value }),
                          'Dokumentasi Model Konversi',
                          'Catatan rumus konversi diperbarui.'
                        )
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`msma-conv-ref-${src.id}`} style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                      Referensi Ilmiah Konversi <span aria-hidden="true" style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      id={`msma-conv-ref-${src.id}`}
                      type="text"
                      className="msma-input"
                      placeholder="Mis. Yang et al. (2023) JGR: Atmospheres"
                      value={src.conversionLiteratureRef}
                      onChange={e =>
                        onUpdateSource(
                          src.id,
                          s => ({ ...s, conversionLiteratureRef: e.target.value }),
                          'Referensi Konversi',
                          'Sumber literatur konversi diperbarui.'
                        )
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}

      {classification.alternativeResearchRecommendations.length > 0 && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '8px',
            background: 'var(--warn-bg)',
            border: '1px solid var(--warn-border)',
            fontSize: '12.5px',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start'
          }}
        >
          <AlertTriangle size={16} color="var(--warn)" style={{ marginTop: '2px', flexShrink: 0 }} aria-hidden="true" />
          <div>
            <strong>Rekomendasi Penelitian Alternatif (Tanpa Konversi Langsung):</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px', lineHeight: 1.55 }}>
              {classification.alternativeResearchRecommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
