import TrendFilterCalculator from '../calculations/trend/trend_filter';

export class TrendFilterDataScheduler {
  private trendFilterCalculator: TrendFilterCalculator;
  private isGenerating: boolean = false;
  private lastGenerated: Date | null = null;

  constructor() {
    this.trendFilterCalculator = new TrendFilterCalculator();
  }

  public async generateTrendFilterData(): Promise<{ success: boolean; message: string; data?: any }> {
    if (this.isGenerating) {
      return {
        success: false,
        message: 'Trend filter generation is already in progress'
      };
    }

    try {
      this.isGenerating = true;
      console.log('🔄 Starting trend filter auto-generation...');

      await this.trendFilterCalculator.generateTrendFilterData();

      this.lastGenerated = new Date();
      this.isGenerating = false;

      return {
        success: true,
        message: 'Trend filter data generated successfully',
        data: {
          generatedAt: this.lastGenerated,
          status: 'completed'
        }
      };
    } catch (error) {
      this.isGenerating = false;
      console.error('❌ Error generating trend filter data:', error);
      return {
        success: false,
        message: `Failed to generate trend filter data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  public getStatus(): { isGenerating: boolean; lastGenerated: Date | null } {
    return {
      isGenerating: this.isGenerating,
      lastGenerated: this.lastGenerated
    };
  }

  public async getTrendFilterData(period?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { BlobServiceClient } = await import('@azure/storage-blob');
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env['AZURE_STORAGE_CONNECTION_STRING'] || ''
      );
      const containerName = process.env['AZURE_STORAGE_CONTAINER_NAME'] || 'bandarmolony-data';

      const containerClient = blobServiceClient.getContainerClient(containerName);

      // Get summary data
      const summaryBlobName = 'trend_output/trend-summary.csv';
      const summaryBlobClient = containerClient.getBlobClient(summaryBlobName);
      
      if (!(await summaryBlobClient.exists())) {
        return {
          success: false,
          error: 'Trend summary data not found. Please generate data first.'
        };
      }

      const summaryDownloadResponse = await summaryBlobClient.download();
      const summaryContent = await this.streamToString(summaryDownloadResponse.readableStreamBody!);
      const summaryLines = summaryContent.trim().split('\n').slice(1);
      
      const summary: any = {};
      for (const line of summaryLines) {
        const [periodName, totalStocks, uptrendCount, uptrendPct, sidewaysCount, sidewaysPct, downtrendCount, downtrendPct] = line.split(',');
        if (periodName?.toLowerCase() === (period || '5d').toLowerCase()) {
          summary.Period = periodName;
          summary.TotalStocks = parseInt(totalStocks || '0');
          summary.TrendCounts = {
            Uptrend: parseInt(uptrendCount || '0'),
            Sideways: parseInt(sidewaysCount || '0'),
            Downtrend: parseInt(downtrendCount || '0')
          };
          summary.TrendPercentages = {
            Uptrend: parseFloat(uptrendPct || '0'),
            Sideways: parseFloat(sidewaysPct || '0'),
            Downtrend: parseFloat(downtrendPct || '0')
          };
          break;
        }
      }

      // Get period data
      const periodBlobName = `trend_output/o1-trend-${(period || '5d').toLowerCase()}.csv`;
      const periodBlobClient = containerClient.getBlobClient(periodBlobName);
      
      if (!(await periodBlobClient.exists())) {
        return {
          success: false,
          error: `Trend data for period ${period || '5d'} not found. Please generate data first.`
        };
      }

      const periodDownloadResponse = await periodBlobClient.download();
      const periodContent = await this.streamToString(periodDownloadResponse.readableStreamBody!);
      const periodLines = periodContent.trim().split('\n').slice(1);
      
      const stocks: any[] = [];
      for (const line of periodLines) {
        const [symbol, name, price, changePct, sector, trend] = line.split(',');
        stocks.push({
          Symbol: symbol?.trim() || '',
          Name: name?.trim() || '',
          Price: parseFloat(price?.trim() || '0'),
          ChangePct: parseFloat(changePct?.trim() || '0'),
          Sector: sector?.trim() || '',
          Trend: trend?.trim() || '',
          Period: period || '5d'
        });
      }

      return {
        success: true,
        data: {
          summary,
          stocks,
          period: period || '5d'
        }
      };
    } catch (error) {
      console.error('Error retrieving trend filter data:', error);
      return {
        success: false,
        error: `Failed to retrieve trend filter data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
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
}

export default TrendFilterDataScheduler;
