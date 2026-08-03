/* Kararlar — almadan önce. Kendi planın, indirimlerin değil. */

import { durum, kaydet, ekle, guncelle, sil, bul } from '../core/store.js';
import { piyasa } from '../core/market.js';
import * as H from '../core/hesap.js';
import { tl, tlKisa, n, yuzde, sureMetni, tarihKisa, kac, sayiOku, bugun } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, eylemKaydet, bildir, modalAc, formOku, onayla, alan, girdi } from '../core/ui.js';
import * as G from '../core/chart.js';

const GUN = 86400000;

export const kararGorunum = {
  ad: 'kararlar', ikon: '◇', etiket: 'Kararlar',
  baslik: 'Almadan Önce',
  alt: 'İndirim, kampanya, "bunu al" diyenler… Savunma tek ve basittir: kendi planın ve biraz zaman.',

  ciz() {
    return ozet() + ekleKart() + bekleyenler() + gecmis() + tuzaklar();
  }
};

function ozet() {
  const vazgecilen = durum.kararlar.filter(k => k.durum === 'vazgecildi');
  const alinan = durum.kararlar.filter(k => k.durum === 'alindi');
  const bekleyen = durum.kararlar.filter(k => k.durum === 'bekliyor');
  const kalanPara = vazgecilen.reduce((a, k) => a + (Number(k.fiyat) || 0), 0);
  const pisman = alinan.filter(k => k.pisman === true).length;
  const saat = H.saateCevir(kalanPara);

  if (!durum.kararlar.length) return '';

  return `<div class="izgara iz-4 alt-16">
    ${dosem({ etiket: 'Bekleyen', deger: String(bekleyen.length), ipucu: bekleyen.length ? tlKisa(bekleyen.reduce((a, k) => a + k.fiyat, 0)) + ' değerinde' : '', renk: 'r-gold', ikon: '◷' })}
    ${dosem({ etiket: 'Vazgeçtiklerin', deger: tl(kalanPara), ipucu: saat ? `≈ ${n(saat)} saat çalışman cebinde kaldı` : `${vazgecilen.length} karar`, renk: 'r-em', vurgu: 'iyi', ikon: '✓' })}
    ${dosem({ etiket: 'Aldıkların', deger: tl(alinan.reduce((a, k) => a + k.fiyat, 0)), ipucu: `${alinan.length} karar`, renk: 'r-muted', ikon: '◉' })}
    ${dosem({
      etiket: 'Pişman olduğun', deger: alinan.length ? `${pisman}/${alinan.length}` : '—',
      ipucu: alinan.length ? 'kendi geri bildirimin' : 'henüz veri yok',
      renk: pisman > 0 ? 'r-amber' : 'r-muted', ikon: '◌'
    })}
  </div>`;
}

/* ---------- yeni karar ---------- */

function ekleKart() {
  return kart('Almak istediğin bir şey mi var?', `
    <div class="satir s-211">
      ${alan('Ne almak istiyorsun?', girdi('kararAd', { yer: 'Kablosuz kulaklık', ek: 'id="kararAd"' }))}
      ${alan('Fiyatı (₺)', girdi('kararFiyat', { yer: '4500', ek: 'id="kararFiyat" data-yazildi="karar-onizle"' }))}
      ${alan('Bekleme süresi', girdi('kararGun', { tur: 'number', deger: durum.ayarlar.bekletmeGun, ek: 'id="kararGun" min="0" max="90"' }), 'gün')}
    </div>
    <div class="segment altin alt-12" id="kararTur">
      <button class="aktif" data-eylem="karar-tur" data-tur="istek">İstek — canım çekti</button>
      <button data-eylem="karar-tur" data-tur="ihtiyac">İhtiyaç — gerçekten lazım</button>
    </div>
    <div id="kararOnizleme"></div>
    <button class="dg-btn b-ana b-tam ust-12" data-eylem="karar-ekle">Bekleme listesine ekle</button>

    <div class="ust-12">${notKutu('bilgi',
      `<b>Dürüst test:</b> (1) Bu olmazsa önümüzdeki 30 günde hayatım aksar mı?
       (2) Elimde bunun işini gören bir şey var mı? (3) Bunu iki hafta önce de istiyor muydum?
       Üçüne "evet, hayır, evet" diyorsan ihtiyaçtır.`)}</div>`,
    { ikon: '◇', not: 'İstek almak yasak değil — plandan alınır. Fark şu: planlı istek bütçeden çıkar, plansız istek gelecekten çıkar.' });
}

