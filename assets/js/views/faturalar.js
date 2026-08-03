/* Faturalar & Öncelik — para yetmediğinde önce hangisi ödenir. */

import { durum } from '../core/store.js';
import * as H from '../core/hesap.js';
import { tl, tlKisa, n, tarihKisa, tarihUzun, vadeMetni, bugun, buAy, ayAdi, ayKisa, kac, tarih, gunFark, ayinGunu } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, eylemKaydet } from '../core/ui.js';
import * as G from '../core/chart.js';
import { KATEGORI_IKON } from '../core/sabitler.js';

export const faturaGorunum = {
  ad: 'faturalar', ikon: '◳', etiket: 'Faturalar',
  baslik: 'Faturalar & Öncelik',
  alt: 'Para her şeye yetmediğinde "hangisini ödeyeyim" duygusal değil, matematiksel bir sorudur.',

  ciz() {
    const gg = H.gunlukGuvenli();
    const yuk = H.yukumlulukler(bugun(), ayinGunu(31, ayEkleGuvenli(buAy(), 1)));

    if (!yuk.length) {
      return kart('Yükümlülükler', bos(
        'Henüz yükümlülük yok',
        'Nakit Akışı ekranından sabit giderlerini, Borç ekranından borçlarını gir. Hepsi burada vade ve öncelik sırasıyla toplanır.',
        '◳'
      ), { ikon: '◳' });
    }

    return ozet(gg, yuk)
      + odemePlani(gg, yuk)
      + `<div class="izgara iz-21 ust-16"><div>${oncelikListesi(yuk)}</div><div>${takvimKart()}${yiginKart()}</div></div>`
      + olcutlerKart();
  }
};

function ayEkleGuvenli(a, k) {
  const [y, m] = a.split('-').map(Number);
  const t = y * 12 + (m - 1) + k;
  return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
}

/* ---------- özet ---------- */

function ozet(gg, yuk) {
  const gecikmis = yuk.filter(y => y.kalanGun < 0);
  const yediGun = yuk.filter(y => y.kalanGun >= 0 && y.kalanGun <= 7);
  const otuzGun = yuk.filter(y => y.kalanGun >= 0 && y.kalanGun <= 30);
  const otomatik = yuk.filter(y => y.otomatik).length;

  return `<div class="izgara iz-4 alt-16">
    ${dosem({
      etiket: 'Gecikmiş', deger: gecikmis.length ? tl(gecikmis.reduce((a, y) => a + y.tutar, 0)) : '0 ₺',
      ipucu: gecikmis.length ? `${gecikmis.length} kalem` : 'gecikme yok',
      renk: gecikmis.length ? 'r-red' : 'r-em', vurgu: gecikmis.length ? 'kotu' : '', ikon: '!'
    })}
    ${dosem({ etiket: '7 gün içinde', deger: tl(yediGun.reduce((a, y) => a + y.tutar, 0)), ipucu: `${yediGun.length} kalem`, renk: 'r-amber', ikon: '◷' })}
    ${dosem({ etiket: '30 gün içinde', deger: tl(otuzGun.reduce((a, y) => a + y.tutar, 0)), ipucu: `${otuzGun.length} kalem`, renk: 'r-gold', ikon: '◳' })}
    ${dosem({ etiket: 'Otomatik ödeme', deger: `${otomatik}/${yuk.length}`, ipucu: otomatik < yuk.length ? 'talimat kurmak gecikmeyi önler' : 'hepsi otomatik', renk: 'r-teal', ikon: '⟳' })}
  </div>`;
}

/* ---------- ödeme planı ---------- */

