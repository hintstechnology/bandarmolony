import { Router } from 'express';
import ForeignFlowCalculator from '../calculations/foreign/foreign_flow';

const router = Router();
const foreignCalculator = new ForeignFlowCalculator();

// Get foreign flow status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Foreign Flow Calculator',
        status: 'ready',
        description: 'Analyzes foreign investor buy/sell flow per stock'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get foreign flow status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate foreign flow data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const result = await foreignCalculator.generateForeignFlowData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate foreign flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get foreign flow data
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
      error: `Failed to get foreign flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;
