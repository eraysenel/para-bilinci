/* Arayüz yardımcıları — modal, bildirim, form parçaları, olay yönlendirme. */

import { kac } from './fmt.js';

export const $ = (s, k = document) => k.querySelector(s);
export const $$ = (s, k = document) => [...k.querySelectorAll(s)];

/* ---------- bildirim ---------- */
let bildirimKap = null;
export function bildir(metin, tur = 'iyi', sure = 3200) {
  if (!bildirimKap) {
    bildirimKap = document.createElement('div');
    bildirimKap.className = 'bildirimler';
    document.body.appendChild(bildirimKap);
  }
  const d = document.createElement('div');
  d.className = 'bildirim ' + (tur === 'iyi' ? '' : tur);
  d.textContent = metin;
  d.setAttribute('role', 'status');
  bildirimKap.appendChild(d);
  setTimeout(() => {
    d.style.transition = 'opacity .3s, transform .3s';
    d.style.opacity = '0';
    d.style.transform = 'translateX(16px)';
    setTimeout(() => d.remove(), 320);
  }, sure);
}

/* ---------- modal ---------- */
let ortu = null;
function ortuKur() {
  if (ortu) return ortu;
  ortu = document.createElement('div');
  ortu.className = 'ortu';
  ortu.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
  document.body.appendChild(ortu);
  ortu.addEventListener('click', e => { if (e.target === ortu) modalKapat(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ortu.classList.contains('acik')) modalKapat(); });
  return ortu;
}

export function modalAc({ baslik, govde, dugmeler = [], genislik = null }) {
  const o = ortuKur();
  const m = o.querySelector('.modal');
  if (genislik) m.style.maxWidth = genislik;
  m.innerHTML = `
    <div class="modal-bas"><h3>${kac(baslik)}</h3>
      <button class="sil-btn" data-modal-kapat aria-label="Kapat">✕</button></div>
    <div class="modal-gvd">${govde}</div>
    ${dugmeler.length ? `<div class="modal-alt">${dugmeler.map((d, i) =>
      `<button class="dg-btn ${d.sinif || 'b-cizgi'}" data-modal-dugme="${i}">${kac(d.ad)}</button>`).join('')}</div>` : ''}`;

  m.querySelector('[data-modal-kapat]').onclick = modalKapat;
  dugmeler.forEach((d, i) => {
    const b = m.querySelector(`[data-modal-dugme="${i}"]`);
    if (b) b.onclick = () => { const r = d.tikla ? d.tikla(m) : true; if (r !== false) modalKapat(); };
  });

  o.classList.add('acik');
  setTimeout(() => {
    const ilk = m.querySelector('input:not([type=hidden]), select, textarea, button.b-ana');
    if (ilk) ilk.focus();
  }, 60);
  return m;
}

export function modalKapat() {
  if (ortu) {
    ortu.classList.remove('acik');
    const m = ortu.querySelector('.modal');
    if (m) m.style.maxWidth = '';
  }
}

/** Onay penceresi — Promise<boolean> döner. */
export function onayla(baslik, metin, onayAdi = 'Evet, devam et', tehlike = false) {
  return new Promise(res => {
    let cevap = false;
    modalAc({
      baslik,
      govde: `<p style="font-size:14px;line-height:1.65;color:var(--ink-2)">${metin}</p>`,
      dugmeler: [
        { ad: 'Vazgeç', sinif: 'b-cizgi', tikla: () => { cevap = false; } },
        { ad: onayAdi, sinif: tehlike ? 'b-tehli' : 'b-ana', tikla: () => { cevap = true; } }
      ]
    });
    const o = ortuKur();
    const gozle = new MutationObserver(() => {
      if (!o.classList.contains('acik')) { gozle.disconnect(); res(cevap); }
    });
    gozle.observe(o, { attributes: true, attributeFilter: ['class'] });
  });
}

/* ---------- form parçaları ---------- */

export function alan(et, icerik, ipucu = '') {
  return `<label class="alan"><span class="et">${kac(et)}${ipucu ? `<span class="ip">${kac(ipucu)}</span>` : ''}</span>${icerik}</label>`;
}

export function girdi(ad, secenek = {}) {
  const { tur = 'text', deger = '', yer = '', adim = '', ek = '' } = secenek;
  return `<input type="${tur}" name="${kac(ad)}" value="${kac(deger)}" placeholder="${kac(yer)}"
    ${tur === 'number' ? 'inputmode="decimal"' : ''} ${adim ? `step="${adim}"` : ''} ${ek}>`;
}