function odemePlani(gg, yuk) {
  const nakit = gg.nakit;
  const pencere = yuk.filter(y => y.kalanGun <= gg.gun);
  const gerekli = pencere.reduce((a, y) => a + y.tutar, 0);

  if (!pencere.length) return '';

  // öncelik sırasıyla ödenebilecekler
  let kalan = nakit;
  const plan = pencere.map(y => {
    const odenebilir = kalan >= y.tutar;
    if (odenebilir) kalan -= y.tutar;
    return { ...y, odenebilir, kalanSonra: kalan };
  });
  const odenemeyen = plan.filter(p => !p.odenebilir);

  return kart(
    nakit >= gerekli ? 'Bu pencerede her şeyi karşılıyorsun' : 'Para yetmezse: ödeme sırası',
    `
    <div class="izgara iz-3 alt-12">
      ${dosem({ etiket: 'Elde', deger: tl(nakit), ikon: '◉' })}
      ${dosem({ etiket: `${gg.gun} günde ödenecek`, deger: tl(gerekli), renk: 'r-amber', ikon: '◧' })}
      ${dosem({
        etiket: nakit >= gerekli ? 'Kalan' : 'Açık', deger: tl(Math.abs(nakit - gerekli)),
        renk: nakit >= gerekli ? 'r-em' : 'r-red', vurgu: nakit >= gerekli ? 'iyi' : 'kotu', ikon: nakit >= gerekli ? '✓' : '!'
      })}
    </div>

    ${nakit >= gerekli
      ? notKutu('iyi', `Bir sonraki gelirine kadar ödenecek her şeyi karşılayabiliyorsun ve geriye <b>${tl(nakit - gerekli)}</b> kalıyor. Bu tutar günlük harcamana bölünüyor.`)
      : notKutu('uyari', `Aşağıdaki sıra <b>zarar en aza insin</b> diye kurulur: önce kesilirse hayatı durduranlar, sonra gecikince faiz bindirenler, sonra kredi notuna işleyenler. ${odenemeyen.length} kalem bu pencerede açıkta kalıyor — bunlar için erteleme talebi, taksitlendirme ya da ek gelir gerekir.`)}

    <div class="ust-12">
      ${plan.map((p, i) => `
        <div class="oge ${p.odenebilir ? '' : 'bitti'}" style="${p.odenebilir ? '' : 'border-color:var(--red-dim)'}">
          <div class="im" style="background:${p.odenebilir ? 'var(--em-dim)' : 'var(--red-dim)'};color:${p.odenebilir ? 'var(--em)' : 'var(--red)'};font-weight:800;font-size:13px">${i + 1}</div>
          <div class="gvd">
            <div class="ad">${kac(p.ad)}
              ${p.kalanGun < 0 ? rozet('gecikmiş', 'red') : p.kalanGun <= 3 ? rozet(vadeMetni(p.kalanGun).toLowerCase(), 'amber') : ''}
              ${p.kaynak === 'borc' ? rozet(p.tur === 'kk' ? 'kart' : 'kredi', 'violet') : ''}</div>
            <div class="ayr">${tarihKisa(p.vade)} · öncelik ${p.puan}/100${p.faizAylik ? ` · gecikirse aylık %${p.faizAylik} faiz` : ''}</div>
          </div>
          <div class="sag">
            <div class="tut ${p.odenebilir ? '' : 'r-red'}">${tl(p.tutar)}</div>
            <div class="ust">${p.odenebilir ? 'kalan ' + tlKisa(p.kalanSonra) : 'karşılanamıyor'}</div>
          </div>
        </div>`).join('')}
    </div>`,
    { ikon: nakit >= gerekli ? '✓' : '◧', yan: `elindeki ${tlKisa(nakit)} ile` });
}

/* ---------- öncelik listesi ---------- */

function oncelikListesi(yuk) {
  return kart('Tüm yükümlülükler', `
    <div class="tablo-sar"><table class="veri">
      <thead><tr><th>Öncelik</th><th>Kalem</th><th>Vade</th><th class="num">Tutar</th></tr></thead>
      <tbody>${yuk.map(y => `
        <tr>
          <td class="dar">
            <span class="rozet ${y.puan >= 75 ? 'rz-red' : y.puan >= 50 ? 'rz-amber' : y.puan >= 30 ? 'rz-gold' : 'rz-notr'}">${y.puan}</span>
          </td>
          <td>
            <div class="kalin" style="font-size:13px">${KATEGORI_IKON[y.kategori] || '◳'} ${kac(y.ad)}</div>
            <div class="mini r-faint">${gerekce(y)}</div>
          </td>
          <td class="mini ${y.kalanGun < 0 ? 'r-red kalin' : y.kalanGun <= 3 ? 'r-amber' : 'r-muted'}">
            ${tarihKisa(y.vade)}<br>${kac(vadeMetni(y.kalanGun))}
          </td>
          <td class="num">${tl(y.tutar)}</td>
        </tr>`).join('')}
      </tbody></table></div>`,
    { ikon: '◳', yan: `${yuk.length} kalem · ${tlKisa(yuk.reduce((a, y) => a + y.tutar, 0))}` });
}

