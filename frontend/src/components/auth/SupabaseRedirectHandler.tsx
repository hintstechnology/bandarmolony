import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { EmailVerificationSuccess } from './EmailVerificationSuccess';
import { setAuthState } from '../../utils/auth';

export function SupabaseRedirectHandler() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent duplicate execution
    if (hasProcessed.current) {
      return;
    }
    hasProcessed.current = true;
    
    const handleSupabaseRedirect = async () => {
      try {
        // Check if this is a password reset flow by looking at the type parameter
        // Type can be in search params or hash params
        const typeFromSearch = searchParams.get('type');
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const typeFromHash = hashParams.get('type');
        const type = typeFromHash || typeFromSearch;
        const isPasswordReset = type === 'recovery';
        
        console.log('SupabaseRedirectHandler: type from search:', typeFromSearch);
        console.log('SupabaseRedirectHandler: type from hash:', typeFromHash);
        console.log('SupabaseRedirectHandler: final type:', type);
        console.log('SupabaseRedirectHandler: isPasswordReset:', isPasswordReset);
        
        // If this is a password reset, process the session and redirect to reset-password page
        if (isPasswordReset) {
          console.log('Password reset flow detected');
          console.log('Full URL:', window.location.href);
          console.log('Search params:', window.location.search);
          console.log('Hash:', window.location.hash);
          
          // Get URL parameters - Supabase sends access_token and refresh_token after redirect
          const access_token = searchParams.get('access_token');
          const refresh_token = searchParams.get('refresh_token');
          const token = searchParams.get('token');
          
          // Hash parameters already parsed above
          const hashAccessToken = hashParams.get('access_token');
          const hashRefreshToken = hashParams.get('refresh_token');
          const hashToken = hashParams.get('token');
          
          console.log('Password reset params from search:', { access_token: !!access_token, refresh_token: !!refresh_token, token: !!token });
          console.log('Password reset params from hash:', { access_token: !!hashAccessToken, refresh_token: !!hashRefreshToken, token: !!hashToken });
          
          // Use hash parameters if available, otherwise use search parameters
          const finalAccessToken = hashAccessToken || access_token;
          const finalRefreshToken = hashRefreshToken || refresh_token;
          const finalToken = hashToken || token;
          
          console.log('Final tokens:', { access_token: !!finalAccessToken, refresh_token: !!finalRefreshToken, token: !!finalToken });
          
          // If we have access_token and refresh_token (from Supabase redirect)
          if (finalAccessToken && finalRefreshToken) {
            try {
              // Set a flag BEFORE setting session to prevent ProfileContext from refreshing
              console.log('Setting passwordResetSession flag BEFORE session setup');
              localStorage.setItem('passwordResetSession', 'true');
              
              console.log('Setting session with tokens for password reset');
              const { data, error } = await supabase.auth.setSession({
                access_token: finalAccessToken,
                refresh_token: finalRefreshToken
              });
              
              if (error) {
                console.error('Session set error:', error);
                // Clear flag if session setup failed
                localStorage.removeItem('passwordResetSession');
                setStatus('error');
                setMessage('Password reset link has expired or is invalid. Please try again.');
                // Redirect to login after showing error
                setTimeout(() => {
                  navigate('/auth?mode=login', { replace: true });
                }, 3000);
                return;
              }
              
              if (data.session?.user) {
                console.log('Session set successfully for password reset');
                // Wait a bit for session to be fully established
                await new Promise(resolve => setTimeout(resolve, 1000));
                // Redirect to reset password page
                navigate('/auth/reset-password', { replace: true });
                return;
              } else {
                console.error('No session after setting tokens');
                // Clear flag if no session
                localStorage.removeItem('passwordResetSession');
                setStatus('error');
                setMessage('Password reset link has expired or is invalid. Please try again.');
                // Redirect to login after showing error
                setTimeout(() => {
                  navigate('/auth?mode=login', { replace: true });
                }, 3000);
                return;
              }
            } catch (error) {
              console.error('Password reset processing error:', error);
              // Clear flag on error
              localStorage.removeItem('passwordResetSession');
              setStatus('error');
              setMessage('Password reset link has expired or is invalid. Please try again.');
              // Redirect to login after showing error
              setTimeout(() => {
                navigate('/auth?mode=login', { replace: true });
              }, 3000);
              return;
            }
          }
          // If we have token parameter (direct from email - should not happen with current flow)
          else if (finalToken) {
            try {
              // Set a flag BEFORE exchanging token to prevent ProfileContext from refreshing
              console.log('Setting passwordResetSession flag BEFORE token exchange');
              localStorage.setItem('passwordResetSession', 'true');
              
              console.log('Exchanging token for session');
              const { data, error } = await supabase.auth.exchangeCodeForSession(finalToken);
              
              if (error) {
                console.error('Token exchange error:', error);
                // Clear flag if token exchange failed
                localStorage.removeItem('passwordResetSession');
                setStatus('error');
                setMessage('Password reset link has expired or is invalid. Please try again.');
                // Redirect to login after showing error
                setTimeout(() => {
                  navigate('/auth?mode=login', { replace: true });
                }, 3000);
                return;
              }
              
              if (data.session?.user) {
                console.log('Token exchange successful for password reset');
                // Wait a bit for session to be fully established
                await new Promise(resolve => setTimeout(resolve, 1000));
                // Redirect to reset password page
                navigate('/auth/reset-password', { replace: true });
                return;
              } else {
                console.error('No session after token exchange');
                // Clear flag if no session
                localStorage.removeItem('passwordResetSession');
                setStatus('error');
                setMessage('Password reset link has expired or is invalid. Please try again.');
                // Redirect to login after showing error
                setTimeout(() => {
                  navigate('/auth?mode=login', { replace: true });
                }, 3000);
                return;
              }
            } catch (error) {
              console.error('Token exchange processing error:', error);
              // Clear flag on error
              localStorage.removeItem('passwordResetSession');
              setStatus('error');
              setMessage('Password reset link has expired or is invalid. Please try again.');
              // Redirect to login after showing error
              setTimeout(() => {
                navigate('/auth?mode=login', { replace: true });
              }, 3000);
              return;
            }
          } else {
            console.error('No access_token, refresh_token, or token found');
            // Clear flag if no tokens
            localStorage.removeItem('passwordResetSession');
            setStatus('error');
            setMessage('Password reset link is invalid or has expired. Please try again.');
            // Redirect to login after showing error
            setTimeout(() => {
              navigate('/auth?mode=login', { replace: true });
            }, 3000);
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
