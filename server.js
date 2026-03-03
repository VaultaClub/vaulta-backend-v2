require('dotenv').config();
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const connectDB = require('./config/db');

const app = express();
const server = http.createServer(app);

// ========================
// SOCKET.IO — TEMPS RÉEL
// ========================
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: process.env.SITE_URL || '*', credentials: true }
});

// Track connected clients
let clientCount = 0;
let adminSockets = new Set();

io.on('connection', (socket) => {
  clientCount++;
  console.log(`🔌 Client connecté (${clientCount} actifs)`);
  
  // Admin identifies itself
  socket.on('admin:join', () => {
    adminSockets.add(socket.id);
    socket.join('admin');
    console.log(`👑 Admin connecté (${adminSockets.size} admins)`);
  });
  
  // Admin pushes a change → broadcast to all clients
  socket.on('admin:sync', (data) => {
    if (!adminSockets.has(socket.id)) return; // Only admins can push
    // Broadcast to everyone except the sender
    socket.broadcast.emit('sync:update', data);
    console.log(`📡 Sync: ${data.type} → ${clientCount - 1} clients`);
  });
  
  // Client (user) pushes activity → notify admins
  socket.on('client:activity', (data) => {
    io.to('admin').emit('sync:activity', data);
  });
  
  socket.on('disconnect', () => {
    clientCount--;
    adminSockets.delete(socket.id);
    console.log(`❌ Client déconnecté (${clientCount} actifs)`);
  });
});

// Make io accessible in routes
app.set('io', io);

// ========================
// SÉCURITÉ
// ========================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.SITE_URL || 'http://localhost:3000', credentials: true }));

// Rate limiting — only strict on auth endpoints
// Products/settings need to be freely accessible
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Trop de tentatives, réessayez plus tard' } });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ========================
// PARSING
// ========================
// Webhook Stripe doit avoir le raw body AVANT le json parser
app.use('/api/wallet/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ========================
// SESSIONS
// ========================
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
}));

// Cookie parser pour JWT
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// ========================
// FICHIERS STATIQUES
// ========================
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ========================
// ROUTES API
// ========================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/collection', require('./routes/collection'));
app.use('/api/marketplace', require('./routes/marketplace'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/support', require('./routes/support'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/prices', require('./routes/prices'));
app.use('/api/trades', require('./routes/trades'));

// ========================
// PAGES HTML (SPA fallback)
// ========================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Fallback SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route introuvable' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================
// ERREURS
// ========================
app.use((err, req, res, next) => {
  console.error('❌ Erreur:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ========================
// DÉMARRAGE
// ========================
const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectDB();
  
  // Verify SMTP connection (non-blocking)
  try {
    const { verifyConnection } = require('./services/emailService');
    verifyConnection().then(ok => {
      console.log(ok ? '✅ SMTP connecté' : '❌ SMTP indisponible (fallback actif)');
    }).catch(e => {
      console.log('❌ SMTP erreur:', e.message, '(fallback actif)');
    });
  } catch (e) {
    console.log('❌ SMTP non configuré (fallback actif)');
  }
  
  // Daily price sync cron (runs at 6:00 AM every day)
  const { syncAllProducts, applyPricesToPool } = require('./services/priceSync');
  const { Product } = require('./models/Product');
  
  function scheduleDailySync() {
    const now = new Date();
    const next6AM = new Date(now);
    next6AM.setHours(6, 0, 0, 0);
    if (now >= next6AM) next6AM.setDate(next6AM.getDate() + 1);
    const msUntil = next6AM - now;
    
    console.log(`⏰ Prochain sync prix: ${next6AM.toLocaleString('fr-FR')} (dans ${Math.round(msUntil/1000/60)} min)`);
    
    setTimeout(async () => {
      try {
        console.log('🔄 Cron: Sync quotidien des prix...');
        await syncAllProducts();
        
        // Apply to all pools
        const products = await Product.find({ active: true, tcgdexId: { $ne: '' } });
        for (const product of products) {
          if (product.pool && product.pool.length > 0) {
            await applyPricesToPool(product);
            await product.save();
          }
        }
        console.log('✅ Cron: Sync prix terminé');
      } catch (e) {
        console.error('❌ Cron sync error:', e.message);
      }
      
      // Schedule next run
      scheduleDailySync();
    }, msUntil);
  }
  
  scheduleDailySync();
  
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║     🃏 VAULTA CLUB — Serveur actif     ║
║     Port: ${PORT}                        ║
║     Mode: ${process.env.NODE_ENV || 'development'}              ║
║     🔌 Socket.io: activé               ║
╚════════════════════════════════════════╝
    `);
  });
};

start();
