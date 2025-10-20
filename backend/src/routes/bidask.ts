import { Router } from 'express';
import BidAskCalculator from '../calculations/bidask/bid_ask';

const router = Router();
const bidAskCalculator = new BidAskCalculator();

// Get bid/ask footprint status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Bid/Ask Footprint Calculator',
        status: 'ready',
        description: 'Analyzes bid/ask footprint per broker and stock'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get bid/ask footprint status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate bid/ask footprint data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const result = await bidAskCalculator.generateBidAskData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate bid/ask footprint data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get bid/ask footprint data
router.get('/data/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // For now, just return status since we need to implement data retrieval
    return res.json({
      success: true,
      data: {
        date,
        message: 'Data retrieval not yet implemented',
        note: 'Use generate endpoint to create data first'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get bid/ask footprint data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;
