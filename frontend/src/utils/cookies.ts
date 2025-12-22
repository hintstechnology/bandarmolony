/**
 * Cookie utility functions
 * Cookies will persist with browser session
 */

/**
 * Set a cookie (session cookie - expires when browser closes)
 */
export function setCookie(name: string, value: string, days?: number): void {
  try {
    let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
    
    // If days is provided, set expiry date
    if (days !== undefined && days > 0) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      cookieString += `; expires=${date.toUTCString()}`;
    }
    // If days is not provided or 0, it's a session cookie (expires when browser closes)
    
    document.cookie = cookieString;
  } catch (error) {
    console.warn('Failed to set cookie:', error);
  }
}

/**
 * Get a cookie value
 */
export function getCookie(name: string): string | null {
  try {
    const nameEQ = encodeURIComponent(name) + '=';
    const cookies = document.cookie.split(';');
    
    for (let i = 0; i < cookies.length; i++) {
      let cookie = cookies[i];
      while (cookie.charAt(0) === ' ') {
        cookie = cookie.substring(1, cookie.length);
      }
      if (cookie.indexOf(nameEQ) === 0) {
        return decodeURIComponent(cookie.substring(nameEQ.length, cookie.length));
      }
    }
    return null;
  } catch (error) {
    console.warn('Failed to get cookie:', error);
    return null;
  }
}

/**
 * Delete a cookie
 */
export function deleteCookie(name: string): void {
  try {
    document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
  } catch (error) {
    console.warn('Failed to delete cookie:', error);
  }
}

/**
 * Get all cookies as an object
 */
export function getAllCookies(): Record<string, string> {
  try {
    const cookies: Record<string, string> = {};
    const cookieStrings = document.cookie.split(';');
    
    for (const cookieString of cookieStrings) {
      const [name, value] = cookieString.trim().split('=');
      if (name && value) {
        cookies[decodeURIComponent(name)] = decodeURIComponent(value);
      }
    }
    
    return cookies;
  } catch (error) {
    console.warn('Failed to get all cookies:', error);
    return {};
  }
}

