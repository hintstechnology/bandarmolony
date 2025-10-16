import { Router } from 'express';
import { createErrorResponse, createSuccessResponse, HTTP_STATUS } from '../utils/responseUtils';
import { downloadText, exists } from '../utils/azureBlob';
import { 
  calculateRrcSector, 
  calculateRrcStock, 
  calculateRrcIndex,
  listAvailableSectors,
  listAvailableIndexes,
  listAvailableStocks
} from '../calculations/rrc/rrc_sector';
import { getGenerationStatus, preGenerateAllRRC } from '../services/rrcAutoGenerate';

const router = Router();

// Azure configuration
const AZURE_CONFIG = {
  stockDir: 'stock',
  indexDir: 'index', 
  outputDir: 'rrc_output'
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

// ---------- LIST INPUTS: Get available data from Azure ----------
router.get('/inputs', async (_req, res) => {
  try {
    console.log('🔄 Backend: Listing RRC inputs from Azure...');
    
    // Check cache first
    const cached = getCachedInputs();
    if (cached) {
      console.log('✅ Backend: Returning cached RRC inputs');
      return res.json(createSuccessResponse(cached));
    }
    
    // List available indexes
    const indexes = await listAvailableIndexes(AZURE_CONFIG.indexDir);
    console.log(`✅ Found ${indexes.length} indexes`);
    
    // List available sectors  
    const sectors = await listAvailableSectors(AZURE_CONFIG.stockDir);
    console.log(`✅ Found ${sectors.length} sectors`);
    
    // List available stocks
    const stocks = await listAvailableStocks(AZURE_CONFIG.stockDir);
    console.log(`✅ Found ${stocks.length} stocks`);
    
    const result = {
      index: indexes,
      stockSectors: sectors,
      stocks: stocks
    };
    
    // Cache the result
    setCachedInputs(result);
    
    console.log('✅ Backend: RRC inputs listed successfully');
    return res.json(createSuccessResponse(result));
    
  } catch (error: any) {
    console.error('❌ Backend: Error listing RRC inputs:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(error?.message || 'Failed to list RRC inputs'));
  }
});

// ---------- GET RRC DATA: Get RRC data with on-demand calculation ----------
router.get('/data', async (req, res) => {
  try {
    const { type, items, index = 'COMPOSITE' } = req.query;
    
    if (!type || !items) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse('Missing type or items parameter'));
    }
    
    const itemsArray = Array.isArray(items) ? items : [items];
    const maxItems = 5; // Maximum 5 items
    
    if (itemsArray.length > maxItems) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(`Maximum ${maxItems} items allowed`));
    }
    
    // Check if generation is in progress
    const generationStatus = getGenerationStatus();
    if (generationStatus.isGenerating) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(createErrorResponse(
        'Data sedang diperbarui, silakan coba lagi dalam beberapa saat',
        'GENERATION_IN_PROGRESS',
        undefined,
        HTTP_STATUS.SERVICE_UNAVAILABLE
      ));
    }
    
    console.log(`🔄 Backend: Getting RRC data for ${type}:`, itemsArray);
    
    // Create cache key
    const cacheKey = `${type}-${index}-${itemsArray.sort().join(',')}`;
    const cached = getCachedData(cacheKey);
    if (cached) {
      console.log(`✅ Backend: Returning cached RRC data for key: ${cacheKey}`);
      return res.json(createSuccessResponse(cached));
    }
    
    const results: any[] = [];
    
    for (const item of itemsArray) {
      try {
        let content: string | null = null;
        let filePath = '';
        
        if (type === 'stock') {
          const stockNameClean = (item as string).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          filePath = `rrc_output/stock/o1-rrc-${stockNameClean}.csv`;
          // Check if file exists in Azure
          const fileExists = await exists(filePath);
          
          if (fileExists) {
            console.log(`✅ Backend: File exists in Azure: ${filePath}`);
            content = await downloadText(filePath);
          } else {
            console.log(`⚠️ Backend: File not found in Azure, generating: ${filePath}`);
            content = await calculateRrcStock(item as string, AZURE_CONFIG);
          }
        } else if (type === 'sector') {
          const sectorNameClean = (item as string).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          filePath = `rrc_output/sector/o2-rrc-${sectorNameClean}.csv`;
          // Check if file exists in Azure
          const fileExists = await exists(filePath);
          
          if (fileExists) {
            console.log(`✅ Backend: File exists in Azure: ${filePath}`);
            content = await downloadText(filePath);
          } else {
            console.log(`⚠️ Backend: File not found in Azure, generating: ${filePath}`);
            content = await calculateRrcSector(item as string, AZURE_CONFIG);
          }
        } else if (type === 'index') {
          const indexNameClean = (item as string).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          filePath = `rrc_output/index/o1-rrc-${indexNameClean}.csv`;
          // Check if file exists in Azure
          const fileExists = await exists(filePath);
          
          if (fileExists) {
            console.log(`✅ Backend: File exists in Azure: ${filePath}`);
            content = await downloadText(filePath);
          } else {
            console.log(`⚠️ Backend: File not found in Azure, generating: ${filePath}`);
            content = await calculateRrcIndex(item as string, AZURE_CONFIG);
          }
        }
        
        if (content) {
          // Parse CSV content
          const lines = content.split('\n').filter(line => line.trim());
          const headers = lines[0]?.split(',') || [];
          const data = lines.slice(1).map(line => {
            const values = line.split(',');
            const row: any = {};
            headers.forEach((header, index) => {
              row[header.trim()] = values[index]?.trim();
            });
            return row;
          });
          
          results.push({
            item,
            type,
            data,
            headers
          });
        }
      } catch (error) {
        console.error(`❌ Backend: Error processing ${item}:`, error);
        // Continue with other items
      }
    }
    
    console.log(`✅ Backend: RRC data retrieved for ${results.length} items`);
    const responseData = { results, type, index };
    
    // Cache the result
    setCachedData(cacheKey, responseData);
    
    return res.json(createSuccessResponse(responseData));
    
  } catch (error: any) {
    console.error('❌ Backend: Error getting RRC data:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(error?.message || 'Failed to get RRC data'));
  }
});

