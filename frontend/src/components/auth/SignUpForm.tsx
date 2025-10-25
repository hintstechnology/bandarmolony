import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { api } from '../../services/api';

interface SignUpFormProps {
  onSwitchToLogin: () => void;
  onSwitchToEmailVerification: (email: string, type: 'signup') => void;
}

export function SignUpForm({ onSwitchToLogin, onSwitchToEmailVerification }: SignUpFormProps) {
  const { showToast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailExists, setEmailExists] = useState<boolean | null>(null);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Check email availability when email changes
  useEffect(() => {
    const checkEmailAvailability = async () => {
      if (formData.email && formData.email.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        setEmailChecking(true);
        try {
          const result = await api.checkEmail(formData.email);
          if (result.success) {
            setEmailExists(result.exists || false);
            if (result.exists) {
              setErrors(prev => ({ ...prev, email: 'An account with this email already exists' }));
            }
          }
        } catch (error) {
          console.error('Error checking email:', error);
        } finally {
          setEmailChecking(false);
        }
      } else {
        setEmailExists(null);
      }
    };

    const timeoutId = setTimeout(checkEmailAvailability, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [formData.email]);

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    // First name validation
    if (!formData['firstName'].trim()) {
      newErrors['firstName'] = 'First name is required';
    } else if (formData['firstName'].trim().length < 2) {
      newErrors['firstName'] = 'First name must be at least 2 characters';
    }

    // Last name validation
    if (!formData['lastName'].trim()) {
      newErrors['lastName'] = 'Last name is required';
    } else if (formData['lastName'].trim().length < 2) {
      newErrors['lastName'] = 'Last name must be at least 2 characters';
    }

    // Email validation
    if (!formData['email'].trim()) {
      newErrors['email'] = 'Email is required';
    } else if (!formData['email'].includes('@')) {
      newErrors['email'] = 'Please enter a valid email address';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData['email'])) {
      newErrors['email'] = 'Please enter a valid email address';
    } else if (emailExists === true) {
      newErrors['email'] = 'An account with this email already exists';
    } else if (emailChecking) {
      newErrors['email'] = 'Please wait while we check email availability';
    }

    // Password validation
    if (!formData['password']) {
      newErrors['password'] = 'Password is required';
    } else if (formData['password'].length < 6) {
      newErrors['password'] = 'Password must be at least 6 characters';
    } else if (formData['password'].length > 128) {
      newErrors['password'] = 'Password must be less than 128 characters';
    } else if (!/(?=.*[a-z])/.test(formData['password'])) {
      newErrors['password'] = 'Password must contain at least one lowercase letter';
    } else if (!/(?=.*[A-Z])/.test(formData['password'])) {
      newErrors['password'] = 'Password must contain at least one uppercase letter';
    } else if (!/(?=.*\d)/.test(formData['password'])) {
      newErrors['password'] = 'Password must contain at least one number';
    }

    // Confirm password validation
    if (!formData['confirmPassword']) {
      newErrors['confirmPassword'] = 'Please confirm your password';
    } else if (formData['password'] !== formData['confirmPassword']) {
      newErrors['confirmPassword'] = 'Passwords do not match';
    }

    // Terms agreement validation
    if (!formData['agreeToTerms']) {
      newErrors['agreeToTerms'] = 'You must agree to the terms and conditions';
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

    setLoading(true);
    
    try {
      const result = await api.register(
        `${formData.firstName} ${formData.lastName}`, 
        formData.email, 
        formData.password
      );
      
      if (result.success) {
        if (result.user && result.session) {
          // User was created and signed in immediately
          showToast({
            type: 'success',
            title: 'Akun Berhasil Dibuat!',
            message: 'Selamat datang!',
          });
          // Redirect to dashboard after 1 second
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 1000);
        } else {
          // User needs to verify email
          showToast({
            type: 'success',
            title: 'Akun Berhasil Dibuat!',
            message: 'Silakan cek email untuk verifikasi akun.',
          });
          onSwitchToEmailVerification(formData.email, 'signup');
        }
      } else {
        toast.error(result.error || 'Failed to create account');
        if (result.field) {
          setErrors(prev => ({ ...prev, [result.field as string]: result.error || '' }));
        }
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-2xl font-semibold text-foreground">Create Account</h1>
          <p className="text-sm text-muted-foreground">Join us and get started</p>
        </div>
      </div>

      {/* Sign Up Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              type="text"
              placeholder="John"
              value={formData['firstName']}
              onChange={(e) => handleInputChange('firstName', e.target.value)}
              className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 focus:border-blue-400 dark:focus:border-blue-600 placeholder:opacity-60 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:placeholder:opacity-0"
            />
            {errors['firstName'] && <p className="text-sm text-red-500">{errors['firstName']}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              type="text"
              placeholder="Doe"
              value={formData['lastName']}
              onChange={(e) => handleInputChange('lastName', e.target.value)}
              className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 focus:border-blue-400 dark:focus:border-blue-600 placeholder:opacity-60 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:placeholder:opacity-0"
            />
            {errors['lastName'] && <p className="text-sm text-red-500">{errors['lastName']}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              placeholder="john.doe@example.com"
              value={formData['email']}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 focus:border-blue-400 dark:focus:border-blue-600 placeholder:opacity-60 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:placeholder:opacity-0"
            />
            {emailChecking && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            )}
            {emailExists === false && !emailChecking && formData['email'] && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}
          </div>
          {errors['email'] && <p className="text-sm text-red-500">{errors['email']}</p>}
          {emailExists === false && !emailChecking && formData['email'] && !errors['email'] && (
            <p className="text-sm text-green-600">Email is available</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a strong password"
              value={formData['password']}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 focus:border-blue-400 dark:focus:border-blue-600 placeholder:opacity-60 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:placeholder:opacity-0 pr-10 pl-3"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors['password'] && <p className="text-sm text-red-500">{errors['password']}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              value={formData['confirmPassword']}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 focus:border-blue-400 dark:focus:border-blue-600 placeholder:opacity-60 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:placeholder:opacity-0 pr-10 pl-3"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors['confirmPassword'] && <p className="text-sm text-red-500">{errors['confirmPassword']}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="terms"
              checked={formData['agreeToTerms']}
              onCheckedChange={(checked) => handleInputChange('agreeToTerms', checked as boolean)}
            />
            <Label htmlFor="terms" className="text-sm font-normal leading-tight flex-1">
              <span className="whitespace-nowrap">
                I agree to the{' '}
                <a href="#" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold transition-colors duration-200">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold transition-colors duration-200">
                  Privacy Policy
                </a>
              </span>
            </Label>
          </div>
          {errors['agreeToTerms'] && <p className="text-sm text-red-500">{errors['agreeToTerms']}</p>}
        </div>

        <Button 
          type="submit" 
          className="w-full bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100 border border-blue-300 dark:border-blue-700 disabled:bg-muted disabled:text-muted-foreground disabled:border-muted transition-all duration-200" 
          disabled={loading}
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </Button>
      </form>

      {/* Login Link */}
      <div className="text-center">
        <span className="text-sm text-muted-foreground">Already have an account? </span>
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-sm text-foreground hover:text-muted-foreground font-medium transition-colors duration-200"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}