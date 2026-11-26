# Spesifikasi Teknis & Metodologi Statistik — Multi-Source Measurement Accuracy Analysis (Option 4 pada Menu Regresi Data Panel Stata)

**Tanggal**: 2026-11-26  
**Status**: Disetujui untuk Implementasi Terisolasi (Tahap 17)  
**Target Lokasi**: `src/features/multi-source-accuracy/**` & `src/app/api/msma/**` (Integrasi pada `src/components/PanelTabHub.tsx`)

---

## 1. Phase 1 — Laporan Audit Repositori & Invarian Isolasi

1. **Struktur Eksisting Menu Regresi Data Panel Stata (`src/components/PanelTabHub.tsx`)**:
   - `classic`: Option 1 — Regresi Data Panel (`PanelTab.tsx`, `panel-engine.ts`).
   - `accuracy`: Option 2 — Model Pengukuran Laten & Akurasi Panel (`PanelAccuracyTab.tsx`, `panel-accuracy-*.ts`).
   - `accuracy_v3`: Option 3 — Advanced Latent Measurement Model & Panel Accuracy Validation (`PanelAdvancedAccuracyTab.tsx`, `panel-adv-*.ts`).
   - `compare_2_3`: Evaluasi Komparatif Metodologi Opsi 2 vs Opsi 3 (`PanelMethodologyComparisonPanel.tsx`).
2. **Komponen & Endpoint Infrastruktur yang Dapat Dipanggil Tanpa Modifikasi**:
   - `POST /api/regression/upload`: Validasi magic bytes (`validateFileSignature`), pembacaan `.xlsx`, `.xls`, `.csv`, `.sav`, `.dta` multi-sheet via `xlsx`.
   - `POST /api/regression/import-link`: Pengunduhan spreadsheet ekspor Google Sheets anti-SSRF (`fetchGoogleSheetAsXlsx`) dengan batas ukuran 10 MB & timeout 15 detik.
   - Pustaka ekspor terpasang di `package.json`: `docx` (`^9.8.1`), `xlsx` (`^0.18.5`), `lucide-react` (`^0.475.0`), `vitest` (`^5.0.3`).
3. **Jaminan Zero-Regression (SHA-256 Terkunci)**:
   - Seluruh berkas sumber Option 1 (`PanelTab.tsx`, `panel-engine.ts`), Option 2 (`panel-accuracy-*.ts`, `PanelAccuracy*.tsx`), Option 3 (`panel-adv-*.ts`, `PanelAdvancedAccuracy*.tsx`), menu Analisis CED, dan menu Analisis Regresi Statistik **tidak boleh diubah satu byte pun**.
   - Hanya `src/components/PanelTabHub.tsx` (penambahan kartu pemilih `msma`), `src/app/globals.css` (penambahan aturan CSS ber-namespace `.msma-*` di bagian akhir untuk tabel responsif, tab aksesibel, dan `<dialog>` native), serta dokumen spesifikasi di `docs/` yang disentuh di luar folder baru `src/features/multi-source-accuracy/` dan `src/app/api/msma/`.

---

## 2. Phase 2 — Spesifikasi Metodologi Statistik & Decision Engine

### 2.1. Klasifikasi Konstruk Pengukuran: Contoh A vs Contoh B
- **Contoh A (*Same Measurement Construct*)**: Seluruh sumber memiliki definisi fisik sepadan, satuan identik (atau konversi faktor skalar eksak pada dimensi fisik yang sama, mis. `ton/tahun` ↔ `kiloton/tahun` dengan faktor $10^3$), cakupan spasial setara, dan resolusi temporal setara. Memenuhi syarat evaluasi collocation setelah uji asumsi.
- **Contoh B (*Different Measurement Construct*)**: Sumber mengukur besaran fisik berbeda (mis. inventaris emisi kota dalam `ton CO₂/tahun` vs kolom konsentrasi atmosfer `XCO₂ ppm`).
  - Sistem menolak penyamaan semu melalui standardisasi Z-score, Min-Max, atau normalisasi persentil.
  - Jika pengguna menyediakan model konversi fisik terverifikasi (mis. model *box/plume mass-balance* atau faktor inversi atmosfer terdokumentasi beserta ketidakpastian konversi $\sigma_{\text{conv},k}^2$), sistem mempropagasikan $\sigma_{\text{total},k}^2 = \sigma_{\varepsilon_k}^2 + \sigma_{\text{conv},k}^2$.
  - Jika tidak ada model konversi fisik yang sah, sistem **memblokir estimasi TCA/NCH/EC gabungan dan pemeringkatan bersama**, serta menampilkan rekomendasi desain penelitian alternatif.

