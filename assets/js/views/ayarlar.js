/* Ayarlar — tema, piyasa kaynağı, yedek, veri yönetimi. */

import { durum, kaydet, yedekAl, yedekYukle, hepsiniSil, eskiVeriVar, eskiVeriSil, durumuDegistir } from '../core/store.js';
import * as Kilit from '../core/kilit.js';
import { piyasa, piyasayiCek, elleGir, proxyKaydet, gecmisOku, frenOzeti, frenDurumu, kaynakTesti } from '../core/market.js';
import * as H from '../core/hesap.js';
import { tl, n, yuzde, tarihUzun, bugun, goreliZaman, kac, sayiOku } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, kaynakEtiketi, eylemKaydet, bildir, modalAc, formOku, onayla, alan, girdi, secim } from '../core/ui.js';

export const ayarGorunum = {
  ad: 'ayarlar', ikon: '⚙', etiket: 'Ayarlar',
  baslik: 'Ayarlar',
  alt: 'Veri kaynakları, hesap tercihleri ve yedekleme. Tüm verilerin yalnızca bu cihazda durur.',

  ciz() {
    return kilitKart() + piyasaKart() + hesapKart() + veriKart() + hakkindaKart();
  }
};

/* ---------- kilit ---------- */

function kilitKart() {
  if (!Kilit.desteklenirMi()) {
    return kart('Kilit', notKutu('uyari',
      `Bu tarayıcı şifreleme desteklemiyor ya da sayfa güvenli olmayan bir bağlantı üzerinden açılmış.
       Kilit özelliği <b>https</b> ya da <b>localhost</b> gerektirir.`), { ikon: '⚿' });
  }

  const kurulu = Kilit.kilitKurulu();
  const kullanici = Kilit.kilitliKullanici();

  if (!kurulu) {
    return kart('Kilit', `
      <p class="kucuk r-muted alt-12" style="line-height:1.65">
        Bir kullanıcı adı ve şifre belirlersen verilerin bu cihazda <b>şifrelenir</b>.
        Uygulama her açılışta şifre ister; şifreyi bilmeyen — tarayıcı konsolunu açan biri dahil —
        kayıtlı veriyi okuyamaz.
      </p>
      ${notKutu('uyari',
        `<b>Şifre sıfırlanamaz.</b> Sunucu yok, hesap yok, kurtarma anahtarı yok.
         Şifreyi unutursan verilerin kalıcı olarak erişilemez hâle gelir.
         Kilidi kurmadan önce <b>mutlaka yedek indir</b>.`)}
      <div class="dg-grup ust-12">
        <button class="dg-btn b-cizgi b-kucuk" data-eylem="yedek-al">↓ Önce yedek indir</button>
        <button class="dg-btn b-ana b-kucuk" data-eylem="kilit-kur">⚿ Kilidi kur</button>
      </div>`, { ikon: '⚿' });
  }

  return kart('Kilit', `
    <div class="oge">
      <div class="im" style="background:var(--em-dim);color:var(--em)">⚿</div>
      <div class="gvd">
        <div class="ad">Kilit açık ${rozet('şifreli', 'em')}</div>
        <div class="ayr">
          Kullanıcı: <b>${kac(kullanici || '—')}</b> ·
          Veriler AES-GCM 256 ile şifreleniyor (PBKDF2-SHA256, 250.000 tur)
        </div>
      </div>
    </div>

    <div class="dg-grup ust-12">
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="kilit-kullanici">Kullanıcı adını değiştir</button>
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="kilit-sifre">Şifreyi değiştir</button>
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="kilitle">Şimdi kilitle</button>
      <button class="dg-btn b-tehli b-kucuk" data-eylem="kilit-kaldir">Kilidi kaldır</button>
    </div>

    <div class="mini r-faint ust-12" style="line-height:1.65">
      Yedek dosyaları <b>şifresiz</b> indirilir — kurtarma yolu olarak işe yaraması için.
      Yedeğini güvenli bir yerde tut.
      “Şimdi kilitle” bellekteki anahtarı siler ve şifre ekranına döner.
    </div>`, { ikon: '⚿' });
}

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
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="kaynak-test">⚗ Kaynakları test et</button>
      ${piyasa.hatalar.length ? `<button class="dg-btn b-sade b-kucuk" data-eylem="piyasa-hata">Hataları gör (${piyasa.hatalar.length})</button>` : ''}
    </div>
    <div id="kaynakSonuc"></div>

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
    <div class="dg-grup ust-16" style="justify-content:center">
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="git" data-hedef="gizlilik">⛨ Gizlilik & KVKK</button>
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


