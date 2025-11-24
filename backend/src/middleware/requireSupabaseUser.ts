import { supabaseAdmin } from '../supabaseClient';
import { createErrorResponse, ERROR_CODES, HTTP_STATUS } from '../utils/responseUtils';
import { SessionManager } from '../utils/sessionManager';

export async function requireSupabaseUser(req: any, res: any, next: any) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(401).json({ ok: false, error: 'Missing Bearer token' });
    }
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(createErrorResponse(
        'Invalid or expired token',
        ERROR_CODES.UNAUTHORIZED,
        undefined,
        HTTP_STATUS.UNAUTHORIZED
      ));
    }

    // Validate session in database
    const tokenHash = SessionManager.generateTokenHash(token);
    const sessionValidation = await SessionManager.validateSession(user.id, tokenHash);
    
    if (!sessionValidation.isValid) {
      // For fresh email verification (user created < 5 minutes ago), skip session validation
      // Token might change during initial setup
      const userCreatedAt = new Date(user.created_at);
      const now = new Date();
      const minutesSinceCreation = (now.getTime() - userCreatedAt.getTime()) / 1000 / 60;
      
      if (minutesSinceCreation > 5) {
        // User is not fresh, session must be valid
        // Return specific error code based on reason
        const errorCode = sessionValidation.reason === 'expired' ? 'SESSION_EXPIRED' : 
                         sessionValidation.reason === 'not_found' ? 'SESSION_NOT_FOUND' :
                         'UNAUTHORIZED';
        
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(createErrorResponse(
          sessionValidation.message || 'Session invalid. Please sign in again.',
          errorCode,
          undefined,
          HTTP_STATUS.UNAUTHORIZED
        ));
      }
      
      // Fresh user - create/update session with current token
      await SessionManager.createOrUpdateSession(
        user.id,
        tokenHash,
        new Date(Date.now() + 3600000), // 1 hour
        req.ip || req.connection.remoteAddress || 'Unknown',
        req.headers['user-agent'] || 'Unknown'
      );
    }

    // Note: Session validation moved to backend logic
    // Since database minimal doesn't have RLS policies, we rely on Supabase Auth validation

    // Ensure user exists in public.users table (fallback for failed triggers)
    try {
      const { data: _userProfile, error: profileError } = await supabaseAdmin
        .from('users')
        .select('id, role')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code === 'PGRST116') {
        // User doesn't exist in public.users, create them
        
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
          console.error('Failed to create fallback user record:', createError);
          return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
            'Failed to create user profile. Please try logging in again.',
            ERROR_CODES.INTERNAL_SERVER_ERROR,
            undefined,
            HTTP_STATUS.INTERNAL_SERVER_ERROR
          ));
        }
      } else if (profileError) {
        console.error('Error checking user profile:', profileError);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
          'Database error. Please try again later.',
          ERROR_CODES.DATABASE_ERROR,
          undefined,
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        ));
      }
    } catch (error) {
      console.error('Error ensuring user exists:', error);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
        'Internal server error. Please try again later.',
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        undefined,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      ));
    }

    req.user = { 
      id: user.id, 
      email: user.email, 
      role: user.role || 'user',
      user_metadata: user.user_metadata
    };
    
    next();
  } catch (err: any) {
    console.error('requireSupabaseUser middleware error:', err);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json(createErrorResponse(
      'Invalid or expired token',
      ERROR_CODES.UNAUTHORIZED,
      undefined,
      HTTP_STATUS.UNAUTHORIZED
    ));
  }
}