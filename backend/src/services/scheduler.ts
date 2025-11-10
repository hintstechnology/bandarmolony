// scheduler.ts
// Scheduled tasks for data updates and calculations

import cron from 'node-cron';
import { forceRegenerate } from './rrcDataScheduler';
import { forceRegenerate as forceRegenerateRRG } from './rrgDataScheduler';
import { forceRegenerate as forceRegenerateSeasonal } from './seasonalityDataScheduler';
import TrendFilterDataScheduler from './trendFilterDataScheduler';
import AccumulationDataScheduler from './accumulationDataScheduler';
import BidAskDataScheduler from './bidAskDataScheduler';
import BrokerDataScheduler from './brokerDataScheduler';
import BrokerInventoryDataScheduler from './brokerInventoryDataScheduler';
import BrokerSummaryTypeDataScheduler from './brokerSummaryTypeDataScheduler';
import BrokerSummaryIDXDataScheduler from './brokerSummaryIDXDataScheduler';
import BrokerBreakdownDataScheduler from './brokerBreakdownDataScheduler';
import ForeignFlowDataScheduler from './foreignFlowDataScheduler';
import MoneyFlowDataScheduler from './moneyFlowDataScheduler';
import BreakDoneTradeDataScheduler from './breakDoneTradeDataScheduler';
import BrokerTransactionDataScheduler from './brokerTransactionDataScheduler';
import BrokerTransactionRGTNNGDataScheduler from './brokerTransactionRGTNNGDataScheduler';
import { SchedulerLogService, SchedulerLog } from './schedulerLogService';
import { updateDoneSummaryData } from './doneSummaryDataScheduler';
import { updateStockData } from './stockDataScheduler';
import { updateIndexData } from './indexDataScheduler';
import { updateShareholdersData } from './shareholdersDataScheduler';
import { updateHoldingData } from './holdingDataScheduler';
import { initializeAzureLogging } from './azureLoggingService';
import { updateWatchlistSnapshot } from './watchlistSnapshotService';

// ======================
// SCHEDULER CONFIGURATION
// ======================
// All scheduler times are configured here for easy maintenance
// This is now a mutable object that can be updated at runtime
let SCHEDULER_CONFIG = {
  // Scheduled Calculation Times - Only Phase 1 runs on schedule
  PHASE1_DATA_COLLECTION_TIME: '16:09',    // Data collection (Stock, Index, Done Summary)
  PHASE1_SHAREHOLDERS_TIME: '00:01',       // Shareholders & Holding (if first day of month)
  
  // Phase 2-6 are auto-triggered sequentially after Phase 1 completes
  // Phase 2: Market rotation (RRC, RRG, Seasonal, Trend Filter, Watchlist Snapshot)
  // Phase 3: Light calculations (Money Flow, Foreign Flow, Break Done Trade)
  // Phase 4: Medium calculations (Bid/Ask Footprint, Broker Breakdown)
  // Phase 5: Heavy calculations (Broker Data (Broker Summary + Top Broker), Broker Summary by Type, Broker Summary IDX, Broker Transaction, Broker Transaction RG/TN/NG)
  // Phase 6: Very Heavy calculations (Broker Inventory, Accumulation Distribution)
  
  // Memory Management
  MEMORY_CLEANUP_INTERVAL: 5000,  // 5 seconds
  FORCE_GC_INTERVAL: 10000,       // 10 seconds
  MEMORY_THRESHOLD: 12 * 1024 * 1024 * 1024, // 12GB threshold
  
  // Timezone
  TIMEZONE: 'Asia/Jakarta',
  
  // Weekend Skip
  WEEKEND_SKIP: true
};

// Extract times for scheduler (will be updated when config changes)
let PHASE1_DATA_COLLECTION_TIME = SCHEDULER_CONFIG.PHASE1_DATA_COLLECTION_TIME;
let PHASE1_SHAREHOLDERS_TIME = SCHEDULER_CONFIG.PHASE1_SHAREHOLDERS_TIME;
let TIMEZONE = SCHEDULER_CONFIG.TIMEZONE;

