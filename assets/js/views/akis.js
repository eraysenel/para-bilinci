/* Nakit Akışı — hane, gelir, sabit gider, harcama kayıtları. */

import { durum, kaydet, ekle, guncelle, sil, bul } from '../core/store.js';
import * as H from '../core/hesap.js';
import { tl, tlKisa, n, yuzde, tarihKisa, tarihUzun, bugun, buAy, ayKisa, ayAdi, ayEkle, kac, sayiOku } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, eylemKaydet, bildir, modalAc, formOku, onayla, alan, girdi, secim } from '../core/ui.js';
import * as G from '../core/chart.js';
import { KATEGORILER, KATEGORI_RENK, KATEGORI_IKON, SABIT_TURLER, KESINTI_SECENEK, GELIR_TURLER } from '../core/sabitler.js';

export const akisGorunum = {
  ad: 'akis', ikon: '◑', etiket: 'Nakit Akışı',
  baslik: 'Nakit Akışı',
  alt: 'Para nereden geliyor, nereye gidiyor. Gelir ile gider arasındaki açıklık, gelirin kendisinden önemlidir.',

  ciz() {
    return ozetKart() + selaleKart()
      + `<div class="izgara iz-2 ust-16">${gelirKart()}${sabitKart()}</div>`
      + haneKart()
      + harcamaKart()
      + trendKart();
  }
};

/* ---------- özet ---------- */

