/* =========================================================================
   PARA BİLİNCİ — UYGULAMA MANTIĞI
   Tüm veriler yalnızca tarayıcıda (localStorage) tutulur.
   ========================================================================= */
"use strict";

/* ============================== YARDIMCILAR ============================== */
var DAY = 86400000;
var $ = function (id) { return document.getElementById(id); };
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function num(v) {
  if (v == null) return 0;
  var n = parseFloat(String(v).replace(/\./g, function (m, i, str) {
    // "1.234,56" biçimini destekle: virgül varsa noktalar binlik ayracıdır
    return String(v).indexOf(",") > -1 ? "" : m;
  }).replace(",", "."));
  return isFinite(n) ? n : 0;
}
function fmtTL(n) { return Math.round(n).toLocaleString("tr-TR") + " ₺"; }
function fmt2(n) { return (+n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtUSD(n) { return "$" + Math.round(n).toLocaleString("tr-TR"); }
function fmtPct(n, d) { return "%" + (+n).toLocaleString("tr-TR", { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function monthPrefix() { return todayStr().slice(0, 7); }
function daysInMonth() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
function L(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
/* Formu durumdan doldururken o an yazılan inputun üzerine yazma */
function setVal(id, v) { var el = $(id); if (el && el !== document.activeElement) el.value = v; }
function S(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

/* ============================== DURUM (STATE) ============================== */
var ST = {
  settings: Object.assign({ hhSize: 1, lifeBudget: 0, efNow: 0 }, L("pb2_settings", {})),
  assets: Object.assign({ tl: 0, usd: 0, eur: 0, au: 0 }, L("pb2_assets", {})),
  incomes: L("pb2_incomes", []),
  expenses: L("pb2_expenses", []),
  bills: L("pb2_bills", []),
  installments: L("pb2_inst", []),
  debts: L("pb2_debts", []),
  kk: Object.assign({ debt: 0, asgari: 0, pay: 0 }, L("pb2_kk", {})),
  scores: L("pb2_scores", []),
  gate: L("pb2_gate", [])
};
function persist() {
  S("pb2_settings", ST.settings); S("pb2_assets", ST.assets); S("pb2_incomes", ST.incomes);
  S("pb2_expenses", ST.expenses); S("pb2_bills", ST.bills); S("pb2_inst", ST.installments);
  S("pb2_debts", ST.debts); S("pb2_kk", ST.kk); S("pb2_scores", ST.scores); S("pb2_gate", ST.gate);
}

/* Piyasa durumu (canlı katmandan doldurulur) */
var MK = { spot: null, hist: null, yearAgoRate: null };

var CATS = ["Market", "Yeme-İçme", "Ulaşım", "Fatura", "Kira", "Giyim", "Sağlık", "Eğitim", "Abonelik", "Eğlence", "Ev", "Diğer"];
var gateType = "istek";

/* ============================== TÜRETİLMİŞ DEĞERLER ============================== */
function incomeTotal() { return ST.incomes.reduce(function (a, b) { return a + b.amt; }, 0); }
function billsMonthly() { return ST.bills.filter(function (b) { return b.repeat; }).reduce(function (a, b) { return a + b.amt; }, 0); }
function billsOneShotOpen() { return ST.bills.filter(function (b) { return !b.repeat; }).reduce(function (a, b) { return a + b.amt; }, 0); }
function instMonthly() { return ST.installments.filter(function (t) { return t.left > 0; }).reduce(function (a, b) { return a + b.amt; }, 0); }
function instRemainTotal() { return ST.installments.reduce(function (a, b) { return a + b.amt * Math.max(b.left, 0); }, 0); }
function debtsRemain() { return ST.debts.reduce(function (a, b) { return a + Math.max(b.total - b.paid, 0); }, 0); }
function totalDebt() { return debtsRemain() + instRemainTotal() + (ST.kk.debt || 0) + billsOneShotOpen(); }
function assetsTL() {
  var s = MK.spot || {};
  var usd = s.usdtry || 0, eur = s.eurtry || 0, au = s.gramGold || 0;
  return ST.assets.tl + ST.assets.usd * usd + ST.assets.eur * eur + ST.assets.au * au;
}
function monthExpenses() {
  var mp = monthPrefix();
  return ST.expenses.filter(function (e) { return (e.date || "").slice(0, 7) === mp; });
}
function monthSpent() { return monthExpenses().reduce(function (a, b) { return a + b.amount; }, 0); }
function monthLifeSpent() {
  // yaşam bütçesi kotası: fatura/kira/taksit ödemeleri hariç harcamalar
  return monthExpenses().filter(function (e) { return e.cat !== "Fatura" && e.cat !== "Kira"; })
    .reduce(function (a, b) { return a + b.amount; }, 0);
}
function todaySpent() {
  var t = todayStr();
  return ST.expenses.filter(function (e) { return e.date === t; }).reduce(function (a, b) { return a + b.amount; }, 0);
}
function hourlyWage() {
  var inc = incomeTotal();
  return inc > 0 ? inc / PB_DATA.defaults.monthlyWorkHours : 0;
}
function latestInflation() {
  var inf = PB_DATA.inflation;
  return {
    month: inf.months[inf.months.length - 1],
    tuik: inf.tuik.annual[inf.tuik.annual.length - 1],
    enag: inf.enag.annual[inf.enag.annual.length - 1]
  };
}
function kkTier(debt) {
  var t = PB_DATA.creditCard.tiers;
  for (var i = 0; i < t.length; i++) if (debt < t[i].maxDebt || i === t.length - 1) return t[i];
  return t[t.length - 1];
}

/* ============================== GRAFİK MOTORU (SVG) ============================== */
/* lineChart: box=container el, series=[{name,color,values:[y...]}], labels=[x etiketi...] */
function lineChart(box, series, labels, opts) {
  opts = opts || {};
  var W = 700, H = opts.height || 240, PL = 50, PR = 14, PT = 14, PB = 28;
  var all = [];
  series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) all.push(v); }); });
  if (!all.length) { box.innerHTML = '<div class="empty">Veri yok.</div>'; return; }
  var min = Math.min.apply(null, all), max = Math.max.apply(null, all);
  var padY = (max - min) * 0.12 || max * 0.05 || 1;
  min -= padY; max += padY;
  if (opts.zeroMin) min = Math.min(min, 0);
  var iw = W - PL - PR, ih = H - PT - PB;
  var n = labels.length;
  function X(i) { return PL + (n <= 1 ? iw / 2 : i * iw / (n - 1)); }
  function Y(v) { return PT + ih - (v - min) / (max - min) * ih; }

  var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img">';
  // ızgara + y etiketleri
  for (var g = 0; g <= 3; g++) {
    var vy = min + (max - min) * g / 3, py = Y(vy);
    svg += '<line x1="' + PL + '" y1="' + py + '" x2="' + (W - PR) + '" y2="' + py + '" stroke="var(--grid)" stroke-width="1"/>';
    svg += '<text x="' + (PL - 7) + '" y="' + (py + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' +
      (opts.yFmt ? opts.yFmt(vy) : Math.round(vy)) + "</text>";
  }
  // x etiketleri (seyrek)
  var step = Math.max(1, Math.ceil(n / (opts.maxXLabels || 7)));
  for (var i = 0; i < n; i += step) {
    svg += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + esc(labels[i]) + "</text>";
  }
  // seriler
  series.forEach(function (s) {
    var dPath = "";
    s.values.forEach(function (v, i) { if (v != null) dPath += (dPath ? " L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); });
    svg += '<path d="' + dPath + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    var lastIdx = s.values.length - 1;
    while (lastIdx >= 0 && s.values[lastIdx] == null) lastIdx--;
    if (lastIdx >= 0) {
      svg += '<circle cx="' + X(lastIdx) + '" cy="' + Y(s.values[lastIdx]) + '" r="3.5" fill="' + s.color + '" stroke="var(--card)" stroke-width="2"/>';
      if (opts.endLabels) {
        svg += '<text x="' + (X(lastIdx) - 6) + '" y="' + (Y(s.values[lastIdx]) - 9) + '" text-anchor="end" font-size="11.5" font-weight="700" fill="var(--ink2)">' +
          (opts.yFmt ? opts.yFmt(s.values[lastIdx]) : s.values[lastIdx]) + "</text>";
      }
    }
  });
  svg += '<line class="vl" x1="-9" y1="' + PT + '" x2="-9" y2="' + (PT + ih) + '" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>';
  svg += "</svg>";
  box.innerHTML = svg + '<div class="tooltip"></div>';

  // hover: en yakın noktaya kilitlen, tooltip göster
  var svgEl = box.querySelector("svg"), tip = box.querySelector(".tooltip"), vl = box.querySelector(".vl");
  function onMove(ev) {
    var r = svgEl.getBoundingClientRect();
    var cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    var px = cx / r.width * W;
    var idx = Math.round((px - PL) / (iw / Math.max(n - 1, 1)));
    idx = Math.max(0, Math.min(n - 1, idx));
    vl.setAttribute("x1", X(idx)); vl.setAttribute("x2", X(idx)); vl.setAttribute("opacity", ".7");
    var html = "<b>" + esc(labels[idx]) + "</b>";
    series.forEach(function (s) {
      var v = s.values[idx];
      if (v != null) html += '<br><span style="color:' + s.color + '">●</span> ' + esc(s.name) + ": <b>" +
        (opts.yFmt ? opts.yFmt(v) : v) + "</b>";
    });
    tip.innerHTML = html; tip.style.display = "block";
    var bx = box.getBoundingClientRect();
    var tx = X(idx) / W * r.width + 12;
    if (tx + tip.offsetWidth + 8 > bx.width) tx = X(idx) / W * r.width - tip.offsetWidth - 12;
    tip.style.left = Math.max(4, tx) + "px"; tip.style.top = "10px";
  }
  function onOut() { tip.style.display = "none"; vl.setAttribute("opacity", "0"); }
  svgEl.addEventListener("mousemove", onMove);
  svgEl.addEventListener("touchstart", onMove, { passive: true });
  svgEl.addEventListener("touchmove", onMove, { passive: true });
  svgEl.addEventListener("mouseleave", onOut);
}

function sparkline(box, values, color) {
  if (!values || values.length < 2) { box.innerHTML = ""; return; }
  var W = 560, H = 46, min = Math.min.apply(null, values), max = Math.max.apply(null, values);
  if (max === min) max = min + 1;
  var d = "";
  values.forEach(function (v, i) {
    d += (i ? " L" : "M") + (i * W / (values.length - 1)).toFixed(1) + " " +
      (H - 4 - (v - min) / (max - min) * (H - 8)).toFixed(1);
  });
  box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" style="width:100%;height:46px">' +
    '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2"/></svg>';
}

/* 7 günlük dikey bar grafiği + günlük kota çizgisi */
function weekBars(box, days, quota) {
  var W = 700, H = 150, PL = 46, PR = 10, PT = 10, PB = 24;
  var max = Math.max(quota || 0, Math.max.apply(null, days.map(function (d) { return d.sum; })), 1);
  max *= 1.15;
  var iw = W - PL - PR, ih = H - PT - PB, bw = iw / days.length;
  var svg = '<svg viewBox="0 0 ' + W + " " + H + '">';
  for (var g = 0; g <= 2; g++) {
    var vy = max * g / 2, py = PT + ih - vy / max * ih;
    svg += '<line x1="' + PL + '" y1="' + py + '" x2="' + (W - PR) + '" y2="' + py + '" stroke="var(--grid)"/>';
    svg += '<text x="' + (PL - 6) + '" y="' + (py + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' +
      (vy >= 1000 ? Math.round(vy / 100) / 10 + "k" : Math.round(vy)) + "</text>";
  }
  days.forEach(function (d, i) {
    var h = d.sum / max * ih, x = PL + i * bw + bw * 0.2, w = bw * 0.6;
    var y = PT + ih - h;
    svg += '<rect x="' + x.toFixed(1) + '" y="' + (d.sum ? y.toFixed(1) : PT + ih - 2) + '" width="' + w.toFixed(1) +
      '" height="' + (d.sum ? Math.max(h, 3).toFixed(1) : 2) + '" rx="4" fill="' +
      (d.sum ? "var(--s1)" : "var(--line)") + '"><title>' + esc(d.lbl) + ": " + fmtTL(d.sum) + "</title></rect>";
    svg += '<text x="' + (x + w / 2) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + esc(d.lbl) + "</text>";
  });
  if (quota > 0 && quota < max) {
    var qy = PT + ih - quota / max * ih;
    svg += '<line x1="' + PL + '" y1="' + qy + '" x2="' + (W - PR) + '" y2="' + qy +
      '" stroke="var(--s2)" stroke-width="1.5" stroke-dasharray="5 4"><title>Günlük kota: ' + fmtTL(quota) + "</title></line>";
    svg += '<text x="' + (W - PR) + '" y="' + (qy - 5) + '" text-anchor="end" font-size="10.5" fill="var(--s2)">güne düşen</text>';
  }
  box.innerHTML = svg + "</svg>";
}

/* Yatay oran/tutar barları */
function barRows(box, rows, opts) {
  opts = opts || {};
  if (!rows.length) { box.innerHTML = '<div class="empty">' + (opts.empty || "Veri yok.") + "</div>"; return; }
  var max = Math.max.apply(null, rows.map(function (r) { return r.v; }));
  box.innerHTML = rows.map(function (r) {
    return '<div class="catrow"><span class="nm" title="' + esc(r.note || "") + '">' + esc(r.name) + "</span>" +
      '<span class="track"><i style="width:' + Math.max(r.v / max * 100, 1).toFixed(1) + '%" class="' + (r.hot ? "hot" : "") + '"></i></span>' +
      '<span class="val">' + (opts.fmt ? opts.fmt(r.v) : r.v) + "</span></div>";
  }).join("");
}

/* ============================== SEKME GEZİNTİSİ ============================== */
document.querySelectorAll("nav button").forEach(function (b) {
  b.addEventListener("click", function () { showTab(b.dataset.tab); });
});
function showTab(tab) {
  document.querySelectorAll("nav button").forEach(function (x) { x.classList.toggle("on", x.dataset.tab === tab); });
  document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("on", p.id === "sec-" + tab); });
  try { history.replaceState(null, "", "#" + tab); } catch (e) {}
}
document.querySelectorAll(".tk").forEach(function (b) {
  b.addEventListener("click", function () { showTab(b.dataset.goto); });
});
if (location.hash && $("sec-" + location.hash.slice(1))) showTab(location.hash.slice(1));

/* ============================== PANEL ============================== */
function bindPanel() {
  [["goalName", "name"], ["goalAmt", "amount"], ["goalDate", "date"]].forEach(function (p) {
    $(p[0]).addEventListener("change", function () {
      if (!ST.settings.goal) ST.settings.goal = { name: "", amount: 0, date: "" };
      ST.settings.goal[p[1]] = p[1] === "amount" ? num($(p[0]).value) : $(p[0]).value.trim();
      persist(); renderAll();
    });
  });
  [["aTL", "tl"], ["aUSD", "usd"], ["aEUR", "eur"], ["aAU", "au"]].forEach(function (p) {
    $(p[0]).addEventListener("change", function () {
      ST.assets[p[1]] = num($(p[0]).value); persist(); renderAll();
    });
  });
  $("lifeBudget").addEventListener("change", function () {
    ST.settings.lifeBudget = num($("lifeBudget").value); persist(); renderAll();
  });
}
/* Disiplin ölçümü: son 30 günde günlük yaşam kotası içinde kalınan günler.
   Yalnızca kayıt tutulan dönem sayılır — kayıtsız günlere disiplin puanı yazılmaz. */
function disciplineStats() {
  var budget = ST.settings.lifeBudget || 0;
  if (budget <= 0 || !ST.expenses.length) return null;
  var ref = budget / daysInMonth();
  var firstDate = ST.expenses.reduce(function (a, e) { return e.date < a ? e.date : a; }, "9999-12-31");
  var days = 0, ok = 0, streak = 0, streakAlive = true;
  for (var i = 0; i < 30; i++) {
    var d = new Date(); d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    if (ds < firstDate) break; // kayıt başlamadan önceki günler ölçüme girmez
    var spent = ST.expenses.filter(function (e) { return e.date === ds && e.cat !== "Fatura" && e.cat !== "Kira"; })
      .reduce(function (a, b) { return a + b.amount; }, 0);
    var inQuota = spent <= ref;
    days++; if (inQuota) ok++;
    if (streakAlive) { if (inQuota) streak++; else streakAlive = false; }
  }
  return { days: days, ok: ok, streak: streak, ref: ref };
}
function renderGoal() {
  var g = ST.settings.goal || { name: "", amount: 0, date: "" };
  setVal("goalName", g.name || ""); setVal("goalAmt", g.amount || ""); setVal("goalDate", g.date || "");
  var box = $("goalOut");
  if (!(g.amount > 0)) {
    box.innerHTML = '<p class="note">Rakamı olmayan hedef, dilektir. Bir tutar yaz — motivasyonu rakam verir, sonucu <b>disiplin</b> getirir.</p>';
    return;
  }
  var cur = assetsTL(), pct = Math.min(cur / g.amount * 100, 100), remaining = Math.max(g.amount - cur, 0);
  var s = MK.spot || {};
  var html = '<div class="goalnums">' +
    '<div><div class="l">' + (g.name ? esc(g.name) : "Hedef") + "</div><div class=\"big\">" + fmtTL(g.amount) +
    (s.usdtry ? ' <span class="l">(≈ ' + fmtUSD(g.amount / s.usdtry) + ")</span>" : "") + "</div></div>" +
    '<div style="text-align:right"><div class="l">Varlıklarının bugünkü değeri</div><div class="mid">' + fmtTL(cur) + "</div></div></div>" +
    '<div class="bar"><i class="goldbar" style="width:' + pct.toFixed(1) + '%"></i></div>';
  if (cur >= g.amount) {
    html += '<p class="note">🎉 <b>Hedef tamam.</b> Bunu motivasyon değil disiplin yaptı — aynı düzenle yeni hedefi yaz, çıtayı yükselt.</p>';
  } else {
    html += '<p class="note">Hedefe kalan: <b class="gold">' + fmtTL(remaining) + "</b> (doluluk: %" + Math.round(pct) + ").";
    if (g.date && /^\d{4}-\d{2}$/.test(g.date)) {
      var now = new Date();
      var monthsLeft = (+g.date.slice(0, 4) - now.getFullYear()) * 12 + (+g.date.slice(5, 7) - (now.getMonth() + 1));
      if (monthsLeft <= 0) {
        html += " Hedef tarihi geldi/geçti — tarihi güncelle ya da tempoyu konuşalım.";
      } else {
        var need = remaining / monthsLeft;
        var investable = incomeTotal() - (billsMonthly() + instMonthly()) - (ST.settings.lifeBudget || 0);
        html += " Kalan <b>" + monthsLeft + " ayda</b> ayda ≈ <b>" + fmtTL(need) + "</b> ayırman gerek.";
        if (incomeTotal() > 0 && ST.settings.lifeBudget > 0) {
          html += investable >= need
            ? " Planındaki yatırılabilir tutar (" + fmtTL(investable) + ") bu tempoyu <b class='green'>karşılıyor ✓</b> — iş, her ay aksatmamakta."
            : " Planındaki yatırılabilir tutar (" + fmtTL(Math.max(investable, 0)) + ") bu temponun <b class='red'>altında</b> — ya tarih uzayacak ya giderler kısılacak. Grafik bunu krizden önce söyledi.";
        }
      }
    }
    html += "</p>";
  }
  var d = disciplineStats();
  if (d) {
    html += '<div class="streak">' +
      '<span class="schip' + (d.streak >= 3 ? " hot" : "") + '">🔥 Seri: <b>' + d.streak + " gün</b> kota içinde</span>" +
      '<span class="schip">Son ' + d.days + " günün <b>" + d.ok + "</b> günü disiplinli</span>" +
      '<span class="schip">Günlük referans: <b>' + fmtTL(d.ref) + "</b></span></div>";
    html += '<p class="note">' + (d.streak >= 7 ? "Bu seri artık alışkanlık olmaya başladı — hedefi getiren tam olarak bu."
      : d.streak >= 3 ? "Seri büyüyor. Hatırla: tek büyük fedakârlık değil, sıradan günlerin toplamı kazandırır."
      : "Seri bozulunca sıfırlanır ama emek sıfırlanmaz — bugün yeniden başla, grafik yarın yine sayar.") + "</p>";
  } else {
    html += '<p class="note">Disiplin ölçümü için Panel\'den aylık yaşam bütçeni gir ve harcamalarını kaydet — kota içinde geçen her gün seriye yazılır.</p>';
  }
  box.innerHTML = html;
}
function renderPanel() {
  renderGoal();
  var s = ST.settings, a = ST.assets;
  setVal("aTL", a.tl || ""); setVal("aUSD", a.usd || ""); setVal("aEUR", a.eur || ""); setVal("aAU", a.au || "");
  setVal("lifeBudget", s.lifeBudget || "");

  var hasData = a.tl || ST.incomes.length || ST.expenses.length || ST.bills.length;
  $("panelIntro").style.display = hasData ? "none" : "block";

  // gerçek değer
  var spot = MK.spot, tot = assetsTL();
  $("vTop").textContent = tot > 0 ? fmtTL(tot) : "—";
  if (spot && spot.usdtry && tot > 0) {
    $("vUsd").textContent = fmtUSD(tot / spot.usdtry);
    $("vAu").textContent = spot.gramGold ? fmt2(tot / spot.gramGold) + " gr" : "—";
  } else { $("vUsd").textContent = "—"; $("vAu").textContent = "—"; }

  // erime kutusu
  if (MK.hist && MK.hist.rates.length > 10 && spot) {
    var rNow = MK.hist.rates[MK.hist.rates.length - 1], rAgo = MK.hist.rates[0];
    var meltPct = (rAgo / rNow - 1) * 100; // negatif = TL değer kaybetti
    var base = a.tl > 0 ? a.tl : 10000;
    var txt = (a.tl > 0 ? "Elindeki " + fmtTL(a.tl) : "Örnek: 10.000 ₺") +
      ", " + MK.hist.dates[0].slice(5).split("-").reverse().join(".") + "'de " + fmtUSD(base / rAgo) +
      " ederdi; bugün " + fmtUSD(base / rNow) + ". ";
    if (meltPct < -0.05) txt += "Son ~90 günde dolar bazında <b class='red'>" + fmtPct(Math.abs(meltPct)) + " eridi</b>.";
    else if (meltPct > 0.05) txt += "Son ~90 günde dolar bazında <b class='green'>" + fmtPct(meltPct) + " değer kazandı</b>.";
    else txt += "Son ~90 günde dolar bazında yatay seyretti.";
    $("meltMsg").innerHTML = txt + ' <span class="muted">(' + esc(MK.hist.source) + ")</span>";
    sparkline($("meltSpark"), MK.hist.rates, "var(--s1)");
  } else if (MK.histFailed) {
    $("meltMsg").innerHTML = '<span class="muted">⚠️ Kur geçmişi alınamadı — erime grafiği gösterilemiyor (uydurma veri göstermeyiz).</span>';
  }

  // net durum
  var borc = totalDebt();
  $("nAsset").textContent = fmtTL(assetsTL());
  $("nDebt").textContent = fmtTL(borc);
  var net = assetsTL() - borc;
  $("nNet").textContent = fmtTL(net);
  $("nNet").className = "v " + (net < 0 ? "red" : "green");
  $("nMsg").innerHTML = net < 0
    ? "Eksidesin — bu bir kriz değil, bir <b>başlangıç noktası</b>. Plan sekmesindeki sırayı izle: önce faturalar, sonra en küçük borç."
    : (borc > 0 ? "Artıdasın ama borç var. Kar topu yöntemi: en küçük borcu bitir, motivasyonu büyüt." :
      (net > 0 ? "Temiz durum: borç yok. Şimdi sıra acil fon ve düzenli birikimde. 💪" : ""));

  // bugünkü kota
  var dim = daysInMonth(), dayNum = new Date().getDate(), remDays = dim - dayNum + 1;
  var budget = s.lifeBudget || 0, spent = monthLifeSpent(), tSpent = todaySpent();
  var remBudget = budget - spent;
  var adjDaily = budget > 0 && remDays > 0 ? Math.max(remBudget, 0) / remDays : 0;
  $("qDays").textContent = remDays + " gün";
  $("qDay").textContent = adjDaily > 0 ? fmtTL(adjDaily) : "—";
  $("qToday").textContent = fmtTL(tSpent);
  var qb = $("qBar");
  if (adjDaily > 0) { qb.style.width = Math.min(tSpent / adjDaily * 100, 100) + "%"; qb.className = tSpent > adjDaily ? "over" : ""; }
  else { qb.style.width = "0"; qb.className = ""; }
  $("qMsg").innerHTML = budget <= 0
    ? "Günlük kotanı görmek için aylık yaşam bütçeni gir."
    : remBudget < 0
      ? "⚠️ Bu ayki yaşam bütçeni " + fmtTL(-remBudget) + " aştın. Ay bitmeden frene bas; faturalara dokunma."
      : tSpent > adjDaily
        ? "⚠️ Bugün güne düşeni " + fmtTL(tSpent - adjDaily) + " aştın. Yarın dengelersin — grafik hatırlatır, suçlamaz."
        : "👍 Kalan " + remDays + " günde güne ≈ " + fmtTL(adjDaily) + " düşüyor. Bugün " + fmtTL(adjDaily - tSpent) + " alanın var.";

  renderUpcoming();
  renderFlowSummary();
}

function billStatus(b) {
  // {cls,label,order} — aciliyet sıralaması için
  var today = new Date().getDate();
  if (b.repeat && b.paidMonth === monthPrefix()) return { cls: "b-paid", label: "bu ay ödendi ✓", order: 90 };
  var diff = b.day - today;
  if (diff < 0) return { cls: "b-late", label: "GECİKTİ (" + Math.abs(diff) + " gün)", order: -1 - Math.abs(diff) / 100 };
  if (diff === 0) return { cls: "b-today", label: "SON GÜN BUGÜN", order: 1 };
  if (diff <= 3) return { cls: "b-soon", label: diff + " gün kaldı", order: 2 + diff / 100 };
  if (diff <= 7) return { cls: "b-soon", label: "bu hafta (" + diff + " gün)", order: 3 + diff / 100 };
  return { cls: "b-ok", label: "ayın " + b.day + ". günü", order: 4 + diff / 100 };
}
function renderUpcoming() {
  var list = [];
  ST.bills.forEach(function (b) {
    var stt = billStatus(b);
    if (stt.cls !== "b-paid") list.push({ name: b.name, amt: b.amt, s: stt });
  });
  ST.installments.forEach(function (t) {
    if (t.left > 0 && t.paidMonth !== monthPrefix()) {
      var stt = billStatus({ day: t.day || 1, repeat: true, paidMonth: "" });
      list.push({ name: t.name + " (taksit)", amt: t.amt, s: stt });
    }
  });
  list.sort(function (a, b) { return a.s.order - b.s.order; });
  $("upcoming").innerHTML = list.length
    ? list.slice(0, 5).map(function (u) {
        return '<div class="item"><div class="top"><span class="nm">' + esc(u.name) +
          '<span class="badge ' + u.s.cls + '">' + u.s.label + "</span></span>" +
          '<span class="pr">' + fmtTL(u.amt) + "</span></div></div>";
      }).join("") + (list.length > 5 ? '<p class="note">+' + (list.length - 5) + ' ödeme daha — Fatura·Borç sekmesinde.</p>' : "")
    : '<div class="empty">Yaklaşan ödeme yok. Faturalarını eklersen öncelik sırası burada kurulur.</div>';
}
function renderFlowSummary() {
  var inc = incomeTotal(), oblig = billsMonthly() + instMonthly(), spent = monthSpent();
  var rows = [
    ["＋ Gelir (aylık)", inc, "green"],
    ["－ Sabit yükümlülük (fatura + taksit)", oblig, ""],
    ["－ Bu ay harcanan", spent, ""],
    ["= Kalan", inc - oblig - spent, inc - oblig - spent < 0 ? "red" : "gold"]
  ];
  $("flowSummary").innerHTML = rows.map(function (r) {
    return '<div class="pstep"><span class="no">' + (r[0][0]) + '</span><span class="t">' + esc(r[0].slice(1).trim()) +
      '</span><span class="v ' + r[2] + '">' + fmtTL(r[1]) + "</span></div>";
  }).join("") + '<p class="note">Kalan tutarın nereye gideceği Plan·Yatırım sekmesinde: önce acil fon, sonra yatırım.</p>';
}

/* ============================== PİYASA ============================== */
function renderTicker() {
  var s = MK.spot;
  if (!s) return;
  $("tkUsd").textContent = s.usdtry ? fmt2(s.usdtry) : "—";
  $("tkEur").textContent = s.eurtry ? fmt2(s.eurtry) : "—";
  $("tkAu").textContent = s.gramGold ? fmtTL(s.gramGold) : "—";
  $("tkBist").textContent = s.xu100 ? Math.round(s.xu100).toLocaleString("tr-TR") : "—";
  var li = latestInflation();
  $("tkInf").textContent = fmtPct(li.tuik) + " / " + fmtPct(li.enag);
  // USD günlük değişim (geçmişten)
  if (MK.hist && MK.hist.rates.length > 1) {
    var r = MK.hist.rates, chg = (r[r.length - 1] / r[r.length - 2] - 1) * 100;
    var el = document.createElement("span");
    el.className = "chg " + (chg >= 0 ? "up" : "down");
    el.textContent = (chg >= 0 ? "▲" : "▼") + Math.abs(chg).toFixed(2) + "%";
    var host = $("tkUsd"); host.querySelectorAll(".chg").forEach ? host.querySelectorAll(".chg").forEach(function(x){x.remove();}) : null;
    host.appendChild(el);
  }
  $("tickerSrc").textContent = "Kaynak: " + s.source + (s.snapshotNote ? " · " + s.snapshotNote : "") +
    " · Enflasyon: TÜİK & ENAG (" + latestInflation().month + ")";
}
function renderMarket() {
  var s = MK.spot;
  if (s) {
    $("mUsd").textContent = s.usdtry ? fmt2(s.usdtry) : "—";
    $("mEur").textContent = s.eurtry ? fmt2(s.eurtry) : "—";
    $("mAu").textContent = s.gramGold ? fmtTL(s.gramGold) : "—";
    $("mBist").textContent = s.xu100 ? Math.round(s.xu100).toLocaleString("tr-TR") : "—";
    $("mSrc").textContent = "Kaynak: " + s.source + (s.snapshotNote ? " · " + s.snapshotNote : "");
  }
  // enflasyon kartı
  var inf = PB_DATA.inflation, li = latestInflation();
  $("infTuik").textContent = fmtPct(li.tuik, 2);
  $("infEnag").textContent = fmtPct(li.enag, 2);
  $("infGap").textContent = fmtPct(li.enag - li.tuik, 2);
  var mLabels = inf.months.map(function (m) {
    var ay = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"][+m.slice(5) - 1];
    return ay + " " + m.slice(2, 4);
  });
  lineChart($("infChart"), [
    { name: "TÜİK", color: "var(--s1)", values: inf.tuik.annual },
    { name: "ENAG", color: "var(--s2)", values: inf.enag.annual }
  ], mLabels, { yFmt: function (v) { return "%" + Math.round(v); }, endLabels: true });
  $("infSrc").textContent = "Yıllık değişim. Kaynak: " + inf.tuik.source + " · " + inf.enag.source +
    " · Son veri: " + li.month + " · " + inf.note;

  // kategori artışları
  var c = PB_DATA.categoriesAnnual;
  var rows = c.groups.map(function (g) {
    return { name: g.name, v: g.annual, note: g.note, hot: g.annual > c.general };
  });
  rows.push({ name: "GENEL TÜFE", v: c.general, note: "TÜİK genel endeks", hot: false });
  rows.sort(function (a, b) { return b.v - a.v; });
  barRows($("catRows"), rows, { fmt: function (v) { return fmtPct(v, 2); } });
  $("catSrc").textContent = "Kaynak: " + c.source + " (yıllık değişim, " + c.asOf + "). Turuncu: genel enflasyonun üstünde artanlar.";

  renderMeal();
}
function renderFxChart() {
  if (!MK.hist) {
    $("fxChart").innerHTML = '<div class="empty">⚠️ Kur geçmişi alınamadı. Uydurma grafik göstermeyiz — bağlantını kontrol edip ↻ yenile\'ye bas.</div>';
    return;
  }
  var lb = MK.hist.dates.map(function (d) { return d.slice(5).split("-").reverse().join("."); });
  lineChart($("fxChart"), [{ name: "USD/TRY", color: "var(--s1)", values: MK.hist.rates }], lb,
    { yFmt: function (v) { return fmt2(v); }, maxXLabels: 6 });
  $("fxSrc").textContent = "Kaynak: " + MK.hist.source + " — merkez bankaları günlük referans kuru (hafta sonları yayınlanmaz).";
}
function bindMeal() {
  ["dOut", "dHome", "dCount"].forEach(function (id) { $(id).addEventListener("input", renderMeal); });
  $("mRefresh").addEventListener("click", function () {
    try { localStorage.removeItem("pb2_cache_spot"); } catch (e) {}
    initMarket(true);
  });
}
function renderMeal() {
  var out = num($("dOut").value), home = num($("dHome").value), cnt = num($("dCount").value);
  var box = $("mealOut");
  if (!(out > 0 && home >= 0 && cnt > 0)) { box.innerHTML = '<div class="empty">Üç kutuyu doldur, farkın yıllık fotoğrafını gör.</div>'; return; }
  if (out <= home) {
    box.innerHTML = '<p class="note">Bu rakamlarla dışarısı evden pahalı değil — nadir ama mümkün. Yine de porsiyon/kalite farkını hesaba kat.</p>'; return;
  }
  var monthly = (out - home) * cnt, yearly = monthly * 12;
  var s = MK.spot || {};
  var extras = [];
  if (s.usdtry) extras.push("<b>" + fmtUSD(yearly / s.usdtry) + "</b> dolar");
  if (s.gramGold) extras.push("<b>" + fmt2(yearly / s.gramGold) + " gr</b> altın");
  var hw = hourlyWage();
  if (hw > 0) extras.push("<b>" + Math.round(monthly / hw) + " saat</b>lik çalışman (aylık)");
  box.innerHTML =
    '<div class="stats" style="margin-top:12px">' +
    '<div class="stat"><div class="v gold">' + fmtTL(monthly) + '</div><div class="l">Aylık fark</div></div>' +
    '<div class="stat"><div class="v gold">' + fmtTL(yearly) + '</div><div class="l">Yıllık fark</div></div>' +
    '<div class="stat"><div class="v">' + cnt + " öğün</div><div class=\"l\">Ayda dışarıda</div></div></div>" +
    '<p class="note">Evde pişirmenin yıllık karşılığı: ' + (extras.length ? extras.join(" · ") : fmtTL(yearly)) +
    ". Amaç hiç dışarı yememek değil; <b>farkı bilerek</b> seçim yapmak.</p>";
}

/* ============================== GELİR · GİDER ============================== */
function bindFlow() {
  $("hhSize").addEventListener("change", function () { ST.settings.hhSize = Math.max(1, Math.round(num($("hhSize").value)) || 1); persist(); renderAll(); });
  $("inAdd").addEventListener("click", function () {
    var n = $("inName").value.trim(), a = num($("inAmt").value);
    if (!n || a <= 0) { alert("Gelir adı ve tutar gir."); return; }
    ST.incomes.push({ id: uid("i"), name: n, amt: a }); persist();
    $("inName").value = ""; $("inAmt").value = ""; renderAll();
  });
  var sel = $("eCat");
  CATS.forEach(function (c) { var o = document.createElement("option"); o.textContent = c; sel.appendChild(o); });
  $("eDate").value = todayStr();
  $("eAdd").addEventListener("click", function () {
    var n = $("eNm").value.trim(), a = num($("eAmt").value), d = $("eDate").value || todayStr();
    if (!n || a <= 0) { alert("Açıklama ve tutar gir."); return; }
    ST.expenses.push({ id: uid("e"), name: n, amount: a, date: d, cat: sel.value }); persist();
    $("eNm").value = ""; $("eAmt").value = ""; renderAll();
  });
  $("btnCsv").addEventListener("click", exportCSV);
  $("btnBackup").addEventListener("click", backup);
  $("btnRestore").addEventListener("click", function () { $("impFile").click(); });
  $("impFile").addEventListener("change", restore);
}
function renderFlow() {
  setVal("hhSize", ST.settings.hhSize || 1);
  $("incomeTotal").textContent = fmtTL(incomeTotal());
  $("incomeList").innerHTML = ST.incomes.length ? ST.incomes.map(function (i) {
    return '<div class="item"><div class="top"><span class="nm">' + esc(i.name) + '</span><span class="pr green">' +
      fmtTL(i.amt) + ' <button class="xx" data-del-inc="' + i.id + '">✕</button></span></div></div>';
  }).join("") : '<div class="empty">Henüz gelir eklenmedi.</div>';

  var me = monthExpenses(), spent = monthSpent();
  var dayNum = new Date().getDate();
  $("fMonth").textContent = fmtTL(spent);
  $("fDaily").textContent = fmtTL(dayNum > 0 ? spent / dayNum : 0);
  $("fPer").textContent = fmtTL(spent / (ST.settings.hhSize || 1));

  var cm = {};
  me.forEach(function (e) { cm[e.cat] = (cm[e.cat] || 0) + e.amount; });
  var rows = Object.keys(cm).map(function (k) { return { name: k, v: cm[k] }; })
    .sort(function (a, b) { return b.v - a.v; });
  barRows($("catSpend"), rows, { fmt: fmtTL, empty: "Bu ay harcama eklenmedi." });

  // son 7 gün
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(); d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    days.push({
      lbl: ["Pz", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"][d.getDay()],
      sum: ST.expenses.filter(function (e) { return e.date === ds; }).reduce(function (a, b) { return a + b.amount; }, 0)
    });
  }
  var dim = daysInMonth(), remDays = dim - new Date().getDate() + 1;
  var budget = ST.settings.lifeBudget || 0;
  var adjDaily = budget > 0 ? Math.max(budget - monthLifeSpent(), 0) / Math.max(remDays, 1) : 0;
  weekBars($("weekChart"), days, adjDaily);

  var srt = ST.expenses.slice().sort(function (a, b) { return (b.date + b.id).localeCompare(a.date + a.id); });
  $("expTable").innerHTML = srt.map(function (e) {
    return "<tr><td>" + esc(e.date.slice(5).split("-").reverse().join(".")) + "</td><td>" + esc(e.name) +
      '</td><td class="muted">' + esc(e.cat) + '</td><td class="r">' + fmtTL(e.amount) +
      '</td><td><button class="xx" data-del-exp="' + e.id + '">✕</button></td></tr>';
  }).join("");
  $("expEmpty").hidden = !!srt.length;
}
function exportCSV() {
  var rows = [["Tarih", "Aciklama", "Kategori", "Tutar"]].concat(
    ST.expenses.map(function (e) { return [e.date, e.name, e.cat, e.amount]; }));
  var csv = rows.map(function (r) {
    return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
  }).join("\r\n");
  dl(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), "para-bilinci-harcamalar.csv");
}
function backup() {
  dl(new Blob([JSON.stringify({ app: "para-bilinci", v: 3, state: ST }, null, 2)], { type: "application/json" }),
    "para-bilinci-yedek.json");
}
function restore(e) {
  var f = e.target.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = function () {
    try {
      var d = JSON.parse(r.result);
      if (!d || d.app !== "para-bilinci" || d.v !== 3 || !d.state) {
        alert("Bu dosya yeni sürüm yedeği değil. (Eski sürüm verileri taşınmıyor — temiz başlangıç ilkesi.)"); return;
      }
      ST = d.state; persist(); location.reload();
    } catch (err) { alert("Hata: " + err.message); }
  };
  r.readAsText(f);
}
function dl(blob, name) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

/* ============================== FATURA · BORÇ ============================== */
function bindDebt() {
  $("bAdd").addEventListener("click", function () {
    var n = $("bNm").value.trim(), a = num($("bAmt").value), d = Math.round(num($("bDay").value));
    if (!n || a <= 0 || d < 1 || d > 31) { alert("Fatura adı, tutar ve 1-31 arası gün gir."); return; }
    ST.bills.push({ id: uid("b"), name: n, amt: a, day: d, repeat: $("bRepeat").checked, paidMonth: "" });
    persist(); $("bNm").value = ""; $("bAmt").value = ""; $("bDay").value = ""; renderAll();
  });
  ["kkDebt", "kkAsgari", "kkPay"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      ST.kk = { debt: num($("kkDebt").value), asgari: num($("kkAsgari").value), pay: num($("kkPay").value) };
      persist(); renderKK();
    });
  });
  $("tAdd").addEventListener("click", function () {
    var n = $("tNm").value.trim(), a = num($("tAmt").value), l = Math.round(num($("tLeft").value)), d = Math.round(num($("tDay").value)) || 1;
    if (!n || a <= 0 || l <= 0) { alert("Taksit adı, aylık tutar ve kalan ay gir."); return; }
    ST.installments.push({ id: uid("t"), name: n, amt: a, left: l, day: d, paidMonth: "" });
    persist(); $("tNm").value = ""; $("tAmt").value = ""; $("tLeft").value = ""; $("tDay").value = ""; renderAll();
  });
  $("dAdd").addEventListener("click", function () {
    var n = $("dNm").value.trim(), a = num($("dAmt").value);
    if (!n || a <= 0) { alert("Borç adı ve tutar gir."); return; }
    ST.debts.push({ id: uid("d"), name: n, total: a, paid: 0 });
    persist(); $("dNm").value = ""; $("dAmt").value = ""; renderAll();
  });
  $("scAdd").addEventListener("click", function () {
    var v = Math.round(num($("scNew").value));
    if (v < 1 || v > 1900) { alert("Findeks notu 1 ile 1900 arasındadır."); return; }
    ST.scores.push({ date: todayStr(), score: v });
    persist(); $("scNew").value = ""; renderAll();
  });
}
function renderBills() {
  var sorted = ST.bills.slice().sort(function (a, b) { return billStatus(a).order - billStatus(b).order; });
  $("billList").innerHTML = sorted.length ? sorted.map(function (b) {
    var stt = billStatus(b), paid = stt.cls === "b-paid";
    return '<div class="item"><div class="top"><span class="nm">' + esc(b.name) +
      '<span class="badge ' + stt.cls + '">' + stt.label + "</span>" +
      (b.repeat ? "" : '<span class="badge b-paid">tek seferlik</span>') + "</span>" +
      '<span class="pr">' + fmtTL(b.amt) + "</span></div>" +
      '<div class="acts">' +
      (paid ? '<button class="a-plain" data-unpay-bill="' + b.id + '">↩ ödenmedi say</button>'
            : '<button class="a-ok" data-pay-bill="' + b.id + '">💸 Ödedim (gidere işle)</button>') +
      '<button class="a-plain" style="flex:0 0 auto" data-del-bill="' + b.id + '">sil</button></div></div>';
  }).join("") : '<div class="empty">Fatura ekle — son ödeme gününe göre aciliyet sırası kendiliğinden kurulur.</div>';
}
function renderKK() {
  var c = PB_DATA.creditCard;
  setVal("kkDebt", ST.kk.debt || ""); setVal("kkAsgari", ST.kk.asgari || ""); setVal("kkPay", ST.kk.pay || "");
  $("kkSrc").textContent = "Oranlar: " + c.source + " (" + c.asOf + " itibarıyla, aylık akdi " +
    c.tiers.map(function (t) { return "%" + fmt2(t.akdi).replace(",00", "") + " (" + t.label + ")"; }).join(" · ") +
    "). Faize KKDF+BSMV (%" + (c.kkdf + c.bsmv) + ") eklenir. " + c.note;
  var D = ST.kk.debt, A = ST.kk.asgari || (D > 0 ? D * 0.2 : 0), P = ST.kk.pay;
  var box = $("kkOut");
  if (!(D > 0)) { box.innerHTML = '<div class="empty">Dönem borcunu gir — asgari ile tam ödemenin gerçek farkını gör.</div>'; return; }
  var tier = kkTier(D);
  var rEff = tier.akdi * (1 + (c.kkdf + c.bsmv) / 100); // vergili efektif aylık %
  var html = '<p class="note">Borcun <b>' + esc(tier.label) + '</b> kademesinde: aylık akdi faiz %' + fmt2(tier.akdi) +
    ", vergilerle birlikte <b>≈ %" + fmt2(rEff) + "</b> işler.</p>";

  if (P >= D) {
    html += '<div class="item"><div class="nm green">✅ Tamamını ödüyorsun</div><div class="meta">Faiz: <b>0 ₺</b>. Kredi kartının tek doğru kullanımı bu — faizi bankaya değil kendine bırakıyorsun.</div></div>';
  } else {
    if (P < A) {
      html += '<div class="item"><div class="nm red">🚨 Asgarinin (' + fmtTL(A) + ") altı: tehlike bölgesi</div>" +
        '<div class="meta">Asgari altı ödemede <b>gecikme faizi</b> (%' + fmt2(tier.gecikme) +
        " + vergi) işler ve <b>kredi notun düşer</b>. Ne yapıp edip önce asgariyi tamamla.</div></div>";
    }
    var kalan = D - Math.max(P, 0);
    var faiz = kalan * rEff / 100;
    html += '<div class="item"><div class="nm">' + (P >= A ? "⚠️ Kısmi ödeme" : "Ödeme sonrası") + "</div>" +
      '<div class="meta">Kalan ' + fmtTL(kalan) + " borca gelecek ay ≈ <b class='red'>" + fmtTL(faiz) +
      " faiz</b> eklenir. Tam ödeseydin bu para sende kalırdı.</div></div>";

    // "hep asgari" simülasyonu — gerçek oranla
    var bal = D, months = 0, totInt = 0, ratio = Math.max(A / D, 0.2);
    while (bal > 1 && months < 240) {
      var i2 = bal * rEff / 100; totInt += i2; bal += i2;
      bal -= Math.max(bal * ratio, 200);
      months++;
    }
    html += '<div class="item"><div class="nm">🕳️ "Hep asgariyi ödersem?"</div><div class="meta">' +
      (months >= 240 ? "Bu borç asgariyle <b>kapanmıyor</b> — faiz, ödemeni yutuyor." :
        "Borç ancak <b>" + months + " ayda</b> biter ve toplamda ≈ <b class='red'>" + fmtTL(totInt) +
        " faiz</b> ödersin (" + fmtTL(D) + " borç için!). Asgari, borcu kapatmaz; <b>uzatır</b>.") +
      "</div></div>";
  }
  box.innerHTML = html;
}
function renderInst() {
  $("instMonthly").textContent = fmtTL(instMonthly());
  $("instTotal").textContent = fmtTL(instRemainTotal());
  var act = ST.installments.filter(function (t) { return t.left > 0; });
  $("instCnt").textContent = act.length;
  $("instList").innerHTML = ST.installments.length ? ST.installments.map(function (t) {
    var done = t.left <= 0, paidThis = t.paidMonth === monthPrefix();
    return '<div class="item"><div class="top"><span class="nm">' + (done ? "✅ " : "") + esc(t.name) +
      (done ? "" : '<span class="badge ' + (paidThis ? "b-paid" : "b-ok") + '">' +
        (paidThis ? "bu ay ödendi" : t.left + " ay kaldı · ayın " + t.day + ". günü") + "</span>") + "</span>" +
      '<span class="pr">' + (done ? "bitti 🎉" : fmtTL(t.amt) + "/ay") + "</span></div>" +
      (done ? "" : '<div class="meta">Kalan toplam: ' + fmtTL(t.amt * t.left) + "</div>") +
      '<div class="acts">' +
      (done || paidThis ? "" : '<button class="a-ok" data-pay-inst="' + t.id + '">💸 Bu ayınkini ödedim</button>') +
      '<button class="a-plain" style="flex:0 0 auto" data-del-inst="' + t.id + '">sil</button></div></div>';
  }).join("") : '<div class="empty">Taksit yoksa harika — taksit, geleceğe atılmış borçtur.</div>';
  var inc = incomeTotal();
  if (inc > 0 && instMonthly() > inc * 0.3) {
    $("instList").innerHTML += '<p class="note">⚠️ Taksit yükü / gelir oranın <b>%' +
      Math.round(instMonthly() / inc * 100) + "</b> — %30 üstü risk bölgesidir. Yeni taksit alma.</p>";
  }
}
function renderDebts() {
  var sorted = ST.debts.slice().sort(function (a, b) { return (a.total - a.paid) - (b.total - b.paid); });
  $("debtList").innerHTML = sorted.length ? sorted.map(function (d, i) {
    var rem = Math.max(d.total - d.paid, 0), pc = d.total > 0 ? Math.round(d.paid / d.total * 100) : 0, done = rem <= 0;
    return '<div class="item"><div class="top"><span class="nm">' + (done ? "✅ " : (i === 0 && !done ? "🎯 " : "")) + esc(d.name) +
      (i === 0 && !done ? '<span class="badge b-soon">önce bunu bitir</span>' : "") + "</span>" +
      '<span class="pr ' + (done ? "green" : "red") + '">' + (done ? "bitti" : "kalan " + fmtTL(rem)) + "</span></div>" +
      '<div class="meta">Toplam ' + fmtTL(d.total) + " · Ödenen " + fmtTL(d.paid) + " (%" + pc + ")</div>" +
      '<div class="bar"><i style="width:' + pc + '%"></i></div>' +
      '<div class="acts">' + (done ? "" : '<button class="a-ok" data-pay-debt="' + d.id + '">＋ Ödeme ekle</button>') +
      '<button class="a-plain" style="flex:0 0 auto" data-del-debt="' + d.id + '">sil</button></div></div>';
  }).join("") : '<div class="empty">Kart ve taksit dışı borçların (el borcu vb.) buraya.</div>';
}
function renderScore() {
  var f = PB_DATA.findeks, last = ST.scores.length ? ST.scores[ST.scores.length - 1] : null;
  $("scLast").textContent = last ? last.score + " (" + last.date.slice(5).split("-").reverse().join(".") + ")" : "—";
  var bandColors = { critical: "var(--critical)", serious: "var(--serious)", warning: "var(--warn)", good: "var(--good)" };
  var total = f.scale[1] - f.scale[0] + 1;
  var bar = '<div class="bandbar">' + f.bands.map(function (b) {
    return '<i style="width:' + ((b.max - b.min + 1) / total * 100) + "%;background:" +
      bandColors[b.color] + ';opacity:.75" title="' + b.label + " (" + b.min + "–" + b.max + ')"></i>';
  }).join("") + "</div>";
  var lbl = '<div class="bandlbl">' + f.bands.map(function (b) {
    return '<span style="width:' + ((b.max - b.min + 1) / total * 100) + '%">' + b.label + "</span>";
  }).join("") + "</div>";
  var ptr = "";
  if (last) {
    var pct = (last.score - f.scale[0]) / total * 100;
    var band = f.bands.filter(function (b) { return last.score >= b.min && last.score <= b.max; })[0];
    ptr = '<div class="bandptr"><i style="left:' + pct + '%">▲</i></div>' +
      '<p class="note">Notun <b>' + last.score + "</b> → <b>" + band.label + "</b> bandında. " +
      (band.min >= 1500 ? "Bankalar için güvenilir profildesin; bunu koru." :
        "Rehberdeki adımlar zamanla yükseltir — en hızlı etki: zamanında tam ödeme.") + "</p>";
  }
  $("scBand").innerHTML = bar + lbl + ptr;
  if (ST.scores.length >= 2) {
    lineChart($("scChart"), [{ name: "Findeks", color: "var(--s3)", values: ST.scores.map(function (s) { return s.score; }) }],
      ST.scores.map(function (s) { return s.date.slice(5).split("-").reverse().join("."); }),
      { height: 150, yFmt: function (v) { return Math.round(v); } });
  } else {
    $("scChart").innerHTML = '<div class="empty">' + (ST.scores.length ? "İkinci kaydından sonra gelişim grafiğin çizilir." : "Notunu Findeks'ten öğrenip buraya işle; gelişimini grafikle izle.") + "</div>";
  }
}

/* liste aksiyonları (event delegation) */
document.addEventListener("click", function (ev) {
  var t = ev.target.closest ? ev.target.closest("button") : null;
  if (!t) return;
  var d = t.dataset;
  if (d.delInc) { ST.incomes = ST.incomes.filter(function (x) { return x.id !== d.delInc; }); persist(); renderAll(); }
  if (d.delExp) { ST.expenses = ST.expenses.filter(function (x) { return x.id !== d.delExp; }); persist(); renderAll(); }
  if (d.delBill) { ST.bills = ST.bills.filter(function (x) { return x.id !== d.delBill; }); persist(); renderAll(); }
  if (d.payBill) {
    var b = ST.bills.find(function (x) { return x.id === d.payBill; });
    if (b) {
      ST.expenses.push({ id: uid("e"), name: b.name, amount: b.amt, date: todayStr(), cat: "Fatura" });
      if (b.repeat) b.paidMonth = monthPrefix();
      else ST.bills = ST.bills.filter(function (x) { return x.id !== b.id; });
      persist(); renderAll();
    }
  }
  if (d.unpayBill) {
    var b2 = ST.bills.find(function (x) { return x.id === d.unpayBill; });
    if (b2) { b2.paidMonth = ""; persist(); renderAll(); }
  }
  if (d.payInst) {
    var ti = ST.installments.find(function (x) { return x.id === d.payInst; });
    if (ti && ti.left > 0) {
      ti.left--; ti.paidMonth = monthPrefix();
      ST.expenses.push({ id: uid("e"), name: ti.name + " taksiti", amount: ti.amt, date: todayStr(), cat: "Fatura" });
      persist(); renderAll();
    }
  }
  if (d.delInst) { ST.installments = ST.installments.filter(function (x) { return x.id !== d.delInst; }); persist(); renderAll(); }
  if (d.payDebt) {
    var db = ST.debts.find(function (x) { return x.id === d.payDebt; });
    if (db) {
      var v = num(prompt("Ne kadar ödedin? (₺)", ""));
      if (v > 0) { db.paid = Math.min(db.total, db.paid + v); persist(); renderAll(); }
    }
  }
  if (d.delDebt) { ST.debts = ST.debts.filter(function (x) { return x.id !== d.delDebt; }); persist(); renderAll(); }
  if (d.gSkip) { gateDecide(d.gSkip, "vazgectim"); }
  if (d.gBuy) { gateDecide(d.gBuy, "aldim"); }
  if (d.gUndo) { var gi = ST.gate.find(function (x) { return x.id === d.gUndo; }); if (gi) { gi.status = "bekliyor"; persist(); renderAll(); } }
  if (d.gDel) { ST.gate = ST.gate.filter(function (x) { return x.id !== d.gDel; }); persist(); renderAll(); }
  if (d.ai) { aiAsk(d.ai); showTab("learn"); }
});

/* ============================== PLAN · YATIRIM ============================== */
function bindPlan() {
  $("efNow").addEventListener("change", function () { ST.settings.efNow = num($("efNow").value); persist(); renderAll(); });
  document.querySelectorAll("#gSeg button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("#gSeg button").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on"); gateType = b.dataset.t;
    });
  });
  $("gPr").addEventListener("input", renderGateCost);
  $("gAdd").addEventListener("click", function () {
    var n = $("gNm").value.trim(), p = num($("gPr").value);
    if (!n || p <= 0) { alert("Ürün adı ve fiyat gir."); return; }
    var now = Date.now();
    ST.gate.push({ id: uid("g"), name: n, price: p, type: gateType, status: "bekliyor",
      created: now, decide: now + PB_DATA.defaults.cooldownDays * DAY });
    persist(); $("gNm").value = ""; $("gPr").value = ""; $("gCost").hidden = true; renderAll();
  });
  $("cdDays").textContent = PB_DATA.defaults.cooldownDays;
}
function costLine(p) {
  var parts = [], hw = hourlyWage(), s = MK.spot || {};
  if (hw > 0) parts.push("≈ <b>" + Math.round(p / hw) + " saat</b> çalışmana denk");
  if (s.usdtry) parts.push("<b>" + fmtUSD(p / s.usdtry) + "</b>");
  if (s.gramGold) parts.push("<b>" + fmt2(p / s.gramGold) + " gr altın</b>");
  var inc = incomeTotal();
  if (inc > 0) parts.push("aylık gelirine oranı <b>%" + Math.round(p / inc * 100) + "</b>");
  return parts.join(" · ");
}
function renderGateCost() {
  var p = num($("gPr").value), c = $("gCost");
  if (p > 0) { c.innerHTML = "💡 " + (costLine(p) || fmtTL(p)); c.hidden = false; }
  else c.hidden = true;
}
function gateDecide(id, status) {
  var it = ST.gate.find(function (x) { return x.id === id; });
  if (!it) return;
  if (status === "aldim" && Date.now() < it.decide) {
    if (!confirm("Bekleme süresi dolmadı. Yine de almak istediğine emin misin?\n\nUnutma: karar senin planına göre, satıcının aciliyetine göre değil.")) return;
  }
  it.status = status; it.decided = Date.now(); persist(); renderAll();
}
function remainStr(t) {
  var ms = t - Date.now();
  if (ms <= 0) return "Süre doldu 🟢 hâlâ istiyor musun?";
  var g = Math.floor(ms / DAY), s = Math.floor((ms % DAY) / 3600000), dk = Math.floor((ms % 3600000) / 60000);
  return (g > 0 ? g + "g " : "") + s + "s " + dk + "dk kaldı";
}
function renderPlan() {
  setVal("efNow", ST.settings.efNow || "");
  var inc = incomeTotal(), oblig = billsMonthly() + instMonthly(), life = ST.settings.lifeBudget || 0;
  var investable = inc - oblig - life;
  var steps = [
    ["1", "Gelir", "Aylık toplam gelirin", inc, inc > 0 ? "green" : ""],
    ["2", "Zorunlular", "Faturalar + taksitler — pazarlıksız, önce bunlar", oblig, ""],
    ["3", "Yaşam", "Aylık yaşam bütçen (Panel'de belirlenir)", life, ""],
    ["4", "Yatırılabilir", "Önce acil fon, doluysa yatırım", investable, investable > 0 ? "gold" : "red"]
  ];
  $("planSteps").innerHTML = steps.map(function (s) {
    return '<div class="pstep"><span class="no">' + s[0] + '</span><span class="t">' + esc(s[1]) +
      "<small>" + esc(s[2]) + '</small></span><span class="v ' + s[4] + '">' + (inc || oblig || life ? fmtTL(s[3]) : "—") + "</span></div>";
  }).join("") + (investable < 0 && inc > 0
    ? '<p class="note">⚠️ Plan ekside: yükümlülük + yaşam, gelirini aşıyor. Ya yaşam bütçesi küçülecek ya gelir artacak — grafik bunu erken gösterdi, kriz göstermeden.</p>'
    : "");

  var efMin = (oblig + life) * PB_DATA.defaults.emergencyMonthsMin;
  var efIdeal = (oblig + life) * PB_DATA.defaults.emergencyMonthsIdeal;
  var efNow = ST.settings.efNow || 0;
  if (efMin > 0) {
    $("efTarget").textContent = fmtTL(efMin) + " – " + fmtTL(efIdeal);
    var pc = Math.min(efNow / efMin * 100, 100);
    $("efBar").style.width = pc + "%";
    $("efBar").className = "";
    $("efMsg").innerHTML = efNow >= efIdeal ? "🎉 Fon ideal seviyede. Artık artan her kuruş gönül rahatlığıyla yatırıma gidebilir."
      : efNow >= efMin ? "👍 Asgari fon tamam — ideal hedefe doluluk: <b>%" + Math.round(efNow / efIdeal * 100) + "</b>. Bir yandan da yatırıma başlayabilirsin."
      : "Önce bu yastık — asgari hedefe doluluk: <b>%" + Math.round(pc) + "</b>. Yatırımdan önce burası dolmalı.";
  } else {
    $("efTarget").textContent = "—";
    $("efMsg").textContent = "Zorunlular ve yaşam bütçen girilince hedef otomatik hesaplanır.";
  }

  // süzgeç listeleri
  var w = ST.gate.filter(function (i) { return i.status === "bekliyor"; }).sort(function (a, b) { return a.decide - b.decide; });
  var sk = ST.gate.filter(function (i) { return i.status === "vazgectim"; });
  var bo = ST.gate.filter(function (i) { return i.status === "aldim"; });
  $("gateWait").innerHTML = w.length ? w.map(function (i) {
    return '<div class="item"><div class="top"><span class="nm">' + esc(i.name) +
      '<span class="tag ' + i.type + '">' + (i.type === "istek" ? "istek" : "ihtiyaç") + "</span></span>" +
      '<span class="pr">' + fmtTL(i.price) + "</span></div>" +
      '<div class="meta">💡 ' + (costLine(i.price) || "") + "</div>" +
      '<div class="meta">⏳ <span class="cd" data-d="' + i.decide + '">' + remainStr(i.decide) + "</span></div>" +
      '<div class="acts"><button class="a-ok" data-g-skip="' + i.id + '">✅ Vazgeçtim</button>' +
      '<button class="a-no" data-g-buy="' + i.id + '">🛒 Aldım</button></div></div>';
  }).join("") : '<div class="empty">Almak istediğin şeyi önce buraya yaz; çoğu heves ' + PB_DATA.defaults.cooldownDays + " günde söner.</div>";
  var skTot = sk.reduce(function (a, b) { return a + b.price; }, 0);
  $("gateSkip").innerHTML = sk.length ? sk.slice().reverse().map(function (i) {
    return '<div class="item"><div class="top"><span class="nm">' + esc(i.name) + '</span><span class="pr green">+' + fmtTL(i.price) + "</span></div>" +
      '<div class="meta"><button class="mini" data-g-undo="' + i.id + '">geri al</button> · <button class="mini" data-g-del="' + i.id + '">sil</button></div></div>';
  }).join("") + '<p class="note">Toplam cebinde kalan: <b class="green">' + fmtTL(skTot) + "</b>" +
    (MK.spot && MK.spot.usdtry ? " (≈ " + fmtUSD(skTot / MK.spot.usdtry) + ")" : "") + " 🌱</p>"
    : '<div class="empty">İlk "vazgeçtim"de burada para birikmeye başlar.</div>';
  $("gateBuy").innerHTML = bo.length ? bo.slice().reverse().map(function (i) {
    return '<div class="item"><div class="top"><span class="nm">' + esc(i.name) + '</span><span class="pr">' + fmtTL(i.price) + "</span></div>" +
      '<div class="meta"><button class="mini" data-g-undo="' + i.id + '">geri al</button> · <button class="mini" data-g-del="' + i.id + '">sil</button></div></div>';
  }).join("") : '<div class="empty">Henüz yok.</div>';

  renderHold();
}
function renderHold() {
  var box = $("holdOut"), s = MK.spot;
  var li = latestInflation();
  var AMT = 100000;
  var rows = [];
  // TL: alım gücü (iki ölçümle)
  rows.push({
    t: "🏦 TL olarak dursaydı",
    v: fmtTL(AMT),
    m: "Nominal aynı kaldı ama alım gücü düştü: TÜİK'e göre bugünkü karşılığı ≈ <b class='red'>" +
      fmtTL(AMT / (1 + li.tuik / 100)) + "</b>, ENAG'a göre ≈ <b class='red'>" + fmtTL(AMT / (1 + li.enag / 100)) +
      "</b> alım gücünde. (Yıllık enflasyon: %" + fmt2(li.tuik) + " / %" + fmt2(li.enag) + ")"
  });
  if (MK.yearAgoRate && s && s.usdtry) {
    var usdAmt = AMT / MK.yearAgoRate, nowTl = usdAmt * s.usdtry;
    var chg = (s.usdtry / MK.yearAgoRate - 1) * 100;
    rows.push({
      t: "💵 Dolara çevrilseydi",
      v: fmtTL(nowTl),
      m: "Bir yıl önce " + fmtUSD(usdAmt) + " ederdi (kur " + fmt2(MK.yearAgoRate) + "); bugünkü TL karşılığı " +
        fmtTL(nowTl) + " (kur " + fmt2(s.usdtry) + ", <b>+%" + fmt2(chg) + "</b>). Doların da kendi enflasyonu olduğunu unutma."
    });
  } else {
    rows.push({ t: "💵 Dolara çevrilseydi", v: "—", m: "⚠️ 12 ay önceki kur verisi alınamadı — hesap gösterilmiyor (tahmin göstermeyiz)." });
  }
  rows.push({
    t: "🥇 Altına çevrilseydi",
    v: "—",
    m: "Gram altının 12 ay önceki fiyat serisi şu an elimizde yok; <b>uydurma rakam göstermeyiz</b>. Worker kurulumu yapılınca bu satır gerçek veriyle dolacak (worker/ klasörüne bak)."
  });
  box.innerHTML = rows.map(function (r) {
    return '<div class="item"><div class="top"><span class="nm">' + r.t + '</span><span class="pr">' + r.v + "</span></div>" +
      '<div class="meta">' + r.m + "</div></div>";
  }).join("");
}

