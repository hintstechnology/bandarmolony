// scheduler.ts
// Scheduled tasks for data updates and calculations

import cron from 'node-cron';
// Removed unused imports
import AccumulationDataScheduler from './accumulationDataScheduler';
import BidAskDataScheduler from './bidAskDataScheduler';
import BrokerDataScheduler from './brokerDataScheduler';
import BrokerInventoryDataScheduler from './brokerInventoryDataScheduler';
import ForeignFlowDataScheduler from './foreignFlowDataScheduler';
import MoneyFlowDataScheduler from './moneyFlowDataScheduler';
import BreakDoneTradeDataScheduler from './breakDoneTradeDataScheduler';
import TrendFilterDataScheduler from './trendFilterDataScheduler';
import { updateStockData } from './stockDataScheduler';
import { updateIndexData } from './indexDataScheduler';
import { updateDoneSummaryData } from './doneSummaryDataScheduler';
import { updateShareholdersData } from './shareholdersDataScheduler';
import { updateHoldingData } from './holdingDataScheduler';
import { forceRegenerate as forceRegenerateRRC } from './rrcDataScheduler';
import { forceRegenerate as forceRegenerateRRG } from './rrgDataScheduler';
import { forceRegenerate as forceRegenerateSeasonal } from './seasonalityDataScheduler';
import { SchedulerLogService, SchedulerLog } from './schedulerLogService';
import { initializeAzureLogging } from './azureLoggingService';

// ======================
// SCHEDULER CONFIGURATION - OPTIMIZED FOR 8GB RAM
// ======================
// All scheduler times are configured here for easy maintenance
const SCHEDULER_CONFIG = {
  // Phase-based Calculation Times - OPTIMIZED FOR 8GB RAM
  PHASE1_DATA_COLLECTION_TIME: '13:25',    // Data collection (Stock, Index, Done Summary)
  PHASE1_SHAREHOLDERS_TIME: '00:00',       // Shareholders & Holding (if last month)
  PHASE2_MARKET_ROTATION_TIME: '13:37',   // Market rotation (RRC, RRG, Seasonal, Trend Filter)
  PHASE3_LIGHT_TIME: '13:40',              // Light calculations (Money Flow, Foreign Flow, Break Done Trade)
  // Phase 4 (medium) will run automatically after previous phase completes (Bid/ask)
  // Phase 5 (heavy) will run automatically after previous phase completes (Broker Data)
  // Phase 6 (very heavy) will run automatically after previous phase completes (Broker Inventory, Accumulation Distribution)
  
  // Memory Management
  MEMORY_CLEANUP_INTERVAL: 5000,  // 5 seconds
  FORCE_GC_INTERVAL: 10000,       // 10 seconds
  MEMORY_THRESHOLD: 6 * 1024 * 1024 * 1024, // 6GB threshold
  
  // Timezone
  TIMEZONE: 'Asia/Jakarta'
};

// Extract times for phase-based scheduling
const PHASE1_DATA_COLLECTION_TIME = SCHEDULER_CONFIG.PHASE1_DATA_COLLECTION_TIME;
const PHASE1_SHAREHOLDERS_TIME = SCHEDULER_CONFIG.PHASE1_SHAREHOLDERS_TIME;
const PHASE2_MARKET_ROTATION_TIME = SCHEDULER_CONFIG.PHASE2_MARKET_ROTATION_TIME;
const PHASE3_LIGHT_TIME = SCHEDULER_CONFIG.PHASE3_LIGHT_TIME;
const TIMEZONE = SCHEDULER_CONFIG.TIMEZONE;

