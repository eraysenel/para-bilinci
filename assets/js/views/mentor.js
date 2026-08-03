/* AI Mentor — mevcut Cloudflare Worker üzerinden, Turnstile doğrulamalı.
   Verilerin cihazından çıkmaz; yalnızca aşağıdaki özet metin gönderilir. */

import { durum } from '../core/store.js';
import { piyasa } from '../core/market.js';
import * as H from '../core/hesap.js';
import { kac } from '../core/fmt.js';
import { kart, bos, notKutu, eylemKaydet, bildir, modalAc } from '../core/ui.js';

const PROXY = 'https://iyilikicinai.doksandokuz3032.workers.dev/';
const SITEKEY = '0x4AAAAAADsB1yi04fQ4PyVU';
const OTURUM_ANAHTAR = 'pb2_ai_oturum';

let gecmis = [];       // {role, content}
let oturum = null;
let tsWidget = null, tsToken = '', tsBekleyen = null;

try { oturum = JSON.parse(localStorage.getItem(OTURUM_ANAHTAR) || 'null'); } catch { }

const HIZLI = [
  { ad: 'Durumumu analiz et', soru: 'Verilerime bakıp durumumu değerlendir. Bana 3-5 somut, uygulanabilir öneri ver. Övme, gerçekçi ol.' },
  { ad: 'Borç planı', soru: 'Borçlarımı en hızlı ve en ucuz nasıl kapatırım? Somut bir sıra ve aylık plan öner.' },
  { ad: 'Nereden kısabilirim', soru: 'Harcamalarıma bakınca nereden sızdırıyorum? Hangi kalemler en kolay kısılabilir?' },
  { ad: 'Bu ay ne yapmalıyım', soru: 'Önümüzdeki 30 gün için bana öncelik sırasıyla bir eylem listesi çıkar.' },
  { ad: 'Acil fonum yeterli mi', soru: 'Hane yapıma göre acil durum fonum yeterli mi? Ne kadar olmalı ve nasıl biriktirmeliyim?' },
  { ad: 'Kredi notumu nasıl yükseltirim', soru: 'Mevcut durumuma göre kredi notumu yükseltmek için sırayla ne yapmalıyım?' }
];

export const mentorGorunum = {
  ad: 'mentor', ikon: '◉', etiket: 'AI Mentor',
  baslik: 'AI Mentor',
  alt: 'Verilerine bakıp kişisel yorum yapar. Yargılamaz, ürün satmaz, garanti vermez.',

  ciz() {
    return kart('Sohbet', `
      <div class="sohbet" id="sohbet">
        ${gecmis.length ? gecmis.map(m => balon(m.role === 'user' ? 'ben' : 'ai', m.content)).join('')
          : `<div class="bos" style="border:0;background:transparent">
              <div class="im">◉</div>
              <div class="bs">Bir soru sor ya da aşağıdaki başlıklardan birini seç</div>
              <div>Verilerin özetlenerek gönderilir; ham kayıtların cihazından çıkmaz.</div>
            </div>`}
      </div>

      <div class="dg-grup ust-12">
        ${HIZLI.map((h, i) => `<button class="dg-btn b-cizgi b-mini" data-eylem="ai-hizli" data-i="${i}">${kac(h.ad)}</button>`).join('')}
      </div>

      <div class="esnek ust-12" style="gap:8px">
        <input id="aiGirdi" class="buyu" placeholder="Bir finans sorusu sor…" data-eylem-enter="ai-gonder">
        <button class="dg-btn b-ana" id="aiGonder" data-eylem="ai-gonder">Sor</button>
      </div>

      ${gecmis.length ? `<div class="merkez ust-8">
        <button class="dg-btn b-sade b-mini" data-eylem="ai-temizle">Sohbeti temizle</button>
        <button class="dg-btn b-sade b-mini" data-eylem="ai-baglam">Gönderilen özeti gör</button>
      </div>` : `<div class="merkez ust-8">
        <button class="dg-btn b-sade b-mini" data-eylem="ai-baglam">Gönderilen özeti gör</button></div>`}`,
      { ikon: '◉' })

      + kart('Bu mentor ne yapar, ne yapmaz', `
        <div class="izgara iz-2">
          <div class="oge" style="flex-direction:column;align-items:flex-start;gap:6px;border-color:var(--em)">
            <div class="ad r-em">✓ Yapar</div>
            <div class="ayr" style="line-height:1.7">
              Senin girdiğin verilere göre yorum yapar · Öncelik sırası önerir ·
              Alışkanlık ve davranış önerir · Hesapları açıklar · Türkiye bağlamını dikkate alır
            </div>
          </div>
          <div class="oge" style="flex-direction:column;align-items:flex-start;gap:6px;border-color:var(--red)">
            <div class="ad r-red">✕ Yapmaz</div>
            <div class="ayr" style="line-height:1.7">
              Belirli bir hisse/coin/fon önermez · Getiri garantisi vermez ·
              Fiyat tahmini yapmaz · Ürün satmaz · Senin yerine karar vermez
            </div>
          </div>
        </div>
        <div class="ust-12">${notKutu('bilgi',
          `Bu bir yapay zekâ; yanılabilir. Söylediklerini bu araçtaki <b>kendi rakamlarınla</b> doğrula.
           Kritik kararlarda (kredi yapılandırma, büyük yatırım) bir uzmana danış.`)}</div>`,
        { ikon: '◈' });
  },

  bagla() {
    const g = document.getElementById('aiGirdi');
    if (g) g.addEventListener('keydown', e => { if (e.key === 'Enter') gonder(); });
    tsHazirla();
  }
};

