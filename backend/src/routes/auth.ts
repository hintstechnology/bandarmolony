import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClient';
import { z } from 'zod';
import { SessionManager } from '../utils/sessionManager';
import { SessionTracker } from '../utils/sessionTracker';
import { RateLimitManager } from '../utils/rateLimitManager';
import { createSuccessResponse, createErrorResponse, ERROR_CODES, HTTP_STATUS } from '../utils/responseUtils';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB limit
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  }
});

// Multer error handling middleware
const handleMulterError = (err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json(createErrorResponse(
        'File size too large. Maximum size is 1MB',
        'FILE_TOO_LARGE',
        'avatar',
        400
      ));
    }
    return res.status(400).json(createErrorResponse(
      'File upload error: ' + err.message,
      'UPLOAD_ERROR',
      'avatar',
      400
    ));
  }
  if (err.message?.includes('Invalid file type')) {
    return res.status(400).json(createErrorResponse(
      'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
      'INVALID_FILE_TYPE',
      'avatar',
      400
    ));
  }
  next(err);
};

// Validation schemas with detailed error messages
const loginSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(255, 'Email is too long'),
  password: z.string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password is too long')
});

const signupSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(255, 'Email is too long'),
  password: z.string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password is too long')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  full_name: z.string()
    .min(1, 'Full name is required')
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name is too long')
    .regex(/^[a-zA-Z\s]+$/, 'Full name can only contain letters and spaces')
});

const forgotPasswordSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(255, 'Email is too long')
});

const resetPasswordSchema = z.object({
  token: z.string()
    .min(1, 'Reset token is required'),
  password: z.string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password is too long')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number')
});


/**
 * POST /api/auth/login
 * Login user with email and password
 */