export function secim(ad, secenekler, seciliDeger = '') {
  return `<select name="${kac(ad)}">${secenekler.map(s => {
    const d = typeof s === 'string' ? s : s.deger;
    const a = typeof s === 'string' ? s : s.ad;
    return `<option value="${kac(d)}"${String(d) === String(seciliDeger) ? ' selected' : ''}>${kac(a)}</option>`;
  }).join('')}</select>`;
}

/** Form değerlerini nesne olarak toplar. */
export function formOku(kok) {
  const o = {};
  $$('input[name], select[name], textarea[name]', kok).forEach(e => {
    o[e.name] = e.type === 'checkbox' ? e.checked : e.value;
  });
  return o;
}

/* ---------- olay yönlendirme ---------- */
const eylemler = new Map();

/** data-eylem="ad" taşıyan öğelere tıklanınca fn(veri, olay, oge) çağrılır. */
export function eylemKaydet(ad, fn) { eylemler.set(ad, fn); }

export function eylemleriBagla(kok) {
  kok.addEventListener('click', e => {
    const t = e.target.closest('[data-eylem]');
    if (!t || !kok.contains(t)) return;
    const fn = eylemler.get(t.dataset.eylem);
    if (!fn) return;
    e.preventDefault();
    fn({ ...t.dataset }, e, t);
  });
  kok.addEventListener('change', e => {
    const t = e.target.closest('[data-degisti]');
    if (!t) return;
    const fn = eylemler.get(t.dataset.degisti);
    if (fn) fn({ ...t.dataset, deger: t.type === 'checkbox' ? t.checked : t.value }, e, t);
  });
  kok.addEventListener('input', e => {
    const t = e.target.closest('[data-yazildi]');
    if (!t) return;
    const fn = eylemler.get(t.dataset.yazildi);
    if (fn) fn({ ...t.dataset, deger: t.value }, e, t);
  });
}

/* ---------- görsel parçalar ---------- */

export function dosem({ etiket, deger, ipucu = '', renk = '', vurgu = '', ikon = '' }) {
  return `<div class="dosem ${vurgu}">
    <div class="et">${ikon ? `<span>${ikon}</span>` : ''}${kac(etiket)}</div>
    <div class="dg ${renk}">${deger}</div>
    ${ipucu ? `<div class="ipuc">${ipucu}</div>` : ''}
  </div>`;
}

export function kart(baslik, icerik, secenek = {}) {
  const { yan = '', not = '', ikon = '', sinif = '' } = secenek;
  return `<div class="kart ${sinif}">
    ${baslik ? `<div class="kart-bas">${ikon ? `<span>${ikon}</span>` : ''}<span>${kac(baslik)}</span>${yan ? `<span class="yan">${yan}</span>` : ''}</div>` : ''}
    ${not ? `<div class="kart-not">${not}</div>` : ''}
    ${icerik}
  </div>`;
}

export function bos(baslik, metin, ikon = '○') {
  return `<div class="bos"><div class="im">${ikon}</div><div class="bs">${kac(baslik)}</div><div>${kac(metin)}</div></div>`;
}

export function notKutu(tur, metin, ikon = '') {
  const im = ikon || { bilgi: 'ℹ', iyi: '✓', uyari: '!', kotu: '✕', notr: '·' }[tur] || '·';
  return `<div class="not-kutu nk-${tur}"><span class="im">${im}</span><div>${metin}</div></div>`;
}

export function rozet(metin, tur = 'notr') {
  return `<span class="rozet rz-${tur}">${kac(metin)}</span>`;
}

/** "Bu bir varsayım" etiketi — projeksiyon içeren her sonuçta gösterilir. */
export function senaryoEtiketi(varsayim) {
  return `<div class="not-kutu nk-notr ust-12" style="font-size:11.5px">
    <span class="im">◇</span><div><b>Senaryo.</b> ${kac(varsayim)} Gerçekleşen değil, hesaplanan sonuçtur.</div></div>`;
}

/** Kaynak etiketi — canlı / önbellek / elle / yok */
export function kaynakEtiketi(d) {
  if (!d || d.deger === null) return `<span class="kaynak-eti yok">veri yok</span>`;
  if (d.yontem === 'elle') return `<span class="kaynak-eti elle">elle girildi</span>`;
  if (d.yontem === 'onbellek') return `<span class="kaynak-eti">önbellek</span>`;
  return `<span class="kaynak-eti canli"><span class="nokta atar"></span>canlı</span>`;
}

/** Uzun listeleri kısaltıp "hepsini göster" ekler. */
export function kisalt(html, adet, tumu, id) {
  if (adet <= tumu) return html;
  return html + `<div class="merkez ust-8"><button class="dg-btn b-sade b-kucuk" data-eylem="tumunu-goster" data-hedef="${id}">Tümünü göster (${tumu})</button></div>`;
}
