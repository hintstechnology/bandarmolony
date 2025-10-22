import { Router } from 'express';
import { downloadText } from '../utils/azureBlob';
import { z } from 'zod';

const router = Router();

// Validation schemas
const brokerSummaryParamsSchema = z.object({
  stockCode: z.string().min(1, 'Stock code is required')
});

const brokerSummaryQuerySchema = z.object({
  date: z.string().regex(/^\d{8}$/, 'Date must be in YYYYMMDD format')
});

const brokerTransactionParamsSchema = z.object({
  brokerCode: z.string().min(1, 'Broker code is required')
});

const brokerTransactionQuerySchema = z.object({
  date: z.string().regex(/^\d{8}$/, 'Date must be in YYYYMMDD format')
});

const brokerInventoryParamsSchema = z.object({
  stockCode: z.string().min(1, 'Stock code is required')
});

const brokerInventoryQuerySchema = z.object({
  date: z.string().regex(/^\d{8}$/, 'Date must be in YYYYMMDD format')
});

/**
 * GET /api/broker/summary/:stockCode
 * Get broker summary data for a specific stock and date
 */
router.get('/summary/:stockCode', async (req, res) => {
  try {
    const { stockCode } = brokerSummaryParamsSchema.parse(req.params);
    const { date } = brokerSummaryQuerySchema.parse(req.query);
    
    // Convert YYYYMMDD to YYYYMMDD format for file path
    const dateStr = date;
    const filename = `broker_summary/broker_summary_${dateStr}/${stockCode}.csv`;
    
    console.log(`Fetching broker summary data for ${stockCode} on ${dateStr}`);
    
    // Download CSV data from Azure
    const csvData = await downloadText(filename);
    
    if (!csvData) {
      return res.status(404).json({
        success: false,
        error: `No broker summary data found for ${stockCode} on ${dateStr}`
      });
    }
    
    // Parse CSV data
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({
        success: false,
        error: 'Invalid broker summary data format'
      });
    }
    
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    const brokerData = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]?.split(',').map(v => v.trim()) || [];
      if (values.length !== headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields
        if (['nblot', 'nbval', 'bavg', 'sl', 'nslot', 'nsval', 'savg'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });
      
      brokerData.push(row);
    }
    
    return res.json({
      success: true,
      data: {
        stockCode,
        date: dateStr,
        brokerData
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching broker summary data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch broker summary data'
    });
  }
});

/**
 * GET /api/broker/transaction/:brokerCode
 * Get broker transaction data for a specific broker and date
 */
router.get('/transaction/:brokerCode', async (req, res) => {
  try {
    const { brokerCode } = brokerTransactionParamsSchema.parse(req.params);
    const { date } = brokerTransactionQuerySchema.parse(req.query);
    
    // Convert YYYYMMDD to YYYYMMDD format for file path
    const dateStr = date;
    const filename = `broker_transaction/broker_transaction_${dateStr}/${brokerCode}.csv`;
    
    console.log(`Fetching broker transaction data for ${brokerCode} on ${dateStr}`);
    
    // Download CSV data from Azure
    const csvData = await downloadText(filename);
    
    if (!csvData) {
      return res.status(404).json({
        success: false,
        error: `No broker transaction data found for ${brokerCode} on ${dateStr}`
      });
    }
    
    // Parse CSV data
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({
        success: false,
        error: 'Invalid broker transaction data format'
      });
    }
    
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    const transactionData = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]?.split(',').map(v => v.trim()) || [];
      if (values.length !== headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields
        if (['rsVal', 'hitLot', 'rsFreq', 'sAvg'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });
      
      transactionData.push(row);
    }
    
    return res.json({
      success: true,
      data: {
        brokerCode,
        date: dateStr,
        transactionData
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching broker transaction data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch broker transaction data'
    });
  }
});

/**
 * GET /api/broker/inventory/:stockCode
 * Get broker inventory data for a specific stock and date
 */
router.get('/inventory/:stockCode', async (req, res) => {
  try {
    const { stockCode } = brokerInventoryParamsSchema.parse(req.params);
    const { date } = brokerInventoryQuerySchema.parse(req.query);
    
    // Convert YYYYMMDD to YYYYMMDD format for file path
    const dateStr = date;
    const filename = `broker_inventory/broker_inventory_${dateStr}/${stockCode}.csv`;
    
    console.log(`Fetching broker inventory data for ${stockCode} on ${dateStr}`);
    
    // Download CSV data from Azure
    const csvData = await downloadText(filename);
    
    if (!csvData) {
      return res.status(404).json({
        success: false,
        error: `No broker inventory data found for ${stockCode} on ${dateStr}`
      });
    }
    
    // Parse CSV data
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return res.status(404).json({
        success: false,
        error: 'Invalid broker inventory data format'
      });
    }
    
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    const inventoryData = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]?.split(',').map(v => v.trim()) || [];
      if (values.length !== headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert numeric fields
        if (['inventory', 'netFlow', 'cumulativeNetFlow'].includes(header)) {
          row[header] = parseFloat(value || '0') || 0;
        } else {
          row[header] = value || '';
        }
      });
      
      inventoryData.push(row);
    }
    
    return res.json({
      success: true,
      data: {
        stockCode,
        date: dateStr,
        inventoryData
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching broker inventory data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch broker inventory data'
    });
  }
});

export default router;