/** Fiyat yazılırken canlı maliyet önizlemesi. */
function onizleme(fiyat) {
  if (!(fiyat > 0)) return '';
  const e = H.alimEtkisi(fiyat);
  const gram = piyasa.gramAltin.deger ? fiyat / piyasa.gramAltin.deger : null;
  const usd = piyasa.usd.deger ? fiyat / piyasa.usd.deger : null;

  const kalemler = [];
  if (e.saat !== null) kalemler.push({ et: 'Çalışma saati', dg: n(e.saat, 1) + ' saat', renk: 'r-gold' });
  if (e.gelirYuzdesi !== null) kalemler.push({ et: 'Aylık gelirinin', dg: yuzde(e.gelirYuzdesi, 1), renk: 'r-blue' });
  if (e.gunKarsiligi !== null) kalemler.push({ et: 'Günlük payının', dg: n(e.gunKarsiligi, 1) + ' günü', renk: 'r-violet' });
  if (gram) kalemler.push({ et: 'Gram altın', dg: n(gram, 2) + ' gr', renk: 'r-gold' });
  else if (piyasa.gramGumus.deger) kalemler.push({ et: 'Gram gümüş', dg: n(fiyat / piyasa.gramGumus.deger, 1) + ' gr', renk: 'r-muted' });
  else if (usd) kalemler.push({ et: 'Dolar', dg: '$' + n(usd), renk: 'r-teal' });

  if (!kalemler.length) return '';

  return `<div class="izgara iz-4 ust-12">
    ${kalemler.map(k => dosem({ etiket: k.et, deger: k.dg, renk: k.renk })).join('')}
  </div>
  ${e.serbestiAsiyor ? `<div class="ust-8">${notKutu('uyari',
    `Bu tutar, bir sonraki gelirine kadar serbest olan paranı aşıyor.
     Alırsan ya yükümlülüklerinden birine dokunman ya da borçlanman gerekir.`)}</div>` : ''}
  ${e.acilFonKatkisi !== null && e.acilFonKatkisi > 5 ? `<div class="ust-8">${notKutu('notr',
    `Aynı para acil fonuna gitse hedefinin <b>%${e.acilFonKatkisi.toFixed(0)}</b>'ini tamamlardı.`)}</div>` : ''}`;
}

/* ---------- bekleyenler ---------- */

