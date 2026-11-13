// ============================================================
// Dual-Engine Verification Helper: TypeScript QR/SVD vs Python Statsmodels
// Calls Vercel Serverless Function `/api/py/validate` when available,
// and degrades gracefully to local Householder QR vs Jacobi SVD parity check.
// ============================================================

import { OLSFitResult, calculateLRE } from './regression-engine';

export interface PythonParityReport {
  available: boolean;
  source: 'python-statsmodels' | 'typescript-local-fallback';
  engineLabel: string;
  maxCoefficientRelDiff: number;
  minLRE: number;
  rSquaredDiff?: number;
  pythonHC3StdErrors?: number[];
  pythonDiagnostics?: {
    shapiroWilk?: { statistic: number; pValue: number };
    lilliefors?: { statistic: number; pValue: number };
    breuschPagan?: { lm: number; pValue: number };
    durbinWatson?: number;
    belsleyConditionIndex?: number;
  };
  message: string;
}

export async function verifyWithPythonParity(params: {
  rows: Record<string, any>[];
  yCol: string;
  xCols: string[];
  tsResult: OLSFitResult;
  isTimeSeries?: boolean;
  timeCol?: string;
  refCategories?: Record<string, string>;
}): Promise<PythonParityReport> {
  const { rows, yCol, xCols, tsResult, isTimeSeries = false, timeCol, refCategories } = params;

  const buildFallback = (reason: string): PythonParityReport => {
    const dualCheck = tsResult.scores.checks.find(c => c.id === 'S3_CHECK_1_DUAL_ENGINE_PARITY');
    const relDiff = dualCheck?.value ?? 0;
    const minLRE = relDiff <= 1e-15 ? 15.0 : Math.max(0, -Math.log10(relDiff));
    return {
      available: false,
      source: 'typescript-local-fallback',
      engineLabel: 'TypeScript Householder QR vs One-Sided Jacobi SVD',
      maxCoefficientRelDiff: relDiff,
      minLRE: Number(minLRE.toFixed(2)),
      message: reason
    };
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('/api/py/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'ols',
        rows,
        yCol,
        xCols,
        isTimeSeries,
        timeCol,
        refCategories
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      return buildFallback(
        `Endpoint verifikasi Python (/api/py/validate) tidak aktif di lingkungan lokal (HTTP ${res.status}); memakai validasi ganda lokal QR vs SVD.`
      );
    }

    const payload = await res.json();
    if (!payload?.success || !Array.isArray(payload.coefficients)) {
      return buildFallback('Respons /api/py/validate tidak valid; memakai validasi ganda lokal QR vs SVD.');
    }

    const tsCoefs = tsResult.coefficients.map(c => c.b);
    const pyCoefs: number[] = payload.coefficients;
    let maxRelDiff = 0;
    let minLRE = 15.0;
    const len = Math.min(tsCoefs.length, pyCoefs.length);
    for (let i = 0; i < len; i++) {
      const diff = Math.abs(tsCoefs[i] - pyCoefs[i]) / Math.max(1e-12, Math.abs(pyCoefs[i]));
      if (diff > maxRelDiff) maxRelDiff = diff;
      const lre = calculateLRE(tsCoefs[i], pyCoefs[i]);
      if (lre < minLRE) minLRE = lre;
    }

    const rSquaredDiff = Math.abs(tsResult.modelSummary.rSquared - Number(payload.rSquared ?? tsResult.modelSummary.rSquared));

    return {
      available: true,
      source: 'python-statsmodels',
      engineLabel: payload.engine || 'statsmodels + scipy',
      maxCoefficientRelDiff: maxRelDiff,
      minLRE: Number(minLRE.toFixed(2)),
      rSquaredDiff,
      pythonHC3StdErrors: payload.stdErrorsHC3,
      pythonDiagnostics: {
        shapiroWilk: payload.diagnostics?.shapiroWilk,
        lilliefors: payload.diagnostics?.lilliefors,
        breuschPagan: payload.diagnostics?.breuschPagan,
        durbinWatson: payload.durbinWatson,
        belsleyConditionIndex: payload.belsleyConditionIndex
      },
      message:
        minLRE >= 8
          ? `Paritas numerik terverifikasi dengan Python Statsmodels (LRE min = ${minLRE.toFixed(1)} digit presisi).`
          : `Verifikasi Python selesai dengan selisih relatif maksimum ${maxRelDiff.toExponential(3)} (LRE = ${minLRE.toFixed(1)}).`
    };
  } catch {
    return buildFallback('Layanan Python /api/py/validate tidak terjangkau pada mode lokal/offline; validasi ganda lokal QR vs SVD tetap aktif.');
  }
}

