/* Mutfak Ekonomisi — evde hazırlamanın gerçek maliyeti. */

import { durum, kaydet, ekle, guncelle, sil, bul } from '../core/store.js';
import * as H from '../core/hesap.js';
import { tl, tlKisa, n, yuzde, kac, sayiOku, kimlik } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, senaryoEtiketi, eylemKaydet, bildir, modalAc, formOku, onayla, alan, girdi } from '../core/ui.js';
import * as G from '../core/chart.js';

export const mutfakGorunum = {
  ad: 'mutfak', ikon: '◲', etiket: 'Mutfak',
  baslik: 'Mutfak Ekonomisi',
  alt: '"Evde yapmak daha ucuz" bir slogan değil, hesaplanabilir bir şeydir. Amaç dışarıda hiç yememek değil — bunun bir seçim olması.',

  ciz() {
    const o = H.mutfakOzeti();
    return ozet(o) + tarifListesi(o) + dersKart();
  }
};

function ozet(o) {
  if (!o.tarifSayisi) return '';
  const saat = H.saateCevir(o.yillikFark);
  const gelir = H.aylikGelir();

  return `<div class="izgara iz-4 alt-16">
    ${dosem({ etiket: 'Tarif sayısı', deger: String(o.tarifSayisi), ikon: '◲' })}
    ${dosem({ etiket: 'Aylık fark', deger: o.aylikFark > 0 ? tl(o.aylikFark) : '—', ipucu: 'evde yapmanın kazandırdığı', renk: 'r-em', ikon: '◔' })}
    ${dosem({ etiket: 'Yıllık fark', deger: o.yillikFark > 0 ? tl(o.yillikFark) : '—', ipucu: saat ? `≈ ${n(saat)} saat çalışman` : '', renk: 'r-em', vurgu: 'iyi', ikon: '∑' })}
    ${dosem({
      etiket: 'Gelirine oranı', deger: gelir > 0 && o.aylikFark > 0 ? yuzde(o.aylikFark / gelir * 100, 1) : '—',
      ipucu: 'aylık gelirinin bu kadarı', renk: 'r-gold', ikon: '◇'
    })}
  </div>`;
}

function tarifListesi(o) {
  if (!o.tarifSayisi) {
    return kart('Tariflerin', bos(
      'Tarif eklenmedi',
      'Sık yaptığın bir yemeği ekle: malzemelerin fiyatını gir, kaç porsiyon çıktığını yaz, dışarıda kaça yediğini karşılaştır.',
      '◲'
    ) + `<div class="merkez ust-12"><button class="dg-btn b-ana b-kucuk" data-eylem="tarif-ekle">＋ Tarif ekle</button></div>`,
      { ikon: '◲' });
  }

  const govde = o.tarifler.map(t => {
    const h = t.hesap;
    return `<div class="oge" style="align-items:flex-start;flex-direction:column;gap:10px">
      <div class="esnek-ara" style="width:100%">
        <div>
          <div class="ad">${kac(t.ad)}
            ${h.katsayi ? rozet(`dışarısı ${n(h.katsayi, 1)}× pahalı`, h.katsayi >= 2 ? 'red' : 'amber') : ''}</div>
          <div class="ayr">${h.porsiyon} porsiyon · ${(t.malzemeler || []).length} malzeme${h.haftalik ? ` · haftada ${h.haftalik} kez` : ''}</div>
        </div>
        <div style="display:flex;gap:2px">
          <button class="sil-btn" data-eylem="tarif-duzenle" data-id="${t.id}">✎</button>
          <button class="sil-btn" data-eylem="tarif-sil" data-id="${t.id}">✕</button>
        </div>
      </div>

      <div class="izgara iz-4" style="width:100%;gap:8px">
        ${dosem({ etiket: 'Malzeme toplamı', deger: tl(h.malzeme, 2) })}
        ${dosem({ etiket: 'Porsiyon · evde', deger: tl(h.evde, 2), renk: 'r-em' })}
        ${dosem({ etiket: 'Porsiyon · dışarıda', deger: h.disari > 0 ? tl(h.disari, 2) : '—', renk: 'r-red' })}
        ${dosem({ etiket: 'Porsiyon farkı', deger: h.fark !== null ? tl(h.fark, 2) : '—', renk: 'r-gold' })}
      </div>

      ${h.fark !== null && h.haftalik > 0 ? `
        <div style="width:100%">
          ${G.ikiliKarsilastir(
            { ad: 'Yılda dışarıda', deger: h.disari * h.haftalik * 52, renk: 'var(--red)', alt: `haftada ${h.haftalik} kez × 52 hafta` },
            { ad: 'Yılda evde', deger: h.evde * h.haftalik * 52, renk: 'var(--em)', alt: `yıllık fark: ${tl(h.yillikFark)}` }
          )}
        </div>` : ''}
    </div>`;
  }).join('');

  return kart('Tariflerin', govde
    + `<div class="ust-12"><button class="dg-btn b-cizgi b-kucuk b-tam" data-eylem="tarif-ekle">＋ Tarif ekle</button></div>`
    + (o.yillikFark > 0 ? `<div class="ust-12">${notKutu('iyi',
      `Bu tarifleri planladığın sıklıkta evde yaparsan yılda <b>${tl(o.yillikFark)}</b> fark ediyor.
       Asıl mesele tek öğün değil <b>tekrardır</b>: haftada 5 öğünlük bir fark, yılda 260 öğün eder.`)}</div>` : '')
    + (o.yillikFark > 0 ? senaryoEtiketi('Girdiğin sıklık ve fiyatların yıl boyu sabit kaldığı varsayıldı.') : ''),
    { ikon: '◲' });
}

