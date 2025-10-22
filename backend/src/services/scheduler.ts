// scheduler.ts
// Scheduled tasks for data updates and calculations

import cron from 'node-cron';
import { forceRegenerate, getGenerationStatus } from './rrcDataScheduler';
import { forceRegenerate as forceRegenerateRRG, getGenerationStatus as getGenerationStatusRRG } from './rrgDataScheduler';
import { forceRegenerate as forceRegenerateSeasonal, getGenerationStatus as getGenerationStatusSeasonal } from './seasonalityDataScheduler';
import TrendFilterDataScheduler from './trendFilterDataScheduler';
import { generateRrgStockScanner } from '../calculations/rrg/rrg_scanner_stock';
import { generateRrgSectorScanner } from '../calculations/rrg/rrg_scanner_sector';
import AccumulationDataScheduler from './accumulationDataScheduler';
import BidAskDataScheduler from './bidAskDataScheduler';
import BrokerDataScheduler from './brokerDataScheduler';
import BrokerInventoryDataScheduler from './brokerInventoryDataScheduler';
import ForeignFlowDataScheduler from './foreignFlowDataScheduler';
import MoneyFlowDataScheduler from './moneyFlowDataScheduler';
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
  // Data Update Times
  STOCK_UPDATE_TIME: '11:17',
  INDEX_UPDATE_TIME: '11:17', 
  DONE_SUMMARY_UPDATE_TIME: '11:17',
  SHAREHOLDERS_UPDATE_TIME: '00:00', // Monthly (last day)
  HOLDING_UPDATE_TIME: '00:00', // Monthly (last day)
  
  // Calculation Times
  RRC_UPDATE_TIME: '13:31',
  RRG_UPDATE_TIME: '13:31',
  SEASONAL_UPDATE_TIME: '13:31',
  TREND_FILTER_UPDATE_TIME: '13:31',
  
  // Phase-based Calculation Times
  PHASE1_UPDATE_TIME: '13:51', // Broker Data, Bid/Ask, Money Flow, Foreign Flow
  // Phase 2 is triggered automatically when Phase 1 completes
  
  // Timezone
  TIMEZONE: 'Asia/Jakarta'
};

// Extract times for backward compatibility
const STOCK_UPDATE_TIME = SCHEDULER_CONFIG.STOCK_UPDATE_TIME;
const INDEX_UPDATE_TIME = SCHEDULER_CONFIG.INDEX_UPDATE_TIME;
const DONE_SUMMARY_UPDATE_TIME = SCHEDULER_CONFIG.DONE_SUMMARY_UPDATE_TIME;
const RRC_UPDATE_TIME = SCHEDULER_CONFIG.RRC_UPDATE_TIME;
const RRG_UPDATE_TIME = SCHEDULER_CONFIG.RRG_UPDATE_TIME;
const SEASONAL_UPDATE_TIME = SCHEDULER_CONFIG.SEASONAL_UPDATE_TIME;
const TREND_FILTER_UPDATE_TIME = SCHEDULER_CONFIG.TREND_FILTER_UPDATE_TIME;
const PHASE1_UPDATE_TIME = SCHEDULER_CONFIG.PHASE1_UPDATE_TIME;
const TIMEZONE = SCHEDULER_CONFIG.TIMEZONE;