// Convert time to cron format (HH:MM -> MM HH * * *)
function timeToCron(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${minutes} ${hours} * * *`;
}

// Check if today is weekend (Saturday = 6, Sunday = 0)
function isWeekend(): boolean {
  const today = new Date();
  const dayOfWeek = today.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
}

// Generate cron schedules from configuration (will be updated when config changes)
let PHASE1_DATA_COLLECTION_SCHEDULE = timeToCron(PHASE1_DATA_COLLECTION_TIME);
let PHASE1_SHAREHOLDERS_SCHEDULE = timeToCron(PHASE1_SHAREHOLDERS_TIME);

let schedulerRunning = false;
let scheduledTasks: any[] = [];

// Phase status tracking
let phaseStatus: Record<string, 'idle' | 'running' | 'stopped'> = {
  phase1_data_collection: 'idle',
  phase1_shareholders: 'idle',
  phase2_market_rotation: 'idle',
  phase3_light: 'idle',
  phase4_medium: 'idle',
  phase5_heavy: 'idle',
  phase6_very_heavy: 'idle'
};

// Phase enabled/disabled tracking
let phaseEnabled: Record<string, boolean> = {
  phase1_data_collection: true,
  phase1_shareholders: true,
  phase2_market_rotation: true,
  phase3_light: true,
  phase4_medium: true,
  phase5_heavy: true,
  phase6_very_heavy: true
};

// Phase trigger configuration: 'scheduled' (with time) or 'auto' (trigger after another phase)
interface PhaseTriggerConfig {
  type: 'scheduled' | 'auto';
  schedule?: string | undefined; // For scheduled type: HH:MM format
  triggerAfterPhase?: string | undefined; // For auto type: phase ID to trigger after
}

let phaseTriggerConfig: Record<string, PhaseTriggerConfig> = {
  phase1_data_collection: { type: 'scheduled', schedule: PHASE1_DATA_COLLECTION_TIME },
  phase1_shareholders: { type: 'scheduled', schedule: PHASE1_SHAREHOLDERS_TIME },
  phase2_market_rotation: { type: 'auto', triggerAfterPhase: 'phase1_data_collection' },
  phase3_light: { type: 'auto', triggerAfterPhase: 'phase2_market_rotation' },
  phase4_medium: { type: 'auto', triggerAfterPhase: 'phase3_light' },
  phase5_heavy: { type: 'auto', triggerAfterPhase: 'phase4_medium' },
  phase6_very_heavy: { type: 'auto', triggerAfterPhase: 'phase5_heavy' }
};
const trendFilterService = new TrendFilterDataScheduler();
const accumulationService = new AccumulationDataScheduler();
const bidAskService = new BidAskDataScheduler();
const brokerDataService = new BrokerDataScheduler();
const brokerInventoryService = new BrokerInventoryDataScheduler();
const brokerBreakdownService = new BrokerBreakdownDataScheduler();
const brokerSummaryTypeService = new BrokerSummaryTypeDataScheduler();
const brokerSummaryIDXService = new BrokerSummaryIDXDataScheduler();
const foreignFlowService = new ForeignFlowDataScheduler();
const moneyFlowService = new MoneyFlowDataScheduler();
const breakDoneTradeService = new BreakDoneTradeDataScheduler();
const brokerTransactionService = new BrokerTransactionDataScheduler();
const brokerTransactionRGTNNGService = new BrokerTransactionRGTNNGDataScheduler();

// Memory monitoring variables
let memoryMonitorInterval: NodeJS.Timeout | null = null;

// Performance monitoring variables
let performanceMetrics = {
  batchCount: 0,
  totalMemoryUsed: 0,
  gcCount: 0,
  errorCount: 0,
  startTime: Date.now(),
  batchTimes: [] as number[]
};

/**
 * Start memory monitoring
 */
function startMemoryMonitoring(): void {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }
  
  memoryMonitorInterval = setInterval(async () => {
    await monitorMemoryUsage();
  }, SCHEDULER_CONFIG.MEMORY_CLEANUP_INTERVAL);
}

/**
 * Stop memory monitoring
 */
function stopMemoryMonitoring(): void {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
    memoryMonitorInterval = null;
  }
}

/**
 * Track batch performance
 */
function trackBatchPerformance(batchStartTime: number, batchName: string): void {
  const batchDuration = Math.round((Date.now() - batchStartTime) / 1000);
  performanceMetrics.batchTimes.push(batchDuration);
  
  console.log(`⏱️ Batch Performance: ${batchName} completed in ${batchDuration}s`);
  
  // Calculate average batch time
  const avgBatchTime = performanceMetrics.batchTimes.reduce((sum, time) => sum + time, 0) / performanceMetrics.batchTimes.length;
  console.log(`📊 Average Batch Time: ${avgBatchTime.toFixed(2)}s`);
}

/**
 * Track error rate
 */
function trackError(error: any, context: string): void {
  performanceMetrics.errorCount++;
  console.error(`❌ Error in ${context}:`, error instanceof Error ? error.message : 'Unknown error');
  console.log(`📊 Total Errors: ${performanceMetrics.errorCount}`);
}

/**
 * Reset performance metrics
 */
function resetPerformanceMetrics(): void {
  performanceMetrics = {
    batchCount: 0,
    totalMemoryUsed: 0,
    gcCount: 0,
    errorCount: 0,
    startTime: Date.now(),
    batchTimes: []
  };
  console.log('🔄 Performance metrics reset');
}

/**
 * Monitor memory usage and force cleanup if needed
 */
async function monitorMemoryUsage(): Promise<boolean> {
  const memUsage = process.memoryUsage();
  const usedMB = memUsage.heapUsed / 1024 / 1024;
  const totalMB = memUsage.heapTotal / 1024 / 1024;
  const usedGB = usedMB / 1024;
  const totalGB = totalMB / 1024;
  
  // Update performance metrics
  performanceMetrics.totalMemoryUsed += usedMB;
  performanceMetrics.batchCount++;
  
  // Get Node.js memory limit (16GB from NODE_OPTIONS)
  const maxOldSpaceSize = process.env['NODE_OPTIONS']?.includes('--max-old-space-size=') 
    ? parseInt(process.env['NODE_OPTIONS'].split('--max-old-space-size=')[1]?.split(' ')[0] || '0') 
    : 0;
  const maxGB = maxOldSpaceSize / 1024;
  
  console.log(`📊 Memory Usage: ${usedMB.toFixed(2)}MB / ${totalMB.toFixed(2)}MB (${usedGB.toFixed(2)}GB / ${totalGB.toFixed(2)}GB allocated)`);
  console.log(`🔧 Node.js Memory Limit: ${maxOldSpaceSize}MB (${maxGB.toFixed(1)}GB)`);
  
  // Performance tracking
  const avgMemory = performanceMetrics.totalMemoryUsed / performanceMetrics.batchCount;
  console.log(`📈 Performance Metrics: Batches: ${performanceMetrics.batchCount}, Avg Memory: ${avgMemory.toFixed(2)}MB, GC Count: ${performanceMetrics.gcCount}, Errors: ${performanceMetrics.errorCount}`);
  
  // If memory usage > 6GB, force cleanup
  if (usedMB > 12000) {
    console.log('⚠️ High memory usage detected, forcing aggressive cleanup...');
    await aggressiveMemoryCleanup();
    performanceMetrics.gcCount++;
    return false; // Skip next calculation
  }
  
  return true;
}

/**
 * Aggressive memory cleanup
 */
async function aggressiveMemoryCleanup(): Promise<void> {
  console.log('🧹 Starting aggressive memory cleanup...');
  
  // Force garbage collection multiple times with longer intervals
  for (let i = 0; i < 10; i++) {
    if (global.gc) {
      global.gc();
    }
    await new Promise(resolve => setTimeout(resolve, 2000)); // Longer wait between GC
  }
  
  // Additional cleanup - clear any cached data
  if (global.gc) {
    global.gc();
  }
  
  // Force another round after clearing
  await new Promise(resolve => setTimeout(resolve, 3000));
  if (global.gc) {
    global.gc();
  }
  
  console.log('✅ Aggressive memory cleanup completed');
}

/**
 * Check memory before starting large operations
 */
async function checkMemoryBeforeLargeOperation(operationName: string): Promise<boolean> {
  const memUsage = process.memoryUsage();
  const usedMB = memUsage.heapUsed / 1024 / 1024;
  
  console.log(`🔍 Pre-operation Memory Check for ${operationName}: ${usedMB.toFixed(2)}MB`);
  
  // If already using more than 10GB, force cleanup first
  if (usedMB > 10000) {
    console.log(`⚠️ High memory usage before ${operationName}, forcing cleanup...`);
    await aggressiveMemoryCleanup();
    
    // Check again after cleanup
    const newMemUsage = process.memoryUsage();
    const newUsedMB = newMemUsage.heapUsed / 1024 / 1024;
    console.log(`🔍 Post-cleanup Memory: ${newUsedMB.toFixed(2)}MB`);
    
    // If still high, skip this operation
    if (newUsedMB > 11000) {
      console.log(`❌ Skipping ${operationName} due to high memory usage`);
      return false;
    }
  }
  
  return true;
}
/**
 * Run Phase 2 - Market Rotation Calculations (RRC, RRG, Seasonal, Trend Filter)
 */
export async function runPhase2MarketRotationCalculations(): Promise<void> {
  // Check if phase is enabled before starting
  if (!phaseEnabled['phase2_market_rotation']) {
    console.log('⚠️ Phase 2 Market Rotation is disabled - skipping');
    phaseStatus['phase2_market_rotation'] = 'idle';
    return;
  }
  
  phaseStatus['phase2_market_rotation'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 2 MARKET ROTATION STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Market Rotation (RRC, RRG, Seasonal, Trend Filter)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  resetPerformanceMetrics();
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 2 Market Rotation due to high memory usage');
      stopMemoryMonitoring();
        return;
      }

    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase2_market_rotation',
      trigger_type: 'scheduled',
      triggered_by: 'phase1',
      status: 'running',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 2 Market Rotation database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Phase 2 Market Rotation (PARALLEL MODE)...');
    
    // Track batch performance
    trackBatchPerformance(phaseStartTime, 'Phase 2 Market Rotation Start');
    
    // Run market rotation calculations in parallel
    const marketRotationTasks = [
      { name: 'RRC Calculation', service: forceRegenerate, method: null },
      { name: 'RRG Calculation', service: forceRegenerateRRG, method: null },
      { name: 'Seasonal Calculation', service: forceRegenerateSeasonal, method: null },
      { name: 'Trend Filter Calculation', service: trendFilterService, method: 'generateTrendFilterData' },
      { name: 'Watchlist Snapshot', service: updateWatchlistSnapshot, method: null }
    ];
    
    const marketRotationPromises = marketRotationTasks.map(async (task, index) => {
      const startTime = Date.now();
      
      try {
        console.log(`🔄 Starting ${task.name} (${index + 1}/5)...`);
        
        // Update progress in database
        if (logEntry) {
          await SchedulerLogService.updateLog(logEntry.id!, {
            progress_percentage: Math.round((index / 5) * 100),
            current_processing: `Running ${task.name}...`
          });
        }
        
        // Run calculation
        if (task.method) {
          // Call method on service instance
          await (task.service as any)[task.method]();
        } else {
          // Call service directly as a function
          await (task.service as any)();
        }
        
        const duration = Date.now() - startTime;
        
        // If we reach here without throwing an error, the task succeeded
        console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
        return { name: task.name, success: true, duration };
      
    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ ${task.name} failed:`, errorMessage);
        return { name: task.name, success: false, error: errorMessage, duration };
      }
    });
    
    // Wait for all calculations to complete
    const marketRotationResults = await Promise.allSettled(marketRotationPromises);
    
    // Process results
    const results: Array<{ name: string; success: boolean; error?: string; duration?: number }> = [];
    marketRotationResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          name: marketRotationTasks[index]?.name || 'Unknown',
          success: false,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
        });
      }
    });
    
    const successCount = results.filter(r => r.success).length;
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    console.log(`\n📊 ===== PHASE 2 MARKET ROTATION COMPLETED =====`);
    console.log(`✅ Success: ${successCount}/5 calculations`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      await SchedulerLogService.updateLog(logEntry.id!, {
        status: successCount === 5 ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_files_processed: 5,
        files_created: successCount,
        files_failed: 5 - successCount,
        progress_percentage: 100,
        current_processing: `Phase 2 Market Rotation complete: ${successCount}/5 calculations successful in ${totalDuration}s`
      });
    }
    
    // Cleanup after Phase 2 Market Rotation
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 3 automatically if Phase 2 succeeded and Phase 3 is enabled
    if (successCount >= 4 && phaseEnabled['phase3_light']) { // Trigger Phase 3 if at least 4/5 succeed
      console.log('🔄 Triggering Phase 3 Light calculations...');
      await runPhase3LightCalculations();
    } else {
      if (!phaseEnabled['phase3_light']) {
        console.log('⚠️ Skipping Phase 3 - Phase 3 is disabled');
      } else {
        console.log('⚠️ Skipping Phase 3 due to insufficient Phase 2 success rate');
      }
    }
    
    } catch (error) {
    trackError(error, 'Phase 2 Market Rotation Calculations');
    console.error('❌ Error during Phase 2 Market Rotation calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  } finally {
    phaseStatus['phase2_market_rotation'] = 'idle';
  }
}

