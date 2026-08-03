/* Biçimlendirme ve tarih yardımcıları — Türkçe yerel ayar. */

const TL = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const TL2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TL4 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
export const AYLAR_KISA = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
export const GUNLER_KISA = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];

/** Sayı → "12.345" (yuvarlanmış). null/NaN → "—" */
export function n(v, basamak = 0) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const s = Number(v);
  if (basamak === 2) return TL2.format(s);
  if (basamak === 4) return TL4.format(s);
  return TL.format(Math.round(s));
}

/** Para → "12.345 ₺" */
export function tl(v, basamak = 0) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return n(v, basamak) + ' ₺';
}

/** İşaretli para → "+1.200 ₺" / "−800 ₺" */
export function tlIsaret(v, basamak = 0) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const s = Number(v);
  if (s === 0) return '0 ₺';
  return (s > 0 ? '+' : '−') + n(Math.abs(s), basamak) + ' ₺';
}

/** Kısa para → "1,2 mn ₺" (dar alanlar için) */
export function tlKisa(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const s = Number(v), a = Math.abs(s), im = s < 0 ? '−' : '';
  if (a >= 1e9) return im + (a / 1e9).toFixed(1).replace('.', ',') + ' mr';
  if (a >= 1e6) return im + (a / 1e6).toFixed(1).replace('.', ',') + ' mn';
  if (a >= 1e4) return im + Math.round(a / 1e3) + ' b';
  if (a >= 1e3) return im + (a / 1e3).toFixed(1).replace('.', ',') + ' b';
  return im + n(a);
}

/** Yüzde → "%31,75" */
export function yuzde(v, basamak = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return '%' + Number(v).toFixed(basamak).replace('.', ',').replace(/,00$/, '');
}

/** İşaretli yüzde → "+%2,4" / "−%1,1" */
export function yuzdeIsaret(v, basamak = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const s = Number(v);
  if (Math.abs(s) < 0.005) return '%0';
  return (s > 0 ? '+' : '−') + '%' + Math.abs(s).toFixed(basamak).replace('.', ',').replace(/,00$/, '');
}

/**
 * Kullanıcı girdisini sayıya çevirir.
 *
 * Türkçe'de nokta binlik ayraç, virgül ondalık ayraçtır — ama insanlar ikisini de
 * karışık kullanır. Bu yüzden biçim, ayraçların konumundan çıkarılır:
 *   "25.000"    → 25000     (3 haneli grup: binlik ayraç)
 *   "25,5"      → 25.5      (ondalık virgül)
 *   "25.5"      → 25.5      (3 haneli grup değil: ondalık nokta)
 *   "1.234,56"  → 1234.56   (ikisi birlikte: sondaki ondalıktır)
 *   "1,234.56"  → 1234.56
 *   "1.234.567" → 1234567
 */
