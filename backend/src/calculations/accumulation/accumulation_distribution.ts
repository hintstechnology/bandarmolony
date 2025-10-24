import { downloadText, uploadText, listPaths } from '../../utils/azureBlob';

// Type definitions untuk Accumulation Distribution
interface BidAskData {
  StockCode: string;
  Price: number;
  BidVolume: number;
  AskVolume: number;
  NetVolume: number;
  TotalVolume: number;
  BidCount: number;
  AskCount: number;
  UniqueBidBrokers: number;
  UniqueAskBrokers: number;
}

interface StockData {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  Value: number;
  Frequency: number;
  ChangePercent: number;
}

interface AccumulationDistributionData {
  Symbol: string;
  W4: number;    // Week -4
  W3: number;    // Week -3
  W2: number;    // Week -2
  W1: number;    // Week -1
  D4: number;    // Day -4
  D3: number;    // Day -3
  D2: number;    // Day -2
  D1: number;    // Day -1
  D0: number;    // Day 0 (current)
  Percent1D: number;  // %1D
  VPercent1D: number; // V%1d
  VPercent3D: number; // V%3d
  VPercent5D: number; // V%5d
  VPercent10D: number; // V%10d
  VPercent20D: number; // V%20d
  VPercent50D: number; // V%50d
  VPercent100D: number; // V%100d
  AboveMA5: number;    // >ma5
  AboveMA10: number;   // >ma10
  AboveMA20: number;   // >ma20
  AboveMA50: number;   // >ma50
  AboveMA100: number;  // >ma100
  AboveMA200: number;  // >ma200
  Price: number;       // Current price
  Volume: number;     // Current volume
}

export class AccumulationDistributionCalculator {
  constructor() {
    // No need for Azure client initialization - using azureBlob utility
  }

  /**
   * Load bid/ask data from Azure Blob Storage
   */
  private async loadBidAskDataFromAzure(dateSuffix: string): Promise<BidAskData[]> {
    console.log(`Loading bid/ask data from Azure for date: ${dateSuffix}`);
    
    const blobName = `bid_ask/bid_ask_${dateSuffix}/ALL_STOCK.csv`;
    const content = await downloadText(blobName);
    
    const lines = content.trim().split('\n');
    const data: BidAskData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const values = line.split(',');
      if (values.length >= 10) {
        data.push({
          StockCode: values[0]?.trim() || '',
          Price: parseFloat(values[1]?.trim() || '0'),
          BidVolume: parseFloat(values[2]?.trim() || '0'),
          AskVolume: parseFloat(values[3]?.trim() || '0'),
          NetVolume: parseFloat(values[4]?.trim() || '0'),
          TotalVolume: parseFloat(values[5]?.trim() || '0'),
          BidCount: parseFloat(values[6]?.trim() || '0'),
          AskCount: parseFloat(values[7]?.trim() || '0'),
          UniqueBidBrokers: parseFloat(values[8]?.trim() || '0'),
          UniqueAskBrokers: parseFloat(values[9]?.trim() || '0')
        });
      }
    }
    
