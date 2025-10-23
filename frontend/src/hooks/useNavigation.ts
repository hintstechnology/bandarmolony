import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';

export function useNavigation() {
  const { isAuthenticated, isLoading: authLoading, isLoggingOut: authLoggingOut } = useAuth();
  const { profile, isLoading: profileLoading, isLoggingOut: profileLoggingOut } = useProfile();

  // Prevent unnecessary re-renders by memoizing the return value
  return React.useMemo(() => ({
    isAuthenticated,
    profile,
    isLoading: authLoading || profileLoading || authLoggingOut || profileLoggingOut,
  }), [isAuthenticated, profile, authLoading, profileLoading, authLoggingOut, profileLoggingOut]);
}