/* ============================== PARA 101 ============================== */
function renderLearn() {
  var li = latestInflation();
  $("l101inf").innerHTML = "Şu an Türkiye'de yıllık enflasyon resmi ölçümle <b>%" + fmt2(li.tuik) +
    "</b>, bağımsız ölçümle <b>%" + fmt2(li.enag) + "</b> (" + li.month + " verisi). Yani geçen yılki 100 ₺'lik sepet bugün " +
    fmtTL(100 * (1 + li.tuik / 100)) + "–" + fmtTL(100 * (1 + li.enag / 100)) + " arası.";
  var c = PB_DATA.creditCard, mid = c.tiers[1];
  var rEff = mid.akdi * 1.3;
  $("l101kk").innerHTML = "TCMB'nin güncel azami akdi faizi (" + mid.label + " kademesi) aylık <b>%" + fmt2(mid.akdi) +
    "</b>; KKDF+BSMV ile fiilen ≈ <b>%" + fmt2(rEff) + "</b> işler. Yani asgariyi ödeyip kalanı devretmek, yıllık bileşikte ~<b>%" +
    Math.round((Math.pow(1 + rEff / 100, 12) - 1) * 100) + "</b> maliyete katlanmaktır. Kart, borçlanma aracı değil <b>ödeme aracı</b> olarak kullanıldığında bedavadır: dönem borcunu tam öde. Kendi rakamlarınla hesap: Fatura·Borç sekmesindeki analiz aracı.";
}