router.post('/login', async (req, res) => {
  try {
    // Validate input data
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

    // Note: We'll let Supabase Auth handle user existence check
    // This provides better error messages and handles edge cases

    // Check rate limiting
    const rateLimitResult = await RateLimitManager.checkLoginRateLimit(normalizedEmail, clientIP);
    
    if (!rateLimitResult.success || !rateLimitResult.data) {
      return res.status(500).json(createErrorResponse(
        'Rate limit check failed',
        'RATE_LIMIT_ERROR',
        'email',
        500
      ));
    }

    if (!rateLimitResult.data.allowed) {
      if (rateLimitResult.data.blocked_until) {
        const now = new Date();
        const blockedUntil = new Date(rateLimitResult.data.blocked_until);
        const diffMs = blockedUntil.getTime() - now.getTime();
        const minutes = Math.ceil(diffMs / (1000 * 60));
        
        return res.status(429).json(createErrorResponse(
          `Too many failed login attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}`,
          'ACCOUNT_BLOCKED',
          'email',
          429
        ));
      } else {
        return res.status(423).json(createErrorResponse(
          rateLimitResult.data.suspension_reason || 'Account access restricted',
          'ACCOUNT_SUSPENDED',
          'email',
          423
        ));
      }
    }

    // Check if user exists and verify email/account status BEFORE password check
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email, is_active, email_verified')
      .eq('email', normalizedEmail)
      .single();

    if (existingUser) {
      // Check if account is active
      if (existingUser.is_active === false) {
        return res.status(403).json(createErrorResponse(
          'Akun Anda telah di-suspend. Silakan hubungi admin untuk bantuan.',
          'ACCOUNT_SUSPENDED',
          'email',
          403
        ));
      }

      // Check if email is verified
      if (existingUser.email_verified === false) {
        return res.status(403).json(createErrorResponse(
          'Email Anda belum terverifikasi. Silakan verifikasi email Anda terlebih dahulu.',
          'EMAIL_NOT_VERIFIED',
          'email',
          403
        ));
      }
    }

    // Now attempt to sign in with Supabase Auth
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });
    

    if (error) {
      // Log error for monitoring
      console.error('Login attempt failed:', { email: normalizedEmail, error: error.message });
      
      // Record failed attempt
      await RateLimitManager.recordLoginAttempt(normalizedEmail, clientIP, false);
      
      // Handle specific Supabase auth errors
      let errorResponse;
      
      switch (error.message) {
        case 'Invalid login credentials':
          // Check if user exists in our users table to provide better error message
          try {
            const { data: userExists } = await supabaseAdmin
              .from('users')
              .select('id')
              .eq('email', normalizedEmail)
              .single();
            
            if (userExists) {
              // User exists but password is wrong
              errorResponse = createErrorResponse(
                'Incorrect password. Please try again.',
                'INVALID_PASSWORD',
                'password',
                401
              );
            } else {
              // User doesn't exist
              errorResponse = createErrorResponse(
                'No account found with this email address',
                'USER_NOT_FOUND',
                'email',
                404
              );
            }
          } catch {
            // If we can't check, default to generic message for security
            errorResponse = createErrorResponse(
              'Invalid login credentials. Please check your email and password.',
              'INVALID_CREDENTIALS',
              'password',
              401
            );
          }
          break;
        case 'Email not confirmed':
          errorResponse = createErrorResponse(
            'Please verify your email before logging in',
            'EMAIL_NOT_CONFIRMED',
            'email',
            403
          );
          break;
        case 'Too many requests':
          errorResponse = createErrorResponse(
            'Too many login attempts. Please try again later',
            'RATE_LIMITED',
            undefined,
            429
          );
          break;
        case 'Signup is disabled':
          errorResponse = createErrorResponse(
            'Account registration is currently disabled',
            'SIGNUP_DISABLED',
            undefined,
            503
          );
          break;
        default:
          errorResponse = createErrorResponse(
            'Login failed. Please check your credentials and try again.',
            'LOGIN_FAILED',
            'password',
            401
          );
      }

      return res.status(errorResponse.statusCode).json(errorResponse);
    }

    // Successful login - reset attempts
    await RateLimitManager.recordLoginAttempt(normalizedEmail, clientIP, true);

    // Check if user exists
    if (!data.user) {
      console.error('Login successful but no user data returned');
      return res.status(404).json(createErrorResponse(
        'User not found',
        'USER_NOT_FOUND',
        'email',
        404
      ));
    }

    // Get user profile
    const { data: userProfile, error: userProfileError } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, role, avatar_url, is_active, email_verified, created_at')
      .eq('id', data.user.id)
      .single();

    if (userProfileError) {
      console.error('User profile fetch error:', userProfileError);
      
      // If user doesn't exist in public.users, create them
      if (userProfileError.code === 'PGRST116') {
        try {
          const { error: createError } = await supabaseAdmin
            .from('users')
            .insert({
              id: data.user.id,
              email: data.user.email,
              full_name: data.user.user_metadata?.['full_name'] || '',
              avatar_url: null,
              email_verified: data.user.email_confirmed_at ? true : false,
              role: 'user',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (createError) {
            console.error('Failed to create user record:', createError);
          } else {
          }
        } catch (createErr) {
          console.error('Error creating user record:', createErr);
        }
      }
    }

    // Check if user profile exists and validate account status
    // Note: We already checked email_verified and is_active before password check,
    // but we check again here as a safety measure in case status changed
    if (userProfile) {
      // Check if account is active
      if (userProfile.is_active === false) {
        // Sign out the user from Supabase Auth session
        await supabaseAdmin.auth.admin.signOut(data.user.id, 'global');
        
        return res.status(403).json(createErrorResponse(
          'Akun Anda telah di-suspend. Silakan hubungi admin untuk bantuan.',
          'ACCOUNT_SUSPENDED',
          'email',
          403
        ));
      }

      // Check if email is verified (double check for safety)
      if (userProfile.email_verified === false) {
        // Sign out the user from Supabase Auth session
        await supabaseAdmin.auth.admin.signOut(data.user.id, 'global');
        
        return res.status(403).json(createErrorResponse(
          'Email Anda belum terverifikasi. Silakan verifikasi email Anda terlebih dahulu.',
          'EMAIL_NOT_VERIFIED',
          'email',
          403
        ));
      }
    }

    // Log successful login
    console.log(`✅ Login successful: ${data.user.email}`);

    // Track session in user_sessions table
    if (data.session?.access_token) {
      // Use configured session duration from config (not Supabase JWT expiry)
      const expiresAt = SessionManager.getSessionExpiry();
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';

      try {
        // MULTI-DEVICE LOGIN: Allow login from multiple devices
        // Comment out: await SessionManager.deactivateUserSessions(data.user.id);
        // Users can now login from unlimited devices without being kicked
        
        // Create new session
        const tokenHash = SessionManager.generateTokenHash(data.session.access_token);
        const sessionResult = await SessionManager.createOrUpdateSession(
          data.user.id,
          tokenHash,
          expiresAt,
          ipAddress,
          userAgent
        );
        
        if (!sessionResult.success) {
          console.error('Session tracking failed:', sessionResult.error);
          // Don't fail login if session tracking fails
        }
      } catch (sessionError) {
        console.error('Session tracking error:', sessionError);
        // Don't fail login if session tracking fails
      }
    }

    // Ensure session data is properly formatted
    const sessionData = data.session ? {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user
    } : null;

    return res.json(createSuccessResponse({
      user: data.user,
      session: sessionData,
      profile: userProfile || null
    }, 'Login successful'));

  } catch (err: any) {
    // Log validation errors
    if (err.name === 'ZodError') {
      console.error('Validation error:', err.errors);
      const firstError = err.errors?.[0] || { message: 'Validation error', path: [] };
      return res.status(400).json(createErrorResponse(
        firstError.message,
        'VALIDATION_ERROR',
        firstError.path?.join('.') || 'unknown',
        400
      ));
    }
    
    // Log unexpected errors
    console.error('Unexpected login error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/auth/signup
 * Register new user
 */
router.post('/signup', async (req, res) => {
  try {
    // Validate input data
    const { email, password, full_name } = signupSchema.parse(req.body);

    // Sign up with Supabase Auth
    const { data, error } = await supabaseAdmin.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        data: {
          full_name: full_name.trim()
        },
        emailRedirectTo: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/auth/callback`
      }
    });

    if (error) {
      // Log error for monitoring
      console.error('Signup attempt failed:', { email, error: error.message });
      
      // Handle specific Supabase auth errors
      let errorResponse;
      
      switch (error.message) {
        case 'User already registered':
          errorResponse = createErrorResponse(
            'An account with this email already exists',
            'USER_ALREADY_EXISTS',
            'email',
            409
          );
          break;
        case 'Password should be at least 6 characters':
          errorResponse = createErrorResponse(
            'Password must be at least 6 characters long',
            'PASSWORD_TOO_SHORT',
            'password',
            400
          );
          break;
        case 'Signup is disabled':
          errorResponse = createErrorResponse(
            'New registrations are currently disabled',
            'SIGNUP_DISABLED',
            undefined,
            503
          );
          break;
        case 'Invalid email':
          errorResponse = createErrorResponse(
            'Please enter a valid email address',
            'INVALID_EMAIL',
            'email',
            400
          );
          break;
        case 'Password is too weak':
          errorResponse = createErrorResponse(
            'Password is too weak. Please choose a stronger password',
            'PASSWORD_TOO_WEAK',
            'password',
            400
          );
          break;
        default:
          errorResponse = createErrorResponse(
            'Registration failed. Please try again',
            'SIGNUP_FAILED',
            undefined,
            400
          );
      }

      return res.status(errorResponse.statusCode).json(errorResponse);
    }

    // User record will be created automatically by trigger
    // No need to manually insert into users table

    // Log successful signup

    const message = data.session 
      ? 'Account created successfully' 
      : 'Account created. Please check your email to verify your account.';

    return res.json(createSuccessResponse({
      user: data.user,
      session: data.session
    }, message));

  } catch (err: any) {
    // Log validation errors
    if (err.name === 'ZodError') {
      console.error('Validation error:', err.errors);
      const firstError = err.errors?.[0] || { message: 'Validation error', path: [] };
      return res.status(400).json(createErrorResponse(
        firstError.message,
        'VALIDATION_ERROR',
        firstError.path?.join('.') || 'unknown',
        400
      ));
    }
    
    // Log unexpected errors
    console.error('Unexpected signup error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Missing Bearer token' 
      });
    }

    // Get user info before signing out
    const { data: { user }, error: _userError } = await supabaseAdmin.auth.getUser(token);
    
    // Deactivate specific session in user_sessions table first
    if (user?.id) {
      const tokenHash = SessionManager.generateTokenHash(token);
      await SessionManager.deactivateSessionByTokenHash(tokenHash);
    }

    // For session-specific logout, we'll rely on session deactivation
    // Supabase doesn't have a reliable way to logout specific sessions
    // The session will be invalidated when the token expires or when we check it
    console.log(`✅ Logout: ${user?.email || 'unknown'}`);

    return res.json({ ok: true, message: 'Logged out successfully' });
  } catch (err: any) {
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * POST /api/auth/logout-all
 * Logout from all devices
 */
router.post('/logout-all', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Missing Bearer token' 
      });
    }

    // Get user info before signing out
    const { data: { user }, error: _userError } = await supabaseAdmin.auth.getUser(token);
    
    if (!user?.id) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Invalid user' 
      });
    }

    // Deactivate all user sessions
    await SessionManager.deactivateUserSessions(user.id);

    // Use global logout for logout all devices
    const { error } = await supabaseAdmin.auth.signOut();

    if (error) {
      console.warn('Global logout failed, but sessions deactivated:', error.message);
      // Continue even if Supabase logout fails since we've deactivated all sessions
    }

    return res.json({ ok: true, message: 'Logged out from all devices successfully' });
  } catch (err: any) {
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});


/**
 * POST /api/auth/check-email
 * Check if email exists in the system
 */
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json(createErrorResponse(
        'Email is required',
        'EMAIL_REQUIRED',
        'email',
        400
      ));
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists in our users table
    const { data: userData, error: _userError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .single();

    if (_userError && _userError.code !== 'PGRST116') {
      console.error('Error checking email:', _userError);
      return res.status(500).json(createErrorResponse(
        'Failed to check email',
        'EMAIL_CHECK_FAILED',
        undefined,
        500
      ));
    }

    const exists = !!userData;

    return res.json(createSuccessResponse({ exists }));

  } catch (err: any) {
    console.error('Check email error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/auth/forgot-password
 * Send password reset email
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    // Optimize: Skip database query - Supabase resetPasswordForEmail already checks user existence
    // This reduces latency by removing one database round-trip
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/auth/callback`
    });

    if (error) {
      console.error('Password reset email error:', error);
      
      // Handle specific errors
      let errorMessage = 'Gagal mengirim link reset password';
      let statusCode = 400;

      switch (error.message) {
        case 'For security purposes, you can only request this once every 60 seconds':
          errorMessage = 'Harap tunggu 60 detik sebelum meminta reset password lagi';
          statusCode = 429;
          break;
        case 'Email rate limit exceeded':
          errorMessage = 'Terlalu banyak permintaan reset password. Silakan coba lagi nanti';
          statusCode = 429;
          break;
        case 'Invalid email':
          errorMessage = 'Silakan masukkan alamat email yang valid';
          statusCode = 400;
          break;
        case 'User not found':
        case 'Invalid login credentials':
          // User not found - return 404 with Indonesian message
          errorMessage = `Akun dengan email ${normalizedEmail} tidak ditemukan`;
          statusCode = 404;
          break;
        default:
          errorMessage = error.message;
      }

      return res.status(statusCode).json(createErrorResponse(
        errorMessage,
        statusCode === 404 ? 'USER_NOT_FOUND' : 'RESET_EMAIL_FAILED',
        'email',
        statusCode
      ));
    }

    return res.json(createSuccessResponse(
      null,
      'Email berhasil dikirim, silahkan cek akun Anda'
    ));
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json(createErrorResponse(
        err.errors[0].message,
        'VALIDATION_ERROR',
        'email',
        400
      ));
    }
    console.error('Forgot password error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Refresh token required' 
      });
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(400).json({ 
        ok: false, 
        error: error.message 
      });
    }

    return res.json({
      ok: true,
      data: {
        user: data.user,
        session: data.session
      }
    });
  } catch (err: any) {
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});


