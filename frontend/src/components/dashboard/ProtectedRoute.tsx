import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session?.user);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isAuthenticated === null) {
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
