import { Router } from 'express';
import { downloadText, listPaths } from '../utils/azureBlob';

// Cache untuk menyimpan data yang sudah diambil
const dataCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 menit untuk data besar

// Cache untuk list dates dan stocks
const datesCache = { data: null as string[] | null, timestamp: 0 };
const stocksCache = { data: null as string[] | null, timestamp: 0 };

// Cache untuk parsed CSV headers (untuk menghindari parsing berulang)
const headersCache = new Map<string, string[]>();

// Advanced caching untuk data yang sudah diproses
const processedDataCache = new Map<string, { data: any; timestamp: number; fileSize: number }>();
const stockIndexCache = new Map<string, { [stock: string]: number[] }>(); // Index posisi row per stock

// Configuration untuk super optimization
const MAX_ROWS_PER_REQUEST = 5000; // Limit rows per request (dikurangi untuk performa)
const PRELOAD_CACHE_SIZE = 2; // Preload 2 files terbaru saja
const SUPER_CACHE_DURATION = 30 * 60 * 1000; // 30 menit untuk data yang sudah diproses
const CHUNK_SIZE = 500; // Process 500 rows at a time (lebih kecil)
const MAX_MEMORY_ROWS = 10000; // Max rows to keep in memory (dikurangi)

const router = Router();

// Helper function untuk check cache
const getCachedData = (key: string) => {
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
};

// Helper function untuk set cache
const setCachedData = (key: string, data: any) => {
  dataCache.set(key, { data, timestamp: Date.now() });
};

// Ultra fast streaming CSV parser dengan adaptive memory management
const parseCsvStreaming = async (filePath: string, targetStock?: string, limit?: number) => {
  const startTime = Date.now();
  
  try {
    // Get file content dengan timeout yang lebih lama
    console.log(`📥 Downloading: ${filePath}`);
    const downloadPromise = downloadText(filePath);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Download timeout')), 60000) // 60 detik
    );
    
    const csvContent = await Promise.race([downloadPromise, timeoutPromise]) as string;
    const lines = csvContent.split('\n');
    const totalLines = lines.length;
    
    // Get headers
    const headerLine = lines[0];
    let headers: string[];
    
    if (headerLine && headersCache.has(headerLine)) {
      headers = headersCache.get(headerLine)!;
    } else {
      headers = headerLine?.split(';') || [];
      if (headerLine) {
        headersCache.set(headerLine, headers);
      }
    }
    
    const stkCodeIndex = headers.indexOf('STK_CODE');
    const trxTimeIndex = headers.indexOf('TRX_TIME');
    
    if (totalLines < 2) {
      return { headers, data: [], stockIndex: {} };
    }
    
    // Adaptive memory management
    const maxRows = limit ? Math.min(limit, MAX_MEMORY_ROWS) : MAX_MEMORY_ROWS;
    const data: any[] = [];
    const stockIndex: { [stock: string]: number[] } = {};
    let dataIndex = 0;
    
    // Process in smaller chunks untuk memory efficiency
    for (let chunkStart = 1; chunkStart < totalLines && dataIndex < maxRows; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, totalLines, chunkStart + maxRows - dataIndex);
      
      // Process chunk synchronously untuk menghindari memory spike
      for (let i = chunkStart; i < chunkEnd; i++) {
        const line = lines[i];
        if (!line || !line.trim()) continue;
        
        const values = line.split(';');
        
        // Ultra fast stock filtering
        if (targetStock && stkCodeIndex !== -1) {
          const stockCode = values[stkCodeIndex]?.trim();
          if (stockCode !== targetStock) continue;
        }
        
        // Minimal object creation
        const row: any = {
          TRX_CODE: parseInt(values[0] || '0') || 0,
          TRX_SESS: parseInt(values[1] || '0') || 0,
          TRX_TYPE: values[2] || '',
          BRK_COD2: values[3] || '',
          INV_TYP2: values[4] || '',
          BRK_COD1: values[5] || '',
          INV_TYP1: values[6] || '',
          STK_CODE: values[7] || '',
          STK_VOLM: parseInt(values[8] || '0') || 0,
          STK_PRIC: parseInt(values[9] || '0') || 0,
          TRX_DATE: values[10] || '',
          TRX_ORD2: parseInt(values[11] || '0') || 0,
          TRX_ORD1: parseInt(values[12] || '0') || 0,
          TRX_TIME: parseInt(values[13] || '0') || 0
        };
        
        data.push(row);
        
        // Build stock index
        const stock = row.STK_CODE;
        if (!stockIndex[stock]) {
          stockIndex[stock] = [];
        }
        stockIndex[stock].push(dataIndex);
        
        dataIndex++;
      }
      
      // Memory check - jika terlalu besar, stop processing
      if (data.length > MAX_MEMORY_ROWS) {
        console.log(`⚠️ Memory limit reached, stopping at ${data.length} rows`);
        break;
      }
    }
    
    // Fast sort - hanya jika diperlukan
    if (trxTimeIndex !== -1 && data.length > 1) {
      data.sort((a: any, b: any) => a.TRX_TIME - b.TRX_TIME);
    }
    
    const endTime = Date.now();
    console.log(`⚡ Ultra fast streaming: ${data.length} rows in ${endTime - startTime}ms`);
    
    return { headers, data, stockIndex };
    
  } catch (error: any) {
    if (error.message.includes('timeout')) {
      console.log(`⏰ Download timeout for ${filePath}, skipping...`);
    } else {
      console.error(`❌ Ultra fast streaming failed:`, error.message);
    }
    return { headers: [], data: [], stockIndex: {} };
  }
};

