import MoneyFlowCalculator from '../calculations/moneyflow/money_flow';

export class MoneyFlowAutoGenerateService {
  private calculator: MoneyFlowCalculator;

  constructor() {
    this.calculator = new MoneyFlowCalculator();
  }

  /**
   * Generate money flow data
   */
  async generateMoneyFlowData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || this.getCurrentDateSuffix();
      console.log(`🔄 Starting Money Flow calculation for date: ${targetDate}`);
      
      const result = await this.calculator.generateMoneyFlowData(targetDate);
      
      if (result.success) {
        console.log('✅ Money Flow calculation completed successfully');
      } else {
        console.error('❌ Money Flow calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Money Flow calculation:', error);
      return {
        success: false,
        message: `Failed to generate money flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      message: 'Money Flow service is ready to generate data'
    };
  }
}

export default MoneyFlowAutoGenerateService;

