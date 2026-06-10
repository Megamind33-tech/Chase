export function toast(msg, kind = '', ms = 3200) {
  const zone = document.getElementById('toast-zone');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  zone.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, ms - 300);
  setTimeout(() => el.remove(), ms);
}
