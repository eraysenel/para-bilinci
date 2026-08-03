/* Kilit — cihaz üzerinde şifreli veri saklama.

   NE YAPAR
   Şifren, verini gerçekten şifrelemek için kullanılır. Kilit açıkken
   localStorage'da duran şey okunabilir JSON değil, AES-GCM ile şifrelenmiş
   bir bloktur. Şifreyi bilmeyen — tarayıcı geliştirici konsolunu açan biri
   dahil — veriyi okuyamaz.

   NE YAPMAZ
   Bu bir "hesap" değildir. Sunucu yok, kayıt yok, e-posta yok, parola
   sıfırlama yok. Kullanıcı adı yalnızca kilit ekranında görünen bir etikettir.
   Şifre unutulursa veri KURTARILAMAZ; tek kurtarma yolu yedek dosyasıdır.

   YÖNTEM
   · Anahtar türetme: PBKDF2-SHA256, 250.000 tur, 16 baytlık rastgele tuz
   · Şifreleme: AES-GCM 256 bit, her yazmada yeni rastgele 12 baytlık IV
   · Anahtar bellekte tutulur; istenirse sekme ömrü boyunca sessionStorage'da
     saklanır (sekme kapanınca silinir). Diske asla yazılmaz.
*/

const ANAHTAR = 'pb2_kilit';
const OTURUM_ANAHTAR = 'pb2_kilit_oturum';
const ITERASYON = 250000;
const SURUM = 1;

let bellekAnahtar = null;   // CryptoKey — açık oturumda tutulur

/* ---------- yardımcılar ---------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function b64Coz(s) {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

function kripto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('Bu tarayıcı şifreleme desteklemiyor (WebCrypto yok). Kilit özelliği güvenli bir bağlantı — https ya da localhost — gerektirir.');
  }
  return c;
}

export function desteklenirMi() {
  try { kripto(); return true; } catch { return false; }
}

async function anahtarTuret(sifre, tuz, iterasyon = ITERASYON) {
  const c = kripto();
  const ham = await c.subtle.importKey('raw', enc.encode(sifre), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt: tuz, iterations: iterasyon, hash: 'SHA-256' },
    ham,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/* ---------- kayıt okuma ---------- */

function kayitOku() {
  try {
    const ham = localStorage.getItem(ANAHTAR);
    return ham ? JSON.parse(ham) : null;
  } catch { return null; }
}

/** Kilit kurulmuş mu? */
export function kilitKurulu() { return !!kayitOku(); }

/** Kilit ekranında gösterilecek kullanıcı adı. */
export function kilitliKullanici() {
  const k = kayitOku();
  return k ? (k.kullanici || '') : '';
}

/** Şu an açık mı (bellekte anahtar var mı)? */
export function acikMi() { return !!bellekAnahtar; }

/* ---------- oturum (sekme ömrü) ---------- */

async function oturumaYaz(anahtar) {
  try {
    const c = kripto();
    const jwk = await c.subtle.exportKey('jwk', anahtar);
    sessionStorage.setItem(OTURUM_ANAHTAR, JSON.stringify(jwk));
  } catch { /* sessionStorage kapalı olabilir; kritik değil */ }
}

function oturumuSil() {
  try { sessionStorage.removeItem(OTURUM_ANAHTAR); } catch { }
}

/**
 * Sekme oturumundan anahtarı geri yükler.
 * @returns {Promise<object|null>} çözülmüş durum nesnesi, ya da oturum yoksa/bozuksa null
 */
