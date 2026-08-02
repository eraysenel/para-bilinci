# 💰 Para Bilinci

Türkiye ekonomisinin gerçeklerine göre tasarlanmış, ücretsiz ve herkese açık bir
**para yönetimi mentoru**. Kâr amacı gütmez; [İyilik İçin Yapay Zeka](https://eraysenel.github.io/iyilik-icin-ai/)
topluluğu projesidir.

## Felsefe

- **TL eriyor → paranın gerçek değeri gösterilir.** Bakiye TL, dolar ve gram altın
  karşılığıyla birlikte okunur; "erime" grafikle görünür.
- **Kesin veri, tahmin değil.** Kur canlı API'den, enflasyon TÜİK **ve** ENAG'ın
  yayınlanmış rakamlarından gelir; her sayının yanında kaynağı ve tarihi yazar.
  Veri alınamazsa uydurma değer gösterilmez — "alınamadı" denir.
- **Baskı yok, grafik var.** Ekside/borçta olmak suç değildir; kontrolsüzlük sorundur.
- **Sıra hep aynı:** 1) faturalar/zorunlular → 2) yaşam → 3) acil fon → 4) yatırım.
- **Karar kullanıcının planına göre verilir,** satıcının indirimine/aciliyetine göre değil.

## Modüller

| Sekme | İçerik |
|---|---|
| 🧭 Panel | Varlıkların gerçek değeri (₺/$/gr altın), erime grafiği, net durum, günlük harcama kotası, yaklaşan ödemeler |
| 📊 Piyasa | Canlı USD/EUR/altın/BIST, 90 günlük kur grafiği, TÜİK vs ENAG enflasyon, harcama grubu zamları, evde pişir vs dışarıda ye |
| 💵 Gelir·Gider | Hane büyüklüğü, gelirler, kategorili harcama takibi, 7 gün grafiği, CSV/yedek |
| 🧾 Fatura·Borç | Aciliyet sıralı faturalar, taksit takvimi, **kredi kartı asgari/tam analizi (gerçek TCMB oranlarıyla)**, Findeks notu takibi + rehber |
| 🎯 Plan·Yatırım | Aylık akış planı, acil durum fonu, satın alma süzgeci (3 gün beklet), "100.000 ₺ bir yıl önce nereye konsaydı?" (gerçekleşmiş veri) |
| 🎓 Para 101 | Sıfırdan finansal okuryazarlık + AI finans danışmanı |

Tüm kullanıcı verisi **yalnızca tarayıcıda** (localStorage) tutulur; hiçbir sunucuya gönderilmez.
AI danışman yalnızca özet bağlam gönderir (mevcut Cloudflare Worker + Turnstile üzerinden).

## Dosya yapısı

```
index.html              — sayfa iskeleti
assets/style.css        — tasarım sistemi (koyu tema, doğrulanmış grafik paleti)
assets/data.js          — KESİN VERİ dosyası (kaynaklı-tarihli; elle güncellenir)
assets/market.js        — canlı veri katmanı (kur API zinciri + önbellek + dürüst fallback)
assets/app.js           — uygulama mantığı + SVG grafik motoru + AI danışman
worker/market-worker.js — Cloudflare Worker "market" ucu (altın + BIST canlı verisi için)
```

## Veri güncelleme (ayda 1 kez, ~5 dakika)

Her ayın ilk haftası enflasyon açıklandığında `assets/data.js` içinde:

1. `inflation.months` dizisine yeni ayı ekle; `tuik.annual` ve `enag.annual`
   dizilerine yıllık yüzdeleri ekle (kaynak: TÜİK bülteni, enagrup.org).
2. `categoriesAnnual` grubunu TÜİK bültenindeki yıllık grup artışlarıyla güncelle.
3. TCMB kredi kartı azami faiz oranları değiştiyse `creditCard.tiers`'ı güncelle.
4. `marketSnapshot`'ı güncel kapanış değerleriyle tazele (canlı API'ler zaten
   çalışır; snapshot yalnızca API erişilemediğinde gösterilen "son bilinen"dir).

## Canlı altın + BIST (isteğe bağlı Worker kurulumu)

Döviz kurları tarayıcıdan anahtarsız API'lerle canlı gelir. **Gram altın ve BIST 100**
için tarayıcıdan güvenilir kaynak yoktur; `worker/market-worker.js` içindeki kodu
mevcut Cloudflare Worker'ına eklemen (dosyanın başındaki A seçeneği, ~2 dakika)
yeterlidir. Kurulana kadar site bu iki değeri "son bilinen değer (tarih)" etiketiyle
dürüstçe gösterir.

## Geliştirme

Derleme yok, bağımlılık yok: `index.html`'i aç ya da herhangi bir statik sunucuyla
servis et. GitHub Pages ile yayınlanır (`.nojekyll` mevcut).
