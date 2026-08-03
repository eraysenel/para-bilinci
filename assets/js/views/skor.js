/* Kredi Skoru — manuel takip + nasıl hesaplanır, nasıl yükseltilir. */

import { durum, ekle, sil, bul } from '../core/store.js';
import * as H from '../core/hesap.js';
import { tl, tlKisa, n, yuzde, tarihKisa, tarihUzun, bugun, kac, sayiOku } from '../core/fmt.js';
import { dosem, kart, bos, notKutu, rozet, eylemKaydet, bildir, modalAc, formOku, onayla, alan, girdi } from '../core/ui.js';
import * as G from '../core/chart.js';

export const skorGorunum = {
  ad: 'skor', ikon: '◪', etiket: 'Kredi Skoru',
  baslik: 'Kredi Skoru',
  alt: 'Aynı krediyi iki kişi farklı faizle alır — fark nottur. Not bir gecede yükselmez; ama bir gecede düşer.',

  ciz() {
    return skorKart() + kullanimKart() + eylemlerKart() + bilesenKart() + rehberKart();
  }
};

/* ---------- skor göstergesi ---------- */

function skorKart() {
  const ref = H.referans();
  const liste = [...durum.skorlar].sort((a, b) => a.tarih.localeCompare(b.tarih));
  const son = liste[liste.length - 1];
  const onceki = liste[liste.length - 2];

  if (!son) {
    return kart('Kredi notun', `
      ${bos('Not girilmedi', 'Findeks\'ten öğrendiğin notu buraya gir. Otomatik çekilemez — Findeks\'in herkese açık bir API\'si yok.', '◪')}
      <div class="merkez ust-12"><button class="dg-btn b-ana b-kucuk" data-eylem="skor-ekle">＋ Notumu gir</button></div>
      <div class="ust-12">${notKutu('bilgi',
        `Notunu <a href="https://www.findeks.com/" target="_blank" rel="noopener">Findeks</a> üzerinden
         öğrenip ayda bir buraya girersin. Trendi görmeden hangi davranışın işe yaradığını bilemezsin.`)}</div>`,
      { ikon: '◪' });
  }

  const kademe = H.skorKademesi(son.skor);
  const fark = onceki ? son.skor - onceki.skor : null;
  const renkAdi = { kritik: 'red', uyari: 'amber', notr: 'gold', iyi: 'teal', cokiyi: 'em' }[kademe?.renk] || 'gold';

  const dilimler = ref ? ref.krediSkoru.kademeler.map(k => ({
    min: k.min, max: k.max,
    renk: `var(--${{ kritik: 'red', uyari: 'amber', notr: 'gold', iyi: 'teal', cokiyi: 'em' }[k.renk]})`
  })) : [];

  return kart('Kredi notun', `
    <div class="izgara iz-2" style="align-items:center">
      <div class="merkez">
        ${G.gosterge(son.skor, {
          min: ref?.krediSkoru.aralik.min || 1,
          max: ref?.krediSkoru.aralik.max || 1900,
          etiket: String(son.skor), altEtiket: kademe?.ad || '',
          renk: `var(--${renkAdi})`, dilimler
        })}
        <div class="mini r-faint">${tarihUzun(son.tarih)} tarihli${fark !== null ? ` · önceki ölçüme göre <b class="${fark > 0 ? 'r-em' : fark < 0 ? 'r-red' : 'r-muted'}">${fark > 0 ? '+' : ''}${fark}</b>` : ''}</div>
      </div>
      <div>
        ${liste.length >= 2 ? `<div class="grafik alt-12">${G.cizgi(
          liste.map(s => ({ etiket: tarihKisa(s.tarih), deger: s.skor })),
          { yukseklik: 155, bicim: v => n(v), alan: true })}</div>` : ''}
        ${ref ? `<div class="mini r-muted alt-8">Kademeler</div>
          ${ref.krediSkoru.kademeler.map(k => `
            <div class="esnek-ara mini" style="padding:3px 0">
              <span class="${k.min <= son.skor && son.skor <= k.max ? 'kalin r-ink' : 'r-faint'}">
                ${k.min <= son.skor && son.skor <= k.max ? '▸ ' : '　'}${kac(k.ad)}</span>
              <span class="num r-faint">${n(k.min)}–${n(k.max)}</span>
            </div>`).join('')}` : ''}
      </div>
    </div>
    <div class="dg-grup ust-12">
      <button class="dg-btn b-ana b-kucuk" data-eylem="skor-ekle">＋ Yeni ölçüm ekle</button>
      ${liste.length ? `<button class="dg-btn b-sade b-kucuk" data-eylem="skor-gecmis">Geçmiş (${liste.length})</button>` : ''}
    </div>`, { ikon: '◪', yan: liste.length + ' ölçüm' });
}

