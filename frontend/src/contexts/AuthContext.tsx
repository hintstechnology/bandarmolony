import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: any | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let sessionCheckInterval: NodeJS.Timeout;

    // Periodic session validation for multi-device sync
    const startSessionValidation = () => {
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
      }
      
      sessionCheckInterval = setInterval(async () => {
        if (!isMounted || !user) return;
        
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error || !session) {
            if (isMounted) {
              setUser(null);
              setIsLoading(false);
            }
          } else {
            // Update user if session is valid but user state is stale
            if (isMounted && (!user || user.id !== session.user.id)) {
              setUser(session.user);
              setIsLoading(false);
            }
          }
        } catch (error) {
          console.error('AuthContext: Session validation error:', error);
          if (isMounted) {
            setUser(null);
            setIsLoading(false);
          }
        }
      }, 60000); // Check every 60 seconds (reduced frequency)
    };

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      
      
      if (event === 'SIGNED_IN') {
        // Check if we have valid Supabase session in storage
        // Look for Supabase auth token keys specifically
        const allLocalStorageKeys = Object.keys(localStorage);
        const hasSupabaseAuthToken = allLocalStorageKeys.some(key => 
          // Check for Supabase auth token keys (not just any supabase key)
          key.startsWith('sb-') && key.includes('auth-token')
        );
        
        // Only set user if we have valid auth token in storage
        // This prevents stale memory sessions from being used after logout
        if (hasSupabaseAuthToken && session?.user) {
          setUser(session.user);
          setIsLoading(false);
        } else {
          setUser(null);
          setIsLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLoading(false);
        // CRITICAL: Reset isLoggingOut when signed out (for session expired cases)
        setIsLoggingOut(false);
      } else if (event === 'TOKEN_REFRESHED') {
        // Always update user on token refresh to prevent stale state
        setUser(session?.user || null);
        setIsLoading(false);
      } else if (event === 'USER_UPDATED') {
        // Handle user updates (e.g., email change, profile update)
        setUser(session?.user || null);
        setIsLoading(false);
      } else if (event === 'INITIAL_SESSION') {
        // Handle initial session - set user immediately, ProfileContext will validate
        if (session?.user) {
          setUser(session.user);
          setIsLoading(false);
        } else {
          setUser(null);
          setIsLoading(false);
        }
      }
    });

    // Start periodic session validation
    startSessionValidation();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
      }
    };
  }, []);

  const signOut = async () => {
    try {
      // Set logging out flag first
      setIsLoggingOut(true);
      
      // Clear user state immediately for better UX
      setUser(null);
      setIsLoading(false);
      
      // Use API logout for session-specific logout
      const { api } = await import('../services/api');
      await api.logout();
      
      // CRITICAL: Keep isLoggingOut true for a moment to:
      // 1. Prevent premature redirect (App.tsx checks isLoading which includes isLoggingOut)
      // 2. Allow logout success toast to render and be visible
      // 3. Give user feedback before redirect
      // Sidebar.handleLogout() will navigate after 1 second
      
      // Reset isLoggingOut after 1.5 seconds as safety (in case no event triggers it)
      setTimeout(() => {
        setIsLoggingOut(false);
      }, 1500);
      
    } catch (error) {
      console.error('AuthContext: Error signing out:', error);
      // Fallback to direct Supabase logout
      // IMPORTANT: Supabase signOut() returns { error } instead of throwing
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error('AuthContext: Fallback logout failed:', signOutError);
      }
      // On error, reset immediately
      setIsLoggingOut(false);
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isLoggingOut,
    isAuthenticated: !!user,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
