import express from 'express';
import cors from 'cors';
import config from './config';
import healthRoutes from './routes/health';
import demoRoutes from './routes/demo';
import meRoutes from './routes/me';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import rrcRoutes from './routes/rrc';
import rrgRoutes from './routes/rrg';
import subscriptionRoutes from './routes/subscription';
import triggerRoutes from './routes/trigger';
import seasonalityRoutes from './routes/seasonality';
import trendFilterRoutes from './routes/trendFilter';
import accumulationRoutes from './routes/accumulation';
import bidAskRoutes from './routes/bidask';
import brokerRoutes from './routes/broker';
import brokerInventoryRoutes from './routes/broker_inventory';
import foreignRoutes from './routes/foreign';
import moneyFlowRoutes from './routes/moneyflow';
import stockRoutes from './routes/stock';
import holdingRoutes from './routes/holding';
import shareholdersRoutes from './routes/shareholders';
import doneSummaryRoutes from './routes/done-summary';
import breakDoneTradeRoutes from './routes/break-done-trade';
import { requireSupabaseUser } from './middleware/requireSupabaseUser';
import { securityHeaders, sanitizeInput } from './middleware/security';
import { createErrorResponse, ERROR_CODES, HTTP_STATUS } from './utils/responseUtils';

// Scheduler for daily updates
import { startScheduler } from './services/scheduler';
import { initializeAzureLogging } from './services/azureLoggingService';

const app = express();

// Security middleware
app.use(securityHeaders);
app.use(sanitizeInput);

// CORS configuration using environment variables
const allowedOrigins = config.CORS_ORIGIN
  ? config.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://bandarmolony.com',
      'https://www.bandarmolony.com',
      'https://bandarmolony-frontend.proudforest-3316dee8.eastus.azurecontainerapps.io',
    ];

console.log('🌐 CORS: Allowed origins from config:', allowedOrigins);

app.use(cors({ 
  origin: (origin, callback) => {
    console.log(`🌐 CORS: Origin: ${origin}`);
    console.log(`🌐 CORS: Allowed origins:`, allowedOrigins);
    
    if (!origin || allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: Origin allowed: ${origin}`);
      callback(null, true);
    } else {
      console.log(`❌ CORS: Origin not allowed: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// routes publik
app.use('/health', healthRoutes);
app.use('/api', demoRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/rrc', rrcRoutes);
app.use('/api/rrg', rrgRoutes);
app.use('/api/trigger', triggerRoutes);
app.use('/api/seasonality', seasonalityRoutes);
app.use('/api/trend-filter', trendFilterRoutes);
app.use('/api/accumulation', accumulationRoutes);
app.use('/api/bidask', bidAskRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/broker-inventory', brokerInventoryRoutes);
app.use('/api/foreign', foreignRoutes);
app.use('/api/moneyflow', moneyFlowRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/holding', holdingRoutes);
app.use('/api/shareholders', shareholdersRoutes);
app.use('/api/done-summary', doneSummaryRoutes);
app.use('/api/break-done-trade', breakDoneTradeRoutes);

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

const PORT = config.PORT;
app.listen(PORT, async () => {
  console.log(`Backend listening on port ${PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Frontend URL: ${config.FRONTEND_URL}`);
  console.log(`CORS Origin: ${config.CORS_ORIGIN}`);
  
  // Skip auto-generation on startup (already generated)
  // Only start scheduler for daily updates
  console.log('📅 Starting scheduler for daily updates...');
  initializeAzureLogging().then(() => {
    startScheduler();
    console.log(`✅ Scheduler started successfully`);
  }).catch(console.error);
});