// Ultra fast preload dengan streaming dan memory optimization
const preloadAndIndexData = async (filePath: string) => {
  const cacheKey = `preload-${filePath}`;
  const cached = processedDataCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < SUPER_CACHE_DURATION) {
    return cached.data;
  }
  
  console.log(`🚀 Ultra fast preloading: ${filePath}`);
  const startTime = Date.now();
  
  try {
    // Use streaming parser untuk performa maksimal
    const { headers, data, stockIndex } = await parseCsvStreaming(filePath);
    
    const result = { headers, data, stockIndex, fileSize: data.length * 100 }; // Estimate file size
    processedDataCache.set(cacheKey, { data: result, timestamp: Date.now(), fileSize: result.fileSize });
    stockIndexCache.set(filePath, stockIndex);
    
    const endTime = Date.now();
    console.log(`✅ Ultra fast preloaded: ${data.length} rows, ${Object.keys(stockIndex).length} stocks in ${endTime - startTime}ms`);
    
    return result;
  } catch (error: any) {
    if (error.message.includes('Blob not found')) {
      console.log(`⚠️ File not found: ${filePath}, skipping...`);
      // Cache empty result untuk menghindari retry
      const emptyResult = { headers: [], data: [], stockIndex: {}, fileSize: 0 };
      processedDataCache.set(cacheKey, { data: emptyResult, timestamp: Date.now(), fileSize: 0 });
      return emptyResult;
    }
    console.error(`❌ Ultra fast preload failed for ${filePath}:`, error);
    return null;
  }
};

// Helper function untuk get available dates dengan cache
const getAvailableDates = async (): Promise<string[]> => {
  if (datesCache.data && Date.now() - datesCache.timestamp < CACHE_DURATION) {
    return datesCache.data;
  }

  console.log('📊 Getting list of available dates from done-summary directory...');
  
  const doneSummaryBlobs = await listPaths({ prefix: 'done-summary/' });
  const dates: string[] = [];
  
  for (const blobName of doneSummaryBlobs) {
    // Extract date from path like "done-summary/20251020/DT251020.csv"
    const match = blobName.match(/done-summary\/(\d{8})\/DT\d{6}\.csv$/);
    if (match && match[1]) {
      const dateStr = match[1];
      // Convert YYYYMMDD to YYYY-MM-DD
      const formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      dates.push(formattedDate);
    }
  }
  
  const uniqueDates = [...new Set(dates)].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  
  console.log(`📊 Found ${uniqueDates.length} available dates:`, uniqueDates.slice(0, 10), '...');
  
  // Update cache
  datesCache.data = uniqueDates;
  datesCache.timestamp = Date.now();
  
  return uniqueDates;
};

