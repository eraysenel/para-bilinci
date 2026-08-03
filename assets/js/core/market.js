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

/* ---------- kaynaklar ---------- */

/** 1) Kullanıcının Worker proxy'si — tek istekte hepsi. */
async function kaynakProxy() {
  const url = (durum.piyasa.proxyUrl || '').trim();
  if (!url) return null;
  const ayrac = url.includes('?') ? '&' : '?';
  const d = await getir(url + ayrac + 'action=piyasa', 10000);
  if (!d || typeof d !== 'object' || d.error) {
    throw new Error(d && d.error ? String(d.error) : 'proxy yanıtı geçersiz');
  }
  const z = Date.now();
  const k = d.kaynaklar || {};
  const out = {};
  ALANLAR.forEach(a => {
    const v = num(d[a]);
    if (v !== null) out[a] = deger(v, k[a] || 'proxy', 'canli', z);
  });
  return out;
}

/** 2a) exchangerate-api açık uç noktası — anahtarsız, CORS açık, günlük güncellenir. */
async function kaynakErApi() {
  const d = await getir('https://open.er-api.com/v6/latest/USD');
  if (!d || d.result !== 'success' || !d.rates || !d.rates.TRY) throw new Error('er-api yanıtı geçersiz');
  const z = Date.now();
  const usd = num(d.rates.TRY);
  const eur = d.rates.EUR ? usd / num(d.rates.EUR) : null;
  return {
    usd: deger(usd, 'open.er-api.com', 'canli', z),
    eur: deger(eur, 'open.er-api.com', 'canli', z)
  };
}

/** 2b) Frankfurter (ECB verisi) — anahtarsız, CORS açık. Hafta içi güncellenir. */
async function kaynakFrankfurter() {
  const d = await getir('https://api.frankfurter.app/latest?from=USD&to=TRY,EUR');
  if (!d || !d.rates || !d.rates.TRY) throw new Error('frankfurter yanıtı geçersiz');
  const z = Date.now();
  const usd = num(d.rates.TRY);
  const eur = d.rates.EUR ? usd / num(d.rates.EUR) : null;
  return {
    usd: deger(usd, 'frankfurter.app (ECB)', 'canli', z),
    eur: deger(eur, 'frankfurter.app (ECB)', 'canli', z)
  };
}

/** 2c) Ons altın ve ons gümüş (USD) — anahtarsız. */
async function kaynakKiymetliMaden() {
  const out = {};
  const cift = [['XAU', 'onsAltin'], ['XAG', 'onsGumus']];
  const sonuclar = await Promise.allSettled(
    cift.map(([sembol]) => getir('https://api.gold-api.com/price/' + sembol))
  );
  sonuclar.forEach((s, i) => {
    if (s.status !== 'fulfilled') return;
    const p = num(s.value && (s.value.price ?? s.value.Price));
    if (p !== null && p > 0) out[cift[i][1]] = deger(p, 'gold-api.com', 'canli', Date.now());
  });
  if (!Object.keys(out).length) throw new Error('kıymetli maden yanıtı geçersiz');
  return out;
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
  const dene = async (ad, fn) => {
    try {
      const r = await fn();
      if (r) for (const [k, v] of Object.entries(r)) {
        if (v && v.deger !== null && !toplanan[k]) toplanan[k] = v;
      }
    } catch (e) {
      piyasa.hatalar.push(ad + ': ' + (e && e.message ? e.message : 'hata'));
    }
  };

  // proxy her şeyi verebilir; önce o
  await dene('proxy', kaynakProxy);

  // eksikler için doğrudan kaynaklar
  if (!toplanan.usd) await dene('er-api', kaynakErApi);
  if (!toplanan.usd) await dene('frankfurter', kaynakFrankfurter);
  if (!toplanan.onsAltin || !toplanan.onsGumus) await dene('gold-api', kaynakKiymetliMaden);

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