// Convert time to cron format (HH:MM -> MM HH * * *)
function timeToCron(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${minutes} ${hours} * * *`;
}

// Generate cron schedules from configuration
const STOCK_UPDATE_SCHEDULE = timeToCron(STOCK_UPDATE_TIME);
const INDEX_UPDATE_SCHEDULE = timeToCron(INDEX_UPDATE_TIME);
const DONE_SUMMARY_UPDATE_SCHEDULE = timeToCron(DONE_SUMMARY_UPDATE_TIME);
const SHAREHOLDERS_UPDATE_SCHEDULE = timeToCron(SCHEDULER_CONFIG.SHAREHOLDERS_UPDATE_TIME);
const HOLDING_UPDATE_SCHEDULE = timeToCron(SCHEDULER_CONFIG.HOLDING_UPDATE_TIME);
const RRC_UPDATE_SCHEDULE = timeToCron(RRC_UPDATE_TIME);
const RRG_UPDATE_SCHEDULE = timeToCron(RRG_UPDATE_TIME);
const SEASONAL_UPDATE_SCHEDULE = timeToCron(SEASONAL_UPDATE_TIME);
const TREND_FILTER_UPDATE_SCHEDULE = timeToCron(TREND_FILTER_UPDATE_TIME);
const PHASE1_UPDATE_SCHEDULE = timeToCron(PHASE1_UPDATE_TIME);

let schedulerRunning = false;
let scheduledTasks: any[] = [];
const trendFilterService = new TrendFilterDataScheduler();
const accumulationService = new AccumulationDataScheduler();
const bidAskService = new BidAskDataScheduler();
const brokerDataService = new BrokerDataScheduler();
const brokerInventoryService = new BrokerInventoryDataScheduler();
const foreignFlowService = new ForeignFlowDataScheduler();
const moneyFlowService = new MoneyFlowDataScheduler();

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  if (schedulerRunning) {
    console.log('⚠️ Scheduler already running');
    return;
  }

  console.log('🕐 Starting scheduler...');

  // 1. Schedule Stock Data Update
  const stockTask = cron.schedule(STOCK_UPDATE_SCHEDULE, async () => {
    console.log(`🕐 Scheduled stock data update triggered at ${STOCK_UPDATE_TIME}`);
    
    try {
      console.log('🔄 Starting scheduled stock data update...');
      await updateStockData();
      console.log('✅ Scheduled stock data update completed');
    } catch (error) {
      console.error('❌ Error during scheduled stock update:', error);
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(stockTask);

  // 2. Schedule Index Data Update
  const indexTask = cron.schedule(INDEX_UPDATE_SCHEDULE, async () => {
    console.log(`🕐 Scheduled index data update triggered at ${INDEX_UPDATE_TIME}`);
    
    try {
      console.log('🔄 Starting scheduled index data update...');
      await updateIndexData();
      console.log('✅ Scheduled index data update completed');
    } catch (error) {
      console.error('❌ Error during scheduled index update:', error);
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(indexTask);

  // 3. Schedule Done Summary Data Update
  const doneSummaryTask = cron.schedule(DONE_SUMMARY_UPDATE_SCHEDULE, async () => {
    console.log(`🕐 Scheduled done summary data update triggered at ${DONE_SUMMARY_UPDATE_TIME}`);
    
    try {
      console.log('🔄 Starting scheduled done summary data update...');
      await updateDoneSummaryData();
      console.log('✅ Scheduled done summary data update completed');
    } catch (error) {
      console.error('❌ Error during scheduled done summary update:', error);
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(doneSummaryTask);

  // 4. Schedule Shareholders Data Update (Monthly - last day of month)
  const shareholdersTask = cron.schedule(SHAREHOLDERS_UPDATE_SCHEDULE, async () => {
    // Check if today is the last day of the month
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (today.getMonth() !== tomorrow.getMonth()) {
      console.log(`🕐 Scheduled shareholders data update triggered (last day of month)`);
      
      try {
        console.log('🔄 Starting scheduled shareholders data update...');
        await updateShareholdersData();
        console.log('✅ Scheduled shareholders data update completed');
      } catch (error) {
        console.error('❌ Error during scheduled shareholders update:', error);
      }
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(shareholdersTask);

  // 5. Schedule Holding Data Update (Monthly - last day of month)
  const holdingTask = cron.schedule(HOLDING_UPDATE_SCHEDULE, async () => {
    // Check if today is the last day of the month
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (today.getMonth() !== tomorrow.getMonth()) {
      console.log(`🕐 Scheduled holding data update triggered (last day of month)`);
      
      try {
        console.log('🔄 Starting scheduled holding data update...');
        await updateHoldingData();
        console.log('✅ Scheduled holding data update completed');
      } catch (error) {
        console.error('❌ Error during scheduled holding update:', error);
      }
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(holdingTask);

  // 6. Schedule RRC calculation
  const rrcTask = cron.schedule(RRC_UPDATE_SCHEDULE, async () => {
    console.log(`🕐 Scheduled RRC calculation triggered at ${RRC_UPDATE_TIME}`);
    
    try {
      const status = getGenerationStatus();
      if (status.isGenerating) {
        console.log('⚠️ RRC generation already in progress, skipping');
        return;
      }

      console.log('🔄 Starting scheduled RRC calculation...');
      await forceRegenerate();
      console.log('✅ Scheduled RRC calculation completed');
    } catch (error) {
      console.error('❌ Error during scheduled RRC calculation:', error);
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(rrcTask);

  // 7. Schedule RRG calculation and scanners
  const rrgTask = cron.schedule(RRG_UPDATE_SCHEDULE, async () => {
    console.log(`🕐 Scheduled RRG calculation triggered at ${RRG_UPDATE_TIME}`);
    
    try {
      const status = getGenerationStatusRRG();
      if (status.isGenerating) {
        console.log('⚠️ RRG generation already in progress, skipping');
        return;
      }

      console.log('🔄 Starting scheduled RRG calculation...');
      await forceRegenerateRRG();
      console.log('✅ Scheduled RRG calculation completed');
      
      // Run scanners after RRG calculation
      console.log('🔄 Starting RRG Stock Scanner...');
      await generateRrgStockScanner();
      console.log('✅ RRG Stock Scanner completed');
      
      console.log('🔄 Starting RRG Sector Scanner...');
      await generateRrgSectorScanner();
      console.log('✅ RRG Sector Scanner completed');
      
    } catch (error) {
      console.error('❌ Error during scheduled RRG calculation:', error);
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(rrgTask);

  // 8. Schedule Seasonality calculation
  const seasonalTask = cron.schedule(SEASONAL_UPDATE_SCHEDULE, async () => {
    console.log(`🕐 Scheduled Seasonality calculation triggered at ${SEASONAL_UPDATE_TIME}`);
    
    try {
      const status = getGenerationStatusSeasonal();
      if (status.isGenerating) {
        console.log('⚠️ Seasonality generation already in progress, skipping');
        return;
      }

      console.log('🔄 Starting scheduled Seasonality calculation...');
      await forceRegenerateSeasonal('scheduled');
      console.log('✅ Scheduled Seasonality calculation completed');
    } catch (error) {
      console.error('❌ Error during scheduled Seasonality calculation:', error);
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(seasonalTask);

  // 9. Schedule Trend Filter calculation
  const trendFilterTask = cron.schedule(TREND_FILTER_UPDATE_SCHEDULE, async () => {
    console.log(`🕐 Scheduled Trend Filter calculation triggered at ${TREND_FILTER_UPDATE_TIME}`);
    
    try {
      const status = trendFilterService.getStatus();
      if (status.isGenerating) {
        console.log('⚠️ Trend Filter generation already in progress, skipping');
        return;
      }

      console.log('🔄 Starting scheduled Trend Filter calculation...');
      await trendFilterService.generateTrendFilterData();
      console.log('✅ Scheduled Trend Filter calculation completed');
    } catch (error) {
      console.error('❌ Error during scheduled Trend Filter calculation:', error);
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(trendFilterTask);

  // 10. Schedule Phase 1 calculations (optimized parallel execution)
  const phase1Task = cron.schedule(PHASE1_UPDATE_SCHEDULE, async () => {
    console.log(`🕐 Scheduled Phase 1 calculations triggered at ${PHASE1_UPDATE_TIME}`);
    
    let logEntry: SchedulerLog | null = null;
    
    try {
      // Pre-flight checks - get all available dates
      console.log('🔍 Running pre-flight checks...');
      const preflightResults = await runPreflightChecks();
      if (!preflightResults.success) {
        console.error('❌ Pre-flight checks failed:', preflightResults.message);
        return;
      }
      
      const availableDates = preflightResults.availableDates || [];
      console.log(`📅 Processing ${availableDates.length} available dates for Phase 1 calculations`);
      
      // Create database log entry
      const logData: Partial<SchedulerLog> = {
        feature_name: 'phase1_calculations',
        trigger_type: 'scheduled',
        triggered_by: 'scheduler',
        status: 'running',
        started_at: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development'
      };
      
      logEntry = await SchedulerLogService.createLog(logData);
      if (logEntry) {
        console.log('📊 Phase 1 database log created:', logEntry.id);
      }
      
      console.log('🔄 Starting Phase 1 calculations (Broker Data, Bid/Ask, Money Flow, Foreign Flow)...');
      
      // Process all available dates
      let totalSuccessCount = 0;
      let totalCalculations = 0;
      
      for (const dateSuffix of availableDates) {
        console.log(`📅 Processing date: ${dateSuffix}`);
        
        // Run calculations with optimized parallel execution and progress tracking
        const phase1Results = await runOptimizedPhase1Calculations(dateSuffix, logEntry);
        
        const successCount = phase1Results.filter(r => r.success).length;
        totalSuccessCount += successCount;
        totalCalculations += 4; // 4 calculations per date
        
        console.log(`📊 Date ${dateSuffix}: ${successCount}/4 calculations successful`);
      }
      
      console.log(`📊 Phase 1 complete: ${totalSuccessCount}/${totalCalculations} calculations successful across ${availableDates.length} dates`);
      
      // Update database log
      if (logEntry) {
        await SchedulerLogService.updateLog(logEntry.id!, {
          status: totalSuccessCount === totalCalculations ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          total_files_processed: totalCalculations,
          files_created: totalSuccessCount,
          files_failed: totalCalculations - totalSuccessCount,
          progress_percentage: 100,
          current_processing: `Phase 1 complete: ${totalSuccessCount}/${totalCalculations} calculations successful across ${availableDates.length} dates`
        });
      }

      // Trigger Phase 2 immediately after Phase 1 completes
      if (totalSuccessCount >= totalCalculations * 0.75) { // Trigger Phase 2 if at least 75% succeed
        console.log('🔄 Triggering Phase 2 calculations (Broker Inventory, Accumulation Distribution)...');
        await runPhase2Calculations(availableDates);
      } else {
        console.log('⚠️ Skipping Phase 2 due to insufficient Phase 1 success rate');
      }
      
    } catch (error) {
      console.error('❌ Error during Phase 1 calculations:', error);
      
      // Mark as failed in database
      if (logEntry) {
        await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
      }
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(phase1Task);

  // Phase 2 calculations are now triggered automatically when Phase 1 completes

  // Initialize Azure logging
  initializeAzureLogging().catch(console.error);
  
  // Log scheduler configuration
  console.log(`\n📅 Scheduler Configuration (${TIMEZONE}):`);
  console.log(`  📊 Stock Data Update: ${STOCK_UPDATE_TIME} daily`);
  console.log(`  📈 Index Data Update: ${INDEX_UPDATE_TIME} daily`);
  console.log(`  📋 Done Summary Data Update: ${DONE_SUMMARY_UPDATE_TIME} daily`);
  console.log(`  👥 Shareholders Data Update: Monthly (last day at ${SCHEDULER_CONFIG.SHAREHOLDERS_UPDATE_TIME})`);
  console.log(`  💼 Holding Data Update: Monthly (last day at ${SCHEDULER_CONFIG.HOLDING_UPDATE_TIME})`);
  console.log(`  🔄 RRC Calculation: ${RRC_UPDATE_TIME} daily`);
  console.log(`  🔄 RRG Calculation + Scanners: ${RRG_UPDATE_TIME} daily`);
  console.log(`  🔄 Seasonality Calculation: ${SEASONAL_UPDATE_TIME} daily`);
  console.log(`  🔄 Trend Filter Calculation: ${TREND_FILTER_UPDATE_TIME} daily`);
  console.log(`  🔄 Phase 1 (Broker Data, Bid/Ask, Money Flow, Foreign Flow): ${PHASE1_UPDATE_TIME} daily`);
  console.log(`  🔄 Phase 2 (Broker Inventory, Accumulation Distribution): Triggered when Phase 1 completes`);
  console.log(`  ⏭️  Weekend updates: ENABLED (Sat/Sun)\n`);

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
    
    // Extract available dates from DT files
    const availableDates = availableDtFiles.map(file => {
      const match = file.match(/DT(\d{6})\.csv$/);
      return match ? match[1] : null;
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
 * Run optimized Phase 1 calculations with progress tracking and resource management
 */
async function runOptimizedPhase1Calculations(
  dateSuffix: string, 
  logEntry: SchedulerLog | null
): Promise<Array<{ name: string; success: boolean; error?: string; duration?: number }>> {
  const calculations = [
    { name: 'Broker Data', service: brokerDataService, method: 'generateBrokerData' },
    { name: 'Bid/Ask Footprint', service: bidAskService, method: 'generateBidAskData' },
    { name: 'Money Flow', service: moneyFlowService, method: 'generateMoneyFlowData' },
    { name: 'Foreign Flow', service: foreignFlowService, method: 'generateForeignFlowData' }
  ];
  
  const results: Array<{ name: string; success: boolean; error?: string; duration?: number }> = [];
  
  // Run calculations with timeout and progress tracking
  const calculationPromises = calculations.map(async (calc, index) => {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Starting ${calc.name} calculation (${index + 1}/4)...`);
      
      // Update progress in database
      if (logEntry) {
        await SchedulerLogService.updateLog(logEntry.id!, {
          progress_percentage: Math.round((index / 4) * 100),
          current_processing: `Running ${calc.name} calculation...`
        });
      }
      
      // Run calculation with timeout
      const result = await Promise.race([
        (calc.service as any)[calc.method](dateSuffix),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`${calc.name} calculation timeout`)), 15 * 60 * 1000) // 15 minutes timeout
        )
      ]);
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ ${calc.name} calculation completed in ${Math.round(duration / 1000)}s`);
        return { name: calc.name, success: true, duration };
      } else {
        console.error(`❌ ${calc.name} calculation failed:`, result.message);
        return { name: calc.name, success: false, error: result.message, duration };
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ ${calc.name} calculation failed:`, errorMessage);
      return { name: calc.name, success: false, error: errorMessage, duration };
    }
  });
  
  // Wait for all calculations to complete
  const calculationResults = await Promise.allSettled(calculationPromises);
  
  // Process results
  calculationResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        name: calculations[index]?.name || 'Unknown',
        success: false,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
      });
    }
  });
  
  // Force garbage collection after calculations
  if (global.gc) {
    global.gc();
  }
  
  return results;
}

