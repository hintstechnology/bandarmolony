// scheduler.ts
// Scheduled tasks for data updates and calculations

import cron from 'node-cron';
import { forceRegenerate, getGenerationStatus } from './rrcAutoGenerate';
import { forceRegenerate as forceRegenerateRRG, getGenerationStatus as getGenerationStatusRRG } from './rrgAutoGenerate';
import { forceRegenerate as forceRegenerateSeasonal, getGenerationStatus as getGenerationStatusSeasonal } from './seasonalityAutoGenerate';
import { updateStockData } from './stockDataUpdateService';
import { updateIndexData } from './indexDataUpdateService';
import { initializeAzureLogging } from './azureLoggingService';

// Get schedule times from environment or use defaults
const STOCK_UPDATE_TIME = process.env['SCHEDULER_STOCK_UPDATE_TIME'] || '19:00';
const INDEX_UPDATE_TIME = process.env['SCHEDULER_INDEX_UPDATE_TIME'] || '19:00';
const RRC_UPDATE_TIME = process.env['SCHEDULER_RRC_UPDATE_TIME'] || '19:30'; // After data updates
const RRG_UPDATE_TIME = process.env['SCHEDULER_RRG_UPDATE_TIME'] || '19:30'; // After data updates
const SEASONAL_UPDATE_TIME = process.env['SCHEDULER_SEASONAL_UPDATE_TIME'] || '19:30'; // After RRC/RRG
const TIMEZONE = process.env['SCHEDULER_TIMEZONE'] || 'Asia/Jakarta';

// Convert time to cron format (HH:MM -> MM HH * * *)
function timeToCron(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${minutes} ${hours} * * *`;
}

const STOCK_UPDATE_SCHEDULE = timeToCron(STOCK_UPDATE_TIME);
const INDEX_UPDATE_SCHEDULE = timeToCron(INDEX_UPDATE_TIME);
const RRC_UPDATE_SCHEDULE = timeToCron(RRC_UPDATE_TIME);
const RRG_UPDATE_SCHEDULE = timeToCron(RRG_UPDATE_TIME);

let schedulerRunning = false;
let scheduledTasks: any[] = [];

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  if (schedulerRunning) {
    console.log('⚠️ Scheduler already running');
    return;
  }

  console.log('🕐 Starting scheduler...');

  // 1. Schedule Stock Data Update (19:00)
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

  // 2. Schedule Index Data Update (19:05)
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

  // 3. Schedule RRC calculation (19:10 - after data updates)
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

  // 4. Schedule RRG calculation (19:10 - after data updates)
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
    } catch (error) {
      console.error('❌ Error during scheduled RRG calculation:', error);
    }
  }, {
    timezone: TIMEZONE
  });
  scheduledTasks.push(rrgTask);

  // Seasonality Calculation Task
  const SEASONAL_UPDATE_SCHEDULE = timeToCron(SEASONAL_UPDATE_TIME);
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

  // Initialize Azure logging
  initializeAzureLogging().catch(console.error);
  
  // Log next scheduled runs
  console.log(`\n📅 Scheduler Configuration (${TIMEZONE}):`);
  console.log(`  📊 Stock Data Update: ${STOCK_UPDATE_TIME} daily`);
  console.log(`  📈 Index Data Update: ${INDEX_UPDATE_TIME} daily`);
  console.log(`  🔄 RRC Calculation: ${RRC_UPDATE_TIME} daily`);
  console.log(`  🔄 RRG Calculation: ${RRG_UPDATE_TIME} daily`);
  console.log(`  🔄 Seasonality Calculation: ${SEASONAL_UPDATE_TIME} daily`);
  console.log(`  ⏭️  Weekend updates: SKIPPED (Sat/Sun)\n`);

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
      stockUpdate: STOCK_UPDATE_TIME,
      indexUpdate: INDEX_UPDATE_TIME,
      rrcCalculation: RRC_UPDATE_TIME,
      rrgCalculation: RRG_UPDATE_TIME
    },
    weekendSkip: true
  };
}
