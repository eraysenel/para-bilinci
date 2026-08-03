/* Enflasyon — TÜİK, ENAG ve senin kendi sepetin. */

import { durum, ekle, guncelle, sil, bul, kaydet } from '../core/store.js';
import * as H from '../core/hesap.js';
import { tl, n, yuzde, yuzdeIsaret, tarihKisa, tarihUzun, bugun, ayKisa, ayAdi, kac, sayiOku } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, eylemKaydet, bildir, modalAc, formOku, onayla, alan, girdi, secim } from '../core/ui.js';
import * as G from '../core/chart.js';
import { SEPET_BIRIMLER } from '../core/sabitler.js';

export const enflasyonGorunum = {
  ad: 'enflasyon', ikon: '◰', etiket: 'Enflasyon',
  baslik: 'Enflasyon & Fiyat Artışı',
  alt: 'Resmî ortalama kimsenin gerçeği değildir. Asıl önemli olan senin sepetinin ne kadar arttığı.',

  ciz() {
    return resmiKart() + kisiselKart() + sepetKart() + gruplarKart() + reelKart();
  }
};

/* ---------- resmî veriler ---------- */

function resmiKart() {
  const ref = H.referans();
  if (!ref) return kart('Resmî veriler', notKutu('uyari', 'Referans veri seti yüklenemedi.'), { ikon: '◈' });

  const t = ref.tufe, e = ref.enag;
  const fark = e.yillik - t.yillik;

  return kart('Resmî ve bağımsız ölçümler', `
    <div class="izgara iz-4 alt-16">
      ${dosem({ etiket: 'TÜİK · yıllık TÜFE', deger: yuzde(t.yillik), ipucu: t.donemAdi, renk: 'r-blue', vurgu: 'vurgu', ikon: '◈' })}
      ${dosem({ etiket: 'TÜİK · aylık', deger: yuzde(t.aylik), ipucu: `yılbaşından beri %${n(t.yilbasindanBeri, 2)}`, renk: 'r-blue', ikon: '◔' })}
      ${dosem({ etiket: 'ENAG · yıllık', deger: yuzde(e.yillik), ipucu: e.donemAdi + ' · bağımsız ölçüm', renk: 'r-amber', ikon: '◇' })}
      ${dosem({ etiket: 'ENAG · aylık', deger: yuzde(e.aylik), ipucu: `önceki ay %${n(e.oncekiDonem.aylik, 2)}`, renk: 'r-amber', ikon: '◔' })}
    </div>

    ${notKutu('bilgi', `
      <b>İki ölçüm arasında ${n(Math.abs(fark), 1)} puan fark var.</b>
      TÜİK resmî kurumdur ve sepeti kamuya açıktır; ENAG bağımsız bir akademisyen grubudur ve resmî değildir.
      Bu araç ikisini birlikte gösterir çünkü doğru cevap hangisine daha yakınsan odur —
      onu da ancak <b>kendi sepetini ölçerek</b> öğrenirsin.`)}

    <div class="mini r-faint ust-8">
      <a href="${kac(t.kaynakUrl)}" target="_blank" rel="noopener">${kac(t.kaynak)} ↗</a>
      · <a href="${kac(e.kaynakUrl)}" target="_blank" rel="noopener">${kac(e.kaynak)} ↗</a>
      · veri seti ${kac(ref.guncellemeTarihi)} tarihinde güncellendi, sonraki ${kac(ref.sonrakiBeklenenGuncelleme)}
      · resmî bültenlerden elle işlenir, tahmin veya modelleme içermez
    </div>`, { ikon: '◈', yan: kac(t.donemAdi) });
}

/* ---------- kişisel enflasyon ---------- */

