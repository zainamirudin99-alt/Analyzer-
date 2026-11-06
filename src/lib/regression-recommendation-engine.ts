// ============================================================
// Statistical Recommendation Engine (Tahap 3)
// Rule-based, explicit, scientifically grounded recommendations
// for all regression classical assumption tests and model diagnostics.
// ============================================================

import { OLSFitResult } from './regression-engine';

export interface MethodologicalConsequences {
  coefficientsChange: boolean;
  coefficientsDetail: string;
  standardErrorChange: boolean;
  standardErrorDetail: string;
  pValueChange: boolean;
  pValueDetail: string;
  sampleSizeChange: boolean;
  sampleSizeDetail: string;
  interpretationChange: boolean;
  interpretationDetail: string;
}

export interface RecommendationAlternative {
  id: string;
  name: string;
  description: string;
  applicability: string;
  consequences: MethodologicalConsequences;
  remedialType?: string;
}

export interface StatisticalRecommendationCard {
  id: string;
  category:
    | 'normality'
    | 'multicollinearity'
    | 'heteroskedasticity'
    | 'autocorrelation'
    | 'stationarity'
    | 'outlier'
    | 'specification'
    | 'sample_size';
  testName: string;
  statistic: number;
  statisticName: string;
  pValue?: number;
  alpha: number;
  h0Decision: 'Tolak H0' | 'Gagal Tolak H0' | 'Tidak Berlaku';
  status: 'LULUS' | 'PELANGGARAN' | 'WASPADA' | 'TIDAK BERLAKU';
  interpretation: string;
  potentialCauses: string[];
  modelImpact: string;
  primaryRecommendation: string;
  alternativeMethods: RecommendationAlternative[];
  methodologicalConsequences: MethodologicalConsequences;
  availableActions: {
    canApply: boolean;
    remedialType?: string;
    actionLabel: string;
    explanationText: string;
  };
}

export interface RecommendationEngineOutput {
  cards: StatisticalRecommendationCard[];
  summary: {
    totalAssumptions: number;
    passedAssumptions: number;
    violatedAssumptions: number;
    warningAssumptions: number;
    overallHealth: 'EXCELLENT' | 'GOOD' | 'NEEDS_REMEDIAL' | 'CRITICAL';
    healthScore: number; // 0 - 100
    topPriorityActions: string[];
  };
}

/**
 * Generate comprehensive, explicit statistical recommendation cards
 * for every diagnostic test in the regression model.
 */
