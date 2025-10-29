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
import BrokerBreakdownDataScheduler from './brokerBreakdownDataScheduler';
import ForeignFlowDataScheduler from './foreignFlowDataScheduler';
import MoneyFlowDataScheduler from './moneyFlowDataScheduler';
import BreakDoneTradeDataScheduler from './breakDoneTradeDataScheduler';
import { SchedulerLogService, SchedulerLog } from './schedulerLogService';
import { updateDoneSummaryData } from './doneSummaryDataScheduler';
import { updateStockData } from './stockDataScheduler';
import { updateIndexData } from './indexDataScheduler';
import { updateShareholdersData } from './shareholdersDataScheduler';
import { updateHoldingData } from './holdingDataScheduler';
import { initializeAzureLogging } from './azureLoggingService';

// ======================
// SCHEDULER CONFIGURATION
// ======================
// All scheduler times are configured here for easy maintenance
const SCHEDULER_CONFIG = {
  // Scheduled Calculation Times - Only Phase 1 runs on schedule
  PHASE1_DATA_COLLECTION_TIME: '19:00',    // Data collection (Stock, Index, Done Summary)
  PHASE1_SHAREHOLDERS_TIME: '00:00',       // Shareholders & Holding (if last month)
  
  // Phase 2-6 are auto-triggered sequentially after Phase 1 completes
  // Phase 2: Market rotation (RRC, RRG, Seasonal, Trend Filter)
  // Phase 3: Light calculations (Money Flow, Foreign Flow, Break Done Trade)
  // Phase 4: Medium calculations (Bid/Ask Footprint, Broker Breakdown)
  // Phase 5: Heavy calculations (Broker Data)
  // Phase 6: Very Heavy calculations (Broker Inventory, Accumulation Distribution)
  
  // Memory Management
  MEMORY_CLEANUP_INTERVAL: 5000,  // 5 seconds
  FORCE_GC_INTERVAL: 10000,       // 10 seconds
  MEMORY_THRESHOLD: 12 * 1024 * 1024 * 1024, // 12GB threshold
  
  // Timezone
  TIMEZONE: 'Asia/Jakarta'
};

// Extract times for scheduler
const PHASE1_DATA_COLLECTION_TIME = SCHEDULER_CONFIG.PHASE1_DATA_COLLECTION_TIME;
const PHASE1_SHAREHOLDERS_TIME = SCHEDULER_CONFIG.PHASE1_SHAREHOLDERS_TIME;
const TIMEZONE = SCHEDULER_CONFIG.TIMEZONE;

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

// Generate cron schedules from configuration
const PHASE1_DATA_COLLECTION_SCHEDULE = timeToCron(PHASE1_DATA_COLLECTION_TIME);
const PHASE1_SHAREHOLDERS_SCHEDULE = timeToCron(PHASE1_SHAREHOLDERS_TIME);

