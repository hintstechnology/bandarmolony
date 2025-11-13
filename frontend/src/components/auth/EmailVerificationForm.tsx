import React, { useState, useEffect } from 'react';
import { ArrowLeft, Mail, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { api } from '../../services/api';

interface EmailVerificationFormProps {
  email: string;
  type: 'signup' | 'recovery';
  onBack: () => void;
  onVerified: () => void;
  onResendSuccess: () => void;
}

export function EmailVerificationForm({ 
  email, 
  type, 
  onBack, 
  onVerified, 
  onResendSuccess 
}: EmailVerificationFormProps) {
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  // Auto-verify if token is in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const typeFromUrl = urlParams.get('type') as 'signup' | 'recovery' || type;
    
    if (tokenFromUrl) {
      handleVerify(tokenFromUrl, typeFromUrl);
    }
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerify = async (verificationToken: string, verificationType: 'signup' | 'recovery') => {
    setLoading(true);

    try {
      const result = await api.verifyEmail(verificationToken, verificationType);
      
      if (result.success) {
        setIsVerified(true);
        toast.success('Email verified successfully!');
        
        // Store user data if session is available
        if (result.user) {
          localStorage.setItem('user', JSON.stringify({
            id: result.user.id,
            name: result.user.user_metadata?.full_name,
            email: result.user.email,
            avatar: null,
            isAuthenticated: true
          }));
        }
        
        setTimeout(() => {
          onVerified();
        }, 1500);
      } else {
        const errorMessage = result.error || 'Verification failed';
        toast.error(errorMessage);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Verification failed';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setResendLoading(true);

    try {
      let result;
      if (type === 'recovery') {
        result = await api.resendForgotPassword(email);
      } else {
        result = await api.resendVerification(email);
      }
      
      if (result.success) {
        setResendCooldown(60); // 60 seconds cooldown
        const message = type === 'recovery' 
          ? 'Password reset email sent successfully!'
          : 'Verification email sent successfully!';
        toast.success(message);
        onResendSuccess();
      } else {
        const errorMessage = result.error || `Failed to resend ${type === 'recovery' ? 'password reset' : 'verification'} email`;
        toast.error(errorMessage);
      }
    } catch (error: any) {
      const errorMessage = error.message || `Failed to resend ${type === 'recovery' ? 'password reset' : 'verification'} email`;
      toast.error(errorMessage);
    } finally {
      setResendLoading(false);
    }
  };

  const handleCheckEmail = () => {
    setShowInstructions(false);
    // Redirect to login page
    window.location.href = '/auth?mode=login';
  };

  if (isVerified) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-green-900 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
        </div>
        
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Email Verified!</h1>
          <p className="text-muted-foreground mt-2">
            Your email has been successfully verified. Redirecting you now...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-accent rounded-lg transition-colors duration-200 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {type === 'signup' ? 'Verify Your Email' : 'Reset Your Password'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {type === 'signup' 
              ? 'We sent a verification link to your email address'
              : 'We sent a password reset link to your email address'
            }
          </p>
        </div>
      </div>

      {/* Email Info */}
      <div className="p-4 bg-blue-950 border border-blue-800 rounded-lg">
        <div className="flex items-center space-x-2">
          <Mail className="w-4 h-4 text-blue-400" />
          <span className="text-sm text-blue-200">
            Link sent to: <strong>{email}</strong>
          </span>
        </div>
      </div>

      {/* Instructions */}
      {showInstructions && (
        <div className="p-4 bg-green-950 border border-green-800 rounded-lg">
          <div className="space-y-3">
            <h3 className="font-medium text-green-200">
              Next Steps:
            </h3>
            <ol className="text-sm text-green-300 space-y-2 list-decimal list-inside">
              <li>Check your email inbox for a verification email</li>
              <li>Click the "Confirm My Email" button in the email</li>
              <li>You'll be automatically redirected back to complete the process</li>
            </ol>
            <Button
              type="button"
              variant="outline"
              onClick={handleCheckEmail}
              className="text-sm border-green-700 text-green-300 hover:bg-green-900"
            >
              I've checked my email
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-4">
          <div className="flex justify-center mb-2">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Verifying your email...</p>
        </div>
      )}

      {/* Resend Section */}
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Didn't receive the email?
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={handleResend}
          disabled={resendLoading || resendCooldown > 0}
          className="text-sm"
        >
          {resendLoading ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : resendCooldown > 0 ? (
            `Resend in ${resendCooldown}s`
          ) : (
            'Resend Email'
          )}
        </Button>
      </div>

      {/* Help Text */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          Check your spam folder if you don't see the email in your inbox.
        </p>
      </div>
    </div>
  );
}

