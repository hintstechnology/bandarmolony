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

export interface WatchlistStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdate?: string;
}

interface EmitenDetail {
  Code: string;
  CompanyName: string;
  ListingDate: string;
  Shares: string;
  ListingBoard: string;
}

export class WatchlistCalculator {
  private blobServiceClient: any;
  private containerName: string;

  private buildStockLookup(stocks: { sector: string; ticker: string }[]): Map<string, { sector: string; ticker: string }> {
    const lookup = new Map<string, { sector: string; ticker: string }>();
    stocks.forEach((stock) => {
      const ticker = stock.ticker.toUpperCase();
      lookup.set(ticker, { sector: stock.sector, ticker: stock.ticker });
    });
    return lookup;
  }

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

      return data.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime());
    } catch (error) {
      console.warn(`⚠️ Warning: Could not load data for ${ticker}: ${error}`);
      return [];
    }
  }

  public async getAllStocksFromAzure(): Promise<{ sector: string; ticker: string }[]> {
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
    } catch (error) {
      console.error(`❌ Error reading stocks from Azure: ${error}`);
    }

    return stocks;
  }

  public async loadEmitenDetailsFromAzure(): Promise<Map<string, EmitenDetail>> {
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

  /**
   * Get watchlist data for multiple stocks
   * @param symbols Array of stock symbols to get data for
   * @returns Array of watchlist stock data
   */
  public async getWatchlistData(
    symbols: string[],
    options?: {
      stockLookup?: Map<string, { sector: string; ticker: string }>;
      emitenDetails?: Map<string, EmitenDetail>;
    }
  ): Promise<WatchlistStock[]> {
    try {
      console.log(`📊 Fetching watchlist data for ${symbols.length} stocks...`);
      
      const normalizedSymbols = symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => symbol.length > 0);

      if (!normalizedSymbols.length) {
        return [];
      }

      const allStocks = options?.stockLookup
        ? null
        : await this.getAllStocksFromAzure();
      const stockLookup =
        options?.stockLookup ?? (allStocks ? this.buildStockLookup(allStocks) : new Map());

      const emitenDetails =
        options?.emitenDetails ?? (await this.loadEmitenDetailsFromAzure());

      // Get watchlist stocks data
      const watchlistStocks: WatchlistStock[] = [];
      
      // Process stocks in batches
      const BATCH_SIZE = 50;
      for (let i = 0; i < normalizedSymbols.length; i += BATCH_SIZE) {
        const batch = normalizedSymbols.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (symbol) => {
          const stock = stockLookup.get(symbol);
          if (!stock) {
            return null;
          }

          // Load stock data
          const data = await this.loadStockDataFromAzure(stock.sector, stock.ticker);
          
          if (data.length === 0) {
            return null;
          }

          // Get latest price data
          const latestData = data[0]; // Already sorted by date descending
          const previousData = data[1];

          // Check if latestData exists
          if (!latestData || !latestData.Close) {
            return null;
          }

          // Calculate change and change percent
          let change = 0;
          let changePercent = 0;

          if (previousData && latestData.Close && previousData.Close && previousData.Close > 0) {
            change = latestData.Close - previousData.Close;
            changePercent = (change / previousData.Close) * 100;
          }

          // Get company name from emiten details
          const emitenDetail = emitenDetails.get(symbol);
          const companyName = emitenDetail?.CompanyName || symbol;

          return {
            symbol: symbol,
            name: companyName,
            price: parseFloat(latestData.Close.toFixed(2)),
            change: parseFloat(change.toFixed(2)),
            changePercent: parseFloat(changePercent.toFixed(2)),
            lastUpdate: latestData.Date
          };
        });

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((result) => result !== null) as WatchlistStock[];
        watchlistStocks.push(...validResults);

        console.log(`📊 Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)} - Valid: ${validResults.length}/${batch.length}`);
      }

      console.log(`✅ Watchlist data fetched: ${watchlistStocks.length}/${symbols.length} stocks`);
      return watchlistStocks;
    } catch (error) {
      console.error('❌ Error fetching watchlist data:', error);
      throw error;
    }
  }

  /**
   * List all available stock tickers from Azure storage
   */
  public async listAllTickers(): Promise<string[]> {
    const stocks = await this.getAllStocksFromAzure();
    const uniqueTickers = new Set<string>();

    stocks.forEach((stock) => {
      if (stock.ticker) {
        uniqueTickers.add(stock.ticker.toUpperCase());
      }
    });

    return Array.from(uniqueTickers).sort();
  }
}

export default WatchlistCalculator;
