import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClient';
import { createSuccessResponse, createErrorResponse, ERROR_CODES, HTTP_STATUS } from '../utils/responseUtils';

const router = Router();

// Middleware to check if user is admin
const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(createErrorResponse(
        'Missing authentication token',
        ERROR_CODES.UNAUTHORIZED,
        undefined,
        HTTP_STATUS.UNAUTHORIZED
      ));
    }

    // Verify the token with Supabase
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError) {
      return res.status(401).json(createErrorResponse(
        'Invalid or expired token',
        ERROR_CODES.UNAUTHORIZED,
        undefined,
        HTTP_STATUS.UNAUTHORIZED
      ));
    }

    if (!user) {
      return res.status(401).json(createErrorResponse(
        'Invalid or expired token',
        ERROR_CODES.UNAUTHORIZED,
        undefined,
        HTTP_STATUS.UNAUTHORIZED
      ));
    }

    // Check if user is admin and account status
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role, is_active, email_verified')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return res.status(403).json(createErrorResponse(
        'Admin access required',
        ERROR_CODES.FORBIDDEN,
        undefined,
        HTTP_STATUS.FORBIDDEN
      ));
    }

    if (!userProfile) {
      return res.status(403).json(createErrorResponse(
        'Admin access required',
        ERROR_CODES.FORBIDDEN,
        undefined,
        HTTP_STATUS.FORBIDDEN
      ));
    }

    // Check if account is active
    if (userProfile.is_active === false) {
      return res.status(403).json(createErrorResponse(
        'Akun Anda telah di-suspend. Silakan hubungi admin untuk bantuan.',
        'ACCOUNT_SUSPENDED',
        undefined,
        403
      ));
    }

    // Check if email is verified
    if (userProfile.email_verified === false) {
      return res.status(403).json(createErrorResponse(
        'Email Anda belum terverifikasi. Silakan verifikasi email Anda terlebih dahulu.',
        'EMAIL_NOT_VERIFIED',
        undefined,
        403
      ));
    }

    if (userProfile.role !== 'admin') {
      return res.status(403).json(createErrorResponse(
        'Admin access required',
        ERROR_CODES.FORBIDDEN,
        undefined,
        HTTP_STATUS.FORBIDDEN
      ));
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json(createErrorResponse(
        'Internal server error',
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        undefined,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
};

/**
 * GET /api/admin/stats
 * Get user statistics
 */
router.get('/stats', requireAdmin, async (_req, res) => {
  try {
    // Get total users using service role (bypasses RLS)
    const { count: totalUsers, error: totalError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      console.error('Error getting total users:', totalError);
      throw totalError;
    }


    // Get active users using service role
    const { count: activeUsers, error: activeError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (activeError) {
      console.error('Error getting active users:', activeError);
      throw activeError;
    }

    // Get new users this month using service role
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: newUsers, error: newError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString());

    if (newError) {
      console.error('Error getting new users:', newError);
      throw newError;
    }

    // Get users by role using service role
    const { data: roleStats, error: roleError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('is_active', true);

    if (roleError) {
      console.error('Error getting role stats:', roleError);
      throw roleError;
    }

    const roleDistribution = roleStats?.reduce((acc: any, user: any) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {}) || {};

    // Get email verification stats using service role
    const { data: verificationStats, error: verificationError } = await supabaseAdmin
      .from('users')
      .select('email_verified')
      .eq('is_active', true);

    if (verificationError) {
      console.error('Error getting verification stats:', verificationError);
      throw verificationError;
    }

    const verifiedCount = verificationStats?.filter(u => u.email_verified).length || 0;
    const unverifiedCount = (verificationStats?.length || 0) - verifiedCount;

    res.json(createSuccessResponse({
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      newUsers: newUsers || 0,
      roleDistribution,
      verificationStats: {
        verified: verifiedCount,
        unverified: unverifiedCount
      }
    }, 'User statistics retrieved successfully'));

  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to retrieve user statistics',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * GET /api/admin/users
 * Get users list with pagination and filters
 */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const search = req.query['search'] as string || '';
    const role = req.query['role'] as string || '';
    const status = req.query['status'] as string || '';

    // Build query with filters
    let query = supabaseAdmin
      .from('users')
      .select('id, email, full_name, role, is_active, email_verified, last_login_at, created_at, updated_at', { count: 'exact' })
      .order('last_login_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    // Apply filters
    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    if (role) {
      query = query.eq('role', role);
    }

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    }

    // Get paginated results with count
    const { data: users, count, error: usersError } = await query
      .range((page - 1) * limit, page * limit - 1);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      console.error('Query details:', {
        page,
        limit,
        search,
        role,
        status
      });
      throw usersError;
    }

    res.json(createSuccessResponse({
      users: users || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    }, 'Users retrieved successfully'));

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to retrieve users',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * PUT /api/admin/users/:id/suspend
 * Suspend or unsuspend a user
 */
router.put('/users/:id/suspend', requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { suspended, adminPassword } = req.body;

    // Verify admin password first
    if (!adminPassword) {
      return res.status(400).json(createErrorResponse(
        'Admin password is required',
        'ADMIN_PASSWORD_REQUIRED',
        'adminPassword',
        400
      ));
    }

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
    
    if (userError || !user || !user.email) {
      return res.status(401).json(createErrorResponse(
        'Invalid session',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify admin password by attempting to sign in
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: adminPassword
    });

    if (signInError) {
      return res.status(401).json(createErrorResponse(
        'Invalid admin password',
        'INVALID_ADMIN_PASSWORD',
        'adminPassword',
        401
      ));
    }

    if (typeof suspended !== 'boolean') {
      return res.status(400).json(createErrorResponse(
        'Suspended status is required',
        'VALIDATION_ERROR',
        'suspended',
        400
      ));
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        is_active: !suspended,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, email, full_name, role, is_active, email_verified, last_login_at, created_at, updated_at')
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json(createErrorResponse(
          'User not found',
          'USER_NOT_FOUND',
          undefined,
          404
        ));
      }
      throw updateError;
    }

    return res.json(createSuccessResponse(updatedUser, `User ${suspended ? 'suspended' : 'unsuspended'} successfully`));

  } catch (error) {
    console.error('Suspend user error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to update user status',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});


/**
 * PATCH /api/admin/users/:id/email-verification
 * Update user email verification status
 */
router.patch('/users/:id/email-verification', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email_verified } = req.body;

    if (typeof email_verified !== 'boolean') {
      return res.status(400).json(createErrorResponse(
        'Email verification status is required',
        'VALIDATION_ERROR',
        'email_verified',
        400
      ));
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        email_verified,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, email, full_name, role, is_active, email_verified, last_login_at, created_at, updated_at')
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json(createErrorResponse(
          'User not found',
          'USER_NOT_FOUND',
          undefined,
          404
        ));
      }
      throw updateError;
    }

    return res.json(createSuccessResponse(updatedUser, `User email ${email_verified ? 'verified' : 'unverified'} successfully`));

  } catch (error) {
    console.error('Update email verification error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to update email verification status',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user
 */
router.delete('/users/:id', requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { adminPassword } = req.body;

    // Verify admin password first
    if (!adminPassword) {
      return res.status(400).json(createErrorResponse(
        'Admin password is required',
        'ADMIN_PASSWORD_REQUIRED',
        'adminPassword',
        400
      ));
    }

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
    
    if (userError || !user || !user.email) {
      return res.status(401).json(createErrorResponse(
        'Invalid session',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify admin password by attempting to sign in
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: adminPassword
    });

    if (signInError) {
      return res.status(401).json(createErrorResponse(
        'Invalid admin password',
        'INVALID_ADMIN_PASSWORD',
        'adminPassword',
        401
      ));
    }

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', id)
      .single();

    if (fetchError || !existingUser) {
      return res.status(404).json(createErrorResponse(
        'User not found',
        'USER_NOT_FOUND',
        undefined,
        404
      ));
    }

    // Delete user from auth
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError);
      return res.status(500).json(createErrorResponse(
        'Failed to delete user from authentication',
        'DELETE_AUTH_ERROR',
        undefined,
        500
      ));
    }

    // Note: User record in public.users will be deleted by database trigger
    // But we can also delete it explicitly to be safe
    const { error: deleteUserError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id);

    if (deleteUserError) {
      console.warn('Error deleting user record (may have been deleted by trigger):', deleteUserError);
      // Don't fail if this errors - trigger may have already deleted it
    }

    return res.json(createSuccessResponse(null, 'User deleted successfully'));

  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to delete user',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/admin/users/:id/reinvite
 * Resend invitation email to a user
 */
router.post('/users/:id/reinvite', requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { adminPassword } = req.body;

    // Verify admin password first
    if (!adminPassword) {
      return res.status(400).json(createErrorResponse(
        'Admin password is required',
        'ADMIN_PASSWORD_REQUIRED',
        'adminPassword',
        400
      ));
    }

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
    
    if (userError || !user || !user.email) {
      return res.status(401).json(createErrorResponse(
        'Invalid session',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify admin password by attempting to sign in
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: adminPassword
    });

    if (signInError) {
      return res.status(401).json(createErrorResponse(
        'Invalid admin password',
        'INVALID_ADMIN_PASSWORD',
        'adminPassword',
        401
      ));
    }

    // Get target user from database
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name')
      .eq('id', id)
      .single();

    if (fetchError || !targetUser) {
      return res.status(404).json(createErrorResponse(
        'User not found',
        'USER_NOT_FOUND',
        undefined,
        404
      ));
    }

    // Resend invitation
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(targetUser.email, {
      data: {
        full_name: targetUser.full_name || ''
      },
      redirectTo: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/auth?mode=login`
    });

    if (inviteError) {
      console.error('Reinvite user error:', inviteError);
      return res.status(400).json(createErrorResponse(
        inviteError.message || 'Failed to resend invitation',
        'REINVITE_ERROR',
        undefined,
        400
      ));
    }

    return res.json(createSuccessResponse(
      { user: inviteData.user },
      'Invitation resent successfully'
    ));

  } catch (error) {
    console.error('Reinvite user error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to resend invitation',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/admin/users/verify-password
 * Verify current user's password before allowing user creation
 */
router.post('/users/verify-password', requireAdmin, async (req: any, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json(createErrorResponse(
        'Password is required',
        'INVALID_PASSWORD',
        'password',
        400
      ));
    }

    // Get user from token (same as change-password endpoint)
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
    
    if (userError || !user || !user.email) {
      return res.status(401).json(createErrorResponse(
        'Invalid session',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify password by attempting to sign in (same as change-password endpoint)
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: password
    });

    if (signInError) {
      return res.status(400).json(createErrorResponse(
        'Current password is incorrect',
        'INVALID_PASSWORD',
        'password',
        400
      ));
    }

    return res.json(createSuccessResponse({ verified: true }, 'Password verified successfully'));

  } catch (error: any) {
    console.error('Verify password error:', error);
    return res.status(500).json(createErrorResponse(
      error.message || 'Failed to verify password',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/admin/users/create
 * Create a new user or send invitation
 */
router.post('/users/create', requireAdmin, async (req: any, res) => {
  try {
    const { email, full_name, password, role, method, adminPassword } = req.body;

    // Verify admin password first
    if (!adminPassword) {
      return res.status(400).json(createErrorResponse(
        'Admin password is required',
        'ADMIN_PASSWORD_REQUIRED',
        'adminPassword',
        400
      ));
    }

    // Get user from token (same as change-password endpoint)
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
    
    if (userError || !user || !user.email) {
      return res.status(401).json(createErrorResponse(
        'Invalid session',
        'UNAUTHORIZED',
        undefined,
        401
      ));
    }

    // Verify admin password by attempting to sign in (same as change-password endpoint)
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: adminPassword
    });

    if (signInError) {
      return res.status(401).json(createErrorResponse(
        'Invalid admin password',
        'INVALID_ADMIN_PASSWORD',
        'adminPassword',
        401
      ));
    }

    // Validation
    if (!email || !email.includes('@')) {
      return res.status(400).json(createErrorResponse(
        'Valid email is required',
        'INVALID_EMAIL',
        'email',
        400
      ));
    }

    if (!full_name || full_name.trim().length < 2) {
      return res.status(400).json(createErrorResponse(
        'Full name is required and must be at least 2 characters',
        'INVALID_FULL_NAME',
        'full_name',
        400
      ));
    }

    if (!method || (method !== 'invite' && method !== 'create')) {
      return res.status(400).json(createErrorResponse(
        'Method must be either "invite" or "create"',
        'INVALID_METHOD',
        'method',
        400
      ));
    }

    // If method is create, password is required
    if (method === 'create') {
      if (!password || password.length < 6) {
        return res.status(400).json(createErrorResponse(
          'Password is required and must be at least 6 characters',
          'INVALID_PASSWORD',
          'password',
          400
        ));
      }
    }

    // Check if user already exists
    const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingAuthUsers?.users?.some(u => u.email === email);

    if (userExists) {
      return res.status(400).json(createErrorResponse(
        'User with this email already exists',
        'USER_ALREADY_EXISTS',
        'email',
        400
      ));
    }

    let authUser;

    if (method === 'invite') {
      // Send invitation
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: full_name.trim()
        },
        redirectTo: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/auth?mode=login`
      });

      if (inviteError) {
        console.error('Invite user error:', inviteError);
        return res.status(400).json(createErrorResponse(
          inviteError.message || 'Failed to send invitation',
          'INVITE_ERROR',
          undefined,
          400
        ));
      }

      authUser = inviteData.user;
    } else {
      // Create user with password
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          full_name: full_name.trim()
        }
      });

      if (createError) {
        console.error('Create user error:', createError);
        return res.status(400).json(createErrorResponse(
          createError.message || 'Failed to create user',
          'CREATE_USER_ERROR',
          undefined,
          400
        ));
      }

      authUser = createData.user;
    }

    // Check if user record already exists (might be created by trigger)
    const { data: existingUserRecord } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', authUser.id)
      .single();

    let userRecord;
    
    // Get created_at timestamp for setting last_login_at
    const now = new Date().toISOString();
    const updateData: any = {
      email: authUser.email,
      full_name: full_name.trim(),
      role: role || 'user',
      is_active: true,
      email_verified: method === 'create' ? true : false // Auto-verified if created with password
    };

    // If method is create, set last_login_at to created_at so it appears at the top
    if (method === 'create') {
      updateData.last_login_at = now;
    }

    if (existingUserRecord) {
      // User record already exists (created by trigger), update it
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', authUser.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating user record:', updateError);
        // If user record update fails, try to delete the auth user
        if (authUser) {
          await supabaseAdmin.auth.admin.deleteUser(authUser.id);
        }
        return res.status(500).json(createErrorResponse(
          'Failed to update user record',
          'UPDATE_USER_RECORD_ERROR',
          undefined,
          500
        ));
      }
      
      userRecord = updatedUser;
    } else {
      // User record doesn't exist, create it
      const insertData = {
        id: authUser.id,
        ...updateData
      };

      const { data: newUser, error: userError } = await supabaseAdmin
        .from('users')
        .insert(insertData)
        .select()
        .single();

      if (userError) {
        console.error('Error creating user record:', userError);
        // If user record creation fails, try to delete the auth user
        if (authUser) {
          await supabaseAdmin.auth.admin.deleteUser(authUser.id);
        }
        return res.status(500).json(createErrorResponse(
          'Failed to create user record',
          'CREATE_USER_RECORD_ERROR',
          undefined,
          500
        ));
      }
      
      userRecord = newUser;
    }

    return res.json(createSuccessResponse({
      user: userRecord,
      method: method === 'invite' ? 'invitation_sent' : 'user_created'
    }, method === 'invite' ? 'Invitation sent successfully' : 'User created successfully'));

  } catch (error: any) {
    console.error('Create user error:', error);
    return res.status(500).json(createErrorResponse(
      error.message || 'Failed to create user',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

export default router;
