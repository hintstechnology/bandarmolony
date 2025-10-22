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

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'login') {
      setIsLogin(true);
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
  }, [searchParams]);

  const { isAuthenticated, isLoading } = useAuth();
  const { showToast } = useToast();

  // Check if user was kicked by another device login
  useEffect(() => {
    const kickedFlag = localStorage.getItem('kickedByOtherDevice');
    if (kickedFlag === 'true') {
      // Show toast notification
      showToast({
        type: 'warning',
        title: 'Login di Perangkat Lain Terdeteksi',
        message: 'Sesi di perangkat ini telah ditutup.',
      });
      // Clear the flag
      localStorage.removeItem('kickedByOtherDevice');
    }
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
            onSignUp={handleSignUp}
          />
        )}
      </div>
    </AuthLayout>
  );
}
