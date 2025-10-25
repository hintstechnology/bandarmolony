import express from 'express';
import { BrokerInventoryCalculator } from '../calculations/broker/broker_inventory';

const router = express.Router();
const brokerInventoryCalculator = new BrokerInventoryCalculator();

/**
 * Generate broker inventory data
 */
router.post('/generate', async (_req, res) => {
  try {
    console.log('🔄 Starting broker inventory data generation...');
    
    const dateSuffix = new Date().toISOString().split('T')[0]?.replace(/-/g, '') || '';
    await brokerInventoryCalculator.generateBrokerInventoryData(dateSuffix);
    
    console.log('✅ Broker inventory data generation completed successfully');
    return res.json({ 
      success: true, 
      message: 'Broker inventory data generated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error generating broker inventory data:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to generate broker inventory data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get broker inventory data status
 */
router.get('/status', async (_req, res) => {
  try {
    // For now, just return a simple status
    // In the future, this could check if data exists in Azure
    return res.json({ 
      success: true, 
      status: 'Broker inventory service is running',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting broker inventory status:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to get broker inventory status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
