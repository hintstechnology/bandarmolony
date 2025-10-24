import { Router } from 'express';
import BidAskCalculator from '../calculations/bidask/bid_ask';
import { downloadText, listPaths } from '../utils/azureBlob';

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

// Get bid/ask footprint data for specific stock and date
router.get('/stock/:code/:date', async (req, res) => {
  try {
    const { code, date } = req.params;
    
    if (!code || !date) {
      return res.status(400).json({
        success: false,
        error: 'Stock code and date are required'
      });
    }
    
    const stockCode = code.toUpperCase();
    console.log(`📊 Getting bid/ask data for: ${stockCode} on ${date}`);
    
    // Bid/ask files are in bid_ask/bid_ask_{YYYYMMDD}/{STOCK}.csv
    const filePath = `bid_ask/bid_ask_${date}/${stockCode}.csv`;
    
    try {
      const csvData = await downloadText(filePath);
      
      // Parse CSV data
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No bid/ask data found for ${stockCode} on ${date}`
        });
      }
      
      const headers = lines[0]?.split(',') || [];
      const data = lines.slice(1).map((line, index) => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index]?.trim() || '';
          // Numeric fields
          if (['Price', 'BidVolume', 'AskVolume', 'NetVolume', 'TotalVolume', 'BidCount', 'AskCount', 'UniqueBidBrokers', 'UniqueAskBrokers'].includes(header)) {
            row[header] = parseFloat(value) || 0;
          } else {
            row[header] = value;
          }
        });
        
        // Add time field for Buy/Sell Frequency calculation
        // Use index as time proxy (each row represents a time interval)
        const baseTime = new Date(`${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}T09:00:00Z`);
        const timeOffset = index * 60; // 1 minute intervals
        const time = new Date(baseTime.getTime() + timeOffset * 1000);
        
        row.Time = time.toISOString();
        row.time = time.getTime() / 1000; // Unix timestamp
        
        // Ensure unique timestamp by adding milliseconds if needed
        if (index > 0) {
          row.time = row.time + (index * 0.001); // Add milliseconds to ensure uniqueness
        }
        
        return row;
      });
      
      console.log(`📊 Retrieved ${data.length} bid/ask records for ${stockCode} on ${date}`);
      
      return res.json({
        success: true,
        data: {
          code: stockCode,
          date: date,
          data: data,
          total: data.length,
          generated_at: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error(`❌ Error getting bid/ask data for ${stockCode} on ${date}:`, error);
      return res.status(404).json({
        success: false,
        error: `No bid/ask data found for ${stockCode} on ${date}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error getting bid/ask data for ${req.params.code} on ${req.params.date}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get bid/ask data for ${req.params.code} on ${req.params.date}`
    });
  }
});

// Get available dates for bid/ask data
router.get('/dates', async (_req, res) => {
  try {
    const allFiles = await listPaths({ prefix: 'bid_ask/' });
    const dateFolders = allFiles
      .filter(file => file.includes('/bid_ask_') && file.endsWith('/'))
      .map(file => {
        const match = file.match(/bid_ask\/(\d{8})\//);
        return match ? match[1] : null;
      })
      .filter((date): date is string => date !== null)
      .sort()
      .reverse(); // Newest first
    
    return res.json({
      success: true,
      data: {
        dates: dateFolders,
        total: dateFolders.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get available dates: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get available stocks for specific date
router.get('/stocks/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }
    
    const allFiles = await listPaths({ prefix: `bid_ask/bid_ask_${date}/` });
    const stockFiles = allFiles
      .filter(file => file.endsWith('.csv') && !file.includes('ALL_STOCK'))
      .map(file => {
        const match = file.match(/bid_ask\/bid_ask_\d{8}\/([A-Z0-9]+)\.csv$/);
        return match ? match[1] : null;
      })
      .filter((stock): stock is string => stock !== null)
      .sort();
    
    return res.json({
      success: true,
      data: {
        date: date,
        stocks: stockFiles,
        total: stockFiles.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Failed to get available stocks for ${req.params.date}: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Get Buy/Sell Frequency data for specific stock and date
router.get('/frequency/:code/:date', async (req, res) => {
  try {
    const { code, date } = req.params;
    
    if (!code || !date) {
      return res.status(400).json({
        success: false,
        error: 'Stock code and date are required'
      });
    }
    
    const stockCode = code.toUpperCase();
    console.log(`📊 Getting Buy/Sell Frequency data for: ${stockCode} on ${date}`);
    
    // Get bid/ask data first
    const filePath = `bid_ask/bid_ask_${date}/${stockCode}.csv`;
    
    try {
      const csvData = await downloadText(filePath);
      
      // Parse CSV data
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No bid/ask data found for ${stockCode} on ${date}`
        });
      }
      
      const headers = lines[0]?.split(',') || [];
      const data = lines.slice(1).map((line, index) => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index]?.trim() || '';
          // Numeric fields
          if (['Price', 'BidVolume', 'AskVolume', 'NetVolume', 'TotalVolume', 'BidCount', 'AskCount', 'UniqueBidBrokers', 'UniqueAskBrokers'].includes(header)) {
            row[header] = parseFloat(value) || 0;
          } else {
            row[header] = value;
          }
        });
        
        // Add time field for Buy/Sell Frequency calculation
        // Use index as time proxy (each row represents a time interval)
        const baseTime = new Date(`${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}T09:00:00Z`);
        const timeOffset = index * 60; // 1 minute intervals
        const time = new Date(baseTime.getTime() + timeOffset * 1000);
        
        row.Time = time.toISOString();
        row.time = time.getTime() / 1000; // Unix timestamp
        
        // Ensure unique timestamp by adding milliseconds if needed
        if (index > 0) {
          row.time = row.time + (index * 0.001); // Add milliseconds to ensure uniqueness
        }
        
        return row;
      });
      
      // Aggregate data per day
      const dailyAggregates: { [dateKey: string]: { totalBidCount: number, totalAskCount: number, count: number } } = {};
      
      data.forEach(row => {
        const timeStr = row.Time || row.time || '';
        if (timeStr) {
          try {
            const date = new Date(timeStr);
            const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
            
            if (dateKey) {
              if (!dailyAggregates[dateKey]) {
                dailyAggregates[dateKey] = { totalBidCount: 0, totalAskCount: 0, count: 0 };
              }
              
              dailyAggregates[dateKey].totalBidCount += (row.BidCount || 0);
              dailyAggregates[dateKey].totalAskCount += (row.AskCount || 0);
              dailyAggregates[dateKey].count += 1;
            }
          } catch (error) {
            console.warn('Error parsing date:', timeStr, error);
          }
        }
      });
      
      // Convert to array format for frontend
      const aggregatedData = Object.entries(dailyAggregates).map(([dateKey, totals]) => ({
        Date: dateKey,
        Time: dateKey + 'T12:00:00Z', // Midday for display
        time: new Date(dateKey + 'T12:00:00Z').getTime() / 1000,
        BidCount: totals.totalBidCount,
        AskCount: totals.totalAskCount,
        RecordsCount: totals.count,
        Price: 0 // Not relevant for frequency
      }));
      
      console.log(`📊 Retrieved ${aggregatedData.length} daily aggregated Buy/Sell Frequency records for ${stockCode} on ${date}`);
      console.log('📊 Daily aggregates:', dailyAggregates);
      
      return res.json({
        success: true,
        data: {
          code: stockCode,
          date: date,
          data: aggregatedData,
          total: aggregatedData.length,
          generated_at: new Date().toISOString(),
          description: 'Buy/Sell Frequency data aggregated per day'
        }
      });
      
    } catch (error) {
      console.error(`❌ Error getting Buy/Sell Frequency data for ${stockCode} on ${date}:`, error);
      return res.status(404).json({
        success: false,
        error: `No bid/ask data found for ${stockCode} on ${date}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error getting Buy/Sell Frequency data for ${req.params.code} on ${req.params.date}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get Buy/Sell Frequency data for ${req.params.code} on ${req.params.date}`
    });
  }
});

