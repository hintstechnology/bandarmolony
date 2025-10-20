import { Router } from 'express';
import MoneyFlowCalculator from '../calculations/moneyflow/money_flow';

const router = Router();
const moneyFlowCalculator = new MoneyFlowCalculator();

// Get money flow status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Money Flow Calculator',
        status: 'ready',
        description: 'Calculates Money Flow Index (MFI) for stocks and indices'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get money flow status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate money flow data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const result = await moneyFlowCalculator.generateMoneyFlowData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate money flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get money flow data
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
      error: `Failed to get money flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;