/**
 * Run optimized Phase 2 calculations with progress tracking and resource management
 */
async function runOptimizedPhase2Calculations(
  dateSuffix: string, 
  logEntry: SchedulerLog | null
): Promise<Array<{ name: string; success: boolean; error?: string; duration?: number }>> {
  const calculations = [
    { name: 'Broker Inventory', service: brokerInventoryService, method: 'generateBrokerInventoryData' },
    { name: 'Accumulation Distribution', service: accumulationService, method: 'generateAccumulationData' }
  ];
  
  const results: Array<{ name: string; success: boolean; error?: string; duration?: number }> = [];
  
  // Run calculations with timeout and progress tracking
  const calculationPromises = calculations.map(async (calc, index) => {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Starting ${calc.name} calculation (${index + 1}/2)...`);
      
      // Update progress in database
      if (logEntry) {
        await SchedulerLogService.updateLog(logEntry.id!, {
          progress_percentage: Math.round((index / 2) * 100),
          current_processing: `Running ${calc.name} calculation...`
        });
      }
      
      // Run calculation with timeout
      const result = await Promise.race([
        (calc.service as any)[calc.method](dateSuffix),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`${calc.name} calculation timeout`)), 20 * 60 * 1000) // 20 minutes timeout
        )
      ]);
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ ${calc.name} calculation completed in ${Math.round(duration / 1000)}s`);
        return { name: calc.name, success: true, duration };
      } else {
        console.error(`❌ ${calc.name} calculation failed:`, result.message);
        return { name: calc.name, success: false, error: result.message, duration };
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ ${calc.name} calculation failed:`, errorMessage);
      return { name: calc.name, success: false, error: errorMessage, duration };
    }
  });
  
  // Wait for all calculations to complete
  const calculationResults = await Promise.allSettled(calculationPromises);
  
  // Process results
  calculationResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        name: calculations[index]?.name || 'Unknown',
        success: false,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
      });
    }
  });
  
  // Force garbage collection after calculations
  if (global.gc) {
    global.gc();
  }
  
  return results;
}

/**
 * Run Phase 2 calculations (called after Phase 1 completes)
 */
async function runPhase2Calculations(availableDates: string[]): Promise<void> {
  let logEntry: SchedulerLog | null = null;
  
  try {
    // Create database log entry for Phase 2
    const logData: Partial<SchedulerLog> = {
      feature_name: 'phase2_calculations',
      trigger_type: 'scheduled',
      triggered_by: 'scheduler',
      status: 'running',
      started_at: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development'
    };
    
    logEntry = await SchedulerLogService.createLog(logData);
    if (logEntry) {
      console.log('📊 Phase 2 database log created:', logEntry.id);
    }
    
    console.log('🔄 Starting Phase 2 calculations (Broker Inventory, Accumulation Distribution)...');
    
    // Process all available dates
    let totalSuccessCount = 0;
    let totalCalculations = 0;
    
    for (const dateSuffix of availableDates) {
      console.log(`📅 Processing date: ${dateSuffix}`);
      
      // Run optimized Phase 2 calculations
      const phase2Results = await runOptimizedPhase2Calculations(dateSuffix, logEntry);
      
      const successCount = phase2Results.filter(r => r.success).length;
      totalSuccessCount += successCount;
      totalCalculations += 2; // 2 calculations per date
      
      console.log(`📊 Date ${dateSuffix}: ${successCount}/2 calculations successful`);
    }
    
    console.log(`📊 Phase 2 complete: ${totalSuccessCount}/${totalCalculations} calculations successful across ${availableDates.length} dates`);
    
    // Update database log
    if (logEntry) {
      await SchedulerLogService.updateLog(logEntry.id!, {
        status: totalSuccessCount === totalCalculations ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_files_processed: totalCalculations,
        files_created: totalSuccessCount,
        files_failed: totalCalculations - totalSuccessCount,
        progress_percentage: 100,
        current_processing: `Phase 2 complete: ${totalSuccessCount}/${totalCalculations} calculations successful across ${availableDates.length} dates`
      });
    }
    
  } catch (error) {
    console.error('❌ Error during Phase 2 calculations:', error);
    
    // Mark as failed in database
    if (logEntry) {
      await SchedulerLogService.markFailed(logEntry.id!, error instanceof Error ? error.message : 'Unknown error', error);
    }
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    running: schedulerRunning,
    timezone: TIMEZONE,
    schedules: {
      stockUpdate: STOCK_UPDATE_TIME,
      indexUpdate: INDEX_UPDATE_TIME,
      doneSummaryUpdate: DONE_SUMMARY_UPDATE_TIME,
      shareholdersUpdate: 'Monthly (last day at 00:00)',
      holdingUpdate: 'Monthly (last day at 00:00)',
      rrcCalculation: RRC_UPDATE_TIME,
      rrgCalculation: RRG_UPDATE_TIME,
      phase1Calculation: PHASE1_UPDATE_TIME,
      phase2Calculation: 'Auto-triggered after Phase 1'
    },
    weekendSkip: false
  };
}