// Download CSV for bid/ask data for specific stock and date
router.get('/download/:code/:date', async (req, res) => {
  try {
    const { code, date } = req.params;
    
    if (!code || !date) {
      return res.status(400).json({
        success: false,
        error: 'Stock code and date are required'
      });
    }
    
    const stockCode = code.toUpperCase();
    console.log(`📊 Downloading CSV for bid/ask data: ${stockCode} on ${date}`);
    
    // Get bid/ask data first
    const filePath = `bid_ask/bid_ask_${date}/${stockCode}.csv`;
    
    try {
      const csvData = await downloadText(filePath);
      
      // Parse CSV data to ensure it's valid
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No bid/ask data found for ${stockCode} on ${date}`
        });
      }
      
      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="bidask_${stockCode}_${date}.csv"`);
      
      // Send the CSV data directly
      res.send(csvData);
      
      console.log(`📊 CSV downloaded successfully for ${stockCode} on ${date}: ${lines.length} records`);
      return;
      
    } catch (error) {
      console.error(`❌ Error downloading CSV for ${stockCode} on ${date}:`, error);
      return res.status(404).json({
        success: false,
        error: `No bid/ask data found for ${stockCode} on ${date}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error downloading CSV for ${req.params.code} on ${req.params.date}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to download CSV for ${req.params.code} on ${req.params.date}`
    });
  }
});

