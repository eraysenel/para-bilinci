/* Yatırım — varlıklar, dağılım, reel getiri, acil fon, düzenli alım. */

import { durum, kaydet, ekle, guncelle, sil, bul } from '../core/store.js';
import { piyasa } from '../core/market.js';
import * as H from '../core/hesap.js';
import { tl, tlKisa, n, yuzde, yuzdeIsaret, tarihKisa, bugun, kac, sayiOku } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, senaryoEtiketi, kaynakEtiketi, eylemKaydet, bildir, modalAc, formOku, onayla, alan, girdi, secim } from '../core/ui.js';
import * as G from '../core/chart.js';
import { VARLIK_TURLER, VARLIK_BIRIM } from '../core/sabitler.js';

export const yatirimGorunum = {
  ad: 'yatirim', ikon: '◭', etiket: 'Yatırım',
  baslik: 'Yatırım & Büyüme',
  alt: 'Amaç zengin olmak değil; paranın satın alma gücünü korumak ve üstüne reel getiri koymak. Enflasyonun üstünde kalmak zaten başarıdır.',

  ciz() {
    const d = H.varlikDegerleme(piyasa);
    return onKosulKart()
      + ozet(d)
      + `<div class="izgara iz-21 ust-16"><div>${varlikListesi(d)}${duzenliAlimKart()}</div><div>${dagilimKart(d)}${acilFonKart()}</div></div>`
      + hedeflerKart();
  }
};

/* ---------- ön koşullar ---------- */

function onKosulKart() {
  const kartBorc = durum.borclar.filter(b => b.tur === 'kk' && (Number(b.kalan) || 0) > 0);
  const kartToplam = kartBorc.reduce((a, b) => a + Number(b.kalan), 0);
  const af = H.acilFonDurumu();
  const zorunlu = af.yeterliVeri ? af.zorunlu.toplam : 0;
  const tampon = af.yeterliVeri && af.biriken >= zorunlu;

  const kosullar = [
    {
      ad: 'Yüksek faizli borcun kapalı',
      tamam: kartToplam === 0,
      detay: kartToplam === 0 ? 'Kredi kartı borcun yok.' :
        `Kredi kartında ${tl(kartToplam)} borcun var. Bunu kapatmak yıllık ${
          n(H.yillikBilesik(H.kartFaizi(kartBorc[0])) || 0, 0)}% <b>garanti</b> getiridir — hiçbir yatırım bunu garanti etmez.`
    },
    {
      ad: 'En az 1 aylık tamponun var',
      tamam: tampon,
      detay: !af.yeterliVeri ? 'Zorunlu giderini hesaplamak için sabit giderlerini gir.'
        : tampon ? `${af.kalanAy.toFixed(1)} aylık zorunlu giderin hazır.`
        : `Zorunlu giderin ${tl(zorunlu)}, acil fonunda ${tl(af.biriken)} var. İlk aksilikte yatırımını zararına bozmamak için önce ${tl(Math.max(zorunlu - af.biriken, 0))} biriktir.`
    },
    {
      ad: 'Bu paraya 12 ay ihtiyacın yok',
      tamam: null,
      detay: 'Bunu sadece sen bilebilirsin. 12 ay içinde lazım olacak parayı dalgalı bir varlığa koymak, yatırım değil kumardır.'
    }
  ];

  const eksik = kosullar.filter(k => k.tamam === false).length;

  return kart('Yatırımın ön koşulları', kosullar.map(k => `
    <div class="oge" style="align-items:flex-start">
      <div class="im" style="background:${k.tamam === true ? 'var(--em-dim)' : k.tamam === false ? 'var(--red-dim)' : 'var(--surface-3)'};color:${k.tamam === true ? 'var(--em)' : k.tamam === false ? 'var(--red)' : 'var(--muted)'}">
        ${k.tamam === true ? '✓' : k.tamam === false ? '✕' : '?'}</div>
      <div class="gvd">
        <div class="ad">${kac(k.ad)}</div>
        <div class="ayr" style="line-height:1.6">${k.detay}</div>
      </div>
    </div>`).join('')
    + (eksik ? `<div class="ust-12">${notKutu('uyari',
      `<b>${eksik} ön koşul eksik.</b> Bu bir yasak değil, bir sıralama: eksik koşullarla yatırım yapmak,
       ilk aksilikte zararına satmak zorunda kalmak demektir. Yine de devam etmek senin kararın.`)}</div>`
      : `<div class="ust-12">${notKutu('iyi', 'Ölçülebilir ön koşullar tamam. Sıra dağılımını belirlemekte.')}</div>`),
    { ikon: '◈' });
}