// Ultra fast stock endpoint dengan preloading
router.get('/stock/:code/:date', async (req, res) => {
  try {
    const { code, date } = req.params;
    const { limit } = req.query;
    const startTime = Date.now();
    
    // Check super cache first
    const cacheKey = `${code}-${date}-${limit || 'all'}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      console.log(`⚡ Super cache hit for ${code} on ${date} (${Date.now() - startTime}ms)`);
      return res.json(cachedData);
    }
    
    console.log(`🚀 Ultra fast processing for ${code} on ${date}...`);
    
    // Construct the path
    const dateFormatted = date.replace(/-/g, '');
    const dtFormatted = `DT${dateFormatted.slice(2)}`;
    const filePath = `done-summary/${dateFormatted}/${dtFormatted}.csv`;
    
    // Check if we have preloaded data
    const preloadedData = await preloadAndIndexData(filePath);
    
    if (!preloadedData) {
      console.log(`⚠️ No data available for ${code} on ${date}`);
      const emptyResponse = {
        success: true,
        data: {
          stockCode: code,
          date: date,
          transactions: [],
          total: 0,
          headers: []
        }
      };
      setCachedData(cacheKey, emptyResponse);
      return res.json(emptyResponse);
    }
    
    // Ultra fast filtering menggunakan index
    let filteredData: any[];
    const stockIndex = preloadedData.stockIndex[code];
    
        if (stockIndex && stockIndex.length > 0) {
          // Use index untuk akses O(1) ke data
          const limitNum = limit ? Math.min(parseInt(String(limit)), MAX_ROWS_PER_REQUEST) : MAX_ROWS_PER_REQUEST;
          const indices = stockIndex.slice(0, limitNum);
          filteredData = indices.map((index: number) => preloadedData.data[index]);
        } else {
          filteredData = [];
        }
    
    const endTime = Date.now();
    console.log(`⚡ Ultra fast result: ${filteredData.length} rows in ${endTime - startTime}ms`);
    
    const response = {
      success: true,
      data: {
        stockCode: code,
        date: date,
        transactions: filteredData,
        total: filteredData.length,
        headers: preloadedData.headers
      }
    };
    
    // Cache the response
    setCachedData(cacheKey, response);
    
    return res.json(response);
    
  } catch (error) {
    console.error('❌ Error getting done summary data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get done summary data'
    });
  }
});

// Get list of available dates from done-summary directory
router.get('/dates', async (_req, res) => {
  try {
    const uniqueDates = await getAvailableDates();
    
    return res.json({
      success: true,
      data: {
        dates: uniqueDates,
        total: uniqueDates.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting done summary dates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get done summary dates'
    });
  }
});

// Get list of available stocks from done-summary directory
router.get('/stocks', async (_req, res) => {
  try {
    // Check cache first
    if (stocksCache.data && Date.now() - stocksCache.timestamp < CACHE_DURATION) {
      console.log(`⚡ Cache hit for stocks list`);
      return res.json({
        success: true,
        data: {
          stocks: stocksCache.data,
          total: stocksCache.data.length
        }
      });
    }

    console.log('📊 Getting list of available stocks from done-summary directory...');
    
    const doneSummaryBlobs = await listPaths({ prefix: 'done-summary/' });
    const stocks: string[] = [];
    
    // Process files in batches untuk performa lebih baik
    const batchSize = 10;
    const filePaths: string[] = [];
    
    // Collect all valid file paths first
    for (const blobName of doneSummaryBlobs) {
      const match = blobName.match(/done-summary\/(\d{8})\/DT\d{6}\.csv$/);
      if (match && match[1]) {
        const dateStr = match[1];
        const dtFormatted = `DT${dateStr.slice(2)}`;
        const filePath = `done-summary/${dateStr}/${dtFormatted}.csv`;
        filePaths.push(filePath);
      }
    }
    
    // Process files in batches
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (filePath) => {
        try {
          const csvContent = await downloadText(filePath);
          if (csvContent) {
            const lines = csvContent.split('\n').filter((line: string) => line.trim());
            if (lines.length > 1) {
              const headers = lines[0]?.split(';') || [];
              const stkCodeIndex = headers.indexOf('STK_CODE');
              
              if (stkCodeIndex !== -1) {
                const fileStocks: string[] = [];
                lines.slice(1).forEach((line: string) => {
                  const values = line.split(';');
                  const stockCode = values[stkCodeIndex]?.trim();
                  if (stockCode && stockCode.length === 4) {
                    fileStocks.push(stockCode);
                  }
                });
                return fileStocks;
              }
            }
          }
        } catch (error) {
          // Skip this file if there's an error
          console.log(`⚠️ Skipping file ${filePath}: ${error}`);
        }
        return [];
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(fileStocks => {
        stocks.push(...fileStocks);
      });
    }
    
    const uniqueStocks = [...new Set(stocks)].sort();
    
    console.log(`📊 Found ${uniqueStocks.length} available stocks:`, uniqueStocks.slice(0, 10), '...');
    
    // Update cache
    stocksCache.data = uniqueStocks;
    stocksCache.timestamp = Date.now();
    
    return res.json({
      success: true,
      data: {
        stocks: uniqueStocks,
        total: uniqueStocks.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting done summary stocks:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get done summary stocks'
    });
  }
});

// Super fast batch endpoint dengan parallel preloading
router.get('/batch/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { dates } = req.query;
    const startTime = Date.now();
    
    if (!dates || typeof dates !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Dates parameter is required'
      });
    }
    
    const dateList = dates.split(',');
    console.log(`🚀 Super fast batch processing ${dateList.length} dates for ${code}...`);
    
    // Preload all files in parallel untuk performa maksimal
    const preloadPromises = dateList.map(async (date) => {
      const dateFormatted = date.replace(/-/g, '');
      const dtFormatted = `DT${dateFormatted.slice(2)}`;
      const filePath = `done-summary/${dateFormatted}/${dtFormatted}.csv`;
      
      try {
        const preloadedData = await preloadAndIndexData(filePath);
        if (!preloadedData || preloadedData.data.length === 0) {
          console.log(`⚠️ No data available for ${code} on ${date}, skipping...`);
          return { date, data: { transactions: [], total: 0 } };
        }
        
        // Ultra fast filtering menggunakan index
        const stockIndex = preloadedData.stockIndex[code];
        let filteredData: any[];
        
        if (stockIndex && stockIndex.length > 0) {
          const indices = stockIndex.slice(0, MAX_ROWS_PER_REQUEST);
          filteredData = indices.map((index: number) => preloadedData.data[index]);
        } else {
          filteredData = [];
        }
        
        return { date, data: { transactions: filteredData, total: filteredData.length } };
        
      } catch (error: any) {
        console.log(`⚠️ Error processing ${code} on ${date}:`, error.message);
        return { date, data: { transactions: [], total: 0 } };
      }
    });
    
    const results = await Promise.all(preloadPromises);
    
    // Group results by date
    const dataByDate: { [date: string]: any } = {};
    results.forEach(({ date, data }) => {
      dataByDate[date] = data;
    });
    
    const endTime = Date.now();
    console.log(`⚡ Super fast batch completed: ${dateList.length} dates in ${endTime - startTime}ms`);
    
    return res.json({
      success: true,
      data: {
        stockCode: code,
        dataByDate,
        totalDates: dateList.length,
        processingTime: endTime - startTime
      }
    });
    
  } catch (error) {
    console.error('❌ Error in super fast batch processing:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process batch request'
    });
  }
});

// Pagination endpoint untuk data sangat besar
router.get('/pagination/:code/:date', async (req, res) => {
  try {
    const { code, date } = req.params;
    const { page = '1', pageSize = '1000', limit = '10000' } = req.query;
    
    const pageNum = parseInt(String(page));
    const pageSizeNum = parseInt(String(pageSize));
    const limitNum = parseInt(String(limit));
    
    const cacheKey = `${code}-${date}-page-${pageNum}-${pageSizeNum}-${limitNum}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      console.log(`⚡ Cache hit for pagination ${code} on ${date} page ${pageNum}`);
      return res.json(cachedData);
    }
    
    console.log(`📊 Getting paginated data for ${code} on ${date} (page ${pageNum}, size ${pageSizeNum})...`);
    
    const dateFormatted = date.replace(/-/g, '');
    const dtFormatted = `DT${dateFormatted.slice(2)}`;
    const filePath = `done-summary/${dateFormatted}/${dtFormatted}.csv`;
    
    let csvContent: string;
    try {
      csvContent = await downloadText(filePath);
    } catch (error: any) {
      if (error.message.includes('Blob not found')) {
        return res.json({
          success: true,
          data: {
            stockCode: code,
            date: date,
            transactions: [],
            total: 0,
            page: pageNum,
            pageSize: pageSizeNum,
            totalPages: 0,
            hasMore: false
          }
        });
      }
      throw error;
    }
    
    if (!csvContent) {
      return res.json({
        success: true,
        data: {
          stockCode: code,
          date: date,
          transactions: [],
          total: 0,
          page: pageNum,
          pageSize: pageSizeNum,
          totalPages: 0,
          hasMore: false
        }
      });
    }
    
    // Parse dengan limit yang lebih besar untuk menghitung total
    const { data: allData } = await parseCsvStreaming(filePath, code, limitNum);
    
    // Calculate pagination
    const total = allData.length;
    const totalPages = Math.ceil(total / pageSizeNum);
    const startIndex = (pageNum - 1) * pageSizeNum;
    const endIndex = Math.min(startIndex + pageSizeNum, total);
    const paginatedData = allData.slice(startIndex, endIndex);
    
    const response = {
      success: true,
      data: {
        stockCode: code,
        date: date,
        transactions: paginatedData,
        total: total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: totalPages,
        hasMore: pageNum < totalPages
      }
    };
    
    setCachedData(cacheKey, response);
    
    console.log(`✅ Pagination completed: ${paginatedData.length}/${total} rows for page ${pageNum}/${totalPages}`);
    
    return res.json(response);
    
  } catch (error) {
    console.error('❌ Error in pagination:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get paginated data'
    });
  }
});

