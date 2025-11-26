import express from 'express';
import cors from 'cors';
import config from './config';
import healthRoutes from './routes/health';
import demoRoutes from './routes/demo';
import meRoutes from './routes/me';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import developerRoutes from './routes/developer';
import rrcRoutes from './routes/rrc';
import rrgRoutes from './routes/rrg';
import subscriptionRoutes from './routes/subscription';
import triggerRoutes from './routes/trigger';
import seasonalityRoutes from './routes/seasonality';
import trendFilterRoutes from './routes/trendFilter';
import accumulationRoutes from './routes/accumulation';
import bidAskRoutes from './routes/bidask';
import brokerRoutes from './routes/broker';
import brokerBreakdownRoutes from './routes/brokerbreakdown';
import foreignRoutes from './routes/foreign';
import moneyFlowRoutes from './routes/moneyflow';
import stockRoutes from './routes/stock';
import holdingRoutes from './routes/holding';
import shareholdersRoutes from './routes/shareholders';
import doneSummaryRoutes from './routes/done-summary';
import breakDoneTradeRoutes from './routes/break-done-trade';
import topBrokerRoutes from './routes/top-broker';
import watchlistRoutes from './routes/watchlist';
import brokerSummaryRoutes from './routes/broker-summary';
import brokerInventoryRoutes from './routes/broker_inventory';
import publicRoutes from './routes/public';
import { requireSupabaseUser } from './middleware/requireSupabaseUser';
import { securityHeaders, sanitizeInput } from './middleware/security';
import { createErrorResponse, ERROR_CODES, HTTP_STATUS } from './utils/responseUtils';

// Scheduler for daily updates
import { startScheduler } from './services/scheduler';
import { initializeAzureLogging } from './services/azureLoggingService';
import { startSubscriptionExpiryChecker } from './services/subscriptionExpiry';

const app = express();

// Security middleware
app.use(securityHeaders);
app.use(sanitizeInput);

// CORS configuration - semua dari .env (CORS_ORIGIN)
// Tidak ada hardcode, semua konfigurasi hanya dari .env
const allowedOrigins = config.CORS_ORIGIN
  ? config.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : []; // Jika CORS_ORIGIN tidak di-set, tidak ada origin yang di-allow (user harus set di .env)

// CORS configuration - allow webhooks from Midtrans (server-to-server requests have no origin)
app.use(cors({ 
  origin: (origin, callback) => {
    // Allow requests without origin (server-to-server like webhooks) or from allowed origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Only log CORS errors (not allowed origins)
      console.warn(`❌ CORS: Origin not allowed: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Midtrans-Signature'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// routes publik
app.use('/health', healthRoutes);
app.use('/api', demoRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/public', publicRoutes); // Public routes (no auth) - for GitHub Actions
app.use('/api/admin', adminRoutes);
app.use('/api/developer', developerRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/rrc', rrcRoutes);
app.use('/api/rrg', rrgRoutes);
app.use('/api/trigger', triggerRoutes);
app.use('/api/seasonality', seasonalityRoutes);
app.use('/api/trend-filter', trendFilterRoutes);
app.use('/api/accumulation', accumulationRoutes);
app.use('/api/bidask', bidAskRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/broker-breakdown', brokerBreakdownRoutes);
app.use('/api/foreign', foreignRoutes);
app.use('/api/moneyflow', moneyFlowRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/stock-list', stockRoutes); // Use same router, different endpoints
app.use('/api/holding', holdingRoutes);
app.use('/api/shareholders', shareholdersRoutes);
app.use('/api/done-summary', doneSummaryRoutes);
app.use('/api/break-done-trade', breakDoneTradeRoutes);
app.use('/api/top-broker', topBrokerRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/broker-summary', brokerSummaryRoutes);
app.use('/api/broker-inventory', brokerInventoryRoutes);

// contoh protected route pakai Supabase Auth token
app.get('/me', requireSupabaseUser, (req: any, res) => {
  res.json({ ok: true, user: req.user });
});

// Error handling middleware
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Server error:', err);
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
    'Internal server error',
    ERROR_CODES.INTERNAL_SERVER_ERROR,
    undefined,
    HTTP_STATUS.INTERNAL_SERVER_ERROR
  ));
});

// 404 handler (Express 5 compatible)
app.use((_req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
    'Route not found',
    ERROR_CODES.NOT_FOUND,
    undefined,
    HTTP_STATUS.NOT_FOUND
  ));
});

// Global error handlers to prevent crashes from unhandled rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);
  // Log error but don't crash - allow scheduler to continue
  if (reason?.message) {
    console.error('Error message:', reason.message);
  }
  if (reason?.stack) {
    console.error('Stack trace:', reason.stack);
  }
});

process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  // For uncaught exceptions, we might want to exit gracefully
  // But for now, log and continue to prevent scheduler interruption
  console.warn('⚠️ Continuing execution despite uncaught exception...');
});

const PORT = parseInt(config.PORT) || 3001;
const HOST = process.env['HOST'] || '0.0.0.0'; // Listen on all interfaces to allow access from public IP
app.listen(PORT, HOST, async () => {
  console.log(`Backend listening on ${HOST}:${PORT}`);
  console.log(`Environment used: ${config.NODE_ENV}`);
  console.log(`Frontend URL: ${config.FRONTEND_URL}`);
  console.log(`CORS Origin: ${config.CORS_ORIGIN}`);
  
  // Skip auto-generation on startup (already generated)
  // Only start scheduler for daily updates
  console.log('📅 Starting scheduler for daily updates...');
  initializeAzureLogging().then(() => {
    startScheduler();
    console.log(`✅ Scheduler started successfully`);
  }).catch((error) => {
    console.error('❌ Failed to start scheduler:', error);
    // Don't crash - scheduler can be started manually later
  });
  
  // Start subscription expiry checker
  console.log('⏰ Starting subscription expiry checker...');
  startSubscriptionExpiryChecker();
});
