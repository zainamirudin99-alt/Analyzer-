import { describe, it, expect } from 'vitest';
import { computeAccuracyEDA } from '../../src/lib/panel-accuracy-correlation';
import { computePanelAccuracyDiagnostics } from '../../src/lib/panel-accuracy-diagnostics';
import { generatePanelAccuracyDocx } from '../../src/lib/panel-accuracy-export-docx';
import { generatePanelAccuracyPDF } from '../../src/lib/panel-accuracy-export-pdf';
import {
  generatePanelAccuracyCSV,
  generatePanelAccuracyXLSX
} from '../../src/lib/panel-accuracy-export-xlsx';
import { fitPairFixedEffectsModel } from '../../src/lib/panel-accuracy-fixed-effects';
import { runIntelligentMeasurementSourceEngine } from '../../src/lib/panel-accuracy-intelligent-config';
import { fitBayesianLatentMeasurementModel } from '../../src/lib/panel-accuracy-latent';
import { computeAllSourceAccuracyMetrics } from '../../src/lib/panel-accuracy-metrics';
import {
  evaluateAccuracyPreprocessingRecommendations,
  executePanelAccuracyPipeline
} from '../../src/lib/panel-accuracy-orchestrator';
import { preparePanelAccuracyObservations } from '../../src/lib/panel-accuracy-preprocessing';
import { computeComparativeSourceRanking } from '../../src/lib/panel-accuracy-ranking';
import {
  buildActualStepInterpretationPoints,
  PANEL_ACCURACY_STEP_GUIDES
} from '../../src/lib/panel-accuracy-step-guides';
import {
  buildAllStepStataDocumentation,
  computeLeaveOneCityOutSensitivity
} from '../../src/lib/panel-accuracy-step-stata';
import { MeasurementSource, PanelDataset } from '../../src/lib/panel-accuracy-types';
import {
  DEFAULT_ACCURACY_PREPROCESSING,
  generateMultiSourceCO2PresetDataset,
  validatePanelAccuracyDataset
} from '../../src/lib/panel-accuracy-validation';