/* ============================== AI DANIŞMAN ============================== */
var SITEKEY = "0x4AAAAAADsB1yi04fQ4PyVU";
var _ses = null; try { _ses = JSON.parse(localStorage.getItem("cf_ses") || "null"); } catch (e) {}
var _tsWid = null, _tsTok = "", _tsW = null;
function _tsShow(b) { var e = $("ts-box"); if (e) e.style.display = b ? "block" : "none"; }
window.cfTsOnload = function () {
  try {
    _tsWid = turnstile.render("#ts-box", {
      sitekey: SITEKEY, size: "compact",
      callback: function (t) { _tsTok = t; if (_tsW) { _tsW(t); _tsW = null; } if (_sesOk()) _tsShow(false); },
      "error-callback": function () { if (_tsW) { _tsW(""); _tsW = null; } }
    });
    if (_sesOk()) _tsShow(false);
  } catch (e) {}
};
function _tsToken() {
  return new Promise(function (res) {
    if (typeof turnstile === "undefined" || _tsWid === null) { res(""); return; }
    if (_tsTok) { var t = _tsTok; _tsTok = ""; res(t); return; }
    _tsShow(true); _tsW = res;
    try { turnstile.reset(_tsWid); } catch (e) {}
  });
}
function _sesOk() { return _ses && _ses.token && _ses.exp && Date.now() < _ses.exp - 60000; }
async function ensureSession() {
  if (_sesOk()) return _ses.token;
  var tt = await _tsToken();
  if (!tt) throw new Error("Bot doğrulaması yüklenemedi — sol alttaki kutuyu işaretleyip tekrar dene.");
  var r = await fetch(PBM.PROXY, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "auth", turnstileToken: tt }) });
  var d = await r.json();
  if (!d.sessionToken) throw new Error((d.error || "oturum alınamadı") + (d.codes && d.codes.length ? " [" + d.codes.join(", ") + "]" : ""));
  _ses = { token: d.sessionToken, exp: d.exp };
  try { localStorage.setItem("cf_ses", JSON.stringify(_ses)); } catch (e) {}
  _tsShow(false);
  return _ses.token;
}
var aiHistory = [];
function aiContext() {
  var s = MK.spot || {}, li = latestInflation();
  var me = monthExpenses(), cm = {};
  me.forEach(function (e) { cm[e.cat] = (cm[e.cat] || 0) + e.amount; });
  var cats = Object.keys(cm).sort(function (a, b) { return cm[b] - cm[a]; })
    .map(function (k) { return k + " " + Math.round(cm[k]) + "₺"; }).join(", ");
  var billsOpen = ST.bills.filter(function (b) { return billStatus(b).cls !== "b-paid"; });
  var last = ST.scores.length ? ST.scores[ST.scores.length - 1].score : null;
  var g = ST.settings.goal;
  return "Hedef para: " + (g && g.amount ? (g.name || "hedef") + " " + g.amount + "₺" + (g.date ? " (" + g.date + " hedefli)" : "") : "belirlenmemiş") +
    ". Aylık gelir: " + (incomeTotal() || "girilmemiş") + "₺. Baktığı kişi sayısı: " + (ST.settings.hhSize || 1) +
    ". Varlıklar: " + Math.round(assetsTL()) + "₺ (TL " + ST.assets.tl + ", USD " + ST.assets.usd + ", EUR " + ST.assets.eur +
    ", altın " + ST.assets.au + " gr). Aylık yaşam bütçesi: " + (ST.settings.lifeBudget || "girilmemiş") +
    "₺. Bu ay harcanan: " + Math.round(monthSpent()) + "₺. Kategoriler: " + (cats || "yok") +
    ". Aylık fatura yükü: " + Math.round(billsMonthly()) + "₺ (bekleyen " + billsOpen.length +
    " fatura). Aylık taksit: " + Math.round(instMonthly()) + "₺, taksit kalan toplam: " + Math.round(instRemainTotal()) +
    "₺. Kredi kartı dönem borcu: " + (ST.kk.debt || 0) + "₺. Diğer borçlar: " + Math.round(debtsRemain()) +
    "₺. Acil fon: " + (ST.settings.efNow || 0) + "₺. Findeks notu: " + (last || "girilmemiş") +
    ". Güncel piyasa: USD/TRY " + (s.usdtry ? fmt2(s.usdtry) : "?") + ", gram altın " + (s.gramGold ? Math.round(s.gramGold) : "?") +
    "₺. Yıllık enflasyon: TÜİK %" + li.tuik + ", ENAG %" + li.enag + " (" + li.month + ").";
}
function aiBub(role, text) {
  var c = $("aiChat"), d = document.createElement("div");
  d.className = "bub " + (role === "user" ? "user" : "ai");
  d.textContent = text;
  c.appendChild(d);
  d.scrollIntoView({ block: "nearest" });
  return d;
}
async function aiAsk(q) {
  var btn = $("aiSendBtn"); if (btn) btn.disabled = true;
  aiBub("user", q); aiHistory.push({ role: "user", content: q });
  var typing = aiBub("ai", "💭 …");
  try {
    var sys = "Sen sıcak, gerçekçi ve yargılamayan bir kişisel finans mentorusun. Türkçe, somut ve uygulanabilir konuş; gerektiğinde madde madde, kısa tut. Öncelik sırası ilkesi: 1 faturalar/zorunlular, 2 yaşam, 3 acil fon, 4 yatırım. Asla garanti getiri vaat etme; 'şunu al' diye ürün önerme; sağlıklı alışkanlık öğret. KULLANICININ GÜNCEL VERİSİ: " + aiContext();
    var st = await ensureSession();
    var msgs = [{ role: "system", content: sys }].concat(aiHistory.slice(-10));
    async function go(t) {
      return fetch(PBM.PROXY, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs, temperature: 0.7, sessionToken: t }) });
    }
    var r = await go(st);
    if (r.status === 401) { _ses = null; localStorage.removeItem("cf_ses"); st = await ensureSession(); r = await go(st); }
    var d = await r.json();
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    var reply = (d.choices && d.choices[0] && d.choices[0].message.content || "").trim();
    typing.remove(); aiBub("ai", reply || "Yanıt alınamadı.");
    aiHistory.push({ role: "assistant", content: reply });
  } catch (e) { typing.remove(); aiBub("ai", "⚠️ Hata: " + e.message); }
  if (btn) btn.disabled = false;
}
function bindAI() {
  $("aiSendBtn").addEventListener("click", function () {
    var q = $("aiInput").value.trim(); if (!q) return; $("aiInput").value = ""; aiAsk(q);
  });
  $("aiInput").addEventListener("keydown", function (e) { if (e.key === "Enter") $("aiSendBtn").click(); });
}

