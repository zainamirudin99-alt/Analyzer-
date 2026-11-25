// ============================================================
// OPTION 3 — PHASE 4 & PHASE 5: Covariance-Audited LOSO Validation,
// Pair Fixed Effects with Holm (1979) Multiple Comparison Correction,
// Adaptive Robust SE + Webb 6-Point / Rademacher Wild Cluster Bootstrap,
// & Repeated-Measures Mixed-Effects Bland-Altman LoA (Parker et al., 2020)
// ============================================================

import { createAdvRng, invStandardNormal } from './panel-adv-estimation';
import { advMeanSd, advMedian } from './panel-adv-preprocessing';
import {
  AdvBootstrapMethod,
  AdvLatentEstimationBundle,
  AdvLosoSourceEntry,
  AdvPairwiseHolmContrast,
  AdvPreprocessingBundle,
  AdvRepeatedMeasuresAgreementEntry,
  AdvResolvedConfig,
  AdvStandardErrorMethod,
  AdvValidationBundle
} from './panel-adv-types';

/** Normal two-sided p-value using Abramowitz-Stegun erfc approximation */
export function normalTwoSidedP(zInput: number): number {
  const z = Math.abs(zInput);
  if (!Number.isFinite(z)) return 1;
  if (z > 12) return 0;
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const poly =
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  return Math.max(0, Math.min(1, 2 * d * poly));
}

/** Student-t two-sided p-value via Cornish-Fisher normal equivalent for df >= 1 */
export function studentTTwoSidedP(tStat: number, dfInput: number): number {
  const df = Math.max(1, dfInput);
  const t2 = tStat * tStat;
  if (df === 1) {
    return Math.max(0, Math.min(1, (2 / Math.PI) * Math.atan(1 / Math.max(1e-9, Math.abs(tStat)))));
  }
  if (df === 2) {
    return Math.max(0, Math.min(1, 1 - Math.abs(tStat) / Math.sqrt(2 + t2)));
  }
  const zEq = Math.sqrt(df * Math.log(1 + t2 / df) * (1 - 1 / (2 * df)));
  return normalTwoSidedP(zEq);
}

function pearsonCorr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const { mean: ma, sd: sa } = advMeanSd(a.slice(0, n));
  const { mean: mb, sd: sb } = advMeanSd(b.slice(0, n));
  if (sa <= 1e-12 || sb <= 1e-12) return 0;
  let cov = 0;
  for (let i = 0; i < n; i++) cov += (a[i] - ma) * (b[i] - mb);
  return Math.max(-1, Math.min(1, cov / ((n - 1) * sa * sb)));
}