// Download CSV for Buy/Sell Frequency data for specific stock and date
router.get('/frequency/download/:code/:date', async (req, res) => {
  try {
    const { code, date } = req.params;
    
    if (!code || !date) {
      return res.status(400).json({
        success: false,
        error: 'Stock code and date are required'
      });
    }
    
    const stockCode = code.toUpperCase();
    console.log(`📊 Downloading CSV for Buy/Sell Frequency data: ${stockCode} on ${date}`);
    
    // Get bid/ask data first
    const filePath = `bid_ask/bid_ask_${date}/${stockCode}.csv`;
    
    try {
      const csvData = await downloadText(filePath);
      
      // Parse CSV data
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No bid/ask data found for ${stockCode} on ${date}`
        });
      }
      
      const headers = lines[0]?.split(',') || [];
      const data = lines.slice(1).map((line, index) => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index]?.trim() || '';
          // Numeric fields
          if (['Price', 'BidVolume', 'AskVolume', 'NetVolume', 'TotalVolume', 'BidCount', 'AskCount', 'UniqueBidBrokers', 'UniqueAskBrokers'].includes(header)) {
            row[header] = parseFloat(value) || 0;
          } else {
            row[header] = value;
          }
        });
        
        // Add time field for Buy/Sell Frequency calculation
        const baseTime = new Date(`${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}T09:00:00Z`);
        const timeOffset = index * 60; // 1 minute intervals
        const time = new Date(baseTime.getTime() + timeOffset * 1000);
        
        row.Time = time.toISOString();
        row.time = time.getTime() / 1000; // Unix timestamp
        
        // Ensure unique timestamp by adding milliseconds if needed
        if (index > 0) {
          row.time = row.time + (index * 0.001); // Add milliseconds to ensure uniqueness
        }
        
        return row;
      });
      
      // Aggregate data per day
      const dailyAggregates: { [dateKey: string]: { totalBidCount: number, totalAskCount: number, count: number } } = {};
      
      data.forEach(row => {
        const timeStr = row.Time || row.time || '';
        if (timeStr) {
          try {
            const date = new Date(timeStr);
            const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
            
            if (dateKey) {
              if (!dailyAggregates[dateKey]) {
                dailyAggregates[dateKey] = { totalBidCount: 0, totalAskCount: 0, count: 0 };
              }
              
              dailyAggregates[dateKey].totalBidCount += (row.BidCount || 0);
              dailyAggregates[dateKey].totalAskCount += (row.AskCount || 0);
              dailyAggregates[dateKey].count += 1;
            }
          } catch (error) {
            console.warn('Error parsing date:', timeStr, error);
          }
        }
      });
      
      // Convert to CSV format for download
      const csvHeaders = ['Date', 'Time', 'BidCount', 'AskCount', 'RecordsCount', 'Price'];
      const csvRows = Object.entries(dailyAggregates).map(([dateKey, totals]) => [
        dateKey,
        dateKey + 'T12:00:00Z',
        totals.totalBidCount,
        totals.totalAskCount,
        totals.count,
        0 // Price not relevant for frequency
      ]);
      
      // Create CSV content
      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.join(','))
      ].join('\n');
      
      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="buysell_frequency_${stockCode}_${date}.csv"`);
      
      // Send the CSV data
      res.send(csvContent);
      
      console.log(`📊 Buy/Sell Frequency CSV downloaded successfully for ${stockCode} on ${date}: ${csvRows.length} records`);
      return;
      
    } catch (error) {
      console.error(`❌ Error downloading Buy/Sell Frequency CSV for ${stockCode} on ${date}:`, error);
      return res.status(404).json({
        success: false,
        error: `No bid/ask data found for ${stockCode} on ${date}`
      });
    }
    
  } catch (error) {
    console.error(`❌ Error downloading Buy/Sell Frequency CSV for ${req.params.code} on ${req.params.date}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to download Buy/Sell Frequency CSV for ${req.params.code} on ${req.params.date}`
    });
  }
});

