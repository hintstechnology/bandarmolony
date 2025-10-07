import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ProfileData, api } from '../services/api';
import { supabase } from '../lib/supabase';
import { getAvatarUrl } from '../utils/avatar';
import { useTabFocus } from '../hooks/useTabFocus';

interface ProfileContextType {
  profile: ProfileData | null;
  isLoading: boolean;
  updateProfile: (updates: Partial<ProfileData>) => void;
  refreshProfile: () => Promise<void>;
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
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  const refreshProfile = async (showLoading = false) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      
      console.log('🔄 ProfileContext: Refreshing profile...');
      const response = await api.getProfile();
      
      if (response) {
        setProfile(response);
        setLastFetchTime(Date.now());
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error('❌ ProfileContext: Error refreshing profile:', error);
      setProfile(null);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
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
        name: updates.full_name || profile.full_name || profile.name,
        avatar: avatarUrl || undefined,
        avatarUrl: avatarUrlField || undefined,
      });
    }
  };

  const clearProfile = () => {
    setProfile(null);
    setIsLoading(false);
    setLastFetchTime(0);
  };

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Only refresh if we don't have profile data yet
        if (!profile) {
          refreshProfile(true);
        }
      } else if (event === 'SIGNED_OUT') {
        clearProfile();
      }
    });

    // Check if user is already signed in (page refresh)
    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Only show loading on initial page load if no profile data
          if (!profile) {
            refreshProfile(true);
          } else {
            setIsLoading(false);
          }
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        setIsLoading(false);
      }
    };

    checkInitialSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [profile]); // Add profile as dependency to prevent unnecessary refreshes

  // Use tab focus hook to prevent unnecessary refreshes
  useTabFocus(() => {
    if (profile) {
      refreshProfile(false); // Silent refresh
    }
  }, 5 * 60 * 1000, lastFetchTime); // 5 minutes stale time

  const value: ProfileContextType = {
    profile,
    isLoading,
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