function kisiselKart() {
  const ke = H.kisiselEnflasyon();
  const ref = H.referans();

  if (!ke.yeterliVeri) {
    return kart('Senin enflasyonun', `
      ${bos('Henüz ölçüm yok', ke.sebep, '◱')}
      <div class="ust-12">${notKutu('bilgi',
        `Düzenli aldığın 5–15 ürünü sepetine ekle, her ay fiyatlarını güncelle.
         Birkaç ay sonra <b>kendi enflasyonunu</b> göreceksin — TÜİK'in ortalaması değil,
         senin gerçekten ödediğin paranın artışı. Zam pazarlığından yatırım kararına kadar her şeyin temeli budur.`)}</div>
      <div class="merkez ust-12"><button class="dg-btn b-ana b-kucuk" data-eylem="urun-ekle">＋ Sepete ürün ekle</button></div>`,
      { ikon: '◱' });
  }

  const seri = H.sepetSerisi();
  const karsilastirma = [];
  if (ke.yillikTahmin !== null) {
    karsilastirma.push({ ad: 'Senin sepetin', deger: ke.yillikTahmin, renk: 'var(--gold)' });
    if (ref) {
      karsilastirma.push({ ad: 'TÜİK', deger: ref.tufe.yillik, renk: 'var(--blue)' });
      karsilastirma.push({ ad: 'ENAG', deger: ref.enag.yillik, renk: 'var(--amber)' });
    }
  }

  return kart('Senin enflasyonun', `
    <div class="izgara iz-4 alt-16">
      ${dosem({ etiket: 'Sepet maliyeti · ilk', deger: tl(ke.sepetIlk, 2), ipucu: `${ke.urunSayisi} ürün`, ikon: '◱' })}
      ${dosem({ etiket: 'Sepet maliyeti · şimdi', deger: tl(ke.sepetSon, 2), renk: 'r-gold', ikon: '◱' })}
      ${dosem({ etiket: 'Toplam değişim', deger: yuzdeIsaret(ke.toplamDegisim, 1), ipucu: `${ke.gunOrt} günde`, renk: ke.toplamDegisim > 0 ? 'r-red' : 'r-em', vurgu: 'vurgu', ikon: '↗' })}
      ${dosem({
        etiket: 'Yıllığa çevrilmiş', deger: ke.yillikTahmin !== null ? yuzde(ke.yillikTahmin, 1) : '—',
        ipucu: ke.yillikTahmin === null ? 'en az 20 günlük aralık gerekir' : 'bileşik oran',
        renk: 'r-red', ikon: '◔'
      })}
    </div>

    ${!ke.olcumGuvenilir ? notKutu('uyari',
      `Ölçümün henüz olgunlaşmadı: ${ke.urunSayisi} ürün, ortalama ${ke.gunOrt} günlük aralık.
       Güvenilir bir karşılaştırma için en az 3 ürün ve 30 günlük aralık öneririm.`) : ''}

    ${karsilastirma.length > 1 ? `
      <div class="ust-16">
        <div class="mini r-muted alt-8">Yıllık oran karşılaştırması</div>
        ${G.yatayListe(karsilastirma, { bicim: v => yuzde(v, 1), renkli: true })}
      </div>
      <div class="ust-12">${notKutu(
        ke.yillikTahmin > (ref?.enag.yillik || 0) ? 'uyari' : ke.yillikTahmin > (ref?.tufe.yillik || 0) ? 'bilgi' : 'iyi',
        ke.yillikTahmin > (ref?.tufe.yillik || 0)
          ? `Senin sepetin resmî TÜFE'den <b>${n(ke.yillikTahmin - ref.tufe.yillik, 1)} puan</b> daha hızlı artıyor.
             Bu, maaş zammın enflasyon kadar olsa bile alım gücünün düştüğü anlamına gelir.`
          : `Senin sepetin resmî TÜFE'nin altında artıyor. Bu iyi haber — ama sepetin dar olabilir,
             ürün sayısını artırmak ölçümü sağlamlaştırır.`)}</div>` : ''}

    ${seri.length >= 2 ? `<div class="grafik ust-16">${G.cizgi(
      seri.map(s => ({ etiket: ayKisa(s.ay), deger: s.toplam })),
      { yukseklik: 165, bicim: v => n(v) + '₺' })}</div>
      <div class="mini r-faint merkez">Sepetinin aylara göre toplam maliyeti</div>` : ''}`,
    { ikon: '◱', yan: `${ke.urunSayisi} ürün` });
}

