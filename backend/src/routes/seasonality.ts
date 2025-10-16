// seasonality.ts
// API routes for seasonality data

import { Router } from 'express';
import { createErrorResponse, ERROR_CODES, HTTP_STATUS } from '../utils/responseUtils';
import { 
  listAvailableIndexes,
  generateAllIndexesSeasonality
} from '../calculations/seasonal/seasonality_index_azure';
import { 
  getAllSectors,
  generateAllSectorsSeasonality
} from '../calculations/seasonal/seasonality_sector_azure';
import { 
  getAllStocks,
  generateAllStocksSeasonality
} from '../calculations/seasonal/seasonality_stock_azure';
// Removed unused import

const router = Router();

// Cache for inputs (5 minutes TTL)
const inputsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for data (10 minutes TTL)
const dataCache = new Map<string, { data: any; timestamp: number }>();
const DATA_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/seasonality/inputs
 * Get available inputs for seasonality analysis
 */
router.get('/inputs', async (_req, res) => {
  try {
    const cacheKey = 'seasonality_inputs';
    const cached = inputsCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return res.json(cached.data);
    }

    // Get available data
    const [indexes, sectors, stocks] = await Promise.all([
      listAvailableIndexes(),
      getAllSectors(),
      getAllStocks()
    ]);

    const response = {
      indexes: indexes.map(name => ({ name, type: 'index' })),
      sectors: sectors.map(name => ({ name, type: 'sector' })),
      stocks: stocks.map(stock => ({ name: stock.ticker, sector: stock.sector, type: 'stock' }))
    };

    // Cache the result
    inputsCache.set(cacheKey, { data: response, timestamp: Date.now() });

    return res.json(response);
  } catch (error) {
    console.error('❌ Error getting seasonality inputs:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Failed to get seasonality inputs')
    );
  }
});

/**
 * GET /api/seasonality/data
 * Get seasonality data for specific inputs
 */
router.get('/data', async (req, res) => {
  try {
    const { type, items, startDate, endDate } = req.query;
    
    if (!type || !items) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Type and items are required')
      );
    }

    const cacheKey = `seasonality_data_${type}_${items}_${startDate || 'all'}_${endDate || 'all'}`;
    const cached = dataCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < DATA_CACHE_TTL) {
      return res.json(cached.data);
    }

    let results: any = {};

    if (type === 'index') {
      const indexList = Array.isArray(items) ? items : [items];
      const allIndexes = await generateAllIndexesSeasonality();
      results = {
        ...allIndexes,
        indexes: allIndexes.indexes.filter((index: any) => indexList.includes(index.ticker))
      };
    } else if (type === 'sector') {
      const sectorList = Array.isArray(items) ? items : [items];
      const allSectors = await generateAllSectorsSeasonality();
      results = {
        ...allSectors,
        sectors: allSectors.sectors.filter((sector: any) => sectorList.includes(sector.sector))
      };
    } else if (type === 'stock') {
      const stockList = Array.isArray(items) ? items : [items];
      const allStocks = await generateAllStocksSeasonality();
      results = {
        ...allStocks,
        stocks: allStocks.stocks.filter((stock: any) => stockList.includes(stock.ticker))
      };
    } else {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid type. Must be index, sector, or stock')
      );
    }

    // Cache the result
    dataCache.set(cacheKey, { data: results, timestamp: Date.now() });

    return res.json(results);
  } catch (error) {
    console.error('❌ Error getting seasonality data:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Failed to get seasonality data')
    );
  }
});

/**
 * GET /api/seasonality/status
 * Get generation status
 */
router.get('/status', async (_req, res) => {
  try {
    const { getGenerationStatus } = await import('../services/seasonalityAutoGenerate');
    const status = getGenerationStatus();
    
    return res.json({
      isGenerating: status.isGenerating,
      lastGenerationTime: status.lastGenerationTime,
      progress: status.progress
    });
  } catch (error) {
    console.error('❌ Error getting seasonality status:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Failed to get seasonality status')
    );
  }
});

/**
 * POST /api/seasonality/trigger
 * Manually trigger seasonality generation
 */
router.post('/trigger', async (_req, res) => {
  try {
    const { preGenerateAllSeasonality } = await import('../services/seasonalityAutoGenerate');
    
    // Check if already generating
    const { getGenerationStatus } = await import('../services/seasonalityAutoGenerate');
    const status = getGenerationStatus();
    
    if (status.isGenerating) {
      return res.status(HTTP_STATUS.CONFLICT).json(
        createErrorResponse(ERROR_CODES.CONFLICT, 'Seasonality generation already in progress')
      );
    }

    // Start generation in background
    preGenerateAllSeasonality(true, 'manual').catch(console.error);
    
    return res.json({
      message: 'Seasonality generation started',
      status: 'started'
    });
  } catch (error) {
    console.error('❌ Error triggering seasonality generation:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Failed to trigger seasonality generation')
    );
  }
});

/**
 * POST /api/seasonality/debug/clear-cache
 * Clear seasonality cache
 */
router.post('/debug/clear-cache', async (_req, res) => {
  try {
    inputsCache.clear();
    dataCache.clear();
    
    return res.json({
      message: 'Seasonality cache cleared successfully'
    });
  } catch (error) {
    console.error('❌ Error clearing seasonality cache:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Failed to clear seasonality cache')
    );
  }
});

export default router;

