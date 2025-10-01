/**
 * Database Manager - Core database operations
 * Handles all database queries that were previously in SQL functions
 */

import { supabaseAdmin } from '../supabaseClient';
import { createErrorResponse, ERROR_CODES, HTTP_STATUS } from './responseUtils';

export class DatabaseManager {
  /**
   * Get user profile by ID
   */
  static async getUserProfile(userId: string) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error getting user profile:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in getUserProfile:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(userId: string, updateData: {
    full_name?: string;
    avatar_url?: string;
  }) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .eq('is_active', true)
        .select()
        .single();

      if (error) {
        console.error('Error updating user profile:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in updateUserProfile:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Check if user is admin
   */
  static async isAdmin(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', userId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return false;
      }

      return data.role === 'admin';
    } catch (error) {
      console.error('Database error in isAdmin:', error);
      return false;
    }
  }

  /**
   * Check if user has specific role
   */
  static async hasRole(userId: string, role: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', userId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return false;
      }

      return data.role === role;
    } catch (error) {
      console.error('Database error in hasRole:', error);
      return false;
    }
  }

  /**
   * Get user statistics
   */
  static async getUserStats() {
    try {
      const { data: totalUsers } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact' });

      const { data: activeUsers } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact' })
        .eq('is_active', true);

      const { data: verifiedUsers } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact' })
        .eq('email_verified', true);

      const { data: adminUsers } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact' })
        .eq('role', 'admin');

      const { data: newUsersToday } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact' })
        .gte('created_at', new Date().toISOString().split('T')[0]);

      const { data: newUsersThisMonth } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact' })
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

      return {
        success: true,
        data: {
          total_users: totalUsers?.length || 0,
          active_users: activeUsers?.length || 0,
          verified_users: verifiedUsers?.length || 0,
          admin_users: adminUsers?.length || 0,
          new_users_today: newUsersToday?.length || 0,
          new_users_this_month: newUsersThisMonth?.length || 0
        }
      };
    } catch (error) {
      console.error('Database error in getUserStats:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Deactivate user
   */
  static async deactivateUser(userId: string, reason: string = 'Account deactivated') {
    try {
      // Deactivate user
      const { error: userError } = await supabaseAdmin
        .from('users')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (userError) {
        console.error('Error deactivating user:', userError);
        return { success: false, error: userError.message };
      }

      // Deactivate all user sessions
      const { error: sessionError } = await supabaseAdmin
        .from('user_sessions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('is_active', true);

      if (sessionError) {
        console.error('Error deactivating user sessions:', sessionError);
        // Don't fail the operation, just log the error
      }

      return { success: true, data: { reason } };
    } catch (error) {
      console.error('Database error in deactivateUser:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get all users (admin only)
   */
  static async getAllUsers(limit: number = 50, offset: number = 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, email, full_name, avatar_url, role, is_active, email_verified, last_login_at, created_at, updated_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error getting all users:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in getAllUsers:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Update user role (admin only)
   */
  static async updateUserRole(userId: string, newRole: string) {
    try {
      const validRoles = ['user', 'admin', 'moderator'];
      if (!validRoles.includes(newRole)) {
        return { success: false, error: 'Invalid role' };
      }

      const { data, error } = await supabaseAdmin
        .from('users')
        .update({
          role: newRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating user role:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Database error in updateUserRole:', error);
      return { success: false, error: 'Database error' };
    }
  }
}