let schedulerRunning = false;
let scheduledTasks: any[] = [];
const trendFilterService = new TrendFilterDataScheduler();
const accumulationService = new AccumulationDataScheduler();
const bidAskService = new BidAskDataScheduler();
const brokerDataService = new BrokerDataScheduler();
const brokerInventoryService = new BrokerInventoryDataScheduler();
const brokerBreakdownService = new BrokerBreakdownDataScheduler();
const foreignFlowService = new ForeignFlowDataScheduler();
const moneyFlowService = new MoneyFlowDataScheduler();
const breakDoneTradeService = new BreakDoneTradeDataScheduler();

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
async function runPhase2MarketRotationCalculations(): Promise<void> {
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
      { name: 'Trend Filter Calculation', service: trendFilterService, method: 'generateTrendFilterData' }
    ];
    
    const marketRotationPromises = marketRotationTasks.map(async (task, index) => {
      const startTime = Date.now();
      
      try {
        console.log(`🔄 Starting ${task.name} (${index + 1}/4)...`);
        
        // Update progress in database
        if (logEntry) {
          await SchedulerLogService.updateLog(logEntry.id!, {
            progress_percentage: Math.round((index / 4) * 100),
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
    console.log(`✅ Success: ${successCount}/4 calculations`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      await SchedulerLogService.updateLog(logEntry.id!, {
        status: successCount === 4 ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_files_processed: 4,
        files_created: successCount,
        files_failed: 4 - successCount,
        progress_percentage: 100,
        current_processing: `Phase 2 Market Rotation complete: ${successCount}/4 calculations successful in ${totalDuration}s`
      });
    }
    
    // Cleanup after Phase 2 Market Rotation
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 3 automatically if Phase 2 succeeded
    if (successCount >= 3) { // Trigger Phase 3 if at least 3/4 succeed
      console.log('🔄 Triggering Phase 3 Light calculations...');
      await runPhase3LightCalculations();
    } else {
      console.log('⚠️ Skipping Phase 3 due to insufficient Phase 2 success rate');
    }
    
    } catch (error) {
    trackError(error, 'Phase 2 Market Rotation Calculations');
    console.error('❌ Error during Phase 2 Market Rotation calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  }
}

/**
 * Run Phase 3 - Light Calculations (Money Flow, Foreign Flow, Break Done Trade)
 */
async function runPhase3LightCalculations(): Promise<void> {
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
    
    // Trigger Phase 4 automatically if Phase 3 succeeded
    if (successCount >= 2) { // Trigger Phase 4 if at least 2/3 succeed
      console.log('🔄 Triggering Phase 4 Medium calculations...');
      await runPhase4MediumCalculations();
      } else {
      console.log('⚠️ Skipping Phase 4 due to insufficient Phase 3 success rate');
      }
      
    } catch (error) {
    trackError(error, 'Phase 3 Light Calculations');
    console.error('❌ Error during Phase 3 Light calculations:', error);
      
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    }
}

async function runPhase4MediumCalculations(): Promise<void> {
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
    const bidAskResult = await bidAskService.generateBidAskData('all');
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
    
    // Trigger Phase 5 automatically if Phase 4 succeeded
    if (successCount >= 1) { // Trigger Phase 5 if at least 1/2 succeed
      console.log('🔄 Triggering Phase 5 Heavy calculations...');
      await runPhase5HeavyCalculations();
    } else {
      console.log('⚠️ Skipping Phase 5 due to Phase 4 failure');
    }
    
    } catch (error) {
      trackError(error, 'Phase 4 Medium Calculations');
      console.error('❌ Error during Phase 4 Medium calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  }
}

/**
 * Run Phase 5 - Heavy Calculations (Broker Data)
 */
async function runPhase5HeavyCalculations(): Promise<void> {
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 5 HEAVY CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Heavy Calculations (Broker Data)`);
  
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
    
    const result = await brokerDataService.generateBrokerData('all');
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    console.log(`\n📊 ===== PHASE 5 HEAVY COMPLETED =====`);
    console.log(`✅ Success: ${result.success ? '1/1' : '0/1'} calculations`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      await SchedulerLogService.updateLog(logEntry.id!, {
        status: result.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_files_processed: 1,
        files_created: result.success ? 1 : 0,
        files_failed: result.success ? 0 : 1,
        progress_percentage: 100,
        current_processing: `Phase 5 Heavy complete: Broker Data ${result.success ? 'successful' : 'failed'} in ${totalDuration}s`
      });
    }
    
    // Cleanup after Phase 5
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 6 automatically if Phase 5 succeeded
    if (result.success) {
      console.log('🔄 Triggering Phase 6 Very Heavy calculations...');
      await runPhase6VeryHeavyCalculations();
      } else {
      console.log('⚠️ Skipping Phase 6 due to Phase 5 failure');
    }
    
  } catch (error) {
    trackError(error, 'Phase 5 Heavy Calculations');
    console.error('❌ Error during Phase 5 Heavy calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  }
}

/**
 * Run Phase 6 - Very Heavy Calculations (Broker Inventory, Accumulation Distribution)
 */
async function runPhase6VeryHeavyCalculations(): Promise<void> {
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
        const result = await (calc.service as any)[calc.method]('all');
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
    const phaseStartTime = Date.now();
    console.log(`\n🚀 ===== PHASE 1 DATA COLLECTION STARTED =====`);
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
      
      const dataCollectionPromises = dataCollectionTasks.map(async (task, index) => {
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
      const dataCollectionResults = await Promise.allSettled(dataCollectionPromises);
  
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
          current_processing: `Phase 1 Data Collection complete: ${successCount}/3 calculations successful in ${totalDuration}s`
        });
      }
      
      // Cleanup after Phase 1 Data Collection
      await aggressiveMemoryCleanup();
      
      // Trigger Phase 2 automatically if Phase 1 succeeded
      if (successCount >= 2) { // Trigger Phase 2 if at least 2/3 succeed
        console.log('🔄 Triggering Phase 2 Market Rotation calculations...');
        await runPhase2MarketRotationCalculations();
      } else {
        console.log('⚠️ Skipping Phase 2 due to insufficient Phase 1 success rate');
      }
      
    } catch (error) {
      console.error('❌ Error during Phase 1 Data Collection:', error);
      
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(phase1DataCollectionTask);

  // 2. Schedule Phase 1 - Shareholders & Holding (Monthly check)
  const phase1ShareholdersTask = cron.schedule(PHASE1_SHAREHOLDERS_SCHEDULE, async () => {
    const phaseStartTime = Date.now();
    console.log(`\n🚀 ===== PHASE 1 SHAREHOLDERS & HOLDING STARTED =====`);
    console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
    console.log(`📋 Phase: Shareholders & Holding (Monthly check)`);
    
    // Skip if weekend
    if (isWeekend()) {
      console.log('📅 Weekend detected - skipping Phase 1 Shareholders & Holding (no market data available)');
      return;
    }
    
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check if today is the last day of the month
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (today.getMonth() !== tomorrow.getMonth()) {
        console.log('📅 Last day of month detected - running Shareholders & Holding updates');
        
        // Check memory before starting
        const memoryOk = await monitorMemoryUsage();
        if (!memoryOk) {
          console.log('⚠️ Skipping Phase 1 Shareholders & Holding due to high memory usage');
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
        
      } else {
        console.log('📅 Not the last day of month - skipping Shareholders & Holding updates');
    }
    
  } catch (error) {
      console.error('❌ Error during Phase 1 Shareholders & Holding:', error);
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
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
  console.log(`    └─ RRC, RRG, Seasonal, Trend Filter`);
  console.log(`  🚀 Phase 3 Light (PARALLEL): Auto-triggered after Phase 2`);
  console.log(`    └─ Money Flow, Foreign Flow, Break Done Trade`);
  console.log(`  🚀 Phase 4 Medium (SEQUENTIAL): Auto-triggered after Phase 3`);
  console.log(`    └─ Bid/Ask Footprint, Broker Breakdown (all dates)`);
  console.log(`  🚀 Phase 5 Heavy (SEQUENTIAL): Auto-triggered after Phase 4`);
  console.log(`    └─ Broker Data (all dates)`);
  console.log(`  🚀 Phase 6 Very Heavy (SEQUENTIAL): Auto-triggered after Phase 5`);
  console.log(`    └─ Broker Inventory, Accumulation Distribution (sequential)`);
  console.log(`  🧠 Memory Monitoring: ENABLED (12GB threshold)`);
  console.log(`  🧹 Aggressive Cleanup: After each calculation`);
  console.log(`  ⏭️  Weekend skip: ENABLED (Sat/Sun) - All scheduled phases skip weekend\n`);

  schedulerRunning = true;
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
    memoryThreshold: '12GB',
    weekendSkip: true
  };
}
