# Comparative Measurement Accuracy Assessment Using Reference Measurements: A Panel Data Approach

## 1. Tujuan & Batasan Sistem
- Menggantikan **Option 2** pada menu **Regresi Data Panel Stata** menjadi **Comparative Measurement Accuracy Assessment** (*Analisis Komparatif Akurasi Pengukuran Emisi CO₂ Berbasis Data Panel*).
- **Zero-Regression**: Seluruh file **Option 1** (`PanelTab.tsx`, `panel-engine.ts`, `panel-types.ts`, `/api/panel/*`) dan menu lain (`UploadTab.tsx`, `ResultsTab.tsx`, `RegressionTab.tsx`) berstatus **PROTECTED** dan tidak disentuh.
- Mendukung jumlah sumber pengukuran dinamis $J \ge 2$ ($1$ *Reference Source* $r$ yang dipilih pengguna + $J - 1$ *Comparison Sources* $j \in \mathcal{C}$).

## 2. Kontrak Variabel Dinamis
- `MeasurementSource`: `id`, `name`, `label`, `columnKey`, `unit`, `role: "reference" | "comparison"`, `uncertaintyColumn`, `methodDescription`, `metadata`.
- Pergantian sumber referensi wajib menghitung ulang seluruh error, metrik, CCC, Bland-Altman, Pair Fixed Effects, diagnostik, peringkat, interpretasi, dan kode reproduksi Stata/R.

## 3. Model Matematis, Metrik & Inferensi Panel
1. **Error Berpasangan**:
   - $e_{ijt} = X_{ijt} - X_{irt}$, $\text{AE}_{ijt} = |e_{ijt}|$, $\text{SE}_{ijt} = e_{ijt}^2$
   - Menampilkan **Complete-Case** ($\bigcap_{s=1}^J$) untuk perbandingan utama serta **Source-Specific Available-Case** ($j \text{ vs } r$) secara terpisah.
2. **Metrik Akurasi & Kesepakatan**:
   - MAE, RMSE, MBE (+ 95% CI analitik & cluster-robust)
   - Korelasi Pearson, Spearman, Within-City Demeaned, dan First-Difference
   - Lin's Concordance Correlation Coefficient ($\rho_c$, *precision* $r$, *bias correction* $C_b$, *scale shift* $v$, *location shift* $u$, 95% CI Fisher-$Z$)
   - Bland-Altman Agreement Analysis ($\bar{d}_j$, $s_{d,j}$, 95% LoA $\bar{d}_j \pm 1.96 s_{d,j}$, CI LoA, % di luar LoA, regresi *proportional bias*)
3. **Model Inferensial Panel — Pair Fixed Effects**:
   - $\text{AE}_{ijt} = \alpha_{it} + \sum_{j \ne j_0} \beta_j \text{Source}_j + \varepsilon_{ijt}$
   - Absorpsi efek tetap pasangan Kota-Tahun $\alpha_{it}$ via transformasi *within-pair*.
   - Matriks kovarians **Cluster-Robust pada level City ID** ($G$ kota) dengan koreksi sampel kecil $\frac{G}{G-1}\frac{N-1}{N-K}$.
   - **Rademacher Wild Cluster Bootstrap** ($B = 999$) untuk $G < 30$.
4. **Diagnostik & Pemeringkatan**:
   - Heteroskedastisitas antar-sumber, autokorelasi serial error dalam kota, *cross-sectional dependence* Pesaran CD antar kota, kecukupan klaster $G$, sensitivitas outlier, serta penjelasan proporsional Normalitas & CLT.
   - Pemeringkatan berbasis **MAE primer** didukung RMSE, $|\text{MBE}|$, CCC, dan signifikansi Pair FE tanpa *composite score* semu; menghentikan klaim pemenang jika referensi tidak valid atau bukti bertentangan/tidak signifikan.