### 2.2. Mesin Keputusan Metodologi Adaptif (`selectMeasurementMethod`)
Input: `sourceCount (J)`, `measurementType`, `commonTarget`, `panelStructure`, `errorIndependence`, `missingPattern`, `sampleSize`, `temporalStructure`, `spatialStructure`, `modelIdentifiability`.

| Jumlah Sumber $J$ | Kondisi Konstruk & Identifikasi | Metode Utama | Metode Alternatif | Aturan Pemeringkatan |
|---|---|---|---|---|
| $J = 2$ | Contoh A / Terharmonisasi | **Repeated-Measures Panel Bland-Altman** (Parker et al., 2020) + **Deming Regression** (Linnet, 1993) | Passing-Bablok / Pairwise Difference FE | **Dilarang membuat peringkat akurasi absolut individual** tanpa informasi eksternal rasio varians galat $\lambda = \sigma_{\varepsilon_2}^2/\sigma_{\varepsilon_1}^2$ atau Ground Truth |
| $J = 3$ | Contoh A, kovarians sinyal positif ($C_{12},C_{13},C_{23}$ konsisten), varians galat non-negatif | **Triple Collocation Analysis (TCA) & Extended Triple Collocation (ETC)** (Stoffelen, 1998; McColl et al., 2014) | Autocorrelated-Error Decomposed TC (Dong & Crow, 2017) / Pairwise Agreement | Peringkat berdasarkan **Calibrated Error Variance** $\hat{\sigma}_{\varepsilon_k,\text{cal}}^2 = \hat{\sigma}_{\varepsilon_k}^2/\hat{\beta}_k^2$ dan **ETC Correlation $R_k^2$**; peringatan keras & penahanan klaim bila terindikasi korelasi galat atau kasus Heywood ($\hat{\sigma}_{\varepsilon_k}^2 < 0$) |
| $J = 4$ | Contoh A, $\text{df}_{\text{cov}} = 10$ | **Four-Cornered Hat / N-Cornered Hat (NCH)** bila error independen; **Extended Collocation (EC)** (Gruber et al., 2016) bila tepat 1 pasangan berkorelasi galat teridentifikasi | Ensemble Multi-Triplet TCA + PSD-Constrained NCH (Premoli & Tavella, 1993) | Hanya mengestimasi paling banyak 1 kovarians galat lintas-sumber pada $J=4$ ($\binom{4}{2}=6$ kovarians lintas-sumber memberi 1 derajat bebas ekstra di atas 4 loading + 1 varians laten); tidak mengklaim seluruh korelasi galat dapat diestimasi |
| $J \ge 5$ | Contoh A, $\text{df}_{\text{cov}} = J(J+1)/2$ | **N-Cornered Hat (NCH)** (parsimoni utama bila galat independen) atau **Extended Collocation (EC)** (bila terdeteksi klaster korelasi galat antarsumber dan matriks Jacobian berperingkat penuh) | Generalized Least Squares Multi-Triplet Collocation | Membandingkan kelayakan identifikasi dan PSD antara NCH dan EC secara eksplisit |

