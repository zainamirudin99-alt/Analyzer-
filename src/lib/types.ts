// ============================================================
// Types Definition for Analyzer (Carbon Emission Disclosure)
// ============================================================

export type CEDIndicatorKey =
  | 'cc1' | 'cc2'
  | 'ghg1' | 'ghg2' | 'ghg3' | 'ghg4' | 'ghg5' | 'ghg6' | 'ghg7'
  | 'ec1' | 'ec2' | 'ec3'
  | 'rc1' | 'rc2' | 'rc3' | 'rc4'
  | 'acc1' | 'acc2';

export const INDICATOR_KEYS: CEDIndicatorKey[] = [
  'cc1', 'cc2',
  'ghg1', 'ghg2', 'ghg3', 'ghg4', 'ghg5', 'ghg6', 'ghg7',
  'ec1', 'ec2', 'ec3',
  'rc1', 'rc2', 'rc3', 'rc4',
  'acc1', 'acc2'
];

export const INDICATOR_KEYS_UPPER = [
  'CC1', 'CC2',
  'GHG1', 'GHG2', 'GHG3', 'GHG4', 'GHG5', 'GHG6', 'GHG7',
  'EC1', 'EC2', 'EC3',
  'RC1', 'RC2', 'RC3', 'RC4',
  'ACC1', 'ACC2'
] as const;

export type CEDScores = Record<CEDIndicatorKey, number>;

