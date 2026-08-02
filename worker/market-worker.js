/* =========================================================================
   PARA BİLİNCİ — Cloudflare Worker "market" ucu
   -------------------------------------------------------------------------
   Ne yapar: GET ?market=1 isteğine anlık USD/TRY, EUR/TRY, gram altın (₺)
   ve BIST 100 endeksini JSON olarak döner. Kaynak: Yahoo Finance herkese
   açık grafik API'si (sunucudan erişilir; tarayıcıdan CORS engellidir,
   bu yüzden bu uç gereklidir). Sonuç 5 dakika önbelleğe alınır.

   KURULUM (iki seçenekten biri):

   A) MEVCUT WORKER'A EKLE (önerilen — aynı adres kullanılır):
      Mevcut worker'ının fetch handler'ının EN BAŞINA şu iki satırı ekle:

        if (request.method === "GET" && new URL(request.url).searchParams.has("market"))
          return handleMarket(request);

      ve bu dosyadaki handleMarket + yardımcı fonksiyonları aynı dosyaya
      yapıştır. Bitti — site otomatik olarak canlı altın/BIST göstermeye başlar.

   B) AYRI WORKER OLARAK YAYINLA:
      Bu dosyayı tek başına yeni bir Worker olarak deploy et ve
      assets/market.js içindeki PROXY adresini yeni adresle değiştirme —
      onun yerine PROXY + "?market=1" isteğini bu worker'a yönlendir
      (route veya ayrı sabit tanımlayarak).
   ========================================================================= */

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";
const TROY_OUNCE_GRAMS = 31.1034768;

async function yahooLast(symbol) {
  const r = await fetch(YAHOO + encodeURIComponent(symbol) + "?interval=1d&range=5d", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ParaBilinci/1.0)" }
  });
  if (!r.ok) throw new Error(symbol + " HTTP " + r.status);
  const d = await r.json();
  const res = d && d.chart && d.chart.result && d.chart.result[0];
  const price = res && res.meta && (res.meta.regularMarketPrice ?? null);
  if (price == null) throw new Error(symbol + " fiyat yok");
  return price;
}

async function handleMarket(request) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + "/__market_cache__");
  const hit = await cache.match(cacheKey);
  if (hit) return withCors(hit);

  const out = { ts: Date.now() };
  const results = await Promise.allSettled([
    yahooLast("USDTRY=X"),   // USD/TRY
    yahooLast("EURTRY=X"),   // EUR/TRY
    yahooLast("GC=F"),       // Altın ons ($)
    yahooLast("XU100.IS")    // BIST 100
  ]);
  if (results[0].status === "fulfilled") out.usdtry = results[0].value;
  if (results[1].status === "fulfilled") out.eurtry = results[1].value;
  if (results[3].status === "fulfilled") out.xu100 = results[3].value;
  if (results[2].status === "fulfilled" && out.usdtry) {
    out.onsUsd = results[2].value;
    out.gramGold = (results[2].value / TROY_OUNCE_GRAMS) * out.usdtry;
  }
  out.source = "Yahoo Finance (gecikmeli piyasa verisi)";

  const resp = new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" }
  });
  await cache.put(cacheKey, resp.clone());
  return withCors(resp);
}

function withCors(resp) {
  const r = new Response(resp.body, resp);
  r.headers.set("Access-Control-Allow-Origin", "*");
  r.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  r.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return r;
}

/* Seçenek B için bağımsız giriş noktası: */
export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
    if (request.method === "GET" && new URL(request.url).searchParams.has("market"))
      return handleMarket(request);
    return withCors(new Response(JSON.stringify({ error: "market ucu: GET ?market=1" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    }));
  }
};
