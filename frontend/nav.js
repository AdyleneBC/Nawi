// ---------- NAVBAR (menú desplegable) ----------
const menuBtn = document.getElementById('menuBtn');
const menuList = document.getElementById('menuList');

if (menuBtn && menuList) {
  menuBtn.addEventListener('click', () => {
    const isOpen = !menuList.hasAttribute('hidden');
    if (isOpen) {
      menuList.setAttribute('hidden', '');
      menuBtn.setAttribute('aria-expanded', 'false');
    } else {
      menuList.removeAttribute('hidden');
      menuBtn.setAttribute('aria-expanded', 'true');
    }
  });

  document.addEventListener('click', (e) => {
    if (!menuList.contains(e.target) && e.target !== menuBtn) {
      if (!menuList.hasAttribute('hidden')) {
        menuList.setAttribute('hidden', '');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menuList.hasAttribute('hidden')) {
      menuList.setAttribute('hidden', '');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.focus();
    }
  });
}


// Se empieza a gregar todo el funcionamiento del traductor en otro JS