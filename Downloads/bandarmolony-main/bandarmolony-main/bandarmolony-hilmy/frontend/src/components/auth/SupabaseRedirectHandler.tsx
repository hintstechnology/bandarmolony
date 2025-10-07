import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { EmailVerificationSuccess } from './EmailVerificationSuccess';
import { setAuthState } from '../../utils/auth';

export function SupabaseRedirectHandler() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<any>(null);
  const [isPasswordReset, setIsPasswordReset] = useState(false);

  useEffect(() => {
    const handleSupabaseRedirect = async () => {
      try {
        // Check if this is a password reset flow by looking at the type parameter
        const type = searchParams.get('type');
        const isPasswordReset = type === 'recovery';
        
        // If this is a password reset, process the session and redirect to reset-password page
        if (isPasswordReset) {
          // Wait for Supabase to process the URL parameters
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Let Supabase handle the auth state change automatically
          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) {
            setStatus('error');
            setMessage('Password reset link has expired or is invalid. Please try again.');
            return;
          }

          if (session?.user) {
            // Set a flag to indicate this is a valid password reset session
            localStorage.setItem('passwordResetSession', 'true');
            // Redirect to reset password page
            navigate('/auth/reset-password', { replace: true });
            return;
          } else {
            setStatus('error');
            setMessage('Password reset link is invalid or has expired. Please try again.');
            return;
          }
        }

        // Check for error parameters first
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        
        if (errorParam) {
          setStatus('error');
          setMessage(errorDescription || 'Authentication failed. Please try again.');
          return;
        }

        setIsPasswordReset(false);

        // Wait a bit for Supabase to process the URL
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Let Supabase handle the auth state change automatically
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          setStatus('error');
          setMessage('Verification link has expired or is invalid. Please try again.');
          return;
        }

        if (session?.user) {
          setUser(session.user);
          setStatus('success');
          
          setMessage('Email verified successfully! Welcome to BandarmoloNY!');
          // Save auth state to localStorage
          setAuthState(session.user, session);
          
          // Show success toast
          toast.success('🎉 Email verified successfully! Welcome to BandarmoloNY!', {
            duration: 4000,
            position: 'top-center'
          });
          
          // Redirect to dashboard after successful verification
          setTimeout(() => {
            navigate('/dashboard');
          }, 2000);
        } else {
          // No session found, try to handle URL parameters manually
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const queryParams = new URLSearchParams(window.location.search);
          
          const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
          const token = queryParams.get('token');
          
          if (accessToken && refreshToken) {
            // Try to set session manually
            const { data, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            
            if (sessionError) {
              setStatus('error');
              setMessage('Failed to verify email. Please try again.');
              return;
            }
            
            if (data.session?.user) {
              setUser(data.session.user);
              setStatus('success');
              
              setMessage('Email verified successfully! Welcome to BandarmoloNY!');
              // Save auth state to localStorage
              setAuthState(data.session.user, data.session);
              
              toast.success('🎉 Email verified successfully! Welcome to BandarmoloNY!', {
                duration: 4000,
                position: 'top-center'
              });
              
              // Redirect to dashboard after successful verification
              setTimeout(() => {
                navigate('/dashboard');
              }, 2000);
            } else {
              setStatus('error');
              setMessage('Email verification is still pending. Please check your email and click the verification link.');
            }
          } else {
            // No valid session or tokens found
            setStatus('error');
            setMessage('Verification link is invalid or has expired. Please try again.');
          }
        }

      } catch (error: any) {
        setStatus('error');
        setMessage('An error occurred during verification. Please try again.');
      }
    };

    handleSupabaseRedirect();
  }, [searchParams]);

  const handleLogin = () => {
    navigate('/auth?mode=login');
  };

  const handleBackToLogin = () => {
    navigate('/auth?mode=login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8">
        {status === 'loading' && (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Verifying Email...
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Please wait while we verify your email address.
            </p>
          </div>
        )}

        {status === 'success' && (
          <EmailVerificationSuccess onLogin={handleLogin} />
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Verification Failed
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {message}
            </p>
            <div className="mt-6">
              <button
                onClick={handleBackToLogin}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Back to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
