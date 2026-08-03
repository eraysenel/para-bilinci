/* Canlı piyasa verisi — kur, gram altın, BIST 100.

   İlke: ASLA uydurma sayı üretilmez. Bir değer çekilemezse null kalır
   ve arayüzde "—" görünür. Her değerin yanında kaynağı ve zamanı taşınır.

   Sıra:
     1) Kullanıcının Cloudflare Worker proxy'si (varsa) — hepsini tek seferde verir
     2) Tarayıcıdan doğrudan erişilebilen, anahtarsız ve CORS açık API'ler (kur + ons altın)
     3) Son başarılı çekimin önbelleği (zaman damgasıyla, "eski veri" olarak işaretli)
     4) Kullanıcının elle girdiği değer
*/

import { durum, kaydet, yayinla } from './store.js';
import { bugun } from './fmt.js';

const GRAM_ONS = 31.1034768;
const GECMIS_ANAHTAR = 'pb2_piyasa_gecmis';
const ONBELLEK_OMRU = 15 * 60 * 1000; // 15 dk

/** Tek bir değerin taşıyıcısı. */
function deger(v, kaynak, yontem, zaman) {
  return { deger: Number.isFinite(v) ? v : null, kaynak: kaynak || null, yontem: yontem || 'yok', zaman: zaman || null };
}

export const piyasa = {
  usd: deger(null), eur: deger(null), gramAltin: deger(null),
  onsAltin: deger(null), bist: deger(null),
  cekiliyor: false, sonDeneme: null, hatalar: []
};

/* ---------- yardımcılar ---------- */

async function getir(url, zamanAsimi = 8000) {
  const kontrol = new AbortController();
  const t = setTimeout(() => kontrol.abort(), zamanAsimi);
  try {
    const c = await fetch(url, { signal: kontrol.signal, headers: { Accept: 'application/json' } });
    if (!c.ok) throw new Error('HTTP ' + c.status);
    return await c.json();
  } finally { clearTimeout(t); }
}

/* ---------- kaynaklar ---------- */

/** 1) Kullanıcının Worker proxy'si. Beklenen yanıt:
 *  { usd, eur, gramAltin, onsAltin, bist, kaynaklar:{...}, zaman } */
async function kaynakProxy() {
  const url = (durum.piyasa.proxyUrl || '').trim();
  if (!url) return null;
  const ayrac = url.includes('?') ? '&' : '?';
  const d = await getir(url + ayrac + 'action=piyasa', 10000);
  if (!d || typeof d !== 'object' || d.error) throw new Error(d && d.error ? String(d.error) : 'proxy yanıtı geçersiz');
  const z = Date.now();
  const k = d.kaynaklar || {};
  return {
    usd: deger(num(d.usd), k.usd || 'proxy', 'canli', z),
    eur: deger(num(d.eur), k.eur || 'proxy', 'canli', z),
    onsAltin: deger(num(d.onsAltin), k.onsAltin || 'proxy', 'canli', z),
    gramAltin: deger(num(d.gramAltin), k.gramAltin || 'proxy', 'canli', z),
    bist: deger(num(d.bist), k.bist || 'proxy', 'canli', z)
  };
}

/** 2a) exchangerate-api açık uç noktası — anahtarsız, CORS açık. */
async function kaynakErApi() {
  const d = await getir('https://open.er-api.com/v6/latest/USD');
  if (!d || d.result !== 'success' || !d.rates || !d.rates.TRY) throw new Error('er-api yanıtı geçersiz');
  const z = Date.now();
  const usd = num(d.rates.TRY);
  const eur = d.rates.EUR ? usd / num(d.rates.EUR) : null;
  return { usd: deger(usd, 'open.er-api.com', 'canli', z), eur: deger(eur, 'open.er-api.com', 'canli', z) };
}

/** 2b) Frankfurter (ECB verisi) — anahtarsız, CORS açık. Hafta içi güncellenir. */
async function kaynakFrankfurter() {
  const d = await getir('https://api.frankfurter.app/latest?from=USD&to=TRY,EUR');
  if (!d || !d.rates || !d.rates.TRY) throw new Error('frankfurter yanıtı geçersiz');
  const z = Date.now();
  const usd = num(d.rates.TRY);
  const eur = d.rates.EUR ? usd / num(d.rates.EUR) : null;
  return { usd: deger(usd, 'frankfurter.app (ECB)', 'canli', z), eur: deger(eur, 'frankfurter.app (ECB)', 'canli', z) };
}

/** 2c) Ons altın (USD) — anahtarsız. */
async function kaynakOnsAltin() {
  const d = await getir('https://api.gold-api.com/price/XAU');
  const p = num(d && (d.price ?? d.Price));
  if (!Number.isFinite(p) || p <= 0) throw new Error('altın yanıtı geçersiz');
  return { onsAltin: deger(p, 'gold-api.com', 'canli', Date.now()) };
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
}

/* ---------- ana çekim ---------- */

