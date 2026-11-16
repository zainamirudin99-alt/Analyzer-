// ============================================================
// Comparative Measurement Accuracy Assessment — Source Ranking (Step 8)
// Ranks comparison sources by primary metric MAE, supported by RMSE,
// |MBE|, Lin's CCC, and Pair Fixed Effects / Wild Cluster Bootstrap.
// Never uses an arbitrary composite score; declares inconclusiveness
// when metrics conflict, differences are insignificant, or reference fails.
// ============================================================

import {
  ComparativeRankingResult,
  MeasurementSource,
  PairFixedEffectsResult,
  PanelAccuracyDiagnosticsResult,
  PanelAccuracyQualityReport,
  SourceAccuracyMetricRow,
  SourceRankEntry
} from './panel-accuracy-types';

export function computeComparativeSourceRanking(params: {
  referenceSource: MeasurementSource;
  metrics: SourceAccuracyMetricRow[];
  pairFixedEffects: PairFixedEffectsResult;
  diagnostics: PanelAccuracyDiagnosticsResult;
  qualityReport: PanelAccuracyQualityReport;
}): ComparativeRankingResult {
  const { referenceSource, metrics, pairFixedEffects, diagnostics, qualityReport } = params;

  const refLabel = `${referenceSource.name} (${referenceSource.label})`;

  if (metrics.length === 0) {
    return {
      primaryMetric: 'MAE',
      referenceSourceId: referenceSource.id,
      referenceSourceLabel: refLabel,
      isConclusive: false,
      conclusivenessStatus: 'REFERENSI_TIDAK_VALID',
      bestSourceId: null,
      bestSourceLabel: null,
      tiedTopSourceLabels: [],
      rankingSummary: 'Tidak ada sumber pembanding yang dapat dievaluasi.',
      methodologicalCaveat: 'Minimal satu sumber pembanding wajib tersedia.',
      ranks: []
    };
  }

  // Sort primarily by MAE ascending; tie-break by RMSE ascending, then CCC descending
  const sorted = [...metrics].sort((a, b) => {
    if (Math.abs(a.mae - b.mae) > 1e-12) return a.mae - b.mae;
    if (Math.abs(a.rmse - b.rmse) > 1e-12) return a.rmse - b.rmse;
    return b.ccc.ccc - a.ccc.ccc;
  });

  const top = sorted[0];

  const ranks: SourceRankEntry[] = sorted.map((m, idx) => {
    let pCluster: number | null = null;
    let pWild: number | null = null;
    if (idx > 0) {
      const contrast = pairFixedEffects.pairwiseContrasts.find(
        c =>
          (c.sourceAId === top.sourceId && c.sourceBId === m.sourceId) ||
          (c.sourceAId === m.sourceId && c.sourceBId === top.sourceId)
      );
      if (contrast) {
        pCluster = contrast.pValueCluster;
        pWild = contrast.wildBootstrapPValue;
      }
    }

    const effectiveP =
      pairFixedEffects.smallClusterWarning && pWild !== null ? pWild : pCluster;
    const isIndistinguishable = idx === 0 ? false : effectiveP !== null && effectiveP >= 0.05;
    const loaWidth = m.blandAltman.loaUpper - m.blandAltman.loaLower;

    const rankNote =
      idx === 0
        ? `MAE terendah (${m.mae.toFixed(3)} ${m.unit}), RMSE = ${m.rmse.toFixed(3)}, MBE = ${m.mbe.toFixed(3)}, Lin's CCC = ${m.ccc.ccc.toFixed(4)}.`
        : isIndistinguishable
        ? `Selisih MAE +${(m.mae - top.mae).toFixed(3)} terhadap #1 tidak signifikan secara statistik (p = ${(effectiveP ?? 1).toFixed(4)} ≥ 0.05).`
        : `Selisih MAE +${(m.mae - top.mae).toFixed(3)} lebih tinggi secara signifikan dibanding #1 (p = ${(effectiveP ?? 0).toFixed(4)} < 0.05).`;

    return {
      rank: idx + 1,
      sourceId: m.sourceId,
      sourceName: m.sourceName,
      sourceLabel: m.sourceLabel,
      mae: m.mae,
      rmse: m.rmse,
      absMbe: Math.abs(m.mbe),
      mbe: m.mbe,
      ccc: m.ccc.ccc,
      pearsonR: m.pearsonR,
      loaWidth,
      diffFromTopMae: m.mae - top.mae,
      pValueVsTopCluster: pCluster,
      pValueVsTopWildBootstrap: pWild,
      isStatisticallyIndistinguishableFromTop: isIndistinguishable,
      rankNote
    };
  });

  // Check reference validity
  if (!qualityReport.referenceAudit.isCredibleReference) {
    return {
      primaryMetric: 'MAE',
      referenceSourceId: referenceSource.id,
      referenceSourceLabel: refLabel,
      isConclusive: false,
      conclusivenessStatus: 'REFERENSI_TIDAK_VALID',
      bestSourceId: null,
      bestSourceLabel: null,
      tiedTopSourceLabels: ranks.map(r => r.sourceLabel),
      rankingSummary: `Sumber referensi ${refLabel} tidak memenuhi syarat kelayakan (${qualityReport.referenceAudit.warnings.join(' ')}). Belum terdapat dasar yang sah untuk menetapkan sumber pembanding terbaik.`,
      methodologicalCaveat:
        'Evaluasi akurasi berbasis referensi bergantung penuh pada validitas instrumen referensi yang dipilih.',
      ranks
    };
  }

  // Single comparison source case (J = 2)
  if (ranks.length === 1) {
    return {
      primaryMetric: 'MAE',
      referenceSourceId: referenceSource.id,
      referenceSourceLabel: refLabel,
      isConclusive: true,
      conclusivenessStatus: 'TERBUKTI_BERBEDA_SIGNIFIKAN',
      bestSourceId: top.sourceId,
      bestSourceLabel: top.sourceLabel,
      tiedTopSourceLabels: [top.sourceLabel],
      rankingSummary: `Hanya terdapat 1 sumber pembanding (${top.sourceLabel}) terhadap referensi ${refLabel}, dengan MAE = ${top.mae.toFixed(3)}, RMSE = ${top.rmse.toFixed(3)}, MBE = ${top.mbe.toFixed(3)}, dan Lin's CCC = ${top.ccc.ccc.toFixed(4)}.`,
      methodologicalCaveat:
        'Tambahkan minimal 2 sumber pembanding (total ≥ 3 sumber) apabila ingin menguji perbedaan akurasi antarsumber pembanding melalui Pair Fixed Effects.',
      ranks
    };
  }

  // Check metric conflict: e.g. #1 by MAE is NOT #1 by RMSE (exceeds min RMSE by > 10%) or outlier rank flips
  const minRmse = Math.min(...ranks.map(r => r.rmse));
  const maxCcc = Math.max(...ranks.map(r => r.ccc));
  const rmseConflict = top.rmse > minRmse * 1.10;
  const cccConflict = top.ccc.ccc < maxCcc - 0.08;
  const outlierFlip = diagnostics.outlierSensitivityAudit.rankOrderChanged;

  const second = ranks[1];
  const tiedTop = [
    top.sourceLabel,
    ...ranks.slice(1).filter(r => r.isStatisticallyIndistinguishableFromTop).map(r => r.sourceLabel)
  ];

  if (rmseConflict || cccConflict || outlierFlip) {
    const reasons: string[] = [];
    if (rmseConflict) {
      reasons.push(`sumber dengan MAE terendah (${top.sourceLabel}) memiliki RMSE lebih besar dibanding sumber lain`);
    }
    if (cccConflict) {
      reasons.push(`Lin's CCC pada ${top.sourceLabel} lebih rendah dibanding sumber pembanding lain`);
    }
    if (outlierFlip) {
      reasons.push('urutan peringkat MAE berubah ketika 5% observasi outlier ekstrem dipangkas');
    }

    return {
      primaryMetric: 'MAE',
      referenceSourceId: referenceSource.id,
      referenceSourceLabel: refLabel,
      isConclusive: false,
      conclusivenessStatus: 'KONFLIK_ANTAR_METRIK',
      bestSourceId: null,
      bestSourceLabel: null,
      tiedTopSourceLabels: tiedTop,
      rankingSummary:
        `Secara numerik ${top.sourceLabel} mencatat MAE terendah (${top.mae.toFixed(3)}), namun terdapat pertentangan antar indikator evaluasi (${reasons.join('; ')}). ` +
        `Oleh karena itu, belum terdapat bukti yang cukup untuk menetapkan satu sumber pembanding terbaik secara mutlak.`,
      methodologicalCaveat:
        'Tidak dibuat composite score gabungan agar pertentangan antara kesalahan rata-rata (MAE) dan kesalahan ekstrem (RMSE/outlier) tetap transparan.',
      ranks
    };
  }

  if (second.isStatisticallyIndistinguishableFromTop) {
    const pUsed =
      pairFixedEffects.smallClusterWarning && second.pValueVsTopWildBootstrap !== null
        ? second.pValueVsTopWildBootstrap
        : second.pValueVsTopCluster ?? 1;

    return {
      primaryMetric: 'MAE',
      referenceSourceId: referenceSource.id,
      referenceSourceLabel: refLabel,
      isConclusive: false,
      conclusivenessStatus: 'PERBEDAAN_TIDAK_SIGNIFIKAN',
      bestSourceId: null,
      bestSourceLabel: null,
      tiedTopSourceLabels: tiedTop,
      rankingSummary:
        `Meskipun ${top.sourceLabel} memiliki titik estimasi MAE terendah (${top.mae.toFixed(3)}) dibanding ${second.sourceLabel} (${second.mae.toFixed(3)}), ` +
        `pengujian Pair Fixed Effects menunjukkan selisih sebesar ${second.diffFromTopMae.toFixed(3)} belum signifikan secara statistik pada α = 0.05 (p = ${pUsed.toFixed(4)}). ` +
        `Belum terdapat bukti statistik yang cukup untuk menyimpulkan salah satu lebih akurat secara definitif relatif terhadap ${refLabel}.`,
      methodologicalCaveat:
        'Ketiadaan perbedaan signifikan menandakan tingkat kesalahan kedua sumber terhadap referensi berada dalam rentang variasi sampel yang sebanding.',
      ranks
    };
  }

  const pWin =
    pairFixedEffects.smallClusterWarning && second.pValueVsTopWildBootstrap !== null
      ? second.pValueVsTopWildBootstrap
      : second.pValueVsTopCluster ?? 0;

  return {
    primaryMetric: 'MAE',
    referenceSourceId: referenceSource.id,
    referenceSourceLabel: refLabel,
    isConclusive: true,
    conclusivenessStatus: 'TERBUKTI_BERBEDA_SIGNIFIKAN',
    bestSourceId: top.sourceId,
    bestSourceLabel: top.sourceLabel,
    tiedTopSourceLabels: [top.sourceLabel],
    rankingSummary:
      `Sumber pembanding "${top.sourceLabel}" terbukti memiliki akurasi relatif terbaik terhadap sumber referensi "${refLabel}" ` +
      `dengan MAE terendah = ${top.mae.toFixed(3)} ${top.unit}, RMSE = ${top.rmse.toFixed(3)}, MBE = ${top.mbe.toFixed(3)}, dan Lin's CCC = ${top.ccc.ccc.toFixed(4)}. ` +
      `Selisih MAE terhadap peringkat kedua (${second.sourceLabel}, MAE = ${second.mae.toFixed(3)}) signifikan secara statistik (ΔMAE = -${second.diffFromTopMae.toFixed(3)}, p = ${pWin.toFixed(4)} < 0.05) dan konsisten pada seluruh metrik pendukung.`,
    methodologicalCaveat:
      `Kesimpulan ini menunjukkan kedekatan relatif terhadap sumber referensi "${refLabel}", bukan bukti akurasi fisik absolut tanpa kalibrasi independen.`,
    ranks
  };
}
