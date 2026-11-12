import { describe, it, expect } from 'vitest';
import {
  betainc,
  gammaincQ,
  tPValue,
  fPValue,
  chiSquarePValue,
  tCriticalValue,
  runStatisticalRegression,
  computeShapiroWilk,
  computeLillieforsKS,
  computeAndersonDarlingTest
} from '../../src/lib/regression-engine';
import {
  formatSPSSValue,
  formatSPSSSig,
  computeHarveyCollier,
  computeBreuschPaganStandard,
  runStepwiseVariableSelection
} from '../../src/lib/regression-spss-compatibility';
import {
  computeHCCovariance,
  fitRobustRLM,
  computeBootstrapCI,
  applyPraisWinstenAR1,
  applyCochraneOrcuttStrictAR1
} from '../../src/lib/regression-remedial';
import {
  calculateDescriptiveStatistics,
  calculateCategoricalFrequencyTables,
  applyMissingValueFilter,
  calculateCorrelationMatrix,
  calculatePartialCorrelation,
  calculatePointBiserialCorrelation
} from '../../src/lib/regression-data-processor';
import { runModeratedRegressionAnalysis } from '../../src/lib/regression-moderation-mra';
import {
  runContingencyAnalysis,
  computeFisherExact2x2
} from '../../src/lib/regression-contingency-chisquare';
import {
  fitBinaryLogisticRegression,
  fitMultinomialLogisticRegression,
  fitOrdinalLogisticRegression,
  fitCountGLMRegression,
  fitQuantileRegression,
  fitPolynomialRegression
} from '../../src/lib/regression-advanced-models';
import { runKFoldCrossValidation } from '../../src/lib/regression-model-comparison';
import { generateTenElementAcademicInterpretation } from '../../src/lib/regression-interpretation';

