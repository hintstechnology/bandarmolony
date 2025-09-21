// Authentication utility functions
export interface AuthState {
  isAuthenticated: boolean;
  user: any | null;
  session: any | null;
}

export function getAuthState(): AuthState {
  try {
    // Check user data first
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      if (user.isAuthenticated) {
        return {
          isAuthenticated: true,
          user: user,
          session: null
        };
      }
    }

    // Check session data
    const sessionData = localStorage.getItem('supabase_session');
    if (sessionData) {
      const session = JSON.parse(sessionData);
      if (session.access_token) {
        return {
          isAuthenticated: true,
          user: null,
          session: session
        };
      }
    }

    return {
      isAuthenticated: false,
      user: null,
      session: null
    };
  } catch (error) {
    console.error('Error getting auth state:', error);
    // Clear corrupted data
    localStorage.removeItem('user');
    localStorage.removeItem('supabase_session');
    return {
      isAuthenticated: false,
      user: null,
      session: null
    };
  }
}

export function clearAuthState(): void {
  localStorage.removeItem('user');
  localStorage.removeItem('supabase_session');
}

export function setAuthState(user: any, session?: any): void {
  try {
    if (user) {
      localStorage.setItem('user', JSON.stringify({
        id: user.id,
        name: user.user_metadata?.full_name || user.name || 'User',
        email: user.email,
        avatar: null,
        isAuthenticated: true
      }));
    }

    if (session) {
      localStorage.setItem('supabase_session', JSON.stringify(session));
    }
  } catch (error) {
    console.error('Error setting auth state:', error);
  }
}