/* ---------- kilit eylemleri ---------- */

function gucCubugu(sifre) {
  const g = Kilit.sifreGucu(sifre);
  return `<div class="guc-cubuk">${[0,1,2,3].map(i =>
    `<i style="background:${i < g.puan ? `var(--${g.renk})` : 'var(--surface-3)'}"></i>`).join('')}</div>
    <div class="mini r-${g.renk}" style="margin-top:4px">${kac(g.ad)}</div>`;
}

function gucBagla(kok) {
  const alanSifre = kok.querySelector('input[name="sifre"]');
  const hedef = kok.querySelector('#gucKap');
  if (!alanSifre || !hedef) return;
  alanSifre.addEventListener('input', () => { hedef.innerHTML = gucCubugu(alanSifre.value); });
}

eylemKaydet('kilit-kur', () => {
  const m = modalAc({
    baslik: 'Kilidi kur',
    govde: `
      ${notKutu('uyari',
        `<b>Son uyarı:</b> şifre sıfırlanamaz. Unutursan verilerin kurtarılamaz.
         Yedek almadıysan önce vazgeç, yedek indir, sonra geri gel.`)}
      <div class="ust-12">${alan('Kullanıcı adı', girdi('kullanici', { yer: 'Adın ya da takma adın' }), 'kilit ekranında görünür')}</div>
      ${alan('Şifre', girdi('sifre', { tur: 'password', yer: 'en az 6 karakter' }))}
      <div id="gucKap"></div>
      <div class="ust-12">${alan('Şifre (tekrar)', girdi('sifre2', { tur: 'password' }))}</div>`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kilidi kur', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          if (!f.sifre || f.sifre.length < 6) { bildir('Şifre en az 6 karakter olmalı.', 'hata'); return false; }
          if (f.sifre !== f.sifre2) { bildir('Şifreler aynı değil.', 'hata'); return false; }
          Kilit.kilitKur(f.kullanici, f.sifre, durum)
            .then(() => bildir('Kilit kuruldu. Verilerin artık bu cihazda şifreli.'))
            .then(() => document.dispatchEvent(new CustomEvent('gorunum-yenile')))
            .catch(e => bildir('Kurulamadı: ' + e.message, 'hata', 5000));
        }
      }
    ]
  });
  gucBagla(m);
});

eylemKaydet('kilit-sifre', () => {
  const m = modalAc({
    baslik: 'Şifreyi değiştir',
    govde: `
      ${alan('Mevcut şifre', girdi('eski', { tur: 'password' }))}
      ${alan('Yeni şifre', girdi('sifre', { tur: 'password', yer: 'en az 6 karakter' }))}
      <div id="gucKap"></div>
      <div class="ust-12">${alan('Yeni şifre (tekrar)', girdi('sifre2', { tur: 'password' }))}</div>`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Değiştir', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          if (!f.sifre || f.sifre.length < 6) { bildir('Yeni şifre en az 6 karakter olmalı.', 'hata'); return false; }
          if (f.sifre !== f.sifre2) { bildir('Şifreler aynı değil.', 'hata'); return false; }
          Kilit.sifreDegistir(f.eski, f.sifre)
            .then(() => bildir('Şifre değiştirildi.'))
            .catch(e => bildir(e.message, 'hata', 5000));
        }
      }
    ]
  });
  gucBagla(m);
});

eylemKaydet('kilit-kullanici', () => {
  modalAc({
    baslik: 'Kullanıcı adı',
    govde: alan('Kilit ekranında görünecek ad',
      girdi('kullanici', { deger: Kilit.kilitliKullanici(), yer: 'Adın ya da takma adın' })),
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          Kilit.kullaniciDegistir(formOku(kok).kullanici);
          bildir('Kaydedildi.');
          document.dispatchEvent(new CustomEvent('gorunum-yenile'));
        }
      }
    ]
  });
});

