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
import { MeasurementSource, PanelDataset } from '../../src/lib/panel-accuracy-types';
import {
  DEFAULT_ACCURACY_PREPROCESSING,
  generateMultiSourceCO2PresetDataset,
  validatePanelAccuracyDataset
} from '../../src/lib/panel-accuracy-validation';

describe('Gerbang Verifikasi 1 — Comparative Measurement Accuracy Engine (Panel Data Approach)', () => {
  it('1. Matches exact hand-calculated MAE, RMSE, MBE, Lin CCC, Bland-Altman, and Pair Fixed Effects on a 3x3 manual dataset', () => {
    const manualObs = [
      // City A
      { City: 'Kota_A', Year: 2021, Ref: 100, Comp1: 110, Comp2: 80 },
      { City: 'Kota_A', Year: 2022, Ref: 110, Comp1: 120, Comp2: 110 },
      { City: 'Kota_A', Year: 2023, Ref: 120, Comp1: 130, Comp2: 140 },
      // City B
      { City: 'Kota_B', Year: 2021, Ref: 200, Comp1: 210, Comp2: 180 },
      { City: 'Kota_B', Year: 2022, Ref: 210, Comp1: 220, Comp2: 210 },
      { City: 'Kota_B', Year: 2023, Ref: 220, Comp1: 230, Comp2: 240 },
      // City C
      { City: 'Kota_C', Year: 2021, Ref: 300, Comp1: 310, Comp2: 280 },
      { City: 'Kota_C', Year: 2022, Ref: 310, Comp1: 320, Comp2: 310 },
      { City: 'Kota_C', Year: 2023, Ref: 320, Comp1: 330, Comp2: 340 }
    ];

    const sources: MeasurementSource[] = [
      { id: 's_ref', name: 'R_Ground', label: 'Reference Station', columnKey: 'Ref', unit: 'kt CO₂', role: 'reference' },
      { id: 's_c1', name: 'C1_Bias10', label: 'Constant +10 Bias', columnKey: 'Comp1', unit: 'kt CO₂', role: 'comparison' },
      { id: 's_c2', name: 'C2_SymNoise', label: 'Symmetric +-20 Error', columnKey: 'Comp2', unit: 'kt CO₂', role: 'comparison' }
    ];

    const dataset: PanelDataset = {
      cityIdColumn: 'City',
      yearColumn: 'Year',
      sources,
      observations: manualObs
    };

    const prepared = preparePanelAccuracyObservations(dataset, DEFAULT_ACCURACY_PREPROCESSING);
    const metrics = computeAllSourceAccuracyMetrics(prepared);
    const pairFE = fitPairFixedEffectsModel(prepared);

    const m1 = metrics.find(m => m.sourceId === 's_c1')!;
    const m2 = metrics.find(m => m.sourceId === 's_c2')!;

    // Exact hand calculations for Comp1 (e_i = +10 for all 9 obs):
    expect(m1.nCompleteCase).toBe(9);
    expect(m1.mae).toBeCloseTo(10.0, 8);
    expect(m1.rmse).toBeCloseTo(10.0, 8);
    expect(m1.mbe).toBeCloseTo(10.0, 8);
    expect(m1.pearsonR).toBeCloseTo(1.0, 8);
    // SS(Ref) = 30200 + 200 + 30200 = 60600; Var(Ref) = 60600 / 9; CCC = (121200/9) / (121200/9 + 100) = 404 / 407
    expect(m1.ccc.ccc).toBeCloseTo(404 / 407, 8);
    expect(m1.blandAltman.meanBias).toBeCloseTo(10.0, 8);
    expect(m1.blandAltman.sdDiff).toBeCloseTo(0.0, 8);

    // Exact hand calculations for Comp2 (errors = [-20, 0, +20] repeated 3 times):
    expect(m2.mae).toBeCloseTo(120 / 9, 8); // 13.333333...
    expect(m2.rmse).toBeCloseTo(Math.sqrt(2400 / 9), 8); // 16.3299316...
    expect(m2.mbe).toBeCloseTo(0.0, 8);
    expect(m2.blandAltman.meanBias).toBeCloseTo(0.0, 8);
    // sample variance of diffs: sum(d^2) / 8 = 2400 / 8 = 300 -> sdDiff = sqrt(300) = 17.320508
    expect(m2.blandAltman.sdDiff).toBeCloseTo(Math.sqrt(300), 6);
    expect(m2.blandAltman.loaUpper).toBeCloseTo(1.96 * Math.sqrt(300), 5);
    expect(m2.blandAltman.loaLower).toBeCloseTo(-1.96 * Math.sqrt(300), 5);

    // Pair Fixed Effects: beta_{C2 - C1} = MAE_2 - MAE_1 = 13.333333 - 10.0 = +3.333333
    const coefC2 = pairFE.coefficients.find(c => c.sourceId === 's_c2')!;
    expect(coefC2.betaDiffVsBaseline).toBeCloseTo(10 / 3, 8);
    expect(pairFE.pairwiseContrasts).toHaveLength(1);
    expect(pairFE.pairwiseContrasts[0].diffAminusB).toBeCloseTo(-10 / 3, 8);
  });

  it('2. Supports dynamic source counts (2, 3, 4, and 5 sources) with custom arbitrary source names', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    expect(preset.sources).toHaveLength(4); // Default preset has 4 sources

    // A. Test with 2 sources (1 reference + 1 comparison)
    const twoSourceDataset: PanelDataset = {
      cityIdColumn: preset.cityIdColumn,
      yearColumn: preset.yearColumn,
      sources: [preset.sources[0], preset.sources[2]], // X1 comparison + X3 reference
      observations: preset.observations
    };
    const prep2 = preparePanelAccuracyObservations(twoSourceDataset);
    const metrics2 = computeAllSourceAccuracyMetrics(prep2);
    const fe2 = fitPairFixedEffectsModel(prep2);
    expect(metrics2).toHaveLength(1);
    expect(fe2.coefficients).toHaveLength(1);
    expect(fe2.pairwiseContrasts).toHaveLength(0);

    // B. Test with 3 sources
    const threeSourceDataset: PanelDataset = {
      ...preset,
      sources: preset.sources.slice(0, 3)
    };
    const prep3 = preparePanelAccuracyObservations(threeSourceDataset);
    const fe3 = fitPairFixedEffectsModel(prep3);
    expect(fe3.coefficients).toHaveLength(2);
    expect(fe3.pairwiseContrasts).toHaveLength(1);

    // C. Test with 4 sources (preset default)
    const prep4 = preparePanelAccuracyObservations(preset);
    const fe4 = fitPairFixedEffectsModel(prep4);
    expect(fe4.coefficients).toHaveLength(3);
    expect(fe4.pairwiseContrasts).toHaveLength(3); // C(3,2) = 3 contrasts

    // D. Test with 5 sources (adding a 5th source X5 Independent Monitoring)
    const obs5 = preset.observations.map((r, idx) => ({
      ...r,
      Custom_Audit_5: Number(r.X3_Field_Sensor_Ref) + (idx % 2 === 0 ? 18 : -14)
    }));
    const sources5: MeasurementSource[] = [
      ...preset.sources,
      {
        id: 'custom_5',
        name: 'S5_Audit',
        label: 'Independent Monitoring',
        columnKey: 'Custom_Audit_5',
        unit: 'kt CO₂',
        role: 'comparison'
      }
    ];
    const prep5 = preparePanelAccuracyObservations({
      cityIdColumn: preset.cityIdColumn,
      yearColumn: preset.yearColumn,
      sources: sources5,
      observations: obs5
    });
    const metrics5 = computeAllSourceAccuracyMetrics(prep5);
    const fe5 = fitPairFixedEffectsModel(prep5);
    const eda5 = computeAccuracyEDA(prep5.completeCaseObservations, sources5);
    expect(metrics5).toHaveLength(4);
    expect(fe5.coefficients).toHaveLength(4);
    expect(fe5.pairwiseContrasts).toHaveLength(6); // C(4,2) = 6 contrasts
    expect(eda5.overallPearson).toHaveLength(5);
  });

  it('3. Recalculates all errors, metrics, CCC, Bland-Altman, and Pair FE consistently when switching Reference Source', () => {
    const preset = generateMultiSourceCO2PresetDataset();

    // Run 1: X3 is Reference, X1 is Comparison
    const prepRef3 = preparePanelAccuracyObservations(preset);
    const metricsRef3 = computeAllSourceAccuracyMetrics(prepRef3);
    const x1VsX3 = metricsRef3.find(m => m.sourceId === 'src_1')!;

    // Run 2: Switch Reference to X1, so X3 becomes a Comparison source
    const switchedSources: MeasurementSource[] = preset.sources.map(s => ({
      ...s,
      role: s.id === 'src_1' ? 'reference' : 'comparison'
    }));
    const prepRef1 = preparePanelAccuracyObservations({
      ...preset,
      sources: switchedSources
    });
    const metricsRef1 = computeAllSourceAccuracyMetrics(prepRef1);
    const x3VsX1 = metricsRef1.find(m => m.sourceId === 'src_3')!;

    // Mathematical symmetry identities between (X1 vs Ref=X3) and (X3 vs Ref=X1):
    expect(x3VsX1.mae).toBeCloseTo(x1VsX3.mae, 8);
    expect(x3VsX1.rmse).toBeCloseTo(x1VsX3.rmse, 8);
    expect(x3VsX1.mbe).toBeCloseTo(-x1VsX3.mbe, 8); // Signed bias flips sign!
    expect(x3VsX1.ccc.ccc).toBeCloseTo(x1VsX3.ccc.ccc, 8); // CCC is symmetric!
    expect(x3VsX1.pearsonR).toBeCloseTo(x1VsX3.pearsonR, 8);
  });

  it('4. Separates Complete-Case and Source-Specific Available-Case when missing values differ across sources', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    // Introduce 8 missing values only on X2_Satellite_Standard
    const partialObs = preset.observations.map((r, idx) => ({
      ...r,
      X2_Satellite_Standard: idx < 8 ? null : r.X2_Satellite_Standard
    }));

    const dataset: PanelDataset = {
      ...preset,
      observations: partialObs
    };

    const quality = validatePanelAccuracyDataset(dataset);
    expect(quality.nCompleteCasePairs).toBe(52); // 60 - 8 = 52
    expect(quality.availablePairsBySource['src_1']).toBe(60);
    expect(quality.availablePairsBySource['src_2']).toBe(52);
    expect(quality.availablePairsBySource['src_4']).toBe(60);

    const prepared = preparePanelAccuracyObservations(dataset);
    const metrics = computeAllSourceAccuracyMetrics(prepared);
    const mX1 = metrics.find(m => m.sourceId === 'src_1')!;
    const mX2 = metrics.find(m => m.sourceId === 'src_2')!;

    expect(mX1.nCompleteCase).toBe(52);
    expect(mX1.nAvailableCase).toBe(60);
    expect(mX1.missingGapVsComplete).toBe(8);
    expect(mX2.nCompleteCase).toBe(52);
    expect(mX2.nAvailableCase).toBe(52);
    expect(mX2.missingGapVsComplete).toBe(0);
  });

  it('5. Ranks comparison sources by primary metric MAE without composite score and detects inconclusive/tied sources', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const quality = validatePanelAccuracyDataset(preset);
    const prepared = preparePanelAccuracyObservations(preset);
    const metrics = computeAllSourceAccuracyMetrics(prepared);
    const pairFE = fitPairFixedEffectsModel(prepared, { bootstrapReplications: 499 });
    const diagnostics = computePanelAccuracyDiagnostics(prepared);
    const ranking = computeComparativeSourceRanking({
      referenceSource: prepared.referenceSource,
      metrics,
      pairFixedEffects: pairFE,
      diagnostics,
      qualityReport: quality
    });

    // In preset: X4 (SD=15, bias=+6) is closest to X3, followed by X2 (SD=28, bias=+24), then X1 (SD=42, bias=-48)
    expect(ranking.ranks[0].sourceId).toBe('src_4');
    expect(ranking.ranks[1].sourceId).toBe('src_2');
    expect(ranking.ranks[2].sourceId).toBe('src_1');
    expect(ranking.isConclusive).toBe(true);
    expect(ranking.conclusivenessStatus).toBe('TERBUKTI_BERBEDA_SIGNIFIKAN');
    expect(ranking.bestSourceId).toBe('src_4');
    expect(pairFE.smallClusterWarning).toBe(true); // G = 10 < 30
  });

  it('6. Detects inconclusive ranking when top two comparison sources have nearly identical error distributions', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    // Make X2 almost identical to X4 so difference is statistically insignificant
    const tiedObs = preset.observations.map((r, i) => ({
      ...r,
      X2_Satellite_Standard: Number(r.X4_Alt_Satellite_HiRes) + (i % 2 === 0 ? 0.2 : -0.2)
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

  it('7. Generates dynamic Stata .do, R script, PDF, DOCX, XLSX, CSV, and Step 3 recommendations', async () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const res = executePanelAccuracyPipeline({
      dataset: preset,
      bootstrapReplications: 299
    });

    // Stata & R codegen adapt to reference source X3 and 3 comparison sources
    expect(res.generatedCode.stataDoFile).toContain('Reference Source : X3 (Field Sensor)');
    expect(res.generatedCode.stataDoFile).toContain('areg ae i.source_idx, absorb(pair_id) vce(cluster city_id)');
    expect(res.generatedCode.rScript).toContain('ref_col     <- "X3"');
    expect(res.generatedCode.rScript).toContain('feols(abs_error ~ i(source) | pair_id');

    // Switch reference to X2 and verify codegen updates dynamically
    const switched = executePanelAccuracyPipeline({
      dataset: {
        ...preset,
        sources: preset.sources.map(s => ({
          ...s,
          role: s.id === 'src_2' ? 'reference' : 'comparison'
        }))
      },
      bootstrapReplications: 199
    });
    expect(switched.generatedCode.stataDoFile).toContain('Reference Source : X2 (Satellite Standard)');
    expect(switched.generatedCode.rScript).toContain('ref_col     <- "X2"');

    // Exports produce valid binary headers and non-empty content
    const pdfBuf = generatePanelAccuracyPDF(res, 'test_accuracy.xlsx');
    const docxBuf = await generatePanelAccuracyDocx(res, 'test_accuracy.xlsx');
    const xlsxBuf = generatePanelAccuracyXLSX(res, 'test_accuracy.xlsx');
    const csvStr = generatePanelAccuracyCSV(res);

    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(docxBuf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(xlsxBuf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(csvStr).toContain('Source_ID,Source_Name,Source_Label');
    expect(csvStr).toContain('X4 (Alternative Satellite)');

    // Step 3 preprocessing recommendation bundle
    const rec = evaluateAccuracyPreprocessingRecommendations({ dataset: preset });
    expect(rec.evaluatedCount).toBeGreaterThanOrEqual(4);
    expect(rec.bestScenario.id).toBe('raw_baseline');

    // Step 1..9 bullet guides & live step-by-step bullet interpretations
    expect(PANEL_ACCURACY_STEP_GUIDES).toHaveLength(9);
    PANEL_ACCURACY_STEP_GUIDES.forEach((g, idx) => {
      expect(g.id).toBe(idx + 1);
      expect(g.purposePoints.length).toBeGreaterThanOrEqual(2);
      expect(g.interpretPoints.length).toBeGreaterThanOrEqual(3);
      expect(g.keyCaveat.length).toBeGreaterThan(10);
    });
    const actualPts = buildActualStepInterpretationPoints(res);
    expect(actualPts.step1.length).toBeGreaterThanOrEqual(3);
    expect(actualPts.step4.length).toBeGreaterThanOrEqual(3);
    expect(actualPts.step5.length).toBeGreaterThanOrEqual(3);
    expect(actualPts.step6.length).toBeGreaterThanOrEqual(3);
    expect(actualPts.step7.length).toBeGreaterThanOrEqual(5);
    expect(actualPts.step8.length).toBeGreaterThanOrEqual(4);
    expect(actualPts.step9.length).toBeGreaterThanOrEqual(2);
  });
});