### 2.3. Formulasi Matematika Eksak
1. **Repeated-Measures Panel Bland-Altman & Deming Regression ($J = 2$)**:
   - Selisih berpasangan $D_{it} = X_{1,it} - X_{2,it}$ dan rerata $M_{it} = (X_{1,it} + X_{2,it})/2$.
   - Dekomposisi komponen varians satu arah antar-kota ($G$ entitas): $\text{MS}_B$ dan $\text{MS}_W$ sehingga $\hat{\sigma}_w^2 = \text{MS}_W$, $\hat{\sigma}_b^2 = \max\!\left(0, \frac{\text{MS}_B - \text{MS}_W}{n_0}\right)$, dan $\hat{\sigma}_{\text{RM}}^2 = \hat{\sigma}_b^2 + \hat{\sigma}_w^2$, dengan *Limits of Agreement* $\bar{D} \pm 1.96\,\hat{\sigma}_{\text{RM}}$ (Parker et al., 2020).
   - Regresi Deming dengan rasio varians galat $\delta = \sigma_{\varepsilon_2}^2 / \sigma_{\varepsilon_1}^2$ (default $\delta = 1$ orthogonal):
     $$\hat{\beta}_{\text{Deming}} = \frac{(S_{22} - \delta S_{11}) + \sqrt{(S_{22} - \delta S_{11})^2 + 4\delta S_{12}^2}}{2 S_{12}}, \quad \hat{\alpha}_{\text{Deming}} = \bar{X}_2 - \hat{\beta}_{\text{Deming}}\bar{X}_1$$
     dengan SE dan 95% CI melalui *Entity-Level Jackknife / Cluster Bootstrap*.
2. **Triple Collocation Analysis & ETC ($J = 3$)**:
   - Matriks kovarians sampel $C_{jk} = \text{Cov}(X_j, X_k)$ pada observasi *complete-case* $N_{\text{CC}}$.
   - Dengan sumber acuan kalibrasi $r$ (default $r=1$: $\alpha_1=0, \beta_1=1$):
     $$\hat{\beta}_2 = \frac{C_{23}}{C_{13}}, \quad \hat{\beta}_3 = \frac{C_{23}}{C_{12}}, \quad \hat{\alpha}_k = \bar{X}_k - \hat{\beta}_k \bar{X}_1, \quad \hat{\sigma}_T^2 = \frac{C_{12}C_{13}}{C_{23}}$$
   - Varians galat skala asli masing-masing sumber:
     $$\hat{\sigma}_{\varepsilon_1}^2 = C_{11} - \frac{C_{12}C_{13}}{C_{23}}, \quad \hat{\sigma}_{\varepsilon_2}^2 = C_{22} - \frac{C_{12}C_{23}}{C_{13}}, \quad \hat{\sigma}_{\varepsilon_3}^2 = C_{33} - \frac{C_{13}C_{23}}{C_{12}}$$
   - Varians galat terkalibrasi pada skala target bersama (invarian terhadap rescaling unit sumber individual):
     $$\hat{\sigma}_{\varepsilon_k,\text{cal}}^2 = \frac{\hat{\sigma}_{\varepsilon_k}^2}{\hat{\beta}_k^2}, \quad \text{fMSE}_k = \frac{\hat{\sigma}_{\varepsilon_k}^2}{C_{kk}} = 1 - R_k^2, \quad R_k^2 = \frac{C_{kj}C_{km}}{C_{kk}C_{jm}}$$
3. **N-Cornered Hat & Extended Collocation ($J \ge 4$)**:
   - **Scale-Calibrated N-Cornered Hat**: Mengestimasi faktor skala $\hat{\beta}_k$ melalui rata-rata geometrik/median rasio triplet sah $\frac{C_{km}}{C_{1m}}$, mentransformasikan ke skala terkalibrasi $X_k^* = (X_k - \hat{\alpha}_k)/\hat{\beta}_k$, lalu menyelesaikan sistem kovarians selisih $S_{ij} = \text{Cov}(X_i^* - X_J^*, X_j^* - X_J^*) = \sigma_{\varepsilon_i}^2 \delta_{ij} + \sigma_{\varepsilon_J}^2$ dengan kendala *Positive Semidefinite* (Premoli & Tavella, 1993) serta membandingkan hasilnya terhadap median/GLS seluruh $\binom{J-1}{2}$ triplet TCA.
   - **Extended Collocation (Gruber et al., 2016)**: Mengevaluasi semua pasangan kandidat berkorelasi galat $(a,b)$ yang memenuhi syarat identifikasi kuartet $\{a, b, c, d\}$ di mana $\{c,d\}$ bebas korelasi silang: $\hat{\sigma}_T^2$ dan $\hat{\beta}$ diidentifikasi dari kuartet silang $C_{ac}, C_{ad}, C_{bc}, C_{bd}, C_{cd}$, sehingga kovarians galat $\hat{\sigma}_{\varepsilon_a\varepsilon_b} = C_{ab} - \hat{\beta}_a\hat{\beta}_b\hat{\sigma}_T^2$ teridentifikasi secara tertutup!
