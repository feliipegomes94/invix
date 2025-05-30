/* server.js - Servidor do Invix (backend) */

const express = require('express');
const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const { Client } = require('whatsapp-web.js');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Validação de variáveis de ambiente
if (!process.env.MERCADO_PAGO_TOKEN || !process.env.JWT_SECRET || !process.env.MERCADO_PAGO_COLLECTOR_ID || !process.env.MERCADO_PAGO_APPLICATION_ID) {
  console.error('Erro: Variáveis de ambiente ausentes no .env. Verifique MERCADO_PAGO_TOKEN, JWT_SECRET, MERCADO_PAGO_COLLECTOR_ID e MERCADO_PAGO_APPLICATION_ID.');
  process.exit(1);
}

// Configura Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_TOKEN });
const preapproval = new PreApproval(client);

// Conecta ao banco SQLite com tratamento de erro
const db = new sqlite3.Database('./invix.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco:', err.message);
    console.log('Tentando criar o banco de dados...');
    db.run('VACUUM');
    db = new sqlite3.Database('./invix.db', (err) => {
      if (err) {
        console.error('Falha ao criar o banco:', err.message);
        process.exit(1);
      }
      console.log('Banco SQLite criado e conectado 🚀');
    });
  } else {
    console.log('Conectado ao banco SQLite 🚀');
  }
});

// Cria tabelas se não existirem
db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, value REAL, description TEXT, date TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, subscription_id TEXT, status TEXT, payer_email TEXT, end_date TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, target REAL, current REAL)');
  db.run('CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, phone TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, message TEXT, time TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE, name TEXT, level INTEGER DEFAULT 1)');
});

// Configura o bot do WhatsApp com tratamento de erros
const whatsappClient = new Client();
whatsappClient.on('qr', (qr) => {
  console.log('Escaneie o QR code:', qr);
  io.emit('qr', qr);
});
whatsappClient.on('ready', () => {
  console.log('Bot conectado! 🚀');
  io.emit('bot_ready');
});
whatsappClient.on('auth_failure', (msg) => {
  console.error('Falha na autenticação do WhatsApp:', msg);
  io.emit('bot_error', 'Falha na autenticação. Reinicie o servidor e escaneie o QR code.');
});
whatsappClient.on('disconnected', (reason) => {
  console.error('Bot desconectado:', reason);
  io.emit('bot_disconnected', reason);
});
whatsappClient.initialize().catch((err) => {
  console.error('Erro ao inicializar o WhatsApp:', err);
  io.emit('bot_error', 'Erro ao inicializar o bot. Verifique a conexão.');
});

