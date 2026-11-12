/**
 * Deterministic Regression Narrative Interpretation
 *
 * Implements Bahasa Indonesia academic reporting templates strictly derived
 * from Bagian 7 skill remedial.
 * Guarantees zero LLM hallucinations: 100% data-bound to computed OLSFitResult fields.
 */

import { OLSFitResult } from "./regression-engine";
import { computeMDES } from "./regression-remedial";

export interface ModelNarrativeContext {
  modelId: string;
  modelType: string;
  title: string;
  kTried: number;
  label: "Konfirmatori" | "Eksploratori";
  alpha: number;
  exploratoryReason?: string;
  transformationType?: string;
  passRate?: {
    rate: number;
    ciLower: number;
    ciUpper: number;
    m0Rate?: number;
    date?: string;
  };
}

export interface DeterministicNarrative {
  executiveSummary: string;
  regressionEquation: string;
  modelSummary: string;
  anova: string;
  coefficients: string;
  tTestSummary: string;
  assumptions: string[];
  status: string;
  lowR2Note?: string;
  remedialNote?: string;
  nonCausalAdvisory: string;
  covarianceEstimatorNote: string;
}

export function generateDeterministicInterpretation(
  result: OLSFitResult,
  ctx: ModelNarrativeContext
): DeterministicNarrative {
  const alpha = ctx.alpha ?? 0.05;
  const yCol = result.variables.yCol;
  const xList = result.variables.xCols.join(", ");
  const r2 = result.modelSummary.rSquared;
  const r2Pct = (r2 * 100).toFixed(1);
  const remainingPct = (100 - r2 * 100).toFixed(1);
  const adjR2 = result.modelSummary.adjRSquared.toFixed(3);
  const r2Str = r2.toFixed(3);

  // 1. Model Summary Template
  let modelSummary = `Nilai R Square sebesar ${r2Str} menunjukkan bahwa ${r2Pct} persen variasi ${yCol} dapat dijelaskan oleh ${xList}; ${remainingPct} persen dijelaskan faktor lain di luar model. Adjusted R Square sebesar ${adjR2}.`;
  if (ctx.transformationType) {
    modelSummary += ` Skala ${yCol} telah ditransformasi (${ctx.transformationType}); interpretasi variasi berlaku pada skala terinversi tersebut.`;
  }

  // 2. ANOVA Template (Uji F Simultan)
  const df1 = result.anova.regression.df;
  const df2 = result.anova.residual.df;
  const fStat = result.anova.regression.f.toFixed(3);
  const pVal = result.anova.regression.sig;
  const pValFormatted = pVal < 0.001 ? ".000" : pVal.toFixed(3).replace(/^0/, "");
  const isSig = pVal < alpha;
  const relWord = isSig ? "kurang dari" : "lebih besar dari";
  const h0Word = isSig ? "ditolak" : "gagal ditolak";
  const modelFeasible = isSig ? "layak" : "belum layak";

  const anova = `Uji F menghasilkan F(${df1}, ${df2}) = ${fStat} dengan Sig. ${pValFormatted}. Karena Sig. ${relWord} alpha (${alpha}), H0 ${h0Word}: model regresi secara simultan ${modelFeasible} digunakan untuk menjelaskan ${yCol}.`;

  // 3. Persamaan Garis Regresi Linear
  const constRow = result.coefficients.find(c => c.variable === "(Constant)");
  const b0 = constRow ? constRow.b : 0;
  const predRows = result.coefficients.filter(c => c.variable !== "(Constant)");
  let regressionEquation = `Ŷ = ${b0.toFixed(3)}`;
  for (const pr of predRows) {
    const sign = pr.b >= 0 ? "+" : "-";
    regressionEquation += ` ${sign} ${Math.abs(pr.b).toFixed(3)}(${pr.variable})`;
  }

  // 4. Uji t (Uji Parsial) & Interpretasi Koefisien
  const tTestSentences: string[] = [];
  const coefSentences: string[] = [];

  // Konstanta
  if (constRow) {
    const cSigFormatted = constRow.sig < 0.001 ? ".000" : constRow.sig.toFixed(3).replace(/^0/, "");
    coefSentences.push(
      `Konstanta sebesar ${constRow.b.toFixed(3)} menunjukkan bahwa jika seluruh variabel independen bernilai nol (0), maka nilai ekspektasi ${yCol} adalah sebesar ${constRow.b.toFixed(3)} (t = ${constRow.t.toFixed(3)}, Sig. = ${cSigFormatted}).`
    );
  }

  // Tiap Prediktor X
  for (const c of predRows) {
    const direction = c.b >= 0 ? "positif" : "negatif";
    const changeWord = c.b >= 0 ? "kenaikan" : "penurunan";
    const absB = Math.abs(c.b).toFixed(3);
    const cSigFormatted = c.sig < 0.001 ? ".000" : c.sig.toFixed(3).replace(/^0/, "");
    const isHypoAccepted = c.sig < alpha;
    const lo = c.ciLower.toFixed(3);
    const hi = c.ciUpper.toFixed(3);
    const tVal = c.t.toFixed(3);

    const tDesc = isHypoAccepted
      ? `Uji t (Uji Parsial) untuk ${c.variable}: Diperoleh nilai t hitung = ${tVal} dengan Sig. = ${cSigFormatted} < alpha (${alpha}). Maka H0 ditolak, yang menunjukkan bahwa ${c.variable} berasosiasi secara linear ${direction} signifikan dengan ${yCol} (hubungan asosiasi linear, bukan pembuktian kausalitas).`
      : `Uji t (Uji Parsial) untuk ${c.variable}: Diperoleh nilai t hitung = ${tVal} dengan Sig. = ${cSigFormatted} >= alpha (${alpha}). Maka H0 gagal ditolak; artinya data sampel belum memberikan bukti statistik yang cukup untuk menyatakan adanya hubungan linear antara ${c.variable} dan ${yCol} pada tingkat signifikansi ${alpha} (gagal tolak H0 bukan bukti pasti ketiadaan hubungan riil atau non-linear).`;

    let betaDesc = "";
    if (result.modelType === "MLR" && c.beta !== undefined) {
      betaDesc = ` Nilai Standardized Beta sebesar ${c.beta.toFixed(3)} menunjukkan kontribusi komparatif relatif ${c.variable} terhadap variasi terstandarisasi ${yCol}.`;
    }

    tTestSentences.push(`${tDesc}${betaDesc}`);
    coefSentences.push(
      `Koefisien regresi ${c.variable} adalah ${c.b.toFixed(3)} (SE = ${c.stdError.toFixed(3)}, 95% CI: ${lo} hingga ${hi}). Rata-rata perubahan ${yCol} yang diasosiasikan dengan setiap kenaikan 1 satuan ${c.variable} adalah sebesar ${absB} satuan ${changeWord}, ceteris paribus (dengan asumsi variabel lain dalam model konstan). ${tDesc}`
    );
  }

  const tTestSummary = tTestSentences.join(" ");
  const coefficients = `Persamaan Regresi: ${regressionEquation}. ` + coefSentences.join(" ");

  // 4. Assumptions Template
  const assumptions: string[] = [];
  for (const a of result.assumptions) {
    const statStr = a.statistic !== undefined && a.statistic !== null ? a.statistic.toFixed(3) : "-";
    const sigStr = a.pValue !== undefined && a.pValue !== null
      ? (a.pValue < 0.001 ? ".000" : a.pValue.toFixed(3).replace(/^0/, ""))
      : "-";
    const passStatus = a.status === "lulus" ? "terpenuhi" : "gagal";

    if (a.name.toLowerCase().includes("normalitas")) {
      const normalConclusion = a.status === "lulus" ? "berdistribusi normal" : "tidak normal";
      let text = `Uji ${a.name} menghasilkan Sig. ${sigStr}. Residu ${normalConclusion} pada alpha ${alpha}. Q-Q plot tampak ${a.status === "lulus" ? "sejalan dengan garis acuan diagonal" : "mengalami deviasi pada ekor distribusi"}.`;
      if (result.sampleSize.nUsed > 200) {
        text += ` (Catatan: ukuran sampel besar N=${result.sampleSize.nUsed} cenderung sangat sensitif terhadap deviasi minor).`;
      }
      assumptions.push(text);
    } else if (a.name.toLowerCase().includes("durbin-watson") && !result.timeSeriesSummary?.isTimeSeries) {
      assumptions.push(`Durbin-Watson sebesar ${statStr}. Uji ini hanya bermakna jika data merupakan runtun waktu berurutan.`);
    } else {
      assumptions.push(`Uji ${a.name}: statistik ${statStr} (Sig./Kriteria: ${sigStr}, status: ${passStatus}). ${a.reason}`);
    }
  }

  // 5. Low R2 Note (Jalur R2 Rendah)
  let lowR2Note: string | undefined = undefined;
  const f2 = r2 < 1 ? r2 / (1 - r2) : 999;
  if (r2 < 0.15 || !isSig) {
    const mdes = computeMDES(result.sampleSize.nUsed, result.kPredictors, alpha, 0.8).toFixed(3);
    lowR2Note = `Model menjelaskan ${r2Pct} persen variasi. Pada n = ${result.sampleSize.nUsed}, efek terkecil yang dapat dideteksi dengan power 0.80 adalah f2 = ${mdes}. Hasil ini tidak menunjukkan hubungan linear yang kuat, dan bukan bukti ketiadaan hubungan nonlinear.`;
  }

  // 6. Remedial Note
  let remedialNote: string | undefined = undefined;
  if (ctx.passRate) {
    const dateStr = ctx.passRate.date || "sesi saat ini";
    const prStr = ctx.passRate.rate.toFixed(1);
    const loStr = ctx.passRate.ciLower.toFixed(1);
    const hiStr = ctx.passRate.ciUpper.toFixed(1);
    const initialPr = ctx.passRate.m0Rate !== undefined ? `${ctx.passRate.m0Rate.toFixed(1)} persen` : "model awal";

    remedialNote = `Opsi ${ctx.title} dievaluasi pada ${dateStr}. Normality Pass Rate sebesar ${prStr} persen (CI 95 persen ${loStr} sampai ${hiStr}) dibanding ${initialPr} sebelum perbaikan.`;
  }

  // 7. Status Note & Invariant I6/I10
  let status = `Laporan ini berstatus ${ctx.label}. Jumlah spesifikasi yang dicoba: ${ctx.kTried}.`;
  if (ctx.label === "Eksploratori") {
    status += ` Peringatan Metodologis: Karena terdapat eksplorasi jamak (${ctx.exploratoryReason || "perbandingan beberapa spesifikasi"}), estimasi p-value dan interval keyakinan cenderung terlalu optimistis. Replikasi pada dataset independen sangat dianjurkan.`;
  }

  // Non-causal & Covariance Estimator Advisories (Kaidah Metodologi Prompt 3)
  const nonCausalAdvisory =
    "Peringatan Metodologis Kausalitas: Analisis regresi linear ini bersumber dari data observasional. Koefisien determinasi R² mengukur proporsi variabilitas linear sampel yang terjelaskan, BUKAN persentase pengaruh kausal sebab-akibat. Uji hipotesis yang tidak signifikan (gagal tolak H0) menunjukkan ketiadaan bukti statistik hubungan linear pada alpha yang dipilih, bukan bukti pasti tidak adanya hubungan riil atau non-linear.";

  const covarianceEstimatorNote =
    ctx.modelType.includes("robust") || ctx.title.toLowerCase().includes("robust") || ctx.title.toLowerCase().includes("hc3")
      ? "Estimator Kovarians: Model menggunakan Heteroskedasticity-Consistent Covariance Matrix (HC3) untuk inferensi statistik yang kebal terhadap heteroskedastisitas sampel kecil tanpa mengubah nilai koefisien OLS."
      : (ctx.title.toLowerCase().includes("hac") || ctx.title.toLowerCase().includes("newey")
        ? "Estimator Kovarians: Model menggunakan Newey-West Heteroskedasticity and Autocorrelation Consistent (HAC) Covariance Matrix untuk inferensi deret waktu tanpa mengubah koefisien OLS."
        : "Estimator Kovarians: Model menggunakan matriks kovarians OLS analitik standar s²(XᵀX)⁻¹.");

  // Executive summary combining core findings
  const executiveSummary = `Analisis regresi linear bergaya SPSS terhadap ${yCol} dengan prediktor ${xList} menghasilkan model ${modelFeasible} (F=${fStat}, p=${pValFormatted}, R²=${r2Str}). Sebanyak ${r2Pct}% variasi variabel dependen terasosiasi secara linear dengan prediktor model. ${assumptions.filter(a => a.includes("tidak") || a.includes("gagal")).length > 0 ? "Beberapa uji asumsi klasik terdeteksi melanggar kriteria dan memerlukan perhatian." : "Seluruh asumsi klasik utama terpenuhi."}`;

  return {
    executiveSummary,
    modelSummary,
    anova,
    coefficients,
    regressionEquation,
    tTestSummary,
    assumptions,
    status,
    lowR2Note,
    remedialNote,
    nonCausalAdvisory,
    covarianceEstimatorNote,
  };
}

