/* Grafik kütüphanesi — saf SVG, sıfır bağımlılık.
   Her fonksiyon bir HTML dizesi döndürür; kaba yazılır.
   Renkler CSS değişkenlerinden gelir, tema değişince kendiliğinden uyar. */

import { kac, tlKisa, n } from './fmt.js';

const PALET = ['var(--gold)', 'var(--em)', 'var(--blue)', 'var(--violet)', 'var(--amber)', 'var(--teal)', 'var(--red)', 'var(--muted)'];
export function renk(i) { return PALET[i % PALET.length]; }

function id() { return 'g' + Math.random().toString(36).slice(2, 9); }

/** Ekseni okunur "güzel" adımlara böler. */
function guzelAdim(aralik, hedefAdet = 4) {
  if (!(aralik > 0)) return 1;
  const ham = aralik / hedefAdet;
  const buyukluk = Math.pow(10, Math.floor(Math.log10(ham)));
  const oran = ham / buyukluk;
  const carpan = oran >= 7.5 ? 10 : oran >= 3.5 ? 5 : oran >= 1.5 ? 2 : 1;
  return carpan * buyukluk;
}

function eksenDegerleri(min, max, adet = 4) {
  if (min === max) { min = Math.min(0, min); max = max || 1; }
  const adim = guzelAdim(max - min, adet);
  const alt = Math.floor(min / adim) * adim;
  const ust = Math.ceil(max / adim) * adim;
  const out = [];
  for (let v = alt; v <= ust + adim * 1e-9; v += adim) out.push(Math.round(v * 1e6) / 1e6);
  return { degerler: out, alt, ust };
}

/* ============================================================
   Çizgi / alan grafiği
   veri: [{etiket, deger}] veya çoklu seri: {seriler:[{ad,renk,noktalar:[{etiket,deger}]}]}
   ============================================================ */
export function cizgi(girdi, secenek = {}) {
  const {
    yukseklik = 190, alan = true, nokta = true, sifirdanBasla = false,
    bicim = tlKisa, yEksen = true, egri = true
  } = secenek;

  const seriler = Array.isArray(girdi)
    ? [{ ad: '', renk: 'var(--gold)', noktalar: girdi }]
    : girdi.seriler || [];
  const gecerli = seriler.filter(s => s.noktalar && s.noktalar.length);
  if (!gecerli.length) return bosGrafik(yukseklik);

  const etiketler = gecerli[0].noktalar.map(p => p.etiket);
  const tumDeger = gecerli.flatMap(s => s.noktalar.map(p => p.deger)).filter(v => Number.isFinite(v));
  if (!tumDeger.length) return bosGrafik(yukseklik);

  let minV = Math.min(...tumDeger), maxV = Math.max(...tumDeger);
  if (sifirdanBasla) minV = Math.min(0, minV);
  if (minV === maxV) { maxV = minV + Math.abs(minV || 1) * 0.1; minV -= Math.abs(minV || 1) * 0.1; }

  const eks = eksenDegerleri(minV, maxV, 4);
  const G = 520, Y = yukseklik;
  const solPay = yEksen ? 46 : 6, sagPay = 8, ustPay = 10, altPay = 24;
  const gW = G - solPay - sagPay, gY = Y - ustPay - altPay;

  const X = i => solPay + (gecerli[0].noktalar.length === 1 ? gW / 2 : (i / (gecerli[0].noktalar.length - 1)) * gW);
  const Yp = v => ustPay + gY - ((v - eks.alt) / (eks.ust - eks.alt || 1)) * gY;

  let s = `<svg viewBox="0 0 ${G} ${Y}" role="img" aria-label="çizgi grafik">`;

  // ızgara
  eks.degerler.forEach(v => {
    const y = Yp(v);
    s += `<line x1="${solPay}" y1="${y.toFixed(1)}" x2="${G - sagPay}" y2="${y.toFixed(1)}" stroke="var(--line-soft)" stroke-width="1"/>`;
    if (yEksen) s += `<text x="${solPay - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--faint)">${kac(bicim(v))}</text>`;
  });
  // sıfır çizgisi
  if (eks.alt < 0 && eks.ust > 0) {
    s += `<line x1="${solPay}" y1="${Yp(0).toFixed(1)}" x2="${G - sagPay}" y2="${Yp(0).toFixed(1)}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/>`;
  }

  gecerli.forEach((seri, si) => {
    const c = seri.renk || renk(si);
    const nk = seri.noktalar.filter(p => Number.isFinite(p.deger));
    if (!nk.length) return;
    const koord = seri.noktalar.map((p, i) => Number.isFinite(p.deger) ? [X(i), Yp(p.deger)] : null).filter(Boolean);
    const d = yol(koord, egri);
    const gid = id();

    if (alan && gecerli.length === 1) {
      s += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c}" stop-opacity=".26"/>
        <stop offset="100%" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>`;
      const taban = ustPay + gY;
      s += `<path d="${d} L ${koord[koord.length - 1][0].toFixed(1)} ${taban} L ${koord[0][0].toFixed(1)} ${taban} Z" fill="url(#${gid})"/>`;
    }
    s += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (nokta) {
      koord.forEach(([x, y], i) => {
        const son = i === koord.length - 1;
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${son ? 4 : 2.6}" fill="${son ? c : 'var(--bg-elev)'}" stroke="${c}" stroke-width="2"/>`;
      });
    }
  });

  // x etiketleri (kalabalıksa seyrelt)
  const atla = Math.ceil(etiketler.length / 7);
  etiketler.forEach((e, i) => {
    if (i % atla !== 0 && i !== etiketler.length - 1) return;
    s += `<text x="${X(i).toFixed(1)}" y="${Y - 7}" text-anchor="middle" font-size="10" fill="var(--faint)">${kac(e)}</text>`;
  });

  s += '</svg>';
  return s;
}

