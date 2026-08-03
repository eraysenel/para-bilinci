# Para Bilinci

Türkiye'nin ekonomik koşullarına göre kurulmuş, ücretsiz bir para yönetimi ve mentorluk aracı.
Statik site — sunucu yok, hesap yok, reklam yok. Tüm veriler kullanıcının tarayıcısında kalır.

**Canlı:** https://eraysenel.github.io/para-bilinci/

---

## Neden

Türk lirası enflasyon ve kur karşısında eridiği için "biriktirmek" tek başına bir strateji
değil. Aynı anda faturalar, taksitler, kredi kartı asgarileri ve bakmakla yükümlü olunan
kişiler var. Sorun genelde gelirin azlığı değil, **elde tutulan paranın görünmezliği**:
hesapta duran rakam ile gerçekten harcanabilecek rakam aynı şey değil.

Bu araç ne yapman gerektiğini söylemez. Durumunu gösterir ve kararı sana bırakır.
Eksi olmak, borçlu olmak sorun değil — görülmeyen para sorundur.

## Temel ilke: sayı uydurmamak

- Resmî veriler (TÜİK, ENAG, TCMB) **kaynağı ve tarihiyle** birlikte gösterilir.
- Çekilemeyen bir değer `—` olarak kalır; asla tahminle doldurulmaz.
- Projeksiyon içeren her hesap **"Senaryo"** etiketiyle ve varsayımı yazılarak sunulur.
- Elle girilen piyasa değerleri `elle girildi` rozetiyle işaretlenir, canlı veriyle karıştırılmaz.
- Gelecek getirisi hakkında sayı üretilmez.

## İkinci ilke: sıfır maliyet

Site hiçbir ücretli servise bağlanmaz. Kullanılan tüm canlı veri kaynakları ücretsiz ve
API anahtarı gerektirmez; reklam, analitik ve takip kodu yoktur. Barındırma GitHub Pages'te
statik dosya sunumundan ibarettir.

Ücretsiz kaynakları yormamak için tarayıcı tarafında bir istek freni vardır:

| Fren | Değer |
|---|---|
| Önbellek ömrü (bu süre içinde ağa çıkılmaz) | 30 dk |
| Ardışık ağ denemesi arasındaki alt sınır | 10 dk |
| Elle yenilemede alt sınır | 60 sn |
| Hata sonrası artan bekleme | 1 → 5 → 15 → 60 dk |
| Günlük istek üst sınırı (cihaz başına) | 24 |

Kur kaynakları günde bir güncellendiği için bu sıklık fazlasıyla yeterlidir.
Worker proxy kullanılıyorsa yanıtlar ayrıca Cloudflare kenar önbelleğinde 5 dakika tutulur —
kaç kullanıcı olursa olsun upstream'e dakikada birden fazla istek gitmez.

## Ekranlar

| Ekran | Ne yapar |
|---|---|
| **Bugün** | Güvenli günlük harcama, rezerve/serbest ayrımı, finansal sağlık, TL'nin erimesi |
| **Almadan Önce** | Bekleme süresi, saat cinsinden maliyet, indirim tuzakları |
| **Nakit Akışı** | Gelir/sabit gider/hane, şelale grafiği, harcama kaydı ve kategori dağılımı |
| **Faturalar** | Öncelik puanlaması, para yetmezse ödeme sırası, vade takvimi |
| **Borç & Taksit** | Asgari vs tam ödeme simülasyonu, çığ/kartopu karşılaştırması, 12 aylık taahhüt |
| **Enflasyon** | TÜİK + ENAG, kategori bazlı artış, **kendi sepetinin enflasyonu**, reel getiri |
| **Yatırım** | Ön koşul kontrolü, varlık dağılımı ve hedeften sapma, acil fon, düzenli alım |
| **Mutfak** | Porsiyon maliyeti, evde vs dışarıda yıllık fark |
| **Kredi Skoru** | Findeks notu takibi, limit kullanım oranı, kişiselleştirilmiş eylem listesi |
| **Para 101** | 8 modül / 27 ders — temelden yatırıma, her dersin sonunda tek bir eylem |

