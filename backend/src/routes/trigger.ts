// trigger.ts
// Manual trigger endpoints for data update services

import express from 'express';
import { updateStockData } from '../services/stockDataScheduler';
import { updateIndexData } from '../services/indexDataScheduler';
import { updateShareholdersData } from '../services/shareholdersDataScheduler';
import { updateHoldingData } from '../services/holdingDataScheduler';
import { updateDoneSummaryData } from '../services/doneSummaryDataScheduler';
import { updateEmitenList } from '../calculations/input/emiten_list';
import { SchedulerLogService } from '../services/schedulerLogService';
import { AzureLogger } from '../services/azureLoggingService';
import AccumulationDataScheduler from '../services/accumulationDataScheduler';
import BidAskDataScheduler from '../services/bidAskDataScheduler';
import BrokerSummaryDataScheduler from '../services/brokerSummaryDataScheduler';
import TopBrokerDataScheduler from '../services/topBrokerDataScheduler';
import BrokerInventoryDataScheduler from '../services/brokerInventoryDataScheduler';
import ForeignFlowDataScheduler from '../services/foreignFlowDataScheduler';
import MoneyFlowDataScheduler from '../services/moneyFlowDataScheduler';
import { preGenerateAllRRC } from '../services/rrcDataScheduler';
import { preGenerateAllRRG } from '../services/rrgDataScheduler';
import { forceRegenerate as generateSeasonalityData } from '../services/seasonalityDataScheduler';
import { TrendFilterDataScheduler } from '../services/trendFilterDataScheduler';
import BrokerSummaryTypeDataScheduler from '../services/brokerSummaryTypeDataScheduler';
import BrokerSummaryIDXDataScheduler from '../services/brokerSummaryIDXDataScheduler';
import BrokerSummarySectorDataScheduler from '../services/brokerSummarySectorDataScheduler';
import BrokerBreakdownDataScheduler from '../services/brokerBreakdownDataScheduler';
import BreakDoneTradeDataScheduler from '../services/breakDoneTradeDataScheduler';
import HakaHakiAnalysisDataScheduler from '../services/hakaHakiAnalysisDataScheduler';
import BrokerTransactionDataScheduler from '../services/brokerTransactionDataScheduler';
import BrokerTransactionRGTNNGDataScheduler from '../services/brokerTransactionRGTNNGDataScheduler';
import BrokerTransactionFDDataScheduler from '../services/brokerTransactionFDDataScheduler';
import BrokerTransactionFDRGTNNGDataScheduler from '../services/brokerTransactionFDRGTNNGDataScheduler';
import BrokerTransactionStockDataScheduler from '../services/brokerTransactionStockDataScheduler';
import BrokerTransactionStockFDDataScheduler from '../services/brokerTransactionStockFDDataScheduler';
import BrokerTransactionStockRGTNNGDataScheduler from '../services/brokerTransactionStockRGTNNGDataScheduler';
import BrokerTransactionStockFDRGTNNGDataScheduler from '../services/brokerTransactionStockFDRGTNNGDataScheduler';
import { BrokerTransactionStockIDXDataScheduler } from '../services/brokerTransactionStockIDXDataScheduler';
import { BrokerTransactionStockSectorDataScheduler } from '../services/brokerTransactionStockSectorDataScheduler';
import { BrokerTransactionALLDataScheduler } from '../services/brokerTransactionALLDataScheduler';
import { BrokerDataRGTNNGCalculator } from '../calculations/broker/broker_data_rg_tn_ng';
import { updateWatchlistSnapshot } from '../services/watchlistSnapshotService';
import { supabaseAdmin } from '../supabaseClient';

const router = express.Router();

// Middleware to optionally populate req.user if token exists (doesn't block if no token)
async function optionalAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
  const anyReq = req as any;

  // If req.user already exists (from requireSupabaseUser), skip
  if (anyReq.user) {
    return next();
  }

  // Try to get user from token
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (token) {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && user) {
        anyReq.user = {
          id: user.id,
          email: user.email,
          role: user.role || 'user'
        };
      }
    } catch (error) {
      // Ignore error, continue without user
    }
  }

  next();
}

// Helper: get who triggered the manual action (prefer email, fallback to id)
function getTriggeredBy(req: express.Request): string {
  const anyReq = req as any;
  return anyReq.user?.email || anyReq.user?.id || 'admin';
}

// Apply optional auth middleware to all routes
router.use(optionalAuth);