function yol(koord, egri) {
  if (!koord.length) return '';
  if (koord.length < 3 || !egri) {
    return 'M ' + koord.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
  }
  // yumuşatılmış Catmull-Rom → kübik Bézier
  let d = `M ${koord[0][0].toFixed(1)} ${koord[0][1].toFixed(1)}`;
  for (let i = 0; i < koord.length - 1; i++) {
    const p0 = koord[i - 1] || koord[i], p1 = koord[i], p2 = koord[i + 1], p3 = koord[i + 2] || p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/* ============================================================
   Dikey sütun grafiği — veri: [{etiket, deger, renk?, vurgu?}]
   ============================================================ */
export function sutun(veri, secenek = {}) {
  const { yukseklik = 175, bicim = tlKisa, esik = null, esikEtiket = '', yEksen = true } = secenek;
  if (!veri || !veri.length) return bosGrafik(yukseklik);

  const degerler = veri.map(d => d.deger || 0);
  const maxV = Math.max(...degerler, esik || 0, 1);
  const minV = Math.min(...degerler, 0);
  const eks = eksenDegerleri(minV, maxV, 3);

  const G = 520, Y = yukseklik;
  const solPay = yEksen ? 46 : 6, sagPay = 8, ustPay = 12, altPay = 26;
  const gW = G - solPay - sagPay, gY = Y - ustPay - altPay;
  const adim = gW / veri.length;
  const kal = Math.min(adim * 0.62, 40);
  const Yp = v => ustPay + gY - ((v - eks.alt) / (eks.ust - eks.alt || 1)) * gY;

  let s = `<svg viewBox="0 0 ${G} ${Y}" role="img" aria-label="sütun grafik">`;
  eks.degerler.forEach(v => {
    const y = Yp(v);
    s += `<line x1="${solPay}" y1="${y.toFixed(1)}" x2="${G - sagPay}" y2="${y.toFixed(1)}" stroke="var(--line-soft)" stroke-width="1"/>`;
    if (yEksen) s += `<text x="${solPay - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--faint)">${kac(bicim(v))}</text>`;
  });

  const y0 = Yp(0);
  veri.forEach((d, i) => {
    const x = solPay + adim * i + (adim - kal) / 2;
    const v = d.deger || 0;
    const y = Yp(v);
    const h = Math.max(Math.abs(y - y0), v === 0 ? 0 : 2);
    const c = d.renk || (esik !== null && v > esik ? 'var(--red)' : 'var(--em)');
    if (v !== 0) {
      s += `<rect x="${x.toFixed(1)}" y="${Math.min(y, y0).toFixed(1)}" width="${kal.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(5, kal / 3).toFixed(1)}" fill="${c}" opacity="${d.vurgu === false ? .45 : 1}"><title>${kac(d.etiket)}: ${kac(bicim(v))}</title></rect>`;
    } else {
      s += `<rect x="${x.toFixed(1)}" y="${(y0 - 2).toFixed(1)}" width="${kal.toFixed(1)}" height="2" rx="1" fill="var(--surface-3)"/>`;
    }
    s += `<text x="${(x + kal / 2).toFixed(1)}" y="${Y - 8}" text-anchor="middle" font-size="10" fill="var(--faint)">${kac(d.etiket)}</text>`;
  });

  if (esik !== null && esik > 0) {
    const ye = Yp(esik);
    s += `<line x1="${solPay}" y1="${ye.toFixed(1)}" x2="${G - sagPay}" y2="${ye.toFixed(1)}" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    if (esikEtiket) s += `<text x="${G - sagPay}" y="${(ye - 5).toFixed(1)}" text-anchor="end" font-size="9.5" font-weight="700" fill="var(--gold)">${kac(esikEtiket)}</text>`;
  }
  s += '</svg>';
  return s;
}

/* ============================================================
   Yığılmış sütun — veri: [{etiket, parcalar:[{ad, deger, renk}]}]
   ============================================================ */
export function yiginSutun(veri, secenek = {}) {
  const { yukseklik = 190, bicim = tlKisa } = secenek;
  if (!veri || !veri.length) return bosGrafik(yukseklik);

  const toplamlar = veri.map(d => d.parcalar.reduce((a, p) => a + (p.deger || 0), 0));
  const maxV = Math.max(...toplamlar, 1);
  const eks = eksenDegerleri(0, maxV, 3);

  const G = 520, Y = yukseklik;
  const solPay = 46, sagPay = 8, ustPay = 12, altPay = 26;
  const gW = G - solPay - sagPay, gY = Y - ustPay - altPay;
  const adim = gW / veri.length;
  const kal = Math.min(adim * 0.6, 44);
  const Yp = v => ustPay + gY - (v / (eks.ust || 1)) * gY;

  let s = `<svg viewBox="0 0 ${G} ${Y}" role="img" aria-label="yığılmış sütun grafik">`;
  eks.degerler.forEach(v => {
    const y = Yp(v);
    s += `<line x1="${solPay}" y1="${y.toFixed(1)}" x2="${G - sagPay}" y2="${y.toFixed(1)}" stroke="var(--line-soft)" stroke-width="1"/>`;
    s += `<text x="${solPay - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--faint)">${kac(bicim(v))}</text>`;
  });

  veri.forEach((d, i) => {
    const x = solPay + adim * i + (adim - kal) / 2;
    let birikim = 0;
    d.parcalar.forEach((p, pi) => {
      const v = p.deger || 0;
      if (v <= 0) return;
      const y1 = Yp(birikim + v), y2 = Yp(birikim);
      s += `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${kal.toFixed(1)}" height="${Math.max(y2 - y1, 1).toFixed(1)}" fill="${p.renk || renk(pi)}"><title>${kac(p.ad)}: ${kac(bicim(v))}</title></rect>`;
      birikim += v;
    });
    s += `<text x="${(x + kal / 2).toFixed(1)}" y="${Y - 8}" text-anchor="middle" font-size="10" fill="var(--faint)">${kac(d.etiket)}</text>`;
  });
  s += '</svg>';
  return s;
}