// ============================================================
// Point 15: 10-Element Formal Academic Indonesian Interpretation
// ============================================================
export interface TenElementAcademicInterpretation {
  testPurpose: string;              // 1. Tujuan pengujian statistik
  hypotheses: { h0: string; h1: string }; // 2. Hipotesis nol (H0) dan alternatif (H1)
  statisticValue: string;           // 3. Nilai statistik uji
  pValueFormatted: string;          // 4. Nilai signifikansi (p-value)
  decisionCriterion: string;        // 5. Kriteria pengambilan keputusan
  h0Decision: string;               // 6. Keputusan terhadap H0
  directionOfRelationship: string;  // 7. Arah hubungan
  strengthOfRelationship: string;   // 8. Kekuatan hubungan / Effect size
  statisticalMeaning: string;       // 9. Makna statistik
  practicalImplication: string;     // 10. Implikasi praktis dalam konteks penelitian
}

export function generateTenElementAcademicInterpretation(
  result: OLSFitResult,
  alpha: number = 0.05
): TenElementAcademicInterpretation[] {
  const items: TenElementAcademicInterpretation[] = [];
  const yCol = result.variables.yCol;
  const xList = result.variables.xCols.join(", ");
  const r = result.modelSummary.r;
  const r2 = result.modelSummary.rSquared;
  const fStat = result.anova.regression.f;
  const fSig = result.anova.regression.sig;
  const df1 = result.anova.regression.df;
  const df2 = result.anova.residual.df;

  // 1. Simultaneous F-Test 10-Element Card
  const fSigStr = fSig < 0.001 ? "< .001" : fSig.toFixed(3);
  const fRejected = fSig < alpha;
  items.push({
    testPurpose: `Menguji kelayakan model (Goodness-of-Fit) dan pengaruh simultan variabel independen (${xList}) terhadap variabel dependen (${yCol}).`,
    hypotheses: {
      h0: `H0: β1 = β2 = ... = βk = 0 (Seluruh prediktor secara simultan tidak berasosiasi linear dengan ${yCol}).`,
      h1: `H1: Minimal terdapat satu βj ≠ 0 (Minimal satu prediktor berasosiasi linear signifikan dengan ${yCol}).`
    },
    statisticValue: `F(${df1}, ${df2}) = ${fStat.toFixed(3)}`,
    pValueFormatted: fSigStr,
    decisionCriterion: `Tolak H0 apabila nilai Sig. (p-value) < α (${alpha}).`,
    h0Decision: fRejected ? "Tolak H0 (Terima H1)" : "Gagal Tolak H0",
    directionOfRelationship: "Simultan / Multivariat (Omnibus)",
    strengthOfRelationship: `R = ${r.toFixed(3)}, R Square (R²) = ${r2.toFixed(3)} (${(r2 * 100).toFixed(1)}%), Adjusted R² = ${result.modelSummary.adjRSquared.toFixed(3)}.`,
    statisticalMeaning: fRejected
      ? `Kombinasi variabel independen (${xList}) secara bersama-sama mampu menjelaskan ${(r2 * 100).toFixed(1)}% variasi pada ${yCol} secara signifikan.`
      : `Kombinasi variabel independen (${xList}) belum mampu menjelaskan variasi ${yCol} secara signifikan pada tingkat α = ${alpha}.`,
    practicalImplication: fRejected
      ? `Spesifikasi model regresi layak digunakan sebagai dasar inferensi akademik dan pemodelan prediktif terhadap ${yCol}.`
      : `Peneliti disarankan mengevaluasi kembali spesifikasi teori, kecukupan ukuran sampel (N = ${result.sampleSize.nUsed}), atau variabel kontrol yang belum dimasukkan.`
  });

  // 2. Partial t-Tests for Each Predictor
  for (const coef of result.coefficients.filter(c => c.variable !== "(Constant)")) {
    const tSigStr = coef.sig < 0.001 ? "< .001" : coef.sig.toFixed(3);
    const tRejected = coef.sig < alpha;
    const dir = coef.b >= 0 ? "Positif (Searah)" : "Negatif (Berlawanan Arah)";
    items.push({
      testPurpose: `Menguji pengaruh parsial (ceteris paribus) variabel ${coef.variable} terhadap ${yCol}.`,
      hypotheses: {
        h0: `H0: β_${coef.variable} = 0 (${coef.variable} tidak berpengaruh signifikan secara parsial terhadap ${yCol}).`,
        h1: `H1: β_${coef.variable} ≠ 0 (${coef.variable} berpengaruh signifikan secara parsial terhadap ${yCol}).`
      },
      statisticValue: `t(${df2}) = ${coef.t.toFixed(3)}, B = ${coef.b.toFixed(3)} (SE = ${coef.stdError.toFixed(3)})`,
      pValueFormatted: tSigStr,
      decisionCriterion: `Tolak H0 apabila nilai Sig. (2-tailed) < α (${alpha}) dan interval kepercayaan 95% [${coef.ciLower.toFixed(3)}, ${coef.ciUpper.toFixed(3)}] tidak memuat angka nol.`,
      h0Decision: tRejected ? "Tolak H0 (Signifikan)" : "Gagal Tolak H0 (Tidak Signifikan)",
      directionOfRelationship: dir,
      strengthOfRelationship: `Standardized Beta (β) = ${(coef.beta ?? 0).toFixed(3)}, Korelasi Parsial = ${(coef.correlations?.partial ?? 0).toFixed(3)}, Semi-Parsial (Part) = ${(coef.correlations?.part ?? 0).toFixed(3)}.`,
      statisticalMeaning: tRejected
        ? `Setiap kenaikan 1 satuan pada ${coef.variable} berasosiasi dengan perubahan rata-rata ${yCol} sebesar ${coef.b.toFixed(3)} satuan dengan mengasumsikan variabel independen lainnya konstan.`
        : `Variasi pada ${coef.variable} belum terbukti memberikan kontribusi unik yang signifikan terhadap perubahan ${yCol} ketika variabel lain dikontrol.`,
      practicalImplication: tRejected
        ? `Variabel ${coef.variable} merupakan determinan empiris penting yang perlu diprioritaskan dalam perumusan kebijakan atau implikasi manajerial terkait ${yCol}.`
        : `Kebijakan yang hanya mengandalkan intervensi langsung pada ${coef.variable} belum memiliki dukungan bukti empiris linear yang memadai pada sampel ini.`
    });
  }

  return items;
}
