import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { ProfileData, api } from '../services/api';
import { getAvatarUrl } from '../utils/avatar';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

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

    // Check if user is still authenticated before making API call
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.log('ProfileContext: No valid session, clearing profile');
        setProfile(null);
        setIsLoading(false);
        setIsValidating(false);
        return;
      }
    } catch (error) {
      console.log('ProfileContext: Session check failed, clearing profile');
      setProfile(null);
      setIsLoading(false);
      setIsValidating(false);
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
      
      // Handle session expired - clear profile AND sign out from Supabase
      if (error.message?.includes('Session expired') || error.message?.includes('401')) {
        console.log('ProfileContext: Session expired, clearing profile and signing out');
        
        // Set flag to show toast on next page load (kicked by another device)
        localStorage.setItem('kickedByOtherDevice', 'true');
        
        setProfile(null);
        hasInitialized.current = false;
        setIsLoggingOut(true); // Set logging out flag - will be cleared by AuthContext SIGNED_OUT event
        
        // Sign out from Supabase to trigger auth state change
        // IMPORTANT: Supabase signOut() returns { error } instead of throwing
        const { error: signOutError } = await supabase.auth.signOut();
        
        if (signOutError) {
          console.error('ProfileContext: Supabase signOut failed (expected for expired sessions):', signOutError);
          // If signOut fails (403 Forbidden), force clear everything
          // This happens when server restarts and session is already invalid
          
          console.log('ProfileContext: Forcing complete logout - clearing all storage');
          
          // Force clear ALL storage keys related to auth
          try {
            // Keep the kickedByOtherDevice flag
            const kickedFlag = localStorage.getItem('kickedByOtherDevice');
            
            // Clear ALL localStorage
            const localKeys = Object.keys(localStorage);
            localKeys.forEach(key => {
              if (key.includes('supabase') || key.includes('auth') || key.includes('sb-') || key === 'user') {
                console.log('ProfileContext: Removing localStorage key:', key);
                localStorage.removeItem(key);
              }
            });
            
            // Restore the kicked flag
            if (kickedFlag) {
              localStorage.setItem('kickedByOtherDevice', kickedFlag);
            }
            
            // Clear ALL sessionStorage
            const sessionKeys = Object.keys(sessionStorage);
            sessionKeys.forEach(key => {
              if (key.includes('supabase') || key.includes('auth') || key.includes('sb-')) {
                console.log('ProfileContext: Removing sessionStorage key:', key);
                sessionStorage.removeItem(key);
              }
            });
            
            // Clear profile and reset flags immediately
            setProfile(null);
            setIsLoggingOut(false);
            setIsLoading(false);
            setIsValidating(false);
            
            console.log('ProfileContext: Storage cleared, performing hard reload to /auth');
          } catch (cleanupError) {
            console.error('ProfileContext: Error during storage cleanup:', cleanupError);
          }
          
          // Use window.location.replace to prevent back button issues
          // and setTimeout to ensure storage flush
          setTimeout(() => {
            window.location.replace('/auth');
          }, 100);
          
          // Return early to prevent further execution
          return;
        }
        // If signOut successful, let AuthContext handle SIGNED_OUT event
      } else if (error.message?.includes('timeout') || error.message?.includes('Request timeout')) {
        console.warn('ProfileContext: Request timeout, keeping existing profile');
        // Keep existing profile data
      } else if (error.message?.includes('No active session') || error.message?.includes('No access token')) {
        console.log('ProfileContext: No valid session, clearing profile and signing out');
        
        // Set flag to show toast on next page load (kicked by another device)
        localStorage.setItem('kickedByOtherDevice', 'true');
        
        setProfile(null);
        hasInitialized.current = false;
        setIsLoggingOut(true); // Set logging out flag - will be cleared by AuthContext SIGNED_OUT event
        
        // Sign out from Supabase to trigger auth state change
        // IMPORTANT: Supabase signOut() returns { error } instead of throwing
        const { error: signOutError } = await supabase.auth.signOut();
        
        if (signOutError) {
          console.error('ProfileContext: Supabase signOut failed (expected for expired sessions):', signOutError);
          // If signOut fails (403 Forbidden), force clear everything
          // This happens when server restarts and session is already invalid
          
          console.log('ProfileContext: Forcing complete logout - clearing all storage');
          
          // Force clear ALL storage keys related to auth
          try {
            // Keep the kickedByOtherDevice flag
            const kickedFlag = localStorage.getItem('kickedByOtherDevice');
            
            // Clear ALL localStorage
            const localKeys = Object.keys(localStorage);
            localKeys.forEach(key => {
              if (key.includes('supabase') || key.includes('auth') || key.includes('sb-') || key === 'user') {
                console.log('ProfileContext: Removing localStorage key:', key);
                localStorage.removeItem(key);
              }
            });
            
            // Restore the kicked flag
            if (kickedFlag) {
              localStorage.setItem('kickedByOtherDevice', kickedFlag);
            }
            
            // Clear ALL sessionStorage
            const sessionKeys = Object.keys(sessionStorage);
            sessionKeys.forEach(key => {
              if (key.includes('supabase') || key.includes('auth') || key.includes('sb-')) {
                console.log('ProfileContext: Removing sessionStorage key:', key);
                sessionStorage.removeItem(key);
              }
            });
            
            // Clear profile and reset flags immediately
            setProfile(null);
            setIsLoggingOut(false);
            setIsLoading(false);
            setIsValidating(false);
            
            console.log('ProfileContext: Storage cleared, performing hard reload to /auth');
          } catch (cleanupError) {
            console.error('ProfileContext: Error during storage cleanup:', cleanupError);
          }
          
          // Use window.location.replace to prevent back button issues
          // and setTimeout to ensure storage flush
          setTimeout(() => {
            window.location.replace('/auth');
          }, 100);
          
          // Return early to prevent further execution
          return;
        }
        // If signOut successful, let AuthContext handle SIGNED_OUT event
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