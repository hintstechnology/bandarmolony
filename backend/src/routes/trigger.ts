// trigger.ts
// Manual trigger endpoints for data update services

import express from 'express';
import { updateStockData } from '../services/stockDataScheduler';
import { updateIndexData } from '../services/indexDataScheduler';
import { updateShareholdersData } from '../services/shareholdersDataScheduler';
import { updateHoldingData } from '../services/holdingDataScheduler';
import { updateDoneSummaryData } from '../services/doneSummaryDataScheduler';
import { SchedulerLogService } from '../services/schedulerLogService';
import { AzureLogger } from '../services/azureLoggingService';
import AccumulationDataScheduler from '../services/accumulationDataScheduler';
import BidAskDataScheduler from '../services/bidAskDataScheduler';
import BrokerDataScheduler from '../services/brokerDataScheduler';
import BrokerInventoryDataScheduler from '../services/brokerInventoryDataScheduler';
import ForeignFlowDataScheduler from '../services/foreignFlowDataScheduler';
import MoneyFlowDataScheduler from '../services/moneyFlowDataScheduler';
import { preGenerateAllRRC } from '../services/rrcDataScheduler';
import { preGenerateAllRRG } from '../services/rrgDataScheduler';
import { forceRegenerate as generateSeasonalityData } from '../services/seasonalityDataScheduler';
import { TrendFilterDataScheduler } from '../services/trendFilterDataScheduler';
import BrokerSummaryTypeDataScheduler from '../services/brokerSummaryTypeDataScheduler';
import { BrokerDataRGTNNGCalculator } from '../calculations/broker/broker_data_rg_tn_ng';
import { listPaths } from '../utils/azureBlob';

const router = express.Router();