// Manual trigger for stock data update
router.post('/stock', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Stock data update');

    // Create log entry
    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'stock',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    // Run update in background
    updateStockData(logEntry.id || null, triggeredBy).catch(async (error) => {
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

// Manual trigger for emiten list update
router.post('/emiten-list', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Emiten List update');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'emiten_list',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    updateEmitenList(logEntry.id || null, triggeredBy).catch(async (error) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Emiten List update triggered successfully',
      logId: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Manual trigger error (emiten-list):', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Manual trigger for index data update
router.post('/index', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Index data update');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'index',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    updateIndexData(logEntry.id || null, triggeredBy).catch(async (error) => {
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
router.post('/shareholders', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Shareholders data update');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'shareholders',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    updateShareholdersData(logEntry.id || null, triggeredBy).catch(async (error) => {
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
router.post('/holding', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Holding data update');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'holding',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    updateHoldingData(logEntry.id || null, triggeredBy).catch(async (error) => {
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
router.post('/done-summary', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Done summary data update');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'done-summary',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    updateDoneSummaryData(logEntry.id || null, triggeredBy).catch(async (error) => {
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
router.post('/accumulation', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Accumulation Distribution calculation');

    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');

    const triggeredBy = getTriggeredBy(req);
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'accumulation_distribution',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
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
    accumulationService.generateAccumulationData(dateSuffix, logEntry.id, triggeredBy).then(async (result) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
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
router.post('/bidask', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Bid/Ask Footprint calculation');

    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');

    const triggeredBy = getTriggeredBy(req);
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'bidask_footprint',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
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
    bidAskService.generateBidAskData(dateSuffix, logEntry.id, triggeredBy).then(async (result) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
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

// Manual trigger for Broker Breakdown calculation
router.post('/broker-breakdown', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Breakdown calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_breakdown',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerBreakdownService = new BrokerBreakdownDataScheduler();

    // Execute in background and return immediately
    // Pass logId to enable progress tracking
    brokerBreakdownService.generateBrokerBreakdownData('all', logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Breakdown calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Broker Breakdown calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Breakdown calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker breakdown calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Summary calculation
router.post('/broker-summary', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Summary calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker-summary',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    // Run calculation in background
    const brokerSummaryService = new BrokerSummaryDataScheduler();
    brokerSummaryService.generateBrokerSummaryData('all', logEntry.id || null, triggeredBy).then(async (result) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Summary calculation triggered',
      log_id: logEntry.id
    });
  } catch (error) {
    console.error('❌ Error triggering broker summary calculation:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Manual trigger for Top Broker calculation
router.post('/top-broker', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Top Broker calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'top-broker',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    // Run calculation in background
    const topBrokerService = new TopBrokerDataScheduler();
    topBrokerService.generateTopBrokerData('all', logEntry.id || null, triggeredBy).then(async (result) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Top Broker calculation triggered',
      log_id: logEntry.id
    });
  } catch (error) {
    console.error('❌ Error triggering top broker calculation:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Manual trigger for Broker Inventory calculation
router.post('/broker-inventory', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Inventory calculation');

    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');

    const triggeredBy = getTriggeredBy(req);
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_inventory',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
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
    brokerInventoryService.generateBrokerInventoryData(dateSuffix, logEntry.id, triggeredBy).then(async (result) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
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
        // Type assertion to fix TypeScript error (method exists but TypeScript doesn't recognize it)
        const result = await (calculator as any).generateBrokerDataForType('RG');
        console.log(`✅ Broker Summary RG calculation completed: ${result.message}`);
      } catch (error: any) {
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
router.post('/broker-summary-type', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Summary by Type (RG/TN/NG) calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_summary_type',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
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
    brokerSummaryTypeService.generateBrokerSummaryTypeData('all', logEntry.id, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Summary Type calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error: any) => {
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
router.post('/foreign-flow', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Foreign Flow calculation');

    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');

    const triggeredBy = getTriggeredBy(req);
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'foreign_flow',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
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
    foreignFlowService.generateForeignFlowData(dateSuffix, logEntry.id, triggeredBy).then(async (result) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
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
router.post('/money-flow', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Money Flow calculation');

    const today = new Date();
    const dateSuffix = today.toISOString().slice(2, 10).replace(/-/g, '');

    const triggeredBy = getTriggeredBy(req);
    // Create log entry
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'money_flow',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
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
    moneyFlowService.generateMoneyFlowData(dateSuffix, logEntry.id, triggeredBy).then(async (result) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error) => {
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

    // ID is UUID string, not integer
    const log = await SchedulerLogService.getLogById(id);

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

// Cancel a running scheduler task
router.post('/logs/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // ID is UUID string, not integer
    // Get log to check if it's running
    const log = await SchedulerLogService.getLogById(id);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    if (log.status !== 'running') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel log with status: ${log.status}`
      });
    }

    // Mark as cancelled - get user info from request if available
    const cancelledBy = (req as any).user?.email || (req as any).user?.id || 'admin';
    const success = await SchedulerLogService.markCancelled(id, reason, cancelledBy);

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel scheduler log'
      });
    }

    return res.json({
      success: true,
      message: 'Scheduler task cancelled successfully'
    });

  } catch (error: any) {
    console.error('❌ Error cancelling scheduler log:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete a scheduler log
router.delete('/logs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // ID is UUID string, not integer
    // Check if log exists
    const log = await SchedulerLogService.getLogById(id);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    // Delete the log
    const success = await SchedulerLogService.deleteLog(id);

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete scheduler log'
      });
    }

    return res.json({
      success: true,
      message: 'Scheduler log deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting scheduler log:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete multiple scheduler logs (bulk delete)
router.delete('/logs', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of log IDs to delete'
      });
    }

    // Delete the logs
    const result = await SchedulerLogService.deleteLogs(ids);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete scheduler logs',
        deleted: result.deleted,
        failed: result.failed
      });
    }

    return res.json({
      success: true,
      message: `Successfully deleted ${result.deleted} log(s)`,
      deleted: result.deleted,
      failed: result.failed
    });

  } catch (error: any) {
    console.error('❌ Error deleting scheduler logs:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Manual trigger for RRC calculation
router.post('/rrc', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: RRC calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'rrc',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    preGenerateAllRRC(true, 'manual', logEntry.id || null, triggeredBy).then(async () => {
    }).catch(async (error) => {
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
router.post('/rrg', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: RRG calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'rrg',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    preGenerateAllRRG(true, 'manual', logEntry.id || null, triggeredBy).then(async () => {
    }).catch(async (error) => {
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
router.post('/seasonal', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Seasonal calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'seasonality',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    generateSeasonalityData('manual', logEntry.id, triggeredBy).then(async () => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100
        });
      }
    }).catch(async (error: any) => {
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
router.post('/trend-filter', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Trend Filter calculation');

    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'trend_filter',
      trigger_type: 'manual',
      triggered_by: getTriggeredBy(req),
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const trendFilterService = new TrendFilterDataScheduler();
    trendFilterService.generateTrendFilterData(logEntry.id, getTriggeredBy(req)).then(async (result: any) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
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

// Manual trigger for Watchlist Snapshot
router.post('/watchlist-snapshot', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Watchlist Snapshot generation');

    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'watchlist_snapshot',
      trigger_type: 'manual',
      triggered_by: getTriggeredBy(req),
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    // Run watchlist snapshot generation in background
    updateWatchlistSnapshot(logEntry.id, getTriggeredBy(req)).then(async () => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'completed',
          progress_percentage: 100,
          current_processing: 'Watchlist snapshot generated and uploaded successfully'
        });
      }
    }).catch(async (error: any) => {
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message || 'Unknown error'
        });
      }
    });

    return res.json({
      success: true,
      message: 'Watchlist Snapshot generation triggered successfully',
      log_id: logEntry.id
    });

  } catch (error: any) {
    console.error('❌ Error triggering watchlist snapshot generation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Transaction Stock IDX calculation
router.post('/broker-transaction-stock-idx', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction Stock IDX calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_stock_idx',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionStockIDXService = new BrokerTransactionStockIDXDataScheduler();

    // Execute in background and return immediately
    brokerTransactionStockIDXService.generateBrokerTransactionStockIDXData('all', logEntry.id, triggeredBy).then(async (result: { success: boolean; message?: string }) => {
      console.log(`✅ Broker Transaction Stock IDX calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      console.error(`❌ Broker Transaction Stock IDX calculation error: ${errorMessage}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: errorMessage
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction Stock IDX calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction stock IDX calculation:', error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    return res.status(500).json({
      success: false,
      message: `Failed to trigger broker-transaction-stock-idx update: ${errorMessage}`
    });
  }
});

// Manual trigger for Broker Summary IDX calculation
router.post('/broker-summary-idx', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Summary IDX calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_summary_idx',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerSummaryIDXService = new BrokerSummaryIDXDataScheduler();

    // Execute in background and return immediately
    brokerSummaryIDXService.generateBrokerSummaryIDXData('all', logEntry.id, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Summary IDX calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      console.error(`❌ Broker Summary IDX calculation error: ${errorMessage}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: errorMessage
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Summary IDX calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker summary IDX calculation:', error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    return res.status(500).json({
      success: false,
      message: `Failed to trigger broker-summary-idx update: ${errorMessage}`
    });
  }
});

// Manual trigger for Broker Transaction calculation
router.post('/broker-transaction', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionService = new BrokerTransactionDataScheduler();

    // Execute in background and return immediately
    // Pass undefined to process all DT files, and logId to enable progress tracking
    brokerTransactionService.generateBrokerTransactionData(undefined, logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Transaction calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Broker Transaction calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Transaction RG/TN/NG calculation
router.post('/broker-transaction-rgtnng', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction RG/TN/NG calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_rgtnng',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionRGTNNGService = new BrokerTransactionRGTNNGDataScheduler();

    // Execute in background and return immediately
    // Pass undefined to process all DT files (as per generateBrokerTransactionRGTNNGData implementation)
    brokerTransactionRGTNNGService.generateBrokerTransactionRGTNNGData(undefined, logEntry.id, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Transaction RG/TN/NG calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Broker Transaction RG/TN/NG calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction RG/TN/NG calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction RG/TN/NG calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Transaction F/D calculation (filtered by Investor Type)
router.post('/broker-transaction-fd', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction F/D calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_fd',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionFDService = new BrokerTransactionFDDataScheduler();

    // Execute in background and return immediately
    // Pass undefined to process all DT files, and logId to enable progress tracking
    brokerTransactionFDService.generateBrokerTransactionData(undefined, logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Transaction F/D calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Broker Transaction F/D calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction F/D calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction F/D calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Transaction F/D RG/TN/NG calculation (filtered by Investor Type and Board Type)
router.post('/broker-transaction-fd-rgtnng', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction F/D RG/TN/NG calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_fd_rgtnng',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionFDRGTNNGService = new BrokerTransactionFDRGTNNGDataScheduler();

    // Execute in background and return immediately
    // Pass undefined to process all DT files, and logId to enable progress tracking
    brokerTransactionFDRGTNNGService.generateBrokerTransactionData(undefined, logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Transaction F/D RG/TN/NG calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Broker Transaction F/D RG/TN/NG calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction F/D RG/TN/NG calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction F/D RG/TN/NG calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Transaction Stock calculation (pivoted by stock)
router.post('/broker-transaction-stock', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction Stock calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_stock',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionStockService = new BrokerTransactionStockDataScheduler();

    // Execute in background and return immediately
    // Pass undefined to process all DT files, and logId to enable progress tracking
    brokerTransactionStockService.generateBrokerTransactionData(undefined, logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Transaction Stock calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Broker Transaction Stock calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction Stock calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction stock calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Transaction Stock F/D calculation (pivoted by stock, filtered by Investor Type)
router.post('/broker-transaction-stock-fd', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction Stock F/D calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_stock_fd',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionStockFDService = new BrokerTransactionStockFDDataScheduler();

    // Execute in background and return immediately
    // Pass undefined to process all DT files, and logId to enable progress tracking
    brokerTransactionStockFDService.generateBrokerTransactionData(undefined, logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Transaction Stock F/D calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Broker Transaction Stock F/D calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction Stock F/D calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction stock F/D calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Transaction Stock RG/TN/NG calculation (pivoted by stock, filtered by Board Type)
router.post('/broker-transaction-stock-rgtnng', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction Stock RG/TN/NG calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_stock_rgtnng',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionStockRGTNNGService = new BrokerTransactionStockRGTNNGDataScheduler();

    // Execute in background and return immediately
    // Pass undefined to process all DT files, and logId to enable progress tracking
    brokerTransactionStockRGTNNGService.generateBrokerTransactionData(undefined, logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Transaction Stock RG/TN/NG calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Broker Transaction Stock RG/TN/NG calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction Stock RG/TN/NG calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction stock RG/TN/NG calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Transaction Stock F/D RG/TN/NG calculation (pivoted by stock, filtered by Investor Type and Board Type)
router.post('/broker-transaction-stock-fd-rgtnng', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction Stock F/D RG/TN/NG calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_stock_fd_rgtnng',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionStockFDRGTNNGService = new BrokerTransactionStockFDRGTNNGDataScheduler();

    // Execute in background and return immediately
    // Pass undefined to process all DT files, and logId to enable progress tracking
    brokerTransactionStockFDRGTNNGService.generateBrokerTransactionData(undefined, logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Transaction Stock F/D RG/TN/NG calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Broker Transaction Stock F/D RG/TN/NG calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction Stock F/D RG/TN/NG calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction stock F/D RG/TN/NG calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Break Done Trade calculation
router.post('/break-done-trade', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Break Done Trade calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'break_done_trade',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const breakDoneTradeService = new BreakDoneTradeDataScheduler();

    // Execute in background and return immediately
    // Pass undefined to process all DT files, and logId to enable progress tracking
    breakDoneTradeService.generateBreakDoneTradeData(undefined, logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Break Done Trade calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ Break Done Trade calculation error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'Break Done Trade calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering break done trade calculation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

// Manual trigger for Broker Summary Sector calculation
router.post('/broker-summary-sector', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Summary Sector calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_summary_sector',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerSummarySectorService = new BrokerSummarySectorDataScheduler();

    // Execute in background and return immediately
    brokerSummarySectorService.generateBrokerSummarySectorData('all', logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Summary Sector calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      console.error(`❌ Broker Summary Sector calculation error: ${errorMessage}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: errorMessage
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Summary Sector calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker summary sector calculation:', error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    return res.status(500).json({
      success: false,
      message: `Failed to trigger broker-summary-sector update: ${errorMessage}`
    });
  }
});

// Manual trigger for Broker Transaction Stock Sector calculation
router.post('/broker-transaction-stock-sector', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction Stock Sector calculation');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_stock_sector',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionStockSectorService = new BrokerTransactionStockSectorDataScheduler();

    // Execute in background and return immediately
    brokerTransactionStockSectorService.generateBrokerTransactionStockSectorData('all', logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ Broker Transaction Stock Sector calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      console.error(`❌ Broker Transaction Stock Sector calculation error: ${errorMessage}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: errorMessage
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction Stock Sector calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction stock sector calculation:', error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    return res.status(500).json({
      success: false,
      message: `Failed to trigger broker-transaction-stock-sector update: ${errorMessage}`
    });
  }
});

// Manual trigger for Broker Transaction ALL calculation
router.post('/broker-transaction-all', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Broker Transaction ALL calculation');

    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'broker_transaction_all',
      trigger_type: 'manual',
      triggered_by: getTriggeredBy(req),
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const brokerTransactionALLService = new BrokerTransactionALLDataScheduler();

    // Execute in background and return immediately
    brokerTransactionALLService.generateBrokerTransactionALLData('all', logEntry.id || null, getTriggeredBy(req)).then(async (result) => {
      await AzureLogger.logInfo('broker_transaction_all', `Manual broker transaction ALL calculation completed: ${result.message || 'OK'}`);
      console.log(`✅ Broker Transaction ALL calculation completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      await AzureLogger.logSchedulerError('broker_transaction_all', errorMessage);
      console.error(`❌ Broker Transaction ALL calculation error: ${errorMessage}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: errorMessage
        });
      }
    });

    return res.json({
      success: true,
      message: 'Broker Transaction ALL calculation triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering broker transaction ALL calculation:', error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    return res.status(500).json({
      success: false,
      message: `Failed to trigger broker-transaction-all update: ${errorMessage}`
    });
  }
});

// Manual trigger for HAKA HAKI Analysis
router.post('/haka-haki-analysis', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: HAKA HAKI Analysis');

    const triggeredBy = getTriggeredBy(req);
    const logEntry = await SchedulerLogService.createLog({
      feature_name: 'haka_haki_analysis',
      trigger_type: 'manual',
      triggered_by: triggeredBy,
      status: 'running',
      environment: process.env['NODE_ENV'] || 'development'
    });

    if (!logEntry) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create scheduler log entry'
      });
    }

    const hakaHakiService = new HakaHakiAnalysisDataScheduler();

    // Execute in background
    hakaHakiService.generateHakaHakiData('all', logEntry.id || null, triggeredBy).then(async (result) => {
      console.log(`✅ HAKA HAKI Analysis completed: ${result.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: result.success ? 'completed' : 'failed',
          progress_percentage: 100,
          ...(result.success ? {} : { error_message: result.message })
        });
      }
    }).catch(async (error: any) => {
      console.error(`❌ HAKA HAKI Analysis error: ${error.message}`);
      if (logEntry.id) {
        await SchedulerLogService.updateLog(logEntry.id, {
          status: 'failed',
          error_message: error.message
        });
      }
    });

    return res.json({
      success: true,
      message: 'HAKA HAKI Analysis triggered successfully',
      log_id: logEntry.id
    });
  } catch (error: any) {
    console.error('❌ Error triggering HAKA HAKI Analysis:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unknown error'
    });
  }
});

export default router;