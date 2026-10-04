---
name: regresi-statistik-inti
description: Aturan statistika untuk mesin regresi linear (SLR dan MLR) bergaya SPSS, mencakup estimasi OLS, dummy coding, uji asumsi klasik, jalur time series, tabel keluaran gaya SPSS, dan skor kesesuaian. Gunakan skill ini setiap kali menulis, mengubah, atau meninjau kode estimasi regresi, uji asumsi, tabel hasil, atau skor benchmark, walau pengguna tidak menyebut kata "skill".
---

# Regresi statistik: aturan inti

Semua nilai ambang di bawah adalah default yang dapat diubah pengguna. Item bertanda (V) harus diverifikasi terhadap dokumentasi pustaka atau output acuan sebelum dipakai. Jangan mengarang nilai tersertifikasi, p-value, atau nama fungsi.

## 1. Estimasi
- OLS dengan konstanta. Mesin utama `statsmodels`. Mesin verifikasi independen: `numpy.linalg.lstsq` (SVD), plus `scipy.stats.linregress` untuk SLR.
- Y numerik kontinu. Y biner atau ordinal: hentikan dan sarankan model lain (regresi logistik/ordinal), di luar cakupan.
- X kategorik: dummy coding, kategori referensi dipilih pengguna dan ditampilkan.
- Missing: listwise (default SPSS). Laporkan N awal, N terpakai, baris terbuang. Peringatan bila lebih dari 20 persen hilang.
- Kecukupan sampel (Green, 1991): n minimal 50 + 8k untuk uji model, 104 + k untuk uji prediktor. Kurang: peringatan. n <= k + 1 atau matriks X tidak berperingkat penuh: blokir dan sebut kolom bermasalah.
- Tanpa konstanta tidak didukung pada versi 1.

## 2. Pertanyaan data: time series atau bukan
Pengguna memilih satu. Pilihan menentukan uji dan remedial.
- Bukan time series: baris dianggap independen. Durbin-Watson tetap ditampilkan seperti SPSS dengan catatan "hanya acuan; baris tidak berurutan". Remedial autokorelasi tidak ditawarkan kecuali pengguna menyatakan urutan baris bermakna.
- Time series: pengguna memilih kolom waktu dan frekuensi (harian, mingguan, bulanan, kuartalan, tahunan, tidak beraturan). Data diurutkan menaik. Periksa duplikat dan celah waktu, laporkan. Semua uji bagian 3 jalur "time series" aktif.

## 3. Uji asumsi
Semua uji dijalankan dan dilaporkan. Tiap uji menghasilkan objek: nama, statistik, p-value (bila ada), kriteria, status (`lulus`, `gagal`, `tidak_berlaku`), alasan.

| Asumsi | Uji | Kriteria | Catatan |
|---|---|---|---|
| Normalitas residu | Shapiro-Wilk dan Kolmogorov-Smirnov (Lilliefors), keduanya selalu tampil | p lebih dari alpha | Default keputusan: Shapiro-Wilk bila n <= 50, Lilliefors bila lebih. K-S tanpa koreksi hanya sebagai opsi berlabel "tidak dikoreksi, konservatif" |
| Linearitas | Plot residu vs prediksi, Ramsey RESET (V) | p lebih dari alpha | |
| Homoskedastisitas | Breusch-Pagan versi Koenker (V), Glejser (regresikan abs(e) pada X) | p lebih dari alpha | Beri label versi uji yang dipakai |
| Multikolinearitas (MLR) | Tolerance, VIF, Collinearity Diagnostics | Tolerance di atas 0,10 dan VIF di bawah 10; waspada VIF di atas 5 | Condition index di atas 30 dengan dua proporsi varians atau lebih di atas 0,5 menandakan masalah (Belsley) |
| Outlier dan pengaruh | Studentized deleted residual, Cook's D, leverage | abs(t) di atas 3; D di atas 4/n; leverage di atas 2(k+1)/n | Hanya menandai, tidak menghapus |
| Autokorelasi, non time series | Durbin-Watson | sekitar 1,5 sampai 2,5 | Hanya acuan |
| Autokorelasi, time series | Durbin-Watson, Breusch-Godfrey (lag 1 sampai p), Ljung-Box pada residu, plot ACF/PACF | p lebih dari alpha | Durbin-Watson tidak valid bila ada Y tertinggal (lag Y) di model: pakai Breusch-Godfrey |
| Stasioneritas (time series) | ADF dan KPSS pada Y dan pada residu | ADF p kurang dari alpha dan KPSS p lebih dari alpha menyokong stasioner | Bila Y dan X tidak stasioner: peringatan regresi lancung (Granger-Newbold). Uji Engle-Granger (V) untuk kointegrasi |
| Heteroskedastisitas bersyarat (time series) | ARCH-LM (V) | p lebih dari alpha | |