describe('Advanced Statistical Analysis Suite — 21-Point Verification', () => {
  it('1. Exact Special Functions (betainc, gammaincQ, tPValue, fPValue, chiSquarePValue, tCriticalValue)', () => {
    expect(betainc(0.5, 2, 2)).toBeCloseTo(0.5, 10);
    expect(tPValue(2.22813885, 10)).toBeCloseTo(0.05, 5);
    expect(tCriticalValue(10, 0.05)).toBeCloseTo(2.22813885, 5);
    expect(fPValue(4.9646027, 1, 10)).toBeCloseTo(0.05, 5);
    expect(chiSquarePValue(3.8414588, 1)).toBeCloseTo(0.05, 5);
    expect(gammaincQ(0.5, 3.8414588 / 2)).toBeCloseTo(0.05, 5);
    expect(formatSPSSSig(0.00012)).toBe('< .001');
    expect(formatSPSSValue(1.23456, 3)).toBe('1.235');
  });

  it('2. 4 Simultaneous Normality Tests, Belsley SVD Collinearity, Harvey-Collier & Stepwise Selection', () => {
    const sampleResiduals = [-1.2, -0.8, -0.5, -0.3, -0.1, 0.0, 0.1, 0.25, 0.55, 0.85, 1.15, 0.05];
    const sw = computeShapiroWilk(sampleResiduals);
    const ks = computeLillieforsKS(sampleResiduals);
    const ad = computeAndersonDarlingTest(sampleResiduals);

    expect(sw.statistic).toBeGreaterThan(0.9);
    expect(sw.pValue).toBeGreaterThan(0.1);
    expect(ks.statistic).toBeGreaterThan(0);
    expect(ad.statistic).toBeGreaterThan(0);

    const rows = Array.from({ length: 25 }, (_, i) => ({
      Y: 10 + 2.5 * (i + 1) + 0.8 * ((i % 5) + 1) + (i % 2 === 0 ? 0.4 : -0.4),
      X1: i + 1,
      X2: (i % 5) + 1,
      X3: ((i * 7) % 11) * 0.1
    }));

    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1', 'X2', 'X3'] });
    expect(fit.normalityTests).toBeDefined();
    expect(fit.normalityTests?.shapiroWilk.statistic).toBeGreaterThan(0);
    expect(fit.normalityTests?.andersonDarling.statistic).toBeGreaterThan(0);
    expect(fit.collinearityDiagnostics.length).toBe(4);

    const stepRes = runStepwiseVariableSelection({
      rows,
      yCol: 'Y',
      candidateXCols: ['X1', 'X2', 'X3'],
      method: 'stepwise'
    });
    expect(stepRes.selectedXCols).toContain('X1');

    const rawX = rows.map(r => [r.X1, r.X2]);
    const resids = fit.plots.resVsFit.map(p => p.residual);
    const hc = computeHarveyCollier(rawX, resids);
    expect(hc.df).toBeGreaterThan(0);
    const bp = computeBreuschPaganStandard(rawX, resids);
    expect(bp.statistic).toBeGreaterThanOrEqual(0);
  });

  it('3. Robust Estimators (HC0–HC4, IRLS Huber/Tukey, Prais-Winsten, Bootstrap CI)', () => {
    const rawY = [12, 15, 18, 22, 26, 29, 33, 37, 40, 44, 48, 52, 55, 60];
    const rawX = rawY.map((_, i) => [i + 1]);
    const rows = rawY.map((y, i) => ({ Y: y, X1: i + 1 }));
    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1'] });
    const betas = fit.coefficients.map(c => c.b);

    for (const m of ['HC0', 'HC1', 'HC2', 'HC3', 'HC4'] as const) {
      const hc = computeHCCovariance(rawY, rawX, betas, m);
      expect(hc.se.length).toBe(2);
      expect(hc.se[1]).toBeGreaterThan(0);
    }

    const rlmHuber = fitRobustRLM(rawY, rawX, 'huber');
    const rlmTukey = fitRobustRLM(rawY, rawX, 'tukey');
    expect(rlmHuber.coefficients[1]).toBeCloseTo(3.67, 1);
    expect(rlmTukey.coefficients[1]).toBeCloseTo(3.67, 1);

    const pw = applyPraisWinstenAR1(rows, 'Y', ['X1'], betas);
    const co = applyCochraneOrcuttStrictAR1(rows, 'Y', ['X1'], betas);
    expect(pw.rows.length).toBe(rows.length);
    expect(co.rows.length).toBe(rows.length - 1);

    const boot = computeBootstrapCI(rawY, rawX, { replications: 200 });
    expect(boot.estimates.length).toBe(2);
    expect(boot.estimates[1].ciUpperPercentile).toBeGreaterThan(boot.estimates[1].ciLowerPercentile);
  });

  it('4. Extended Descriptives, Categorical Frequencies, Imputation & Full Correlation Suite', () => {
    const rows = [
      { Y: 10, X1: 2, X2: 5, Group: 'A', Bin: 0 },
      { Y: 14, X1: 4, X2: 6, Group: 'A', Bin: 0 },
      { Y: 18, X1: 6, X2: 7, Group: 'B', Bin: 1 },
      { Y: 22, X1: 8, X2: 9, Group: 'B', Bin: 1 },
      { Y: 26, X1: 10, X2: 11, Group: 'B', Bin: 1 },
      { Y: 30, X1: 12, X2: 13, Group: 'A', Bin: 1 }
    ];

    const desc = calculateDescriptiveStatistics(rows, ['Y', 'X1']);
    expect(desc[0].median).toBe(20);
    expect(desc[0].iqr).toBeGreaterThan(0);
    expect(desc[0].range).toBe(20);

    const freq = calculateCategoricalFrequencyTables(rows, ['Group']);
    expect(freq[0].validN).toBe(6);
    expect(freq[0].rows.length).toBe(2);

    const corr = calculateCorrelationMatrix(rows, ['Y', 'X1', 'X2']);
    expect(corr.pearson['Y']['X1']).toBeCloseTo(1.0, 4);
    expect(corr.kendallTauB?.['Y']?.['X1']).toBeCloseTo(1.0, 4);
    expect(corr.confidenceIntervals95?.['Y']?.['X1'].upper).toBeGreaterThan(0.9);

    const pCorr = calculatePartialCorrelation(rows, 'X1', 'Y', ['X2']);
    expect(pCorr.df).toBe(3);

    const pbCorr = calculatePointBiserialCorrelation(rows, 'Bin', 'Y');
    expect(pbCorr.rpb).toBeGreaterThan(0.5);

    const rowsWithMissing = [
      { Y: 10, X1: 2 },
      { Y: null, X1: 4 },
      { Y: 18, X1: 6 },
      { Y: 22, X1: 8 }
    ];
    const interp = applyMissingValueFilter(rowsWithMissing, ['Y', 'X1'], 'linear_interpolation');
    expect(interp.cleanRows[1].Y).toBeCloseTo(14, 4);
  });

  it('5. Moderated Regression Analysis (MRA), Simple Slopes, Johnson-Neyman & Sharma Classification', () => {
    const rows = Array.from({ length: 30 }, (_, i) => {
      const x = (i % 10) - 4.5;
      const z = Math.floor(i / 3) - 4.5;
      const y = 20 + 2.0 * x + 1.2 * z + 0.65 * x * z + (i % 2 === 0 ? 0.3 : -0.3);
      return { Y: y, X: x, Z: z };
    });

    const mra = runModeratedRegressionAnalysis({
      rows,
      yCol: 'Y',
      xCol: 'X',
      zCol: 'Z',
      centerVariables: true
    });

    expect(mra.models.model3.changeStats.rSquaredChange).toBeGreaterThan(0.05);
    expect(mra.models.model3.changeStats.sigFChange).toBeLessThan(0.001);
    expect(mra.simpleSlopes.length).toBe(3);
    expect(mra.moderatorClassification.type).toContain('Quasi Moderator');
    expect(mra.johnsonNeyman.floodlightCurve.length).toBe(41);
  });

  it('6. Contingency Table (Crosstabs), Chi-Square, Yates, Exact Fisher & Risk Estimates', () => {
    const fisher = computeFisherExact2x2(10, 2, 3, 12);
    expect(fisher.p2Sided).toBeLessThan(0.01);

    const rows: Record<string, any>[] = [
      ...Array.from({ length: 12 }, () => ({ Exposure: '1_Exposed', Outcome: '1_Case' })),
      ...Array.from({ length: 3 }, () => ({ Exposure: '1_Exposed', Outcome: '2_Control' })),
      ...Array.from({ length: 4 }, () => ({ Exposure: '2_Unexposed', Outcome: '1_Case' })),
      ...Array.from({ length: 14 }, () => ({ Exposure: '2_Unexposed', Outcome: '2_Control' }))
    ];

    const ct = runContingencyAnalysis({ rows, rowVar: 'Exposure', colVar: 'Outcome' });
    expect(ct.tableDimensions.typeLabel).toBe('2x2');
    expect(ct.chiSquareTests[0].value).toBeGreaterThan(8);
    expect(ct.symmetricMeasures.find(m => m.measureName === "Cramer's V")?.value).toBeGreaterThan(0.4);
    expect(ct.riskEstimates.oddsRatio?.value).toBeCloseTo((12 * 14) / (3 * 4), 2);
  });

  it('7. Advanced Regression & GLM (Logistic, Multinomial, Ordinal, Poisson, NegBin, Quantile, Polynomial, K-Fold)', () => {
    const rows = Array.from({ length: 30 }, (_, i) => {
      const x1 = ((i * 7) % 30) + 1;
      const x2 = (i % 5) + 1;
      return {
        Y_cont: 5 + 1.5 * x1 + 0.2 * x1 * x1,
        Y_bin: x1 > 15 ? 1 : 0,
        Y_ord: x1 <= 10 ? 1 : x1 <= 20 ? 2 : 3,
        Y_nom: x1 <= 10 ? 'Low' : x1 <= 20 ? 'Med' : 'High',
        Y_count: Math.max(0, Math.round(Math.exp(0.5 + 0.06 * x1))),
        X1: x1,
        X2: x2
      };
    });

    const binLogit = fitBinaryLogisticRegression({ rows, yCol: 'Y_bin', xCols: ['X1'] });
    expect(binLogit.modelSummary.nagelkerkeR2).toBeGreaterThan(0.5);
    expect(binLogit.classificationTable.overallPercentage).toBeGreaterThan(80);

    const ordLogit = fitOrdinalLogisticRegression({ rows, yCol: 'Y_ord', xCols: ['X1'] });
    expect(ordLogit.thresholds.length).toBe(2);
    expect(ordLogit.locations.length).toBe(1);

    const multiLogit = fitMultinomialLogisticRegression({ rows, yCol: 'Y_nom', xCols: ['X1'] });
    expect(multiLogit.parameterEstimates.length).toBeGreaterThan(0);

    const pois = fitCountGLMRegression({ rows, yCol: 'Y_count', xCols: ['X1'], family: 'poisson' });
    expect(pois.parameterEstimates[1].expB).toBeGreaterThan(1.0);

    const qReg = fitQuantileRegression({ rows, yCol: 'Y_cont', xCols: ['X1'], tau: 0.5 });
    expect(qReg.pseudoR1).toBeGreaterThan(0.5);

    const poly = fitPolynomialRegression({ rows, yCol: 'Y_cont', xCol: 'X1', degree: 2 });
    expect(poly.polynomialFit.modelSummary.rSquared).toBeGreaterThan(poly.linearFit.modelSummary.rSquared);

    const kFold = runKFoldCrossValidation(
      rows.map(r => r.Y_cont),
      rows.map(r => [r.X1, r.X2]),
      5
    );
    expect(kFold?.folds.length).toBe(5);
    expect(kFold?.meanRSquared).toBeGreaterThan(0.7);

    const fit = runStatisticalRegression({ rows, yCol: 'Y_cont', xCols: ['X1', 'X2'] });
    const tenElem = generateTenElementAcademicInterpretation(fit, 0.05);
    expect(tenElem.length).toBe(3);
    expect(tenElem[0].hypotheses.h0).toContain('H0');
  });
});
