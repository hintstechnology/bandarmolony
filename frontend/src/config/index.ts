// Centralized configuration for frontend
export const config = {
  // API Configuration
  API_URL: (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001',
  
  // Supabase Configuration
  SUPABASE_URL: (import.meta as any).env?.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '',
  
  // Midtrans Configuration
  MIDTRANS_CLIENT_KEY: (import.meta as any).env?.VITE_MIDTRANS_CLIENT_KEY || '',
  
  // Environment
  NODE_ENV: (import.meta as any).env?.VITE_NODE_ENV || 'development',
  
  // App Configuration
  APP_NAME: 'BandarmoloNY',
  VERSION: '0.1.0',
  
  // API Timeouts
  API_TIMEOUT: 15000, // 15 seconds
  
  // File Upload Limits
  MAX_FILE_SIZE: 1 * 1024 * 1024, // 1MB
  
  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
};

export default config;