/* ---------- sepet ---------- */

function sepetKart() {
  const liste = durum.sepet;

  const govde = liste.length ? liste.map(u => {
    const k = [...(u.kayitlar || [])].sort((a, b) => a.tarih.localeCompare(b.tarih));
    const son = k[k.length - 1];
    const ilk = k[0];
    const degisim = k.length >= 2 && ilk.fiyat > 0 ? (son.fiyat / ilk.fiyat - 1) * 100 : null;

    return `<div class="oge" style="align-items:flex-start">
      <div class="im" style="background:var(--gold-dim);color:var(--gold)">◱</div>
      <div class="gvd">
        <div class="ad">${kac(u.ad)}<span class="r-faint mini" style="font-weight:500">${kac(u.olcu || '')} ${kac(u.birim || '')}</span></div>
        <div class="ayr">${k.length} fiyat kaydı${k.length >= 2 ? ` · ${tarihKisa(ilk.tarih)} → ${tarihKisa(son.tarih)}` : ` · ${tarihKisa(son.tarih)}`}</div>
        ${k.length >= 2 ? `<div style="margin-top:6px;max-width:200px">${G.kivilcim(k.map(x => x.fiyat), { renkAdi: degisim > 0 ? 'var(--red)' : 'var(--em)' })}</div>` : ''}
      </div>
      <div class="sag">
        <div class="tut">${tl(son.fiyat, 2)}</div>
        <div class="ust ${degisim === null ? '' : degisim > 0 ? 'r-red' : 'r-em'}">${degisim === null ? 'ilk kayıt' : yuzdeIsaret(degisim, 1)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <button class="sil-btn" data-eylem="fiyat-ekle" data-id="${u.id}" title="Yeni fiyat">₺</button>
        <button class="sil-btn" data-eylem="urun-sil" data-id="${u.id}" title="Sil">✕</button>
      </div>
    </div>`;
  }).join('')
    : bos('Sepetin boş', 'Düzenli aldığın ürünleri ekle: ekmek, süt, yumurta, deterjan, benzin… Her ay fiyatlarını güncelle.', '◱');

  return kart('Fiyat takip sepetin', govde
    + `<div class="ust-12"><button class="dg-btn b-cizgi b-kucuk b-tam" data-eylem="urun-ekle">＋ Ürün ekle</button></div>`,
    {
      ikon: '◱',
      not: 'Ölçüyü sabit tut (örneğin "süt 1 lt"), yoksa karşılaştırma bozulur. Aynı marketten almaya çalış.'
    });
}

/* ---------- TÜİK grupları ---------- */

