/* Hesap motoru — mentor mantığının tamamı burada.

   Kural: hiçbir fonksiyon veri yokken uydurma sayı üretmez.
   Veri yetersizse null veya {yeterliVeri:false} döner; arayüz bunu
   "henüz hesaplayamıyorum, şunu gir" diye gösterir.

   Projeksiyon içeren her sonuç `senaryo:true` ile işaretlenir;
   arayüz bunları "varsayım" etiketiyle sunar.
*/

import { durum } from './store.js';
import { bugun, buAy, iso, tarih, ayinGunu, ayGunSayisi, gunFark, ayEkle, kalanGun } from './fmt.js';

/* ============================================================
   1. Temel toplamlar
   ============================================================ */

export function aylikGelir() {
  return durum.gelirler.filter(g => g.aktif !== false)
    .reduce((a, g) => a + (Number(g.tutar) || 0), 0);
}

export function aylikSabit() {
  return durum.sabitler.filter(s => s.aktif !== false)
    .reduce((a, s) => a + (Number(s.tutar) || 0), 0);
}

/** Kredi kartı ve kredilerin aylık asgari/taksit yükü. */
export function aylikBorcYuku() {
  return durum.borclar.reduce((a, b) => {
    if ((b.kalan || 0) <= 0) return a;
    if (b.tur === 'kk') return a + kartAsgari(b);
    return a + (Number(b.taksitTutar) || 0);
  }, 0);
}

/** Saat ücreti — "bu kaç saatime mal olur" hesabının temeli. */
export function saatUcreti() {
  const g = aylikGelir();
  const saat = Number(durum.hane.calismaSaati) || 180;
  if (g <= 0 || saat <= 0) return null;
  return g / saat;
}

export function saateCevir(tutar) {
  const s = saatUcreti();
  if (!s || !(tutar > 0)) return null;
  return tutar / s;
}

/** Hanedeki toplam kişi sayısı (bakmakla yükümlü olunanlar dahil). */
export function haneKisi() {
  const h = durum.hane;
  return Math.max(1, (Number(h.yetiskin) || 0) + (Number(h.cocuk) || 0) + (Number(h.bakmaklaYukumlu) || 0));
}

/* ============================================================
   2. Harcamalar
   ============================================================ */

export function ayinHarcamalari(ay = buAy()) {
  return durum.harcamalar.filter(h => (h.tarih || '').slice(0, 7) === ay);
}

export function ayToplamHarcama(ay = buAy()) {
  return ayinHarcamalari(ay).reduce((a, h) => a + (Number(h.tutar) || 0), 0);
}

export function gunToplamHarcama(gun = bugun()) {
  return durum.harcamalar.filter(h => h.tarih === gun)
    .reduce((a, h) => a + (Number(h.tutar) || 0), 0);
}

export function kategoriDagilim(ay = buAy()) {
  const m = new Map();
  ayinHarcamalari(ay).forEach(h => {
    const k = h.kategori || 'Diğer';
    m.set(k, (m.get(k) || 0) + (Number(h.tutar) || 0));
  });
  return [...m.entries()].map(([ad, deger]) => ({ ad, deger })).sort((a, b) => b.deger - a.deger);
}

/** Son N ayın harcama serisi. Veri olmayan ay atlanmaz, 0 gösterilir. */
export function aylikHarcamaSerisi(adet = 6) {
  const out = [];
  for (let i = adet - 1; i >= 0; i--) {
    const ay = ayEkle(buAy(), -i);
    out.push({ ay, toplam: ayToplamHarcama(ay) });
  }
  return out;
}

/** Değişken harcamanın son 3 aylık ortalaması — bütçe tahmini için. */
export function ortalamaDegiskenHarcama() {
  const seri = aylikHarcamaSerisi(4).slice(0, 3).filter(x => x.toplam > 0);
  if (!seri.length) return null;
  return seri.reduce((a, x) => a + x.toplam, 0) / seri.length;
}

/* ============================================================
   3. Yükümlülükler, vadeler ve öncelik
   ============================================================ */

/**
 * Kategoriye göre varsayılan kesinti riski (0–10).
 * Kullanıcı sabit gideri eklerken bunu kendisi seçebilir; seçmediyse buradan gelir.
 */
const KESINTI_AGIRLIK = {
  Kira: 10, Fatura: 9, Sağlık: 9, Ulaşım: 6, Market: 8,
  Eğitim: 6, Çocuk: 7, Abonelik: 1, Eğlence: 1, Giyim: 2, Borç: 3, Diğer: 3
};

/**
 * Bir yükümlülüğün öncelik puanı (0–100).
 *
 * Üç ölçüt, ağırlık sırasıyla:
 *   1) Kesinti riski (0–60) — ödenmezse hayat durur mu? Barınma ve temel hizmetler
 *      her zaman önce gelir; evsiz kalmak, kredi notu düşmesinden ağırdır.
 *   2) Bileşik maliyet (0–25) — gecikince faiz bindiriyor mu?
 *   3) Kredi notuna etkisi (0–15) — bankaya olan gecikme yıllarca kayıtta kalır.
 *
 * Vade yakınlığı bu üçünü çarpan olarak yükseltir.
 */
export function oncelikPuani(y) {
  let p = 0;

  // 1) kesinti riski (0–60)
  const kr = Number.isFinite(Number(y.kesintiRiski))
    ? Number(y.kesintiRiski)
    : (KESINTI_AGIRLIK[y.kategori] ?? KESINTI_AGIRLIK['Diğer']);
  p += Math.min(Math.max(kr, 0), 10) * 6;

  // 2) bileşik maliyet — gecikince faiz işliyor mu (0–25)
  if (y.kaynak === 'borc') {
    const faiz = Number(y.faizAylik) || 0;
    p += Math.min(faiz / 4.55, 1) * 25;   // TCMB azami gecikme faizine göre ölçekli
  } else if (y.tur === 'vergi') {
    p += 16;
  }

  // 3) kredi notuna etkisi (0–15)
  if (y.kaynak === 'borc' && y.kurumsal !== false) p += 15;
  else if (y.tur === 'fatura') p += 4;

  // vade yakınlığı çarpanı (0.55 – 1.25)
  const kg = y.kalanGun;
  let carpan = 1;
  if (kg !== null && kg !== undefined) {
    if (kg < 0) carpan = 1.25;        // gecikmiş
    else if (kg <= 3) carpan = 1.15;
    else if (kg <= 7) carpan = 1.05;
    else if (kg <= 15) carpan = 0.9;
    else carpan = 0.7;
  }
  return Math.round(Math.min(p * carpan, 100));
}

