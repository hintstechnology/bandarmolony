import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClient';
import { createSuccessResponse, createErrorResponse, ERROR_CODES, HTTP_STATUS } from '../utils/responseUtils';
import { 
  getSchedulerConfig, 
  updateSchedulerConfig, 
  restartScheduler, 
  stopScheduler, 
  startScheduler, 
  getSchedulerStatus,
  getAllPhasesStatus,
  triggerPhase,
  togglePhaseEnabled,
  updatePhaseTriggerConfig
} from '../services/scheduler';

const router = Router();

// Middleware to check if user is developer
const requireDeveloper = async (req: any, res: any, next: any) => {
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

    // Check if user is developer
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return res.status(403).json(createErrorResponse(
        'Developer access required',
        ERROR_CODES.FORBIDDEN,
        undefined,
        HTTP_STATUS.FORBIDDEN
      ));
    }

    if (!userProfile || userProfile.role !== 'developer') {
      return res.status(403).json(createErrorResponse(
        'Developer access required',
        ERROR_CODES.FORBIDDEN,
        undefined,
        HTTP_STATUS.FORBIDDEN
      ));
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Developer middleware error:', error);
    res.status(500).json(createErrorResponse(
        'Internal server error',
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        undefined,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
};

/**
 * GET /api/developer/stats
 * Get user statistics
 */
router.get('/stats', requireDeveloper, async (_req, res) => {
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
    console.error('Get developer stats error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to retrieve user statistics',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * GET /api/developer/users
 * Get users list with pagination and filters
 */
router.get('/users', requireDeveloper, async (req, res) => {
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
 * PUT /api/developer/users/:id/suspend
 * Suspend or unsuspend a user
 */
router.put('/users/:id/suspend', requireDeveloper, async (req, res) => {
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
 * GET /api/developer/recent-users
 * Get recent user registrations
 */
router.get('/recent-users', requireDeveloper, async (req, res) => {
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

/**
 * PATCH /api/developer/users/:id/email-verification
 * Update user email verification status
 */
router.patch('/users/:id/email-verification', requireDeveloper, async (req, res) => {
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
 * GET /api/developer/scheduler/config
 * Get scheduler configuration
 */
router.get('/scheduler/config', requireDeveloper, async (_req, res) => {
  try {
    const config = getSchedulerConfig();
    const status = getSchedulerStatus();
    
    res.json(createSuccessResponse({
      config,
      status
    }, 'Scheduler configuration retrieved successfully'));
  } catch (error) {
    console.error('Get scheduler config error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to retrieve scheduler configuration',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * PUT /api/developer/scheduler/phases/:phaseId/trigger-config
 * Update phase trigger configuration (schedule time or trigger after phase)
 */
router.put('/scheduler/phases/:phaseId/trigger-config', requireDeveloper, async (req, res) => {
  try {
    const { phaseId } = req.params;
    const { triggerType, schedule, triggerAfterPhase } = req.body;
    
    if (!triggerType || (triggerType !== 'scheduled' && triggerType !== 'auto')) {
      return res.status(400).json(createErrorResponse(
        'triggerType is required and must be "scheduled" or "auto"',
        'VALIDATION_ERROR',
        'triggerType',
        400
      ));
    }
    
    if (triggerType === 'scheduled' && !schedule) {
      return res.status(400).json(createErrorResponse(
        'schedule is required when triggerType is "scheduled"',
        'VALIDATION_ERROR',
        'schedule',
        400
      ));
    }
    
    if (triggerType === 'auto' && !triggerAfterPhase) {
      return res.status(400).json(createErrorResponse(
        'triggerAfterPhase is required when triggerType is "auto"',
        'VALIDATION_ERROR',
        'triggerAfterPhase',
        400
      ));
    }
    
    const result = await updatePhaseTriggerConfig(phaseId, triggerType, schedule, triggerAfterPhase);
    
    if (result.success) {
      return res.json(createSuccessResponse(result, result.message));
    } else {
      return res.status(400).json(createErrorResponse(
        result.message,
        'UPDATE_FAILED',
        undefined,
        400
      ));
    }
  } catch (error) {
    console.error('Update phase trigger config error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to update phase trigger configuration',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * PUT /api/developer/scheduler/config
 * Update scheduler configuration and restart scheduler
 */
router.put('/scheduler/config', requireDeveloper, async (req, res) => {
  try {
    const { 
      PHASE1_DATA_COLLECTION_TIME, 
      PHASE1_SHAREHOLDERS_TIME,
      TIMEZONE,
      MEMORY_CLEANUP_INTERVAL,
      FORCE_GC_INTERVAL,
      MEMORY_THRESHOLD_GB,
      WEEKEND_SKIP
    } = req.body;
    
    // Validate time format (HH:MM)
    const timeFormatRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    
    const newConfig: any = {};
    
    if (PHASE1_DATA_COLLECTION_TIME !== undefined) {
      if (!timeFormatRegex.test(PHASE1_DATA_COLLECTION_TIME)) {
        return res.status(400).json(createErrorResponse(
          'Invalid time format for PHASE1_DATA_COLLECTION_TIME. Use HH:MM format (e.g., 19:00)',
          'VALIDATION_ERROR',
          'PHASE1_DATA_COLLECTION_TIME',
          400
        ));
      }
      newConfig.PHASE1_DATA_COLLECTION_TIME = PHASE1_DATA_COLLECTION_TIME;
    }
    
    if (PHASE1_SHAREHOLDERS_TIME !== undefined) {
      if (!timeFormatRegex.test(PHASE1_SHAREHOLDERS_TIME)) {
        return res.status(400).json(createErrorResponse(
          'Invalid time format for PHASE1_SHAREHOLDERS_TIME. Use HH:MM format (e.g., 00:01)',
          'VALIDATION_ERROR',
          'PHASE1_SHAREHOLDERS_TIME',
          400
        ));
      }
      newConfig.PHASE1_SHAREHOLDERS_TIME = PHASE1_SHAREHOLDERS_TIME;
    }
    
    if (TIMEZONE !== undefined) {
      newConfig.TIMEZONE = TIMEZONE;
    }
    
    if (MEMORY_CLEANUP_INTERVAL !== undefined) {
      if (typeof MEMORY_CLEANUP_INTERVAL !== 'number' || MEMORY_CLEANUP_INTERVAL < 1000) {
        return res.status(400).json(createErrorResponse(
          'MEMORY_CLEANUP_INTERVAL must be a number >= 1000 (milliseconds)',
          'VALIDATION_ERROR',
          'MEMORY_CLEANUP_INTERVAL',
          400
        ));
      }
      newConfig.MEMORY_CLEANUP_INTERVAL = MEMORY_CLEANUP_INTERVAL;
    }
    
    if (FORCE_GC_INTERVAL !== undefined) {
      if (typeof FORCE_GC_INTERVAL !== 'number' || FORCE_GC_INTERVAL < 1000) {
        return res.status(400).json(createErrorResponse(
          'FORCE_GC_INTERVAL must be a number >= 1000 (milliseconds)',
          'VALIDATION_ERROR',
          'FORCE_GC_INTERVAL',
          400
        ));
      }
      newConfig.FORCE_GC_INTERVAL = FORCE_GC_INTERVAL;
    }
    
    if (MEMORY_THRESHOLD_GB !== undefined) {
      if (typeof MEMORY_THRESHOLD_GB !== 'number' || MEMORY_THRESHOLD_GB < 1) {
        return res.status(400).json(createErrorResponse(
          'MEMORY_THRESHOLD_GB must be a number >= 1 (GB)',
          'VALIDATION_ERROR',
          'MEMORY_THRESHOLD_GB',
          400
        ));
      }
      newConfig.MEMORY_THRESHOLD = MEMORY_THRESHOLD_GB * 1024 * 1024 * 1024;
    }
    
    if (WEEKEND_SKIP !== undefined) {
      if (typeof WEEKEND_SKIP !== 'boolean') {
        return res.status(400).json(createErrorResponse(
          'WEEKEND_SKIP must be a boolean',
          'VALIDATION_ERROR',
          'WEEKEND_SKIP',
          400
        ));
      }
      newConfig.WEEKEND_SKIP = WEEKEND_SKIP;
    }
    
    // Update configuration
    updateSchedulerConfig(newConfig);
    
    // Restart scheduler with new configuration
    restartScheduler();
    
    const updatedConfig = getSchedulerConfig();
    const status = getSchedulerStatus();
    
    return res.json(createSuccessResponse({
      config: updatedConfig,
      status,
      message: 'Scheduler configuration updated and scheduler restarted successfully'
    }, 'Scheduler configuration updated successfully'));
  } catch (error) {
    console.error('Update scheduler config error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to update scheduler configuration',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/developer/scheduler/stop
 * Stop the scheduler
 */
router.post('/scheduler/stop', requireDeveloper, async (_req, res) => {
  try {
    stopScheduler();
    const status = getSchedulerStatus();
    
    res.json(createSuccessResponse({
      status,
      message: 'Scheduler stopped successfully'
    }, 'Scheduler stopped successfully'));
  } catch (error) {
    console.error('Stop scheduler error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to stop scheduler',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/developer/scheduler/start
 * Start the scheduler
 */
router.post('/scheduler/start', requireDeveloper, async (_req, res) => {
  try {
    startScheduler();
    const status = getSchedulerStatus();
    
    res.json(createSuccessResponse({
      status,
      message: 'Scheduler started successfully'
    }, 'Scheduler started successfully'));
  } catch (error) {
    console.error('Start scheduler error:', error);
    res.status(500).json(createErrorResponse(
      'Failed to start scheduler',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * GET /api/developer/scheduler/status
 * Get scheduler status
 */
router.get('/scheduler/status', requireDeveloper, async (_req, res) => {
  try {
    const status = getSchedulerStatus();
    
    return res.json(createSuccessResponse(status, 'Scheduler status retrieved successfully'));
  } catch (error) {
    console.error('Get scheduler status error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to retrieve scheduler status',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * GET /api/developer/scheduler/phases
 * Get all phases status and configuration
 */
router.get('/scheduler/phases', requireDeveloper, async (_req, res) => {
  try {
    const phasesStatus = getAllPhasesStatus();
    
    return res.json(createSuccessResponse(phasesStatus, 'All phases status retrieved successfully'));
  } catch (error) {
    console.error('Get phases status error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to retrieve phases status',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * POST /api/developer/scheduler/phases/:phaseId/trigger
 * Trigger a specific phase manually
 */
router.post('/scheduler/phases/:phaseId/trigger', requireDeveloper, async (req, res) => {
  try {
    const { phaseId } = req.params;
    
    const result = await triggerPhase(phaseId);
    
    if (result.success) {
      return res.json(createSuccessResponse(result, result.message));
    } else {
      return res.status(400).json(createErrorResponse(
        result.message,
        'TRIGGER_FAILED',
        undefined,
        400
      ));
    }
  } catch (error) {
    console.error('Trigger phase error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to trigger phase',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * PUT /api/developer/scheduler/phases/:phaseId/enable
 * Enable or disable a specific phase
 */
router.put('/scheduler/phases/:phaseId/enable', requireDeveloper, async (req, res) => {
  try {
    const { phaseId } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json(createErrorResponse(
        'Enabled status is required (boolean)',
        'VALIDATION_ERROR',
        'enabled',
        400
      ));
    }
    
    const result = await togglePhaseEnabled(phaseId, enabled);
    
    if (result.success) {
      return res.json(createSuccessResponse(result, result.message));
    } else {
      return res.status(400).json(createErrorResponse(
        result.message,
        'TOGGLE_FAILED',
        undefined,
        400
      ));
    }
  } catch (error) {
    console.error('Toggle phase enabled error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to toggle phase enabled status',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

export default router;