function balon(kim, metin) {
  return `<div class="balon ${kim}">${kac(metin)}</div>`;
}

/* ---------- Turnstile ---------- */

function tsHazirla() {
  if (document.getElementById('ts-kutu')) return;
  const d = document.createElement('div');
  d.id = 'ts-kutu';
  d.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:120;display:none';
  document.body.appendChild(d);

  if (!window.turnstile && !document.getElementById('ts-script')) {
    const s = document.createElement('script');
    s.id = 'ts-script';
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=pbTsYuklendi';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  } else if (window.turnstile) {
    window.pbTsYuklendi();
  }
}

window.pbTsYuklendi = function () {
  try {
    tsWidget = window.turnstile.render('#ts-kutu', {
      sitekey: SITEKEY, size: 'compact',
      callback: t => {
        tsToken = t;
        if (tsBekleyen) { tsBekleyen(t); tsBekleyen = null; }
        if (oturumGecerli()) tsGoster(false);
      },
      'error-callback': () => { if (tsBekleyen) { tsBekleyen(''); tsBekleyen = null; } }
    });
    if (oturumGecerli()) tsGoster(false);
  } catch (e) { console.warn('Turnstile başlatılamadı', e); }
};

function tsGoster(g) {
  const e = document.getElementById('ts-kutu');
  if (e) e.style.display = g ? 'block' : 'none';
}

function tsAl() {
  return new Promise(res => {
    if (!window.turnstile || tsWidget === null) { res(''); return; }
    if (tsToken) { const t = tsToken; tsToken = ''; res(t); return; }
    tsGoster(true);
    tsBekleyen = res;
    try { window.turnstile.reset(tsWidget); } catch { }
  });
}

function oturumGecerli() {
  return oturum && oturum.token && oturum.exp && Date.now() < oturum.exp - 60000;
}

async function oturumAl() {
  if (oturumGecerli()) return oturum.token;
  const t = await tsAl();
  if (!t) throw new Error('Bot doğrulaması tamamlanamadı. Sol alttaki kutuyu işaretleyip tekrar dene.');

  const c = await fetch(PROXY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'auth', turnstileToken: t })
  });
  const d = await c.json();
  if (!d.sessionToken) throw new Error((d.error || 'Oturum alınamadı') + (d.codes?.length ? ` [${d.codes.join(', ')}]` : ''));

  oturum = { token: d.sessionToken, exp: d.exp };
  try { localStorage.setItem(OTURUM_ANAHTAR, JSON.stringify(oturum)); } catch { }
  tsGoster(false);
  return oturum.token;
}

/* ---------- gönderme ---------- */