export interface CEDResultRecord extends CEDScores {
  id?: string;
  company_code: string;
  fiscal_year: string;
  file_name: string;
  notes?: string;
  status?: string;
  total_score?: number;
  disclosure_level?: string;
  model_used?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IndicatorGroup {
  id: string;
  name: string;
  emoji: string;
  description: string;
  keys: CEDIndicatorKey[];
}

export const CED_GROUPS: IndicatorGroup[] = [
  {
    id: 'cc',
    name: 'Climate Change (CC)',
    emoji: '🌡️',
    description: 'Penilaian risiko regulasi, strategi mitigasi, serta implikasi finansial dan peluang bisnis dari perubahan iklim.',
    keys: ['cc1', 'cc2']
  },
  {
    id: 'ghg',
    name: 'Greenhouse Gas (GHG)',
    emoji: '💨',
    description: 'Metodologi, verifikasi pihak ketiga, kuantifikasi total, cakupan (Scope 1, 2, 3), sumber emisi, fasilitas, dan tren emisi GRK.',
    keys: ['ghg1', 'ghg2', 'ghg3', 'ghg4', 'ghg5', 'ghg6', 'ghg7']
  },
  {
    id: 'ec',
    name: 'Energy Consumption (EC)',
    emoji: '⚡',
    description: 'Total konsumsi energi fosil/listrik, pemanfaatan energi baru terbarukan (EBT), serta rincian per tipe/fasilitas/segmen.',
    keys: ['ec1', 'ec2', 'ec3']
  },
  {
    id: 'rc',
    name: 'Reduction Commitment (RC)',
    emoji: '🎯',
    description: 'Rencana aksi pengurangan emisi, target tahunan/level, pencapaian penghematan biaya emisi, serta capex belanja modal iklim.',
    keys: ['rc1', 'rc2', 'rc3', 'rc4']
  },
  {
    id: 'acc',
    name: 'Accountability (ACC)',
    emoji: '🏛️',
    description: 'Tata kelola dewan/komite eksekutif yang bertanggung jawab atas aksi iklim dan mekanisme peninjauan berkala kemajuan perusahaan.',
    keys: ['acc1', 'acc2']
  }
];

export const INDICATOR_DESCRIPTIONS: Record<CEDIndicatorKey, { title: string; fullDesc: string }> = {
  cc1: {
    title: 'Penilaian & Aksi Risiko Perubahan Iklim',
    fullDesc: 'Penilaian/deskripsi dari risiko (peraturan/regulasi baik khusus maupun umum) yang berhubungan dengan perubahan iklim dan aksi yang dilakukan untuk mengatasi risiko tersebut.'
  },
  cc2: {
    title: 'Implikasi Finansial & Peluang Bisnis Iklim',
    fullDesc: 'Penilaian/deskripsi saat ini (dan masa depan) dari implikasi keuangan, implikasi bisnis, dan peluang dari perubahan iklim.'
  },
  ghg1: {
    title: 'Metodologi Penghitungan Emisi GRK',
    fullDesc: 'Deskripsi tentang metodologi yang digunakan untuk mengkalkulasi (menghitung) emisi GRK (gas rumah kaca atau standar ISO/GHG Protocol).'
  },
  ghg2: {
    title: 'Verifikasi Pihak Eksternal Emisi GRK',
    fullDesc: 'Keberadaan verifikasi dari pihak eksternal independen dalam mengukur jumlah emisi GRK (siapa auditornya dan atas dasar standar apa).'
  },
  ghg3: {
    title: 'Total Kuantifikasi Emisi GRK',
    fullDesc: 'Pengungkapan angka kuantitatif total emisi GRK yang dihasilkan oleh perusahaan.'
  },
  ghg4: {
    title: 'Cakupan Emisi (Scope 1, 2, atau 3)',
    fullDesc: 'Pengungkapan rincian emisi GRK langsung Lingkup 1 (Scope 1) dan tidak langsung Lingkup 2 (Scope 2), atau Lingkup 3.'
  },
  ghg5: {
    title: 'Emisi GRK Berdasarkan Asal / Sumber',
    fullDesc: 'Pengungkapan emisi GRK berdasarkan pada asal maupun sumber energi (misalnya: batu bara, solar/diesel, listrik PLN, gas bumi, dll).'
  },
  ghg6: {
    title: 'Emisi GRK Berdasarkan Fasilitas / Segmen',
    fullDesc: 'Pengungkapan emisi GRK yang dirinci berdasarkan unit fasilitas operasi, wilayah tambang, pabrik peleburan, atau level segmen bisnis.'
  },
  ghg7: {
    title: 'Tren / Perbandingan Emisi dengan Tahun Lalu',
    fullDesc: 'Perbandingan angka emisi GRK tahun berjalan dengan tahun-tahun sebelumnya (historis/trend analysis).'
  },
  ec1: {
    title: 'Total Energi yang Dikonsumsi',
    fullDesc: 'Total energi yang dikonsumsi secara operasional (misalnya dalam satuan Liter, Giga Joule, Tera Joule, Peta Joule, atau MWh).'
  },
  ec2: {
    title: 'Pemanfaatan Energi Terbarukan (EBT)',
    fullDesc: 'Kuantifikasi energi yang digunakan dari sumber daya yang dapat diperbarui (solar panel, PLTMH, biomassa, biodiesel, dll).'
  },
  ec3: {
    title: 'Rincian Energi per Tipe / Fasilitas / Segmen',
    fullDesc: 'Pengungkapan konsumsi energi yang diklasifikasikan menurut tipe bahan bakar, fasilitas site operasional, atau segmen anak usaha.'
  },
  rc1: {
    title: 'Rencana & Strategi Detail Pengurangan Emisi',
    fullDesc: 'Rencana atau strategi yang terperinci dan terstruktur untuk mereduksi emisi GRK perusahaan (dekarbonisasi).'
  },
  rc2: {
    title: 'Target Tingkat / Level & Tahun Target Emisi',
    fullDesc: 'Spesifikasi angka target penurunan (persentase pengurangan) beserta tahun target pencapaian (misal Net Zero 2050 / 30% reduction by 2030).'
  },
  rc3: {
    title: 'Realisasi Pengurangan Emisi & Penghematan Biaya',
    fullDesc: 'Pengurangan emisi aktual dan biaya atau penghematan (cost saving) yang berhasil dicapai sebagai akibat implementasi rencana efisiensi karbon.'
  },
  rc4: {
    title: 'Biaya Emisi Masa Depan dalam Capex Planning',
    fullDesc: 'Perhitungan perkiraan biaya emisi/pajak karbon masa depan yang diintegrasikan ke dalam perencanaan belanja modal (capital expenditure planning).'
  },
  acc1: {
    title: 'Komite / Dewan Penanggung Jawab Aksi Iklim',
    fullDesc: 'Indikasi keberadaan dewan komisaris, komite keberlanjutan (ESG Committee), atau badan eksekutif yang memegang tanggung jawab atas aksi perubahan iklim.'
  },
  acc2: {
    title: 'Mekanisme Dewan Meninjau Kemajuan Iklim',
    fullDesc: 'Deskripsi mekanisme formal di mana dewan/manajemen eksekutif melakukan peninjauan (review & audit) berkala atas kemajuan target perubahan iklim perusahaan.'
  }
};

export const SCORING_RUBRIC = [
  { score: 0, label: '0: Tidak Ada Pengungkapan', desc: 'Tidak ada informasi atau pengungkapan sama sekali mengenai indikator terkait.' },
  { score: 1, label: '1: Kurang dari 3 Kalimat', desc: 'Diungkapkan sangat singkat dalam kurang dari tiga kalimat.' },
  { score: 2, label: '2: 1 Paragraf / ≤ ½ Halaman', desc: 'Diungkapkan dalam tiga kalimat hingga satu paragraf (tidak lebih dari setengah halaman).' },
  { score: 3, label: '3: ½ s/d 1 Halaman A4', desc: 'Diungkapkan secara substansial minimal setengah halaman tetapi kurang dari satu halaman A4 penuh.' },
  { score: 4, label: '4: 1 Halaman Penuh A4', desc: 'Diungkapkan secara mendalam pada satu halaman A4 penuh.' },
  { score: 5, label: '5: > 1 Halaman A4', desc: 'Diungkapkan secara komprehensif pada lebih dari satu halaman A4.' }
];

export function calculateTotalScore(scores: Partial<CEDScores>): number {
  return INDICATOR_KEYS.reduce((sum, key) => sum + (scores[key] || 0), 0);
}

export function calculateDisclosureLevel(totalScore: number): string {
  if (totalScore >= 72) return 'Sangat Tinggi (High Disclosure)';
  if (totalScore >= 54) return 'Tinggi (Substantial)';
  if (totalScore >= 36) return 'Sedang (Moderate)';
  if (totalScore >= 18) return 'Rendah (Low)';
  return 'Sangat Rendah (Minimal)';
}
