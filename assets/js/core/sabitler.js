/* Ortak sabitler — kategori listeleri, tür adları, ikonlar. */

export const KATEGORILER = [
  'Market', 'Yeme-İçme', 'Ulaşım', 'Fatura', 'Kira', 'Sağlık',
  'Giyim', 'Eğitim', 'Çocuk', 'Eğlence', 'Abonelik', 'Borç', 'Diğer'
];

export const KATEGORI_IKON = {
  Market: '◱', 'Yeme-İçme': '◲', Ulaşım: '◰', Fatura: '◳', Kira: '⌂',
  Sağlık: '✚', Giyim: '◇', Eğitim: '◈', Çocuk: '◌', Eğlence: '◉',
  Abonelik: '⟳', Borç: '◧', Diğer: '○'
};

export const KATEGORI_RENK = {
  Market: 'var(--em)', 'Yeme-İçme': 'var(--amber)', Ulaşım: 'var(--blue)',
  Fatura: 'var(--violet)', Kira: 'var(--gold)', Sağlık: 'var(--red)',
  Giyim: 'var(--teal)', Eğitim: 'var(--blue)', Çocuk: 'var(--violet)',
  Eğlence: 'var(--amber)', Abonelik: 'var(--teal)', Borç: 'var(--red)', Diğer: 'var(--muted)'
};

/** Sabit gider türleri — öncelik hesabında kullanılır. */
export const SABIT_TURLER = [
  { deger: 'fatura',   ad: 'Fatura' },
  { deger: 'kira',     ad: 'Kira' },
  { deger: 'abonelik', ad: 'Abonelik' },
  { deger: 'taksit',   ad: 'Taksit / kredi' },
  { deger: 'vergi',    ad: 'Vergi / resmî ödeme' },
  { deger: 'diger',    ad: 'Diğer düzenli gider' }
];

/** Kesinti riski: ödenmezse hizmet kesilir mi, hayat durur mu? (0–10) */
export const KESINTI_SECENEK = [
  { deger: '10', ad: 'Çok yüksek — kesilirse hayat durur (elektrik, su, kira)' },
  { deger: '7',  ad: 'Yüksek — ciddi aksama (doğalgaz, sağlık)' },
  { deger: '5',  ad: 'Orta — işim aksar (internet, telefon)' },
  { deger: '3',  ad: 'Düşük — idare edilir' },
  { deger: '1',  ad: 'Çok düşük — iptal edilebilir (abonelik)' }
];

export const GELIR_TURLER = [
  { deger: 'maas',    ad: 'Maaş' },
  { deger: 'serbest', ad: 'Serbest / fatura karşılığı' },
  { deger: 'kira',    ad: 'Kira geliri' },
  { deger: 'ek',      ad: 'Ek iş' },
  { deger: 'destek',  ad: 'Destek / yardım' },
  { deger: 'diger',   ad: 'Diğer' }
];

export const BORC_TURLER = [
  { deger: 'kk',      ad: 'Kredi kartı' },
  { deger: 'ihtiyac', ad: 'İhtiyaç kredisi' },
  { deger: 'tasit',   ad: 'Taşıt kredisi' },
  { deger: 'konut',   ad: 'Konut kredisi' },
  { deger: 'kmh',     ad: 'KMH / ek hesap' },
  { deger: 'taksit',  ad: 'Alışveriş taksiti' },
  { deger: 'kisi',    ad: 'Kişiye borç' },
  { deger: 'diger',   ad: 'Diğer' }
];

export const BORC_IKON = {
  kk: '▤', ihtiyac: '◫', tasit: '◰', konut: '⌂', kmh: '◪', taksit: '▦', kisi: '◌', diger: '○'
};

export const VARLIK_TURLER = [
  { deger: 'tl',    ad: 'TL — vadesiz / nakit',  birim: '₺' },
  { deger: 'mevduat', ad: 'TL — vadeli mevduat', birim: '₺' },
  { deger: 'usd',   ad: 'Dolar',                 birim: '$' },
  { deger: 'eur',   ad: 'Euro',                  birim: '€' },
  { deger: 'altin', ad: 'Altın (gram)',          birim: 'gr' },
  { deger: 'hisse', ad: 'Hisse senedi',          birim: 'adet' },
  { deger: 'fon',   ad: 'Yatırım fonu',          birim: 'pay' },
  { deger: 'diger', ad: 'Diğer',                 birim: 'adet' }
];

export const VARLIK_BIRIM = Object.fromEntries(VARLIK_TURLER.map(v => [v.deger, v.birim]));

export const SEPET_BIRIMLER = ['kg', 'lt', 'adet', 'paket', 'gr', 'ml', 'düzine'];