/* ---------- özet ---------- */

function ozet(d) {
  const maliyet = d.satirlar.reduce((a, s) => a + (s.maliyet || 0), 0);
  const kar = d.toplam > 0 && maliyet > 0 ? d.toplam - maliyet : null;
  const enf = H.enflasyonOrani();
  const nakit = Number(durum.nakit.tutar) || 0;

  return `<div class="izgara iz-4 alt-16">
    ${dosem({ etiket: 'Toplam varlık', deger: d.toplam > 0 ? tl(d.toplam) : '—', ipucu: d.bilinmeyen ? `${d.bilinmeyen} varlığın fiyatı bilinmiyor` : `${d.satirlar.length} kalem`, renk: 'r-gold', vurgu: 'vurgu', ikon: '◭' })}
    ${dosem({ etiket: 'Toplam servet', deger: tl(d.toplam + nakit), ipucu: 'varlıklar + nakit', ikon: '∑' })}
    ${dosem({
      etiket: 'Nominal kâr / zarar', deger: kar !== null ? tl(kar) : '—',
      ipucu: kar !== null && maliyet > 0 ? yuzdeIsaret(kar / maliyet * 100, 1) + ' · alış fiyatına göre' : 'alış fiyatı gir',
      renk: kar === null ? 'r-muted' : kar >= 0 ? 'r-em' : 'r-red', ikon: '↗'
    })}
    ${dosem({
      etiket: 'Aşman gereken eşik', deger: enf !== null ? yuzde(enf, 1) : '—',
      ipucu: 'yıllık enflasyon — altında kalan getiri reel kayıptır',
      renk: 'r-red', ikon: '◔'
    })}
  </div>`;
}

/* ---------- varlık listesi ---------- */