export async function oturumdanAc() {
  if (!kilitKurulu()) return null;

  const kayit = kayitOku();
  if (bellekAnahtar) {
    try { return await coz(kayit); } catch { bellekAnahtar = null; }
  }

  let jwk;
  try {
    const ham = sessionStorage.getItem(OTURUM_ANAHTAR);
    if (!ham) return null;
    jwk = JSON.parse(ham);
  } catch { return null; }

  try {
    const c = kripto();
    bellekAnahtar = await c.subtle.importKey('jwk', jwk, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    return await coz(kayit);   // gerçekten çözebiliyor mu, doğrular
  } catch {
    bellekAnahtar = null;
    oturumuSil();
    return null;
  }
}

/* ---------- şifrele / çöz ---------- */

async function coz(kayit) {
  const c = kripto();
  const acik = await c.subtle.decrypt(
    { name: 'AES-GCM', iv: b64Coz(kayit.iv) },
    bellekAnahtar,
    b64Coz(kayit.veri)
  );
  return JSON.parse(dec.decode(acik));
}

/** Durumu şifreleyip localStorage'a yazar. Kilit açık değilse hiçbir şey yapmaz. */
export async function sifreliYaz(durumNesnesi) {
  if (!bellekAnahtar) return false;
  const kayit = kayitOku();
  if (!kayit) return false;

  const c = kripto();
  const iv = c.getRandomValues(new Uint8Array(12));
  const kapali = await c.subtle.encrypt(
    { name: 'AES-GCM', iv },
    bellekAnahtar,
    enc.encode(JSON.stringify(durumNesnesi))
  );

  localStorage.setItem(ANAHTAR, JSON.stringify({
    ...kayit,
    iv: b64(iv),
    veri: b64(kapali),
    guncelleme: Date.now()
  }));
  return true;
}

/* ---------- kurulum / açma / kaldırma ---------- */

/**
 * Kilidi kurar: mevcut durumu şifreler, düz metin kaydı siler.
 * @returns {Promise<void>}
 */
export async function kilitKur(kullanici, sifre, durumNesnesi, { oturumdaKal = true } = {}) {
  const c = kripto();
  if (!sifre || sifre.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');

  const tuz = c.getRandomValues(new Uint8Array(16));
  bellekAnahtar = await anahtarTuret(sifre, tuz, ITERASYON);

  const iv = c.getRandomValues(new Uint8Array(12));
  const kapali = await c.subtle.encrypt(
    { name: 'AES-GCM', iv },
    bellekAnahtar,
    enc.encode(JSON.stringify(durumNesnesi))
  );

  localStorage.setItem(ANAHTAR, JSON.stringify({
    v: SURUM,
    kullanici: (kullanici || '').trim().slice(0, 40),
    tuz: b64(tuz),
    iterasyon: ITERASYON,
    iv: b64(iv),
    veri: b64(kapali),
    olusturma: Date.now(),
    guncelleme: Date.now()
  }));

  // düz metin kaydı artık kalmamalı
  try { localStorage.removeItem('pb2_durum'); } catch { }

  if (oturumdaKal) await oturumaYaz(bellekAnahtar);
}

/**
 * Şifreyle açar ve çözülmüş durumu döner.
 * Şifre yanlışsa hata fırlatır.
 */
export async function kilitAc(sifre, { oturumdaKal = true } = {}) {
  const kayit = kayitOku();
  if (!kayit) throw new Error('Kurulu bir kilit yok.');

  const anahtar = await anahtarTuret(sifre, b64Coz(kayit.tuz), kayit.iterasyon || ITERASYON);
  const onceki = bellekAnahtar;
  bellekAnahtar = anahtar;
  try {
    const durumNesnesi = await coz(kayit);
    if (oturumdaKal) await oturumaYaz(anahtar);
    return durumNesnesi;
  } catch {
    bellekAnahtar = onceki;
    throw new Error('Şifre yanlış.');
  }
}

/** Kilidi kaldırır: veriyi düz metne geri yazar. */
export async function kilitKaldir(sifre) {
  const durumNesnesi = await kilitAc(sifre, { oturumdaKal: false });
  localStorage.setItem('pb2_durum', JSON.stringify(durumNesnesi));
  localStorage.removeItem(ANAHTAR);
  oturumuSil();
  bellekAnahtar = null;
  return durumNesnesi;
}

/** Şifreyi değiştirir (yeni tuz ve yeni anahtar üretilir). */
export async function sifreDegistir(eskiSifre, yeniSifre) {
  const kayit = kayitOku();
  if (!kayit) throw new Error('Kurulu bir kilit yok.');
  const durumNesnesi = await kilitAc(eskiSifre, { oturumdaKal: false });
  await kilitKur(kayit.kullanici, yeniSifre, durumNesnesi);
}

/** Kullanıcı adını değiştirir (şifre gerektirmez, veri etkilenmez). */
export function kullaniciDegistir(yeniAd) {
  const kayit = kayitOku();
  if (!kayit) return false;
  kayit.kullanici = (yeniAd || '').trim().slice(0, 40);
  localStorage.setItem(ANAHTAR, JSON.stringify(kayit));
  return true;
}

/** Oturumu kapatır: bellekteki anahtar silinir, veri şifreli kalır. */
export function kilitle() {
  bellekAnahtar = null;
  oturumuSil();
}

/** Kilit kaydını tamamen siler (veri de gider). Yalnızca "her şeyi sil" akışında. */
export function kayitSil() {
  try { localStorage.removeItem(ANAHTAR); } catch { }
  oturumuSil();
  bellekAnahtar = null;
}

/** Basit şifre gücü değerlendirmesi (0–4) — kullanıcıya bilgi amaçlı. */
export function sifreGucu(s) {
  if (!s) return { puan: 0, ad: '—', renk: 'muted' };
  let p = 0;
  if (s.length >= 8) p++;
  if (s.length >= 12) p++;
  if (/[a-zçğıöşü]/.test(s) && /[A-ZÇĞİÖŞÜ]/.test(s)) p++;
  if (/\d/.test(s)) p++;
  if (/[^\wçğıöşüÇĞİÖŞÜ]/.test(s)) p++;
  p = Math.min(p, 4);
  const adlar = ['Çok zayıf', 'Zayıf', 'Orta', 'İyi', 'Güçlü'];
  const renkler = ['red', 'red', 'amber', 'teal', 'em'];
  return { puan: p, ad: adlar[p], renk: renkler[p] };
}