### Öne çıkan hesaplar

**Güvenli günlük harcama.** Eldeki nakitten, bir sonraki gelire kadar ödenmesi zorunlu olan
her şey (rezerve) ayrılır; kalan, o güne kadarki gün sayısına bölünür. Ay ortasında paranın
bitmesinin bir numaralı sebebi, rezerve paranın harcanabilir sanılmasıdır.

**Öncelik puanlaması (0–100).** Üç ölçüt ağırlıklı olarak birleştirilir — kesinti riski (0–60),
gecikince oluşan bileşik maliyet (0–25), kredi notuna etkisi (0–15) — ve vade yakınlığı çarpan
olarak uygulanır. Barınma ve temel hizmetler her zaman önce gelir.

**Asgari vs tam ödeme.** TCMB'nin ilan ettiği azami akdi faiz oranları ve BDDK'nın limite bağlı
asgari ödeme oranlarıyla ay ay simüle edilir: kaç ayda biter, ne kadar faiz ödersin, toplam
ödeme anaparanın kaç katına çıkar.

**Kişisel enflasyon.** Kullanıcının kendi sepetindeki ürünlerin fiyat geçmişinden hesaplanır ve
TÜİK/ENAG ile yan yana gösterilir. Ortalama kimsenin gerçeği değildir.

## Veri kaynakları

### Referans veriler — `data/referans.json`

Resmî bültenlerden **elle** işlenir; modelleme veya tahmin içermez.
Yeni veri açıklandığında bu dosya güncellenir (`guncellemeTarihi` alanı ile birlikte).
Bilinmeyen değerler `null` bırakılır ve arayüzde `—` görünür.

Şu an içerdiği dönem: **Temmuz 2026**
- TÜİK TÜFE: aylık %1,78 · yıllık %31,75 · 12 aylık ortalama %31,90
- ENAG: aylık %3,07 · yıllık %50,49
- TCMB politika faizi: %37
- TCMB azami kredi kartı akdi faizi: %3,25 / %3,75 / %4,25 (dönem borcu kademesine göre)
- BDDK asgari ödeme oranı: limit ≤50.000 ₺ için %20, üzeri için %40

### Canlı piyasa verisi

Hepsi ücretsiz ve anahtarsızdır.

| Veri | Kaynak | Tarayıcıdan doğrudan? |
|---|---|---|
| USD/TRY, EUR/TRY | open.er-api.com → frankfurter.app (ECB) | ✅ CORS açık |
| Ons altın (XAU), ons gümüş (XAG) | gold-api.com | ✅ CORS açık |
| Gram altın / gram gümüş (₺) | ons × USD/TRY ÷ 31,1035 ile hesaplanır | ✅ türetilir |
| BIST 100 | Yahoo Finance / Stooq | ❌ **proxy gerekir** |

BIST 100 için araya bir sunucu girmesi gerekiyor: Yahoo Finance, Stooq ve TCMB tarayıcıdan
gelen isteklere CORS başlığı döndürmez. Hazır Worker kodu depoda:

**`worker/piyasa-proxy.js`** — mevcut bir Worker'a eklenebilir ya da ayrı yayınlanabilir
(Cloudflare'in ücretsiz planı fazlasıyla yeter). Kurulum adımları dosyanın başında yazılı.
Yayınladıktan sonra adresi uygulamada
**Ayarlar → Canlı piyasa verisi → Cloudflare Worker adresi** alanına gir.

Proxy olmadan da her şey çalışır; BIST ve istenirse diğer değerler elle girilebilir.

## Kurulum

Statik site; derleme adımı yok. ES modülleri kullandığı için `file://` ile değil,
bir web sunucusu üzerinden açılmalı:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

GitHub Pages'te doğrudan çalışır (`.nojekyll` mevcut).

## Yapı

```
index.html                  uygulama kabuğu
assets/css/app.css          tasarım sistemi (koyu/açık tema, duyarlı)
assets/js/
  app.js                    yönlendirme, başlatma, kurulum sihirbazı
  core/
    store.js                durum + localStorage (pb2_* anahtarları)
    hesap.js                tüm mentor mantığı ve finansal hesaplar
    market.js               canlı piyasa verisi, çok kaynaklı fallback
    chart.js                SVG grafik kütüphanesi (sıfır bağımlılık)
    fmt.js                  Türkçe sayı/tarih biçimlendirme ve ayrıştırma
    ui.js                   modal, bildirim, form parçaları, olay yönlendirme
    sabitler.js             kategori ve tür listeleri
    kilit.js                WebCrypto ile şifreli saklama (PBKDF2 + AES-GCM)
  views/                    11 ekran + kilit ekranı
data/
  referans.json             doğrulanmış resmî veriler (kaynak + tarih ile)
  mufredat.json             Para 101 müfredatı
worker/piyasa-proxy.js      Cloudflare Worker — BIST 100 için
```

Harici kütüphane, CDN, derleme aracı ve paket bağımlılığı yoktur.

## Gizlilik ve kilit

Tüm veriler tarayıcının `localStorage` alanında durur ve **hiçbir sunucuya gönderilmez**.
Site yalnızca piyasa fiyatı çekmek için dışarı istek yapar; bu isteklerde senin verinden
hiçbir şey taşınmaz. Hesap yok, giriş yok, çerez yok, analitik yok.

### Kilit (kullanıcı adı + şifre)

Ayarlar'dan bir kullanıcı adı ve şifre belirleyebilirsin. Bu bir hesap değildir —
sunucuya kayıt olmazsın. Şifre, verini **gerçekten şifrelemek** için kullanılır:

| | |
|---|---|
| Anahtar türetme | PBKDF2-SHA256, 250.000 tur, 16 baytlık rastgele tuz |
| Şifreleme | AES-GCM 256 bit, her yazmada yeni rastgele IV |
| Anahtarın saklandığı yer | Bellek; istenirse sekme ömrü boyunca `sessionStorage` — diske asla yazılmaz |

Kilit kuruluyken `localStorage`'da okunabilir JSON yoktur, yalnızca şifrelenmiş blok vardır.
Tarayıcı konsolunu açan biri de veriyi okuyamaz.

> **Şifre sıfırlanamaz.** Sunucu yok, kurtarma anahtarı yok, "şifremi unuttum" e-postası yok.
> Şifreyi unutursan veriler kalıcı olarak erişilemez hâle gelir. Kilidi kurmadan önce
> mutlaka yedek indir.

Yedek dosyaları bilerek **şifresiz** indirilir — kurtarma yolu olarak işe yaraması için.
Yedeğini güvenli bir yerde tut.

Kilit tarayıcının WebCrypto API'sini kullanır; bu da sayfanın **https** ya da **localhost**
üzerinden açılmasını gerektirir. Desteklenmeyen ortamda kilit bölümü kendini devre dışı bırakır
ve nedenini yazar.

Verinin cihazda durması, tarayıcı verisi temizlendiğinde kaybolacağı anlamına gelir —
Ayarlar ekranından düzenli yedek almak önerilir.

## Katkı

Bu araç **İyilik İçin Yapay Zekâ** topluluğunun ücretsiz projelerinden biridir; kâr amacı
gütmez. Yazılım, tasarım, içerik ve alan uzmanlığı katkısı açıktır:
https://eraysenel.github.io/iyilik-icin-ai/

### Referans verileri güncellemek

TÜİK genelde her ayın 3'ünde, ENAG aynı günlerde, TCMB azami kart faizlerini her ayın
sondan beşinci iş gününde açıklar. `data/referans.json` içindeki ilgili alanları resmî
bültenden okuyup güncelle ve `guncellemeTarihi` alanını değiştir.
Emin olmadığın bir değeri tahmin etme — `null` bırak.

---

Bir **İyilik İçin Yapay Zekâ** projesi · © Eray Şenel
