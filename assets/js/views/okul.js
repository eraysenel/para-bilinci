/* Para 101 — mentor müfredatı. Temelden ileriye, sırayla. */

import { durum, kaydet } from '../core/store.js';
import { kac } from '../core/fmt.js';
import { kart, bos, notKutu, rozet, eylemKaydet, bildir, modalAc } from '../core/ui.js';
import * as G from '../core/chart.js';

let MUFREDAT = null;
let acikModul = null;

export function mufredatYukle(m) { MUFREDAT = m; }

export const okulGorunum = {
  ad: 'okul', ikon: '◈', etiket: 'Para 101',
  baslik: 'Para 101',
  alt: 'Para 101\'den ileri seviyeye. Her ders kısa, her dersin sonunda tek bir uygulanabilir adım var.',

  ciz() {
    if (!MUFREDAT) return kart('', notKutu('uyari', 'Müfredat yüklenemedi.'));

    const tum = MUFREDAT.moduller.flatMap(m => m.dersler);
    const tamam = durum.dersler.tamamlanan || [];
    const yuzdeD = tum.length ? tamam.length / tum.length * 100 : 0;
    const sonrakiDers = tum.find(d => !tamam.includes(d.id));

    return ilerlemeKart(tum.length, tamam.length, yuzdeD, sonrakiDers)
      + MUFREDAT.moduller.map(m => modulKart(m, tamam)).join('');
  }
};

function ilerlemeKart(toplam, biten, yuzdeD, sonraki) {
  const modulSayisi = MUFREDAT.moduller.length;

  return kart('İlerlemen', `
    <div class="esnek sar" style="gap:16px;align-items:center">
      ${G.halkaMini(yuzdeD, { boyut: 62, kalinlik: 6, renkAdi: 'var(--gold)' })}
      <div class="buyu" style="min-width:200px">
        <div class="esnek-ara alt-8">
          <span class="kalin">${biten} / ${toplam} ders</span>
          <span class="mini r-muted">${modulSayisi} modül</span>
        </div>
        <div class="cubuk"><i class="g" style="width:${yuzdeD.toFixed(1)}%"></i></div>
      </div>
    </div>
    ${sonraki ? `<div class="ust-12">${notKutu('bilgi',
      `Sıradaki ders: <b>${kac(sonraki.ad)}</b> — ${sonraki.sure} dakika.`)}
      <div class="ust-8"><button class="dg-btn b-ana b-kucuk" data-eylem="ders-ac" data-id="${sonraki.id}">Dersi aç →</button></div></div>`
      : `<div class="ust-12">${notKutu('iyi',
        'Tüm dersleri tamamladın. Asıl kısım şimdi başlıyor: bunları uygulamak. Ayda bir geri dönüp gözden geçir.')}</div>`}`,
    { ikon: '◔' });
}

function modulKart(m, tamam) {
  const biten = m.dersler.filter(d => tamam.includes(d.id)).length;
  const hepsi = biten === m.dersler.length;
  const acik = acikModul === m.id;

  return kart('', `
    <div class="modul-bas" data-eylem="modul-ac" data-id="${m.id}">
      <div class="modul-im" style="${hepsi ? 'background:var(--em-dim);color:var(--em)' : ''}">${m.ikon}</div>
      <div class="buyu">
        <div class="kalin" style="font-size:14.5px">${kac(m.ad)} ${hepsi ? rozet('tamam', 'em') : ''}</div>
        <div class="mini r-muted">${kac(m.ozet)} · ${biten}/${m.dersler.length} ders</div>
      </div>
      ${G.halkaMini(biten / m.dersler.length * 100, { boyut: 36, kalinlik: 4, renkAdi: hepsi ? 'var(--em)' : 'var(--gold)' })}
      <span class="r-faint" style="font-size:13px;transition:transform .2s;display:inline-block;transform:rotate(${acik ? 90 : 0}deg)">▸</span>
    </div>

    ${acik ? `<div class="ust-12">${m.dersler.map(d => {
      const bittiMi = tamam.includes(d.id);
      return `<div class="oge tik" data-eylem="ders-ac" data-id="${d.id}">
        <div class="im" style="background:${bittiMi ? 'var(--em-dim)' : 'var(--surface-3)'};color:${bittiMi ? 'var(--em)' : 'var(--muted)'}">${bittiMi ? '✓' : '○'}</div>
        <div class="gvd">
          <div class="ad">${kac(d.ad)}</div>
          <div class="ayr">${d.sure} dakika · ${d.icerik.length} bölüm</div>
        </div>
        <span class="r-faint">→</span>
      </div>`;
    }).join('')}</div>` : ''}`,
    { sinif: 'modul-kart' });
}

/* ============================================================
   Eylemler
   ============================================================ */

eylemKaydet('modul-ac', ({ id }) => {
  acikModul = acikModul === id ? null : id;
  document.dispatchEvent(new CustomEvent('gorunum-yenile'));
});

eylemKaydet('ders-ac', ({ id }) => dersAc(id));

function dersAc(id) {
  if (!MUFREDAT) return;
  const tum = MUFREDAT.moduller.flatMap(m => m.dersler.map(d => ({ ...d, modul: m })));
  const i = tum.findIndex(d => d.id === id);
  if (i < 0) return;
  const d = tum[i];
  const sonraki = tum[i + 1];
  const tamam = durum.dersler.tamamlanan || [];
  const bittiMi = tamam.includes(d.id);

  modalAc({
    baslik: d.ad,
    genislik: '640px',
    govde: `
      <div class="esnek sar alt-16" style="gap:8px">
        ${rozet(d.modul.ad, 'gold')}
        ${rozet(d.sure + ' dakika', 'notr')}
        ${bittiMi ? rozet('tamamlandı', 'em') : ''}
      </div>
      <div class="ders-govde">${d.icerik.map(p => `<p>${vurgula(p)}</p>`).join('')}</div>
      <div class="ust-16">${notKutu('iyi', `<b>Şimdi yap:</b> ${kac(d.eylem)}`, '→')}</div>`,
    dugmeler: [
      { ad: 'Kapat', sinif: 'b-cizgi' },
      ...(bittiMi ? [] : [{
        ad: sonraki ? 'Tamamla ve devam et' : 'Tamamla', sinif: 'b-ana',
        tikla: () => {
          if (!durum.dersler.tamamlanan.includes(d.id)) durum.dersler.tamamlanan.push(d.id);
          durum.dersler.sonDers = d.id;
          kaydet('ders');
          bildir('Ders tamamlandı.');
          if (sonraki) setTimeout(() => dersAc(sonraki.id), 280);
        }
      }])
    ]
  });
}

/** Metindeki BÜYÜK HARFLİ vurguları ve tırnak içi ifadeleri biçimlendirir. */
function vurgula(metin) {
  return kac(metin)
    .replace(/\b([A-ZÇĞİÖŞÜ]{3,}(?:\s+[A-ZÇĞİÖŞÜ/]{2,})*)\b/g, '<b>$1</b>')
    .replace(/&quot;([^&]{2,60}?)&quot;/g, '<i>“$1”</i>');
}
