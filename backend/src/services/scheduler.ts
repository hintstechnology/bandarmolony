// scheduler.ts
// Scheduled tasks for data updates and calculations

import cron from 'node-cron';
import { forceRegenerate } from './rrcDataScheduler';
import { forceRegenerate as forceRegenerateRRG } from './rrgDataScheduler';
import { forceRegenerate as forceRegenerateSeasonal } from './seasonalityDataScheduler';
import TrendFilterDataScheduler from './trendFilterDataScheduler';
import AccumulationDataScheduler from './accumulationDataScheduler';
import BidAskDataScheduler from './bidAskDataScheduler';
import BrokerSummaryDataScheduler from './brokerSummaryDataScheduler';
import TopBrokerDataScheduler from './topBrokerDataScheduler';
import BrokerInventoryDataScheduler from './brokerInventoryDataScheduler';
import BrokerSummaryTypeDataScheduler from './brokerSummaryTypeDataScheduler';
import BrokerSummaryIDXDataScheduler from './brokerSummaryIDXDataScheduler';
import BrokerBreakdownDataScheduler from './brokerBreakdownDataScheduler';
import ForeignFlowDataScheduler from './foreignFlowDataScheduler';
import MoneyFlowDataScheduler from './moneyFlowDataScheduler';
import BreakDoneTradeDataScheduler from './breakDoneTradeDataScheduler';
import BrokerTransactionDataScheduler from './brokerTransactionDataScheduler';
import BrokerTransactionRGTNNGDataScheduler from './brokerTransactionRGTNNGDataScheduler';
import BrokerTransactionFDDataScheduler from './brokerTransactionFDDataScheduler';
import BrokerTransactionFDRGTNNGDataScheduler from './brokerTransactionFDRGTNNGDataScheduler';
import BrokerTransactionStockDataScheduler from './brokerTransactionStockDataScheduler';
import BrokerTransactionStockFDDataScheduler from './brokerTransactionStockFDDataScheduler';
import BrokerTransactionStockRGTNNGDataScheduler from './brokerTransactionStockRGTNNGDataScheduler';
import BrokerTransactionStockFDRGTNNGDataScheduler from './brokerTransactionStockFDRGTNNGDataScheduler';
import { SchedulerLogService, SchedulerLog } from './schedulerLogService';
import { updateDoneSummaryData } from './doneSummaryDataScheduler';
import { updateStockData } from './stockDataScheduler';
import { updateIndexData } from './indexDataScheduler';
import { updateShareholdersData } from './shareholdersDataScheduler';
import { updateHoldingData } from './holdingDataScheduler';
import { updateWatchlistSnapshot } from './watchlistSnapshotService';

// ======================
// SCHEDULER CONFIGURATION
// ======================
// All scheduler times are configured here for easy maintenance
// This is now a mutable object that can be updated at runtime
let SCHEDULER_CONFIG = {
  // Scheduled Calculation Times - Only Phase 1 runs on schedule
  PHASE1_DATA_COLLECTION_TIME: '19:00',    // Data collection (Stock, Index, Done Summary)
  PHASE1_SHAREHOLDERS_TIME: '00:01',       // Shareholders & Holding (if first day of month)
  
  // Phase 1a-1b: Input data (scheduled)
  // Phase 2-8 are auto-triggered sequentially after Phase 1a completes
  // Phase 1a: Input Daily (Stock, Index, Done Summary)
  // Phase 1b: Input Monthly (Shareholders & Holding)
  // Phase 2: Market Rotation (RRC, RRG, Seasonal, Trend Filter, Watchlist Snapshot)
  // Phase 3: Flow Trade (Money Flow, Foreign Flow, Break Done Trade)
  // Phase 4: Broker Summary (Top Broker, Broker Summary, Broker Summary IDX, Broker Summary by Type)
  // Phase 5: Broktrans Broker (Broker Transaction, Broker Transaction RG/TN/NG, Broker Transaction F/D, Broker Transaction F/D RG/TN/NG)
  // Phase 6: Broktrans Stock (Broker Transaction Stock, Broker Transaction Stock F/D, Broker Transaction Stock RG/TN/NG, Broker Transaction Stock F/D RG/TN/NG)
  // Phase 7: Bid Breakdown (Bid/Ask Footprint, Broker Breakdown)
  // Phase 8: Additional (Broker Inventory, Accumulation Distribution)
  
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
  phase1a_input_daily: 'idle',
  phase1b_input_monthly: 'idle',
  phase2_market_rotation: 'idle',
  phase3_flow_trade: 'idle',
  phase4_broker_summary: 'idle',
  phase5_broktrans_broker: 'idle',
  phase6_broktrans_stock: 'idle',
  phase7_bid_breakdown: 'idle',
  phase8_additional: 'idle'
};

// Phase enabled/disabled tracking
let phaseEnabled: Record<string, boolean> = {
  phase1a_input_daily: true,
  phase1b_input_monthly: true,
  phase2_market_rotation: true,
  phase3_flow_trade: true,
  phase4_broker_summary: true,
  phase5_broktrans_broker: true,
  phase6_broktrans_stock: true,
  phase7_bid_breakdown: true,
  phase8_additional: true
};

// Phase trigger configuration: 'scheduled' (with time) or 'auto' (trigger after another phase)
interface PhaseTriggerConfig {
  type: 'scheduled' | 'auto';
  schedule?: string | undefined; // For scheduled type: HH:MM format
  triggerAfterPhase?: string | undefined; // For auto type: phase ID to trigger after
}

