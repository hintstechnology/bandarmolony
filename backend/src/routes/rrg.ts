// rrg.ts
// RRG (Relative Rotation Graph) API Routes
// Similar to RRC but for RRG analysis

import { Router } from 'express';
import { createErrorResponse, createSuccessResponse, HTTP_STATUS } from '../utils/responseUtils';
import { downloadText, exists } from '../utils/azureBlob';
import { 
  calculateRrgStock, 
  listAvailableStocks,
  listAvailableIndexesForRrg
} from '../calculations/rrg/rrg_stock';
import { 
  calculateRrgSector as calculateRrgSectorFromSector,
  listAvailableSectors as listAvailableSectorsFromSector
} from '../calculations/rrg/rrg_sector';
import { getGenerationStatus } from '../services/rrgDataScheduler';
import { preGenerateAllRRG } from '../services/rrgDataScheduler';

const router = Router();

const AZURE_CONFIG = {
  stockDir: 'stock',
  indexDir: 'index', 
  outputDir: 'rrg_output'
};

// In-memory cache for inputs and data (valid for 5 minutes)
interface CacheEntry {
  data: any;
  timestamp: number;
}

let inputsCache: CacheEntry | null = null;
const dataCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DATA_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for data

// Helper function to filter data by date range
function filterDataByDateRange(data: any[], startDate?: string, endDate?: string): any[] {
  if (!startDate && !endDate) {
    return data;
  }
  
  return data.filter(item => {
    const itemDate = new Date(item.date);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    if (start && itemDate < start) return false;
    if (end && itemDate > end) return false;
    
    return true;
  });
}

function getCachedInputs(): any | null {
  if (inputsCache && Date.now() - inputsCache.timestamp < CACHE_TTL) {
    return inputsCache.data;
  }
  return null;
}

function setCachedInputs(data: any): void {
  inputsCache = { data, timestamp: Date.now() };
}

function getCachedData(key: string): any | null {
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.timestamp < DATA_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: any): void {
  dataCache.set(key, { data, timestamp: Date.now() });
}

// Get available RRG inputs (stocks, sectors, indexes)
router.get('/inputs', async (_req, res) => {
  try {
    console.log('🔄 Backend: Getting RRG inputs...');
    
    // Check cache first
    const cached = getCachedInputs();
    if (cached) {
      console.log('✅ Backend: Returning cached RRG inputs');
      return res.json(createSuccessResponse(cached, 'RRG inputs loaded from cache'));
    }
    
    const [stocks, sectors, indexes] = await Promise.all([
      listAvailableStocks(),
      listAvailableSectorsFromSector(),
      listAvailableIndexesForRrg()
    ]);
    
    const result = {
      stocks: stocks, // Return all stocks (no limit)
      sectors: sectors,
      index: indexes
    };
    
    console.log('✅ Backend: RRG inputs loaded:', {
      stocks: result.stocks.length,
      sectors: result.sectors.length,
      indexes: result.index.length
    });
    
    // Cache the result
    setCachedInputs(result);
    
    return res.json(createSuccessResponse(result, 'RRG inputs loaded successfully'));
  } catch (error) {
    console.error('❌ Backend: Error loading RRG inputs:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse('Failed to load RRG inputs', error instanceof Error ? error.message : String(error))
    );
  }
});

