import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: any | null;
  isLoading: boolean;
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

  useEffect(() => {
    let isMounted = true;
    let sessionCheckInterval: NodeJS.Timeout;

    // Check initial session
    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          setUser(session?.user || null);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('AuthContext: Error checking initial session:', error);
        if (isMounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    // Periodic session validation for multi-device sync
    const startSessionValidation = () => {
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
      }
      
      sessionCheckInterval = setInterval(async () => {
        if (!isMounted) return;
        
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error || !session) {
            console.log('AuthContext: Session validation failed, signing out');
            if (isMounted) {
              setUser(null);
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
      }, 30000); // Check every 30 seconds
    };

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      
      console.log('AuthContext: Auth state change:', event, !!session?.user);
      
      if (event === 'SIGNED_IN') {
        setUser(session?.user || null);
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLoading(false);
      } else if (event === 'TOKEN_REFRESHED') {
        // Always update user on token refresh to prevent stale state
        setUser(session?.user || null);
        setIsLoading(false);
      } else if (event === 'USER_UPDATED') {
        // Handle user updates (e.g., email change, profile update)
        setUser(session?.user || null);
        setIsLoading(false);
      }
    });

    // Check initial session
    checkInitialSession();
    
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
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('AuthContext: Error signing out:', error);
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
