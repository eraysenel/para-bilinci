/* Gizlilik & KVKK — vaat değil, kanıt.

   Bu ekranın amacı "verilerinize saygı duyuyoruz" demek değil; cihazda ne
   olduğunu kullanıcının GÖZÜYLE GÖRMESİNİ sağlamak. Depolama tablosu canlıdır,
   gerçek localStorage içeriğini okur. Ağ trafiği listesi koddaki gerçek
   çağrılardır. Güven, denetlenebilirlikten gelir.
*/

import { durum, yedekAl } from '../core/store.js';
import * as Kilit from '../core/kilit.js';
import * as H from '../core/hesap.js';
import { kac, n, bugun, tarihUzun } from '../core/fmt.js';
import { dosem, kart, notKutu, rozet, eylemKaydet, bildir, modalAc } from '../core/ui.js';

/** Uygulamanın kullandığı depolama anahtarları — tek doğru liste. */
const ANAHTARLAR = [
  { k: 'pb2_durum',         tur: 'local',   ad: 'Finansal kayıtların',        aciklama: 'Gelir, gider, borç, varlık, hedef, sepet, ders ilerlemen. Kilit kuruluysa bu anahtar bulunmaz.' },
  { k: 'pb2_kilit',         tur: 'local',   ad: 'Şifrelenmiş kayıtların',     aciklama: 'Kilit kuruluyken yukarıdakinin AES-GCM ile şifrelenmiş hâli. Okunabilir içerik yoktur.' },
  { k: 'pb2_kilit_oturum',  tur: 'session', ad: 'Sekme oturum anahtarı',      aciklama: '"Bu sekmede açık kal" seçiliyse. Sekmeyi kapatınca silinir; diske yazılmaz.' },
  { k: 'pb2_piyasa_gecmis', tur: 'local',   ad: 'Gördüğün piyasa fiyatları',  aciklama: 'Uygulamayı açtığın günlerde okunan kur/altın/gümüş değerleri. Kişisel veri içermez.' }
];

const ESKI_ANAHTARLAR = ['ao_items', 'ao_exp', 'ao_sells', 'ao_debts', 'ao_settings', 'cf_ses', 'pb2_ai_oturum'];

/** Uygulamanın yaptığı TÜM dış ağ istekleri. Kod denetlenerek çıkarılmıştır. */
const AG_TRAFIGI = [
  { host: 'cdn.jsdelivr.net',           amac: 'Döviz kuru ve ons altın/gümüş fiyatı',  sahip: 'jsDelivr (Prospect One, Polonya)', politika: 'https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net' },
  { host: 'latest.currency-api.pages.dev', amac: 'Yukarıdakinin yedeği',                sahip: 'Cloudflare Pages (ABD)',           politika: 'https://www.cloudflare.com/privacypolicy/' },
  { host: 'open.er-api.com',            amac: 'Döviz kuru (yedek)',                     sahip: 'ExchangeRate-API (ABD)',           politika: 'https://www.exchangerate-api.com/docs/privacy-policy' },
  { host: 'api.frankfurter.app',        amac: 'Döviz kuru (yedek, ECB verisi)',         sahip: 'Frankfurter (açık kaynak)',        politika: 'https://frankfurter.dev/' },
  { host: 'api.gold-api.com',           amac: 'Ons altın ve gümüş (yedek)',             sahip: 'gold-api.com',                     politika: '' }
];

export const gizlilikGorunum = {
  ad: 'gizlilik', ikon: '⛨', etiket: 'Gizlilik',
  baslik: 'Gizlilik & KVKK',
  alt: 'Bu sayfa bir söz değil, bir denetim. Aşağıdaki tablolar cihazındaki gerçek veriyi ve uygulamanın yaptığı gerçek ağ isteklerini gösterir.',

  ciz() {
    return ozet() + depolamaKart() + agKart() + kvkkKart() + haklarKart() + cerezKart() + sinirKart();
  }
};

