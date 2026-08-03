/* Bugün — açılış ekranı. Tek bakışta durum, baskı değil bilgi. */

import { durum, kaydet } from '../core/store.js';
import { piyasa, gecmisSeri, erimeHesapla } from '../core/market.js';
import * as H from '../core/hesap.js';
import { tl, tlKisa, tlIsaret, yuzde, yuzdeIsaret, n, tarihKisa, tarihUzun, vadeMetni, kac, sayiOku, bugun, buAy, ayKisa, goreliZaman } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, kaynakEtiketi, eylemKaydet, bildir, modalAc, formOku } from '../core/ui.js';
import * as G from '../core/chart.js';
import { KATEGORI_RENK } from '../core/sabitler.js';

export const bugunGorunum = {
  ad: 'bugun', ikon: '◐', etiket: 'Bugün',
  baslik: 'Bugün',
  alt: 'Elindeki paranın gerçek durumu — hesabındaki rakam değil, harcayabileceğin rakam.',

  ciz() {
    const gg = H.gunlukGuvenli();
    const saglik = H.finansalSaglik();

    return piyasaSeridi()
      + (durum.kurulumTamam ? '' : hosgeldin())
      + gunlukKart(gg)
      + `<div class="izgara iz-21 ust-16">
           <div>${yukumlulukKart(gg)}${haftaKart(gg)}</div>
           <div>${saglikKart(saglik)}${erimeKart()}</div>
         </div>`
      + `<div class="izgara iz-2 ust-16">${kategoriKart()}${acilFonKart()}</div>`;
  }
};

/* ---------- piyasa şeridi ---------- */

function piyasaSeridi() {
  const kutu = (ad, d, bicim, ipucu) => {
    const bosMu = d.deger === null;
    return `<div class="serit-kutu ${bosMu ? 'bos' : ''}">
      <div class="ad">${kac(ad)} ${kaynakEtiketi(d)}</div>
      <div class="fi">${bosMu ? '—' : bicim(d.deger)}</div>
      <div class="dg r-faint mini">${bosMu ? (ipucu || 'elle girebilirsin') : (d.zaman ? goreliZaman(d.zaman) : '')}</div>
    </div>`;
  };

  return `<div class="serit">
    ${kutu('USD/TRY', piyasa.usd, v => n(v, 2))}
    ${kutu('EUR/TRY', piyasa.eur, v => n(v, 2))}
    ${kutu('Gram altın', piyasa.gramAltin, v => n(v) + ' ₺')}
    ${kutu('Gram gümüş', piyasa.gramGumus, v => n(v, 2) + ' ₺')}
    ${kutu('BIST 100', piyasa.bist, v => n(v), 'proxy gerekir')}
    <div class="serit-kutu" style="display:flex;align-items:center;justify-content:center;min-width:118px">
      <button class="dg-btn b-sade b-kucuk" data-eylem="piyasa-yenile" ${piyasa.cekiliyor ? 'disabled' : ''}>
        ${piyasa.cekiliyor ? 'çekiliyor…' : '⟳ Yenile'}</button>
    </div>
  </div>`;
}

/* ---------- hoş geldin ---------- */

function hosgeldin() {
  return kart('', `
    <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div style="font-size:30px;line-height:1">◈</div>
      <div class="buyu" style="min-width:240px">
        <h3 style="font-size:17px;margin-bottom:6px">Hoş geldin. Baştan başlıyoruz.</h3>
        <p class="kucuk r-ink" style="line-height:1.65;margin-bottom:10px">
          Bu araç sana ne yapman gerektiğini söylemeye değil, <b>durumunu göstermeye</b> çalışır.
          Eksi olmak, borçlu olmak sorun değil — görülmeyen para sorundur.
          Üç şey girersen tablo kurulur: elindeki nakit, aylık gelirin ve sabit giderlerin.
        </p>
        <div class="dg-grup">
          <button class="dg-btn b-ana b-kucuk" data-eylem="kurulum-baslat">Kuruluma başla</button>
          <button class="dg-btn b-sade b-kucuk" data-eylem="kurulum-atla">Sonra yaparım</button>
        </div>
      </div>
    </div>`, { sinif: 'ust-0' });
}

/* ---------- günlük harcanabilir ---------- */

