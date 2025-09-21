import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import healthRoutes from './routes/health';
import demoRoutes from './routes/demo';
import meRoutes from './routes/me';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import subscriptionRoutes from './routes/subscription';
import { requireSupabaseUser } from './middleware/requireSupabaseUser';
import { securityHeaders, sanitizeInput, corsConfig } from './middleware/security';
import { createErrorResponse, ERROR_CODES, HTTP_STATUS } from './utils/responseUtils';

const app = express();

// Security middleware
app.use(securityHeaders);
app.use(sanitizeInput);
app.use(corsConfig);

// CORS configuration (backup)
app.use(cors({ 
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server error:', err);
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
    'Internal server error',
    ERROR_CODES.INTERNAL_SERVER_ERROR,
    undefined,
    HTTP_STATUS.INTERNAL_SERVER_ERROR
  ));
});

// 404 handler (Express 5 compatible)
app.use((req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
    'Route not found',
    ERROR_CODES.NOT_FOUND,
    undefined,
    HTTP_STATUS.NOT_FOUND
  ));
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});