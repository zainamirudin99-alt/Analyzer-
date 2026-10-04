import { describe, it, expect } from "vitest";
import { generateDeterministicInterpretation } from "../../src/lib/regression-interpretation";
import { runRegressionEngine } from "../../src/lib/regression-engine";
import { DATASET_SLR_N20, DATASET_LOW_R2 } from "../fixtures/synthetic-datasets";

describe("Deterministic Narrative Interpretation Tests", () => {
  it("interpolates exact numbers from OLSFitResult without hallucination", () => {
    const ds = DATASET_SLR_N20;
    const res = runRegressionEngine({
      data: ds.data,
      yCol: ds.yCol,
      xCols: ds.xCols,
      alpha: 0.05,
    });

    const narrative = generateDeterministicInterpretation(res, {
      modelId: "M0",
      modelType: "baseline",
      title: "Model Awal (M0)",
      kTried: 1,
      label: "Konfirmatori",
      alpha: 0.05,
    });

    // 1. Model Summary text must contain exact R2 and adjR2 rounded to 3 decimals or percentage
    const r2Formatted = (res.modelSummary.rSquared * 100).toFixed(1);
    expect(narrative.modelSummary).toContain(r2Formatted);
    expect(narrative.modelSummary).toContain(res.modelSummary.rSquared.toFixed(3));

    // 2. ANOVA text must contain exact df1, df2, F statistic
    expect(narrative.anova).toContain(res.anova.regression.df.toString());
    expect(narrative.anova).toContain(res.anova.residual.df.toString());
    expect(narrative.anova).toContain(res.anova.regression.f.toFixed(3));

    // 3. Coefficients text must contain exact predictor name and unstandardized B
    const slope = res.coefficients.find((c) => c.variable !== "(Constant)");
    expect(slope).toBeDefined();
    expect(narrative.coefficients).toContain(slope!.variable);
    expect(narrative.coefficients).toContain(slope!.b.toFixed(3));

    // 4. Status text must specify Konfirmatori and K = 1
    expect(narrative.status).toContain("Konfirmatori");
    expect(narrative.status).toContain("Jumlah spesifikasi yang dicoba: 1");
  });

  it("handles low R2 pathway with MDES and honest disclosure", () => {
    const ds = DATASET_LOW_R2;
    const res = runRegressionEngine({
      data: ds.data,
      yCol: ds.yCol,
      xCols: ds.xCols,
      alpha: 0.05,
    });

    const narrative = generateDeterministicInterpretation(res, {
      modelId: "M0",
      modelType: "baseline",
      title: "Model Awal (M0)",
      kTried: 1,
      label: "Konfirmatori",
      alpha: 0.05,
    });

    // Must disclose low R2 without sugarcoating
    expect(narrative.lowR2Note).toBeDefined();
    expect(narrative.lowR2Note).toContain("efek terkecil yang dapat dideteksi");
    expect(narrative.lowR2Note).toContain("bukan bukti ketiadaan hubungan nonlinear");
  });

  it("adds methodological warning when status is Eksploratori", () => {
    const ds = DATASET_SLR_N20;
    const res = runRegressionEngine({
      data: ds.data,
      yCol: ds.yCol,
      xCols: ds.xCols,
      alpha: 0.05,
    });

    const narrative = generateDeterministicInterpretation(res, {
      modelId: "M2",
      modelType: "transformation",
      title: "Model Transformasi Box-Cox (M2)",
      kTried: 3,
      label: "Eksploratori",
      alpha: 0.05,
      exploratoryReason: "Membandingkan beberapa spesifikasi transformasi",
    });

    expect(narrative.status).toContain("Eksploratori");
    expect(narrative.status).toContain("Jumlah spesifikasi yang dicoba: 3");
    expect(narrative.status).toContain("terlalu optimistis");
  });
});