function gunlukKart(gg) {
  if (!gg.yeterliVeri) {
    return kart('Güvenli günlük harcama', bos(
      'Henüz hesaplayamıyorum',
      'Elindeki nakdi ve sabit giderlerini gir; bir sonraki gelirine kadar güvenle harcayabileceğin günlük tutarı hesaplayayım.',
      '◐'
    ) + `<div class="merkez ust-12"><button class="dg-btn b-ana b-kucuk" data-eylem="nakit-duzenle">Nakdimi gir</button></div>`);
  }

  const asti = gg.bugunHarcanan > gg.gunluk && gg.gunluk > 0;
  const oran = gg.gunluk > 0 ? Math.min(gg.bugunHarcanan / gg.gunluk * 100, 100) : 0;

  const govde = `
    <div class="izgara iz-4 alt-16">
      ${dosem({ etiket: 'Elde / hesapta', deger: tl(gg.nakit), ipucu: durum.nakit.guncelleme ? tarihKisa(durum.nakit.guncelleme) + ' güncellendi' : 'hiç güncellenmedi', ikon: '◉' })}
      ${dosem({ etiket: 'Rezerve', deger: tl(gg.rezerve), ipucu: `${gg.gun} gün içinde ödenecek ${gg.yukumlulukler.length} kalem`, renk: 'r-amber', ikon: '◧' })}
      ${dosem({ etiket: 'Serbest', deger: tl(gg.serbest), ipucu: gg.serbest < 0 ? 'Bu pencereyi mevcut nakitle kapatamıyorsun' : 'gerçekten senin olan', renk: gg.serbest < 0 ? 'r-red' : 'r-em', vurgu: gg.serbest < 0 ? 'kotu' : 'iyi', ikon: '◇' })}
      ${dosem({ etiket: 'Güvenli günlük', deger: tl(Math.max(gg.gunluk, 0)), ipucu: `${gg.gun} gün × bugünden itibaren`, renk: 'r-gold', vurgu: 'vurgu', ikon: '◐' })}
    </div>

    <div class="esnek-ara alt-8">
      <span class="kucuk r-muted">Bugün harcadığın</span>
      <span class="num kalin" style="font-size:15px">${tl(gg.bugunHarcanan)}
        <span class="mini r-faint" style="font-weight:600">/ ${tl(Math.max(gg.gunluk, 0))}</span></span>
    </div>
    <div class="cubuk kalin"><i class="${asti ? 'k' : ''}" style="width:${oran.toFixed(1)}%"></i></div>
    <div class="kucuk ust-8" style="color:var(--ink-2);line-height:1.6">${mesaj(gg, asti)}</div>

    <div class="dg-grup ust-12">
      <button class="dg-btn b-ana b-kucuk" data-eylem="harcama-ekle">＋ Harcama ekle</button>
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="nakit-duzenle">Nakdi güncelle</button>
    </div>`;

  const yan = gg.sonrakiGelir
    ? `sonraki gelir: ${tarihKisa(gg.sonrakiGelir.tarih)} · ${tl(gg.sonrakiGelir.tutar)}`
    : 'gelir tarihi girilmedi — ay sonuna göre hesaplandı';

  return kart('Güvenli günlük harcama', govde, { ikon: '◐', yan: kac(yan) });
}

function mesaj(gg, asti) {
  if (gg.acik > 0) {
    return `Bir sonraki gelirine kadar ödenecekler, elindeki nakdi <b class="r-red">${tl(gg.acik)}</b> aşıyor.
      Bu bir suçlama değil, bir tablo: Faturalar ekranındaki öncelik sırası hangisini önce ödemen gerektiğini gösteriyor.
      ${gg.sonrakiGelir ? `Gelirin ${vadeMetni(gg.sonrakiGelir.kalanGun).toLowerCase()} geliyor.` : ''}`;
  }
  if (gg.gunluk <= 0) {
    return 'Serbest paran günlük harcamaya yetmiyor. Önce yükümlülükler, sonra kalanı gün sayısına bölüyoruz.';
  }
  if (asti) {
    const fazla = gg.bugunHarcanan - gg.gunluk;
    return `Bugün günlük payını <b>${tl(fazla)}</b> aştın. Ay batmadı — önümüzdeki günlerde dengelenir.
      Kalan ${gg.gun} günde günlük pay <b>${tl(Math.max((gg.serbest - gg.tampon - gg.bugunHarcanan) / Math.max(gg.gun - 1, 1), 0))}</b> olur.`;
  }
  return `Bugün için <b class="r-em">${tl(gg.bugunKalan)}</b> alanın var.
    Bu rakam, ${gg.sonrakiGelir ? 'bir sonraki gelirine' : 'ay sonuna'} kadar ödenecek
    <b>${tl(gg.rezerve)}</b> tutarındaki yükümlülük ayrıldıktan sonra kalandır.`;
}