4. **Ketidakpastian Panel (Entity-Cluster Bootstrap)**:
   - Melakukan penarikan sampel ulang tingkat entitas (*cluster bootstrap by entity ID* $i = 1..G$) sebanyak $B$ replikasi deterministik ber-seed tetap untuk memperoleh SE, 95% *percentile confidence interval*, dan persentase stabilitas peringkat tanpa melanggar autokorelasi temporal dalam kota.

### 2.4. Daftar 18 Referensi Jurnal Terverifikasi Crossref
Seluruh 11 DOI *seed bibliography* ditambah 7 literatur metodologis fondasi telah diverifikasi langsung melalui `https://api.crossref.org/works/<DOI>` (detail tersimpan di `src/features/multi-source-accuracy/utils/bibliography.ts`).

---

## 3. Phase 3 — Arsitektur Teknis & Alur 11 Tahap (Step 0 – Step 10)

```text
src/features/multi-source-accuracy/
  types/index.ts                       # Kontrak tipe lengkap Step 0..Step 10, Undo, Report
  utils/numerical.ts                   # Aljabar matriks, kovarians, SVD/PSD, PRNG, distribusi, sanitasi
  utils/bibliography.ts                # 18 jurnal Crossref terverifikasi (7 kategori) + 24 istilah glosarium
  engine/data-validation.ts            # Parser CSV/XLSX multi-sheet, pemilihan baris header, preset Contoh A & B
  engine/panel-detection.ts            # Deteksi entity/time, balanced/unbalanced, gap, duplikat, distribusi kota
  engine/measurement-classification.ts # Detektor Contoh A vs Contoh B + model konversi fisik & blokir Z-score
  engine/descriptive-statistics.ts     # Statistik deskriptif, xtsum between/within, korelasi, outlier MAD/IQR
  engine/decision-engine.ts            # selectMeasurementMethod() multi-kriteria (J=2, 3, 4, >=5)
  engine/bland-altman-deming.ts        # Panel Repeated-Measures Bland-Altman + Deming Regression
  engine/triple-collocation.ts         # TCA & ETC (Stoffelen 1998; McColl 2014; Dong & Crow 2017 guard)
  engine/n-cornered-hat-ec.ts          # Premoli-Tavella N-Cornered Hat + Gruber (2016) Extended Collocation
  engine/diagnostics.ts                # Pengujian asumsi empiris vs tidak langsung vs tidak dapat diuji tanpa GT
  engine/transformation.ts             # Evaluasi 12 kandidat transformasi, syarat domain, Before vs After
  engine/uncertainty-robustness.ts     # Entity-Cluster Bootstrap & 8 skenario Robustness/Sensitivity Step 9
  engine/stata-code-generator.ts       # Stata 17/18 + Mata executable per step & kompilasi 9 blok Step 10
  engine/report-generator.ts           # Orkestrator pipeline, interpretasi 2 level, & 14-bagian artikel jurnal
  services/export-service.ts           # Generator PDF jurnal A4, DOCX/Google Docs, XLSX multi-sheet, .do, PNG/SVG
  hooks/use-msma-history.ts            # Immutable snapshot Undo / Redo / Reset Step / Restore Original / Audit Trail
  components/MsmaCharts.tsx            # 10 grafik SVG profesional responsif + tooltip + unduh PNG/SVG
  components/MsmaModals.tsx            # Native <dialog> Referensi 7 Kategori, Glosarium Istilah, Panduan, Reset
  components/MultiSourceAccuracyTab.tsx# Komponen utama Step 0 s.d. Step 10
src/app/api/msma/
  export/route.ts                      # Endpoint ekspor PDF, DOCX, XLSX, DO
  ai-interpret/route.ts                # Endpoint opsional penyempurnaan narasi akademik tervalidasi JSON
tests/unit/
  multi-source-accuracy.test.ts        # Suite pengujian sintetis Q.1–Q.6 (J=2, 3, 4, 5, Contoh A/B, Undo, Export)
```
