/**
 * Audit Logger - Handles audit logging operations
 * Moved from SQL functions to TypeScript for better maintainability
 */

import { supabaseAdmin } from '../supabaseClient';

export class AuditLogger {
  /**
   * Log user action
   */
  static async logUserAction(
    userId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    oldValues?: any,
    newValues?: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    try {
      const { data, error } = await supabaseAdmin
        .from('audit_logs')
        .insert({
          user_id: userId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          old_values: oldValues ? JSON.stringify(oldValues) : null,
          new_values: newValues ? JSON.stringify(newValues) : null,
          ip_address: ipAddress,
          user_agent: userAgent
        })
        .select()
        .single();

      if (error) {
        console.error('Error logging user action:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in logUserAction:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Log authentication events
   */
  static async logAuthEvent(
    userId: string,
    event: 'login' | 'logout' | 'register' | 'password_reset' | 'email_verification',
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    return this.logUserAction(
      userId,
      event,
      'auth',
      userId,
      null,
      details,
      ipAddress,
      userAgent
    );
  }

  /**
   * Log profile changes
   */
  static async logProfileChange(
    userId: string,
    oldProfile: any,
    newProfile: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    return this.logUserAction(
      userId,
      'profile_updated',
      'user',
      userId,
      oldProfile,
      newProfile,
      ipAddress,
      userAgent
    );
  }

  /**
   * Log admin actions
   */
  static async logAdminAction(
    adminUserId: string,
    action: string,
    targetUserId: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    return this.logUserAction(
      adminUserId,
      action,
      'user',
      targetUserId,
      null,
      details,
      ipAddress,
      userAgent
    );
  }

  /**
   * Log system events
   */
  static async logSystemEvent(
    event: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    try {
      const { data, error } = await supabaseAdmin
        .from('audit_logs')
        .insert({
          user_id: null, // System event
          action: event,
          resource_type: 'system',
          resource_id: null,
          old_values: null,
          new_values: details ? JSON.stringify(details) : null,
          ip_address: ipAddress,
          user_agent: userAgent
        })
        .select()
        .single();

      if (error) {
        console.error('Error logging system event:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in logSystemEvent:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get audit logs for a user
   */
  static async getUserAuditLogs(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    action?: string
  ) {
    try {
      let query = supabaseAdmin
        .from('audit_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (action) {
        query = query.eq('action', action);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getting user audit logs:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in getUserAuditLogs:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get all audit logs (admin only)
   */
  static async getAllAuditLogs(
    limit: number = 100,
    offset: number = 0,
    action?: string,
    resourceType?: string,
    userId?: string
  ) {
    try {
      let query = supabaseAdmin
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (action) {
        query = query.eq('action', action);
      }

      if (resourceType) {
        query = query.eq('resource_type', resourceType);
      }

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getting all audit logs:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in getAllAuditLogs:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get audit logs by resource
   */
  static async getResourceAuditLogs(
    resourceType: string,
    resourceId: string,
    limit: number = 50,
    offset: number = 0
  ) {
    try {
      const { data, error } = await supabaseAdmin
        .from('audit_logs')
        .select('*')
        .eq('resource_type', resourceType)
        .eq('resource_id', resourceId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error getting resource audit logs:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in getResourceAuditLogs:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get audit statistics
   */
  static async getAuditStats() {
    try {
      const { data: totalLogs } = await supabaseAdmin
        .from('audit_logs')
        .select('id', { count: 'exact' });

      const { data: todayLogs } = await supabaseAdmin
        .from('audit_logs')
        .select('id', { count: 'exact' })
        .gte('created_at', new Date().toISOString().split('T')[0]);

      const { data: thisWeekLogs } = await supabaseAdmin
        .from('audit_logs')
        .select('id', { count: 'exact' })
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const { data: thisMonthLogs } = await supabaseAdmin
        .from('audit_logs')
        .select('id', { count: 'exact' })
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

      return {
        success: true,
        data: {
          total_logs: totalLogs?.length || 0,
          today_logs: todayLogs?.length || 0,
          this_week_logs: thisWeekLogs?.length || 0,
          this_month_logs: thisMonthLogs?.length || 0
        }
      };
    } catch (error) {
      console.error('Database error in getAuditStats:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Clean up old audit logs
   */
  static async cleanupOldLogs(daysOld: number = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { error } = await supabaseAdmin
        .from('audit_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        console.error('Error cleaning up old audit logs:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Database error in cleanupOldLogs:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get audit logs by date range
   */
  static async getAuditLogsByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 100,
    offset: number = 0
  ) {
    try {
      const { data, error } = await supabaseAdmin
        .from('audit_logs')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error getting audit logs by date range:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in getAuditLogsByDateRange:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get most common actions
   */
  static async getMostCommonActions(limit: number = 10) {
    try {
      const { data, error } = await supabaseAdmin
        .from('audit_logs')
        .select('action')
        .order('action');

      if (error) {
        console.error('Error getting most common actions:', error);
        return { success: false, error: error.message };
      }

      // Count occurrences of each action
      const actionCounts = data.reduce((acc: any, log: any) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {});

      // Sort by count and return top actions
      const sortedActions = Object.entries(actionCounts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, limit)
        .map(([action, count]) => ({ action, count }));

      return { success: true, data: sortedActions };
    } catch (error) {
      console.error('Database error in getMostCommonActions:', error);
      return { success: false, error: 'Database error' };
    }
  }
}

