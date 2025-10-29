/**
 * Utility functions for role formatting and display
 */

/**
 * Format role for display with proper capitalization
 * @param role - The role string from the database
 * @returns Formatted role string with first letter capitalized
 */
export function formatRole(role: string): string {
  if (!role) return '';
  
  // Convert to lowercase first, then capitalize first letter
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/**
 * Get role display name with proper formatting
 * @param role - The role string from the database
 * @returns Formatted role display name
 */
export function getRoleDisplayName(role: string): string {
  const roleMap: { [key: string]: string } = {
    'user': 'User',
    'admin': 'Admin', 
    'developer': 'Developer'
  };
  
  return roleMap[role.toLowerCase()] || formatRole(role);
}

/**
 * Check if user has admin privileges (admin or developer)
 * @param role - The role string from the database
 * @returns True if user has admin privileges
 */
export function hasAdminPrivileges(role: string): boolean {
  return role === 'admin' || role === 'developer';
}

/**
 * Check if user has developer privileges
 * @param role - The role string from the database
 * @returns True if user has developer privileges
 */
export function hasDeveloperPrivileges(role: string): boolean {
  return role === 'developer';
}

/**
 * Get role badge color for UI components
 * @param role - The role string from the database
 * @returns CSS class name for badge color
 */
export function getRoleBadgeColor(role: string): string {
  const colorMap: { [key: string]: string } = {
    'user': 'bg-gray-100 text-gray-800',
    'admin': 'bg-red-100 text-red-800',
    'developer': 'bg-blue-100 text-blue-800'
  };
  
  return colorMap[role.toLowerCase()] || 'bg-gray-100 text-gray-800';
}
