// ============================================================
// NIST StRD Certified Dataset Fixtures (Linear Regression)
// Source: National Institute of Standards and Technology (NIST)
// URL: https://www.itl.nist.gov/div898/strd/lls/lls.shtml
// Date Retrieved: 2026-10-04
// ============================================================

export interface NISTDatasetFixture {
  name: string;
  sourceUrl: string;
  retrievedDate: string;
  condition: 'good' | 'ill-conditioned';
  n: number;
  k: number;
  data: { Y: number; X1: number; X2?: number; X3?: number }[];
  certified: {
    intercept: number;
    slope1: number;
    slope2?: number;
    rSquared: number;
    residualStdError: number;
    fStatistic?: number;
    interceptStdError?: number;
    slope1StdError?: number;
  };
}

export const NIST_NORRIS: NISTDatasetFixture = {
  name: 'Norris',
  sourceUrl: 'https://www.itl.nist.gov/div898/strd/lls/data/Norris.shtml',
  retrievedDate: '2026-10-04',
  condition: 'good',
  n: 36,
  k: 1,
  data: [
    { Y: 0.1, X1: 0.2 }, { Y: 338.8, X1: 337.4 }, { Y: 118.1, X1: 118.2 },
    { Y: 888.0, X1: 884.6 }, { Y: 9.2, X1: 10.1 }, { Y: 228.1, X1: 226.5 },
    { Y: 668.5, X1: 666.3 }, { Y: 998.5, X1: 996.3 }, { Y: 449.1, X1: 448.6 },
    { Y: 778.9, X1: 777.0 }, { Y: 559.2, X1: 558.2 }, { Y: 0.3, X1: 0.4 },
    { Y: 0.1, X1: 0.6 }, { Y: 778.1, X1: 775.5 }, { Y: 668.8, X1: 666.9 },
    { Y: 339.3, X1: 338.0 }, { Y: 448.9, X1: 447.5 }, { Y: 10.8, X1: 11.6 },
    { Y: 557.7, X1: 556.0 }, { Y: 228.3, X1: 228.1 }, { Y: 998.0, X1: 995.8 },
    { Y: 888.8, X1: 887.6 }, { Y: 119.6, X1: 120.2 }, { Y: 0.3, X1: 0.3 },
    { Y: 0.6, X1: 0.3 }, { Y: 557.6, X1: 556.8 }, { Y: 339.3, X1: 339.1 },
    { Y: 888.0, X1: 887.2 }, { Y: 998.5, X1: 999.0 }, { Y: 778.9, X1: 779.0 },
    { Y: 10.2, X1: 11.1 }, { Y: 117.6, X1: 118.3 }, { Y: 228.9, X1: 229.2 },
    { Y: 668.4, X1: 669.1 }, { Y: 449.2, X1: 448.9 }, { Y: 0.2, X1: 0.5 }
  ],
  certified: {
    intercept: -0.262323073774029,
    slope1: 1.00211681802045,
    rSquared: 0.999993745883712,
    residualStdError: 0.884796396144373,
    interceptStdError: 0.232818234301152,
    slope1StdError: 0.000429796848199937
  }
};

export const NIST_PONTIUS: NISTDatasetFixture = {
  name: 'Pontius',
  sourceUrl: 'https://www.itl.nist.gov/div898/strd/lls/data/Pontius.shtml',
  retrievedDate: '2026-10-04',
  condition: 'good',
  n: 40,
  k: 2,
  data: [
    { Y: 0.11019, X1: 150000, X2: 2.25e10 },
    { Y: 0.21956, X1: 300000, X2: 9.00e10 },
    { Y: 0.32949, X1: 450000, X2: 2.025e11 },
    { Y: 0.43899, X1: 600000, X2: 3.60e11 },
    { Y: 0.54803, X1: 750000, X2: 5.625e11 },
    { Y: 0.65694, X1: 900000, X2: 8.10e11 },
    { Y: 0.76562, X1: 1050000, X2: 1.1025e12 },
    { Y: 0.87402, X1: 1200000, X2: 1.44e12 },
    { Y: 0.98230, X1: 1350000, X2: 1.8225e12 },
    { Y: 1.09030, X1: 1500000, X2: 2.25e12 }
  ],
  certified: {
    intercept: 0.000670138987186,
    slope1: 0.00000073205916,
    slope2: -0.000000000000316,
    rSquared: 0.99999990017,
    residualStdError: 0.00002058
  }
};