/* ---------- özet ---------- */

function ozet() {
  return `<div class="izgara iz-4 alt-16">
    ${dosem({ etiket: 'Sunucu', deger: 'Yok', ipucu: 'veriler hiçbir yere gönderilmez', renk: 'r-em', vurgu: 'iyi', ikon: '⛨' })}
    ${dosem({ etiket: 'Hesap / üyelik', deger: 'Yok', ipucu: 'e-posta, telefon, ad istenmez', renk: 'r-em', vurgu: 'iyi', ikon: '○' })}
    ${dosem({ etiket: 'Çerez', deger: 'Yok', ipucu: 'tek bir çerez bile kullanılmaz', renk: 'r-em', vurgu: 'iyi', ikon: '○' })}
    ${dosem({ etiket: 'Reklam / analitik', deger: 'Yok', ipucu: 'izleme kodu, piksel, ölçümleme yok', renk: 'r-em', vurgu: 'iyi', ikon: '○' })}
  </div>

  ${notKutu('iyi',
    `<b>Tek cümleyle:</b> girdiğin hiçbir finansal bilgi cihazından çıkmaz.
     Bu bir politika tercihi değil, mimarinin sonucudur — gönderecek bir sunucu yok.
     Site sabit dosyalardan ibarettir ve tüm hesaplar senin tarayıcında yapılır.`)}`;
}

/* ---------- cihazda ne var ---------- */

function boyut(metin) {
  if (metin === null) return null;
  return new Blob([metin]).size;
}
function boyutYaz(b) {
  if (b === null) return '—';
  if (b < 1024) return b + ' B';
  return (b / 1024).toFixed(1).replace('.', ',') + ' KB';
}

function depolamaKart() {
  const satirlar = ANAHTARLAR.map(a => {
    let ham = null;
    try { ham = (a.tur === 'session' ? sessionStorage : localStorage).getItem(a.k); } catch { }
    return { ...a, ham, b: boyut(ham) };
  });

  const eskiVar = ESKI_ANAHTARLAR.filter(k => {
    try { return localStorage.getItem(k) !== null; } catch { return false; }
  });

  const toplam = satirlar.reduce((t, s) => t + (s.b || 0), 0);

  return kart('Bu cihazda ne duruyor', `
    <div class="kart-not">
      Aşağıdaki tablo <b>şu anda</b> tarayıcında kayıtlı olanı okur — örnek değil, gerçek.
      Aynı listeyi tarayıcının geliştirici araçlarından (F12 → Application → Local Storage) da görebilirsin.
    </div>

    <div class="tablo-sar"><table class="veri">
      <thead><tr><th>Anahtar</th><th>İçerik</th><th>Nerede</th><th class="num">Boyut</th></tr></thead>
      <tbody>${satirlar.map(s => `
        <tr>
          <td><code style="font-size:11.5px">${kac(s.k)}</code></td>
          <td>
            <div class="kalin" style="font-size:12.5px">${kac(s.ad)}
              ${s.ham === null ? rozet('yok', 'notr') : rozet('var', 'em')}</div>
            <div class="mini r-faint">${kac(s.aciklama)}</div>
          </td>
          <td class="mini r-muted">${s.tur === 'session' ? 'sekme belleği' : 'tarayıcı deposu'}</td>
          <td class="num mini">${boyutYaz(s.b)}</td>
        </tr>`).join('')}
      </tbody></table></div>

    <div class="izgara iz-3 ust-12">
      ${dosem({ etiket: 'Toplam yer kaplayan', deger: boyutYaz(toplam) })}
      ${dosem({ etiket: 'Şifreleme', deger: Kilit.kilitKurulu() ? 'Açık' : 'Kapalı',
                ipucu: Kilit.kilitKurulu() ? 'AES-GCM 256' : 'Ayarlar\'dan açabilirsin',
                renk: Kilit.kilitKurulu() ? 'r-em' : 'r-muted' })}
      ${dosem({ etiket: 'Sunucuya gönderilen', deger: '0 bayt', renk: 'r-em' })}
    </div>

    ${eskiVar.length ? `<div class="ust-12">${notKutu('uyari',
      `Eski sürümden kalan <b>${eskiVar.length} anahtar</b> tarayıcında duruyor
       (<code>${eskiVar.map(kac).join('</code>, <code>')}</code>). Yeni sürüm bunları kullanmıyor.
       Ayarlar → Verilerin bölümünden temizleyebilirsin.`)}</div>` : ''}

    <div class="dg-grup ust-12">
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="gizlilik-ham">Ham veriyi göster</button>
      <button class="dg-btn b-cizgi b-kucuk" data-eylem="yedek-al">↓ Verilerimi indir</button>
      <button class="dg-btn b-tehli b-kucuk" data-eylem="hepsini-sil">Hepsini sil</button>
    </div>`, { ikon: '◱' });
}