/**
 * Belirli bir pencere içindeki tüm ödemeler, öncelik sırasına dizili.
 * @param {string} baslangic ISO tarih
 * @param {string} bitis ISO tarih
 */
export function yukumlulukler(baslangic = bugun(), bitis = null) {
  const son = bitis || ayinGunu(31, buAy());
  const out = [];

  durum.sabitler.filter(s => s.aktif !== false).forEach(s => {
    const t = ayinGunu(Number(s.gun) || 1, buAy());
    let vade = t;
    // bu ayki günü geçtiyse gelecek aya taşı
    if (gunFark(baslangic, vade) < 0) vade = ayinGunu(Number(s.gun) || 1, ayEkle(buAy(), 1));
    if (gunFark(vade, son) < 0) return;
    out.push({
      id: s.id, ad: s.ad, tutar: Number(s.tutar) || 0, vade,
      kalanGun: gunFark(baslangic, vade),
      kategori: s.kategori, tur: s.tur || 'fatura',
      kesintiRiski: s.kesintiRiski, kaynak: 'sabit', otomatik: s.otomatik
    });
  });

  durum.borclar.filter(b => (b.kalan || 0) > 0).forEach(b => {
    const gun = Number(b.sonOdemeGun) || 1;
    let vade = ayinGunu(gun, buAy());
    if (gunFark(baslangic, vade) < 0) vade = ayinGunu(gun, ayEkle(buAy(), 1));
    if (gunFark(vade, son) < 0) return;
    const tutar = b.tur === 'kk' ? kartAsgari(b) : (Number(b.taksitTutar) || 0);
    if (tutar <= 0) return;
    out.push({
      id: b.id, ad: b.ad, tutar, vade,
      kalanGun: gunFark(baslangic, vade),
      kategori: 'borc', tur: b.tur, faizAylik: kartFaizi(b),
      kaynak: 'borc', kurumsal: b.tur !== 'kisi',
      kartToplam: b.tur === 'kk' ? (Number(b.kalan) || 0) : null
    });
  });

  out.forEach(y => { y.puan = oncelikPuani(y); });
  return out.sort((a, b) => b.puan - a.puan || a.kalanGun - b.kalanGun);
}

/** Bir sonraki gelirin tarihi (bugünden sonraki en yakın). */
export function sonrakiGelir() {
  const aday = [];
  durum.gelirler.filter(g => g.aktif !== false && g.gun).forEach(g => {
    let t = ayinGunu(Number(g.gun), buAy());
    if (gunFark(bugun(), t) < 0) t = ayinGunu(Number(g.gun), ayEkle(buAy(), 1));
    aday.push({ ad: g.ad, tutar: Number(g.tutar) || 0, tarih: t, kalanGun: gunFark(bugun(), t) });
  });
  if (!aday.length) return null;
  aday.sort((a, b) => a.kalanGun - b.kalanGun);
  return aday[0];
}

/* ============================================================
   4. Güvenli günlük harcanabilir — aracın kalbi
   ============================================================ */

/**
 * "Bugün ne kadar harcayabilirim?" sorusunun dürüst cevabı.
 *
 * Mantık: eldeki nakitten, bir sonraki gelire kadar ödenmesi ZORUNLU olan
 * her şeyi ayır. Kalanı o güne kadarki gün sayısına böl.
 * Hesabındaki para ile harcayabileceğin para aynı şey değildir.
 */
export function gunlukGuvenli() {
  const nakit = Number(durum.nakit.tutar) || 0;
  const gelir = sonrakiGelir();

  // pencere: bugünden bir sonraki gelire kadar; gelir tanımlı değilse ay sonuna kadar
  const pencereSon = gelir ? gelir.tarih : ayinGunu(31, buAy());
  let gun = Math.max(gunFark(bugun(), pencereSon), 1);
  if (gun > 45) gun = 45;

  const yuk = yukumlulukler(bugun(), pencereSon);
  const rezerve = yuk.reduce((a, y) => a + y.tutar, 0);
  const serbest = nakit - rezerve;

  const payYuzde = Number(durum.ayarlar.guvenlikPayiYuzde) || 0;
  const tampon = Math.max(serbest, 0) * (payYuzde / 100);
  const gunluk = (serbest - tampon) / gun;

  const bugunHarcanan = gunToplamHarcama();

  return {
    yeterliVeri: nakit > 0 || durum.sabitler.length > 0,
    nakit, rezerve, serbest,
    tampon, gun, pencereSon,
    sonrakiGelir: gelir,
    gunluk,
    bugunHarcanan,
    bugunKalan: gunluk - bugunHarcanan,
    yukumlulukler: yuk,
    // negatif serbest = pencereyi mevcut nakitle kapatamıyorsun
    acik: serbest < 0 ? Math.abs(serbest) : 0
  };
}

/* ============================================================
   5. Acil durum fonu
   ============================================================ */

/** Aylık zorunlu gider: sabitler + borç yükü + zorunlu kategorilerdeki ortalama harcama. */
export function zorunluAylikGider() {
  const ZORUNLU = ['Market', 'Fatura', 'Ulaşım', 'Sağlık', 'Kira', 'Eğitim'];
  const sabit = aylikSabit();
  const borc = aylikBorcYuku();

  const seri = aylikHarcamaSerisi(4).slice(0, 3).filter(x => x.toplam > 0);
  let degisken = 0;
  if (seri.length) {
    let t = 0;
    seri.forEach(({ ay }) => {
      t += ayinHarcamalari(ay)
        .filter(h => ZORUNLU.includes(h.kategori))
        .reduce((a, h) => a + (Number(h.tutar) || 0), 0);
    });
    degisken = t / seri.length;
  }
  return { toplam: sabit + borc + degisken, sabit, borc, degisken, veriliAy: seri.length };
}

