import { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LoginForm } from './LoginForm';
import { SignUpForm } from './SignUpForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { EmailVerificationForm } from './EmailVerificationForm';
import { EmailVerificationSuccess } from './EmailVerificationSuccess';
import { AuthLayout } from './AuthLayout';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useProfile } from '../../contexts/ProfileContext';

interface AuthPageProps {
  initialMode?: 'login' | 'signup';
}

export function AuthPage({ initialMode = 'login' }: AuthPageProps) {
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isEmailVerification, setIsEmailVerification] = useState(false);
  const [isEmailVerificationSuccess, setIsEmailVerificationSuccess] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationType, setVerificationType] = useState<'signup' | 'recovery'>('signup');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isLoading: profileLoading, isLoggingOut: profileLoggingOut } = useProfile();
  const { showToast } = useToast();
  
  // Combined loading state - wait for both auth and profile
  const isLoading = authLoading || profileLoading;
  
  // Ref to prevent duplicate toast for password reset success
  const passwordResetToastShown = useRef(false);
  
  // CRITICAL: Reset all flags when on auth page (after logout)
  // This ensures clean state for next login attempt
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      // Reset any lingering flags from previous session
      // This prevents infinite loading on next login
      console.log('AuthPage: Not authenticated, ensuring clean state for login');
      // The ProfileContext useEffect will handle resetting flags when isAuthenticated = false
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    const mode = searchParams.get('mode');
    const passwordReset = searchParams.get('password_reset');
    
    if (mode === 'login') {
      setIsLogin(true);
      
      // Check if user just reset password
      if (passwordReset === 'success' && !passwordResetToastShown.current) {
        // Prevent duplicate toast
        passwordResetToastShown.current = true;
        
        // Use sonner toast with green color styling
        toast.success('Password Anda berhasil diubah! Silakan login dengan password baru.', {
          duration: 5000,
          className: 'bg-green-500 text-white border-green-600',
          style: {
            background: '#22c55e',
            color: '#ffffff',
            borderColor: '#16a34a',
          },
        });
        
        // Remove the parameter from URL
        navigate('/auth?mode=login', { replace: true });
        
        // Reset flag after a delay to allow for future resets
        setTimeout(() => {
          passwordResetToastShown.current = false;
        }, 1000);
      }
    } else if (mode === 'register') {
      setIsLogin(false);
    } else if (mode === 'email-verification-success') {
      // Email verification success mode - show success message then redirect
      setIsEmailVerificationSuccess(true);
      const action = searchParams.get('action');
      if (action === 'password-changed') {
        // Password was changed, show success and redirect to profile
        setTimeout(() => {
          navigate('/profile?tab=change-password');
        }, 3000);
      }
    }
  }, [searchParams, navigate, showToast]);

  // Check for email verification success/error and kicked device flags
  useEffect(() => {
    // Check email verification success
    const emailVerificationSuccess = localStorage.getItem('showEmailVerificationSuccessToast');
    if (emailVerificationSuccess === 'true') {
      localStorage.removeItem('showEmailVerificationSuccessToast');
      showToast({
        type: 'success',
        title: 'Email Berhasil Diverifikasi! 🎉',
        message: 'Selamat datang di BandarmoloNY! Akun Anda sudah aktif.',
      });
    }

    // Check email verification error
    const emailVerificationError = localStorage.getItem('emailVerificationError');
    if (emailVerificationError === 'true') {
      localStorage.removeItem('emailVerificationError');
      showToast({
        type: 'error',
        title: 'Verifikasi Email Gagal',
        message: 'Gagal menyelesaikan registrasi. Silakan coba login lagi.',
      });
    }

    // Check if user session expired (generic message, no false "kicked" accusation)
    // NOTE: Toast should already be shown by ProfileContext, this is just a backup
    // Only show if flag exists AND toast hasn't been shown yet (check after delay)
    const checkKickedFlag = () => {
      const kickedFlag = localStorage.getItem('kickedByOtherDevice');
      if (kickedFlag === 'true') {
        // Only show toast if ProfileContext didn't show it (backup only)
        // Use longer delay to ensure ProfileContext toast is shown first
        setTimeout(() => {
          // Double-check flag still exists (not cleared by ProfileContext)
          const stillExists = localStorage.getItem('kickedByOtherDevice');
          if (stillExists === 'true') {
            toast.warning('Sesi Anda telah habis', {
              description: 'Silakan login kembali untuk melanjutkan.',
              duration: 5000,
              className: 'bg-yellow-500 text-white border-yellow-600',
              style: {
                background: '#eab308',
                color: '#ffffff',
                borderColor: '#ca8a04',
              },
            });
            localStorage.removeItem('kickedByOtherDevice');
          }
        }, 1000); // Longer delay to let ProfileContext show toast first
      }
    };
    
    // Check immediately on mount (for page refresh scenario)
    // Use setTimeout to ensure component is fully mounted
    setTimeout(() => {
      checkKickedFlag();
    }, 200);
    
    const handleFocus = () => { checkKickedFlag(); };
    window.addEventListener('focus', handleFocus);
    
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'kickedByOtherDevice' && e.newValue === 'true') {
        checkKickedFlag();
      }
    };
    window.addEventListener('storage', handleStorage);
    
    const handleKickedCheck = () => {
      console.log('AuthPage: Received session expiry check event');
      checkKickedFlag();
    };
    window.addEventListener('kicked-check', handleKickedCheck);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('kicked-check', handleKickedCheck);
    };
  }, [showToast]);

  // Redirect if already authenticated (only when not loading)
  useEffect(() => {
    // Don't redirect while still loading - wait for auth check to complete
    if (isLoading) {
      return;
    }
    
    // CRITICAL: Reset all flags when on auth page (after logout)
    // This ensures clean state for next login attempt
    if (!isAuthenticated) {
      // Reset any lingering flags from previous session
      // This prevents infinite loading on next login
      console.log('AuthPage: Not authenticated, ensuring clean state');
      // Flags will be reset by ProfileContext useEffect when isAuthenticated = false
    }
    
    if (isAuthenticated) {
      console.log('AuthPage: Already authenticated, redirecting...');
      // Redirect to saved location (kecuali dashboard/home) atau ke profile
      const returnTo = sessionStorage.getItem('returnTo');
      const isDashboardReturn =
        returnTo === '/' ||
        returnTo === '/dashboard' ||
        returnTo === '/dashboard/';

      if (returnTo && !isDashboardReturn) {
        console.log('AuthPage: Redirecting to saved location:', returnTo);
        sessionStorage.removeItem('returnTo');
        navigate(returnTo, { replace: true });
      } else {
        console.log('AuthPage: Redirecting to profile');
        sessionStorage.removeItem('returnTo');
        navigate('/profile', { replace: true });
      }
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleAuthSuccess = () => {
    showToast({
      type: 'success',
      title: 'Login Berhasil!',
      message: 'Selamat datang kembali!',
    });
    
    // Redirect to saved location (kecuali dashboard/home) atau ke profile
    const returnTo = sessionStorage.getItem('returnTo');
    const isDashboardReturn =
      returnTo === '/' ||
      returnTo === '/dashboard' ||
      returnTo === '/dashboard/';

    if (returnTo && !isDashboardReturn) {
      sessionStorage.removeItem('returnTo');
      navigate(returnTo);
    } else {
      sessionStorage.removeItem('returnTo');
      navigate('/profile');
    }
  };

  const handleLogin = () => {
    // Login is now handled directly in LoginForm
    // This function is kept for compatibility but does nothing
    handleAuthSuccess();
  };

  const handleSignUp = async () => {
    // Signup is now handled directly in SignupForm
    // This function is kept for compatibility but does nothing
  };

  const handleSwitchToForgotPassword = () => {
    setIsForgotPassword(true);
  };

  const handleSwitchFromForgotPassword = () => {
    setIsForgotPassword(false);
  };

  const handleForgotPassword = async (email: string) => {
    try {
      const response = await api.forgotPassword(email);
      // Don't show toast here - ForgotPasswordForm will handle it
      // This prevents duplicate toast messages
      return response;
    } catch (error: any) {
      // Don't show toast here - ForgotPasswordForm will handle it
      return { success: false, error: error.message };
    }
  };


  const handleSwitchToEmailVerification = (email: string, type: 'signup' | 'recovery') => {
    setVerificationEmail(email);
    setVerificationType(type);
    setIsEmailVerification(true);
  };

  const handleSwitchFromEmailVerification = () => {
    setIsEmailVerification(false);
    setVerificationEmail('');
  };

  const handleEmailVerified = () => {
    setIsEmailVerification(false);
    setVerificationEmail('');
    handleAuthSuccess();
  };

  const handleResendSuccess = () => {
    toast.success('Verification email sent successfully!');
  };

  const handleBackToLanding = () => {
    navigate('/');
  };


  return (
    <AuthLayout onBackToLanding={handleBackToLanding}>
      <div className="space-y-6">
        <button
          type="button"
          onClick={handleBackToLanding}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors lg:hidden"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali ke landing page
        </button>

        {isEmailVerificationSuccess ? (
          <EmailVerificationSuccess
            message="Password berhasil diubah! Anda akan diarahkan ke halaman profil untuk mengubah password."
            redirectTo="/profile?tab=change-password"
          />
        ) : isEmailVerification ? (
          <EmailVerificationForm
            email={verificationEmail}
            type={verificationType}
            onBack={handleSwitchFromEmailVerification}
            onVerified={handleEmailVerified}
            onResendSuccess={handleResendSuccess}
          />
        ) : isForgotPassword ? (
          <ForgotPasswordForm
            onSwitchToLogin={handleSwitchFromForgotPassword}
            onForgotPassword={handleForgotPassword}
          />
        ) : isLogin ? (
          <LoginForm
            onSwitchToSignUp={() => setIsLogin(false)}
            onSwitchToForgotPassword={handleSwitchToForgotPassword}
            onLogin={handleLogin}
          />
        ) : (
          <SignUpForm
            onSwitchToLogin={() => setIsLogin(true)}
            onSwitchToEmailVerification={handleSwitchToEmailVerification}
            onSignUp={handleSignUp}
          />
        )}
      </div>
    </AuthLayout>
  );
}