// Manual trigger for stock data update
router.post('/stock', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Stock data update');
    
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'stock',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    // Run update in background
    updateStockData().then(async () => {
      await AzureLogger.logInfo('stock', 'Manual stock data update completed');
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('stock', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Stock data update triggered successfully',
      logId: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Manual trigger error (stock):', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Manual trigger for index data update
router.post('/index', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Index data update');
    
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'index',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    updateIndexData().then(async () => {
      await AzureLogger.logInfo('index', 'Manual index data update completed');
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('index', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Index data update triggered successfully',
      logId: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Manual trigger error (index):', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Manual trigger for shareholders data update
router.post('/shareholders', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Shareholders data update');
    
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'shareholders',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    updateShareholdersData().then(async () => {
      await AzureLogger.logInfo('shareholders', 'Manual shareholders data update completed');
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('shareholders', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Shareholders data update triggered successfully',
      logId: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Manual trigger error (shareholders):', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Manual trigger for holding data update
router.post('/holding', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Holding data update');
    
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'holding',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    updateHoldingData().then(async () => {
      await AzureLogger.logInfo('holding', 'Manual holding data update completed');
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('holding', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Holding data update triggered successfully',
      logId: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Manual trigger error (holding):', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Manual trigger for done summary data update
router.post('/done-summary', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Done summary data update');
    
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'done-summary',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    updateDoneSummaryData().then(async () => {
      await AzureLogger.logInfo('done-summary', 'Manual done summary data update completed');
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('done-summary', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Done summary data update triggered successfully',
      logId: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Manual trigger error (done-summary):', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Manual trigger for Accumulation Distribution calculation
router.post('/accumulation', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Accumulation Distribution calculation');
    
    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'accumulation_distribution',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    // Run calculation in background
    const accumulationService = new AccumulationDataScheduler();
    accumulationService.generateAccumulationData(dateSuffix).then(async (result) => {
      await AzureLogger.logInfo('accumulation_distribution', `Manual accumulation calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('accumulation_distribution', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Accumulation Distribution calculation triggered',
      log_id: logEntry.id
    });
  } catch (error) {
    console.error('❌ Error triggering accumulation calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Manual trigger for Bid/Ask Footprint calculation
router.post('/bidask', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Bid/Ask Footprint calculation');
    
    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'bidask_footprint',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    // Run calculation in background
    const bidAskService = new BidAskDataScheduler();
    bidAskService.generateBidAskData(dateSuffix).then(async (result) => {
      await AzureLogger.logInfo('bidask_footprint', `Manual bid/ask calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('bidask_footprint', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Bid/Ask Footprint calculation triggered',
      log_id: logEntry.id
    });
  } catch (error) {
    console.error('❌ Error triggering bid/ask calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Manual trigger for Broker Data calculation
router.post('/broker-data', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Data calculation');
    
    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_data',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    // Run calculation in background
    const brokerDataService = new BrokerDataScheduler();
    brokerDataService.generateBrokerData(dateSuffix).then(async (result) => {
      await AzureLogger.logInfo('broker_data', `Manual broker data calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('broker_data', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Broker Data calculation triggered',
      log_id: logEntry.id
    });
  } catch (error) {
    console.error('❌ Error triggering broker data calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Manual trigger for Broker Data calculation for all dates starting from 20250922
router.post('/broker-data-all', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Data calculation for all dates from 20250922 - Direct execution');

    // Run calculation directly without scheduler log
    const brokerDataService = new BrokerDataScheduler();
    
    // Execute in background and return immediately
    (async () => {
      try {
        // Find all DT files
        const allFiles = await listPaths({ prefix: 'done-summary/' });
        const dtFiles = allFiles.filter((file: string) => 
          file.includes('/DT') && file.endsWith('.csv')
        );
        
        console.log(`📊 Found ${dtFiles.length} DT files to process`);
        
        // Extract unique dates from DT files (format: done-summary/20250922/DT250922.csv)
        const datesSet = new Set<string>();
        for (const file of dtFiles) {
          const match = file.match(/done-summary\/(\d{8})\//);
          if (match && match[1]) {
            const dateStr = match[1];
            // Only process dates from 20250922 onwards
            if (dateStr >= '20250922') {
              datesSet.add(dateStr);
            }
          }
        }
        
        const dates = Array.from(datesSet).sort();
        console.log(`📅 Processing ${dates.length} unique dates from 20250922 onwards:`, dates.slice(0, 10), '...');
        
        let successCount = 0;
        let failCount = 0;
        
        for (const date of dates) {
          try {
            const result = await brokerDataService.generateBrokerData(date);
            if (result.success) {
              successCount++;
              console.log(`✅ Broker data generated for ${date}`);
            } else {
              failCount++;
              console.error(`❌ Broker data failed for ${date}: ${result.message}`);
            }
          } catch (error: any) {
            failCount++;
            console.error(`❌ Error generating broker data for ${date}:`, error.message);
          }
        }
        
        const message = `Broker data calculation completed: ${successCount} succeeded, ${failCount} failed`;
        await AzureLogger.logInfo('broker_data_all', message);
        console.log(`✅ ${message}`);
      } catch (error: any) {
        await AzureLogger.logSchedulerError('broker_data_all', error.message);
        console.error(`❌ Broker data calculation error: ${error.message}`);
      }
    })();

    return res.json({ 
      success: true, 
      message: 'Broker Data calculation for all dates started (running in background)'
    });
  } catch (error) {
    console.error('❌ Error triggering broker data calculation for all dates:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Manual trigger for Broker Inventory calculation
router.post('/broker-inventory', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Inventory calculation');
    
    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_inventory',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    // Run calculation in background
    const brokerInventoryService = new BrokerInventoryDataScheduler();
    brokerInventoryService.generateBrokerInventoryData(dateSuffix).then(async (result) => {
      await AzureLogger.logInfo('broker_inventory', `Manual broker inventory calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('broker_inventory', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Broker Inventory calculation triggered',
      log_id: logEntry.id
    });
  } catch (error) {
    console.error('❌ Error triggering broker inventory calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Manual trigger for Broker Summary by Type - RG only
router.post('/broker-summary-rg', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Summary by Type (RG only) calculation - Direct execution');

    // Run calculation directly without scheduler log
    const calculator = new BrokerDataRGTNNGCalculator();
    
    // Execute in background and return immediately
    (async () => {
      try {
        const result = await calculator.generateBrokerDataForType('RG');
        await AzureLogger.logInfo('broker_summary_rg', `Manual broker summary RG calculation completed: ${result.message || 'OK'}`);
        console.log(`✅ Broker Summary RG calculation completed: ${result.message}`);
      } catch (error: any) {
        await AzureLogger.logSchedulerError('broker_summary_rg', error.message);
        console.error(`❌ Broker Summary RG calculation error: ${error.message}`);
      }
    })();

    return res.json({
      success: true,
      message: 'Broker Summary RG calculation started (running in background)'
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker summary RG calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Summary by Type (RG/TN/NG)
router.post('/broker-summary-type', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Summary by Type (RG/TN/NG) calculation');
    
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_summary_type',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    const brokerSummaryTypeService = new BrokerSummaryTypeDataScheduler();
    
    // Execute in background and return immediately
    brokerSummaryTypeService.generateBrokerSummaryTypeData('all').then(async (result) => {
      await AzureLogger.logInfo('broker_summary_type', `Manual broker summary type calculation completed: ${result.message || 'OK'}`);
      console.log(`✅ Broker Summary Type calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error: any) => {
      await AzureLogger.logSchedulerError('broker_summary_type', error.message);
      console.error(`❌ Broker Summary Type calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Summary by Type calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker summary type calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Foreign Flow calculation
router.post('/foreign-flow', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Foreign Flow calculation');
    
    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'foreign_flow',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    // Run calculation in background
    const foreignFlowService = new ForeignFlowDataScheduler();
    foreignFlowService.generateForeignFlowData(dateSuffix).then(async (result) => {
      await AzureLogger.logInfo('foreign_flow', `Manual foreign flow calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('foreign_flow', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Foreign Flow calculation triggered',
      log_id: logEntry.id
    });
  } catch (error) {
    console.error('❌ Error triggering foreign flow calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Manual trigger for Money Flow calculation
router.post('/money-flow', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Money Flow calculation');
    
    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'money_flow',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    // Run calculation in background
    const moneyFlowService = new MoneyFlowDataScheduler();
    moneyFlowService.generateMoneyFlowData(dateSuffix).then(async (result) => {
      await AzureLogger.logInfo('money_flow', `Manual money flow calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('money_flow', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Money Flow calculation triggered',
      log_id: logEntry.id
    });
  } catch (error) {
    console.error('❌ Error triggering money flow calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get scheduler status
router.get('/status', async (_req, res) => {
  try {
    // Get latest logs from scheduler
    const latestLogs = await SchedulerLogService.getLogs({
      limit: 10,
      offset: 0
    });

    // Get total counts by status
    const totalRunning = await SchedulerLogService.getLogsCount({ status: 'running' });
    const totalCompleted = await SchedulerLogService.getLogsCount({ status: 'completed' });
    const totalFailed = await SchedulerLogService.getLogsCount({ status: 'failed' });

    return res.json({
      success: true,
      data: {
        latestLogs,
        summary: {
          running: totalRunning,
          completed: totalCompleted,
          failed: totalFailed
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching scheduler status:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get scheduler logs
router.get('/logs', async (req, res) => {
  try {
    const { limit = 50, offset = 0, status, feature_name } = req.query;
    
    const logs = await SchedulerLogService.getLogs({
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      status: status as string,
      feature_name: feature_name as string
    });
    
    // Get total count for pagination
    const totalCount = await SchedulerLogService.getLogsCount({
      status: status as string,
      feature_name: feature_name as string
    });
    
    return res.json({ 
      success: true, 
      data: logs,
      total: totalCount
    });

  } catch (error: any) {
    console.error('❌ Error fetching scheduler logs:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get scheduler log by ID
router.get('/logs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const log = await SchedulerLogService.getLogById(parseInt(id));
    
    if (!log) {
      return res.status(404).json({ 
        success: false, 
        message: 'Log not found' 
      });
    }

    return res.json({ 
      success: true, 
      data: log 
    });

  } catch (error: any) {
    console.error('❌ Error fetching scheduler log:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Manual trigger for RRC calculation
router.post('/rrc', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: RRC calculation');
    
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'rrc',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    preGenerateAllRRC(true, 'manual').then(async () => {
      await AzureLogger.logInfo('rrc', 'Manual RRC calculation completed');
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('rrc', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'RRC calculation triggered successfully',
      log_id: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Error triggering RRC calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

// Manual trigger for RRG calculation
router.post('/rrg', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: RRG calculation');
    
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'rrg',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    preGenerateAllRRG(true, 'manual').then(async () => {
      await AzureLogger.logInfo('rrg', 'Manual RRG calculation completed');
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error) => {
      await AzureLogger.logSchedulerError('rrg', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'RRG calculation triggered successfully',
      log_id: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Error triggering RRG calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

// Manual trigger for Seasonal calculation
router.post('/seasonal', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Seasonal calculation');
    
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'seasonality',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    generateSeasonalityData('manual').then(async () => {
      await AzureLogger.logInfo('seasonality', 'Manual seasonal calculation completed');
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error: any) => {
      await AzureLogger.logSchedulerError('seasonality', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Seasonal calculation triggered successfully',
      log_id: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Error triggering seasonal calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

// Manual trigger for Trend Filter calculation
router.post('/trend-filter', async (_req, res) => {
  try {
    console.log('🔄 Manual trigger: Trend Filter calculation');
    
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'trend_filter',
      trigger_type: 'manual',
      triggered_by: 'admin',
      status: 'running',
      force_override: true,
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create scheduler log entry' 
      });
    }

    const trendFilterService = new TrendFilterDataScheduler();
    trendFilterService.generateTrendFilterData().then(async (result: any) => {
      await AzureLogger.logInfo('trend_filter', `Manual trend filter calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      await AzureLogger.logSchedulerError('trend_filter', error.message);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({ 
      success: true, 
      message: 'Trend Filter calculation triggered successfully',
      log_id: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Error triggering trend filter calculation:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Unknown error' 
    });
  }
});

export default router;