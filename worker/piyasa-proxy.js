/* ============================================================
   Para Bilinci — piyasa verisi proxy'si (Cloudflare Worker)

   NEDEN GEREKLİ?
   Döviz kuru, ons altın ve ons gümüş için tarayıcıdan doğrudan erişilebilen,
   CORS başlığı gönderen ücretsiz API'ler var. Ama BIST 100 için yok:
   Yahoo Finance, Stooq ve TCMB tarayıcıdan gelen isteklere CORS başlığı
   döndürmez, dolayısıyla siteden doğrudan çağrılamaz. Araya bir sunucu
   girmesi gerekir. Bu dosya o sunucudur.

   NASIL KURULUR?
   Seçenek A — Mevcut bir Worker'ına ekle:
     1. Cloudflare panelinde Worker'ını aç.
     2. fetch() fonksiyonunun EN BAŞINA şu bloğu ekle:

          if (new URL(request.url).searchParams.get('action') === 'piyasa') {
            return piyasaCevapla(request);
          }

     3. Bu dosyadaki piyasaCevapla ve yardımcı fonksiyonları
        Worker dosyanın sonuna yapıştır.
     4. Yayınla. Sitede Ayarlar > Piyasa verisi bölümüne Worker adresini yaz.

   Seçenek B — Ayrı bir Worker olarak yayınla:
     Bu dosyanın tamamını yeni bir Worker'a koy, yayınla, adresini siteye gir.

   GÜVENLİK NOTU
   Bu uç nokta yalnızca herkese açık piyasa verisi döndürür; kimlik
   doğrulaması gerektirmez. Kötüye kullanımı ve upstream rate limit riskini sınırlamak için yanıtlar
   Cloudflare kenar önbelleğinde 5 dakika tutulur; kaç kullanıcı olursa olsun
   upstream'e dakikada birden fazla istek gitmez. Kullandığı kaynakların hepsi
   ücretsiz ve anahtarsızdır — bu Worker hiçbir ücretli servis çağırmaz.
   IZIN_VERILEN_KAYNAKLAR listesini kendi alan adınla sınırlamanı öneririm.
   ============================================================ */

const IZIN_VERILEN_KAYNAKLAR = [
  'https://eraysenel.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
];

const GRAM_ONS = 31.1034768;

