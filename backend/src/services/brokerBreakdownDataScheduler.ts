import BrokerBreakdownCalculator from '../calculations/broker/broker_breakdown';

export class BrokerBreakdownDataScheduler {
  private calculator: BrokerBreakdownCalculator;

  constructor() {
    this.calculator = new BrokerBreakdownCalculator();
  }

  /**
   * Generate broker breakdown data for specific date or all files
   */
  async generateBrokerBreakdownData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Breakdown calculation for: ${targetDate}`);
      
      // Broker breakdown calculator processes specific date or all files
      const result = await this.calculator.generateBrokerBreakdownData(targetDate);
      
      if (result.success) {
        console.log('✅ Broker Breakdown calculation completed successfully');
      } else {
        console.error('❌ Broker Breakdown calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Breakdown calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker breakdown data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default BrokerBreakdownDataScheduler;
