
import { MsmaBibliographyEntry, MsmaGlossaryItem } from '../types';

const DOI_RESOLVER_PREFIX = ['https:', '', 'doi.org', ''].join('/');

function makeBibEntry(entry: Omit<MsmaBibliographyEntry, 'url'>): MsmaBibliographyEntry {
  return {
    ...entry,
    url: `${DOI_RESOLVER_PREFIX}${entry.doi}`
  };
}

export const MSMA_VERIFIED_BIBLIOGRAPHY: MsmaBibliographyEntry[] = ([
  // 1. Triple Collocation (Seed #1, #2, #3, #4 + Foundational Stoffelen 1998 & McColl 2014)
  {
    id: 'dong_crow_2017',
    category: 'Triple Collocation',
    title: 'An Improved Triple Collocation Analysis Algorithm for Decomposing Autocorrelated and White Soil Moisture Retrieval Errors',
    authors: 'Dong, J.; Crow, W. T.',
    year: 2017,
    journal: 'Journal of Geophysical Research: Atmospheres',
    publisher: 'American Geophysical Union (AGU)',
    doi: '10.1002/2017JD027387',
    methodCovered: 'Autocorrelated & White Error Decomposition in Triple Collocation',
    contributionSummary:
      'Mengembangkan algoritma TCA yang memisahkan komponen galat acak putih (white noise) dan galat terautokorelasi temporal pada deret pengamatan berulang.',
    relevanceToFeature:
      'Menjadi dasar diagnostik autokorelasi temporal residual pada data panel multi-tahun di Step 6 dan Step 8.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'wu_etal_2019_albedo',
    category: 'Triple Collocation',
    title: 'Direct Comparison and Triple Collocation: Which Is More Reliable in the Validation of Coarse-Scale Satellite Surface Albedo Products',
    authors: 'Wu, X.; Xiao, Q.; Wen, J.; You, D.',
    year: 2019,
    journal: 'Journal of Geophysical Research: Atmospheres',
    publisher: 'American Geophysical Union (AGU)',
    doi: '10.1029/2018JD029937',
    methodCovered: 'Triple Collocation vs Direct Pairwise Comparison & Representativeness Error',
    contributionSummary:
      'Membuktikan keunggulan TCA atas perbandingan langsung ketika terdapat ketidaksesuaian skala spasial (representativeness error) tanpa referensi bebas galat.',
    relevanceToFeature:
      'Mendasari pemeriksaan representativeness error cakupan spasial antarsumber pada Step 3, Step 4, dan Step 6.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'wu_etal_2020_china',
    category: 'Triple Collocation',
    title: 'Triple Collocation-Based Assessment of Satellite Soil Moisture Products with In Situ Measurements in China: Understanding the Error Sources',
    authors: 'Wu, X.; Lu, G.; Wu, Z.; He, H.; Scanlon, T.; Dorigo, W.',
    year: 2020,
    journal: 'Remote Sensing',
    publisher: 'MDPI AG',
    doi: '10.3390/rs12142275',
    methodCovered: 'Multi-Source Satellite vs Ground Sensor TCA & Spatial Heterogeneity',
    contributionSummary:
      'Mengevaluasi produk satelit dan sensor lapangan secara simultan dengan TCA untuk mengidentifikasi determinan heterogenitas galat lintas lokasi.',
    relevanceToFeature:
      'Mendukung analisis heterogenitas lintas kota/entitas dan perbandingan sensor lapangan vs satelit di Step 5 & Step 9.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'wu_etal_2023_rescaling',
    category: 'Triple Collocation',
    title: 'A global-scale intercomparison of Triple Collocation Analysis- and ground-based soil moisture time-variant errors derived from different rescaling techniques',
    authors: 'Wu, K.; Ryu, D.; Wagner, W.; Hu, Z.',
    year: 2023,
    journal: 'Remote Sensing of Environment',
    publisher: 'Elsevier BV',
    doi: '10.1016/j.rse.2022.113387',
    methodCovered: 'Rescaling & Calibration Sensitivity in Triple Collocation',
    contributionSummary:
      'Mengkaji dampak teknik rescaling/kalibrasi skala terhadap estimasi varians galat TCA agar perbandingan antarsumber tidak bias terhadap pemilihan referensi.',
    relevanceToFeature:
      'Menjadi landasan penyetaraan varians galat terkalibrasi (σ²_ε,k / β²_k) sebelum menyusun peringkat akurasi relatif di Step 8.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'stoffelen_1998',
    category: 'Triple Collocation',
    title: 'Toward the true near-surface wind speed: Error modeling and calibration using triple collocation',
    authors: 'Stoffelen, A.',
    year: 1998,
    journal: 'Journal of Geophysical Research: Oceans',
    publisher: 'American Geophysical Union (AGU)',
    doi: '10.1029/97JC03180',
    methodCovered: 'Foundational Linear Calibration & Error Variance Triple Collocation',
    contributionSummary:
      'Memperkenalkan model pengukuran linear X_k = α_k + β_k T + ε_k untuk mengestimasi faktor kalibrasi dan varians galat tiga sistem pengamatan tanpa Ground Truth.',
    relevanceToFeature:
      'Formulasi matematis utama estimasi koefisien kalibrasi dan varians galat TCA pada Step 8.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'mccoll_etal_2014',
    category: 'Triple Collocation',
    title: 'Extended triple collocation: Estimating errors and correlation coefficients with respect to an unknown target',
    authors: 'McColl, K. A.; Vogelzang, J.; Konings, A. G.; Entekhabi, D.; Piles, M.; Stoffelen, A.',
    year: 2014,
    journal: 'Geophysical Research Letters',
    publisher: 'American Geophysical Union (AGU)',
    doi: '10.1002/2014GL061322',
    methodCovered: 'Extended Triple Collocation (ETC): Truth Correlation R² & SNR',
    contributionSummary:
      'Menurunkan korelasi teoretis masing-masing instrumen terhadap variabel target tak teramati (R_k) dan rasio sinyal-terhadap-derau (SNR) yang bebas skala kalibrasi.',
    relevanceToFeature:
      'Digunakan untuk menghitung R²_ETC, fMSE, dan SNR (dB) pendamping varians galat TCA di Step 8.',
    verifiedVia: 'Crossref API'
  },

  // 2. Extended Collocation
  {
    id: 'gruber_etal_2016_ec',
    category: 'Extended Collocation',
    title: 'Estimating error cross-correlations in soil moisture data sets using extended collocation analysis',
    authors: 'Gruber, A.; Su, C.-H.; Crow, W. T.; Zwieback, S.; Dorigo, W.; Wagner, W.',
    year: 2016,
    journal: 'Journal of Geophysical Research: Atmospheres',
    publisher: 'American Geophysical Union (AGU)',
    doi: '10.1002/2015JD024027',
    methodCovered: 'Extended Collocation (EC) for J >= 4 Sources with Error Cross-Covariance',
    contributionSummary:
      'Memperluas TCA ke J >= 4 sumber untuk mengidentifikasi baik varians galat diagonal maupun kovarians galat lintas-sumber tertentu melalui pencocokan kuartet kovarians.',
    relevanceToFeature:
      'Metode inti untuk kondisi J = 4 dan J >= 5 ketika asumsi independensi galat antarsumber dilanggar secara teridentifikasi.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'gruber_etal_2016_review',
    category: 'Extended Collocation',
    title: 'Recent advances in (soil moisture) triple collocation analysis',
    authors: 'Gruber, A.; Su, C.-H.; Zwieback, S.; Crow, W.; Dorigo, W.; Wagner, W.',
    year: 2016,
    journal: 'International Journal of Applied Earth Observation and Geoinformation',
    publisher: 'Elsevier BV',
    doi: '10.1016/j.jag.2015.09.002',
    methodCovered: 'Collocation Assumptions, SNR Metrics & Sample Adequacy',
    contributionSummary:
      'Menyajikan sintesis komprehensif asumsi ortogonalitas, independensi galat, stasioneritas kovarians, serta syarat ukuran sampel pada keluarga metode collocation.',
    relevanceToFeature:
      'Rujukan utama taksonomi pengujian asumsi empiris vs tidak langsung pada Step 6.',
    verifiedVia: 'Crossref API'
  },

  // 3. N-Cornered Hat
  {
    id: 'premoli_tavella_1993',
    category: 'N-Cornered Hat',
    title: 'A revisited three-cornered hat method for estimating frequency standard instability',
    authors: 'Premoli, A.; Tavella, P.',
    year: 1993,
    journal: 'IEEE Transactions on Instrumentation and Measurement',
    publisher: 'Institute of Electrical and Electronics Engineers (IEEE)',
    doi: '10.1109/19.206671',
    methodCovered: 'PSD-Constrained Three/N-Cornered Hat Variance Estimation',
    contributionSummary:
      'Memformulasikan penyelesaian matriks kovarians selisih N-sumber dengan kendala definit positif agar estimasi varians instrumen tetap bermakna fisik (bebas varians negatif).',
    relevanceToFeature:
      'Dasar komputasi N-Cornered Hat (J = 4 dan J >= 5) dengan penjaga positive semidefinite di Step 8.',
    verifiedVia: 'Crossref API'
  },

  // 4. Correlated Error (Seed #5 & #6)
  {
    id: 'gonzalez_gambau_etal_2020',
    category: 'Correlated Error',
    title: 'Triple Collocation Analysis for Two Error-Correlated Datasets: Application to L-Band Brightness Temperatures over Land',
    authors: 'González-Gambau, V.; Turiel, A.; González-Haro, C.; Martínez, J.; Olmedo, E.; Oliva, R.; Martín-Neira, M.',
    year: 2020,
    journal: 'Remote Sensing',
    publisher: 'MDPI AG',
    doi: '10.3390/rs12203381',
    methodCovered: 'Error-Correlated Triple Collocation Bias & Sensitivity',
    contributionSummary:
      'Menunjukkan bagaimana korelasi galat positif antara dua sumber mendistorsi estimasi varians TCA klasik dan memformulasikan analisis koreksi/sensitivitas ketika informasi tambahan tersedia.',
    relevanceToFeature:
      'Digunakan pada Step 6, Step 8, dan Step 9 untuk mendeteksi risiko korelasi galat dan menguji sensitivitas ρ_ε pada J = 3.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'balasubramaniam_ruf_2025',
    category: 'Correlated Error',
    title: 'The Impact on Triple/N-Way Collocation-Based Validation of Remote Sensing Products Due to Non-Ideal Error Statistics',
    authors: 'Balasubramaniam, R.; Ruf, C.',
    year: 2025,
    journal: 'Remote Sensing',
    publisher: 'MDPI AG',
    doi: '10.3390/rs17223751',
    methodCovered: 'Non-Ideal Error Statistics in Triple and N-Way Collocation',
    contributionSummary:
      'Mengkuantifikasi bias estimasi varians galat pada validasi 3-arah dan N-arah akibat non-linearitas, ketidakstasioneran, serta korelasi silang galat.',
    relevanceToFeature:
      'Mendasari aturan kehati-hatian Decision Engine agar tidak memaksakan pemeringkatan ketika statistik galat menyimpang tajam dari kondisi ideal.',
    verifiedVia: 'Crossref API'
  },

  // 5. Panel Measurement Models
  {
    id: 'parker_etal_2020',
    category: 'Panel Measurement Models',
    title: 'Using multiple agreement methods for continuous repeated measures data: a tutorial for practitioners',
    authors: 'Parker, R. A.; Scott, C.; Inácio, V.; Stevens, N. T.',
    year: 2020,
    journal: 'BMC Medical Research Methodology',
    publisher: 'Springer Science and Business Media LLC',
    doi: '10.1186/s12874-020-01022-x',
    methodCovered: 'Repeated-Measures Bland-Altman & Clustered Agreement on Panel Data',
    contributionSummary:
      'Menjabarkan metode kesepakatan pengukuran berulang per entitas agar Limits of Agreement tidak menyempit secara semu akibat klasterisasi dalam subjek/kota.',
    relevanceToFeature:
      'Metode utama untuk kondisi dua sumber (J = 2) pada struktur data panel di Step 6 dan Step 8.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'linnet_1993',
    category: 'Panel Measurement Models',
    title: 'Evaluation of regression procedures for methods comparison studies',
    authors: 'Linnet, K.',
    year: 1993,
    journal: 'Clinical Chemistry',
    publisher: 'Oxford University Press (OUP)',
    doi: '10.1093/clinchem/39.3.424',
    methodCovered: 'Weighted & Orthogonal Deming Regression with Measurement Error in Both Variables',
    contributionSummary:
      'Membuktikan bahwa regresi OLS biasa mengalami bias atenuasi ketika kedua instrumen mengandung galat pengukuran, serta merekomendasikan Deming Regression dengan SE jackknife.',
    relevanceToFeature:
      'Metode pendamping Bland-Altman pada kondisi J = 2 untuk menguji bias proporsional dan intersep sistematis secara simetris.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'roodman_etal_2019',
    category: 'Panel Measurement Models',
    title: 'Fast and wild: Bootstrap inference in Stata using boottest',
    authors: 'Roodman, D.; Nielsen, M. Ø.; MacKinnon, J. G.; Webb, M. D.',
    year: 2019,
    journal: 'The Stata Journal',
    publisher: 'SAGE Publications',
    doi: '10.1177/1536867X19830877',
    methodCovered: 'Cluster-Preserving Resampling Inference in Panel Econometrics',
    contributionSummary:
      'Menetapkan standar inferensi bootstrap pada data berklaster/panel agar ketergantungan serial dalam entitas tetap terjaga.',
    relevanceToFeature:
      'Menjadi dasar penggunaan Entity-Cluster Bootstrap (bukan i.i.d. row bootstrap) untuk interval ketidakpastian di Step 8.',
    verifiedVia: 'Crossref API'
  },

  // 6. Urban CO2 Emission Validation (Seed #7, #10, #11)
  {
    id: 'fu_etal_2019',
    category: 'Urban CO₂ Emission Validation',
    title: 'A Comparative Analysis of Anthropogenic CO₂ Emissions at City Level Using OCO-2 Observations: A Global Perspective',
    authors: 'Fu, P.; Xie, Y.; Moore, C.; Myint, S.; Bernacchi, C.',
    year: 2019,
    journal: "Earth's Future",
    publisher: 'American Geophysical Union (AGU)',
    doi: '10.1029/2019EF001282',
    methodCovered: 'City-Level Anthropogenic CO₂ Inventory vs OCO-2 Satellite Evaluation',
    contributionSummary:
      'Membandingkan estimasi emisi CO₂ tingkat kota lintas wilayah global dengan pengamatan satelit OCO-2 serta menyoroti perbedaan definisi batas kota dan resolusi jejak.',
    relevanceToFeature:
      'Rujukan empiris utama dalam memeriksa kesepadanan cakupan spasial kota (Contoh A vs Contoh B) pada Step 4.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'yang_etal_2023',
    category: 'Urban CO₂ Emission Validation',
    title: 'Using Space-Based CO₂ and NO₂ Observations to Estimate Urban CO₂ Emissions',
    authors: 'Yang, E. G.; Kort, E. A.; Ott, L. E.; Oda, T.; Lin, J. C.',
    year: 2023,
    journal: 'Journal of Geophysical Research: Atmospheres',
    publisher: 'American Geophysical Union (AGU)',
    doi: '10.1029/2022JD037736',
    methodCovered: 'Satellite-Derived Urban CO₂ Emission Estimation & Uncertainty Propagation',
    contributionSummary:
      'Mengkombinasikan pengamatan antariksa CO₂ dan NO₂ untuk mengestimasi fluks emisi perkotaan beserta propagasi ketidakpastian konversi dari kolom konsentrasi ke fluks.',
    relevanceToFeature:
      'Mendukung fitur dokumentasi dan propagasi uncertainty konversi fisik dari konsentrasi (ppm) ke emisi (ton/tahun) pada Contoh B di Step 4.',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'che_etal_2024',
    category: 'Urban CO₂ Emission Validation',
    title: 'Urban XCO₂ Gradients From a Dense Network of Solar Absorption Spectrometers and OCO-3 Over Mexico City',
    authors: 'Che, K.; Lauvaux, T.; Taquet, N.; Stremme, W.; Xu, Y.; Alberti, C.; Lopez, M.; García-Reynoso, A.; Ciais, P.; Liu, Y.; Ramonet, M.; Grutter, M.',
    year: 2024,
    journal: 'Journal of Geophysical Research: Atmospheres',
    publisher: 'American Geophysical Union (AGU)',
    doi: '10.1029/2023JD040063',
    methodCovered: 'Ground Spectrometer Sensor Network vs Spaceborne OCO-3 XCO₂ Gradients',
    contributionSummary:
      'Memvalidasi gradien XCO₂ perkotaan antara jaringan instrumen permukaan rapat dan pemindaian satelit OCO-3.',
    relevanceToFeature:
      'Menunjukkan perbedaan karakter galat representativitas sensor titik lapangan dibanding sapuan piksel satelit pada panel perkotaan.',
    verifiedVia: 'Crossref API'
  },

  // 7. Atmospheric Inversion (Seed #8 & #9)
  {
    id: 'yang_etal_2020_me',
    category: 'Atmospheric Inversion',
    title: 'Using Space-Based Observations and Lagrangian Modeling to Evaluate Urban Carbon Dioxide Emissions in the Middle East',
    authors: 'Yang, E. G.; Kort, E. A.; Wu, D.; Lin, J. C.; Oda, T.; Ye, X.; Lauvaux, T.',
    year: 2020,
    journal: 'Journal of Geophysical Research: Atmospheres',
    publisher: 'American Geophysical Union (AGU)',
    doi: '10.1029/2019JD031922',
    methodCovered: 'Lagrangian Atmospheric Transport Modeling Linking XCO₂ to Urban Emissions',
    contributionSummary:
      'Menggunakan model transpor atmosfer Lagrangian untuk menghubungkan kolom XCO₂ satelit dengan inventaris emisi CO₂ perkotaan.',
    relevanceToFeature:
      'Menjelaskan mengapa konsentrasi XCO₂ (ppm) membutuhkan model transpor/inversi fisik sebelum dibandingkan dengan inventaris emisi (ton/tahun).',
    verifiedVia: 'Crossref API'
  },
  {
    id: 'lian_etal_2023_paris',
    category: 'Atmospheric Inversion',
    title: 'Can we use atmospheric CO₂ measurements to verify emission trends reported by cities? Lessons from a 6-year atmospheric inversion over Paris',
    authors: 'Lian, J.; Lauvaux, T.; Utard, H.; Bréon, F.-M.; Broquet, G.; Ramonet, M.; Laurent, O.; Albarus, I.; Chariot, M.; Kotthaus, S.; Haeffelin, M.; Sanchez, O.; Perrussel, O.; Denier van der Gon, H.; Dellaert, S.; Ciais, P.',
    year: 2023,
    journal: 'Atmospheric Chemistry and Physics',
    publisher: 'Copernicus GmbH',
    doi: '10.5194/acp-23-8823-2023',
    methodCovered: '6-Year Panel Verification of City Self-Reported Emissions via Atmospheric Inversion',
    contributionSummary:
      'Mengevaluasi tren emisi CO₂ kota selama 6 tahun melalui inversi atmosfer multi-stasiun dibandingkan pelaporan mandiri kota.',
    relevanceToFeature:
      'Studi kasus acuan langsung untuk evaluasi panel 6-tahun emisi kota antara pelaporan mandiri, sensor, dan pemantauan atmosfer.',
    verifiedVia: 'Crossref API'
  }
] as Array<Omit<MsmaBibliographyEntry, 'url'>>).map(makeBibEntry);