/* ============================== CANLI VERİ BAŞLATMA ============================== */
async function initMarket(force) {
  if (force) { try { localStorage.removeItem("pb2_cache_spot"); } catch (e) {} }
  try { MK.spot = await PBM.getSpot(); } catch (e) { MK.spot = null; }
  renderTicker(); renderMarket(); renderPanel(); renderPlan();

  try { MK.hist = await PBM.getUsdTryHistory(92); } catch (e) { MK.hist = null; }
  if (!MK.hist) MK.histFailed = true;
  renderFxChart(); renderTicker(); renderPanel();

  var ya = new Date(); ya.setFullYear(ya.getFullYear() - 1);
  // hafta sonuna denk gelirse diye 12 ay öncesinin ilk iş gününü iste
  try { MK.yearAgoRate = await PBM.getUsdTryAt(ya.toISOString().slice(0, 10)); } catch (e) { MK.yearAgoRate = null; }
  renderPlan();
}

/* ============================== GENEL RENDER + BAŞLAT ============================== */
function renderAll() {
  renderPanel(); renderFlow(); renderBills(); renderKK(); renderInst();
  renderDebts(); renderScore(); renderPlan(); renderMarket(); renderGateCost();
}
bindPanel(); bindFlow(); bindDebt(); bindPlan(); bindMeal(); bindAI();
renderLearn(); renderAll();
initMarket(false);
setInterval(function () {
  document.querySelectorAll(".cd").forEach(function (el) { el.textContent = remainStr(+el.dataset.d); });
}, 30000);
