import { useState, useEffect } from 'react';
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
  const { isLoading: profileLoading } = useProfile();
  const { showToast } = useToast();
  
  // Combined loading state - wait for both auth and profile
  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    const mode = searchParams.get('mode');
    const passwordReset = searchParams.get('password_reset');
    
    if (mode === 'login') {
      setIsLogin(true);
      
      // Check if user just reset password
      if (passwordReset === 'success') {
        showToast({
          type: 'success',
          title: 'Password Berhasil Dirubah',
          message: 'Silakan login dengan password baru Anda.',
        });
        // Remove the parameter from URL
        navigate('/auth?mode=login', { replace: true });
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

    // Check if user was kicked by another device login
    const checkKickedFlag = () => {
      const kickedFlag = localStorage.getItem('kickedByOtherDevice');
      if (kickedFlag === 'true') {
        showToast({
          type: 'warning',
          title: 'Login di Perangkat Lain Terdeteksi',
          message: 'Sesi di perangkat ini telah ditutup.',
        });
        localStorage.removeItem('kickedByOtherDevice');
      }
    };
    
    checkKickedFlag();
    
    const handleFocus = () => { checkKickedFlag(); };
    window.addEventListener('focus', handleFocus);
    
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'kickedByOtherDevice' && e.newValue === 'true') {
        checkKickedFlag();
      }
    };
    window.addEventListener('storage', handleStorage);
    
    const handleKickedCheck = () => {
      console.log('AuthPage: Received kicked-check event');
      checkKickedFlag();
    };
    window.addEventListener('kicked-check', handleKickedCheck);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('kicked-check', handleKickedCheck);
    };
  }, [showToast]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      console.log('AuthPage: Already authenticated, redirecting to dashboard');
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleAuthSuccess = () => {
    showToast({
      type: 'success',
      title: 'Login Berhasil!',
      message: 'Selamat datang kembali!',
    });
    navigate('/dashboard'); // Redirect to dashboard
  };

  const handleLogin = () => {
    // Login is now handled directly in LoginForm
    // This function is kept for compatibility but does nothing
    handleAuthSuccess();
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
      if (response.success) {
        toast.success(response.message || 'Jika email terdaftar, kami telah mengirim link reset.');
        return response; // Return response so ForgotPasswordForm can handle it
      } else {
        toast.error(response.error || 'Gagal mengirim link reset password');
        return response;
      }
    } catch (error: any) {
      toast.error(error.message || 'Gagal mengirim link reset password');
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
          />
        )}
      </div>
    </AuthLayout>
  );
}
