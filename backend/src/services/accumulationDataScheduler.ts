import AccumulationDistributionCalculator from '../calculations/accumulation/accumulation_distribution';

export class AccumulationDataScheduler {
  private calculator: AccumulationDistributionCalculator;

  constructor() {
    this.calculator = new AccumulationDistributionCalculator();
  }

  /**
   * Generate accumulation distribution data for specific date or all dates
   */
  async generateAccumulationData(dateSuffix?: string, logId?: string | null): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const targetDate = dateSuffix || 'all';
      console.log(`🔄 Starting Accumulation Distribution calculation for: ${targetDate}`);
      
      // Accumulation distribution calculator processes specific date or all dates
      const result = await this.calculator.generateAccumulationDistributionData(targetDate, logId);
      
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
   * Get generation status
   */
  async getStatus(): Promise<{ status: string; lastUpdate?: string; message: string }> {
    return {
      status: 'ready',
      message: 'Accumulation Distribution service is ready to generate data'
    };
  }
}

export default AccumulationDataScheduler;