describe('Gerbang Verifikasi — Opsi B Reference-Free All-Source Latent & Consensus Engine', () => {
  it('1. Evaluates & ranks ALL 4 sources equally without a reference source and identifies X3 Field Sensor as #1 on preset', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    // Ensure ALL sources in preset are symmetric 'evaluated' without a privileged reference
    expect(preset.sources).toHaveLength(4);
    expect(preset.sources.every(s => s.role === 'evaluated')).toBe(true);

    const res = executePanelAccuracyPipeline({
      dataset: preset,
      bootstrapReplications: 499
    });

    // All 4 sources evaluated and ranked (#1..#4)
    expect(res.metrics).toHaveLength(4);
    expect(res.ranking.ranks).toHaveLength(4);
    expect(res.pairFixedEffects.nComparisonSources).toBe(4);
    expect(res.pairFixedEffects.pairwiseContrasts).toHaveLength(6); // C(4,2) = 6 contrasts across ALL 4 sources!

    // True data generating precision order in preset: X3 (SD=8, bias=0) < X4 (SD=16, bias=+8) < X2 (SD=28, bias=+26) < X1 (SD=42, bias=-46)
    expect(res.ranking.ranks[0].sourceName).toBe('X3');
    expect(res.ranking.ranks[1].sourceName).toBe('X4');
    expect(res.ranking.ranks[2].sourceName).toBe('X2');
    expect(res.ranking.ranks[3].sourceName).toBe('X1');

    expect(res.latentModel.maxRhat).toBeLessThanOrEqual(1.1);
    expect(res.ranking.conclusivenessStatus).toBe('TERBUKTI_BERBEDA_SIGNIFIKAN');
    expect(res.ranking.isConclusive).toBe(true);
    expect(res.ranking.bestSourceId).toBe('src_3');
    expect(res.latentModel.converged).toBe(true);
    expect(res.metrics.find(m => m.sourceName === 'X3')!.reliabilityR2).toBeGreaterThan(0.99);
    expect(res.metrics.find(m => m.sourceName === 'X3')!.posteriorProbBest).toBeGreaterThan(0.9);
  });

  it('2. Recovers true error ordering from Grubbs analytical triangulation & Bayesian MCMC without knowing which column is truth', () => {
    // Construct 40 panel observations across 8 cities x 5 years where S2 is cleanest (SD=4, bias=0), S1 medium (SD=18, +15), S3 noisy (SD=35, -30)
    let s = 12345;
    const rn = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      const u1 = Math.max(1e-7, s / 4294967296);
      s = (s * 1664525 + 1013904223) >>> 0;
      const u2 = Math.max(1e-7, s / 4294967296);
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    const obs: Record<string, unknown>[] = [];
    for (let c = 1; c <= 8; c++) {
      for (let t = 2020; t <= 2024; t++) {
        const theta = 400 + c * 90 + (t - 2020) * 25;
        obs.push({
          City: `City_${c}`,
          Year: t,
          S1_Sat: Number((theta + 15 + rn() * 18).toFixed(2)),
          S2_CleanSensor: Number((theta + rn() * 4).toFixed(2)),
          S3_Inventory: Number((theta - 30 + rn() * 35).toFixed(2))
        });
      }
    }

    const sources: MeasurementSource[] = [
      { id: 's1', name: 'S1', label: 'Satellite', columnKey: 'S1_Sat', unit: 'kt CO₂', role: 'evaluated' },
      { id: 's2', name: 'S2', label: 'Sensor', columnKey: 'S2_CleanSensor', unit: 'kt CO₂', role: 'evaluated' },
      { id: 's3', name: 'S3', label: 'Inventory', columnKey: 'S3_Inventory', unit: 'kt CO₂', role: 'evaluated' }
    ];

    const res = executePanelAccuracyPipeline({
      dataset: { cityIdColumn: 'City', yearColumn: 'Year', sources, observations: obs },
      bootstrapReplications: 299
    });

    expect(res.ranking.ranks[0].sourceId).toBe('s2');
    expect(res.ranking.ranks[1].sourceId).toBe('s1');
    expect(res.ranking.ranks[2].sourceId).toBe('s3');
    const estS2 = res.latentModel.sourceEstimates.find(e => e.sourceId === 's2')!;
    const estS3 = res.latentModel.sourceEstimates.find(e => e.sourceId === 's3')!;
    expect(estS2.errorSd).toBeLessThan(10);
    expect(estS3.errorSd).toBeGreaterThan(25);
    expect(estS2.grubbsErrorVariance).toBeLessThan(estS3.grubbsErrorVariance);
  });

  it('3. Properly flags J = 2 sources as MODEL_TIDAK_TERIDENTIFIKASI (underidentified without 3rd source) while handling J = 3, 4, 5', () => {
    const preset = generateMultiSourceCO2PresetDataset();

    // A. J = 2 sources -> underidentified for reference-free ranking!
    const twoSourceDataset: PanelDataset = {
      cityIdColumn: preset.cityIdColumn,
      yearColumn: preset.yearColumn,
      sources: [preset.sources[0], preset.sources[2]],
      observations: preset.observations
    };
    const res2 = executePanelAccuracyPipeline({ dataset: twoSourceDataset, bootstrapReplications: 199 });
    expect(res2.metrics).toHaveLength(2);
    expect(res2.ranking.isConclusive).toBe(false);
    expect(res2.ranking.conclusivenessStatus).toBe('MODEL_TIDAK_TERIDENTIFIKASI');
    expect(res2.ranking.bestSourceId).toBeNull();

    // B. J = 3 sources -> identified!
    const res3 = executePanelAccuracyPipeline({
      dataset: { ...preset, sources: preset.sources.slice(0, 3) },
      bootstrapReplications: 199
    });
    expect(res3.metrics).toHaveLength(3);
    expect(res3.pairFixedEffects.pairwiseContrasts).toHaveLength(3); // C(3,2) = 3

    // C. J = 5 sources -> all 5 evaluated & C(5,2) = 10 contrasts!
    const obs5 = preset.observations.map((r, idx) => ({
      ...r,
      Custom_Audit_5: Number(r.X3_Field_Sensor) + (idx % 2 === 0 ? 18 : -14)
    }));
    const sources5: MeasurementSource[] = [
      ...preset.sources,
      {
        id: 'custom_5',
        name: 'S5_Audit',
        label: 'Independent Monitoring',
        columnKey: 'Custom_Audit_5',
        unit: 'kt CO₂',
        role: 'evaluated'
      }
    ];
    const res5 = executePanelAccuracyPipeline({
      dataset: {
        cityIdColumn: preset.cityIdColumn,
        yearColumn: preset.yearColumn,
        sources: sources5,
        observations: obs5
      },
      bootstrapReplications: 199
    });
    expect(res5.metrics).toHaveLength(5);
    expect(res5.ranking.ranks).toHaveLength(5);
    expect(res5.pairFixedEffects.pairwiseContrasts).toHaveLength(10); // C(5,2) = 10
    expect(res5.eda.overallPearson).toHaveLength(5);
  });

  it('4. Separates Complete-Case and Source-Specific Available-Case when missing values differ across sources', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const partialObs = preset.observations.map((r, idx) => ({
      ...r,
      X2_Satellite_Standard: idx < 8 ? null : r.X2_Satellite_Standard
    }));

    const dataset: PanelDataset = {
      ...preset,
      observations: partialObs
    };

    const quality = validatePanelAccuracyDataset(dataset);
    expect(quality.nCompleteCasePairs).toBe(52);
    expect(quality.availablePairsBySource['src_1']).toBe(60);
    expect(quality.availablePairsBySource['src_2']).toBe(52);
    expect(quality.availablePairsBySource['src_3']).toBe(60);
    expect(quality.availablePairsBySource['src_4']).toBe(60);

    const res = executePanelAccuracyPipeline({ dataset, bootstrapReplications: 199 });
    const mX1 = res.metrics.find(m => m.sourceId === 'src_1')!;
    const mX2 = res.metrics.find(m => m.sourceId === 'src_2')!;

    expect(mX1.nCompleteCase).toBe(52);
    expect(mX1.nAvailableCase).toBe(60);
    expect(mX1.missingGapVsComplete).toBe(8);
    expect(mX2.nCompleteCase).toBe(52);
    expect(mX2.nAvailableCase).toBe(52);
    expect(mX2.missingGapVsComplete).toBe(0);
  });

  it('5. Detects inconclusive ranking when top two sources are practically indistinguishable', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const tiedObs = preset.observations.map((r, i) => ({
      ...r,
      X4_Alt_Satellite_HiRes: Number(r.X3_Field_Sensor) + (i % 2 === 0 ? 0.15 : -0.15)
    }));

    const resTied = executePanelAccuracyPipeline({
      dataset: {
        ...preset,
        observations: tiedObs
      },
      bootstrapReplications: 299
    });

    expect(resTied.ranking.isConclusive).toBe(false);
    expect(resTied.ranking.conclusivenessStatus).toBe('PERBEDAAN_TIDAK_SIGNIFIKAN');
    expect(resTied.ranking.bestSourceId).toBeNull();
  });

  it('6. Generates All-Source Stata (.do), R (lavaan+fixest), Stan (.stan), Exports, Step Guides & 5-Point Docs', async () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const res = executePanelAccuracyPipeline({
      dataset: preset,
      bootstrapReplications: 299
    });

    expect(res.generatedCode.stataDoFile).toContain('sem (L_true ->');
    expect(res.generatedCode.stataDoFile).toContain('areg ae i.source_id, absorb(pair_id) vce(cluster city_id)');
    expect(res.generatedCode.rScript).toContain('lavaan::cfa');
    expect(res.generatedCode.rScript).toContain('feols(abs_error ~ i(source) | pair_id');

    const pdfBuf = generatePanelAccuracyPDF(res, 'test_accuracy.xlsx');
    const docxBuf = await generatePanelAccuracyDocx(res, 'test_accuracy.xlsx');
    const xlsxBuf = generatePanelAccuracyXLSX(res, 'test_accuracy.xlsx');
    const csvStr = generatePanelAccuracyCSV(res);

    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(docxBuf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(xlsxBuf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(csvStr).toContain('Total_Latent_RMSE');
    expect(csvStr).toContain('X3 (Field Sensor)');

    const rec = evaluateAccuracyPreprocessingRecommendations({ dataset: preset });
    expect(rec.evaluatedCount).toBeGreaterThanOrEqual(4);
    expect(rec.bestScenario.id).toBe('raw_baseline');

    const intel = runIntelligentMeasurementSourceEngine({
      columns: Object.keys(preset.observations[0]),
      rows: preset.observations,
      currentCityIdColumn: preset.cityIdColumn,
      currentYearColumn: preset.yearColumn,
      currentSources: preset.sources
    });
    expect(intel.fourteenPointAnalyses).toHaveLength(14);
    expect(intel.minimumRequirements.canProceed).toBe(true);
    expect(intel.recommendedMapping.sources.every(s => s.role === 'evaluated')).toBe(true);

    const prepared = preparePanelAccuracyObservations(preset);
    const quality = validatePanelAccuracyDataset(preset);
    const docs = buildAllStepStataDocumentation({
      datasetName: 'panel_co2_multi_source_accuracy.xlsx',
      cityIdColumn: preset.cityIdColumn,
      yearColumn: preset.yearColumn,
      sources: preset.sources,
      preprocessing: DEFAULT_ACCURACY_PREPROCESSING,
      qualityReport: quality,
      intelligentConfig: intel,
      preprocBundle: rec,
      cleanedObservations: prepared.completeCaseObservations,
      fitResult: res
    });

    for (let stepId = 1; stepId <= 9; stepId++) {
      const b = docs[stepId];
      expect(b.stepId).toBe(stepId);
      expect(b.stataCode).toContain(preset.cityIdColumn);
      expect(b.structuredInterpretations.length).toBeGreaterThanOrEqual(1);
    }
    expect(docs[5].companionStanCode).toContain('reliability_R2');
    expect(docs[8].robustnessSummary?.leaveOneCityOutRows).toHaveLength(10);

    const actualPts = buildActualStepInterpretationPoints(res);
    expect(actualPts.step2.length).toBeGreaterThanOrEqual(3);
    expect(PANEL_ACCURACY_STEP_GUIDES).toHaveLength(9);

    // Explicitly double-check LOCO helper directly
    const loco = computeLeaveOneCityOutSensitivity({
      observations: prepared.completeCaseObservations,
      sources: preset.sources,
      fullTopSourceId: res.ranking.bestSourceId
    });
    expect(loco.rows).toHaveLength(10);
    expect(loco.consistencyPct).toBe(100);
  });
});