/* ---------- cihazdan ne çıkıyor ---------- */

function agKart() {
  const proxy = (durum.piyasa.proxyUrl || '').trim();

  return kart('Cihazından ne çıkıyor', `
    <div class="kart-not">
      Uygulamanın yaptığı <b>tüm</b> dış istekler aşağıdadır. Hiçbirine finansal verin eklenmez —
      hepsi "bugünün kuru nedir" tipinde, parametresiz sorgulardır.
      Bu listeyi tarayıcının Ağ (Network) sekmesinden doğrulayabilirsin.
    </div>

    <div class="tablo-sar"><table class="veri">
      <thead><tr><th>Adres</th><th>Ne için</th><th>Kim işletiyor</th></tr></thead>
      <tbody>${AG_TRAFIGI.map(x => `
        <tr>
          <td><code style="font-size:11.5px">${kac(x.host)}</code></td>
          <td class="mini">${kac(x.amac)}</td>
          <td class="mini r-muted">${kac(x.sahip)}
            ${x.politika ? `<br><a href="${kac(x.politika)}" target="_blank" rel="noopener" class="mini">gizlilik politikası ↗</a>` : ''}</td>
        </tr>`).join('')}
        ${proxy ? `<tr>
          <td><code style="font-size:11.5px">${kac(new URL(proxy).host)}</code></td>
          <td class="mini">BIST 100 (senin kurduğun proxy)</td>
          <td class="mini r-muted">Sen · Cloudflare Workers</td>
        </tr>` : ''}
      </tbody></table></div>

    ${notKutu('bilgi',
      `<b>Ne gönderiliyor:</b> hiçbir kişisel veri. Bu isteklerde ne adın, ne gelirin,
       ne harcaman, ne de herhangi bir kimlik bilgisi yer alır.<br>
       <b>Ne görülebiliyor:</b> her internet isteğinde olduğu gibi <b>IP adresin</b> ve tarayıcı
       bilgin ilgili sunucuya ulaşır. Bu, o siteleri işleten üçüncü tarafların bilgisidir;
       bizim erişimimiz yoktur. IP adresi KVKK kapsamında kişisel veri sayılabilir,
       bu yüzden burada açıkça belirtiyoruz.<br>
       <b>Nasıl kaçınırsın:</b> Ayarlar'dan otomatik çekimi kapatıp değerleri elle girersen
       uygulama hiçbir dış istek yapmaz ve tamamen çevrimdışı çalışır.`)}

    <div class="ust-12">${notKutu('notr',
      `<b>Barındırma.</b> Site GitHub Pages üzerinde yayınlanır. Her web sitesinde olduğu gibi
       barındırma sağlayıcısı bağlantı kayıtlarını (IP, tarih, istenen dosya) tutabilir.
       Bu kayıtlara erişimimiz yoktur ve içlerinde senin finansal verin bulunmaz —
       çünkü o veri hiçbir zaman sunucuya gitmez.
       GitHub ABD merkezlidir; bu bir <b>yurt dışına aktarım</b> anlamına gelir ve
       yalnızca bağlantı bilgisiyle sınırlıdır.`)}</div>`, { ikon: '↗' });
}