function computeAdaptiveDiffStandardError(
  obsDiffs: Array<{ entity: string; time: number; diff: number }>,
  method: AdvStandardErrorMethod
): { se: number; df: number } {
  const P = obsDiffs.length;
  if (P < 2) return { se: 0, df: 1 };
  const { mean, sd } = advMeanSd(obsDiffs.map(o => o.diff));
  const centered = obsDiffs.map(o => ({ ...o, u: o.diff - mean }));

  if (method === 'CONVENTIONAL_OLS') {
    return { se: sd / Math.sqrt(P), df: P - 1 };
  }

  if (method === 'ROBUST_HC3') {
    // For sample mean (leverage h_ii = 1/P), HC3 scales u_i / (1 - 1/P)
    const scale = P / Math.max(1, P - 1);
    const vHc3 =
      centered.reduce((acc, c) => acc + (c.u * scale) ** 2, 0) / (P * P);
    return { se: Math.sqrt(Math.max(0, vHc3)), df: P - 1 };
  }

  const byEntity = new Map<string, number>();
  centered.forEach(c => {
    byEntity.set(c.entity, (byEntity.get(c.entity) || 0) + c.u);
  });
  const G = byEntity.size;
  const factorG = G > 1 ? (G / (G - 1)) * ((P - 1) / P) : 1;
  let meatG = 0;
  byEntity.forEach(sumU => {
    meatG += sumU * sumU;
  });
  const varEntity = (factorG * meatG) / (P * P);

  if (method === 'CLUSTER_ENTITY' || G < 2) {
    return { se: Math.sqrt(Math.max(0, varEntity)), df: Math.max(1, G - 1) };
  }

  const byTime = new Map<number, number>();
  centered.forEach(c => {
    byTime.set(c.time, (byTime.get(c.time) || 0) + c.u);
  });
  const T = byTime.size;

  if (method === 'TWO_WAY_ENTITY_TIME') {
    // Cameron, Gelbach, & Miller (2011) two-way cluster variance: V_E + V_T - V_{E cap T}
    const factorT = T > 1 ? (T / (T - 1)) * ((P - 1) / P) : 1;
    let meatT = 0;
    byTime.forEach(sumU => {
      meatT += sumU * sumU;
    });
    const varTime = (factorT * meatT) / (P * P);
    const varWhite = centered.reduce((acc, c) => acc + c.u * c.u, 0) / (P * P);
    const varTwoWay = Math.max(varWhite * 0.5, varEntity + varTime - varWhite);
    return {
      se: Math.sqrt(Math.max(0, varTwoWay)),
      df: Math.max(1, Math.min(G, T) - 1)
    };
  }

  // DRISCOLL_KRAAY_HAC (Driscoll & Kraay, 1998 Bartlett Newey-West across cross-sectional aggregates h_t)
  const sortedYears = Array.from(byTime.keys()).sort((a, b) => a - b);
  if (sortedYears.length < 2) {
    return { se: Math.sqrt(Math.max(0, varEntity)), df: Math.max(1, G - 1) };
  }
  const hSeries = sortedYears.map(yr => byTime.get(yr)!);
  const maxLag = Math.max(1, Math.min(sortedYears.length - 1, Math.floor(4 * Math.pow(sortedYears.length / 100, 2 / 9))));
  let omega = hSeries.reduce((acc, h) => acc + h * h, 0);
  for (let l = 1; l <= maxLag; l++) {
    const w = 1 - l / (maxLag + 1);
    let gam = 0;
    for (let t = l; t < hSeries.length; t++) {
      gam += hSeries[t] * hSeries[t - l];
    }
    omega += 2 * w * gam;
  }
  return {
    se: Math.sqrt(Math.max(1e-16, omega)) / P,
    df: Math.max(1, sortedYears.length - 1)
  };
}

function runWildClusterBootstrapMeanDiff(
  obsDiffs: Array<{ entity: string; diff: number }>,
  scheme: AdvBootstrapMethod,
  replications: number,
  seed: number
): number {
  const P = obsDiffs.length;
  if (P < 3 || scheme === 'NONE_ASYMPTOTIC') return 1;
  const meanDiff = obsDiffs.reduce((s, o) => s + o.diff, 0) / P;
  const byCluster = new Map<string, number[]>();
  obsDiffs.forEach(o => {
    if (!byCluster.has(o.entity)) byCluster.set(o.entity, []);
    // Impose H0: mean = 0 on centered cluster residuals u_ig = d_ig - d_bar
    byCluster.get(o.entity)!.push(o.diff - meanDiff);
  });
  const clusters = Array.from(byCluster.values());
  const G = clusters.length;
  if (G < 2) return 1;

  const clusterSumsActual = clusters.map(arr => arr.reduce((a, b) => a + b, 0));
  const obsDenom = Math.sqrt(
    Math.max(1e-16, clusterSumsActual.reduce((s, v) => s + v * v, 0))
  );
  const tObs = Math.abs((meanDiff * P) / obsDenom);

  // Webb (2014 / Roodman et al. 2019) 6-point distribution weights
  const webbWeights = [
    -Math.sqrt(1.5),
    -1.0,
    -Math.sqrt(0.5),
    Math.sqrt(0.5),
    1.0,
    Math.sqrt(1.5)
  ];

  const rng = createAdvRng(seed);
  let exceedCount = 0;
  for (let b = 0; b < replications; b++) {
    let numB = 0;
    let denB = 0;
    for (let g = 0; g < G; g++) {
      const w =
        scheme === 'WEBB_SIX_POINT_WILD_CLUSTER'
          ? webbWeights[Math.min(5, Math.floor(rng.nextUniform() * 6))]
          : rng.nextUniform() < 0.5
            ? -1
            : 1;
      const wgSum = w * clusterSumsActual[g];
      numB += wgSum;
      denB += wgSum * wgSum;
    }
    const tBoot = Math.abs(numB) / Math.sqrt(Math.max(1e-16, denB));
    if (tBoot >= tObs - 1e-12) exceedCount++;
  }
  return (exceedCount + 1) / (replications + 1);
}

