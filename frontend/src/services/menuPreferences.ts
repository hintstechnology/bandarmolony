import { getCookie, setCookie, deleteCookie } from '../utils/cookies';

const COOKIE_NAME = 'userMenuPreferences';
const STORAGE_KEY = 'userMenuPreferences_storage';

export const menuPreferencesService = {
  /**
   * Get preferences for a specific page from storage (try localStorage, then cookies)
   */
  getCachedPreferences(pageId: string): Record<string, any> | null {
    try {
      // 1. Try LocalStorage first (Source of Truth for large data)
      const storageRaw = localStorage.getItem(STORAGE_KEY);
      if (storageRaw) {
        const parsed = JSON.parse(storageRaw);
        if (parsed && typeof parsed === 'object' && parsed[pageId]) {
          return parsed[pageId];
        }
      }

      // 2. Fallback to cookies
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
   * Get all preferences
   */
  getAllCachedPreferences(): Record<string, any> | null {
    try {
      const storageRaw = localStorage.getItem(STORAGE_KEY);
      if (storageRaw) {
        const parsed = JSON.parse(storageRaw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }

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
   * Load preferences for a specific page
   */
  loadPreferences(pageId: string): Record<string, any> {
    return this.getCachedPreferences(pageId) || {};
  },

  /**
   * Save preferences for a specific page
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

      const serialized = JSON.stringify(allPrefs);

      // 1. Save to LocalStorage (Reliable for large pivot configurations)
      localStorage.setItem(STORAGE_KEY, serialized);

      // 2. Save to cookie (Try to sync, but ignore if too large)
      // Cookies have a ~4KB limit.
      if (serialized.length < 4000) {
        setCookie(COOKIE_NAME, serialized, 30); // 30 days expiry
      } else {
        // If too large, we still save metadata to cookie but strip large fields
        const lightPrefs = { ...allPrefs };
        if (lightPrefs[pageId]?.pivotState) {
          delete lightPrefs[pageId].pivotState;
        }
        setCookie(COOKIE_NAME, JSON.stringify(lightPrefs), 30);
      }
    } catch (error) {
      console.warn('Failed to save preferences:', error);
    }
  },

  /**
   * Load all preferences
   */
  loadAllPreferences(): Record<string, any> {
    return this.getAllCachedPreferences() || {};
  },

  /**
   * Clear all preferences
   */
  clearPreferences(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      deleteCookie(COOKIE_NAME);
    } catch (error) {
      console.warn('Failed to clear preferences:', error);
    }
  }
};