// Ultra fast background preloading dengan lazy loading
const startBackgroundPreloading = async () => {
  console.log('🚀 Starting ultra fast background preloading...');
  
  try {
    // Get latest dates
    const dates = await getAvailableDates();
    const latestDates = dates.slice(0, PRELOAD_CACHE_SIZE);
    
    console.log(`📊 Ultra fast preloading ${latestDates.length} latest dates...`);
    
    // Preload latest dates in parallel dengan timeout
    const preloadPromises = latestDates.map(async (date, index) => {
      // Staggered start untuk menghindari memory spike
      await new Promise(resolve => setTimeout(resolve, index * 2000));
      
      const dateFormatted = date.replace(/-/g, '');
      const dtFormatted = `DT${dateFormatted.slice(2)}`;
      const filePath = `done-summary/${dateFormatted}/${dtFormatted}.csv`;
      
      console.log(`🔍 Debug path: ${filePath} (from date: ${date})`);
      
      try {
        // Set timeout untuk menghindari hanging (lebih lama)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Preload timeout')), 120000) // 2 menit
        );
        
        const result = await Promise.race([
          preloadAndIndexData(filePath),
          timeoutPromise
        ]);
        
        if (result && result.data.length > 0) {
          console.log(`✅ Ultra fast preloaded: ${date} (${result.data.length} rows)`);
        } else {
          console.log(`⚠️ No data available for ${date}, skipped`);
        }
      } catch (error: any) {
        if (error.message.includes('timeout')) {
          console.log(`⏰ Preload timeout for ${date}, skipping...`);
        } else {
          console.log(`⚠️ Failed to preload ${date}:`, error.message);
        }
      }
    });
    
    await Promise.allSettled(preloadPromises);
    console.log('🎉 Ultra fast background preloading completed!');
    
  } catch (error) {
    console.error('❌ Ultra fast background preloading failed:', error);
  }
};

// Start background preloading
setTimeout(startBackgroundPreloading, 5000); // Start after 5 seconds

// Cleanup old cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  // Clean processed data cache
  for (const [key, value] of processedDataCache.entries()) {
    if (now - value.timestamp > SUPER_CACHE_DURATION) {
      processedDataCache.delete(key);
      cleaned++;
    }
  }
  
  // Clean stock index cache
  for (const [key, value] of stockIndexCache.entries()) {
    if (now - (value as any).timestamp > SUPER_CACHE_DURATION) {
      stockIndexCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} old cache entries`);
  }
}, 10 * 60 * 1000); // Every 10 minutes

export default router;
