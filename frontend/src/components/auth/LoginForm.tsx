import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { api } from '../../services/api';
import { getAuthError, logError } from '../../utils/errorHandler';
import { supabase } from '../../lib/supabase';

interface LoginFormProps {
  onSwitchToSignUp: () => void;
  onSwitchToForgotPassword: () => void;
  onLogin: (email: string, password: string) => void;
}

export function LoginForm({ onSwitchToSignUp, onSwitchToForgotPassword, onLogin }: LoginFormProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [attemptsInfo, setAttemptsInfo] = useState<{
    remainingAttempts: number;
    isBlocked: boolean;
    blockedUntil?: string;
    timeRemaining?: string;
    isSuspended: boolean;
    suspensionReason?: string;
  } | null>(null);
  const [hasFailedLogin, setHasFailedLogin] = useState(false);

  // Check attempts only after failed login attempts
  const checkAttemptsAfterFailure = async (email: string) => {
    if (email && email.includes('@')) {
      try {
        const result = await api.checkAttempts(email);
        if (result.success && result.data) {
          setAttemptsInfo({
            remainingAttempts: result.data.remainingAttempts,
            isBlocked: !result.data.allowed && !result.data.isSuspended,
            blockedUntil: result.data.blockedUntil,
            timeRemaining: result.data.timeRemaining,
            isSuspended: result.data.isSuspended,
            suspensionReason: result.data.suspensionReason
          });
        }
      } catch (error) {
        console.error('Error checking attempts:', error);
        setAttemptsInfo(null);
      }
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'email') setEmail(value);
    if (field === 'password') setPassword(value);
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    // Reset failed login state when user starts typing
    if (hasFailedLogin) {
      setHasFailedLogin(false);
      setAttemptsInfo(null);
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    // Email validation
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!email.includes('@')) {
      newErrors.email = 'Please enter a valid email address';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (!password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the errors below');
      return;
    }

    // Check if account is blocked or suspended
    if (attemptsInfo?.isSuspended) {
      toast.error(attemptsInfo.suspensionReason || 'Account has been suspended');
      return;
    }

    if (attemptsInfo?.isBlocked) {
      toast.error(`Account is temporarily blocked. Please try again in ${attemptsInfo.timeRemaining || 'a few minutes'}`);
      return;
    }

    setLoading(true);
    setErrors({});
    
    try {
      const result = await api.login(email, password);
      
      if (result.success) {
        showToast({
          type: 'success',
          title: 'Login Berhasil!',
          message: 'Selamat datang kembali!',
        });
        navigate('/dashboard');
      } else {
        // Handle structured error responses
        const errorMessage = result.error || 'Login failed. Please try again.';
        
        // Log error for monitoring
        logError({
          code: result.code || 'LOGIN_FAILED',
          message: errorMessage,
          type: 'auth',
          field: result.field
        }, 'LoginForm');
        
        // Use field information from backend if available
        if (result.field) {
          setErrors({ [result.field]: errorMessage });
        } else if (result.code === 'USER_NOT_FOUND') {
          setErrors({ email: errorMessage });
        } else if (result.code === 'INVALID_PASSWORD') {
          setErrors({ password: errorMessage });
        } else if (result.code === 'ACCOUNT_BLOCKED' || result.code === 'ACCOUNT_SUSPENDED') {
          setErrors({ general: errorMessage });
        } else if (errorMessage.includes('verify') || errorMessage.includes('confirmed')) {
          setErrors({ general: errorMessage });
        } else if (errorMessage.includes('too many') || errorMessage.includes('rate limit')) {
          setErrors({ general: errorMessage });
        } else {
          setErrors({ general: errorMessage });
        }
        toast.error(errorMessage);
        
        // Refresh attempts info after failed login (only for existing users)
        if (email && email.includes('@') && result.code !== 'USER_NOT_FOUND') {
          try {
            const attemptsResult = await api.checkAttempts(email);
            if (attemptsResult.success && attemptsResult.data) {
              setAttemptsInfo({
                remainingAttempts: attemptsResult.data.remainingAttempts,
                isBlocked: !attemptsResult.data.allowed && !attemptsResult.data.isSuspended,
                blockedUntil: attemptsResult.data.blockedUntil,
                timeRemaining: attemptsResult.data.timeRemaining,
                isSuspended: attemptsResult.data.isSuspended,
                suspensionReason: attemptsResult.data.suspensionReason
              });
            }
          } catch (error) {
            console.error('Error refreshing attempts info:', error);
          }
        } else if (result.code === 'USER_NOT_FOUND') {
          // Clear attempts info for non-existent users
          setAttemptsInfo(null);
        }
      }
    } catch (error: any) {
      const authError = getAuthError(error);
      setErrors({ general: authError.message });
      toast.error(authError.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Nice to see you again</h1>
      </div>

      {/* General Error Message */}
      {errors.general && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start space-x-2">
            <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-600 dark:text-red-400">{errors.general}</p>
          </div>
        </div>
      )}

      {/* Attempts Information */}
      {attemptsInfo && (
        <div className={`p-3 rounded-lg border ${
          attemptsInfo.isSuspended 
            ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
            : attemptsInfo.isBlocked
            ? 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800'
            : attemptsInfo.remainingAttempts <= 2
            ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800'
            : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
        }`}>
          <div className="flex items-start space-x-2">
            {attemptsInfo.isSuspended ? (
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            ) : attemptsInfo.isBlocked ? (
              <svg className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            )}
            <div className="text-sm">
              {attemptsInfo.isSuspended ? (
                <p className="text-red-600 dark:text-red-400">
                  {attemptsInfo.suspensionReason || 'Account has been suspended due to repeated failed login attempts'}
                </p>
              ) : attemptsInfo.isBlocked ? (
                <p className="text-orange-600 dark:text-orange-400">
                  Account is temporarily blocked. Please try again in {attemptsInfo.timeRemaining || 'a few minutes'}.
                </p>
              ) : attemptsInfo.remainingAttempts <= 2 ? (
                <p className="text-yellow-600 dark:text-yellow-400">
                  {attemptsInfo.remainingAttempts} login attempt{attemptsInfo.remainingAttempts !== 1 ? 's' : ''} remaining. 
                  {attemptsInfo.remainingAttempts === 0 && ' Account will be blocked after this attempt.'}
                </p>
              ) : (
                <p className="text-blue-600 dark:text-blue-400">
                  {attemptsInfo.remainingAttempts} login attempts remaining.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Login</Label>
          <Input
            id="email"
            type="email"
            placeholder="Email or phone number"
            value={email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            required
            className={`bg-blue-50 dark:bg-blue-950 border focus:border-blue-400 dark:focus:border-blue-600 placeholder:opacity-60 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:placeholder:opacity-0 ${
              errors.email ? 'border-red-500 dark:border-red-500' : 'border-blue-200 dark:border-blue-800'
            }`}
          />
          {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter password"
              value={password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              required
              className={`bg-blue-50 dark:bg-blue-950 border focus:border-blue-400 dark:focus:border-blue-600 placeholder:opacity-60 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:placeholder:opacity-0 pr-10 pl-3 ${
                errors.password ? 'border-red-500 dark:border-red-500' : 'border-blue-200 dark:border-blue-800'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="remember"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked as boolean)}
            />
            <Label htmlFor="remember" className="text-sm font-normal">
              Remember me
            </Label>
          </div>
          <button
            type="button"
            onClick={onSwitchToForgotPassword}
            className="text-sm text-foreground hover:text-muted-foreground font-normal transition-colors duration-200"
          >
            Forgot password?
          </button>
        </div>

        <Button 
          type="submit" 
          className="w-full bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100 border border-blue-300 dark:border-blue-700 disabled:bg-muted disabled:text-muted-foreground disabled:border-muted transition-all duration-200" 
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      {/* Sign Up Link */}
      <div className="text-center">
        <span className="text-sm text-muted-foreground">Don't have an account? </span>
        <button
          type="button"
          onClick={onSwitchToSignUp}
          className="text-sm text-foreground hover:text-muted-foreground font-medium transition-colors duration-200"
        >
          Sign up now
        </button>
      </div>
    </div>
  );
}