Aturan normalitas:
- Lilliefors wajib karena mean dan SD diestimasi dari data (sesuai SPSS Explore). K-S tanpa koreksi meniru SPSS NPAR TESTS.
- Shapiro-Wilk di `scipy` akurat sampai n = 5000. Di atasnya beri peringatan.
- Untuk n sekitar 200 ke atas, uji formal terlalu sensitif. Tampilkan juga skewness, kurtosis, Q-Q plot, dan catat bahwa teorema limit pusat membuat inferensi koefisien relatif tahan.

## 4. Replikasi perilaku SPSS (V terhadap acuan)
- Tabel Excluded Variables dan toleransi masuk 0,0001.
- Centered leverage = h - 1/n. Mahalanobis = (n - 1) kali centered leverage.
- Casewise Diagnostics untuk abs(standardized residual) di atas 3.
- Collinearity Diagnostics: kolom X diskalakan ke panjang satuan termasuk konstanta, tanpa pemusatan (Belsley).
- Sig. ditampilkan tiga desimal tanpa nol di depan (".000"). Catatan kaki berhuruf a, b.
- Metode entri: Enter (default), Forward, Backward, Stepwise. Stepwise diberi peringatan galat tipe I.

## 5. Tabel keluaran gaya SPSS
1. Descriptive Statistics dan Correlations.
2. Variables Entered/Removed (dan Excluded Variables).
3. Model Summary: R, R Square, Adjusted R Square, Std. Error of the Estimate, Durbin-Watson.
4. ANOVA: Sum of Squares, df, Mean Square, F, Sig.
5. Coefficients: B, Std. Error, Beta, t, Sig., 95% CI untuk B, korelasi zero-order, partial, part, Tolerance, VIF.
6. Collinearity Diagnostics: Eigenvalue, Condition Index, Variance Proportions.
7. Residuals Statistics: Predicted Value, Std. Predicted Value, Residual, Std. Residual, Stud. Deleted Residual, Cook's Distance, Centered Leverage Value (Min, Max, Mean, Std. Deviation, N).
8. Casewise Diagnostics.
9. Tests of Normality, Normal P-P Plot, Q-Q Plot, histogram residu, residu vs prediksi. Time series: plot ACF/PACF dan plot residu terhadap waktu.

Tabel berupa elemen `<table>` semantik dengan `<caption>`, tanpa garis vertikal, garis horizontal gaya SPSS.

## 6. Acuan karena tidak ada lisensi SPSS
Urutan kepercayaan:
1. Nilai tersertifikasi NIST StRD (regresi linear). Pakai hanya dataset yang cocok fitur versi 1 (dengan konstanta): Norris, Pontius, Longley, Wampler1 dan Wampler2 sebagai kandidat. Dataset Filip dan Wampler3 sampai 5 sangat ill-conditioned: laporkan sebagai "uji kondisi", bukan syarat lulus. NoInt1 dan NoInt2 dilewati (tanpa konstanta). Unduh nilai dari situs NIST dan simpan sebagai fixture. Dilarang mengetik nilai dari ingatan.
2. R (`lm`, `car`, `lmtest`, `MASS`, `quantreg`, `boot`, `sandwich`). Skrip R disimpan di repo, keluarannya dibekukan sebagai fixture JSON.
3. GNU PSPP (V ketersediaan dan fitur yang dicakup). Pembanding tambahan, bukan kebenaran mutlak.
4. Contoh buku teks bersertifikat output SPSS: hanya bandingkan angka, jangan menyalin dataset atau tabel berhak cipta (V lisensi).
5. Golden file SPSS dari kontributor yang punya lisensi: tambahkan bila ada, tandai sumbernya.

## 7. Skor kesesuaian (tanpa klaim berlebihan)
| Skor | Definisi | Target |
|---|---|---|
| S1 Benchmark rilis | LRE = -log10(abs(q - c) / abs(c)), dibatasi 15; c nilai acuan, q nilai aplikasi; bila c = 0 pakai galat absolut. Dihitung per dataset per statistik | Dataset kondisi baik: LRE minimal 9 (V). Ill-conditioned: laporkan nilai, beri tanda kondisi |
| S2 Konkordansi tampilan | Persen sel tabel yang sama setelah dibulatkan ke presisi tampilan gaya SPSS, terhadap fixture R/PSPP | 100 persen |
| S3 Konsistensi per analisis | Persen cek lulus: dua mesin selisih relatif maksimal 1e-8; SST = SSR + SSE; R2 = SSR/SST; F = MSR/MSE; t kuadrat = F pada SLR; Beta = B kali sx/sy; p-value dihitung ulang; angka kondisi X di atas 1e8 beri peringatan | 100 persen |

Tampilan: "Konkordansi terhadap R, NIST, PSPP: {S2}% pada {n} dataset. Konsistensi komputasi analisis ini: {S3}% ({lulus}/{total} cek)." Dilarang menyebut "setara SPSS" atau "akurat 100 persen" untuk analisis pengguna. S3 di bawah 100 persen: tampilkan cek yang gagal dan tandai laporan.