/**
 * Kaç aylık acil fon gerekir?
 * Hane yapısı riski belirler: tek gelir, çocuk sayısı ve bakmakla yükümlü
 * olunan kişi sayısı arttıkça hedef yükselir.
 */
export function acilFonAyHedefi() {
  const elle = durum.ayarlar.acilFonAy;
  if (elle) return { ay: elle, elle: true, gerekce: 'Ayarlar\'dan sen belirledin.' };

  const h = durum.hane;
  let ay = 3;
  const gerekce = [];

  if ((Number(h.gelirSayisi) || 1) <= 1) { ay += 1; gerekce.push('tek gelirli hane'); }
  const bagimli = (Number(h.cocuk) || 0) + (Number(h.bakmaklaYukumlu) || 0);
  if (bagimli >= 1) { ay += 1; gerekce.push(bagimli + ' bakmakla yükümlü olduğun kişi'); }
  if (bagimli >= 3) { ay += 1; gerekce.push('kalabalık hane'); }

  const borcOran = aylikGelir() > 0 ? aylikBorcYuku() / aylikGelir() : 0;
  if (borcOran > 0.3) { ay += 1; gerekce.push('gelirin %30\'undan fazlası borç ödemesi'); }

  return {
    ay: Math.min(ay, 9),
    elle: false,
    gerekce: gerekce.length ? gerekce.join(', ') + ' nedeniyle taban 3 aydan yükseltildi.' : 'Standart taban: 3 ay.'
  };
}

export function acilFonDurumu() {
  const zorunlu = zorunluAylikGider();
  const hedefAy = acilFonAyHedefi();
  const hedef = zorunlu.toplam * hedefAy.ay;

  // acil fon olarak işaretlenmiş hedefler + nakdin bir kısmı sayılmaz;
  // yalnızca kullanıcının "acil fon" hedefine biriktirdiği tutar sayılır
  const biriken = durum.hedefler
    .filter(x => x.acilFon)
    .reduce((a, x) => a + (Number(x.biriken) || 0), 0);

  return {
    yeterliVeri: zorunlu.toplam > 0,
    hedef, biriken, hedefAy,
    zorunlu,
    yuzde: hedef > 0 ? Math.min(biriken / hedef * 100, 100) : 0,
    kalanAy: zorunlu.toplam > 0 ? biriken / zorunlu.toplam : 0
  };
}

/* ============================================================
   6. Kredi kartı — asgari mi, tam mı?
   ============================================================ */

let REFERANS = null;
export function referansYukle(r) { REFERANS = r; }
export function referans() { return REFERANS; }

/** Dönem borcuna göre TCMB azami akdi faiz oranı (aylık %). */
export function kartFaizi(borc) {
  const elle = Number(durum.ayarlar.kartFaizElle);
  if (elle > 0) return elle;
  if (Number(borc && borc.faizAylik) > 0) return Number(borc.faizAylik);
  if (!REFERANS) return null;
  const bakiye = Number(borc && borc.kalan) || 0;
  const k = REFERANS.faiz.krediKarti.kademeler
    .find(x => bakiye >= x.altSinir && (x.ustSinir === null || bakiye < x.ustSinir));
  return k ? k.akdiAylik : REFERANS.faiz.krediKarti.kademeler[0].akdiAylik;
}

/** Kart limitine göre asgari ödeme oranı (%). */
export function asgariOran(borc) {
  if (Number(borc && borc.asgariOran) > 0) return Number(borc.asgariOran);
  if (!REFERANS) return 20;
  const limit = Number(borc && borc.limit) || 0;
  const k = REFERANS.faiz.asgariOdeme.kademeler.find(x => x.limitUst === null || limit <= x.limitUst);
  return k ? k.oran : 20;
}

export function kartAsgari(borc) {
  if (borc.tur !== 'kk') return Number(borc.taksitTutar) || 0;
  return (Number(borc.kalan) || 0) * asgariOran(borc) / 100;
}

/**
 * Kartı ay ay simüle eder.
 * @param {object} borc
 * @param {'asgari'|'tam'|'sabit'} tur
 * @param {number} sabitTutar  tur === 'sabit' ise aylık ödenecek tutar
 *
 * Varsayım: kart bu süre boyunca YENİ harcama görmez. Gerçek hayatta
 * kullanmaya devam edersen borç bitmez — arayüz bunu açıkça yazar.
 */
export function kartSimulasyon(borc, tur = 'asgari', sabitTutar = 0) {
  const faizOran = kartFaizi(borc);
  const oran = asgariOran(borc);
  let kalan = Number(borc.kalan) || 0;

  if (kalan <= 0 || !(faizOran > 0)) {
    return { yeterliVeri: false, sebep: !(faizOran > 0) ? 'Faiz oranı bilinmiyor.' : 'Bakiye yok.' };
  }

  const aylar = [];
  let toplamFaiz = 0, toplamOdeme = 0, ay = 0;
  const SINIR = 360;

  while (kalan > 1 && ay < SINIR) {
    const faiz = kalan * faizOran / 100;
    const donemBorcu = kalan + faiz;

    let odeme;
    if (tur === 'tam') odeme = donemBorcu;
    else if (tur === 'sabit') odeme = Math.min(Math.max(sabitTutar, donemBorcu * oran / 100), donemBorcu);
    else odeme = donemBorcu * oran / 100;

    if (odeme <= faiz + 0.01 && tur !== 'tam') {
      // ödeme faizi bile karşılamıyor: borç büyüyor
      return {
        yeterliVeri: true, bitmez: true, faizOran, asgariOran: oran,
        sebep: 'Bu ödeme tutarı aylık faizi bile karşılamıyor; borç her ay büyür.',
        aylikFaiz: faiz, aylar: [], ayAdedi: null, toplamFaiz: null, toplamOdeme: null, senaryo: true
      };
    }

    kalan = donemBorcu - odeme;
    toplamFaiz += faiz;
    toplamOdeme += odeme;
    ay++;
    if (ay <= 120) aylar.push({ ay, faiz, odeme, kalan: Math.max(kalan, 0) });
  }

  return {
    yeterliVeri: true, bitmez: ay >= SINIR,
    faizOran, asgariOran: oran,
    ayAdedi: ay, toplamFaiz, toplamOdeme,
    anapara: Number(borc.kalan) || 0,
    katsayi: (Number(borc.kalan) || 0) > 0 ? toplamOdeme / (Number(borc.kalan) || 1) : null,
    aylar,
    senaryo: true,
    varsayim: 'Bu süre boyunca karta yeni harcama yapılmadığı varsayıldı.'
  };
}

