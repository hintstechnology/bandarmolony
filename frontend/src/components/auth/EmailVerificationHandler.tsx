import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { ResetPasswordForm } from './ResetPasswordForm';
import { EmailVerificationSuccess } from './EmailVerificationSuccess';
import { setAuthState } from '../../utils/auth';

export function EmailVerificationHandler() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'reset-password'>('loading');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [type, setType] = useState<'signup' | 'recovery'>('signup');

  useEffect(() => {
    const handleEmailVerification = async () => {
      try {
        // Ambil parameter dari URL
        // Supabase bisa mengirim parameter dengan nama yang berbeda
        const urlToken = searchParams.get('token') || searchParams.get('access_token');
        const urlType = searchParams.get('type') as 'signup' | 'recovery' || 'signup';
        const redirectTo = searchParams.get('redirect_to');
        
        // Cek juga di hash fragment (kadang Supabase mengirim di hash)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hashToken = hashParams.get('access_token');
        const hashType = hashParams.get('type');

        // Gunakan token dari URL atau hash
        const finalToken = urlToken || hashToken;
        const finalType = (urlType || hashType) as 'signup' | 'recovery' || 'signup';

        // Debug logging
        console.log('EmailVerificationHandler - URL params:', {
          urlToken,
          hashToken,
          finalToken,
          urlType,
          hashType,
          finalType,
          redirectTo: redirectTo,
          allParams: Object.fromEntries(searchParams.entries()),
          hashParams: Object.fromEntries(hashParams.entries())
        });

        if (!finalToken) {
          setStatus('error');
          setMessage('Invalid verification link. Token is missing.');
          return;
        }

        setToken(finalToken);
        setType(finalType);

        // Jika type adalah recovery, langsung tampilkan form reset password
        if (finalType === 'recovery') {
          setStatus('reset-password');
          setMessage('Please enter your new password');
          return;
        }

        // Untuk signup, verify token dengan backend
        const result = await api.verifyEmail(finalToken, finalType);

        if (result.success) {
          setStatus('success');
          setMessage('Email verified successfully! Welcome to BandarmoloNY!');

          // Show success popup dengan toast
          toast.success('🎉 Email verified successfully! Welcome to BandarmoloNY!', {
            duration: 4000,
            position: 'top-center'
          });

        } else {
          setStatus('error');
          setMessage(result.error || 'Email verification failed');
        }

      } catch (error: any) {
        console.error('Email verification error:', error);
        setStatus('error');
        setMessage('An error occurred during verification. Please try again.');
      }
    };

    handleEmailVerification();
  }, [searchParams, navigate]);

  const handleResetPasswordSuccess = () => {
    setStatus('success');
    setMessage('Password reset successfully! Redirecting to login...');
    
    // Redirect to login after 2 seconds
    setTimeout(() => {
      navigate('/auth?mode=login');
    }, 2000);
  };

  const handleBackToLogin = () => {
    navigate('/auth?mode=login');
  };

  const handleLogin = () => {
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
              {type === 'recovery' ? 'Reset Failed' : 'Verification Failed'}
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

        {status === 'reset-password' && token && (
          <ResetPasswordForm
            token={token}
            onSuccess={handleResetPasswordSuccess}
            onBackToLogin={handleBackToLogin}
          />
        )}
      </div>
    </div>
  );
}
