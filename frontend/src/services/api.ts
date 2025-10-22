import { supabase } from '../lib/supabase';
import { getAuthError } from '../utils/errorHandler';
import { setAuthState, clearAuthState, getAuthState } from '../utils/auth';
import { getAvatarUrl } from '../utils/avatar';
// import config from '../config';

export interface ProfileData {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: 'user' | 'admin' | 'moderator';
  is_active: boolean;
  email_verified: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
  // Legacy fields for backward compatibility
  name?: string;
  avatar?: string;
  avatarUrl?: string;
  joinedDate?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: 'active' | 'inactive';
  subscriptionEndDate?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: any;
  session?: any;
  error?: string;
  code?: string;
  field?: string | undefined;
  message?: string;
}

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export const api = {
  // Market Rotation Outputs (Azure-backed)
  async listMarketRotationOutputs(feature: 'rrc' | 'rrg' | 'seasonal' | 'trend'): Promise<{ success: boolean; data?: { prefix: string; files: string[] }; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/market-rotation/outputs/${feature}/list`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to list outputs');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to list outputs' };
    }
  },

  // Seasonal Analysis
  async getSeasonalityData(type: 'index' | 'sector' | 'stock', startDate?: string, endDate?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const res = await fetch(`${API_URL}/api/seasonality/data/${type}?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get seasonality data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get seasonality data' };
    }
  },

  async getSeasonalityStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/seasonality/status`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get seasonality status');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get seasonality status' };
    }
  },

  async generateSeasonality(triggerType: 'manual' | 'scheduled' = 'manual'): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/seasonality/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate seasonality');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to generate seasonality' };
    }
  },

  async getMarketRotationOutputFile(feature: 'rrc' | 'rrg' | 'seasonal' | 'trend', path: string): Promise<string> {
    const res = await fetch(`${API_URL}/api/market-rotation/outputs/${feature}/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || 'Failed to fetch output file');
    }
    return await res.text();
  },

  async backfillMarketRotationOutputs(feature: 'rrc' | 'rrg' | 'seasonal' | 'trend'): Promise<{ success: boolean; uploaded?: number; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/market-rotation/backfill/${feature}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to backfill outputs');
      return { success: true, uploaded: json?.data?.uploaded };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to backfill outputs' };
    }
  },
  async listMarketRotationInputs(): Promise<{ success: boolean; data?: { index: string[]; stockSectors: string[]; holding: string[]; shareholders: string[] }; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/market-rotation/inputs`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to list inputs');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to list inputs' };
    }
  },

  async preGenerateOutputs(feature: string): Promise<{ success: boolean; data?: { message: string; feature: string }; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/market-rotation/pre-generate/${feature}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to pre-generate outputs');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to pre-generate outputs' };
    }
  },
  async getProfile(): Promise<ProfileData> {
    console.log('🔍 API: Getting profile...');
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      console.log('❌ API: No active session');
      throw new Error('No active session');
    }

    if (!session.access_token) {
      console.log('❌ API: No access token');
      throw new Error('No access token');
    }
    
    console.log('✅ API: Session and token found, making request');
    
    // Add timeout to fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000); // 30 seconds timeout
    
    try {
      const response = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 401) {
          // Clear session on unauthorized
          await supabase.auth.signOut();
          throw new Error('Session expired. Please sign in again.');
        }
        
        const errorText = await response.text();
        throw new Error(`Failed to fetch profile: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      
      if (result.ok && result.data) {
        const profile = result.data;
        const avatarUrl = getAvatarUrl(profile.avatar_url);
        const finalProfile = {
          ...profile,
          name: profile.full_name,
          avatar: avatarUrl,
          avatarUrl: avatarUrl,
          joinedDate: new Date(profile.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          subscriptionPlan: profile.role === 'admin' ? 'Pro' : 'Free',
          subscriptionStatus: profile.is_active ? 'active' : 'inactive' as const,
          subscriptionEndDate: profile.role === 'admin' ? 'December 25, 2025' : undefined,
        };
        return finalProfile;
      }

      throw new Error('Invalid profile data');
      
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.warn('⚠️ Profile fetch timeout, this might be a temporary issue');
        throw new Error('Request timeout');
      }
      
      if (error.message?.includes('Failed to fetch')) {
        throw new Error('Cannot connect to server. Please check your connection.');
      }
      
      throw error;
    }
  },

  async uploadAvatar(file: File): Promise<{ avatarUrl: string; filePath: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      // Pre-validate file size
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      console.log(`🔍 API: File size validation: ${file.size} bytes (${fileSizeMB}MB)`);
      
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      if (file.size > MAX_FILE_SIZE) {
        console.log(`❌ API: File size validation failed: ${fileSizeMB}MB > ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
        throw new Error(`File size too large (${fileSizeMB}MB). Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }
      console.log(`✅ API: File size validation passed: ${fileSizeMB}MB <= ${MAX_FILE_SIZE / (1024 * 1024)}MB`);

      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch(`${API_URL}/api/auth/upload-avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      });

      if (!response.ok) {
        let errorMessage = 'Failed to upload avatar';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (parseError) {
          // If we can't parse the error response, use status-based messages
          if (response.status === 413) {
            errorMessage = 'File size too large. Maximum size is 1MB';
          } else if (response.status === 400) {
            errorMessage = 'Invalid file type or format';
          } else if (response.status === 401) {
            errorMessage = 'Authentication failed. Please log in again';
          } else if (response.status >= 500) {
            errorMessage = 'Server error. Please try again later';
          }
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      return result.data;
    } catch (error: any) {
      // Re-throw with more specific error messages
      if (error.message?.includes('File size too large')) {
        throw new Error('File size too large. Please select an image smaller than 1MB');
      } else if (error.message?.includes('Invalid file type')) {
        throw new Error('Invalid file type. Please select a JPEG, PNG, GIF, or WebP image');
      } else if (error.message?.includes('Failed to fetch')) {
        throw new Error('Network error. Please check your connection');
      }
      
      throw error;
    }
  },

  async deleteAvatar(): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(`${API_URL}/api/auth/avatar`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete avatar';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (parseError) {
          // If we can't parse the error response, use status-based messages
          if (response.status === 404) {
            errorMessage = 'No avatar found to delete';
          } else if (response.status === 401) {
            errorMessage = 'Authentication failed. Please log in again';
          } else if (response.status >= 500) {
            errorMessage = 'Server error. Please try again later';
          }
        }
        
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      // Re-throw with more specific error messages
      if (error.message?.includes('Failed to fetch')) {
        throw new Error('Network error. Please check your connection');
      }
      
      throw error;
    }
  },

  // Session Management
  async getSessions(): Promise<{ sessions: any[]; count: number }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(`${API_URL}/api/auth/sessions`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get sessions');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      throw error;
    }
  },

  async deactivateSession(sessionId: string): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(`${API_URL}/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to deactivate session');
      }
    } catch (error) {
      throw error;
    }
  },

  async deactivateAllSessions(): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(`${API_URL}/api/auth/sessions/all`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to deactivate all sessions');
      }
    } catch (error) {
      throw error;
    }
  },

  async updateProfile(data: Partial<ProfileData>): Promise<ProfileData> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }


      const response = await fetch(`${API_URL}/api/me`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update profile');
      }

      const result = await response.json();
      console.log('📥 API: Received response:', result);
      
      if (result.ok && result.data) {
        const profile = result.data;
        const avatarUrl = getAvatarUrl(profile.avatar_url);
        const processedProfile = {
          ...profile,
          // Legacy fields for backward compatibility
          name: profile.full_name,
          avatar: avatarUrl,
          avatarUrl: avatarUrl,
          joinedDate: new Date(profile.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          subscriptionPlan: profile.role === 'admin' ? 'Pro' : 'Free',
          subscriptionStatus: profile.is_active ? 'active' : 'inactive' as const,
          subscriptionEndDate: profile.role === 'admin' ? 'December 25, 2025' : undefined,
        };
        console.log('✅ API: Profile processed successfully');
        return processedProfile;
      }

      console.log('❌ API: Invalid profile data received');
      throw new Error('Invalid profile data');
    } catch (error) {
      console.error('❌ API: Error in getProfile:', error);
      throw error;
    }
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      // Use Supabase direct login instead of backend API
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password
      });

      if (error) {
        // Handle Supabase auth errors
        let errorCode = 'LOGIN_FAILED';
        let field = 'general';
        
        if (error.message?.includes('Invalid login credentials')) {
          errorCode = 'INVALID_CREDENTIALS';
          field = 'general';
        } else if (error.message?.includes('Email not confirmed')) {
          errorCode = 'EMAIL_NOT_CONFIRMED';
          field = 'email';
        } else if (error.message?.includes('Too many requests')) {
          errorCode = 'RATE_LIMITED';
          field = 'general';
        }
        
        return {
          success: false,
          error: error.message || 'Login failed',
          code: errorCode,
          field: field
        };
      }

      if (data.user && data.session) {
        // Store session for compatibility
        setAuthState(data.user, data.session);
        
        return {
          success: true,
          token: data.session.access_token,
          user: data.user,
          session: data.session
        };
      }

      return { success: false, error: 'No session created' };
    } catch (error: any) {
      // Handle connection errors
      if (error.message?.includes('Failed to fetch') || error.message?.includes('ERR_CONNECTION_REFUSED')) {
        return {
          success: false,
          error: 'Cannot connect to server. Please make sure the backend is running.',
          code: 'CONNECTION_ERROR',
          field: 'general'
        } as AuthResponse;
      }
      
      const authError = getAuthError(error);
      return { 
        success: false, 
        error: authError.message,
        code: authError.code,
        field: authError.field
      } as AuthResponse;
    }
  },

  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, full_name: name })
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle structured error responses from backend
        return { 
          success: false, 
          error: result.error || 'Registration failed',
          code: result.code,
          field: result.field
        };
      }

      if (result.ok && result.data) {
        // Store session in localStorage for persistence
        if (result.data.session) {
          setAuthState(result.data.user, result.data.session);
        }
        
        return { 
          success: true, 
          token: result.data.session?.access_token,
          user: result.data.user,
          session: result.data.session,
          message: result.message
        };
      }

      return { success: true, error: 'Please check your email to verify your account' };
    } catch (error: any) {
      const authError = getAuthError(error);
      return { 
        success: false, 
        error: authError.message,
        code: authError.code,
        field: authError.field
      };
    }
  },

  async logout(): Promise<void> {
    try {
      // Call backend logout route first
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (backendError) {
        // Continue with frontend logout even if backend fails
      }
      
      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Clear local storage
      clearAuthState();
      
      // Clear any remaining session data
      localStorage.removeItem('user');
      localStorage.removeItem('supabase_session');
    } catch (error) {
      // Clear local storage anyway
      clearAuthState();
      localStorage.removeItem('user');
      localStorage.removeItem('supabase_session');
    }
  },

  async forgotPassword(email: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      // Use Supabase direct forgot password
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Failed to send password reset email'
        };
      }

      return {
        success: true,
        message: 'Jika email terdaftar, kami telah mengirim link reset password.'
      };
    } catch (error: any) {
      console.error('Forgot password error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send reset email. Please try again.'
      };
    }
  },

  async verifyEmail(token: string, type: 'signup' | 'recovery' = 'signup'): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token, type })
      });

      const result = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: result.error || 'Email verification failed',
          code: result.code,
          field: result.field
        };
      }

      if (result.ok && result.data) {
        // Store session in localStorage for persistence
        if (result.data.session) {
          setAuthState(result.data.user, result.data.session);
        }
        
        return { 
          success: true, 
          token: result.data.session?.access_token,
          user: result.data.user,
          session: result.data.session,
          message: result.message
        };
      }

      return { success: false, error: 'Email verification failed' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Email verification failed' };
    }
  },

  async resendVerification(email: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: result.error || 'Failed to resend verification email',
          message: result.message
        };
      }

      return { 
        success: true, 
        message: result.message || 'Verification email sent successfully' 
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to resend verification email' };
    }
  },

  async resendForgotPassword(email: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/auth/resend-forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: result.error || 'Failed to resend password reset email',
          message: result.message
        };
      }

      return { 
        success: true, 
        message: result.message || 'Password reset email sent successfully' 
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to resend password reset email' };
    }
  },


  isAuthenticated(): boolean {
    const authState = getAuthState();
    return authState.isAuthenticated;
  },

  async getCurrentUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  },

  async checkEmail(email: string): Promise<{ success: boolean; exists?: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/auth/check-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        throw new Error('Failed to check email');
      }

      const result = await response.json();
      
      if (result.ok) {
        return { success: true, exists: result.data.exists };
      }

      return { success: false, error: result.error };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to check email' };
    }
  },

  async checkAttempts(email: string): Promise<{
    success: boolean;
    data?: {
      allowed: boolean;
      remainingAttempts: number;
      blockedUntil?: string;
      isSuspended: boolean;
      suspensionReason?: string;
      timeRemaining?: string;
    };
    error?: string;
  }> {
    try {
      const response = await fetch(`${API_URL}/api/auth/check-attempts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to check attempts');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to check attempts' };
    }
  },

  async verifyOTP(email: string, otp: string): Promise<{ success: boolean; error?: string; token?: string }> {
    try {
      console.log('API: Verifying OTP for email:', email);
      
      // Use Supabase OTP verification for reauthentication
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email'
      });

      if (error) {
        throw new Error(error.message || 'OTP verification failed');
      }

      const tokenValue = (data.session?.access_token ?? undefined) as string | undefined;
      return { success: true, token: tokenValue } as { success: boolean; error?: string; token?: string };
    } catch (error: any) {
      return { success: false, error: error.message || 'OTP verification failed' };
    }
  },

  async resetPassword(newPassword: string): Promise<{ ok: boolean; error?: string }> {
    try {
      // Get current session to get the token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }
      
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ password: newPassword })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to reset password');
      }

      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || 'Failed to reset password' };
    }
  },

  // Subscription API methods
  async getSubscriptionPlans(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/subscription/plans`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to get subscription plans');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to get subscription plans' };
    }
  },

  async getPaymentMethods(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/subscription/payment-methods`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to get payment methods');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to get payment methods' };
    }
  },

  async createSubscriptionOrder(data: {
    planId: string;
    paymentMethod: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }

      const response = await fetch(`${API_URL}/api/subscription/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create subscription order');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create subscription order' };
    }
  },

  async getSubscriptionStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }

      const response = await fetch(`${API_URL}/api/subscription/status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to get subscription status');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to get subscription status' };
    }
  },

  async cancelSubscription(data: {
    reason?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }

      const response = await fetch(`${API_URL}/api/subscription/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel subscription');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to cancel subscription' };
    }
  },

  async getPaymentActivity(params?: {
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }

      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());

      const response = await fetch(`${API_URL}/api/subscription/payment-activity?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to get payment activity');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to get payment activity' };
    }
  },

  async checkPaymentStatus(orderId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }

      const response = await fetch(`${API_URL}/api/subscription/check-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ orderId })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to check payment status');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to check payment status' };
    }
  },

  async regenerateSnapToken(data: {
    transactionId: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }

      const response = await fetch(`${API_URL}/api/subscription/regenerate-snap-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to regenerate snap token');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to regenerate snap token' };
    }
  },

  async cancelPendingTransaction(data: {
    transactionId: string;
    reason?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }

      const response = await fetch(`${API_URL}/api/subscription/cancel-pending`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel pending transaction');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to cancel pending transaction' };
    }
  },

  async updatePaymentMethod(params: {
    transactionId: string;
    paymentMethod: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }

      const response = await fetch(`${API_URL}/api/subscription/update-payment-method`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(params)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update payment method');
      }

      return { success: true, data: result.data };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update payment method' };
    }
  },

  async changePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session found');
      }

      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: result.error || 'Failed to change password'
        };
      }

      return { 
        success: true, 
        message: result.message || 'Password changed successfully'
      };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Failed to change password'
      };
    }
  },

  // RRC API methods
  async listRRCInputs(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrc/inputs`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to list RRC inputs');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to list RRC inputs' };
    }
  },

  async getRRCStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrc/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get RRC status');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get RRC status' };
    }
  },

  // Debug API methods
  async triggerRRCUpdate(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrc/debug/trigger-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to trigger RRC update');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to trigger RRC update' };
    }
  },

  // Unified trigger with options
  async triggerGeneration(feature: 'rrc' | 'rrg' | 'seasonal' | 'all' = 'all'): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/trigger/generate?feature=${feature}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to trigger generation');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to trigger generation' };
    }
  },

  async getGenerationStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/trigger/status`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get status');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get status' };
    }
  },

  async stopRRCGeneration(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrc/debug/stop-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to stop RRC generation');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to stop RRC generation' };
    }
  },

  async clearRRCCache(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrc/debug/clear-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to clear RRC cache');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to clear RRC cache' };
    }
  },

  // RRG API methods
  async listRRGInputs(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrg/inputs`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to list RRG inputs');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to list RRG inputs' };
    }
  },

  async getRRGData(type: 'stock' | 'sector' | 'index', items: string[], index: string = 'COMPOSITE', startDate?: string, endDate?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      params.append('type', type);
      items.forEach(item => params.append('items', item));
      params.append('index', index);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const res = await fetch(`${API_URL}/api/rrg/data?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get RRG data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get RRG data' };
    }
  },

  async getRRGStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrg/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get RRG status');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get RRG status' };
    }
  },

  // Debug RRG API methods
  async triggerRRGUpdate(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrg/debug/trigger-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to trigger RRG update');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to trigger RRG update' };
    }
  },

  async stopRRGGeneration(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrg/debug/stop-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to stop RRG generation');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to stop RRG generation' };
    }
  },

  async clearRRGCache(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrg/debug/clear-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to clear RRG cache');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to clear RRG cache' };
    }
  },

  // RRG Scanner API
  async getRRGScannerData(type: 'stock' | 'sector'): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrg/scanner/${type}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get RRG scanner data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get RRG scanner data' };
    }
  },

  // Seasonality API
  async getSeasonalityInputs(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/seasonality/inputs`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get seasonality inputs');
      return { success: true, data: json };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get seasonality inputs' };
    }
  },

  async clearSeasonalityCache(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/seasonality/debug/clear-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to clear seasonality cache');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to clear seasonality cache' };
    }
  },

  async getRRCData(type: 'stock' | 'sector' | 'index', items: string[], index: string = 'COMPOSITE'): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      params.append('type', type);
      items.forEach(item => params.append('items', item));
      params.append('index', index);
      
      const res = await fetch(`${API_URL}/api/rrc/data?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get RRC data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get RRC data' };
    }
  },

  async preGenerateRRC(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/rrc/pre-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to pre-generate RRC');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to pre-generate RRC' };
    }
  },

  // Trend Filter API
  async getTrendFilterStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/trend-filter/status`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get trend filter status');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get trend filter status' };
    }
  },

  async generateTrendFilter(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/trend-filter/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate trend filter');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to generate trend filter' };
    }
  },

  async getTrendFilterData(period?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const url = period 
        ? `${API_URL}/api/trend-filter/data/${period}`
        : `${API_URL}/api/trend-filter/data`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get trend filter data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get trend filter data' };
    }
  },

  async getTrendFilterPeriods(): Promise<{ success: boolean; data?: string[]; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/trend-filter/periods`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get trend filter periods');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get trend filter periods' };
    }
  },

  // Stock Data API
  async getStockList(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/stock/list`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get stock list');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get stock list' };
    }
  },

  async getStockData(stockCode: string, startDate?: string, endDate?: string, limit?: number): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (limit) params.append('limit', limit.toString());
      
      const res = await fetch(`${API_URL}/api/stock/data/${stockCode}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get stock data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get stock data' };
    }
  },

  // Broker Summary Data
  async getBrokerSummaryData(stockCode: string, date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/broker/summary/${stockCode}?date=${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get broker summary data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get broker summary data' };
    }
  },

  // Broker Transaction Data
  async getBrokerTransactionData(brokerCode: string, date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/broker/transaction/${brokerCode}?date=${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get broker transaction data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get broker transaction data' };
    }
  },

  // Broker Inventory Data
  async getBrokerInventoryData(stockCode: string, date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/broker/inventory/${stockCode}?date=${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get broker inventory data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get broker inventory data' };
    }
  },

  async getMultipleStocksData(stockCodes: string[], startDate?: string, endDate?: string, limit?: number): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      stockCodes.forEach(code => params.append('stocks', code));
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (limit) params.append('limit', limit.toString());
      
      const res = await fetch(`${API_URL}/api/stock/data?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get stocks data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get stocks data' };
    }
  },

  // Footprint Data API
  async getFootprintData(stockCode: string, date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/stock/footprint/${stockCode}?date=${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get footprint data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get footprint data' };
    }
  },

};