/** Yıllık bileşik karşılığı — "aylık %3,25 masum görünür" dersinin sayısı. */
export function yillikBilesik(aylikYuzde) {
  if (!(aylikYuzde > 0)) return null;
  return (Math.pow(1 + aylikYuzde / 100, 12) - 1) * 100;
}

/* ============================================================
   7. Borç stratejisi: çığ vs kartopu
   ============================================================ */

/**
 * @param {'cig'|'kartopu'} yontem
 * @param {number} ekOdeme  asgarilerin üstüne her ay konulacak ek tutar
 */
export function borcStratejisi(yontem = 'cig', ekOdeme = 0) {
  const liste = durum.borclar
    .filter(b => (Number(b.kalan) || 0) > 0)
    .map(b => ({
      id: b.id, ad: b.ad, tur: b.tur,
      kalan: Number(b.kalan) || 0,
      faiz: b.tur === 'kk' ? (kartFaizi(b) || 0) : aylikFaizden(b),
      // kredi kartında asgari her ay dönem borcuna göre yeniden hesaplanır;
      // kredide taksit tutarı sabittir
      oran: b.tur === 'kk' ? asgariOran(b) : null,
      taksit: b.tur === 'kk' ? null : (Number(b.taksitTutar) || 0)
    }));

  if (!liste.length) return { yeterliVeri: false };
  if (liste.some(b => b.tur !== 'kk' && !(b.taksit > 0))) {
    return { yeterliVeri: false, sebep: 'Kredi ve taksitli borçlar için aylık ödeme tutarı girilmeli.' };
  }

  const sira = [...liste].sort((a, b) =>
    yontem === 'cig' ? (b.faiz - a.faiz) || (a.kalan - b.kalan)
                     : (a.kalan - b.kalan) || (b.faiz - a.faiz));

  const durumlar = new Map(liste.map(b => [b.id, { ...b }]));

  /** Bir borcun bu ayki zorunlu asgarisi (faiz eklendikten sonraki bakiyeye göre). */
  const zorunlu = b => b.tur === 'kk' ? b.kalan * b.oran / 100 : Math.min(b.taksit, b.kalan);

  // Aylık toplam bütçe sabit tutulur: başlangıçtaki asgariler + ek ödeme.
  // Bir borç bitince ya da asgarisi düşünce, boşalan tutar hedef borca akar
  // (kartopu/çığ yöntemlerinin çalışma biçimi budur).
  const butce = liste.reduce((a, b) => a + (b.tur === 'kk' ? b.kalan * b.oran / 100 : b.taksit), 0) + ekOdeme;

  let ay = 0, toplamFaiz = 0, toplamOdeme = 0;
  const bitis = [];
  const seri = [];
  const SINIR = 360;

  while ([...durumlar.values()].some(b => b.kalan > 1) && ay < SINIR) {
    ay++;

    // 1) faizler işler
    for (const b of durumlar.values()) {
      if (b.kalan <= 1) continue;
      const faiz = b.kalan * b.faiz / 100;
      b.kalan += faiz;
      toplamFaiz += faiz;
    }

    // 2) her borca zorunlu asgarisi ödenir
    let havuz = butce;
    for (const b of durumlar.values()) {
      if (b.kalan <= 1) continue;
      const ode = Math.min(zorunlu(b), b.kalan, Math.max(havuz, 0));
      b.kalan -= ode;
      havuz -= ode;
      toplamOdeme += ode;
      if (b.kalan <= 1) { b.kalan = 0; bitis.push({ ad: b.ad, ay }); }
    }

    // 3) artan bütçe, yönteme göre tek hedefe yığılır
    for (const h of sira) {
      if (havuz <= 0.01) break;
      const b = durumlar.get(h.id);
      if (!b || b.kalan <= 1) continue;
      const ode = Math.min(havuz, b.kalan);
      b.kalan -= ode;
      havuz -= ode;
      toplamOdeme += ode;
      if (b.kalan <= 1) { b.kalan = 0; bitis.push({ ad: b.ad, ay }); }
    }

    const kalanToplam = [...durumlar.values()].reduce((a, b) => a + b.kalan, 0);
    if (ay <= 120) seri.push({ ay, kalan: kalanToplam });
  }

  return {
    yeterliVeri: true,
    yontem, ekOdeme, aylikButce: butce,
    ayAdedi: ay >= SINIR ? null : ay,
    bitmez: ay >= SINIR,
    toplamFaiz, toplamOdeme,
    sira: sira.map(b => ({ ad: b.ad, kalan: b.kalan, faiz: b.faiz })),
    bitis, seri,
    senaryo: true,
    varsayim: `Her ay toplam ${Math.round(butce).toLocaleString('tr-TR')} ₺ ödendiği, oranların sabit kaldığı ve yeni borçlanma olmadığı varsayıldı.`
  };
}

function aylikFaizden(b) {
  const a = Number(b.faizAylik);
  if (a > 0) return a;
  const y = Number(b.faizYillik);
  if (y > 0) return (Math.pow(1 + y / 100, 1 / 12) - 1) * 100;
  return 0;
}

/** İki stratejiyi karşılaştırır. */
export function stratejiKarsilastir(ekOdeme = 0) {
  const cig = borcStratejisi('cig', ekOdeme);
  const kar = borcStratejisi('kartopu', ekOdeme);
  if (!cig.yeterliVeri || !kar.yeterliVeri) return { yeterliVeri: false, sebep: cig.sebep || kar.sebep };
  return {
    yeterliVeri: true, cig, kartopu: kar,
    faizFarki: (kar.toplamFaiz || 0) - (cig.toplamFaiz || 0),
    ayFarki: (kar.ayAdedi || 0) - (cig.ayAdedi || 0)
  };
}