export function generateStatisticalRecommendations(
  result: OLSFitResult,
  options?: {
    rawY?: number[];
    rawX?: number[][];
    isTimeSeries?: boolean;
    alpha?: number;
  }
): RecommendationEngineOutput {
  const alpha = options?.alpha ?? 0.05;
  const isTS = options?.isTimeSeries ?? result.timeSeriesSummary?.isTimeSeries ?? false;
  const n = result.sampleSize.nUsed;
  const k = result.kPredictors;
  const cards: StatisticalRecommendationCard[] = [];

  // Helper to find assumption by name
  const findAssump = (keyword: string) =>
    result.assumptions.find((a) => a.name.toLowerCase().includes(keyword.toLowerCase()));

  // ==========================================================
  // 1. NORMALITAS RESIDUAL
  // ==========================================================
  const normAssump = findAssump('normalitas') || findAssump('shapiro');
  if (normAssump) {
    const isSampleLarge = n > 50;
    const isPass = normAssump.status === 'lulus';
    const isWarning = !isPass && isSampleLarge;
    const statVal = normAssump.statistic;
    const pVal = normAssump.pValue ?? 0.05;

    cards.push({
      id: 'rec_normality',
      category: 'normality',
      testName: normAssump.name,
      statistic: statVal,
      statisticName: isSampleLarge ? 'Lilliefors D' : 'Shapiro-Wilk W',
      pValue: pVal,
      alpha,
      h0Decision: pVal < alpha ? 'Tolak H0' : 'Gagal Tolak H0',
      status: isPass ? 'LULUS' : (isWarning ? 'WASPADA' : 'PELANGGARAN'),
      interpretation: isPass
        ? `Residual terdistribusi normal secara statistik (p = ${pVal.toFixed(3)} >= alpha ${alpha}). Asumsi normalitas untuk inferensi eksak terpenuhi.`
        : `Residual tidak berdistribusi normal (p = ${pVal.toFixed(3)} < alpha ${alpha}). Terdapat skewness atau kurtosis berlebih pada galat residual.`,
      potentialCauses: [
        'Keberadaan pencilan (outliers) atau observasi ekstrem pada variabel dependen atau independen.',
        'Spesifikasi bentuk fungsional yang kurang tepat (misal hubungan non-linear yang dipaksakan linear).',
        'Distribusi data asli memiliki skewness teoretis tinggi (misal pendapatan, aset, emisi karbon).',
        'Kesalahan input data atau kesalahan perekaman titik desimal.'
      ],
      modelImpact: isSampleLarge
        ? `Pada sampel berukuran n = ${n} (n > 50), Teorema Limit Pusat (CLT) berlaku: distribusi sampling koefisien OLS mendekati normal secara asimtotik. Estimator OLS tetap Tidak Bias dan Terbaik (BLUE). Pelanggaran normalitas residual tidak membatalkan estimasi koefisien, namun interval keyakinan eksak sampel kecil sedikit terpengaruh.`
        : `Pada sampel kecil (n = ${n} <= 50), pelanggaran normalitas dapat mendistorsi nilai p-value dan interval keyakinan uji t/F eksak. Koefisien OLS tetap tidak bias, namun efisiensi inferensi berkurang.`,
      primaryRecommendation: isPass
        ? 'Pertahankan model OLS baseline (M0). Tidak diperlukan transformasi data.'
        : (isSampleLarge
          ? 'Pertahankan model baseline M0 dengan mencantumkan justifikasi Teorema Limit Pusat (CLT) untuk sampel n > 50. Periksa kemungkinan outlier sebelum mempertimbangkan transformasi.'
          : 'Lakukan evaluasi pencilan (outliers), dan jika diperlukan, uji transformasi non-linear sah seperti Box-Cox atau Log natural.'),
      alternativeMethods: [
        {
          id: 'trans_boxcox',
          name: 'Transformasi Box-Cox / Logaritma Natural',
          description: 'Mencari parameter lambda optimal untuk menstabilkan varians dan mendekatkan residual ke distribusi normal.',
          applicability: 'Hanya berlaku jika seluruh nilai Y > 0 (numerik positif kontinu).',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Koefisien berubah mencerminkan elastisitas atau perubahan pada skala transformasi.',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error dihitung pada skala baru.',
            pValueChange: true,
            pValueDetail: 'p-value berubah sesuai struktur varians baru.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel tetap sama (tidak ada data dibuang).',
            interpretationChange: true,
            interpretationDetail: 'Interpretasi berubah dari satuan asli menjadi persentase atau pangkat lambda.'
          },
          remedialType: 'transformation'
        },
        {
          id: 'bootstrap_ci',
          name: 'Bootstrap BCa (Bias-Corrected and Accelerated) Resampling',
          description: 'Melakukan resampling residual atau kasus sebanyak B = 2000 kali untuk menghasilkan interval keyakinan empiris bebas asumsi distribusi normal.',
          applicability: 'Berlaku universal untuk semua jenis data tanpa mengubah skala variabel.',
          consequences: {
            coefficientsChange: false,
            coefficientsDetail: 'Koefisien titik OLS baseline tetap 100% identik.',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error digantikan oleh deviasi standar distribusi bootstrap.',
            pValueChange: true,
            pValueDetail: 'p-value dihitung dari persentil empiris bootstrap.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel asli tidak berubah.',
            interpretationChange: false,
            interpretationDetail: 'Interpretasi koefisien tetap pada satuan asli variabel.'
          },
          remedialType: 'bootstrap'
        },
        {
          id: 'robust_rlm',
          name: 'Robust Regression (M-Estimation Huber / Tukey Bisquare)',
          description: 'Mengestimasi parameter regresi dengan membobot ulang observasi yang memiliki residual besar menggunakan fungsi loss Huber.',
          applicability: 'Direkomendasikan jika non-normalitas dipicu oleh kontaminasi outlier.',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Koefisien diestimasi dengan Iteratively Reweighted Least Squares (IRLS).',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error asimtotik berbasis fungsi pengaruh Huber.',
            pValueChange: true,
            pValueDetail: 'Uji signifikansi berbasis bobot robust.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Semua observasi dipertahankan dengan pembobotan adaptif.',
            interpretationChange: false,
            interpretationDetail: 'Interpretasi tetap pada skala asli variabel.'
          },
          remedialType: 'robust_rlm'
        }
      ],
      methodologicalConsequences: {
        coefficientsChange: false,
        coefficientsDetail: 'Diagnostik normalitas tidak mengubah koefisien OLS.',
        standardErrorChange: false,
        standardErrorDetail: 'Standard error OLS analitik tetap sama.',
        pValueChange: false,
        pValueDetail: 'p-value analitik OLS tetap sama.',
        sampleSizeChange: false,
        sampleSizeDetail: 'Tidak ada observasi yang diubah pada tahap diagnostik.',
        interpretationChange: false,
        interpretationDetail: 'Interpretasi M0 tetap konfirmatori.'
      },
      availableActions: {
        canApply: !isPass,
        remedialType: isSampleLarge ? 'bootstrap' : 'transformation',
        actionLabel: isSampleLarge ? 'Terapkan Bootstrap BCa' : 'Terapkan Transformasi Box-Cox',
        explanationText: 'Pilih metode perbaikan yang sah tanpa menghapus model awal M0.'
      }
    });
  }

  // ==========================================================
  // 2. MULTIKOLINEARITAS (VIF & TOLERANCE)
  // ==========================================================
  const multicolAssump = findAssump('multikolinearitas') || findAssump('vif');
  if (multicolAssump && k > 1) {
    const maxVif = Math.max(...result.coefficients.filter(c => c.variable !== '(Constant)').map(c => c.collinearity?.vif || 1));
    const isPass = maxVif <= 5;
    const isWarning = maxVif > 5 && maxVif <= 10;

    cards.push({
      id: 'rec_multicollinearity',
      category: 'multicollinearity',
      testName: 'Multikolinearitas (Variance Inflation Factor & Tolerance)',
      statistic: maxVif,
      statisticName: 'Maximum VIF',
      pValue: undefined,
      alpha,
      h0Decision: maxVif > 10 ? 'Tolak H0' : (maxVif > 5 ? 'Gagal Tolak H0' : 'Gagal Tolak H0'),
      status: maxVif <= 5 ? 'LULUS' : (maxVif <= 10 ? 'WASPADA' : 'PELANGGARAN'),
      interpretation: maxVif <= 5
        ? `Seluruh prediktor memiliki VIF <= 5.0 (VIF Maksimum = ${maxVif.toFixed(2)}). Tidak terindikasi masalah multikolinearitas yang membahayakan model.`
        : (maxVif <= 10
          ? `Terdapat prediktor dengan VIF moderat antara 5.0 - 10.0 (VIF Maksimum = ${maxVif.toFixed(2)}). Diperlukan kewaspadaan terhadap inflasi varians.`
          : `Terjadi multikolinearitas tinggi (VIF Maksimum = ${maxVif.toFixed(2)} > 10.0, Tolerance < 0.10). Dua atau lebih prediktor saling berkorelasi linear sangat kuat.`),
      potentialCauses: [
        'Dua variabel independen mengukur konstruk laten atau fenomena ekonomi yang hampir identik.',
        'Salah spesifikasi model dummy trap (memasukkan seluruh kategori tanpa reference group).',
        'Adanya variabel interaksi atau polinomial (X dan X^2) yang belum di-centering terhadap rata-rata.',
        'Ukuran sampel n relatif kecil dibandingkan korelasi antarvariabel dalam populasi.'
      ],
      modelImpact: `Multikolinearitas meningkatkan varians kovarians koefisien: Var(beta_j) = sigma^2 / [(1 - R_j^2) sum(X_ij - X_bar)^2]. Akibatnya, Standard Error membengkak, interval keyakinan melebar, nilai t-hitung mengecil, dan variabel yang secara teoretis penting tampak tidak signifikan secara statistik. Namun, multikolinearitas TIDAK menyebabkan bias pada koefisien OLS dan TIDAK mengurangi daya prediksi overall R^2 model.`,
      primaryRecommendation: maxVif <= 5
        ? 'Pertahankan seluruh prediktor pada model M0.'
        : (maxVif <= 10
          ? 'Evaluasi korelasi bivariat Pearson antar prediktor. Jika kedua variabel memiliki landasan teoretis terpisah yang kokoh, pertahankan keduanya dengan mencatat batas VIF moderat.'
          : 'Lakukan evaluasi teoritis mendalam. Jangan menghapus variabel secara sembarangan semata-mata demi menurunkan VIF. Pertimbangkan penggabungan konstruk, centering, atau regresi teratur (Ridge).'),
      alternativeMethods: [
        {
          id: 'centering_x',
          name: 'Mean-Centering pada Prediktor',
          description: 'Mengurangi setiap nilai prediktor dengan rata-ratanya: X*_i = X_i - X_bar. Sangat efektif untuk model interaksi atau polinomial.',
          applicability: 'Sangat direkomendasikan jika multikolinearitas berasal dari suku interaksi (X1*X2) atau pangkat (X^2).',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Koefisien utama menyesuaikan titik nol baru (pada rata-rata sampel), koefisien interaksi tetap.',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error koefisien utama mengecil secara signifikan.',
            pValueChange: true,
            pValueDetail: 'Signifikansi uji t parsial meningkat.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel tetap sama.',
            interpretationChange: true,
            interpretationDetail: 'Konstanta dan efek utama diinterpretasikan pada rata-rata variabel.'
          },
          remedialType: 'orthog'
        },
        {
          id: 'pca_composite',
          name: 'Principal Component Analysis (PCA) / Konstruk Komposit',
          description: 'Mereduksi variabel-variabel yang berkolinier kuat menjadi satu indeks komposit ortogonal berbasis komponen utama pertama (PC1).',
          applicability: 'Cocok jika variabel-variabel tersebut merupakan indikator dari konstruk yang sama.',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Regresi dijalankan pada skor faktor komposit ortogonal.',
            standardErrorChange: true,
            standardErrorDetail: 'VIF berkurang drastis menjadi 1.0 (karena komponen ortogonal).',
            pValueChange: true,
            pValueDetail: 'Uji signifikansi menjadi sangat tajam.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel tetap sama.',
            interpretationChange: true,
            interpretationDetail: 'Koefisien diinterpretasikan sebagai pengaruh per satuan indeks gabungan.'
          },
          remedialType: 'pca'
        },
        {
          id: 'theory_drop',
          name: 'Penyisihan Variabel Berbasis Landasan Teori',
          description: 'Menyisihkan salah satu variabel yang redundan hanya jika teori ilmiah mendukung bahwa satu variabel sudah mewakili dimensi variabel lainnya.',
          applicability: 'Hanya jika disetujui peneliti dan memiliki rujukan literatur yang jelas.',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Koefisien variabel yang tersisa akan menyerap efek variabel yang disisihkan.',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error variabel yang tersisa menurun.',
            pValueChange: true,
            pValueDetail: 'p-value berubah.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel tetap sama.',
            interpretationChange: true,
            interpretationDetail: 'Interpretasi berubah karena spesifikasi model berubah.'
          },
          remedialType: 'collinearity_drop'
        }
      ],
      methodologicalConsequences: {
        coefficientsChange: false,
        coefficientsDetail: 'Diagnostik multikolinearitas tidak mengubah koefisien OLS.',
        standardErrorChange: false,
        standardErrorDetail: 'Standard error OLS baseline tetap sama.',
        pValueChange: false,
        pValueDetail: 'p-value analitik OLS tetap sama.',
        sampleSizeChange: false,
        sampleSizeDetail: 'Tidak ada observasi yang diubah.',
        interpretationChange: false,
        interpretationDetail: 'Model M0 tetap dipertahankan.'
      },
      availableActions: {
        canApply: maxVif > 5,
        remedialType: 'orthog',
        actionLabel: 'Terapkan Ortogonalisasi / Centering',
        explanationText: 'Mengurangi korelasi antarprediktor tanpa membuang variabel dari spesifikasi model.'
      }
    });
  }

  // ==========================================================
  // 3. HETEROSKEDASTISITAS (BREUSCH-PAGAN, WHITE, GLEJSER)
  // ==========================================================
  const heteroAssump = findAssump('homoskedastisitas') || findAssump('breusch') || findAssump('white');
  if (heteroAssump) {
    const isPass = heteroAssump.status === 'lulus';
    const statVal = heteroAssump.statistic;
    const pVal = heteroAssump.pValue ?? 0.05;

    cards.push({
      id: 'rec_heteroskedasticity',
      category: 'heteroskedasticity',
      testName: heteroAssump.name,
      statistic: statVal,
      statisticName: 'LM / Breusch-Pagan Stat',
      pValue: pVal,
      alpha,
      h0Decision: pVal < alpha ? 'Tolak H0' : 'Gagal Tolak H0',
      status: isPass ? 'LULUS' : 'PELANGGARAN',
      interpretation: isPass
        ? `Varian galat residual bersifat konstan (homoskedastis, p = ${pVal.toFixed(3)} >= alpha ${alpha}). Asumsi Gauss-Markov homoskedastisitas terpenuhi.`
        : `Terdeteksi heteroskedastisitas (p = ${pVal.toFixed(3)} < alpha ${alpha}). Varian residual tidak konstan di seluruh rentang nilai prediksi.`,
      potentialCauses: [
        'Adanya disparitas skala besar antar subjek observasi (misal perusahaan skala konglomerasi vs UMKM).',
        'Kesalahan spesifikasi bentuk fungsional (misal mengabaikan hubungan kuadratik atau elastisitas persentase).',
        'Kualitas pengukuran variabel berubah seiring bertambahnya besaran nilai variabel dependen.',
        'Keberadaan pencilan residual leverage tinggi.'
      ],
      modelImpact: `Heteroskedastisitas TIDAK membuat koefisien OLS menjadi bias atau inkonsisten. Nilai estimasi koefisien b tetap tidak bias. Namun, estimator matriks varians kovarians standar OLS [s^2 (X^T X)^(-1)] menjadi bias dan inkonsisten, sehingga Standard Error OLS konvensional meremehkan atau melebih-lebihkan varians riil. Akibatnya, nilai t-statistik dan p-value menjadi tidak valid untuk pengujian hipotesis formal.`,
      primaryRecommendation: isPass
        ? 'Pertahankan model OLS baseline (M0).'
        : 'Terapkan koreksi Standard Error Robust HC3 (Davidson-MacKinnon / Long & Ervin, 2000). HC3 merupakan standar emas untuk data cross section karena memberikan ukuran sampel kecil yang sangat andal tanpa mengubah koefisien OLS.',
      alternativeMethods: [
        {
          id: 'robust_hc3',
          name: 'Heteroskedasticity-Consistent Covariance Matrix (HC3)',
          description: 'Mengestimasi matriks kovarians yang kebal heteroskedastisitas menggunakan faktor pembobot (1 - h_ii)^2 dari leverage diagonal matriks hat.',
          applicability: 'Sangat direkomendasikan untuk seluruh analisis regresi Cross Section yang melanggar homoskedastisitas.',
          consequences: {
            coefficientsChange: false,
            coefficientsDetail: 'Koefisien OLS tetap 100% PERSIS SAMA (beta_HC3 = beta_OLS).',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error dikoreksi menjadi robust terhadap varian heteroskedastis.',
            pValueChange: true,
            pValueDetail: 'Nilai t dan p-value disesuaikan secara sah untuk inferensi ilmiah.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel asli utuh.',
            interpretationChange: false,
            interpretationDetail: 'Interpretasi persamaan garis dan besaran koefisien tidak berubah sama sekali.'
          },
          remedialType: 'robust_hc3'
        },
        {
          id: 'wls_estimator',
          name: 'Weighted Least Squares (WLS)',
          description: 'Membobot observasi secara berbanding terbalik dengan estimasi varians residual: w_i = 1 / sigma_i^2.',
          applicability: 'Hanya jika struktur varians heteroskedastisitas dapat dimodelkan secara eksplisit dari variabel penjelas.',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Koefisien OLS berubah karena observasi dengan varians kecil diberi bobot lebih besar.',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error WLS efisien jika bobot benar.',
            pValueChange: true,
            pValueDetail: 'p-value berubah.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel tetap sama.',
            interpretationChange: true,
            interpretationDetail: 'Interpretasi berbasis model berbobot.'
          },
          remedialType: 'wls'
        },
        {
          id: 'log_trans_hetero',
          name: 'Transformasi Logaritma Variabel Dependen ln(Y)',
          description: 'Menerapkan transformasi log natural untuk mengompresi skala nilai besar dan menstabilkan varians.',
          applicability: 'Berlaku jika heteroskedastisitas meningkat secara proporsional dengan besaran Y (Y > 0).',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Koefisien berubah menjadi semi-elastisitas.',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error dihitung pada skala log.',
            pValueChange: true,
            pValueDetail: 'p-value berubah.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel tetap sama.',
            interpretationChange: true,
            interpretationDetail: 'Interpretasi berubah menjadi persentase perubahan Y per unit kenaikan X.'
          },
          remedialType: 'transformation'
        }
      ],
      methodologicalConsequences: {
        coefficientsChange: false,
        coefficientsDetail: 'Diagnostik heteroskedastisitas tidak mengubah koefisien OLS.',
        standardErrorChange: false,
        standardErrorDetail: 'Standard error OLS baseline tetap sama.',
        pValueChange: false,
        pValueDetail: 'p-value analitik OLS tetap sama.',
        sampleSizeChange: false,
        sampleSizeDetail: 'Tidak ada observasi yang diubah.',
        interpretationChange: false,
        interpretationDetail: 'Model M0 tetap dipertahankan.'
      },
      availableActions: {
        canApply: !isPass,
        remedialType: 'robust_hc3',
        actionLabel: 'Terapkan Robust Standard Errors HC3',
        explanationText: 'Koreksi standard error yang sah tanpa mengubah koefisien model awal M0.'
      }
    });
  }

  // ==========================================================
  // 4. AUTOKORELASI SERIAL (DURBIN-WATSON & BREUSCH-GODFREY)
  // ==========================================================
  const autocorrAssump = findAssump('autokorelasi') || findAssump('durbin') || findAssump('bg');
  if (autocorrAssump) {
    const isPass = autocorrAssump.status === 'lulus';
    const isNA = autocorrAssump.status === 'tidak_berlaku';
    const statVal = autocorrAssump.statistic;
    const pVal = autocorrAssump.pValue;

    if (!isNA) {
      cards.push({
        id: 'rec_autocorrelation',
        category: 'autocorrelation',
        testName: autocorrAssump.name,
        statistic: statVal,
        statisticName: 'Durbin-Watson (d)',
        pValue: pVal,
        alpha,
        h0Decision: (statVal < 1.5 || statVal > 2.5) ? 'Tolak H0' : 'Gagal Tolak H0',
        status: isPass ? 'LULUS' : 'PELANGGARAN',
        interpretation: isPass
          ? `Tidak ditemukan autokorelasi serial yang signifikan pada residual (DW = ${statVal.toFixed(3)}, berada pada rentang aman 1.50 - 2.50). Asumsi independensi residual terpenuhi.`
          : (statVal < 1.5
            ? `Terindikasi autokorelasi positif (DW = ${statVal.toFixed(3)} < 1.50). Galat pada periode t berkorelasi positif dengan galat periode sebelumnya.`
            : `Terindikasi autokorelasi negatif (DW = ${statVal.toFixed(3)} > 2.50). Galat berosilasi secara sistematis antar periode waktu.`),
        potentialCauses: [
          'Ketergantungan waktu (inertia atau momentum) yang tidak terakomodasi dalam variabel independen saat ini.',
          'Dinamika lag variabel: nilai Y periode sekarang dipengaruhi oleh nilai Y atau X periode sebelumnya.',
          'Salah spesifikasi bentuk tren (misal tren non-linear atau efek musiman yang belum dimasukkan).',
          'Pada data cross-section: urutan baris data tidak acak (misal data diurutkan berdasarkan wilayah geografis berdekatan).'
        ],
        modelImpact: `Autokorelasi residual menyebabkan Standard Error OLS konvensional menjadi bias (cenderung terlalu kecil pada autokorelasi positif). Akibatnya, nilai t-hitung menjadi 'terlalu optimis' (inflasi tipe I error), memunculkan signifikansi palsu. Pada data deret waktu murni, autokorelasi residual juga dapat menjadi sinyal regresi lancung (spurious regression).`,
        primaryRecommendation: isPass
          ? 'Pertahankan model baseline M0.'
          : (isTS
            ? 'Terapkan Newey-West HAC (Heteroskedasticity and Autocorrelation Consistent) Standard Errors atau pertimbangkan penambahan lag variabel (Dynamic Regression).'
            : 'Untuk data Cross Section, autokorelasi sering kali merupakan artefak urutan baris. Periksa urutan observasi atau abaikan DW jika data bukan deret waktu.'),
        alternativeMethods: [
          {
            id: 'hac_newey_west',
            name: 'Newey-West HAC Covariance Estimator',
            description: 'Mengoreksi matriks varians kovarians agar konsisten terhadap heteroskedastisitas dan autokorelasi hingga lag q = floor[4(n/100)^(2/9)] menggunakan kernel Bartlett.',
            applicability: 'Wajib dipertimbangkan untuk model regresi deret waktu yang mengalami autokorelasi residual.',
            consequences: {
              coefficientsChange: false,
              coefficientsDetail: 'Koefisien OLS tetap 100% PERSIS SAMA (beta_HAC = beta_OLS).',
              standardErrorChange: true,
              standardErrorDetail: 'Standard error dikoreksi menjadi konsisten terhadap autokorelasi dan heteroskedastisitas.',
              pValueChange: true,
              pValueDetail: 't-stat dan p-value disesuaikan secara ilmiah.',
              sampleSizeChange: false,
              sampleSizeDetail: 'Ukuran sampel tidak berubah.',
              interpretationChange: false,
              interpretationDetail: 'Interpretasi besaran dan arah koefisien tidak berubah.'
            },
            remedialType: 'hac_newey_west'
          },
          {
            id: 'cochrane_orcutt',
            name: 'Prosedur Cochrane-Orcutt AR(1) Quasi-Differencing',
            description: 'Memodelkan galat sebagai proses AR(1): e_t = rho * e_{t-1} + u_t, lalu mentransformasi persamaan menjadi Y_t - rho * Y_{t-1}.',
            applicability: 'Cocok jika korelasi serial residual didominasi oleh proses autoregresif orde pertama.',
            consequences: {
              coefficientsChange: true,
              coefficientsDetail: 'Koefisien diestimasi ulang pada data quasi-differenced.',
              standardErrorChange: true,
              standardErrorDetail: 'Standard error menurun dan efisiensi meningkat jika rho akurat.',
              pValueChange: true,
              pValueDetail: 'p-value berubah.',
              sampleSizeChange: true,
              sampleSizeDetail: 'Kehilangan 1 observasi pertama (n_effective = n - 1).',
              interpretationChange: false,
              interpretationDetail: 'Interpretasi tetap pada hubungan struktural jangka pendek/panjang.'
            },
            remedialType: 'cochrane_orcutt'
          },
          {
            id: 'lag_dependent',
            name: 'Penambahan Lag Variabel (Autoregressive Distributed Lag / ARDL)',
            description: 'Memasukkan lag Y_{t-1} atau lag prediktor X_{t-1} ke dalam model regresi untuk menangkap dinamika memori waktu.',
            applicability: 'Solusi metodologis terbaik jika proses riil secara teoritis memiliki dinamika waktu bertahap.',
            consequences: {
              coefficientsChange: true,
              coefficientsDetail: 'Spesifikasi model berubah menjadi model dinamis.',
              standardErrorChange: true,
              standardErrorDetail: 'Standard error disesuaikan.',
              pValueChange: true,
              pValueDetail: 'p-value berubah.',
              sampleSizeChange: true,
              sampleSizeDetail: 'Kehilangan observasi sebanyak jumlah lag yang digunakan.',
              interpretationChange: true,
              interpretationDetail: 'Dapat membedakan efek jangka pendek (short-run) dan efek jangka panjang (long-run multiplier).'
            },
            remedialType: 'arx_lag'
          }
        ],
        methodologicalConsequences: {
          coefficientsChange: false,
          coefficientsDetail: 'Diagnostik autokorelasi tidak mengubah koefisien OLS.',
          standardErrorChange: false,
          standardErrorDetail: 'Standard error OLS baseline tetap sama.',
          pValueChange: false,
          pValueDetail: 'p-value analitik OLS tetap sama.',
          sampleSizeChange: false,
          sampleSizeDetail: 'Tidak ada observasi yang diubah.',
          interpretationChange: false,
          interpretationDetail: 'Model M0 tetap dipertahankan.'
        },
        availableActions: {
          canApply: !isPass && isTS,
          remedialType: 'hac_newey_west',
          actionLabel: 'Terapkan Newey-West HAC Standard Errors',
          explanationText: 'Koreksi kovarians yang konsisten terhadap autokorelasi dan heteroskedastisitas.'
        }
      });
    }
  }

  // ==========================================================
  // 5. STASIONERITAS & SPURIOUS REGRESSION (TIME SERIES)
  // ==========================================================
  if (isTS) {
    const isSpurious = result.timeSeriesSummary?.isSpuriousWarning ?? false;
    const r2 = result.modelSummary.rSquared;
    const dw = result.modelSummary.durbinWatson;

    cards.push({
      id: 'rec_stationarity',
      category: 'stationarity',
      testName: 'Stasioneritas Deret Waktu & Peringatan Regresi Lancung (Spurious Regression)',
      statistic: dw,
      statisticName: 'Durbin-Watson vs R²',
      pValue: undefined,
      alpha,
      h0Decision: isSpurious ? 'Tolak H0' : 'Gagal Tolak H0',
      status: isSpurious ? 'PELANGGARAN' : 'LULUS',
      interpretation: isSpurious
        ? `PERINGATAN REGRESI LANCUNG: Nilai R² (${r2.toFixed(3)}) melampaui nilai Durbin-Watson (${dw.toFixed(3)}). Kondisi R² > DW merupakan tanda klasik bahwa korelasi tinggi terjadi semu akibat tren bersama pada deret non-stasioner I(1).`
        : `Model deret waktu tidak menunjukkan tanda regresi lancung (R² = ${r2.toFixed(3)} < DW = ${dw.toFixed(3)}). Residual berada dalam batas kestabilan operasional.`,
      potentialCauses: [
        'Variabel dependen dan independen sama-sama memiliki tren deterministik atau stokastik yang meningkat seiring waktu.',
        'Data deret waktu belum diuji akar unit (unit root) dan mengandung proses non-stasioner I(1).',
        'Tidak adanya mekanisme kointegrasi riil di antara variabel yang diregresikan.'
      ],
      modelImpact: `Regresi lancung memberikan ilusi hubungan yang sangat signifikan (t-hitung besar, R² tinggi, p-value < 0.001), padahal secara nyata variabel-variabel tersebut tidak saling berhubungan sebab-akibat, melainkan hanya bergerak searah mengikuti tren waktu. Inferensi regresi OLS level pada data non-stasioner tanpa kointegrasi adalah TIDAK VALID.`,
      primaryRecommendation: isSpurious
        ? 'Lakukan pengujian kointegrasi Engle-Granger. Jika terkointegrasi, hubungan jangka panjang sah. Jika tidak terkointegrasi, terapkan differencing pertama (First Difference) Delta Y_t dan Delta X_t.'
        : 'Pertahankan model deret waktu level dengan tetap memeriksa stasioneritas residual via ADF.',
      alternativeMethods: [
        {
          id: 'first_diff',
          name: 'First Difference Transformation [Delta Y_t, Delta X_t]',
          description: 'Mentransformasi seluruh deret waktu menjadi perubahan antar waktu: Delta Y_t = Y_t - Y_{t-1} dan Delta X_t = X_t - X_{t-1}.',
          applicability: 'Wajib jika variabel non-stasioner I(1) dan tidak terbukti kointegrasi.',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Koefisien mengukur hubungan antar laju perubahan jangka pendek.',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error menjadi valid bebas regresi lancung.',
            pValueChange: true,
            pValueDetail: 'p-value mencerminkan signifikansi hubungan perubahan riil.',
            sampleSizeChange: true,
            sampleSizeDetail: 'Kehilangan 1 observasi (n_effective = n - 1).',
            interpretationChange: true,
            interpretationDetail: 'Konstanta menjadi laju tren pertumbuhan (drift).'
          },
          remedialType: 'first_difference'
        },
        {
          id: 'cointegration_ecm',
          name: 'Model Kointegrasi & Error Correction Model (ECM)',
          description: 'Jika residual OLS level terbukti stasioner I(0), hubungan jangka panjang dipertahankan dan ditambahkan suku koreksi kesalahan (Error Correction Term).',
          applicability: 'Hanya jika uji Engle-Granger menunjukkan p < 0.05 pada residual level.',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Memuat koefisien jangka panjang dan kecepatan penyesuaian (speed of adjustment).',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error terestimasi secara konsisten.',
            pValueChange: true,
            pValueDetail: 'p-value valid.',
            sampleSizeChange: true,
            sampleSizeDetail: 'Kehilangan 1 observasi.',
            interpretationChange: true,
            interpretationDetail: 'Mampu menjelaskan ekuilibrium jangka panjang dan fluktuasi jangka pendek.'
          }
        }
      ],
      methodologicalConsequences: {
        coefficientsChange: false,
        coefficientsDetail: 'Diagnostik stasioneritas tidak mengubah koefisien OLS.',
        standardErrorChange: false,
        standardErrorDetail: 'Standard error OLS baseline tetap sama.',
        pValueChange: false,
        pValueDetail: 'p-value analitik OLS tetap sama.',
        sampleSizeChange: false,
        sampleSizeDetail: 'Tidak ada observasi yang diubah.',
        interpretationChange: false,
        interpretationDetail: 'Model M0 tetap dipertahankan.'
      },
      availableActions: {
        canApply: isSpurious,
        remedialType: 'first_difference',
        actionLabel: 'Terapkan First Difference (Delta Y, Delta X)',
        explanationText: 'Mengeliminasi tren stokastik semu untuk menghasilkan estimasi yang valid.'
      }
    });
  }

  // ==========================================================
  // 6. PENCILAN & INFLUENTIAL OBSERVATIONS (OUTLIER)
  // ==========================================================
  const outlierAssump = findAssump('outlier') || findAssump('cook');
  const casewiseCount = result.casewiseDiagnostics?.length ?? 0;
  const hasOutlier = outlierAssump ? outlierAssump.status !== 'lulus' : casewiseCount > 0;

  cards.push({
    id: 'rec_outlier',
    category: 'outlier',
    testName: 'Diagnostik Pencilan & Observasi Berpengaruh (Cook\'s Distance & Casewise)',
    statistic: casewiseCount,
    statisticName: 'Jumlah Outlier Ekstrem (|Std. Residual| >= 3.0)',
    pValue: undefined,
    alpha,
    h0Decision: hasOutlier ? 'Tolak H0' : 'Gagal Tolak H0',
    status: hasOutlier ? 'WASPADA' : 'LULUS',
    interpretation: hasOutlier
      ? `Terdeteksi ${casewiseCount} observasi dengan residual terstandarisasi ekstrem (|e_i*| >= 3.0) atau Cook's Distance > 4/n. Observasi ini berpotensi memiliki pengaruh disproportionate terhadap kemiringan garis regresi.`
      : `Tidak ditemukan observasi pencilan ekstrem yang melampaui batas Cook's Distance 4/n (${(4 / n).toFixed(4)}) atau |Std. Residual| >= 3.0. Seluruh observasi berada dalam sebaran wajar.`,
    potentialCauses: [
      'Kesalahan manusia saat input data (human error / typo pengetikan angka).',
      'Kejadian anomali khusus yang faktual (misal peristiwa krisis ekonomi, bencana, akuisisi besar).',
      'Observasi berasal dari sub-populasi yang berbeda dari mayoritas sampel.'
    ],
    modelImpact: `Titik pencilan dengan leverage tinggi dapat 'menarik' garis regresi ke arahnya, mengubah tanda (+/-) koefisien, atau menciptakan signifikansi semu. Namun, MENGHAPUS OUTLIER SECARA SEMBARANGAN SANGAT TIDAK DIBENARKAN karena dapat memalsukan presisi model dan melanggar etika keterbukaan data.`,
    primaryRecommendation: hasOutlier
      ? 'Periksa lembar data mentah untuk memastikan tidak ada kesalahan input. Jika data valid dan faktual, lakukan Analisis Sensitivitas (Sensitivity Analysis): laporkan model dengan dan tanpa observasi tersebut secara berdampingan tanpa menghapus model asli M0.'
      : 'Pertahankan seluruh observasi sampel lengkap.',
    alternativeMethods: [
      {
        id: 'sensitivity_compare',
        name: 'Analisis Sensitivitas (Bandingkan Model Dengan vs Tanpa Outlier)',
        description: 'Menyimpan model baseline M0 (dengan outlier) dan membuat model M1 (tanpa outlier terbukti keliru) lalu membandingkan kestabilan koefisien.',
        applicability: 'Wajib menurut kaidah pelaporan ilmiah (Honest Reporting Bagian 3 Skill Remedial).',
        consequences: {
          coefficientsChange: true,
          coefficientsDetail: 'Koefisien dievaluasi apakah berubah drastis atau tetap stabil.',
          standardErrorChange: true,
          standardErrorDetail: 'Standard error dievaluasi perubahannya.',
          pValueChange: true,
          pValueDetail: 'Signifikansi dibandingkan secara transparan.',
          sampleSizeChange: true,
          sampleSizeDetail: 'Model pembanding berkurang sejumlah observasi yang disisihkan (maksimal 5% dari total n).',
          interpretationChange: false,
          interpretationDetail: 'Peneliti dapat membuktikan apakah temuan penelitian robust terhadap pencilan.'
        },
        remedialType: 'outlier_removal'
      },
      {
        id: 'robust_huber',
        name: 'Estimasi Robust M-Estimator (Huber Weighting)',
        description: 'Mereduksi pengaruh outlier secara mulus dengan menurunkan bobot observasi yang memiliki residual besar secara otomatis tanpa menghapusnya.',
        applicability: 'Solusi matematis terbaik jika outlier merupakan data faktual yang tidak boleh dibuang.',
        consequences: {
          coefficientsChange: true,
          coefficientsDetail: 'Koefisien dihasilkan melalui pembobotan adaptif.',
          standardErrorChange: true,
          standardErrorDetail: 'Standard error robust terhadap deviasi residual.',
          pValueChange: true,
          pValueDetail: 'p-value valid.',
          sampleSizeChange: false,
          sampleSizeDetail: 'Seluruh sampel tetap utuh 100%.',
          interpretationChange: false,
          interpretationDetail: 'Interpretasi tetap pada skala asli variabel.'
        },
        remedialType: 'robust_rlm'
      }
    ],
    methodologicalConsequences: {
      coefficientsChange: false,
      coefficientsDetail: 'Diagnostik outlier tidak mengubah koefisien OLS.',
      standardErrorChange: false,
      standardErrorDetail: 'Standard error OLS baseline tetap sama.',
      pValueChange: false,
      pValueDetail: 'p-value analitik OLS tetap sama.',
      sampleSizeChange: false,
      sampleSizeDetail: 'Tidak ada observasi yang diubah.',
      interpretationChange: false,
      interpretationDetail: 'Model M0 tetap dipertahankan.'
    },
    availableActions: {
      canApply: hasOutlier,
      remedialType: 'outlier_removal',
      actionLabel: 'Buat Model Pembanding Sensitivitas (Tanpa Outlier)',
      explanationText: 'Membuat model versi baru untuk komparasi ilmiah tanpa menimpa model M0.'
    }
  });

  // ==========================================================
  // 7. SPESIFIKASI & LINEARITAS MODEL (RAMSEY RESET)
  // ==========================================================
  const specAssump = findAssump('linearitas') || findAssump('reset');
  if (specAssump) {
    const isPass = specAssump.status === 'lulus';
    const statVal = specAssump.statistic;
    const pVal = specAssump.pValue ?? 0.05;

    cards.push({
      id: 'rec_specification',
      category: 'specification',
      testName: 'Spesifikasi Bentuk Fungsional & Linearitas (Ramsey RESET Test)',
      statistic: statVal,
      statisticName: 'F Stat (Ramsey RESET)',
      pValue: pVal,
      alpha,
      h0Decision: pVal < alpha ? 'Tolak H0' : 'Gagal Tolak H0',
      status: isPass ? 'LULUS' : 'PELANGGARAN',
      interpretation: isPass
        ? `Bentuk spesifikasi model linear memadai (p = ${pVal.toFixed(3)} >= alpha ${alpha}). Pangkat fitted values y_hat^2 dan y_hat^3 tidak memberikan kontribusi signifikan tambahan.`
        : `Terindikasi kesalahan spesifikasi bentuk fungsional (p = ${pVal.toFixed(3)} < alpha ${alpha}). Hubungan riil antar variabel berpotensi bersifat non-linear atau terdapat variabel penjelas relevan yang dihilangkan (omitted variable bias).`,
      potentialCauses: [
        'Hubungan antar variabel memiliki sifat elastisitas menurun (diminishing return) atau eksponensial yang dipaksakan linear.',
        'Ada variabel kunci dalam teori yang belum dimasukkan ke dalam model regresi.',
        'Adanya efek interaksi moderasi antar dua prediktor yang diabaikan.'
      ],
      modelImpact: `Jika model salah spesifikasi fungsional, estimasi koefisien OLS menjadi bias dan inkonsisten. Nilai R² tidak dapat dijadikan jaminan bahwa model sudah benar. Menambah prediktor secara mekanis semata-mata demi menaikkan R² tanpa dasar teori dapat memperparah multikolinearitas dan overfitting.`,
      primaryRecommendation: isPass
        ? 'Pertahankan spesifikasi linear saat ini.'
        : 'Uji kemungkinan hubungan non-linear dengan menambahkan suku polinomial (X^2) atau uji transformasi logaritmik ganda (Double-Log / Cobb-Douglas). Bandingkan menggunakan kriteria informasi AIC/BIC.',
      alternativeMethods: [
        {
          id: 'poly_quadratic',
          name: 'Penambahan Suku Polinomial Kuadratik [X, X²]',
          description: 'Memasukkan suku kuadratik X^2 (setelah mean-centering) untuk menangkap kurvatur U-shaped atau inverted U-shaped.',
          applicability: 'Cocok jika teori mendukung adanya titik optimal atau pembalikan arah hubungan.',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Koefisien linear dan kuadratik diestimasi bersamaan.',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error disesuaikan.',
            pValueChange: true,
            pValueDetail: 'Uji signifikansi kuadratik mengonfirmasi bentuk kurva.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel tetap sama.',
            interpretationChange: true,
            interpretationDetail: 'Dapat menghitung titik belok / ekstremum: X* = -beta_1 / (2 * beta_2).'
          },
          remedialType: 'polynomial'
        },
        {
          id: 'double_log',
          name: 'Model Log-Log (Double-Log / Elastisitas Konstan)',
          description: 'Mentransformasi variabel dependen dan independen ke dalam log natural: ln(Y) = beta_0 + beta_1 * ln(X).',
          applicability: 'Standar dalam pemodelan fungsi produksi, permintaan, dan emisi emisi karbon.',
          consequences: {
            coefficientsChange: true,
            coefficientsDetail: 'Koefisien langsung mencerminkan elastisitas: kenaikan 1% X meningkatkan Y sebesar beta_1%.',
            standardErrorChange: true,
            standardErrorDetail: 'Standard error diestimasi pada skala log.',
            pValueChange: true,
            pValueDetail: 'p-value valid.',
            sampleSizeChange: false,
            sampleSizeDetail: 'Ukuran sampel tetap sama.',
            interpretationChange: true,
            interpretationDetail: 'Bebas dari pengaruh skala satuan pengukuran.'
          },
          remedialType: 'transformation'
        }
      ],
      methodologicalConsequences: {
        coefficientsChange: false,
        coefficientsDetail: 'Diagnostik spesifikasi tidak mengubah koefisien OLS.',
        standardErrorChange: false,
        standardErrorDetail: 'Standard error OLS baseline tetap sama.',
        pValueChange: false,
        pValueDetail: 'p-value analitik OLS tetap sama.',
        sampleSizeChange: false,
        sampleSizeDetail: 'Tidak ada observasi yang diubah.',
        interpretationChange: false,
        interpretationDetail: 'Model M0 tetap dipertahankan.'
      },
      availableActions: {
        canApply: !isPass,
        remedialType: 'transformation',
        actionLabel: 'Eksplorasi Model Log-Log / Polinomial',
        explanationText: 'Mengevaluasi bentuk non-linear yang sah secara teoretis.'
      }
    });
  }

  // ==========================================================
  // 8. KECUKUPAN UKURAN SAMPEL (GREEN, 1991)
  // ==========================================================
  const minNModel = 50 + 8 * k;
  const minNPredictors = 104 + k;
  const isSampleAdequate = n >= minNModel;
  const isSampleGenerous = n >= minNPredictors;

  cards.push({
    id: 'rec_sample_size',
    category: 'sample_size',
    testName: 'Kecukupan Ukuran Sampel (Kaidah Ekonometrika Green, 1991)',
    statistic: n,
    statisticName: `Ukuran Sampel Terpakai (n = ${n}, k = ${k})`,
    pValue: undefined,
    alpha,
    h0Decision: isSampleAdequate ? 'Gagal Tolak H0' : 'Tolak H0',
    status: isSampleGenerous ? 'LULUS' : (isSampleAdequate ? 'WASPADA' : 'PELANGGARAN'),
    interpretation: isSampleGenerous
      ? `Ukuran sampel (n = ${n}) sangat memadai menurut kaidah Green (1991). Memenuhi syarat uji model simultan (n >= 50 + 8k = ${minNModel}) maupun uji prediktor individual (n >= 104 + k = ${minNPredictors}).`
      : (isSampleAdequate
        ? `Ukuran sampel (n = ${n}) memadai untuk menguji model keseluruhan R² (n >= 50 + 8k = ${minNModel}), namun berada di bawah rekomendasi ideal untuk menguji prediktor individual secara terpisah (n < 104 + k = ${minNPredictors}).`
        : `Peringatan ukuran sampel kecil: n = ${n} kurang dari ambang batas minimum Green (1991) (n < 50 + 8k = ${minNModel}). Model rentan mengalami overfitting dan power statistik rendah.`),
    potentialCauses: [
      'Keterbatasan ketersediaan data empiris atau biaya survei.',
      'Banyaknya observasi yang gugur akibat missing values (listwise deletion).',
      'Memasukkan terlalu banyak variabel kontrol atau prediktor tanpa mempertimbangkan ketersediaan sampel.'
    ],
    modelImpact: `Rasio observasi terhadap prediktor n/k yang rendah (${(n / k).toFixed(1)}:1) memperbesar risiko overfitting: model tampak menjelaskan sampel dengan baik secara kebetulan semata, namun memiliki generalisasi yang buruk pada populasi. Selain itu, Minimum Detectable Effect Size (MDES) membesar sehingga hanya efek yang luar biasa besar yang mampu mencapai signifikansi statistik.`,
    primaryRecommendation: isSampleGenerous
      ? 'Pertahankan spesifikasi model saat ini.'
      : (isSampleAdequate
        ? 'Pertahankan model dengan menyertakan peringatan statistical power pada bab keterbatasan penelitian.'
        : 'Pertimbangkan untuk merasionalisasi jumlah prediktor: prioritaskan prediktor dengan dasar teori terkuat dan kurangi variabel kontrol yang tidak esensial.'),
    alternativeMethods: [
      {
        id: 'parsimonious_model',
        name: 'Model Parsimoni (Prinsip Ockham\'s Razor)',
        description: 'Memilih subset prediktor yang paling relevan secara teoretis untuk menaikkan derajat kebebasan dan rasio n/k.',
        applicability: 'Sangat dianjurkan jika rasio n/k < 10.',
        consequences: {
          coefficientsChange: true,
          coefficientsDetail: 'Koefisien diestimasi ulang pada subset variabel yang lebih ramping.',
          standardErrorChange: true,
          standardErrorDetail: 'Derajat kebebasan residual (df) meningkat sehingga t-kritis mengecil.',
          pValueChange: true,
          pValueDetail: 'p-value disesuaikan.',
          sampleSizeChange: false,
          sampleSizeDetail: 'Ukuran sampel tetap sama.',
          interpretationChange: true,
          interpretationDetail: 'Model menjadi lebih elegan, stabil, dan mudah diinterpretasikan.'
        }
      }
    ],
    methodologicalConsequences: {
      coefficientsChange: false,
      coefficientsDetail: 'Evaluasi ukuran sampel tidak mengubah koefisien OLS.',
      standardErrorChange: false,
      standardErrorDetail: 'Standard error OLS baseline tetap sama.',
      pValueChange: false,
      pValueDetail: 'p-value analitik OLS tetap sama.',
      sampleSizeChange: false,
      sampleSizeDetail: 'Tidak ada observasi yang diubah.',
      interpretationChange: false,
      interpretationDetail: 'Model M0 tetap dipertahankan.'
    },
    availableActions: {
      canApply: !isSampleAdequate,
      actionLabel: 'Rasionalisasi Prediktor',
      explanationText: 'Evaluasi apakah prediktor dapat dirampingkan untuk menaikkan rasio n/k.'
    }
  });

  // Calculate Health Score & Overall Status
  const total = cards.length || 1;
  const passed = cards.filter((c) => c.status === 'LULUS').length;
  const warnings = cards.filter((c) => c.status === 'WASPADA').length;
  const violations = cards.filter((c) => c.status === 'PELANGGARAN').length;

  const healthScore = Math.max(0, Math.min(100, Math.round(((passed * 1.0 + warnings * 0.5) / total) * 100)));

  let overallHealth: RecommendationEngineOutput['summary']['overallHealth'] = 'EXCELLENT';
  if (violations >= 3 || healthScore < 50) overallHealth = 'CRITICAL';
  else if (violations > 0 || healthScore < 75) overallHealth = 'NEEDS_REMEDIAL';
  else if (warnings > 0 || healthScore < 90) overallHealth = 'GOOD';

  const topPriorityActions: string[] = [];
  if (cards.some((c) => c.category === 'heteroskedasticity' && c.status === 'PELANGGARAN')) {
    topPriorityActions.push('Terapkan Robust Standard Errors HC3 untuk inferensi valid tanpa mengubah koefisien OLS.');
  }
  if (cards.some((c) => c.category === 'stationarity' && c.status === 'PELANGGARAN')) {
    topPriorityActions.push('Atasi risiko regresi lancung: periksa kointegrasi atau terapkan First Difference.');
  }
  if (cards.some((c) => c.category === 'multicollinearity' && c.status === 'PELANGGARAN')) {
    topPriorityActions.push('Evaluasi multikolinearitas ekstrem: lakukan mean-centering atau penggabungan konstruk komposit.');
  }
  if (cards.some((c) => c.category === 'normality' && c.status === 'PELANGGARAN' && n <= 50)) {
    topPriorityActions.push('Pada n <= 50 dengan residual tidak normal: pertimbangkan interval keyakinan Bootstrap BCa.');
  }
  if (topPriorityActions.length === 0) {
    topPriorityActions.push('Model memenuhi seluruh asumsi utama Gauss-Markov. Model M0 siap dipublikasikan.');
  }

  return {
    cards,
    summary: {
      totalAssumptions: total,
      passedAssumptions: passed,
      violatedAssumptions: violations,
      warningAssumptions: warnings,
      overallHealth,
      healthScore,
      topPriorityActions
    }
  };
}
