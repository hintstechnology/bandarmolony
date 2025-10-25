import { BrokerInventoryCalculator } from '../calculations/broker/broker_inventory';

export class BrokerInventoryDataScheduler {
  private calculator: BrokerInventoryCalculator;

  constructor() {
    this.calculator = new BrokerInventoryCalculator();
  }

  /**
   * Generate broker inventory data for all available dates
   */
  async generateBrokerInventoryData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Broker Inventory calculation for: ${targetDate}`);
      
      // Broker inventory calculator processes all available dates
      await this.calculator.generateBrokerInventoryData(targetDate);
      console.log('✅ Broker Inventory calculation completed successfully');
      
      return {
        success: true,
        message: `Broker inventory data generated successfully for ${targetDate}`,
        data: {
          date: targetDate,
          status: 'completed'
        }
      };
    } catch (error) {
      console.error('❌ Error during Broker Inventory calculation:', error);
      return {
        success: false,
        message: `Failed to generate broker inventory data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }


  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Broker Inventory service is ready to generate data'
    };
  }
}

export default BrokerInventoryDataScheduler;

