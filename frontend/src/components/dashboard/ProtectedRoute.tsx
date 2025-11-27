import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save current location to redirect back after login
    const returnTo = location.pathname + location.search;
    // Jangan simpan tujuan jika hanya ingin ke dashboard default.
    // Biarkan login normal selalu jatuh ke /profile.
    if (
      returnTo !== '/auth' &&
      returnTo !== '/' &&
      returnTo !== '/dashboard' &&
      returnTo !== '/dashboard/'
    ) {
      sessionStorage.setItem('returnTo', returnTo);
    }
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