function ozetKart() {
  const gelir = H.aylikGelir();
  const sabit = H.aylikSabit();
  const borc = H.aylikBorcYuku();
  const degisken = H.ortalamaDegiskenHarcama();
  const saat = H.saatUcreti();

  const kalan = gelir - sabit - borc - (degisken || 0);
  const oran = gelir > 0 ? kalan / gelir * 100 : null;

  return `<div class="izgara iz-4 alt-16">
    ${dosem({ etiket: 'Aylık net gelir', deger: gelir > 0 ? tl(gelir) : '—', ipucu: gelir > 0 ? durum.gelirler.filter(g => g.aktif !== false).length + ' kalem' : 'gelir ekle', renk: 'r-em', ikon: '↙' })}
    ${dosem({ etiket: 'Sabit gider', deger: sabit > 0 ? tl(sabit) : '—', ipucu: gelir > 0 && sabit > 0 ? `gelirin %${(sabit / gelir * 100).toFixed(0)}'i` : 'sabit gider ekle', renk: 'r-amber', ikon: '↗' })}
    ${dosem({ etiket: 'Borç / taksit yükü', deger: borc > 0 ? tl(borc) : '—', ipucu: gelir > 0 && borc > 0 ? `gelirin %${(borc / gelir * 100).toFixed(0)}'i` : 'borç yok', renk: borc > 0 ? 'r-red' : 'r-muted', ikon: '◧' })}
    ${dosem({
      etiket: 'Aylık artan', deger: gelir > 0 ? tl(kalan) : '—',
      ipucu: oran !== null ? `gelirin %${oran.toFixed(0)}'i${degisken === null ? ' (değişken gider hariç)' : ''}` : '',
      renk: kalan >= 0 ? 'r-gold' : 'r-red', vurgu: gelir > 0 ? (kalan >= 0 ? 'vurgu' : 'kotu') : '', ikon: '◇'
    })}
  </div>
  ${saat ? `<div class="not-kutu nk-notr alt-16"><span class="im">◷</span><div>
    Saat ücretin <b>${tl(saat, 2)}</b>. Bu araç her fiyatı buna göre saate çevirir —
    <span class="r-muted">${durum.hane.calismaSaati} saat/ay üzerinden.</span>
  </div></div>` : ''}`;
}

/* ---------- şelale ---------- */

function selaleKart() {
  const gelir = H.aylikGelir();
  if (gelir <= 0) return '';

  const sabit = H.aylikSabit();
  const borc = H.aylikBorcYuku();
  const degisken = H.ortalamaDegiskenHarcama() || 0;

  const veri = [
    { ad: 'Net gelir', deger: gelir, tur: 'baslangic' },
    { ad: 'Sabit gider', deger: -sabit, tur: 'azalis' },
    { ad: 'Borç / taksit', deger: -borc, tur: 'azalis' },
    { ad: 'Değişken harcama', deger: -degisken, tur: 'azalis' },
    { ad: 'Kalan', deger: gelir - sabit - borc - degisken, tur: 'toplam' }
  ];

  return kart('Ayın akışı', `<div class="grafik">${G.selale(veri, { yukseklik: 210 })}</div>
    ${degisken === 0 ? notKutu('bilgi', 'Değişken harcama ortalaması için en az bir tam ayın harcama kaydı gerekiyor. Harcama girdikçe bu grafik gerçekleşene yaklaşır.') : ''}`,
    { ikon: '◑', yan: degisken > 0 ? 'değişken: son 3 ay ortalaması' : '' });
}

/* ---------- gelirler ---------- */

function gelirKart() {
  const liste = durum.gelirler;
  const govde = liste.length ? liste.map(g => `
    <div class="oge ${g.aktif === false ? 'bitti' : ''}">
      <div class="im" style="background:var(--em-dim);color:var(--em)">↙</div>
      <div class="gvd">
        <div class="ad">${kac(g.ad)}${g.aktif === false ? rozet('pasif', 'notr') : ''}</div>
        <div class="ayr">${kac((GELIR_TURLER.find(t => t.deger === g.tur) || {}).ad || 'Gelir')}${g.gun ? ` · her ayın ${g.gun}'i` : ''}</div>
      </div>
      <div class="sag"><div class="tut r-em">${tl(g.tutar)}</div></div>
      <button class="sil-btn" data-eylem="gelir-duzenle" data-id="${g.id}" title="Düzenle">✎</button>
      <button class="sil-btn" data-eylem="gelir-sil" data-id="${g.id}" title="Sil">✕</button>
    </div>`).join('')
    : bos('Gelir eklenmedi', 'Maaşını ve varsa diğer gelirlerini ekle. Ödeme gününü girmen, güvenli günlük hesabını çok daha doğru yapar.', '↙');

  return kart('Gelirler', govde + `<div class="ust-12"><button class="dg-btn b-iyi b-kucuk b-tam" data-eylem="gelir-ekle">＋ Gelir ekle</button></div>`,
    { ikon: '↙', yan: liste.length ? tl(H.aylikGelir()) : '' });
}

/* ---------- sabit giderler ---------- */

function sabitKart() {
  const liste = [...durum.sabitler].sort((a, b) => (a.gun || 1) - (b.gun || 1));
  const govde = liste.length ? liste.map(s => `
    <div class="oge ${s.aktif === false ? 'bitti' : ''}">
      <div class="im" style="background:var(--amber-dim);color:var(--amber)">${KATEGORI_IKON[s.kategori] || '◳'}</div>
      <div class="gvd">
        <div class="ad">${kac(s.ad)}${s.otomatik ? rozet('otomatik', 'teal') : ''}${s.aktif === false ? rozet('pasif', 'notr') : ''}</div>
        <div class="ayr">her ayın ${s.gun || 1}'i · ${kac((SABIT_TURLER.find(t => t.deger === s.tur) || {}).ad || 'Gider')}</div>
      </div>
      <div class="sag"><div class="tut r-amber">${tl(s.tutar)}</div></div>
      <button class="sil-btn" data-eylem="sabit-duzenle" data-id="${s.id}" title="Düzenle">✎</button>
      <button class="sil-btn" data-eylem="sabit-sil" data-id="${s.id}" title="Sil">✕</button>
    </div>`).join('')
    : bos('Sabit gider eklenmedi', 'Kira, faturalar, abonelikler… Bunlar her ay tekrar ettiği için bütçenin en güçlü kaldıracıdır.', '◳');

  const abonelik = liste.filter(s => s.tur === 'abonelik' && s.aktif !== false);
  const abToplam = abonelik.reduce((a, s) => a + (Number(s.tutar) || 0), 0);

  return kart('Sabit giderler', govde
    + (abToplam > 0 ? `<div class="ust-12">${notKutu('uyari', `<b>${abonelik.length} abonelik</b> ayda ${tl(abToplam)}, yılda <b>${tl(abToplam * 12)}</b> ediyor. Son 30 günde kullanmadığın varsa dondur.`)}</div>` : '')
    + `<div class="ust-12"><button class="dg-btn b-cizgi b-kucuk b-tam" data-eylem="sabit-ekle">＋ Sabit gider ekle</button></div>`,
    { ikon: '◳', yan: liste.length ? tl(H.aylikSabit()) : '' });
}

/* ---------- hane ---------- */

function haneKart() {
  const h = durum.hane;
  const kisi = H.haneKisi();
  const gelir = H.aylikGelir();
  const af = H.acilFonAyHedefi();

  return kart('Hane', `
    <div class="satir s-4 alt-12">
      ${alan('Yetişkin', girdi('yetiskin', { tur: 'number', deger: h.yetiskin, ek: 'min="1" max="20" data-degisti="hane-degis" data-alan="yetiskin"' }))}
      ${alan('Çocuk', girdi('cocuk', { tur: 'number', deger: h.cocuk, ek: 'min="0" max="20" data-degisti="hane-degis" data-alan="cocuk"' }))}
      ${alan('Ayrıca baktığın kişi', girdi('bakmaklaYukumlu', { tur: 'number', deger: h.bakmaklaYukumlu, ek: 'min="0" max="20" data-degisti="hane-degis" data-alan="bakmaklaYukumlu"' }), 'hane dışı')}
      ${alan('Gelir getiren kişi', girdi('gelirSayisi', { tur: 'number', deger: h.gelirSayisi, ek: 'min="1" max="10" data-degisti="hane-degis" data-alan="gelirSayisi"' }))}
    </div>
    <div class="satir s-2">
      ${alan('Aylık çalışma saatin', girdi('calismaSaati', { tur: 'number', deger: h.calismaSaati, ek: 'min="1" max="400" data-degisti="hane-degis" data-alan="calismaSaati"' }), 'saat ücreti için')}
      <div class="alan"><span class="et">Kişi başı aylık gelir</span>
        <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--line-soft);border-radius:10px;font-weight:700" class="num">
          ${gelir > 0 ? tl(gelir / kisi) : '—'}</div></div>
    </div>
    ${notKutu('bilgi', `Hanede <b>${kisi} kişi</b> var. Bu sayı acil fon hedefini belirler:
      <b>${af.ay} aylık</b> zorunlu gider. ${kac(af.gerekce)}`)}`,
    { ikon: '⌂', not: 'Kaç kişiye baktığın bütçenin matematiğini değiştirir: sabit giderler paylaşılır ama market, sağlık ve giyim kişiyle çarpılır.' });
}

/* ---------- harcamalar ---------- */

function harcamaKart() {
  const ay = buAy();
  const liste = [...H.ayinHarcamalari(ay)].sort((a, b) => (b.tarih + b.id).localeCompare(a.tarih + a.id));
  const toplam = liste.reduce((a, h) => a + (Number(h.tutar) || 0), 0);
  const gg = H.gunlukGuvenli();

  const tablo = liste.length ? `
    <div class="tablo-sar"><table class="veri">
      <thead><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th><th class="num">Tutar</th><th class="dar"></th></tr></thead>
      <tbody>${liste.slice(0, 40).map(h => `
        <tr><td class="r-muted mini">${tarihKisa(h.tarih)}</td>
          <td>${kac(h.ad)}</td>
          <td><span class="rozet rz-notr">${KATEGORI_IKON[h.kategori] || '○'} ${kac(h.kategori)}</span></td>
          <td class="num">${tl(h.tutar)}</td>
          <td class="dar"><button class="sil-btn" data-eylem="harcama-sil" data-id="${h.id}">✕</button></td></tr>`).join('')}
      </tbody></table></div>
    ${liste.length > 40 ? `<div class="merkez mini r-faint ust-8">İlk 40 kayıt gösteriliyor (toplam ${liste.length}).</div>` : ''}`
    : bos('Bu ay harcama yok', 'Görülmeyen harcama yönetilemez. Küçük olanları da gir — asıl fark orada çıkar.', '◱');

  return kart(`${ayAdi(ay)} harcamaları`, `
    <div class="dg-grup alt-12">
      <button class="dg-btn b-ana b-kucuk" data-eylem="harcama-ekle">＋ Harcama ekle</button>
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="csv-indir">↓ CSV</button>
    </div>
    ${toplam > 0 ? `<div class="izgara iz-3 alt-12">
      ${dosem({ etiket: 'Ay toplamı', deger: tl(toplam), ikon: '∑' })}
      ${dosem({ etiket: 'Kayıt sayısı', deger: String(liste.length), ipucu: 'ne kadar çok, o kadar net', ikon: '#' })}
      ${dosem({ etiket: 'Günlük ortalama', deger: tl(toplam / new Date().getDate()), ipucu: gg.gunluk > 0 ? `güvenli pay: ${tl(gg.gunluk)}` : '', renk: gg.gunluk > 0 && toplam / new Date().getDate() > gg.gunluk ? 'r-red' : 'r-em', ikon: '◐' })}
    </div>` : ''}
    ${toplam > 0 ? `<div class="alt-16">${G.takvim(
      Object.fromEntries(liste.map(h => [h.tarih, 0]).map(([t]) => [t, H.gunToplamHarcama(t)])),
      ay, { esik: gg.gunluk > 0 ? gg.gunluk : 0 })}
      <div class="mini r-faint merkez ust-8">Yeşil = günlük payın altında · Kırmızı = aştığın gün</div></div>` : ''}
    ${tablo}`, { ikon: '◱', yan: toplam > 0 ? tl(toplam) : '' });
}

/* ---------- trend ---------- */

function trendKart() {
  const seri = H.aylikHarcamaSerisi(6);
  if (seri.filter(s => s.toplam > 0).length < 2) return '';

  const gelir = H.aylikGelir();
  const noktalar = seri.map(s => ({ etiket: ayKisa(s.ay), deger: s.toplam }));

  return kart('Son 6 ay', `
    <div class="grafik">${G.sutun(noktalar, {
      yukseklik: 180, esik: gelir > 0 ? gelir : null, esikEtiket: gelir > 0 ? 'aylık gelir' : ''
    })}</div>
    ${(() => {
      const dolu = seri.filter(s => s.toplam > 0);
      const ort = dolu.reduce((a, s) => a + s.toplam, 0) / dolu.length;
      const son = seri[seri.length - 1].toplam;
      const fark = ort > 0 ? (son / ort - 1) * 100 : 0;
      return `<div class="kucuk ust-12" style="color:var(--ink-2)">
        Aylık ortalaman <b>${tl(ort)}</b>. Bu ay şu ana kadar <b>${tl(son)}</b> —
        ortalamaya göre <b class="${fark > 0 ? 'r-amber' : 'r-em'}">${fark > 0 ? '+' : ''}${fark.toFixed(0)}%</b>.
        <span class="r-faint">Ay bitmediği için bu karşılaştırma ay sonunda anlam kazanır.</span></div>`;
    })()}`, { ikon: '◰' });
}

/* ============================================================
   Eylemler
   ============================================================ */

/* --- harcama --- */
eylemKaydet('harcama-ekle', () => {
  modalAc({
    baslik: 'Harcama ekle',
    govde: `
      <div class="satir s-21">
        ${alan('Açıklama', girdi('ad', { yer: 'market alışverişi' }))}
        ${alan('Tutar (₺)', girdi('tutar', { yer: '450' }))}
      </div>
      <div class="satir s-2">
        ${alan('Kategori', secim('kategori', KATEGORILER, 'Market'))}
        ${alan('Tarih', girdi('tarih', { tur: 'date', deger: bugun() }))}
      </div>
      <div id="saatIpucu" class="mini r-faint"></div>`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const tutar = sayiOku(f.tutar);
          if (!f.ad.trim() || tutar <= 0) { bildir('Açıklama ve tutar gerekli.', 'hata'); return false; }
          ekle('harcamalar', { ad: f.ad.trim(), tutar, kategori: f.kategori, tarih: f.tarih || bugun() }, 'h');
          const saat = H.saateCevir(tutar);
          bildir(`Kaydedildi.${saat ? ` ≈ ${saat.toFixed(1)} saat çalışman.` : ''}`);
        }
      }
    ]
  });
});

eylemKaydet('harcama-sil', async ({ id }) => {
  const h = bul('harcamalar', id);
  if (!h) return;
  if (await onayla('Harcamayı sil', `<b>${kac(h.ad)}</b> — ${tl(h.tutar)} kaydı silinsin mi?`, 'Sil', true)) {
    sil('harcamalar', id);
    bildir('Silindi.', 'bilgi');
  }
});

/* --- gelir --- */
function gelirFormu(g = null) {
  modalAc({
    baslik: g ? 'Geliri düzenle' : 'Gelir ekle',
    govde: `
      <div class="satir s-21">
        ${alan('Adı', girdi('ad', { deger: g?.ad || '', yer: 'Maaş' }))}
        ${alan('Aylık net tutar (₺)', girdi('tutar', { deger: g?.tutar || '', yer: '42000' }))}
      </div>
      <div class="satir s-2">
        ${alan('Tür', secim('tur', GELIR_TURLER, g?.tur || 'maas'))}
        ${alan('Ödeme günü', girdi('gun', { tur: 'number', deger: g?.gun || 15, ek: 'min="1" max="31"' }), 'ayın kaçı')}
      </div>
      <label class="esnek kucuk" style="margin-top:6px;cursor:pointer">
        <input type="checkbox" name="aktif" ${g?.aktif !== false ? 'checked' : ''} style="width:auto">
        <span>Bu gelir şu anda aktif</span></label>
      <div class="ust-12">${notKutu('bilgi', 'Ödeme gününü girmen önemli: güvenli günlük harcama, bir sonraki gelirine kadar geçen süreye göre hesaplanır.')}</div>`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const tutar = sayiOku(f.tutar);
          if (!f.ad.trim() || tutar <= 0) { bildir('Ad ve tutar gerekli.', 'hata'); return false; }
          const veri = { ad: f.ad.trim(), tutar, tur: f.tur, gun: Number(f.gun) || 1, aktif: !!f.aktif };
          if (g) guncelle('gelirler', g.id, veri); else ekle('gelirler', veri, 'g');
          bildir('Kaydedildi.');
        }
      }
    ]
  });
}
eylemKaydet('gelir-ekle', () => gelirFormu());
eylemKaydet('gelir-duzenle', ({ id }) => gelirFormu(bul('gelirler', id)));
eylemKaydet('gelir-sil', async ({ id }) => {
  const g = bul('gelirler', id);
  if (g && await onayla('Geliri sil', `<b>${kac(g.ad)}</b> silinsin mi?`, 'Sil', true)) { sil('gelirler', id); bildir('Silindi.', 'bilgi'); }
});

/* --- sabit gider --- */
function sabitFormu(s = null) {
  modalAc({
    baslik: s ? 'Sabit gideri düzenle' : 'Sabit gider ekle',
    govde: `
      <div class="satir s-21">
        ${alan('Adı', girdi('ad', { deger: s?.ad || '', yer: 'Elektrik faturası' }))}
        ${alan('Aylık tutar (₺)', girdi('tutar', { deger: s?.tutar || '', yer: '1800' }))}
      </div>
      <div class="satir s-3">
        ${alan('Tür', secim('tur', SABIT_TURLER, s?.tur || 'fatura'))}
        ${alan('Kategori', secim('kategori', KATEGORILER, s?.kategori || 'Fatura'))}
        ${alan('Ödeme günü', girdi('gun', { tur: 'number', deger: s?.gun || 1, ek: 'min="1" max="31"' }))}
      </div>
      ${alan('Ödenmezse ne olur?', secim('kesintiRiski', KESINTI_SECENEK, String(s?.kesintiRiski ?? 5)), 'öncelik hesabında kullanılır')}
      <div class="esnek sar ust-8">
        <label class="esnek kucuk" style="cursor:pointer">
          <input type="checkbox" name="otomatik" ${s?.otomatik ? 'checked' : ''} style="width:auto">
          <span>Otomatik ödeme talimatı var</span></label>
        <label class="esnek kucuk" style="cursor:pointer;margin-left:14px">
          <input type="checkbox" name="aktif" ${s?.aktif !== false ? 'checked' : ''} style="width:auto">
          <span>Aktif</span></label>
      </div>`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const tutar = sayiOku(f.tutar);
          if (!f.ad.trim() || tutar <= 0) { bildir('Ad ve tutar gerekli.', 'hata'); return false; }
          const veri = {
            ad: f.ad.trim(), tutar, tur: f.tur, kategori: f.kategori,
            gun: Number(f.gun) || 1, kesintiRiski: Number(f.kesintiRiski) || 5,
            otomatik: !!f.otomatik, aktif: !!f.aktif
          };
          if (s) guncelle('sabitler', s.id, veri); else ekle('sabitler', veri, 's');
          bildir('Kaydedildi.');
        }
      }
    ]
  });
}
eylemKaydet('sabit-ekle', () => sabitFormu());
eylemKaydet('sabit-duzenle', ({ id }) => sabitFormu(bul('sabitler', id)));
eylemKaydet('sabit-sil', async ({ id }) => {
  const s = bul('sabitler', id);
  if (s && await onayla('Sabit gideri sil', `<b>${kac(s.ad)}</b> silinsin mi?`, 'Sil', true)) { sil('sabitler', id); bildir('Silindi.', 'bilgi'); }
});

/* --- hane --- */
eylemKaydet('hane-degis', ({ alan: a, deger }) => {
  const v = Math.max(0, Number(deger) || 0);
  durum.hane[a] = a === 'yetiskin' || a === 'gelirSayisi' ? Math.max(1, v) : v;
  if (a === 'calismaSaati') durum.hane[a] = Math.max(1, v);
  kaydet('hane');
});

/* --- CSV --- */
eylemKaydet('csv-indir', () => {
  const satirlar = [['Tarih', 'Aciklama', 'Kategori', 'Tutar']].concat(
    [...durum.harcamalar].sort((a, b) => a.tarih.localeCompare(b.tarih))
      .map(h => [h.tarih, h.ad, h.kategori, h.tutar])
  );
  const csv = satirlar.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'para-bilinci-harcamalar-' + bugun() + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  bildir('CSV indirildi.');
});
