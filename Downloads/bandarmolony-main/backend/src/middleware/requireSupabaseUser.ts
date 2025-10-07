import { supabaseAdmin } from '../supabaseClient';
import { SessionManager } from '../utils/sessionManager';
import { createErrorResponse, ERROR_CODES, HTTP_STATUS } from '../utils/responseUtils';

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

    // Note: Session validation moved to backend logic
    // Since database minimal doesn't have RLS policies, we rely on Supabase Auth validation

    // Ensure user exists in public.users table (fallback for failed triggers)
    try {
      const { data: userProfile, error: profileError } = await supabaseAdmin
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
            full_name: user.user_metadata?.full_name || '',
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