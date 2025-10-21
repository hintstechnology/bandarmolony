import { Router } from 'express';
import TrendFilterDataScheduler from '../services/trendFilterDataScheduler';

const router = Router();
const trendFilterService = new TrendFilterDataScheduler();

// Get trend filter status
router.get('/status', async (_req, res) => {
  try {
    const status = trendFilterService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get trend filter status: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Generate trend filter data
router.post('/generate', async (_req, res) => {
  try {
    const result = await trendFilterService.generateTrendFilterData();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to generate trend filter data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get trend filter data
router.get('/data', async (req, res) => {
  try {
    const { period } = req.query;
    const result = await trendFilterService.getTrendFilterData(period as string);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get trend filter data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get trend filter data for specific period
router.get('/data/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const result = await trendFilterService.getTrendFilterData(period);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get trend filter data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get available periods
router.get('/periods', async (_req, res) => {
  try {
    const periods = ['3D', '5D', '2W', '1M'];
    res.json({
      success: true,
      data: periods
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get available periods: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;
