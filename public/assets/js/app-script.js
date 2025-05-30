(function InvixDashboard() {
  document.addEventListener('DOMContentLoaded', () => {
    let state = {};
    const socket = io();

    // Inicializa o SDK do Mercado Pago
    const mp = new MercadoPago('APP_USR-4ac1039b-cbd4-49a6-ba57-08a988a9e399', { locale: 'pt-BR' });

    // Função para criar um token de cartão
    async function createCardToken(cardNumber, expirationMonth, expirationYear, securityCode, cardholderName) {
      try {
        const token = await mp.createCardToken({
          cardNumber,
          expirationMonth,
          expirationYear,
          securityCode,
          cardholderName,
        });
        return token.id;
      } catch (error) {
        console.error('Erro ao criar token:', error);
        throw error;
      }
    }

    // Função para iniciar a assinatura
    async function subscribe() {
      try {
        // Dados do cartão de teste (substitua por inputs de formulário em produção)
        const cardToken = await createCardToken(
          '4235647728020568', // Cartão de teste Visa
          '06',              // Mês de expiração
          '2027',            // Ano de expiração
          '123',             // CVV
          'APO TESTE'        // Nome do titular
        );

        // Envia a solicitação de assinatura ao servidor
        const response = await fetch('https://invix-backend.onrender.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payerEmail: 'test_user_123@testuser.com', // E-mail de teste
            cardToken,
          }),
        });

        const data = await response.json();
        if (data.success) {
          showNotification('Assinatura criada com sucesso! 🚀', 'success');
          loadData(); // Atualiza os dados do dashboard
        } else {
          showNotification('Erro ao criar assinatura: ' + data.error, 'error');
        }
      } catch (error) {
        showNotification('Erro ao assinar: ' + error.message, 'error');
        console.error('Erro ao assinar:', error);
      }
    }

    // Partículas
    function initParticles() {
      const canvas = document.getElementById('particles-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const particles = Array.from({ length: 100 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2 + 1,
        color: Math.random() > 0.5 ? 'rgba(0, 120, 212, 0.5)' : 'rgba(92, 45, 145, 0.5)',
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5
      }));
      function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
          if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        });
        requestAnimationFrame(animate);
      }
      animate();
      window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      });
    }

    // Notificação
    function showNotification(message, type = 'success') {
      const notification = document.getElementById('notification');
      notification.textContent = message;
      notification.className = `invix-notification ${type} show`;
      setTimeout(() => notification.classList.remove('show'), 3000);
    }

    // Formatar
    function formatCurrency(value) {
      return `R$${Number(value || 0).toFixed(2).replace('.', ',')}`;
    }
    function formatDate(isoDate) {
      return isoDate ? new Date(isoDate).toLocaleDateString('pt-BR') : 'Nenhuma';
    }

    // Carregar dados
    async function loadData() {
      try {
        const response = await fetch('/api/data', {
          headers: { Authorization: `Bearer ${localStorage.getItem('jwt')}` }
        });
        if (!response.ok) throw new Error('Erro ao carregar dados');
        const data = await response.json();
        state = {
          userName: data.user.name,
          userType: data.user.type,
          physical: {
            transactions: data.transactions.filter(t => ['revenue', 'expense', 'investment', 'debt'].includes(t.type)),
            revenues: data.transactions.filter(t => t.type === 'revenue'),
            expenses: data.transactions.filter(t => t.type === 'expense'),
            investments: data.transactions.filter(t => t.type === 'investment'),
            debts: data.transactions.filter(t => t.type === 'debt'),
            goals: data.goals,
            budgets: data.budgets,
            reminders: data.reminders
          },
          mei: {
            transactions: data.transactions.filter(t => ['revenue', 'expense', 'investment', 'debt'].includes(t.type)),
            clients: data.clients
          },
          subscriptions: data.subscriptions,
          achievements: data.achievements
        };
        document.getElementById('login-modal').style.display = 'none';
        updateOverview();
        updateReports();
        updateGoals();
        updateClients();
        updateAchievements();
        document.querySelectorAll('.mei-only').forEach(el => {
          el.style.display = state.userType === 'mei' ? 'block' : 'none';
        });
      } catch (error) {
        showNotification('Erro ao carregar dados. 😔', 'error');
      }
    }

    // Visão Geral
    function updateOverview() {
      const data = state[state.userType] || {};
      data.balance = (data.revenues || []).reduce((sum, r) => sum + r.value, 0) -
                     (data.expenses || []).reduce((sum, e) => sum + e.value, 0) -
                     (data.investments || []).reduce((sum, i) => sum + i.value, 0) +
                     (data.debts || []).reduce((sum, d) => sum + d.value, 0);
      document.getElementById('balance').textContent = `${formatCurrency(data.balance)} 💸`;
      document.getElementById('revenues').textContent = `${formatCurrency((data.revenues || []).reduce((sum, r) => sum + r.value, 0))} 💵`;
      document.getElementById('expenses').textContent = `${formatCurrency((data.expenses || []).reduce((sum, e) => sum + e.value, 0))} 🧾`;
      document.getElementById('investments').textContent = `${formatCurrency((data.investments || []).reduce((sum, i) => sum + i.value, 0))} 💹`;
      document.getElementById('debts').textContent = `${formatCurrency((data.debts || []).reduce((sum, d) => sum + d.value, 0))} 💳`;
      document.getElementById('user-name').textContent = `Olá, 😎 ${state.userName || 'Usuário'}`;
      document.getElementById('subscription-end').textContent = state.subscriptions?.length ? formatDate(state.subscriptions[0].end_date) : 'Nenhuma';

      const ctx = document.getElementById('expense-chart')?.getContext('2d');
      if (ctx) {
        const categories = {};
        (data.expenses || []).forEach(t => {
          const key = `${t.category}${t.subcategory ? ` (${t.subcategory})` : ''}`;
          categories[key] = (categories[key] || 0) + t.value;
        });
        new Chart(ctx, {
          type: 'pie',
          data: {
            labels: Object.keys(categories),
            datasets: [{
              data: Object.values(categories),
              backgroundColor: ['#0078D4', '#5C2D91', '#FF0000', '#FFCE56'],
              borderColor: '#FFFFFF'
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'top', labels: { color: '#333333' } },
              tooltip: {
                callbacks: {
                  label: (context) => `${context.label}: ${formatCurrency(context.raw)}`
                }
              }
            }
          }
        });
      }
    }

    // Relatórios
    function updateReports() {
      const period = document.getElementById('report-filter').value;
      const dataType = document.getElementById('data-type-filter-report').value;
      const transactions = (state[dataType]?.transactions || []).filter(t => {
        const date = new Date(t.date);
        const now = new Date();
        if (period === 'day') return date.toDateString() === now.toDateString();
        if (period === 'month') return date.getMonth() === now.getMonth();
        if (period === 'year') return date.getFullYear() === now.getFullYear();
        return true;
      });
      const totalRevenue = transactions.reduce((sum, t) => sum + (t.type === 'revenue' ? t.value : 0), 0);
      const totalExpense = transactions.reduce((sum, t) => sum + (t.type === 'expense' ? t.value : 0), 0);
      const totalInvestment = transactions.reduce((sum, t) => sum + (t.type === 'investment' ? t.value : 0), 0);
      const totalDebt = transactions.reduce((sum, t) => sum + (t.type === 'debt' ? t.value : 0), 0);
      document.getElementById('report-content').innerHTML = `
        <h3>Resumo ${period === 'day' ? 'Diário' : period === 'month' ? 'Mensal' : period === 'year' ? 'Anual' : 'Total'}</h3>
        <p>Receitas: ${formatCurrency(totalRevenue)}</p>
        <p>Despesas: ${formatCurrency(totalExpense)}</p>
        <p>Investimentos: ${formatCurrency(totalInvestment)}</p>
        <p>Dívidas: ${formatCurrency(totalDebt)}</p>
        <p>Saldo: ${formatCurrency(totalRevenue - totalExpense - totalInvestment + totalDebt)}</p>
      `;
      const ctx = document.getElementById('revenue-expense-chart')?.getContext('2d');
      if (ctx) {
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['Receitas', 'Despesas', 'Investimentos', 'Dívidas'],
            datasets: [{
              label: 'Valores',
              data: [totalRevenue, totalExpense, totalInvestment, totalDebt],
              backgroundColor: ['#0078D4', '#FF0000', '#FFCE56', '#5C2D91']
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: { display: true, text: 'Resumo Financeiro', color: '#333333' }
            }
          }
        });
      }
    }

    // Exportar PDF
    function exportReportToPDF() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const reportContent = document.getElementById('report-content');
      doc.text(reportContent.innerText, 10, 10);
      doc.save('relatorio.pdf');
    }

    // Metas
    function updateGoals() {
      const data = state[state.userType] || {};
      document.getElementById('goals-list').innerHTML = (data.goals || []).length
        ? data.goals.map(g => `
            <li>
              ${g.description}: ${formatCurrency(g.value)} (Prazo: ${formatDate(g.deadline)})
              <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(((data.balance || 0) / g.value * 100), 100)}%"></div></div>
            </li>
          `).join('')
        : '<li>Nenhuma meta definida.</li>';
    }

    // Clientes
    function updateClients() {
      const data = state.mei || {};
      document.getElementById('clients-list').innerHTML = (data.clients || []).length
        ? data.clients.map(c => `<li>${c.name} - ${c.contact}</li>`).join('')
        : '<li>Nenhum cliente.</li>';
    }

    // Conquistas
    function updateAchievements() {
      const achievements = state.achievements || [];
      document.getElementById('achievements-list').innerHTML = achievements.length
        ? achievements.map(a => `<div class="achievement unlocked"><h3>${a.name}</h3><p>${a.description}</p></div>`).join('')
        : '<div class="achievement locked"><h3>Nenhuma</h3><p>Continue registrando!</p></div>';
    }

    // Navegação
    function setupNavigation() {
      document.querySelectorAll('.invix-sidebar li').forEach(item => {
        item.addEventListener('click', () => {
          const sectionId = item.dataset.section;
          document.querySelectorAll('.invix-section').forEach(section => {
            section.style.display = section.id === sectionId ? 'block' : 'none';
          });
          document.querySelectorAll('.invix-sidebar li').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
        });
      });
    }

    // Tema
    function setupThemeSelector() {
      document.getElementById('theme-select').addEventListener('change', (e) => {
        document.body.classList.remove('theme-blue', 'theme-purple');
        document.body.classList.add(`theme-${e.target.value}`);
      });
    }

    // Login
    function setupLogin() {
      document.getElementById('send-code').addEventListener('click', async () => {
        const phone = document.getElementById('phone-input').value;
        try {
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
          });
          if (response.ok) {
            document.getElementById('code-input').style.display = 'block';
            document.getElementById('validate-code').style.display = 'block';
            showNotification('Código enviado! 📱');
          } else {
            showNotification('Erro ao enviar código. 😔', 'error');
          }
        } catch {
          showNotification('Erro de conexão. 😔', 'error');
        }
      });
      document.getElementById('validate-code').addEventListener('click', async () => {
        const code = document.getElementById('code-input').value;
        const phone = document.getElementById('phone-input').value;
        try {
          const response = await fetch('/api/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, phone })
          });
          if (response.ok) {
            const { token } = await response.json();
            localStorage.setItem('jwt', token);
            loadData();
            showNotification('Logado com sucesso! 🚀');
          } else {
            showNotification('Código inválido. 😔', 'error');
          }
        } catch {
          showNotification('Erro de conexão. 😔', 'error');
        }
      });
    }

    // Listeners
    function setupListeners() {
      document.getElementById('report-filter').addEventListener('change', updateReports);
      document.getElementById('data-type-filter-report').addEventListener('change', updateReports);
      document.getElementById('export-pdf').addEventListener('click', exportReportToPDF);
      const subscribeButton = document.getElementById('subscribe-button');
      if (subscribeButton) {
        subscribeButton.addEventListener('click', subscribe);
      }
      socket.on('transaction', loadData);
      socket.on('subscription_update', loadData);
      socket.on('achievement', loadData);
    }

    initParticles();
    setupNavigation();
    setupThemeSelector();
    setupLogin();
    setupListeners();
    if (localStorage.getItem('jwt')) loadData();
  });
})();