function dersKart() {
  return kart('Neden bu kadar fark ediyor', `
    <div class="izgara iz-3">
      <div class="oge" style="flex-direction:column;align-items:flex-start;gap:6px">
        <div class="ad">◱ Fiyatın içindekiler</div>
        <div class="ayr" style="line-height:1.6">Dışarıda ödediğin fiyat sadece malzemeyi değil kirayı, personeli,
          vergiyi ve kârı da içerir. Bu yüzden fark genellikle <b>katlar</b> düzeyindedir, yüzdeler değil.</div>
      </div>
      <div class="oge" style="flex-direction:column;align-items:flex-start;gap:6px">
        <div class="ad">⟳ Toplu pişirme</div>
        <div class="ayr" style="line-height:1.6">Birim maliyeti düşürür ama asıl faydası başka: yorgun günlerde
          "sipariş verelim" refleksini engeller. Gerçek tasarruf oradadır.</div>
      </div>
      <div class="oge" style="flex-direction:column;align-items:flex-start;gap:6px">
        <div class="ad">◇ Görünmeyen gider</div>
        <div class="ayr" style="line-height:1.6">Çöpe giden her ürün, ödediğin ama tüketmediğin paradır.
          Menüyü önce yaz, alışveriş listesi menüden çıksın — tersi değil.</div>
      </div>
    </div>
    <div class="ust-12">${notKutu('bilgi',
      `Bu hesaba enerji ve zaman maliyetini eklemedik — malzeme kalemi tek başına farkın büyük kısmını açıklar.
       Kendi zamanına bir değer biçmek istersen, Nakit Akışı ekranındaki saat ücretini kullanabilirsin.`)}</div>`,
    { ikon: '◈' });
}

/* ============================================================
   Eylemler
   ============================================================ */

function tarifFormu(t = null) {
  const malz = t?.malzemeler?.length ? t.malzemeler : [{ ad: '', tutar: '' }];

  const satirHtml = m => `
    <div class="satir s-21 malz-satir" style="margin-bottom:8px">
      <input type="text" class="m-ad" value="${kac(m.ad || '')}" placeholder="Malzeme">
      <div style="display:flex;gap:6px">
        <input type="text" class="m-tutar" value="${kac(m.tutar || '')}" placeholder="₺" inputmode="decimal">
        <button class="sil-btn" data-malz-sil type="button">✕</button>
      </div>
    </div>`;

  const m = modalAc({
    baslik: t ? 'Tarifi düzenle' : 'Tarif ekle',
    genislik: '600px',
    govde: `
      <div class="satir s-21">
        ${alan('Yemeğin adı', girdi('ad', { deger: t?.ad || '', yer: 'Mercimek çorbası' }))}
        ${alan('Kaç porsiyon çıkıyor', girdi('porsiyon', { tur: 'number', deger: t?.porsiyon || 4, ek: 'min="1"' }))}
      </div>

      <div class="alan"><span class="et">Malzemeler ve fiyatları</span>
        <div id="malzKap">${malz.map(satirHtml).join('')}</div>
        <button class="dg-btn b-cizgi b-mini" type="button" data-malz-ekle>＋ Malzeme ekle</button>
      </div>

      <div class="satir s-2">
        ${alan('Dışarıda porsiyon fiyatı (₺)', girdi('disariFiyat', { deger: t?.disariFiyat || '', yer: '320' }), 'lokanta/sipariş')}
        ${alan('Haftada kaç kez yiyorsun', girdi('haftalikSiklik', { tur: 'number', deger: t?.haftalikSiklik || 2, ek: 'min="0" max="21"' }))}
      </div>

      ${notKutu('bilgi', 'Malzeme fiyatlarını <b>kullandığın kadarıyla</b> gir: 1 kg pirincin 200 gramını kullandıysan, 1 kg fiyatının beşte birini yaz.')}`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          if (!f.ad.trim()) { bildir('Yemek adı gerekli.', 'hata'); return false; }
          const malzemeler = [...kok.querySelectorAll('.malz-satir')].map(s => ({
            ad: s.querySelector('.m-ad').value.trim(),
            tutar: sayiOku(s.querySelector('.m-tutar').value)
          })).filter(x => x.ad || x.tutar > 0);
          if (!malzemeler.length) { bildir('En az bir malzeme gir.', 'hata'); return false; }

          const veri = {
            ad: f.ad.trim(), porsiyon: Number(f.porsiyon) || 1, malzemeler,
            disariFiyat: sayiOku(f.disariFiyat) || null,
            haftalikSiklik: Number(f.haftalikSiklik) || 0
          };
          if (t) guncelle('tarifler', t.id, veri); else ekle('tarifler', veri, 't');
          bildir('Kaydedildi.');
        }
      }
    ]
  });

  // malzeme satırı ekle / sil
  m.addEventListener('click', e => {
    if (e.target.closest('[data-malz-ekle]')) {
      e.preventDefault();
      const kap = m.querySelector('#malzKap');
      kap.insertAdjacentHTML('beforeend', satirHtml({ ad: '', tutar: '' }));
      kap.lastElementChild.querySelector('.m-ad').focus();
    }
    if (e.target.closest('[data-malz-sil]')) {
      e.preventDefault();
      const satirlar = m.querySelectorAll('.malz-satir');
      if (satirlar.length > 1) e.target.closest('.malz-satir').remove();
    }
  });
}

eylemKaydet('tarif-ekle', () => tarifFormu());
eylemKaydet('tarif-duzenle', ({ id }) => tarifFormu(bul('tarifler', id)));
eylemKaydet('tarif-sil', async ({ id }) => {
  const t = bul('tarifler', id);
  if (t && await onayla('Tarifi sil', `<b>${kac(t.ad)}</b> silinsin mi?`, 'Sil', true)) { sil('tarifler', id); bildir('Silindi.', 'bilgi'); }
});
