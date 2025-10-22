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

interface EmitenDetail {
  Code: string;
  CompanyName: string;
  ListingDate: string;
  Shares: string;
  ListingBoard: string;
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
      let skippedLines = 0;
      let emptyLines = 0;
      let invalidLines = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        
        // Skip empty lines or lines with only commas
        if (!line || line === '' || /^,+\s*$/.test(line)) {
          emptyLines++;
          continue;
        }
        
        const values = line.split(',') || [];
        
        // Skip if not enough columns or all values are empty
        if (values.length < headers.length || values.every(v => !v.trim())) {
          invalidLines++;
          continue;
        }
        
        const row: any = {};

        headers.forEach((header, index) => {
          row[header.trim()] = values[index]?.trim() || '';
        });

        // Skip if essential fields are missing or empty
        if (!row.Date || !row.Close || row.Close === '' || row.Close === '0') {
          skippedLines++;
          continue;
        }

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

      // Log data quality info for debugging
      if (emptyLines > 0 || invalidLines > 0 || skippedLines > 0) {
        console.log(`📊 ${ticker}: Total lines=${lines.length-1}, Valid=${data.length}, Empty=${emptyLines}, Invalid=${invalidLines}, Skipped=${skippedLines}`);
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
      
      console.log(`📊 Found ${stocks.length} stock files in Azure`);
      console.log(`🔍 Sample stock paths:`, stocks.slice(0, 10).map(s => `stock/${s.sector}/${s.ticker}.csv`));
    } catch (error) {
      console.error(`❌ Error reading stocks from Azure: ${error}`);
    }

