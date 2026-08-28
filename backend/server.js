// Fail-fast checks for production environment
if (process.env.NODE_ENV === 'production') {
  const missing = [];
  if (!process.env.MONGO_URI) missing.push('MONGO_URI');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');

  // Email config: either EMAIL_ACCOUNTS or EMAIL_USER+EMAIL_PASS
  const hasEmailAccounts = !!process.env.EMAIL_ACCOUNTS;
  const hasSingleEmail = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  if (!hasEmailAccounts && !hasSingleEmail) missing.push('EMAIL_ACCOUNTS or EMAIL_USER+EMAIL_PASS');

  if (missing.length > 0) {
    console.error('Startup failed: missing required environment variables for production:', missing.join(', '));
    console.error('Aborting startup to avoid running with incomplete configuration.');
    process.exit(1);
  }
}

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const { initSocket } = require('./socket');

// ── Route imports ──
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const uploadRoutes = require('./routes/upload');

// ── Connect to MongoDB ──
connectDB();

// ── CORS Origins — must be defined BEFORE Socket.io and CORS middleware ──
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

// ── Express app ──
const app = express();
// Trust proxy: when running behind a reverse proxy (Render, Heroku, nginx),
// Express must be configured to trust the X-Forwarded-* headers so that
// req.ip and express-rate-limit correctly identify the client IP.
// Use an environment variable to allow overriding in different deployments.
app.set('trust proxy', process.env.TRUST_PROXY || 1);
const server = http.createServer(app);

// ── Socket.io ──
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

// ── Global middleware ──
app.use(helmet());

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// ── Health check ──
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'LASU Connect API',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found.` });
});

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Something went wrong on our end.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Initialise Socket.io logic ──
initSocket(io);

// ── Start server ──
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 LASU Connect API running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health\n`);
});