export async function piyasayiCek({ zorla = false } = {}) {
  if (piyasa.cekiliyor) return piyasa;

  const ob = durum.piyasa.onbellek;
  if (!zorla && ob && Date.now() - ob.zaman < ONBELLEK_OMRU) {
    uygula(ob.veri, 'canli');
    elleyiUygula();
    yayinla('piyasa', piyasa);
    return piyasa;
  }

  piyasa.cekiliyor = true;
  piyasa.hatalar = [];
  yayinla('piyasa', piyasa);

  const toplanan = {};
  const dene = async (ad, fn) => {
    try {
      const r = await fn();
      if (r) for (const [k, v] of Object.entries(r)) if (v && v.deger !== null && !toplanan[k]) toplanan[k] = v;
    } catch (e) {
      piyasa.hatalar.push(ad + ': ' + (e && e.message ? e.message : 'hata'));
    }
  };

  // proxy her şeyi verebilir; önce o denenir
  await dene('proxy', kaynakProxy);

  // eksik kalan kur bilgisi için doğrudan kaynaklar
  if (!toplanan.usd) await dene('er-api', kaynakErApi);
  if (!toplanan.usd) await dene('frankfurter', kaynakFrankfurter);
  if (!toplanan.onsAltin) await dene('gold-api', kaynakOnsAltin);

  // gram altın türetimi: ons (USD) × USD/TRY ÷ 31,1034768
  if (!toplanan.gramAltin && toplanan.onsAltin && toplanan.usd) {
    toplanan.gramAltin = deger(
      toplanan.onsAltin.deger * toplanan.usd.deger / GRAM_ONS,
      'hesaplandı: ons × USD/TRY ÷ 31,1035', 'canli', Date.now()
    );
  }

  piyasa.cekiliyor = false;
  piyasa.sonDeneme = Date.now();

  const bulunan = Object.keys(toplanan).length;
  if (bulunan) {
    durum.piyasa.onbellek = { zaman: Date.now(), veri: sadeleştir(toplanan) };
    kaydet('piyasa');
    uygula(toplanan, 'canli');
    gecmiseYaz();
  } else if (ob) {
    uygula(ob.veri, 'onbellek');
  } else {
    ['usd', 'eur', 'gramAltin', 'onsAltin', 'bist'].forEach(k => { piyasa[k] = deger(null); });
  }

  elleyiUygula();
  yayinla('piyasa', piyasa);
  return piyasa;
}

function sadeleştir(t) {
  const o = {};
  for (const [k, v] of Object.entries(t)) o[k] = { deger: v.deger, kaynak: v.kaynak, zaman: v.zaman };
  return o;
}

function uygula(veri, yontem) {
  ['usd', 'eur', 'gramAltin', 'onsAltin', 'bist'].forEach(k => {
    const v = veri && veri[k];
    piyasa[k] = v && v.deger !== null && v.deger !== undefined
      ? deger(v.deger, v.kaynak, yontem, v.zaman)
      : deger(null);
  });
}

/**
 * Açılışta çağrılır: önbellek ve elle girilen değerler hemen uygulanır,
 * böylece ağ isteği hiç yapılmasa bile (otomatik çekim kapalıysa ya da
 * çevrimdışıysan) arayüz elindeki en iyi veriyle çizilir.
 */
export function piyasayiHazirla() {
  const ob = durum.piyasa.onbellek;
  if (ob && ob.veri) {
    const bayat = Date.now() - ob.zaman >= ONBELLEK_OMRU;
    uygula(ob.veri, bayat ? 'onbellek' : 'canli');
  }
  elleyiUygula();
  yayinla('piyasa', piyasa);
  return piyasa;
}

/** Elle girilen değerler, çekilemeyen alanların yerine geçer. */
function elleyiUygula() {
  const e = durum.piyasa.elle || {};
  ['usd', 'eur', 'gramAltin', 'onsAltin', 'bist'].forEach(k => {
    const v = num(e[k] && e[k].deger !== undefined ? e[k].deger : e[k]);
    if (!Number.isFinite(v) || v <= 0) return;
    // canlı veri varsa ona dokunma; sadece boş alanı doldur
    if (piyasa[k].deger === null) {
      piyasa[k] = deger(v, 'elle girildi', 'elle', (e[k] && e[k].zaman) || null);
    }
  });
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
    ['usd', 'eur', 'gramAltin', 'bist'].forEach(k => {
      if (piyasa[k] && piyasa[k].deger !== null) kayit[k] = Math.round(piyasa[k].deger * 10000) / 10000;
    });
    if (Object.keys(kayit).length) {
      g[gun] = kayit;
      // en fazla 400 gün tut
      const gunler = Object.keys(g).sort();
      while (gunler.length > 400) delete g[gunler.shift()];
      localStorage.setItem(GECMIS_ANAHTAR, JSON.stringify(g));
    }
  } catch (e) { /* depolama dolu olabilir; kritik değil */ }
}

/** Geçmişi seri hâline getirir: [{etiket, deger}] */
export function gecmisSeri(alan, gunSayisi = 30) {
  const g = gecmisOku();
  return Object.keys(g).sort().slice(-gunSayisi)
    .filter(t => Number.isFinite(g[t][alan]))
    .map(t => ({ etiket: t.slice(8) + '.' + t.slice(5, 7), deger: g[t][alan], tarih: t }));
}

/** Elde tutulan TL'nin belirli bir varlık cinsinden değeri (sadece gerçek geçmiş varsa). */
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