function gruplarKart() {
  const ref = H.referans();
  if (!ref) return '';

  const gruplar = ref.tufe.gruplar;
  const bilinen = gruplar.filter(g => g.yillik !== null);
  const bilinmeyen = gruplar.filter(g => g.yillik === null);

  return kart('Kategori bazında resmî artış', `
    <div class="tablo-sar"><table class="veri">
      <thead><tr><th>Harcama grubu</th><th class="num">Aylık</th><th class="num">Yıllık</th><th class="num">Enflasyona katkı</th></tr></thead>
      <tbody>${gruplar.map(g => `
        <tr>
          <td>${kac(g.ad)}</td>
          <td class="num ${g.aylik === null ? 'r-faint' : g.aylik < 0 ? 'r-em' : ''}">${g.aylik === null ? '—' : yuzdeIsaret(g.aylik, 2)}</td>
          <td class="num ${g.yillik === null ? 'r-faint' : g.yillik > ref.tufe.yillik ? 'r-red' : 'r-em'}">${g.yillik === null ? '—' : yuzde(g.yillik)}</td>
          <td class="num r-muted">${g.katkiPuan === null ? '—' : n(g.katkiPuan, 2) + ' puan'}</td>
        </tr>`).join('')}
      </tbody></table></div>

    ${bilinen.length ? `<div class="ust-16">${G.yatayListe(
      bilinen.map(g => ({ ad: g.ad, deger: g.yillik })).sort((a, b) => b.deger - a.deger),
      { bicim: v => yuzde(v, 1) })}</div>` : ''}

    ${bilinmeyen.length ? `<div class="mini r-faint ust-12">
      ${bilinmeyen.length} grubun verisi bu veri setinde yok, tablo “—” gösteriyor —
      bilmediğimiz bir sayıyı tahmin etmektense boş bırakıyoruz.
      Eksik değerler TÜİK bülteninden okunup <code>data/referans.json</code> dosyasına eklenebilir.
    </div>` : ''}

    <div class="ust-12">${notKutu('bilgi',
      `Kırmızı satırlar genel enflasyondan (%${n(ref.tufe.yillik, 2)}) daha hızlı artan gruplardır.
       Bütçende hangi grubun payı büyükse, senin gerçek enflasyonun ona yakındır —
       bu yüzden "ortalama enflasyon" seni yanıltabilir.`)}</div>`,
    { ikon: '◳', yan: kac(ref.tufe.donemAdi) });
}

/* ---------- reel getiri hesaplayıcı ---------- */

function reelKart() {
  const ref = H.referans();
  if (!ref) return '';

  const politika = ref.faiz.politikaFaizi.yillikYuzde;
  const ke = H.kisiselEnflasyon();

  const satirlar = [
    { ad: 'TÜİK TÜFE', enf: ref.tufe.yillik, renk: 'var(--blue)' },
    { ad: 'ENAG', enf: ref.enag.yillik, renk: 'var(--amber)' }
  ];
  if (ke.yeterliVeri && ke.yillikTahmin !== null) {
    satirlar.push({ ad: 'Senin sepetin', enf: ke.yillikTahmin, renk: 'var(--gold)' });
  }

  return kart('Reel getiri: kazanıyor musun, kaybediyor musun?', `
    ${notKutu('bilgi',
      `<b>Reel getiri = (1 + nominal) ÷ (1 + enflasyon) − 1.</b>
       "Faiz eksi enflasyon" demek küçük oranlarda işe yarar, yüksek oranlarda yanıltır.
       Aşağıdaki tablo TCMB politika faizini (%${n(politika, 0)}) referans alır — bankanın sana verdiği oran farklıysa
       kendi oranını düşünerek oku.`)}

    <div class="tablo-sar ust-12"><table class="veri">
      <thead><tr><th>Enflasyon ölçüsü</th><th class="num">Yıllık enflasyon</th><th class="num">Nominal getiri</th><th class="num">Reel getiri</th></tr></thead>
      <tbody>${satirlar.map(s => {
        const reel = H.reelGetiri(politika, s.enf);
        return `<tr>
          <td><span class="rozet rz-notr" style="color:${s.renk}">${kac(s.ad)}</span></td>
          <td class="num">${yuzde(s.enf, 2)}</td>
          <td class="num r-muted">${yuzde(politika, 0)}</td>
          <td class="num kalin ${reel >= 0 ? 'r-em' : 'r-red'}">${yuzdeIsaret(reel, 2)}</td>
        </tr>`;
      }).join('')}
      </tbody></table></div>

    <div class="ust-12">${notKutu(
      H.reelGetiri(politika, ref.enag.yillik) < 0 ? 'uyari' : 'bilgi',
      `Reel getiri negatifse, paranın rakam olarak büyürken satın alma gücü olarak <b>küçülüyor</b> demektir.
       Bu yüzden "hiçbir şey yapmamak" nötr bir seçim değildir — Türkiye'de hiçbir şey yapmamak reel kayıptır.
       Ama tersi de doğru değil: bugün lazım olan parayı dalgalı bir varlığa koymak da hatadır.
       Ayrım, paranın <b>ne zaman</b> lazım olacağıdır.`)}</div>`,
    { ikon: '◭' });
}