let phaseTriggerConfig: Record<string, PhaseTriggerConfig> = {
  phase1a_input_daily: { type: 'scheduled', schedule: PHASE1_DATA_COLLECTION_TIME },
  phase1b_input_monthly: { type: 'scheduled', schedule: PHASE1_SHAREHOLDERS_TIME },
  phase2_market_rotation: { type: 'auto', triggerAfterPhase: 'phase1a_input_daily' },
  phase3_flow_trade: { type: 'auto', triggerAfterPhase: 'phase2_market_rotation' },
  phase4_broker_summary: { type: 'auto', triggerAfterPhase: 'phase3_flow_trade' },
  phase5_broktrans_broker: { type: 'auto', triggerAfterPhase: 'phase4_broker_summary' },
  phase6_broktrans_stock: { type: 'auto', triggerAfterPhase: 'phase5_broktrans_broker' },
  phase7_bid_breakdown: { type: 'auto', triggerAfterPhase: 'phase6_broktrans_stock' },
  phase8_additional: { type: 'auto', triggerAfterPhase: 'phase7_bid_breakdown' }
};
const trendFilterService = new TrendFilterDataScheduler();
const accumulationService = new AccumulationDataScheduler();
const bidAskService = new BidAskDataScheduler();
const brokerSummaryService = new BrokerSummaryDataScheduler();
const topBrokerService = new TopBrokerDataScheduler();
const brokerInventoryService = new BrokerInventoryDataScheduler();
const brokerBreakdownService = new BrokerBreakdownDataScheduler();
const brokerSummaryTypeService = new BrokerSummaryTypeDataScheduler();
const brokerSummaryIDXService = new BrokerSummaryIDXDataScheduler();
const foreignFlowService = new ForeignFlowDataScheduler();
const moneyFlowService = new MoneyFlowDataScheduler();
const breakDoneTradeService = new BreakDoneTradeDataScheduler();
const brokerTransactionService = new BrokerTransactionDataScheduler();
const brokerTransactionRGTNNGService = new BrokerTransactionRGTNNGDataScheduler();
const brokerTransactionFDService = new BrokerTransactionFDDataScheduler();
const brokerTransactionFDRGTNNGService = new BrokerTransactionFDRGTNNGDataScheduler();
const brokerTransactionStockService = new BrokerTransactionStockDataScheduler();
const brokerTransactionStockFDService = new BrokerTransactionStockFDDataScheduler();
const brokerTransactionStockRGTNNGService = new BrokerTransactionStockRGTNNGDataScheduler();
const brokerTransactionStockFDRGTNNGService = new BrokerTransactionStockFDRGTNNGDataScheduler();

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
      phase_id: 'phase2_market_rotation',
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
      if (successCount === 5) {
        await SchedulerLogService.markCompleted(logEntry.id!, {
          total_files_processed: 5,
          files_created: successCount,
          files_failed: 5 - successCount
        });
      } else {
        await SchedulerLogService.markFailed(logEntry.id!, `Phase 2 Market Rotation failed: ${successCount}/5 calculations successful`, { successCount, totalDuration });
      }
    }
    
    // Cleanup after Phase 2 Market Rotation
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 3 automatically if Phase 2 succeeded and Phase 3 is enabled
    if (successCount >= 4 && phaseEnabled['phase3_flow_trade']) { // Trigger Phase 3 if at least 4/5 succeed
      console.log('🔄 Triggering Phase 3 Flow Trade calculations...');
      await runPhase3FlowTradeCalculations();
    } else {
      if (!phaseEnabled['phase3_flow_trade']) {
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
 * Run Phase 3 - Flow Trade (Money Flow, Foreign Flow, Break Done Trade)
 */
export async function runPhase3FlowTradeCalculations(): Promise<void> {
  // Check if phase is enabled before starting
  if (!phaseEnabled['phase3_flow_trade']) {
    console.log('⚠️ Phase 3 Flow Trade is disabled - skipping');
    return;
  }
  
  phaseStatus['phase3_flow_trade'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 3 FLOW TRADE STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Flow Trade (Money Flow, Foreign Flow, Break Done Trade)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  resetPerformanceMetrics();
    
    let logEntry: SchedulerLog | null = null;
    
    try {
    // Check memory before starting
    const canProceed = await checkMemoryBeforeLargeOperation('Phase 3 Flow Trade Calculations');
    if (!canProceed) {
      console.log('⚠️ Skipping Phase 3 Flow Trade due to high memory usage');
      stopMemoryMonitoring();
        return;
      }
      
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 3 Flow Trade due to high memory usage');
      stopMemoryMonitoring();
      return;
    }
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
      feature_name: 'phase3_flow_trade',
        trigger_type: 'scheduled',
      triggered_by: 'phase2',
        status: 'running',
        phase_id: 'phase3_flow_trade',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
      console.log('📊 Phase 3 Flow Trade database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Phase 3 Flow Trade calculations (PARALLEL MODE)...');
    
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
    
    console.log(`\n📊 ===== PHASE 3 FLOW TRADE COMPLETED =====`);
    console.log(`✅ Success: ${successCount}/3 calculations`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
      
      // Update database log
      if (logEntry) {
        if (successCount === 3) {
          await SchedulerLogService.markCompleted(logEntry.id!, {
            total_files_processed: 3,
            files_created: successCount,
            files_failed: 3 - successCount
          });
        } else {
          await SchedulerLogService.markFailed(logEntry.id!, `Phase 3 Flow Trade failed: ${successCount}/3 calculations successful`, { successCount, totalDuration });
        }
      }
    
    // Cleanup after Phase 3 Flow Trade
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 4 automatically if Phase 3 succeeded and Phase 4 is enabled
    if (successCount >= 2 && phaseEnabled['phase4_broker_summary']) { // Trigger Phase 4 if at least 2/3 succeed
      console.log('🔄 Triggering Phase 4 Broker Summary calculations...');
      await runPhase4BrokerSummaryCalculations();
      } else {
        if (!phaseEnabled['phase4_broker_summary']) {
          console.log('⚠️ Skipping Phase 4 - Phase 4 is disabled');
        } else {
          console.log('⚠️ Skipping Phase 4 due to insufficient Phase 3 success rate');
        }
      }
      
    } catch (error) {
    trackError(error, 'Phase 3 Flow Trade Calculations');
    console.error('❌ Error during Phase 3 Flow Trade calculations:', error);
      
    // Stop memory monitoring on error
    stopMemoryMonitoring();
      
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    } finally {
      phaseStatus['phase3_flow_trade'] = 'idle';
    }
}

export async function runPhase4BrokerSummaryCalculations(): Promise<void> {
  // Check if phase is enabled before starting
  if (!phaseEnabled['phase4_broker_summary']) {
    console.log('⚠️ Phase 4 Broker Summary is disabled - skipping');
    return;
  }
  
  phaseStatus['phase4_broker_summary'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 4 BROKER SUMMARY STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Broker Summary (Top Broker, Broker Summary, Broker Summary IDX, Broker Summary by Type)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  resetPerformanceMetrics();
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 4 Broker Summary due to high memory usage');
      stopMemoryMonitoring();
      return;
    }

    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase4_broker_summary',
      trigger_type: 'scheduled',
      triggered_by: 'phase3',
      status: 'running',
      phase_id: 'phase4_broker_summary',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 4 Broker Summary database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Top Broker calculation...');
    const topBrokerStartTime = Date.now();
    const resultTopBroker = await topBrokerService.generateTopBrokerData('all', logEntry?.id || null);
    const topBrokerDuration = Math.round((Date.now() - topBrokerStartTime) / 1000);
    console.log(`📊 Top Broker completed in ${topBrokerDuration}s`);

    console.log('🔄 Starting Broker Summary calculation...');
    const brokerSummaryStartTime = Date.now();
    const resultSummary = await brokerSummaryService.generateBrokerSummaryData('all', logEntry?.id || null);
    const brokerSummaryDuration = Math.round((Date.now() - brokerSummaryStartTime) / 1000);
    console.log(`📊 Broker Summary completed in ${brokerSummaryDuration}s`);

    console.log('🔄 Starting Broker Summary IDX calculation...');
    const idxStartTime = Date.now();
    const resultIDX = await brokerSummaryIDXService.generateBrokerSummaryIDXData('all');
    const idxDuration = Math.round((Date.now() - idxStartTime) / 1000);
    console.log(`📊 Broker Summary IDX completed in ${idxDuration}s`);

    console.log('🔄 Starting Broker Summary by Type (RG/TN/NG) calculation...');
    const brokerSummaryTypeStartTime = Date.now();
    const resultType = await brokerSummaryTypeService.generateBrokerSummaryTypeData('all');
    const brokerSummaryTypeDuration = Math.round((Date.now() - brokerSummaryTypeStartTime) / 1000);
    console.log(`📊 Broker Summary Type completed in ${brokerSummaryTypeDuration}s`);
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    const successCount = (resultTopBroker.success ? 1 : 0) + (resultSummary.success ? 1 : 0) + (resultIDX.success ? 1 : 0) + (resultType.success ? 1 : 0);
    const totalCalculations = 4;
    
    console.log(`\n📊 ===== PHASE 4 BROKER SUMMARY COMPLETED =====`);
    console.log(`✅ Success: ${successCount}/${totalCalculations} calculations`);
    console.log(`📊 Top Broker: ${resultTopBroker.success ? 'SUCCESS' : 'FAILED'} (${topBrokerDuration}s)`);
    console.log(`📊 Broker Summary: ${resultSummary.success ? 'SUCCESS' : 'FAILED'} (${brokerSummaryDuration}s)`);
    console.log(`📊 Broker Summary IDX: ${resultIDX.success ? 'SUCCESS' : 'FAILED'} (${idxDuration}s)`);
    console.log(`📊 Broker Summary Type: ${resultType.success ? 'SUCCESS' : 'FAILED'} (${brokerSummaryTypeDuration}s)`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      if (successCount >= 3) {
        await SchedulerLogService.markCompleted(logEntry.id!, {
          total_files_processed: totalCalculations,
          files_created: successCount,
          files_failed: totalCalculations - successCount
        });
      } else {
        await SchedulerLogService.markFailed(logEntry.id!, `Phase 4 Broker Summary failed: ${successCount}/${totalCalculations} calculations successful`, { successCount, totalCalculations, totalDuration });
      }
    }
    
    // Cleanup after Phase 4
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 5 automatically if Phase 4 succeeded and Phase 5 is enabled
    if (successCount >= 3 && phaseEnabled['phase5_broktrans_broker']) {
      console.log('🔄 Triggering Phase 5 Broktrans Broker calculations...');
      await runPhase5BroktransBrokerCalculations();
    } else {
      if (!phaseEnabled['phase5_broktrans_broker']) {
        console.log('⚠️ Skipping Phase 5 - Phase 5 is disabled');
      } else {
        console.log('⚠️ Skipping Phase 5 due to Phase 4 failure');
      }
    }
    
    } catch (error) {
      trackError(error, 'Phase 4 Broker Summary Calculations');
      console.error('❌ Error during Phase 4 Broker Summary calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  } finally {
    phaseStatus['phase4_broker_summary'] = 'idle';
  }
}

/**
 * Run Phase 5 - Broktrans Broker (Broker Transaction, Broker Transaction RG/TN/NG, Broker Transaction F/D, Broker Transaction F/D RG/TN/NG)
 */
export async function runPhase5BroktransBrokerCalculations(): Promise<void> {
  // Check if phase is enabled before starting
  if (!phaseEnabled['phase5_broktrans_broker']) {
    console.log('⚠️ Phase 5 Broktrans Broker is disabled - skipping');
    return;
  }
  
  phaseStatus['phase5_broktrans_broker'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 5 BROKTRANS BROKER STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Broktrans Broker (Broker Transaction, Broker Transaction RG/TN/NG, Broker Transaction F/D, Broker Transaction F/D RG/TN/NG)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
    
    let logEntry: SchedulerLog | null = null;
    
    try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 5 Broktrans Broker due to high memory usage');
      stopMemoryMonitoring();
        return;
      }
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
      feature_name: 'phase5_broktrans_broker',
        trigger_type: 'scheduled',
      triggered_by: 'phase4',
        status: 'running',
        phase_id: 'phase5_broktrans_broker',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
      console.log('📊 Phase 5 Broktrans Broker database log created:', logEntry.id);
    }
    
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
    
    console.log('🔄 Starting Broker Transaction F/D calculation...');
    const brokerTransactionFDStartTime = Date.now();
    const resultTransactionFD = await brokerTransactionFDService.generateBrokerTransactionData('all');
    const brokerTransactionFDDuration = Math.round((Date.now() - brokerTransactionFDStartTime) / 1000);
    console.log(`📊 Broker Transaction F/D completed in ${brokerTransactionFDDuration}s`);
    
    console.log('🔄 Starting Broker Transaction F/D RG/TN/NG calculation...');
    const brokerTransactionFDRGTNNGStartTime = Date.now();
    const resultTransactionFDRGTNNG = await brokerTransactionFDRGTNNGService.generateBrokerTransactionData('all');
    const brokerTransactionFDRGTNNGDuration = Math.round((Date.now() - brokerTransactionFDRGTNNGStartTime) / 1000);
    console.log(`📊 Broker Transaction F/D RG/TN/NG completed in ${brokerTransactionFDRGTNNGDuration}s`);
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    console.log(`\n📊 ===== PHASE 5 BROKTRANS BROKER COMPLETED =====`);
    const successCount = (resultTransaction.success ? 1 : 0) + (resultTransactionRGTNNG.success ? 1 : 0) + (resultTransactionFD.success ? 1 : 0) + (resultTransactionFDRGTNNG.success ? 1 : 0);
    console.log(`✅ Success: ${successCount}/4 calculations`);
    console.log(`📊 Broker Transaction: ${resultTransaction.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionDuration}s)`);
    console.log(`📊 Broker Transaction RG/TN/NG: ${resultTransactionRGTNNG.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionRGTNNGDuration}s)`);
    console.log(`📊 Broker Transaction F/D: ${resultTransactionFD.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionFDDuration}s)`);
    console.log(`📊 Broker Transaction F/D RG/TN/NG: ${resultTransactionFDRGTNNG.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionFDRGTNNGDuration}s)`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      if (successCount >= 3) {
        await SchedulerLogService.markCompleted(logEntry.id!, {
          total_files_processed: 4,
          files_created: successCount,
          files_failed: 4 - successCount
        });
      } else {
        await SchedulerLogService.markFailed(logEntry.id!, `Phase 5 Broktrans Broker failed: ${successCount}/4 calculations successful`, { successCount, totalDuration, results: { resultTransaction, resultTransactionRGTNNG, resultTransactionFD, resultTransactionFDRGTNNG } });
      }
    }
    
    // Cleanup after Phase 5
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 6 automatically if Phase 5 succeeded and Phase 6 is enabled
    if (successCount >= 3 && phaseEnabled['phase6_broktrans_stock']) {
      console.log('🔄 Triggering Phase 6 Broktrans Stock calculations...');
      await runPhase6BroktransStockCalculations();
      } else {
        if (!phaseEnabled['phase6_broktrans_stock']) {
          console.log('⚠️ Skipping Phase 6 - Phase 6 is disabled');
        } else {
          console.log('⚠️ Skipping Phase 6 due to Phase 5 failure');
        }
    }
    
  } catch (error) {
    trackError(error, 'Phase 5 Broktrans Broker Calculations');
    console.error('❌ Error during Phase 5 Broktrans Broker calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  } finally {
    phaseStatus['phase5_broktrans_broker'] = 'idle';
  }
}

/**
 * Run Phase 6 - Broktrans Stock (Broker Transaction Stock, Broker Transaction Stock F/D, Broker Transaction Stock RG/TN/NG, Broker Transaction Stock F/D RG/TN/NG)
 */
export async function runPhase6BroktransStockCalculations(): Promise<void> {
  // Check if phase is enabled before starting
  if (!phaseEnabled['phase6_broktrans_stock']) {
    console.log('⚠️ Phase 6 Broktrans Stock is disabled - skipping');
    return;
  }
  
  phaseStatus['phase6_broktrans_stock'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 6 BROKTRANS STOCK STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Broktrans Stock (Broker Transaction Stock, Broker Transaction Stock F/D, Broker Transaction Stock RG/TN/NG, Broker Transaction Stock F/D RG/TN/NG)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  resetPerformanceMetrics();
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 6 Broktrans Stock due to high memory usage');
      stopMemoryMonitoring();
      return;
    }
    
    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase6_broktrans_stock',
      trigger_type: 'scheduled',
      triggered_by: 'phase5',
      status: 'running',
      phase_id: 'phase6_broktrans_stock',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 6 Broktrans Stock database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Broker Transaction Stock calculation...');
    const brokerTransactionStockStartTime = Date.now();
    const resultTransactionStock = await brokerTransactionStockService.generateBrokerTransactionData('all');
    const brokerTransactionStockDuration = Math.round((Date.now() - brokerTransactionStockStartTime) / 1000);
    console.log(`📊 Broker Transaction Stock completed in ${brokerTransactionStockDuration}s`);
    
    console.log('🔄 Starting Broker Transaction Stock F/D calculation...');
    const brokerTransactionStockFDStartTime = Date.now();
    const resultTransactionStockFD = await brokerTransactionStockFDService.generateBrokerTransactionData('all');
    const brokerTransactionStockFDDuration = Math.round((Date.now() - brokerTransactionStockFDStartTime) / 1000);
    console.log(`📊 Broker Transaction Stock F/D completed in ${brokerTransactionStockFDDuration}s`);
    
    console.log('🔄 Starting Broker Transaction Stock RG/TN/NG calculation...');
    const brokerTransactionStockRGTNNGStartTime = Date.now();
    const resultTransactionStockRGTNNG = await brokerTransactionStockRGTNNGService.generateBrokerTransactionData('all');
    const brokerTransactionStockRGTNNGDuration = Math.round((Date.now() - brokerTransactionStockRGTNNGStartTime) / 1000);
    console.log(`📊 Broker Transaction Stock RG/TN/NG completed in ${brokerTransactionStockRGTNNGDuration}s`);
    
    console.log('🔄 Starting Broker Transaction Stock F/D RG/TN/NG calculation...');
    const brokerTransactionStockFDRGTNNGStartTime = Date.now();
    const resultTransactionStockFDRGTNNG = await brokerTransactionStockFDRGTNNGService.generateBrokerTransactionData('all');
    const brokerTransactionStockFDRGTNNGDuration = Math.round((Date.now() - brokerTransactionStockFDRGTNNGStartTime) / 1000);
    console.log(`📊 Broker Transaction Stock F/D RG/TN/NG completed in ${brokerTransactionStockFDRGTNNGDuration}s`);
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    const successCount = (resultTransactionStock.success ? 1 : 0) + (resultTransactionStockFD.success ? 1 : 0) + (resultTransactionStockRGTNNG.success ? 1 : 0) + (resultTransactionStockFDRGTNNG.success ? 1 : 0);
    const totalCalculations = 4;
    
    console.log(`\n📊 ===== PHASE 6 BROKTRANS STOCK COMPLETED =====`);
    console.log(`✅ Success: ${successCount}/${totalCalculations} calculations`);
    console.log(`📊 Broker Transaction Stock: ${resultTransactionStock.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionStockDuration}s)`);
    console.log(`📊 Broker Transaction Stock F/D: ${resultTransactionStockFD.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionStockFDDuration}s)`);
    console.log(`📊 Broker Transaction Stock RG/TN/NG: ${resultTransactionStockRGTNNG.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionStockRGTNNGDuration}s)`);
    console.log(`📊 Broker Transaction Stock F/D RG/TN/NG: ${resultTransactionStockFDRGTNNG.success ? 'SUCCESS' : 'FAILED'} (${brokerTransactionStockFDRGTNNGDuration}s)`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      if (successCount >= 3) {
        await SchedulerLogService.markCompleted(logEntry.id!, {
          total_files_processed: totalCalculations,
          files_created: successCount,
          files_failed: totalCalculations - successCount
        });
      } else {
        await SchedulerLogService.markFailed(logEntry.id!, `Phase 6 Broktrans Stock failed: ${successCount}/${totalCalculations} calculations successful`, { successCount, totalCalculations, totalDuration, results: { resultTransactionStock, resultTransactionStockFD, resultTransactionStockRGTNNG, resultTransactionStockFDRGTNNG } });
      }
    }
    
    // Cleanup after Phase 6
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 7 automatically if Phase 6 succeeded and Phase 7 is enabled
    if (successCount >= 3 && phaseEnabled['phase7_bid_breakdown']) {
      console.log('🔄 Triggering Phase 7 Bid Breakdown calculations...');
      await runPhase7BidBreakdownCalculations();
    } else {
      if (!phaseEnabled['phase7_bid_breakdown']) {
        console.log('⚠️ Skipping Phase 7 - Phase 7 is disabled');
      } else {
        console.log('⚠️ Skipping Phase 7 due to Phase 6 failure');
      }
    }
    
  } catch (error) {
    trackError(error, 'Phase 6 Broktrans Stock Calculations');
    console.error('❌ Error during Phase 6 Broktrans Stock calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  } finally {
    phaseStatus['phase6_broktrans_stock'] = 'idle';
  }
}

/**
 * Run Phase 7 - Bid Breakdown (Bid/Ask Footprint, Broker Breakdown)
 */
export async function runPhase7BidBreakdownCalculations(): Promise<void> {
  // Check if phase is enabled before starting
  if (!phaseEnabled['phase7_bid_breakdown']) {
    console.log('⚠️ Phase 7 Bid Breakdown is disabled - skipping');
    return;
  }
  
  phaseStatus['phase7_bid_breakdown'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 7 BID BREAKDOWN STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Bid Breakdown (Bid/Ask Footprint, Broker Breakdown)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  resetPerformanceMetrics();
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 7 Bid Breakdown due to high memory usage');
      stopMemoryMonitoring();
      return;
    }

    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase7_bid_breakdown',
      trigger_type: 'scheduled',
      triggered_by: 'phase6',
      status: 'running',
      phase_id: 'phase7_bid_breakdown',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 7 Bid Breakdown database log created:', logEntry.id);
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
    
    console.log(`\n📊 ===== PHASE 7 BID BREAKDOWN COMPLETED =====`);
    console.log(`✅ Success: ${successCount}/${totalCalculations} calculations`);
    console.log(`📊 Bid/Ask Footprint: ${bidAskResult.success ? 'SUCCESS' : 'FAILED'} (${bidAskDuration}s)`);
    console.log(`📊 Broker Breakdown: ${brokerBreakdownResult.success ? 'SUCCESS' : 'FAILED'} (${brokerBreakdownDuration}s)`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      if (successCount >= 1) {
        await SchedulerLogService.markCompleted(logEntry.id!, {
          total_files_processed: totalCalculations,
          files_created: successCount,
          files_failed: totalCalculations - successCount
        });
      } else {
        await SchedulerLogService.markFailed(logEntry.id!, `Phase 7 Bid Breakdown failed: ${successCount}/${totalCalculations} calculations successful`, { successCount, totalCalculations, totalDuration });
      }
    }
    
    // Cleanup after Phase 7
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 8 automatically if Phase 7 succeeded and Phase 8 is enabled
    if (successCount >= 1 && phaseEnabled['phase8_additional']) {
      console.log('🔄 Triggering Phase 8 Additional calculations...');
      await runPhase8AdditionalCalculations();
    } else {
      if (!phaseEnabled['phase8_additional']) {
        console.log('⚠️ Skipping Phase 8 - Phase 8 is disabled');
      } else {
        console.log('⚠️ Skipping Phase 8 due to Phase 7 failure');
      }
    }
    
    } catch (error) {
      trackError(error, 'Phase 7 Bid Breakdown Calculations');
      console.error('❌ Error during Phase 7 Bid Breakdown calculations:', error);
    
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  } finally {
    phaseStatus['phase7_bid_breakdown'] = 'idle';
  }
}

/**
 * Run Phase 8 - Additional (Broker Inventory, Accumulation Distribution)
 */
export async function runPhase8AdditionalCalculations(): Promise<void> {
  // Check if phase is enabled before starting
  if (!phaseEnabled['phase8_additional']) {
    console.log('⚠️ Phase 8 Additional is disabled - skipping');
    return;
  }
  
  phaseStatus['phase8_additional'] = 'running';
  const phaseStartTime = Date.now();
  console.log(`\n🚀 ===== PHASE 8 ADDITIONAL STARTED =====`);
  console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
  console.log(`📋 Phase: Additional (Broker Inventory, Accumulation Distribution)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  resetPerformanceMetrics();
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 8 Additional due to high memory usage');
      stopMemoryMonitoring();
      return;
    }
    
    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase8_additional',
      trigger_type: 'scheduled',
      triggered_by: 'phase7',
      status: 'running',
      phase_id: 'phase8_additional',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 8 Additional database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Additional calculations (SEQUENTIAL)...');
    
    const additionalCalculations = [
      { name: 'Broker Inventory', service: brokerInventoryService, method: 'generateBrokerInventoryData' },
      { name: 'Accumulation Distribution', service: accumulationService, method: 'generateAccumulationData' }
    ];
    
    let totalSuccessCount = 0;
    let totalCalculations = 0;
    
    for (const calc of additionalCalculations) {
      console.log(`\n🔄 Starting ${calc.name} (${totalCalculations + 1}/${additionalCalculations.length})...`);
      
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
          console.error(`❌ Stopping Phase 8 due to critical calculation failure`);
          break; // Stop processing remaining calculations
      }
    } catch (error) {
        const calcDuration = Math.round((Date.now() - calcStartTime) / 1000);
        console.error(`❌ ${calc.name} error in ${calcDuration}s:`, error);
        console.error(`❌ Stopping Phase 8 due to critical calculation error`);
        break; // Stop processing remaining calculations
      }
      
      totalCalculations++;
      
      // No aggressive cleanup during calculations to prevent data loss
      // Longer delay between calculations for very heavy operations
      if (totalCalculations < additionalCalculations.length) {
        console.log('⏳ Waiting 10s before next calculation...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime) / 1000);
    
    const allCalculationsSuccessful = totalSuccessCount === totalCalculations && totalCalculations > 0;
    
    console.log(`\n📊 ===== PHASE 8 ADDITIONAL ${allCalculationsSuccessful ? 'COMPLETED' : 'FAILED'} =====`);
    console.log(`✅ Success: ${totalSuccessCount}/${totalCalculations} calculations`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    if (!allCalculationsSuccessful) {
      console.error(`❌ Phase 8 failed: ${totalCalculations - totalSuccessCount} calculations failed`);
    }
      
      // Update database log
      if (logEntry) {
        if (allCalculationsSuccessful) {
          await SchedulerLogService.markCompleted(logEntry.id!, {
            total_files_processed: totalCalculations,
            files_created: totalSuccessCount,
            files_failed: totalCalculations - totalSuccessCount
          });
        } else {
          await SchedulerLogService.markFailed(logEntry.id!, `Phase 8 Additional failed: ${totalSuccessCount}/${totalCalculations} calculations successful`, { totalSuccessCount, totalCalculations, totalDuration });
        }
      }
    
    console.log(`\n🎉 ===== ALL PHASES COMPLETED =====`);
    console.log(`📊 Total time from Phase 1a start: Check individual phase logs`);
    
    // Cleanup memory after all calculations are complete
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring after all phases complete
    stopMemoryMonitoring();
      
    } catch (error) {
      trackError(error, 'Phase 8 Additional Calculations');
      console.error('❌ Error during Phase 8 Additional calculations:', error);
      
    // Stop memory monitoring on error
    stopMemoryMonitoring();
    
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    } finally {
      phaseStatus['phase8_additional'] = 'idle';
    }
}

/**
 * Run Phase 1a Input Daily manually
 */
export async function runPhase1DataCollection(): Promise<void> {
  phaseStatus['phase1a_input_daily'] = 'running';
  try {
    const phaseStartTime = Date.now();
    console.log(`\n🚀 ===== PHASE 1A INPUT DAILY STARTED (MANUAL) =====`);
    console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
    console.log(`📋 Phase: Input Daily (Stock, Index, Done Summary) - 7 days`);
    
    // Skip if weekend
    if (isWeekend()) {
      console.log('📅 Weekend detected - skipping Phase 1a Input Daily (no market data available)');
      return;
    }
    
    let logEntry: SchedulerLog | null = null;
    
    try {
      // Check memory before starting
      const memoryOk = await monitorMemoryUsage();
      if (!memoryOk) {
        console.log('⚠️ Skipping Phase 1a Input Daily due to high memory usage');
        return;
      }
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
        feature_name: 'phase1a_input_daily',
        trigger_type: 'manual',
        triggered_by: 'admin',
        status: 'running',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
        console.log('📊 Phase 1a Input Daily database log created:', logEntry.id);
      }
      
      console.log('🔄 Starting Phase 1a Input Daily (PARALLEL MODE)...');
      
      // Track batch performance
      trackBatchPerformance(phaseStartTime, 'Phase 1a Input Daily Start');
      
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
          if (!phaseEnabled['phase1a_input_daily']) {
            console.log(`⚠️ Phase 1a Input Daily disabled - stopping ${task.name}`);
            phaseStatus['phase1a_input_daily'] = 'idle';
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
          if (!phaseEnabled['phase1a_input_daily']) {
            console.log(`⚠️ Phase 1a Input Daily disabled during ${task.name} execution`);
            phaseStatus['phase1a_input_daily'] = 'idle';
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
      if (!phaseEnabled['phase1a_input_daily']) {
        console.log('⚠️ Phase 1a Input Daily was disabled during execution - stopping');
        phaseStatus['phase1a_input_daily'] = 'idle';
        if (logEntry) {
          await SchedulerLogService.markCancelled(logEntry.id!, 'Phase disabled during execution', 'system');
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
      
      console.log(`\n📊 ===== PHASE 1A INPUT DAILY COMPLETED =====`);
      console.log(`✅ Success: ${successCount}/${totalTasks} calculations`);
      console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
      console.log(`⏱️ Total Duration: ${totalDuration}s`);
      
      // Update database log
      if (logEntry) {
        if (successCount === totalTasks) {
          await SchedulerLogService.markCompleted(logEntry.id!, {
            total_files_processed: totalTasks,
            files_created: successCount,
            files_failed: totalTasks - successCount
          });
        } else {
          await SchedulerLogService.markFailed(logEntry.id!, `Phase 1a Input Daily failed: ${successCount}/${totalTasks} calculations successful`, { successCount, totalTasks, totalDuration });
        }
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
      trackError(error, 'Phase 1a Input Daily');
      console.error('❌ Error during Phase 1a Input Daily:', error);
      
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    }
  } finally {
    phaseStatus['phase1a_input_daily'] = 'idle';
  }
}

// Helper function to get phase name by ID
function getPhaseName(phaseId: string): string {
  const phaseNames: Record<string, string> = {
    'phase1a_input_daily': 'Phase 1a Input Daily',
    'phase1b_input_monthly': 'Phase 1b Input Monthly',
    'phase2_market_rotation': 'Phase 2 Market Rotation',
    'phase3_flow_trade': 'Phase 3 Flow Trade',
    'phase4_broker_summary': 'Phase 4 Broker Summary',
    'phase5_broktrans_broker': 'Phase 5 Broktrans Broker',
    'phase6_broktrans_stock': 'Phase 6 Broktrans Stock',
    'phase7_bid_breakdown': 'Phase 7 Bid Breakdown',
    'phase8_additional': 'Phase 8 Additional'
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
        const config1 = phaseTriggerConfig['phase1a_input_daily']!;
        return {
          id: 'phase1a_input_daily',
          name: 'Phase 1a Input Daily',
          description: 'Stock, Index, dan Done Summary',
          status: phaseStatus['phase1a_input_daily'],
          enabled: phaseEnabled['phase1a_input_daily'],
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
        const config2 = phaseTriggerConfig['phase1b_input_monthly']!;
        return {
          id: 'phase1b_input_monthly',
          name: 'Phase 1b Input Monthly',
          description: 'Shareholders & Holding',
          status: phaseStatus['phase1b_input_monthly'],
          enabled: phaseEnabled['phase1b_input_monthly'],
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
        const config4 = phaseTriggerConfig['phase3_flow_trade']!;
        return {
          id: 'phase3_flow_trade',
          name: 'Phase 3 Flow Trade',
          description: 'Money Flow, Foreign Flow, Break Done Trade',
          status: phaseStatus['phase3_flow_trade'],
          enabled: phaseEnabled['phase3_flow_trade'],
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
        const config5 = phaseTriggerConfig['phase4_broker_summary']!;
        return {
          id: 'phase4_broker_summary',
          name: 'Phase 4 Broker Summary',
          description: 'Top Broker, Broker Summary, Broker Summary IDX, Broker Summary by Type',
          status: phaseStatus['phase4_broker_summary'],
          enabled: phaseEnabled['phase4_broker_summary'],
          trigger: {
            type: config5.type,
            schedule: config5.schedule,
            triggerAfterPhase: config5.triggerAfterPhase,
            condition: formatTriggerCondition(config5)
          },
          tasks: ['Top Broker', 'Broker Summary', 'Broker Summary IDX', 'Broker Summary by Type'],
          mode: 'SEQUENTIAL' as const
        };
      })(),
      (() => {
        const config6 = phaseTriggerConfig['phase5_broktrans_broker']!;
        return {
          id: 'phase5_broktrans_broker',
          name: 'Phase 5 Broktrans Broker',
          description: 'Broker Transaction, Broker Transaction RG/TN/NG, Broker Transaction F/D, Broker Transaction F/D RG/TN/NG',
          status: phaseStatus['phase5_broktrans_broker'],
          enabled: phaseEnabled['phase5_broktrans_broker'],
          trigger: {
            type: config6.type,
            schedule: config6.schedule,
            triggerAfterPhase: config6.triggerAfterPhase,
            condition: formatTriggerCondition(config6)
          },
          tasks: ['Broker Transaction', 'Broker Transaction RG/TN/NG', 'Broker Transaction F/D', 'Broker Transaction F/D RG/TN/NG'],
          mode: 'SEQUENTIAL' as const
        };
      })(),
      (() => {
        const config7 = phaseTriggerConfig['phase6_broktrans_stock']!;
        return {
          id: 'phase6_broktrans_stock',
          name: 'Phase 6 Broktrans Stock',
          description: 'Broker Transaction Stock, Broker Transaction Stock F/D, Broker Transaction Stock RG/TN/NG, Broker Transaction Stock F/D RG/TN/NG',
          status: phaseStatus['phase6_broktrans_stock'],
          enabled: phaseEnabled['phase6_broktrans_stock'],
          trigger: {
            type: config7.type,
            schedule: config7.schedule,
            triggerAfterPhase: config7.triggerAfterPhase,
            condition: formatTriggerCondition(config7)
          },
          tasks: ['Broker Transaction Stock', 'Broker Transaction Stock F/D', 'Broker Transaction Stock RG/TN/NG', 'Broker Transaction Stock F/D RG/TN/NG'],
          mode: 'SEQUENTIAL' as const
        };
      })(),
      (() => {
        const config8 = phaseTriggerConfig['phase7_bid_breakdown']!;
        return {
          id: 'phase7_bid_breakdown',
          name: 'Phase 7 Bid Breakdown',
          description: 'Bid/Ask Footprint, Broker Breakdown',
          status: phaseStatus['phase7_bid_breakdown'],
          enabled: phaseEnabled['phase7_bid_breakdown'],
          trigger: {
            type: config8.type,
            schedule: config8.schedule,
            triggerAfterPhase: config8.triggerAfterPhase,
            condition: formatTriggerCondition(config8)
          },
          tasks: ['Bid/Ask Footprint', 'Broker Breakdown'],
          mode: 'SEQUENTIAL' as const
        };
      })(),
      (() => {
        const config9 = phaseTriggerConfig['phase8_additional']!;
        return {
          id: 'phase8_additional',
          name: 'Phase 8 Additional',
          description: 'Broker Inventory, Accumulation Distribution',
          status: phaseStatus['phase8_additional'],
          enabled: phaseEnabled['phase8_additional'],
          trigger: {
            type: config9.type,
            schedule: config9.schedule,
            triggerAfterPhase: config9.triggerAfterPhase,
            condition: formatTriggerCondition(config9)
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
    if (phaseId === 'phase1a_input_daily') {
      SCHEDULER_CONFIG.PHASE1_DATA_COLLECTION_TIME = schedule;
      PHASE1_DATA_COLLECTION_TIME = schedule;
      PHASE1_DATA_COLLECTION_SCHEDULE = timeToCron(schedule);
    } else if (phaseId === 'phase1b_input_monthly') {
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
  if (triggerType === 'scheduled' && (phaseId === 'phase1a_input_daily' || phaseId === 'phase1b_input_monthly')) {
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
      case 'phase1a_input_daily':
        await runPhase1DataCollection();
        return { success: true, message: 'Phase 1a Input Daily triggered successfully' };
      case 'phase1b_input_monthly':
        // Phase 1b Input Monthly requires special handling (monthly check)
        return { success: false, message: 'Phase 1b Input Monthly can only run on 1st of month via scheduler' };
      case 'phase2_market_rotation':
        await runPhase2MarketRotationCalculations();
        return { success: true, message: 'Phase 2 Market Rotation triggered successfully' };
      case 'phase3_flow_trade':
        await runPhase3FlowTradeCalculations();
        return { success: true, message: 'Phase 3 Flow Trade triggered successfully' };
      case 'phase4_broker_summary':
        await runPhase4BrokerSummaryCalculations();
        return { success: true, message: 'Phase 4 Broker Summary triggered successfully' };
      case 'phase5_broktrans_broker':
        await runPhase5BroktransBrokerCalculations();
        return { success: true, message: 'Phase 5 Broktrans Broker triggered successfully' };
      case 'phase6_broktrans_stock':
        await runPhase6BroktransStockCalculations();
        return { success: true, message: 'Phase 6 Broktrans Stock triggered successfully' };
      case 'phase7_bid_breakdown':
        await runPhase7BidBreakdownCalculations();
        return { success: true, message: 'Phase 7 Bid Breakdown triggered successfully' };
      case 'phase8_additional':
        await runPhase8AdditionalCalculations();
        return { success: true, message: 'Phase 8 Additional triggered successfully' };
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
    if (!phaseEnabled['phase1a_input_daily']) {
      console.log('⚠️ Phase 1a Input Daily is disabled - skipping');
      phaseStatus['phase1a_input_daily'] = 'idle';
      return;
    }
    
    phaseStatus['phase1a_input_daily'] = 'running';
    try {
      const phaseStartTime = Date.now();
      console.log(`\n🚀 ===== PHASE 1A INPUT DAILY STARTED =====`);
      console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
      console.log(`📋 Phase: Input Daily (Stock, Index, Done Summary) - 7 days`);
      
      // Skip if weekend
      if (isWeekend()) {
        console.log('📅 Weekend detected - skipping Phase 1a Input Daily (no market data available)');
        phaseStatus['phase1a_input_daily'] = 'idle';
        return;
      }
      
      let logEntry: SchedulerLog | null = null;
      
      try {
        // Check memory before starting
        const memoryOk = await monitorMemoryUsage();
        if (!memoryOk) {
          console.log('⚠️ Skipping Phase 1a Input Daily due to high memory usage');
          phaseStatus['phase1a_input_daily'] = 'idle';
          return;
        }
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
        feature_name: 'phase1a_input_daily',
        trigger_type: 'scheduled',
        triggered_by: 'scheduler',
        status: 'running',
        phase_id: 'phase1a_input_daily',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
        console.log('📊 Phase 1a Input Daily database log created:', logEntry.id);
      }
      
      const phaseStartTime = Date.now();
      console.log('🔄 Starting Phase 1a Input Daily (PARALLEL MODE)...');
      
      // Track batch performance
      trackBatchPerformance(phaseStartTime, 'Phase 1a Input Daily Start');
      
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
          if (!phaseEnabled['phase1a_input_daily']) {
            console.log(`⚠️ Phase 1a Input Daily disabled - stopping ${task.name}`);
            phaseStatus['phase1a_input_daily'] = 'idle';
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
          if (!phaseEnabled['phase1a_input_daily']) {
            console.log(`⚠️ Phase 1a Input Daily disabled during ${task.name} execution`);
            phaseStatus['phase1a_input_daily'] = 'idle';
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
      if (!phaseEnabled['phase1a_input_daily']) {
        console.log('⚠️ Phase 1a Input Daily was disabled during execution - stopping');
        phaseStatus['phase1a_input_daily'] = 'idle';
        if (logEntry) {
          await SchedulerLogService.markCancelled(logEntry.id!, 'Phase disabled during execution', 'system');
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
      
      console.log(`\n📊 ===== PHASE 1A INPUT DAILY COMPLETED =====`);
      console.log(`✅ Success: ${successCount}/${totalTasks} calculations`);
      console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
      console.log(`⏱️ Total Duration: ${totalDuration}s`);
      
      // Update database log
  if (logEntry) {
    if (successCount === totalTasks) {
      await SchedulerLogService.markCompleted(logEntry.id!, {
        total_files_processed: totalTasks,
        files_created: successCount,
        files_failed: totalTasks - successCount
      });
    } else {
      await SchedulerLogService.markFailed(logEntry.id!, `Phase 1a Input Daily failed: ${successCount}/${totalTasks} calculations successful`, { successCount, totalTasks, totalDuration });
    }
  }
      
      // Cleanup after Phase 1a Input Daily
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
        console.error('❌ Error during Phase 1a Input Daily:', error);
        
        if (logEntry) {
          await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
        }
      } finally {
        phaseStatus['phase1a_input_daily'] = 'idle';
      }
    } catch (error) {
      console.error('❌ Error in Phase 1a Input Daily scheduler:', error);
      phaseStatus['phase1a_input_daily'] = 'idle';
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(phase1DataCollectionTask);

  // 2. Schedule Phase 1b - Input Monthly (Shareholders & Holding - Monthly check - only on 1st of month)
  const phase1ShareholdersTask = cron.schedule(PHASE1_SHAREHOLDERS_SCHEDULE, async () => {
    phaseStatus['phase1b_input_monthly'] = 'running';
    try {
      const phaseStartTime = Date.now();
      console.log(`\n🚀 ===== PHASE 1B INPUT MONTHLY STARTED =====`);
      console.log(`🕐 Start Time: ${new Date(phaseStartTime).toISOString()}`);
      console.log(`📋 Phase: Input Monthly (Shareholders & Holding - Monthly check - only on 1st of month)`);
      
      // Check if today is the first day of the month
      const today = new Date();
      
      if (today.getDate() !== 1) {
        console.log('📅 Not the first day of month - skipping Shareholders & Holding updates');
        phaseStatus['phase1b_input_monthly'] = 'idle';
        return;
      }
      
      console.log('📅 First day of month detected - running Shareholders & Holding updates');
      
      let logEntry: SchedulerLog | null = null;
      
      try {
        // Check memory before starting
        const memoryOk = await monitorMemoryUsage();
        if (!memoryOk) {
          console.log('⚠️ Skipping Phase 1b Input Monthly & Holding due to high memory usage');
          phaseStatus['phase1b_input_monthly'] = 'idle';
          return;
        }
        
        // Create database log entry
        const logData: Partial<SchedulerLog> = {
          feature_name: 'phase1b_input_monthly',
          trigger_type: 'scheduled',
          triggered_by: 'scheduler',
          status: 'running',
          phase_id: 'phase1b_input_monthly',
          started_at: new Date().toISOString(),
          environment: process.env['NODE_ENV'] || 'development'
        };
        
        logEntry = await SchedulerLogService.createLog(logData);
        if (logEntry) {
          console.log('📊 Phase 1b Input Monthly & Holding database log created:', logEntry.id);
        }
        
        console.log('🔄 Starting Phase 1b Input Monthly & Holding (PARALLEL MODE)...');
        
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
        
        console.log(`\n📊 ===== PHASE 1B INPUT MONTHLY COMPLETED =====`);
        console.log(`✅ Success: ${successCount}/2 calculations`);
        console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
        console.log(`⏱️ Total Duration: ${totalDuration}s`);
        
        // Update database log
        if (logEntry) {
          if (successCount === 2) {
            await SchedulerLogService.markCompleted(logEntry.id!, {
              total_files_processed: 2,
              files_created: successCount,
              files_failed: 2 - successCount
            });
          } else {
            await SchedulerLogService.markFailed(logEntry.id!, `Phase 1b Input Monthly & Holding failed: ${successCount}/2 calculations successful`, { successCount, totalDuration });
          }
        }
        
        // Cleanup after Phase 1b Input Monthly & Holding
        await aggressiveMemoryCleanup();
        
      } catch (error) {
        console.error('❌ Error during Phase 1b Input Monthly & Holding:', error);
        
        if (logEntry) {
          await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
        }
      } finally {
        phaseStatus['phase1b_input_monthly'] = 'idle';
      }
    } catch (error) {
      console.error('❌ Error in Phase 1b Input Monthly scheduler:', error);
      phaseStatus['phase1b_input_monthly'] = 'idle';
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(phase1ShareholdersTask);

  // Phase 2 and Phase 3 are now auto-triggered from Phase 1

  // Log scheduler configuration
  console.log(`\n📅 Scheduler Configuration (${TIMEZONE}) - OPTIMIZED FOR 12GB RAM:`);
  console.log(`  🚀 Phase 1a Input Daily (PARALLEL): ${PHASE1_DATA_COLLECTION_TIME} daily (SCHEDULED)`);
  console.log(`    └─ Stock Data, Index Data, Done Summary Data (7 days)`);
  console.log(`  🚀 Phase 1b Input Monthly & Holding (PARALLEL): ${PHASE1_SHAREHOLDERS_TIME} daily (SCHEDULED)`);
  console.log(`    └─ Shareholders Data, Holding Data (Monthly check)`);
  console.log(`  🚀 Phase 2 Market Rotation (PARALLEL): Auto-triggered after Phase 1`);
  console.log(`    └─ RRC, RRG, Seasonal, Trend Filter, Watchlist Snapshot`);
  console.log(`  🚀 Phase 3 Light (PARALLEL): Auto-triggered after Phase 2`);
  console.log(`    └─ Money Flow, Foreign Flow, Break Done Trade`);
  console.log(`  🚀 Phase 4 Medium (SEQUENTIAL): Auto-triggered after Phase 3`);
  console.log(`    └─ Bid/Ask Footprint, Broker Breakdown (all dates)`);
  console.log(`  🚀 Phase 5 Heavy (SEQUENTIAL): Auto-triggered after Phase 4`);
  console.log(`    └─ Broker Summary (per emiten + ALLSUM), Top Broker (comprehensive + by stock), Broker Summary by Type (RG/TN/NG split), Broker Summary IDX (aggregated all emiten), Broker Transaction (all types), Broker Transaction RG/TN/NG (split by type) - all dates`);
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
    weekendSkip: SCHEDULER_CONFIG.WEEKEND_SKIP,
    phases: { ...phaseStatus }
  };
}

/**
 * Get phase statuses (for public API)
 */
export function getPhaseStatuses() {
  return { ...phaseStatus };
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