/**
 * Run Phase 3 - Light Calculations (Money Flow, Foreign Flow, Break Done Trade)
 */
export async function runPhase3LightCalculations(): Promise<void> {
  // Check if phase is enabled before starting
  if (!phaseEnabled['phase3_light']) {
    console.log('⚠️ Phase 3 Light is disabled - skipping');
    return;
  }
  
  phaseStatus['phase3_light'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 3 LIGHT CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Light Calculations (Money Flow, Foreign Flow, Break Done Trade)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  resetPerformanceMetrics();
    
    let logEntry: SchedulerLog | null = null;
    
    try {
    // Check memory before starting
    const canProceed = await checkMemoryBeforeLargeOperation('Phase 3 Light Calculations');
    if (!canProceed) {
      console.log('⚠️ Skipping Phase 3 Light due to high memory usage');
      stopMemoryMonitoring();
        return;
      }
      
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 3 Light due to high memory usage');
      stopMemoryMonitoring();
      return;
    }
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
      feature_name: 'phase3_light_calculations',
        trigger_type: 'scheduled',
      triggered_by: 'phase2',
        status: 'running',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
      console.log('📊 Phase 3 Light database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Phase 3 Light calculations (PARALLEL MODE)...');
    
    // Run light calculations in parallel
    const lightCalculations = [
      { name: 'Money Flow', service: moneyFlowService, method: 'generateMoneyFlowData' },
      { name: 'Foreign Flow', service: foreignFlowService, method: 'generateForeignFlowData' },
      { name: 'Break Done Trade', service: breakDoneTradeService, method: 'generateBreakDoneTradeData' }
    ];
    
    const lightCalculationPromises = lightCalculations.map(async (task, index) => {
      const startTime = Date.now();
      
      try {
        console.log(`🔄 Starting ${task.name} (${index + 1}/3)...`);
        
        // Update progress in database
        if (logEntry) {
          await SchedulerLogService.updateLog(logEntry.id!, {
            progress_percentage: Math.round((index / 3) * 100),
            current_processing: `Running ${task.name}...`
          });
        }
        
        // Run calculation
        await (task.service as any)[task.method]('all');
        
        const duration = Date.now() - startTime;
        
        // If we reach here without throwing an error, the task succeeded
        console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
        return { name: task.name, success: true, duration };
        
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ ${task.name} failed:`, errorMessage);
        return { name: task.name, success: false, error: errorMessage, duration };
      }
    });
    
    // Wait for all calculations to complete
    const lightCalculationResults = await Promise.allSettled(lightCalculationPromises);
    
    // Process results
    const results: Array<{ name: string; success: boolean; error?: string; duration?: number }> = [];
    lightCalculationResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          name: lightCalculations[index]?.name || 'Unknown',
          success: false,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
        });
      }
    });
    
    const successCount = results.filter(r => r.success).length;
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    console.log(`\n📊 ===== PHASE 3 LIGHT COMPLETED =====`);
    console.log(`✅ Success: ${successCount}/3 calculations`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
      
      // Update database log
      if (logEntry) {
        await SchedulerLogService.updateLog(logEntry.id!, {
        status: successCount === 3 ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
        total_files_processed: 3,
        files_created: successCount,
        files_failed: 3 - successCount,
          progress_percentage: 100,
        current_processing: `Phase 3 Light complete: ${successCount}/3 calculations successful in ${totalDuration}s`
      });
    }
    
    // Cleanup after Phase 3 Light
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 4 automatically if Phase 3 succeeded and Phase 4 is enabled
    if (successCount >= 2 && phaseEnabled['phase4_medium']) { // Trigger Phase 4 if at least 2/3 succeed
      console.log('🔄 Triggering Phase 4 Medium calculations...');
      await runPhase4MediumCalculations();
      } else {
        if (!phaseEnabled['phase4_medium']) {
          console.log('⚠️ Skipping Phase 4 - Phase 4 is disabled');
        } else {
          console.log('⚠️ Skipping Phase 4 due to insufficient Phase 3 success rate');
        }
      }
      
    } catch (error) {
    trackError(error, 'Phase 3 Light Calculations');
    console.error('❌ Error during Phase 3 Light calculations:', error);
      
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    } finally {
      phaseStatus['phase3_light'] = 'idle';
    }
}

export async function runPhase4MediumCalculations(): Promise<void> {
  phaseStatus['phase4_medium'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 4 MEDIUM CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Medium Calculations (Bid/Ask Footprint, Broker Breakdown)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  resetPerformanceMetrics();
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 4 Medium due to high memory usage');
      stopMemoryMonitoring();
    return;
  }

    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase4_medium_calculations',
      trigger_type: 'scheduled',
      triggered_by: 'phase3',
      status: 'running',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 4 Medium database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Bid/Ask Footprint calculation...');
    
    const bidAskStartTime = Date.now();
    const bidAskResult = await bidAskService.generateBidAskData('all', logEntry?.id || null);
    const bidAskDuration = Math.round((Date.now() - bidAskStartTime) / 1000);
    
    console.log(`📊 Bid/Ask Footprint completed in ${bidAskDuration}s`);
    
    console.log('🔄 Starting Broker Breakdown calculation...');
    
    const brokerBreakdownStartTime = Date.now();
    const brokerBreakdownResult = await brokerBreakdownService.generateBrokerBreakdownData('all');
    const brokerBreakdownDuration = Math.round((Date.now() - brokerBreakdownStartTime) / 1000);
    
    console.log(`📊 Broker Breakdown completed in ${brokerBreakdownDuration}s`);
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    const successCount = (bidAskResult.success ? 1 : 0) + (brokerBreakdownResult.success ? 1 : 0);
    const totalCalculations = 2;
    
    console.log(`\n📊 ===== PHASE 4 MEDIUM COMPLETED =====`);
    console.log(`✅ Success: ${successCount}/${totalCalculations} calculations`);
    console.log(`📊 Bid/Ask Footprint: ${bidAskResult.success ? 'SUCCESS' : 'FAILED'} (${bidAskDuration}s)`);
    console.log(`📊 Broker Breakdown: ${brokerBreakdownResult.success ? 'SUCCESS' : 'FAILED'} (${brokerBreakdownDuration}s)`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      await SchedulerLogService.updateLog(logEntry.id!, {
        status: successCount >= 1 ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_files_processed: totalCalculations,
        files_created: successCount,
        files_failed: totalCalculations - successCount,
        progress_percentage: 100,
        current_processing: `Phase 4 Medium complete: ${successCount}/${totalCalculations} calculations successful in ${totalDuration}s`
      });
    }
    
    // Cleanup after Phase 4
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 5 automatically if Phase 4 succeeded and Phase 5 is enabled
    if (successCount >= 1 && phaseEnabled['phase5_heavy']) { // Trigger Phase 5 if at least 1/2 succeed
      console.log('🔄 Triggering Phase 5 Heavy calculations...');
      await runPhase5HeavyCalculations();
    } else {
      if (!phaseEnabled['phase5_heavy']) {
        console.log('⚠️ Skipping Phase 5 - Phase 5 is disabled');
      } else {
        console.log('⚠️ Skipping Phase 5 due to Phase 4 failure');
      }
    }
    
    } catch (error) {
      trackError(error, 'Phase 4 Medium Calculations');
      console.error('❌ Error during Phase 4 Medium calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  } finally {
    phaseStatus['phase4_medium'] = 'idle';
  }
}

/**
 * Run Phase 5 - Heavy Calculations (Broker Data)
 */
export async function runPhase5HeavyCalculations(): Promise<void> {
  // Check if phase is enabled before starting
  if (!phaseEnabled['phase5_heavy']) {
    console.log('⚠️ Phase 5 Heavy is disabled - skipping');
    return;
  }
  
  phaseStatus['phase5_heavy'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 5 HEAVY CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Heavy Calculations (Broker Data, Broker Summary by Type, Broker Summary IDX, Broker Transaction, Broker Transaction RG/TN/NG)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
    
    let logEntry: SchedulerLog | null = null;
    
    try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 5 Heavy due to high memory usage');
      stopMemoryMonitoring();
        return;
      }
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
      feature_name: 'phase5_heavy_calculations',
        trigger_type: 'scheduled',
      triggered_by: 'phase4',
        status: 'running',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
      console.log('📊 Phase 5 Heavy database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Broker Data calculation...');
    const brokerDataStartTime = Date.now();
    const result = await brokerDataService.generateBrokerData('all', logEntry?.id || null);
    const brokerDataDuration = Math.round((Date.now() - brokerDataStartTime) / 1000);
    console.log(`📊 Broker Data completed in ${brokerDataDuration}s`);

    console.log('🔄 Starting Broker Summary by Type (RG/TN/NG) calculation...');
    const brokerSummaryTypeStartTime = Date.now();
    const resultType = await brokerSummaryTypeService.generateBrokerSummaryTypeData('all');
    const brokerSummaryTypeDuration = Math.round((Date.now() - brokerSummaryTypeStartTime) / 1000);
    console.log(`📊 Broker Summary Type completed in ${brokerSummaryTypeDuration}s`);
    
    console.log('🔄 Starting Broker Summary IDX (aggregated all emiten) calculation...');
    const idxStartTime = Date.now();
    const resultIDX = await brokerSummaryIDXService.generateBrokerSummaryIDXData('all');
    const idxDuration = Math.round((Date.now() - idxStartTime) / 1000);
    console.log(`📊 Broker Summary IDX completed in ${idxDuration}s`);
    
    console.log('🔄 Starting Broker Transaction calculation...');
    const brokerTransactionStartTime = Date.now();
    const resultTransaction = await brokerTransactionService.generateBrokerTransactionData('all');
    const brokerTransactionDuration = Math.round((Date.now() - brokerTransactionStartTime) / 1000);
    console.log(`📊 Broker Transaction completed in ${brokerTransactionDuration}s`);
    
    console.log('🔄 Starting Broker Transaction RG/TN/NG calculation...');
    const brokerTransactionRGTNNGStartTime = Date.now();
    const resultTransactionRGTNNG = await brokerTransactionRGTNNGService.generateBrokerTransactionRGTNNGData('all');
    const brokerTransactionRGTNNGDuration = Math.round((Date.now() - brokerTransactionRGTNNGStartTime) / 1000);
    console.log(`📊 Broker Transaction RG/TN/NG completed in ${brokerTransactionRGTNNGDuration}s`);
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    console.log(`\n📊 ===== PHASE 5 HEAVY COMPLETED =====`);
    const successCount = (result.success ? 1 : 0) + (resultType.success ? 1 : 0) + (resultIDX.success ? 1 : 0) + (resultTransaction.success ? 1 : 0) + (resultTransactionRGTNNG.success ? 1 : 0);
    console.log(`✅ Success: ${successCount}/5 calculations`);
    console.log(`📊 Broker Data: ${result.success ? 'SUCCESS' : 'FAILED'} (${brokerDataDuration}s)`);
    console.log(`📊 Broker Summary Type: ${resultType.success ? 'SUCCESS' : 'FAILED'} (${brokerSummaryTypeDuration}s)`);
    console.log(`📊 Broker Summary IDX: ${resultIDX.success ? 'SUCCESS' : 'FAILED'} (${idxDuration}s)`);
    console.log(`📊 Broker Transaction: ${resultTransaction.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionDuration}s)`);
    console.log(`📊 Broker Transaction RG/TN/NG: ${resultTransactionRGTNNG.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionRGTNNGDuration}s)`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      await SchedulerLogService.updateLog(logEntry.id!, {
        status: successCount >= 4 ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_files_processed: 5,
        files_created: successCount,
        files_failed: 5 - successCount,
        progress_percentage: 100,
        current_processing: `Phase 5 Heavy complete: Broker Data (${result.success ? 'OK' : 'FAIL'}), Broker Summary Type (${resultType.success ? 'OK' : 'FAIL'}), Broker Summary IDX (${resultIDX.success ? 'OK' : 'FAIL'}), Broker Transaction (${resultTransaction.success ? 'OK' : 'FAIL'}), Broker Transaction RG/TN/NG (${resultTransactionRGTNNG.success ? 'OK' : 'FAIL'}) in ${totalDuration}s`
      });
    }
    
    // Cleanup after Phase 5
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 6 automatically if Phase 5 succeeded and Phase 6 is enabled (at least 4/5 must succeed)
    if (successCount >= 4 && phaseEnabled['phase6_very_heavy']) {
      console.log('🔄 Triggering Phase 6 Very Heavy calculations...');
      await runPhase6VeryHeavyCalculations();
      } else {
        if (!phaseEnabled['phase6_very_heavy']) {
          console.log('⚠️ Skipping Phase 6 - Phase 6 is disabled');
        } else {
          console.log('⚠️ Skipping Phase 6 due to Phase 5 failure');
        }
    }
    
  } catch (error) {
    trackError(error, 'Phase 5 Heavy Calculations');
    console.error('❌ Error during Phase 5 Heavy calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  } finally {
    phaseStatus['phase5_heavy'] = 'idle';
  }
}

/**
 * Run Phase 6 - Very Heavy Calculations (Broker Inventory, Accumulation Distribution)
 */
export async function runPhase6VeryHeavyCalculations(): Promise<void> {
  phaseStatus['phase6_very_heavy'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 6 VERY HEAVY CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Very Heavy Calculations (Broker Inventory, Accumulation Distribution)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  resetPerformanceMetrics();
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 6 Very Heavy due to high memory usage');
      stopMemoryMonitoring();
      return;
    }
    
    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase6_very_heavy_calculations',
      trigger_type: 'scheduled',
      triggered_by: 'phase5',
      status: 'running',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
      console.log('📊 Phase 6 Very Heavy database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Very Heavy calculations (SEQUENTIAL)...');
    
    const veryHeavyCalculations = [
      { name: 'Broker Inventory', service: brokerInventoryService, method: 'generateBrokerInventoryData' },
      { name: 'Accumulation Distribution', service: accumulationService, method: 'generateAccumulationData' }
    ];
    
    let totalSuccessCount = 0;
    let totalCalculations = 0;
    
    for (const calc of veryHeavyCalculations) {
      console.log(`\n🔄 Starting ${calc.name} (${totalCalculations + 1}/${veryHeavyCalculations.length})...`);
      
      // Check memory before each calculation
      const memoryOk = await monitorMemoryUsage();
      if (!memoryOk) {
        console.log('⚠️ Skipping remaining calculations due to high memory usage');
        break;
      }
      
      const calcStartTime = Date.now();
      try {
        // Pass logId to calculator for progress tracking
        const result = await (calc.service as any)[calc.method]('all', logEntry?.id || null);
        const calcDuration = Math.round((Date.now() - calcStartTime) / 1000);
      
      if (result.success) {
          totalSuccessCount++;
          console.log(`✅ ${calc.name} completed in ${calcDuration}s`);
      } else {
          console.error(`❌ ${calc.name} failed:`, result.message);
          console.error(`❌ Stopping Phase 6 due to critical calculation failure`);
          break; // Stop processing remaining calculations
      }
    } catch (error) {
        const calcDuration = Math.round((Date.now() - calcStartTime) / 1000);
        console.error(`❌ ${calc.name} error in ${calcDuration}s:`, error);
        console.error(`❌ Stopping Phase 6 due to critical calculation error`);
        break; // Stop processing remaining calculations
      }
      
      totalCalculations++;
      
      // No aggressive cleanup during calculations to prevent data loss
      // Longer delay between calculations for very heavy operations
      if (totalCalculations < veryHeavyCalculations.length) {
        console.log('⏳ Waiting 10s before next calculation...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    const allCalculationsSuccessful = totalSuccessCount === totalCalculations && totalCalculations > 0;
    
    console.log(`\n📊 ===== PHASE 6 VERY HEAVY ${allCalculationsSuccessful ? 'COMPLETED' : 'FAILED'} =====`);
    console.log(`✅ Success: ${totalSuccessCount}/${totalCalculations} calculations`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    if (!allCalculationsSuccessful) {
      console.error(`❌ Phase 6 failed: ${totalCalculations - totalSuccessCount} calculations failed`);
    }
      
      // Update database log
      if (logEntry) {
        await SchedulerLogService.updateLog(logEntry.id!, {
        status: allCalculationsSuccessful ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          total_files_processed: totalCalculations,
          files_created: totalSuccessCount,
          files_failed: totalCalculations - totalSuccessCount,
          progress_percentage: 100,
        current_processing: `Phase 6 Very Heavy ${allCalculationsSuccessful ? 'complete' : 'failed'}: ${totalSuccessCount}/${totalCalculations} calculations successful in ${totalDuration}s`
      });
    }
    
    console.log(`\n🎉 ===== ALL PHASES COMPLETED =====`);
    console.log(`📊 Total time from Phase 1 start: Check individual phase logs`);
    
    // Cleanup memory after all calculations are complete
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring after all phases complete
    stopMemoryMonitoring();
      
    } catch (error) {
      trackError(error, 'Phase 6 Very Heavy Calculations');
      console.error('❌ Error during Phase 6 Very Heavy calculations:', error);
      
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    } finally {
      phaseStatus['phase6_very_heavy'] = 'idle';
    }
}

/**
 * Run Phase 1 Data Collection manually
 */
export async function runPhase1DataCollection(): Promise<void> {
  phaseStatus['phase1_data_collection'] = 'running';
  try {
    const phaseStartTime = Date.now();
    console.log(`\n🚀 ===== PHASE 1 DATA COLLECTION STARTED (MANUAL) =====`);
    console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
    console.log(`📋 Phase: Data Collection (Stock, Index, Done Summary) - 7 days`);
    
    // Skip if weekend
    if (isWeekend()) {
      console.log('📅 Weekend detected - skipping Phase 1 Data Collection (no market data available)');
      return;
    }
    
    let logEntry: SchedulerLog | null = null;
    
    try {
      // Check memory before starting
      const memoryOk = await monitorMemoryUsage();
      if (!memoryOk) {
        console.log('⚠️ Skipping Phase 1 Data Collection due to high memory usage');
        return;
      }
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
        feature_name: 'phase1_data_collection',
        trigger_type: 'manual',
        triggered_by: 'admin',
        status: 'running',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
        console.log('📊 Phase 1 Data Collection database log created:', logEntry.id);
      }
      
      console.log('🔄 Starting Phase 1 Data Collection (PARALLEL MODE)...');
      
      // Track batch performance
      trackBatchPerformance(phaseStartTime, 'Phase 1 Data Collection Start');
      
      // Run data collection in parallel
      const dataCollectionTasks = [
        { name: 'Stock Data', service: updateStockData, method: null },
        { name: 'Index Data', service: updateIndexData, method: null },
        { name: 'Done Summary Data', service: updateDoneSummaryData, method: null }
      ];
      const totalTasks = dataCollectionTasks.length;
      
      const dataCollectionPromises = dataCollectionTasks.map(async (task, index) => {
        const startTime = Date.now();
        
        try {
          // Check if phase is still enabled before starting task
          if (!phaseEnabled['phase1_data_collection']) {
            console.log(`⚠️ Phase 1 Data Collection disabled - stopping ${task.name}`);
            phaseStatus['phase1_data_collection'] = 'idle';
            return { name: task.name, success: false, error: 'Phase disabled', duration: 0 };
          }
          
          console.log(`🔄 Starting ${task.name} (${index + 1}/${totalTasks})...`);
          
          // Update progress in database
          if (logEntry) {
            await SchedulerLogService.updateLog(logEntry.id!, {
              progress_percentage: Math.round((index / totalTasks) * 100),
              current_processing: `Running ${task.name}...`
            });
          }
          
          // Run calculation
          await (task.service as any)();
          
          // Check again after task completes
          if (!phaseEnabled['phase1_data_collection']) {
            console.log(`⚠️ Phase 1 Data Collection disabled during ${task.name} execution`);
            phaseStatus['phase1_data_collection'] = 'idle';
            return { name: task.name, success: false, error: 'Phase disabled during execution', duration: Date.now() - startTime };
          }
          
          const duration = Date.now() - startTime;
          
          // If we reach here without throwing an error, the task succeeded
          console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
          return { name: task.name, success: true, duration };
          
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ ${task.name} failed:`, errorMessage);
          return { name: task.name, success: false, error: errorMessage, duration };
        }
      });
      
      // Wait for all calculations to complete
      const dataCollectionResults = await Promise.allSettled(dataCollectionPromises);
      
      // Check if phase was disabled during execution
      if (!phaseEnabled['phase1_data_collection']) {
        console.log('⚠️ Phase 1 Data Collection was disabled during execution - stopping');
        phaseStatus['phase1_data_collection'] = 'idle';
        if (logEntry) {
          await SchedulerLogService.updateLog(logEntry.id!, {
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            current_processing: 'Phase disabled during execution'
          });
        }
        return;
      }
      
      // Process results
      const results: Array<{ name: string; success: boolean; error?: string; duration?: number }> = [];
      dataCollectionResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            name: dataCollectionTasks[index]?.name || 'Unknown',
            success: false,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          });
        }
      });
      
      const successCount = results.filter(r => r.success).length;
      const phaseEndTime = new Date();
      const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
      
      console.log(`\n📊 ===== PHASE 1 DATA COLLECTION COMPLETED =====`);
      console.log(`✅ Success: ${successCount}/${totalTasks} calculations`);
      console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
      console.log(`⏱️ Total Duration: ${totalDuration}s`);
      
      // Update database log
      if (logEntry) {
        await SchedulerLogService.updateLog(logEntry.id!, {
          status: successCount === totalTasks ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          total_files_processed: totalTasks,
          files_created: successCount,
          files_failed: totalTasks - successCount,
          progress_percentage: 100,
          current_processing: `Phase 1 Data Collection complete: ${successCount}/${totalTasks} calculations successful in ${totalDuration}s`
        });
      }
      
      // Cleanup after Phase 1
      await aggressiveMemoryCleanup();
      
      // Trigger Phase 2 automatically if Phase 1 succeeded and Phase 2 is enabled
      if (successCount === totalTasks && phaseEnabled['phase2_market_rotation']) {
        console.log('🔄 Triggering Phase 2 Market Rotation calculations...');
        await runPhase2MarketRotationCalculations();
      } else {
        if (!phaseEnabled['phase2_market_rotation']) {
          console.log('⚠️ Skipping Phase 2 - Phase 2 is disabled');
        } else {
          console.log('⚠️ Skipping Phase 2 due to Phase 1 failure');
        }
      }
      
    } catch (error) {
      trackError(error, 'Phase 1 Data Collection');
      console.error('❌ Error during Phase 1 Data Collection:', error);
      
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    }
  } finally {
    phaseStatus['phase1_data_collection'] = 'idle';
  }
}