// Convert time to cron format (HH:MM -> MM HH * * *)
function timeToCron(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${minutes} ${hours} * * *`;
}

// Generate cron schedules from configuration
// Removed unused schedule variables
const PHASE1_DATA_COLLECTION_SCHEDULE = timeToCron(PHASE1_DATA_COLLECTION_TIME);
const PHASE1_SHAREHOLDERS_SCHEDULE = timeToCron(PHASE1_SHAREHOLDERS_TIME);
const PHASE2_MARKET_ROTATION_SCHEDULE = timeToCron(PHASE2_MARKET_ROTATION_TIME);
const PHASE3_LIGHT_SCHEDULE = timeToCron(PHASE3_LIGHT_TIME);

let schedulerRunning = false;
let scheduledTasks: any[] = [];
const trendFilterService = new TrendFilterDataScheduler();
const accumulationService = new AccumulationDataScheduler();
const bidAskService = new BidAskDataScheduler();
const brokerDataService = new BrokerDataScheduler();
const brokerInventoryService = new BrokerInventoryDataScheduler();
const foreignFlowService = new ForeignFlowDataScheduler();
const moneyFlowService = new MoneyFlowDataScheduler();
const breakDoneTradeService = new BreakDoneTradeDataScheduler();

// Memory monitoring variables
let memoryMonitorInterval: NodeJS.Timeout | null = null;

/**
 * Monitor memory usage and force cleanup if needed
 */
async function monitorMemoryUsage(): Promise<boolean> {
  const memUsage = process.memoryUsage();
  const usedMB = memUsage.heapUsed / 1024 / 1024;
  const totalMB = memUsage.heapTotal / 1024 / 1024;
  const usedGB = usedMB / 1024;
  const totalGB = totalMB / 1024;
  
  // Get Node.js memory limit (8GB from NODE_OPTIONS)
  const maxOldSpaceSize = process.env['NODE_OPTIONS']?.includes('--max-old-space-size=') 
    ? parseInt(process.env['NODE_OPTIONS'].split('--max-old-space-size=')[1]?.split(' ')[0] || '0') 
    : 0;
  const maxGB = maxOldSpaceSize / 1024;
  
  console.log(`📊 Memory Usage: ${usedMB.toFixed(2)}MB / ${totalMB.toFixed(2)}MB (${usedGB.toFixed(2)}GB / ${totalGB.toFixed(2)}GB allocated)`);
  console.log(`🔧 Node.js Memory Limit: ${maxOldSpaceSize}MB (${maxGB.toFixed(1)}GB)`);
  
  // If memory usage > 6GB, force cleanup
  if (usedMB > 6000) {
    console.log('⚠️ High memory usage detected, forcing aggressive cleanup...');
    await aggressiveMemoryCleanup();
    return false; // Skip next calculation
  }
  
  return true;
}

/**
 * Aggressive memory cleanup
 */
async function aggressiveMemoryCleanup(): Promise<void> {
  console.log('🧹 Starting aggressive memory cleanup...');
  
  // Force garbage collection multiple times
  for (let i = 0; i < 5; i++) {
    if (global.gc) {
      global.gc();
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Clear any cached data
  if (global.gc) {
    global.gc();
  }
  
  console.log('✅ Aggressive memory cleanup completed');
}

/**
 * Run Phase 4 - Medium Calculations (Bid/Ask Footprint)
 */
async function runPhase4MediumCalculations(): Promise<void> {
  const phaseStartTime = new Date();
  console.log(`\n🚀 ===== PHASE 4 MEDIUM CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
  console.log(`📋 Phase: Medium Calculations (Bid/Ask Footprint)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  
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
    
    const result = await bidAskService.generateBidAskData('all');
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
    
    console.log(`\n📊 ===== PHASE 4 MEDIUM COMPLETED =====`);
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
        current_processing: `Phase 4 Medium complete: Bid/Ask Footprint ${result.success ? 'successful' : 'failed'} in ${totalDuration}s`
      });
    }
    
    // Cleanup after Phase 4
    await aggressiveMemoryCleanup();
    
    // Stop memory monitoring for this phase
    stopMemoryMonitoring();
    
    // Trigger Phase 5 automatically if Phase 4 succeeded
    if (result.success) {
      console.log('🔄 Triggering Phase 5 Heavy calculations...');
      await runPhase5HeavyCalculations();
    } else {
      console.log('⚠️ Skipping Phase 5 due to Phase 4 failure');
    }
    
  } catch (error) {
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
  const phaseStartTime = new Date();
  console.log(`\n🚀 ===== PHASE 5 HEAVY CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
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
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
    
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
  const phaseStartTime = new Date();
  console.log(`\n🚀 ===== PHASE 6 VERY HEAVY CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
  console.log(`📋 Phase: Very Heavy Calculations (Broker Inventory, Accumulation Distribution)`);
  
  // Start memory monitoring for this phase
  startMemoryMonitoring();
  
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
        }
      } catch (error) {
        const calcDuration = Math.round((Date.now() - calcStartTime) / 1000);
        console.error(`❌ ${calc.name} error in ${calcDuration}s:`, error);
      }
      
      totalCalculations++;
      
      // Force aggressive garbage collection after each calculation
      await aggressiveMemoryCleanup();
      
      // Longer delay between calculations for very heavy operations
      if (totalCalculations < veryHeavyCalculations.length) {
        console.log('⏳ Waiting 10s before next calculation...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
    
    console.log(`\n📊 ===== PHASE 6 VERY HEAVY COMPLETED =====`);
    console.log(`✅ Success: ${totalSuccessCount}/${totalCalculations} calculations`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      await SchedulerLogService.updateLog(logEntry.id!, {
        status: totalSuccessCount === totalCalculations ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_files_processed: totalCalculations,
        files_created: totalSuccessCount,
        files_failed: totalCalculations - totalSuccessCount,
        progress_percentage: 100,
        current_processing: `Phase 6 Very Heavy complete: ${totalSuccessCount}/${totalCalculations} calculations successful in ${totalDuration}s`
      });
    }
    
    console.log(`\n🎉 ===== ALL PHASES COMPLETED =====`);
    console.log(`📊 Total time from Phase 1 start: Check individual phase logs`);
    
    // Stop memory monitoring after all phases complete
    stopMemoryMonitoring();
    
  } catch (error) {
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
    const phaseStartTime = new Date();
    console.log(`\n🚀 ===== PHASE 1 DATA COLLECTION STARTED =====`);
    console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
    console.log(`📋 Phase: Data Collection (Stock, Index, Done Summary) - 7 days`);
    
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
      
      console.log('🔄 Starting Phase 1 Data Collection (PARALLEL MODE)...');
      
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
          await task.service();
          const duration = Date.now() - startTime;
          
          console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
          return { name: task.name, success: true, duration };
    } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ ${task.name} error:`, errorMessage);
          return { name: task.name, success: false, error: errorMessage, duration };
        }
      });
      
      const dataCollectionResults = await Promise.allSettled(dataCollectionPromises);
      const successCount = dataCollectionResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      
      const phaseEndTime = new Date();
      const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
      
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
    const phaseStartTime = new Date();
    console.log(`\n🚀 ===== PHASE 1 SHAREHOLDERS & HOLDING STARTED =====`);
    console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
    console.log(`📋 Phase: Shareholders & Holding (Monthly check)`);
    
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
            if (task.method) {
              const result = await (task.service as any)[task.method]();
              const duration = Date.now() - startTime;
              
              if (result.success) {
                console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
                return { name: task.name, success: true, duration };
              } else {
                console.error(`❌ ${task.name} failed:`, result.message);
                return { name: task.name, success: false, error: result.message, duration };
              }
            } else {
              await task.service();
              const duration = Date.now() - startTime;
              console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
              return { name: task.name, success: true, duration };
            }
    } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ ${task.name} error:`, errorMessage);
            return { name: task.name, success: false, error: errorMessage, duration };
          }
        });
        
        const shareholdersHoldingResults = await Promise.allSettled(shareholdersHoldingPromises);
        const successCount = shareholdersHoldingResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
        
        const phaseEndTime = new Date();
        const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
        
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
        console.log('📅 Not last day of month - skipping Shareholders & Holding updates');
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

  // 3. Schedule Phase 2 - Market Rotation (RRC, RRG, Seasonal, Trend Filter)
  const phase2MarketRotationTask = cron.schedule(PHASE2_MARKET_ROTATION_SCHEDULE, async () => {
    const phaseStartTime = new Date();
    console.log(`\n🚀 ===== PHASE 2 MARKET ROTATION STARTED =====`);
    console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
    console.log(`📋 Phase: Market Rotation (RRC, RRG, Seasonal, Trend Filter)`);
    
    let logEntry: SchedulerLog | null = null;
    
    try {
      // Check memory before starting
      const memoryOk = await monitorMemoryUsage();
      if (!memoryOk) {
        console.log('⚠️ Skipping Phase 2 Market Rotation due to high memory usage');
        return;
      }

      // Create database log entry
      const logData: Partial<SchedulerLog> = {
        feature_name: 'phase2_market_rotation',
        trigger_type: 'scheduled',
        triggered_by: 'scheduler',
        status: 'running',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
        console.log('📊 Phase 2 Market Rotation database log created:', logEntry.id);
      }
      
      console.log('🔄 Starting Phase 2 Market Rotation (PARALLEL MODE)...');
      
      // Run market rotation calculations in parallel
      const marketRotationTasks = [
        { name: 'RRC Calculation', service: forceRegenerateRRC, method: null },
        { name: 'RRG Calculation', service: forceRegenerateRRG, method: null },
        { name: 'Seasonal Calculation', service: forceRegenerateSeasonal, method: null },
        { name: 'Trend Filter Calculation', service: trendFilterService, method: 'generateTrendFilterData' }
      ];
      
      const marketRotationPromises = marketRotationTasks.map(async (task, index) => {
        const startTime = Date.now();
        try {
          console.log(`🔄 Starting ${task.name} (${index + 1}/4)...`);
          if (task.method) {
            const result = await (task.service as any)[task.method]();
            const duration = Date.now() - startTime;
            
            if (result.success) {
              console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
              return { name: task.name, success: true, duration };
            } else {
              console.error(`❌ ${task.name} failed:`, result.message);
              return { name: task.name, success: false, error: result.message, duration };
            }
          } else {
            if (typeof task.service === 'function') {
              await task.service();
            } else if (task.method) {
              await (task.service as any)[task.method]();
            } else {
              throw new Error(`No method specified for ${task.name}`);
            }
            const duration = Date.now() - startTime;
            console.log(`✅ ${task.name} completed in ${Math.round(duration / 1000)}s`);
            return { name: task.name, success: true, duration };
          }
    } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ ${task.name} error:`, errorMessage);
          return { name: task.name, success: false, error: errorMessage, duration };
        }
      });
      
      const marketRotationResults = await Promise.allSettled(marketRotationPromises);
      const successCount = marketRotationResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      
      const phaseEndTime = new Date();
      const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
      
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
      
    } catch (error) {
      console.error('❌ Error during Phase 2 Market Rotation:', error);
      
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(phase2MarketRotationTask);

  // 4. Schedule Phase 3 - Light Calculations (Money Flow, Foreign Flow, Break Done Trade)
  const phase3LightTask = cron.schedule(PHASE3_LIGHT_SCHEDULE, async () => {
    const phaseStartTime = new Date();
    console.log(`\n🚀 ===== PHASE 3 LIGHT CALCULATIONS STARTED =====`);
    console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
    console.log(`📋 Phase: Light Calculations (Money Flow, Foreign Flow, Break Done Trade)`);
    
    let logEntry: SchedulerLog | null = null;
    
    try {
      // Check memory before starting
      const memoryOk = await monitorMemoryUsage();
      if (!memoryOk) {
        console.log('⚠️ Skipping Phase 3 Light due to high memory usage');
        return;
      }
      
      // Pre-flight checks
      console.log('🔍 Running pre-flight checks...');
      const preflightResults = await runPreflightChecks();
      if (!preflightResults.success) {
        console.error('❌ Pre-flight checks failed:', preflightResults.message);
        return;
      }
      
      const availableDates = preflightResults.availableDates || [];
      console.log(`📅 Processing ${availableDates.length} available dates for Phase 3 Light calculations`);
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
        feature_name: 'phase3_light_calculations',
        trigger_type: 'scheduled',
        triggered_by: 'scheduler',
        status: 'running',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
        console.log('📊 Phase 3 Light database log created:', logEntry.id);
      }
      
      console.log('🔄 Starting Phase 3 Light calculations (PARALLEL MODE - Safe for 8GB RAM)...');
      
      // Run light calculations in parallel (safe for memory)
      const lightCalculations = [
        { name: 'Money Flow', service: moneyFlowService, method: 'generateMoneyFlowData' },
        { name: 'Foreign Flow', service: foreignFlowService, method: 'generateForeignFlowData' },
        { name: 'Break Done Trade', service: breakDoneTradeService, method: 'generateBreakDoneTradeData' }
      ];
      
      const lightPromises = lightCalculations.map(async (calc, index) => {
        const startTime = Date.now();
        try {
          console.log(`🔄 Starting ${calc.name} (${index + 1}/3)...`);
          const result = await (calc.service as any)[calc.method]('all');
          const duration = Date.now() - startTime;
          
          if (result.success) {
            console.log(`✅ ${calc.name} completed in ${Math.round(duration / 1000)}s`);
            return { name: calc.name, success: true, duration };
          } else {
            console.error(`❌ ${calc.name} failed:`, result.message);
            return { name: calc.name, success: false, error: result.message, duration };
          }
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ ${calc.name} error:`, errorMessage);
          return { name: calc.name, success: false, error: errorMessage, duration };
        }
      });
      
      const lightResults = await Promise.allSettled(lightPromises);
      const successCount = lightResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      
      const phaseEndTime = new Date();
      const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
      
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
      
      // Trigger Phase 4 automatically after Phase 3 completes
      if (successCount >= 2) { // Trigger Phase 4 if at least 2/3 succeed
        console.log('🔄 Triggering Phase 4 Medium calculations...');
        await runPhase4MediumCalculations();
      } else {
        console.log('⚠️ Skipping Phase 4 due to insufficient Phase 3 success rate');
      }
      
    } catch (error) {
      console.error('❌ Error during Phase 3 Light calculations:', error);
      
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(phase3LightTask);

  // Phase 4, 5, 6 will be triggered automatically by previous phase

  // Initialize Azure logging
  initializeAzureLogging().catch(console.error);
  
  // Log memory configuration
  const nodeOptions = process.env['NODE_OPTIONS'] || 'Not set';
  console.log(`\n🔧 Node.js Memory Configuration:`);
  console.log(`  NODE_OPTIONS: ${nodeOptions}`);
  console.log(`  Max Old Space Size: ${nodeOptions.includes('--max-old-space-size=') ? nodeOptions.split('--max-old-space-size=')[1]?.split(' ')[0] + 'MB' : 'Default (1.4GB)'}`);
  console.log(`  Garbage Collection: ${nodeOptions.includes('--expose-gc') ? 'Enabled' : 'Disabled'}`);
  
  // Log scheduler configuration
  console.log(`\n📅 Scheduler Configuration (${TIMEZONE}) - OPTIMIZED FOR 8GB RAM:`);
  console.log(`  🚀 Phase 1 Data Collection (PARALLEL): ${PHASE1_DATA_COLLECTION_TIME} daily (SCHEDULED)`);
  console.log(`    └─ Stock Data, Index Data, Done Summary Data (7 days)`);
  console.log(`  🚀 Phase 1 Shareholders & Holding (PARALLEL): ${PHASE1_SHAREHOLDERS_TIME} daily (SCHEDULED)`);
  console.log(`    └─ Shareholders Data, Holding Data (Monthly check)`);
  console.log(`  🚀 Phase 2 Market Rotation (PARALLEL): ${PHASE2_MARKET_ROTATION_TIME} daily (SCHEDULED)`);
  console.log(`    └─ RRC, RRG, Seasonal, Trend Filter`);
  console.log(`  🚀 Phase 3 Light (PARALLEL): ${PHASE3_LIGHT_TIME} daily (SCHEDULED)`);
  console.log(`    └─ Money Flow, Foreign Flow, Break Done Trade`);
  console.log(`  🚀 Phase 4 Medium (SEQUENTIAL): Auto-triggered after Phase 3`);
  console.log(`    └─ Bid/Ask Footprint (all dates)`);
  console.log(`  🚀 Phase 5 Heavy (SEQUENTIAL): Auto-triggered after Phase 4`);
  console.log(`    └─ Broker Data (all dates)`);
  console.log(`  🚀 Phase 6 Very Heavy (SEQUENTIAL): Auto-triggered after Phase 5`);
  console.log(`    └─ Broker Inventory, Accumulation Distribution (sequential)`);
  console.log(`  🧠 Memory Monitoring: ENABLED (6GB threshold)`);
  console.log(`  🧹 Aggressive Cleanup: After each calculation`);
  console.log(`  ⏭️  Weekend updates: ENABLED (Sat/Sun)\n`);

  schedulerRunning = true;
  console.log('✅ Scheduler started successfully');
}

/**
 * Run Phase 2 - Medium Calculations (Bid/Ask Footprint)
 */
export async function runPhase2MediumCalculations(): Promise<void> {
  const phaseStartTime = new Date();
  console.log(`\n🚀 ===== PHASE 2 MEDIUM CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
  console.log(`📋 Phase: Medium Calculations (Bid/Ask Footprint)`);
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 2 Medium due to high memory usage');
      return;
    }
    
    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase2_medium_calculations',
      trigger_type: 'scheduled',
      triggered_by: 'phase1',
      status: 'running',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 2 Medium database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Bid/Ask Footprint calculation...');
    
    const result = await bidAskService.generateBidAskData('all');
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
    
    console.log(`\n📊 ===== PHASE 2 MEDIUM COMPLETED =====`);
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
        current_processing: `Phase 2 Medium complete: Bid/Ask Footprint ${result.success ? 'successful' : 'failed'} in ${totalDuration}s`
      });
    }
    
    // Cleanup after Phase 2
    await aggressiveMemoryCleanup();
    
    // Trigger Phase 3 automatically if Phase 2 succeeded
      if (result.success) {
      console.log('🔄 Triggering Phase 3 Heavy calculations...');
      await runPhase3HeavyCalculations();
      } else {
      console.log('⚠️ Skipping Phase 3 due to Phase 2 failure');
      }
      
    } catch (error) {
    console.error('❌ Error during Phase 2 Medium calculations:', error);
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  }
}