/**
 * Önümüzdeki N ayın taahhüt edilmiş ödeme yükü.
 *
 * Kredi kartlarında asgari tutar sabit değildir: sadece asgari ödenirse bakiye
 * (ve dolayısıyla asgari) her ay küçülür. Bu yüzden kart bakiyesi ay ay
 * simüle edilir. Taksitli borçlar kalan taksit sayısı kadar sürer.
 */
export function taahhutTakvimi(ayAdedi = 12) {
  const sabitToplam = durum.sabitler
    .filter(s => s.aktif !== false)
    .reduce((a, s) => a + (Number(s.tutar) || 0), 0);

  // kart bakiyeleri simülasyon için kopyalanır
  const kartlar = durum.borclar
    .filter(b => b.tur === 'kk' && (Number(b.kalan) || 0) > 0)
    .map(b => ({ kalan: Number(b.kalan), faiz: kartFaizi(b) || 0, oran: asgariOran(b) }));

  const out = [];
  for (let i = 0; i < ayAdedi; i++) {
    let borc = 0;

    for (const k of kartlar) {
      if (k.kalan <= 1) continue;
      const donemBorcu = k.kalan * (1 + k.faiz / 100);
      const asgari = donemBorcu * k.oran / 100;
      borc += asgari;
      k.kalan = donemBorcu - asgari;
    }

    durum.borclar.forEach(b => {
      if (b.tur === 'kk' || (Number(b.kalan) || 0) <= 0) return;
      const kalanTaksit = Number(b.kalanTaksit) || 0;
      if (kalanTaksit > i) borc += Number(b.taksitTutar) || 0;
    });

    out.push({ ay: ayEkle(buAy(), i), sabit: sabitToplam, borc, toplam: sabitToplam + borc });
  }
  return out;
}

/** Borç yükü / gelir oranı — sağlık göstergesi. */
export function borcGelirOrani() {
  const g = aylikGelir();
  if (g <= 0) return null;
  const y = aylikBorcYuku();
  const oran = y / g * 100;
  let durumAdi, renk;
  if (oran === 0) { durumAdi = 'Borç ödemesi yok'; renk = 'em'; }
  else if (oran <= 15) { durumAdi = 'Rahat'; renk = 'em'; }
  else if (oran <= 30) { durumAdi = 'Yönetilebilir'; renk = 'gold'; }
  else if (oran <= 50) { durumAdi = 'Zorlayıcı'; renk = 'amber'; }
  else { durumAdi = 'Sarmal riski'; renk = 'red'; }
  return { oran, yuk: y, gelir: g, durumAdi, renk };
}

/* ============================================================
   8. Kişisel enflasyon — kullanıcının kendi sepeti
   ============================================================ */

/**
 * Kendi sepetinin maliyet değişimi. TÜİK ortalaması değil, senin
 * gerçekten aldığın ürünlerin fiyatı.
 * Yöntem: iki dönemde de fiyatı bilinen ürünlerin sepet maliyeti oranlanır.
 */
export function kisiselEnflasyon() {
  const urunler = durum.sepet.filter(u => (u.kayitlar || []).length >= 2);
  if (!urunler.length) {
    return { yeterliVeri: false, sebep: 'En az bir ürüne, farklı tarihlerde iki fiyat girmen gerekiyor.' };
  }

  // her ürün için ilk ve son kayıt
  const satirlar = urunler.map(u => {
    const k = [...u.kayitlar].sort((a, b) => a.tarih.localeCompare(b.tarih));
    const ilk = k[0], son = k[k.length - 1];
    const gun = gunFark(ilk.tarih, son.tarih);
    const degisim = ilk.fiyat > 0 ? (son.fiyat / ilk.fiyat - 1) * 100 : null;
    // gün sayısı yeterliyse yıllığa çevir (bileşik)
    const yillik = (gun >= 20 && ilk.fiyat > 0)
      ? (Math.pow(son.fiyat / ilk.fiyat, 365 / gun) - 1) * 100 : null;
    return { ad: u.ad, birim: u.birim, ilk, son, gun, degisim, yillik, kayitSayisi: k.length };
  });

  const sepetIlk = satirlar.reduce((a, s) => a + s.ilk.fiyat, 0);
  const sepetSon = satirlar.reduce((a, s) => a + s.son.fiyat, 0);
  const gunOrt = Math.round(satirlar.reduce((a, s) => a + s.gun, 0) / satirlar.length);

  const toplamDegisim = sepetIlk > 0 ? (sepetSon / sepetIlk - 1) * 100 : null;
  const yillikTahmin = (gunOrt >= 20 && sepetIlk > 0)
    ? (Math.pow(sepetSon / sepetIlk, 365 / gunOrt) - 1) * 100 : null;

  return {
    yeterliVeri: true,
    satirlar: satirlar.sort((a, b) => (b.degisim ?? -Infinity) - (a.degisim ?? -Infinity)),
    sepetIlk, sepetSon, toplamDegisim, yillikTahmin, gunOrt,
    urunSayisi: satirlar.length,
    olcumGuvenilir: gunOrt >= 30 && satirlar.length >= 3
  };
}

/** Sepetin zaman içindeki toplam maliyeti — grafik için. */
export function sepetSerisi() {
  const tarihler = new Set();
  durum.sepet.forEach(u => (u.kayitlar || []).forEach(k => tarihler.add(k.tarih.slice(0, 7))));
  const aylar = [...tarihler].sort();
  if (aylar.length < 2) return [];

  return aylar.map(ay => {
    let toplam = 0, adet = 0;
    durum.sepet.forEach(u => {
      const uygun = (u.kayitlar || []).filter(k => k.tarih.slice(0, 7) <= ay);
      if (!uygun.length) return;
      uygun.sort((a, b) => a.tarih.localeCompare(b.tarih));
      toplam += uygun[uygun.length - 1].fiyat;
      adet++;
    });
    return { ay, toplam, urunSayisi: adet };
  });
}

/* ============================================================
   9. Reel getiri ve varlıklar
   ============================================================ */