/* ---------- limit kullanımı ---------- */

function kullanimKart() {
  const ku = H.kartKullanimOrani();
  if (!ku.yeterliVeri) {
    return kart('Kart kullanım yoğunluğu', notKutu('bilgi',
      `Bu ölçüt notunun yaklaşık <b>%18</b>'ini belirler ve <b>en hızlı düzelen</b> bileşendir.
       Hesaplayabilmem için Borç ekranında kartlarının <b>limitini</b> girmen gerekiyor.`),
      { ikon: '▤' });
  }

  return kart('Kart kullanım yoğunluğu', `
    <div class="izgara iz-4 alt-12">
      ${dosem({ etiket: 'Toplam limit', deger: tl(ku.limit), ipucu: `${ku.kartSayisi} kart`, ikon: '▤' })}
      ${dosem({ etiket: 'Kullanılan', deger: tl(ku.kullanim), renk: 'r-red', ikon: '◧' })}
      ${dosem({ etiket: 'Kullanım oranı', deger: yuzde(ku.oran, 0), ipucu: ku.durumAdi, renk: 'r-' + ku.renk, vurgu: ku.oran > 50 ? 'kotu' : ku.oran <= 30 ? 'iyi' : '', ikon: '◔' })}
      ${dosem({ etiket: '%30 hedefi için', deger: ku.azaltilacak > 0 ? tl(ku.azaltilacak) : '✓', ipucu: ku.azaltilacak > 0 ? 'bu kadar azaltmalısın' : 'hedefin altındasın', renk: ku.azaltilacak > 0 ? 'r-amber' : 'r-em', ikon: '↓' })}
    </div>
    <div class="cubuk kalin"><i class="${ku.oran > 50 ? 'k' : ku.oran > 30 ? 'a' : ''}" style="width:${Math.min(ku.oran, 100).toFixed(0)}%"></i></div>
    <div class="esnek-ara mini r-faint ust-8">
      <span>0</span><span style="color:var(--em)">▲ hedef %30</span><span>%100</span>
    </div>
    <div class="ust-12">${notKutu(ku.oran > 30 ? 'uyari' : 'iyi',
      ku.oran > 30
        ? `Limitinin <b>%${ku.oran.toFixed(0)}</b>'ini kullanıyorsun. %30'un altına inmek notu belirgin şekilde destekler.
           Bunu iki yolla yaparsın: bakiyeni azaltarak (${tl(ku.azaltilacak)}) ya da — kartı disiplinli kullanıyorsan — limit artırarak.`
        : `Kullanım oranın <b>%${ku.oran.toFixed(0)}</b> — sağlıklı aralıkta. Bu, notunu destekleyen en somut davranış.`)}</div>`,
    { ikon: '▤' });
}

/* ---------- kişisel eylem listesi ---------- */