/**
 * POST /api/auth/check-attempts
 * Check login attempt status for an email
 */
router.post('/check-attempts', async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check rate limiting using RateLimitManager
    const rateLimitResult = await RateLimitManager.checkLoginRateLimit(normalizedEmail, clientIP);
    const attemptDataResult = await RateLimitManager.getLoginAttempts(normalizedEmail);

    if (!rateLimitResult.success || !rateLimitResult.data || !attemptDataResult.success) {
      return res.status(500).json(createErrorResponse(
        'Failed to check login attempts',
        'DATABASE_ERROR',
        'email',
        500
      ));
    }

    const attemptData = attemptDataResult.data;
    const remainingAttempts = attemptData ? Math.max(0, 5 - attemptData.attempt_count) : 5;
    const isSuspended = attemptData?.is_suspended || false;
    const isBlocked = !rateLimitResult.data.allowed && !isSuspended;

    return res.json(createSuccessResponse({
      allowed: rateLimitResult.data.allowed,
      remainingAttempts,
      blockedUntil: rateLimitResult.data.blocked_until,
      isSuspended,
      suspensionReason: attemptData?.suspension_reason || null,
      attemptCount: attemptData?.attempt_count || 0,
      lastAttempt: attemptData?.last_attempt || null,
      isBlocked,
      reason: rateLimitResult.data.suspension_reason
    }));

  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json(createErrorResponse(
        err.errors[0].message,
        'VALIDATION_ERROR',
        'email',
        400
      ));
    }
    console.error('Check attempts error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/auth/init-session
 * Initialize session in database after email verification (called by frontend)
 */
router.post('/init-session', async (req, res) => {
  try {
    // Get user from token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(createErrorResponse(
        'No valid session found',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('❌ Init session: Invalid token');
      return res.status(401).json(createErrorResponse(
        'Invalid session',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Ensure user profile exists
    const { error: profileCheckError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();

    if (profileCheckError && profileCheckError.code === 'PGRST116') {
      // Profile doesn't exist, create it
      const { error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.['full_name'] || '',
          avatar_url: null,
          email_verified: user.email_confirmed_at ? true : false,
          role: 'user',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (createError) {
        console.error('❌ Init session: Failed to create profile for', user.email);
        return res.status(500).json(createErrorResponse(
          'Failed to create user profile',
          'INTERNAL_SERVER_ERROR',
          undefined,
          500
        ));
      }
    } else if (profileCheckError) {
      console.error('❌ Init session: Error checking profile for', user.email);
    }

    // Create session in database
    try {
      const tokenHash = SessionManager.generateTokenHash(token || '');
      // Use configured session duration from config
      const expiresAt = SessionManager.getSessionExpiry();
      await SessionManager.createOrUpdateSession(
        user.id,
        tokenHash,
        expiresAt,
        req.ip || req.connection.remoteAddress || 'Unknown',
        req.headers['user-agent'] || 'Unknown'
      );
    } catch (sessionError) {
      console.error('❌ Init session: Failed to create session for', user.email);
      // Don't fail - session will be created on next API call
    }
    return res.json(createSuccessResponse(
      { user, initialized: true },
      'Session initialized successfully'
    ));

  } catch (err: any) {
    console.error('init-session error:', err);
    return res.status(500).json(createErrorResponse(
      'Failed to initialize session',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/auth/verify-email
 * Verify email with token from email confirmation
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { token, type } = z.object({ 
      token: z.string().min(1, 'Token is required'),
      type: z.enum(['signup', 'recovery']).optional().default('signup')
    }).parse(req.body);

    // For link-based verification, we need to verify the token differently
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      token_hash: token,
      type: type === 'recovery' ? 'recovery' : 'signup'
    });

    if (error) {
      console.error('Email verification error:', error);
      
      let errorMessage = 'Invalid or expired verification token';
      let statusCode = 400;

      switch (error.message) {
        case 'Token has expired or is invalid':
          errorMessage = 'Verification token has expired. Please request a new one.';
          statusCode = 410;
          break;
        case 'Invalid token':
          errorMessage = 'Invalid verification token. Please check your email and try again.';
          statusCode = 400;
          break;
        case 'Token has been used':
          errorMessage = 'This verification link has already been used.';
          statusCode = 400;
          break;
        default:
          errorMessage = error.message;
      }

      return res.status(statusCode).json(createErrorResponse(
        errorMessage,
        'VERIFICATION_FAILED',
        'token',
        statusCode
      ));
    }

    if (data.user) {
      // First, check if user profile exists
      const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
        .from('users')
        .select('id, email_verified')
        .eq('id', data.user.id)
        .single();

      if (profileCheckError && profileCheckError.code === 'PGRST116') {
        // Profile doesn't exist yet, create it
        const { error: createError } = await supabaseAdmin
          .from('users')
          .insert({
            id: data.user.id,
            email: data.user.email,
            full_name: data.user.user_metadata?.['full_name'] || '',
            avatar_url: null,
            email_verified: true,
            role: 'user',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (createError) {
          console.error('Email verification: Failed to create profile for', data.user.email);
          // Don't fail the verification, just log the error
        }
      } else if (!profileCheckError && existingProfile) {
        // Profile exists, just update email_verified status
        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({ 
            email_verified: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.user.id);

        if (updateError) {
          console.error('Email verification: Failed to update status for', data.user.email);
          // Don't fail the verification, just log the error
        }
      } else {
        console.error('Email verification: Error checking profile for', data.user.email);
      }
    }

    // Create session in database for the verified user
    if (data.session && data.user) {
      try {
        const tokenHash = SessionManager.generateTokenHash(data.session.access_token);
        // Use configured session duration from config (not Supabase JWT expiry)
        const expiresAt = SessionManager.getSessionExpiry();
        await SessionManager.createOrUpdateSession(
          data.user.id,
          tokenHash,
          expiresAt,
          req.ip || req.connection.remoteAddress || 'Unknown',
          req.headers['user-agent'] || 'Unknown'
        );
        console.log(`✅ Email verified: ${data.user.email}`);
      } catch (sessionError) {
        console.error('Email verification: Failed to create session for', data.user.email);
        // Don't fail the verification, user can create session on next login
      }
    }

    return res.json(createSuccessResponse({
      user: data.user,
      session: data.session
    }, 'Email verified successfully'));

  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json(createErrorResponse(
        err.errors?.[0]?.message || 'Validation error',
        'VALIDATION_ERROR',
        err.errors?.[0]?.['path']?.join('.') || 'unknown',
        400
      ));
    }
    console.error('Email verification error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/auth/resend-verification
 * Resend email verification
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = z.object({ 
      email: z.string().email('Valid email is required')
    }).parse(req.body);

    const normalizedEmail = email.toLowerCase().trim();

    // Note: We'll let Supabase Auth handle user existence and verification status
    // This provides better error messages and handles edge cases

    const { error } = await supabaseAdmin.auth.resend({
      type: 'signup',
      email: normalizedEmail
    });

    if (error) {
      console.error('Resend verification error:', error);
      
      let errorMessage = 'Failed to resend verification email';
      let statusCode = 400;

      switch (error.message) {
        case 'For security purposes, you can only request this once every 60 seconds':
          errorMessage = 'Please wait 60 seconds before requesting another verification email';
          statusCode = 429;
          break;
        case 'Email rate limit exceeded':
          errorMessage = 'Too many verification requests. Please try again later';
          statusCode = 429;
          break;
        case 'User not found':
          errorMessage = 'No account found with this email address';
          statusCode = 404;
          break;
        default:
          errorMessage = error.message;
      }

      return res.status(statusCode).json(createErrorResponse(
        errorMessage,
        'RESEND_FAILED',
        'email',
        statusCode
      ));
    }

    return res.json(createSuccessResponse(
      null,
      'Verification email sent successfully'
    ));

  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json(createErrorResponse(
        err.errors[0].message,
        'VALIDATION_ERROR',
        'email',
        400
      ));
    }
    console.error('Resend verification error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token from email
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);

    // Verify the reset token first
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      token_hash: token,
      type: 'recovery'
    });

    if (error) {
      console.error('Password reset verification error:', error);
      
      let errorMessage = 'Invalid or expired reset token';
      let statusCode = 400;

      switch (error.message) {
        case 'Token has expired or is invalid':
          errorMessage = 'Reset token has expired. Please request a new password reset.';
          statusCode = 410;
          break;
        case 'Invalid token':
          errorMessage = 'Invalid reset token. Please check your email and try again.';
          statusCode = 400;
          break;
        default:
          errorMessage = error.message;
      }

      return res.status(statusCode).json(createErrorResponse(
        errorMessage,
        'RESET_FAILED',
        'token',
        statusCode
      ));
    }

    if (!data.user) {
      return res.status(400).json(createErrorResponse(
        'Invalid reset token. User not found.',
        'INVALID_TOKEN',
        'token',
        400
      ));
    }

    // Update the user's password using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      data.user.id,
      { password: password }
    );

    if (updateError) {
      console.error('Password update error:', updateError);
      return res.status(400).json(createErrorResponse(
        'Failed to update password. Please try again.',
        'PASSWORD_UPDATE_FAILED',
        'password',
        400
      ));
    }

    // Log successful password reset

    return res.json(createSuccessResponse(
      { userId: data.user.id },
      'Password has been reset successfully. You can now log in with your new password.'
    ));

  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json(createErrorResponse(
        err.errors?.[0]?.message || 'Validation error',
        'VALIDATION_ERROR',
        err.errors?.[0]?.['path']?.join('.') || 'unknown',
        400
      ));
    }
    console.error('Password reset error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/auth/resend-forgot-password
 * Resend forgot password email
 */
router.post('/resend-forgot-password', async (req, res) => {
  try {
    const { email } = z.object({ 
      email: z.string().email('Valid email is required')
    }).parse(req.body);

    const normalizedEmail = email.toLowerCase().trim();

    // Optimize: Skip database query - Supabase resetPasswordForEmail already checks user existence
    // This reduces latency by removing one database round-trip
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/auth/callback`
    });

    if (error) {
      console.error('Resend forgot password error:', error);
      
      let errorMessage = 'Gagal mengirim ulang link reset password';
      let statusCode = 400;

      switch (error.message) {
        case 'For security purposes, you can only request this once every 60 seconds':
          errorMessage = 'Harap tunggu 60 detik sebelum meminta reset password lagi';
          statusCode = 429;
          break;
        case 'Email rate limit exceeded':
          errorMessage = 'Terlalu banyak permintaan reset password. Silakan coba lagi nanti';
          statusCode = 429;
          break;
        case 'Invalid email':
          errorMessage = 'Silakan masukkan alamat email yang valid';
          statusCode = 400;
          break;
        case 'User not found':
        case 'Invalid login credentials':
          errorMessage = `Akun dengan email ${normalizedEmail} tidak ditemukan`;
          statusCode = 404;
          break;
        default:
          errorMessage = error.message;
      }

      return res.status(statusCode).json(createErrorResponse(
        errorMessage,
        statusCode === 404 ? 'USER_NOT_FOUND' : 'RESEND_FORGOT_PASSWORD_FAILED',
        'email',
        statusCode
      ));
    }

    return res.json(createSuccessResponse(
      { email: normalizedEmail },
      'Email berhasil dikirim, silahkan cek akun Anda'
    ));

  } catch (error: any) {
    console.error('Resend forgot password error:', error);
    return res.status(400).json(createErrorResponse(
      'Invalid request data',
      'INVALID_REQUEST',
      undefined,
      400
    ));
  }
});



/**
 * POST /api/upload-avatar
 * Upload user avatar to Supabase Storage
 */
router.post('/upload-avatar', upload.single('avatar'), handleMulterError, async (req: Request, res: Response) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(401).json(createErrorResponse(
        'Missing authentication token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify the token with Supabase
    const { data: { user }, error: _userError } = await supabaseAdmin.auth.getUser(token);
    
    if (_userError || !user) {
      return res.status(401).json(createErrorResponse(
        'Invalid or expired token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json(createErrorResponse(
        'No file uploaded',
        'NO_FILE',
        'avatar',
        400
      ));
    }

    // Check file size (additional check)
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    
    if (file.size > 1 * 1024 * 1024) {
      return res.status(400).json(createErrorResponse(
        `File size too large (${fileSizeMB}MB). Maximum size is 1MB`,
        'FILE_TOO_LARGE',
        'avatar',
        400
      ));
    }

    // Check file type (additional check)
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      return res.status(400).json(createErrorResponse(
        'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
        'INVALID_FILE_TYPE',
        'avatar',
        400
      ));
    }

    // Check if user has existing avatar and delete it
    const { data: existingProfile } = await supabaseAdmin
      .from('users')
      .select('avatar_url')
      .eq('id', user.id)
      .single();

    if (existingProfile?.avatar_url) {
      // Remove avatars/ prefix if present for storage path
      const oldStoragePath = existingProfile.avatar_url.startsWith('avatars/') 
        ? existingProfile.avatar_url.substring(8) // Remove 'avatars/' prefix
        : existingProfile.avatar_url;
      
      // Delete old avatar from storage
      const { error: deleteOldError } = await supabaseAdmin.storage
        .from('avatars')
        .remove([oldStoragePath]);
      
      if (deleteOldError) {
        console.warn('Failed to delete old avatar for', user.email);
        // Continue with upload even if old file deletion fails
      }
    }

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    const filePath = `${user.id}/${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return res.status(400).json(createErrorResponse(
        'Failed to upload avatar',
        'UPLOAD_FAILED',
        'avatar',
        400
      ));
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = urlData.publicUrl;

    // Update user's avatar_url in database
    const fullPath = `avatars/${filePath}`;
    
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        avatar_url: fullPath, // Store the full storage path with avatars/ prefix
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      // Try to delete the uploaded file
      await supabaseAdmin.storage
        .from('avatars')
        .remove([filePath]);
      
      return res.status(400).json(createErrorResponse(
        'Failed to update profile',
        'UPDATE_FAILED',
        'avatar',
        400
      ));
    }

    console.log(`✅ Avatar uploaded: ${user.email}`);
    return res.json(createSuccessResponse({
      avatarUrl: avatarUrl,
      filePath: fullPath
    }, 'Avatar uploaded successfully'));

  } catch (err: any) {
    console.error('Upload avatar error:', err);
    
    // Handle multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json(createErrorResponse(
        'File size too large. Maximum size is 1MB',
        'FILE_TOO_LARGE',
        'avatar',
        400
      ));
    }
    
    if (err.message?.includes('Invalid file type')) {
      return res.status(400).json(createErrorResponse(
        'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
        'INVALID_FILE_TYPE',
        'avatar',
        400
      ));
    }
    
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * DELETE /api/avatar
 * Delete user avatar from Supabase Storage
 */
router.delete('/avatar', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(401).json(createErrorResponse(
        'Missing authentication token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify the token with Supabase
    const { data: { user }, error: _userError } = await supabaseAdmin.auth.getUser(token);
    
    if (_userError || !user) {
      return res.status(401).json(createErrorResponse(
        'Invalid or expired token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Get current avatar path
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('avatar_url')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.avatar_url) {
      return res.status(404).json(createErrorResponse(
        'No avatar found',
        'AVATAR_NOT_FOUND',
        undefined,
        404
      ));
    }

    // Delete from storage
    // Remove avatars/ prefix if present for storage path
    const storagePath = profile.avatar_url.startsWith('avatars/') 
      ? profile.avatar_url.substring(8) // Remove 'avatars/' prefix
      : profile.avatar_url;
    
    const { error: deleteError } = await supabaseAdmin.storage
      .from('avatars')
      .remove([storagePath]);

    if (deleteError) {
      console.error('Avatar delete error:', deleteError);
      return res.status(400).json(createErrorResponse(
        'Failed to delete avatar',
        'DELETE_FAILED',
        undefined,
        400
      ));
    }


    // Update database
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        avatar_url: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return res.status(400).json(createErrorResponse(
        'Failed to update profile',
        'UPDATE_FAILED',
        undefined,
        400
      ));
    }

    console.log(`✅ Avatar deleted: ${user.email}`);
    return res.json(createSuccessResponse(null, 'Avatar deleted successfully'));

  } catch (err: any) {
    console.error('Delete avatar error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * GET /api/auth/sessions
 * Get active sessions for current user
 */
router.get('/sessions', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(401).json(createErrorResponse(
        'Missing authentication token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify the token with Supabase
    const { data: { user }, error: _userError } = await supabaseAdmin.auth.getUser(token);
    
    if (_userError || !user) {
      return res.status(401).json(createErrorResponse(
        'Invalid or expired token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Get active sessions
    const sessions = await SessionTracker.getUserActiveSessions(user.id);

    return res.json(createSuccessResponse({
      sessions,
      count: sessions.length
    }, 'Sessions retrieved successfully'));

  } catch (err: any) {
    console.error('Get sessions error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * DELETE /api/auth/sessions/:sessionId
 * Deactivate a specific session
 */
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(401).json(createErrorResponse(
        'Missing authentication token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify the token with Supabase
    const { data: { user }, error: _userError } = await supabaseAdmin.auth.getUser(token);
    
    if (_userError || !user) {
      return res.status(401).json(createErrorResponse(
        'Invalid or expired token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    const { sessionId } = req.params;

    // Deactivate the specific session
    const { error } = await supabaseAdmin
      .from('user_sessions')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id); // Ensure user can only deactivate their own sessions

    if (error) {
      console.error('Failed to deactivate session:', error);
      return res.status(400).json(createErrorResponse(
        'Failed to deactivate session',
        'DEACTIVATE_FAILED',
        undefined,
        400
      ));
    }

    return res.json(createSuccessResponse(null, 'Session deactivated successfully'));

  } catch (err: any) {
    console.error('Deactivate session error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * DELETE /api/auth/sessions/all
 * Deactivate all sessions for current user
 */
router.delete('/sessions/all', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(401).json(createErrorResponse(
        'Missing authentication token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify the token with Supabase
    const { data: { user }, error: _userError } = await supabaseAdmin.auth.getUser(token);
    
    if (_userError || !user) {
      return res.status(401).json(createErrorResponse(
        'Invalid or expired token',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Deactivate all sessions
    await SessionManager.deactivateUserSessions(user.id);

    return res.json(createSuccessResponse(null, 'All sessions deactivated successfully'));

  } catch (err: any) {
    console.error('Deactivate all sessions error:', err);
    return res.status(500).json(createErrorResponse(
      'Internal server error. Please try again later',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});


// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Password harus minimal 6 karakter',
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Get the current session from the request
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(createErrorResponse(
        'Token tidak valid',
        ERROR_CODES.UNAUTHORIZED,
        undefined,
        HTTP_STATUS.UNAUTHORIZED
      ));
    }

    const token = authHeader.substring(7);

    // Verify the token and get user
    const { data: { user }, error: _userError } = await supabaseAdmin.auth.getUser(token);
    
    if (_userError || !user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(createErrorResponse(
        'Token tidak valid atau telah expired',
        ERROR_CODES.UNAUTHORIZED,
        undefined,
        HTTP_STATUS.UNAUTHORIZED
      ));
    }

    // Update the user's password
    const { error: updateError } = await supabaseAdmin.auth.updateUser({
      password: password
    });

    if (updateError) {
      console.error('Password update error:', updateError);
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Gagal mengubah password. Silakan coba lagi.',
        ERROR_CODES.UPDATE_FAILED,
        undefined,
        HTTP_STATUS.BAD_REQUEST
      ));
    }


    return res.json(createSuccessResponse(
      { message: 'Password berhasil diubah' },
      'Password berhasil diubah'
    ));

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Terjadi kesalahan server',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(6, 'New password must be at least 6 characters')
    }).parse(req.body);

    // Get user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(createErrorResponse(
        'No valid session found',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: _userError } = await supabaseAdmin.auth.getUser(token);
    
    if (_userError || !user) {
      return res.status(401).json(createErrorResponse(
        'Invalid session',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword
    });

    if (signInError) {
      return res.status(400).json(createErrorResponse(
        'Current password is incorrect',
        'INVALID_PASSWORD',
        'currentPassword',
        400
      ));
    }

    // Check if new password is same as current password
    if (currentPassword === newPassword) {
      return res.status(400).json(createErrorResponse(
        'New password must be different from current password',
        'SAME_PASSWORD',
        'newPassword',
        400
      ));
    }

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      console.error('Password update error:', updateError);
      
      // Handle specific Supabase errors
      if (updateError.message?.includes('same_password')) {
        return res.status(400).json(createErrorResponse(
          'New password must be different from current password',
          'SAME_PASSWORD',
          'newPassword',
          400
        ));
      }
      
      if (updateError.message?.includes('Password should be at least')) {
        return res.status(400).json(createErrorResponse(
          'Password must be at least 6 characters',
          'PASSWORD_TOO_SHORT',
          'newPassword',
          400
        ));
      }

      return res.status(400).json(createErrorResponse(
        updateError.message || 'Failed to update password',
        'UPDATE_FAILED',
        'newPassword',
        400
      ));
    }

    return res.json(createSuccessResponse(
      { message: 'Password changed successfully' },
      'Password changed successfully'
    ));

  } catch (error: any) {
    console.error('Change password error:', error);
    
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      const firstError = error.errors[0];
      return res.status(400).json(createErrorResponse(
        firstError.message,
        'VALIDATION_ERROR',
        firstError.path[0],
        400
      ));
    }
    
    return res.status(500).json(createErrorResponse(
      'Internal server error',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

export default router;
