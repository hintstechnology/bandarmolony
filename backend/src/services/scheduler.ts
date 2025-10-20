// scheduler.ts
// Scheduled tasks for data updates and calculations

import cron from 'node-cron';
import { forceRegenerate, getGenerationStatus } from './rrcAutoGenerate';
import { forceRegenerate as forceRegenerateRRG, getGenerationStatus as getGenerationStatusRRG } from './rrgAutoGenerate';
import { forceRegenerate as forceRegenerateSeasonal, getGenerationStatus as getGenerationStatusSeasonal } from './seasonalityAutoGenerate';
import TrendFilterAutoGenerateService from './trendFilterAutoGenerate';
import { generateRrgStockScanner } from '../calculations/rrg/rrg_scanner_stock';
import { generateRrgSectorScanner } from '../calculations/rrg/rrg_scanner_sector';
import AccumulationAutoGenerateService from './accumulationAutoGenerate';
import BidAskAutoGenerateService from './bidAskAutoGenerate';
import BrokerDataAutoGenerateService from './brokerDataAutoGenerate';
import BrokerInventoryAutoGenerateService from './brokerInventoryAutoGenerate';
import ForeignFlowAutoGenerateService from './foreignFlowAutoGenerate';
import MoneyFlowAutoGenerateService from './moneyFlowAutoGenerate';
import { SchedulerLogService, SchedulerLog } from './schedulerLogService';
import { updateDoneSummaryData } from './doneSummaryDataUpdateService';
import { updateStockData } from './stockDataUpdateService';
import { updateIndexData } from './indexDataUpdateService';
import { updateShareholdersData } from './shareholdersDataUpdateService';
import { updateHoldingData } from './holdingDataUpdateService';
import { initializeAzureLogging } from './azureLoggingService';

// Get schedule times from environment or use defaults
const STOCK_UPDATE_TIME = process.env['SCHEDULER_STOCK_UPDATE_TIME'] || '18:20';
const INDEX_UPDATE_TIME = process.env['SCHEDULER_INDEX_UPDATE_TIME'] || '18:20';
const DONE_SUMMARY_UPDATE_TIME = process.env['SCHEDULER_DONE_SUMMARY_UPDATE_TIME'] || '18:20';
const RRC_UPDATE_TIME = process.env['SCHEDULER_RRC_UPDATE_TIME'] || '18:40';
const RRG_UPDATE_TIME = process.env['SCHEDULER_RRG_UPDATE_TIME'] || '18:40';
const SEASONAL_UPDATE_TIME = process.env['SCHEDULER_SEASONAL_UPDATE_TIME'] || '18:40';
const TREND_FILTER_UPDATE_TIME = process.env['SCHEDULER_TREND_FILTER_UPDATE_TIME'] || '18:50';
const PHASE1_UPDATE_TIME = process.env['SCHEDULER_PHASE1_UPDATE_TIME'] || '19:00';
const TIMEZONE = process.env['SCHEDULER_TIMEZONE'] || 'Asia/Jakarta';

