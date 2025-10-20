// seasonality.ts
// ------------------------------------------------------------
// API routes for seasonal analysis
// ------------------------------------------------------------

import express from 'express';
import { 
  forceRegenerate, 
  getGenerationStatus,
  generateIndexSeasonalityOnly,
  generateSectorSeasonalityOnly,
  generateStockSeasonalityOnly
} from '../services/seasonalityDataScheduler';
import { downloadText } from '../utils/azureBlob';

const router = express.Router();

/**
 * Get seasonal generation status
 */
router.get('/status', (_req, res) => {
  try {
    const status = getGenerationStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting seasonal status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get seasonal status'
    });
  }
});

/**
 * Generate all seasonal analysis
 */
router.post('/generate', async (req, res) => {
  try {
    const { triggerType = 'manual' } = req.body;
    
    console.log(`🔄 Manual seasonal generation triggered by user`);
    
    // Run generation in background
    forceRegenerate(triggerType as 'startup' | 'scheduled' | 'manual' | 'debug')
      .then(() => {
        console.log('✅ Seasonal generation completed successfully');
      })
      .catch((error) => {
        console.error('❌ Seasonal generation failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Seasonal generation started',
      data: {
        triggerType,
        status: 'running'
      }
    });
  } catch (error) {
    console.error('Error starting seasonal generation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start seasonal generation'
    });
  }
});

/**
 * Generate only index seasonality
 */
router.post('/generate/index', async (_req, res) => {
  try {
    console.log(`🔄 Manual index seasonality generation triggered by user`);
    
    // Run generation in background
    generateIndexSeasonalityOnly()
      .then(() => {
        console.log('✅ Index seasonality generation completed successfully');
      })
      .catch((error) => {
        console.error('❌ Index seasonality generation failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Index seasonality generation started',
      data: {
        status: 'running'
      }
    });
  } catch (error) {
    console.error('Error starting index seasonality generation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start index seasonality generation'
    });
  }
});

/**
 * Generate only sector seasonality
 */
router.post('/generate/sector', async (_req, res) => {
  try {
    console.log(`🔄 Manual sector seasonality generation triggered by user`);
    
    // Run generation in background
    generateSectorSeasonalityOnly()
      .then(() => {
        console.log('✅ Sector seasonality generation completed successfully');
      })
      .catch((error) => {
        console.error('❌ Sector seasonality generation failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Sector seasonality generation started',
      data: {
        status: 'running'
      }
    });
  } catch (error) {
    console.error('Error starting sector seasonality generation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start sector seasonality generation'
    });
  }
});

/**
 * Generate only stock seasonality
 */
router.post('/generate/stock', async (_req, res) => {
  try {
    console.log(`🔄 Manual stock seasonality generation triggered by user`);
    
    // Run generation in background
    generateStockSeasonalityOnly()
      .then(() => {
        console.log('✅ Stock seasonality generation completed successfully');
      })
      .catch((error) => {
        console.error('❌ Stock seasonality generation failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Stock seasonality generation started',
      data: {
        status: 'running'
      }
    });
  } catch (error) {
    console.error('Error starting stock seasonality generation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start stock seasonality generation'
    });
  }
});

/**
 * Get seasonal data by type
 */
router.get('/data/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate } = req.query;
    
    let filePath = '';
    let fileName = '';
    
    switch (type) {
      case 'index':
        filePath = 'seasonal_output/o1-seasonal-indexes.csv';
        fileName = 'o1-seasonal-indexes.csv';
        break;
      case 'sector':
        filePath = 'seasonal_output/o3-seasonal-sectors.csv';
        fileName = 'o3-seasonal-sectors.csv';
        break;
      case 'stock':
        filePath = 'seasonal_output/o2-seasonal-stocks.csv';
        fileName = 'o2-seasonal-stocks.csv';
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid type. Must be index, sector, or stock'
        });
    }
    
    // Download CSV data from Azure
    const csvData = await downloadText(filePath);
    
    // Parse CSV data
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No seasonal data found'
      });
    }
    
    const headers = lines[0]?.split(',') || [];
    const data = lines.slice(1).map(line => {
      const values = line.split(',');
      const row: any = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index]?.trim() || '';
      });
      return row;
    });
    
    console.log(`📊 Parsed ${type} data: ${data.length} rows from ${lines.length} lines`);
    if (data.length > 0) {
      console.log(`📊 Sample ${type} data:`, data[0]);
      
      // Check for duplicates in parsed data
      if (type === 'stock') {
        const tickers = data.map(row => row.Ticker || '').filter(Boolean);
        const uniqueTickers = [...new Set(tickers)];
        const duplicates = tickers.filter((ticker, index) => tickers.indexOf(ticker) !== index);
        
        if (duplicates.length > 0) {
          console.warn(`⚠️ Found ${duplicates.length} duplicate tickers in parsed data:`, duplicates.slice(0, 10));
        }
        
        console.log(`📊 Unique tickers: ${uniqueTickers.length} (from ${tickers.length} total)`);
      }
    }
    
    // Apply date filtering if provided
    let filteredData = data;
    if (startDate || endDate) {
      filteredData = data.filter(_row => {
        // For seasonal data, we don't have specific dates, so return all data
        // This is because seasonal data shows monthly patterns, not daily data
        return true;
      });
    }
    
    return res.json({
      success: true,
      data: {
        type,
        fileName,
        headers,
        data: filteredData,
        total: filteredData.length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error(`Error getting seasonal ${req.params.type} data:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get seasonal ${req.params.type} data`
    });
  }
});

/**
 * Get available seasonal data types
 */
router.get('/types', (_req, res) => {
  res.json({
    success: true,
    data: {
      types: [
        {
          type: 'index',
          name: 'Index Seasonality',
          description: 'Monthly seasonality analysis for market indexes',
          fileName: 'o1-seasonal-indexes.csv'
        },
        {
          type: 'sector',
          name: 'Sector Seasonality',
          description: 'Monthly seasonality analysis for market sectors',
          fileName: 'o3-seasonal-sectors.csv'
        },
        {
          type: 'stock',
          name: 'Stock Seasonality',
          description: 'Monthly seasonality analysis for individual stocks',
          fileName: 'o2-seasonal-stocks.csv'
        }
      ]
    }
  });
});

export default router;