function eylemlerKart() {
  const liste = H.skorEylemleri();

  return kart('Senin için sıralanmış eylemler', liste.map((e, i) => `
    <div class="oge" style="align-items:flex-start">
      <div class="im" style="background:var(--${e.etki === 'yüksek' ? 'red' : e.etki === 'orta' ? 'gold' : 'blue'}-dim);color:var(--${e.etki === 'yüksek' ? 'red' : e.etki === 'orta' ? 'gold' : 'blue'});font-weight:800;font-size:13px">${i + 1}</div>
      <div class="gvd">
        <div class="ad">${kac(e.baslik)} ${rozet(e.etki + ' etki', e.etki === 'yüksek' ? 'red' : e.etki === 'orta' ? 'gold' : 'blue')}</div>
        <div class="ayr" style="line-height:1.6">${e.metin}</div>
      </div>
    </div>`).join('')
    + `<div class="ust-12">${notKutu('bilgi',
      `Gerçekçi beklenti: düzenli davranışla <b>3–6 ayda anlamlı</b>, 12 ayda belirgin iyileşme görülür.
       Bir gecede yükselteceğini söyleyen herkes yanlış söylüyor.`)}</div>`,
    { ikon: '◈' });
}

/* ---------- bileşenler ---------- */

function bilesenKart() {
  const ref = H.referans();
  if (!ref) return '';

  const b = ref.krediSkoru.bilesenler;

  return kart('Notu belirleyen bileşenler', `
    ${G.halka(b.map((x, i) => ({ ad: x.ad, deger: x.agirlik, renk: G.renk(i) })), {
      boyut: 165, kalinlik: 22, ortaUst: '100%', ortaAlt: 'toplam ağırlık'
    })}
    <div class="ust-16">
      ${b.map((x, i) => `
        <div class="oge" style="align-items:flex-start">
          <div class="im" style="background:${G.renk(i)}22;color:${G.renk(i)};font-weight:800;font-size:12px">%${x.agirlik}</div>
          <div class="gvd">
            <div class="ad">${kac(x.ad)}</div>
            <div class="ayr" style="line-height:1.6">${kac(x.aciklama)}</div>
          </div>
        </div>`).join('')}
    </div>
    <div class="ust-12">${notKutu('notr',
      `Bu ağırlıklar KKB'nin yayımladığı genel çerçevedir; <b>kesin formül kamuya açık değildir</b>.
       Buradaki sayılar yön gösterir, birebir hesap yapmaz.`)}</div>`,
    { ikon: '◔' });
}

/* ---------- asgari ödemenin skora etkisi ---------- */

function rehberKart() {
  const kartlar = durum.borclar.filter(b => b.tur === 'kk' && (Number(b.kalan) || 0) > 0);
  const ref = H.referans();

  return kart('Asgari ödeme ile kredi notu ilişkisi', `
    <div class="izgara iz-3 alt-12">
      <div class="oge" style="flex-direction:column;align-items:flex-start;gap:6px;border-color:var(--em)">
        <div class="ad r-em">✓ Tam ödeme</div>
        <div class="ayr" style="line-height:1.6">Faiz ödemezsin. Kullanım oranın sıfırlanır, bu da notu destekler.
          En sağlıklı senaryo budur.</div>
      </div>
      <div class="oge" style="flex-direction:column;align-items:flex-start;gap:6px;border-color:var(--gold)">
        <div class="ad r-gold">○ Asgari ödeme</div>
        <div class="ayr" style="line-height:1.6">Ödeme geçmişin <b>bozulmaz</b> — asgariyi ödemek "gecikme" sayılmaz.
          Ama kalan bakiyeye faiz işler ve <b>kullanım oranın yüksek kalır</b>; bu, notun ikinci en ağır bileşenini olumsuz etkiler.</div>
      </div>
      <div class="oge" style="flex-direction:column;align-items:flex-start;gap:6px;border-color:var(--red)">
        <div class="ad r-red">✕ Asgarinin altı / gecikme</div>
        <div class="ayr" style="line-height:1.6">Ödeme geçmişine <b>doğrudan</b> işler — notun en ağır bileşeni (~%45).
          Tek bir gecikme bile uzun süre kayıtta kalır.</div>
      </div>
    </div>

    ${notKutu('uyari',
      `<b>Kritik ayrım:</b> Ödeyemeyeceğin bir ay geldiğinde <b>mutlaka asgariyi öde</b>.
       Asgari ödemek pahalıdır (faiz işler) ama gecikme kaydı <b>çok daha pahalıdır</b> —
       biri paranı, diğeri yıllarca kredi erişimini alır.`)}

    ${ref ? `<div class="ust-8">${notKutu('kotu', kac(ref.faiz.asgariOdeme.uyari))}</div>` : ''}

    ${kartlar.length ? `<div class="ust-12">${notKutu('bilgi',
      `Kartlarında toplam <b>${tl(kartlar.reduce((a, b) => a + Number(b.kalan), 0))}</b> borç var.
       Borç ekranındaki "Asgari mi, tam mı?" hesabı, bu tercihin sana kaç lira ve kaç aya mal olduğunu gösteriyor.`)}
      <div class="merkez ust-8"><button class="dg-btn b-cizgi b-kucuk" data-eylem="git" data-hedef="borc">Hesabı gör →</button></div></div>` : ''}`,
    { ikon: '◧' });
}

