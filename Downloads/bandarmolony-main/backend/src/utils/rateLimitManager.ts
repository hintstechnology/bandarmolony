/**
 * Rate Limit Manager - Handles rate limiting operations
 * Moved from SQL functions to TypeScript for better maintainability
 */

import { supabaseAdmin } from '../supabaseClient';

export class RateLimitManager {
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MINUTES = 15;

  /**
   * Check if login is allowed for email/IP
   */
  static async checkLoginRateLimit(email: string, ipAddress?: string) {
    try {
      const { data, error } = await supabaseAdmin
        .from('login_attempts')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" error, which is expected
        console.error('Error checking rate limit:', error);
        return { success: false, error: error.message };
      }

      // If no record exists, allow login
      if (!data) {
        return {
          success: true,
          data: {
            allowed: true,
            remaining_attempts: this.MAX_ATTEMPTS,
            blocked_until: null,
            is_suspended: false,
            suspension_reason: null
          }
        };
      }

      const now = new Date();
      const lockoutDuration = this.LOCKOUT_DURATION_MINUTES * 60 * 1000; // Convert to milliseconds
      const lastAttempt = new Date(data.last_attempt);
      const lockoutEnd = new Date(lastAttempt.getTime() + lockoutDuration);

      // Check if currently blocked
      if (data.blocked_until && new Date(data.blocked_until) > now) {
        return {
          success: true,
          data: {
          allowed: false,
            remaining_attempts: 0,
            blocked_until: data.blocked_until,
            is_suspended: false,
            suspension_reason: null
          }
        };
      }

      // Check if suspended
      if (data.is_suspended) {
        return {
          success: true,
          data: {
          allowed: false,
            remaining_attempts: 0,
            blocked_until: null,
            is_suspended: true,
            suspension_reason: data.suspension_reason
          }
        };
      }

        // Reset attempts if lockout period has passed
      if (lastAttempt < new Date(now.getTime() - lockoutDuration)) {
        await supabaseAdmin
          .from('login_attempts')
          .update({
            attempt_count: 0,
            blocked_until: null,
            updated_at: now.toISOString()
          })
          .eq('id', data.id);

        return {
          success: true,
          data: {
            allowed: true,
            remaining_attempts: this.MAX_ATTEMPTS,
            blocked_until: null,
            is_suspended: false,
            suspension_reason: null
          }
        };
      }

      // Calculate remaining attempts
      const remaining = Math.max(0, this.MAX_ATTEMPTS - data.attempt_count);

      // Check if at or over limit
      if (data.attempt_count >= this.MAX_ATTEMPTS) {
        // Auto-block user when reaching max attempts
        const blockedUntil = new Date(now.getTime() + lockoutDuration);
        await supabaseAdmin
          .from('login_attempts')
          .update({
            blocked_until: blockedUntil.toISOString(),
            updated_at: now.toISOString()
          })
          .eq('id', data.id);

        return {
          success: true,
          data: {
          allowed: false,
            remaining_attempts: remaining,
            blocked_until: blockedUntil.toISOString(),
            is_suspended: false,
            suspension_reason: null
          }
        };
      }

      // Allow login if under limit
      return {
        success: true,
        data: {
          allowed: true,
          remaining_attempts: remaining,
          blocked_until: null,
          is_suspended: false,
          suspension_reason: null
        }
      };
    } catch (error) {
      console.error('Database error in checkLoginRateLimit:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Record login attempt
   */
  static async recordLoginAttempt(
    email: string,
    ipAddress?: string,
    success: boolean = false
  ) {
    try {
      const { data: existingRecord } = await supabaseAdmin
        .from('login_attempts')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const now = new Date();
      const lockoutDuration = this.LOCKOUT_DURATION_MINUTES * 60 * 1000;

      if (success) {
        // Reset attempts on successful login
        if (existingRecord) {
          const { error } = await supabaseAdmin
            .from('login_attempts')
            .update({
              attempt_count: 0,
              blocked_until: null,
              is_suspended: false,
              suspension_reason: null,
              last_attempt: now.toISOString(),
              updated_at: now.toISOString()
            })
            .eq('id', existingRecord.id);

          if (error) {
            console.error('Error resetting login attempts:', error);
            // Don't fail the login process if rate limiting fails
            return { success: true };
          }
        } else {
          // Create new record with 0 attempts for successful login
          const { error } = await supabaseAdmin
            .from('login_attempts')
            .insert({
              email,
              ip_address: ipAddress,
              attempt_count: 0,
              last_attempt: now.toISOString()
            });

          if (error) {
            console.error('Error creating login attempt record:', error);
            // Don't fail the login process if rate limiting fails
            return { success: true };
          }
        }
      } else {
        // Increment failed attempts
        if (existingRecord) {
          // Check if lockout period has passed (auto-reset)
          const lastAttempt = new Date(existingRecord.last_attempt);
          if (lastAttempt < new Date(now.getTime() - lockoutDuration)) {
            // Reset attempts if lockout period has passed
            const { error } = await supabaseAdmin
              .from('login_attempts')
              .update({
                attempt_count: 1,
                blocked_until: null,
                last_attempt: now.toISOString(),
                updated_at: now.toISOString()
              })
              .eq('id', existingRecord.id);

            if (error) {
              console.error('Error resetting login attempts:', error);
              // Don't fail the login process if rate limiting fails
            return { success: true };
            }
          } else {
            // Increment failed attempts
            const { error } = await supabaseAdmin
            .from('login_attempts')
            .update({
                attempt_count: existingRecord.attempt_count + 1,
                last_attempt: now.toISOString(),
                updated_at: now.toISOString()
            })
            .eq('id', existingRecord.id);

            if (error) {
              console.error('Error incrementing login attempts:', error);
              // Don't fail the login process if rate limiting fails
            return { success: true };
            }
          }
        } else {
          // Create new record with 1 failed attempt
          const { error } = await supabaseAdmin
            .from('login_attempts')
            .insert({
              email,
              ip_address: ipAddress,
              attempt_count: 1,
              last_attempt: now.toISOString()
            });

          if (error) {
            console.error('Error creating login attempt record:', error);
            // Don't fail the login process if rate limiting fails
            return { success: true };
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Database error in recordLoginAttempt:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Block user after max failed attempts
   */
  static async blockUserAfterMaxAttempts(email: string, ipAddress?: string) {
    try {
      const { data: attemptRecord } = await supabaseAdmin
        .from('login_attempts')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!attemptRecord || attemptRecord.attempt_count < this.MAX_ATTEMPTS) {
        return { success: true, data: { message: 'No action needed' } };
      }

      const now = new Date();
      const blockedUntil = new Date(now.getTime() + (this.LOCKOUT_DURATION_MINUTES * 60 * 1000));

      const { error } = await supabaseAdmin
        .from('login_attempts')
        .update({
          blocked_until: blockedUntil.toISOString(),
          updated_at: now.toISOString()
        })
        .eq('id', attemptRecord.id);

      if (error) {
        console.error('Error blocking user:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: { blocked_until: blockedUntil.toISOString() } };
    } catch (error) {
      console.error('Database error in blockUserAfterMaxAttempts:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Suspend user account
   */
  static async suspendUser(email: string, reason: string) {
    try {
      const { error } = await supabaseAdmin
        .from('login_attempts')
        .update({
          is_suspended: true,
          suspension_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('email', email);

      if (error) {
        console.error('Error suspending user:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: { reason } };
    } catch (error) {
      console.error('Database error in suspendUser:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Unsuspend user account
   */
  static async unsuspendUser(email: string) {
    try {
      const { error } = await supabaseAdmin
        .from('login_attempts')
        .update({
          is_suspended: false,
          suspension_reason: null,
          attempt_count: 0,
          blocked_until: null,
          updated_at: new Date().toISOString()
        })
        .eq('email', email);

      if (error) {
        console.error('Error unsuspending user:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Database error in unsuspendUser:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get rate limit statistics
   */
  static async getRateLimitStats() {
    try {
      const { data: totalAttempts } = await supabaseAdmin
        .from('login_attempts')
        .select('id', { count: 'exact' });

      const { data: blockedAttempts } = await supabaseAdmin
        .from('login_attempts')
        .select('id', { count: 'exact' })
        .not('blocked_until', 'is', null)
        .gt('blocked_until', new Date().toISOString());

      const { data: suspendedAccounts } = await supabaseAdmin
        .from('login_attempts')
        .select('id', { count: 'exact' })
        .eq('is_suspended', true);

      return {
        success: true,
        data: {
          total_attempts: totalAttempts?.length || 0,
          blocked_attempts: blockedAttempts?.length || 0,
          suspended_accounts: suspendedAccounts?.length || 0
        }
      };
    } catch (error) {
      console.error('Database error in getRateLimitStats:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Clean up old login attempts
   */
  static async cleanupOldAttempts(daysOld: number = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { error } = await supabaseAdmin
        .from('login_attempts')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        console.error('Error cleaning up old attempts:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Database error in cleanupOldAttempts:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get user's login attempt history
   */
  static async getUserAttemptHistory(email: string, limit: number = 10) {
    try {
      const { data, error } = await supabaseAdmin
        .from('login_attempts')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error getting user attempt history:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in getUserAttemptHistory:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get current login attempt data for an email
   */
  static async getLoginAttempts(email: string) {
    try {
      const { data, error } = await supabaseAdmin
        .from('login_attempts')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error getting login attempts:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data || null };
    } catch (error) {
      console.error('Database error in getLoginAttempts:', error);
      return { success: false, error: 'Database error' };
    }
  }
}