// ---------- PRE-GENERATE: Bulk generate RRC outputs ----------
router.post('/pre-generate', async (_req, res) => {
  try {
    console.log('🔄 Backend: Pre-generating RRC outputs...');
    
    // Get available sectors
    const sectors = await listAvailableSectors(AZURE_CONFIG.stockDir);
    console.log(`📊 Found ${sectors.length} sectors to process`);
    
    const results: any[] = [];
    let processed = 0;
    let errors = 0;
    
    // Process each sector
    for (const sector of sectors) {
      try {
        console.log(`🔄 Processing sector: ${sector}`);
        await calculateRrcSector(sector, AZURE_CONFIG);
        results.push({ sector, status: 'success', type: 'sector' });
        processed++;
      } catch (error) {
        console.error(`❌ Error processing sector ${sector}:`, error);
        results.push({ sector, status: 'failed', error: (error as Error).message, type: 'sector' });
        errors++;
      }
    }
    
    
    console.log(`✅ Backend: RRC pre-generation completed`);
    console.log(`📊 Processed: ${processed}, Errors: ${errors}`);
    
    return res.json(createSuccessResponse({
      message: `RRC pre-generation completed. Processed: ${processed}, Errors: ${errors}`,
      results
    }));
    
  } catch (error: any) {
    console.error('❌ Backend: Error pre-generating RRC:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(error?.message || 'Failed to pre-generate RRC'));
  }
});

// ---------- GET GENERATION STATUS: Check if generation is in progress ----------
router.get('/status', async (_req, res) => {
  try {
    const status = getGenerationStatus();
    return res.json(createSuccessResponse(status));
  } catch (error: any) {
    console.error('❌ Backend: Error getting generation status:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(error?.message || 'Failed to get generation status'));
  }
});

// ---------- DEBUG: Manual trigger update (for testing) ----------
router.post('/debug/trigger-update', async (_req, res) => {
  try {
    console.log('🔧 DEBUG: Manual trigger update requested');
    
    // Check if generation is already running
    const currentStatus = getGenerationStatus();
    if (currentStatus.isGenerating) {
      return res.status(HTTP_STATUS.CONFLICT).json(createErrorResponse(
        'Generation already in progress',
        'GENERATION_IN_PROGRESS',
        undefined,
        HTTP_STATUS.CONFLICT
      ));
    }
    
    // Start generation in background with debug trigger type (don't await)
    preGenerateAllRRC(true, 'debug').then(() => {
      console.log('🔧 DEBUG: Manual trigger update completed');
    }).catch((error) => {
      console.error('🔧 DEBUG: Manual trigger update failed:', error);
    });
    
    return res.json(createSuccessResponse({
      message: 'Manual update triggered successfully',
      status: 'started',
      timestamp: new Date().toISOString()
    }));
    
  } catch (error: any) {
    console.error('❌ Backend: Error triggering manual update:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(error?.message || 'Failed to trigger manual update'));
  }
});

// ---------- DEBUG: Force stop generation (for testing) ----------
router.post('/debug/stop-generation', (_req, res) => {
  try {
    console.log('🔧 DEBUG: Force stop generation requested');
    
    // Import getGenerationStatus to check current status
    const currentStatus = getGenerationStatus();
    if (!currentStatus.isGenerating) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'No generation in progress',
        'NO_GENERATION',
        undefined,
        HTTP_STATUS.BAD_REQUEST
      ));
    }
    
    // Note: We can't actually stop the generation process easily
    // This is just for demonstration - in real implementation,
    // you'd need to implement a cancellation mechanism
    return res.json(createSuccessResponse({
      message: 'Stop generation requested (note: actual stop not implemented)',
      status: 'requested',
      timestamp: new Date().toISOString()
    }));
    
  } catch (error: any) {
    console.error('❌ Backend: Error stopping generation:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(error?.message || 'Failed to stop generation'));
  }
});

// Clear cache endpoint (useful after updates)
router.post('/debug/clear-cache', async (_req, res) => {
  try {
    inputsCache = null;
    dataCache.clear();
    console.log('🗑️ RRC cache cleared');
    return res.json(createSuccessResponse({ message: 'RRC cache cleared successfully' }));
  } catch (error) {
    console.error('❌ Error clearing RRC cache:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(error instanceof Error ? error.message : String(error)));
  }
});

export default router;