function bekleyenler() {
  const liste = durum.kararlar.filter(k => k.durum === 'bekliyor')
    .sort((a, b) => (a.kararTarihi || 0) - (b.kararTarihi || 0));

  if (!liste.length) return '';

  return kart('Bekleme listesi', liste.map(k => {
    const kalan = (k.kararTarihi || 0) - Date.now();
    const hazir = kalan <= 0;
    const e = H.alimEtkisi(k.fiyat);

    return `<div class="oge" style="align-items:flex-start;flex-direction:column;gap:9px">
      <div class="esnek-ara" style="width:100%">
        <div>
          <div class="ad">${kac(k.ad)} ${rozet(k.tur === 'istek' ? 'istek' : 'ihtiyaç', k.tur === 'istek' ? 'gold' : 'em')}</div>
          <div class="ayr">
            ${e.saat !== null ? `≈ ${n(e.saat, 1)} saat çalışman` : ''}
            ${e.gelirYuzdesi !== null ? ` · gelirinin %${e.gelirYuzdesi.toFixed(1)}'i` : ''}
          </div>
        </div>
        <div class="sag">
          <div class="tut">${tl(k.fiyat)}</div>
          <div class="ust ${hazir ? 'r-em' : 'r-muted'}">${hazir ? 'karar zamanı' : sureMetni(kalan) + ' kaldı'}</div>
        </div>
      </div>

      ${!hazir ? `<div class="cubuk ince" style="width:100%"><i class="g" style="width:${
        Math.min(100, ((Date.now() - k.olusturma) / Math.max(k.kararTarihi - k.olusturma, 1)) * 100).toFixed(0)}%"></i></div>` : ''}

      ${hazir ? `<div class="esnek sar" style="width:100%;gap:8px">
        <button class="dg-btn b-iyi b-kucuk buyu" data-eylem="karar-ver" data-id="${k.id}" data-karar="vazgecildi">Vazgeçtim</button>
        <button class="dg-btn b-cizgi b-kucuk buyu" data-eylem="karar-ver" data-id="${k.id}" data-karar="alindi">Aldım</button>
        <button class="sil-btn" data-eylem="karar-sil" data-id="${k.id}">✕</button>
      </div>` : `<div class="esnek sar" style="width:100%;gap:8px">
        <button class="dg-btn b-sade b-kucuk buyu" data-eylem="karar-ver" data-id="${k.id}" data-karar="vazgecildi">Şimdiden vazgeçtim</button>
        <button class="sil-btn" data-eylem="karar-sil" data-id="${k.id}">✕</button>
      </div>`}
    </div>`;
  }).join(''), { ikon: '◷', yan: liste.length + ' kalem' });
}

/* ---------- geçmiş ---------- */

function gecmis() {
  const vazgecilen = durum.kararlar.filter(k => k.durum === 'vazgecildi').reverse();
  const alinan = durum.kararlar.filter(k => k.durum === 'alindi').reverse();

  if (!vazgecilen.length && !alinan.length) return '';

  return `<div class="izgara iz-2 ust-16">
    ${kart('Vazgeçtiklerin', vazgecilen.length ? vazgecilen.slice(0, 12).map(k => `
      <div class="oge">
        <div class="im" style="background:var(--em-dim);color:var(--em)">✓</div>
        <div class="gvd"><div class="ad">${kac(k.ad)}</div>
          <div class="ayr">${k.karar ? tarihKisa(new Date(k.karar).toISOString().slice(0, 10)) : ''}</div></div>
        <div class="sag"><div class="tut r-em">+${tl(k.fiyat)}</div></div>
        <button class="sil-btn" data-eylem="karar-geri" data-id="${k.id}" title="Geri al">↩</button>
      </div>`).join('')
      : bos('Henüz yok', 'İlk "vazgeçtim"de burada para birikmeye başlar.', '✓'),
      { ikon: '✓', yan: vazgecilen.length ? tl(vazgecilen.reduce((a, k) => a + k.fiyat, 0)) : '' })}

    ${kart('Aldıkların', alinan.length ? alinan.slice(0, 12).map(k => `
      <div class="oge" style="align-items:flex-start">
        <div class="im">◉</div>
        <div class="gvd">
          <div class="ad">${kac(k.ad)}</div>
          <div class="ayr esnek sar" style="gap:6px;margin-top:4px">
            <span class="mini r-faint">Pişman mıyım?</span>
            <button class="dg-btn b-mini ${k.pisman === true ? 'b-tehli' : 'b-cizgi'}" data-eylem="karar-pisman" data-id="${k.id}" data-deger="1">Evet</button>
            <button class="dg-btn b-mini ${k.pisman === false ? 'b-iyi' : 'b-cizgi'}" data-eylem="karar-pisman" data-id="${k.id}" data-deger="0">Hayır</button>
          </div>
        </div>
        <div class="sag"><div class="tut">${tl(k.fiyat)}</div></div>
      </div>`).join('')
      : bos('Henüz yok', 'Aldığın şeyleri işaretlemek, sonradan pişmanlık desenini görmeni sağlar.', '◉'),
      { ikon: '◉' })}
  </div>`;
}

/* ---------- tuzaklar ---------- */

function tuzaklar() {
  const t = [
    ['◱', 'Yapay kıtlık', '"Son 2 ürün", geri sayım, "kampanya bitiyor". Paniğe değil plana göre al.'],
    ['◇', 'Referans fiyat', 'Üstü çizili yüksek fiyat, indirimli fiyatı ucuz gösterir. Gerçek soru: bu ürün bu paraya değer mi?'],
    ['◈', 'Ücretsiz kargo eşiği', '50 TL kargodan kaçmak için 200 TL\'lik gereksiz ürün eklersin. En etkili tuzak budur.'],
    ['▤', 'Taksit', 'Fiyatı küçültmez, acıyı böler. 12 taksit, 12 ay boyunca gelecekteki gelirini ipotek eder.'],
    ['⟳', 'Abonelik sızıntısı', 'Tek tek küçük, toplamda büyük. Ayda 300 TL\'lik altı abonelik yılda 21.600 TL eder.'],
    ['◉', 'Tek tıkla al', 'Kayıtlı kart + tek tık, düşünme ile alım arasını sıfırlar. Kartı kaydetme.']
  ];
  const i = [
    ['◷', '24–72 saat kuralı', 'İstekleri beklet; çoğu heves birkaç günde söner. Bu araç bunu senin için sayar.'],
    ['◔', 'Saat cinsinden düşün', '"Kaç saat çalışmama mal olur?" Karar netleşir.'],
    ['◇', 'Önce kendine öde', 'Gelir gelince birikimi ayır, kalanla yaşa. Ters sırayla hiç biriktiremezsin.'],
    ['◱', 'Liste ile alışveriş', 'Listeyi mağazada değil evde yap. Listede olmayanı alma.'],
    ['◈', 'Birim fiyata bak', '"Büyük paket her zaman ucuzdur" doğru değildir. Kilogram/litre fiyatını karşılaştır.'],
    ['◌', 'Aç karnına markete girme', 'Ölçülmüş ve tekrarlanan bir etki: sepet büyür.']
  ];

  const izgara = (liste, renk) => `<div class="izgara iz-3">${liste.map(([ik, bas, met]) => `
    <div class="oge" style="flex-direction:column;align-items:flex-start;gap:5px">
      <div class="ad r-${renk}">${ik} ${kac(bas)}</div>
      <div class="ayr" style="line-height:1.6">${kac(met)}</div>
    </div>`).join('')}</div>`;

  return kart('Seni daha çok harcatan tuzaklar', izgara(t, 'red'), { ikon: '◬' })
    + kart('İşe yarayan alışkanlıklar', izgara(i, 'em'), { ikon: '◈' });
}

/* ============================================================
   Eylemler
   ============================================================ */

let secilenTur = 'istek';

eylemKaydet('karar-tur', ({ tur }, e, oge) => {
  secilenTur = tur;
  oge.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('aktif', b === oge));
});

eylemKaydet('karar-onizle', ({ deger }) => {
  const k = document.getElementById('kararOnizleme');
  if (k) k.innerHTML = onizleme(sayiOku(deger));
});

eylemKaydet('karar-ekle', () => {
  const ad = (document.getElementById('kararAd')?.value || '').trim();
  const fiyat = sayiOku(document.getElementById('kararFiyat')?.value);
  const gun = Number(document.getElementById('kararGun')?.value) || 0;

  if (!ad || fiyat <= 0) { bildir('Ürün adı ve fiyat gerekli.', 'hata'); return; }

  ekle('kararlar', {
    ad, fiyat, tur: secilenTur, durum: 'bekliyor',
    olusturma: Date.now(), kararTarihi: Date.now() + gun * GUN,
    karar: null, pisman: null
  }, 'k');

  document.getElementById('kararAd').value = '';
  document.getElementById('kararFiyat').value = '';
  const o = document.getElementById('kararOnizleme');
  if (o) o.innerHTML = '';

  bildir(gun > 0
    ? `Eklendi. ${gun} gün bekle — çoğu istek o süreyi geçemez.`
    : 'Eklendi. Karar senin.');
});

eylemKaydet('karar-ver', async ({ id, karar }) => {
  const k = bul('kararlar', id);
  if (!k) return;

  if (karar === 'alindi' && Date.now() < (k.kararTarihi || 0)) {
    const ok = await onayla('Süre dolmadı',
      `<b>${kac(k.ad)}</b> için bekleme süresi henüz dolmadı.
       Biraz daha beklemek isteyebilirsin — çoğu heves bu sürede söner. Yine de almak istiyor musun?`,
      'Evet, aldım');
    if (!ok) return;
  }

  guncelle('kararlar', id, { durum: karar, karar: Date.now() });

  if (karar === 'vazgecildi') {
    const saat = H.saateCevir(k.fiyat);
    bildir(`${tl(k.fiyat)} cebinde kaldı${saat ? ` — ${n(saat, 1)} saat çalışman` : ''}.`);
  } else {
    bildir('Kaydedildi. Birkaç hafta sonra "pişman mıyım?" sorusunu işaretlemeyi unutma.', 'bilgi');
  }
});

eylemKaydet('karar-geri', ({ id }) => {
  guncelle('kararlar', id, { durum: 'bekliyor', karar: null, pisman: null });
  bildir('Bekleme listesine geri alındı.', 'bilgi');
});

eylemKaydet('karar-pisman', ({ id, deger }) => {
  guncelle('kararlar', id, { pisman: deger === '1' });
});

eylemKaydet('karar-sil', async ({ id }) => {
  const k = bul('kararlar', id);
  if (k && await onayla('Kaydı sil', `<b>${kac(k.ad)}</b> silinsin mi?`, 'Sil', true)) { sil('kararlar', id); bildir('Silindi.', 'bilgi'); }
});