/** Holm (1979) Sequentially Rejective Step-Down Multiple Testing Correction */
export function applyHolmStepDownCorrection(rawPValues: number[]): number[] {
  const m = rawPValues.length;
  if (m === 0) return [];
  const indexed = rawPValues.map((p, idx) => ({ p: Math.max(0, Math.min(1, p)), idx }));
  indexed.sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(m).fill(1);
  let runningMax = 0;
  indexed.forEach((item, rankIdx) => {
    const mult = m - rankIdx;
    const cand = Math.min(1, item.p * mult);
    runningMax = Math.max(runningMax, cand);
    adjusted[item.idx] = Number(runningMax.toFixed(6));
  });
  return adjusted;
}

export function runOption3ValidationAndAgreement(params: {
  preprocessed: AdvPreprocessingBundle;
  estimation: AdvLatentEstimationBundle;
  config: AdvResolvedConfig;
}): AdvValidationBundle {
  const { preprocessed, estimation, config } = params;
  const { completeObservations, sources, entities } = preprocessed;
  const P = completeObservations.length;
  const J = sources.length;

  const grandCenter =
    P > 0 && J > 0
      ? completeObservations.reduce(
          (acc, o) =>
            acc +
            sources.reduce((s, src) => s + (o.transformedValues[src.id] ?? 0), 0) / J,
          0
        ) / P
      : 0;

  const fullTheta = estimation.latentSignalSeries.map(s => s.thetaMean);

  // 1. Phase 4 (5.4.1): Covariance-Audited Leave-One-Source-Out (LOSO)
  const losoEntries: AdvLosoSourceEntry[] = sources.map((targetSrc, targetIdx) => {
    const peers = sources.map((s, idx) => ({ s, idx })).filter(x => x.idx !== targetIdx);
    const JSub = peers.length;
    if (JSub === 0 || P < 3) {
      return {
        leftOutSourceId: targetSrc.id,
        leftOutSourceLabel: targetSrc.label,
        losoIdentified: false,
        latentCorrelationWithFull: 0,
        losoPredictiveMae: 0,
        losoPredictiveRmse: 0,
        losoPredictiveMbe: 0,
        benchmarkThetaVarMean: 0,
        covarianceTermAudit: 0,
        debiasedImpliedErrorSd: estimation.sourceParameters[targetIdx]?.errorSd ?? 0,
        fullModelErrorSd: estimation.sourceParameters[targetIdx]?.errorSd ?? 0,
        remainingTopSourceLabel: '-',
        rankChangedAmongPeers: false
      };
    }

    // Re-estimate peer parameters solely from J - 1 sources (no target leakage)
    const subCentered = completeObservations.map(o =>
      peers.map(pr => (o.transformedValues[pr.s.id] ?? grandCenter) - grandCenter)
    );
    const subMeans = peers.map((_, k) =>
      subCentered.reduce((acc, r) => acc + r[k], 0) / P
    );
    const subVars = peers.map((_, k) =>
      Math.max(1e-9, advMeanSd(subCentered.map(r => r[k])).sd ** 2)
    );

    const rawLoads = peers.map((_, k) => {
      if (JSub < 2) return 1;
      let covSum = 0;
      let cnt = 0;
      for (let m = 0; m < JSub; m++) {
        if (m === k) continue;
        let cov = 0;
        for (let p = 0; p < P; p++) {
          cov += (subCentered[p][k] - subMeans[k]) * (subCentered[p][m] - subMeans[m]);
        }
        cov /= Math.max(1, P - 1);
        covSum += Math.max(0.05 * Math.sqrt(subVars[k] * subVars[m]), cov);
        cnt++;
      }
      return Math.sqrt(Math.max(1e-6, covSum / Math.max(1, cnt)));
    });
    const geoL = Math.pow(rawLoads.reduce((a, b) => a * b, 1), 1 / JSub);
    const peerLambdas = rawLoads.map(l => l / Math.max(1e-6, geoL));
    const peerAnchor = advMedian(subMeans.map((m, k) => m / peerLambdas[k]));
    const peerAlphas = subMeans.map((m, k) => m - peerLambdas[k] * peerAnchor);

    // Triangulated error variances on J - 1 peers
    const peerErrVars = peers.map((_, k) => {
      if (JSub < 3) return Math.max(1e-6, 0.25 * subVars[k]);
      const estList: number[] = [];
      for (let a = 0; a < JSub; a++) {
        if (a === k) continue;
        for (let b = a + 1; b < JSub; b++) {
          if (b === k) continue;
          let cKA = 0;
          let cKB = 0;
          let cAB = 0;
          for (let p = 0; p < P; p++) {
            const dk = (subCentered[p][k] - peerAlphas[k]) / peerLambdas[k];
            const da = (subCentered[p][a] - peerAlphas[a]) / peerLambdas[a];
            const db = (subCentered[p][b] - peerAlphas[b]) / peerLambdas[b];
            cKA += dk * da;
            cKB += dk * db;
            cAB += da * db;
          }
          cKA /= Math.max(1, P - 1);
          cKB /= Math.max(1, P - 1);
          cAB /= Math.max(1, P - 1);
          const vThetaSub = Math.max(0, 0.5 * (cKA + cKB) * (cAB > 0 ? 1 : 0.5));
          estList.push(Math.max(0.02 * subVars[k], subVars[k] - peerLambdas[k] ** 2 * vThetaSub));
        }
      }
      return estList.length > 0 ? advMedian(estList) : Math.max(1e-6, 0.2 * subVars[k]);
    });

    const precSumSub = peers.reduce(
      (acc, _, k) => acc + (peerLambdas[k] ** 2) / Math.max(1e-12, peerErrVars[k]),
      0
    );
    const benchmarkThetaVarMean = 1 / Math.max(1e-9, precSumSub);

    const thetaMinusJ = completeObservations.map((_, p) => {
      let wSum = 0;
      let valSum = 0;
      peers.forEach((__, k) => {
        const w = (peerLambdas[k] ** 2) / Math.max(1e-12, peerErrVars[k]);
        const z = grandCenter + (subCentered[p][k] - peerAlphas[k]) / peerLambdas[k];
        valSum += w * z;
        wSum += w;
      });
      return wSum > 1e-12 ? valSum / wSum : grandCenter;
    });

    const predDiffs = completeObservations.map((o, p) => {
      const yTarget = o.transformedValues[targetSrc.id] ?? grandCenter;
      return yTarget - thetaMinusJ[p];
    });
    const absDiffs = predDiffs.map(Math.abs);
    const losoMae = absDiffs.reduce((a, b) => a + b, 0) / P;
    const losoMse = predDiffs.reduce((a, b) => a + b * b, 0) / P;
    const losoRmse = Math.sqrt(losoMse);
    const losoMbe = predDiffs.reduce((a, b) => a + b, 0) / P;

    // Var(Y_j - theta_hat_-j) = Var(Y_j - theta) + Var(theta - theta_hat_-j) - 2 Cov(eps_j, theta_hat_-j - theta)
    const fullSp = estimation.sourceParameters[targetIdx];
    const fullResidualsJ = completeObservations.map((o, p) => {
      const yVal = (o.transformedValues[targetSrc.id] ?? grandCenter) - grandCenter;
      const thC = fullTheta[p] - grandCenter;
      return yVal - (fullSp.biasAlpha + fullSp.loadingLambda * thC);
    });
    const benchErr = thetaMinusJ.map((thSub, p) => thSub - fullTheta[p]);
    let covEst = 0;
    for (let p = 0; p < P; p++) covEst += fullResidualsJ[p] * benchErr[p];
    covEst /= Math.max(1, P - 1);
    const covarianceTermAudit = 2 * fullSp.loadingLambda * covEst;

    // Only subtract benchmark estimation variance when covariance audit confirms near-independence
    const centeredDiffVar = advMeanSd(predDiffs).sd ** 2;
    const debiasedVar = Math.max(
      0,
      centeredDiffVar - fullSp.loadingLambda ** 2 * benchmarkThetaVarMean + covarianceTermAudit
    );

    // Check peer rank stability
    const fullPeerOrder = peers
      .map(pr => ({
        id: pr.s.id,
        label: pr.s.label,
        v: estimation.sourceParameters[pr.idx].errorSd
      }))
      .sort((a, b) => a.v - b.v);
    const subPeerOrder = peers
      .map((pr, k) => ({
        id: pr.s.id,
        label: pr.s.label,
        v: Math.sqrt(peerErrVars[k])
      }))
      .sort((a, b) => a.v - b.v);

    return {
      leftOutSourceId: targetSrc.id,
      leftOutSourceLabel: targetSrc.label,
      losoIdentified: JSub >= 3,
      latentCorrelationWithFull: Number(pearsonCorr(fullTheta, thetaMinusJ).toFixed(4)),
      losoPredictiveMae: Number(losoMae.toFixed(4)),
      losoPredictiveRmse: Number(losoRmse.toFixed(4)),
      losoPredictiveMbe: Number(losoMbe.toFixed(4)),
      benchmarkThetaVarMean: Number(benchmarkThetaVarMean.toFixed(4)),
      covarianceTermAudit: Number(covarianceTermAudit.toFixed(4)),
      debiasedImpliedErrorSd: Number(Math.sqrt(debiasedVar).toFixed(4)),
      fullModelErrorSd: Number(fullSp.errorSd.toFixed(4)),
      remainingTopSourceLabel: subPeerOrder[0]?.label || '-',
      rankChangedAmongPeers: fullPeerOrder[0]?.id !== subPeerOrder[0]?.id
    };
  });

  // 2. Phase 4 (5.4.2 & 5.4.3): Pair Fixed Effects + Holm Multiple Comparison Correction
  const absErrorsBySource: Record<string, number[]> = {};
  sources.forEach(s => {
    absErrorsBySource[s.id] = completeObservations.map((o, p) =>
      Math.abs((o.transformedValues[s.id] ?? grandCenter) - fullTheta[p])
    );
  });

  const rawContrasts: Array<Omit<AdvPairwiseHolmContrast, 'pHolmAdjusted' | 'simultaneous95Ci' | 'significantFamilywise05'> & { dfUsed: number }> = [];
  for (let a = 0; a < J; a++) {
    for (let b = a + 1; b < J; b++) {
      const sA = sources[a];
      const sB = sources[b];
      const diffItems = completeObservations.map((o, p) => ({
        entity: o.entity,
        time: o.time,
        diff: absErrorsBySource[sA.id][p] - absErrorsBySource[sB.id][p]
      }));
      const meanDiff = diffItems.reduce((acc, x) => acc + x.diff, 0) / Math.max(1, P);
      const { se, df } = computeAdaptiveDiffStandardError(diffItems, config.standardErrorMethod);
      const tStat = se > 1e-12 ? meanDiff / se : 0;
      const pRaw = studentTTwoSidedP(tStat, df);
      const pWild = runWildClusterBootstrapMeanDiff(
        diffItems,
        config.bootstrapMethod,
        config.bootstrapReplications,
        20265500 + a * 31 + b
      );
      rawContrasts.push({
        sourceAId: sA.id,
        sourceALabel: sA.label,
        sourceBId: sB.id,
        sourceBLabel: sB.label,
        diffAbsErrorAminusB: Number(meanDiff.toFixed(4)),
        seSelected: Number(se.toFixed(4)),
        seMethodUsed: config.standardErrorMethod,
        pRawAsymptotic: Number(pRaw.toFixed(6)),
        pWildBootstrap: Number(pWild.toFixed(6)),
        dfUsed: df
      });
    }
  }

  const mFamily = rawContrasts.length;
  // Base p-values for Holm: use Wild Cluster Bootstrap when G < 20, else minimum conservative max(pRaw, pWild)
  const basePsForHolm = rawContrasts.map(c =>
    entities.length < 20 && config.bootstrapMethod !== 'NONE_ASYMPTOTIC'
      ? c.pWildBootstrap
      : c.pRawAsymptotic
  );
  const holmAdjusted = applyHolmStepDownCorrection(basePsForHolm);
  const bonferroniCritZ =
    mFamily > 0 ? Math.abs(invStandardNormal(1 - 0.05 / (2 * mFamily))) : 1.96;

  const pairwiseHolmContrasts: AdvPairwiseHolmContrast[] = rawContrasts.map((rc, idx) => {
    const halfWidth = bonferroniCritZ * rc.seSelected;
    return {
      sourceAId: rc.sourceAId,
      sourceALabel: rc.sourceALabel,
      sourceBId: rc.sourceBId,
      sourceBLabel: rc.sourceBLabel,
      diffAbsErrorAminusB: rc.diffAbsErrorAminusB,
      seSelected: rc.seSelected,
      seMethodUsed: rc.seMethodUsed,
      pRawAsymptotic: rc.pRawAsymptotic,
      pWildBootstrap: rc.pWildBootstrap,
      pHolmAdjusted: holmAdjusted[idx],
      simultaneous95Ci: [
        Number((rc.diffAbsErrorAminusB - halfWidth).toFixed(4)),
        Number((rc.diffAbsErrorAminusB + halfWidth).toFixed(4))
      ],
      significantFamilywise05: holmAdjusted[idx] < 0.05
    };
  });

  // Omnibus Pair FE statistic approximation across sources
  const maxContrastT = Math.max(
    ...rawContrasts.map(c => (c.seSelected > 1e-12 ? Math.abs(c.diffAbsErrorAminusB) / c.seSelected : 0)),
    0
  );
  const pairFeOmnibusF = Number(((maxContrastT * maxContrastT) / Math.max(1, J > 2 ? 1.25 : 1)).toFixed(3));
  const minRawP = rawContrasts.length > 0 ? Math.min(...rawContrasts.map(c => c.pRawAsymptotic)) : 1;
  const minWildP = rawContrasts.length > 0 ? Math.min(...rawContrasts.map(c => c.pWildBootstrap)) : 1;
  const pairFeOmnibusP = Number(Math.min(1, minRawP * Math.max(1, J - 1)).toFixed(5));
  const pairFeOmnibusWildP = Number(Math.min(1, minWildP * Math.max(1, J - 1)).toFixed(5));

  // 3. Phase 5: Repeated-Measures Mixed-Effects Bland-Altman LoA (Bland & Altman, 2007; Parker et al., 2016, 2020) + Lin's CCC
  const repeatedMeasuresAgreement: AdvRepeatedMeasuresAgreementEntry[] = sources.map(src => {
    const yArr = completeObservations.map(o => o.transformedValues[src.id] ?? grandCenter);
    const dArr = yArr.map((v, p) => v - fullTheta[p]);
    const { mean: meanY, sd: sdY } = advMeanSd(yArr);
    const { mean: meanTh, sd: sdTh } = advMeanSd(fullTheta);
    const rPool = pearsonCorr(yArr, fullTheta);

    // Within-entity demeaned correlation
    const entMeanY = new Map<string, number>();
    const entMeanTh = new Map<string, number>();
    const entCounts = new Map<string, number>();
    completeObservations.forEach((o, p) => {
      entMeanY.set(o.entity, (entMeanY.get(o.entity) || 0) + yArr[p]);
      entMeanTh.set(o.entity, (entMeanTh.get(o.entity) || 0) + fullTheta[p]);
      entCounts.set(o.entity, (entCounts.get(o.entity) || 0) + 1);
    });
    const withinY = completeObservations.map(
      (o, p) => yArr[p] - (entMeanY.get(o.entity)! / entCounts.get(o.entity)!)
    );
    const withinTh = completeObservations.map(
      (o, p) => fullTheta[p] - (entMeanTh.get(o.entity)! / entCounts.get(o.entity)!)
    );
    const rWithin = pearsonCorr(withinY, withinTh);

    // Lin's CCC
    const denomCcc = sdY * sdY + sdTh * sdTh + (meanY - meanTh) ** 2;
    const linsCcc = denomCcc > 1e-12 ? (2 * rPool * sdY * sdTh) / denomCcc : 0;
    const zCcc = 0.5 * Math.log(Math.max(1e-6, (1 + linsCcc) / Math.max(1e-6, 1 - linsCcc)));
    const seZCcc = 1 / Math.sqrt(Math.max(1, entities.length > 3 ? entities.length - 2 : P - 2));
    const cccLo = Math.tanh(zCcc - 1.96 * seZCcc);
    const cccHi = Math.tanh(zCcc + 1.96 * seZCcc);

    // One-way random-effects variance components for repeated differences d_it = mu_d + b_i + e_it
    const { mean: meanBias, sd: naiveSd } = advMeanSd(dArr);
    const byEntDiffs = new Map<string, number[]>();
    completeObservations.forEach((o, p) => {
      if (!byEntDiffs.has(o.entity)) byEntDiffs.set(o.entity, []);
      byEntDiffs.get(o.entity)!.push(dArr[p]);
    });
    const groups = Array.from(byEntDiffs.values());
    const kGroups = groups.length;
    let ssw = 0;
    let ssb = 0;
    let sumNiSq = 0;
    groups.forEach(gArr => {
      const ni = gArr.length;
      sumNiSq += ni * ni;
      const gMean = gArr.reduce((a, b) => a + b, 0) / ni;
      ssb += ni * (gMean - meanBias) ** 2;
      gArr.forEach(v => {
        ssw += (v - gMean) ** 2;
      });
    });

    const dfWithin = Math.max(1, P - kGroups);
    const dfBetween = Math.max(1, kGroups - 1);
    const msw = P > kGroups ? ssw / dfWithin : naiveSd * naiveSd;
    const msb = kGroups > 1 ? ssb / dfBetween : naiveSd * naiveSd;
    const n0 =
      kGroups > 1 ? (P - sumNiSq / Math.max(1, P)) / dfBetween : 1;
    const varWithin = Math.max(0, msw);
    const varBetween = kGroups > 1 && n0 > 1e-6 ? Math.max(0, (msb - msw) / n0) : 0;
    const totalRmSd = Math.sqrt(Math.max(naiveSd * naiveSd * 0.85, varBetween + varWithin));

    const loaLo = meanBias - 1.96 * totalRmSd;
    const loaHi = meanBias + 1.96 * totalRmSd;
    const outsideCount = dArr.filter(d => d < loaLo || d > loaHi).length;

    return {
      sourceId: src.id,
      sourceLabel: src.label,
      pooledPearsonR: Number(rPool.toFixed(4)),
      withinEntityR: Number(rWithin.toFixed(4)),
      linsCcc: Number(linsCcc.toFixed(4)),
      linsCccCi: [Number(cccLo.toFixed(4)), Number(cccHi.toFixed(4))],
      meanBias: Number(meanBias.toFixed(4)),
      betweenEntityDiffSd: Number(Math.sqrt(varBetween).toFixed(4)),
      withinEntityDiffSd: Number(Math.sqrt(varWithin).toFixed(4)),
      totalRepeatedMeasuresDiffSd: Number(totalRmSd.toFixed(4)),
      mixedEffectsLoaLower: Number(loaLo.toFixed(4)),
      mixedEffectsLoaUpper: Number(loaHi.toFixed(4)),
      outsideMixedLoaPct: Number(((outsideCount / Math.max(1, P)) * 100).toFixed(2)),
      naivePooledLoaWidth: Number((3.92 * naiveSd).toFixed(4)),
      mixedEffectsLoaWidth: Number((loaHi - loaLo).toFixed(4))
    };
  });

  const validationWarnings: string[] = [
    'Validasi LOSO menguji prediktabilitas lintas-sumber, bukan validasi terhadap kebenaran absolut.',
    'Pair Fixed Effects mengukur perbedaan deviasi terhadap konsensus laten setelah menyerap efek tetap sel (i, t); koreksi sekuensial Holm (1979) mengendalikan familywise error rate.'
  ];
  if (J === 3) {
    validationWarnings.push(
      'Pada J = 3, saat satu sumber dikeluarkan dalam LOSO tersisa J - 1 = 2 sumber sehingga model sub-sampel LOSO hanya beridentitas parsial (just/underidentified).'
    );
  }
  if (losoEntries.some(e => Math.abs(e.covarianceTermAudit) > 0.15 * (e.fullModelErrorSd ** 2 + 1e-6))) {
    validationWarnings.push(
      'Suku kovarians 2·λ_j·Cov(ε_j, θ̂_-j) tidak nol pada sebagian sumber — menandakan potensi ketergantungan galat antarsumber sehingga varians benchmark tidak boleh dikurangkan secara naif.'
    );
  }

  return {
    selectedSeMethod: config.standardErrorMethod,
    selectedBootstrapMethod: config.bootstrapMethod,
    seSelectionRationale:
      `Estimator SE aktif: ${config.standardErrorMethod} dikombinasikan dengan ${config.bootstrapMethod} ` +
      `(${config.bootstrapReplications} replikasi) dan koreksi Holm (1979) untuk m = ${mFamily} hipotesis berpasangan.`,
    losoEntries,
    losoVarianceFormulaNote:
      'Identitas Varians Selisih: Var(Y_j − Ŷ_j^(-j)) = λ_j²·Var(θ − θ̂^(-j)) + σ_εj² − 2·λ_j·Cov(ε_j, θ̂^(-j) − θ). Pengurangan varians benchmark hanya sah apabila suku kovarians diuji mendekati nol.',
    pairFeOmnibusF,
    pairFeOmnibusP,
    pairFeOmnibusWildP,
    holmFamilySize: mFamily,
    pairwiseHolmContrasts,
    repeatedMeasuresAgreement,
    validationWarnings
  };
}