// WebSocket para atualizações em tempo real
io.on('connection', (socket) => {
  console.log('Cliente conectado ao WebSocket');
  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

// Estado do bot (armazena contexto por usuário)
let botState = {};

// Funções gamificadas
const getLevelUpMessage = (name, newLevel) => {
  const messages = [
    `🎉 Parabéns, ${name}! Você subiu para o Nível ${newLevel}! 🏰 Continue sua aventura!`,
    `🌟 Incrível, ${name}! Você alcançou o Nível ${newLevel}! Prepare-se para novos desafios!`,
    `🪙 Vitória épica, ${name}! Agora você é Nível ${newLevel}!`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
};

const updateUserLevel = (phone, xp) => {
  db.get('SELECT level FROM users WHERE phone = ?', [phone], (err, row) => {
    if (err) return console.error('Erro ao buscar nível:', err);
    let level = row?.level || 1;
    const newLevel = Math.floor(xp / 100) + 1; // 100 XP por nível
    if (newLevel > level) {
      db.run('UPDATE users SET level = ? WHERE phone = ?', [newLevel, phone]);
      return getLevelUpMessage(row?.name || 'Aventureiro', newLevel);
    }
    return null;
  });
};

// Endpoint para login (simulado)
app.post('/api/login', (req, res) => {
  const { phone } = req.body;
  console.log(`Código enviado para ${phone}`);
  res.json({ success: true });
});

// Endpoint para validar código
app.post('/api/validate', (req, res) => {
  const { code, phone } = req.body;
  if (code === '123456') {
    const token = jwt.sign({ userId: 1, phone }, process.env.JWT_SECRET, { expiresIn: '1h' });
    db.run('INSERT OR IGNORE INTO users (phone, name) VALUES (?, ?)', [phone, 'Usuário Teste']);
    res.json({ token });
  } else {
    res.status(400).json({ error: 'Código inválido' });
  }
});

// Endpoint para dados do dashboard
app.get('/api/data', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    db.all('SELECT * FROM transactions WHERE user_id = ?', [decoded.userId], (err, transactions) => {
      if (err) return res.status(500).json({ error: 'Erro no servidor' });
      db.all('SELECT * FROM subscriptions WHERE user_id = ?', [decoded.userId], (err, subscriptions) => {
        if (err) return res.status(500).json({ error: 'Erro no servidor' });
        db.all('SELECT * FROM goals WHERE user_id = ?', [decoded.userId], (err, goals) => {
          if (err) return res.status(500).json({ error: 'Erro no servidor' });
          db.all('SELECT * FROM clients WHERE user_id = ?', [decoded.userId], (err, clients) => {
            if (err) return res.status(500).json({ error: 'Erro no servidor' });
            res.json({
              user: { name: 'Usuário Teste', type: 'physical', activated: true },
              transactions,
              subscriptions,
              goals,
              budgets: [],
              reminders: [],
              clients,
              achievements: [{ name: 'Primeiro Passo', description: 'Registre sua primeira transação!' }]
            });
          });
        });
      });
    });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Endpoint para criar assinatura
app.post('/api/create-subscription', async (req, res) => {
  try {
    const { payerEmail, cardToken } = req.body;
    const subscription = await preapproval.create({
      body: {
        back_url: 'https://invixassistentefinanceiro.netlify.app/app.html',
        reason: 'Invix Assinatura Mensal',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 9.90,
          currency_id: 'BRL',
          start_date: new Date().toISOString(),
          end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
        },
        payer_email: payerEmail,
        card_token_id: cardToken,
        status: 'authorized',
        collector_id: process.env.MERCADO_PAGO_COLLECTOR_ID,
        application_id: process.env.MERCADO_PAGO_APPLICATION_ID,
      }
    });

    db.run(
      'INSERT INTO subscriptions (user_id, subscription_id, status, payer_email, end_date) VALUES (?, ?, ?, ?, ?)',
      [1, subscription.id, 'active', payerEmail, new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()],
      (err) => {
        if (err) console.error('Erro ao salvar assinatura:', err);
        io.emit('subscription_update');
      }
    );

    res.json({ success: true, message: 'Assinatura criada com sucesso! 🚀 Redirecionando...' });
  } catch (error) {
    console.error('Erro ao criar assinatura:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar assinatura. Tente novamente.' });
  }
});

// Lógica do bot com boas-vindas e IA gamificada
whatsappClient.on('message', async (message) => {
  console.log('Mensagem recebida:', message.body, 'de:', message.from);
  const text = message.body.toLowerCase();
  const userId = 1;
  const phone = message.from.replace('@c.us', '');

  // Define o número do administrador
  const adminNumber = '+5521973198153'; // Substitua por seu número
  const isAdmin = message.from === `${adminNumber}@c.us`;
  console.log('Usuário:', message.from, 'é admin?', isAdmin);

  // Verifica se o usuário é novo
  if (!botState[phone]) {
    db.get('SELECT name FROM users WHERE phone = ?', [phone], (err, row) => {
      if (err) console.error('Erro ao buscar usuário:', err);
      const name = row?.name || 'Aventureiro';
      botState[phone] = { step: 'intro', name, xp: 0 };
      message.reply(
        `🎮 Bem-vindo ao Jogo da Liberdade Financeira, ${name}! 🪙\nVocê entrou no Nível 1 🏰. Aqui você pode:\n- Adicionar gastos com "gastei R$X em [descrição]" 💸\n- Registrar receitas com "recebi R$X" 💰\n- Ver seu resumo com "resumo" 📊\n- (ADM) "status" ou "limpar" 🔧\nDigite "ajuda" para mais! Comece sua aventura! 🎯`
      );
    });
    return;
  }

  const state = botState[phone];
  let xpGain = 10; // XP base por ação

  if (text.includes('gastei')) {
    console.log('Comando "gastei" detectado');
    const amountMatch = text.match(/r\$\d+(\.\d+)?/);
    if (amountMatch) {
      const amount = parseFloat(amountMatch[0].replace('r$', ''));
      const description = text.replace(/gastei r\$\d+(\.\d+)?/, '').trim() || 'Gasto';
      db.run(
        'INSERT INTO transactions (user_id, type, value, description, date) VALUES (?, ?, ?, ?, ?)',
        [userId, 'expense', amount, description, new Date().toISOString()],
        (err) => {
          if (err) {
            console.error('Erro ao salvar transação:', err);
            message.reply('❌ Erro ao registrar gasto, aventureiro! 🛡️ Tente novamente.');
          } else {
            state.xp += xpGain;
            const levelUp = updateUserLevel(phone, state.xp);
            const reply = levelUp
              ? `${levelUp}\n✅ Gasto de R$${amount.toFixed(2)} registrado, ${state.name}! 🎉 ${description ? `Descrição: ${description} 🏷️` : ''}`
              : `✅ Gasto de R$${amount.toFixed(2)} registrado, ${state.name}! 🎉 ${description ? `Descrição: ${description} 🏷️` : ''}\nGanhe mais XP com novas ações! 🪙`;
            message.reply(reply);
            io.emit('transaction');
          }
        }
      );
    } else {
      message.reply('❌ Oops! Use "gastei R$X em [descrição]", aventureiro! 🛡️ Digite "ajuda" se precisar.');
    }
  } else if (text.includes('recebi')) {
    console.log('Comando "recebi" detectado');
    const amountMatch = text.match(/r\$\d+(\.\d+)?/);
    if (amountMatch) {
      const amount = parseFloat(amountMatch[0].replace('r$', ''));
      db.run(
        'INSERT INTO transactions (user_id, type, value, description, date) VALUES (?, ?, ?, ?, ?)',
        [userId, 'revenue', amount, 'Receita', new Date().toISOString()],
        (err) => {
          if (err) {
            console.error('Erro ao salvar transação:', err);
            message.reply('❌ Erro ao registrar receita, aventureiro! 🛡️ Tente novamente.');
          } else {
            state.xp += xpGain;
            const levelUp = updateUserLevel(phone, state.xp);
            const reply = levelUp
              ? `${levelUp}\n💰 Receita de R$${amount.toFixed(2)} adicionada, ${state.name}! 🏆 Continue brilhando!`
              : `💰 Receita de R$${amount.toFixed(2)} adicionada, ${state.name}! 🏆 Ganhe mais XP! 🪙`;
            message.reply(reply);
            io.emit('transaction');
          }
        }
      );
    } else {
      message.reply('❌ Use "recebi R$X", aventureiro! 🛡️ Veja "ajuda" para mais.');
    }
  } else if (text.includes('resumo')) {
    console.log('Comando "resumo" detectado');
    db.all('SELECT * FROM transactions WHERE user_id = ?', [userId], (err, rows) => {
      if (err) {
        console.error('Erro ao buscar resumo:', err);
        message.reply('❌ Erro ao gerar resumo, aventureiro! 🛡️ Tente novamente.');
      } else {
        const total = rows.reduce((sum, row) => sum + (row.type === 'revenue' ? row.value : -row.value), 0);
        state.xp += xpGain;
        const levelUp = updateUserLevel(phone, state.xp);
        const reply = levelUp
          ? `${levelUp}\n📊 Resumo, ${state.name}! 🏰 Saldo: R$${total.toFixed(2)} 🪙`
          : `📊 Resumo, ${state.name}! 🏰 Saldo: R$${total.toFixed(2)} 🪙\nGanhe mais XP com ações!`;
        message.reply(reply);
      }
    });
  } else if (text.includes('lembre-me')) {
    console.log('Comando "lembre-me" detectado');
    const reminderTime = text.match(/\d{1,2}h/);
    if (reminderTime) {
      db.run(
        'INSERT INTO reminders (user_id, message, time) VALUES (?, ?, ?)',
        [userId, text, new Date().toISOString()],
        (err) => {
          if (err) {
            console.error('Erro ao salvar lembrete:', err);
            message.reply('❌ Erro ao configurar lembrete, aventureiro! 🛡️');
          } else {
            state.xp += xpGain;
            const levelUp = updateUserLevel(phone, state.xp);
            const reply = levelUp
              ? `${levelUp}\n🔔 Lembrete configurado, ${state.name}!`
              : `🔔 Lembrete configurado, ${state.name}! Ganhe mais XP! 🪙`;
            message.reply(reply);
          }
        }
      );
    } else {
      message.reply('❌ Informe o horário (ex.: "lembre-me às 10h"), aventureiro! 🛡️');
    }
  } else if (isAdmin && text.includes('status')) {
    console.log('Comando "status" detectado por adm');
    db.all('SELECT * FROM transactions WHERE user_id = ?', [userId], (err, transactions) => {
      if (err) {
        console.error('Erro ao buscar status:', err);
        message.reply('❌ Erro ao verificar status, ADM! 🛡️');
      } else {
        const total = transactions.reduce((sum, row) => sum + (row.type === 'revenue' ? row.value : -row.value), 0);
        message.reply(`🔧 Status, ADM! 🏰 ${transactions.length} transações, saldo: R$${total.toFixed(2)} 🪙`);
      }
    });
  } else if (isAdmin && text.includes('limpar')) {
    console.log('Comando "limpar" detectado por adm');
    db.run('DELETE FROM transactions WHERE user_id = ?', [userId], (err) => {
      if (err) {
        console.error('Erro ao limpar transações:', err);
        message.reply('❌ Erro ao limpar dados, ADM! 🛡️');
      } else {
        message.reply('🧹 Tudo limpo, ADM! 🏰 A aventura recomeça!');
        io.emit('transaction');
      }
    });
  } else if (text.includes('ajuda')) {
    message.reply(
      `❓ Ajuda, ${state.name}! 🛡️\nComandos:\n- "gastei R$X em [descrição]" 💸\n- "recebi R$X" 💰\n- "resumo" 📊\n- "lembre-me às Xh" 🔔\n(ADM) "status" ou "limpar" 🔧\nSuba de nível com mais ações! 🎮`
    );
  } else {
    message.reply(`❓ Comando desconhecido, ${state.name}! 🛡️ Digite "ajuda" para ver as opções.`);
  }
});

// Agendamento de lembretes
cron.schedule('* * * * *', () => {
  db.all('SELECT * FROM reminders WHERE time <= ?', [new Date().toISOString()], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar lembretes:', err);
      return;
    }
    rows.forEach((row) => {
      whatsappClient.sendMessage('5521972530362@c.us', `Lembrete: ${row.message}`);
      db.run('DELETE FROM reminders WHERE id = ?', [row.id]);
    });
  });
});

// Inicia o servidor com porta dinâmica
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});