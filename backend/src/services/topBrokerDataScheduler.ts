import TopBrokerCalculator from '../calculations/broker/top_broker';

export class TopBrokerDataScheduler {
  private calculator: TopBrokerCalculator;

  constructor() {
    this.calculator = new TopBrokerCalculator();
  }

  /**
   * Generate top broker data
   */
  async generateTopBrokerData(dateSuffix?: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || this.getCurrentDateSuffix();
      console.log(`🔄 Starting Top Broker calculation for date: ${targetDate}`);
      
      const result = await this.calculator.generateTopBrokerData(targetDate, logId);
      
      if (result.success) {
        console.log('✅ Top Broker calculation completed successfully');
      } else {
        console.error('❌ Top Broker calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Top Broker calculation:', error);
      return {
        success: false,
        message: `Failed to generate top broker: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      message: 'Top Broker service is ready to generate data'
    };
  }
}

export default TopBrokerDataScheduler;

