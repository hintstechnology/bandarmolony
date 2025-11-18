import BrokerSummaryCalculator from '../calculations/broker/broker_summary';

export class BrokerSummaryDataScheduler {
  private calculator: BrokerSummaryCalculator;

  constructor() {
    this.calculator = new BrokerSummaryCalculator();
  }

  /**
   * Generate broker summary data
   */
  async generateBrokerSummaryData(dateSuffix?: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || this.getCurrentDateSuffix();
      console.log(`🔄 Starting Broker Summary calculation for date: ${targetDate}`);
      
      const result = await this.calculator.generateBrokerSummaryData(targetDate, logId);
      
      if (result.success) {
        console.log('✅ Broker Summary calculation completed successfully');
      } else {
        console.error('❌ Broker Summary calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Summary calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker summary: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      message: 'Broker Summary service is ready to generate data'
    };
  }
}

export default BrokerSummaryDataScheduler;