/** Reel getiri = (1+nominal)/(1+enflasyon) − 1. Kabaca çıkarma yapmak yanıltır. */
export function reelGetiri(nominalYuzde, enflasyonYuzde) {
  if (!Number.isFinite(nominalYuzde) || !Number.isFinite(enflasyonYuzde)) return null;
  return ((1 + nominalYuzde / 100) / (1 + enflasyonYuzde / 100) - 1) * 100;
}

/** Seçilen enflasyon kaynağına göre yıllık oran. */
export function enflasyonOrani(kaynak = null) {
  if (!REFERANS) return null;
  const k = kaynak || durum.ayarlar.enflasyonKaynak || 'tuik';
  const t = REFERANS.tufe.yillik, e = REFERANS.enag.yillik;
  if (k === 'tuik') return t;
  if (k === 'enag') return e;
  return (t + e) / 2; // 'ikisi' → aralığın ortası; arayüz her iki uçu da gösterir
}

/** Varlıkları güncel piyasa değerine çevirir. Fiyatı bilinmeyen varlık null döner. */
export function varlikDegerleme(piyasa) {
  const satirlar = durum.varliklar.map(v => {
    const miktar = Number(v.miktar) || 0;
    let birimFiyat = null, kaynak = null;

    if (v.tur === 'tl' || v.tur === 'mevduat') { birimFiyat = 1; kaynak = 'TL'; }
    else if (v.tur === 'usd') { birimFiyat = piyasa.usd.deger; kaynak = piyasa.usd.kaynak; }
    else if (v.tur === 'eur') { birimFiyat = piyasa.eur.deger; kaynak = piyasa.eur.kaynak; }
    else if (v.tur === 'altin') { birimFiyat = piyasa.gramAltin.deger; kaynak = piyasa.gramAltin.kaynak; }
    else if (v.birimFiyat) { birimFiyat = Number(v.birimFiyat); kaynak = 'elle girildi'; }

    const guncelDeger = birimFiyat !== null ? miktar * birimFiyat : null;
    const maliyet = (Number(v.alisFiyat) || 0) * miktar;
    const kar = guncelDeger !== null && maliyet > 0 ? guncelDeger - maliyet : null;
    const karYuzde = kar !== null && maliyet > 0 ? kar / maliyet * 100 : null;

    return { ...v, miktar, birimFiyat, kaynak, guncelDeger, maliyet, kar, karYuzde };
  });

  const bilinen = satirlar.filter(s => s.guncelDeger !== null);
  const toplam = bilinen.reduce((a, s) => a + s.guncelDeger, 0);
  const bilinmeyen = satirlar.length - bilinen.length;

  const grup = new Map();
  bilinen.forEach(s => {
    const g = GRUP_ADI[s.tur] || 'Diğer';
    grup.set(g, (grup.get(g) || 0) + s.guncelDeger);
  });

  return {
    satirlar, toplam, bilinmeyen,
    dagilim: [...grup.entries()].map(([ad, deger]) => ({ ad, deger, yuzde: toplam > 0 ? deger / toplam * 100 : 0 }))
                                .sort((a, b) => b.deger - a.deger)
  };
}

const GRUP_ADI = { tl: 'TL / Mevduat', mevduat: 'TL / Mevduat', usd: 'Döviz', eur: 'Döviz', altin: 'Altın', hisse: 'Hisse / Fon', fon: 'Hisse / Fon', diger: 'Diğer' };
const HEDEF_ANAHTAR = { 'TL / Mevduat': 'tl', 'Döviz': 'doviz', 'Altın': 'altin', 'Hisse / Fon': 'hisse' };

/** Mevcut dağılım ile hedef dağılım arasındaki sapma. */
export function dagilimSapmasi(degerleme) {
  const hedef = durum.ayarlar.hedefDagilim || {};
  const toplam = degerleme.toplam;
  if (!(toplam > 0)) return { yeterliVeri: false };

  const mevcut = {};
  degerleme.dagilim.forEach(d => {
    const a = HEDEF_ANAHTAR[d.ad];
    if (a) mevcut[a] = (mevcut[a] || 0) + d.yuzde;
  });

  const satirlar = Object.keys(hedef).map(a => {
    const m = mevcut[a] || 0, h = Number(hedef[a]) || 0;
    return {
      anahtar: a,
      ad: { tl: 'TL / Mevduat', doviz: 'Döviz', altin: 'Altın', hisse: 'Hisse / Fon' }[a] || a,
      mevcut: m, hedef: h, sapma: m - h,
      tutarFarki: (h - m) / 100 * toplam
    };
  });

  return { yeterliVeri: true, satirlar, enBuyukSapma: Math.max(...satirlar.map(s => Math.abs(s.sapma))) };
}

/* ============================================================
   10. Mutfak ekonomisi
   ============================================================ */

export function tarifMaliyeti(t) {
  const malzeme = (t.malzemeler || []).reduce((a, m) => a + (Number(m.tutar) || 0), 0);
  const porsiyon = Math.max(Number(t.porsiyon) || 1, 1);
  const evde = malzeme / porsiyon;
  const disari = Number(t.disariFiyat) || 0;
  const fark = disari > 0 ? disari - evde : null;
  const haftalik = Number(t.haftalikSiklik) || 0;

  return {
    malzeme, porsiyon, evde, disari, fark,
    katsayi: disari > 0 && evde > 0 ? disari / evde : null,
    aylikFark: fark !== null ? fark * haftalik * 4.345 : null,
    yillikFark: fark !== null ? fark * haftalik * 52 : null,
    haftalik
  };
}

export function mutfakOzeti() {
  const t = durum.tarifler.map(x => ({ ...x, hesap: tarifMaliyeti(x) }));
  const yillik = t.reduce((a, x) => a + (x.hesap.yillikFark || 0), 0);
  const aylik = t.reduce((a, x) => a + (x.hesap.aylikFark || 0), 0);
  return { tarifler: t, yillikFark: yillik, aylikFark: aylik, tarifSayisi: t.length };
}

/* ============================================================
   11. Kredi skoru
   ============================================================ */

export function skorKademesi(skor) {
  if (!REFERANS || !Number.isFinite(skor)) return null;
  return REFERANS.krediSkoru.kademeler.find(k => skor >= k.min && skor <= k.max) || null;
}