eylemKaydet('kilit-kaldir', () => {
  modalAc({
    baslik: 'Kilidi kaldır',
    govde: `
      <p class="kucuk r-muted alt-12" style="line-height:1.65">
        Kilit kaldırılınca verilerin bu cihazda <b>şifresiz</b> saklanmaya döner
        ve uygulama açılışta şifre sormaz.
      </p>
      ${alan('Mevcut şifren', girdi('sifre', { tur: 'password' }))}`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kilidi kaldır', sinif: 'b-tehli', tikla: kok => {
          Kilit.kilitKaldir(formOku(kok).sifre)
            .then(veri => {
              durumuDegistir(veri);
              bildir('Kilit kaldırıldı.', 'bilgi');
              document.dispatchEvent(new CustomEvent('gorunum-yenile'));
            })
            .catch(e => bildir(e.message, 'hata', 5000));
        }
      }
    ]
  });
});

/* ---------- kaynak tanılama ---------- */

eylemKaydet('kaynak-test', async (_v, _e, oge) => {
  const kap = document.getElementById('kaynakSonuc');
  if (!kap) return;

  const f = frenDurumu(true);
  if (!f.izin) {
    kap.innerHTML = `<div class="ust-12">${notKutu('bilgi',
      f.sebep === 'gunluk-limit'
        ? `Günlük istek sınırına ulaşıldı. Kaynakları yormamak için yarın sıfırlanacak.`
        : `Çok sık deneme. ${f.kalanSaniye} saniye sonra tekrar dene.`)}</div>`;
    return;
  }

  oge.disabled = true;
  const eskiMetin = oge.textContent;
  oge.textContent = 'test ediliyor…';
  kap.innerHTML = `<div class="mini r-muted ust-12">Her kaynak tek tek deneniyor…</div>`;

  let sonuc;
  try { sonuc = await kaynakTesti(); }
  catch (e) { sonuc = []; }

  oge.disabled = false;
  oge.textContent = eskiMetin;

  const ad = { usd: 'USD/TRY', eur: 'EUR/TRY', onsAltin: 'Ons altın', onsGumus: 'Ons gümüş',
               gramAltin: 'Gram altın', gramGumus: 'Gram gümüş', bist: 'BIST 100' };
  const calisan = sonuc.filter(x => x.durum === 'calisiyor');

  kap.innerHTML = `
    <div class="ust-12">
      <div class="tablo-sar"><table class="veri">
        <thead><tr><th>Kaynak</th><th>Durum</th><th>Döndürdüğü</th><th class="num">Süre</th></tr></thead>
        <tbody>${sonuc.map(x => `
          <tr>
            <td class="kalin" style="font-size:12.5px">${kac(x.ad)}</td>
            <td>${x.durum === 'calisiyor' ? rozet('çalışıyor', 'em')
                : x.durum === 'hata' ? rozet('ulaşılamadı', 'red')
                : x.durum === 'bos' ? rozet('boş yanıt', 'amber')
                : rozet('atlandı', 'notr')}</td>
            <td class="mini">${x.alanlar && x.alanlar.length
                ? x.alanlar.map(a => `${kac(ad[a.alan] || a.alan)} <b>${n(a.deger, 2)}</b>`).join(' · ')
                : `<span class="r-faint">${kac(x.not || '—')}</span>`}</td>
            <td class="num mini r-faint">${x.sure !== undefined ? x.sure + ' ms' : '—'}</td>
          </tr>`).join('')}
        </tbody></table></div>

      <div class="ust-12">${notKutu(calisan.length ? 'iyi' : 'kotu',
        calisan.length
          ? `<b>${calisan.length} kaynak çalışıyor.</b> Uygulama bunları sırayla kullanır: ilk kaynak
             hangi alanları verirse onlar alınır, eksik kalanlar için sıradaki kaynak denenir.
             Bir kaynağın düşmesi diğerlerini etkilemez.`
          : `<b>Hiçbir kaynağa ulaşılamadı.</b> İnternet bağlantını kontrol et.
             Sorun sürerse değerleri yukarıdaki kutulardan elle girebilirsin —
             uygulamanın geri kalanı elle girilen değerlerle de tam çalışır.`)}</div>

      ${sonuc.some(x => x.id === 'proxy' && x.durum === 'atlandi')
        ? `<div class="mini r-faint ust-8">BIST 100 yalnızca Worker proxy üzerinden gelir; adres girilmediği için o kaynak atlandı.</div>` : ''}
    </div>`;
});
