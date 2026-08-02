/* =========================================================================
   PARA BİLİNCİ — CANLI VERİ KATMANI
   -------------------------------------------------------------------------
   Kaynak zinciri (kesin veri ilkesi: veri yoksa uydurma yok, "alınamadı" var):

   Spot kur (USD/TRY, EUR/TRY):
     1. Cloudflare Worker market ucu (varsa; altın + BIST de verir)
     2. open.er-api.com   (anahtarsız, CORS açık, günlük)
     3. api.frankfurter.app (ECB referans kurları, anahtarsız, CORS açık)
     4. PB_DATA.marketSnapshot — "son bilinen değer" etiketiyle

   Gram altın & BIST 100: yalnızca Worker; yoksa snapshot etiketli gösterilir.
   USD/TRY geçmişi (grafik + erime hesabı): frankfurter zaman serisi.

   Tüm sonuçlar localStorage'da kısa süreli önbelleğe alınır (spot 30 dk,
   geçmiş 12 saat) — sayfa her açılışta API'leri dövmesin diye.
   ========================================================================= */

var PBM = (function () {
  var PROXY = "https://iyilikicinai.doksandokuz3032.workers.dev/";
  var SPOT_TTL = 30 * 60 * 1000;
  var HIST_TTL = 12 * 60 * 60 * 1000;

  function cacheGet(key, ttl) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.ts || Date.now() - obj.ts > ttl) return null;
      return obj.data;
    } catch (e) { return null; }
  }
  function cacheSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) {}
  }

  function fetchJSON(url, opts, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var ctl = new AbortController();
      var t = setTimeout(function () { ctl.abort(); }, timeoutMs || 8000);
      fetch(url, Object.assign({ signal: ctl.signal }, opts || {}))
        .then(function (r) {
          clearTimeout(t);
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(resolve)
        .catch(function (e) { clearTimeout(t); reject(e); });
    });
  }

  function isoDate(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  /* ---- Spot piyasa verisi ----
     Dönen nesne: { usdtry, eurtry, gramGold, xu100, source, asOf, live, partial } */
  async function getSpot() {
    var cached = cacheGet("pb2_cache_spot", SPOT_TTL);
    if (cached) return cached;

    var out = null;

    // 1) Worker market ucu (tam veri: kur + altın + BIST)
    try {
      var w = await fetchJSON(PROXY + "?market=1", null, 7000);
      if (w && w.usdtry) {
        out = {
          usdtry: +w.usdtry, eurtry: w.eurtry ? +w.eurtry : null,
          gramGold: w.gramGold ? +w.gramGold : null,
          xu100: w.xu100 ? +w.xu100 : null,
          source: "Canlı (Worker)", asOf: new Date().toISOString(), live: true, partial: false
        };
      }
    } catch (e) {}

    // 2) open.er-api.com — USD bazlı tablo; TRY ve EUR çaprazı buradan
    if (!out) {
      try {
        var er = await fetchJSON("https://open.er-api.com/v6/latest/USD", null, 8000);
        if (er && er.result === "success" && er.rates && er.rates.TRY) {
          out = {
            usdtry: +er.rates.TRY,
            eurtry: er.rates.EUR ? +(er.rates.TRY / er.rates.EUR) : null,
            gramGold: null, xu100: null,
            source: "Canlı kur (open.er-api.com — günlük)",
            asOf: er.time_last_update_utc || new Date().toISOString(),
            live: true, partial: true
          };
        }
      } catch (e) {}
    }

    // 3) frankfurter (ECB referans kurları)
    if (!out) {
      try {
        var fr = await fetchJSON("https://api.frankfurter.app/latest?from=USD&to=TRY,EUR", null, 8000);
        if (fr && fr.rates && fr.rates.TRY) {
          out = {
            usdtry: +fr.rates.TRY,
            eurtry: fr.rates.EUR ? +(fr.rates.TRY / fr.rates.EUR) : null,
            gramGold: null, xu100: null,
            source: "Canlı kur (ECB referans — frankfurter.app)",
            asOf: fr.date, live: true, partial: true
          };
        }
      } catch (e) {}
    }

    // 4) Snapshot — dürüst etiketle
    if (!out) {
      var s = PB_DATA.marketSnapshot;
      out = {
        usdtry: s.usdtry, eurtry: s.eurtry, gramGold: s.gramGold, xu100: s.xu100,
        source: "⚠️ Canlı veri alınamadı — son bilinen değer (" + s.asOf + ")",
        asOf: s.asOf, live: false, partial: false
      };
    } else if (out.partial) {
      // Kur canlı geldi ama altın/BIST worker gerektirir → snapshot ile tamamla, ayrı etiketle
      var s2 = PB_DATA.marketSnapshot;
      out.gramGold = out.gramGold || s2.gramGold;
      out.xu100 = out.xu100 || s2.xu100;
      out.snapshotNote = "Altın & BIST: son bilinen değer (" + s2.asOf + ") — canlısı için Worker kurulumu gerekir (worker/ klasörüne bak)";
    }

    cacheSet("pb2_cache_spot", out);
    return out;
  }

  /* ---- USD/TRY günlük geçmiş (grafik + erime hesabı) ----
     days: kaç gün geriye. Döner: { dates:[], rates:[], source } | null */
  async function getUsdTryHistory(days) {
    var key = "pb2_cache_hist_" + days;
    var cached = cacheGet(key, HIST_TTL);
    if (cached) return cached;
    try {
      var end = new Date();
      var start = new Date(Date.now() - days * 86400000);
      var url = "https://api.frankfurter.app/" + isoDate(start) + ".." + isoDate(end) + "?from=USD&to=TRY";
      var d = await fetchJSON(url, null, 10000);
      if (!d || !d.rates) return null;
      var dates = Object.keys(d.rates).sort();
      var rates = dates.map(function (k) { return d.rates[k].TRY; });
      if (!rates.length) return null;
      var out = { dates: dates, rates: rates, source: "ECB referans kurları (frankfurter.app)" };
      cacheSet(key, out);
      return out;
    } catch (e) { return null; }
  }

  /* ---- Belirli bir geçmiş tarihte USD/TRY (12 ay önce vb.) ---- */
  async function getUsdTryAt(dateStr) {
    var key = "pb2_cache_at_" + dateStr;
    var cached = cacheGet(key, 7 * 24 * 3600 * 1000);
    if (cached) return cached;
    try {
      var d = await fetchJSON("https://api.frankfurter.app/" + dateStr + "?from=USD&to=TRY", null, 8000);
      if (d && d.rates && d.rates.TRY) { cacheSet(key, d.rates.TRY); return d.rates.TRY; }
      return null;
    } catch (e) { return null; }
  }

  return { getSpot: getSpot, getUsdTryHistory: getUsdTryHistory, getUsdTryAt: getUsdTryAt, PROXY: PROXY };
})();