// Download CSV for multiple dates (Buy/Sell Frequency aggregated)
router.get('/frequency/download/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { dates } = req.query; // Comma-separated dates like "20241223,20241222,20241221"
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Stock code is required'
      });
    }
    
    const stockCode = code.toUpperCase();
    const dateList = dates ? (dates as string).split(',') : [];
    
    if (dateList.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one date is required'
      });
    }
    
    console.log(`📊 Downloading CSV for Buy/Sell Frequency data: ${stockCode} for ${dateList.length} dates`);
    
    // Collect all data from multiple dates
    const allData: any[] = [];
    
    for (const date of dateList) {
      try {
        const filePath = `bid_ask/bid_ask_${date}/${stockCode}.csv`;
        const csvData = await downloadText(filePath);
        
        // Parse CSV data
        const lines = csvData.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          console.log(`⚠️ No data found for ${stockCode} on ${date}`);
          continue;
        }
        
        const headers = lines[0]?.split(',') || [];
        const data = lines.slice(1).map((line, index) => {
          const values = line.split(',');
          const row: any = {};
          headers.forEach((header, index) => {
            const value = values[index]?.trim() || '';
            if (['Price', 'BidVolume', 'AskVolume', 'NetVolume', 'TotalVolume', 'BidCount', 'AskCount', 'UniqueBidBrokers', 'UniqueAskBrokers'].includes(header)) {
              row[header] = parseFloat(value) || 0;
            } else {
              row[header] = value;
            }
          });
          
          // Add time field
          const baseTime = new Date(`${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}T09:00:00Z`);
          const timeOffset = index * 60;
          const time = new Date(baseTime.getTime() + timeOffset * 1000);
          
          row.Time = time.toISOString();
          row.time = time.getTime() / 1000;
          
          if (index > 0) {
            row.time = row.time + (index * 0.001);
          }
          
          return row;
        });
        
        allData.push(...data);
        console.log(`✅ Added ${data.length} records from ${date}`);
        
      } catch (error) {
        console.warn(`⚠️ Error processing ${stockCode} on ${date}:`, error);
        continue;
      }
    }
    
    if (allData.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No bid/ask data found for ${stockCode} on any of the specified dates`
      });
    }
    
    // Aggregate data per day
    const dailyAggregates: { [dateKey: string]: { totalBidCount: number, totalAskCount: number, count: number } } = {};
    
    allData.forEach(row => {
      const timeStr = row.Time || row.time || '';
      if (timeStr) {
        try {
          const date = new Date(timeStr);
          const dateKey = date.toISOString().split('T')[0];
          
          if (dateKey) {
            if (!dailyAggregates[dateKey]) {
              dailyAggregates[dateKey] = { totalBidCount: 0, totalAskCount: 0, count: 0 };
            }
            
            dailyAggregates[dateKey].totalBidCount += (row.BidCount || 0);
            dailyAggregates[dateKey].totalAskCount += (row.AskCount || 0);
            dailyAggregates[dateKey].count += 1;
          }
        } catch (error) {
          console.warn('Error parsing date:', timeStr, error);
        }
      }
    });
    
    // Convert to CSV format for download
    const csvHeaders = ['Date', 'Time', 'BidCount', 'AskCount', 'RecordsCount', 'Price'];
    const csvRows = Object.entries(dailyAggregates)
      .sort(([a], [b]) => b.localeCompare(a)) // Sort by date descending
      .map(([dateKey, totals]) => [
        dateKey,
        dateKey + 'T12:00:00Z',
        totals.totalBidCount,
        totals.totalAskCount,
        totals.count,
        0
      ]);
    
    // Create CSV content
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="buysell_frequency_${stockCode}_${dateList.length}days.csv"`);
    
    // Send the CSV data
    res.send(csvContent);
    
    console.log(`📊 Multi-date Buy/Sell Frequency CSV downloaded successfully for ${stockCode}: ${csvRows.length} records across ${dateList.length} dates`);
    return;
    
  } catch (error) {
    console.error(`❌ Error downloading multi-date Buy/Sell Frequency CSV for ${req.params.code}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to download multi-date Buy/Sell Frequency CSV for ${req.params.code}`
    });
  }
});

export default router;
