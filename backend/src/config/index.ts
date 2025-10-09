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
  
  // Midtrans Webhook URLs
  WEBHOOK_URL: process.env.MIDTRANS_PAYMENT_NOTIFICATION_URL || 'http://localhost:3001/api/subscription/webhook',
  RECURRING_WEBHOOK_URL: process.env.MIDTRANS_RECURRING_NOTIFICATION_URL || 'http://localhost:3001/api/subscription/webhook',
  PAY_ACCOUNT_WEBHOOK_URL: process.env.MIDTRANS_PAY_ACCOUNT_NOTIFICATION_URL || 'http://localhost:3001/api/subscription/webhook',
  
  // Midtrans Callback URLs
  SUCCESS_URL: process.env.MIDTRANS_FINISH_REDIRECT_URL || 'http://localhost:3000/subscription/success',
  ERROR_URL: process.env.MIDTRANS_ERROR_REDIRECT_URL || 'http://localhost:3000/subscription/error',
  PENDING_URL: process.env.MIDTRANS_UNFINISH_REDIRECT_URL || 'http://localhost:3000/subscription/pending',
  
  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // Payment Configuration
  PAYMENT_TIMEOUT_MINUTES: parseInt(process.env.PAYMENT_TIMEOUT_MINUTES || '15'),
  
  // External Services (untuk fitur yang akan datang)
  AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
  AZURE_STORAGE_CONTAINER_NAME: process.env.AZURE_STORAGE_CONTAINER_NAME || 'stock-trading-data',
  TICMI_API_KEY: process.env.TICMI_API_KEY || '',
  TICMI_API_URL: process.env.TICMI_API_URL || 'https://api2.ticmidata.co.id/direct/v1/saham',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
};

export default config;