/**
 * Run Phase 3 - Heavy Calculations (Broker Data)
 */
export async function runPhase3HeavyCalculations(): Promise<void> {
  const phaseStartTime = new Date();
  console.log(`\n🚀 ===== PHASE 3 HEAVY CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
  console.log(`📋 Phase: Heavy Calculations (Broker Data)`);
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 3 Heavy due to high memory usage');
      return;
    }
    
    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase3_heavy_calculations',
      trigger_type: 'scheduled',
      triggered_by: 'phase2',
      status: 'running',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 3 Heavy database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Broker Data calculation...');
    
    const result = await brokerDataService.generateBrokerData('all');
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
    
    console.log(`\n📊 ===== PHASE 3 HEAVY COMPLETED =====`);
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
        current_processing: `Phase 3 Heavy complete: Broker Data ${result.success ? 'successful' : 'failed'} in ${totalDuration}s`
      });
    }
    
    // Cleanup after Phase 3
    await aggressiveMemoryCleanup();
    
    // Trigger Phase 4 automatically if Phase 3 succeeded
      if (result.success) {
      console.log('🔄 Triggering Phase 4 Very Heavy calculations...');
      await runPhase4VeryHeavyCalculations();
      } else {
      console.log('⚠️ Skipping Phase 4 due to Phase 3 failure');
      }
      
    } catch (error) {
    console.error('❌ Error during Phase 3 Heavy calculations:', error);
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  }
}

/**
 * Run Phase 4 - Very Heavy Calculations (Broker Inventory, Accumulation Distribution)
 */
export async function runPhase4VeryHeavyCalculations(): Promise<void> {
  const phaseStartTime = new Date();
  console.log(`\n🚀 ===== PHASE 4 VERY HEAVY CALCULATIONS STARTED =====`);
  console.log(`🕐 Start Time: ${phaseStartTime.toISOString()}`);
  console.log(`📋 Phase: Very Heavy Calculations (Broker Inventory, Accumulation Distribution)`);
  
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Check memory before starting
    const memoryOk = await monitorMemoryUsage();
    if (!memoryOk) {
      console.log('⚠️ Skipping Phase 4 Very Heavy due to high memory usage');
      return;
    }
    
    // Create database log entry
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase4_very_heavy_calculations',
      trigger_type: 'scheduled',
      triggered_by: 'phase3',
      status: 'running',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 4 Very Heavy database log created:', logEntry.id);
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
        }
      } catch (error) {
        const calcDuration = Math.round((Date.now() - calcStartTime) / 1000);
        console.error(`❌ ${calc.name} error in ${calcDuration}s:`, error);
      }
      
      totalCalculations++;
      
      // Force aggressive garbage collection after each calculation
      await aggressiveMemoryCleanup();
      
      // Longer delay between calculations for very heavy operations
      if (totalCalculations < veryHeavyCalculations.length) {
        console.log('⏳ Waiting 10s before next calculation...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    const phaseEndTime = new Date();
    const totalDuration = Math.round((phaseEndTime.getTime() - phaseStartTime.getTime()) / 1000);
    
    console.log(`\n📊 ===== PHASE 4 VERY HEAVY COMPLETED =====`);
    console.log(`✅ Success: ${totalSuccessCount}/${totalCalculations} calculations`);
    console.log(`🕐 End Time: ${phaseEndTime.toISOString()}`);
    console.log(`⏱️ Total Duration: ${totalDuration}s`);
    
    // Update database log
    if (logEntry) {
      await SchedulerLogService.updateLog(logEntry.id!, {
        status: totalSuccessCount === totalCalculations ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_files_processed: totalCalculations,
        files_created: totalSuccessCount,
        files_failed: totalCalculations - totalSuccessCount,
        progress_percentage: 100,
        current_processing: `Phase 4 Very Heavy complete: ${totalSuccessCount}/${totalCalculations} calculations successful in ${totalDuration}s`
      });
    }
    
    console.log(`\n🎉 ===== ALL PHASES COMPLETED =====`);
    console.log(`📊 Total time from Phase 1 start: Check individual phase logs`);
    
  } catch (error) {
    console.error('❌ Error during Phase 4 Very Heavy calculations:', error);
    
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  }
}

/**
 * Start memory monitoring (only during active calculations)
 */
function startMemoryMonitoring(): void {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }
  
  memoryMonitorInterval = setInterval(async () => {
    await monitorMemoryUsage();
  }, SCHEDULER_CONFIG.MEMORY_CLEANUP_INTERVAL);
  
  console.log('🧠 Memory monitoring started (active calculations only)');
}

/**
 * Stop memory monitoring (when no calculations running)
 */
function stopMemoryMonitoring(): void {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
    memoryMonitorInterval = null;
    console.log('🧠 Memory monitoring stopped');
  }
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (!schedulerRunning) {
    console.log('⚠️ Scheduler not running');
    return;
  }

  // Stop memory monitoring
  stopMemoryMonitoring();

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
 * Run pre-flight checks to ensure data availability
 */
async function runPreflightChecks(): Promise<{ success: boolean; message: string; availableDates?: string[] }> {
  try {
    console.log('🔍 Checking data availability...');
    
    // Check if DT files exist (any date)
    const { listPaths } = await import('../utils/azureBlob');
    const dtFiles = await listPaths({ prefix: 'done-summary' });
    
    // Look for DT files in any date folder, not just today
    const dtFilePattern = /DT\d{6}\.csv$/;
    const availableDtFiles = dtFiles.filter(file => dtFilePattern.test(file));
    
    if (availableDtFiles.length === 0) {
      return {
        success: false,
        message: `No DT files found. Available files: ${dtFiles.slice(0, 5).join(', ')}...`
      };
    }
    
    // Check if OHLC data exists
    const ohlcFiles = await listPaths({ prefix: 'stock' });
    if (ohlcFiles.length === 0) {
      return {
        success: false,
        message: 'No OHLC data available for calculations'
      };
    }
    
    // Extract available dates from DT files and convert to full format
    const availableDates = availableDtFiles.map(file => {
      const match = file.match(/DT(\d{6})\.csv$/);
      if (match) {
        const yyMMdd = match[1];
        // Convert YYMMDD to YYYYMMDD (assume 20xx)
        return `20${yyMMdd}`;
      }
      return null;
    }).filter(date => date !== null) as string[];
    
    console.log(`✅ Pre-flight checks passed - Found ${availableDtFiles.length} DT files and ${ohlcFiles.length} OHLC files`);
    console.log(`📅 Available dates: ${availableDates.slice(0, 5).join(', ')}${availableDates.length > 5 ? '...' : ''}`);
    
    return { 
      success: true, 
      message: 'All pre-flight checks passed',
      availableDates: availableDates
    };
    
  } catch (error) {
    console.error('❌ Pre-flight check error:', error);
    return {
      success: false,
      message: `Pre-flight check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}


/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    running: schedulerRunning,
    timezone: TIMEZONE,
    memoryMonitoring: memoryMonitorInterval !== null,
    schedules: {
      phase1DataCollection: PHASE1_DATA_COLLECTION_TIME,
      phase1Shareholders: PHASE1_SHAREHOLDERS_TIME,
      phase2MarketRotation: PHASE2_MARKET_ROTATION_TIME,
      phase3Light: PHASE3_LIGHT_TIME,
      phase4Medium: 'Auto-triggered after Phase 3',
      phase5Heavy: 'Auto-triggered after Phase 4',
      phase6VeryHeavy: 'Auto-triggered after Phase 5'
    },
    memoryThreshold: '6GB',
    weekendSkip: false
  };
}
