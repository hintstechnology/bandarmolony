
import { HakaHakiAnalysisCalculator } from '../calculations/done/haka_haki_analysis';
import { SchedulerLogService } from './schedulerLogService';

export class HakaHakiAnalysisDataScheduler {
    private calculator: HakaHakiAnalysisCalculator;

    constructor() {
        this.calculator = new HakaHakiAnalysisCalculator();
    }

    /**
     * Generate HAKA HAKI analysis data
     */
    async generateHakaHakiData(dateSuffix?: string, logId?: string | null, triggeredBy?: string): Promise<{ success: boolean; message: string; data?: any }> {
        // Only create log entry if logId is not provided (called from scheduler, not manual trigger)
        let finalLogId = logId;
        if (!finalLogId) {
            const logEntry = await SchedulerLogService.createLog({
                feature_name: 'haka_haki_analysis',
                trigger_type: triggeredBy && !triggeredBy.startsWith('Phase') && !triggeredBy.startsWith('phase') ? 'manual' : 'scheduled',
                triggered_by: triggeredBy || 'Phase HakaHaki Analysis',
                status: 'running',
                environment: process.env['NODE_ENV'] || 'development'
            });

            if (!logEntry) {
                console.error('❌ Failed to create scheduler log entry');
                return {
                    success: false,
                    message: 'Failed to create scheduler log entry'
                };
            }

            finalLogId = logEntry.id!;
        }

        try {
            console.log(`🔄 Starting HAKA HAKI Analysis calculation...`);

            if (finalLogId) {
                await SchedulerLogService.updateLog(finalLogId, {
                    progress_percentage: 0,
                    current_processing: 'Starting HAKA HAKI Analysis calculation...'
                });
            }

            await this.calculator.generateHakaHakiData(finalLogId);

            const result = { success: true, message: 'HAKA HAKI Analysis calculation completed' };

            // Check if this is called from a Phase
            const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));

            if (result.success) {
                console.log('✅ HAKA HAKI Analysis calculation completed successfully');
                if (finalLogId && !isFromPhase) {
                    await SchedulerLogService.markCompleted(finalLogId, {
                        total_files_processed: 1, // Simplified metric
                        files_created: 1,
                        files_failed: 0
                    });
                }
            } else {
                console.error('❌ HAKA HAKI Analysis calculation failed');
                if (finalLogId && !isFromPhase) {
                    await SchedulerLogService.markFailed(finalLogId, 'Calculation Failed');
                }
            }

            return result;
        } catch (error) {
            console.error('❌ Error during HAKA HAKI Analysis calculation:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Check if this is called from a Phase
            const isFromPhase = triggeredBy && (triggeredBy.startsWith('Phase') || triggeredBy.startsWith('phase'));
            if (finalLogId && !isFromPhase) {
                await SchedulerLogService.markFailed(finalLogId, errorMessage, error);
            }
            return {
                success: false,
                message: `Failed to generate HAKA HAKI analysis data: ${errorMessage}`
            };
        }
    }

    /**
     * Get generation status
     */
    async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
        return {
            status: 'ready',
            message: 'HAKA HAKI Analysis service is ready to generate data'
        };
    }
}

export default HakaHakiAnalysisDataScheduler;