export function sayiOku(deger) {
  if (typeof deger === 'number') return Number.isFinite(deger) ? deger : 0;
  if (deger === null || deger === undefined) return 0;

  let s = String(deger).trim().replace(/[₺\s ]/g, '');
  if (!s) return 0;

  const eksi = s.startsWith('-');
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return 0;

  const nokta = (s.match(/\./g) || []).length;
  const virgul = (s.match(/,/g) || []).length;

  if (nokta && virgul) {
    // ikisi birlikte varsa, en sonda gelen ondalık ayraçtır
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (virgul) {
    // birden çok virgül ve hepsi 3'lü grup → İngilizce binlik ayraç
    s = (virgul > 1 && /^\d{1,3}(,\d{3})+$/.test(s)) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (nokta) {
    // birden çok nokta ya da tam 3'lü gruplama → Türkçe binlik ayraç
    if (nokta > 1 || /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }

  const v = parseFloat(s);
  return Number.isFinite(v) ? (eksi ? -v : v) : 0;
}

/* ---------- tarih ---------- */

export function pad(x) { return (x < 10 ? '0' : '') + x; }

/** Date → "2026-08-03" */
export function iso(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
export function bugun() { return iso(new Date()); }
export function buAy() { return bugun().slice(0, 7); }

/** "2026-08-03" → Date (yerel saat, UTC kayması olmadan) */
export function tarih(s) {
  if (!s) return new Date();
  const [y, a, g] = String(s).split('-').map(Number);
  return new Date(y, (a || 1) - 1, g || 1);
}

/** "2026-08-03" → "3 Ağustos 2026" */
export function tarihUzun(s) {
  if (!s) return '—';
  const d = tarih(s);
  return d.getDate() + ' ' + AYLAR[d.getMonth()] + ' ' + d.getFullYear();
}
/** "2026-08-03" → "3 Ağu" */
export function tarihKisa(s) {
  if (!s) return '—';
  const d = tarih(s);
  return d.getDate() + ' ' + AYLAR_KISA[d.getMonth()];
}
/** "2026-08" → "Ağustos 2026" */
export function ayAdi(s) {
  if (!s) return '—';
  const [y, a] = s.split('-').map(Number);
  return AYLAR[a - 1] + ' ' + y;
}
/** "2026-08" → "Ağu 26" */
export function ayKisa(s) {
  if (!s) return '—';
  const [y, a] = s.split('-').map(Number);
  return AYLAR_KISA[a - 1] + ' ' + String(y).slice(2);
}

/** Ay ekle: ("2026-08", 3) → "2026-11" */
export function ayEkle(ay, adet) {
  const [y, a] = ay.split('-').map(Number);
  const t = (y * 12 + (a - 1)) + adet;
  return Math.floor(t / 12) + '-' + pad((t % 12) + 1);
}

/** Ayın gün sayısı */
export function ayGunSayisi(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** İki tarih arası gün farkı (b − a) */
export function gunFark(a, b) {
  const x = tarih(a), y = tarih(b);
  return Math.round((y - x) / 86400000);
}

/** Bugünden hedefe kalan gün. Negatif = geçmiş. */
export function kalanGun(hedefIso) {
  return gunFark(bugun(), hedefIso);
}

/** Bu ay içinde, verilen ayın gününe denk gelen ISO tarih. Ay kısaysa son güne kırpar. */
export function ayinGunu(gun, temelAy = buAy()) {
  const [y, a] = temelAy.split('-').map(Number);
  const son = new Date(y, a, 0).getDate();
  return y + '-' + pad(a) + '-' + pad(Math.min(Math.max(gun || 1, 1), son));
}

/** Vadeye kalan günü insan diline çevirir */
export function vadeMetni(gun) {
  if (gun === null || gun === undefined) return '—';
  if (gun < -1) return Math.abs(gun) + ' gün gecikti';
  if (gun === -1) return 'Dün geçti';
  if (gun === 0) return 'Bugün';
  if (gun === 1) return 'Yarın';
  if (gun < 7) return gun + ' gün sonra';
  if (gun < 31) return Math.round(gun / 7) + ' hafta sonra';
  return Math.round(gun / 30) + ' ay sonra';
}

/** Süre → "3 sa 12 dk" */
export function sureMetni(ms) {
  if (ms <= 0) return 'Süre doldu';
  const g = Math.floor(ms / 86400000);
  const sa = Math.floor((ms % 86400000) / 3600000);
  const dk = Math.floor((ms % 3600000) / 60000);
  if (g > 0) return g + ' gün ' + sa + ' sa';
  if (sa > 0) return sa + ' sa ' + dk + ' dk';
  return dk + ' dk';
}

/** Göreli zaman → "3 dk önce" */
export function goreliZaman(ts) {
  const fark = Date.now() - ts;
  if (fark < 60000) return 'az önce';
  if (fark < 3600000) return Math.floor(fark / 60000) + ' dk önce';
  if (fark < 86400000) return Math.floor(fark / 3600000) + ' sa önce';
  return Math.floor(fark / 86400000) + ' gün önce';
}

/** HTML kaçışı — kullanıcı girdisi şablona gömülürken zorunlu */
export function kac(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Basit benzersiz kimlik */
export function kimlik(on = 'x') {
  return on + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Sayıyı aralığa sıkıştır */
export function sinirla(v, alt, ust) { return Math.min(Math.max(v, alt), ust); }