export const MSMA_GLOSSARY_ITEMS: Record<string, MsmaGlossaryItem> = {
  ground_truth: {
    termKey: 'ground_truth',
    termLabel: 'Ground Truth',
    fullExpansion: 'Ground Truth (Nilai Kebenaran Acuan Bebas Kesalahan)',
    simpleDefinition:
      'Ukuran standar emas yang dianggap 100% benar tanpa kesalahan pengukuran.',
    technicalExplanation:
      'Dalam ekonometrika dan metrologi lingkungan, Ground Truth adalah realisasi eksak variabel target T tanpa komponen galat acak maupun bias sistematis (ε = 0, α = 0, β = 1). Pada data emisi kota atau penginderaan jauh, Ground Truth hampir tidak pernah tersedia karena setiap metode (pemkot, satelit, sensor) memiliki keterbatasan tersendiri.',
    whyImportant:
      'Tanpa Ground Truth, kita tidak boleh menganggap satu sumber otomatis paling benar lalu menghukum sumber lain yang berbeda darinya.',
    simpleExample:
      'Tiga jam tangan menunjukkan 10:01, 10:02, dan 10:08 tanpa adanya jam atom sebagai acuan mutlak.',
    impactOnAnalysis:
      'Mengharuskan penggunaan model variabel laten atau Collocation (TCA, NCH, EC) yang menilai akurasi relatif dari struktur kovarians antarsumber.'
  },
  latent_variable: {
    termKey: 'latent_variable',
    termLabel: 'Latent Variable',
    fullExpansion: 'Latent Variable (Variabel Laten / Sinyal Sebenarnya T)',
    simpleDefinition:
      'Besaran nyata di dunia fisik yang ingin kita ukur, tetapi hanya bisa diamati secara tidak langsung lewat beberapa instrumen.',
    technicalExplanation:
      'Direpresentasikan sebagai T_it pada entitas i dan waktu t dalam persamaan X_k,it = α_k + β_k T_it + ε_k,it. Sinyal laten T_it menangkap variasi bersama yang konsisten di seluruh sumber pengukuran yang independen.',
    whyImportant:
      'Menjadi jangkar matematis bersama untuk memisahkan variasi emisi nyata antarkota/tahun dari derau masing-masing alat ukur.',
    simpleExample:
      'Jumlah emisi CO₂ riil yang keluar dari seluruh aktivitas sebuah kota dalam satu tahun.',
    impactOnAnalysis:
      'Jika variasi sinyal laten T_it terlalu kecil dibanding noise instrumen, parameter kalibrasi dan varians galat menjadi tidak stabil.'
  },
  measurement_error: {
    termKey: 'measurement_error',
    termLabel: 'Measurement Error',
    fullExpansion: 'Measurement Error (Kesalahan / Galat Pengukuran ε_k)',
    simpleDefinition:
      'Selisih antara angka yang dicatat oleh suatu sumber pengukuran dan nilai sebenarnya setelah disetarakan skalanya.',
    technicalExplanation:
      'Terdiri atas komponen sistematis (bias aditif α_k dan bias skala multiplikatif β_k) serta komponen acak ε_k,it dengan varians σ²_ε,k.',
    whyImportant:
      'Galat pengukuran menyebabkan bias atenuasi pada regresi biasa dan dapat menyesatkan evaluasi kebijakan apabila diabaikan.',
    simpleExample:
      'Sensor udara mencatat sedikit lebih tinggi saat kelembapan berubah walaupun emisi kota tetap.',
    impactOnAnalysis:
      'Tujuan inti analisis ini adalah mengestimasi besarnya varians galat acak setiap sumber secara objektif.'
  },
  error_variance: {
    termKey: 'error_variance',
    termLabel: 'Error Variance',
    fullExpansion: 'Measurement Error Variance (Varians Kesalahan Pengukuran σ²_ε)',
    simpleDefinition:
      'Ukuran seberapa besar ketidakkonsistenan atau goyangan acak suatu sumber pengukuran.',
    technicalExplanation:
      'Nilai harapan kuadrat simpangan galat acak E[ε²_k]. Agar dapat dibandingkan secara adil lintas sumber yang berbeda faktor skala β_k, varians galat disetarakan ke skala target bersama menjadi σ²_ε,k,cal = σ²_ε,k / β²_k.',
    whyImportant:
      'Menjadi indikator utama presisi relatif: semakin kecil varians galat terkalibrasi, semakin presisi dan konsisten sumber tersebut.',
    simpleExample:
      'Timbangan A goyang ±0.1 kg tiap kali menimbang benda sama (varians kecil), sedangkan Timbangan B goyang ±1.5 kg (varians besar).',
    impactOnAnalysis:
      'Digunakan sebagai dasar pemeringkatan akurasi relatif ketika seluruh asumsi identifikasi model terpenuhi.'
  },
  bias: {
    termKey: 'bias',
    termLabel: 'Bias',
    fullExpansion: 'Systematic Additive & Multiplicative Bias (Bias Aditif α & Proporsional β)',
    simpleDefinition:
      'Kecenderungan suatu sumber untuk selalu mencatat terlalu tinggi atau terlalu rendah secara konsisten.',
    technicalExplanation:
      'Dalam model X_k = α_k + β_k T + ε_k, α_k adalah pergeseran konstan (additive offset) dan β_k ≠ 1 adalah distorsi kemiringan (proportional/multiplicative scaling bias). Tanpa Ground Truth, α_k dan β_k hanya teridentifikasi secara relatif terhadap satu skala acuan kalibrasi.',
    whyImportant:
      'Instrumen bisa sangat presisi (varians galat kecil) namun selalu meleset konstan sebesar +500 ton jika belum dikalibrasi.',
    simpleExample:
      'Termometer yang selalu lebih tinggi 2°C dari suhu asli tetapi sangat stabil.',
    impactOnAnalysis:
      'Tanpa Ground Truth, bias absolut bersama (common-mode bias) tidak dapat dideteksi; yang terukur adalah bias relatif antarsumber.'
  },
  covariance: {
    termKey: 'covariance',
    termLabel: 'Covariance',
    fullExpansion: 'Sample Variance-Covariance Matrix (Matriks Kovarians Sampel C_jk)',
    simpleDefinition:
      'Ukuran seberapa searah dua sumber pengukuran bergerak naik dan turun bersama di berbagai kota dan tahun.',
    technicalExplanation:
      'Didefinisikan sebagai C_jk = Cov(X_j, X_k) = (1/(N-1)) Σ (X_j - X̄_j)(X_k - X̄_k). Di bawah asumsi galat saling bebas, kovarians silang hanya memuat sinyal murni: C_jk = β_j β_k σ²_T untuk j ≠ k, sementara diagonal C_kk = β²_k σ²_T + σ²_ε,k.',
    whyImportant:
      'Kovarians silang adalah kunci aljabar yang memungkinkan TCA dan Extended Collocation memisahkan varians sinyal dari varians galat.',
    simpleExample:
      'Saat kota besar punya emisi tinggi di Pemkot dan juga tinggi di Satelit, kovarians keduanya bernilai positif besar.',
    impactOnAnalysis:
      'Jika kovarians silang mendekati nol atau negatif, rasio kalibrasi menjadi tidak stabil dan model tidak teridentifikasi.'
  },
  triple_collocation: {
    termKey: 'triple_collocation',
    termLabel: 'Triple Collocation',
    fullExpansion: 'Triple Collocation Analysis (TCA — Analisis Kolokasi Tiga Sumber)',
    simpleDefinition:
      'Metode statistik untuk menghitung tingkat kesalahan masing-masing dari tepat 3 sumber pengukuran yang independen tanpa membutuhkan data kebenaran mutlak.',
    technicalExplanation:
      'Diperkenalkan oleh Stoffelen (1998) dan diperluas oleh McColl et al. (2014). Dengan 3 sumber pengamatan atas target fisik yang sama, terdapat 6 elemen unik matriks kovarians (C_11, C_22, C_33, C_12, C_13, C_23) yang tepat mengidentifikasi 6 parameter (β_2, β_3, σ²_T, σ²_ε1, σ²_ε2, σ²_ε3) dengan menetapkan skala referensi β_1 = 1.',
    whyImportant:
      'Memungkinkan pemeringkatan akurasi relatif ketika kita punya 3 sumber berbeda (mis. Pemkot, Satelit, Sensor).',
    simpleExample:
      'Mengetahui jam mana yang paling stabil dari 3 jam berbeda dengan membandingkan selisih ketiganya dari waktu ke waktu.',
    impactOnAnalysis:
      'Peka terhadap pelanggaran asumsi independensi galat: jika 2 dari 3 sumber berbagi sumber kesalahan yang sama, varians galat keduanya akan tampak lebih kecil secara semu.'
  },
  extended_collocation: {
    termKey: 'extended_collocation',
    termLabel: 'Extended Collocation',
    fullExpansion: 'Extended Collocation Analysis (EC — Kolokasi Diperluas untuk ≥4 Sumber)',
    simpleDefinition:
      'Pengembangan Triple Collocation untuk 4 sumber atau lebih yang mengizinkan sebagian pasangan sumber memiliki kesalahan yang saling berkorelasi.',
    technicalExplanation:
      'Dikembangkan oleh Gruber et al. (2016). Ketika J >= 4, jumlah momen kovarians J(J+1)/2 melebihi jumlah parameter dasar 2J, sehingga derajat bebas tambahan dapat dipakai mengestimasi kovarians galat lintas-sumber σ_εa,εb sepanjang terdapat pasangan instrumen lain yang independen sebagai kuartet pengidentifikasi.',
    whyImportant:
      'Mengatasi kelemahan TCA klasik saat dua instrumen memiliki keterkaitan metodologis (mis. dua produk satelit dengan algoritma serupa).',
    simpleExample:
      'Memiliki 4 sumber data di mana 2 di antaranya sama-sama berasal dari sensor optik satelit yang terganggu awan.',
    impactOnAnalysis:
      'Tetap membutuhkan pemeriksaan identifikasi matriks: empat sumber hanya dapat mengidentifikasi paling banyak 1 korelasi galat lintas-sumber, bukan semuanya sekaligus.'
  },
  n_cornered_hat: {
    termKey: 'n_cornered_hat',
    termLabel: 'N-Cornered Hat',
    fullExpansion: 'Three / Four / N-Cornered Hat Method (Metode Topi Berpenjuru-N)',
    simpleDefinition:
      'Metode klasik metrologi untuk 3, 4, atau lebih sumber pengukuran yang menghitung varians kesalahan tiap sumber dari varians selisih antar-pasangan sumber.',
    technicalExplanation:
      'Dipopulerkan oleh Gray & Allan (1974) serta Premoli & Tavella (1993). Setelah skala sumber disetarakan, matriks kovarians selisih terhadap sumber ke-J didekomposisi dengan kendala Positive Semidefinite (PSD) dan dirata-ratakan lintas kombinasi triplet.',
    whyImportant:
      'Sangat stabil dan parsimonius untuk 4 sumber atau lebih ketika galat antarsumber bersifat independen.',
    simpleExample:
      'Membandingkan stabilitas 4 stasiun pemantau kualitas udara yang sudah memakai satuan dan kalibrasi setara.',
    impactOnAnalysis:
      'Diprioritaskan sebagai estimator utama untuk J >= 4 bila tidak ada bukti kuat korelasi galat lintas-sumber.'
  },
  bland_altman: {
    termKey: 'bland_altman',
    termLabel: 'Bland-Altman',
    fullExpansion: 'Repeated-Measures Panel Bland-Altman Limits of Agreement (LoA)',
    simpleDefinition:
      'Metode visual dan statistik untuk menilai seberapa dekat kesepakatan dua sumber pengukuran berdasarkan rata-rata selisih dan rentang selisih wajarnya (95% Limits of Agreement).',
    technicalExplanation:
      'Menghitung selisih D_it = X_1,it - X_2,it terhadap rerata M_it = (X_1,it + X_2,it)/2. Untuk data panel berulang per kota, varians selisih didekomposisi menjadi varians antarkota (σ²_b) dan dalam-kota (σ²_w) sesuai Parker et al. (2020) agar batas kesepakatan tidak terlalu sempit.',
    whyImportant:
      'Korelasi tinggi belum tentu berarti dua sumber menghasilkan angka yang sama; Bland-Altman memperlihatkan bias rata-rata dan lebar penyimpangan nyata.',
    simpleExample:
      'Mengecek apakah laporan Pemkot rata-rata selisih -120 ton dibanding Sensor dengan rentang selisih -450 s.d. +210 ton.',
    impactOnAnalysis:
      'Untuk 2 sumber tanpa Ground Truth, Bland-Altman hanya mengukur kesepakatan bersama, BUKAN membuktikan sumber mana yang lebih akurat.'
  },
  deming_regression: {
    termKey: 'deming_regression',
    termLabel: 'Deming Regression',
    fullExpansion: 'Deming Error-in-Variables Regression (Regresi Deming Simetris)',
    simpleDefinition:
      'Garis regresi khusus untuk membandingkan dua alat ukur yang sama-sama punya kesalahan pengukuran.',
    technicalExplanation:
      'Berbeda dari OLS biasa yang mengasumsikan sumbu X bebas galat, Deming Regression meminimalkan jarak kuadrat terboboti pada arah X dan Y sekaligus berdasarkan rasio varians galat λ = σ²_ε2 / σ²_ε1 (ketika λ = 1 disebut Orthogonal Regression).',
    whyImportant:
      'Mencegah kemiringan garis kalibrasi mengecil secara palsu (attenuation bias) saat menguji proportional bias antara dua sumber.',
    simpleExample:
      'Menguji apakah rasio skala Satelit terhadap Pemkot sama dengan 1.00 ketika keduanya sama-sama tidak sempurna.',
    impactOnAnalysis:
      'Jika interval kepercayaan 95% slope Deming tidak memuat 1, terdapat bias proporsional signifikan antara kedua sumber.'
  },
  heteroskedasticity: {
    termKey: 'heteroskedasticity',
    termLabel: 'Heteroskedasticity',
    fullExpansion: 'Heteroskedasticity of Measurement Errors (Heteroskedastisitas Galat)',
    simpleDefinition:
      'Kondisi ketika besarnya kesalahan pengukuran berubah mengikuti kecil-besarnya nilai emisi (misalnya kota besar punya simpangan jauh lebih lebar dibanding kota kecil).',
    technicalExplanation:
      'Melanggar asumsi varians galat konstan Var(ε_k,it | T_it) = σ²_ε,k. Sering terjadi pada data emisi yang miring ke kanan (right-skewed) di mana simpangan baku proporsional terhadap level emisi.',
    whyImportant:
      'Jika varians galat membesar di kota metropolitan, satu estimasi σ²_ε rata-rata tidak mewakili kota kecil maupun kota besar secara akurat.',
    simpleExample:
      'Meleset ±5 ton di kota kecil tetapi meleset ±5.000 ton di Jakarta/Surabaya.',
    impactOnAnalysis:
      'Dapat dimitigasi dengan transformasi logaritmik atau Box-Cox/Yeo-Johnson apabila model galat bersifat multiplikatif.'
  },
  autocorrelation: {
    termKey: 'autocorrelation',
    termLabel: 'Autocorrelation',
    fullExpansion: 'Temporal Serial Autocorrelation (Autokorelasi Temporal Galat Panel)',
    simpleDefinition:
      'Kondisi ketika kesalahan pengukuran pada suatu kota di tahun ini terbawa atau mirip dengan kesalahan di tahun berikutnya.',
    technicalExplanation:
      'Cov(ε_k,it, ε_k,i,t-1) ≠ 0 dalam entitas yang sama. Mengurangi jumlah informasi independen efektif (effective sample size) dan mempersempit standard error jika tidak menggunakan cluster bootstrap per kota.',
    whyImportant:
      'Dalam data panel tahunan kota, metode inventaris atau kalibrasi sensor yang tetap sering menciptakan galat beruntun antar-tahun.',
    simpleExample:
      'Faktor emisi bahan bakar kota yang kelebihan taksir pada tahun 2020 terus dipakai hingga 2023.',
    impactOnAnalysis:
      'Mewajibkan penggunaan Entity-Cluster Bootstrap (Step 8) dan pemeriksaan dekomposisi galat autokorelasi (Dong & Crow, 2017).'
  },
  orthogonality: {
    termKey: 'orthogonality',
    termLabel: 'Orthogonality',
    fullExpansion: 'Error Orthogonality to True Signal (Ortogonalitas Galat terhadap Sinyal Laten)',
    simpleDefinition:
      'Asumsi bahwa kesalahan acak suatu alat ukur tidak bergantung pada tinggi-rendahnya nilai sebenarnya setelah dikalibrasi linear.',
    technicalExplanation:
      'Syarat Cov(ε_k, T) = 0 dalam model X_k = α_k + β_k T + ε_k. Karena T tidak teramati, asumsi ini tidak dapat diuji secara langsung tanpa Ground Truth, namun pelanggarannya tercermin secara tidak langsung melalui ketidaklinieran kurva antarsumber atau pergeseran parameter lintas kelompok level emisi.',
    whyImportant:
      'Jika Cov(ε_k, T) ≠ 0, komponen galat akan terserap ke koefisien kemiringan β_k dan membiasakan estimasi σ²_ε,k.',
    simpleExample:
      'Sensor yang mulai jenuh (saturasi) hanya ketika polusi sangat pekat.',
    impactOnAnalysis:
      'Diklasifikasikan sebagai asumsi yang dinilai secara tidak langsung pada Step 6 dan diuji sensitivitasnya lewat pembagian kelompok kota di Step 9.'
  },
  identifiability: {
    termKey: 'identifiability',
    termLabel: 'Identifiability',
    fullExpansion: 'Statistical Model Identifiability (Keteridentifikasian Parameter Model)',
    simpleDefinition:
      'Kepastian matematis bahwa informasi dalam data cukup untuk menghitung nilai unik setiap parameter yang dicari.',
    technicalExplanation:
      'Suatu parameter θ teridentifikasi apabila pemetaan dari parameter ke distribusi/momen teramati bersifat injektif (satu-ke-satu). Untuk J=2 sumber (3 momen kovarians: C_11, C_22, C_12), terdapat 4 parameter varians/skala tak diketahui sehingga varians galat individual TIDAK teridentifikasi tanpa asumsi tambahan. Untuk J=3 (6 momen), model TCA tepat teridentifikasi (just-identified).',
    whyImportant:
      'Mencegah aplikasi mengeluarkan angka atau peringkat semu yang sebenarnya tidak punya dasar matematis.',
    simpleExample:
      'Mencari nilai x dan y hanya dari satu persamaan x + y = 10 — ada tak hingga pasangan jawaban yang mungkin.',
    impactOnAnalysis:
      'Jika model berstatus Tidak Dapat Diidentifikasi, sistem menghentikan pemeringkatan paksa dan menjelaskan informasi tambahan yang diperlukan.'
  },
  bootstrap: {
    termKey: 'bootstrap',
    termLabel: 'Bootstrap',
    fullExpansion: 'Entity-Cluster Nonparametric Bootstrap (Bootstrap Berklaster Entitas)',
    simpleDefinition:
      'Teknik simulasi komputer dengan mengambil sampel ulang kota-kota secara berulang kali untuk mengukur seberapa stabil estimasi error dan peringkat sumber.',
    technicalExplanation:
      'Pada data panel G kota × T periode, pengundian ulang dilakukan pada unit klaster kota (seluruh deret waktu kota i diambil utuh bersama) sebanyak B replikasi, bukan mengacak baris secara bebas. Hal ini menjaga struktur autokorelasi temporal dan heteroskedastisitas dalam kota.',
    whyImportant:
      'Memberikan rentang ketidakpastian (Confidence Interval) yang jujur tanpa harus mengasumsikan distribusi normal sempurna.',
    simpleExample:
      'Menguji apakah Sensor tetap menjadi peringkat #1 pada 96% dari 500 kombinasi sampel ulang kota.',
    impactOnAnalysis:
      'Menghasilkan 95% Confidence Interval varians galat dan probabilitas stabilitas peringkat #1 di Step 8.'
  },
  confidence_interval: {
    termKey: 'confidence_interval',
    termLabel: 'Confidence Interval',
    fullExpansion: '95% Confidence Interval (Rentang Kepercayaan 95%)',
    simpleDefinition:
      'Rentang nilai bawah hingga atas yang menggambarkan ketidakpastian hasil estimasi statistik.',
    technicalExplanation:
      'Dihitung dari persentil ke-2.5 dan ke-97.5 distribusi empiris Entity-Cluster Bootstrap. Jika rentang kepercayaan varians galat Sumber A dan Sumber B saling tumpang-tindih lebar, perbedaan peringkat keduanya belum tentu signifikan secara statistik.',
    whyImportant:
      'Mencegah peneliti terlalu yakin pada selisih angka desimal kecil yang sebenarnya hanya fluktuasi sampel.',
    simpleExample:
      'Error SD Sensor = 12.4 ton (95% CI: 9.8 s.d. 15.1 ton) vs Satelit = 28.7 ton (95% CI: 23.2 s.d. 34.9 ton) -> tidak tumpang tindih, perbedaan tegas.',
    impactOnAnalysis:
      'Ditampilkan pada seluruh tabel hasil utama Step 8 dan grafik perbandingan varians galat.'
  },
  balanced_panel: {
    termKey: 'balanced_panel',
    termLabel: 'Balanced Panel',
    fullExpansion: 'Balanced Panel Data (Data Panel Seimbang)',
    simpleDefinition:
      'Struktur data panel di mana setiap kota memiliki catatan data lengkap pada seluruh tahun pengamatan tanpa ada tahun yang bolong.',
    technicalExplanation:
      'Memenuhi N_total = G × T observasi lengkap di seluruh sumber pengukuran yang dipilih.',
    whyImportant:
      'Menjamin setiap kota memiliki bobot representasi temporal yang setara dalam perhitungan matriks kovarians panel.',
    simpleExample:
      '30 kota di Indonesia masing-masing tercatat lengkap selama 6 tahun (2018–2023) = 180 baris utuh.',
    impactOnAnalysis:
      'Memudahkan dekomposisi varians antar-kota dan antar-tahun tanpa risiko bias seleksi observasi hilang.'
  },
  unbalanced_panel: {
    termKey: 'unbalanced_panel',
    termLabel: 'Unbalanced Panel',
    fullExpansion: 'Unbalanced Panel Data (Data Panel Tidak Seimbang)',
    simpleDefinition:
      'Struktur data panel di mana sebagian kota memiliki tahun pengamatan yang hilang atau jumlah tahun berbeda-beda.',
    technicalExplanation:
      'Jumlah periode tersedia T_i bervariasi antar-entitas i. Metode collocation tetap dapat dijalankan pada irisan observasi lengkap (complete-case across sources), asalkan mekanisme hilangnya data tidak bergantung langsung pada besarnya kesalahan ekstrem (MNAR).',
    whyImportant:
      'Sangat umum pada data riil (mis. sensor lapangan baru dipasang di beberapa kota pada tahun ke-3).',
    simpleExample:
      '25 kota punya data 6 tahun, tetapi 5 kota baru punya data 4 tahun terakhir.',
    impactOnAnalysis:
      'Sistem mengevaluasi risiko bias missingness di Step 2 dan menguji sensitivitas Balanced vs Unbalanced Subpanel di Step 9.'
  },
  representativeness_error: {
    termKey: 'representativeness_error',
    termLabel: 'Representativeness Error',
    fullExpansion: 'Spatial & Temporal Representativeness Error (Galat Keterwakilan Cakupan)',
    simpleDefinition:
      'Perbedaan hasil ukur karena dua sumber sebenarnya memotret luasan wilayah atau rentang waktu yang tidak persis sama.',
    technicalExplanation:
      'Muncul ketika sumber titik (mis. sensor tunggal di pusat kota) dibandingkan dengan rata-rata grid piksel satelit (mis. 10×10 km) atau agregat administratif tahunan kota. Dalam TCA, varians ketidaksesuaian skala spasial masuk ke dalam komponen varians galat sumber yang beresolusi berbeda.',
    whyImportant:
      'Sensor yang sangat akurat di satu titik jalan raya bisa tampak memiliki error besar jika dipaksa mewakili total emisi seluruh kabupaten.',
    simpleExample:
      'Membandingkan curah hujan di satu halaman rumah dengan rata-rata curah hujan satu provinsi.',
    impactOnAnalysis:
      'Diperiksa secara eksplisit pada metadata cakupan spasial & temporal di Step 3, Step 4, dan diagnostik Step 6.'
  }
};

export const MSMA_BIBLIOGRAPHY_CATEGORIES: Array<MsmaBibliographyEntry['category']> = [
  'Triple Collocation',
  'Extended Collocation',
  'N-Cornered Hat',
  'Correlated Error',
  'Panel Measurement Models',
  'Urban CO₂ Emission Validation',
  'Atmospheric Inversion'
];
