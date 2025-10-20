import AccumulationDistributionCalculator from '../calculations/accumulation/accumulation_distribution';

export class AccumulationAutoGenerateService {
  private calculator: AccumulationDistributionCalculator;

  constructor() {
    this.calculator = new AccumulationDistributionCalculator();
  }

  /**
   * Generate accumulation distribution data
   */
  async generateAccumulationData(dateSuffix?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || this.getCurrentDateSuffix();
      console.log(`🔄 Starting Accumulation Distribution calculation for date: ${targetDate}`);
      
      const result = await this.calculator.generateAccumulationDistributionData(targetDate);
      
      if (result.success) {
        console.log('✅ Accumulation Distribution calculation completed successfully');
      } else {
        console.error('❌ Accumulation Distribution calculation failed:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error during Accumulation Distribution calculation:', error);
      return {
        success: false,
        message: `Failed to generate accumulation distribution data: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      message: 'Accumulation Distribution service is ready to generate data'
    };
  }
}

export default AccumulationAutoGenerateService;

