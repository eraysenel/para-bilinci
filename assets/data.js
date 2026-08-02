/* =========================================================================
   PARA BİLİNCİ — KESİN VERİ DOSYASI
   -------------------------------------------------------------------------
   İlke: Bu dosyada tahmin yoktur. Her rakam, yayınlanmış resmi/bağımsız bir
   kaynağa ve tarihe bağlıdır. Yeni veri açıklandığında yalnızca bu dosya
   güncellenir; arayüz kaynağı ve tarihi otomatik gösterir.

   GÜNCELLEME REHBERİ (her ayın ilk haftası):
   1) TÜİK TÜFE bülteni  → https://data.tuik.gov.tr  (yıllık % + grup kırılımı)
   2) ENAG               → https://enagrup.org       (yıllık %)
   3) TCMB kredi kartı azami faiz oranları → tcmb.gov.tr (değişirse)
   4) SNAPSHOT (kur/altın/BIST son bilinen değer) — canlı veri zaten API'den
      gelir; snapshot yalnızca API erişilemezse gösterilen "son bilinen"dir.
   ========================================================================= */

var PB_DATA = {

  /* ---- Enflasyon: yıllık % (yayınlanmış seriler) ---- */
  inflation: {
    updatedAt: "2026-07-03",
    note: "Temmuz 2026 verisi 3 Ağustos 2026'da açıklanacak; açıklanınca ekleyin.",
    months: ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
    tuik: {
      label: "TÜİK (resmi)",
      source: "TÜİK Tüketici Fiyat Endeksi bültenleri",
      url: "https://data.tuik.gov.tr",
      annual: [30.89, 30.65, 31.53, 30.87, 32.37, 32.61, 32.11]
    },
    enag: {
      label: "ENAG (bağımsız)",
      source: "Enflasyon Araştırma Grubu aylık açıklamaları",
      url: "https://enagrup.org",
      annual: [56.14, 53.42, 54.14, 54.62, 55.38, 53.13, 51.49]
    },
    /* 12 aylık ortalama (kira artışı tavanı hesabında kullanılır) */
    twelveMonthAvg: { value: 32.03, asOf: "2026-06", note: "Temmuz 2026'da yapılan kira sözleşme yenilemelerinde uygulanan tavan" }
  },

  /* ---- Harcama gruplarına göre yıllık artış (TÜİK) ---- */
  categoriesAnnual: {
    asOf: "2026-06",
    source: "TÜİK TÜFE Haziran 2026 bülteni",
    general: 32.11,
    monthlyGeneral: 0.99,
    groups: [
      { name: "Eğitim",                          annual: 46.10, note: "En yüksek artışlı ana grup" },
      { name: "Konut, su, elektrik, gaz",        annual: 45.14, note: "Kira bu grubun içinde" },
      { name: "Gıda ve alkolsüz içecekler",      annual: 35.45, note: "Enflasyona en büyük katkı: 8,61 puan" },
      { name: "Ulaştırma",                       annual: 31.15, note: "" }
    ]
  },

  /* ---- TCMB kredi kartı azami faiz oranları (aylık %) ---- */
  creditCard: {
    asOf: "2026-01-01",
    source: "TCMB Kredi Kartı İşlemlerinde Uygulanacak Azami Faiz Oranları",
    url: "https://www.tcmb.gov.tr",
    note: "Oranlar dönem borcu kademesine göre uygulanır; TCMB değiştirebilir, güncelliğini kontrol edin.",
    tiers: [
      { maxDebt: 30000,    akdi: 3.25, gecikme: 3.55, label: "30.000 ₺ altı" },
      { maxDebt: 180000,   akdi: 3.75, gecikme: 4.05, label: "30.000–180.000 ₺" },
      { maxDebt: Infinity, akdi: 4.25, gecikme: 4.55, label: "180.000 ₺ üzeri" }
    ],
    kkdf: 15, bsmv: 15,  /* faize eklenen vergi yüzdeleri */
    asgariNote: "Asgari ödeme oranı limite ve bankaya göre değişir; ekstrende yazan asgari tutarı esas al."
  },

  /* ---- Findeks kredi notu bantları ---- */
  findeks: {
    scale: [1, 1900],
    source: "Findeks (KKB)",
    url: "https://www.findeks.com",
    bands: [
      { min: 1,    max: 699,  label: "En riskli",  color: "critical" },
      { min: 700,  max: 1099, label: "Orta riskli", color: "serious" },
      { min: 1100, max: 1499, label: "Az riskli",  color: "warning" },
      { min: 1500, max: 1699, label: "İyi",        color: "good" },
      { min: 1700, max: 1900, label: "Çok iyi",    color: "good" }
    ]
  },

  /* ---- Piyasa SNAPSHOT: canlı API erişilemezse gösterilen son bilinen değerler ----
     Arayüz bunları her zaman "şu tarihli son bilinen değer" etiketiyle gösterir. */
  marketSnapshot: {
    asOf: "2026-08-01",
    source: "31 Tem 2026 kapanış / 1-2 Ağu 2026 piyasa verileri (basın)",
    usdtry: 47.51,
    eurtry: null,           /* canlıdan gelir; bilinen güvenilir snapshot yoksa null bırakın */
    gramGold: 6174,
    onsUsd: 4042,
    xu100: 13293
  },

  /* ---- Varsayılanlar ---- */
  defaults: {
    monthlyWorkHours: 176,      /* aylık çalışma saati (maliyet: "kaç saat çalışmana denk") */
    cooldownDays: 3,            /* satın alma süzgeci bekleme süresi */
    emergencyMonthsMin: 3,      /* acil durum fonu: en az 3 ay */
    emergencyMonthsIdeal: 6
  }
};