// Convert time to cron format (HH:MM -> MM HH * * *)
function timeToCron(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${minutes} ${hours} * * *`;
}

const STOCK_UPDATE_SCHEDULE = timeToCron(STOCK_UPDATE_TIME);
const INDEX_UPDATE_SCHEDULE = timeToCron(INDEX_UPDATE_TIME);
const DONE_SUMMARY_UPDATE_SCHEDULE = timeToCron(DONE_SUMMARY_UPDATE_TIME);
const SHAREHOLDERS_UPDATE_SCHEDULE = '0 0 * * *'; // Daily at 00:00, will check if last day of month
const HOLDING_UPDATE_SCHEDULE = '0 0 * * *'; // Daily at 00:00, will check if last day of month
const RRC_UPDATE_SCHEDULE = timeToCron(RRC_UPDATE_TIME);
const RRG_UPDATE_SCHEDULE = timeToCron(RRG_UPDATE_TIME);
const SEASONAL_UPDATE_SCHEDULE = timeToCron(SEASONAL_UPDATE_TIME);
const TREND_FILTER_UPDATE_SCHEDULE = timeToCron(TREND_FILTER_UPDATE_TIME);
const PHASE1_UPDATE_SCHEDULE = timeToCron(PHASE1_UPDATE_TIME);

let schedulerRunning = false;
let scheduledTasks: any[] = [];
const trendFilterService = new TrendFilterAutoGenerateService();
const accumulationService = new AccumulationAutoGenerateService();
const bidAskService = new BidAskAutoGenerateService();
const brokerDataService = new BrokerDataAutoGenerateService();
const brokerInventoryService = new BrokerInventoryAutoGenerateService();
const foreignFlowService = new ForeignFlowAutoGenerateService();
const moneyFlowService = new MoneyFlowAutoGenerateService();

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

  // 10. Schedule Phase 1 calculations (independent, can run in parallel)
  const phase1Task = cron.schedule(PHASE1_UPDATE_SCHEDULE, async () => {
    console.log(`🕐 Scheduled Phase 1 calculations triggered at ${PHASE1_UPDATE_TIME}`);
    
    let logEntry: SchedulerLog | null = null;
    
    try {
      const today = new Date();
      const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');
      
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
      
      // Run independent calculations in parallel
      const phase1Results = await Promise.allSettled([
        brokerDataService.generateBrokerData(dateSuffix),
        bidAskService.generateBidAskData(dateSuffix),
        moneyFlowService.generateMoneyFlowData(dateSuffix),
        foreignFlowService.generateForeignFlowData(dateSuffix)
      ]);
      
      // Log results
      const results = phase1Results.map((result, index) => {
        const names = ['Broker Data', 'Bid/Ask Footprint', 'Money Flow', 'Foreign Flow'];
        if (result.status === 'fulfilled' && result.value.success) {
          console.log(`✅ ${names[index]} calculation completed`);
          return { name: names[index], success: true };
        } else {
          const error = result.status === 'rejected' ? result.reason : result.value.message;
          console.error(`❌ ${names[index]} calculation failed:`, error);
          return { name: names[index], success: false, error };
        }
      });
      
      const successCount = results.filter(r => r.success).length;
      console.log(`📊 Phase 1 complete: ${successCount}/4 calculations successful`);
      
      // Update database log
      if (logEntry) {
        await SchedulerLogService.updateLog(logEntry.id!, {
          status: successCount === 4 ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          total_files_processed: 4,
          files_created: successCount,
          files_failed: 4 - successCount,
          progress_percentage: 100,
          current_processing: `Phase 1 complete: ${successCount}/4 calculations successful`
        });
      }

      // Trigger Phase 2 immediately after Phase 1 completes
      console.log('🔄 Triggering Phase 2 calculations (Broker Inventory, Accumulation Distribution)...');
      await runPhase2Calculations(dateSuffix);
      
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
  console.log(`  👥 Shareholders Data Update: Monthly (last day at 00:00)`);
  console.log(`  💼 Holding Data Update: Monthly (last day at 00:00)`);
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
 * Run Phase 2 calculations (called after Phase 1 completes)
 */
async function runPhase2Calculations(dateSuffix: string): Promise<void> {
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
    
    // Run dependent calculations in parallel
    const phase2Results = await Promise.allSettled([
      brokerInventoryService.generateBrokerInventoryData(dateSuffix),
      accumulationService.generateAccumulationData(dateSuffix)
    ]);
    
    // Log results
    const results = phase2Results.map((result, index) => {
      const names = ['Broker Inventory', 'Accumulation Distribution'];
      if (result.status === 'fulfilled' && result.value.success) {
        console.log(`✅ ${names[index]} calculation completed`);
        return { name: names[index], success: true };
      } else {
        const error = result.status === 'rejected' ? result.reason : result.value.message;
        console.error(`❌ ${names[index]} calculation failed:`, error);
        return { name: names[index], success: false, error };
      }
    });
    
    const successCount = results.filter(r => r.success).length;
    console.log(`📊 Phase 2 complete: ${successCount}/2 calculations successful`);
    
    // Update database log
    if (logEntry) {
      await SchedulerLogService.updateLog(logEntry.id!, {
        status: successCount === 2 ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_files_processed: 2,
        files_created: successCount,
        files_failed: 2 - successCount,
        progress_percentage: 100,
        current_processing: `Phase 2 complete: ${successCount}/2 calculations successful`
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
      phase2Calculation: 'Triggered when Phase 1 completes'
    },
    weekendSkip: false
  };
}
