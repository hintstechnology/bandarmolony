import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';

export function useNavigation() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();

  // Handle authentication-based navigation
  useEffect(() => {
    // Don't navigate while loading
    if (authLoading || profileLoading) {
      return;
    }

    // If not authenticated, redirect to auth
    if (!isAuthenticated) {
      console.log('Navigation: Not authenticated, redirecting to auth');
      navigate('/auth', { replace: true });
      return;
    }

    // If authenticated but no profile, redirect to auth (profile creation failed)
    if (isAuthenticated && !profile) {
      console.log('Navigation: Authenticated but no profile, redirecting to auth');
      navigate('/auth', { replace: true });
      return;
    }
  }, [isAuthenticated, profile, authLoading, profileLoading, navigate]);

  // Prevent unnecessary re-renders by memoizing the return value
  return React.useMemo(() => ({
    isAuthenticated,
    profile,
    isLoading: authLoading || profileLoading,
  }), [isAuthenticated, profile, authLoading, profileLoading]);
}
