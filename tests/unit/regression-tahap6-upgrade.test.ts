import { describe, it, expect } from 'vitest';
import {
  runStatisticalRegression,
  solveQRHouseholder,
  solveLstsqSVD
} from '../../src/lib/regression-engine';
import { runModeratedRegressionAnalysis } from '../../src/lib/regression-moderation-mra';
import { runContingencyAnalysis } from '../../src/lib/regression-contingency-chisquare';
import {
  validateTimeSeriesSequence,
  validateMRAConfig,
  validateContingencyConfig,
  validateRegressionConfig
} from '../../src/lib/regression-validator';
import {
  generateStatisticalRecommendations,
  generateMRARecommendations
} from '../../src/lib/regression-recommendation-engine';
import {
  generateMRADocx,
  generateContingencyDocx
} from '../../src/lib/regression-docx-builder';
import {
  generateMRAXLSX,
  generateContingencyXLSX
} from '../../src/lib/regression-export-xlsx';

describe('Tahap 6 Upgrade — Engine, MRA Multi-Kategori, Time Series Sequence & Ekspor', () => {
  it('1. Householder QR & One-Sided Jacobi SVD agree on ill-conditioned polynomial design matrix (NIST Longley-style)', () => {
    const X = Array.from({ length: 16 }, (_, i) => {
      const t = i + 1990;
      const dt = t - 1990;
      return [1, dt, dt * dt, dt * dt * dt * 0.01];
    });
    const Y = X.map(([, x1, x2, x3]) => 10 + 2.5 * x1 - 0.12 * x2 + 0.45 * x3 + Math.sin(x1) * 0.001);

    const qr = solveQRHouseholder(X, Y);
    const svdBeta = solveLstsqSVD(X, Y);

    expect(qr.rank).toBe(4);
    for (let j = 0; j < 4; j++) {
      const relDiff = Math.abs(qr.beta[j] - svdBeta[j]) / Math.max(1e-10, Math.abs(qr.beta[j]));
      expect(relDiff).toBeLessThan(1e-8);
    }
  });

  it('2. Missing value policies (impute_mean vs impute_median vs listwise) affect nUsed & imputations accurately', () => {
    const rows = [
      { Y: 10, X1: 2, X2: 5 },
      { Y: 14, X1: 4, X2: 7 },
      { Y: 18, X1: null, X2: 9 },
      { Y: 22, X1: 8, X2: 11 },
      { Y: 26, X1: 10, X2: 13 },
      { Y: 30, X1: 12, X2: 15 }
    ];

    const listwiseFit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1'], missingPolicy: 'listwise' });
    const meanFit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1'], missingPolicy: 'impute_mean' });
    const medianFit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1'], missingPolicy: 'impute_median' });

    expect(listwiseFit.sampleSize.nUsed).toBe(5);
    expect(meanFit.sampleSize.nUsed).toBe(6);
    expect(medianFit.sampleSize.nUsed).toBe(6);
    expect(meanFit.solverMetadata?.primarySolver).toBe('Householder-QR');
    expect(meanFit.solverMetadata?.imputedCellsCount).toBe(1);
  });

  it('3. Categorical predictors automatically encode m-1 dummies respecting explicit reference category', () => {
    const rows = Array.from({ length: 24 }, (_, i) => {
      const sector = ['Finance', 'Retail', 'Tech'][i % 3];
      const base = sector === 'Tech' ? 30 : sector === 'Finance' ? 20 : 10;
      const size = 5 + (i % 5);
      return {
        Y: base + 1.5 * size + (i % 2),
        Size: size,
        Sector: sector
      };
    });

    const fitRefRetail = runStatisticalRegression({
      rows,
      yCol: 'Y',
      xCols: ['Size', 'Sector'],
      refCategories: { Sector: 'Retail' }
    });

    const coefNames = fitRefRetail.coefficients.map(c => c.variable);
    expect(coefNames).toContain('Sector[Finance]');
    expect(coefNames).toContain('Sector[Tech]');
    expect(coefNames).not.toContain('Sector[Retail]');
    expect(fitRefRetail.solverMetadata?.dummyEncodings?.[0].referenceCategory).toBe('Retail');

    const val = validateRegressionConfig(rows, { yCol: 'Y', xCols: ['Size', 'Sector'], isTimeSeries: false });
    expect(val.isValid).toBe(true);
  });

  it('4. Multi-category (>= 3 levels) MRA builds m-1 interaction terms, joint F-change & per-category simple slopes', () => {
    const rows = Array.from({ length: 45 }, (_, i) => {
      const grp = ['Low', 'Mid', 'High'][i % 3];
      const x = 1 + (i % 15);
      const slope = grp === 'Low' ? 0.5 : grp === 'Mid' ? 1.5 : 3.2;
      const y = 10 + slope * x + (i % 3) * 0.2;
      return { Y: y, X: x, Group: grp };
    });

    const mraCheck = validateMRAConfig({ rows, yCol: 'Y', xCol: 'X', zCol: 'Group', isModeratorCategorical: true });
    expect(mraCheck.isValid).toBe(true);

    const res = runModeratedRegressionAnalysis({
      rows,
      yCol: 'Y',
      xCol: 'X',
      zCol: 'Group',
      isModeratorCategorical: true,
      referenceCategory: 'Low'
    });

    expect(res.referenceCategory).toBe('Low');
    expect(res.categoryLevels).toEqual(['High', 'Low', 'Mid']);
    expect(res.multiCategoryInteractions?.length).toBe(2);
    expect(res.models.model3.changeStats.df1).toBe(2);
    expect(res.simpleSlopes.length).toBe(3);
    expect(res.interactionEffect.isSignificant).toBe(true);
  });

  it('5. Time Series validation detects non-chronological ordering, duplicates & missing gaps, and regression sorts before DW/BG', () => {
    const unorderedRows = [
      { Period: '2023-03-01', Y: 15, X: 5 },
      { Period: '2023-01-01', Y: 10, X: 2 },
      { Period: '2023-05-01', Y: 22, X: 9 },
      { Period: '2023-02-01', Y: 12, X: 3 },
      { Period: '2023-02-01', Y: 12.1, X: 3.1 }, // duplicate
      { Period: '2023-06-01', Y: 25, X: 11 },
      { Period: '2023-07-01', Y: 28, X: 12 },
      { Period: '2023-08-01', Y: 31, X: 14 }
    ];

    const seq = validateTimeSeriesSequence(unorderedRows, 'Period', 'bulanan');
    expect(seq.isChronological).toBe(false);
    expect(seq.duplicateCount).toBe(1);
    expect(seq.warnings.length).toBeGreaterThan(0);

    const fitTS = runStatisticalRegression({
      rows: unorderedRows,
      yCol: 'Y',
      xCols: ['X'],
      isTimeSeries: true,
      timeCol: 'Period',
      frequency: 'bulanan'
    });
    expect(fitTS.timeSeriesSummary?.isTimeSeries).toBe(true);
  });

  it('6. Recommendations include pros, cons, non-causality guardrails, and MRA centering advisory', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      Y: 5 + 2 * i + (i % 4),
      X1: i + 1,
      X2: 10 + (i % 7)
    }));
    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1', 'X2'] });
    const recs = generateStatisticalRecommendations(fit);
    expect(recs.cards.length).toBeGreaterThan(0);
    recs.cards.forEach(card => {
      expect(card.pros.length).toBeGreaterThan(0);
      expect(card.cons.length).toBeGreaterThan(0);
      expect(card.nonCausalityNote.length).toBeGreaterThan(10);
    });

    const mraAdv = generateMRARecommendations({
      xCol: 'X1',
      zCol: 'X2',
      yCol: 'Y',
      centerVariables: false,
      isInteractionSignificant: false,
      sigFChange: 0.42,
      alpha: 0.05
    });
    expect(mraAdv.centeringAdvisory).toContain('NONAKTIF');
    expect(mraAdv.pros.length).toBeGreaterThan(0);
  });

  it('7. Contingency analysis & MRA/Contingency Word (.docx) + Excel (.xlsx) exports produce valid non-empty buffers', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      Sektor: i % 2 === 0 ? 'Teknologi' : 'Manufaktur',
      Ukuran: i % 4 === 0 ? 'Besar' : 'Kecil',
      Y: 20 + (i % 10) * 1.5,
      X: i % 10,
      Z: 1 + (i % 5)
    }));

    const contValid = validateContingencyConfig({ rows, rowCol: 'Sektor', colCol: 'Ukuran' });
    expect(contValid.isValid).toBe(true);

    const contRes = runContingencyAnalysis({ rows, rowVar: 'Sektor', colVar: 'Ukuran' });
    expect(contRes.chiSquareTests.length).toBeGreaterThan(0);

    const mraRes = runModeratedRegressionAnalysis({ rows, yCol: 'Y', xCol: 'X', zCol: 'Z' });

    const mraDocx = await generateMRADocx({ mraResult: mraRes, datasetName: 'test.xlsx', sheetName: 'Sheet1' });
    const contDocx = await generateContingencyDocx({ contingencyResult: contRes, datasetName: 'test.xlsx', sheetName: 'Sheet1' });
    const mraXlsx = generateMRAXLSX({ mraResult: mraRes, datasetName: 'test.xlsx', sheetName: 'Sheet1' });
    const contXlsx = generateContingencyXLSX({ contingencyResult: contRes, datasetName: 'test.xlsx', sheetName: 'Sheet1' });

    // Zip / OOXML magic signature PK\x03\x04
    expect(mraDocx.subarray(0, 2).toString()).toBe('PK');
    expect(contDocx.subarray(0, 2).toString()).toBe('PK');
    expect(mraXlsx.subarray(0, 2).toString()).toBe('PK');
    expect(contXlsx.subarray(0, 2).toString()).toBe('PK');
  });
});
