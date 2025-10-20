import BidAskCalculator from '../calculations/bidask/bid_ask';

export class BidAskAutoGenerateService {
  private calculator: BidAskCalculator;

  constructor() {
    this.calculator = new BidAskCalculator();
  }

  /**
   * Generate bid/ask footprint data
   */
  async generateBidAskData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || this.getCurrentDateSuffix();
      console.log(`🔄 Starting Bid/Ask Footprint calculation for date: ${targetDate}`);
      
      const result = await this.calculator.generateBidAskData(targetDate);
      
      if (result.success) {
        console.log('✅ Bid/Ask Footprint calculation completed successfully');
      } else {
        console.error('❌ Bid/Ask Footprint calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Bid/Ask Footprint calculation:', error);
      return {
        success: false,
        message: `Failed to generate bid/ask footprint data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get current date suffix in YYMMDD format
   */
  private getCurrentDateSuffix(): string {
    const today = new Date();
    return today.toISOString().slice(2, 10).replace(/-/g, '');
  }

  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Bid/Ask Footprint service is ready to generate data'
    };
  }
}

export default BidAskAutoGenerateService;