/* ---------- KVKK aydınlatma ---------- */

function kvkkKart() {
  const g = (H.referans() || {}).gizlilik || {};
  const eksik = !g.veriSorumlusu || !g.iletisimEposta;

  const bolum = (bas, icerik) => `
    <div style="margin-bottom:14px">
      <div class="kalin" style="font-size:13.5px;margin-bottom:4px">${bas}</div>
      <div class="kucuk" style="color:var(--ink-2);line-height:1.7">${icerik}</div>
    </div>`;

  return kart('KVKK Aydınlatma Metni', `
    <div class="kart-not">
      6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi uyarınca hazırlanmıştır.
      ${g.sonGuncelleme ? `Son güncelleme: <b>${kac(g.sonGuncelleme)}</b>.` : ''}
    </div>

    ${eksik ? notKutu('uyari',
      `<b>Bu metin henüz tamamlanmadı.</b> KVKK, veri sorumlusunun kimliğini ve bir başvuru
       kanalını zorunlu kılar. <code>data/referans.json</code> içindeki <code>gizlilik</code>
       bölümüne <b>veriSorumlusu</b> ve <b>iletisimEposta</b> alanlarını girmen gerekiyor.
       Bu alanları senin adına doldurmadım — kişisel iletişim bilgisinin yayınlanması senin kararın.`) : ''}

    <div class="ust-12">
      ${bolum('1. Veri sorumlusu',
        g.veriSorumlusu
          ? `${kac(g.veriSorumlusu)}${g.iletisimEposta ? ` · <a href="mailto:${kac(g.iletisimEposta)}">${kac(g.iletisimEposta)}</a>` : ''}
             ${g.iletisimAdres ? `<br>${kac(g.iletisimAdres)}` : ''}`
          : `<span class="r-amber">— doldurulmalı —</span>`)}

      ${bolum('2. İşlenen kişisel veriler',
        `Bu uygulama, girdiğin finansal bilgileri (gelir, gider, borç, varlık, hedef, kredi notu,
         hane bilgisi) <b>yalnızca kendi cihazının tarayıcı belleğinde</b> saklar.
         Bu veriler veri sorumlusuna <b>hiçbir şekilde iletilmez</b>, bir sunucuda tutulmaz,
         görüntülenmez ve işlenmez. Teknik olarak veri sorumlusunun bu verilere erişimi yoktur.<br><br>
         Uygulamanın çalışması sırasında, canlı piyasa verisi sağlayan üçüncü taraf sunuculara
         ve barındırma sağlayıcısına — her internet bağlantısında olduğu gibi — <b>IP adresin</b>
         ve tarayıcı bilgin ulaşır. Bu veriler ilgili üçüncü taraflarca kendi politikaları
         çerçevesinde işlenir; veri sorumlusu bu kayıtlara erişemez.`)}

      ${bolum('3. İşleme amacı',
        `Cihazında saklanan veriler, yalnızca senin talep ettiğin hesaplamaları yapmak
         (bütçe, borç simülasyonu, enflasyon karşılaştırması vb.) ve bunları sana göstermek
         amacıyla, senin tarayıcında işlenir. Profilleme, reklam hedefleme, puanlama,
         satış veya paylaşım amacıyla <b>hiçbir işleme yapılmaz</b>.`)}

      ${bolum('4. Hukuki sebep',
        `Verilerin cihazından çıkmadığı ve veri sorumlusuna aktarılmadığı için, girdiğin
         finansal bilgiler bakımından veri sorumlusu sıfatıyla bir işleme faaliyeti
         bulunmamaktadır. Barındırma ve üçüncü taraf bağlantılarında oluşan teknik kayıtlar
         (IP, tarih) hizmetin sunulabilmesi ve güvenliğinin sağlanması amacıyla,
         KVKK m. 5/2-f kapsamındaki meşru menfaat gereği ilgili sağlayıcılar tarafından tutulur.`)}

      ${bolum('5. Aktarım',
        `Girdiğin finansal veriler <b>hiçbir üçüncü kişiye, hiçbir ülkeye aktarılmaz</b>.
         Yalnızca bağlantı kaynaklı teknik bilgiler (IP), yukarıdaki "Cihazından ne çıkıyor"
         tablosunda listelenen ve bir kısmı yurt dışında bulunan sağlayıcılara ulaşır.
         Bu, hizmetin teknik olarak çalışmasının doğal sonucudur ve otomatik veri çekimi
         kapatılarak tamamen önlenebilir.`)}

      ${bolum('6. Saklama süresi',
        `Veriler, sen silene kadar cihazında kalır. Tarayıcı verisini temizlemen,
         "Hepsini sil" düğmesini kullanman ya da tarayıcıyı kaldırman hâlinde veriler
         geri döndürülemez biçimde silinir. Veri sorumlusunda saklanan bir kopya
         bulunmadığından, ayrıca bir imha talebine gerek yoktur.`)}

      ${bolum('7. Otomatik karar verme',
        `Uygulama hesaplama ve öneri üretir; ancak bunların hiçbiri senin hakkında
         hukuki sonuç doğuran otomatik bir karar değildir. Kredi notu, limit veya
         benzeri bir değerlendirme yapılmaz; gösterilenler yalnızca senin girdiğin
         verilerden türetilen bilgilendirmelerdir.`)}
    </div>`, { ikon: '⚖' });
}