/* ---------- yaklaşan yükümlülükler ---------- */

function yukumlulukKart(gg) {
  const liste = gg.yukumlulukler.slice(0, 6);
  if (!liste.length) {
    return kart('Yaklaşan ödemeler', bos('Yaklaşan ödeme yok', 'Faturalarını ve düzenli giderlerini girersen burada vade sırasıyla görünür.', '◳'), { ikon: '◳' });
  }

  const govde = liste.map(y => {
    const gecikti = y.kalanGun < 0;
    const yakin = y.kalanGun >= 0 && y.kalanGun <= 3;
    return `<div class="oge">
      <div class="im" style="background:${gecikti ? 'var(--red-dim)' : yakin ? 'var(--amber-dim)' : 'var(--surface-3)'};color:${gecikti ? 'var(--red)' : yakin ? 'var(--amber)' : 'var(--muted)'}">${y.puan}</div>
      <div class="gvd">
        <div class="ad">${kac(y.ad)}${y.kaynak === 'borc' ? rozet(y.tur === 'kk' ? 'kart asgari' : 'taksit', 'red') : ''}</div>
        <div class="ayr">${tarihKisa(y.vade)} · ${kac(vadeMetni(y.kalanGun))}${y.otomatik ? ' · otomatik' : ''}</div>
      </div>
      <div class="sag"><div class="tut">${tl(y.tutar)}</div></div>
    </div>`;
  }).join('');

  return kart('Yaklaşan ödemeler', govde
    + (gg.yukumlulukler.length > 6 ? `<div class="merkez ust-8"><button class="dg-btn b-sade b-kucuk" data-eylem="git" data-hedef="faturalar">Tümünü gör (${gg.yukumlulukler.length})</button></div>` : ''),
    { ikon: '◳', yan: 'öncelik sırasına göre', not: 'Soldaki sayı öncelik puanı: kesinti riski, gecikme faizi ve kredi notu etkisi birlikte değerlendirilir.' });
}

/* ---------- son 14 gün ---------- */

function haftaKart(gg) {
  const gunler = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    gunler.push({ etiket: String(d.getDate()), deger: H.gunToplamHarcama(t) });
  }
  const toplam = gunler.reduce((a, g) => a + g.deger, 0);
  const dolu = gunler.filter(g => g.deger > 0).length;

  if (!toplam) {
    return kart('Son 14 gün', bos('Harcama kaydı yok', 'Bir harcama eklediğinde günlük dağılımın burada çizilir.', '◱'), { ikon: '◱' });
  }

  return kart('Son 14 gün', `<div class="grafik">${G.sutun(gunler, {
    yukseklik: 168, esik: gg.gunluk > 0 ? gg.gunluk : null,
    esikEtiket: gg.gunluk > 0 ? 'günlük pay' : ''
  })}</div>
  <div class="esnek-ara kucuk ust-8">
    <span class="r-muted">${dolu} günde kayıt · toplam <b class="r-ink">${tl(toplam)}</b></span>
    <span class="r-muted">günlük ort. <b class="r-ink">${tl(toplam / 14)}</b></span>
  </div>`, { ikon: '◱' });
}

/* ---------- finansal sağlık ---------- */

function saglikKart(s) {
  if (!s.yeterliVeri) {
    return kart('Finansal sağlık', bos('Veri bekleniyor', 'Gelir, gider ve harcama girdikçe burada beş bileşenli bir sağlık tablosu oluşur.', '◈'), { ikon: '◈' });
  }

  const govde = `
    <div class="merkez alt-12">
      ${G.gosterge(s.puan, {
        min: 0, max: 100, etiket: String(s.puan), altEtiket: s.seviye,
        renk: `var(--${s.renk})`,
        dilimler: [
          { min: 0, max: 40, renk: 'var(--red)' },
          { min: 40, max: 70, renk: 'var(--gold)' },
          { min: 70, max: 100, renk: 'var(--em)' }
        ]
      })}
    </div>
    ${s.bilesenler.map(b => `
      <div style="margin-bottom:9px">
        <div class="esnek-ara mini alt-8" style="margin-bottom:3px">
          <span class="kalin">${kac(b.ad)}</span>
          <span class="num r-muted">${Math.round(b.puan)}</span>
        </div>
        <div class="cubuk ince"><i class="${b.puan >= 70 ? '' : b.puan >= 40 ? 'g' : 'k'}" style="width:${b.puan.toFixed(0)}%"></i></div>
        <div class="mini r-faint" style="margin-top:3px">${kac(b.aciklama)}</div>
      </div>`).join('')}`;

  return kart('Finansal sağlık', govde, { ikon: '◈', not: 'Bu puan bir not değil, bir aynadır. Düşük puan başarısızlık değil — nereye bakman gerektiğini söyler.' });
}

