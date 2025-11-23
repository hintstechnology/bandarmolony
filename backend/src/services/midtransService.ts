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

    console.log('Midtrans Config:', {
      isProduction: this.config.isProduction,
      hasServerKey: !!this.config.serverKey,
      hasClientKey: !!this.config.clientKey,
      hasMerchantId: !!this.config.merchantId,
      serverKeyLength: this.config.serverKey?.length,
      clientKeyLength: this.config.clientKey?.length
    });

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
      console.log('🎫 Creating snap token with transaction:');
      console.log('  - Order ID:', transaction.transaction_details?.order_id);
      console.log('  - Enabled Payments:', transaction.enabled_payments);
      console.log('  - Disabled Payments:', transaction.disabled_payments);
      console.log('  - Has credit_card config:', !!transaction.credit_card);
      
      // Remove credit_card from transaction object if not in enabled_payments
      const enabledPayments = transaction.enabled_payments || [];
      const hasCreditCard = enabledPayments.includes('credit_card');
      const transactionToSend = { ...transaction };
      if (!hasCreditCard && transactionToSend.credit_card) {
        delete transactionToSend.credit_card;
        console.log('  - Removed credit_card config (not in enabled_payments)');
      }
      
      console.log('  - Final transaction (before sending to Midtrans):', JSON.stringify(transactionToSend, null, 2));
      
      const response = await this.snap.createTransaction(transactionToSend);
      console.log('✅ Snap token created successfully:', {
        token: response.token?.substring(0, 20) + '...',
        redirect_url: response.redirect_url,
        full_response: JSON.stringify(response, null, 2)
      });
      
      // Check if response has any warnings or errors
      if ((response as any).status_code && (response as any).status_code !== '201') {
        console.warn('⚠️ Midtrans response has non-201 status code:', (response as any).status_code, (response as any).status_message);
      }
      
      return response.token;
    } catch (error: any) {
      console.error('❌ Error creating snap token:', {
        error: error.message,
        stack: error.stack,
        enabled_payments: transaction.enabled_payments,
        transaction_details: transaction.transaction_details,
        full_error: error
      });
      throw new Error(`Failed to create Snap token: ${error.message}`);
    }
  }

  /**
   * Create Snap redirect URL for frontend payment
   */
  async createSnapRedirectUrl(transaction: MidtransTransaction): Promise<string> {
    try {
      console.log('🔗 Creating snap redirect URL with transaction:');
      console.log('  - Order ID:', transaction.transaction_details?.order_id);
      console.log('  - Enabled Payments:', transaction.enabled_payments);
      console.log('  - Disabled Payments:', transaction.disabled_payments);
      
      // Remove credit_card from transaction object if not in enabled_payments
      const enabledPayments = transaction.enabled_payments || [];
      const hasCreditCard = enabledPayments.includes('credit_card');
      const transactionToSend = { ...transaction };
      if (!hasCreditCard && transactionToSend.credit_card) {
        delete transactionToSend.credit_card;
        console.log('  - Removed credit_card config (not in enabled_payments)');
      }
      
      // IMPORTANT: For single payment method (especially QRIS), ensure transaction is clean
      // Remove any undefined or null values that might cause issues
      const cleanedTransaction: any = {};
      Object.keys(transactionToSend).forEach(key => {
        const value = (transactionToSend as any)[key];
        if (value !== undefined && value !== null) {
          if (Array.isArray(value) && value.length === 0) {
            // Skip empty arrays for optional fields
            return;
          }
          cleanedTransaction[key] = value;
        }
      });
      
      const response = await this.snap.createTransaction(cleanedTransaction);
      
      // Log full response for debugging
      const fullResponse = JSON.stringify(response, null, 2);
      console.log('✅ Snap redirect URL created successfully:', {
        redirect_url: response.redirect_url,
        token: response.token?.substring(0, 20) + '...',
        status_code: (response as any).status_code,
        status_message: (response as any).status_message,
        full_response: fullResponse
      });
      
      // Check if response has any warnings or errors
      if ((response as any).status_code && (response as any).status_code !== '201') {
        console.warn('⚠️ Midtrans response has non-201 status code:', (response as any).status_code, (response as any).status_message);
      }
      
      // Check if response indicates payment channel issues
      if ((response as any).status_message && 
          ((response as any).status_message.toLowerCase().includes('payment') || 
           (response as any).status_message.toLowerCase().includes('channel'))) {
        console.warn('⚠️ Midtrans response may indicate payment channel issue:', (response as any).status_message);
      }
      
      return response.redirect_url;
    } catch (error: any) {
      console.error('❌ Error creating snap redirect URL:', {
        error: error.message,
        stack: error.stack,
        enabled_payments: transaction.enabled_payments,
        transaction_details: transaction.transaction_details,
        full_error: error
      });
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
   * Generate signature key for Midtrans webhook verification
   * Formula: SHA512(order_id + status_code + gross_amount + ServerKey)
   * Reference: https://docs.midtrans.com/en/after-payment/http-notification#verifying-notification-authenticity
   */
  generateSignatureKey(orderId: string, statusCode: string, grossAmount: string): string {
    const signatureString = `${orderId}${statusCode}${grossAmount}${this.config.serverKey}`;
    const signature = crypto
      .createHash('sha512')
      .update(signatureString)
      .digest('hex');
    return signature;
  }

  /**
   * Verify webhook signature (DEPRECATED - not used for Midtrans)
   * Kept for backward compatibility
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
    paymentMethod?: string;
  }): Promise<MidtransTransaction> {
    const transaction: MidtransTransaction = {
      transaction_details: {
        order_id: data.orderId,
        gross_amount: data.price
      },
      customer_details: {
        first_name: data.customer.name.split(' ')[0] || 'User',
        last_name: data.customer.name.split(' ').slice(1).join(' ') || '',
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
      enabled_payments: data.paymentMethod ? this.mapPaymentMethodToMidtrans(data.paymentMethod) : [
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
      disabled_payments: [],
      custom_expiry: {
        order_time: new Date().toISOString(),
        expiry_duration: parseInt(process.env['PAYMENT_TIMEOUT_MINUTES'] || '15'),
        unit: 'minute'
      }
    };

    // Only include credit_card config if credit_card is in enabled_payments
    const enabledPayments = transaction.enabled_payments || [];
    const hasCreditCard = enabledPayments.includes('credit_card');
    if (hasCreditCard) {
      transaction.credit_card = {
        secure: true,
        channel: 'migs',
        bank: 'bca',
        installment: {
          required: false
        }
      };
    } else {
      // Explicitly remove credit_card config if not in enabled_payments
      // This ensures clean transaction object
      delete (transaction as any).credit_card;
    }

    // Log final transaction object for debugging
    console.log('📦 Final Midtrans transaction object:', {
      order_id: transaction.transaction_details.order_id,
      enabled_payments: transaction.enabled_payments,
      has_credit_card_config: !!transaction.credit_card,
      payment_method_param: data.paymentMethod,
      transaction_keys: Object.keys(transaction)
    });

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
   * Map payment method to Midtrans format
   */
  private mapPaymentMethodToMidtrans(paymentMethod: string): string[] {
    // Normalize input: lowercase and trim
    const normalizedMethod = paymentMethod.toLowerCase().trim();
    
    const methodMap: { [key: string]: string[] } = {
      'credit_card': ['credit_card'],
      'bank_transfer': ['bca_va', 'bni_va', 'mandiri_va', 'permata_va', 'bri_va', 'other_va'],
      'bca': ['bca_va'],
      'bni': ['bni_va'],
      'bri': ['bri_va'],
      'mandiri': ['mandiri_va'],
      'permata': ['permata_va'],
      'bca_va': ['bca_va'],
      'bni_va': ['bni_va'],
      'bri_va': ['bri_va'],
      'mandiri_va': ['mandiri_va'],
      'permata_va': ['permata_va'],
      'other_va': ['other_va'],
      'gopay': ['gopay'],
      'dana': ['dana'],
      'ovo': ['shopeepay'],
      'shopeepay': ['shopeepay'],
      'linkaja': ['linkaja'],
      'qris': ['qris'],
      'indomaret': ['indomaret'],
      'alfamart': ['alfamart'],
      'cstore': ['indomaret', 'alfamart'], // Convenience store - both Indomaret and Alfamart
      'echannel': ['echannel'], // Mandiri Bill Payment
      'akulaku': ['akulaku']
    };

    const result = methodMap[normalizedMethod] || [normalizedMethod];
    console.log(`✅ Mapped payment method '${paymentMethod}' (normalized: '${normalizedMethod}') to Midtrans enabled_payments:`, result);
    
    // Validate result - ensure it's not empty
    if (!result || result.length === 0) {
      console.warn(`⚠️ Warning: Payment method '${paymentMethod}' mapped to empty array, using original value`);
      return [normalizedMethod];
    }
    
    // IMPORTANT: For QRIS, ensure it's the primary method but include fallbacks
    // Midtrans Snap may require multiple payment methods to display properly
    // If only QRIS is requested, we include it as primary with e-wallet fallbacks
    // This ensures payment channels are available even if QRIS has account-specific issues
    if (normalizedMethod === 'qris') {
      // Return QRIS as primary, with e-wallet fallbacks that are commonly available
      // This helps avoid "No payment channels available" error
      return ['qris', 'gopay', 'dana', 'shopeepay', 'linkaja'];
    }
    
    return result;
  }

  /**
   * Cancel transaction using Core API
   */
  async cancelTransaction(orderId: string): Promise<MidtransResponse | null> {
    try {
      if (!orderId) {
        console.warn('⚠️ Cannot cancel transaction: order ID is empty');
        return null;
      }

      console.log(`Cancelling transaction in Midtrans: ${orderId}`);
      const response = await this.coreApi.transaction.cancel(orderId);
      console.log('✅ Transaction cancelled in Midtrans successfully:', {
        order_id: orderId,
        status_code: response.status_code,
        status_message: response.status_message
      });
      return response;
    } catch (error: any) {
      // Handle 404 - transaction doesn't exist (already expired, cancelled, or never created)
      if (error.httpStatusCode === '404' || 
          (error.ApiResponse && error.ApiResponse.status_code === '404')) {
        console.warn(`⚠️ Transaction not found in Midtrans (may be expired or already cancelled): ${orderId}`);
        console.warn(`⚠️ Midtrans response: ${error.ApiResponse?.status_message || error.message}`);
        // Return null instead of throwing - transaction may already be cancelled/expired
        return null;
      }
      
      // Handle other errors
      console.error('❌ Error cancelling transaction in Midtrans:', {
        order_id: orderId,
        error: error.message,
        http_status: error.httpStatusCode,
        api_response: error.ApiResponse
      });
      // Still throw for other errors (network, auth, etc.)
      throw new Error(`Failed to cancel transaction: ${error.message}`);
    }
  }

  /**
   * Test Midtrans connection
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try to get transaction status with a dummy order ID
      await this.coreApi.transaction.status('test-connection');
      return true;
    } catch (error: any) {
      console.error('Midtrans connection test failed:', error);
      return false;
    }
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