// Get RRG data for specific items
router.get('/data', async (req, res) => {
  try {
    const { type, items, index = 'COMPOSITE', startDate, endDate } = req.query;
    
    if (!type || !items) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse('Missing required parameters: type, items')
      );
    }
    
    const itemsArray = Array.isArray(items) ? items : [items];
    console.log(`🔄 Backend: Getting RRG data for ${type}:`, itemsArray, 'index:', index, 'startDate:', startDate, 'endDate:', endDate);
    
    // Check if generation is in progress
    const statusResult = getGenerationStatus();
    if (statusResult.isGenerating) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(
        createErrorResponse('RRG data is being generated, please wait...', undefined, 'GENERATION_IN_PROGRESS')
      );
    }
    
    // Create cache key
    const cacheKey = `${type}-${index}-${itemsArray.sort().join(',')}`;
    const cached = getCachedData(cacheKey);
    if (cached) {
      console.log(`✅ Backend: Returning cached RRG data for key: ${cacheKey}`);
      return res.json(createSuccessResponse(cached));
    }
    
    const results: any[] = [];
    
    if (type === 'stock') {
      for (const item of itemsArray) {
        const cleanedItem = (item as string).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const filePath = `${AZURE_CONFIG.outputDir}/stock/o1-rrg-${cleanedItem}.csv`;
        
        if (await exists(filePath)) {
          try {
            const csvContent = await downloadText(filePath);
            const lines = csvContent.split('\n').filter(line => line.trim());
            const data = lines.slice(1).map(line => {
              const [date, rs_ratio, rs_momentum] = line.split(',');
              return { 
                date: date || '', 
                rs_ratio: parseFloat(rs_ratio || '0'), 
                rs_momentum: parseFloat(rs_momentum || '0') 
              };
            });
            
            // Filter data by date range
            const filteredData = filterDataByDateRange(data, startDate as string, endDate as string);
            
            results.push({
              item: cleanedItem,
              data: filteredData
            });
          } catch (error) {
            console.error(`Error reading RRG data for ${cleanedItem}:`, error);
          }
        } else {
          // Generate on demand if file doesn't exist
          try {
            console.log(`⚠️ Backend: File not found in Azure, generating: ${filePath}`);
            const csvContent = await calculateRrgStock(cleanedItem, String(index || 'COMPOSITE'), AZURE_CONFIG);
            
            if (csvContent) {
              const lines = csvContent.split('\n').filter(line => line.trim());
              const data = lines.slice(1).map(line => {
                const [date, rs_ratio, rs_momentum] = line.split(',');
                return { 
                  date: date || '', 
                  rs_ratio: parseFloat(rs_ratio || '0'), 
                  rs_momentum: parseFloat(rs_momentum || '0') 
                };
              });
              
              // Filter data by date range
              const filteredData = filterDataByDateRange(data, startDate as string, endDate as string);
              
              results.push({
                item: cleanedItem,
                data: filteredData
              });
            }
          } catch (error) {
            console.error(`Error generating RRG data for ${cleanedItem}:`, error);
          }
        }
      }
    } else if (type === 'sector') {
      for (const item of itemsArray) {
        const cleanedItem = (item as string).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const filePath = `${AZURE_CONFIG.outputDir}/sector/o2-rrg-${cleanedItem}.csv`;
        
        if (await exists(filePath)) {
          try {
            const csvContent = await downloadText(filePath);
            const lines = csvContent.split('\n').filter(line => line.trim());
            const data = lines.slice(1).map(line => {
              const [date, rs_ratio, rs_momentum] = line.split(',');
              return { 
                date: date || '', 
                rs_ratio: parseFloat(rs_ratio || '0'), 
                rs_momentum: parseFloat(rs_momentum || '0') 
              };
            });
            
            // Filter data by date range
            const filteredData = filterDataByDateRange(data, startDate as string, endDate as string);
            
            results.push({
              item: cleanedItem,
              data: filteredData
            });
          } catch (error) {
            console.error(`Error reading RRG data for ${cleanedItem}:`, error);
          }
        } else {
          // Generate on demand if file doesn't exist
          try {
            console.log(`⚠️ Backend: File not found in Azure, generating: ${filePath}`);
            const csvContent = await calculateRrgSectorFromSector(cleanedItem, String(index || 'COMPOSITE'), AZURE_CONFIG);
            
            if (csvContent) {
              const lines = csvContent.split('\n').filter(line => line.trim());
              const data = lines.slice(1).map(line => {
                const [date, rs_ratio, rs_momentum] = line.split(',');
                return { 
                  date: date || '', 
                  rs_ratio: parseFloat(rs_ratio || '0'), 
                  rs_momentum: parseFloat(rs_momentum || '0') 
                };
              });
              
              // Filter data by date range
              const filteredData = filterDataByDateRange(data, startDate as string, endDate as string);
              
              results.push({
                item: cleanedItem,
                data: filteredData
              });
            }
          } catch (error) {
            console.error(`Error generating RRG data for ${cleanedItem}:`, error);
          }
        }
      }
    } else if (type === 'index') {
      for (const item of itemsArray) {
        const cleanedItem = (item as string).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const filePath = `${AZURE_CONFIG.outputDir}/index/o1-rrg-${cleanedItem}.csv`;
        
        if (await exists(filePath)) {
          try {
            const csvContent = await downloadText(filePath);
            const lines = csvContent.split('\n').filter(line => line.trim());
            const data = lines.slice(1).map(line => {
              const [date, rs_ratio, rs_momentum] = line.split(',');
              return { 
                date: date || '', 
                rs_ratio: parseFloat(rs_ratio || '0'), 
                rs_momentum: parseFloat(rs_momentum || '0') 
              };
            });
            
            results.push({
              item: cleanedItem,
              data: data
            });
          } catch (error) {
            console.error(`Error reading RRG data for ${cleanedItem}:`, error);
          }
        }
      }
    }
    
    console.log(`✅ Backend: RRG data retrieved for ${results.length} items`);
    const responseData = { results };
    
    // Cache the result
    setCachedData(cacheKey, responseData);
    
    return res.json(createSuccessResponse(responseData, 'RRG data retrieved successfully'));
    
  } catch (error) {
    console.error('❌ Backend: Error getting RRG data:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse('Failed to get RRG data', error instanceof Error ? error.message : String(error))
    );
  }
});

