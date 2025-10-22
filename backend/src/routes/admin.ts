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

    // Check if user is admin
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
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

    if (!userProfile || userProfile.role !== 'admin') {
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
router.put('/users/:id/suspend', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { suspended } = req.body;

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
 * GET /api/admin/recent-users
 * Get recent user registrations
 */
router.get('/recent-users', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 5;

    const { data: recentUsers, error: recentError } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, role, is_active, email_verified, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (recentError) throw recentError;

    res.json(createSuccessResponse(recentUsers || [], 'Recent users retrieved successfully'));

  } catch (error) {
    console.error('Get recent users error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to retrieve recent users',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

export default router;