// Helper function to get phase name by ID
function getPhaseName(phaseId: string): string {
  const phaseNames: Record<string, string> = {
    'phase1_data_collection': 'Phase 1 Data Collection',
    'phase1_shareholders': 'Phase 1 Shareholders & Holding',
    'phase2_market_rotation': 'Phase 2 Market Rotation',
    'phase3_light': 'Phase 3 Light',
    'phase4_medium': 'Phase 4 Medium',
    'phase5_heavy': 'Phase 5 Heavy',
    'phase6_very_heavy': 'Phase 6 Very Heavy'
  };
  return phaseNames[phaseId] || phaseId;
}

// Helper function to format trigger condition
function formatTriggerCondition(config: PhaseTriggerConfig): string {
  if (config.type === 'scheduled' && config.schedule) {
    return `Daily at ${config.schedule} (${TIMEZONE})`;
  } else if (config.type === 'auto' && config.triggerAfterPhase) {
    return `Auto-triggered after ${getPhaseName(config.triggerAfterPhase)} completes`;
  }
  return 'Not configured';
}

/**
 * Get all phases status and configuration
 */
export function getAllPhasesStatus() {
  const status = getSchedulerStatus();
  
  return {
    phases: [
      (() => {
        const config1 = phaseTriggerConfig['phase1_data_collection']!;
        return {
          id: 'phase1_data_collection',
          name: 'Phase 1 Data Collection',
          description: 'Stock Data, Index Data, Done Summary Data (7 days)',
          status: phaseStatus['phase1_data_collection'],
          enabled: phaseEnabled['phase1_data_collection'],
          trigger: {
            type: config1.type,
            schedule: config1.schedule,
            triggerAfterPhase: config1.triggerAfterPhase,
            condition: formatTriggerCondition(config1)
          },
          tasks: ['Stock Data', 'Index Data', 'Done Summary Data'],
          mode: 'PARALLEL' as const
        };
      })(),
      (() => {
        const config2 = phaseTriggerConfig['phase1_shareholders']!;
        return {
          id: 'phase1_shareholders',
          name: 'Phase 1 Shareholders & Holding',
          description: 'Shareholders Data, Holding Data (Monthly check)',
          status: phaseStatus['phase1_shareholders'],
          enabled: phaseEnabled['phase1_shareholders'],
          trigger: {
            type: config2.type,
            schedule: config2.schedule,
            triggerAfterPhase: config2.triggerAfterPhase,
            condition: formatTriggerCondition(config2)
          },
          tasks: ['Shareholders Data', 'Holding Data'],
          mode: 'PARALLEL' as const
        };
      })(),
      (() => {
        const config3 = phaseTriggerConfig['phase2_market_rotation']!;
        return {
          id: 'phase2_market_rotation',
          name: 'Phase 2 Market Rotation',
          description: 'RRC, RRG, Seasonal, Trend Filter, Watchlist Snapshot',
          status: phaseStatus['phase2_market_rotation'],
          enabled: phaseEnabled['phase2_market_rotation'],
          trigger: {
            type: config3.type,
            schedule: config3.schedule,
            triggerAfterPhase: config3.triggerAfterPhase,
            condition: formatTriggerCondition(config3)
          },
          tasks: ['RRC', 'RRG', 'Seasonal', 'Trend Filter', 'Watchlist Snapshot'],
          mode: 'PARALLEL' as const
        };
      })(),
      (() => {
        const config4 = phaseTriggerConfig['phase3_light']!;
        return {
          id: 'phase3_light',
          name: 'Phase 3 Light',
          description: 'Money Flow, Foreign Flow, Break Done Trade',
          status: phaseStatus['phase3_light'],
          enabled: phaseEnabled['phase3_light'],
          trigger: {
            type: config4.type,
            schedule: config4.schedule,
            triggerAfterPhase: config4.triggerAfterPhase,
            condition: formatTriggerCondition(config4)
          },
          tasks: ['Money Flow', 'Foreign Flow', 'Break Done Trade'],
          mode: 'PARALLEL' as const
        };
      })(),
      (() => {
        const config5 = phaseTriggerConfig['phase4_medium']!;
        return {
          id: 'phase4_medium',
          name: 'Phase 4 Medium',
          description: 'Bid/Ask Footprint, Broker Breakdown (all dates)',
          status: phaseStatus['phase4_medium'],
          enabled: phaseEnabled['phase4_medium'],
          trigger: {
            type: config5.type,
            schedule: config5.schedule,
            triggerAfterPhase: config5.triggerAfterPhase,
            condition: formatTriggerCondition(config5)
          },
          tasks: ['Bid/Ask Footprint', 'Broker Breakdown'],
          mode: 'SEQUENTIAL' as const
        };
      })(),
      (() => {
        const config6 = phaseTriggerConfig['phase5_heavy']!;
        return {
          id: 'phase5_heavy',
          name: 'Phase 5 Heavy',
          description: 'Broker Data (Broker Summary + Top Broker), Broker Summary by Type (RG/TN/NG split), Broker Summary IDX (aggregated all emiten), Broker Transaction (all types), Broker Transaction RG/TN/NG (split by type) - all dates',
          status: phaseStatus['phase5_heavy'],
          enabled: phaseEnabled['phase5_heavy'],
          trigger: {
            type: config6.type,
            schedule: config6.schedule,
            triggerAfterPhase: config6.triggerAfterPhase,
            condition: formatTriggerCondition(config6)
          },
          tasks: ['Broker Data', 'Broker Summary by Type', 'Broker Summary IDX', 'Broker Transaction', 'Broker Transaction RG/TN/NG'],
          mode: 'SEQUENTIAL' as const
        };
      })(),
      (() => {
        const config7 = phaseTriggerConfig['phase6_very_heavy']!;
        return {
          id: 'phase6_very_heavy',
          name: 'Phase 6 Very Heavy',
          description: 'Broker Inventory, Accumulation Distribution (sequential)',
          status: phaseStatus['phase6_very_heavy'],
          enabled: phaseEnabled['phase6_very_heavy'],
          trigger: {
            type: config7.type,
            schedule: config7.schedule,
            triggerAfterPhase: config7.triggerAfterPhase,
            condition: formatTriggerCondition(config7)
          },
          tasks: ['Broker Inventory', 'Accumulation Distribution'],
          mode: 'SEQUENTIAL' as const
        };
      })()
    ],
    scheduler: {
      running: status.running,
      timezone: status.timezone,
      memoryThreshold: status.memoryThreshold,
      weekendSkip: status.weekendSkip
    }
  };
}

