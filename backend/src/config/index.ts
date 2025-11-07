// Environment variables loaded in index.ts

export const config = {
  // Environment
  NODE_ENV: process.env['NODE_ENV'] || '',
  PORT: process.env['PORT'] || '',
  
  // Database
  SUPABASE_URL: process.env['SUPABASE_URL'] || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'] || '',
  
  // Midtrans
  MIDTRANS_MERCHANT_ID: process.env['MIDTRANS_MERCHANT_ID'] || '',
  MIDTRANS_CLIENT_KEY: process.env['MIDTRANS_CLIENT_KEY'] || '',
  MIDTRANS_SERVER_KEY: process.env['MIDTRANS_SERVER_KEY'] || '',
  MIDTRANS_IS_PRODUCTION: process.env['MIDTRANS_IS_PRODUCTION'] === 'true',
  MIDTRANS_3DS: process.env['MIDTRANS_3DS'] === 'true',
  MIDTRANS_SANITIZED: process.env['MIDTRANS_SANITIZED'] === 'true',
  
  // URLs - All configurable via environment variables
  FRONTEND_URL: process.env['FRONTEND_URL'] || '',
  
  // Midtrans Webhook URLs
  WEBHOOK_URL: process.env['MIDTRANS_PAYMENT_NOTIFICATION_URL'] || '',
  RECURRING_WEBHOOK_URL: process.env['MIDTRANS_RECURRING_NOTIFICATION_URL'] || '',
  PAY_ACCOUNT_WEBHOOK_URL: process.env['MIDTRANS_PAY_ACCOUNT_NOTIFICATION_URL'] || '',
  
  // Midtrans Callback URLs - Add https:// if not present
  SUCCESS_URL: (() => {
    const url = process.env['MIDTRANS_FINISH_REDIRECT_URL'] || '';
    return url && !url.startsWith('http') ? `https://${url}` : url;
  })(),
  ERROR_URL: (() => {
    const url = process.env['MIDTRANS_ERROR_REDIRECT_URL'] || '';
    return url && !url.startsWith('http') ? `https://${url}` : url;
  })(),
  PENDING_URL: (() => {
    const url = process.env['MIDTRANS_UNFINISH_REDIRECT_URL'] || '';
    return url && !url.startsWith('http') ? `https://${url}` : url;
  })(),
  
  // CORS
  CORS_ORIGIN: process.env['CORS_ORIGIN'] || '',
  
  // Payment Configuration
  PAYMENT_TIMEOUT_MINUTES: parseInt(process.env['PAYMENT_TIMEOUT_MINUTES'] || ''),
  
  // External Services
  AZURE_STORAGE_CONNECTION_STRING: process.env['AZURE_STORAGE_CONNECTION_STRING'] || '',
  AZURE_STORAGE_CONTAINER_NAME: process.env['AZURE_STORAGE_CONTAINER_NAME'] || '',
};

export default config;
