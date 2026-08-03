/* Canlı piyasa verisi — kur, gram altın, gram gümüş, BIST 100.

   İLKE 1 — ASLA uydurma sayı üretilmez. Bir değer çekilemezse null kalır ve
   arayüzde "—" görünür. Her değerin yanında kaynağı ve zamanı taşınır.

   İLKE 2 — SIFIR MALİYET. Yalnızca ücretsiz ve anahtar gerektirmeyen uç noktalar
   kullanılır. Ücretli hiçbir servis çağrılmaz.

   İLKE 3 — RATE LIMIT'E SAYGI. Ücretsiz kaynaklar cömert ama sınırsız değil.
   Aşağıdaki frenler bir kullanıcının kaynakları yormasını engeller:
     · Önbellek ömrü 30 dk — bu süre içinde ağa hiç çıkılmaz
     · Ardışık ağ denemesi arasında en az 10 dk
     · Elle yenilemede en az 60 sn
     · Hata sonrası artan bekleme (1 → 5 → 15 → 60 dk)
     · Günlük en fazla 24 deneme (cihaz başına)
   Kur kaynakları günde bir güncellendiği için bu sıklık zaten fazlasıyla yeterli.

   Sıra:
     1) Kullanıcının Cloudflare Worker proxy'si (varsa) — hepsini tek istekte verir
     2) Tarayıcıdan doğrudan erişilebilen, anahtarsız ve CORS açık API'ler
     3) Son başarılı çekimin önbelleği ("eski veri" olarak işaretli)
     4) Kullanıcının elle girdiği değer
*/

import { durum, kaydet, yayinla } from './store.js';
import { bugun } from './fmt.js';

const GRAM_ONS = 31.1034768;
const GECMIS_ANAHTAR = 'pb2_piyasa_gecmis';

/* ---------- fren ayarları ---------- */
const ONBELLEK_OMRU   = 30 * 60 * 1000;   // bu süre içinde ağa çıkılmaz
const EN_KISA_ARALIK  = 10 * 60 * 1000;   // ardışık ağ denemesi arası alt sınır
const ZORLA_ARALIK    = 60 * 1000;        // elle yenilemede alt sınır
const GUNLUK_LIMIT    = 24;               // cihaz başına günlük deneme üst sınırı
const HATA_BEKLEME    = [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3]; // artan bekleme

/** Alanların taşıyıcısı. */
function deger(v, kaynak, yontem, zaman) {
  return {
    deger: Number.isFinite(v) ? v : null,
    kaynak: kaynak || null,
    yontem: yontem || 'yok',
    zaman: zaman || null
  };
}

export const ALANLAR = ['usd', 'eur', 'onsAltin', 'gramAltin', 'onsGumus', 'gramGumus', 'bist'];

export const piyasa = {
  usd: deger(null), eur: deger(null),
  onsAltin: deger(null), gramAltin: deger(null),
  onsGumus: deger(null), gramGumus: deger(null),
  bist: deger(null),
  cekiliyor: false, sonDeneme: null, hatalar: []
};

/* ---------- fren durumu ---------- */

function fren() {
  const p = durum.piyasa;
  if (!p.fren) p.fren = { gun: bugun(), sayac: 0, sonDeneme: 0, hataAdedi: 0 };
  if (p.fren.gun !== bugun()) { p.fren.gun = bugun(); p.fren.sayac = 0; p.fren.hataAdedi = 0; }
  return p.fren;
}

/**
 * Şu anda ağa çıkmaya izin var mı?
 * @returns {{izin:boolean, sebep?:string, kalanSaniye?:number}}
 */
export function frenDurumu(zorla = false) {
  const f = fren();
  const simdi = Date.now();

  if (f.sayac >= GUNLUK_LIMIT) {
    return { izin: false, sebep: 'gunluk-limit', kalanSaniye: null, kalanDeneme: 0 };
  }

  const gerekenAralik = zorla
    ? ZORLA_ARALIK
    : Math.max(EN_KISA_ARALIK, HATA_BEKLEME[Math.min(f.hataAdedi, HATA_BEKLEME.length - 1)] * (f.hataAdedi > 0 ? 1 : 0));

  const gecen = simdi - (f.sonDeneme || 0);
  if (f.sonDeneme && gecen < gerekenAralik) {
    return {
      izin: false,
      sebep: f.hataAdedi > 0 ? 'hata-beklemesi' : 'cok-sik',
      kalanSaniye: Math.ceil((gerekenAralik - gecen) / 1000),
      kalanDeneme: GUNLUK_LIMIT - f.sayac
    };
  }
  return { izin: true, kalanDeneme: GUNLUK_LIMIT - f.sayac };
}

