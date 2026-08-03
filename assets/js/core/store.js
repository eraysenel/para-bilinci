/* Veri deposu — tek gerçek kaynak.
   Her şey tarayıcıda (localStorage) durur; hiçbir yere gönderilmez.
   Anahtar öneki pb2_ — eski sürümün (ao_*) verisine dokunulmaz. */

import { kimlik, bugun } from './fmt.js';

const ANAHTAR = 'pb2_durum';
const SURUM = 1;

/** Varsayılan durum. Yeni alan eklerken buraya ekle; birleştirme otomatik. */
export function bosDurum() {
  return {
    surum: SURUM,
    kurulumTamam: false,

    hane: {
      ad: '',
      yetiskin: 1,
      cocuk: 0,
      bakmaklaYukumlu: 0,      // hane dışı destek verilen kişi
      gelirSayisi: 1,          // haneye gelir getiren kişi sayısı
      calismaSaati: 180,       // aylık — saat ücreti hesabı için
      sehir: ''
    },

    // Elde/hesapta duran, harcanabilir TL. Her şeyin çıkış noktası budur.
    nakit: { tutar: 0, guncelleme: null, gecmis: [] }, // gecmis: [{tarih, tutar}]

    gelirler: [],   // {id, ad, tutar, tur, gun, aktif, duzenli}
    sabitler: [],   // {id, ad, tutar, kategori, gun, tur, kesintiRiski, otomatik, aktif}
    harcamalar: [], // {id, ad, tutar, tarih, kategori, not}
    borclar: [],    // {id, ad, tur, kalan, faizAylik, limit, asgariOran, sonOdemeGun, taksitTutar, kalanTaksit, olusturma}
    varliklar: [],  // {id, tur, ad, miktar, birim, alisFiyat, alisTarih}
    hedefler: [],   // {id, ad, tutar, biriken, tarih, oncelik}
    kararlar: [],   // {id, ad, fiyat, tur, durum, olusturma, kararTarihi, karar, pisman}
    sepet: [],      // {id, ad, birim, olcu, kayitlar:[{tarih, fiyat, yer}]}
    tarifler: [],   // {id, ad, porsiyon, malzemeler:[{ad, tutar}], disariFiyat, haftalikSiklik}
    skorlar: [],    // {id, tarih, skor, not}
    dersler: { tamamlanan: [], sonDers: null },
    notlar: [],     // {id, tarih, metin}

    piyasa: {
      onbellek: null,          // son başarılı çekim {zaman, veri}
      elle: {},                // kullanıcının elle girdiği değerler
      proxyUrl: '',            // isteğe bağlı Cloudflare Worker adresi
      otomatikCek: true,
      // ücretsiz kaynakları yormamak için istek freni (bkz. market.js)
      fren: { gun: null, sayac: 0, sonDeneme: 0, hataAdedi: 0 }
    },

    ayarlar: {
      tema: 'koyu',
      acilFonAy: null,         // null → hane yapısından otomatik hesapla
      bekletmeGun: 3,
      guvenlikPayiYuzde: 5,    // günlük harcanabilirden ayrılan tampon
      enflasyonKaynak: 'ikisi', // 'tuik' | 'enag' | 'ikisi'
      hedefDagilim: { tl: 25, doviz: 25, altin: 25, hisse: 25 },
      kartFaizElle: null,      // kullanıcı kendi ekstre faizini girerse
      duzenliYatirim: 0
    },

    olusturma: Date.now(),
    guncelleme: Date.now()
  };
}

/* ---------- yükleme / yazma ---------- */

