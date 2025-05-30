/* server.js - Servidor do Invix (backend) */

const express = require('express');
const mercadopago = require('mercadopago');
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

// Configura Mercado Pago
mercadopago.configure({
  access_token: process.env.MERCADO_PAGO_TOKEN,
});

// Conecta ao banco SQLite
const db = new sqlite3.Database('./invix.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco:', err);
  } else {
    console.log('Conectado ao banco SQLite 🚀');
  }
});

// Configura o bot do WhatsApp
const client = new Client();
client.on('qr', (qr) => {
  console.log('Escaneie o QR code:', qr);
});
client.on('ready', () => {
  console.log('Bot conectado! 🚀');
});
client.initialize();

// WebSocket para atualizações em tempo real
io.on('connection', (socket) => {
  console.log('Cliente conectado ao WebSocket');
  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

// Endpoint para login (simulado)
app.post('/api/login', (req, res) => {
  const { phone } = req.body;
  // Simula envio de código (em produção, use um serviço de SMS)
  console.log(`Código enviado para ${phone}`);
  res.json({ success: true });
});

// Endpoint para validar código
app.post('/api/validate', (req, res) => {
  const { code, phone } = req.body;
  // Simula validação (em produção, valide o código)
  if (code === '123456') { // Código fixo para teste
    const token = jwt.sign({ userId: 1, phone }, process.env.JWT_SECRET, { expiresIn: '1h' });
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
      if (err) {
        console.error('Erro ao buscar transações:', err);
        return res.status(500).json({ error: 'Erro no servidor' });
      }
      db.all('SELECT * FROM subscriptions WHERE user_id = ?', [decoded.userId], (err, subscriptions) => {
        if (err) {
          console.error('Erro ao buscar assinaturas:', err);
          return res.status(500).json({ error: 'Erro no servidor' });
        }
        db.all('SELECT * FROM goals WHERE user_id = ?', [decoded.userId], (err, goals) => {
          if (err) {
            console.error('Erro ao buscar metas:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
          }
          db.all('SELECT * FROM clients WHERE user_id = ?', [decoded.userId], (err, clients) => {
            if (err) {
              console.error('Erro ao buscar clientes:', err);
              return res.status(500).json({ error: 'Erro no servidor' });
            }
            res.json({
              user: { name: 'Usuário Teste', type: 'physical' }, // Ajuste em produção
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
    const subscription = await mercadopago.preapproval.create({
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
    });

    // Salva no banco
    db.run(
      'INSERT INTO subscriptions (user_id, subscription_id, status, payer_email, end_date) VALUES (?, ?, ?, ?, ?)',
      [1, subscription.response.id, 'active', payerEmail, new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()],
      (err) => {
        if (err) console.error('Erro ao salvar assinatura:', err);
        io.emit('subscription_update');
      }
    );

    res.json({ success: true, subscription: subscription.response });
  } catch (error) {
    console.error('Erro ao criar assinatura:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lógica do bot para comandos
client.on('message', async (message) => {
  const text = message.body.toLowerCase();
  const userId = 1; // Fixo para teste

  if (text.includes('gastei')) {
    const amount = parseFloat(text.match(/r\$\d+(\.\d+)?/));
    if (amount) {
      db.run(
        'INSERT INTO transactions (user_id, type, value, description, date) VALUES (?, ?, ?, ?, ?)',
        [userId, 'expense', amount, 'Gasto', new Date().toISOString()],
        (err) => {
          if (err) {
            console.error('Erro ao salvar transação:', err);
          } else {
            message.reply(`Gasto de R$${amount} registrado!`);
            io.emit('transaction');
          }
        }
      );
    }
  } else if (text.includes('recebi')) {
    const amount = parseFloat(text.match(/r\$\d+(\.\d+)?/));
    if (amount) {
      db.run(
        'INSERT INTO transactions (user_id, type, value, description, date) VALUES (?, ?, ?, ?, ?)',
        [userId, 'revenue', amount, 'Receita', new Date().toISOString()],
        (err) => {
          if (err) {
            console.error('Erro ao salvar transação:', err);
          } else {
            message.reply(`Receita de R$${amount} registrada!`);
            io.emit('transaction');
          }
        }
      );
    }
  } else if (text.includes('resumo')) {
    db.all('SELECT * FROM transactions WHERE user_id = ?', [userId], (err, rows) => {
      if (err) {
        console.error('Erro ao buscar resumo:', err);
        message.reply('Erro ao gerar resumo.');
      } else {
        const total = rows.reduce((sum, row) => sum + (row.type === 'revenue' ? row.value : -row.value), 0);
        message.reply(`Resumo: R$${total.toFixed(2)}`);
      }
    });
  } else if (text.includes('lembre-me')) {
    const reminderTime = text.match(/\d{1,2}h/); // Simplificado
    if (reminderTime) {
      db.run(
        'INSERT INTO reminders (user_id, message, time) VALUES (?, ?, ?)',
        [userId, text, new Date().toISOString()],
        (err) => {
          if (err) {
            console.error('Erro ao salvar lembrete:', err);
          } else {
            message.reply('Lembrete configurado! 🔔');
          }
        }
      );
    }
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
      client.sendMessage('5521972530362@c.us55', `Lembrete: ${row.message}`);
      db.run('DELETE FROM reminders WHERE id = ?', [row.id]);
    });
  });
});

server.listen(5000, () => console.log('Servidor rodando na porta 5000 🚀'));