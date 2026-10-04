---
name: regresi-statistik-remedial
description: Aturan perbaikan asumsi regresi yang sah secara statistika, pelaporan hasil apa adanya, Normality Pass Rate, jalur R-kuadrat rendah, remedial khusus time series, label konfirmatori atau eksploratori, dan template interpretasi. Gunakan skill ini setiap kali menulis atau meninjau logika perbaikan data, pilihan transformasi, bootstrap, seleksi variabel, interpretasi otomatis, atau ekspor laporan, walau pengguna tidak menyebut kata "skill".
---

# Regresi statistik: remedial dan pelaporan jujur

Item bertanda (V) harus diverifikasi terhadap dokumentasi pustaka sebelum dipakai.

## 1. Prinsip hasil apa adanya
1. Model awal M0 (variabel dan metode pilihan pengguna) selalu tampil lengkap di layar dan di Word, apa pun hasilnya. Tidak ada hasil yang disembunyikan karena buruk.
2. Bila semua atau sebagian asumsi gagal dan pengguna tidak memilih perbaikan, laporan tetap dibuat dengan status asumsi apa adanya.
3. Perbaikan ditawarkan karena diagnostik asumsi gagal. Dilarang menawarkan perbaikan karena koefisien belum signifikan. Tidak ada tombol, teks, atau saran "buat signifikan".
4. Perbaikan tidak pernah berjalan otomatis. Pengguna memilih dan menyetujui.
5. Setiap percobaan (opsi, parameter, N, hasil uji) dicatat append-only di `analysis_events`. Laporan memuat jumlah spesifikasi yang dicoba (K) dan semua percobaan, bukan hanya yang terbaik.
6. Label status laporan, ditetapkan oleh kode, bukan oleh pengguna:
   - Konfirmatori: model akhir = M0, atau M0 ditambah satu perbaikan yang dipicu diagnostik asumsi dan dipilih tanpa membandingkan beberapa opsi berdasarkan hasil koefisien.
   - Eksploratori: ada pemilihan variabel, pencarian bentuk fungsi, atau beberapa opsi dibandingkan lalu satu dipilih.
   Label eksploratori disertai peringatan: p-value dan CI setelah seleksi cenderung terlalu optimistis; replikasi pada data baru dianjurkan.
7. "Signifikan" punya dua makna di aplikasi ini. Pertama, asumsi lulus uji (misal p normalitas lebih dari alpha). Kedua, model atau koefisien signifikan (p kurang dari alpha). Perbaikan boleh bertujuan memenuhi asumsi (makna pertama) bila metodenya sah. Perbaikan tidak boleh bertujuan mengubah makna kedua.

## 2. Matriks remedial per pelanggaran
| Pelanggaran | Remedial yang boleh ditawarkan | Catatan |
|---|---|---|
| Residu tidak normal | Hapus outlier, transformasi, robust, kuantil/Theil-Sen, bootstrap (bagian 3) | Jelaskan apa yang berubah pada tiap opsi |
| Heteroskedastisitas | Galat baku HC3 (default), WLS | HC3 hanya mengoreksi galat baku, estimasi B tetap |
| Multikolinearitas (VIF di atas 10) | Buang atau gabung X redundan, Ridge, PCA | Ridge mengubah estimator: CI klasik tidak berlaku, jelaskan |
| Autokorelasi (non time series) | Hanya bila pengguna menyatakan urutan baris bermakna: perlakukan sebagai time series | |
| Outlier berpengaruh | Regresi robust (Huber, Tukey), kuantil median, Theil-Sen (khusus SLR) | |
| Non-linearitas | Suku kuadrat/polinomial (variabel dipusatkan), log X, spline | Bandingkan dengan adjusted R2 dan validasi silang, bukan R2 mentah |

