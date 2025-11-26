// Environment variables loaded in index.ts

// Helper function untuk check jika env var berisi ${VAR} pattern (tidak ter-resolve)
// Karena .env tidak support variable substitution, treat ${VAR} sebagai "not set"
const isUnresolvedVar = (value: string | undefined): boolean => {
  return !value || value.includes('${') || !value.startsWith('http');
};

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
  
  // Base URLs - All configurable via environment variables
  FRONTEND_URL: process.env['FRONTEND_URL'] || 'http://localhost:3000',
  BACKEND_URL: process.env['BACKEND_URL'] || `http://localhost:${process.env['PORT'] || '3001'}`,
  
  // Midtrans Webhook URLs - Auto-construct dari BACKEND_URL
  // Jika di .env set dengan ${BACKEND_URL}, akan di-ignore dan auto-construct
  WEBHOOK_URL: (() => {
    const envValue = process.env['MIDTRANS_PAYMENT_NOTIFICATION_URL'];
    if (!isUnresolvedVar(envValue)) return envValue!;
    const base = process.env['BACKEND_URL'] || `http://localhost:${process.env['PORT'] || '3001'}`;
    return `${base}/api/subscription/webhook`;
  })(),
  RECURRING_WEBHOOK_URL: (() => {
    const envValue = process.env['MIDTRANS_RECURRING_NOTIFICATION_URL'];
    if (!isUnresolvedVar(envValue)) return envValue!;
    const base = process.env['BACKEND_URL'] || `http://localhost:${process.env['PORT'] || '3001'}`;
    return `${base}/api/subscription/webhook`;
  })(),
  PAY_ACCOUNT_WEBHOOK_URL: (() => {
    const envValue = process.env['MIDTRANS_PAY_ACCOUNT_NOTIFICATION_URL'];
    if (!isUnresolvedVar(envValue)) return envValue!;
    const base = process.env['BACKEND_URL'] || `http://localhost:${process.env['PORT'] || '3001'}`;
    return `${base}/api/subscription/webhook`;
  })(),
  
  // Midtrans Callback URLs - Auto-construct dari FRONTEND_URL
  // Jika di .env set dengan ${FRONTEND_URL}, akan di-ignore dan auto-construct
  SUCCESS_URL: (() => {
    const envValue = process.env['MIDTRANS_FINISH_REDIRECT_URL'];
    if (!isUnresolvedVar(envValue)) {
      const url = envValue!;
      return url && !url.startsWith('http') ? `https://${url}` : url;
    }
    const base = process.env['FRONTEND_URL'] || 'http://localhost:3000';
    return `${base}/subscription/success`;
  })(),
  ERROR_URL: (() => {
    const envValue = process.env['MIDTRANS_ERROR_REDIRECT_URL'];
    if (!isUnresolvedVar(envValue)) {
      const url = envValue!;
      return url && !url.startsWith('http') ? `https://${url}` : url;
    }
    const base = process.env['FRONTEND_URL'] || 'http://localhost:3000';
    return `${base}/subscription/error`;
  })(),
  PENDING_URL: (() => {
    const envValue = process.env['MIDTRANS_UNFINISH_REDIRECT_URL'];
    if (!isUnresolvedVar(envValue)) {
      const url = envValue!;
      return url && !url.startsWith('http') ? `https://${url}` : url;
    }
    const base = process.env['FRONTEND_URL'] || 'http://localhost:3000';
    return `${base}/subscription/pending`;
  })(),
  
  // CORS - Menggunakan CORS_ORIGIN dari env, atau fallback ke FRONTEND_URL
  // Jika di .env set dengan ${FRONTEND_URL}, akan di-ignore dan fallback ke FRONTEND_URL saja
  CORS_ORIGIN: (() => {
    const envValue = process.env['CORS_ORIGIN'];
    // Jika CORS_ORIGIN di-set dan tidak berisi ${VAR}, gunakan itu
    if (envValue && !envValue.includes('${')) {
      return envValue;
    }
    // Fallback ke FRONTEND_URL saja jika CORS_ORIGIN tidak valid
    return process.env['FRONTEND_URL'] || 'http://localhost:3000';
  })(),
  
  // Payment Configuration
  PAYMENT_TIMEOUT_MINUTES: parseInt(process.env['PAYMENT_TIMEOUT_MINUTES'] || ''),
  
  // Session Configuration
  // Session duration in hours (default: 7 days = 168 hours)
  // Set to 0 for never expire (not recommended for security)
  SESSION_DURATION_HOURS: parseInt(process.env['SESSION_DURATION_HOURS'] || '168'),
  
  // External Services
  AZURE_STORAGE_CONNECTION_STRING: process.env['AZURE_STORAGE_CONNECTION_STRING'] || '',
  AZURE_STORAGE_CONTAINER_NAME: process.env['AZURE_STORAGE_CONTAINER_NAME'] || '',
};

export default config;