/**
 * Stop a running phase by setting its status to idle
 */
function stopRunningPhase(phaseId: string): void {
  if (phaseStatus[phaseId] === 'running') {
    phaseStatus[phaseId] = 'idle';
    console.log(`🛑 Phase ${phaseId} stopped (was running)`);
  }
}

/**
 * Toggle phase enabled/disabled status
 */
export function togglePhaseEnabled(phaseId: string, enabled: boolean): { success: boolean; message: string } {
  if (!phaseEnabled.hasOwnProperty(phaseId)) {
    return { success: false, message: `Unknown phase: ${phaseId}` };
  }
  
  // If disabling and phase is currently running, stop it
  if (!enabled && phaseStatus[phaseId] === 'running') {
    stopRunningPhase(phaseId);
  }
  
  phaseEnabled[phaseId] = enabled;
  console.log(`✅ Phase ${phaseId} ${enabled ? 'enabled' : 'disabled'}`);
  
  return { 
    success: true, 
    message: `Phase ${phaseId} ${enabled ? 'enabled' : 'disabled'} successfully` 
  };
}

/**
 * Toggle all phases enabled/disabled status
 */
export function toggleAllPhasesEnabled(enabled: boolean): { success: boolean; message: string } {
  const phaseIds = Object.keys(phaseEnabled);
  
  // If disabling, stop all running phases
  if (!enabled) {
    phaseIds.forEach(phaseId => {
      if (phaseStatus[phaseId] === 'running') {
        stopRunningPhase(phaseId);
      }
    });
  }
  
  phaseIds.forEach(phaseId => {
    phaseEnabled[phaseId] = enabled;
  });
  console.log(`✅ All phases ${enabled ? 'enabled' : 'disabled'}`);
  
  return { 
    success: true, 
    message: `All phases ${enabled ? 'enabled' : 'disabled'} successfully` 
  };
}