/* ============================================================
   Halka (donut) — veri: [{ad, deger, renk}]
   ============================================================ */
export function halka(veri, secenek = {}) {
  const { boyut = 168, kalinlik = 22, ortaUst = '', ortaAlt = '' } = secenek;
  const list = (veri || []).filter(d => (d.deger || 0) > 0);
  const toplam = list.reduce((a, d) => a + d.deger, 0);
  const R = boyut / 2, ic = R - kalinlik, merkez = R;

  if (!toplam) {
    return `<svg viewBox="0 0 ${boyut} ${boyut}" style="max-width:${boyut}px;margin:0 auto">
      <circle cx="${merkez}" cy="${merkez}" r="${R - kalinlik / 2}" fill="none" stroke="var(--surface-3)" stroke-width="${kalinlik}"/>
      <text x="${merkez}" y="${merkez + 4}" text-anchor="middle" font-size="12" fill="var(--faint)">veri yok</text></svg>`;
  }

  let aci = -Math.PI / 2;
  let s = `<svg viewBox="0 0 ${boyut} ${boyut}" style="max-width:${boyut}px;margin:0 auto" role="img">`;
  list.forEach((d, i) => {
    const pay = d.deger / toplam;
    const son = aci + pay * Math.PI * 2;
    const buyuk = pay > 0.5 ? 1 : 0;
    const [x1, y1] = [merkez + R * Math.cos(aci), merkez + R * Math.sin(aci)];
    const [x2, y2] = [merkez + R * Math.cos(son), merkez + R * Math.sin(son)];
    const [x3, y3] = [merkez + ic * Math.cos(son), merkez + ic * Math.sin(son)];
    const [x4, y4] = [merkez + ic * Math.cos(aci), merkez + ic * Math.sin(aci)];
    const d1 = pay >= 0.9999
      ? `M ${merkez} ${merkez - R} A ${R} ${R} 0 1 1 ${(merkez - 0.01).toFixed(2)} ${merkez - R} L ${(merkez - 0.01).toFixed(2)} ${merkez - ic} A ${ic} ${ic} 0 1 0 ${merkez} ${merkez - ic} Z`
      : `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${buyuk} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${ic} ${ic} 0 ${buyuk} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
    s += `<path d="${d1}" fill="${d.renk || renk(i)}"><title>${kac(d.ad)}: %${(pay * 100).toFixed(1).replace('.', ',')}</title></path>`;
    aci = son;
  });
  if (ortaUst) s += `<text x="${merkez}" y="${merkez + (ortaAlt ? -1 : 5)}" text-anchor="middle" font-size="17" font-weight="800" fill="var(--ink)">${kac(ortaUst)}</text>`;
  if (ortaAlt) s += `<text x="${merkez}" y="${merkez + 15}" text-anchor="middle" font-size="10" fill="var(--muted)">${kac(ortaAlt)}</text>`;
  s += '</svg>';
  return s;
}

/* ============================================================
   İlerleme halkası (küçük)
   ============================================================ */
export function halkaMini(yuzdeDeger, secenek = {}) {
  const { boyut = 40, kalinlik = 4, renkAdi = 'var(--em)' } = secenek;
  const r = (boyut - kalinlik) / 2, cev = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, yuzdeDeger || 0));
  return `<div class="halka" style="width:${boyut}px;height:${boyut}px">
    <svg viewBox="0 0 ${boyut} ${boyut}" width="${boyut}" height="${boyut}">
      <circle cx="${boyut / 2}" cy="${boyut / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${kalinlik}"/>
      <circle cx="${boyut / 2}" cy="${boyut / 2}" r="${r}" fill="none" stroke="${renkAdi}" stroke-width="${kalinlik}"
        stroke-linecap="round" stroke-dasharray="${cev.toFixed(1)}" stroke-dashoffset="${(cev * (1 - p / 100)).toFixed(1)}"/>
    </svg><div class="yz">${Math.round(p)}</div></div>`;
}

/* ============================================================
   Gösterge (gauge) — kredi skoru gibi aralıklı değerler için
   ============================================================ */
export function gosterge(deger, secenek = {}) {
  const { min = 0, max = 100, dilimler = [], etiket = '', altEtiket = '' } = secenek;
  const G = 260, Y = 152, merkez = G / 2, taban = 128, R = 96, kal = 17;
  const oran = Math.max(0, Math.min(1, (deger - min) / (max - min || 1)));

  const nokta = t => {
    const a = Math.PI * (1 - t);
    return [merkez + R * Math.cos(a), taban - R * Math.sin(a)];
  };
  const yay = (t1, t2) => {
    const [x1, y1] = nokta(t1), [x2, y2] = nokta(t2);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };

  let s = `<svg viewBox="0 0 ${G} ${Y}" role="img" aria-label="gösterge">`;
  s += `<path d="${yay(0, 1)}" fill="none" stroke="var(--surface-3)" stroke-width="${kal}" stroke-linecap="round"/>`;
  dilimler.forEach(d => {
    const t1 = Math.max(0, (d.min - min) / (max - min)), t2 = Math.min(1, (d.max - min) / (max - min));
    if (t2 > t1) s += `<path d="${yay(t1, t2)}" fill="none" stroke="${d.renk}" stroke-width="${kal}" opacity=".3"/>`;
  });
  if (Number.isFinite(deger)) {
    s += `<path d="${yay(0, Math.max(oran, 0.004))}" fill="none" stroke="${secenek.renk || 'var(--gold)'}" stroke-width="${kal}" stroke-linecap="round"/>`;
    const [ix, iy] = nokta(oran);
    s += `<circle cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" r="7" fill="var(--bg-elev)" stroke="${secenek.renk || 'var(--gold)'}" stroke-width="3.5"/>`;
  }
  s += `<text x="${merkez}" y="${taban - 22}" text-anchor="middle" font-size="30" font-weight="800" fill="var(--ink)">${kac(etiket)}</text>`;
  if (altEtiket) s += `<text x="${merkez}" y="${taban - 3}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--muted)">${kac(altEtiket)}</text>`;
  s += `<text x="${merkez - R}" y="${taban + 18}" text-anchor="middle" font-size="10" fill="var(--faint)">${n(min)}</text>`;
  s += `<text x="${merkez + R}" y="${taban + 18}" text-anchor="middle" font-size="10" fill="var(--faint)">${n(max)}</text>`;
  s += '</svg>';
  return s;
}

/* ============================================================
   Mini çizgi (sparkline) — satır içi
   ============================================================ */
export function kivilcim(degerler, secenek = {}) {
  const { genislik = 90, yukseklik = 26, renkAdi = 'var(--em)' } = secenek;
  const v = (degerler || []).filter(x => Number.isFinite(x));
  if (v.length < 2) return `<svg viewBox="0 0 ${genislik} ${yukseklik}" style="width:${genislik}px;height:${yukseklik}px"></svg>`;
  const mn = Math.min(...v), mx = Math.max(...v), fark = mx - mn || 1;
  const p = v.map((x, i) => [
    (i / (v.length - 1)) * (genislik - 3) + 1.5,
    yukseklik - 2 - ((x - mn) / fark) * (yukseklik - 4)
  ]);
  return `<svg viewBox="0 0 ${genislik} ${yukseklik}" style="width:${genislik}px;height:${yukseklik}px">
    <path d="${yol(p, true)}" fill="none" stroke="${renkAdi}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${p[p.length - 1][0].toFixed(1)}" cy="${p[p.length - 1][1].toFixed(1)}" r="2.2" fill="${renkAdi}"/></svg>`;
}

/* ============================================================
   Yatay çubuk listesi — kategori dağılımı gibi
   veri: [{ad, deger, renk?, ek?}]
   ============================================================ */
export function yatayListe(veri, secenek = {}) {
  const { bicim = tlKisa, maxSatir = 99, renkli = true } = secenek;
  const list = (veri || []).filter(d => Number.isFinite(d.deger)).sort((a, b) => b.deger - a.deger).slice(0, maxSatir);
  if (!list.length) return '';
  const mx = Math.max(...list.map(d => Math.abs(d.deger)), 1);
  const toplam = list.reduce((a, d) => a + Math.abs(d.deger), 0) || 1;

  return list.map((d, i) => `
    <div style="display:grid;grid-template-columns:minmax(74px,1.1fr) 2fr auto;gap:10px;align-items:center;padding:5px 0;font-size:12.5px">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${kac(d.ad)}">${kac(d.ad)}</span>
      <span class="cubuk ince"><i style="width:${(Math.abs(d.deger) / mx * 100).toFixed(1)}%;background:${renkli ? (d.renk || renk(i)) : 'var(--gold)'}"></i></span>
      <span class="num kalin" style="min-width:74px;text-align:right">${kac(bicim(d.deger))}<span class="r-faint mini" style="margin-left:5px">%${(Math.abs(d.deger) / toplam * 100).toFixed(0)}</span></span>
    </div>`).join('');
}

/* ============================================================
   Takvim ısı haritası — bir ayın günlük harcaması
   veri: {"2026-08-03": 450, ...}
   ============================================================ */
export function takvim(veri, ay, secenek = {}) {
  const { esik = 0, bicim = tlKisa } = secenek;
  const [yil, aySayi] = ay.split('-').map(Number);
  const ilk = new Date(yil, aySayi - 1, 1);
  const gunSayisi = new Date(yil, aySayi, 0).getDate();
  const kaydir = (ilk.getDay() + 6) % 7; // Pazartesi = 0
  const degerler = Object.values(veri).filter(v => v > 0);
  const mx = degerler.length ? Math.max(...degerler) : 1;

  let s = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
  ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].forEach(g => {
    s += `<div style="text-align:center;font-size:9.5px;color:var(--faint);font-weight:700;padding-bottom:2px">${g}</div>`;
  });
  for (let i = 0; i < kaydir; i++) s += '<div></div>';
  for (let g = 1; g <= gunSayisi; g++) {
    const anahtar = `${yil}-${String(aySayi).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
    const v = veri[anahtar] || 0;
    const yog = v > 0 ? 0.18 + (v / mx) * 0.82 : 0;
    const asti = esik > 0 && v > esik;
    const arka = v > 0
      ? (asti ? `color-mix(in srgb, var(--red) ${Math.round(yog * 100)}%, var(--surface-2))`
              : `color-mix(in srgb, var(--em) ${Math.round(yog * 100)}%, var(--surface-2))`)
      : 'var(--surface-2)';
    s += `<div title="${g} — ${kac(bicim(v))}" style="aspect-ratio:1;border-radius:7px;background:${arka};border:1px solid var(--line-soft);display:grid;place-items:center;font-size:10px;font-weight:700;color:${v > 0 && yog > .55 ? '#08121f' : 'var(--muted)'}">${g}</div>`;
  }
  s += '</div>';
  return s;
}

/* ============================================================
   Şelale (waterfall) — gelirden serbest nakde
   veri: [{ad, deger, tur:'baslangic'|'artis'|'azalis'|'toplam'}]
   ============================================================ */
export function selale(veri, secenek = {}) {
  const { yukseklik = 200, bicim = tlKisa } = secenek;
  if (!veri || !veri.length) return bosGrafik(yukseklik);

  let birikim = 0;
  const barlar = veri.map(d => {
    if (d.tur === 'baslangic' || d.tur === 'toplam') {
      const b = { ...d, alt: 0, ust: Math.abs(d.deger), negatif: d.deger < 0 };
      birikim = d.deger;
      return b;
    }
    const bas = birikim, son = birikim + d.deger;
    birikim = son;
    return { ...d, alt: Math.min(bas, son), ust: Math.max(bas, son), negatif: d.deger < 0 };
  });

  const maxV = Math.max(...barlar.map(b => b.ust), 1);
  const minV = Math.min(...barlar.map(b => b.alt), 0);
  const G = 520, Y = yukseklik;
  const solPay = 46, sagPay = 8, ustPay = 14, altPay = 30;
  const gW = G - solPay - sagPay, gY = Y - ustPay - altPay;
  const adim = gW / barlar.length, kal = Math.min(adim * 0.58, 46);
  const Yp = v => ustPay + gY - ((v - minV) / (maxV - minV || 1)) * gY;

  let s = `<svg viewBox="0 0 ${G} ${Y}" role="img" aria-label="nakit akışı grafiği">`;
  eksenDegerleri(minV, maxV, 3).degerler.forEach(v => {
    const y = Yp(v);
    if (y < ustPay - 2 || y > ustPay + gY + 2) return;
    s += `<line x1="${solPay}" y1="${y.toFixed(1)}" x2="${G - sagPay}" y2="${y.toFixed(1)}" stroke="var(--line-soft)" stroke-width="1"/>`;
    s += `<text x="${solPay - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--faint)">${kac(bicim(v))}</text>`;
  });

  barlar.forEach((b, i) => {
    const x = solPay + adim * i + (adim - kal) / 2;
    const y1 = Yp(b.ust), y2 = Yp(b.alt);
    const c = b.tur === 'baslangic' ? 'var(--blue)'
            : b.tur === 'toplam' ? (b.deger >= 0 ? 'var(--gold)' : 'var(--red)')
            : b.negatif ? 'var(--red)' : 'var(--em)';
    s += `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${kal.toFixed(1)}" height="${Math.max(y2 - y1, 2).toFixed(1)}" rx="4" fill="${c}" opacity="${b.tur === 'baslangic' || b.tur === 'toplam' ? 1 : .85}"><title>${kac(b.ad)}: ${kac(bicim(b.deger))}</title></rect>`;
    if (i < barlar.length - 1 && b.tur !== 'toplam') {
      const yc = Yp(b.tur === 'baslangic' ? b.ust : (b.negatif ? b.alt : b.ust));
      s += `<line x1="${(x + kal).toFixed(1)}" y1="${yc.toFixed(1)}" x2="${(x + adim).toFixed(1)}" y2="${yc.toFixed(1)}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 2" opacity=".55"/>`;
    }
    const kelimeler = String(b.ad).split(' ');
    const satir1 = kelimeler.slice(0, 2).join(' ');
    const satir2 = kelimeler.slice(2).join(' ');
    s += `<text x="${(x + kal / 2).toFixed(1)}" y="${Y - (satir2 ? 16 : 8)}" text-anchor="middle" font-size="9.5" fill="var(--faint)">${kac(satir1)}</text>`;
    if (satir2) s += `<text x="${(x + kal / 2).toFixed(1)}" y="${Y - 6}" text-anchor="middle" font-size="9.5" fill="var(--faint)">${kac(satir2)}</text>`;
  });
  s += '</svg>';
  return s;
}