/* ============================================================
   Eylemler
   ============================================================ */

eylemKaydet('skor-ekle', () => {
  const ref = H.referans();
  modalAc({
    baslik: 'Kredi notu ekle',
    govde: `
      <div class="satir s-2">
        ${alan('Findeks kredi notun', girdi('skor', { tur: 'number', yer: '1450', ek: `min="${ref?.krediSkoru.aralik.min || 1}" max="${ref?.krediSkoru.aralik.max || 1900}"` }), '1–1900')}
        ${alan('Ölçüm tarihi', girdi('tarih', { tur: 'date', deger: bugun() }))}
      </div>
      ${alan('Not (isteğe bağlı)', girdi('not', { yer: 'kart borcunu kapattıktan sonra' }))}
      ${notKutu('bilgi', `Notunu <a href="https://www.findeks.com/" target="_blank" rel="noopener">findeks.com</a>
        üzerinden öğrenirsin. Bu araç notu otomatik çekemez — Findeks'in herkese açık bir API'si yoktur.
        Girdiğin veri cihazından çıkmaz.`)}`,
    dugmeler: [
      { ad: 'Vazgeç', sinif: 'b-cizgi' },
      {
        ad: 'Kaydet', sinif: 'b-ana', tikla: kok => {
          const f = formOku(kok);
          const s = Number(f.skor);
          const alt = ref?.krediSkoru.aralik.min || 1, ust = ref?.krediSkoru.aralik.max || 1900;
          if (!Number.isFinite(s) || s < alt || s > ust) { bildir(`Not ${alt}–${ust} aralığında olmalı.`, 'hata'); return false; }
          ekle('skorlar', { skor: s, tarih: f.tarih || bugun(), not: f.not.trim() }, 'sk');
          const k = H.skorKademesi(s);
          bildir(`Kaydedildi${k ? ` — ${k.ad}` : ''}.`);
        }
      }
    ]
  });
});

eylemKaydet('skor-gecmis', () => {
  const liste = [...durum.skorlar].sort((a, b) => b.tarih.localeCompare(a.tarih));
  modalAc({
    baslik: 'Not geçmişi',
    govde: `<div class="tablo-sar"><table class="veri">
      <thead><tr><th>Tarih</th><th class="num">Not</th><th>Kademe</th><th>Not</th><th class="dar"></th></tr></thead>
      <tbody>${liste.map(s => `
        <tr><td>${tarihKisa(s.tarih)}</td>
          <td class="num">${s.skor}</td>
          <td class="mini">${kac(H.skorKademesi(s.skor)?.ad || '—')}</td>
          <td class="mini r-muted">${kac(s.not || '')}</td>
          <td class="dar"><button class="sil-btn" data-eylem="skor-sil" data-id="${s.id}">✕</button></td></tr>`).join('')}
      </tbody></table></div>`,
    dugmeler: [{ ad: 'Kapat', sinif: 'b-cizgi' }]
  });
});

eylemKaydet('skor-sil', ({ id }) => {
  sil('skorlar', id);
  bildir('Silindi.', 'bilgi');
  const m = document.querySelector('.modal [data-id="' + id + '"]');
  if (m) m.closest('tr').remove();
});
