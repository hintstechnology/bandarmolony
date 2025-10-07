/**
 * Utility functions for handling avatar URLs
 */

/**
 * Convert storage path to full public URL
 * @param avatarPath - The storage path (e.g., "avatars/user-id/filename.jpg")
 * @returns Full public URL or null if invalid
 */
export function getAvatarUrl(avatarPath: string | null | undefined): string | null {
  if (!avatarPath) return null;
  
  // If it's already a full URL, return as is
  if (avatarPath.startsWith('http')) {
    return avatarPath;
  }
  
  // If it's a storage path, construct the full URL
  if (avatarPath.startsWith('avatars/')) {
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://mkdexguxppgwyovfmttj.supabase.co';
    return `${supabaseUrl}/storage/v1/object/public/${avatarPath}`;
  }
  
  // If it's a legacy storage path without avatars/ prefix, add it
  if (avatarPath.match(/^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|jpeg|png|gif|webp)$/i)) {
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://mkdexguxppgwyovfmttj.supabase.co';
    return `${supabaseUrl}/storage/v1/object/public/avatars/${avatarPath}`;
  }
  
  return avatarPath;
}

/**
 * Validate file type for avatar upload
 * @param file - The file to validate
 * @returns true if valid, false otherwise
 */
export function isValidAvatarFile(file: File): boolean {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return allowedTypes.includes(file.type);
}

/**
 * Validate file size for avatar upload
 * @param file - The file to validate
 * @param maxSizeInMB - Maximum size in MB (default: 5)
 * @returns true if valid, false otherwise
 */
export function isValidAvatarSize(file: File, maxSizeInMB: number = 5): boolean {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return file.size <= maxSizeInBytes;
}
