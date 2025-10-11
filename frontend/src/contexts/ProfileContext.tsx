import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ProfileData, api } from '../services/api';
import { getAvatarUrl } from '../utils/avatar';
import { useAuth } from './AuthContext';

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
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshProfile = async () => {
    if (!isAuthenticated || !user) {
      console.log('ProfileContext: No user, clearing profile');
      setProfile(null);
      return;
    }

    try {
      console.log('ProfileContext: Refreshing profile...');
      setIsLoading(true);
      
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
      
      // Handle different error types
      if (error.message?.includes('Session expired') || error.message?.includes('401')) {
        console.log('ProfileContext: Session expired, clearing profile');
        setProfile(null);
      } else if (error.message?.includes('timeout') || error.message?.includes('Request timeout')) {
        console.warn('ProfileContext: Request timeout, keeping existing profile');
        // Keep existing profile data
      } else if (error.message?.includes('No active session') || error.message?.includes('No access token')) {
        console.log('ProfileContext: No valid session, clearing profile');
        setProfile(null);
      } else {
        console.log('ProfileContext: Other error, clearing profile');
        setProfile(null);
      }
    } finally {
      setIsLoading(false);
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
  };

  // Refresh profile when authentication state changes
  useEffect(() => {
    if (isAuthenticated && user) {
      // Only refresh if we don't have profile data yet
      if (!profile) {
        refreshProfile();
      }
    } else {
      clearProfile();
    }
  }, [isAuthenticated]); // Remove user dependency to prevent unnecessary refreshes

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