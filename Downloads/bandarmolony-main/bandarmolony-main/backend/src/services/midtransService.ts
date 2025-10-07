import Midtrans from 'midtrans-client';
import crypto from 'crypto';
import config from '../config';

export interface MidtransConfig {
  isProduction: boolean;
  serverKey: string;
  clientKey: string;
  merchantId: string;
}

export interface TransactionDetails {
  order_id: string;
  gross_amount: number;
}

export interface CustomerDetails {
  first_name: string;
  last_name?: string;
  email: string;
  phone?: string;
  billing_address?: {
    first_name: string;
    last_name?: string;
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country_code?: string;
  };
  shipping_address?: {
    first_name: string;
    last_name?: string;
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country_code?: string;
  };
}

export interface ItemDetails {
  id: string;
  price: number;
  quantity: number;
  name: string;
  brand?: string;
  category?: string;
  merchant_name?: string;
}

export interface Callbacks {
  finish: string;
  error: string;
  pending: string;
}

export interface MidtransTransaction {
  transaction_details: TransactionDetails;
  customer_details: CustomerDetails;
  item_details: ItemDetails[];
  callbacks?: Callbacks;
  payment_options?: {
    save_card?: boolean;
    save_va?: boolean;
  };
  credit_card?: {
    secure?: boolean;
    channel?: string;
    bank?: string;
    installment?: {
      required?: boolean;
      terms?: {
        bca?: number[];
        bni?: number[];
        mandiri?: number[];
        bri?: number[];
        cimb?: number[];
        maybank?: number[];
        bsi?: number[];
      };
    };
    whitelist_bins?: string[];
    dynamic_descriptor?: string;
  };
  bank_transfer?: {
    bank?: string;
    va_number?: string;
    free_text?: {
      inquiry?: string;
      payment?: string;
    };
    bca?: {
      sub_company_code?: string;
    };
    permata?: {
      recipient_name?: string;
    };
  };
  echannel?: {
    bill_info1?: string;
    bill_info2?: string;
  };
  bca_va?: {
    va_number?: string;
    free_text?: {
      inquiry?: string;
      payment?: string;
    };
    sub_company_code?: string;
  };
  bni_va?: {
    va_number?: string;
  };
  bri_va?: {
    va_number?: string;
  };
  other_va?: {
    va_number?: string;
  };
  gopay?: {
    enable_callback?: boolean;
    callback_url?: string;
  };
  shopeepay?: {
    callback_url?: string;
  };
  custom_expiry?: {
    order_time?: string;
    expiry_duration?: number;
    unit?: 'minute' | 'hour' | 'day';
  };
  custom_field1?: string;
  custom_field2?: string;
  custom_field3?: string;
  enabled_payments?: string[];
  disabled_payments?: string[];
}

export interface MidtransResponse {
  token?: string;
  redirect_url?: string;
  status_code: string;
  status_message: string;
  transaction_id?: string;
  order_id?: string;
  merchant_id?: string;
  gross_amount?: string;
  currency?: string;
  payment_type?: string;
  transaction_time?: string;
  settlement_time?: string;
  transaction_status?: string;
  fraud_status?: string;
  approval_code?: string;
  signature_key?: string;
  bank?: string;
  va_numbers?: Array<{
    bank: string;
    va_number: string;
  }>;
  bill_key?: string;
  biller_code?: string;
  store?: string;
  permata_va_number?: string;
  eci?: string;
  channel_response_code?: string;
  channel_response_message?: string;
  card_number?: string;
  masked_card?: string;
  saved_token_id?: string;
  saved_token_id_expired_at?: string;
  secure_token?: boolean;
  issuer?: string;
  acquirer?: string;
  payment_options?: {
    save_card?: boolean;
    save_va?: boolean;
  };
}

export class MidtransService {
  private snap: any;
  private coreApi: any;
  private config: MidtransConfig;

  constructor() {
    this.config = {
      isProduction: config.MIDTRANS_IS_PRODUCTION,
      serverKey: config.MIDTRANS_SERVER_KEY,
      clientKey: config.MIDTRANS_CLIENT_KEY,
      merchantId: config.MIDTRANS_MERCHANT_ID
    };

    if (!this.config.serverKey || !this.config.clientKey) {
      throw new Error('Midtrans credentials not configured');
    }

    // Initialize Snap
    this.snap = new Midtrans.Snap({
      isProduction: this.config.isProduction,
      serverKey: this.config.serverKey,
      clientKey: this.config.clientKey,
    });

    // Initialize Core API
    this.coreApi = new Midtrans.CoreApi({
      isProduction: this.config.isProduction,
      serverKey: this.config.serverKey,
      clientKey: this.config.clientKey,
    });
  }

  /**
   * Create Snap token for frontend payment
   */
  async createSnapToken(transaction: MidtransTransaction): Promise<string> {
    try {
      const response = await this.snap.createTransaction(transaction);
      return response.token;
    } catch (error: any) {
      throw new Error(`Failed to create Snap token: ${error.message}`);
    }
  }

