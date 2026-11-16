// ============================================================
// Comparative Measurement Accuracy Assessment — Lin's CCC
// Lin (1989) Concordance Correlation Coefficient, Scale/Location
// Shifts, Bias Correction Factor C_b & Fisher-Z 95% Confidence Interval
// ============================================================

import { LinsCCCResult, MeasurementSource } from './panel-accuracy-types';

/**
 * Compute Lin's Concordance Correlation Coefficient (Lin, 1989, Biometrics 45:255-268).
 * Formula:
 *   rho_c = (2 * s_xy) / (s_x^2 + s_y^2 + (x_bar - y_bar)^2)
 *   where s_x^2, s_y^2, s_xy use consistent divisor (1/n or 1/(n-1); ratio is identical when using 1/n for all three,
 *   or using 1/n on (x_bar - y_bar)^2 with 1/n sample moments per Lin 1989 eq. 2).
 */
export function computeLinsCCC(
  compValues: number[],
  refValues: number[],
  source: Pick<MeasurementSource, 'id' | 'name' | 'label'>
): LinsCCCResult {
  const n = Math.min(compValues.length, refValues.length);
  if (n < 2) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceLabel: source.label,
      n,
      ccc: 0,
      ciLower: 0,
      ciUpper: 0,
      pearsonR: 0,
      biasCorrectionFactorCb: 0,
      scaleShiftV: 1,
      locationShiftU: 0,
      seZ: 0
    };
  }

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += compValues[i];
    sumY += refValues[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  // Use sample variance divisor (n - 1) or population divisor n consistently:
  // Standard Stata `concord` and R `DescTools::CCC` / `epiR::epi.ccc` use (1/n) for s_x^2, s_y^2, s_xy
  // (or equivalently (n-1)/n factor on (meanX - meanY)^2 with unbiased variance). Both give the exact same value:
  // 2 * sum((x - mx)(y - my)) / (sum((x - mx)^2) + sum((y - my)^2) + n * (mx - my)^2)
  let ssX = 0;
  let ssY = 0;
  let ssXY = 0;
  for (let i = 0; i < n; i++) {
    const dx = compValues[i] - meanX;
    const dy = refValues[i] - meanY;
    ssX += dx * dx;
    ssY += dy * dy;
    ssXY += dx * dy;
  }

  const varX = ssX / n;
  const varY = ssY / n;
  const covXY = ssXY / n;
  const diffMeanSq = (meanX - meanY) * (meanX - meanY);

  const denomCcc = varX + varY + diffMeanSq;
  const ccc = denomCcc > 1e-12 ? Math.max(-1, Math.min(1, (2 * covXY) / denomCcc)) : 0;

  const sdX = Math.sqrt(Math.max(1e-12, varX));
  const sdY = Math.sqrt(Math.max(1e-12, varY));
  const pearsonR = Math.max(-1, Math.min(1, covXY / (sdX * sdY)));

  const scaleShiftV = sdX / sdY;
  const locationShiftU = (meanX - meanY) / Math.sqrt(sdX * sdY);
  const cbDenom = scaleShiftV + 1 / scaleShiftV + locationShiftU * locationShiftU;
  const biasCorrectionFactorCb = cbDenom > 1e-12 ? Math.min(1, 2 / cbDenom) : 0;

  // Asymptotic Fisher-Z confidence interval (Lin 1989)
  let ciLower = ccc;
  let ciUpper = ccc;
  let seZ = 0;

  if (n > 3 && Math.abs(ccc) < 0.999999 && Math.abs(pearsonR) > 1e-8) {
    const r2 = Math.max(1e-8, pearsonR * pearsonR);
    const c2 = ccc * ccc;
    const oneMinusC2 = Math.max(1e-8, 1 - c2);
    const u2 = locationShiftU * locationShiftU;

    const term1 = ((1 - r2) * c2) / (oneMinusC2 * r2);
    const term2 = (2 * c2 * ccc * (1 - ccc) * u2) / (pearsonR * oneMinusC2 * oneMinusC2);
    const term3 = (c2 * c2 * u2 * u2) / (2 * r2 * oneMinusC2 * oneMinusC2);
    const varZ = Math.max(1e-10, (term1 + term2 - term3) / Math.max(1, n - 2));
    seZ = Math.sqrt(varZ);

    const zC = 0.5 * Math.log((1 + ccc) / (1 - ccc));
    const zLo = zC - 1.959964 * seZ;
    const zHi = zC + 1.959964 * seZ;
    ciLower = Math.tanh(zLo);
    ciUpper = Math.tanh(zHi);
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceLabel: source.label,
    n,
    ccc,
    ciLower,
    ciUpper,
    pearsonR,
    biasCorrectionFactorCb,
    scaleShiftV,
    locationShiftU,
    seZ
  };
}