function varlikListesi(d) {
  if (!d.satirlar.length) {
    return kart('Varlıkların', bos(
      'Varlık eklenmedi',
      'Dövizini, altınını, mevduatını ve fonlarını gir. Güncel fiyatlarla değerlenip dağılımın çıkarılır.', '◭'
    ) + `<div class="merkez ust-12"><button class="dg-btn b-ana b-kucuk" data-eylem="varlik-ekle">＋ Varlık ekle</button></div>`,
      { ikon: '◭' });
  }

  const govde = d.satirlar.map(s => `
    <div class="oge" style="align-items:flex-start">
      <div class="im" style="background:var(--gold-dim);color:var(--gold)">${VARLIK_BIRIM[s.tur] || '○'}</div>
      <div class="gvd">
        <div class="ad">${kac(s.ad || (VARLIK_TURLER.find(t => t.deger === s.tur) || {}).ad || s.tur)}</div>
        <div class="ayr">
          ${n(s.miktar, s.tur === 'altin' ? 2 : 0)} ${kac(VARLIK_BIRIM[s.tur] || '')}
          ${s.birimFiyat !== null ? ` × ${n(s.birimFiyat, 2)} ₺` : ' · <span class="r-amber">güncel fiyat bilinmiyor</span>'}
          ${s.alisFiyat ? ` · alış ${n(s.alisFiyat, 2)} ₺` : ''}
          ${s.alisTarih ? ` · ${tarihKisa(s.alisTarih)}` : ''}
        </div>
        ${s.kaynak ? `<div class="mini r-faint" style="margin-top:3px">kaynak: ${kac(s.kaynak)}</div>` : ''}
      </div>
      <div class="sag">
        <div class="tut">${s.guncelDeger !== null ? tl(s.guncelDeger) : '—'}</div>
        ${s.karYuzde !== null ? `<div class="ust ${s.kar >= 0 ? 'r-em' : 'r-red'}">${yuzdeIsaret(s.karYuzde, 1)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <button class="sil-btn" data-eylem="varlik-duzenle" data-id="${s.id}" title="Düzenle">✎</button>
        <button class="sil-btn" data-eylem="varlik-sil" data-id="${s.id}" title="Sil">✕</button>
      </div>
    </div>`).join('');

  return kart('Varlıkların', govde
    + (d.bilinmeyen ? `<div class="ust-12">${notKutu('uyari',
      `<b>${d.bilinmeyen} varlığın güncel fiyatı çekilemedi</b> ve toplama dahil edilmedi.
       Uydurma bir fiyat kullanmaktansa hariç tutmayı tercih ediyoruz.
       Ayarlar'dan elle fiyat girebilir ya da varlığı düzenleyip birim fiyat ekleyebilirsin.`)}</div>` : '')
    + `<div class="ust-12"><button class="dg-btn b-cizgi b-kucuk b-tam" data-eylem="varlik-ekle">＋ Varlık ekle</button></div>`,
    { ikon: '◭', yan: tl(d.toplam) });
}

/* ---------- dağılım ---------- */

function dagilimKart(d) {
  if (!(d.toplam > 0)) return '';

  const sapma = H.dagilimSapmasi(d);
  const renkli = d.dagilim.map((x, i) => ({ ...x, renk: G.renk(i) }));

  return kart('Varlık dağılımı', `
    ${G.halka(renkli, { boyut: 160, kalinlik: 22, ortaUst: tlKisa(d.toplam), ortaAlt: 'toplam' })}
    <div class="ust-12">${G.yatayListe(renkli, { bicim: tlKisa })}</div>

    ${sapma.yeterliVeri ? `
      <hr class="ayrac">
      <div class="mini r-muted alt-8">Hedef dağılımına göre sapma</div>
      ${sapma.satirlar.map(s => `
        <div style="margin-bottom:9px">
          <div class="esnek-ara mini" style="margin-bottom:3px">
            <span class="kalin">${kac(s.ad)}</span>
            <span class="num">
              <span class="r-ink">${yuzde(s.mevcut, 0)}</span>
              <span class="r-faint"> / hedef ${yuzde(s.hedef, 0)}</span>
              <span class="${Math.abs(s.sapma) < 5 ? 'r-em' : Math.abs(s.sapma) < 15 ? 'r-gold' : 'r-red'}"> ${yuzdeIsaret(s.sapma, 0)}</span>
            </span>
          </div>
          <div class="yigin">
            <i style="width:${Math.min(s.mevcut, 100).toFixed(1)}%;background:${Math.abs(s.sapma) < 5 ? 'var(--em)' : Math.abs(s.sapma) < 15 ? 'var(--gold)' : 'var(--red)'}"></i>
          </div>
          ${Math.abs(s.tutarFarki) > d.toplam * 0.03 ? `<div class="mini r-faint" style="margin-top:3px">
            Hedefe dönmek için ${s.tutarFarki > 0 ? 'ekle' : 'azalt'}: <b>${tl(Math.abs(s.tutarFarki))}</b></div>` : ''}
        </div>`).join('')}
      <button class="dg-btn b-cizgi b-kucuk b-tam ust-8" data-eylem="hedef-dagilim">Hedef dağılımı düzenle</button>
      <div class="ust-12">${notKutu('bilgi',
        `Dönemsel dengeleme: yılda bir–iki kez hedef oranlara dön.
         Bu, otomatik olarak "yükselenden sat, düşenden al" demektir — piyasayı takip etmeden.`)}</div>
    ` : ''}`, { ikon: '◔' });
}

/* ---------- acil fon ---------- */

function acilFonKart() {
  const af = H.acilFonDurumu();
  if (!af.yeterliVeri) return '';

  const fonlar = durum.hedefler.filter(h => h.acilFon);

  return kart('Acil durum fonu', `
    <div class="esnek-ara alt-8">
      <div><div class="mini r-muted">Biriken</div>
        <div class="num kalin r-em" style="font-size:21px">${tl(af.biriken)}</div></div>
      <div class="sag"><div class="mini r-muted">Hedef · ${af.hedefAy.ay} ay</div>
        <div class="num kalin" style="font-size:16px">${tl(af.hedef)}</div></div>
    </div>
    <div class="cubuk kalin"><i style="width:${af.yuzde.toFixed(1)}%"></i></div>
    <div class="mini r-faint ust-8">
      Aylık zorunlu giderin ${tl(af.zorunlu.toplam)}
      (sabit ${tlKisa(af.zorunlu.sabit)} + borç ${tlKisa(af.zorunlu.borc)}${af.zorunlu.degisken > 0 ? ` + zorunlu değişken ${tlKisa(af.zorunlu.degisken)}` : ''}).
    </div>
    ${!fonlar.length ? `<div class="ust-12">${notKutu('bilgi',
      'Henüz acil fon hedefin yok. Aşağıdan "Acil fon" işaretli bir hedef oluştur; biriktirdiklerin buraya sayılsın.')}</div>` : ''}
    <div class="ust-12">${notKutu('notr',
      `Acil fon yatırım değil <b>sigortadır</b>. Getiri beklemezsin, uyku beklersin.
       İndirim acil değildir. Tatil acil değildir.`)}</div>`, { ikon: '◈' });
}

/* ---------- düzenli alım ---------- */

function duzenliAlimKart() {
  const tutar = Number(durum.ayarlar.duzenliYatirim) || 0;
  const gelir = H.aylikGelir();

  return kart('Düzenli alım planı', `
    ${alan('Her ay yatırıma ayıracağın tutar (₺)',
      girdi('duzenli', { deger: tutar || '', yer: '2000', ek: 'data-degisti="duzenli-degis"' }),
      gelir > 0 && tutar > 0 ? `gelirin %${(tutar / gelir * 100).toFixed(0)}'i` : '')}

    ${tutar > 0 ? `
      <div class="izgara iz-3 ust-12">
        ${dosem({ etiket: 'Yılda', deger: tl(tutar * 12), ikon: '∑' })}
        ${dosem({ etiket: '3 yılda', deger: tl(tutar * 36), ipucu: 'getiri hariç, sadece anapara', ikon: '∑' })}
        ${dosem({ etiket: '5 yılda', deger: tl(tutar * 60), ipucu: 'getiri hariç, sadece anapara', ikon: '∑' })}
      </div>
      ${notKutu('notr', `Yukarıdaki rakamlar <b>sadece yatırdığın anaparadır</b> — getiri eklenmemiştir.
        Gelecek getirisi hakkında bir sayı üretmiyoruz çünkü kimse bilemez;
        birinin bildiğini iddia etmesi, bir risk saklıyor olmasındandır.`)}
    ` : ''}

    <div class="ust-12">${notKutu('bilgi',
      `<b>Düzenli alım (maliyet ortalaması):</b> her ay aynı tutarı, fiyata bakmadan.
       Fiyat düşükken daha çok, yüksekken daha az alırsın; ortalama maliyetin kendiliğinden düzelir.
       Asıl faydası psikolojiktir: karar vermeyi ortadan kaldırır, karar vermediğin yerde panikle satmazsın.
       Tutarı gelirinden <b>otomatik ayır</b> — "ay sonunda kalanı yatırırım" hiç yatıramamak demektir.`)}</div>`,
    { ikon: '⟳' });
}

/* ---------- hedefler ---------- */

function hedeflerKart() {
  const liste = durum.hedefler;

  const govde = liste.length ? liste.map(h => {
    const yuzdeD = (Number(h.tutar) || 0) > 0 ? Math.min((Number(h.biriken) || 0) / Number(h.tutar) * 100, 100) : 0;
    return `<div class="oge" style="align-items:flex-start">
      <div class="im" style="background:var(--${h.acilFon ? 'blue' : 'gold'}-dim);color:var(--${h.acilFon ? 'blue' : 'gold'})">${h.acilFon ? '◈' : '◇'}</div>
      <div class="gvd">
        <div class="ad">${kac(h.ad)}${h.acilFon ? rozet('acil fon', 'blue') : ''}</div>
        <div class="ayr">${tl(h.biriken)} / ${tl(h.tutar)}${h.tarih ? ` · hedef ${tarihKisa(h.tarih)}` : ''}</div>
        <div style="margin-top:6px"><div class="cubuk ince"><i style="width:${yuzdeD.toFixed(0)}%"></i></div></div>
      </div>
      <div class="sag"><div class="tut">${yuzde(yuzdeD, 0)}</div></div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <button class="sil-btn" data-eylem="hedef-ekle-para" data-id="${h.id}" title="Para ekle">₺</button>
        <button class="sil-btn" data-eylem="hedef-sil" data-id="${h.id}" title="Sil">✕</button>
      </div>
    </div>`;
  }).join('')
    : bos('Hedef yok', 'Acil fon, ev peşinatı, tatil… Hedefe bağlı biriktirmek, "bir şeyler biriktireyim"den çok daha etkilidir.', '◇');

  return kart('Birikim hedeflerin', govde
    + `<div class="ust-12"><button class="dg-btn b-cizgi b-kucuk b-tam" data-eylem="hedef-ekle">＋ Hedef ekle</button></div>`,
    { ikon: '◇' });
}

/* ============================================================
   Eylemler
   ============================================================ */

function varlikFormu(v = null) {
  modalAc({
    baslik: v ? 'Varlığı düzenle' : 'Varlık ekle',
    govde: `
      <div class="satir s-2">
        ${alan('Tür', secim('tur', VARLIK_TURLER, v?.tur || 'usd'))}
        ${alan('Adı', girdi('ad', { deger: v?.ad || '', yer: 'isteğe bağlı' }))}
      </div>
      <div class="satir s-2">
        ${alan('Miktar', girdi('miktar', { deger: v?.miktar || '', yer: '500' }), 'adet / gram / birim')}
        ${alan('Alış fiyatı (₺)', girdi('alisFiyat', { deger: v?.alisFiyat || '', yer: 'birim başına' }), 'kâr hesabı için')}
      </div>
      <div class="satir s-2">
        ${alan('Alış tarihi', girdi('alisTarih', { tur: 'date', deger: v?.alisTarih || '' }))}
        ${alan('Güncel birim fiyat (₺)', girdi('birimFiyat', { deger: v?.birimFiyat || '', yer: 'otomatik çekilemezse' }), 'hisse/fon için')}
      </div>
      ${notKutu('bilgi', `Dolar, euro ve gram altın için güncel fiyat otomatik çekilir.
        Hisse ve fonlarda birim fiyatı elle girmen gerekir — canlı borsa verisi için Ayarlar'dan Worker adresini tanımlayabilirsin.`)}`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const miktar = sayiOku(f.miktar);
          if (miktar <= 0) { bildir('Miktar gerekli.', 'hata'); return false; }
          const veri = {
            tur: f.tur, ad: f.ad.trim(), miktar,
            alisFiyat: sayiOku(f.alisFiyat) || null,
            alisTarih: f.alisTarih || null,
            birimFiyat: sayiOku(f.birimFiyat) || null
          };
          if (v) guncelle('varliklar', v.id, veri); else ekle('varliklar', veri, 'v');
          bildir('Kaydedildi.');
        }
      }
    ]
  });
}
eylemKaydet('varlik-ekle', () => varlikFormu());
eylemKaydet('varlik-duzenle', ({ id }) => varlikFormu(bul('varliklar', id)));
eylemKaydet('varlik-sil', async ({ id }) => {
  const v = bul('varliklar', id);
  if (v && await onayla('Varlığı sil', 'Bu varlık kaydı silinsin mi?', 'Sil', true)) { sil('varliklar', id); bildir('Silindi.', 'bilgi'); }
});

eylemKaydet('hedef-dagilim', () => {
  const h = durum.ayarlar.hedefDagilim;
  modalAc({
    baslik: 'Hedef varlık dağılımı',
    govde: `
      <p class="kucuk r-muted alt-12" style="line-height:1.6">
        Toplamın %100 olması gerekir. Dağılımı zaman ufkuna ve risk tahammülüne göre belirle,
        sonra <b>ona sadık kal</b>. Piyasa hareket ettikçe dağılımı değiştirmek, en çok zarar ettiren davranıştır.
      </p>
      <div class="satir s-2">
        ${alan('TL / Mevduat (%)', girdi('tl', { tur: 'number', deger: h.tl, ek: 'min="0" max="100"' }))}
        ${alan('Döviz (%)', girdi('doviz', { tur: 'number', deger: h.doviz, ek: 'min="0" max="100"' }))}
      </div>
      <div class="satir s-2">
        ${alan('Altın (%)', girdi('altin', { tur: 'number', deger: h.altin, ek: 'min="0" max="100"' }))}
        ${alan('Hisse / Fon (%)', girdi('hisse', { tur: 'number', deger: h.hisse, ek: 'min="0" max="100"' }))}
      </div>
      ${notKutu('uyari', 'Bu araç sana bir dağılım önermez — kimse senin risk tahammülünü ve zaman ufkunu senden iyi bilemez. Burası senin planını yazdığın yer.')}`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const y = { tl: Number(f.tl) || 0, doviz: Number(f.doviz) || 0, altin: Number(f.altin) || 0, hisse: Number(f.hisse) || 0 };
          const t = y.tl + y.doviz + y.altin + y.hisse;
          if (Math.abs(t - 100) > 0.5) { bildir(`Toplam %${t} — %100 olmalı.`, 'hata'); return false; }
          durum.ayarlar.hedefDagilim = y;
          kaydet('hedef-dagilim');
          bildir('Hedef dağılım kaydedildi.');
        }
      }
    ]
  });
});

eylemKaydet('duzenli-degis', ({ deger }) => {
  durum.ayarlar.duzenliYatirim = sayiOku(deger);
  kaydet('duzenli');
});

eylemKaydet('hedef-ekle', () => {
  modalAc({
    baslik: 'Birikim hedefi',
    govde: `
      <div class="satir s-21">
        ${alan('Hedefin adı', girdi('ad', { yer: 'Acil durum fonu' }))}
        ${alan('Hedef tutar (₺)', girdi('tutar', { yer: '90000' }))}
      </div>
      <div class="satir s-2">
        ${alan('Şu an biriken (₺)', girdi('biriken', { yer: '0' }))}
        ${alan('Hedef tarih', girdi('tarih', { tur: 'date' }), 'isteğe bağlı')}
      </div>
      <label class="esnek kucuk" style="cursor:pointer;margin-top:6px">
        <input type="checkbox" name="acilFon" style="width:auto">
        <span>Bu benim <b>acil durum fonum</b> (Bugün ekranında ayrıca takip edilir)</span></label>`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Ekle', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const tutar = sayiOku(f.tutar);
          if (!f.ad.trim() || tutar <= 0) { bildir('Ad ve hedef tutar gerekli.', 'hata'); return false; }
          ekle('hedefler', { ad: f.ad.trim(), tutar, biriken: sayiOku(f.biriken), tarih: f.tarih || null, acilFon: !!f.acilFon }, 'hd');
          bildir('Hedef eklendi.');
        }
      }
    ]
  });
});

eylemKaydet('hedef-ekle-para', ({ id }) => {
  const h = bul('hedefler', id);
  if (!h) return;
  modalAc({
    baslik: 'Hedefe para ekle — ' + h.ad,
    govde: `
      <div class="izgara iz-2 alt-12">
        ${dosem({ etiket: 'Biriken', deger: tl(h.biriken), renk: 'r-em' })}
        ${dosem({ etiket: 'Kalan', deger: tl(Math.max(h.tutar - h.biriken, 0)), renk: 'r-gold' })}
      </div>
      ${alan('Eklenecek tutar (₺)', girdi('tutar', { yer: '2500' }))}
      <label class="esnek kucuk" style="cursor:pointer;margin-top:6px">
        <input type="checkbox" name="nakittenDus" checked style="width:auto">
        <span>Elimdeki nakitten düş</span></label>`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Ekle', sinif: 'b-iyi', tikla: kok => {
          const f = formOku(kok);
          const v = sayiOku(f.tutar);
          if (v <= 0) { bildir('Geçerli bir tutar gir.', 'hata'); return false; }
          guncelle('hedefler', h.id, { biriken: (Number(h.biriken) || 0) + v });
          if (f.nakittenDus) {
            durum.nakit.tutar = Math.max((Number(durum.nakit.tutar) || 0) - v, 0);
            kaydet('nakit');
          }
          bildir('Eklendi. Önce kendine ödemek, en etkili alışkanlıktır.');
        }
      }
    ]
  });
});

eylemKaydet('hedef-sil', async ({ id }) => {
  const h = bul('hedefler', id);
  if (h && await onayla('Hedefi sil', `<b>${kac(h.ad)}</b> hedefi silinsin mi?`, 'Sil', true)) { sil('hedefler', id); bildir('Silindi.', 'bilgi'); }
});
