/* Ayarlar — tema, piyasa kaynağı, yedek, veri yönetimi. */

import { durum, kaydet, yedekAl, yedekYukle, hepsiniSil, eskiVeriVar, eskiVeriSil } from '../core/store.js';
import { piyasa, piyasayiCek, elleGir, proxyKaydet, gecmisOku, frenOzeti, frenDurumu } from '../core/market.js';
import * as H from '../core/hesap.js';
import { tl, n, yuzde, tarihUzun, bugun, goreliZaman, kac, sayiOku } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, kaynakEtiketi, eylemKaydet, bildir, modalAc, formOku, onayla, alan, girdi, secim } from '../core/ui.js';

export const ayarGorunum = {
  ad: 'ayarlar', ikon: '⚙', etiket: 'Ayarlar',
  baslik: 'Ayarlar',
  alt: 'Veri kaynakları, hesap tercihleri ve yedekleme. Tüm verilerin yalnızca bu cihazda durur.',

  ciz() {
    return piyasaKart() + hesapKart() + veriKart() + hakkindaKart();
  }
};

/* ---------- piyasa ---------- */

function piyasaKart() {
  const e = durum.piyasa.elle || {};
  const gecmis = Object.keys(gecmisOku()).length;

  const satir = (anahtar, ad, ipucu) => {
    const d = piyasa[anahtar];
    return `<div class="oge" style="align-items:flex-start">
      <div class="gvd">
        <div class="ad">${kac(ad)} ${kaynakEtiketi(d)}</div>
        <div class="ayr">${d.deger !== null
          ? `${n(d.deger, anahtar === 'bist' ? 0 : 2)}${d.kaynak ? ` · ${kac(d.kaynak)}` : ''}${d.zaman ? ` · ${goreliZaman(d.zaman)}` : ''}`
          : kac(ipucu)}</div>
      </div>
      <div style="width:130px;flex:none">
        <input type="text" inputmode="decimal" placeholder="elle gir"
          value="${e[anahtar]?.deger ?? ''}" data-degisti="piyasa-elle" data-alan="${anahtar}">
      </div>
    </div>`;
  };

  const f = frenOzeti();

  return kart('Canlı piyasa verisi', `
    ${satir('usd', 'USD / TRY', 'çekilemedi')}
    ${satir('eur', 'EUR / TRY', 'çekilemedi')}
    ${satir('onsAltin', 'Ons altın (USD)', 'çekilemedi')}
    ${satir('gramAltin', 'Gram altın (₺)', 'ons ve kur gerekir')}
    ${satir('onsGumus', 'Ons gümüş (USD)', 'çekilemedi')}
    ${satir('gramGumus', 'Gram gümüş (₺)', 'ons ve kur gerekir')}
    ${satir('bist', 'BIST 100', 'tarayıcıdan çekilemez — proxy gerekir')}

    <div class="dg-grup ust-12">
      <button class="dg-btn b-ana b-kucuk" data-eylem="piyasa-yenile" ${piyasa.cekiliyor ? 'disabled' : ''}>
        ${piyasa.cekiliyor ? 'çekiliyor…' : '⟳ Şimdi yenile'}</button>
      ${piyasa.hatalar.length ? `<button class="dg-btn b-sade b-kucuk" data-eylem="piyasa-hata">Hataları gör (${piyasa.hatalar.length})</button>` : ''}
    </div>

    <div class="mini r-faint ust-8">
      Gram fiyatları ons × USD/TRY ÷ 31,1035 ile hesaplanır.
      Kaynakları yormamak için veri ${f.onbellekOmruDk} dk önbellekte tutulur, denemeler arasında
      en az ${f.enKisaAralikDk} dk beklenir, günde en fazla ${f.gunlukLimit} istek yapılır
      (bugün ${f.kullanilan} kullanıldı${f.onbellekYasiDk !== null ? `, önbellek ${f.onbellekYasiDk} dk önce tazelendi` : ''}).
    </div>

    <hr class="ayrac">

    ${alan('Cloudflare Worker adresi', girdi('proxy', {
      deger: durum.piyasa.proxyUrl, yer: 'https://...workers.dev/',
      ek: 'data-degisti="proxy-degis"'
    }), 'BIST 100 için gerekli')}

    <div class="mini r-faint ust-8" style="line-height:1.65">
      <b class="r-muted">Neden proxy?</b> Döviz ve kıymetli maden için tarayıcıdan doğrudan çağrılabilen
      (CORS başlığı gönderen) ücretsiz API'ler var; BIST 100 için yok — Yahoo Finance, Stooq ve TCMB
      tarayıcıdan gelen isteklere izin vermiyor. Depoda hazır Worker kodu var:
      <code>worker/piyasa-proxy.js</code>; kurulum adımları dosyanın başında yazılı.
      Kullandığı kaynakların hepsi ücretsiz ve anahtarsızdır, hiçbir ücretli servis çağrılmaz.
      <br>
      <b class="r-muted">Fiyat uydurulmaz.</b> Çekilemeyen değer “—” kalır. Elle girdiğin değerler yalnızca
      canlı veri yokken kullanılır ve <span class="rozet rz-amber">elle girildi</span> etiketiyle işaretlenir.
      ${gecmis ? ` Şu ana kadar <b class="r-muted">${gecmis} günlük</b> gerçek fiyat kaydın birikti; Bugün ekranındaki erime grafiği bunu kullanır.` : ''}
    </div>`,
    { ikon: '◈' });
}

