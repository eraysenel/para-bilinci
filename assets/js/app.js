/* Para Bilinci — uygulama kabuğu, yönlendirme ve başlatma. */

import { durum, kaydet, dinle, abone } from './core/store.js';
import { piyasayiCek, piyasayiHazirla, piyasa } from './core/market.js';
import * as H from './core/hesap.js';
import { $, $$, eylemleriBagla, eylemKaydet, bildir, modalAc, formOku, alan, girdi, notKutu, dosem } from './core/ui.js';
import { kac, sayiOku, bugun, tl } from './core/fmt.js';

import { bugunGorunum } from './views/bugun.js';
import { kararGorunum } from './views/kararlar.js';
import { akisGorunum } from './views/akis.js';
import { faturaGorunum } from './views/faturalar.js';
import { borcGorunum } from './views/borc.js';
import { enflasyonGorunum } from './views/enflasyon.js';
import { yatirimGorunum } from './views/yatirim.js';
import { mutfakGorunum } from './views/mutfak.js';
import { skorGorunum } from './views/skor.js';
import { okulGorunum, mufredatYukle } from './views/okul.js';
import { mentorGorunum } from './views/mentor.js';
import { ayarGorunum } from './views/ayarlar.js';

const GORUNUMLER = [
  bugunGorunum, kararGorunum, akisGorunum, faturaGorunum, borcGorunum,
  enflasyonGorunum, yatirimGorunum, mutfakGorunum, skorGorunum,
  okulGorunum, mentorGorunum, ayarGorunum
];
const HARITA = Object.fromEntries(GORUNUMLER.map(g => [g.ad, g]));

const MENU = [
  { baslik: 'Günlük', ogeler: ['bugun', 'kararlar'] },
  { baslik: 'Param', ogeler: ['akis', 'faturalar', 'borc'] },
  { baslik: 'Büyüme', ogeler: ['enflasyon', 'yatirim', 'mutfak', 'skor'] },
  { baslik: 'Öğren', ogeler: ['okul', 'mentor'] }
];

let aktif = 'bugun';
let icerikKok = null;
let bekleyenCizim = false;

/* ============================================================
   Tema
   ============================================================ */

function temaUygula() {
  document.documentElement.dataset.tema = durum.ayarlar.tema === 'acik' ? 'acik' : 'koyu';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = durum.ayarlar.tema === 'acik' ? '#f5f7fb' : '#070b14';
}

eylemKaydet('tema-degis', () => {
  durum.ayarlar.tema = durum.ayarlar.tema === 'acik' ? 'koyu' : 'acik';
  kaydet('tema');
  temaUygula();
});

/* ============================================================
   Yönlendirme
   ============================================================ */

eylemKaydet('git', ({ hedef }) => git(hedef));

export function git(ad) {
  if (!HARITA[ad]) ad = 'bugun';
  aktif = ad;
  if (location.hash.slice(1) !== ad) location.hash = ad;
  ciz();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (h && HARITA[h] && h !== aktif) { aktif = h; ciz(); }
});

/* ============================================================
   Çizim
   ============================================================ */