  /**
   * Create Snap redirect URL for frontend payment
   */
  async createSnapRedirectUrl(transaction: MidtransTransaction): Promise<string> {
    try {
      const response = await this.snap.createTransaction(transaction);
      return response.redirect_url;
    } catch (error: any) {
      throw new Error(`Failed to create Snap redirect URL: ${error.message}`);
    }
  }

  /**
   * Create Core API transaction (for server-to-server)
   */
  async createTransaction(transaction: MidtransTransaction): Promise<MidtransResponse> {
    try {
      const response = await this.coreApi.charge(transaction);
      return response;
    } catch (error: any) {
      throw new Error(`Failed to create transaction: ${error.message}`);
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(orderId: string): Promise<MidtransResponse> {
    try {
      const response = await this.coreApi.transaction.status(orderId);
      return response;
    } catch (error: any) {
      throw new Error(`Failed to get transaction status: ${error.message}`);
    }
  }

  /**
   * Approve transaction (for manual approval)
   */
  async approveTransaction(orderId: string): Promise<MidtransResponse> {
    try {
      const response = await this.coreApi.transaction.approve(orderId);
      return response;
    } catch (error: any) {
      throw new Error(`Failed to approve transaction: ${error.message}`);
    }
  }

  /**
   * Cancel transaction
   */
  async cancelTransaction(orderId: string): Promise<MidtransResponse> {
    try {
      const response = await this.coreApi.transaction.cancel(orderId);
      return response;
    } catch (error: any) {
      throw new Error(`Failed to cancel transaction: ${error.message}`);
    }
  }

  /**
   * Refund transaction
   */
  async refundTransaction(orderId: string, refundData: {
    amount?: number;
    reason?: string;
    refund_key?: string;
  }): Promise<MidtransResponse> {
    try {
      const response = await this.coreApi.transaction.refund(orderId, refundData);
      return response;
    } catch (error: any) {
      throw new Error(`Failed to refund transaction: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHash('sha512')
        .update(payload + this.config.serverKey)
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate signature key for verification
   */
  generateSignatureKey(orderId: string, statusCode: string, grossAmount: string): string {
    const signature = crypto
      .createHash('sha512')
      .update(orderId + statusCode + grossAmount + this.config.serverKey)
      .digest('hex');
    
    return signature;
  }

  /**
   * Create subscription transaction
   */
  async createSubscriptionTransaction(data: {
    orderId: string;
    planId: string;
    planName: string;
    planDuration: number;
    price: number;
    customer: {
      name: string;
      email: string;
      phone?: string;
    };
    callbacks: Callbacks;
  }): Promise<MidtransTransaction> {
    const transaction: MidtransTransaction = {
      transaction_details: {
        order_id: data.orderId,
        gross_amount: data.price
      },
      customer_details: {
        first_name: data.customer.name.split(' ')[0],
        last_name: data.customer.name.split(' ').slice(1).join(' '),
        email: data.customer.email,
        phone: data.customer.phone || ''
      },
      item_details: [{
        id: data.planId,
        price: data.price,
        quantity: 1,
        name: `${data.planName} - ${data.planDuration} bulan`,
        category: 'Subscription',
        merchant_name: 'Website Saham'
      }],
      callbacks: data.callbacks,
      enabled_payments: [
        'credit_card',
        'bca_va',
        'bni_va',
        'mandiri_va',
        'permata_va',
        'gopay',
        'shopeepay',
        'dana',
        'linkaja',
        'qris',
        'indomaret',
        'alfamart'
      ],
      credit_card: {
        secure: true,
        channel: 'migs',
        bank: 'bca',
        installment: {
          required: false
        }
      },
      custom_expiry: {
        order_time: new Date().toISOString(),
        expiry_duration: parseInt(process.env.PAYMENT_TIMEOUT_MINUTES || '15'),
        unit: 'minute'
      }
    };

    return transaction;
  }

  /**
   * Get available payment methods
   */
  getAvailablePaymentMethods(): string[] {
    return [
      'credit_card',
      'bca_va',
      'bni_va',
      'mandiri_va',
      'permata_va',
      'gopay',
      'shopeepay',
      'dana',
      'linkaja',
      'qris',
      'indomaret',
      'alfamart'
    ];
  }

  /**
   * Validate transaction response
   */
  validateTransactionResponse(response: MidtransResponse): boolean {
    if (!response.status_code || !response.order_id || !response.gross_amount) {
      return false;
    }

    // Validate signature if present
    if (response.signature_key) {
      const expectedSignature = this.generateSignatureKey(
        response.order_id,
        response.status_code,
        response.gross_amount
      );
      
      return response.signature_key === expectedSignature;
    }

    return true;
  }

  /**
   * Get configuration
   */
  getConfig(): MidtransConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const midtransService = new MidtransService();
