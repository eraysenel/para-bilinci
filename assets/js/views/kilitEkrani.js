/* Kilit ekranı — uygulama açılmadan önce gösterilen şifre paneli. */

import * as Kilit from '../core/kilit.js';
import { kac } from '../core/fmt.js';

/**
 * Kilit ekranını çizer ve şifre doğru girilene kadar bekler.
 * @returns {Promise<object>} çözülmüş durum nesnesi
 */
export function kilitEkraniGoster() {
  return new Promise(resolve => {
    const kullanici = Kilit.kilitliKullanici();

    const kok = document.createElement('div');
    kok.className = 'kilit-ekran';
    kok.innerHTML = `
      <form class="kilit-kutu" autocomplete="on">
        <div class="marka-im">₺</div>
        <h2>Para <span style="color:var(--gold)">Bilinci</span></h2>
        <p class="alt">
          ${kullanici
            ? `Tekrar hoş geldin, <span class="selam">${kac(kullanici)}</span>.<br>Verilerin şifreli; açmak için şifreni gir.`
            : 'Verilerin şifreli. Devam etmek için şifreni gir.'}
        </p>

        <div id="kilitHata"></div>

        ${kullanici ? `<input type="text" name="username" autocomplete="username"
          value="${kac(kullanici)}" readonly
          style="position:absolute;opacity:0;pointer-events:none;height:0;padding:0;border:0" tabindex="-1">` : ''}

        <label class="alan" style="margin-bottom:10px">
          <span class="et">Şifre</span>
          <input type="password" id="kilitSifre" autocomplete="current-password" placeholder="••••••••" autofocus>
        </label>

        <label class="esnek kucuk" style="cursor:pointer;margin-bottom:16px">
          <input type="checkbox" id="kilitOturum" checked style="width:auto">
          <span class="r-muted">Bu sekmede açık kal</span>
        </label>

        <button type="submit" class="dg-btn b-ana b-tam" id="kilitAcBtn">Aç</button>

        <div class="kilit-dip">
          Şifre yalnızca bu cihazda çalışır — hesap değildir, sıfırlanamaz.<br>
          Unuttuysan tek yol yedek dosyandan geri yüklemektir.
          <button type="button" id="kilitSifirla">Şifremi unuttum</button>
        </div>
      </form>`;

    document.body.appendChild(kok);
    document.body.style.overflow = 'hidden';

    const form = kok.querySelector('form');
    const alanSifre = kok.querySelector('#kilitSifre');
    const btn = kok.querySelector('#kilitAcBtn');
    const hataKap = kok.querySelector('#kilitHata');
    let deneme = 0;

    const hata = metin => {
      hataKap.innerHTML = `<div class="kilit-hata">${metin}</div>`;
      alanSifre.value = '';
      alanSifre.focus();
    };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const sifre = alanSifre.value;
      if (!sifre) return;

      btn.disabled = true;
      btn.textContent = 'Açılıyor…';
      hataKap.innerHTML = '';

      try {
        const veri = await Kilit.kilitAc(sifre, {
          oturumdaKal: kok.querySelector('#kilitOturum').checked
        });
        kok.remove();
        document.body.style.overflow = '';
        resolve(veri);
      } catch (err) {
        deneme++;
        btn.disabled = false;
        btn.textContent = 'Aç';
        hata(deneme >= 3
          ? `${kac(err.message)} <br><span class="r-muted">Şifreni hatırlamıyorsan aşağıdaki bağlantıdan sıfırdan başlayabilirsin — ama mevcut veriler kurtarılamaz.</span>`
          : kac(err.message));
      }
    });

    kok.querySelector('#kilitSifirla').addEventListener('click', () => {
      hataKap.innerHTML = `<div class="kilit-hata" style="background:var(--surface-2);border-color:var(--line);color:var(--ink-2)">
        <b>Şifre sıfırlanamaz.</b> Veriler bu cihazda, senin şifrenle şifrelendi; bizde bir kopyası yok
        ve kurtarma anahtarı yok. İki seçeneğin var:<br><br>
        <b>1.</b> Yedek dosyan varsa — sıfırdan başla, sonra Ayarlar'dan yedeği geri yükle.<br>
        <b>2.</b> Yedek yoksa — sıfırdan başlamak mevcut verileri kalıcı olarak siler.<br><br>
        <button type="button" class="dg-btn b-tehli b-kucuk" id="kilitSifirlaOnay">Sıfırdan başla ve verileri sil</button>
      </div>`;
      const onay = kok.querySelector('#kilitSifirlaOnay');
      onay.addEventListener('click', () => {
        if (!confirm('Bu cihazdaki tüm Para Bilinci verileri kalıcı olarak silinecek. Emin misin?')) return;
        Kilit.kayitSil();
        try { localStorage.removeItem('pb2_durum'); } catch { }
        location.reload();
      });
    });
  });
}
