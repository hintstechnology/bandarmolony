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
  role: 'user' | 'admin' | 'developer';
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
  subscriptionStatus?: 'active' | 'inactive' | 'trial';
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

// Global 401 handler - emit event when 401 detected
const emit401Event = () => {
  console.log('🚨 API: 401 detected, emitting global-401 event');
  window.dispatchEvent(new CustomEvent('global-401'));
};

// Helper function to check response and handle 401
const checkResponse = async (response: Response, endpoint: string) => {
  if (response.status === 401) {
    console.log(`🚨 API: 401 from ${endpoint}`);
    emit401Event();
    throw new Error('Session expired. Please sign in again.');
  }
  return response;
};

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

  async getWatchlistData(symbols: string[]): Promise<{ success: boolean; data?: { stocks: Array<{ symbol: string; name: string; price: number; change: number; changePercent: number; lastUpdate?: string }> }; error?: string }> {
    if (!symbols.length) {
      return { success: true, data: { stocks: [] } };
    }

    const uniqueSymbols = Array.from(new Set(symbols.map((sym) => sym.trim().toUpperCase()).filter(Boolean)));
    if (!uniqueSymbols.length) {
      return { success: true, data: { stocks: [] } };
    }

    const params = new URLSearchParams();
    params.set('symbols', uniqueSymbols.join(','));

    try {
      const response = await fetch(`${API_URL}/api/watchlist?${params.toString()}`);
      const json = await response.json();

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to fetch watchlist data');
      }

      return {
        success: true,
        data: {
          stocks: Array.isArray(json?.data?.stocks) ? json.data.stocks : [],
        },
      };
    } catch (error: any) {
      console.error('❌ API: Failed to fetch watchlist data', error);
      return { success: false, error: error?.message || 'Failed to fetch watchlist data' };
    }
  },

  async getWatchlistSnapshot(): Promise<{ success: boolean; data?: { stocks: Array<{ symbol: string; name: string; price: number; change: number; changePercent: number; lastUpdate?: string }> }; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/watchlist`);
      const json = await response.json();

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to fetch watchlist snapshot');
      }

      return {
        success: true,
        data: {
          stocks: Array.isArray(json?.data?.stocks) ? json.data.stocks : [],
        },
      };
    } catch (error: any) {
      console.error('❌ API: Failed to fetch watchlist snapshot', error);
      return { success: false, error: error?.message || 'Failed to fetch watchlist snapshot' };
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
      
      // Check for 401 using global handler
      await checkResponse(response, '/api/me');
      
      if (!response.ok) {
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
          subscriptionPlan: (profile.role === 'admin' || profile.role === 'developer') 
            ? 'Pro' 
            : (profile.subscription_plan || 'Free'),
          subscriptionStatus: (profile.role === 'admin' || profile.role === 'developer')
            ? ('active' as const)
            : (profile.subscription_status as 'active' | 'inactive' | 'trial' | undefined) || 'inactive',
          subscriptionEndDate: (profile.role === 'admin' || profile.role === 'developer')
            ? undefined
            : (profile.subscription_end_date || undefined), // Admin & Developer: No end date (active forever)
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
          subscriptionPlan: (profile.role === 'admin' || profile.role === 'developer') 
            ? 'Pro' 
            : (profile.subscription_plan || 'Free'),
          subscriptionStatus: (profile.role === 'admin' || profile.role === 'developer')
            ? ('active' as const)
            : (profile.subscription_status as 'active' | 'inactive' | 'trial' | undefined) || 'inactive',
          subscriptionEndDate: (profile.role === 'admin' || profile.role === 'developer')
            ? undefined
            : (profile.subscription_end_date || undefined), // Admin & Developer: No end date (active forever)
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

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      console.log('📤 API: Changing password...');
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const result = await response.json();
      
      if (!response.ok) {
        console.error('❌ API: Change password failed:', result);
        throw new Error(result.error || result.message || 'Failed to change password');
      }

      console.log('✅ API: Password changed successfully');
      
      // After successful password change, we need to refresh the session
      // This is important because Supabase might issue a new token
      const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.warn('⚠️ API: Session refresh after password change failed:', refreshError);
        // Don't throw - password was changed successfully, just session refresh failed
      } else if (newSession) {
        console.log('✅ API: Session refreshed successfully after password change');
      }

      return { success: true, message: result.message || 'Password changed successfully' };
    } catch (error: any) {
      console.error('❌ API: changePassword error:', error);
      throw error;
    }
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      // Use backend login to ensure session is created in database
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle structured error responses from backend
        return { 
          success: false, 
          error: result.error || 'Login failed',
          code: result.code,
          field: result.field
        };
      }

      if (result.ok && result.data) {
        // Set session in Supabase client first
        if (result.data.session) {
          await supabase.auth.setSession({
            access_token: result.data.session.access_token,
            refresh_token: result.data.session.refresh_token
          });
          // Then store in localStorage for persistence
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

      return { success: false, error: 'Login failed' };
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
      // Call backend logout route first (session-specific logout)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          });
        }
      } catch (backendError) {
        console.warn('Backend logout failed:', backendError);
        // Continue with frontend logout even if backend fails
      }
      
      // Clear ALL auth-related storage (including all sb-* keys)
      // DO: Clear storage BEFORE reload, DON'T call signOut() (can re-create session)
      clearAuthState();
      
      // Use window.location.replace for clean reload (don't call signOut())
      // This prevents Supabase from re-creating session from memory cache
      // The reload will ensure completely clean state
      // Note: AuthContext will handle the redirect if needed
      console.log('API: Storage cleared, reload will be handled by AuthContext or redirect');
    } catch (error) {
      console.error('Logout error:', error);
      // Clear local storage anyway on error
      clearAuthState();
    }
  },

  async logoutAllDevices(): Promise<void> {
    try {
      // Call backend logout-all route first
      try {
        await fetch(`${API_URL}/api/auth/logout-all`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (backendError) {
        // Continue with frontend logout even if backend fails
      }
      
      // Clear ALL auth-related storage (including all sb-* keys)
      // DO: Clear storage BEFORE reload, DON'T call signOut() (can re-create session)
      clearAuthState();
      
      // Use window.location.replace for clean reload (don't call signOut())
      // This prevents Supabase from re-creating session from memory cache
      // The reload will ensure completely clean state
      // Note: AuthContext will handle the redirect if needed
      console.log('API: Storage cleared for all devices, reload will be handled by AuthContext or redirect');
    } catch (error) {
      console.error('Logout all devices error:', error);
      // Clear local storage anyway on error
      clearAuthState();
    }
  },

  async forgotPassword(email: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      // Use Supabase direct forgot password
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`
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

  async startTrial(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_URL}/api/subscription/start-trial`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    await checkResponse(response, '/api/subscription/start-trial');

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to start trial');
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || 'Failed to start trial');
    }
  },

  async getTrialStatus(): Promise<{ eligible: boolean; hasActiveTrial: boolean; trial?: any }> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('No active session');
    }

    const response = await fetch(`${API_URL}/api/subscription/trial-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    await checkResponse(response, '/api/subscription/trial-status');

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get trial status');
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || 'Failed to get trial status');
    }

    return result.data;
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

  // Money Flow API
  async getMoneyFlowData(stockCode: string, limit?: number): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      
      const res = await fetch(`${API_URL}/api/moneyflow/stock/${stockCode}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get money flow data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get money flow data' };
    }
  },

  // Foreign Flow API
  async getForeignFlowData(stockCode: string, limit?: number): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      
      const res = await fetch(`${API_URL}/api/foreign/stock/${stockCode}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get foreign flow data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get foreign flow data' };
    }
  },

  // Holding/Shareholding API
  async getHoldingData(stockCode: string, limit?: number): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      
      const res = await fetch(`${API_URL}/api/holding/stock/${stockCode}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get holding data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get holding data' };
    }
  },

  // Shareholders API
  async getShareholdersData(stockCode: string, limit?: number): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      
      const res = await fetch(`${API_URL}/api/shareholders/stock/${stockCode}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get shareholders data');
      return { success: true, data: json };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get shareholders data' };
    }
  },

  // Get list of stocks from shareholders directory
  async getShareholdersStockList(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/shareholders/list`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get shareholders stock list');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get shareholders stock list' };
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

  // Get stock list with company names from emiten_detail_list.csv
  async getStockListWithCompanyNames(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/stock-list`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get stock list with company names');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get stock list with company names' };
    }
  },

  // Get stock detail for specific stock code
  async getStockDetail(stockCode: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/stock-list/${stockCode}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get stock detail');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get stock detail' };
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

  // Get latest available date for a specific stock
  async getLatestStockDate(stockCode: string): Promise<{ success: boolean; data?: { latestDate: string; stockCode: string }; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/stock/latest-date/${stockCode}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get latest date');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get latest date' };
    }
  },

  // Get bid/ask data for specific stock and date
  async getBidAskData(stockCode: string, date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/bidask/stock/${stockCode}/${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get bid/ask data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get bid/ask data' };
    }
  },

  // Get Buy/Sell Frequency data for specific stock and date
  async getBuySellFrequencyData(stockCode: string, date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/bidask/frequency/${stockCode}/${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get Buy/Sell Frequency data');
      console.log(`📊 API getBuySellFrequencyData response for ${stockCode} on ${date}:`, {
        success: json.success,
        dataExists: !!json.data,
        dataDataExists: !!json.data?.data,
        dataLength: json.data?.data?.length || 0,
        sampleData: json.data?.data?.slice(0, 2) || []
      });
      return { success: true, data: json.data };
    } catch (err: any) {
      console.error(`❌ API getBuySellFrequencyData error for ${stockCode} on ${date}:`, err);
      return { success: false, error: err.message || 'Failed to get Buy/Sell Frequency data' };
    }
  },


  // Get broker list from csv_input/broker_list.csv
  async getBrokerList(): Promise<{ success: boolean; data?: { brokers: string[] }; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/broker/list`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get broker list');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get broker list' };
    }
  },

  // Broker Transaction Data
  async getBrokerTransactionData(brokerCode: string, date: string, market?: 'RG' | 'TN' | 'NG' | ''): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Convert YYYY-MM-DD to YYYYMMDD format
      const dateStr = date.includes('-') ? date.replace(/-/g, '') : date;
      const params = new URLSearchParams();
      params.append('date', dateStr);
      if (market) {
        params.append('market', market);
      }
      const res = await fetch(`${API_URL}/api/broker/transaction/${brokerCode}?${params.toString()}`, {
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

  // Done Summary Data API
  async getDoneSummaryData(stockCode: string, date: string, limit?: number): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      
      const res = await fetch(`${API_URL}/api/done-summary/stock/${stockCode}/${date}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get done summary data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get done summary data' };
    }
  },

  // Get list of available dates from done-summary
  async getDoneSummaryDates(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/done-summary/dates`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get done summary dates');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get done summary dates' };
    }
  },

  // Get list of available stocks from done-summary
  async getDoneSummaryStocks(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/done-summary/stocks`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get done summary stocks');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get done summary stocks' };
    }
  },

  // Get broker breakdown data for specific stock and date
  async getBrokerBreakdownData(stockCode: string, date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/done-summary/broker-breakdown/${stockCode}/${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get broker breakdown data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get broker breakdown data' };
    }
  },

  // Batch get broker breakdown data for multiple dates
  async getBrokerBreakdownBatch(stockCode: string, dates: string[]): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const promises = dates.map(date => this.getBrokerBreakdownData(stockCode, date));
      const results = await Promise.allSettled(promises);
      
      const dataByDate: { [date: string]: any } = {};
      let successCount = 0;
      
      results.forEach((result, index) => {
        const date = dates[index];
        if (date) {
          if (result.status === 'fulfilled' && result.value.success) {
            dataByDate[date] = result.value.data;
            successCount++;
          } else {
            dataByDate[date] = { brokerBreakdownData: [], total: 0 };
          }
        }
      });
      
      return { 
        success: successCount > 0, 
        data: { 
          dataByDate, 
          successCount, 
          totalDates: dates.length 
        } 
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get batch broker breakdown data' };
    }
  },

  // Batch get done summary data for multiple dates - much faster
  async getDoneSummaryBatch(stockCode: string, dates: string[]): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const datesParam = dates.join(',');
      const res = await fetch(`${API_URL}/api/done-summary/batch/${stockCode}?dates=${datesParam}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get batch done summary data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get batch done summary data' };
    }
  },

  // Pagination for large datasets
  async getDoneSummaryPagination(stockCode: string, date: string, page: number = 1, pageSize: number = 1000, limit: number = 10000): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/done-summary/pagination/${stockCode}/${date}?page=${page}&pageSize=${pageSize}&limit=${limit}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get paginated done summary data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get paginated done summary data' };
    }
  },

  // ===== BREAK DONE TRADE API =====
  
  // Get list of available dates from done_detail directory
  async getBreakDoneTradeDates(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/break-done-trade/dates`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get break done trade dates');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get break done trade dates' };
    }
  },

  // Get list of available stocks for a specific date from done_detail directory
  async getBreakDoneTradeStocks(date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/break-done-trade/stocks/${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get break done trade stocks');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get break done trade stocks' };
    }
  },

  // Get break done trade data for specific stock and date
  async getBreakDoneTradeData(stockCode: string, date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/break-done-trade/data/${date}/${stockCode}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get break done trade data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get break done trade data' };
    }
  },

  // Batch get break done trade data for multiple dates
  async getBreakDoneTradeBatch(stockCode: string, dates: string[]): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const promises = dates.map(date => this.getBreakDoneTradeData(stockCode, date));
      const results = await Promise.allSettled(promises);
      
      const dataByDate: { [date: string]: any } = {};
      let successCount = 0;
      
      results.forEach((result, index) => {
        const date = dates[index];
        if (date) {
          if (result.status === 'fulfilled' && result.value.success) {
            dataByDate[date] = result.value.data;
            successCount++;
          } else {
            dataByDate[date] = { doneTradeData: [], total: 0 };
          }
        }
      });
      
      return { 
        success: successCount > 0, 
        data: { 
          dataByDate, 
          successCount, 
          totalDates: dates.length 
        } 
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get batch break done trade data' };
    }
  },

  // ===== ACCUMULATION DISTRIBUTION API =====
  
  // Get list of available dates from accumulation_distribution directory
  async getAccumulationDistributionDates(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/accumulation/dates`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get accumulation distribution dates');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get accumulation distribution dates' };
    }
  },

  // Get accumulation distribution data for specific date
  async getAccumulationDistributionData(date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/accumulation/data/${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get accumulation distribution data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get accumulation distribution data' };
    }
  },

  // Calculate and store accumulation distribution data for specific date
  async calculateAccumulationDistribution(date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/accumulation/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to calculate accumulation distribution data');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to calculate accumulation distribution data' };
    }
  },


  async getBidAskDates(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/bidask/dates`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get bid/ask dates');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get bid/ask dates' };
    }
  },

  async getBidAskStocks(date: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/bidask/stocks/${date}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get bid/ask stocks');
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get bid/ask stocks' };
    }
  },

  // Batch get bid/ask data for multiple dates
  async getBidAskBatch(stockCode: string, dates: string[]): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const promises = dates.map(date => this.getBidAskData(stockCode, date));
      const results = await Promise.allSettled(promises);
      
      const dataByDate: { [date: string]: any } = {};
      let successCount = 0;
      
      results.forEach((result, index) => {
        const date = dates[index];
        if (date) {
          if (result.status === 'fulfilled' && result.value.success) {
            dataByDate[date] = result.value.data;
            successCount++;
          } else {
            dataByDate[date] = { data: [], total: 0 };
          }
        }
      });
      
      return { 
        success: successCount > 0, 
        data: { 
          dataByDate, 
          successCount, 
          totalDates: dates.length 
        } 
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get batch bid/ask data' };
    }
  },

  // Broker Summary API
  getBrokerSummaryData: async (stockCode: string, date: string, market: 'RG' | 'TN' | 'NG' | '' = '') => {
    try {
      // Convert YYYY-MM-DD to YYYYMMDD format
      const dateStr = date.includes('-') ? date.replace(/-/g, '') : date;
      // When market is empty string (All Trade), send it as empty string
      const marketParam = market || '';
      const url = marketParam ? `${API_URL}/api/broker-summary/summary/${stockCode}?date=${dateStr}&market=${marketParam}` : `${API_URL}/api/broker-summary/summary/${stockCode}?date=${dateStr}`;
      console.log(`[API] Fetching broker summary: ${url}`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        console.error(`[API] Broker summary request failed: ${response.status}`, data);
        return { success: false, error: data.error || `HTTP ${response.status}: Failed to get broker summary data` };
      }
      
      console.log(`[API] Broker summary response:`, { success: data.success, hasData: !!data.data, hasBrokerData: !!data.data?.brokerData, brokerDataLength: data.data?.brokerData?.length || 0 });
      return data;
    } catch (err: any) {
      console.error(`[API] Broker summary fetch error:`, err);
      return { success: false, error: err.message || 'Failed to get broker summary data' };
    }
  },

  // Get available dates for broker summary
  getBrokerSummaryDates: async () => {
    try {
      // Increase timeout to 60 seconds for Azure Blob Storage operations
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
      
      const response = await fetch(`${API_URL}/api/broker/dates`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[API] getBrokerSummaryDates error response:', response.status, errorText);
        return { 
          success: false, 
          error: `HTTP ${response.status}: ${errorText || 'Failed to get broker summary dates'}` 
        };
      }
      
      const data = await response.json();
      console.log('[API] getBrokerSummaryDates success:', data);
      return data;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.error('[API] getBrokerSummaryDates timeout after 60 seconds');
        return { success: false, error: 'Request timeout - Azure Blob Storage operation took too long' };
      }
      console.error('[API] getBrokerSummaryDates error:', err);
      return { success: false, error: err.message || 'Failed to get broker summary dates' };
    }
  },

  // Get available stocks for broker summary on specific date
  getBrokerSummaryStocks: async (date: string, market: 'RG' | 'TN' | 'NG' | '' = '') => {
    try {
      // Convert YYYY-MM-DD to YYYYMMDD format
      const dateStr = date.includes('-') ? date.replace(/-/g, '') : date;
      // When market is empty string (All Trade), send it as empty string
      const marketParam = market || '';
      const url = marketParam ? `${API_URL}/api/broker-summary/stocks?date=${dateStr}&market=${marketParam}` : `${API_URL}/api/broker-summary/stocks?date=${dateStr}`;
      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get broker summary stocks' };
    }
  },

  // Get broker inventory data (cumulative net flow)
  getBrokerInventoryData: async (stockCode: string, brokerCode: string) => {
    try {
      const url = `${API_URL}/api/broker-inventory/${stockCode}/${brokerCode}`;
      console.log(`[API] Fetching broker inventory: ${url}`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        console.error(`[API] Broker inventory request failed: ${response.status}`, data);
        return { success: false, error: data.error || `HTTP ${response.status}: Failed to get broker inventory data` };
      }
      
      console.log(`[API] Broker inventory response:`, { 
        success: data.success, 
        hasData: !!data.data, 
        inventoryDataLength: data.data?.inventoryData?.length || 0 
      });
      return data;
    } catch (err: any) {
      console.error(`[API] Broker inventory fetch error:`, err);
      return { success: false, error: err.message || 'Failed to get broker inventory data' };
    }
  },

  // Get available brokers for a stock from broker_inventory folder
  getBrokerInventoryBrokers: async (stockCode: string) => {
    try {
      const url = `${API_URL}/api/broker-inventory/brokers/${stockCode}`;
      console.log(`[API] Fetching broker inventory brokers: ${url}`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        console.error(`[API] Broker inventory brokers request failed: ${response.status}`, data);
        return { success: false, error: data.error || `HTTP ${response.status}: Failed to get broker inventory brokers` };
      }
      
      console.log(`[API] Broker inventory brokers response:`, { 
        success: data.success, 
        brokersCount: data.data?.brokers?.length || 0 
      });
      return data;
    } catch (err: any) {
      console.error(`[API] Broker inventory brokers fetch error:`, err);
      return { success: false, error: err.message || 'Failed to get broker inventory brokers' };
    }
  },

  // Get top brokers for a specific date
  getTopBrokers: async (date: string) => {
    try {
      // Convert YYYY-MM-DD to YYYYMMDD format
      const dateStr = date.includes('-') ? date.replace(/-/g, '') : date;
      const url = `${API_URL}/api/top-broker?date=${dateStr}`;
      console.log(`[API] Fetching top brokers: ${url}`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        console.error(`[API] Top brokers request failed: ${response.status}`, data);
        return { success: false, error: data.error || `HTTP ${response.status}: Failed to get top brokers` };
      }
      
      console.log(`[API] Top brokers response:`, { 
        success: data.success, 
        brokersCount: data.data?.brokers?.length || 0 
      });
      return data;
    } catch (err: any) {
      console.error(`[API] Top brokers fetch error:`, err);
      return { success: false, error: err.message || 'Failed to get top brokers' };
    }
  },

  // Get available dates for broker transaction data
  async getBrokerTransactionDates(): Promise<{ success: boolean; data?: { dates: string[] }; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/broker/transaction/dates`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get available dates');
      return { success: true, data: data.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get available dates' };
    }
  },

  // Scheduler Logs API
  async getSchedulerLog(logId: string | number): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/trigger/logs/${logId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get scheduler log');
      return { success: true, data: data.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get scheduler log' };
    }
  },

  async cancelSchedulerLog(logId: string | number, reason?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/trigger/logs/${logId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to cancel scheduler log');
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to cancel scheduler log' };
    }
  },

  async getSchedulerLogs(options?: { limit?: number; offset?: number; status?: string; feature_name?: string }): Promise<{ success: boolean; data?: any[]; total?: number; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.offset) params.append('offset', options.offset.toString());
      if (options?.status) params.append('status', options.status);
      if (options?.feature_name) params.append('feature_name', options.feature_name);

      const response = await fetch(`${API_URL}/api/trigger/logs?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get scheduler logs');
      return { success: true, data: data.data, total: data.total };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get scheduler logs' };
    }
  },

  async triggerBrokerBreakdownData(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/trigger/broker-breakdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to trigger broker breakdown');
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to trigger broker breakdown' };
    }
  },

  // Scheduler Management API
  async getSchedulerConfig(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/developer/scheduler/config`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get scheduler config');
      return { success: true, data: data.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get scheduler config' };
    }
  },

  async updateSchedulerConfig(config: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/developer/scheduler/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify(config)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update scheduler config');
      return { success: true, data: data.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update scheduler config' };
    }
  },

  async stopScheduler(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/developer/scheduler/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to stop scheduler');
      return { success: true, data: data.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to stop scheduler' };
    }
  },

  async startScheduler(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/developer/scheduler/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start scheduler');
      return { success: true, data: data.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to start scheduler' };
    }
  },

  async getSchedulerStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/developer/scheduler/status`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get scheduler status');
      return { success: true, data: data.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get scheduler status' };
    }
  },

  async getAllPhasesStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/developer/scheduler/phases`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get phases status');
      return { success: true, data: data.data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get phases status' };
    }
  },

  async triggerPhase(phaseId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/developer/scheduler/phases/${phaseId}/trigger`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to trigger phase');
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to trigger phase' };
    }
  },


};