/* ---------- hesap tercihleri ---------- */

function hesapKart() {
  const a = durum.ayarlar;
  const ref = H.referans();
  const af = H.acilFonAyHedefi();

  return kart('Hesap tercihleri', `
    <div class="satir s-2">
      ${alan('Enflasyon kaynağı', secim('enflasyonKaynak', [
        { deger: 'tuik', ad: 'TÜİK (resmî)' },
        { deger: 'enag', ad: 'ENAG (bağımsız)' },
        { deger: 'ikisi', ad: 'İkisinin ortası' }
      ], a.enflasyonKaynak), 'reel getiri hesabında kullanılır')}
      ${alan('Bekleme süresi (gün)', girdi('bekletmeGun', { tur: 'number', deger: a.bekletmeGun, ek: 'min="0" max="90"' }), 'almadan önce')}
    </div>

    <div class="satir s-2">
      ${alan('Güvenlik payı (%)', girdi('guvenlikPayiYuzde', { tur: 'number', deger: a.guvenlikPayiYuzde, ek: 'min="0" max="30"' }), 'günlük harcamadan ayrılan tampon')}
      ${alan('Acil fon hedefi (ay)', girdi('acilFonAy', { tur: 'number', deger: a.acilFonAy || '', yer: `otomatik: ${af.ay}`, ek: 'min="0" max="24"' }), 'boş = hane yapısından hesapla')}
    </div>

    ${alan('Kredi kartı faiz oranı (aylık %)', girdi('kartFaizElle', {
      deger: a.kartFaizElle || '', yer: ref ? `boş = TCMB azami (%${ref.faiz.krediKarti.kademeler[0].akdiAylik}–${ref.faiz.krediKarti.kademeler[2].akdiAylik})` : 'boş = TCMB azami'
    }), 'ekstrende yazan oran')}

    <div class="dg-grup ust-12">
      <button class="dg-btn b-ana b-kucuk" data-eylem="ayar-kaydet">Kaydet</button>
    </div>

    ${ref ? `<div class="ust-12">${notKutu('notr', `
      <b>Referans veri seti</b> — ${kac(ref.guncellemeTarihi)} tarihinde güncellendi.<br>
      TÜİK TÜFE (${kac(ref.tufe.donemAdi)}): yıllık %${n(ref.tufe.yillik, 2)}, aylık %${n(ref.tufe.aylik, 2)} ·
      ENAG: yıllık %${n(ref.enag.yillik, 2)} ·
      TCMB politika faizi: %${n(ref.faiz.politikaFaizi.yillikYuzde, 0)}<br>
      Bu sayılar resmî bültenlerden elle işlenir. Yeni veri çıktığında
      <code>data/referans.json</code> güncellenir — tahmin veya modelleme kullanılmaz.`)}</div>` : ''}`,
    { ikon: '⚙' });
}

/* ---------- veri ---------- */

