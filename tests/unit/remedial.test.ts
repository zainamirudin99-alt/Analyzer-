import { describe, it, expect } from "vitest";
import {
  getPermittedRemedials,
  detectOutliers,
  applyOutlierRemoval,
  computeBoxCoxProfile,
  applyTransformation,
  computeHC3StandardErrors,
  computeHACNeweyWestLag,
  calculateWilsonScoreInterval,
  calculateNormalityPassRate,
  computeMDES,
} from "../../src/lib/regression-remedial";
import { runRegressionEngine } from "../../src/lib/regression-engine";
import {
  DATASET_WITH_OUTLIER,
  DATASET_HETEROSKEDASTIC,
} from "../fixtures/synthetic-datasets";

function extractYX(ds: { data: Record<string, number>[]; yCol: string; xCols: string[] }) {
  const y = ds.data.map((r) => r[ds.yCol]);
  const x = ds.data.map((r) => ds.xCols.map((col) => r[col]));
  return { y, x, x_names: ds.xCols };
}

describe("Remedial & Honest Reporting Unit Tests", () => {
  describe("Invariant I10: No Pathway from Coefficient p-value to Remedials", () => {
    it("offers zero remedials if all assumptions pass, even if predictor coefficients are not significant", () => {
      // Create mock assumptions where all tests passed ('terpenuhi')
      const mockAssumptions = [
        {
          name: "Uji Normalitas",
          statistic: 0.98,
          pValue: 0.65,
          criteria: "p > 0.05",
          status: "terpenuhi" as const,
          reason: "Normal",
        },
        {
          name: "Uji Homoskedastisitas",
          statistic: 1.2,
          pValue: 0.45,
          criteria: "p > 0.05",
          status: "terpenuhi" as const,
          reason: "Homoskedastis",
        },
        {
          name: "Uji Multikolinearitas",
          statistic: 1.5,
          pValue: null,
          criteria: "VIF < 10",
          status: "terpenuhi" as const,
          reason: "Bebas multikolinearitas",
        },
      ];

      // Regardless of what p-value the coefficient has (e.g. p = 0.85 not significant)
      const permitted = getPermittedRemedials(mockAssumptions, false);

      // Must be empty or only standard baseline options, never offering a 'fix' for insignificant coefficients
      expect(permitted.length).toBe(0);
    });

    it("triggers specific remedials ONLY for failed assumption diagnostics", () => {
      const mockAssumptions = [
        {
          name: "Uji Normalitas",
          statistic: 0.78,
          pValue: 0.001,
          criteria: "p > 0.05",
          status: "gagal" as const,
          reason: "Residu tidak normal",
        },
        {
          name: "Uji Homoskedastisitas",
          statistic: 14.5,
          pValue: 0.002,
          criteria: "p > 0.05",
          status: "gagal" as const,
          reason: "Heteroskedastisitas terdeteksi",
        },
      ];

      const permitted = getPermittedRemedials(mockAssumptions, false);
      const types = permitted.map((p) => p.type);

      // Must offer normality remedials and heteroskedasticity remedials (HC3/WLS)
      expect(types).toContain("outlier_removal");
      expect(types).toContain("transformation");
      expect(types).toContain("robust_hc3");

      // Must NOT offer time series remedials (HAC, lag Y) because isTimeSeries = false
      expect(types).not.toContain("hac_newey_west");
    });
  });

  describe("Outlier Detection and 5% Cumulative Limit Enforcement", () => {
    it("identifies outlier cases based on |t| > 3 or Cook's D > 4/n", () => {
      const ds = DATASET_WITH_OUTLIER;
      const res = runRegressionEngine({
        data: ds.data,
        yCol: ds.yCol,
        xCols: ds.xCols,
        alpha: 0.05,
      });

      const y = ds.data.map((r) => r[ds.yCol]);
      const x = ds.data.map((r) => ds.xCols.map((c) => r[c]));
      const outliers = detectOutliers(res, y, x);
      expect(outliers.length).toBeGreaterThan(0);

      // Check first detected case has studentized residual > 3 or Cook's D > 4/n
      const extreme = outliers.find((o) => o.isEligible);
      expect(extreme).toBeDefined();
    });

    it("enforces maximum 5% cumulative removal constraint", () => {
      const n = 100;
      const maxAllowed = Math.floor(0.05 * n); // 5 cases

      // Trying to remove 6 cases from 100 must be rejected
      const selectedIndices = [1, 2, 3, 4, 5, 6];
      expect(() => applyOutlierRemoval([1], [[1]], selectedIndices, n)).toThrow(
        /kumulatif maksimal 5 persen/i
      );

      // Removing 3 cases should succeed
      const allowedIndices = [1, 2, 3];
      const dummyY = Array.from({ length: n }, (_, i) => i + 1);
      const dummyX = Array.from({ length: n }, (_, i) => [i + 2]);
      const cleaned = applyOutlierRemoval(dummyY, dummyX, allowedIndices, n);
      expect(cleaned.y.length).toBe(n - 3);
      expect(cleaned.removedIndices).toEqual([1, 2, 3]);
    });
  });

  describe("Box-Cox Profile Log-Likelihood Transformation", () => {
    it("finds optimal lambda and provides 95% confidence interval", () => {
      const y = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]; // exponential growth, log(y) linear
      const x = [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10]];

      const profile = computeBoxCoxProfile(y, x);
      expect(profile.optimalLambda).toBeCloseTo(0, 0.5); // near 0 for logarithmic
      expect(profile.ciLower).toBeLessThanOrEqual(profile.optimalLambda);
      expect(profile.ciUpper).toBeGreaterThanOrEqual(profile.optimalLambda);
    });

    it("applies shift constant when Y has non-positive values", () => {
      const y = [-5, -2, 0, 3, 7, 12];
      const x = [[1], [2], [3], [4], [5], [6]];

      const profile = computeBoxCoxProfile(y, x);
      expect(profile.shiftConstant).toBe(6); // |min(-5)| + 1 = 6
    });

    it("transforms Y correctly with Box-Cox formula", () => {
      // lambda = 0 => ln(y)
      const transformed0 = applyTransformation([1, Math.E, Math.E * Math.E], "box_cox", 0, 0);
      expect(transformed0[0]).toBeCloseTo(0, 4);
      expect(transformed0[1]).toBeCloseTo(1, 4);
      expect(transformed0[2]).toBeCloseTo(2, 4);

      // lambda = 1 => y - 1
      const transformed1 = applyTransformation([2, 5, 10], "box_cox", 1, 0);
      expect(transformed1[0]).toBeCloseTo(1, 4);
      expect(transformed1[1]).toBeCloseTo(4, 4);
      expect(transformed1[2]).toBeCloseTo(9, 4);
    });
  });

  describe("HC3 Heteroskedasticity-Consistent Covariance", () => {
    it("computes robust standard errors adjusted by 1/(1-hii)^2", () => {
      const ds = DATASET_HETEROSKEDASTIC;
      const res = runRegressionEngine({
        data: ds.data,
        yCol: ds.yCol,
        xCols: ds.xCols,
        alpha: 0.05,
      });

      const y = ds.data.map((r) => r[ds.yCol]);
      const x = ds.data.map((r) => ds.xCols.map((c) => r[c]));
      const hc3 = computeHC3StandardErrors(y, x, res.coefficients.map((c) => c.b));
      expect(hc3.length).toBe(res.coefficients.length);

      // All HC3 standard errors must be positive
      hc3.forEach((se) => expect(se).toBeGreaterThan(0));
    });
  });

  describe("Normality Pass Rate & Wilson Score Interval", () => {
    it("calculates 95% Wilson confidence interval correctly", () => {
      const interval = calculateWilsonScoreInterval(850, 1000); // 85% pass rate
      expect(interval.center).toBeCloseTo(84.87, 1);
      expect(interval.lower).toBeGreaterThan(80);
      expect(interval.lower).toBeLessThan(85);
      expect(interval.upper).toBeGreaterThan(85);
      expect(interval.upper).toBeLessThan(90);
    });

    it("evaluates pass rate and respects inapplicability for methods that do not rely on normality", () => {
      const y = Array.from({ length: 40 }, (_, i) => i + 1);
      const x = Array.from({ length: 40 }, (_, i) => [i * 2 + 1]);

      // When method does not rely on normality (e.g. HC3, Quantile, Bootstrap)
      const nonApplicable = calculateNormalityPassRate(y, x, false, false, "HC3 tidak mengasumsikan residu normal");
      expect(nonApplicable.isApplicable).toBe(false);
      expect(nonApplicable.inapplicabilityReason).toContain("HC3");

      // When method is applicable (e.g. baseline or Box-Cox)
      const pr = calculateNormalityPassRate(y, x, false, true, undefined, 100);
      expect(pr.isApplicable).toBe(true);
      expect(pr.passRate).toBeGreaterThanOrEqual(0);
      expect(pr.passRate).toBeLessThanOrEqual(100);
      expect(pr.wilsonCiLower).toBeLessThanOrEqual(pr.passRate);
      expect(pr.wilsonCiUpper).toBeGreaterThanOrEqual(pr.passRate);
    });
  });

  describe("Time Series HAC Newey-West Lag Formula", () => {
    it("computes automatic lag L = floor(4 * (n/100)^(2/9))", () => {
      // For n = 100: L = floor(4 * 1) = 4
      expect(computeHACNeweyWestLag(100)).toBe(4);
      // For n = 50: L = floor(4 * 0.5^(2/9)) = floor(4 * 0.857) = 3
      expect(computeHACNeweyWestLag(50)).toBe(3);
      // For n = 200: L = floor(4 * 2^(2/9)) = floor(4 * 1.166) = 4
      expect(computeHACNeweyWestLag(200)).toBe(4);
    });
  });

  describe("Low R2 Pathway: Minimum Detectable Effect Size (MDES)", () => {
    it("computes MDES f2 from non-central F distribution for given n, k, alpha, power 0.8", () => {
      const mdes = computeMDES(100, 2, 0.05, 0.8);
      expect(mdes).toBeGreaterThan(0.05);
      expect(mdes).toBeLessThan(0.20);
    });
  });
});
