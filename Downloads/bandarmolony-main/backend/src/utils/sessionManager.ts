/**
 * Session Manager - Handles user session operations
 * Moved from SQL functions to TypeScript for better maintainability
 */

import { supabaseAdmin } from '../supabaseClient';
import crypto from 'crypto';

export class SessionManager {
  /**
   * Create or update user session
   */
  static async createOrUpdateSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    ipAddress?: string,
    userAgent?: string
  ) {
    try {
      // Check if session already exists
      const { data: existingSession } = await supabaseAdmin
        .from('user_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('token_hash', tokenHash)
        .eq('is_active', true)
        .single();

      if (existingSession) {
        // Update existing session
        const { data, error } = await supabaseAdmin
          .from('user_sessions')
          .update({
            expires_at: expiresAt.toISOString(),
            ip_address: ipAddress,
            user_agent: userAgent,
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSession.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating session:', error);
          return { success: false, error: error.message };
        }

        return { success: true, data };
      } else {
        // Create new session
        const { data, error } = await supabaseAdmin
          .from('user_sessions')
          .insert({
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt.toISOString(),
            ip_address: ipAddress,
            user_agent: userAgent,
            is_active: true
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating session:', error);
          return { success: false, error: error.message };
        }

        return { success: true, data };
      }
    } catch (error) {
      console.error('Database error in createOrUpdateSession:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Validate user session
   * Note: Since database minimal doesn't have RLS policies, we rely on Supabase Auth validation
   */
  static async validateSession(userId: string, tokenHash: string): Promise<boolean> {
    try {
      // For minimal database, we'll do basic session tracking
      const { data, error } = await supabaseAdmin
        .from('user_sessions')
        .select('id, expires_at, updated_at')
        .eq('user_id', userId)
        .eq('token_hash', tokenHash)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        // If no session found, create one for tracking
        try {
          await this.createOrUpdateSession(
            userId,
            tokenHash,
            new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
          );
        } catch (createError) {
        }
        return true; // Allow for new sessions
      }

      // Check if session is expired
      const now = new Date();
      const expiresAt = new Date(data.expires_at);

      if (expiresAt < now) {
        // Deactivate expired session
        await supabaseAdmin
          .from('user_sessions')
          .update({
            is_active: false,
            updated_at: now.toISOString()
          })
          .eq('id', data.id);

        return false;
      }

      // Update last activity (only if not updated in last minute)
      const lastUpdate = new Date(data.updated_at);
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

      if (lastUpdate < oneMinuteAgo) {
        await supabaseAdmin
          .from('user_sessions')
          .update({
            updated_at: now.toISOString()
          })
          .eq('id', data.id);
      }

      return true;
    } catch (error) {
      console.error('Database error in validateSession:', error);
      return true; // Allow access if database error (fail open for minimal setup)
    }
  }

  /**
   * Deactivate user session
   */
  static async deactivateSession(sessionId: string) {
    try {
      const { error } = await supabaseAdmin
        .from('user_sessions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) {
        console.error('Error deactivating session:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Database error in deactivateSession:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Deactivate all user sessions (logout all devices)
   */
  static async deactivateUserSessions(userId: string, exceptTokenHash?: string) {
    try {
      let query = supabaseAdmin
        .from('user_sessions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('is_active', true);

      if (exceptTokenHash) {
        query = query.neq('token_hash', exceptTokenHash);
      }

      const { error } = await query;

      if (error) {
        console.error('Error deactivating user sessions:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Database error in deactivateUserSessions:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get user active sessions
   */
  static async getUserActiveSessions(userId: string) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_sessions')
        .select('id, token_hash, expires_at, ip_address, user_agent, created_at, updated_at')
        .eq('user_id', userId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting user active sessions:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in getUserActiveSessions:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Cleanup expired sessions
   */
  static async cleanupExpiredSessions() {
    try {
      const now = new Date().toISOString();

      // First, deactivate expired sessions
      const { error: deactivateError } = await supabaseAdmin
        .from('user_sessions')
        .update({
          is_active: false,
          updated_at: now
        })
        .eq('is_active', true)
        .lt('expires_at', now);

      if (deactivateError) {
        console.error('Error deactivating expired sessions:', deactivateError);
        return { success: false, error: deactivateError.message };
      }

      // Then, delete very old sessions (older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { error: deleteError } = await supabaseAdmin
        .from('user_sessions')
        .delete()
        .lt('expires_at', thirtyDaysAgo.toISOString());

      if (deleteError) {
        console.error('Error deleting old sessions:', deleteError);
        return { success: false, error: deleteError.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Database error in cleanupExpiredSessions:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Generate token hash
   */
  static generateTokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Get session by token hash
   */
  static async getSessionByTokenHash(tokenHash: string) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_sessions')
        .select(`
          id,
          user_id,
          expires_at,
          is_active,
          ip_address,
          user_agent,
          created_at,
          updated_at,
          users!inner(id, email, full_name, role, is_active)
        `)
        .eq('token_hash', tokenHash)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error) {
        console.error('Error getting session by token hash:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in getSessionByTokenHash:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get session statistics
   */
  static async getSessionStats() {
    try {
      const { data: totalSessions } = await supabaseAdmin
        .from('user_sessions')
        .select('id', { count: 'exact' });

      const { data: activeSessions } = await supabaseAdmin
        .from('user_sessions')
        .select('id', { count: 'exact' })
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      const { data: expiredSessions } = await supabaseAdmin
        .from('user_sessions')
        .select('id', { count: 'exact' })
        .lt('expires_at', new Date().toISOString());

      return {
        success: true,
        data: {
          total_sessions: totalSessions?.length || 0,
          active_sessions: activeSessions?.length || 0,
          expired_sessions: expiredSessions?.length || 0
        }
      };
    } catch (error) {
      console.error('Database error in getSessionStats:', error);
      return { success: false, error: 'Database error' };
    }
  }
}