function gerekce(y) {
  const p = [];
  const kr = y.kesintiRiski ?? 3;
  if (kr >= 9) p.push('kesilirse hayat durur');
  else if (kr >= 6) p.push('ciddi aksama');
  if (y.faizAylik > 0) p.push(`gecikirse %${y.faizAylik}/ay faiz`);
  if (y.kaynak === 'borc' && y.kurumsal !== false) p.push('kredi notuna işler');
  if (y.otomatik) p.push('otomatik');
  return p.length ? kac(p.join(' · ')) : 'düzenli gider';
}

/* ---------- vade takvimi ---------- */

function takvimKart() {
  const ay = buAy();
  const gunler = {};
  H.yukumlulukler(ayinGunu(1, ay), ayinGunu(31, ay)).forEach(y => {
    gunler[y.vade] = (gunler[y.vade] || 0) + y.tutar;
  });

  const dolu = Object.keys(gunler).length;
  if (!dolu) return '';

  const enYogun = Object.entries(gunler).sort((a, b) => b[1] - a[1])[0];

  return kart('Vade takvimi', `
    ${G.takvim(gunler, ay, { esik: 0, bicim: tlKisa })}
    <div class="mini r-faint merkez ust-8">Koyu gün = o gün ödenecek tutar yüksek</div>
    ${enYogun ? `<div class="ust-12">${notKutu('bilgi',
      `En yoğun gün <b>${tarihKisa(enYogun[0])}</b>: <b>${tl(enYogun[1])}</b>.
       Bu gün gelirinden uzaksa her ay sıkışırsın — çoğu kurum fatura kesim tarihini değiştirebilir.`)}</div>` : ''}`,
    { ikon: '▦', yan: ayAdi(ay) });
}

/* ---------- tür dağılımı ---------- */

function yiginKart() {
  const yuk = H.yukumlulukler(bugun(), ayinGunu(31, buAy()));
  if (!yuk.length) return '';

  const m = new Map();
  yuk.forEach(y => {
    const ad = y.kaynak === 'borc' ? 'Borç / taksit'
      : y.tur === 'abonelik' ? 'Abonelik'
      : y.tur === 'kira' ? 'Kira'
      : y.tur === 'vergi' ? 'Vergi' : 'Fatura';
    m.set(ad, (m.get(ad) || 0) + y.tutar);
  });
  const veri = [...m.entries()].map(([ad, deger], i) => ({ ad, deger, renk: G.renk(i) }));
  const toplam = veri.reduce((a, v) => a + v.deger, 0);

  return kart('Ne için ödüyorsun', `
    ${G.halka(veri, { boyut: 150, kalinlik: 20, ortaUst: tlKisa(toplam), ortaAlt: 'bu ay' })}
    <div class="ust-12">${G.yatayListe(veri)}</div>`, { ikon: '◔' });
}

/* ---------- ölçütler ---------- */

function olcutlerKart() {
  return kart('Öncelik nasıl hesaplanıyor', `
    <div class="izgara iz-3">
      <div class="oge" style="align-items:flex-start;flex-direction:column;gap:6px">
        <div class="ad"><span class="rozet rz-red">1</span> Kesinti riski</div>
        <div class="ayr" style="line-height:1.6">Ödenmezse hayatın durur mu? Elektrik, su, doğalgaz, kira, sağlık en üstte.
          Bunlar ayrıca geri açtırma bedeli de doğurur.</div>
      </div>
      <div class="oge" style="align-items:flex-start;flex-direction:column;gap:6px">
        <div class="ad"><span class="rozet rz-amber">2</span> Bileşik maliyet</div>
        <div class="ayr" style="line-height:1.6">Gecikince faiz bindirenler. Kredi kartı bu grubun en pahalısıdır —
          gecikme faizi akdi faizden de yüksektir.</div>
      </div>
      <div class="oge" style="align-items:flex-start;flex-direction:column;gap:6px">
        <div class="ad"><span class="rozet rz-violet">3</span> Kredi notu etkisi</div>
        <div class="ayr" style="line-height:1.6">Bankaya olan gecikme kredi notuna işler ve yıllarca peşini bırakmaz.
          Kişiye olan borcun notuna işlemez — ama ilişkine işler.</div>
      </div>
    </div>
    <div class="ust-12">${notKutu('bilgi',
      `Vade yakınlığı bu üç ölçütü çarpan olarak yükseltir. Ödeyemeyeceğin bir banka borcu varsa bile
       <b>asgariyi öde</b>: gecikme kaydı, kısmi ödemeden çok daha ağır zarar verir.`)}</div>`,
    { ikon: '◈', not: 'Sıra duyguya göre değil, oluşacak zarara göre kurulur.' });
}
