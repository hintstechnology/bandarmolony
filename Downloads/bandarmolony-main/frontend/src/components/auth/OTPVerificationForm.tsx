import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card } from '../ui/card';
import { api } from '../../services/api';

interface OTPVerificationFormProps {
  email: string;
  onSuccess: (token: string) => void;
  onBack: () => void;
  onResend: () => void;
}

export function OTPVerificationForm({ email, onSuccess, onBack, onResend }: OTPVerificationFormProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Start cooldown timer
    setResendCooldown(60);
    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleInputChange = (index: number, value: string) => {
    if (value.length > 1) return; // Only allow single character
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = pastedData.split('').concat(Array(6 - pastedData.length).fill(''));
    setOtp(newOtp);
    setError('');
    
    // Focus last filled input
    const lastFilledIndex = Math.min(pastedData.length - 1, 5);
    inputRefs.current[lastFilledIndex]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Masukkan 6 digit OTP yang valid');
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.verifyOTP(email, otpCode);
      
      if (response.success) {
        onSuccess(response.token || otpCode);
      } else {
        setError(response.error || 'OTP tidak valid');
      }
    } catch (error: any) {
      setError(error.message || 'Terjadi kesalahan saat memverifikasi OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    
    setError('');
    setIsLoading(true);
    
    try {
      await onResend();
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      setError(error.message || 'Gagal mengirim ulang OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <div className="p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold">Verifikasi OTP</h2>
          <p className="text-muted-foreground mt-2">
            Masukkan 6 digit kode yang dikirim ke
          </p>
          <p className="font-medium text-primary">{email}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="otp">Kode OTP</Label>
            <div className="flex gap-2 justify-center">
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  className="w-12 h-12 text-center text-lg font-bold"
                  disabled={isLoading}
                />
              ))}
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading || otp.join('').length !== 6}
          >
            {isLoading ? 'Memverifikasi...' : 'Verifikasi OTP'}
          </Button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Tidak menerima kode?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || isLoading}
              className="text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Kirim ulang dalam ${resendCooldown}s` : 'Kirim ulang'}
            </button>
          </p>
          
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Kembali ke lupa password
          </button>
        </div>
      </div>
    </Card>
  );
}
