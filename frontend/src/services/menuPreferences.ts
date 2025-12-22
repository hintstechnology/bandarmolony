import { getCookie, setCookie, deleteCookie } from '../utils/cookies';

const COOKIE_NAME = 'userMenuPreferences';

export const menuPreferencesService = {
  /**
   * Get preferences for a specific page from cookies
   */
  getCachedPreferences(pageId: string): Record<string, any> | null {
    try {
      const raw = getCookie(COOKIE_NAME);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed[pageId]) {
        return parsed[pageId];
      }
      return null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Get all preferences from cookies
   */
  getAllCachedPreferences(): Record<string, any> | null {
    try {
      const raw = getCookie(COOKIE_NAME);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
      return null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Load preferences for a specific page from cookies
   * (Synchronous - cookies are available immediately)
   */
  loadPreferences(pageId: string): Record<string, any> {
    return this.getCachedPreferences(pageId) || {};
  },

  /**
   * Save preferences for a specific page to cookies
   * Cookies will persist with browser session
   */
  savePreferences(pageId: string, preferences: Record<string, any>): void {
    try {
      // Get all existing preferences
      const allPrefs = this.getAllCachedPreferences() || {};
      
      // Update preferences for this page
      allPrefs[pageId] = {
        ...(allPrefs[pageId] || {}),
        ...preferences
      };
      
      // Save to cookie (session cookie - expires when browser closes)
      // Or set 30 days expiry if you want it to persist longer
      setCookie(COOKIE_NAME, JSON.stringify(allPrefs), 30); // 30 days expiry
    } catch (error) {
      console.warn('Failed to save preferences to cookie:', error);
    }
  },

  /**
   * Load all preferences for all pages from cookies
   */
  loadAllPreferences(): Record<string, any> {
    return this.getAllCachedPreferences() || {};
  },

  /**
   * Clear all preferences (useful for logout)
   */
  clearPreferences(): void {
    try {
      deleteCookie(COOKIE_NAME);
    } catch (error) {
      console.warn('Failed to clear preferences cookie:', error);
    }
  }
};

