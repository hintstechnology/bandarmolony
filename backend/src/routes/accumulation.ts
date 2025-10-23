import { Router } from 'express';
import AccumulationDistributionCalculator from '../calculations/accumulation/accumulation_distribution';

const router = Router();
const accumulationCalculator = new AccumulationDistributionCalculator();

// Get accumulation distribution status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Accumulation Distribution Calculator',
        status: 'ready',
        description: 'Calculates weekly/daily accumulation, volume percentages, and MA indicators'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get accumulation distribution status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate accumulation distribution data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const result = await accumulationCalculator.generateAccumulationDistributionData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate accumulation distribution data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get accumulation distribution data
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
      error: `Failed to get accumulation distribution data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;
