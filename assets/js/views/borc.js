/* Borç & Taksit — asgari mi tam mı, çığ mı kartopu mu, 12 aylık taahhüt. */

import { durum, kaydet, ekle, guncelle, sil, bul } from '../core/store.js';
import * as H from '../core/hesap.js';
import { tl, tlKisa, n, yuzde, tarihKisa, ayKisa, ayAdi, buAy, kac, sayiOku } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, senaryoEtiketi, eylemKaydet, bildir, modalAc, formOku, onayla, alan, girdi, secim } from '../core/ui.js';
import * as G from '../core/chart.js';
import { BORC_TURLER, BORC_IKON } from '../core/sabitler.js';

let secilenKart = null;   // kart simülasyonunda gösterilen kart
let ekOdeme = 0;          // strateji simülasyonunda ek ödeme

export const borcGorunum = {
  ad: 'borc', ikon: '◧', etiket: 'Borç & Taksit',
  baslik: 'Borç & Taksit',
  alt: 'Eksi olmak sorun değil. Yönetilmeyen eksi sorundur. Buradaki hesaplar TCMB\'nin ilan ettiği azami oranlarla yapılır.',

  ciz() {
    const aktif = durum.borclar.filter(b => (Number(b.kalan) || 0) > 0);

    if (!durum.borclar.length) {
      return kart('Borçların', bos(
        'Borç kaydı yok',
        'Borcun yoksa harika. Varsa gir — görünmeyen borç, en pahalı borçtur.', '◧'
      ) + `<div class="merkez ust-12"><button class="dg-btn b-ana b-kucuk" data-eylem="borc-ekle">＋ Borç ekle</button></div>`,
        { ikon: '◧' }) + faizTablosu();
    }

    return ozet(aktif)
      + listeKart()
      + kartSimKart()
      + stratejiKart()
      + taahhutKart()
      + faizTablosu();
  }
};

/* ---------- özet ---------- */

function ozet(aktif) {
  const toplam = aktif.reduce((a, b) => a + (Number(b.kalan) || 0), 0);
  const aylik = H.aylikBorcYuku();
  const bg = H.borcGelirOrani();
  const ku = H.kartKullanimOrani();

  return `<div class="izgara iz-4 alt-16">
    ${dosem({ etiket: 'Toplam kalan borç', deger: tl(toplam), ipucu: `${aktif.length} aktif kalem`, renk: 'r-red', vurgu: 'kotu', ikon: '◧' })}
    ${dosem({ etiket: 'Aylık ödeme yükü', deger: tl(aylik), ipucu: 'asgariler + taksitler', renk: 'r-amber', ikon: '↗' })}
    ${dosem({
      etiket: 'Borç / gelir oranı', deger: bg ? yuzde(bg.oran, 0) : '—',
      ipucu: bg ? bg.durumAdi + (bg.oran > 30 ? ' · sağlıklı sınır %30' : '') : 'gelir gir',
      renk: bg ? 'r-' + bg.renk : 'r-muted', ikon: '◔'
    })}
    ${dosem({
      etiket: 'Kart limit kullanımı', deger: ku.yeterliVeri ? yuzde(ku.oran, 0) : '—',
      ipucu: ku.yeterliVeri ? `${ku.durumAdi} · kredi notu için hedef %30` : 'kart limiti gir',
      renk: ku.yeterliVeri ? 'r-' + ku.renk : 'r-muted', ikon: '▤'
    })}
  </div>`;
}

/* ---------- borç listesi ---------- */

