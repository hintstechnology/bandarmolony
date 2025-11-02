import { Router } from 'express';
import { downloadText, listPaths } from '../utils/azureBlob';

const router = Router();

// Get list of available stocks from shareholders directory
router.get('/list', async (_req, res) => {
  try {
    console.log('📊 Getting list of available stocks from shareholders directory...');
    
    // Get all CSV files from shareholders directory
    const shareholderBlobs = await listPaths({ prefix: 'shareholders/' });
    
    // Extract stock codes from file names
    const stocks: string[] = [];
    for (const blobName of shareholderBlobs) {
      const fileName = blobName.replace('shareholders/', '').replace('.csv', '');
      if (fileName && fileName.length === 4) { // Only 4-character stock codes
        stocks.push(fileName);
      }
    }
    
    const sortedStocks = stocks.sort();
    console.log(`📊 Found ${sortedStocks.length} stocks in shareholders directory:`, sortedStocks.slice(0, 10), '...');
    
    return res.json({
      success: true,
      data: {
        stocks: sortedStocks,
        total: sortedStocks.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting shareholders stock list:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get shareholders stock list'
    });
  }
});

/**
 * GET /api/shareholders/stock/:code
 * Get shareholders data for a specific stock
 * 
 * Query params:
 * - limit: number of records to return (optional)
 * 
 * Response format:
 * {
 *   success: true,
 *   data: {
 *     code: string,
 *     shareholders: [...],
 *     summary: {
 *       totalShareholders: number,
 *       controllingPercentage: number,
 *       publicPercentage: number,
 *       lastUpdate: string
 *     },
 *     total: number,
 *     generated_at: string
 *   }
 * }
 */
router.get('/stock/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { limit } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Stock code is required'
      });
    }

    const stockCode = code.toUpperCase();
    console.log(`📊 Getting shareholders data for: ${stockCode}`);

    const filePath = `shareholders/${stockCode}.csv`;

    try {
      const csvData = await downloadText(filePath);

      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No shareholders data found for ${stockCode}`
        });
      }

      // Parse CSV headers
      const headers = lines[0]?.split(',') || [];
      
      // Parse all data rows
      const allData = lines.slice(1).map(line => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index]?.trim() || '';
          
          // Convert numeric fields
          if (header === 'PemegangSaham_Persentase') {
            row[header] = parseFloat(value) || 0;
          } else if (header === 'PemegangSaham_JmlSaham' || header === 'JumlahPemegangSaham') {
            row[header] = parseInt(value) || 0;
          } else {
            row[header] = value;
          }
        });
        return row;
      });

      // Sort by date descending (newest first) and percentage (highest first)
      // Data from CSV is already sorted descending from calculation, but ensure consistency
      allData.sort((a, b) => {
        // Primary sort: Date descending (newest first)
        const dateA = new Date(a.DataDate).getTime();
        const dateB = new Date(b.DataDate).getTime();
        const dateCompare = dateB - dateA;
        if (dateCompare !== 0) return dateCompare;
        // Secondary sort: Percentage descending (highest first)
        return (b.PemegangSaham_Persentase || 0) - (a.PemegangSaham_Persentase || 0);
      });

      // Get latest date
      const latestDate = allData[0]?.DataDate || '';
      
      // Filter to only latest date for summary calculations
      const latestData = allData.filter(row => row.DataDate === latestDate);

      // Calculate summary - count unique shareholders
      const uniqueShareholders = new Set(latestData.map(row => row.PemegangSaham_Nama).filter(name => name && name.trim()));
      const totalShareholders = uniqueShareholders.size;
      const controllingData = latestData.filter(row => 
        row.PemegangSaham_Kategori?.toLowerCase().includes('pengendali') || 
        row.PemegangSaham_Kategori?.toLowerCase().includes('lebih dari 5')
      );
      const controllingPercentage = controllingData.reduce((sum, row) => sum + row.PemegangSaham_Persentase, 0);
      
      const publicData = latestData.filter(row => 
        row.PemegangSaham_Kategori?.toLowerCase().includes('masyarakat')
      );
      const publicPercentage = publicData.reduce((sum, row) => sum + row.PemegangSaham_Persentase, 0);

      // Use ALL latest data (not limited) for shareholders list
      let shareholdersData = latestData;
      if (limit) {
        const limitNum = parseInt(String(limit));
        if (limitNum > 0) {
          shareholdersData = latestData.slice(0, limitNum);
        }
      }

      // Group data by date for historical analysis
      const historicalData: { [key: string]: any[] } = {};
      allData.forEach(row => {
        const date = row.DataDate;
        if (!historicalData[date]) {
          historicalData[date] = [];
        }
        historicalData[date].push(row);
      });

      // Create historical summary
      const historicalSummary = Object.entries(historicalData).map(([date, rows]) => {
        const controlling = rows
          .filter(row => 
            row.PemegangSaham_Kategori?.toLowerCase().includes('pengendali') || 
            row.PemegangSaham_Kategori?.toLowerCase().includes('lebih dari 5')
          )
          .reduce((sum, row) => sum + row.PemegangSaham_Persentase, 0);
        
        const publicShare = rows
          .filter(row => row.PemegangSaham_Kategori?.toLowerCase().includes('masyarakat'))
          .reduce((sum, row) => sum + row.PemegangSaham_Persentase, 0);
        
        const affiliate = rows
          .filter(row => row.PemegangSaham_Kategori?.toLowerCase().includes('afiliasi'))
          .reduce((sum, row) => sum + row.PemegangSaham_Persentase, 0);
        
        const others = 100 - controlling - publicShare - affiliate;

        return {
          period: date,
          controlling: parseFloat(controlling.toFixed(3)),
          public: parseFloat(publicShare.toFixed(3)),
          affiliate: parseFloat(affiliate.toFixed(3)),
          others: parseFloat(others.toFixed(3))
        };
      }).sort((a, b) => a.period.localeCompare(b.period));

      return res.json({
        success: true,
        data: {
          code: stockCode,
          shareholders: shareholdersData,
          summary: {
            totalShareholders,
            controllingPercentage: parseFloat(controllingPercentage.toFixed(3)),
            publicPercentage: parseFloat(publicPercentage.toFixed(3)),
            lastUpdate: latestData[0]?.LastUpdate || latestDate,
            latestDate
          },
          historical: historicalSummary,
          total: shareholdersData.length,
          generated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error(`❌ Error getting shareholders data for ${stockCode}:`, error);
      return res.status(404).json({
        success: false,
        error: `No shareholders data found for ${stockCode}`
      });
    }

  } catch (error) {
    console.error(`❌ Error getting shareholders data for ${req.params.code}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to get shareholders data for ${req.params.code}`
    });
  }
});

export default router;

