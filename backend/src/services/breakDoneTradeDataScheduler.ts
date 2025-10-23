import BreakDoneTradeCalculator from '../calculations/done/break_done_trade';

export class BreakDoneTradeDataScheduler {
  private calculator: BreakDoneTradeCalculator;

  constructor() {
    this.calculator = new BreakDoneTradeCalculator();
  }

  /**
   * Generate break done trade data
   */
  async generateBreakDoneTradeData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`🔄 Starting Break Done Trade calculation...`);
      
      const result = await this.calculator.generateBreakDoneTradeData(dateSuffix);
      
      if (result.success) {
        console.log('✅ Break Done Trade calculation completed successfully');
      } else {
        console.error('❌ Break Done Trade calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Break Done Trade calculation:', error);
      return {
        success: false,
        message: `Failed to generate break done trade data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }


  /**
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Break Done Trade service is ready to generate data'
    };
  }
}

export default BreakDoneTradeDataScheduler;