/** Kart limit kullanım oranı — skorun en hızlı düzelebilen bileşeni. */
export function kartKullanimOrani() {
  const kartlar = durum.borclar.filter(b => b.tur === 'kk' && (Number(b.limit) || 0) > 0);
  if (!kartlar.length) return { yeterliVeri: false };
  const limit = kartlar.reduce((a, b) => a + Number(b.limit), 0);
  const kullanim = kartlar.reduce((a, b) => a + Math.max(Number(b.kalan) || 0, 0), 0);
  const oran = limit > 0 ? kullanim / limit * 100 : 0;
  return {
    yeterliVeri: true, limit, kullanim, oran, kartSayisi: kartlar.length,
    durumAdi: oran <= 30 ? 'İyi' : oran <= 50 ? 'Dikkat' : oran <= 80 ? 'Yüksek' : 'Kritik',
    renk: oran <= 30 ? 'em' : oran <= 50 ? 'gold' : oran <= 80 ? 'amber' : 'red',
    hedefBorc: limit * 0.3,
    azaltilacak: Math.max(kullanim - limit * 0.3, 0)
  };
}

/** Skor için kişiselleştirilmiş eylem listesi. */
export function skorEylemleri() {
  const out = [];
  const ku = kartKullanimOrani();

  const gecikmis = yukumlulukler().filter(y => y.kalanGun < 0 && y.kaynak === 'borc');
  if (gecikmis.length) {
    out.push({
      oncelik: 1, etki: 'yüksek', baslik: 'Gecikmiş ödemeni kapat',
      metin: `${gecikmis.length} bankaya olan yükümlülüğün vadesini geçmiş. Ödeme geçmişi skorun en ağır bileşeni (~%45); açık gecikme her gün zarar veriyor.`
    });
  }
  if (ku.yeterliVeri && ku.oran > 30) {
    out.push({
      oncelik: 2, etki: 'yüksek', baslik: 'Kart kullanım oranını %30\'un altına indir',
      metin: `Limitinin %${ku.oran.toFixed(0)}'ini kullanıyorsun. %30 seviyesine inmek için bakiyeni yaklaşık ${Math.round(ku.azaltilacak).toLocaleString('tr-TR')} ₺ azaltman gerekiyor. Bu, skorun en hızlı düzelen bileşeni (~%18).`
    });
  }
  const otomatiksiz = durum.sabitler.filter(s => s.aktif !== false && !s.otomatik && (s.tur === 'fatura' || s.tur === 'taksit'));
  if (otomatiksiz.length >= 2) {
    out.push({
      oncelik: 3, etki: 'orta', baslik: 'Otomatik ödeme talimatı kur',
      metin: `${otomatiksiz.length} düzenli ödemende otomatik talimat yok. Unutkanlık kaynaklı tek bir gecikme bile uzun süre kayıtta kalır.`
    });
  }
  const skorlar = [...durum.skorlar].sort((a, b) => a.tarih.localeCompare(b.tarih));
  if (skorlar.length < 2) {
    out.push({
      oncelik: 4, etki: 'düşük', baslik: 'Skorunu düzenli olarak kaydet',
      metin: 'Findeks\'ten öğrendiğin notu ayda bir buraya gir. Trendi görmeden hangi davranışın işe yaradığını bilemezsin.'
    });
  }
  out.push({
    oncelik: 5, etki: 'orta', baslik: 'Yeni başvuru yapma',
    metin: 'Kısa sürede çok sayıda kredi/kart başvurusu risk sinyali sayılır (~%8 ağırlık). 3–6 ay başvuru yapmamak görünür fark yaratır.'
  });
  out.push({
    oncelik: 6, etki: 'düşük', baslik: 'En eski kartını kapatma',
    metin: 'Kredi geçmişinin uzunluğu senin lehine çalışır (~%7 ağırlık). Kullanmadığın eski bir kartı kapatmak geçmişini kısaltıp notunu düşürebilir.'
  });

  return out.sort((a, b) => a.oncelik - b.oncelik);
}

/* ============================================================
   12. Genel sağlık skoru — tek bakışta durum
   ============================================================ */

export function finansalSaglik() {
  const bilesenler = [];
  const g = aylikGelir();

  // 1. Nakit akışı
  if (g > 0) {
    const gider = aylikSabit() + aylikBorcYuku() + (ortalamaDegiskenHarcama() || 0);
    const oran = (g - gider) / g * 100;
    bilesenler.push({
      ad: 'Nakit akışı', puan: Math.max(0, Math.min(100, (oran + 10) * 4)),
      deger: oran, aciklama: oran >= 20 ? 'Gelirinin beşte birinden fazlası artıyor.'
        : oran >= 0 ? 'Geliriyle gideri arasında dar bir açıklık var.'
        : 'Giderin gelirini aşıyor.'
    });
  }

  // 2. Acil fon
  const af = acilFonDurumu();
  if (af.yeterliVeri) {
    bilesenler.push({
      ad: 'Acil fon', puan: Math.min(100, af.yuzde),
      deger: af.kalanAy,
      aciklama: `${af.kalanAy.toFixed(1)} aylık zorunlu giderini karşılıyor (hedef ${af.hedefAy.ay} ay).`
    });
  }

  // 3. Borç yükü
  const bg = borcGelirOrani();
  if (bg) {
    bilesenler.push({
      ad: 'Borç yükü', puan: Math.max(0, Math.min(100, 100 - bg.oran * 2)),
      deger: bg.oran, aciklama: `Gelirinin %${bg.oran.toFixed(0)}'i borç ödemesine gidiyor — ${bg.durumAdi.toLowerCase()}.`
    });
  }

  // 4. Kart kullanımı
  const ku = kartKullanimOrani();
  if (ku.yeterliVeri) {
    bilesenler.push({
      ad: 'Kart kullanımı', puan: Math.max(0, Math.min(100, 100 - ku.oran * 1.25)),
      deger: ku.oran, aciklama: `Limitinin %${ku.oran.toFixed(0)}'ini kullanıyorsun.`
    });
  }

  // 5. Takip alışkanlığı
  const sonHarcama = durum.harcamalar.length
    ? Math.max(...durum.harcamalar.map(h => tarih(h.tarih).getTime())) : 0;
  const gunGecti = sonHarcama ? Math.floor((Date.now() - sonHarcama) / 86400000) : 999;
  bilesenler.push({
    ad: 'Takip', puan: durum.harcamalar.length === 0 ? 0 : Math.max(0, 100 - gunGecti * 12),
    deger: gunGecti,
    aciklama: durum.harcamalar.length === 0 ? 'Henüz harcama kaydı yok.'
      : gunGecti === 0 ? 'Bugün kayıt girdin.' : `Son kayıt ${gunGecti} gün önce.`
  });

  if (!bilesenler.length) return { yeterliVeri: false };
  const puan = Math.round(bilesenler.reduce((a, b) => a + b.puan, 0) / bilesenler.length);

  return {
    yeterliVeri: true, puan, bilesenler,
    seviye: puan >= 80 ? 'Sağlam' : puan >= 60 ? 'İyi yolda' : puan >= 40 ? 'Kırılgan' : puan >= 20 ? 'Zorlu' : 'Kritik',
    renk: puan >= 80 ? 'em' : puan >= 60 ? 'teal' : puan >= 40 ? 'gold' : puan >= 20 ? 'amber' : 'red'
  };
}