/* ---------- HTTP ---------- */

async function getir(url, zamanAsimi = 8000) {
  const kontrol = new AbortController();
  const t = setTimeout(() => kontrol.abort(), zamanAsimi);
  try {
    const c = await fetch(url, { signal: kontrol.signal, headers: { Accept: 'application/json' } });
    if (!c.ok) throw new Error('HTTP ' + c.status);
    return await c.json();
  } finally { clearTimeout(t); }
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
}

/* ---------- kaynaklar ----------
   Her kaynak bir nesne döndürür: { alanAdı: deger(...) }
   Hepsi ücretsiz, anahtarsız ve CORS açıktır.
   Yanıt şekilleri zamanla değişebildiği için okuma toleranslı yapılır:
   beklenen alan yoksa kaynak sessizce düşer, sıradaki denenir.
--------------------------------- */

/** Nesnenin içinden, verilen yollardan ilk bulunan pozitif sayıyı çeker. */
function sayiBul(nesne, yollar) {
  for (const yol of yollar) {
    let v = nesne;
    for (const parca of yol.split('.')) {
      if (v === null || typeof v !== 'object') { v = undefined; break; }
      // anahtarı büyük/küçük harf duyarsız ara
      if (parca in v) { v = v[parca]; continue; }
      const k = Object.keys(v).find(x => x.toLowerCase() === parca.toLowerCase());
      v = k === undefined ? undefined : v[k];
    }
    const n = num(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * 1) currency-api — tek istekte hem kur hem kıymetli maden verir.
 *    Yanıt: { date, usd: { try: 47.8, eur: 0.92, xau: 0.00024, xag: 0.019, ... } }
 *    Ons fiyatı = 1 / (usd→xau oranı).
 */
function currencyApi(url, ad) {
  return async () => {
    const d = await getir(url, 9000);
    const kok = d && (d.usd || d.USD);
    if (!kok || typeof kok !== 'object') throw new Error('beklenen "usd" alanı yok');

    const z = Date.now();
    const out = {};
    const usd = sayiBul(kok, ['try']);
    if (usd) out.usd = deger(usd, ad, 'canli', z);

    const eurOran = sayiBul(kok, ['eur']);
    if (usd && eurOran) out.eur = deger(usd / eurOran, ad, 'canli', z);

    const xau = sayiBul(kok, ['xau']);
    if (xau) out.onsAltin = deger(1 / xau, ad, 'canli', z);

    const xag = sayiBul(kok, ['xag']);
    if (xag) out.onsGumus = deger(1 / xag, ad, 'canli', z);

    if (!Object.keys(out).length) throw new Error('okunabilir değer yok');
    return out;
  };
}

/** 2) exchangerate-api açık uç noktası. */
async function kaynakErApi() {
  const d = await getir('https://open.er-api.com/v6/latest/USD');
  const usd = sayiBul(d, ['rates.TRY', 'conversion_rates.TRY', 'data.TRY']);
  if (!usd) throw new Error('TRY kuru yok');
  const z = Date.now();
  const out = { usd: deger(usd, 'open.er-api.com', 'canli', z) };
  const e = sayiBul(d, ['rates.EUR', 'conversion_rates.EUR', 'data.EUR']);
  if (e) out.eur = deger(usd / e, 'open.er-api.com', 'canli', z);
  return out;
}

/** 3) Frankfurter — ECB verisi, hafta içi güncellenir. */
async function kaynakFrankfurter() {
  const d = await getir('https://api.frankfurter.app/latest?from=USD&to=TRY,EUR');
  const usd = sayiBul(d, ['rates.TRY']);
  if (!usd) throw new Error('TRY kuru yok');
  const z = Date.now();
  const out = { usd: deger(usd, 'frankfurter.app (ECB)', 'canli', z) };
  const e = sayiBul(d, ['rates.EUR']);
  if (e) out.eur = deger(usd / e, 'frankfurter.app (ECB)', 'canli', z);
  return out;
}

/** 4) gold-api — ons altın ve ons gümüş, ayrı isteklerle. */
async function kaynakGoldApi() {
  const out = {};
  const cift = [['XAU', 'onsAltin'], ['XAG', 'onsGumus']];
  const sonuclar = await Promise.allSettled(
    cift.map(([sembol]) => getir('https://api.gold-api.com/price/' + sembol, 9000))
  );
  sonuclar.forEach((s, i) => {
    if (s.status !== 'fulfilled') return;
    const p = sayiBul(s.value, ['price', 'Price', 'rate', 'value']);
    if (p) out[cift[i][1]] = deger(p, 'gold-api.com', 'canli', Date.now());
  });
  if (!Object.keys(out).length) throw new Error('okunabilir fiyat yok');
  return out;
}

/** 0) Kullanıcının Worker proxy'si — tek istekte hepsi (BIST dahil). */
async function kaynakProxy() {
  const url = (durum.piyasa.proxyUrl || '').trim();
  if (!url) throw new Error('proxy adresi tanımlı değil');
  const ayrac = url.includes('?') ? '&' : '?';
  const d = await getir(url + ayrac + 'action=piyasa', 11000);
  if (!d || typeof d !== 'object' || d.error) {
    throw new Error(d && d.error ? String(d.error) : 'proxy yanıtı geçersiz');
  }
  const z = Date.now();
  const k = d.kaynaklar || {};
  const out = {};
  ALANLAR.forEach(a => {
    const v = num(d[a]);
    if (v !== null && v > 0) out[a] = deger(v, k[a] || 'proxy', 'canli', z);
  });
  if (!Object.keys(out).length) throw new Error('proxy hiçbir değer döndürmedi');
  return out;
}

/**
 * Kaynak listesi — sırayla denenir. Bir kaynak yalnızca hâlâ eksik olan
 * alanlar için çağrılır; hepsi doluysa ağa hiç çıkılmaz.
 */
const KAYNAKLAR = [
  { id: 'proxy',        ad: 'Worker proxy',            verir: ALANLAR,                                  cek: kaynakProxy },
  { id: 'currency-api', ad: 'currency-api (jsDelivr)', verir: ['usd', 'eur', 'onsAltin', 'onsGumus'],
    cek: currencyApi('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', 'currency-api (jsDelivr)') },
  { id: 'currency-api-2', ad: 'currency-api (yedek)',  verir: ['usd', 'eur', 'onsAltin', 'onsGumus'],
    cek: currencyApi('https://latest.currency-api.pages.dev/v1/currencies/usd.json', 'currency-api (yedek)') },
  { id: 'er-api',       ad: 'open.er-api.com',         verir: ['usd', 'eur'],                           cek: kaynakErApi },
  { id: 'frankfurter',  ad: 'frankfurter.app (ECB)',   verir: ['usd', 'eur'],                           cek: kaynakFrankfurter },
  { id: 'gold-api',     ad: 'gold-api.com',            verir: ['onsAltin', 'onsGumus'],                 cek: kaynakGoldApi }
];

/**
 * Her kaynağı tek tek dener ve sonucu bildirir — tanılama içindir.
 * Hangi kaynak çalışıyor, hangisi neden düşüyor, kullanıcı kendi cihazında görür.
 */
export async function kaynakTesti() {
  const sonuc = [];
  for (const k of KAYNAKLAR) {
    if (k.id === 'proxy' && !(durum.piyasa.proxyUrl || '').trim()) {
      sonuc.push({ id: k.id, ad: k.ad, durum: 'atlandi', not: 'Worker adresi girilmemiş' });
      continue;
    }
    const bas = Date.now();
    try {
      const r = await k.cek();
      const alanlar = Object.entries(r)
        .filter(([, v]) => v && v.deger !== null)
        .map(([a, v]) => ({ alan: a, deger: v.deger }));
      sonuc.push({
        id: k.id, ad: k.ad, durum: alanlar.length ? 'calisiyor' : 'bos',
        sure: Date.now() - bas, alanlar
      });
    } catch (e) {
      sonuc.push({ id: k.id, ad: k.ad, durum: 'hata', sure: Date.now() - bas, not: e && e.message ? e.message : 'bilinmeyen hata' });
    }
  }
  return sonuc;
}

/* ---------- ana çekim ---------- */

export async function piyasayiCek({ zorla = false } = {}) {
  if (piyasa.cekiliyor) return piyasa;

  const ob = durum.piyasa.onbellek;

  // önbellek tazeyse ağa hiç çıkma
  if (!zorla && ob && ob.veri && Date.now() - ob.zaman < ONBELLEK_OMRU) {
    uygula(ob.veri, 'canli');
    tureti();
    elleyiUygula();
    yayinla('piyasa', piyasa);
    return piyasa;
  }

  // fren
  const f = frenDurumu(zorla);
  if (!f.izin) {
    piyasa.frenSebep = f;
    if (ob && ob.veri) uygula(ob.veri, Date.now() - ob.zaman < ONBELLEK_OMRU ? 'canli' : 'onbellek');
    tureti();
    elleyiUygula();
    yayinla('piyasa', piyasa);
    return piyasa;
  }

  const frn = fren();
  frn.sonDeneme = Date.now();
  frn.sayac += 1;

  piyasa.cekiliyor = true;
  piyasa.frenSebep = null;
  piyasa.hatalar = [];
  yayinla('piyasa', piyasa);

  const toplanan = {};
  const eksikVar = k => k.verir.some(a => !toplanan[a]);

  for (const kaynak of KAYNAKLAR) {
    if (!eksikVar(kaynak)) continue;                       // bu kaynağın verdiği her şey zaten var
    if (kaynak.id === 'proxy' && !(durum.piyasa.proxyUrl || '').trim()) continue;
    try {
      const r = await kaynak.cek();
      for (const [alan, v] of Object.entries(r || {})) {
        if (v && v.deger !== null && !toplanan[alan]) toplanan[alan] = v;
      }
    } catch (e) {
      piyasa.hatalar.push(kaynak.ad + ': ' + (e && e.message ? e.message : 'hata'));
    }
  }

  piyasa.cekiliyor = false;
  piyasa.sonDeneme = Date.now();

  const bulunan = Object.keys(toplanan).length;
  if (bulunan) {
    frn.hataAdedi = 0;
    durum.piyasa.onbellek = { zaman: Date.now(), veri: sadelestir(toplanan) };
    kaydet('piyasa');
    uygula(toplanan, 'canli');
    tureti();
    gecmiseYaz();
  } else {
    frn.hataAdedi = Math.min(frn.hataAdedi + 1, HATA_BEKLEME.length);
    kaydet('piyasa-hata');
    if (ob && ob.veri) uygula(ob.veri, 'onbellek');
    else ALANLAR.forEach(k => { piyasa[k] = deger(null); });
    tureti();
  }

  elleyiUygula();
  yayinla('piyasa', piyasa);
  return piyasa;
}

/**
 * Açılışta çağrılır: önbellek ve elle girilen değerler ağ beklemeden uygulanır,
 * böylece çevrimdışıyken ya da otomatik çekim kapalıyken de arayüz veriyle çizilir.
 */
export function piyasayiHazirla() {
  const ob = durum.piyasa.onbellek;
  if (ob && ob.veri) {
    uygula(ob.veri, Date.now() - ob.zaman < ONBELLEK_OMRU ? 'canli' : 'onbellek');
  }
  tureti();
  elleyiUygula();
  yayinla('piyasa', piyasa);
  return piyasa;
}

function sadelestir(t) {
  const o = {};
  for (const [k, v] of Object.entries(t)) o[k] = { deger: v.deger, kaynak: v.kaynak, zaman: v.zaman };
  return o;
}

function uygula(veri, yontem) {
  ALANLAR.forEach(k => {
    const v = veri && veri[k];
    piyasa[k] = v && v.deger !== null && v.deger !== undefined
      ? deger(v.deger, v.kaynak, yontem, v.zaman)
      : deger(null);
  });
}

/** Gram fiyatları ons ve kurdan türetilir: ons(USD) × USD/TRY ÷ 31,1035 */
function tureti() {
  const usd = piyasa.usd.deger;
  if (!usd) return;
  const es = [['onsAltin', 'gramAltin'], ['onsGumus', 'gramGumus']];
  es.forEach(([ons, gram]) => {
    if (piyasa[gram].deger !== null) return;      // proxy doğrudan verdiyse dokunma
    const o = piyasa[ons].deger;
    if (!o) return;
    piyasa[gram] = deger(
      o * usd / GRAM_ONS,
      'hesaplandı: ons × USD/TRY ÷ 31,1035',
      piyasa[ons].yontem,
      piyasa[ons].zaman
    );
  });
}

/** Elle girilen değerler yalnızca boş alanları doldurur; canlı veriyi ezmez. */
function elleyiUygula() {
  const e = durum.piyasa.elle || {};
  ALANLAR.forEach(k => {
    const v = num(e[k] && e[k].deger !== undefined ? e[k].deger : e[k]);
    if (!Number.isFinite(v) || v <= 0) return;
    if (piyasa[k].deger === null) {
      piyasa[k] = deger(v, 'elle girildi', 'elle', (e[k] && e[k].zaman) || null);
    }
  });
  // elle ons girildiyse gramı ondan türet
  tureti();
}

/** Kullanıcının elle girdiği değeri kaydeder. */
export function elleGir(alan, v) {
  const s = num(v);
  if (!durum.piyasa.elle) durum.piyasa.elle = {};
  if (!Number.isFinite(s) || s <= 0) delete durum.piyasa.elle[alan];
  else durum.piyasa.elle[alan] = { deger: s, zaman: Date.now() };
  kaydet('piyasa-elle');
  elleyiUygula();
  gecmiseYaz();
  yayinla('piyasa', piyasa);
}

/* ---------- geçmiş (gerçekten görülmüş değerler) ---------- */

/** Günlük anlık görüntü. Tahmin değil; o gün gerçekten okunan değerler. */
export function gecmisOku() {
  try { return JSON.parse(localStorage.getItem(GECMIS_ANAHTAR) || '{}'); }
  catch { return {}; }
}

function gecmiseYaz() {
  try {
    const g = gecmisOku();
    const gun = bugun();
    const kayit = g[gun] || {};
    ['usd', 'eur', 'gramAltin', 'gramGumus', 'bist'].forEach(k => {
      if (piyasa[k] && piyasa[k].deger !== null) kayit[k] = Math.round(piyasa[k].deger * 10000) / 10000;
    });
    if (Object.keys(kayit).length) {
      g[gun] = kayit;
      const gunler = Object.keys(g).sort();
      while (gunler.length > 400) delete g[gunler.shift()];
      localStorage.setItem(GECMIS_ANAHTAR, JSON.stringify(g));
    }
  } catch { /* depolama dolu olabilir; kritik değil */ }
}

/** Geçmişi seri hâline getirir: [{etiket, deger, tarih}] */
export function gecmisSeri(alan, gunSayisi = 30) {
  const g = gecmisOku();
  return Object.keys(g).sort().slice(-gunSayisi)
    .filter(t => Number.isFinite(g[t][alan]))
    .map(t => ({ etiket: t.slice(8) + '.' + t.slice(5, 7), deger: g[t][alan], tarih: t }));
}

/** Elde tutulan TL'nin belirli bir varlık cinsinden değeri (yalnızca gerçek geçmiş varsa). */
export function erimeHesapla(tutar, alan = 'usd', gunSayisi = 30) {
  const seri = gecmisSeri(alan, gunSayisi);
  if (seri.length < 2) return null;
  const ilk = seri[0], son = seri[seri.length - 1];
  const ilkAdet = tutar / ilk.deger;
  const bugunAdet = tutar / son.deger;
  return {
    ilkTarih: ilk.tarih, sonTarih: son.tarih,
    ilkKur: ilk.deger, sonKur: son.deger,
    ilkAdet, bugunAdet,
    degisimYuzde: (bugunAdet / ilkAdet - 1) * 100,
    gunSayisi: seri.length
  };
}

export function proxyKaydet(url) {
  durum.piyasa.proxyUrl = (url || '').trim();
  kaydet('proxy-url');
}

/** Ayarlar ekranında gösterilecek fren özeti. */
export function frenOzeti() {
  const f = fren();
  const ob = durum.piyasa.onbellek;
  return {
    gunlukLimit: GUNLUK_LIMIT,
    kullanilan: f.sayac,
    kalan: Math.max(GUNLUK_LIMIT - f.sayac, 0),
    hataAdedi: f.hataAdedi,
    onbellekYasiDk: ob ? Math.floor((Date.now() - ob.zaman) / 60000) : null,
    onbellekOmruDk: ONBELLEK_OMRU / 60000,
    enKisaAralikDk: EN_KISA_ARALIK / 60000
  };
}
