import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { ProfileData, api } from '../services/api';
import { getAvatarUrl } from '../utils/avatar';
import { useAuth } from './AuthContext';
import { clearAuthState } from '../utils/auth';

interface ProfileContextType {
  profile: ProfileData | null;
  isLoading: boolean;
  isLoggingOut: boolean;
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
  const hasInitialized = useRef(false);

  const refreshProfile = async (force = false) => {
    // Skip profile refresh if we're in password reset flow
    const passwordResetSession = localStorage.getItem('passwordResetSession');
    if (passwordResetSession === 'true') {
      console.log('ProfileContext: Password reset session active, skipping profile refresh');
      return;
    }

    if (!isAuthenticated || !user) {
      console.log('ProfileContext: No user, clearing profile');
      setProfile(null);
      setIsLoading(false);
      setIsValidating(false);
      return;
    }

    // Skip if already loading or validating and not forced
    if ((isLoading || isValidating) && !force) {
      console.log('ProfileContext: Already loading or validating, skipping refresh');
      return;
    }

    try {
      console.log('ProfileContext: Refreshing profile...');
      setIsLoading(true);
      setIsValidating(true);
      
      const response = await api.getProfile();
      
      if (response) {
        setProfile(response);
        console.log('ProfileContext: Profile refreshed successfully');
      } else {
        console.log('ProfileContext: No profile data received');
        setProfile(null);
      }
    } catch (error: any) {
      console.error('ProfileContext: Error refreshing profile:', error);
      
      // Handle session expired or 401
      if (error.message?.includes('Session expired') || error.message?.includes('401')) {
        console.log('ProfileContext: Session expired/401 error caught in refreshProfile');
        
        // Check if this is a fresh email verification (user just signed up)
        const emailVerificationSuccess = localStorage.getItem('emailVerificationSuccess');
        if (emailVerificationSuccess === 'true') {
          console.log('ProfileContext: Fresh email verification detected. Profile should be created by backend.');
          console.log('ProfileContext: Will retry fetching profile with exponential backoff...');
          
          // DON'T remove flag yet - needed by 401 handlers to skip logout
          // Will be removed after retry completes (success or failure)
          
          // KEEP loading state TRUE while retrying
          // This prevents redirect loops
          setIsLoading(true);
          setIsValidating(true);
          
          // Helper function to retry with exponential backoff
          const retryProfileFetch = async (attempt: number = 1, maxAttempts: number = 4): Promise<void> => {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000); // 1s, 2s, 4s, 8s
            console.log(`ProfileContext: Retry attempt ${attempt}/${maxAttempts} after ${delay}ms...`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            
            try {
              const retryResponse = await api.getProfile();
              if (retryResponse) {
                console.log(`ProfileContext: Profile fetch successful on attempt ${attempt}!`);
                console.log('ProfileContext: Current auth state:', { isAuthenticated, userId: user?.id, userEmail: user?.email });
                
                // Remove email verification flag now that we succeeded
                localStorage.removeItem('emailVerificationSuccess');
                
                setProfile(retryResponse);
                hasInitialized.current = true;
                setIsLoading(false);
                setIsValidating(false);
                
                // Set flag to show welcome toast in Dashboard after auto-login
                localStorage.setItem('showEmailVerificationSuccessToast', 'true');
                
                console.log('ProfileContext: ✅ Profile set successfully:', {
                  profileEmail: retryResponse.email,
                  profileId: retryResponse.id
                });
                console.log('ProfileContext: Email verification complete, user auto-logged in to dashboard');
                
                return;
              }
            } catch (retryError: any) {
              console.warn(`ProfileContext: Attempt ${attempt} failed:`, retryError.message);
            }
            
            // If not last attempt, retry
            if (attempt < maxAttempts) {
              return retryProfileFetch(attempt + 1, maxAttempts);
            } else {
            // All retries failed
            console.error('ProfileContext: All profile fetch retries failed. User needs to login again.');
            setIsLoading(false);
            setIsValidating(false);
            
            // Clear storage using helper (following LOGIN_LOGOUT_TROUBLESHOOTING.md)
            console.log('ProfileContext: Clearing all auth-related storage...');
            clearAuthState();
            
            // Set flag for AuthPage to show error toast (AFTER clearing everything)
            localStorage.setItem('emailVerificationError', 'true');
            
            setProfile(null);
            hasInitialized.current = false;
            
            // DON'T call signOut() - force reload instead (doc line 624-633)
            // This prevents Supabase from re-creating session from memory cache
            console.log('ProfileContext: Forcing page reload to ensure clean state...');
            setTimeout(() => {
              window.location.replace('/auth?mode=login');
            }, 100);
            }
          };
          
          // Start retry process
          retryProfileFetch();
          
          return;
        }
        
        // If we don't have profile yet, it means global-401 handler skipped it
        // So we need to handle logout here
        if (!profile) {
          console.log('ProfileContext: No profile, handling logout in refreshProfile (global handler skipped)');
          
          setProfile(null);
          hasInitialized.current = false;
          setIsLoggingOut(true);
          
          // Check if this is a kicked scenario (user was authenticated but session invalid)
          const isKickedScenario = isAuthenticated && user;
          
          // Clear storage using helper (following LOGIN_LOGOUT_TROUBLESHOOTING.md line 552-565)
          try {
            console.log('ProfileContext: Clearing all auth storage using helper');
            clearAuthState();
            
            // Set kicked flag AFTER clearing if this is a kicked scenario
            // Skip this if email verification (will be handled by retry logic)
            const isEmailVerificationFlow = localStorage.getItem('emailVerificationSuccess') === 'true';
            if (isKickedScenario && !isEmailVerificationFlow) {
              console.log('ProfileContext: Setting kicked flag (authenticated but 401)');
              localStorage.setItem('kickedByOtherDevice', 'true');
              
              // DON'T call signOut() - force reload instead (doc line 624-633)
              console.log('ProfileContext: Forcing page reload to ensure clean logout');
              setTimeout(() => {
                window.location.replace('/auth?mode=login');
              }, 100);
            } else if (isEmailVerificationFlow) {
              console.log('ProfileContext: Email verification flow - skipping logout, will retry');
              // Don't proceed with logout/reload for email verification
              setProfile(null);
              hasInitialized.current = false;
              setIsLoggingOut(false);
              return; // Let retry logic handle it
            }
            
            console.log('ProfileContext: Storage cleared in refreshProfile');
          } catch (cleanupError) {
            console.error('ProfileContext: Error during storage cleanup:', cleanupError);
          }
        } else {
          // If we have profile, global handler already took care of it
          console.log('ProfileContext: Profile exists, global handler already handled logout');
          setProfile(null);
          hasInitialized.current = false;
        }
        
        return; // Exit early
      } else if (error.message?.includes('timeout') || error.message?.includes('Request timeout')) {
        console.warn('ProfileContext: Request timeout, keeping existing profile');
        // Keep existing profile data
      } else if (error.message?.includes('No active session') || error.message?.includes('No access token')) {
        console.log('ProfileContext: No valid session, clearing profile');
        
        // DON'T set kicked flag here - this is just "no session", not kicked
        
        setProfile(null);
        hasInitialized.current = false;
        setIsLoggingOut(true);
        
        // Clear storage using helper and force reload
        // Following LOGIN_LOGOUT_TROUBLESHOOTING.md (doc line 552-565, 624-633)
        try {
          // Keep the kickedByOtherDevice flag if exists
          const kickedFlag = localStorage.getItem('kickedByOtherDevice');
          
          console.log('ProfileContext: Clearing all auth storage using helper');
          clearAuthState();
          
          // Restore the kicked flag if it existed
          if (kickedFlag) {
            localStorage.setItem('kickedByOtherDevice', kickedFlag);
          }
          
          // Clear profile and reset flags immediately
          setProfile(null);
          setIsLoggingOut(false);
          setIsLoading(false);
          setIsValidating(false);
          
          console.log('ProfileContext: Storage cleared, performing hard reload to /auth');
        } catch (cleanupError) {
          console.error('ProfileContext: Error during storage cleanup:', cleanupError);
        }
        
        // DON'T call signOut() - force reload instead (doc line 624-633)
        // Use window.location.replace to prevent back button issues
        // and setTimeout to ensure storage flush
        setTimeout(() => {
          window.location.replace('/auth?mode=login');
        }, 100);
        
        // Return early to prevent further execution
        return;
      } else if (error.message?.includes('Cannot connect to server') || 
                 error.message?.includes('ERR_CONNECTION_REFUSED') ||
                 error.message?.includes('Network')) {
        console.warn('ProfileContext: Connection error, keeping existing profile');
        // DON'T clear profile on connection errors (e.g., server restart)
        // Keep existing profile data
      } else {
        console.log('ProfileContext: Other error, clearing profile');
        setProfile(null);
      }
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
  };

  // Listen for global 401 events from ANY API call
  useEffect(() => {
    const handle401 = () => {
      console.log('🚨 ProfileContext: Received global-401 event');
      
      // Skip if we're already logging out
      if (isLoggingOut) {
        console.log('ProfileContext: Already logging out, skipping global-401 handler');
        return;
      }
      
      // Skip if we don't have a profile yet (might be initial load with stale session)
      if (!profile) {
        console.log('ProfileContext: No profile yet, skipping global-401 handler (might be initial load)');
        return;
      }
      
      // Only handle if user is authenticated AND has profile
      if (isAuthenticated && user && profile) {
        console.log('ProfileContext: Session rejected by backend, likely kicked by another device');
        
        setProfile(null);
        hasInitialized.current = false;
        setIsLoggingOut(true);
        
        // Clear storage using helper (following LOGIN_LOGOUT_TROUBLESHOOTING.md line 552-565)
        console.log('ProfileContext: Clearing all auth storage using helper (global handler)');
        try {
          clearAuthState();
          
          // Set the kicked flag AFTER clearing (so it persists)
          // BUT NOT if this is email verification flow (will be handled by retry)
          const isEmailVerificationFlow = localStorage.getItem('emailVerificationSuccess') === 'true';
          if (!isEmailVerificationFlow) {
            localStorage.setItem('kickedByOtherDevice', 'true');
            console.log('ProfileContext: Storage cleared, kicked flag set');
          } else {
            console.log('ProfileContext: Email verification flow - skipping logout, will retry');
            // Don't proceed with reload for email verification
            setIsLoggingOut(false);
            return; // Let retry logic handle it
          }
        } catch (cleanupError) {
          console.error('ProfileContext: Error during storage cleanup:', cleanupError);
        }
        
        // DON'T call signOut() - force reload instead (doc line 624-633)
        // This prevents Supabase from re-creating session from memory cache
        console.log('ProfileContext: Forcing page reload to ensure clean logout (global handler)');
        
        // Wait a tiny bit for storage to flush
        setTimeout(() => {
          window.location.replace('/auth?mode=login');
        }, 100);
      }
    };
    
    window.addEventListener('global-401', handle401);
    
    return () => {
      window.removeEventListener('global-401', handle401);
    };
  }, [isAuthenticated, user, profile, isLoggingOut]);

  // Refresh profile when authentication state changes
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isAuthenticated && user) {
      // Skip profile refresh if we're in password reset flow
      const passwordResetSession = localStorage.getItem('passwordResetSession');
      if (passwordResetSession === 'true') {
        console.log('ProfileContext: Password reset session active, skipping profile refresh in useEffect');
        return;
      }
      
      // Only refresh if we don't have profile data yet and not currently loading or validating
      if (!profile && !isLoading && !isValidating && !hasInitialized.current) {
        console.log('ProfileContext: No profile, fetching...');
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
    } else {
      // Clear profile immediately when not authenticated
      console.log('ProfileContext: Not authenticated, clearing profile');
      hasInitialized.current = false;
      // Don't reset isLoggingOut here - let AuthContext handle it on SIGNED_OUT
      clearProfile();
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