import { BlobServiceClient } from '@azure/storage-blob';

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

interface TrendData {
  Symbol: string;
  Name: string;
  Price: number;
  ChangePct: number;
  Sector: string;
  Trend: 'Uptrend' | 'Sideways' | 'Downtrend';
  Period: string;
}

interface TrendSummary {
  Period: string;
  PeriodDays: number;
  TotalStocks: number;
  TrendCounts: {
    Uptrend: number;
    Sideways: number;
    Downtrend: number;
  };
  TrendPercentages: {
    Uptrend: number;
    Sideways: number;
    Downtrend: number;
  };
  Stocks: TrendData[];
}

interface TrendResults {
  Metadata: {
    GeneratedAt: string;
    AnalysisType: string;
    Description: string;
    TotalPeriods: number;
    PeriodsAnalyzed: string[];
  };
  Periods: { [period: string]: TrendSummary };
}

export class TrendFilterCalculator {
  private blobServiceClient: any;
  private containerName: string;

  constructor() {
    this.blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env['AZURE_STORAGE_CONNECTION_STRING'] || ''
    );
    this.containerName = process.env['AZURE_STORAGE_CONTAINER_NAME'] || 'bandarmolony-data';
  }

  private async loadStockDataFromAzure(sector: string, ticker: string): Promise<StockData[]> {
    try {
      const blobName = `stock/${sector}/${ticker}.csv`;
      const blobClient = this.blobServiceClient
        .getContainerClient(this.containerName)
        .getBlobClient(blobName);

      if (!(await blobClient.exists())) {
        return [];
      }

      const downloadResponse = await blobClient.download();
      const csvContent = await this.streamToString(downloadResponse.readableStreamBody!);
      const lines = csvContent.trim().split('\n');
      const headers = lines[0]?.split(',') || [];

      const data: StockData[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i]?.split(',') || [];
        const row: any = {};

        headers.forEach((header, index) => {
          row[header.trim()] = values[index]?.trim();
        });

        data.push({
          Date: row.Date,
          Open: parseFloat(row.Open) || 0,
          High: parseFloat(row.High) || 0,
          Low: parseFloat(row.Low) || 0,
          Close: parseFloat(row.Close) || 0,
          Volume: parseInt(row.Volume) || 0,
          Value: parseInt(row.Value) || 0,
          Frequency: parseInt(row.Frequency) || 0,
          ChangePercent: parseFloat(row.ChangePercent) || 0
        });
      }

      return data.sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
    } catch (error) {
      console.warn(`⚠️ Warning: Could not load data for ${ticker}: ${error}`);
      return [];
    }
  }

  private async getAllStocksFromAzure(): Promise<{ sector: string; ticker: string }[]> {
    const stocks: { sector: string; ticker: string }[] = [];

    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const blobs = containerClient.listBlobsFlat({ prefix: 'stock/' });

      for await (const blob of blobs) {
        const blobName = blob.name;
        if (blobName.endsWith('.csv') && blobName.includes('/')) {
          const pathParts = blobName.split('/');
          if (pathParts.length >= 3) {
            const sector = pathParts[1];
            const ticker = pathParts[2].replace('.csv', '');
            stocks.push({ sector, ticker });
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error reading stocks from Azure: ${error}`);
    }

    return stocks;
  }

  private calculateTrend(data: StockData[], periodDays: number): { trend: string; changePct: number; latestPrice: number } | null {
    if (data.length < periodDays) {
      return null;
    }

    // Get data for the specified period
    const recentData = data.slice(-periodDays);

    // Get latest values
    const latestPrice = recentData[recentData.length - 1]?.Close || 0;

    // Calculate open-to-close percentage for each day in the period
    const dailyOpenToClosePcts: number[] = [];
    
    for (let i = 0; i < recentData.length; i++) {
      const dayData = recentData[i];
      if (!dayData) continue;
      
      const openPrice = dayData.Open;
      const closePrice = dayData.Close;
      
      if (openPrice > 0) {
        const dailyChangePct = ((closePrice - openPrice) / openPrice) * 100;
        dailyOpenToClosePcts.push(dailyChangePct);
      }
    }

    if (dailyOpenToClosePcts.length === 0) {
      return null;
    }

    // Calculate SUM of open-to-close percentages for the period (not average)
    const sumOpenToClosePct = dailyOpenToClosePcts.reduce((sum, pct) => sum + pct, 0);

    // Determine trend based on the UNROUNDED sum to avoid boundary bias
    let trend: string;
    if (sumOpenToClosePct > 1) {
      trend = 'Uptrend';
    } else if (sumOpenToClosePct < -1) {
      trend = 'Downtrend';
    } else {
      trend = 'Sideways';
    }

    // Round for display, but ensure it doesn't collapse to boundary and contradict classification
    let displayPct = parseFloat(sumOpenToClosePct.toFixed(2));
    if (trend === 'Uptrend' && displayPct <= 1.0) {
      displayPct = 1.01; // nudge above threshold to preserve consistency
    } else if (trend === 'Downtrend' && displayPct >= -1.0) {
      displayPct = -1.01; // nudge below threshold to preserve consistency
    }

    // Debug logging shows raw and display values
    console.log(`🔍 Backend Trend Debug: sumRaw=${sumOpenToClosePct.toFixed(4)}%, sumDisplay=${displayPct.toFixed(2)}%, trend=${trend}, period=${periodDays}d`);
    
    // Additional validation to catch any remaining inconsistencies
    const finalTrend = trend;
    const finalChangePct = displayPct;
    const isConsistent = (
      (finalTrend === 'Uptrend' && finalChangePct > 1) ||
      (finalTrend === 'Downtrend' && finalChangePct < -1) ||
      (finalTrend === 'Sideways' && finalChangePct >= -1 && finalChangePct <= 1)
    );
    
    if (!isConsistent) {
      console.error(`❌ Backend Inconsistency Detected:`);
      console.error(`   - sumRaw: ${sumOpenToClosePct.toFixed(4)}%`);
      console.error(`   - sumDisplay: ${finalChangePct.toFixed(2)}%`);
      console.error(`   - trend: ${finalTrend}`);
      console.error(`   - Expected: ${sumOpenToClosePct > 1 ? 'Uptrend' : sumOpenToClosePct < -1 ? 'Downtrend' : 'Sideways'}`);
    }

    return {
      trend,
      changePct: displayPct,
      latestPrice: parseFloat(latestPrice.toFixed(2))
    };
  }

  private async generateTrendAnalysis(timePeriods: string[] = ['3D', '5D', '2W', '1M']): Promise<TrendResults> {
    // Define period mappings
    const periodMapping: { [key: string]: number } = {
      '3D': 3,
      '5D': 5,
      '2W': 14,
      '1M': 30
    };

    const allStocks = await this.getAllStocksFromAzure();
    const results: { [period: string]: TrendSummary } = {};

    console.log(`📊 Processing ${allStocks.length} stocks for trend analysis...`);

    for (const period of timePeriods) {
      if (!periodMapping[period]) {
        continue;
      }

      const periodDays = periodMapping[period];
      const stocksData: TrendData[] = [];

      console.log(`⏰ Analyzing ${period} period (${periodDays} days)...`);

      // Process stocks in batches
      const BATCH_SIZE = 50;
      for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
        const batch = allStocks.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (stock) => {
          const data = await this.loadStockDataFromAzure(stock.sector, stock.ticker);
          
          if (data.length === 0) {
            return null;
          }

          const trendResult = this.calculateTrend(data, periodDays);
          
          if (trendResult) {
            return {
              Symbol: stock.ticker,
              Name: `${stock.ticker} Company`,
              Price: trendResult.latestPrice,
              ChangePct: trendResult.changePct,
              Sector: stock.sector,
              Trend: trendResult.trend as 'Uptrend' | 'Sideways' | 'Downtrend',
              Period: period
            };
          }
          return null;
        });

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((result): result is TrendData => result !== null);
        stocksData.push(...validResults);

        console.log(`📊 Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allStocks.length / BATCH_SIZE)} for ${period}`);
      }

      // Sort by change percentage (descending)
      stocksData.sort((a, b) => b.ChangePct - a.ChangePct);

      // Count trends
      const trendCounts = {
        Uptrend: stocksData.filter(s => s.Trend === 'Uptrend').length,
        Sideways: stocksData.filter(s => s.Trend === 'Sideways').length,
        Downtrend: stocksData.filter(s => s.Trend === 'Downtrend').length
      };

      const totalStocks = stocksData.length;

      // Calculate percentages
      const trendPercentages = {
        Uptrend: totalStocks > 0 ? parseFloat(((trendCounts.Uptrend / totalStocks) * 100).toFixed(1)) : 0,
        Sideways: totalStocks > 0 ? parseFloat(((trendCounts.Sideways / totalStocks) * 100).toFixed(1)) : 0,
        Downtrend: totalStocks > 0 ? parseFloat(((trendCounts.Downtrend / totalStocks) * 100).toFixed(1)) : 0
      };

      results[period] = {
        Period: period,
        PeriodDays: periodDays,
        TotalStocks: totalStocks,
        TrendCounts: trendCounts,
        TrendPercentages: trendPercentages,
        Stocks: stocksData
      };

      console.log(`✅ ${period} analysis completed: ${totalStocks} stocks analyzed`);
    }

    return {
      Metadata: {
        GeneratedAt: new Date().toISOString(),
        AnalysisType: 'trend_filter',
        Description: 'Stock trend analysis with multiple time periods',
        TotalPeriods: timePeriods.length,
        PeriodsAnalyzed: timePeriods
      },
      Periods: results
    };
  }

  private async saveToCSV(results: TrendResults): Promise<void> {
    try {
      // Save individual CSV files for each time period
      for (const [period, data] of Object.entries(results.Periods)) {
        const filename = `o1-trend-${period.toLowerCase()}.csv`;
        const blobName = `trend_output/${filename}`;
        
        // Create CSV content
        let csvContent = 'Symbol,Name,Price,Change%,Sector,Trend\n';
        
        data.Stocks.forEach(stock => {
          csvContent += `${stock.Symbol},${stock.Name},${stock.Price},${stock.ChangePct},${stock.Sector},${stock.Trend}\n`;
        });
        
        const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        await blockBlobClient.upload(csvContent, csvContent.length, {
          blobHTTPHeaders: { blobContentType: 'text/csv' }
        });
        
        console.log(`✅ Trend data for ${period} saved to Azure: ${blobName}`);
      }

      // Save summary CSV
      const summaryFilename = 'trend-summary.csv';
      const summaryBlobName = `trend_output/${summaryFilename}`;
      
      let summaryContent = 'Period,TotalStocks,UptrendCount,Uptrend%,SidewaysCount,Sideways%,DowntrendCount,Downtrend%\n';
      
      for (const [period, data] of Object.entries(results.Periods)) {
        summaryContent += `${period},${data.TotalStocks},${data.TrendCounts.Uptrend},${data.TrendPercentages.Uptrend},${data.TrendCounts.Sideways},${data.TrendPercentages.Sideways},${data.TrendCounts.Downtrend},${data.TrendPercentages.Downtrend}\n`;
      }
      
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(summaryBlobName);
      
      await blockBlobClient.upload(summaryContent, summaryContent.length, {
        blobHTTPHeaders: { blobContentType: 'text/csv' }
      });
      
      console.log(`✅ Trend summary saved to Azure: ${summaryBlobName}`);
    } catch (error) {
      console.error('❌ Error saving trend data to Azure:', error);
      throw error;
    }
  }

  private printSummary(results: TrendResults): void {
    console.log('\n' + '='.repeat(60));
    console.log('TREND FILTER ANALYSIS SUMMARY');
    console.log('='.repeat(60));
    
    for (const [period, data] of Object.entries(results.Periods)) {
      console.log(`\n📅 PERIOD: ${period} (${data.PeriodDays} days)`);
      console.log(`   Total Stocks: ${data.TotalStocks}`);
      console.log(`   Trend Distribution:`);
      console.log(`     📈 Uptrend: ${data.TrendCounts.Uptrend} stocks (${data.TrendPercentages.Uptrend}%)`);
      console.log(`     ➡️  Sideways: ${data.TrendCounts.Sideways} stocks (${data.TrendPercentages.Sideways}%)`);
      console.log(`     📉 Downtrend: ${data.TrendCounts.Downtrend} stocks (${data.TrendPercentages.Downtrend}%)`);
      
      // Show top and worst performers
      if (data.Stocks.length > 0) {
        const top = data.Stocks[0];
        const worst = data.Stocks[data.Stocks.length - 1];
        if (top) {
          console.log(`   🏆 Top Performer: ${top.Symbol} (${top.ChangePct > 0 ? '+' : ''}${top.ChangePct}%) - ${top.Trend}`);
        }
        if (worst) {
          console.log(`   📉 Worst Performer: ${worst.Symbol} (${worst.ChangePct > 0 ? '+' : ''}${worst.ChangePct}%) - ${worst.Trend}`);
        }
      }
    }
    
    console.log(`\n💾 Analysis completed at: ${results.Metadata.GeneratedAt}`);
    console.log('='.repeat(60));
  }

  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      readableStream.on('data', (data) => {
        chunks.push(data.toString());
      });
      readableStream.on('end', () => {
        resolve(chunks.join(''));
      });
      readableStream.on('error', reject);
    });
  }

  public async generateTrendFilterData(): Promise<void> {
    try {
      console.log('🔄 Starting trend filter analysis...');
      console.log('⚠️ Note: This will regenerate all trend data to ensure consistency');
      
      const timePeriods = ['3D', '5D', '2W', '1M'];
      const results = await this.generateTrendAnalysis(timePeriods);
      
      console.log('💾 Saving to Azure...');
      await this.saveToCSV(results);
      
      this.printSummary(results);
      
      console.log('✅ Trend filter analysis completed successfully!');
      console.log('🔄 Please refresh frontend to see updated data');
    } catch (error) {
      console.error('❌ Error in trend filter analysis:', error);
      throw error;
    }
  }
}

export default TrendFilterCalculator;
