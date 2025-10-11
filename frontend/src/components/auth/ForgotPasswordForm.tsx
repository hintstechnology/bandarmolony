import React, { useState, useEffect } from 'react';
import { ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { api } from '../../services/api';

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
  onForgotPassword: (email: string) => Promise<{ success: boolean; error?: string; message?: string }>;
}

export function ForgotPasswordForm({ onSwitchToLogin, onForgotPassword }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailSent, setEmailSent] = useState(false);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Email is required');
      toast.error('Please enter your email address');
      return;
    }
    
    if (!email.includes('@')) {
      setError('Please enter a valid email');
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const result = await onForgotPassword(email);
      if (result && typeof result === 'object' && 'success' in result) {
        if (result.success) {
          setEmailSent(true);
          setResendCooldown(60); // 60 seconds cooldown
          toast.success(result.message || 'Password reset email sent successfully!');
        } else {
          // Handle error case
          const errorMessage = result.error || 'Failed to send password reset email';
          setError(errorMessage);
          toast.error(errorMessage);
        }
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Something went wrong. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;

    setResendLoading(true);
    setError('');

    try {
      const result = await api.resendForgotPassword(email);
      
      if (result.success) {
        setResendCooldown(60); // 60 seconds cooldown
        toast.success('Password reset email sent successfully!');
      } else {
        const errorMessage = result.error || 'Failed to resend password reset email';
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to resend password reset email';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setResendLoading(false);
    }
  };

  // Show success page if email was sent
  if (emailSent) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onSwitchToLogin}
            className="p-2 hover:bg-accent rounded-lg transition-colors duration-200 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Check Your Email</h1>
            <p className="text-sm text-muted-foreground">We've sent you a reset link</p>
          </div>
        </div>

        {/* Success Illustration */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Email Sent Successfully!</h2>
          <p className="text-muted-foreground">
            We've sent a password reset link to <strong>{email}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Please check your email and click the link to reset your password. The link will expire in 1 hour.
          </p>
        </div>

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

        {/* Back to Login */}
        <div className="text-center">
          <Button
            type="button"
            variant="ghost"
            onClick={onSwitchToLogin}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={onSwitchToLogin}
          className="p-2 hover:bg-accent rounded-lg transition-colors duration-200 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Forgot Password</h1>
          <p className="text-sm text-muted-foreground">Reset your password via email</p>
        </div>
      </div>

      {/* Illustration */}
      <div className="flex justify-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <Mail className="h-8 w-8 text-foreground" />
        </div>
      </div>

      {/* Description */}
      <div className="text-center space-y-2">
        <p className="text-muted-foreground">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start space-x-2">
            <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Forgot Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 focus:border-blue-400 dark:focus:border-blue-600 placeholder:opacity-60 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:placeholder:opacity-0 pl-3"
          />
        </div>

        <Button 
          type="submit" 
          className="w-full bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100 border border-blue-300 dark:border-blue-700 disabled:bg-muted disabled:text-muted-foreground disabled:border-muted transition-all duration-200" 
          disabled={loading}
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </Button>
      </form>

      {/* Resend Section */}
      {emailSent && (
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
      )}

      {/* Back to Login */}
      <div className="text-center">
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-sm text-foreground hover:text-muted-foreground font-medium transition-colors duration-200"
        >
          Back to Sign In
        </button>
      </div>
    </div>
  );
}