function menuCiz() {
  const kenar = $('#menu');
  const alt = $('#altSekme');

  if (kenar) {
    kenar.innerHTML = MENU.map(g => `
      <div class="menu-baslik">${kac(g.baslik)}</div>
      ${g.ogeler.map(ad => {
        const v = HARITA[ad];
        return `<button data-eylem="git" data-hedef="${ad}" class="${ad === aktif ? 'aktif' : ''}">
          <span class="ikon">${v.ikon}</span><span>${kac(v.etiket)}</span>${rozetIcin(ad)}</button>`;
      }).join('')}`).join('');
  }

  if (alt) {
    const sira = ['bugun', 'akis', 'faturalar', 'borc', 'kararlar', 'enflasyon', 'yatirim', 'mutfak', 'skor', 'okul', 'mentor', 'ayarlar'];
    alt.innerHTML = sira.map(ad => {
      const v = HARITA[ad];
      return `<button data-eylem="git" data-hedef="${ad}" class="${ad === aktif ? 'aktif' : ''}">
        <span class="ikon">${v.ikon}</span><span>${kac(v.etiket)}</span></button>`;
    }).join('');
    const a = alt.querySelector('.aktif');
    if (a) a.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
}

/** Menüde dikkat çekmesi gereken sayılar (gecikmiş ödeme gibi). */
function rozetIcin(ad) {
  if (ad === 'faturalar') {
    const g = H.yukumlulukler().filter(y => y.kalanGun < 0).length;
    return g ? `<span class="rozet">${g}</span>` : '';
  }
  if (ad === 'kararlar') {
    const h = durum.kararlar.filter(k => k.durum === 'bekliyor' && Date.now() >= (k.kararTarihi || 0)).length;
    return h ? `<span class="rozet">${h}</span>` : '';
  }
  return '';
}

function ciz() {
  const g = HARITA[aktif];
  if (!g || !icerikKok) return;

  menuCiz();
  try {
    icerikKok.innerHTML = `
      <div class="sayfa-bas">
        <h1>${g.ikon} ${kac(g.baslik)}</h1>
        ${g.alt ? `<p class="alt">${kac(g.alt)}</p>` : ''}
      </div>
      ${g.ciz()}`;
  } catch (e) {
    console.error('Görünüm çizilemedi:', e);
    icerikKok.innerHTML = `<div class="kart">${notKutu('kotu',
      `<b>Bu ekran çizilemedi.</b> Hata: <code>${kac(e.message)}</code><br>
       Verilerin güvende — Ayarlar'dan yedek alabilirsin. Sorun sürerse tarayıcı konsolundaki mesajı bildir.`)}</div>`;
  }
  if (g.bagla) { try { g.bagla(icerikKok); } catch (e) { console.error(e); } }
}

/** Odaktaki bir girdiyi bozmadan yeniden çiz. */
function cizIste() {
  if (bekleyenCizim) return;
  const a = document.activeElement;
  const girdiOdakta = a && icerikKok?.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
  if (girdiOdakta) {
    bekleyenCizim = true;
    a.addEventListener('blur', () => { bekleyenCizim = false; ciz(); }, { once: true });
    return;
  }
  ciz();
}

document.addEventListener('gorunum-yenile', () => ciz());

/* ============================================================
   Kurulum sihirbazı
   ============================================================ */

eylemKaydet('kurulum-baslat', () => {
  modalAc({
    baslik: 'Üç adımda başla',
    genislik: '580px',
    govde: `
      <p class="kucuk r-muted alt-16" style="line-height:1.65">
        Tam olması gerekmiyor — yaklaşık değerlerle başla, sonra düzeltirsin.
        Bu üç bilgi girildiğinde araç sana "bugün ne kadar harcayabilirim" sorusunu cevaplayabilir.
      </p>

      <div class="kart-bas">① Elindeki para</div>
      ${alan('Banka hesaplarında ve cebinde şu an duran toplam (₺)',
        girdi('nakit', { deger: durum.nakit.tutar || '', yer: '12500' }))}

      <hr class="ayrac">
      <div class="kart-bas">② Aylık gelirin</div>
      <div class="satir s-21">
        ${alan('Net tutar (₺)', girdi('gelir', { yer: '42000' }))}
        ${alan('Ödeme günü', girdi('gelirGun', { tur: 'number', deger: 15, ek: 'min="1" max="31"' }), 'ayın kaçı')}
      </div>

      <hr class="ayrac">
      <div class="kart-bas">③ Hane</div>
      <div class="satir s-3">
        ${alan('Yetişkin', girdi('yetiskin', { tur: 'number', deger: durum.hane.yetiskin, ek: 'min="1" max="20"' }))}
        ${alan('Çocuk', girdi('cocuk', { tur: 'number', deger: durum.hane.cocuk, ek: 'min="0" max="20"' }))}
        ${alan('Gelir getiren kişi', girdi('gelirSayisi', { tur: 'number', deger: durum.hane.gelirSayisi, ek: 'min="1" max="10"' }))}
      </div>

      <div class="ust-12">${notKutu('bilgi',
        'Sonraki adım sabit giderlerini (kira, faturalar, abonelikler) girmek olacak — asıl tabloyu onlar kurar.')}</div>`,
    dugmeler: [
      { ad: 'Sonra', sinif: 'b-cizgi', tikla: () => { durum.kurulumTamam = true; kaydet('kurulum'); } },
      {
        ad: 'Kaydet ve devam et', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const nakit = sayiOku(f.nakit);
          const gelir = sayiOku(f.gelir);

          durum.nakit.tutar = nakit;
          durum.nakit.guncelleme = bugun();
          durum.hane.yetiskin = Math.max(1, Number(f.yetiskin) || 1);
          durum.hane.cocuk = Math.max(0, Number(f.cocuk) || 0);
          durum.hane.gelirSayisi = Math.max(1, Number(f.gelirSayisi) || 1);

          if (gelir > 0 && !durum.gelirler.length) {
            durum.gelirler.push({
              id: 'g' + Date.now().toString(36), ad: 'Maaş', tutar: gelir,
              tur: 'maas', gun: Number(f.gelirGun) || 15, aktif: true
            });
          }
          durum.kurulumTamam = true;
          kaydet('kurulum');
          bildir('Kaydedildi. Şimdi sabit giderlerini ekleyelim.');
          setTimeout(() => git('akis'), 320);
        }
      }
    ]
  });
});

/* ============================================================
   Başlatma
   ============================================================ */

async function veriYukle() {
  const oku = async yol => {
    const c = await fetch(yol, { cache: 'no-cache' });
    if (!c.ok) throw new Error(yol + ' → HTTP ' + c.status);
    return c.json();
  };
  const [ref, muf] = await Promise.allSettled([
    oku('data/referans.json'),
    oku('data/mufredat.json')
  ]);

  if (ref.status === 'fulfilled') H.referansYukle(ref.value);
  else console.error('Referans veri seti yüklenemedi:', ref.reason);

  if (muf.status === 'fulfilled') mufredatYukle(muf.value);
  else console.error('Müfredat yüklenemedi:', muf.reason);

  return ref.status === 'fulfilled';
}

async function baslat() {
  icerikKok = $('#icerik');
  temaUygula();
  eylemleriBagla(document.body);

  const h = location.hash.slice(1);
  if (h && HARITA[h]) aktif = h;

  // önbellek + elle girilen değerler ağ beklemeden uygulanır
  piyasayiHazirla();

  const refTamam = await veriYukle();
  ciz();

  if (!refTamam) {
    bildir('Referans veri seti yüklenemedi. Siteyi bir web sunucusu üzerinden açtığından emin ol.', 'hata', 6000);
  }

  // piyasa verisi arka planda
  if (durum.piyasa.otomatikCek) {
    piyasayiCek().catch(e => console.warn('Piyasa verisi çekilemedi:', e));
  }

  dinle(() => cizIste());
  abone('piyasa', () => { if (aktif === 'bugun' || aktif === 'ayarlar' || aktif === 'yatirim') cizIste(); });

  // bekleme sürelerini canlı tut
  setInterval(() => { if (aktif === 'kararlar') ciz(); }, 60000);

  // sekmeye geri dönünce piyasayı tazele
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && durum.piyasa.otomatikCek) piyasayiCek().catch(() => { });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
else baslat();
