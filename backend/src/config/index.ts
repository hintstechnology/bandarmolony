import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3001,
  
  // Database
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  
  // Midtrans
  MIDTRANS_MERCHANT_ID: process.env.MIDTRANS_MERCHANT_ID || '',
  MIDTRANS_CLIENT_KEY: process.env.MIDTRANS_CLIENT_KEY || '',
  MIDTRANS_SERVER_KEY: process.env.MIDTRANS_SERVER_KEY || '',
  MIDTRANS_IS_PRODUCTION: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  MIDTRANS_3DS: process.env.MIDTRANS_3DS === 'true',
  MIDTRANS_SANITIZED: process.env.MIDTRANS_SANITIZED === 'true',
  
  // URLs - All configurable via environment variables
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  WEBHOOK_URL: process.env.WEBHOOK_URL || 'http://localhost:3001/api/subscription/webhook',
  SUCCESS_URL: process.env.SUCCESS_URL || 'http://localhost:3000/subscription/success',
  ERROR_URL: process.env.ERROR_URL || 'http://localhost:3000/subscription/error',
  PENDING_URL: process.env.PENDING_URL || 'http://localhost:3000/subscription/pending',
  
  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
};

export default config;
