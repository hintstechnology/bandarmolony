import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Eye, EyeOff, ArrowLeft, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isFatalError, setIsFatalError] = useState(false); // For validation errors (link expired, etc)

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Handle password reset access on component mount
  useEffect(() => {
    const handlePasswordResetAccess = async () => {
      // First check if we came from SupabaseRedirectHandler with a valid session
      const passwordResetSession = localStorage.getItem('passwordResetSession');
      if (passwordResetSession === 'true') {
        console.log('ResetPasswordPage: Coming from SupabaseRedirectHandler with valid session');
        
        // Wait a bit for session to be fully established
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify session is still valid
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error || !session?.user) {
            console.error('ResetPasswordPage: Session invalid, clearing flag');
            localStorage.removeItem('passwordResetSession');
            setError('Session expired. Please request a new password reset.');
            setIsFatalError(true); // Fatal error - show full page error
            setIsValidating(false);
            return;
          }
          
          console.log('ResetPasswordPage: Session verified, proceeding');
          console.log('ResetPasswordPage: Current path:', window.location.pathname);
          setIsValidating(false);
          return;
        } catch (error) {
          console.error('ResetPasswordPage: Error verifying session:', error);
          localStorage.removeItem('passwordResetSession');
          setError('Session expired. Please request a new password reset.');
          setIsFatalError(true); // Fatal error - show full page error
          setIsValidating(false);
          return;
        }
      }
      
      const code = searchParams.get('code');
      const type = searchParams.get('type');
      const access_token = searchParams.get('access_token');
      const refresh_token = searchParams.get('refresh_token');
      
      console.log('ResetPasswordPage: URL params:', { code, type, access_token: !!access_token, refresh_token: !!refresh_token });
      
      // Check if this is a password reset flow
      if (type === 'recovery' && (code || (access_token && refresh_token))) {
        try {
          // For implicit flow, we might have access_token and refresh_token directly
          if (access_token && refresh_token) {
            // Set session directly with tokens
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token
            });
            
            if (error) {
              console.error('Session set error:', error);
              setError('Invalid or expired reset link. Please request a new password reset.');
              setIsValidating(false);
              return;
            }
            
            if (data.session) {
              console.log('Session set successful');
              setIsValidating(false);
              return;
            }
          }
          
          // If we have code, try to exchange it
          if (code) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            
            if (error) {
              console.error('Code exchange error:', error);
              setError('Invalid or expired reset link. Please request a new password reset.');
              setIsValidating(false);
              return;
            }
            
            if (data.session) {
              console.log('Code exchange successful, session created');
              setIsValidating(false);
              return;
            }
          }
          
          // Clear flag if failed to create session
          localStorage.removeItem('passwordResetSession');
          setError('Failed to create session. Please try again.');
          setIsFatalError(true); // Fatal error
          setIsValidating(false);
        } catch (err) {
          console.error('Password reset access error:', err);
          // Clear flag on error
          localStorage.removeItem('passwordResetSession');
          setError('Invalid or expired reset link. Please request a new password reset.');
          setIsFatalError(true); // Fatal error
          setIsValidating(false);
        }
      } else if (type === 'recovery' || code || access_token) {
        // Allow access if we have any of these parameters
        setIsValidating(false);
      } else {
        // Clear flag if no valid parameters
        localStorage.removeItem('passwordResetSession');
        setError('Akses tidak diizinkan. Gunakan link dari email untuk reset password.');
        setIsFatalError(true); // Fatal error
        setIsValidating(false);
      }
    };

    handlePasswordResetAccess();
  }, [navigate, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Password dan konfirmasi password tidak sama');
      return;
    }
    
    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }

    setIsLoading(true);
    
    try {
      // Update password using current session
      const { error } = await supabase.auth.updateUser({ 
        password: password 
      });
      
      console.log('Password update result:', { error: error?.message });
      
      if (error) {
        if (error.message?.includes('same_password') || 
            error.message?.includes('New password should be different') ||
            error.message?.includes('Password dan konfirmasi')) {
          // Don't clear flag - user can retry with different password
          const errorMsg = 'Password baru harus berbeda dengan password lama';
          setError(errorMsg);
          toast.error(errorMsg);
        } else if (error.message?.includes('Password should be at least')) {
          // Don't clear flag - user can retry with longer password
          const errorMsg = 'Password harus minimal 6 karakter';
          setError(errorMsg);
          toast.error(errorMsg);
        } else if (error.message?.includes('session_not_found') || error.message?.includes('403')) {
          // Clear flag for session errors
          localStorage.removeItem('passwordResetSession');
          setError('Session expired. Please request a new password reset.');
          setIsFatalError(true);
        } else {
          // Don't clear flag for unknown errors - let user retry
          console.error('Unknown password update error:', error);
          const errorMsg = error.message || 'Gagal mengubah password';
          setError(errorMsg);
          toast.error(errorMsg);
        }
      } else {
        setSuccess(true);
        // Clear the password reset session flag
        localStorage.removeItem('passwordResetSession');
        
        // Sign out user after password reset
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          console.error('Sign out error after password reset:', signOutError);
        }
        
        toast.success('Password Anda berhasil diubah! Silakan login dengan password baru.');
        
        // Redirect to login immediately with success parameter
        navigate('/auth?mode=login&password_reset=success', { replace: true });
      }
    } catch (err: any) {
      // DON'T clear flag in catch - error might be retryable
      console.error('Password reset catch error:', err);
      
      // Check if it's a known retryable error
      if (err.message?.includes('same_password') || 
          err.message?.includes('New password should be different') ||
          err.message?.includes('Password dan konfirmasi')) {
        const errorMsg = 'Password baru harus berbeda dengan password lama';
        setError(errorMsg);
        toast.error(errorMsg);
      } else if (err.message?.includes('Password should be at least')) {
        const errorMsg = 'Password harus minimal 6 karakter';
        setError(errorMsg);
        toast.error(errorMsg);
      } else {
        const errorMsg = err.message || 'Terjadi kesalahan saat mengubah password';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
              <h2 className="text-xl font-semibold mb-2">Memverifikasi Link Reset Password</h2>
              <p className="text-muted-foreground">
                Sedang memverifikasi link reset password Anda...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fatal error state (validation errors - show full page error)
  if (isFatalError && error && !isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-red-600 mb-4">Link Tidak Valid</h2>
              <p className="text-muted-foreground mb-6">
                {error}
              </p>
              <Button
                onClick={() => navigate('/auth?mode=login', { replace: true })}
                className="w-full"
              >
                Kembali ke Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-green-600 mb-4">Password Berhasil Diubah!</h2>
              <p className="text-muted-foreground mb-6">
                Password Anda telah berhasil diubah. Anda akan diarahkan ke halaman login dalam beberapa detik.
              </p>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mx-auto mb-4"></div>
              <Button
                onClick={() => navigate('/auth?mode=login', { replace: true })}
                className="w-full"
              >
                Kembali ke Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
            <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
          <CardDescription>Masukkan password baru Anda untuk melanjutkan</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="password" className="text-sm font-medium text-foreground block mb-2">Password Baru</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password baru"
                    required
                    className="pr-10 h-12 px-4 py-3"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground block mb-2">Konfirmasi Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Konfirmasi password baru"
                    required
                    className="pr-10 h-12 px-4 py-3"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mengubah Password...
                </>
              ) : (
                'Ubah Password'
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                // Clear the password reset session flag
                localStorage.removeItem('passwordResetSession');
                navigate('/auth?mode=login', { replace: true });
              }}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}