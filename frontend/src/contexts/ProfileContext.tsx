import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { ProfileData, api } from '../services/api';
import { getAvatarUrl } from '../utils/avatar';
import { useAuth } from './AuthContext';
import { clearAuthState } from '../utils/auth';
import { toast } from 'sonner';

interface ProfileContextType {
  profile: ProfileData | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  hasConnectionError: boolean;
  updateProfile: (updates: Partial<ProfileData>) => void;
  refreshProfile: (force?: boolean) => Promise<void>;
  clearProfile: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}

interface ProfileProviderProps {
  children: ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const hasInitialized = useRef(false);
  const isRedirecting = useRef(false); // Prevent multiple redirects

  const refreshProfile = async (force = false) => {
    // Skip profile refresh if we're in password reset flow
    const passwordResetSession = localStorage.getItem('passwordResetSession');
    if (passwordResetSession === 'true') {
      return;
    }

    if (!isAuthenticated || !user) {
      setProfile(null);
      setIsLoading(false);
      setIsValidating(false);
      return;
    }

    // Skip if already loading or validating and not forced
    if ((isLoading || isValidating) && !force) {
      return;
    }

    try {
      setIsLoading(true);
      setIsValidating(true);
      
      const response = await api.getProfile();
      
      if (response) {
        setProfile(response);
        setHasConnectionError(false); // Clear connection error on success
      } else {
        setProfile(null);
      }
    } catch (error: any) {
      console.error('ProfileContext: Error refreshing profile:', error);

      const message: string = (error?.message || '').toLowerCase();
      const isAuthError =
        message.includes('401') ||
        message.includes('session expired') ||
        message.includes('session not found') ||
        message.includes('no active session') ||
        message.includes('no access token') ||
        message.includes('invalid or expired token') || // Supabase auth error
        message.includes('invalid token');

      const isConnectionError =
        message.includes('Cannot connect to server') ||
        message.includes('ERR_CONNECTION_REFUSED') ||
        message.includes('Network') ||
        message.includes('timeout') ||
        message.includes('Request timeout');

      if (isAuthError) {
        // ✅ SIMPLE, CLEAN LOGOUT FOR ALL AUTH ERRORS (SESSION NOT FOUND, EXPIRED, ETC)
        
        // Prevent multiple redirects
        if (isRedirecting.current) {
          console.log('ProfileContext: Already redirecting, skipping duplicate redirect');
          return;
        }
        
        // Check if already at /auth to prevent redirect
        const currentPath = window.location.pathname;
        if (currentPath.includes('/auth')) {
          console.log('ProfileContext: Already at auth page, skipping redirect');
          return;
        }
        
        try {
          console.log('ProfileContext: Auth error detected, clearing all auth storage and forcing logout');
          
          // Set redirecting flag immediately
          isRedirecting.current = true;
          
          // Show toast message immediately (before any async operations)
          // Use setTimeout to ensure Toaster component is ready
          setTimeout(() => {
            toast.warning('Sesi Anda telah habis', {
              description: 'Silakan login kembali untuk melanjutkan.',
              duration: 5000,
              className: 'bg-yellow-500 text-white border-yellow-600',
              style: {
                background: '#eab308',
                color: '#ffffff',
                borderColor: '#ca8a04',
              },
            });
          }, 100);
          
          // Set flag for AuthPage to show toast (backup, ONLY if toast doesn't show)
          // But clear it immediately to prevent duplicate
          localStorage.setItem('kickedByOtherDevice', 'true');
          // Clear flag after a short delay to prevent duplicate toast in AuthPage
          setTimeout(() => {
            localStorage.removeItem('kickedByOtherDevice');
          }, 500);
          
          // Clear state first
          clearAuthState();
          setProfile(null);
          hasInitialized.current = false;
          setIsLoggingOut(false);
          setIsLoading(false);
          setIsValidating(false);

          // Hard redirect to auth page – NO retry, NO loop
          // Use replace to prevent multiple redirects and back button issues
          // Delay to ensure toast is visible (increased to 2000ms)
          setTimeout(() => {
            // Double-check we're not already redirecting or at /auth
            if (!isRedirecting.current) {
              console.log('ProfileContext: Redirect flag cleared, skipping redirect');
              return;
            }
            const checkPath = window.location.pathname;
            if (checkPath.includes('/auth')) {
              console.log('ProfileContext: Already at auth page before redirect, skipping');
              isRedirecting.current = false;
              setIsLoggingOut(false);
              return;
            }
            console.log('ProfileContext: Executing redirect to /auth');
            // Reset flags before redirect to ensure clean state
            isRedirecting.current = false;
            setIsLoggingOut(false);
            window.location.replace('/auth?mode=login');
          }, 2000);
        } catch (cleanupError) {
          console.error('ProfileContext: Error during storage cleanup:', cleanupError);
          
          // Only proceed if not already redirecting
          if (!isRedirecting.current) {
            // Set redirecting flag
            isRedirecting.current = true;
            
            // Show toast even on error
            setTimeout(() => {
              toast.warning('Sesi Anda telah habis', {
                description: 'Silakan login kembali untuk melanjutkan.',
                duration: 5000,
                className: 'bg-yellow-500 text-white border-yellow-600',
                style: {
                  background: '#eab308',
                  color: '#ffffff',
                  borderColor: '#ca8a04',
                },
              });
            }, 100);
            
            // Set flag for AuthPage (backup), but clear it to prevent duplicate
            localStorage.setItem('kickedByOtherDevice', 'true');
            setTimeout(() => {
              localStorage.removeItem('kickedByOtherDevice');
            }, 500);
            
            // Fallback: redirect even if cleanup fails (use replace to prevent multiple redirects)
            setTimeout(() => {
              if (!isRedirecting.current) {
                return;
              }
              const checkPath = window.location.pathname;
              if (checkPath.includes('/auth')) {
                isRedirecting.current = false;
                return;
              }
              window.location.replace('/auth?mode=login');
            }, 2000);
          }
        }
        return;
      }

      if (isConnectionError) {
        console.warn('ProfileContext: Connection/timeout error, keeping existing profile');
        setHasConnectionError(true);
        // Keep existing profile on connection issues
        return;
      }

      // Fallback: unknown error → clear profile but don't redirect
      console.error('ProfileContext: Unexpected error, clearing profile without redirect');
      setProfile(null);
      hasInitialized.current = false;
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  };

  const updateProfile = (updates: Partial<ProfileData>) => {
    if (profile) {
      const newAvatarUrl = updates.avatar_url || profile.avatar_url;
      const avatarUrl = newAvatarUrl ? getAvatarUrl(newAvatarUrl) : profile.avatar;
      const avatarUrlField = newAvatarUrl ? getAvatarUrl(newAvatarUrl) : profile.avatarUrl;
      
      setProfile({
        ...profile,
        ...updates,
        // Update legacy fields for backward compatibility
        name: updates.full_name || profile.full_name || profile.name || '',
        ...(avatarUrl && { avatar: avatarUrl }),
        ...(avatarUrlField && { avatarUrl: avatarUrlField }),
      });
    }
  };

  const clearProfile = () => {
    setProfile(null);
    setIsLoading(false);
    setIsValidating(false);
    setHasConnectionError(false);
  };

  // Listen for global 401 events from ANY API call
  useEffect(() => {
    const handle401 = async () => {
      
      // Skip if we're already logging out (prevent duplicate handling)
      if (isLoggingOut) {
        console.log('ProfileContext: global-401 skipped - already logging out');
        return;
      }
      
      // Skip if we don't have a profile yet (might be initial load with stale session)
      // This means refreshProfile() error handler will take care of it
      if (!profile) {
        console.log('ProfileContext: global-401 skipped - no profile (refreshProfile will handle)');
        return;
      }
      
      // Only handle if user is authenticated AND has profile
      if (isAuthenticated && user && profile) {
        // Prevent multiple redirects
        if (isRedirecting.current) {
          console.log('ProfileContext: global-401 already redirecting, skipping');
          return;
        }
        
        // Check if already at /auth
        const currentPath = window.location.pathname;
        if (currentPath.includes('/auth')) {
          console.log('ProfileContext: global-401 already at auth page, skipping redirect');
          return;
        }
        
        console.log('ProfileContext: global-401 handler executing (user had active profile)');
        
        // Set redirecting flag immediately
        isRedirecting.current = true;
        
        setProfile(null);
        hasInitialized.current = false;
        setIsLoggingOut(true);
        
        // Clear storage using helper (following LOGIN_LOGOUT_TROUBLESHOOTING.md line 552-565)
        console.log('ProfileContext: Clearing all auth storage using helper (global handler)');
        try {
          // Show toast message immediately (before any async operations)
          // Use setTimeout to ensure Toaster component is ready
          setTimeout(() => {
            toast.warning('Sesi Anda telah habis', {
              description: 'Silakan login kembali untuk melanjutkan.',
              duration: 5000,
              className: 'bg-yellow-500 text-white border-yellow-600',
              style: {
                background: '#eab308',
                color: '#ffffff',
                borderColor: '#ca8a04',
              },
            });
          }, 100);
          
          const isEmailVerificationFlow = localStorage.getItem('emailVerificationSuccess') === 'true';
          if (isEmailVerificationFlow) {
            console.log('ProfileContext: Email verification flow - skipping logout, will retry');
            // Don't proceed with reload for email verification
            setIsLoggingOut(false);
            isRedirecting.current = false; // Reset flag
            return; // Let retry logic handle it
          }
          
          // Set flag for AuthPage (backup), but clear it to prevent duplicate
          localStorage.setItem('kickedByOtherDevice', 'true');
          setTimeout(() => {
            localStorage.removeItem('kickedByOtherDevice');
          }, 500);
          console.log('ProfileContext: Session invalid (global handler), setting expiry flag');
          
          // Clear state and redirect (no requestAnimationFrame to prevent multiple redirects)
          clearAuthState();
          
          // PAKSA LOGOUT dengan Supabase signOut
          console.log('ProfileContext: Global-401, forcing logout');
          
          // CRITICAL: DON'T set isLoading/isLoggingOut to false before redirect!
          // Setting them to false triggers App.tsx useEffect → infinite loop!
          setProfile(null);
          hasInitialized.current = false;
          // KEEP isLoggingOut = true to prevent App.tsx redirect loop!
          
          // Force Supabase logout untuk clear session dari memory
          import('../lib/supabase').then(({ supabase }) => {
            supabase.auth.signOut().then(() => {
              // Reset flags after signOut completes
              setIsLoggingOut(false);
              
              // Force reload ke auth page (HARD RELOAD) - SINGLE redirect, no multiple
              // Use replace to prevent back button issues and multiple redirects
              // Delay to ensure toast is visible (increased to 2000ms)
              setTimeout(() => {
                // Double-check we're not already redirecting or at /auth
                if (!isRedirecting.current) {
                  console.log('ProfileContext: global-401 redirect flag cleared, skipping redirect');
                  return;
                }
                const checkPath = window.location.pathname;
                if (checkPath.includes('/auth')) {
                  console.log('ProfileContext: global-401 already at auth page before redirect, skipping');
                  isRedirecting.current = false;
                  setIsLoggingOut(false);
                  return;
                }
                console.log('ProfileContext: global-401 executing redirect to /auth');
                // Reset flags before redirect to ensure clean state
                isRedirecting.current = false;
                setIsLoggingOut(false);
                window.location.replace('/auth?mode=login');
              }, 2000);
            }).catch((error) => {
              console.error('ProfileContext: Supabase signOut error:', error);
              // Reset flags even on error
              isRedirecting.current = false;
              setIsLoggingOut(false);
              // Still redirect to auth page
              setTimeout(() => {
                window.location.replace('/auth?mode=login');
              }, 2000);
            });
          });
          
        } catch (cleanupError) {
          console.error('ProfileContext: Error during storage cleanup:', cleanupError);
          // Fallback: redirect even if cleanup fails (only if not already redirecting)
          if (isRedirecting.current) {
            setTimeout(() => {
              const checkPath = window.location.pathname;
              if (!checkPath.includes('/auth')) {
                window.location.replace('/auth?mode=login');
              } else {
                isRedirecting.current = false;
              }
            }, 2000);
          }
        }
      }
    };
    
    window.addEventListener('global-401', handle401);
    
    return () => {
      window.removeEventListener('global-401', handle401);
      // Reset redirect flag on unmount
      isRedirecting.current = false;
    };
  }, [isAuthenticated, user, profile, isLoggingOut]);

  // Refresh profile when authentication state changes
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    // CRITICAL: Reset all flags when not authenticated (after logout)
    if (!isAuthenticated || !user) {
      // Clear profile immediately when not authenticated
      hasInitialized.current = false;
      isRedirecting.current = false; // Reset redirect flag
      setIsLoggingOut(false); // Reset logging out flag
      clearProfile();
      return;
    }

    if (isAuthenticated && user) {
      // CRITICAL: Reset flags when authenticated (after successful login)
      // This ensures clean state for login after logout
      isRedirecting.current = false;
      setIsLoggingOut(false);
      
      // Skip profile refresh if we're in password reset flow
      const passwordResetSession = localStorage.getItem('passwordResetSession');
      if (passwordResetSession === 'true') {
        return;
      }
      
      // Only refresh if we don't have profile data yet and not currently loading or validating
      if (!profile && !isLoading && !isValidating && !hasInitialized.current) {
        hasInitialized.current = true;
        refreshProfile(true); // Force refresh
        
        // Set a timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          if ((isLoading || isValidating) && !profile) {
            console.warn('ProfileContext: Refresh timeout, clearing loading state');
            setIsLoading(false);
            setIsValidating(false);
          }
        }, 10000); // 10 second timeout
      }
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isAuthenticated, user?.id]); // Remove profile, isLoading, isValidating from dependencies

  const value: ProfileContextType = {
    profile,
    isLoading,
    isLoggingOut,
    hasConnectionError,
    updateProfile,
    refreshProfile,
    clearProfile,
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}