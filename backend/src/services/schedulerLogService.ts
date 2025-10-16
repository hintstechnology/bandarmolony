// schedulerLogService.ts
// Service for managing scheduler logs in database

import { supabaseAdmin } from '../supabaseClient';

export interface SchedulerLog {
  id?: string;
  created_at?: string;
  updated_at?: string;
  feature_name: 'rrc' | 'rrg' | 'seasonal' | 'trend';
  trigger_type: 'startup' | 'scheduled' | 'manual' | 'debug';
  triggered_by?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  force_override?: boolean;
  total_files_processed?: number;
  files_created?: number;
  files_updated?: number;
  files_skipped?: number;
  files_failed?: number;
  stock_processed?: number;
  stock_success?: number;
  stock_failed?: number;
  sector_processed?: number;
  sector_success?: number;
  sector_failed?: number;
  index_processed?: number;
  index_success?: number;
  index_failed?: number;
  error_message?: string;
  error_details?: any;
  retry_count?: number;
  progress_percentage?: number;
  current_processing?: string;
  estimated_completion?: string;
  server_info?: any;
  azure_storage_info?: any;
  environment?: string;
}

export class SchedulerLogService {
  /**
   * Create a new scheduler log entry
   */
  static async createLog(logData: Partial<SchedulerLog>): Promise<SchedulerLog | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('scheduler_logs')
        .insert([{
          ...logData,
          started_at: new Date().toISOString(),
          environment: process.env['NODE_ENV'] || 'development'
        }])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating scheduler log:', error);
        return null;
      }

      console.log('✅ Scheduler log created:', data.id);
      return data;
    } catch (error) {
      console.error('❌ Error creating scheduler log:', error);
      return null;
    }
  }

  /**
   * Update an existing scheduler log
   */
  static async updateLog(logId: string, updates: Partial<SchedulerLog>): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('scheduler_logs')
        .update(updates)
        .eq('id', logId);

      if (error) {
        console.error('❌ Error updating scheduler log:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Error updating scheduler log:', error);
      return false;
    }
  }

  /**
   * Get the latest log for a specific feature
   */
  static async getLatestLog(featureName: string): Promise<SchedulerLog | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('scheduler_logs')
        .select('*')
        .eq('feature_name', featureName)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('❌ Error getting latest log:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Error getting latest log:', error);
      return null;
    }
  }

  /**
   * Check if all required files are already processed for a feature
   */
  static async isProcessingComplete(featureName: string, requiredCounts: {
    stocks: number;
    sectors: number;
    indexes: number;
  }): Promise<{ isComplete: boolean; missingCounts: any }> {
    try {
      const latestLog = await this.getLatestLog(featureName);
      
      if (!latestLog || latestLog.status !== 'completed') {
        return { isComplete: false, missingCounts: requiredCounts };
      }

      const missingCounts = {
        stocks: Math.max(0, requiredCounts.stocks - (latestLog.stock_success || 0)),
        sectors: Math.max(0, requiredCounts.sectors - (latestLog.sector_success || 0)),
        indexes: Math.max(0, requiredCounts.indexes - (latestLog.index_success || 0))
      };

      const isComplete = missingCounts.stocks === 0 && missingCounts.sectors === 0 && missingCounts.indexes === 0;

      return { isComplete, missingCounts };
    } catch (error) {
      console.error('❌ Error checking processing completeness:', error);
      return { isComplete: false, missingCounts: requiredCounts };
    }
  }

  /**
   * Get processing statistics for a feature
   */
  static async getProcessingStats(featureName: string, days: number = 7): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('scheduler_logs')
        .select('*')
        .eq('feature_name', featureName)
        .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error getting processing stats:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Error getting processing stats:', error);
      return null;
    }
  }

  /**
   * Mark a log as completed
   */
  static async markCompleted(logId: string, finalStats: {
    total_files_processed: number;
    files_created: number;
    files_updated: number;
    files_skipped: number;
    files_failed: number;
    stock_processed: number;
    stock_success: number;
    stock_failed: number;
    sector_processed: number;
    sector_success: number;
    sector_failed: number;
    index_processed: number;
    index_success: number;
    index_failed: number;
  }): Promise<boolean> {
    try {
      const completedAt = new Date().toISOString();
      
      // Get started_at to calculate duration
      const { data: logData } = await supabaseAdmin
        .from('scheduler_logs')
        .select('started_at')
        .eq('id', logId)
        .single();

      let duration_seconds = 0;
      if (logData?.started_at) {
        duration_seconds = Math.floor((new Date(completedAt).getTime() - new Date(logData.started_at).getTime()) / 1000);
      }

      const { error } = await supabaseAdmin
        .from('scheduler_logs')
        .update({
          status: 'completed',
          completed_at: completedAt,
          duration_seconds,
          progress_percentage: 100.00,
          current_processing: 'Completed all calculations',
          ...finalStats
        })
        .eq('id', logId);

      if (error) {
        console.error('❌ Error marking log as completed:', error);
        return false;
      }

      console.log('✅ Scheduler log marked as completed:', logId);
      return true;
    } catch (error) {
      console.error('❌ Error marking log as completed:', error);
      return false;
    }
  }

  /**
   * Mark a log as failed
   */
  static async markFailed(logId: string, errorMessage: string, errorDetails?: any): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('scheduler_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
          error_details: errorDetails,
          retry_count: 0 // Will be incremented by caller if needed
        })
        .eq('id', logId);

      if (error) {
        console.error('❌ Error marking log as failed:', error);
        return false;
      }

      console.log('✅ Scheduler log marked as failed:', logId);
      return true;
    } catch (error) {
      console.error('❌ Error marking log as failed:', error);
      return false;
    }
  }
}
