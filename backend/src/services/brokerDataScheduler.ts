import BrokerDataCalculator from '../calculations/broker/broker_data';

export class BrokerDataScheduler {
  private calculator: BrokerDataCalculator;

  constructor() {
    this.calculator = new BrokerDataCalculator();
  }

  /**
   * Generate broker data
   */
  async generateBrokerData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || this.getCurrentDateSuffix();
      console.log(`🔄 Starting Broker Data calculation for date: ${targetDate}`);
      
      const result = await this.calculator.generateBrokerData(targetDate);
      
      if (result.success) {
        console.log('✅ Broker Data calculation completed successfully');
      } else {
        console.error('❌ Broker Data calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Broker Data calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker data: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      message: 'Broker Data service is ready to generate data'
    };
  }
}

export default BrokerDataScheduler;

