import ForeignFlowCalculator from '../calculations/foreign/foreign_flow';

export class ForeignFlowAutoGenerateService {
  private calculator: ForeignFlowCalculator;

  constructor() {
    this.calculator = new ForeignFlowCalculator();
  }

  /**
   * Generate foreign flow data
   */
  async generateForeignFlowData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || this.getCurrentDateSuffix();
      console.log(`🔄 Starting Foreign Flow calculation for date: ${targetDate}`);
      
      const result = await this.calculator.generateForeignFlowData(targetDate);
      
      if (result.success) {
        console.log('✅ Foreign Flow calculation completed successfully');
      } else {
        console.error('❌ Foreign Flow calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Foreign Flow calculation:', error);
      return {
        success: false,
        message: `Failed to generate foreign flow data: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      message: 'Foreign Flow service is ready to generate data'
    };
  }
}

export default ForeignFlowAutoGenerateService;

