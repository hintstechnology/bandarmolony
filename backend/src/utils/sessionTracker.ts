import { supabaseAdmin } from '../supabaseClient';

export interface SessionData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export class SessionTracker {
  /**
   * Create a new session record in user_sessions table
   */
  static async createSession(sessionData: SessionData): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('user_sessions')
        .insert({
          user_id: sessionData.userId,
          token_hash: sessionData.tokenHash,
          expires_at: sessionData.expiresAt.toISOString(),
          ip_address: sessionData.ipAddress,
          user_agent: sessionData.userAgent,
          is_active: true
        });

      if (error) {
        console.error('Failed to create session record:', error);
        // Don't throw error to avoid breaking login flow
      } else {
      }
    } catch (error) {
      console.error('Session tracking error:', error);
    }
  }

  /**
   * Update session activity (last seen)
   */
  static async updateSessionActivity(userId: string, tokenHash: string): Promise<void> {
    try {
      // Only update existing session, don't create new ones
      const { error } = await supabaseAdmin
        .from('user_sessions')
        .update({ 
          updated_at: new Date().toISOString() 
        })
        .eq('user_id', userId)
        .eq('token_hash', tokenHash)
        .eq('is_active', true);

      if (error) {
        // Silently fail if session doesn't exist - this is normal for new sessions
      }
    } catch (error) {
      console.error('Session activity update error:', error);
    }
  }

  /**
   * Deactivate session (logout)
   */
  static async deactivateSession(userId: string, tokenHash: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('user_sessions')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('token_hash', tokenHash);

      if (error) {
        console.error('Failed to deactivate session:', error);
      } else {
      }
    } catch (error) {
      console.error('Session deactivation error:', error);
    }
  }

  /**
   * Deactivate all sessions for a user
   */
  static async deactivateAllUserSessions(userId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('user_sessions')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Failed to deactivate all user sessions:', error);
      } else {
      }
    } catch (error) {
      console.error('Deactivate all sessions error:', error);
    }
  }

  /**
   * Get active sessions for a user
   */
  static async getUserActiveSessions(userId: string): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to get user sessions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Get user sessions error:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<number> {
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
        console.error('Failed to deactivate expired sessions:', deactivateError);
        return 0;
      }

      // Then, delete very old sessions (older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { error: deleteError } = await supabaseAdmin
        .from('user_sessions')
        .delete()
        .lt('expires_at', thirtyDaysAgo.toISOString());

      if (deleteError) {
        console.error('Failed to delete old sessions:', deleteError);
        return 0;
      }

      return 1; // Return 1 to indicate success
    } catch (error) {
      console.error('Cleanup expired sessions error:', error);
      return 0;
    }
  }

  /**
   * Generate token hash for tracking
   */
  static generateTokenHash(token: string): string {
    // Simple hash for tracking purposes
    // In production, you might want to use a proper hash function
    return Buffer.from(token).toString('base64').substring(0, 32);
  }

  /**
   * Extract IP address from request
   */
  static extractIPAddress(req: any): string | undefined {
    return req.ip || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           (req.connection?.socket ? req.connection.socket.remoteAddress : null) ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           'unknown';
  }

  /**
   * Extract User Agent from request
   */
  static extractUserAgent(req: any): string | undefined {
    return req.headers['user-agent'] || 'unknown';
  }
}