function cors(origin) {
  const izin = IZIN_VERILEN_KAYNAKLAR.includes(origin) ? origin : IZIN_VERILEN_KAYNAKLAR[0];
  return {
    'Access-Control-Allow-Origin': izin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

/** Ana giriş: ?action=piyasa isteğini yanıtlar. */
export async function piyasaCevapla(request) {
  const origin = request.headers.get('Origin') || '';
  const basliklar = { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' };

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  // kenar önbelleği: aynı yanıt 5 dk boyunca tekrar üretilmez
  const onbellek = caches.default;
  const anahtar = new Request(new URL(request.url).origin + '/__piyasa', { method: 'GET' });
  const kayitli = await onbellek.match(anahtar);
  if (kayitli) {
    const g = new Response(kayitli.body, kayitli);
    Object.entries(basliklar).forEach(([k, v]) => g.headers.set(k, v));
    return g;
  }

  const kaynaklar = {};
  const hatalar = [];

  const [kur, ons, gumus, bist] = await Promise.all([
    guvenli(kurCek, hatalar, 'kur'),
    guvenli(onsAltinCek, hatalar, 'altin'),
    guvenli(onsGumusCek, hatalar, 'gumus'),
    guvenli(bistCek, hatalar, 'bist')
  ]);

  let usd = null, eur = null;
  if (kur) { usd = kur.usd; eur = kur.eur; kaynaklar.usd = kur.kaynak; kaynaklar.eur = kur.kaynak; }

  let onsAltin = null;
  if (ons) { onsAltin = ons.deger; kaynaklar.onsAltin = ons.kaynak; }

  let gramAltin = null;
  if (onsAltin && usd) {
    gramAltin = onsAltin * usd / GRAM_ONS;
    kaynaklar.gramAltin = 'hesaplandı (ons × USD/TRY ÷ 31,1035)';
  }

  let onsGumus = null;
  if (gumus) { onsGumus = gumus.deger; kaynaklar.onsGumus = gumus.kaynak; }

  let gramGumus = null;
  if (onsGumus && usd) {
    gramGumus = onsGumus * usd / GRAM_ONS;
    kaynaklar.gramGumus = 'hesaplandı (ons × USD/TRY ÷ 31,1035)';
  }

  let bistDeger = null;
  if (bist) { bistDeger = bist.deger; kaynaklar.bist = bist.kaynak; }

  const govde = JSON.stringify({
    usd, eur, onsAltin, gramAltin, onsGumus, gramGumus, bist: bistDeger,
    kaynaklar,
    hatalar: hatalar.length ? hatalar : undefined,
    zaman: Date.now()
  });

  const cevap = new Response(govde, { headers: { ...basliklar, 'Cache-Control': 'public, max-age=300' } });
  await onbellek.put(anahtar, cevap.clone());
  return cevap;
}

async function guvenli(fn, hatalar, ad) {
  try { return await fn(); }
  catch (e) { hatalar.push(ad + ': ' + (e && e.message ? e.message : 'hata')); return null; }
}

async function json(url, secenek = {}) {
  const c = await fetch(url, {
    ...secenek,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParaBilinci/1.0)', Accept: 'application/json', ...(secenek.headers || {}) },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!c.ok) throw new Error('HTTP ' + c.status);
  return c.json();
}

/** USD/TRY ve EUR/TRY. Birinci kaynak düşerse ikinciye geçer. */
async function kurCek() {
  try {
    const d = await json('https://open.er-api.com/v6/latest/USD');
    if (d && d.result === 'success' && d.rates && d.rates.TRY) {
      return {
        usd: d.rates.TRY,
        eur: d.rates.EUR ? d.rates.TRY / d.rates.EUR : null,
        kaynak: 'open.er-api.com'
      };
    }
    throw new Error('yanıt geçersiz');
  } catch {
    const d = await json('https://api.frankfurter.app/latest?from=USD&to=TRY,EUR');
    if (!d || !d.rates || !d.rates.TRY) throw new Error('frankfurter yanıtı geçersiz');
    return {
      usd: d.rates.TRY,
      eur: d.rates.EUR ? d.rates.TRY / d.rates.EUR : null,
      kaynak: 'frankfurter.app (ECB)'
    };
  }
}

/** Ons altın (USD). */
async function onsAltinCek() {
  try {
    const d = await json('https://api.gold-api.com/price/XAU');
    const p = Number(d && (d.price ?? d.Price));
    if (p > 0) return { deger: p, kaynak: 'gold-api.com' };
    throw new Error('yanıt geçersiz');
  } catch {
    // Yahoo Finance vadeli altın sözleşmesi — yaklaşık spot yerine geçer
    const d = await json('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=1d');
    const p = Number(d?.chart?.result?.[0]?.meta?.regularMarketPrice);
    if (!(p > 0)) throw new Error('yahoo altın yanıtı geçersiz');
    return { deger: p, kaynak: 'Yahoo Finance (GC=F vadeli)' };
  }
}

/** Ons gümüş (USD). */
async function onsGumusCek() {
  try {
    const d = await json('https://api.gold-api.com/price/XAG');
    const p = Number(d && (d.price ?? d.Price));
    if (p > 0) return { deger: p, kaynak: 'gold-api.com' };
    throw new Error('yanıt geçersiz');
  } catch {
    const d = await json('https://query1.finance.yahoo.com/v8/finance/chart/SI=F?range=1d&interval=1d');
    const p = Number(d?.chart?.result?.[0]?.meta?.regularMarketPrice);
    if (!(p > 0)) throw new Error('yahoo gümüş yanıtı geçersiz');
    return { deger: p, kaynak: 'Yahoo Finance (SI=F vadeli)' };
  }
}

/** BIST 100 endeksi. Tarayıcıdan çekilemeyen tek veri budur. */
async function bistCek() {
  try {
    const d = await json('https://query1.finance.yahoo.com/v8/finance/chart/XU100.IS?range=5d&interval=1d');
    const meta = d?.chart?.result?.[0]?.meta;
    const p = Number(meta?.regularMarketPrice);
    if (!(p > 0)) throw new Error('yanıt geçersiz');
    return { deger: p, oncekiKapanis: Number(meta?.chartPreviousClose) || null, kaynak: 'Yahoo Finance (XU100.IS)' };
  } catch {
    const c = await fetch('https://stooq.com/q/l/?s=^bist&f=sd2t2ohlc&h&e=csv', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParaBilinci/1.0)' },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!c.ok) throw new Error('stooq HTTP ' + c.status);
    const satirlar = (await c.text()).trim().split('\n');
    if (satirlar.length < 2) throw new Error('stooq boş yanıt');
    const s = satirlar[1].split(',');
    const p = Number(s[6]);
    if (!(p > 0)) throw new Error('stooq değeri okunamadı');
    return { deger: p, kaynak: 'stooq.com' };
  }
}

/* Seçenek B için hazır dışa aktarım (ayrı Worker olarak yayınlarsan). */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request.headers.get('Origin') || '') });
    }
    if (url.searchParams.get('action') === 'piyasa' || url.pathname === '/piyasa') {
      return piyasaCevapla(request);
    }
    return new Response(JSON.stringify({ error: 'Bilinmeyen istek. ?action=piyasa kullanın.' }), {
      status: 404,
      headers: { ...cors(request.headers.get('Origin') || ''), 'Content-Type': 'application/json' }
    });
  }
};