/**
 * Update phase trigger configuration
 */
export function updatePhaseTriggerConfig(
  phaseId: string, 
  triggerType: 'scheduled' | 'auto', 
  schedule?: string, 
  triggerAfterPhase?: string
): { success: boolean; message: string } {
  if (!phaseTriggerConfig.hasOwnProperty(phaseId)) {
    return { success: false, message: `Unknown phase: ${phaseId}` };
  }
  
  // Validate time format if scheduled
  if (triggerType === 'scheduled' && schedule) {
    const timeFormatRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeFormatRegex.test(schedule)) {
      return { success: false, message: 'Invalid time format. Use HH:MM format (e.g., 19:00)' };
    }
    
    // Update config for Phase 1 phases
    if (phaseId === 'phase1_data_collection') {
      SCHEDULER_CONFIG.PHASE1_DATA_COLLECTION_TIME = schedule;
      PHASE1_DATA_COLLECTION_TIME = schedule;
      PHASE1_DATA_COLLECTION_SCHEDULE = timeToCron(schedule);
    } else if (phaseId === 'phase1_shareholders') {
      SCHEDULER_CONFIG.PHASE1_SHAREHOLDERS_TIME = schedule;
      PHASE1_SHAREHOLDERS_TIME = schedule;
      PHASE1_SHAREHOLDERS_SCHEDULE = timeToCron(schedule);
    }
  }
  
  // Validate triggerAfterPhase if auto
  if (triggerType === 'auto' && triggerAfterPhase) {
    if (!phaseTriggerConfig.hasOwnProperty(triggerAfterPhase)) {
      return { success: false, message: `Unknown triggerAfterPhase: ${triggerAfterPhase}` };
    }
    // Prevent circular dependency
    if (triggerAfterPhase === phaseId) {
      return { success: false, message: 'Phase cannot trigger after itself' };
    }
  }
  
  // Update trigger config
  const newConfig: PhaseTriggerConfig = {
    type: triggerType
  };
  if (triggerType === 'scheduled' && schedule) {
    newConfig.schedule = schedule;
  }
  if (triggerType === 'auto' && triggerAfterPhase) {
    newConfig.triggerAfterPhase = triggerAfterPhase;
  }
  phaseTriggerConfig[phaseId] = newConfig;
  
  console.log(`✅ Phase ${phaseId} trigger config updated:`, phaseTriggerConfig[phaseId]);
  
  // Restart scheduler if Phase 1 schedule changed
  if (triggerType === 'scheduled' && (phaseId === 'phase1_data_collection' || phaseId === 'phase1_shareholders')) {
    restartScheduler();
  }
  
  return { 
    success: true, 
    message: `Phase ${phaseId} trigger configuration updated successfully` 
  };
}

/**
 * Trigger a specific phase manually
 */
