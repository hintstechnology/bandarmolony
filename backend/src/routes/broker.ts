import { Router } from 'express';
import BrokerDataCalculator from '../calculations/broker/broker_data';

const router = Router();
const brokerCalculator = new BrokerDataCalculator();

// Get broker data status
router.get('/status', async (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        service: 'Broker Data Calculator',
        status: 'ready',
        description: 'Analyzes broker activity and transactions'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get broker data status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate broker data
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const result = await brokerCalculator.generateBrokerData(date);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate broker data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get broker data
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
      error: `Failed to get broker data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;
