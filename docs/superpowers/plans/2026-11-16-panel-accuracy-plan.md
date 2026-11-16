# Implementation Plan — Option 2 Comparative Measurement Accuracy Assessment

## Gerbang Verifikasi 1: Mesin Statistik & Unit Test
- [x] `src/lib/panel-accuracy-types.ts` — Kontrak dinamis `MeasurementSource`, `PanelDataset`, metrik, Pair FE, diagnostik, ranking, codegen, & ekspor.
- [x] `src/lib/panel-accuracy-validation.ts` & `src/lib/panel-accuracy-preprocessing.ts` — Validasi 10 pemeriksaan kualitas data + audit kualitas sumber referensi + prapemrosesan opt-in + pemisahan Complete-Case vs Available-Case + recommender prapemrosesan.
- [x] `src/lib/panel-accuracy-correlation.ts` — Deskriptif, Pearson, Spearman, Within-City correlation, First-Difference correlation.
- [x] `src/lib/panel-accuracy-metrics.ts`, `src/lib/panel-accuracy-ccc.ts`, `src/lib/panel-accuracy-bland-altman.ts` — MAE, RMSE, MBE, Lin's CCC, Bland-Altman LoA & proportional bias.
- [x] `src/lib/panel-accuracy-fixed-effects.ts`, `src/lib/panel-accuracy-inference.ts`, `src/lib/panel-accuracy-bootstrap.ts` — Pair Fixed Effects, City Cluster-Robust SE, Omnibus Wald F, kontras berpasangan, & Rademacher Wild Cluster Bootstrap.
- [x] `src/lib/panel-accuracy-diagnostics.ts` & `src/lib/panel-accuracy-ranking.ts` — Diagnostik panel & pemeringkatan berbasis MAE primer tanpa composite score.
- [x] `tests/unit/panel-accuracy-engine.test.ts` — Verifikasi eksak manual, uji $J=2,3,4,5$ sumber, pergantian referensi, Complete-Case vs Available-Case, Wild Cluster Bootstrap.

## Gerbang Verifikasi 2: Interpretasi, Codegen, Ekspor, API, UI 9 Tahap & Regression Test
- [x] `src/lib/panel-accuracy-interpretation.ts`, `src/lib/panel-accuracy-codegen-stata.ts`, `src/lib/panel-accuracy-codegen-r.ts`.
- [x] `src/lib/panel-accuracy-export-xlsx.ts`, `src/lib/panel-accuracy-export-docx.ts`, `src/lib/panel-accuracy-export-pdf.ts`, `src/lib/panel-accuracy-orchestrator.ts`.
- [x] `src/app/api/panel-accuracy/fit/route.ts`, `export-pdf/route.ts`, `export-docx/route.ts`, `export-xlsx/route.ts`, `recommend-preprocessing/route.ts`.
- [x] `src/components/PanelAccuracyCharts.tsx`, `src/components/PanelAccuracyTab.tsx`, pembaruan blok Option 2 di `src/components/PanelTabHub.tsx`, pembersihan modul `panel-latent-*` lama.
- [x] Integration test, Regression test Option 1 & Menu CED/Regresi, `tsc --noEmit`, `next build`.
