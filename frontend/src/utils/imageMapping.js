// Image mapping untuk Supabase Storage
// Semua gambar sudah dipindahkan ke Supabase Storage dengan nama yang lebih pendek

// Base URL untuk Supabase Storage
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-ref.supabase.co';
const STORAGE_BASE_URL = `${SUPABASE_URL}/storage/v1/object/public/assets/images`;

// Mapping nama file ke URL Supabase Storage
export const imageMapping = {
  // Chart images
  'chart-1.png': `${STORAGE_BASE_URL}/chart-1.png`,
  'chart-2.png': `${STORAGE_BASE_URL}/chart-2.png`,
  'chart-3.png': `${STORAGE_BASE_URL}/chart-3.png`,
  'chart-4.png': `${STORAGE_BASE_URL}/chart-4.png`,
  'chart-5.png': `${STORAGE_BASE_URL}/chart-5.png`,
  'chart-6.png': `${STORAGE_BASE_URL}/chart-6.png`,
  'chart-7.png': `${STORAGE_BASE_URL}/chart-7.png`,
  'chart-8.png': `${STORAGE_BASE_URL}/chart-8.png`,
  'chart-9.png': `${STORAGE_BASE_URL}/chart-9.png`,
  'chart-10.png': `${STORAGE_BASE_URL}/chart-10.png`,
  'chart-11.png': `${STORAGE_BASE_URL}/chart-11.png`,
  'chart-12.png': `${STORAGE_BASE_URL}/chart-12.png`,
  'chart-13.png': `${STORAGE_BASE_URL}/chart-13.png`,
  'chart-14.png': `${STORAGE_BASE_URL}/chart-14.png`,
  'chart-15.png': `${STORAGE_BASE_URL}/chart-15.png`,
  'chart-16.png': `${STORAGE_BASE_URL}/chart-16.png`,
  'chart-17.png': `${STORAGE_BASE_URL}/chart-17.png`,
  'chart-18.png': `${STORAGE_BASE_URL}/chart-18.png`,
  'chart-19.png': `${STORAGE_BASE_URL}/chart-19.png`,
  'chart-20.png': `${STORAGE_BASE_URL}/chart-20.png`,
  'chart-21.png': `${STORAGE_BASE_URL}/chart-21.png`,
  'chart-22.png': `${STORAGE_BASE_URL}/chart-22.png`,
  
  // Auth background
  'auth/auth_bg.jpg': `${STORAGE_BASE_URL}/auth-background.jpg`,
};

// Helper function untuk mendapatkan URL gambar
export function getImageUrl(filename) {
  return imageMapping[filename] || `${STORAGE_BASE_URL}/${filename}`;
}

// Helper function untuk mendapatkan semua URL gambar
export function getAllImageUrls() {
  return Object.values(imageMapping);
}

// Helper function untuk mendapatkan base URL storage
export function getStorageBaseUrl() {
  return STORAGE_BASE_URL;
}