/* ---------- ilgili kişi hakları ---------- */

function haklarKart() {
  const haklar = [
    ['Kişisel verinin işlenip işlenmediğini öğrenme', 'Bu sayfadaki tablolar cihazındaki her kaydı gösterir.'],
    ['İşlenmişse buna ilişkin bilgi talep etme', '"Ham veriyi göster" ile tüm kaydı olduğu gibi görebilirsin.'],
    ['İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme', 'Yukarıdaki 3. bölümde açıklanmıştır; kaynak kodu da herkese açıktır.'],
    ['Aktarıldığı üçüncü kişileri bilme', '"Cihazından ne çıkıyor" tablosu tüm bağlantıları listeler.'],
    ['Eksik veya yanlış işlenmişse düzeltilmesini isteme', 'Her kaydı ilgili ekrandan kendin düzenleyebilirsin.'],
    ['Silinmesini veya yok edilmesini isteme', '"Hepsini sil" düğmesi verinin tamamını kalıcı olarak siler.'],
    ['Düzeltme/silmenin üçüncü kişilere bildirilmesini isteme', 'Veri üçüncü kişilere aktarılmadığı için bildirilecek taraf yoktur.'],
    ['Otomatik analiz sonucu aleyhine bir sonuca itiraz etme', 'Aleyhe hukuki sonuç doğuran otomatik karar üretilmez.'],
    ['Kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme', 'Başvuru için yukarıdaki iletişim bilgisi kullanılabilir.']
  ];

  return kart('Haklarınız (KVKK m. 11)', `
    <div class="kart-not">
      Kanun size aşağıdaki hakları tanır. Bu uygulamada bu hakların çoğunu
      <b>başvuru yapmadan, doğrudan kendiniz</b> kullanabilirsiniz — çünkü veri sizde durur.
    </div>
    ${haklar.map(([h, nasil], i) => `
      <div class="oge" style="align-items:flex-start">
        <div class="im" style="background:var(--blue-dim);color:var(--blue);font-weight:800;font-size:12px">${i + 1}</div>
        <div class="gvd">
          <div class="ad" style="font-size:13px">${kac(h)}</div>
          <div class="ayr">${kac(nasil)}</div>
        </div>
      </div>`).join('')}`, { ikon: '⚖' });
}