function veriKart() {
  const sayilar = [
    ['Harcama', durum.harcamalar.length], ['Gelir', durum.gelirler.length],
    ['Sabit gider', durum.sabitler.length], ['Borç', durum.borclar.length],
    ['Varlık', durum.varliklar.length], ['Hedef', durum.hedefler.length],
    ['Karar', durum.kararlar.length], ['Sepet ürünü', durum.sepet.length],
    ['Tarif', durum.tarifler.length], ['Kredi notu', durum.skorlar.length]
  ];

  return kart('Verilerin', `
    <div class="izgara iz-4 iz-kucuk-2 alt-16">
      ${sayilar.map(([ad, s]) => dosem({ etiket: ad, deger: String(s) })).join('')}
    </div>

    <div class="dg-grup">
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="yedek-al">↓ Yedek indir</button>
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="yedek-yukle">↑ Yedekten yükle</button>
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="csv-indir">↓ Harcama CSV</button>
      <button class="dg-btn b-tehli b-kucuk" data-eylem="hepsini-sil">Tüm verileri sil</button>
    </div>
    <input type="file" id="yedekDosya" accept="application/json" style="display:none">

    <div class="ust-12">${notKutu('bilgi',
      `Verilerin yalnızca bu tarayıcıda (localStorage) durur; hiçbir sunucuya gönderilmez.
       Bu, gizliliğin için iyi ama <b>tarayıcı verisini temizlersen kaybolur</b> demektir.
       Ayda bir yedek indirmeni öneririm.`)}</div>

    ${eskiVeriVar() ? `<div class="ust-12">${notKutu('uyari',
      `<b>Eski sürümün verileri tarayıcında duruyor.</b> Yeni sürüm sıfırdan başladığı için bunlar kullanılmıyor
       ama silinmedi de. İstersen temizleyebilirsin.`)}
      <div class="ust-8"><button class="dg-btn b-cizgi b-kucuk" data-eylem="eski-sil">Eski sürüm verilerini sil</button></div></div>` : ''}`,
    { ikon: '◱' });
}

/* ---------- hakkında ---------- */

function hakkindaKart() {
  return kart('Hakkında', `
    <p class="kucuk" style="line-height:1.75;color:var(--ink-2)">
      <b>Para Bilinci</b>, Türkiye'nin ekonomik koşullarına göre tasarlanmış ücretsiz bir para yönetimi
      ve mentorluk aracıdır. Kâr amacı gütmez, reklam içermez, ürün satmaz, veri toplamaz.
    </p>
    <p class="kucuk ust-12" style="line-height:1.75;color:var(--ink-2)">
      Tasarım ilkesi basittir: <b>baskı değil, görünürlük</b>. Bu araç sana ne yapman gerektiğini söylemez;
      durumunu gösterir ve kararı sana bırakır. Eksi olmak, borçlu olmak sorun değil —
      görülmeyen para sorundur.
    </p>
    <p class="kucuk ust-12" style="line-height:1.75;color:var(--ink-2)">
      Sayılar konusunda tek bir kuralımız var: <b>uydurmamak</b>. Resmî veriler kaynağı ve tarihiyle
      birlikte gösterilir, çekilemeyen veri "—" olarak kalır, projeksiyon içeren her hesap
      "senaryo" etiketiyle işaretlenir.
    </p>
    <div class="ust-16 merkez">
      <a class="dg-btn b-ana b-kucuk" href="https://eraysenel.github.io/iyilik-icin-ai/" target="_blank" rel="noopener">
        İyilik İçin Yapay Zekâ — tüm projeler ↗</a>
    </div>
    <div class="merkez mini r-faint ust-12">
      Bir <b>İyilik İçin Yapay Zekâ</b> projesi · © Eray Şenel<br>
      Gönüllü katkı (yazılım, tasarım, içerik, alan uzmanlığı) her zaman açık.
    </div>`, { ikon: '◈' });
}

/* ============================================================
   Eylemler
   ============================================================ */

eylemKaydet('piyasa-yenile', async () => {
  const f = frenDurumu(true);
  if (!f.izin) {
    bildir(
      f.sebep === 'gunluk-limit'
        ? `Günlük istek sınırına ulaşıldı (${frenOzeti().gunlukLimit}). Kaynakları yormamak için yarın sıfırlanacak — bu arada değerleri elle girebilirsin.`
        : `Çok sık deneme. ${f.kalanSaniye} saniye sonra tekrar dene.`,
      'bilgi', 4200);
    return;
  }
  bildir('Piyasa verisi çekiliyor…', 'bilgi', 1600);
  await piyasayiCek({ zorla: true });
  const bulunan = ['usd', 'eur', 'gramAltin', 'gramGumus', 'bist']
    .filter(k => piyasa[k].deger !== null && piyasa[k].yontem === 'canli').length;
  bildir(bulunan ? `${bulunan} değer güncellendi.` : 'Hiçbir kaynağa ulaşılamadı.', bulunan ? 'iyi' : 'hata');
});