/* ============================================================
   13. Karar desteği — "almadan önce"
   ============================================================ */

/** Bir alım kararının bütçeye etkisini ölçer. */
export function alimEtkisi(fiyat) {
  const gg = gunlukGuvenli();
  const saat = saateCevir(fiyat);
  const gelir = aylikGelir();

  return {
    fiyat,
    saat,
    gelirYuzdesi: gelir > 0 ? fiyat / gelir * 100 : null,
    gunKarsiligi: gg.gunluk > 0 ? fiyat / gg.gunluk : null,
    serbestSonrasi: gg.serbest - fiyat,
    serbestiAsiyor: fiyat > gg.serbest,
    // aynı para gram altında dursaydı: sadece gerçek geçmiş varsa hesaplanır
    acilFonKatkisi: (() => {
      const af = acilFonDurumu();
      return af.yeterliVeri && af.hedef > 0 ? fiyat / af.hedef * 100 : null;
    })()
  };
}

/* ============================================================
   14. AI mentor için bağlam özeti
   ============================================================ */

export function aiBaglam(piyasa) {
  const p = [];
  const h = durum.hane;
  const kisi = haneKisi();

  p.push(`HANE: ${h.yetiskin} yetişkin, ${h.cocuk} çocuk` +
    (Number(h.bakmaklaYukumlu) > 0 ? `, ayrıca ${h.bakmaklaYukumlu} kişiye daha bakıyor` : '') +
    `; toplam ${kisi} kişi. Haneye gelir getiren kişi sayısı: ${h.gelirSayisi}.`);

  const g = aylikGelir(), s = aylikSabit(), by = aylikBorcYuku();
  p.push(`AYLIK: net gelir ${Math.round(g)} ₺, sabit gider ${Math.round(s)} ₺, borç/taksit yükü ${Math.round(by)} ₺.`);

  const nakit = Number(durum.nakit.tutar) || 0;
  const gg = gunlukGuvenli();
  p.push(`NAKİT: elde ${Math.round(nakit)} ₺. Bir sonraki gelire kadar (${gg.gun} gün) ödenecek yükümlülük ${Math.round(gg.rezerve)} ₺, serbest ${Math.round(gg.serbest)} ₺, güvenli günlük ${Math.round(gg.gunluk)} ₺.`);

  const kd = kategoriDagilim();
  if (kd.length) p.push(`BU AY HARCAMA: toplam ${Math.round(ayToplamHarcama())} ₺ — ` +
    kd.slice(0, 6).map(k => `${k.ad} ${Math.round(k.deger)} ₺`).join(', ') + '.');

  if (durum.borclar.length) {
    p.push('BORÇLAR: ' + durum.borclar.filter(b => (b.kalan || 0) > 0).map(b => {
      const f = b.tur === 'kk' ? kartFaizi(b) : aylikFaizden(b);
      return `${b.ad} (${b.tur}) kalan ${Math.round(b.kalan)} ₺${f ? `, aylık faiz %${f}` : ''}` +
        (b.tur === 'kk' && b.limit ? `, limit ${Math.round(b.limit)} ₺` : '');
    }).join('; ') + '.');
  }

  const af = acilFonDurumu();
  if (af.yeterliVeri) p.push(`ACİL FON: hedef ${Math.round(af.hedef)} ₺ (${af.hedefAy.ay} aylık zorunlu gider), biriken ${Math.round(af.biriken)} ₺.`);

  const bg = borcGelirOrani();
  if (bg) p.push(`BORÇ/GELİR ORANI: %${bg.oran.toFixed(0)} — ${bg.durumAdi}.`);

  const skor = [...durum.skorlar].sort((a, b) => b.tarih.localeCompare(a.tarih))[0];
  if (skor) p.push(`KREDİ NOTU: ${skor.skor} (${skorKademesi(skor.skor)?.ad || '—'}), ${skor.tarih} tarihli.`);

  if (REFERANS) {
    p.push(`RESMİ VERİ (${REFERANS.tufe.donemAdi}): TÜİK yıllık TÜFE %${REFERANS.tufe.yillik}, aylık %${REFERANS.tufe.aylik}. ENAG yıllık %${REFERANS.enag.yillik}. TCMB politika faizi %${REFERANS.faiz.politikaFaizi.yillikYuzde}.`);
  }
  if (piyasa && piyasa.usd.deger) {
    p.push(`PİYASA: USD/TRY ${piyasa.usd.deger.toFixed(2)}` +
      (piyasa.gramAltin.deger ? `, gram altın ${Math.round(piyasa.gramAltin.deger)} ₺` : '') +
      (piyasa.bist.deger ? `, BIST 100 ${Math.round(piyasa.bist.deger)}` : '') + '.');
  }

  const ke = kisiselEnflasyon();
  if (ke.yeterliVeri && ke.toplamDegisim !== null) {
    p.push(`KİŞİSEL SEPET: ${ke.urunSayisi} ürün, ${ke.gunOrt} günde toplam değişim %${ke.toplamDegisim.toFixed(1)}.`);
  }

  return p.join('\n');
}