/* ============================================================
   Eylemler
   ============================================================ */

eylemKaydet('urun-ekle', () => {
  modalAc({
    baslik: 'Sepete ürün ekle',
    govde: `
      <div class="satir s-211">
        ${alan('Ürün', girdi('ad', { yer: 'Süt' }))}
        ${alan('Ölçü', girdi('olcu', { yer: '1' }))}
        ${alan('Birim', secim('birim', SEPET_BIRIMLER, 'lt'))}
      </div>
      <div class="satir s-2">
        ${alan('Bugünkü fiyatı (₺)', girdi('fiyat', { yer: '42,50' }))}
        ${alan('Nereden', girdi('yer', { yer: 'Market adı (isteğe bağlı)' }))}
      </div>
      ${notKutu('bilgi', 'Ölçüyü sabit tut. "Süt 1 lt" ile "Süt 500 ml" ayrı ürün olarak eklenmelidir, yoksa artış hesabı bozulur.')}`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Ekle', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const fiyat = sayiOku(f.fiyat);
          if (!f.ad.trim() || fiyat <= 0) { bildir('Ürün adı ve fiyat gerekli.', 'hata'); return false; }
          ekle('sepet', {
            ad: f.ad.trim(), olcu: f.olcu.trim(), birim: f.birim,
            kayitlar: [{ tarih: bugun(), fiyat, yer: f.yer.trim() }]
          }, 'u');
          bildir('Ürün eklendi. Bir sonraki alışverişinde fiyatını güncelle.');
        }
      }
    ]
  });
});

eylemKaydet('fiyat-ekle', ({ id }) => {
  const u = bul('sepet', id);
  if (!u) return;
  const k = [...u.kayitlar].sort((a, b) => a.tarih.localeCompare(b.tarih));
  const son = k[k.length - 1];

  modalAc({
    baslik: 'Yeni fiyat — ' + u.ad,
    govde: `
      <div class="izgara iz-2 alt-12">
        ${dosem({ etiket: 'Son kayıtlı fiyat', deger: tl(son.fiyat, 2), ipucu: tarihUzun(son.tarih) })}
        ${dosem({ etiket: 'Kayıt sayısı', deger: String(k.length), ipucu: 'ne kadar çok, o kadar doğru' })}
      </div>
      <div class="satir s-2">
        ${alan('Yeni fiyat (₺)', girdi('fiyat', { yer: String(son.fiyat) }))}
        ${alan('Tarih', girdi('tarih', { tur: 'date', deger: bugun() }))}
      </div>`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const fiyat = sayiOku(f.fiyat);
          if (fiyat <= 0) { bildir('Geçerli bir fiyat gir.', 'hata'); return false; }
          const t = f.tarih || bugun();
          const varOlan = u.kayitlar.find(x => x.tarih === t);
          if (varOlan) varOlan.fiyat = fiyat;
          else u.kayitlar.push({ tarih: t, fiyat, yer: son.yer || '' });
          kaydet('sepet-fiyat');
          const d = son.fiyat > 0 ? (fiyat / son.fiyat - 1) * 100 : 0;
          bildir(`Kaydedildi. Son kayda göre ${yuzdeIsaret(d, 1)}.`);
        }
      }
    ]
  });
});

eylemKaydet('urun-sil', async ({ id }) => {
  const u = bul('sepet', id);
  if (u && await onayla('Ürünü sil', `<b>${kac(u.ad)}</b> ve tüm fiyat geçmişi silinsin mi?`, 'Sil', true)) {
    sil('sepet', id); bildir('Silindi.', 'bilgi');
  }
});