    return stocks;
  }

  private async loadEmitenDetailsFromAzure(): Promise<Map<string, EmitenDetail>> {
    const emitenMap = new Map<string, EmitenDetail>();

    try {
      const blobName = 'csv_input/emiten_detail_list.csv';
      const blobClient = this.blobServiceClient
        .getContainerClient(this.containerName)
        .getBlobClient(blobName);

      if (!(await blobClient.exists())) {
        console.warn('⚠️ Warning: emiten_detail_list.csv not found, using ticker as company name');
        return emitenMap;
      }

      const downloadResponse = await blobClient.download();
      const csvContent = await this.streamToString(downloadResponse.readableStreamBody!);
      const lines = csvContent.trim().split('\n');
      const headers = lines[0]?.split(',').map(h => h.trim()) || [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        
        // Skip empty lines or lines with only commas
        if (!line || line === '' || /^,+\s*$/.test(line)) {
          continue;
        }
        
        const values = line.split(',').map(v => v.trim()) || [];
        if (values.length >= headers.length) {
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          const emitenDetail: EmitenDetail = {
            Code: row.Code || '',
            CompanyName: row['Company Name'] || row.CompanyName || '',
            ListingDate: row['Listing Date'] || row.ListingDate || '',
            Shares: row.Shares || '',
            ListingBoard: row['Listing Board'] || row.ListingBoard || ''
          };

          if (emitenDetail.Code) {
            emitenMap.set(emitenDetail.Code, emitenDetail);
          }
        }
      }

      console.log(`✅ Loaded ${emitenMap.size} emiten details from Azure`);
    } catch (error) {
      console.error(`❌ Error loading emiten details from Azure: ${error}`);
    }

    return emitenMap;
  }

  private calculateTrend(data: StockData[], periodDays: number): { trend: string; changePct: number; latestPrice: number } | null {
    if (data.length < periodDays) {
      return null;
    }

    // Get data for the specified period
    const recentData = data.slice(-periodDays);

    // Calculate moving averages
    const shortWindow = Math.min(5, Math.max(1, Math.floor(recentData.length / 3)));
    const longWindow = Math.min(Math.floor(periodDays / 2), Math.max(1, Math.floor(recentData.length / 2)));

    // Calculate short MA
    const shortMA = recentData.slice(-shortWindow).reduce((sum, item) => sum + item.Close, 0) / shortWindow;

    // Calculate long MA
    const longMA = recentData.slice(-longWindow).reduce((sum, item) => sum + item.Close, 0) / longWindow;

    // Get latest values
    const latestPrice = recentData[recentData.length - 1]?.Close;
    const firstPrice = recentData[0]?.Close;

    // Calculate price change percentage (same as original)
    if (!latestPrice || !firstPrice) {
      return null;
    }
    
    // Handle zero price case
    if (firstPrice === 0) {
      // If first price is 0, use a very small value to avoid division by zero
      const changePct = latestPrice > 0 ? 100 : 0;
      return {
        trend: changePct > 0 ? 'Uptrend' : 'Sideways',
        changePct: changePct,
        latestPrice: parseFloat(latestPrice.toFixed(2))
      };
    }
    
    const changePct = ((latestPrice - firstPrice) / firstPrice) * 100;

    // Determine trend based on multiple criteria
    let trendScore = 0;

    // Criterion 1: Moving Average relationship
    if (shortMA > longMA) {
      trendScore += 1;
    } else if (shortMA < longMA) {
      trendScore -= 1;
    }

    // Criterion 2: Price position relative to moving averages
    if (latestPrice > shortMA) {
      trendScore += 1;
    } else if (latestPrice < shortMA) {
      trendScore -= 1;
    }

    // Criterion 3: Price change percentage
    if (changePct > 2) { // Strong uptrend threshold
      trendScore += 1;
    } else if (changePct < -2) { // Strong downtrend threshold
      trendScore -= 1;
    }

    // Criterion 4: Recent momentum (last 3 days vs previous 3 days)
    if (recentData.length >= 6) {
      const recent3d = recentData.slice(-3).reduce((sum, item) => sum + item.Close, 0) / 3;
      const previous3d = recentData.slice(-6, -3).reduce((sum, item) => sum + item.Close, 0) / 3;
      if (recent3d > previous3d) {
        trendScore += 1;
      } else if (recent3d < previous3d) {
        trendScore -= 1;
      }
    }

    // Determine final trend
    let trend: string;
    if (trendScore >= 2) {
      trend = 'Uptrend';
    } else if (trendScore <= -2) {
      trend = 'Downtrend';
    } else {
      trend = 'Sideways';
    }

    return {
      trend,
      changePct: parseFloat(changePct.toFixed(2)),
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
    const emitenDetails = await this.loadEmitenDetailsFromAzure();
    const results: { [period: string]: TrendSummary } = {};

    console.log(`📊 Processing ${allStocks.length} stocks for trend analysis...`);
    console.log(`📋 Loaded ${emitenDetails.size} emiten details for company names`);
    
    // Debug: Log some sample stocks
    console.log(`🔍 Sample stocks to process:`, allStocks.slice(0, 5));

    for (const period of timePeriods) {
      if (!periodMapping[period]) {
        continue;
      }

      const periodDays = periodMapping[period];
      const stocksData: TrendData[] = [];
      let noDataCount = 0;
      let noTrendCount = 0;
      let processedCount = 0;

      console.log(`⏰ Analyzing ${period} period (${periodDays} days)...`);

      // Process stocks in batches
      const BATCH_SIZE = 50;
      for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
        const batch = allStocks.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (stock) => {
          const data = await this.loadStockDataFromAzure(stock.sector, stock.ticker);
          
          if (data.length === 0) {
            noDataCount++;
            if (noDataCount <= 5) { // Log first 5 missing data cases
              console.log(`⚠️ No data found for ${stock.ticker} in sector ${stock.sector}`);
            }
            return null;
          }

          const trendResult = this.calculateTrend(data, periodDays);
          
          if (trendResult) {
            processedCount++;
            // Get company name from emiten details, fallback to ticker if not found
            const emitenDetail = emitenDetails.get(stock.ticker);
            const companyName = emitenDetail?.CompanyName || `${stock.ticker} Company`;

            return {
              Symbol: stock.ticker,
              Name: companyName,
              Price: trendResult.latestPrice,
              ChangePct: trendResult.changePct,
              Sector: stock.sector,
              Trend: trendResult.trend as 'Uptrend' | 'Sideways' | 'Downtrend',
              Period: period
            };
          } else {
            noTrendCount++;
            if (noTrendCount <= 5) { // Log first 5 no trend cases
              console.log(`⚠️ No trend calculated for ${stock.ticker} (${data.length} data points, need ${periodDays})`);
            }
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((result): result is TrendData => result !== null);
        stocksData.push(...validResults);

        console.log(`📊 Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allStocks.length / BATCH_SIZE)} for ${period} - Valid: ${validResults.length}/${batch.length}`);
      }

      console.log(`📊 ${period} Summary: Total=${allStocks.length}, Processed=${processedCount}, NoData=${noDataCount}, NoTrend=${noTrendCount}, Final=${stocksData.length}`);

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