    console.log(`Loaded ${data.length} bid/ask records from Azure`);
    return data;
  }

  /**
   * Load stock data from Azure Blob Storage
   */
  private async loadStockDataFromAzure(stockCode: string): Promise<StockData[]> {
    // Try to find stock in sector subfolders
    const sectors = ['Technology', 'Finance', 'Consumer', 'Industrial', 'Energy', 'Healthcare', 'Materials', 'Utilities', 'Real Estate', 'Communication'];
    let blobName = `stock/${stockCode}.csv`;
    let content = '';
    
    // First try direct path
    try {
      content = await downloadText(blobName);
    } catch (error) {
      // Try sector subfolders
      let found = false;
      for (const sector of sectors) {
        try {
          blobName = `stock/${sector}/${stockCode}.csv`;
          content = await downloadText(blobName);
          found = true;
          break;
        } catch (sectorError) {
          // Continue to next sector
        }
      }
      if (!found) {
        throw new Error(`Stock ${stockCode} not found in any sector folder`);
      }
    }
    
    try {
    
    const lines = content.trim().split('\n');
    const data: StockData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const values = line.split(',');
      if (values.length >= 9) {
        data.push({
          Date: values[0]?.trim() || '',
          Open: parseFloat(values[1]?.trim() || '0'),
          High: parseFloat(values[2]?.trim() || '0'),
          Low: parseFloat(values[3]?.trim() || '0'),
          Close: parseFloat(values[4]?.trim() || '0'),
          Volume: parseFloat(values[5]?.trim() || '0'),
          Value: parseFloat(values[6]?.trim() || '0'),
          Frequency: parseFloat(values[7]?.trim() || '0'),
          ChangePercent: parseFloat(values[8]?.trim() || '0')
        });
      }
    }
    
    // Sort by date ascending
    data.sort((a, b) => a.Date.localeCompare(b.Date));
    return data;
    } catch (error) {
      console.error(`Error loading stock data for ${stockCode}:`, error);
      return [];
    }
  }

  /**
   * Calculate NetBuySell for a single day from bid/ask data
   */
  private calculateDailyNetBuySell(bidAskData: BidAskData[]): Map<string, number> {
    const dailyNetBuySell = new Map<string, number>();
    
    bidAskData.forEach(data => {
      const stockCode = data.StockCode;
      const netBuySell = (data.Price * data.BidVolume) - (data.Price * data.AskVolume);
      
      if (dailyNetBuySell.has(stockCode)) {
        dailyNetBuySell.set(stockCode, dailyNetBuySell.get(stockCode)! + netBuySell);
      } else {
        dailyNetBuySell.set(stockCode, netBuySell);
      }
    });
    
    return dailyNetBuySell;
  }

  /**
   * Calculate weekly accumulation (W-4 to W-1)
   */
  private calculateWeeklyAccumulation(
    dailyNetBuySellMap: Map<string, Map<string, number>>,
    stockCodes: string[]
  ): Map<string, { W4: number; W3: number; W2: number; W1: number }> {
    const weeklyAccumulation = new Map<string, { W4: number; W3: number; W2: number; W1: number }>();
    
    stockCodes.forEach(stockCode => {
      const dailyData = dailyNetBuySellMap.get(stockCode);
      if (!dailyData) {
        weeklyAccumulation.set(stockCode, { W4: 0, W3: 0, W2: 0, W1: 0 });
        return;
      }
      
      const dates = Array.from(dailyData.keys()).sort();
      const totalDays = dates.length;
      
      let w1 = 0, w2 = 0, w3 = 0, w4 = 0;
      
      // W-1: Last 5 days
      const w1Start = Math.max(0, totalDays - 5);
      for (let i = w1Start; i < totalDays; i++) {
        const date = dates[i];
        if (date) {
          w1 += dailyData.get(date) || 0;
        }
      }
      
      // W-2: Last 10 days
      const w2Start = Math.max(0, totalDays - 10);
      for (let i = w2Start; i < totalDays; i++) {
        const date = dates[i];
        if (date) {
          w2 += dailyData.get(date) || 0;
        }
      }
      
      // W-3: Last 15 days
      const w3Start = Math.max(0, totalDays - 15);
      for (let i = w3Start; i < totalDays; i++) {
        const date = dates[i];
        if (date) {
          w3 += dailyData.get(date) || 0;
        }
      }
      
      // W-4: Last 20 days
      const w4Start = Math.max(0, totalDays - 20);
      for (let i = w4Start; i < totalDays; i++) {
        const date = dates[i];
        if (date) {
          w4 += dailyData.get(date) || 0;
        }
      }
      
      weeklyAccumulation.set(stockCode, { W4: w4, W3: w3, W2: w2, W1: w1 });
    });
    
    return weeklyAccumulation;
  }

  /**
   * Calculate daily accumulation (D-4 to D0)
   */
  private calculateDailyAccumulation(
    dailyNetBuySellMap: Map<string, Map<string, number>>,
    stockCodes: string[]
  ): Map<string, { D4: number; D3: number; D2: number; D1: number; D0: number }> {
    const dailyAccumulation = new Map<string, { D4: number; D3: number; D2: number; D1: number; D0: number }>();
    
    stockCodes.forEach(stockCode => {
      const dailyData = dailyNetBuySellMap.get(stockCode);
      if (!dailyData) {
        dailyAccumulation.set(stockCode, { D4: 0, D3: 0, D2: 0, D1: 0, D0: 0 });
        return;
      }
      
      const dates = Array.from(dailyData.keys()).sort();
      const totalDays = dates.length;
      
      let d0 = 0, d1 = 0, d2 = 0, d3 = 0, d4 = 0;
      
      // D0: Current day (last day)
      if (totalDays >= 1) {
        const lastDate = dates[totalDays - 1];
        if (lastDate) {
          d0 = dailyData.get(lastDate) || 0;
        }
      }
      
      // D1: Current day + 1 day before
      if (totalDays >= 2) {
        const prevDate = dates[totalDays - 2];
        if (prevDate) {
          d1 = d0 + (dailyData.get(prevDate) || 0);
        } else {
          d1 = d0;
        }
      } else {
        d1 = d0;
      }
      
      // D2: Current day + 2 days before
      if (totalDays >= 3) {
        const prevDate = dates[totalDays - 3];
        if (prevDate) {
          d2 = d1 + (dailyData.get(prevDate) || 0);
        } else {
          d2 = d1;
        }
      } else {
        d2 = d1;
      }
      
      // D3: Current day + 3 days before
      if (totalDays >= 4) {
        const prevDate = dates[totalDays - 4];
        if (prevDate) {
          d3 = d2 + (dailyData.get(prevDate) || 0);
        } else {
          d3 = d2;
        }
      } else {
        d3 = d2;
      }
      
      // D4: Current day + 4 days before
      if (totalDays >= 5) {
        const prevDate = dates[totalDays - 5];
        if (prevDate) {
          d4 = d3 + (dailyData.get(prevDate) || 0);
        } else {
          d4 = d3;
        }
      } else {
        d4 = d3;
      }
      
      dailyAccumulation.set(stockCode, { D4: d4, D3: d3, D2: d2, D1: d1, D0: d0 });
    });
    
    return dailyAccumulation;
  }

  /**
   * Calculate percentage change (%1D)
   */
  private calculatePercentageChange(stockDataMap: Map<string, StockData[]>): Map<string, number> {
    const percentageChange = new Map<string, number>();
    
    stockDataMap.forEach((data, stockCode) => {
      if (data.length >= 2) {
        const latest = data[data.length - 1];
        const previous = data[data.length - 2];
        
        if (latest && previous) {
          const percentChange = ((latest.Close - previous.Close) / previous.Close) * 100;
          percentageChange.set(stockCode, Math.round(percentChange * 100) / 100);
        } else {
          percentageChange.set(stockCode, 0);
        }
      } else {
        percentageChange.set(stockCode, 0);
      }
    });
    
    return percentageChange;
  }

  /**
   * Calculate volume percentage changes
   */
  private calculateVolumePercentageChanges(stockDataMap: Map<string, StockData[]>): Map<string, {
    VPercent1D: number;
    VPercent3D: number;
    VPercent5D: number;
    VPercent10D: number;
    VPercent20D: number;
    VPercent50D: number;
    VPercent100D: number;
  }> {
    const volumePercentageChanges = new Map<string, {
      VPercent1D: number;
      VPercent3D: number;
      VPercent5D: number;
      VPercent10D: number;
      VPercent20D: number;
      VPercent50D: number;
      VPercent100D: number;
    }>();
    
    stockDataMap.forEach((data, stockCode) => {
      if (data.length < 2) {
        volumePercentageChanges.set(stockCode, {
          VPercent1D: 0, VPercent3D: 0, VPercent5D: 0, VPercent10D: 0,
          VPercent20D: 0, VPercent50D: 0, VPercent100D: 0
        });
        return;
      }
      
      const latest = data[data.length - 1];
      if (!latest) {
        volumePercentageChanges.set(stockCode, {
          VPercent1D: 0, VPercent3D: 0, VPercent5D: 0, VPercent10D: 0,
          VPercent20D: 0, VPercent50D: 0, VPercent100D: 0
        });
        return;
      }
      
      const calculateVPercent = (days: number): number => {
        if (data.length <= days) return 0;
        
        const avgVolume = data.slice(-days - 1, -1).reduce((sum, d) => sum + d.Volume, 0) / days;
        if (avgVolume === 0) return 0;
        
        return Math.round(((latest.Volume - avgVolume) / avgVolume) * 100 * 100) / 100;
      };
      
      volumePercentageChanges.set(stockCode, {
        VPercent1D: calculateVPercent(1),
        VPercent3D: calculateVPercent(3),
        VPercent5D: calculateVPercent(5),
        VPercent10D: calculateVPercent(10),
        VPercent20D: calculateVPercent(20),
        VPercent50D: calculateVPercent(50),
        VPercent100D: calculateVPercent(100)
      });
    });
    
    return volumePercentageChanges;
  }

  /**
   * Calculate moving average indicators
   */
  private calculateMovingAverageIndicators(stockDataMap: Map<string, StockData[]>): Map<string, {
    AboveMA5: number;
    AboveMA10: number;
    AboveMA20: number;
    AboveMA50: number;
    AboveMA100: number;
    AboveMA200: number;
  }> {
    const maIndicators = new Map<string, {
      AboveMA5: number;
      AboveMA10: number;
      AboveMA20: number;
      AboveMA50: number;
      AboveMA100: number;
      AboveMA200: number;
    }>();
    
    stockDataMap.forEach((data, stockCode) => {
      if (data.length === 0) {
        maIndicators.set(stockCode, {
          AboveMA5: 0, AboveMA10: 0, AboveMA20: 0,
          AboveMA50: 0, AboveMA100: 0, AboveMA200: 0
        });
        return;
      }
      
      const latest = data[data.length - 1];
      if (!latest) {
        maIndicators.set(stockCode, {
          AboveMA5: 0, AboveMA10: 0, AboveMA20: 0,
          AboveMA50: 0, AboveMA100: 0, AboveMA200: 0
        });
        return;
      }
      
      const calculateMA = (period: number): number => {
        if (data.length < period) return 0;
        
        const sum = data.slice(-period).reduce((sum, d) => sum + d.Close, 0);
        return sum / period;
      };
      
      const ma5 = calculateMA(5);
      const ma10 = calculateMA(10);
      const ma20 = calculateMA(20);
      const ma50 = calculateMA(50);
      const ma100 = calculateMA(100);
      const ma200 = calculateMA(200);
      
      maIndicators.set(stockCode, {
        AboveMA5: latest.Close > ma5 ? 1 : 0,
        AboveMA10: latest.Close > ma10 ? 1 : 0,
        AboveMA20: latest.Close > ma20 ? 1 : 0,
        AboveMA50: latest.Close > ma50 ? 1 : 0,
        AboveMA100: latest.Close > ma100 ? 1 : 0,
        AboveMA200: latest.Close > ma200 ? 1 : 0
      });
    });
    
    return maIndicators;
  }

  /**
   * Save data to Azure Blob Storage
   */
  private async saveToAzure(filename: string, data: AccumulationDistributionData[]): Promise<void> {
    if (data.length === 0) {
      console.log(`No data to save for ${filename}`);
      return;
    }
    
    const firstRow = data[0];
    if (!firstRow) {
      console.log(`No data to save for ${filename}`);
      return;
    }
    const headers = Object.keys(firstRow);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => row[header as keyof AccumulationDistributionData]).join(','))
    ].join('\n');
    
    await uploadText(filename, csvContent, 'text/csv');
    console.log(`Saved ${data.length} records to ${filename}`);
  }


  /**
   * Main function to generate accumulation distribution data
   */
  public async generateAccumulationDistributionData(_dateSuffix: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`Starting accumulation distribution calculation for ALL available bid_ask dates...`);

      // Discover all available bid_ask dates
      console.log("🔍 Searching for bid_ask folders in Azure...");
      
      // First, let's see what's actually in Azure
      console.log("🔍 Checking all blobs in Azure...");
      const allBlobs = await listPaths({ prefix: '' });
      console.log(`📁 Total blobs in Azure: ${allBlobs.length}`);
      console.log(`📋 Sample blobs:`, allBlobs.slice(0, 20));
      
      const blobs = await listPaths({ prefix: 'bid_ask/' });
      console.log(`📁 Found ${blobs.length} blobs with prefix 'bid_ask/':`, blobs.slice(0, 10));
      
      const allDates: string[] = [];
      for (const blobName of blobs) {
        console.log(`🔍 Processing blob: ${blobName}`);
        const pathParts = blobName.split('/');
        console.log(`📂 Path parts:`, pathParts);
        
        if (pathParts.length >= 2 && pathParts[0] === 'bid_ask') {
          const folderName = pathParts[1];
          console.log(`📁 Folder name: ${folderName}`);
          
          if (folderName && folderName.startsWith('bid_ask_')) {
            const date = folderName.replace('bid_ask_', '');
            console.log(`📅 Extracted date: ${date}`);
            if (/^\d{6}$/.test(date) || /^\d{8}$/.test(date)) {
              allDates.push(date);
              console.log(`✅ Added date: ${date}`);
            }
          }
        }
      }
      allDates.sort();
      console.log(`📊 Final dates found: ${allDates.join(', ')}`);

      console.log(`Found ${allDates.length} bid_ask dates to process`);
      
      if (allDates.length === 0) {
        console.log("⚠️ No bid_ask dates found in Azure - skipping accumulation distribution");
        return {
          success: true,
          message: "No bid_ask dates found - skipped accumulation distribution",
          data: []
        };
      }

      const createdFilesSummary: { date: string; file: string; count: number }[] = [];

      for (let di = 0; di < allDates.length; di++) {
        const dateSuffix = allDates[di];
        if (!dateSuffix) {
          console.log(`Skip undefined date at index ${di}`);
          continue;
        }
        console.log(`\n===== Processing accumulation for date ${dateSuffix} (${di + 1}/${allDates.length}) =====`);


        // Load bid/ask data for current date
        const bidAskData = await this.loadBidAskDataFromAzure(dateSuffix);
        const dailyNetBuySell = this.calculateDailyNetBuySell(bidAskData);

        // Get unique stock codes
        const stockCodes = Array.from(new Set(bidAskData.map(d => d.StockCode)));
        console.log(`Found ${stockCodes.length} unique stock codes`);

        // Create daily net buy/sell map for accumulation calculations
        const dailyNetBuySellMap = new Map<string, Map<string, number>>();
        stockCodes.forEach(stockCode => {
          dailyNetBuySellMap.set(stockCode, new Map());
        });
        // Add current date data
        stockCodes.forEach(stockCode => {
          const currentValue = dailyNetBuySell.get(stockCode) || 0;
          const mapRef = dailyNetBuySellMap.get(stockCode);
          if (mapRef) {
            mapRef.set(dateSuffix as string, currentValue);
          }
        });

        // Load up to 20 previous trading days
        const currentDateIndex = allDates.indexOf(dateSuffix);
        if (currentDateIndex > 0) {
          const previousDates = allDates.slice(Math.max(0, currentDateIndex - 20), currentDateIndex);
          console.log(`Loading previous dates: ${previousDates.join(', ')}`);
          for (const prevDate of previousDates) {
            try {
              const prevBidAskData = await this.loadBidAskDataFromAzure(prevDate);
              const prevDailyNetBuySell = this.calculateDailyNetBuySell(prevBidAskData);
              stockCodes.forEach(stockCode => {
                const prevValue = prevDailyNetBuySell.get(stockCode) || 0;
                const mapRef = dailyNetBuySellMap.get(stockCode);
                if (mapRef && prevDate) {
                  mapRef.set(prevDate as string, prevValue);
                }
              });
            } catch (error) {
              console.log(`Error loading data for ${prevDate}: ${error}`);
            }
          }
        }

        // Load stock data for all stocks
        const stockDataMap = new Map<string, StockData[]>();
        for (const stockCode of stockCodes) {
          const stockData = await this.loadStockDataFromAzure(stockCode);
          if (stockData.length > 0) {
            stockDataMap.set(stockCode, stockData);
          }
        }

        // Calculate all metrics
        const weeklyAccumulation = this.calculateWeeklyAccumulation(dailyNetBuySellMap, stockCodes);
        const dailyAccumulation = this.calculateDailyAccumulation(dailyNetBuySellMap, stockCodes);
        const percentageChange = this.calculatePercentageChange(stockDataMap);
        const volumePercentageChanges = this.calculateVolumePercentageChanges(stockDataMap);
        const maIndicators = this.calculateMovingAverageIndicators(stockDataMap);

        // Combine all data
        const accumulationData: AccumulationDistributionData[] = [];
        stockCodes.forEach(stockCode => {
          const stockData = stockDataMap.get(stockCode);
          if (!stockData || stockData.length === 0) return;
          const latest = stockData[stockData.length - 1];
          if (!latest) return;

          const weekly = weeklyAccumulation.get(stockCode) || { W4: 0, W3: 0, W2: 0, W1: 0 };
          const daily = dailyAccumulation.get(stockCode) || { D4: 0, D3: 0, D2: 0, D1: 0, D0: 0 };
          const percentChange = percentageChange.get(stockCode) || 0;
          const volumeChanges = volumePercentageChanges.get(stockCode) || {
            VPercent1D: 0, VPercent3D: 0, VPercent5D: 0, VPercent10D: 0,
            VPercent20D: 0, VPercent50D: 0, VPercent100D: 0
          };
          const maInd = maIndicators.get(stockCode) || {
            AboveMA5: 0, AboveMA10: 0, AboveMA20: 0,
            AboveMA50: 0, AboveMA100: 0, AboveMA200: 0
          };

          accumulationData.push({
            Symbol: stockCode,
            W4: Math.round(weekly.W4),
            W3: Math.round(weekly.W3),
            W2: Math.round(weekly.W2),
            W1: Math.round(weekly.W1),
            D4: Math.round(daily.D4),
            D3: Math.round(daily.D3),
            D2: Math.round(daily.D2),
            D1: Math.round(daily.D1),
            D0: Math.round(daily.D0),
            Percent1D: percentChange,
            VPercent1D: volumeChanges.VPercent1D,
            VPercent3D: volumeChanges.VPercent3D,
            VPercent5D: volumeChanges.VPercent5D,
            VPercent10D: volumeChanges.VPercent10D,
            VPercent20D: volumeChanges.VPercent20D,
            VPercent50D: volumeChanges.VPercent50D,
            VPercent100D: volumeChanges.VPercent100D,
            AboveMA5: maInd.AboveMA5,
            AboveMA10: maInd.AboveMA10,
            AboveMA20: maInd.AboveMA20,
            AboveMA50: maInd.AboveMA50,
            AboveMA100: maInd.AboveMA100,
            AboveMA200: maInd.AboveMA200,
            Price: latest.Close,
            Volume: latest.Volume
          });
        });

        // Save to Azure per-date
        const outputFilename = `accumulation_distribution/${dateSuffix as string}.csv`;
        await this.saveToAzure(outputFilename, accumulationData);
        createdFilesSummary.push({ date: dateSuffix, file: outputFilename, count: accumulationData.length });
        console.log(`Saved ${accumulationData.length} rows to ${outputFilename}`);
      }

      return {
        success: true,
        message: `Accumulation distribution generated for ${allDates.length} dates`,
        data: createdFilesSummary
      };
    } catch (error) {
      console.error('Error generating accumulation distribution data:', error);
      return {
        success: false,
        message: `Failed to generate accumulation distribution data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default AccumulationDistributionCalculator;