export async function triggerPhase(phaseId: string): Promise<{ success: boolean; message: string }> {
  try {
    // Check if phase is enabled
    if (!phaseEnabled[phaseId]) {
      return { success: false, message: `Phase ${phaseId} is disabled. Please enable it first.` };
    }
    
    // Check if phase is already running
    if (phaseStatus[phaseId] === 'running') {
      return { success: false, message: `Phase ${phaseId} is already running` };
    }
    
    switch (phaseId) {
      case 'phase1_data_collection':
        await runPhase1DataCollection();
        return { success: true, message: 'Phase 1 Data Collection triggered successfully' };
      case 'phase1_shareholders':
        // Phase 1 Shareholders requires special handling (monthly check)
        return { success: false, message: 'Phase 1 Shareholders can only run on 1st of month via scheduler' };
      case 'phase2_market_rotation':
        await runPhase2MarketRotationCalculations();
        return { success: true, message: 'Phase 2 Market Rotation triggered successfully' };
      case 'phase3_light':
        await runPhase3LightCalculations();
        return { success: true, message: 'Phase 3 Light triggered successfully' };
      case 'phase4_medium':
        await runPhase4MediumCalculations();
        return { success: true, message: 'Phase 4 Medium triggered successfully' };
      case 'phase5_heavy':
        await runPhase5HeavyCalculations();
        return { success: true, message: 'Phase 5 Heavy triggered successfully' };
      case 'phase6_very_heavy':
        await runPhase6VeryHeavyCalculations();
        return { success: true, message: 'Phase 6 Very Heavy triggered successfully' };
      default:
        return { success: false, message: `Unknown phase: ${phaseId}` };
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  if (schedulerRunning) {
    console.log('⚠️ Scheduler already running');
    return;
  }

  console.log('🕐 Starting scheduler...');

  // Phase 1, 2, 3 will be scheduled manually, Phase 4, 5, 6 will be auto-triggered

  // 1. Schedule Phase 1 - Data Collection (Stock, Index, Done Summary)
  const phase1DataCollectionTask = cron.schedule(PHASE1_DATA_COLLECTION_SCHEDULE, async () => {
    // Check if phase is enabled before starting
    if (!phaseEnabled['phase1_data_collection']) {
      console.log('⚠️ Phase 1 Data Collection is disabled - skipping');
      phaseStatus['phase1_data_collection'] = 'idle';
      return;
    }
    
    phaseStatus['phase1_data_collection'] = 'running';
    try {
      const phaseStartTime = Date.now();
      console.log(`\n🚀 ===== PHASE 1 DATA COLLECTION STARTED =====`);
      console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
      console.log(`📋 Phase: Data Collection (Stock, Index, Done Summary) - 7 days`);
      
      // Skip if weekend
      if (isWeekend()) {
        console.log('📅 Weekend detected - skipping Phase 1 Data Collection (no market data available)');
        phaseStatus['phase1_data_collection'] = 'idle';
        return;
      }
      
      let logEntry: SchedulerLog | null = null;
      
      try {
        // Check memory before starting
        const memoryOk = await monitorMemoryUsage();
        if (!memoryOk) {
          console.log('⚠️ Skipping Phase 1 Data Collection due to high memory usage');
          phaseStatus['phase1_data_collection'] = 'idle';
          return;
        }
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
        feature_name: 'phase1_data_collection',
        trigger_type: 'scheduled',
        triggered_by: 'scheduler',
        status: 'running',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
        console.log('📊 Phase 1 Data Collection database log created:', logEntry.id);
      }
      
      const phaseStartTime = Date.now();
      console.log('🔄 Starting Phase 1 Data Collection (PARALLEL MODE)...');
      
      // Track batch performance
      trackBatchPerformance(phaseStartTime, 'Phase 1 Data Collection Start');
      
      // Run data collection in parallel
      const dataCollectionTasks = [
        { name: 'Stock Data', service: updateStockData, method: null },
        { name: 'Index Data', service: updateIndexData, method: null },
        { name: 'Done Summary Data', service: updateDoneSummaryData, method: null }
      ];
      const totalTasks = dataCollectionTasks.length;
      
      const dataCollectionPromises = dataCollectionTasks.map(async (task, index) => {
        const startTime = Date.now();
        
        try {
          // Check if phase is still enabled before starting task
          if (!phaseEnabled['phase1_data_collection']) {
            console.log(`⚠️ Phase 1 Data Collection disabled - stopping ${task.name}`);
            phaseStatus['phase1_data_collection'] = 'idle';
            return { name: task.name, success: false, error: 'Phase disabled', duration: 0 };
          }
          
          console.log(`🔄 Starting ${task.name} (${index + 1}/${totalTasks})...`);
          
          // Update progress in database
          if (logEntry) {
            await SchedulerLogService.updateLog(logEntry.id!, {
              progress_percentage: Math.round((index / totalTasks) * 100),
              current_processing: `Running ${task.name}...`
            });
          }
          
          // Run calculation
          await (task.service as any)();
          
          // Check again after task completes
          if (!phaseEnabled['phase1_data_collection']) {
            console.log(`⚠️ Phase 1 Data Collection disabled during ${task.name} execution`);
            phaseStatus['phase1_data_collection'] = 'idle';
            return { name: task.name, success: false, error: 'Phase disabled during execution', duration: Date.now() - startTime };
          }
          
          const duration = Date.now() - startTime;
          
          // If we reach here without throwing an error, the task succeeded
          console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
          return { name: task.name, success: true, duration };
          
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ ${task.name} failed:`, errorMessage);
          return { name: task.name, success: false, error: errorMessage, duration };
        }
      });
      
      // Wait for all calculations to complete
      const dataCollectionResults = await Promise.allSettled(dataCollectionPromises);
      
      // Check if phase was disabled during execution
      if (!phaseEnabled['phase1_data_collection']) {
        console.log('⚠️ Phase 1 Data Collection was disabled during execution - stopping');
        phaseStatus['phase1_data_collection'] = 'idle';
        if (logEntry) {
          await SchedulerLogService.updateLog(logEntry.id!, {
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            current_processing: 'Phase disabled during execution'
          });
        }
        return;
      }
      
      // Process results
      const results: Array<{ name: string; success: boolean; error?: string; duration?: number }> = [];
      dataCollectionResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            name: dataCollectionTasks[index]?.name || 'Unknown',
            success: false,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          });
        }
      });
  
      const successCount = results.filter(r => r.success).length;
      const phaseEndTime = new Date();
      const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
      
      console.log(`\n📊 ===== PHASE 1 DATA COLLECTION COMPLETED =====`);
      console.log(`✅ Success: ${successCount}/${totalTasks} calculations`);
      console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
      console.log(`⏱️ Total Duration: ${totalDuration}s`);
      
      // Update database log
  if (logEntry) {
    await SchedulerLogService.updateLog(logEntry.id!, {
          status: successCount === totalTasks ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          total_files_processed: totalTasks,
          files_created: successCount,
          files_failed: totalTasks - successCount,
          progress_percentage: 100,
          current_processing: `Phase 1 Data Collection complete: ${successCount}/${totalTasks} calculations successful in ${totalDuration}s`
        });
      }
      
      // Cleanup after Phase 1 Data Collection
      await aggressiveMemoryCleanup();
      
      // Trigger Phase 2 automatically if Phase 1 succeeded and Phase 2 is enabled
      if (successCount >= Math.ceil(totalTasks * 0.67) && phaseEnabled['phase2_market_rotation']) { // Trigger Phase 2 if at least ~2/3 succeed
        console.log('🔄 Triggering Phase 2 Market Rotation calculations...');
        await runPhase2MarketRotationCalculations();
      } else {
        if (!phaseEnabled['phase2_market_rotation']) {
          console.log('⚠️ Skipping Phase 2 - Phase 2 is disabled');
        } else {
          console.log('⚠️ Skipping Phase 2 due to insufficient Phase 1 success rate');
        }
      }
      
      } catch (error) {
        console.error('❌ Error during Phase 1 Data Collection:', error);
        
        if (logEntry) {
          await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
        }
      } finally {
        phaseStatus['phase1_data_collection'] = 'idle';
      }
    } catch (error) {
      console.error('❌ Error in Phase 1 Data Collection scheduler:', error);
      phaseStatus['phase1_data_collection'] = 'idle';
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(phase1DataCollectionTask);

  // 2. Schedule Phase 1 - Shareholders & Holding (Monthly check - only on 1st of month)
  const phase1ShareholdersTask = cron.schedule(PHASE1_SHAREHOLDERS_SCHEDULE, async () => {
    phaseStatus['phase1_shareholders'] = 'running';
    try {
      const phaseStartTime = Date.now();
      console.log(`\n🚀 ===== PHASE 1 SHAREHOLDERS & HOLDING STARTED =====`);
      console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
      console.log(`📋 Phase: Shareholders & Holding (Monthly check - only on 1st of month)`);
      
      // Check if today is the first day of the month
      const today = new Date();
      
      if (today.getDate() !== 1) {
        console.log('📅 Not the first day of month - skipping Shareholders & Holding updates');
        phaseStatus['phase1_shareholders'] = 'idle';
        return;
      }
      
      console.log('📅 First day of month detected - running Shareholders & Holding updates');
      
      let logEntry: SchedulerLog | null = null;
      
      try {
        // Check memory before starting
        const memoryOk = await monitorMemoryUsage();
        if (!memoryOk) {
          console.log('⚠️ Skipping Phase 1 Shareholders & Holding due to high memory usage');
          phaseStatus['phase1_shareholders'] = 'idle';
          return;
        }
        
        // Create database log entry
        const logData: Partial<SchedulerLog> = {
          feature_name: 'phase1_shareholders_holding',
          trigger_type: 'scheduled',
          triggered_by: 'scheduler',
          status: 'running',
          started_at: new Date().toISOString(),
          environment: process.env['NODE_ENV'] || 'development'
        };
        
        logEntry = await SchedulerLogService.createLog(logData);
        if (logEntry) {
          console.log('📊 Phase 1 Shareholders & Holding database log created:', logEntry.id);
        }
        
        console.log('🔄 Starting Phase 1 Shareholders & Holding (PARALLEL MODE)...');
        
        // Run shareholders and holding updates in parallel
        const shareholdersHoldingTasks = [
          { name: 'Shareholders Data', service: updateShareholdersData, method: null },
          { name: 'Holding Data', service: updateHoldingData, method: null }
        ];
        
        const shareholdersHoldingPromises = shareholdersHoldingTasks.map(async (task, index) => {
          const startTime = Date.now();
          
          try {
            console.log(`🔄 Starting ${task.name} (${index + 1}/2)...`);
            
            // Update progress in database
            if (logEntry) {
              await SchedulerLogService.updateLog(logEntry.id!, {
                progress_percentage: Math.round((index / 2) * 100),
                current_processing: `Running ${task.name}...`
              });
            }
            
            // Run calculation
            await (task.service as any)();
            
            const duration = Date.now() - startTime;
            
            // If we reach here without throwing an error, the task succeeded
            console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
            return { name: task.name, success: true, duration };
            
          } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ ${task.name} failed:`, errorMessage);
            return { name: task.name, success: false, error: errorMessage, duration };
          }
        });
        
        // Wait for all calculations to complete
        const shareholdersHoldingResults = await Promise.allSettled(shareholdersHoldingPromises);
        
        // Process results
        const results: Array<{ name: string; success: boolean; error?: string; duration?: number }> = [];
        shareholdersHoldingResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              name: shareholdersHoldingTasks[index]?.name || 'Unknown',
              success: false,
              error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
            });
          }
        });
        
        const successCount = results.filter(r => r.success).length;
        const phaseEndTime = new Date();
        const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
        
        console.log(`\n📊 ===== PHASE 1 SHAREHOLDERS & HOLDING COMPLETED =====`);
        console.log(`✅ Success: ${successCount}/2 calculations`);
        console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
        console.log(`⏱️ Total Duration: ${totalDuration}s`);
        
        // Update database log
        if (logEntry) {
          await SchedulerLogService.updateLog(logEntry.id!, {
            status: successCount === 2 ? 'completed' : 'failed',
            completed_at: new Date().toISOString(),
            total_files_processed: 2,
            files_created: successCount,
            files_failed: 2 - successCount,
            progress_percentage: 100,
            current_processing: `Phase 1 Shareholders & Holding complete: ${successCount}/2 calculations successful in ${totalDuration}s`
          });
        }
        
        // Cleanup after Phase 1 Shareholders & Holding
        await aggressiveMemoryCleanup();
        
      } catch (error) {
        console.error('❌ Error during Phase 1 Shareholders & Holding:', error);
        
        if (logEntry) {
          await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
        }
      } finally {
        phaseStatus['phase1_shareholders'] = 'idle';
      }
    } catch (error) {
      console.error('❌ Error in Phase 1 Shareholders scheduler:', error);
      phaseStatus['phase1_shareholders'] = 'idle';
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(phase1ShareholdersTask);

  // Phase 2 and Phase 3 are now auto-triggered from Phase 1

  // Initialize Azure logging
  initializeAzureLogging().catch(console.error);
  
  // Log scheduler configuration
  console.log(`\n📅 Scheduler Configuration (${TIMEZONE}) - OPTIMIZED FOR 12GB RAM:`);
  console.log(`  🚀 Phase 1 Data Collection (PARALLEL): ${PHASE1_DATA_COLLECTION_TIME} daily (SCHEDULED)`);
  console.log(`    └─ Stock Data, Index Data, Done Summary Data (7 days)`);
  console.log(`  🚀 Phase 1 Shareholders & Holding (PARALLEL): ${PHASE1_SHAREHOLDERS_TIME} daily (SCHEDULED)`);
  console.log(`    └─ Shareholders Data, Holding Data (Monthly check)`);
  console.log(`  🚀 Phase 2 Market Rotation (PARALLEL): Auto-triggered after Phase 1`);
  console.log(`    └─ RRC, RRG, Seasonal, Trend Filter, Watchlist Snapshot`);
  console.log(`  🚀 Phase 3 Light (PARALLEL): Auto-triggered after Phase 2`);
  console.log(`    └─ Money Flow, Foreign Flow, Break Done Trade`);
  console.log(`  🚀 Phase 4 Medium (SEQUENTIAL): Auto-triggered after Phase 3`);
  console.log(`    └─ Bid/Ask Footprint, Broker Breakdown (all dates)`);
  console.log(`  🚀 Phase 5 Heavy (SEQUENTIAL): Auto-triggered after Phase 4`);
  console.log(`    └─ Broker Data (Broker Summary + Top Broker), Broker Summary by Type (RG/TN/NG split), Broker Summary IDX (aggregated all emiten), Broker Transaction (all types), Broker Transaction RG/TN/NG (split by type) - all dates`);
  console.log(`  🚀 Phase 6 Very Heavy (SEQUENTIAL): Auto-triggered after Phase 5`);
  console.log(`    └─ Broker Inventory, Accumulation Distribution (sequential)`);
  console.log(`  🧠 Memory Monitoring: ENABLED (12GB threshold)`);
  console.log(`  🧹 Aggressive Cleanup: After each calculation`);
  console.log(`  ⏭️  Weekend skip: ENABLED (Sat/Sun) - All scheduled phases skip weekend\n`);

  schedulerRunning = true;
  
  // Enable all phases when scheduler starts
  toggleAllPhasesEnabled(true);
  
  console.log('✅ Scheduler started successfully');
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (!schedulerRunning) {
    console.log('⚠️ Scheduler not running');
    return;
  }

  scheduledTasks.forEach(task => {
    if (task) {
      task.destroy();
    }
  });
  scheduledTasks = [];
  
  schedulerRunning = false;
  
  // Disable all phases when scheduler stops
  toggleAllPhasesEnabled(false);
  
  console.log('✅ Scheduler stopped');
}


