// NAVIGATION GLOBALE
const navItems = document.querySelectorAll('nav .nav-item');

// Définir actif selon la page actuelle
navItems.forEach(item => {
  if (item.dataset.page === location.pathname.split('/').pop()) {
    item.classList.add('active');
  }

  // Redirection sur clic
  item.addEventListener('click', () => location.href = item.dataset.page);
});