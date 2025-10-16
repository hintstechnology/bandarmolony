import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';

export function useNavigation() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();

  // Prevent unnecessary re-renders by memoizing the return value
  return React.useMemo(() => ({
    isAuthenticated,
    profile,
    isLoading: authLoading || profileLoading,
  }), [isAuthenticated, profile, authLoading, profileLoading]);
}
