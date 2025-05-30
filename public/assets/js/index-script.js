document.addEventListener('DOMContentLoaded', () => {
  // Rolagem suave para links âncora
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const targetId = anchor.getAttribute('href').substring(1);
      if (targetId === 'contact-modal') {
        // Abrir modal
        const modal = document.getElementById('contact-modal');
        if (modal) {
          modal.classList.add('active');
          modal.setAttribute('aria-hidden', 'false');
          modal.querySelector('.modal-close').focus();
        }
      } else {
        // Rolagem suave
        const target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

  // FAQ com animação suave
  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', () => {
      const answer = question.nextElementSibling;
      const isActive = answer.classList.contains('active');

      // Fechar todas as respostas abertas
      document.querySelectorAll('.faq-answer.active').forEach(activeAnswer => {
        activeAnswer.classList.remove('active');
        activeAnswer.style.maxHeight = '0';
        activeAnswer.previousElementSibling.setAttribute('aria-expanded', 'false');
      });

      // Abrir/fechar a resposta clicada
      if (!isActive) {
        answer.classList.add('active');
        answer.style.maxHeight = `${answer.scrollHeight + 30}px`; // Adicionado padding extra
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Modal de contato
  const modal = document.getElementById('contact-modal');
  const closeModalButton = document.querySelector('.modal-close');

  if (closeModalButton) {
    closeModalButton.addEventListener('click', () => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      document.querySelector('a[href="#contact-modal"]').focus();
    });
  }

  // Fechar modal ao clicar fora
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.querySelector('a[href="#contact-modal"]').focus();
      }
    });
  }

  // Fechar modal com tecla Esc
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      document.querySelector('a[href="#contact-modal"]').focus();
    }
  });
});