function sadeNesne(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Kayıtlı veriyi varsayılan şemayla birleştirir; yeni sürümde eklenen alanlar
 * varsayılanından gelir, kullanıcının verisi korunur.
 *
 * Varsayılanı null olan alanlar (tarih, isteğe bağlı ayarlar) gelen değeri
 * olduğu gibi alır — null bir şema değil, "henüz doldurulmadı" demektir.
 */
function derinBirlestir(varsayilan, gelen) {
  if (gelen === undefined) return varsayilan;
  if (varsayilan === null || varsayilan === undefined) return gelen;
  if (gelen === null) return varsayilan;
  if (Array.isArray(varsayilan)) return Array.isArray(gelen) ? gelen : varsayilan;
  if (!sadeNesne(varsayilan)) return typeof gelen === typeof varsayilan ? gelen : varsayilan;
  if (!sadeNesne(gelen)) return varsayilan;

  const c = { ...varsayilan };
  for (const k of Object.keys(gelen)) {
    c[k] = Object.prototype.hasOwnProperty.call(varsayilan, k)
      ? derinBirlestir(varsayilan[k], gelen[k])
      : gelen[k];
  }
  return c;
}

function yukle() {
  try {
    const ham = localStorage.getItem(ANAHTAR);
    if (!ham) return bosDurum();
    return derinBirlestir(bosDurum(), JSON.parse(ham));
  } catch (e) {
    console.warn('Kayıtlı veri okunamadı, boş durumla başlanıyor.', e);
    return bosDurum();
  }
}

export const durum = yukle();

const dinleyiciler = new Set();
let yazmaZaman = null;

/** Değişikliği kaydet ve arayüzü haberdar et. */
export function kaydet(sebep = '') {
  durum.guncelleme = Date.now();
  clearTimeout(yazmaZaman);
  yazmaZaman = setTimeout(() => {
    try {
      localStorage.setItem(ANAHTAR, JSON.stringify(durum));
    } catch (e) {
      console.error('Kayıt başarısız (depolama dolu olabilir).', e);
      yayinla('depolama-hatasi', e);
    }
  }, 120);
  dinleyiciler.forEach(fn => { try { fn(sebep); } catch (e) { console.error(e); } });
}

/** Durum değişince çağrılacak fonksiyon kaydeder; kaldırma fonksiyonu döner. */
export function dinle(fn) {
  dinleyiciler.add(fn);
  return () => dinleyiciler.delete(fn);
}

/* ---------- basit olay yolu (kayıt gerektirmeyen bildirimler) ---------- */
const olaylar = new Map();
export function abone(ad, fn) {
  if (!olaylar.has(ad)) olaylar.set(ad, new Set());
  olaylar.get(ad).add(fn);
  return () => olaylar.get(ad).delete(fn);
}
export function yayinla(ad, veri) {
  (olaylar.get(ad) || []).forEach(fn => { try { fn(veri); } catch (e) { console.error(e); } });
}

/* ---------- koleksiyon yardımcıları ---------- */

/** Listeye kayıt ekler, id üretir, kaydeder ve eklenen kaydı döner. */
export function ekle(liste, kayit, on = 'k') {
  const yeni = { id: kimlik(on), ...kayit };
  durum[liste].push(yeni);
  kaydet('ekle:' + liste);
  return yeni;
}

/** Kaydı id ile günceller. */
export function guncelle(liste, id, degisiklik) {
  const k = durum[liste].find(x => x.id === id);
  if (!k) return null;
  Object.assign(k, degisiklik);
  kaydet('guncelle:' + liste);
  return k;
}

/** Kaydı siler. */
export function sil(liste, id) {
  const i = durum[liste].findIndex(x => x.id === id);
  if (i < 0) return false;
  durum[liste].splice(i, 1);
  kaydet('sil:' + liste);
  return true;
}

export function bul(liste, id) { return durum[liste].find(x => x.id === id) || null; }

/* ---------- yedek ---------- */

export function yedekAl() {
  return JSON.stringify({
    uygulama: 'para-bilinci',
    surum: SURUM,
    alindi: bugun(),
    durum
  }, null, 2);
}

/** Yedeği geri yükler. Hata durumunda açıklayıcı mesaj fırlatır. */
export function yedekYukle(metin) {
  let d;
  try { d = JSON.parse(metin); }
  catch { throw new Error('Dosya geçerli bir JSON değil.'); }

  const gelen = d && d.durum ? d.durum : d;
  if (!gelen || typeof gelen !== 'object') throw new Error('Yedek içeriği tanınmadı.');
  if (d.uygulama && d.uygulama !== 'para-bilinci') throw new Error('Bu yedek Para Bilinci\'ne ait değil.');

  const temiz = derinBirlestir(bosDurum(), gelen);
  Object.keys(durum).forEach(k => delete durum[k]);
  Object.assign(durum, temiz);
  kaydet('yedek-yukle');
}

/** Tüm veriyi siler. */
export function hepsiniSil() {
  const yeni = bosDurum();
  Object.keys(durum).forEach(k => delete durum[k]);
  Object.assign(durum, yeni);
  try { localStorage.removeItem(ANAHTAR); } catch {}
  kaydet('sifirla');
}

/** Eski sürümün (v1) verisi tarayıcıda duruyor mu? */
export function eskiVeriVar() {
  try {
    return ['ao_items', 'ao_exp', 'ao_sells', 'ao_debts', 'ao_settings']
      .some(k => localStorage.getItem(k));
  } catch { return false; }
}

/** Eski sürümün anahtarlarını siler (kullanıcı onayıyla çağrılır). */
export function eskiVeriSil() {
  ['ao_items', 'ao_exp', 'ao_sells', 'ao_debts', 'ao_settings', 'cf_ses', 'pb2_ai_oturum']
    .forEach(k => { try { localStorage.removeItem(k); } catch {} });
}
