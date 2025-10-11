import express from 'express';
import cors from 'cors';
import config from './config';
import healthRoutes from './routes/health';
import demoRoutes from './routes/demo';
import meRoutes from './routes/me';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import subscriptionRoutes from './routes/subscription';
import { requireSupabaseUser } from './middleware/requireSupabaseUser';
import { securityHeaders, sanitizeInput } from './middleware/security';
import { createErrorResponse, ERROR_CODES, HTTP_STATUS } from './utils/responseUtils';

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
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Frontend URL: ${config.FRONTEND_URL}`);
  console.log(`CORS Origin: ${config.CORS_ORIGIN}`);
});