/* ---------- TL'nin erimesi ---------- */

function erimeKart() {
  const nakit = Number(durum.nakit.tutar) || 0;
  const seri = gecmisSeri('usd', 90);

  if (seri.length < 2) {
    return kart('Paranın değeri', `
      ${notKutu('bilgi', `Bu araç <b>gerçek geçmiş</b> kullanır: elinde tuttuğun TL'nin değerini,
        uygulamayı açtığın günlerde okunan kurlarla karşılaştırır. Henüz ${seri.length} günlük kayıt var.
        Birkaç gün sonra buraya senin paranın gerçek erime grafiği çizilecek — tahmin değil, ölçüm.`)}
      ${piyasa.usd.deger && nakit > 0 ? `
        <div class="izgara iz-2 ust-12">
          ${dosem({ etiket: 'Elindeki nakit', deger: tl(nakit), ikon: '◉' })}
          ${dosem({ etiket: 'Dolar karşılığı', deger: '$' + n(nakit / piyasa.usd.deger), ipucu: `kur ${n(piyasa.usd.deger, 2)}`, renk: 'r-blue', ikon: '$' })}
        </div>
        ${piyasa.gramAltin.deger || piyasa.gramGumus.deger ? `<div class="izgara iz-2 ust-12">
          ${piyasa.gramAltin.deger ? dosem({
            etiket: 'Gram altın karşılığı',
            deger: n(nakit / piyasa.gramAltin.deger, 2) + ' gr',
            ipucu: `gram ${n(piyasa.gramAltin.deger)} ₺`, renk: 'r-gold', ikon: '◆'
          }) : ''}
          ${piyasa.gramGumus.deger ? dosem({
            etiket: 'Gram gümüş karşılığı',
            deger: n(nakit / piyasa.gramGumus.deger, 1) + ' gr',
            ipucu: `gram ${n(piyasa.gramGumus.deger, 2)} ₺`, renk: 'r-muted', ikon: '◇'
          }) : ''}
        </div>` : ''}` : ''}
    `, { ikon: '◇' });
  }

  const e = erimeHesapla(nakit || 10000, 'usd', 90);
  const ilkG = seri[0], sonG = seri[seri.length - 1];
  const kurArtis = (sonG.deger / ilkG.deger - 1) * 100;

  return kart('Paranın değeri', `
    <div class="grafik alt-12">${G.cizgi(seri.map(s => ({ etiket: s.etiket, deger: s.deger })), {
      yukseklik: 150, bicim: v => n(v, 2), alan: true, nokta: false
    })}</div>
    <div class="izgara iz-2">
      ${dosem({ etiket: 'USD/TRY değişimi', deger: yuzdeIsaret(kurArtis, 1), ipucu: `${seri.length} günlük kendi kaydın`, renk: kurArtis > 0 ? 'r-red' : 'r-em', ikon: '↗' })}
      ${dosem({
        etiket: 'Aynı TL kaç dolar', deger: e ? '$' + n(e.bugunAdet) : '—',
        ipucu: e ? `${tarihKisa(e.ilkTarih)}: $${n(e.ilkAdet)} → bugün $${n(e.bugunAdet)}` : '',
        renk: e && e.degisimYuzde < 0 ? 'r-red' : 'r-em', ikon: '$'
      })}
    </div>
    ${e ? `<div class="kucuk ust-12" style="color:var(--ink-2);line-height:1.6">
      Elindeki <b>${tl(nakit || 10000)}</b>${nakit ? '' : ' (örnek)'},
      ${tarihKisa(e.ilkTarih)} tarihinde <b>$${n(e.ilkAdet)}</b> ederken bugün <b>$${n(e.bugunAdet)}</b> ediyor:
      <b class="${e.degisimYuzde < 0 ? 'r-red' : 'r-em'}">${yuzdeIsaret(e.degisimYuzde, 1)}</b>.
      Bu kayıp faiz kazanmadığın için değil, hiçbir şey yapmadığın için oluşur.
    </div>` : ''}
  `, { ikon: '◇', yan: 'kendi kayıtların' });
}

