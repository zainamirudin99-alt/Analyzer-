// ============================================================
// Comparative Measurement Accuracy Assessment — Wild Cluster Bootstrap
// Rademacher (+1 / -1) City-Level Cluster Bootstrap for Pair Contrasts
// and Omnibus F Test when Cluster Count G is Small (Cameron, Gelbach & Miller 2008)
// ============================================================

export interface WildBootstrapContrastOutput {
  pValue: number;
  ciLower: number;
  ciUpper: number;
}

class DeterministicRng {
  private state: number;
  constructor(seed = 20261116) {
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  rademacher(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}

/**
 * Run Rademacher Wild Cluster Bootstrap (clustered by City ID) for a pairwise
 * difference vector d_p = AE_{p,A} - AE_{p,B} across P complete-case pairs.
 * Returns bootstrap two-sided p-value (for H0: E[d] = 0) and 95% percentile-t / wild CI.
 */
export function runWildClusterBootstrapPairDiff(
  items: Array<{ city: string; diff: number }>,
  replications = 999,
  seed = 20261116
): WildBootstrapContrastOutput {
  const P = items.length;
  if (P < 2) {
    return { pValue: 1, ciLower: 0, ciUpper: 0 };
  }

  const obsMean = items.reduce((s, x) => s + x.diff, 0) / P;

  // Group centered residuals u_p = diff_p - obsMean and raw diffs (under H0: diff_p) by city cluster
  const cityGroups = new Map<string, { rawSum: number; centeredSum: number; count: number }>();
  items.forEach(it => {
    const cur = cityGroups.get(it.city) || { rawSum: 0, centeredSum: 0, count: 0 };
    cur.rawSum += it.diff;
    cur.centeredSum += it.diff - obsMean;
    cur.count += 1;
    cityGroups.set(it.city, cur);
  });

  const clusters = Array.from(cityGroups.values());
  const G = clusters.length;
  if (G < 2) {
    return { pValue: 1, ciLower: obsMean, ciUpper: obsMean };
  }

  const dofFactor = (G / (G - 1)) * ((P - 1) / P);
  let obsMeat = 0;
  clusters.forEach(c => {
    obsMeat += c.centeredSum * c.centeredSum;
  });
  const obsSe = Math.sqrt(Math.max(1e-16, (dofFactor * obsMeat) / (P * P)));
  const obsAbsT = obsSe > 1e-12 ? Math.abs(obsMean / obsSe) : 0;

  if (obsAbsT < 1e-12) {
    return { pValue: 1, ciLower: obsMean, ciUpper: obsMean };
  }

  const rng = new DeterministicRng(seed);
  let exceedCount = 0;
  const bootMeans: number[] = [];

  for (let b = 0; b < replications; b++) {
    let sumNull = 0;
    let sumCentered = 0;
    const weights = new Array<number>(G);
    for (let g = 0; g < G; g++) {
      const w = rng.rademacher();
      weights[g] = w;
      // Impose H0: E[d] = 0 via centered residual wild perturbation u*_g = w_g * centeredSum_g
      sumNull += w * clusters[g].centeredSum;
      sumCentered += w * clusters[g].centeredSum;
    }

    const meanStarNull = sumNull / P;
    let meatStar = 0;
    for (let g = 0; g < G; g++) {
      const scoreG = weights[g] * clusters[g].centeredSum - clusters[g].count * meanStarNull;
      meatStar += scoreG * scoreG;
    }
    const seStar = Math.sqrt(Math.max(1e-16, (dofFactor * meatStar) / (P * P)));
    const absTStar = seStar > 1e-12 ? Math.abs(meanStarNull / seStar) : 0;

    if (absTStar >= obsAbsT - 1e-12) {
      exceedCount++;
    }

    bootMeans.push(obsMean + sumCentered / P);
  }

  bootMeans.sort((a, b) => a - b);
  const loIdx = Math.max(0, Math.floor(0.025 * (bootMeans.length - 1)));
  const hiIdx = Math.min(bootMeans.length - 1, Math.ceil(0.975 * (bootMeans.length - 1)));

  return {
    pValue: (exceedCount + 1) / (replications + 1),
    ciLower: bootMeans[loIdx],
    ciUpper: bootMeans[hiIdx]
  };
}