/* ---------- çerez ---------- */

function cerezKart() {
  return kart('Çerez politikası', `
    ${notKutu('iyi',
      `<b>Bu site çerez kullanmaz.</b> Tek bir çerez bile oluşturulmaz — bu yüzden
       çerez onay penceresi de yoktur. Kaynak kodda <code>document.cookie</code> hiç geçmez.`)}
    <div class="kucuk ust-12" style="color:var(--ink-2);line-height:1.7">
      Uygulama, çerez yerine tarayıcının <b>yerel deposunu</b> (localStorage / sessionStorage)
      kullanır. Aradaki fark önemlidir: çerezler her istekte sunucuya <b>gönderilir</b>,
      yerel depo ise <b>gönderilmez</b> — tarayıcıdan dışarı çıkmaz.
      Kullanılan depolama kalemleri hizmetin çalışması için <b>zorunlu</b> niteliktedir;
      reklam, ölçümleme veya profilleme amaçlı hiçbir depolama yapılmaz.
    </div>`, { ikon: '○' });
}

/* ---------- dürüst sınır ---------- */

function sinirKart() {
  return kart('Bu metnin sınırları', `
    <div class="kucuk" style="color:var(--ink-2);line-height:1.75">
      Bu sayfa, uygulamanın <b>teknik gerçeklerini</b> olabildiğince açık anlatır ve
      kaynak kodu denetlenerek hazırlanmıştır. Ancak:
      <ul style="margin:10px 0 0;padding-left:18px">
        <li>Bu bir <b>hukuki mütalaa değildir</b>. Yayımlanmadan önce metnin bir hukukçu
            tarafından gözden geçirilmesi önerilir.</li>
        <li>Üçüncü taraf sağlayıcıların kendi politikaları zamanla değişebilir;
            bağlantılar yukarıdaki tabloda verilmiştir.</li>
        <li>Cihazının güvenliği senin sorumluluğundadır. Veriler cihazda durduğu için,
            cihazına erişen biri — kilit kurmadıysan — verileri görebilir.</li>
      </ul>
    </div>
    <div class="ust-12">${notKutu('bilgi',
      `<b>Doğrulamak istersen:</b> kaynak kodun tamamı herkese açıktır.
       Ağ sekmesini açıp uygulamayı kullanırsan, yukarıda listelenenler dışında
       tek bir istek göremezsin. Söylediğimizi kanıtlayamıyorsak, söylememeliyiz.`)}</div>`,
    { ikon: '◈' });
}

/* ============================================================
   Eylemler
   ============================================================ */

eylemKaydet('gizlilik-ham', () => {
  const parcalar = [];
  ANAHTARLAR.forEach(a => {
    let ham = null;
    try { ham = (a.tur === 'session' ? sessionStorage : localStorage).getItem(a.k); } catch { }
    if (ham === null) return;
    const kisalt = ham.length > 4000 ? ham.slice(0, 4000) + '\n… (' + (ham.length - 4000) + ' karakter daha)' : ham;
    parcalar.push(`── ${a.k} ──\n${kisalt}`);
  });

  modalAc({
    baslik: 'Cihazındaki ham veri',
    genislik: '720px',
    govde: parcalar.length
      ? `<p class="kucuk r-muted alt-12" style="line-height:1.6">
           Tarayıcında kayıtlı olan her şey, olduğu gibi. Kilit kuruluysa finansal kayıtların
           şifreli görünür — okunamaz olması beklenen davranıştır.
         </p>
         <pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:13px;margin:0;max-height:52vh;overflow:auto;font-family:var(--mono)">${kac(parcalar.join('\n\n'))}</pre>`
      : `<p class="kucuk r-muted">Cihazında kayıtlı veri yok.</p>`,
    dugmeler: [{ ad: 'Kapat', sinif: 'b-cizgi' }]
  });
});