/* ---------- kategori dağılımı ---------- */

function kategoriKart() {
  const d = H.kategoriDagilim();
  const toplam = d.reduce((a, x) => a + x.deger, 0);

  if (!d.length) {
    return kart('Bu ay nereye gitti', bos('Bu ay kayıt yok', 'Harcama ekledikçe kategori dağılımın burada oluşur.', '◱'), { ikon: '◱' });
  }

  const renkli = d.map(x => ({ ...x, renk: KATEGORI_RENK[x.ad] || 'var(--muted)' }));

  return kart('Bu ay nereye gitti', `
    <div class="izgara iz-2" style="align-items:center">
      <div>${G.halka(renkli, { boyut: 150, kalinlik: 20, ortaUst: tlKisa(toplam), ortaAlt: 'bu ay' })}</div>
      <div>${G.yatayListe(renkli, { maxSatir: 7 })}</div>
    </div>`, { ikon: '◱', yan: kac(d.length + ' kategori') });
}

/* ---------- acil fon ---------- */

function acilFonKart() {
  const af = H.acilFonDurumu();

  if (!af.yeterliVeri) {
    return kart('Acil durum fonu', bos(
      'Önce zorunlu giderin lazım',
      'Sabit giderlerini gir; kaç aylık acil fona ihtiyacın olduğunu hane yapına göre hesaplayayım.', '◈'
    ), { ikon: '◈' });
  }

  return kart('Acil durum fonu', `
    <div class="esnek-ara alt-8">
      <div>
        <div class="mini r-muted">Biriken</div>
        <div class="num kalin r-em" style="font-size:22px">${tl(af.biriken)}</div>
      </div>
      <div class="sag">
        <div class="mini r-muted">Hedef (${af.hedefAy.ay} ay)</div>
        <div class="num kalin" style="font-size:17px">${tl(af.hedef)}</div>
      </div>
    </div>
    <div class="cubuk kalin"><i style="width:${af.yuzde.toFixed(1)}%"></i></div>
    <div class="kucuk ust-8" style="color:var(--ink-2);line-height:1.6">
      Şu an <b>${af.kalanAy.toFixed(1)} aylık</b> zorunlu giderini karşılıyor.
      Aylık zorunlu giderin <b>${tl(af.zorunlu.toplam)}</b>.
      <span class="r-faint">${kac(af.hedefAy.gerekce)}</span>
    </div>
    <div class="dg-grup ust-12">
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="git" data-hedef="yatirim">Acil fona ekle</button>
    </div>`, { ikon: '◈' });
}

/* ============================================================
   Eylemler
   ============================================================ */

eylemKaydet('nakit-duzenle', () => {
  const m = modalAc({
    baslik: 'Elindeki para',
    govde: `
      <p class="kucuk r-muted alt-12" style="line-height:1.6">
        Banka hesaplarında ve cebinde <b>şu anda</b> duran, harcanabilir toplam TL.
        Yatırımlarını (döviz, altın, fon) buraya yazma — onlar Yatırım ekranına girilir.
      </p>
      <label class="alan"><span class="et">Toplam nakit (₺)</span>
        <input type="text" name="tutar" inputmode="decimal" value="${durum.nakit.tutar || ''}" placeholder="12500"></label>
      ${durum.nakit.guncelleme ? `<div class="mini r-faint">Son güncelleme: ${tarihUzun(durum.nakit.guncelleme)}</div>` : ''}`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const v = sayiOku(formOku(kok).tutar);
          if (v < 0) { bildir('Negatif tutar girilemez.', 'hata'); return false; }
          durum.nakit.tutar = v;
          durum.nakit.guncelleme = bugun();
          const g = durum.nakit.gecmis || (durum.nakit.gecmis = []);
          const son = g[g.length - 1];
          if (son && son.tarih === bugun()) son.tutar = v; else g.push({ tarih: bugun(), tutar: v });
          if (g.length > 200) g.shift();
          kaydet('nakit');
          bildir('Nakit güncellendi.');
        }
      }
    ]
  });
  return m;
});

eylemKaydet('kurulum-atla', () => {
  durum.kurulumTamam = true;
  kaydet('kurulum');
});