/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    running: schedulerRunning,
    timezone: TIMEZONE,
    schedules: {
      phase1DataCollection: PHASE1_DATA_COLLECTION_TIME,
      phase1Shareholders: PHASE1_SHAREHOLDERS_TIME,
      phase2MarketRotation: 'Auto-triggered after Phase 1',
      phase3Light: 'Auto-triggered after Phase 2',
      phase4Medium: 'Auto-triggered after Phase 3',
      phase5Heavy: 'Auto-triggered after Phase 4',
      phase6VeryHeavy: 'Auto-triggered after Phase 5'
    },
    memoryThreshold: (() => {
      const memoryGB = SCHEDULER_CONFIG.MEMORY_THRESHOLD / (1024 * 1024 * 1024);
      return `${memoryGB}GB`;
    })(),
    weekendSkip: SCHEDULER_CONFIG.WEEKEND_SKIP
  };
}

/**
 * Get scheduler configuration
 */
export function getSchedulerConfig() {
  return {
    ...SCHEDULER_CONFIG,
    // Convert memory threshold to GB for readability
    MEMORY_THRESHOLD_GB: SCHEDULER_CONFIG.MEMORY_THRESHOLD / (1024 * 1024 * 1024)
  };
}

/**
 * Update scheduler configuration
 * @param newConfig Partial configuration to update
 */
export function updateSchedulerConfig(newConfig: Partial<typeof SCHEDULER_CONFIG>): void {
  // Update config
  SCHEDULER_CONFIG = {
    ...SCHEDULER_CONFIG,
    ...newConfig
  };
  
  // Update extracted variables
  PHASE1_DATA_COLLECTION_TIME = SCHEDULER_CONFIG.PHASE1_DATA_COLLECTION_TIME;
  PHASE1_SHAREHOLDERS_TIME = SCHEDULER_CONFIG.PHASE1_SHAREHOLDERS_TIME;
  TIMEZONE = SCHEDULER_CONFIG.TIMEZONE;
  
  // Update cron schedules
  PHASE1_DATA_COLLECTION_SCHEDULE = timeToCron(PHASE1_DATA_COLLECTION_TIME);
  PHASE1_SHAREHOLDERS_SCHEDULE = timeToCron(PHASE1_SHAREHOLDERS_TIME);
  
  console.log('✅ Scheduler configuration updated:', SCHEDULER_CONFIG);
}

/**
 * Restart scheduler with new configuration
 * This will stop current scheduler and start with new config
 */
export function restartScheduler(): void {
  console.log('🔄 Restarting scheduler with new configuration...');
  stopScheduler();
  // Wait a bit for cleanup
  setTimeout(() => {
    startScheduler();
  }, 1000);
}