// Pre-generate all RRG data
router.post('/pre-generate', async (_req, res) => {
  try {
    console.log('🔄 Backend: Starting RRG pre-generation...');
    
    // Check if generation is already in progress
    const statusResult = getGenerationStatus();
    if (statusResult.isGenerating) {
      return res.status(HTTP_STATUS.CONFLICT).json(
        createErrorResponse('RRG generation is already in progress')
      );
    }
    
    // Start generation in background
    preGenerateAllRRG(true, 'manual').catch(error => {
      console.error('❌ Backend: Error in RRG pre-generation:', error);
    });
    
    return res.json(createSuccessResponse({ message: 'RRG pre-generation started' }, 'RRG pre-generation initiated'));
    
  } catch (error) {
    console.error('❌ Backend: Error starting RRG pre-generation:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse('Failed to start RRG pre-generation', error instanceof Error ? error.message : String(error))
    );
  }
});

// Get RRG generation status
router.get('/status', async (_req, res) => {
  try {
    const status = getGenerationStatus();
    res.json(createSuccessResponse(status, 'RRG status retrieved successfully'));
  } catch (error) {
    console.error('❌ Backend: Error getting RRG status:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse('Failed to get RRG status', error instanceof Error ? error.message : String(error))
    );
  }
});

// Debug: Trigger RRG update
router.post('/debug/trigger-update', async (_req, res) => {
  try {
    console.log('🔄 Backend: Triggering RRG update...');
    
    // Check if generation is already in progress
    const statusResult = getGenerationStatus();
    if (statusResult.isGenerating) {
      return res.status(HTTP_STATUS.CONFLICT).json(
        createErrorResponse('RRG generation is already in progress')
      );
    }
    
    // Start generation in background
    preGenerateAllRRG(true, 'debug').catch(error => {
      console.error('❌ Backend: Error in RRG update:', error);
    });
    
    return res.json(createSuccessResponse({ message: 'RRG update triggered successfully' }, 'RRG update initiated'));
    
  } catch (error) {
    console.error('❌ Backend: Error triggering RRG update:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse('Failed to trigger RRG update', error instanceof Error ? error.message : String(error))
    );
  }
});

// Debug: Stop RRG generation
router.post('/debug/stop-generation', (_req, res) => {
  try {
    // Note: This would need to be implemented in rrgAutoGenerate service
    res.json(createSuccessResponse({ message: 'RRG generation stop requested' }, 'RRG generation stop requested'));
  } catch (error) {
    console.error('❌ Backend: Error stopping RRG generation:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse('Failed to stop RRG generation', error instanceof Error ? error.message : String(error))
    );
  }
});

// Clear cache endpoint (useful after updates)
router.post('/debug/clear-cache', async (_req, res) => {
  try {
    inputsCache = null;
    dataCache.clear();
    console.log('🗑️ RRG cache cleared');
    return res.json(createSuccessResponse({ message: 'RRG cache cleared successfully' }));
  } catch (error) {
    console.error('❌ Error clearing RRG cache:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse('Failed to clear cache', error instanceof Error ? error.message : String(error))
    );
  }
});

// Get RRG Scanner Data
router.get('/scanner/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    if (type !== 'stock' && type !== 'sector') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse('Invalid scanner type. Must be "stock" or "sector"')
      );
    }
    
    const fileName = type === 'stock' ? 'o3-rrg.csv' : 'o4-rrg.csv';
    const filePath = `rrg_output/scanner/${fileName}`;
    
    if (!(await exists(filePath))) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        createErrorResponse(`${type} scanner data not found. Please generate RRG data first.`)
      );
    }
    
    const csvContent = await downloadText(filePath);
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        createErrorResponse('Scanner data is empty')
      );
    }
    
    // Parse CSV data
    const header = lines[0]?.split(',') || [];
    const data = lines.slice(1).map(line => {
      const values = line.split(',');
      const row: any = {};
      header.forEach((col, index) => {
        row[col.trim()] = values[index]?.trim() || '';
      });
      return row;
    });
    
    return res.json(createSuccessResponse({
      type,
      total: data.length,
      data
    }));
    
  } catch (error) {
    console.error(`❌ Error getting ${req.params.type} scanner data:`, error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(`Failed to get ${req.params.type} scanner data`, error instanceof Error ? error.message : String(error))
    );
  }
});

export default router;