function listeKart() {
  const liste = [...durum.borclar].sort((a, b) => (Number(b.kalan) || 0) - (Number(a.kalan) || 0));

  const govde = liste.map(b => {
    const kalan = Number(b.kalan) || 0;
    const bitti = kalan <= 0;
    const faiz = b.tur === 'kk' ? H.kartFaizi(b) : (Number(b.faizAylik) || null);
    const yillik = faiz ? H.yillikBilesik(faiz) : null;
    const aylikOde = b.tur === 'kk' ? H.kartAsgari(b) : (Number(b.taksitTutar) || 0);
    const kullanim = b.tur === 'kk' && Number(b.limit) > 0 ? kalan / Number(b.limit) * 100 : null;

    return `<div class="oge ${bitti ? 'bitti' : ''}" style="align-items:flex-start">
      <div class="im" style="background:var(--red-dim);color:var(--red)">${BORC_IKON[b.tur] || '○'}</div>
      <div class="gvd">
        <div class="ad">${kac(b.ad)}
          ${rozet((BORC_TURLER.find(t => t.deger === b.tur) || {}).ad || b.tur, 'notr')}
          ${bitti ? rozet('bitti', 'em') : ''}</div>
        <div class="ayr">
          ${faiz ? `aylık %${n(faiz, 2)}${yillik ? ` · yıllık bileşik <b class="r-red">%${n(yillik, 0)}</b>` : ''}` : 'faiz oranı girilmedi'}
          ${aylikOde > 0 ? ` · aylık ${tl(aylikOde)}` : ''}
          ${b.sonOdemeGun ? ` · her ayın ${b.sonOdemeGun}'i` : ''}
        </div>
        ${kullanim !== null ? `
          <div style="margin-top:6px;max-width:280px">
            <div class="esnek-ara mini" style="margin-bottom:3px">
              <span class="r-faint">limit kullanımı</span>
              <span class="num ${kullanim > 50 ? 'r-red' : kullanim > 30 ? 'r-amber' : 'r-em'}">${yuzde(kullanim, 0)} · ${tlKisa(b.limit)}</span></div>
            <div class="cubuk ince"><i class="${kullanim > 50 ? 'k' : kullanim > 30 ? 'a' : ''}" style="width:${Math.min(kullanim, 100).toFixed(0)}%"></i></div>
          </div>` : ''}
      </div>
      <div class="sag">
        <div class="tut r-red">${tl(kalan)}</div>
        <div class="ust">kalan</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <button class="sil-btn" data-eylem="borc-odeme" data-id="${b.id}" title="Ödeme kaydet">₺</button>
        <button class="sil-btn" data-eylem="borc-duzenle" data-id="${b.id}" title="Düzenle">✎</button>
        <button class="sil-btn" data-eylem="borc-sil" data-id="${b.id}" title="Sil">✕</button>
      </div>
    </div>`;
  }).join('');

  return kart('Borçların', govde
    + `<div class="ust-12"><button class="dg-btn b-cizgi b-kucuk b-tam" data-eylem="borc-ekle">＋ Borç ekle</button></div>`,
    { ikon: '◧' });
}

/* ---------- asgari vs tam ödeme ---------- */

function kartSimKart() {
  const kartlar = durum.borclar.filter(b => b.tur === 'kk' && (Number(b.kalan) || 0) > 0);
  if (!kartlar.length) return '';

  const secili = kartlar.find(k => k.id === secilenKart) || kartlar[0];
  const asgari = H.kartSimulasyon(secili, 'asgari');
  const tam = H.kartSimulasyon(secili, 'tam');
  const ref = H.referans();

  if (!asgari.yeterliVeri) {
    return kart('Asgari mi, tam mı?', notKutu('uyari', asgari.sebep || 'Hesap için yeterli veri yok.'), { ikon: '▤' });
  }

  const faizYillik = H.yillikBilesik(asgari.faizOran);

  const secici = kartlar.length > 1 ? `
    <div class="segment altin alt-16">${kartlar.map(k =>
      `<button class="${k.id === secili.id ? 'aktif' : ''}" data-eylem="kart-sec" data-id="${k.id}">${kac(k.ad)}</button>`).join('')}</div>` : '';

  const govde = `
    ${secici}
    <div class="izgara iz-3 alt-16">
      ${dosem({ etiket: 'Dönem borcu', deger: tl(secili.kalan), ikon: '▤' })}
      ${dosem({ etiket: 'Aylık akdi faiz', deger: yuzde(asgari.faizOran), ipucu: `yıllık bileşiği %${n(faizYillik, 0)}`, renk: 'r-red', ikon: '%' })}
      ${dosem({ etiket: 'Asgari ödeme oranı', deger: yuzde(asgari.asgariOran, 0), ipucu: `limit ${secili.limit ? tlKisa(secili.limit) : '—'} kademesi`, renk: 'r-amber', ikon: '◔' })}
    </div>

    ${asgari.bitmez ? notKutu('kotu', `<b>Bu borç asgari ödemeyle bitmiyor.</b> ${kac(asgari.sebep || '')}`) : `
      <div class="mini r-muted alt-8">Bankaya ödeyeceğin faiz</div>
      ${G.ikiliKarsilastir(
        { ad: 'Sadece asgari ödersen', deger: asgari.toplamFaiz, renk: 'var(--red)', alt: `${asgari.ayAdedi} ayda biter · toplam ${tl(asgari.toplamOdeme)} ödersin` },
        { ad: 'Tamamını şimdi ödersen', deger: tam.toplamFaiz, renk: 'var(--em)', alt: `1 ayda biter · toplam ${tl(tam.toplamOdeme)} ödersin` }
      )}

      <div class="izgara iz-3 ust-16">
        ${dosem({ etiket: 'Asgariyle biteceği süre', deger: asgari.ayAdedi + ' ay', ipucu: asgari.ayAdedi >= 12 ? `≈ ${(asgari.ayAdedi / 12).toFixed(1)} yıl` : '', renk: 'r-red', ikon: '◷' })}
        ${dosem({ etiket: 'Ödeyeceğin fazla faiz', deger: tl(asgari.toplamFaiz - tam.toplamFaiz), ipucu: 'tam ödemeye göre', renk: 'r-red', vurgu: 'kotu', ikon: '↗' })}
        ${dosem({ etiket: 'Toplam / anapara', deger: n(asgari.katsayi, 2) + '×', ipucu: `${tl(secili.kalan)} borç için ${tl(asgari.toplamOdeme)} ödersin`, renk: 'r-amber', ikon: '×' })}
      </div>

      <div class="grafik ust-16">${G.cizgi({
        seriler: [
          { ad: 'Asgari ödeme', renk: 'var(--red)', noktalar: asgari.aylar.filter((_, i) => i % Math.max(1, Math.ceil(asgari.aylar.length / 24)) === 0).map(a => ({ etiket: a.ay + '. ay', deger: a.kalan })) }
        ]
      }, { yukseklik: 170, alan: true, nokta: false, sifirdanBasla: true })}</div>
      <div class="mini r-faint merkez">Sadece asgari ödersen kalan borcun seyri</div>

      <div class="ust-16">${notKutu('uyari',
        `Aylık <b>%${n(asgari.faizOran, 2)}</b> masum görünür ama yıllık bileşiği <b>%${n(faizYillik, 0)}</b> eder.
         Kartını ${asgari.ayAdedi} ay boyunca sadece asgariyle ödersen,
         <b>${tl(secili.kalan)}</b> borç için toplam <b>${tl(asgari.toplamOdeme)}</b> ödemiş olursun.`)}</div>

      ${ref ? `<div class="ust-8">${notKutu('bilgi', kac(ref.faiz.asgariOdeme.uyari))}</div>` : ''}

      ${senaryoEtiketi(asgari.varsayim)}
    `}`;

  return kart('Asgari mi, tam mı?', govde, {
    ikon: '▤',
    yan: ref ? `TCMB azami oranları · ${ref.faiz.krediKarti.yururlukTarihi}` : '',
    not: 'Asgari ödeme, kartının kapanmasını önleyen en düşük tutardır — borcunu bitiren tutar değildir.'
  });
}

/* ---------- strateji ---------- */

function stratejiKart() {
  const aktif = durum.borclar.filter(b => (Number(b.kalan) || 0) > 0);
  if (aktif.length < 2) return '';

  const k = H.stratejiKarsilastir(ekOdeme);
  if (!k.yeterliVeri) {
    return kart('Çığ mı, kartopu mu?', notKutu('uyari', k.sebep || 'Her borç için aylık ödeme tutarı gerekiyor.'), { ikon: '◭' });
  }

  const { cig, kartopu } = k;

  return kart('Çığ mı, kartopu mu?', `
    <div class="alan">
      <span class="et">Asgarilerin üstüne her ay koyabileceğin ek tutar
        <span class="ip">${tl(ekOdeme)}</span></span>
      <input type="range" min="0" max="${Math.max(20000, Math.round(H.aylikGelir() * 0.4))}" step="250"
        value="${ekOdeme}" data-degisti="ek-odeme">
    </div>

    <div class="izgara iz-2 ust-16">
      <div class="oge" style="flex-direction:column;align-items:stretch;gap:8px;border-color:var(--em)">
        <div class="esnek-ara">
          <span class="ad">◭ Çığ yöntemi</span>
          ${rozet('en ucuz', 'em')}
        </div>
        <div class="ayr">En yüksek faizli borçtan başla. Matematiksel olarak en az faiz ödersin.</div>
        <div class="izgara iz-2" style="gap:8px">
          ${dosem({ etiket: 'Biteceği süre', deger: cig.ayAdedi ? cig.ayAdedi + ' ay' : '—', renk: 'r-em' })}
          ${dosem({ etiket: 'Toplam faiz', deger: tl(cig.toplamFaiz), renk: 'r-em' })}
        </div>
        <div class="mini r-faint">Sıra: ${cig.sira.map(s => kac(s.ad)).join(' → ')}</div>
      </div>

      <div class="oge" style="flex-direction:column;align-items:stretch;gap:8px">
        <div class="esnek-ara">
          <span class="ad">◉ Kartopu yöntemi</span>
          ${rozet('en motive edici', 'gold')}
        </div>
        <div class="ayr">En küçük bakiyeden başla. Daha çok faiz ödersin ama ilk bitirmenin morali devam ettirir.</div>
        <div class="izgara iz-2" style="gap:8px">
          ${dosem({ etiket: 'Biteceği süre', deger: kartopu.ayAdedi ? kartopu.ayAdedi + ' ay' : '—', renk: 'r-gold' })}
          ${dosem({ etiket: 'Toplam faiz', deger: tl(kartopu.toplamFaiz), renk: 'r-gold' })}
        </div>
        <div class="mini r-faint">Sıra: ${kartopu.sira.map(s => kac(s.ad)).join(' → ')}</div>
      </div>
    </div>

    ${cig.seri.length ? `<div class="grafik ust-16">${G.cizgi({
      seriler: [
        { ad: 'Çığ', renk: 'var(--em)', noktalar: cig.seri.map(s => ({ etiket: s.ay + '. ay', deger: s.kalan })) },
        { ad: 'Kartopu', renk: 'var(--gold)', noktalar: kartopu.seri.map(s => ({ etiket: s.ay + '. ay', deger: s.kalan })) }
      ]
    }, { yukseklik: 180, nokta: false, sifirdanBasla: true })}
    ${G.lejant([{ ad: 'Çığ', renk: 'var(--em)' }, { ad: 'Kartopu', renk: 'var(--gold)' }])}</div>` : ''}

    <div class="ust-16">${notKutu(
      Math.abs(k.faizFarki) < 1000 ? 'bilgi' : 'iyi',
      Math.abs(k.faizFarki) < 1000
        ? `Senin durumunda iki yöntem arasında anlamlı fark yok (${tl(Math.abs(k.faizFarki))}).
           O hâlde <b>motivasyonu yüksek olanı</b> seç — borç sarmalında en büyük risk pes etmektir.`
        : `Çığ yöntemi sana <b>${tl(Math.abs(k.faizFarki))}</b> daha az faize mal olur
           ${k.ayFarki !== 0 ? `ve <b>${Math.abs(k.ayFarki)} ay</b> daha erken biter` : ''}.
           Disiplinden eminsen çığ; ilk zaferi erken görmen gerekiyorsa kartopu.`
    )}</div>

    <div class="ust-8">${notKutu('bilgi',
      'Her iki yöntemde de kural aynı: tüm borçlara asgariyi öde, <b>fazlayı tek bir hedefe yığ</b>. Fazlayı dağıtmak en yavaş yöntemdir.')}</div>

    ${senaryoEtiketi(cig.varsayim)}`,
    { ikon: '◭', yan: `${aktif.length} borç` });
}

/* ---------- 12 aylık taahhüt ---------- */

function taahhutKart() {
  const t = H.taahhutTakvimi(12);
  if (!t.some(x => x.toplam > 0)) return '';

  const gelir = H.aylikGelir();
  const veri = t.map(x => ({
    etiket: ayKisa(x.ay),
    parcalar: [
      { ad: 'Sabit gider', deger: x.sabit, renk: 'var(--amber)' },
      { ad: 'Borç / taksit', deger: x.borc, renk: 'var(--red)' }
    ]
  }));

  const ilk = t[0];
  const oran = gelir > 0 ? ilk.toplam / gelir * 100 : null;

  return kart('Önümüzdeki 12 ay', `
    <div class="grafik">${G.yiginSutun(veri, { yukseklik: 190 })}</div>
    ${G.lejant([
      { ad: 'Sabit gider', renk: 'var(--amber)' },
      { ad: 'Borç / taksit', renk: 'var(--red)' }
    ])}
    ${oran !== null ? `<div class="ust-12">${notKutu(
      oran > 70 ? 'kotu' : oran > 50 ? 'uyari' : 'bilgi',
      `Bu ay gelirinin <b>%${oran.toFixed(0)}</b>'i daha ay başlamadan taahhüt edilmiş durumda
       (${tl(ilk.toplam)} / ${tl(gelir)}).
       ${oran > 50 ? 'Sağlıklı sınır olarak sabit + borç yükünün gelirin %50\'sini geçmemesi önerilir.' : ''}`
    )}</div>` : ''}
    ${senaryoEtiketi('Kredi kartlarına yalnızca asgari ödendiği (bu yüzden asgari her ay küçülür), taksit sayılarının ve sabit giderlerin değişmediği varsayıldı.')}`,
    { ikon: '▦', not: 'Taksit, fiyatı küçültmez; acıyı böler. Bu grafik, gelecekteki gelirinin ne kadarının şimdiden bağlandığını gösterir.' });
}

/* ---------- TCMB faiz tablosu ---------- */

function faizTablosu() {
  const ref = H.referans();
  if (!ref) return '';
  const kk = ref.faiz.krediKarti;

  return kart('TCMB azami kredi kartı faiz oranları', `
    <div class="tablo-sar"><table class="veri">
      <thead><tr><th>Dönem borcu</th><th class="num">Akdi faiz (aylık)</th><th class="num">Gecikme faizi (aylık)</th><th class="num">Yıllık bileşik</th></tr></thead>
      <tbody>${kk.kademeler.map(k => `
        <tr>
          <td>${k.ustSinir === null ? `${n(k.altSinir)} ₺ üzeri` : `${n(k.altSinir)} – ${n(k.ustSinir)} ₺`}</td>
          <td class="num">${yuzde(k.akdiAylik)}</td>
          <td class="num r-red">${yuzde(k.gecikmeAylik)}</td>
          <td class="num r-red">${yuzde(H.yillikBilesik(k.akdiAylik), 1)}</td>
        </tr>`).join('')}
        <tr><td>Nakit avans</td><td class="num">${yuzde(kk.nakitAvansAylik)}</td><td class="num r-muted">—</td>
          <td class="num r-red">${yuzde(H.yillikBilesik(kk.nakitAvansAylik), 1)}</td></tr>
      </tbody></table></div>
    <div class="ust-12">${notKutu('bilgi', kac(kk.not))}</div>
    <div class="mini r-faint ust-8">
      Kaynak: ${kac(kk.kaynak)} · yürürlük ${kac(kk.yururlukTarihi)} ·
      veri seti ${kac(ref.guncellemeTarihi)} tarihinde güncellendi.
      <a href="${kac(kk.kaynakUrl)}" target="_blank" rel="noopener">TCMB sayfası ↗</a>
    </div>`, { ikon: '◈' });
}

/* ============================================================
   Eylemler
   ============================================================ */

function borcFormu(b = null) {
  const kkMi = (b?.tur || 'kk') === 'kk';
  modalAc({
    baslik: b ? 'Borcu düzenle' : 'Borç ekle',
    govde: `
      <div class="satir s-2">
        ${alan('Adı', girdi('ad', { deger: b?.ad || '', yer: 'Banka X kredi kartı' }))}
        ${alan('Tür', secim('tur', BORC_TURLER, b?.tur || 'kk'))}
      </div>
      <div class="satir s-2">
        ${alan('Kalan borç (₺)', girdi('kalan', { deger: b?.kalan || '', yer: '18500' }))}
        ${alan('Son ödeme günü', girdi('sonOdemeGun', { tur: 'number', deger: b?.sonOdemeGun || 10, ek: 'min="1" max="31"' }), 'ayın kaçı')}
      </div>
      <div class="satir s-2">
        ${alan('Kart limiti (₺)', girdi('limit', { deger: b?.limit || '', yer: '50000' }), 'kredi kartıysa')}
        ${alan('Aylık faiz (%)', girdi('faizAylik', { deger: b?.faizAylik || '', yer: 'boş = TCMB azami' }), 'ekstrende yazan')}
      </div>
      <div class="satir s-2">
        ${alan('Aylık taksit (₺)', girdi('taksitTutar', { deger: b?.taksitTutar || '', yer: '2400' }), 'kredi/taksitse')}
        ${alan('Kalan taksit sayısı', girdi('kalanTaksit', { tur: 'number', deger: b?.kalanTaksit || '', yer: '12' }))}
      </div>
      ${notKutu('bilgi', `Kredi kartında faiz ve asgari oranı boş bırakırsan TCMB'nin ilan ettiği azami oranlar kullanılır.
        Kendi ekstrende farklı bir oran yazıyorsa onu gir — hesap daha doğru olur.`)}`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const kalan = sayiOku(f.kalan);
          if (!f.ad.trim() || kalan <= 0) { bildir('Ad ve kalan borç gerekli.', 'hata'); return false; }
          const veri = {
            ad: f.ad.trim(), tur: f.tur, kalan,
            limit: sayiOku(f.limit) || null,
            faizAylik: sayiOku(f.faizAylik) || null,
            taksitTutar: sayiOku(f.taksitTutar) || null,
            kalanTaksit: Number(f.kalanTaksit) || null,
            sonOdemeGun: Number(f.sonOdemeGun) || 1
          };
          if (b) guncelle('borclar', b.id, veri); else ekle('borclar', { ...veri, olusturma: Date.now() }, 'b');
          bildir('Kaydedildi.');
        }
      }
    ]
  });
}

eylemKaydet('borc-ekle', () => borcFormu());
eylemKaydet('borc-duzenle', ({ id }) => borcFormu(bul('borclar', id)));

eylemKaydet('borc-sil', async ({ id }) => {
  const b = bul('borclar', id);
  if (b && await onayla('Borcu sil', `<b>${kac(b.ad)}</b> kaydı silinsin mi?`, 'Sil', true)) {
    sil('borclar', id); bildir('Silindi.', 'bilgi');
  }
});

eylemKaydet('borc-odeme', ({ id }) => {
  const b = bul('borclar', id);
  if (!b) return;
  const asgari = b.tur === 'kk' ? H.kartAsgari(b) : (Number(b.taksitTutar) || 0);
  modalAc({
    baslik: 'Ödeme kaydet — ' + b.ad,
    govde: `
      <div class="izgara iz-2 alt-12">
        ${dosem({ etiket: 'Kalan borç', deger: tl(b.kalan), renk: 'r-red' })}
        ${dosem({ etiket: b.tur === 'kk' ? 'Asgari tutar' : 'Aylık taksit', deger: asgari > 0 ? tl(asgari) : '—', renk: 'r-amber' })}
      </div>
      ${alan('Ödediğin tutar (₺)', girdi('tutar', { yer: String(Math.round(asgari) || '') }))}
      <div class="dg-grup alt-12">
        ${asgari > 0 ? `<button class="dg-btn b-cizgi b-mini" data-doldur="${Math.round(asgari)}">Asgari: ${tl(asgari)}</button>` : ''}
        <button class="dg-btn b-cizgi b-mini" data-doldur="${Math.round(b.kalan)}">Tamamı: ${tl(b.kalan)}</button>
      </div>
      ${b.tur === 'kk' && asgari > 0 ? notKutu('uyari',
        `Sadece asgariyi ödersen kalan <b>${tl(b.kalan - asgari)}</b> tutara aylık
         <b>%${n(H.kartFaizi(b), 2)}</b> faiz işler.`) : ''}`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Ödemeyi kaydet', sinif: 'b-iyi', tikla: kok => {
          const v = sayiOku(formOku(kok).tutar);
          if (v <= 0) { bildir('Geçerli bir tutar gir.', 'hata'); return false; }
          const yeni = Math.max((Number(b.kalan) || 0) - v, 0);
          guncelle('borclar', b.id, { kalan: yeni });
          if (Number(b.kalanTaksit) > 0) guncelle('borclar', b.id, { kalanTaksit: Number(b.kalanTaksit) - 1 });
          const nakit = Number(durum.nakit.tutar) || 0;
          if (nakit >= v) { durum.nakit.tutar = nakit - v; kaydet('nakit'); }
          bildir(yeni === 0 ? '🎉 Borç bitti! Bu, kesin bir kazançtır.' : `Ödeme kaydedildi. Kalan: ${tl(yeni)}`);
        }
      }
    ]
  });

  // hızlı doldurma düğmeleri
  setTimeout(() => {
    document.querySelectorAll('[data-doldur]').forEach(d => {
      d.onclick = e => {
        e.preventDefault();
        const i = d.closest('.modal').querySelector('input[name="tutar"]');
        if (i) { i.value = d.dataset.doldur; i.focus(); }
      };
    });
  }, 40);
});

eylemKaydet('kart-sec', ({ id }) => {
  secilenKart = id;
  document.dispatchEvent(new CustomEvent('gorunum-yenile'));
});

eylemKaydet('ek-odeme', ({ deger }) => {
  ekOdeme = Number(deger) || 0;
  document.dispatchEvent(new CustomEvent('gorunum-yenile'));
});
