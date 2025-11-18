import BrokerTransactionRGTNNGCalculator from '../calculations/broker/broker_transaction_rg_tn_ng';

export class BrokerTransactionRGTNNGDataScheduler {
  private calculator: BrokerTransactionRGTNNGCalculator;

  constructor() {
    this.calculator = new BrokerTransactionRGTNNGCalculator();
  }

  async generateBrokerTransactionRGTNNGData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`🔄 Starting Broker Transaction RG/TN/NG calculation...`);
      const result = await this.calculator.generateBrokerTransactionData(dateSuffix);
      if (result.success) {
        console.log('✅ Broker Transaction RG/TN/NG calculation completed successfully');
      } else {
        console.error('❌ Broker Transaction RG/TN/NG calculation failed:', result.message);
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error during Broker Transaction RG/TN/NG calculation:', errorMessage);
      return {
        success: false,
        message: `Failed to generate broker transaction RG/TN/NG data: ${errorMessage}`
      };
    }
  }

  async generateBrokerTransactionRGTNNGDataForType(type: 'RG' | 'TN' | 'NG'): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`🔄 Starting Broker Transaction ${type} calculation...`);
      const result = await this.calculator.generateBrokerTransactionDataForType(type);
      if (result.success) {
        console.log(`✅ Broker Transaction ${type} calculation completed successfully`);
      } else {
        console.error(`❌ Broker Transaction ${type} calculation failed:`, result.message);
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error during Broker Transaction ${type} calculation:`, errorMessage);
      return {
        success: false,
        message: `Failed to generate broker transaction ${type} data: ${errorMessage}`
      };
    }
  }
}

export default BrokerTransactionRGTNNGDataScheduler;