## 3. Opsi untuk residu tidak normal
| Opsi | Cara | Catatan statistik |
|---|---|---|
| 1. Hapus outlier | Tandai Studentized deleted residual di atas 3 atau Cook's D di atas 4/n; pengguna mengonfirmasi tiap baris; kumulatif maksimal 5 persen data | Wajib alasan tertulis dan analisis sensitivitas (dengan dan tanpa) |
| 2. Transformasi | ln, log10, akar kuadrat, Box-Cox | Box-Cox dihitung dari profil likelihood model regresi (bukan boxcox univariat pada Y). Tampilkan lambda dan CI, bulatkan ke nilai bermakna bila masuk CI. Y harus positif, bila tidak tawarkan konstanta geser dan tampilkan nilainya. R2 tidak sebanding lintas skala Y. Prediksi kembali ke skala asli memakai koreksi smearing Duan untuk log |
| 3. Robust | Huber atau Tukey bisquare (RLM), atau galat baku HC3 | HC3 tidak membuat residu normal |
| 4. Kuantil | Regresi kuantil median, atau Theil-Sen (khusus SLR) | Estimand menjadi median bersyarat |
| 5. Bootstrap | Non time series: case bootstrap, CI BCa 95 persen (V `scipy.stats.bootstrap`, paired). B minimal 1000 (default 5000), seed tetap dan dicatat. Time series: bootstrap blok (moving block atau stationary), bukan case bootstrap | Tidak bergantung normalitas. Laporkan replikat valid dan lebar CI |

## 4. Normality Pass Rate (PR)
- Berlaku untuk opsi yang mengubah residu: 1, 2, dan 3 (M-estimator).
- Non time series: B = 1000 subsampel tanpa pengembalian berukuran m = floor(0,8 n), fit ulang, uji normalitas residu tiap subsampel. PR = 100 kali jumlah subsampel dengan p lebih dari alpha dibagi B.
- Time series: subsampel berupa jendela kontigu (blok berurutan) berukuran m, bukan sampel acak, agar struktur waktu terjaga.
- Laporkan PR dengan interval Wilson 95 persen, dan PR model awal sebagai pembanding.
- Heuristik pembacaan (konvensi, bukan standar baku): 80 persen ke atas stabil, 50 sampai 80 borderline, di bawah 50 tidak stabil.
- Opsi yang tidak bergantung normalitas (HC3, kuantil, Theil-Sen, bootstrap): tulis "tidak berlaku" disertai alasan. Dilarang memberi angka PR palsu.
- Peringatan wajib: memilih opsi dengan PR tertinggi adalah forking path. Tampilkan semua opsi yang dicoba.
- Maksimal 3 kali fit ulang. Sesudahnya rekomendasikan opsi yang tidak bergantung normalitas.

## 5. Jalur R-kuadrat rendah atau F tidak signifikan
Pemicu (dapat diatur): uji F tidak signifikan, atau adjusted R2 kurang dari atau sama dengan 0, atau f2 = R2/(1 - R2) di bawah 0,15 (Cohen: 0,02 kecil, 0,15 sedang, 0,35 besar). Pemicu hanya menampilkan opsi dan penjelasan. R2 rendah bukan kesalahan: pada banyak bidang itu wajar.

Diagnosis otomatis:
- Efek terkecil yang dapat dideteksi (MDES) pada n, k, alpha, power 0,8, dari distribusi F non-sentral dengan parameter nonsentralitas f2 kali n (V terhadap G*Power). Jangan memakai post-hoc power.
- Titik berpengaruh yang menekan R2, bentuk hubungan (residu vs prediksi, RESET), rentang X sempit, kemungkinan galat ukur.

Opsi (pengguna memilih):
| Opsi | Isi | Pengaman |
|---|---|---|
| Bentuk fungsi | Polinomial dan interaksi (dipusatkan), log X, spline | Banding adjusted R2 dan validasi silang |
| Seleksi variabel | Enter, Forward, Backward, Stepwise, atau subset terbaik menurut AIC/BIC | Peringatan galat tipe I. Catat jumlah model dicoba. k-fold CV (k = 5 atau 10) untuk R2 di luar sampel. Koreksi Holm bila banyak koefisien diuji eksploratif. Label otomatis "eksploratori" |
| Perbaikan data | Salah kode, outlier, rentang sempit | Dicatat, perlu konfirmasi |
| Alternatif eksploratif | Korelasi Spearman, kuantil, GAM | Label "eksploratif, bukan pengganti uji terencana" |
| Terima hasil | Tidak ada hubungan linear terdeteksi | Hasil sah. Laporkan CI koefisien dan MDES |