/* ============================================================
   Karşılaştırmalı ikili çubuk (asgari vs tam ödeme gibi)
   ============================================================ */
export function ikiliKarsilastir(a, b, secenek = {}) {
  const { bicim = tlKisa } = secenek;
  const mx = Math.max(a.deger, b.deger, 1);
  const sat = (d, ana) => `
    <div style="margin-bottom:${ana ? 12 : 0}px">
      <div class="esnek-ara mini" style="margin-bottom:4px">
        <span class="kalin" style="color:${d.renk}">${kac(d.ad)}</span>
        <span class="num kalin" style="font-size:13.5px;color:${d.renk}">${kac(bicim(d.deger))}</span>
      </div>
      <div class="cubuk kalin"><i style="width:${(d.deger / mx * 100).toFixed(1)}%;background:${d.renk}"></i></div>
      ${d.alt ? `<div class="mini r-faint" style="margin-top:3px">${kac(d.alt)}</div>` : ''}
    </div>`;
  return sat(a, true) + sat(b, false);
}

function bosGrafik(y) {
  return `<div style="height:${y}px;display:grid;place-items:center;color:var(--faint);font-size:12.5px;border:1px dashed var(--line);border-radius:14px">Grafik için yeterli veri yok</div>`;
}

/** Lejant üretir. */
export function lejant(kalemler) {
  return `<div class="g-lejant">${kalemler.map((k, i) =>
    `<span class="kal"><span class="kutu" style="background:${k.renk || renk(i)}"></span>${kac(k.ad)}${k.deger !== undefined ? ` <b style="color:var(--ink-2)">${kac(k.deger)}</b>` : ''}</span>`
  ).join('')}</div>`;
}
