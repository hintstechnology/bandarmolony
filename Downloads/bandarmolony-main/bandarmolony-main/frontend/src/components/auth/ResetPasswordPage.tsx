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
  const [isValidSession, setIsValidSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isPasswordResetSession, setIsPasswordResetSession] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Strict validation: Only allow access from password reset email link
  useEffect(() => {
    const validatePasswordResetAccess = async () => {
      try {
        // Check if password reset session flag exists (prevents re-access after password change)
        const hasPasswordResetFlag = localStorage.getItem('passwordResetSession');
        
        // Check if this is a password reset flow
        const isPasswordResetFlow = hasPasswordResetFlag;

        if (!isPasswordResetFlow) {
          toast.error('Akses tidak diizinkan. Gunakan link dari email untuk reset password.', {
            duration: 4000,
            position: 'top-center'
          });
          setTimeout(() => {
            navigate('/auth', { replace: true });
          }, 2000);
          return;
        }

        // Wait for Supabase to process the URL parameters
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check for session after URL processing
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          localStorage.removeItem('passwordResetSession');
          setSessionExpired(true);
          return;
        }

        if (!session?.user) {
          localStorage.removeItem('passwordResetSession');
          setSessionExpired(true);
          return;
        }

        // For password reset, we just need a valid session and the flag
        const isPasswordReset = hasPasswordResetFlag && session.user.aud === 'authenticated';

        if (!isPasswordReset) {
          localStorage.removeItem('passwordResetSession');
          setSessionExpired(true);
          return;
        }

        // Check if session is recent (within 1 hour for password reset)
        // For password reset, we check the session creation time or use a more lenient approach
        const sessionCreatedAt = session.user.created_at || session.user.updated_at;
        if (sessionCreatedAt) {
          const sessionAge = Date.now() - new Date(sessionCreatedAt).getTime();
          const oneHour = 60 * 60 * 1000;
          
          if (sessionAge > oneHour) {
            localStorage.removeItem('passwordResetSession');
            setSessionExpired(true);
            return;
          }
        }

        // All validations passed
        setIsPasswordResetSession(true);
        setIsValidSession(true);
        
        // Set a flag to track that this is a valid password reset session
        localStorage.setItem('passwordResetSession', 'true');
        
      } catch (err) {
        localStorage.removeItem('passwordResetSession');
        setSessionExpired(true);
      } finally {
        setIsCheckingSession(false);
      }
    };

    validatePasswordResetAccess();

    // Cleanup function to remove password reset session flag when component unmounts
    return () => {
      localStorage.removeItem('passwordResetSession');
    };
  }, [navigate]);

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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message || 'Gagal mengubah password');
      } else {
        setSuccess(true);
        toast.success('Password berhasil diubah!');
        
        // Invalidate the password reset session by signing out
        // This prevents the user from accessing the reset page again
        await supabase.auth.signOut();
        
        // Clear the password reset session flag
        localStorage.removeItem('passwordResetSession');
        
        // Redirect to login page after successful password change
        setTimeout(() => {
          navigate('/auth?mode=login', { replace: true });
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat mengubah password');
    } finally {
      setIsLoading(false);
    }
  };


  // Loading saat validasi session
  if (isCheckingSession) {
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

  // Session expired atau tidak valid
  if (sessionExpired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-red-600 mb-4">Link Tidak Valid</h2>
              <p className="text-muted-foreground mb-6">
                Link reset password tidak valid, telah expired, atau sudah digunakan. 
                Silakan request link reset password yang baru.
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

  // Jika sesi tidak valid, komponen ini tidak akan dirender karena sudah redirect di useEffect

  // State sukses
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

  // Form utama
  if (!isValidSession) {
    // Guard ekstra, meski seharusnya sudah navigate di useEffect
    return null;
  }

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

            <div className="space-y-2">
              <Label htmlFor="password">Password Baru</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password baru"
                  required
                  className="pr-10"
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Konfirmasi password baru"
                  required
                  className="pr-10"
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
              onClick={() => navigate('/auth?mode=login', { replace: true })}
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
