import express from 'express';
import WatchlistCalculator from '../calculations/watchlist/watchlist';

const router = express.Router();
const watchlistCalculator = new WatchlistCalculator();

/**
 * Get watchlist data for specific stocks
 * Query params: symbols - comma-separated list of stock symbols (e.g., "BBRI,BBCA,BMRI")
 */
router.get('/', async (req, res) => {
  try {
    const { symbols } = req.query;
    
    if (!symbols || typeof symbols !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'symbols query parameter is required (comma-separated list of stock symbols)'
      });
    }

    // Parse symbols from comma-separated string
    const symbolArray = symbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
    
    if (symbolArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one valid stock symbol is required'
      });
    }

    console.log(`📊 Fetching watchlist data for ${symbolArray.length} stocks: ${symbolArray.join(', ')}`);
    
    const watchlistData = await watchlistCalculator.getWatchlistData(symbolArray);
    
    console.log(`✅ Watchlist data fetched successfully: ${watchlistData.length} stocks`);
    
    return res.json({
      success: true,
      data: {
        stocks: watchlistData,
        total: watchlistData.length,
        requested: symbolArray.length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting watchlist data:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to get watchlist data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

/**
 * Get watchlist data for specific stocks (POST method - accepts JSON body)
 * Body: { symbols: string[] }
 */
router.post('/', async (req, res) => {
  try {
    const { symbols } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'symbols array is required in request body'
      });
    }

    // Normalize symbols (uppercase)
    const symbolArray = symbols.map(s => String(s).trim().toUpperCase()).filter(s => s.length > 0);
    
    if (symbolArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one valid stock symbol is required'
      });
    }

    console.log(`📊 Fetching watchlist data for ${symbolArray.length} stocks: ${symbolArray.join(', ')}`);
    
    const watchlistData = await watchlistCalculator.getWatchlistData(symbolArray);
    
    console.log(`✅ Watchlist data fetched successfully: ${watchlistData.length} stocks`);
    
    return res.json({
      success: true,
      data: {
        stocks: watchlistData,
        total: watchlistData.length,
        requested: symbolArray.length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting watchlist data:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to get watchlist data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;