Larangan: mengubah variabel atau data berulang sampai signifikan. Laporan akhir memuat semua percobaan.

## 6. Time series
Hanya aktif bila pengguna memilih "time series".
- Regresi lancung: bila Y dan X tidak stasioner dan residu tidak stasioner, beri peringatan keras bahwa hasil tidak dapat diandalkan. Tawarkan diferensiasi atau uji Engle-Granger (V). Model koreksi galat (ECM) di luar cakupan versi 1: sebut sebagai saran.
- Autokorelasi: galat baku HAC Newey-West dengan lag L = floor(4 kali (n/100) pangkat 2/9) sebagai default (V); atau GLSAR iterative (setara Cochrane-Orcutt, V apakah observasi pertama dipertahankan); atau tambah lag Y (model ARX, lalu Durbin-Watson tidak valid, pakai Breusch-Godfrey).
- Tren dan musiman: tawarkan variabel tren dan dummy musiman sesuai frekuensi.
- Heteroskedastisitas bersyarat (ARCH-LM gagal): HAC atau HC3, dan catat bahwa model varians (GARCH) di luar cakupan.
- Validasi: hold-out berurutan atau expanding-window. Dilarang k-fold acak.
- Bootstrap: bootstrap blok. PR: jendela kontigu.

## 7. Template interpretasi (Bahasa Indonesia)
Semua angka diisi dari hasil komputasi. Tidak ada angka diketik bebas.
- Model Summary: "Nilai R Square sebesar {R2} menunjukkan bahwa {R2_persen} persen variasi {Y} dapat dijelaskan oleh {daftar X}; {sisa_persen} persen dijelaskan faktor lain di luar model. Adjusted R Square sebesar {adjR2}."
- ANOVA: "Uji F menghasilkan F({df1}, {df2}) = {F} dengan Sig. {p}. Karena Sig. {kurang dari atau lebih dari} alpha {alpha}, H0 {ditolak atau gagal ditolak}: model {layak atau belum layak} digunakan untuk menjelaskan {Y}."
- Koefisien: "Setiap kenaikan satu satuan {Xi}, {Y} {naik atau turun} sebesar {B} satuan dengan variabel lain tetap (Sig. {p}; CI 95 persen {lo} sampai {hi}). Pengaruhnya {signifikan atau tidak signifikan} pada alpha {alpha}."
- Setelah transformasi: tambahkan "Skala {Y} telah ditransformasi {jenis}; interpretasi berlaku pada skala itu" dan cara kembali ke skala asli.
- Normalitas: "Uji {nama} menghasilkan Sig. {p}. Residu {berdistribusi normal atau tidak normal} pada alpha {alpha}. Q-Q plot {sejalan atau tidak sejalan}." Tambahkan catatan n besar bila n di atas 200.
- Heteroskedastisitas, multikolinearitas, autokorelasi: satu kalimat per uji memuat statistik, p atau ambang, dan kesimpulan.
- Durbin-Watson pada data non time series: "Durbin-Watson sebesar {DW}. Uji ini hanya bermakna untuk data berurutan."
- R2 rendah: "Model menjelaskan {R2_persen} persen variasi. Pada n = {n}, efek terkecil yang dapat dideteksi adalah f2 = {mdes}. Hasil ini tidak menunjukkan hubungan linear yang kuat, dan bukan bukti ketiadaan hubungan nonlinear."
- Perbaikan: "Opsi {nama} dicoba pada {tanggal}. Normality Pass Rate {PR} persen (CI 95 persen {lo} sampai {hi}) dibanding {PR_awal} persen sebelum perbaikan. Semua opsi yang dicoba tercantum pada Tabel {no}."
- Status: "Laporan ini berstatus {Konfirmatori atau Eksploratori}. Jumlah spesifikasi yang dicoba: {K}."