eylemKaydet('piyasa-hata', () => {
  modalAc({
    baslik: 'Veri çekme hataları',
    govde: `<p class="kucuk r-muted alt-12">Bu hatalar genellikle kaynağın CORS izni vermemesinden ya da geçici erişim sorunundan kaynaklanır.</p>
      <ul style="font-size:13px;line-height:1.7;padding-left:18px;margin:0">
        ${piyasa.hatalar.map(h => `<li><code>${kac(h)}</code></li>`).join('')}</ul>`,
    dugmeler: [{ ad: 'Kapat', sinif: 'b-cizgi' }]
  });
});

eylemKaydet('piyasa-elle', ({ alan: a, deger }) => {
  elleGir(a, deger);
  bildir(deger ? 'Elle girilen değer kaydedildi.' : 'Elle girilen değer kaldırıldı.', 'bilgi');
});

eylemKaydet('proxy-degis', ({ deger }) => {
  proxyKaydet(deger);
  bildir(deger ? 'Worker adresi kaydedildi. "Şimdi yenile" ile dene.' : 'Worker adresi kaldırıldı.', 'bilgi');
});

eylemKaydet('ayar-kaydet', () => {
  const kok = document.querySelector('.icerik');
  const f = {};
  kok.querySelectorAll('input[name], select[name]').forEach(e => { f[e.name] = e.value; });

  const a = durum.ayarlar;
  if (f.enflasyonKaynak) a.enflasyonKaynak = f.enflasyonKaynak;
  if (f.bekletmeGun !== undefined) a.bekletmeGun = Math.max(0, Number(f.bekletmeGun) || 0);
  if (f.guvenlikPayiYuzde !== undefined) a.guvenlikPayiYuzde = Math.min(Math.max(Number(f.guvenlikPayiYuzde) || 0, 0), 30);
  a.acilFonAy = Number(f.acilFonAy) > 0 ? Number(f.acilFonAy) : null;
  a.kartFaizElle = sayiOku(f.kartFaizElle) > 0 ? sayiOku(f.kartFaizElle) : null;

  kaydet('ayarlar');
  bildir('Ayarlar kaydedildi.');
});

eylemKaydet('yedek-al', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([yedekAl()], { type: 'application/json' }));
  a.download = 'para-bilinci-yedek-' + bugun() + '.json';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  bildir('Yedek indirildi.');
});

eylemKaydet('yedek-yukle', () => {
  const g = document.getElementById('yedekDosya');
  if (!g) return;
  g.value = '';
  g.onchange = async () => {
    const d = g.files?.[0];
    if (!d) return;
    if (!await onayla('Yedeği yükle',
      'Mevcut tüm verilerin bu yedekle <b>değiştirilecek</b>. Devam edilsin mi?', 'Evet, yükle', true)) return;
    try {
      yedekYukle(await d.text());
      bildir('Yedek yüklendi.');
      document.dispatchEvent(new CustomEvent('gorunum-yenile'));
    } catch (e) {
      bildir('Yüklenemedi: ' + e.message, 'hata', 5000);
    }
  };
  g.click();
});

eylemKaydet('hepsini-sil', async () => {
  if (!await onayla('Tüm verileri sil',
    'Girdiğin <b>her şey</b> kalıcı olarak silinecek: harcamalar, borçlar, varlıklar, hedefler, dersler. Bu geri alınamaz.<br><br>Önce yedek indirmeni öneririm.',
    'Evet, hepsini sil', true)) return;
  hepsiniSil();
  bildir('Tüm veriler silindi.', 'bilgi');
  document.dispatchEvent(new CustomEvent('gorunum-yenile'));
});

eylemKaydet('eski-sil', async () => {
  if (!await onayla('Eski sürüm verilerini sil',
    'Eski Para Bilinci sürümünün tarayıcıda kalan kayıtları silinecek. Yeni sürümün verileri etkilenmez.',
    'Sil', true)) return;
  eskiVeriSil();
  bildir('Eski veriler silindi.', 'bilgi');
  document.dispatchEvent(new CustomEvent('gorunum-yenile'));
});