const SISTEM = `Sen Türkiye'de yaşayan birine yol gösteren, sıcak ama gerçekçi bir kişisel finans mentorusun.

KURALLAR:
- Türkçe yaz. Kısa ve somut ol. Gerektiğinde madde madde.
- Kullanıcıyı ASLA yargılama, utandırma veya suçlama. Borçlu ya da eksi olmak bir karakter kusuru değil, bir tablo durumudur.
- Sadece aşağıda verilen GERÇEK VERİYE dayan. Veri yoksa "bunu bilmiyorum, şunu girersen hesaplarım" de. Sayı UYDURMA.
- Belirli bir hisse, coin, fon veya banka ürünü ÖNERME. Getiri garantisi verme. Fiyat tahmini yapma.
- Yüksek faizli borcun (özellikle kredi kartı) kapatılmasının, garantisiz bir yatırımdan önce geldiğini hatırlat.
- Türkiye bağlamını dikkate al: yüksek enflasyon, TL'nin değer kaybı, kredi kartı faizlerinin yüksekliği.
- Kullanıcının kendi planına sadık kalmasını teşvik et; indirim ve kampanya tetiklemelerine karşı uyar.
- Cevabın sonunda gereksiz uyarı yığını yapma; en fazla tek bir kısa hatırlatma.`;

async function gonder(hazirSoru = null) {
  const girdi = document.getElementById('aiGirdi');
  const soru = (hazirSoru || girdi?.value || '').trim();
  if (!soru) return;
  if (girdi && !hazirSoru) girdi.value = '';

  const btn = document.getElementById('aiGonder');
  if (btn) btn.disabled = true;

  const kap = document.getElementById('sohbet');
  if (kap && !gecmis.length) kap.innerHTML = '';

  gecmis.push({ role: 'user', content: soru });
  ekleBalon('ben', soru);
  const yazan = ekleBalon('ai', '…');

  try {
    const sistem = SISTEM + '\n\nKULLANICININ GÜNCEL VERİSİ:\n' + H.aiBaglam(piyasa);
    let token = await oturumAl();

    const istek = t => fetch(PROXY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'system', content: sistem }, ...gecmis.slice(-10)],
        temperature: 0.7, sessionToken: t
      })
    });

    let c = await istek(token);
    if (c.status === 401) {
      oturum = null;
      try { localStorage.removeItem(OTURUM_ANAHTAR); } catch { }
      token = await oturumAl();
      c = await istek(token);
    }

    const d = await c.json();
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));

    const cevap = (d.choices?.[0]?.message?.content || '').trim();
    yazan.remove();
    ekleBalon('ai', cevap || 'Yanıt alınamadı.');
    gecmis.push({ role: 'assistant', content: cevap });
  } catch (e) {
    yazan.remove();
    ekleBalon('hata', '⚠ ' + (e?.message || 'Bağlantı hatası.'));
  }

  if (btn) btn.disabled = false;
}

function ekleBalon(kim, metin) {
  const kap = document.getElementById('sohbet');
  if (!kap) return { remove() { } };
  const d = document.createElement('div');
  d.className = 'balon ' + kim;
  d.textContent = metin;
  kap.appendChild(d);
  kap.scrollTop = kap.scrollHeight;
  return d;
}

/* ---------- eylemler ---------- */

eylemKaydet('ai-gonder', () => gonder());
eylemKaydet('ai-hizli', ({ i }) => gonder(HIZLI[Number(i)]?.soru));

eylemKaydet('ai-temizle', () => {
  gecmis = [];
  document.dispatchEvent(new CustomEvent('gorunum-yenile'));
  bildir('Sohbet temizlendi.', 'bilgi');
});

eylemKaydet('ai-baglam', () => {
  modalAc({
    baslik: 'Mentora gönderilen özet',
    genislik: '640px',
    govde: `
      <p class="kucuk r-muted alt-12" style="line-height:1.6">
        Soru sorduğunda aşağıdaki metin gönderilir. Ham kayıtların (tek tek harcamalar, tarihler, isimler)
        gönderilmez — yalnızca bu özet.
      </p>
      <pre style="white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.65;background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:13px;margin:0;font-family:var(--mono)">${kac(H.aiBaglam(piyasa))}</pre>`,
    dugmeler: [{ ad: 'Kapat', sinif: 'b-cizgi' }]
  });
});
