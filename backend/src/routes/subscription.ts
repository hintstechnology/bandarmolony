import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabaseClient';
import { requireSupabaseUser } from '../middleware/requireSupabaseUser';
import { createSuccessResponse, createErrorResponse } from '../utils/responseUtils';
import { HTTP_STATUS, ERROR_CODES } from '../utils/responseUtils';
import { midtransService } from '../services/midtransService';
import config from '../config';

/**
 * Parse Midtrans settlement_time to ISO string
 * Midtrans format: 'YYYY-MM-DD HH:mm:ss' (e.g., '2025-11-23 22:16:30')
 */
function parseSettlementTime(settlementTime: string | null | undefined): string | null {
  if (!settlementTime) return null;
  
  try {
    // Midtrans format: 'YYYY-MM-DD HH:mm:ss'
    // Replace space with 'T' to make it ISO-like, then parse
    const isoLikeString = settlementTime.replace(' ', 'T');
    const date = new Date(isoLikeString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('⚠️ Invalid settlement_time format:', settlementTime);
      return null;
    }
    
    return date.toISOString();
  } catch (error) {
    console.error('❌ Error parsing settlement_time:', settlementTime, error);
    return null;
  }
}

const router = express.Router();

// Function to check and expire pending transactions
const checkExpiredTransactions = async () => {
  try {
    const now = new Date().toISOString();
    
    // Find expired pending transactions
    const { data: expiredTransactions, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('status', 'pending')
      .lt('expiry_time', now);

    if (error) {
      console.error('Error checking expired transactions:', error);
      return;
    }

    if (expiredTransactions && expiredTransactions.length > 0) {
      // Update expired transactions to cancelled
      const { error: updateError } = await supabaseAdmin
        .from('transactions')
        .update({
          status: 'cancel',
          updated_at: now
        })
        .eq('status', 'pending')
        .lt('expiry_time', now);

      if (updateError) {
        console.error('Error updating expired transactions:', updateError);
        return;
      }

      // Update related subscriptions to failed
      for (const transaction of expiredTransactions) {
        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'failed',
            updated_at: now
          })
          .eq('id', transaction.subscription_id);
      }

      console.log(`Expired ${expiredTransactions.length} pending transactions`);
    }
  } catch (error) {
    console.error('Error in checkExpiredTransactions:', error);
  }
};

// Run expired transaction check every 5 minutes
setInterval(checkExpiredTransactions, 5 * 60 * 1000);

// Function to expire trial subscriptions
async function expireTrialSubscriptions() {
  try {
    const now = new Date().toISOString();
    
    // Find expired trials
    const { data: expiredTrials, error } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('status', 'trial')
      .lte('free_trial_end_date', now);

    if (error) {
      console.error('Error checking expired trials:', error);
      return;
    }

    if (expiredTrials && expiredTrials.length > 0) {
      // Update expired trials to expired status
      for (const trial of expiredTrials) {
        // Update subscription to expired
        await supabaseAdmin
          .from('subscriptions')
          .update({ 
            status: 'expired',
            updated_at: now
          })
          .eq('id', trial.id);

        // Update user to Free plan
        await supabaseAdmin
          .from('users')
          .update({
            subscription_status: 'inactive',
            subscription_plan: 'Free',
            subscription_start_date: null,
            subscription_end_date: null,
            updated_at: now
          })
          .eq('id', trial.user_id);
      }

      console.log(`Expired ${expiredTrials.length} trial subscriptions`);
    }
  } catch (error) {
    console.error('Error in expireTrialSubscriptions:', error);
  }
}

// Run trial expiry check every hour
setInterval(expireTrialSubscriptions, 60 * 60 * 1000);

// Free Trial Configuration
const FREE_TRIAL_CONFIG = {
  durationDays: 7,
  planType: 'Pro',
  eligibleRoles: ['user'],
  oneTimeOnly: true
};

// Helper function to check trial eligibility
async function checkTrialEligibility(userId: string): Promise<boolean> {
  try {
    // Check user role
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      return false;
    }

    // Exclude admin/developer
    if (!FREE_TRIAL_CONFIG.eligibleRoles.includes(userProfile.role)) {
      return false;
    }

    // Check if already used trial (check in subscriptions table)
    if (FREE_TRIAL_CONFIG.oneTimeOnly) {
      const { data: existingTrial } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('free_trial_used', true)
        .maybeSingle();
      
      if (existingTrial) {
        return false;
      }
    }

    // Check if already has active subscription
    const { data: activeSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trial'])
      .single();

    if (activeSubscription) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking trial eligibility:', error);
    return false;
  }
}

// Helper function to format payment method with card brand detection (BIN-based)
const formatPaymentMethod = (webhookData: any, fallbackMethod: string): string => {
  let formattedMethod = webhookData.payment_type || fallbackMethod;
  
  if (webhookData.payment_type === 'credit_card') {
    // Extract card brand from masked_card number (BIN detection)
    let cardBrand = '';
    let isInternationalCard = false; // Flag for international cards (AMEX, JCB, CUP)
    
    if (webhookData.masked_card) {
      const firstDigit = webhookData.masked_card.charAt(0);
      const firstTwo = webhookData.masked_card.substring(0, 2);
      
      if (firstDigit === '4') {
        cardBrand = 'VISA';
      } else if (firstDigit === '5') {
        cardBrand = 'Mastercard';
      } else if (firstDigit === '3') {
        // AMEX (34xx, 37xx) or JCB (35xx)
        if (firstTwo === '37' || firstTwo === '34') {
          cardBrand = 'AMEX';
          isInternationalCard = true; // AMEX is issuer, bank field not relevant
        } else if (firstTwo === '35') {
          cardBrand = 'JCB';
          isInternationalCard = true; // JCB is Japanese card
        }
      } else if (firstDigit === '6') {
        cardBrand = 'CUP'; // China Union Pay
        isInternationalCard = true; // CUP is Chinese card
      } else if (firstTwo === '19') {
        cardBrand = 'BNI Private'; // BNI Private Label
      }
    }
    
    // Card type: credit, debit, prepaid
    const cardType = webhookData.card_type ? 
      (webhookData.card_type.charAt(0).toUpperCase() + webhookData.card_type.slice(1)) : '';
    
    // Bank name from Midtrans
    // Only include bank for local cards (VISA, Mastercard, BNI Private)
    // Ignore bank for international cards (AMEX, JCB, CUP) as it's not relevant
    const bank = (!isInternationalCard && webhookData.bank) ? webhookData.bank.toUpperCase() : '';
    
    // Build natural format: "VISA Debit BCA" or "AMEX Credit" (no bank for AMEX)
    const parts = [cardBrand, cardType, bank].filter(p => p); // Remove empty strings
    formattedMethod = parts.join(' ');
  }
  
  return formattedMethod;
};

// Subscription plans configuration
const subscriptionPlans = [
  {
    id: 'plus',
    name: 'Plus',
    price: 35000,
    period: '1 bulan',
    duration: 30, // 30 days
    popular: false
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 89000,
    period: '3 bulan',
    duration: 90, // 90 days
    popular: true
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 165000,
    period: '6 bulan',
    duration: 180, // 180 days
    popular: false
  }
];

// Validation schemas
const createOrderSchema = z.object({
  planId: z.enum(['plus', 'premium', 'pro']),
  paymentMethod: z.enum(['snap', 'credit_card', 'bank_transfer', 'ewallet']).optional().default('snap')
});

const webhookSchema = z.object({
  order_id: z.string(),
  transaction_status: z.enum(['capture', 'settlement', 'pending', 'deny', 'cancel', 'expire', 'failure']),
  payment_type: z.string(),
  fraud_status: z.enum(['accept', 'deny', 'challenge']).optional(),
  transaction_id: z.string().optional(),
  gross_amount: z.string().optional(),
  currency: z.string().optional(),
  signature_key: z.string().optional(),
  status_code: z.string().optional(),
  status_message: z.string().optional(),
  transaction_time: z.string().optional(),
  settlement_time: z.string().optional(),
  bank: z.string().optional(),
  card_type: z.string().optional(), // credit, debit, prepaid
  va_numbers: z.array(z.object({
    bank: z.string(),
    va_number: z.string()
  })).optional(),
  bill_key: z.string().optional(),
  biller_code: z.string().optional(),
  store: z.string().optional(),
  permata_va_number: z.string().optional(),
  eci: z.string().optional(),
  channel_response_code: z.string().optional(),
  channel_response_message: z.string().optional(),
  card_number: z.string().optional(),
  masked_card: z.string().optional(),
  saved_token_id: z.string().optional(),
  saved_token_id_expired_at: z.string().optional(),
  secure_token: z.boolean().optional(),
  issuer: z.string().optional(),
  acquirer: z.string().optional()
});

/**
 * GET /api/subscription/plans
 * Get available subscription plans
 */
router.get('/plans', async (_req, res) => {
  try {
    return res.json(createSuccessResponse(subscriptionPlans, 'Subscription plans retrieved successfully'));
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve subscription plans',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/payment-methods
 * Get available payment methods
 */
router.get('/payment-methods', async (_req, res) => {
  try {
    const { data: paymentMethods, error } = await supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('type', { ascending: true });

    if (error) {
      throw error;
    }

    return res.json(createSuccessResponse(paymentMethods, 'Payment methods retrieved successfully'));
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve payment methods',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/test-service-role
 * Test service role access
 */
router.get('/test-service-role', async (_req, res) => {
  try {
    console.log('🔧 Testing service role access...');
    
    // Test basic connection
    const { data: testData, error: testError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .limit(1);
    
    if (testError) {
      console.error('❌ Service role test failed:', testError);
      return res.status(500).json(createErrorResponse('Service role test failed', testError.message));
    }
    
    console.log('✅ Service role test successful:', testData);
    
    // Test transaction access
    const { data: transactionData, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select('id, status, user_id')
      .limit(1);
    
    if (transactionError) {
      console.error('❌ Transaction access test failed:', transactionError);
      return res.status(500).json(createErrorResponse('Transaction access test failed', transactionError.message));
    }
    
    console.log('✅ Transaction access test successful:', transactionData);
    
    return res.json(createSuccessResponse({
      message: 'Service role access working correctly',
      userAccess: testData,
      transactionAccess: transactionData
    }));
    
  } catch (error) {
    console.error('❌ Service role test error:', error);
    return res.status(500).json(createErrorResponse('Service role test error', error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * GET /api/subscription/test-midtrans
 * Test Midtrans connection
 */
router.get('/test-midtrans', async (_req, res) => {
  try {
    const isConnected = await midtransService.testConnection();
    
    return res.json(createSuccessResponse({
      connected: isConnected,
      config: {
        isProduction: config.MIDTRANS_IS_PRODUCTION,
        hasServerKey: !!config.MIDTRANS_SERVER_KEY,
        hasClientKey: !!config.MIDTRANS_CLIENT_KEY,
        hasMerchantId: !!config.MIDTRANS_MERCHANT_ID
      },
      urls: {
        webhook: config.WEBHOOK_URL,
        recurringWebhook: config.RECURRING_WEBHOOK_URL,
        payAccountWebhook: config.PAY_ACCOUNT_WEBHOOK_URL,
        success: config.SUCCESS_URL,
        error: config.ERROR_URL,
        pending: config.PENDING_URL
      }
    }, isConnected ? 'Midtrans connection successful' : 'Midtrans connection failed'));
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to test Midtrans connection',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/create-order
 * Create subscription order and payment
 */
router.post('/create-order', requireSupabaseUser, async (req: any, res) => {
  try {
    const { planId, paymentMethod } = createOrderSchema.parse(req.body);
    const userId = req.user.id;
    const userEmail = req.user.email;
    const userName = req.user.user_metadata?.['full_name'] || 'User';

    // Validate plan
    const plan = subscriptionPlans.find(p => p.id === planId);
    if (!plan) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Invalid subscription plan',
        ERROR_CODES.VALIDATION_ERROR,
        'planId',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Check if user has active PAID subscription (trial can be upgraded)
    const { data: existingPaidSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('status', 'eq', 'trial')
      .maybeSingle();

    if (existingPaidSubscription) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'User already has an active subscription',
        ERROR_CODES.VALIDATION_ERROR,
        'subscription',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Check if user has active trial - if yes, use it for upgrade
    const { data: existingTrial } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'trial')
      .maybeSingle();

    // Check if user has pending payment
    const { data: pendingTransaction, error: pendingError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (pendingError && pendingError.code !== 'PGRST116') {
      console.error('Error checking pending transaction:', pendingError);
    }

    if (pendingTransaction) {
      console.log('⚠️ User already has pending transaction:', {
        user_id: userId,
        transaction_id: pendingTransaction.id,
        order_id: pendingTransaction.midtrans_order_id,
        created_at: pendingTransaction.created_at
      });
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Anda sudah memiliki pembayaran yang pending. Mohon selesaikan atau batalkan terlebih dahulu.',
        ERROR_CODES.VALIDATION_ERROR,
        'payment_pending',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // If user has trial, update it instead of creating new subscription
    let subscription;
    if (existingTrial) {
      // Update existing trial subscription for upgrade (keep trial metadata for webhook)
      const { data: updatedSubscription, error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          plan_id: planId,
          plan_name: plan.name,
          plan_duration: plan.duration,
          price: plan.price,
          status: 'pending', // Will be converted to active when payment succeeds
          // Keep trial metadata (free_trial_start_date, free_trial_end_date) for webhook to extend from trial end
        })
        .eq('id', existingTrial.id)
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      subscription = updatedSubscription;
    } else {
      // Create new subscription record
      const { data: newSubscription, error: subscriptionError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: planId,
          plan_name: plan.name,
          plan_duration: plan.duration,
          price: plan.price,
          status: 'pending'
        })
        .select()
        .single();

      if (subscriptionError) {
        throw subscriptionError;
      }
      subscription = newSubscription;
    }

    // Create Midtrans transaction first
    const midtransOrderId = `SUB-${Date.now()}-${userId.substring(0, 8)}`;
    const midtransTransaction = await midtransService.createSubscriptionTransaction({
      orderId: midtransOrderId,
      planId: plan.id,
      planName: plan.name,
      planDuration: plan.duration,
      price: plan.price,
      customer: {
        name: userName,
        email: userEmail
      },
      callbacks: {
        finish: config.SUCCESS_URL,
        error: config.ERROR_URL,
        pending: config.PENDING_URL
      }
    });

    // Get Snap token (only call this ONCE - each call generates NEW token!)
    const snapToken = await midtransService.createSnapToken(midtransTransaction);
    
    // Build payment URL from snap token (don't call createSnapRedirectUrl - it generates different token!)
    const paymentUrl = `https://app.${config.MIDTRANS_IS_PRODUCTION ? '' : 'sandbox.'}midtrans.com/snap/v4/redirection/${snapToken}`;

    // Double-check no pending transaction before creating (race condition protection)
    const { data: recheck } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();
    
    if (recheck) {
      console.warn('⚠️ Race condition detected - pending transaction created between checks');
      // Rollback subscription if it was just created
      if (!existingTrial) {
        await supabaseAdmin
          .from('subscriptions')
          .delete()
          .eq('id', subscription.id);
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Pembayaran pending sudah dibuat. Mohon refresh halaman.',
        ERROR_CODES.VALIDATION_ERROR,
        'race_condition',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Create transaction record
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: userId,
        subscription_id: subscription.id,
        midtrans_order_id: midtransOrderId,
        payment_method: paymentMethod,
        amount: plan.price,
        plan_duration: plan.duration, // Save plan duration for webhook settlement calculation
        plan_name: plan.name, // Save plan name for user subscription update
        status: 'pending',
        payment_url: paymentUrl,
        snap_token: snapToken, // Save snap token - reusable until transaction expires
        expiry_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours expiry
      })
      .select()
      .single();

    if (transactionError) {
      console.error('❌ Failed to create transaction:', transactionError);
      // Rollback subscription if it was just created
      if (!existingTrial) {
        await supabaseAdmin
          .from('subscriptions')
          .delete()
          .eq('id', subscription.id);
      }
      throw transactionError;
    }
    
    console.log('✅ Transaction created:', {
      transaction_id: transaction.id,
      order_id: midtransOrderId,
      user_id: userId,
      subscription_id: subscription.id
    });
    await supabaseAdmin
      .from('payment_logs')
      .insert({
        transaction_id: transaction.id,
        log_type: 'request',
        source: 'backend',
        message: 'Payment order created',
        data: {
          planId,
          paymentMethod,
          orderId: midtransOrderId,
          amount: plan.price
        }
      });

    // Log payment activity
    await supabaseAdmin.rpc('log_payment_activity', {
      p_user_id: userId,
      p_activity_type: 'payment_pending',
      p_transaction_id: transaction.id,
      p_subscription_id: subscription.id,
      p_status_to: 'pending',
      p_amount: plan.price,
      p_payment_method: paymentMethod,
      p_description: `Payment pending for ${plan.name} plan`,
      p_metadata: {
        plan_id: planId,
        order_id: midtransOrderId,
        snap_token: snapToken
      }
    });

    return res.json(createSuccessResponse({
      subscriptionId: subscription.id,
      transactionId: transaction.id,
      snapToken,
      orderId: midtransOrderId,
      amount: plan.price,
      plan: plan,
      paymentUrl: paymentUrl
    }, 'Payment order created successfully'));

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Invalid request data',
        ERROR_CODES.VALIDATION_ERROR,
        error.errors[0]?.['path']?.join('.'),
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to create payment order',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/webhook/test
 * Test webhook endpoint - publicly accessible for health check
 */
router.get('/webhook/test', async (req, res) => {
  try {
    console.log('🧪 Webhook test endpoint accessed:', {
      url: req.url,
      method: req.method,
      headers: {
        'user-agent': req.headers['user-agent'],
        'origin': req.headers['origin']
      }
    });
    
    return res.status(200).json(createSuccessResponse({
      message: 'Webhook endpoint is working',
      timestamp: new Date().toISOString(),
      url: config.WEBHOOK_URL,
      endpoint: '/api/subscription/webhook',
      method: 'POST'
    }, 'Webhook test successful'));
  } catch (error: any) {
    console.error('❌ Webhook test error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Webhook test failed',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/webhook/simulate
 * Simulate webhook for testing (development only)
 */
router.post('/webhook/simulate', async (req, res) => {
  try {
    // Only allow in development mode
    if (config.NODE_ENV === 'production') {
      return res.status(HTTP_STATUS.FORBIDDEN).json(createErrorResponse(
        'Webhook simulation is only available in development mode',
        ERROR_CODES.UNAUTHORIZED,
        undefined,
        HTTP_STATUS.FORBIDDEN
      ));
    }

    const { orderId, transactionStatus, paymentType, fraudStatus } = req.body;

    if (!orderId || !transactionStatus) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'orderId and transactionStatus are required',
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Create simulated webhook payload
    const simulatedWebhook = {
      order_id: orderId,
      transaction_status: transactionStatus,
      payment_type: paymentType || 'credit_card',
      fraud_status: fraudStatus || 'accept',
      transaction_id: `TEST-${Date.now()}`,
      gross_amount: '89000',
      currency: 'IDR',
      status_code: '200',
      status_message: 'Success',
      transaction_time: new Date().toISOString(),
      settlement_time: transactionStatus === 'settlement' ? new Date().toISOString() : null
    };

    // Validate with webhook schema
    const webhookData = webhookSchema.parse(simulatedWebhook);

    // Process webhook (reuse existing webhook handler logic)
    // We'll call the webhook processing logic directly
    console.log('🧪 Simulating webhook:', simulatedWebhook);

    // Log simulated webhook
    await supabaseAdmin
      .from('payment_logs')
      .insert({
        log_type: 'webhook',
        source: 'simulation',
        message: 'Simulated webhook received',
        data: webhookData
      });

    // Map Midtrans status to database status (use Midtrans status directly)
    // Database constraint expects: pending, settlement, capture, cancel, expire, deny, failure
    let dbStatus: string = webhookData.transaction_status;
    
    // Only normalize settlement/capture to 'settlement'
    if (webhookData.transaction_status === 'capture') {
      dbStatus = 'settlement'; // Normalize capture to settlement
    }
    // Keep deny, failure, expire, cancel as their original values for proper differentiation

    // Get transaction
    const { data: existingTransaction, error: fetchError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('midtrans_order_id', webhookData.order_id)
      .single();

    if (fetchError || !existingTransaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Transaction not found for simulation',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Handle fraud status
    if (webhookData.fraud_status === 'deny') {
      dbStatus = 'deny'; // Use 'deny' instead of 'cancel' for fraud
    } else if (webhookData.fraud_status === 'challenge') {
      dbStatus = 'pending';
    }

    // Update transaction
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: dbStatus,
          midtrans_transaction_id: webhookData.transaction_id,
          payment_method: webhookData.payment_type || existingTransaction.payment_method,
          settlement_time: parseSettlementTime(webhookData.settlement_time),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTransaction.id)
        .select()
        .single();

    if (transactionError) {
      throw transactionError;
    }

    // Handle successful payment (settlement or capture)
    if ((dbStatus === 'settlement' || webhookData.transaction_status === 'capture') && webhookData.fraud_status !== 'deny' && webhookData.fraud_status !== 'challenge') {
      const { data: currentSubscription } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('id', transaction.subscription_id)
        .single();

      // Helper function to safely add days to a date
      const addDays = (date: Date, days: number): Date => {
        // Validate input date
        if (isNaN(date.getTime())) {
          console.warn('⚠️ Invalid input date for addDays, using current date');
          date = new Date();
        }
        
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        
        // Validate result
        if (isNaN(result.getTime())) {
          console.error('❌ Invalid date calculated in addDays, using fallback');
          return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
        }
        
        return result;
      };
      
      let endDate = new Date();
      if (currentSubscription?.free_trial_end_date) {
        const trialEndDate = new Date(currentSubscription.free_trial_end_date);
        const now = new Date();
        // Validate trial end date
        if (!isNaN(trialEndDate.getTime()) && trialEndDate > now) {
          endDate = addDays(trialEndDate, transaction.plan_duration);
        } else {
          endDate = addDays(new Date(), transaction.plan_duration);
        }
      } else {
        endDate = addDays(new Date(), transaction.plan_duration);
      }

      // Validate endDate before using toISOString()
      if (isNaN(endDate.getTime()) || !endDate || endDate.getTime() <= 0) {
        console.error('❌ Invalid endDate calculated, using current date + plan duration (days)');
        // Fallback: use simple date arithmetic
        endDate = new Date();
        endDate.setDate(endDate.getDate() + transaction.plan_duration);
        
        // Final validation
        if (isNaN(endDate.getTime()) || !endDate || endDate.getTime() <= 0) {
          console.error('❌ Ultimate fallback: using current date + 30 days');
          endDate = new Date();
          endDate.setDate(endDate.getDate() + 30);
        }
      }
      
      // Final check before toISOString()
      if (isNaN(endDate.getTime()) || !endDate || endDate.getTime() <= 0) {
        console.error('❌ endDate still invalid after all fallbacks, using current date');
        endDate = new Date();
      }

      // Validate free_trial_start_date before using
      let startDate: string;
      if (currentSubscription?.free_trial_start_date) {
        const trialStartDate = new Date(currentSubscription.free_trial_start_date);
        if (!isNaN(trialStartDate.getTime())) {
          startDate = trialStartDate.toISOString();
        } else {
          console.warn('⚠️ Invalid free_trial_start_date, using current date');
          startDate = new Date().toISOString();
        }
      } else {
        startDate = new Date().toISOString();
      }

      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          start_date: startDate,
          end_date: endDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.subscription_id);

      await supabaseAdmin
        .from('users')
        .update({
          subscription_status: 'active',
          subscription_plan: transaction.plan_name,
          subscription_start_date: startDate,
          subscription_end_date: endDate.toISOString(),
          last_payment_date: new Date().toISOString(),
          payment_failure_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.user_id);
    }

    // Handle failed payment (deny, failure, expire, cancel)
    if (['deny', 'failure', 'expire', 'cancel'].includes(dbStatus)) {
      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.subscription_id);
    }

    return res.json(createSuccessResponse({
      simulated: true,
      orderId: webhookData.order_id,
      transactionStatus: webhookData.transaction_status,
      dbStatus: dbStatus,
      transactionId: transaction.id
    }, 'Webhook simulated successfully'));

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Invalid simulation data',
        ERROR_CODES.VALIDATION_ERROR,
        error.errors[0]?.['path']?.join('.'),
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Webhook simulation failed',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/webhook
 * Handle Midtrans webhook notifications
 * 
 * IMPORTANT: This endpoint must be publicly accessible (no auth required)
 * and must return HTTP 200 OK to acknowledge receipt of webhook
 */
router.post('/webhook', async (req, res) => {
  try {
    console.log('📥 Webhook received from Midtrans:');
    console.log('  Headers:', {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    });
    console.log('  Body (full):', JSON.stringify(req.body, null, 2));
    console.log('  Timestamp:', new Date().toISOString());
    
    const webhookData = webhookSchema.parse(req.body);
    
    // Verify webhook signature using signature_key from body (Midtrans sends it in body, not header)
    if (config.NODE_ENV === 'production' && webhookData.signature_key) {
      const orderId = webhookData.order_id;
      const statusCode = webhookData.status_code || '200';
      const grossAmount = webhookData.gross_amount || '0';
      
      // Generate expected signature
      const expectedSignature = midtransService.generateSignatureKey(orderId, statusCode, grossAmount);
      
      if (expectedSignature !== webhookData.signature_key) {
        console.error('❌ Invalid webhook signature:', {
          expected: expectedSignature.substring(0, 20) + '...',
          received: webhookData.signature_key?.substring(0, 20) + '...'
        });
        
        // Still return 200 to prevent Midtrans retry, but log error
        return res.status(200).json(createSuccessResponse({}, 'Webhook received (invalid signature logged)'));
      }
      
      console.log('✅ Webhook signature verified');
    }

    // Get transaction first to check idempotency
    const { data: existingTransaction, error: fetchError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('midtrans_order_id', webhookData.order_id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (!existingTransaction) {
      // Transaction not found - log warning but return 200 to prevent Midtrans retry
      console.warn('⚠️ Webhook received for unknown transaction:', webhookData.order_id);
      await supabaseAdmin
        .from('payment_logs')
        .insert({
          log_type: 'webhook',
          source: 'midtrans',
          message: 'Webhook received for unknown transaction',
          data: {
            order_id: webhookData.order_id,
            transaction_status: webhookData.transaction_status,
            webhook_data: webhookData
          }
        });
      // Return 200 OK to prevent Midtrans retry
      return res.status(200).json(createSuccessResponse({}, 'Webhook received (transaction not found)'));
    }

    // Map Midtrans status to database status (use Midtrans status directly)
    // Database constraint expects: pending, settlement, capture, cancel, expire, deny, failure
    let dbStatus: string = webhookData.transaction_status;
    
    // Only normalize settlement/capture to 'settlement'
    if (webhookData.transaction_status === 'capture') {
      dbStatus = 'settlement'; // Normalize capture to settlement
    }
    // Keep deny, failure, expire, cancel as their original values for proper differentiation

    // IDEMPOTENCY CHECK: If transaction already has the same status AND same transaction_id from Midtrans, skip processing
    // This prevents duplicate processing when same webhook is received multiple times
    if (existingTransaction.status === dbStatus && 
        (dbStatus === 'settlement' || dbStatus === 'capture') &&
        existingTransaction.midtrans_transaction_id === webhookData.transaction_id) {
      console.log('✅ Duplicate webhook detected - transaction already processed:', {
        order_id: webhookData.order_id,
        transaction_id: webhookData.transaction_id,
        status: dbStatus
      });
      // Log duplicate webhook but don't process again
      await supabaseAdmin
        .from('payment_logs')
        .insert({
          transaction_id: existingTransaction.id,
          log_type: 'webhook',
          source: 'midtrans',
          message: 'Duplicate webhook received (already processed)',
          data: {
            order_id: webhookData.order_id,
            transaction_id: webhookData.transaction_id,
            transaction_status: webhookData.transaction_status,
            current_status: existingTransaction.status,
            webhook_data: webhookData
          }
        });
      return res.status(200).json(createSuccessResponse({}, 'Webhook already processed (idempotency check)'));
    }

    // FRAUD STATUS CHECK: Handle fraud_status before processing payment
    if (webhookData.fraud_status === 'deny') {
      // Fraud detected by FDS - use 'deny' status (not 'cancel')
      console.warn('🚨 Fraud detected by FDS for transaction:', webhookData.order_id);
      dbStatus = 'deny'; // Use 'deny' instead of 'cancel'
      
      await supabaseAdmin
        .from('transactions')
        .update({
          status: 'deny',
          fraud_status: 'deny',
          midtrans_transaction_id: webhookData.transaction_id,
          payment_method: webhookData.payment_type || existingTransaction.payment_method,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTransaction.id);

      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTransaction.subscription_id);

      await supabaseAdmin
        .from('payment_logs')
        .insert({
          transaction_id: existingTransaction.id,
          log_type: 'error',
          source: 'webhook',
          message: 'Payment denied by Fraud Detection System',
          data: {
            transaction_status: webhookData.transaction_status,
            fraud_status: webhookData.fraud_status,
            order_id: webhookData.order_id,
            payment_type: webhookData.payment_type
          }
        });

      // UPDATE payment activity with correct status and detailed payment method
      const formattedPaymentMethod = formatPaymentMethod(webhookData, existingTransaction.payment_method);
      
      await supabaseAdmin
        .from('payment_activity')
        .update({
          status_to: 'deny',
          payment_method: formattedPaymentMethod,
          description: 'Payment denied by Fraud Detection System'
        })
        .eq('transaction_id', existingTransaction.id)
        .eq('user_id', existingTransaction.user_id);

      console.log('✅ Payment activity updated to deny (fraud) for transaction:', existingTransaction.id);
      return res.status(200).json(createSuccessResponse({}, 'Webhook processed - fraud detected, transaction denied'));
    }

    if (webhookData.fraud_status === 'challenge') {
      // Fraud challenge - hold transaction, require manual review
      console.warn('⚠️ Fraud challenge for transaction:', webhookData.order_id);
      
      await supabaseAdmin
        .from('transactions')
        .update({
          status: 'pending', // Keep as pending for manual review
          midtrans_transaction_id: webhookData.transaction_id,
          payment_method: webhookData.payment_type || existingTransaction.payment_method,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTransaction.id);

      await supabaseAdmin
        .from('payment_logs')
        .insert({
          transaction_id: existingTransaction.id,
          log_type: 'webhook',
          source: 'midtrans',
          message: 'Payment held for fraud review (challenge)',
          data: {
            transaction_status: webhookData.transaction_status,
            fraud_status: webhookData.fraud_status,
            order_id: webhookData.order_id,
            requires_manual_review: true
          }
        });

      // UPDATE payment activity to pending (fraud challenge)
      await supabaseAdmin
        .from('payment_activity')
        .update({
          description: 'Payment held for fraud review (challenge)'
        })
        .eq('transaction_id', existingTransaction.id)
        .eq('user_id', existingTransaction.user_id);

      // Don't activate subscription, return success to acknowledge webhook
      return res.status(200).json(createSuccessResponse({}, 'Webhook processed - fraud challenge, transaction held for review'));
    }

    // Log webhook
    await supabaseAdmin
      .from('payment_logs')
      .insert({
        transaction_id: existingTransaction.id,
        log_type: 'webhook',
        source: 'midtrans',
        message: 'Webhook received',
        data: webhookData
      });

    // Update transaction status and payment method
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: dbStatus,
        midtrans_transaction_id: webhookData.transaction_id,
        payment_method: webhookData.payment_type || existingTransaction.payment_method, // Update payment method from webhook
        settlement_time: parseSettlementTime(webhookData.settlement_time),
        updated_at: new Date().toISOString()
      })
      .eq('id', existingTransaction.id)
      .select()
      .single();

    if (transactionError) {
      throw transactionError;
    }

    if (!transaction) {
      // This should not happen, but handle gracefully
      console.error('❌ Transaction update failed:', transactionError);
      // Return 200 to prevent Midtrans retry, but log error
      await supabaseAdmin
        .from('payment_logs')
        .insert({
          log_type: 'error',
          source: 'webhook',
          message: 'Transaction update failed after fetch',
          data: {
            order_id: webhookData.order_id,
            error: transactionError
          }
        });
      return res.json(createSuccessResponse({}, 'Webhook received (update failed)'));
    }

    // Handle successful payment (settlement or capture)
    if (dbStatus === 'settlement' || webhookData.transaction_status === 'capture') {
      // CAPTURE vs SETTLEMENT: For credit card capture, activate immediately
      // For bank transfer/e-wallet, only activate on settlement
      const isCapture = webhookData.transaction_status === 'capture';
      const isCreditCard = webhookData.payment_type === 'credit_card' || webhookData.payment_type?.includes('credit');
      
      // Only activate if:
      // 1. Settlement (any payment type) - payment confirmed
      // 2. Capture + Credit Card - payment authorized for credit card
      // Don't activate for capture of non-credit-card payments (wait for settlement)
      if (isCapture && !isCreditCard) {
        console.log('⏳ Capture received for non-credit-card payment, waiting for settlement:', {
          order_id: webhookData.order_id,
          payment_type: webhookData.payment_type
        });
        
        // Log capture but don't activate subscription yet
        await supabaseAdmin
          .from('payment_logs')
          .insert({
            transaction_id: transaction.id,
            log_type: 'webhook',
            source: 'midtrans',
            message: 'Payment captured, waiting for settlement',
            data: {
              transaction_status: webhookData.transaction_status,
              payment_type: webhookData.payment_type,
              waiting_for_settlement: true
            }
          });
        
      // Return success but don't activate subscription
      return res.status(200).json(createSuccessResponse({}, 'Webhook processed - capture received, waiting for settlement'));
      }

      // Check if user has active trial - if yes, extend from trial end date
      const { data: currentSubscription } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('id', transaction.subscription_id)
        .single();

      let endDate = new Date();
      
      // Helper function to safely add days to a date
      const addDays = (date: Date, days: number): Date => {
        // Validate input date
        if (isNaN(date.getTime())) {
          console.warn('⚠️ Invalid input date for addDays, using current date');
          date = new Date();
        }
        
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        
        // Validate result
        if (isNaN(result.getTime())) {
          console.error('❌ Invalid date calculated in addDays, using fallback');
          return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
        }
        
        return result;
      };
      
      // If converting from trial, extend from trial end date
      // Check if subscription has trial history (free_trial_end_date exists)
      if (currentSubscription?.free_trial_end_date) {
        const trialEndDate = new Date(currentSubscription.free_trial_end_date);
        const now = new Date();
        // Validate trial end date
        if (!isNaN(trialEndDate.getTime()) && trialEndDate > now) {
          endDate = addDays(trialEndDate, transaction.plan_duration);
        } else {
          // Trial already expired or invalid date, start from now
          endDate = addDays(new Date(), transaction.plan_duration);
        }
      } else {
        // No trial history, start from now
        endDate = addDays(new Date(), transaction.plan_duration);
      }

      // Validate endDate before using toISOString()
      if (isNaN(endDate.getTime()) || !endDate || endDate.getTime() <= 0) {
        console.error('❌ Invalid endDate calculated, using current date + plan duration (days)');
        // Fallback: use simple date arithmetic
        endDate = new Date();
        endDate.setDate(endDate.getDate() + transaction.plan_duration);
        
        // Final validation
        if (isNaN(endDate.getTime()) || !endDate || endDate.getTime() <= 0) {
          console.error('❌ Ultimate fallback: using current date + 30 days');
          endDate = new Date();
          endDate.setDate(endDate.getDate() + 30);
        }
      }
      
      // Final check before toISOString()
      if (isNaN(endDate.getTime()) || !endDate || endDate.getTime() <= 0) {
        console.error('❌ endDate still invalid after all fallbacks, using current date');
        endDate = new Date();
      }

      // Validate free_trial_start_date before using
      let startDate: string;
      if (currentSubscription?.free_trial_start_date) {
        const trialStartDate = new Date(currentSubscription.free_trial_start_date);
        if (!isNaN(trialStartDate.getTime())) {
          startDate = trialStartDate.toISOString();
        } else {
          console.warn('⚠️ Invalid free_trial_start_date, using current date');
          startDate = new Date().toISOString();
        }
      } else {
        startDate = new Date().toISOString();
      }

      // Update subscription to active with correct plan data
      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          plan_name: transaction.plan_name, // Update plan name from transaction
          plan_duration: transaction.plan_duration, // Update plan duration from transaction
          start_date: startDate, // Keep trial start date if exists and valid
          end_date: endDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.subscription_id);

      // Update user subscription info
      await supabaseAdmin
        .from('users')
        .update({
          subscription_status: 'active',
          subscription_plan: transaction.plan_name,
          subscription_start_date: startDate,
          subscription_end_date: endDate.toISOString(),
          last_payment_date: new Date().toISOString(),
          payment_failure_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.user_id);

      // Log successful payment
      await supabaseAdmin
        .from('payment_logs')
        .insert({
          transaction_id: transaction.id,
          log_type: 'response',
          source: 'webhook',
          message: 'Payment settled successfully',
          data: {
            transaction_status: webhookData.transaction_status,
            settlement_time: webhookData.settlement_time
          }
        });

      // UPDATE payment activity to 'active' (subscription activated)
      // Single UPDATE: settlement + activation in one go, including detailed payment_method
      const formattedPaymentMethod = formatPaymentMethod(webhookData, transaction.payment_method);
      
      const { error: updateActivityError } = await supabaseAdmin
        .from('payment_activity')
        .update({
          status_to: 'active',
          payment_method: formattedPaymentMethod,
          description: `Payment completed - Subscription activated for ${transaction.plan_name}`
        })
        .eq('transaction_id', transaction.id)
        .eq('user_id', transaction.user_id);
      
      if (updateActivityError) {
        console.error('❌ Failed to update payment activity:', updateActivityError);
        // Note: Don't fallback to INSERT - UNIQUE constraint will prevent it anyway
        // The payment_activity table enforces 1 row per transaction
      } else {
        console.log('✅ Payment activity updated to active for transaction:', transaction.id);
      }
    }

    // Handle pending status (update payment method and log, but don't activate)
    if (dbStatus === 'pending') {
      console.log('⏳ Pending payment webhook received:', {
        order_id: webhookData.order_id,
        payment_type: webhookData.payment_type
      });

      // Update payment method and payment details
      const paymentDetailsUpdate: any = {
        payment_method: webhookData.payment_type || transaction.payment_method,
        updated_at: new Date().toISOString()
      };

      // Store payment details based on payment type
      if (webhookData.va_numbers && webhookData.va_numbers.length > 0) {
        // Bank Transfer (VA)
        paymentDetailsUpdate.va_numbers = webhookData.va_numbers;
        const firstVa = webhookData.va_numbers[0];
        if (firstVa) {
          paymentDetailsUpdate.va_number = firstVa.va_number;
          paymentDetailsUpdate.bank_code = firstVa.bank;
        }
      }

      if (webhookData.bill_key) {
        // Mandiri Bill Payment
        paymentDetailsUpdate.bill_key = webhookData.bill_key;
        if (webhookData.biller_code) {
          paymentDetailsUpdate.biller_code = webhookData.biller_code;
        }
      }

      if ((webhookData as any).payment_code) {
        // Convenience Store (Indomaret/Alfamart) or QRIS
        paymentDetailsUpdate.payment_code = (webhookData as any).payment_code;
      }

      if (webhookData.store) {
        // Convenience Store name
        paymentDetailsUpdate.store = webhookData.store;
      }

      if (webhookData.permata_va_number) {
        // Permata VA
        paymentDetailsUpdate.permata_va_number = webhookData.permata_va_number;
      }

      // Store complete payment details as JSON for future reference
      paymentDetailsUpdate.payment_details = {
        transaction_status: webhookData.transaction_status,
        payment_type: webhookData.payment_type,
        va_numbers: webhookData.va_numbers,
        bill_key: webhookData.bill_key,
        biller_code: webhookData.biller_code,
        payment_code: (webhookData as any).payment_code,
        store: webhookData.store,
        permata_va_number: webhookData.permata_va_number,
        card_number: webhookData.card_number,
        masked_card: webhookData.masked_card,
        bank: webhookData.bank,
        actions: (webhookData as any).actions // QR code, deeplink, etc.
      };

      await supabaseAdmin
        .from('transactions')
        .update(paymentDetailsUpdate)
        .eq('id', transaction.id);

      // Log pending webhook
      await supabaseAdmin
        .from('payment_logs')
        .insert({
          transaction_id: transaction.id,
          log_type: 'webhook',
          source: 'midtrans',
          message: 'Pending payment webhook received',
          data: {
            transaction_status: webhookData.transaction_status,
            payment_type: webhookData.payment_type,
            va_numbers: webhookData.va_numbers,
            bill_key: webhookData.bill_key,
            biller_code: webhookData.biller_code
          }
        });

      // UPDATE existing payment activity instead of creating new one
      // This prevents duplicate rows in payment history
      const formattedPaymentMethod = formatPaymentMethod(webhookData, transaction.payment_method);
      
      const { error: updateActivityError } = await supabaseAdmin
        .from('payment_activity')
        .update({
          payment_method: formattedPaymentMethod,
          description: 'Payment pending - waiting for completion',
          metadata: {
            transaction_status: webhookData.transaction_status,
            payment_type: webhookData.payment_type,
            card_type: webhookData.card_type,
            bank: webhookData.bank,
            va_numbers: webhookData.va_numbers,
            bill_key: webhookData.bill_key,
            biller_code: webhookData.biller_code
          }
        })
        .eq('transaction_id', transaction.id)
        .eq('user_id', transaction.user_id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (updateActivityError) {
        console.error('Failed to update payment activity (pending):', updateActivityError);
        // Don't throw, just log - this is not critical
      } else {
        console.log('✅ Payment activity updated (pending) for transaction:', transaction.id);
      }

      // Return success - pending is expected, don't activate subscription
      return res.status(200).json(createSuccessResponse({}, 'Webhook processed - payment pending'));
    }

    // Handle failed/cancelled payment (deny, failure, expire, cancel)
    if (['deny', 'failure', 'expire', 'cancel'].includes(dbStatus)) {
      console.log(`❌ Payment ${dbStatus} webhook received:`, {
        order_id: webhookData.order_id,
        transaction_status: webhookData.transaction_status,
        fraud_status: webhookData.fraud_status,
        status_message: webhookData.status_message,
        transaction_id: transaction.id
      });

      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.subscription_id);

      // Log failed payment
      await supabaseAdmin
        .from('payment_logs')
        .insert({
          transaction_id: transaction.id,
          log_type: 'error',
          source: 'webhook',
          message: `Payment ${webhookData.transaction_status}`,
          data: {
            transaction_status: webhookData.transaction_status,
            status_message: webhookData.status_message
          }
        });

      // UPDATE payment activity with actual status and detailed payment method
      const formattedPaymentMethod = formatPaymentMethod(webhookData, transaction.payment_method);
      
      await supabaseAdmin
        .from('payment_activity')
        .update({
          status_to: dbStatus, // Use actual status instead of hardcoded 'cancel'
          payment_method: formattedPaymentMethod,
          description: `Payment ${dbStatus} - ${webhookData.status_message || ''}`
        })
        .eq('transaction_id', transaction.id)
        .eq('user_id', transaction.user_id);

      console.log(`✅ Payment activity updated to ${dbStatus} for transaction:`, transaction.id);
    }

    return res.json(createSuccessResponse({}, 'Webhook processed successfully'));

  } catch (error: any) {
    console.error('❌ Webhook processing error:', {
      error: error.message,
      stack: error.stack,
      order_id: req.body?.order_id,
      timestamp: new Date().toISOString()
    });

    // Log error to database
    try {
      await supabaseAdmin
        .from('payment_logs')
        .insert({
          log_type: 'error',
          source: 'webhook',
          message: 'Webhook processing error',
          data: {
            error: error.message,
            error_name: error.name,
            order_id: req.body?.order_id,
            stack: error.stack
          }
        });
    } catch (logError) {
      console.error('Failed to log webhook error:', logError);
    }

    if (error.name === 'ZodError') {
      // Return 200 OK for validation errors to prevent Midtrans retry
      // But log the error for manual review
      console.warn('⚠️ Webhook validation error (returning 200 OK to prevent retry):', error.errors);
      return res.status(200).json(createSuccessResponse({}, 'Webhook received (validation error logged)'));
    }

    // For other errors, return 200 OK to prevent Midtrans retry
    // But log error for manual review
    console.error('❌ Webhook processing error (returning 200 OK to prevent retry):', error);
    return res.status(200).json(createSuccessResponse({}, 'Webhook received (processing error logged)'));
  }
});

/**
 * GET /api/subscription/status
 * Get user's subscription status
 */
router.get('/status', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;

    // Get user's current active subscription (exclude cancelled, failed, expired)
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        transactions (
          id,
          midtrans_order_id,
          status,
          amount,
          payment_method,
          created_at,
          settlement_time
        )
      `)
      .eq('user_id', userId)
      .in('status', ['active', 'trial', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subscriptionError && subscriptionError.code !== 'PGRST116') {
      throw subscriptionError;
    }

    // Additionally, get the latest trial/expired record to show end date when trial already ended
    const { data: latestTrialOrExpired, error: latestTrialError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, free_trial_end_date, end_date, plan_name, created_at')
      .eq('user_id', userId)
      .in('status', ['trial', 'expired'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestTrialError && latestTrialError.code !== 'PGRST116') {
      throw latestTrialError;
    }

    // Get user's payment history with subscription details
    // Show pending, settlement, and cancel (but not expired transactions)
    const { data: transactions, error: transactionsError } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        subscriptions (
          plan_name,
          plan_id,
          plan_duration
        )
      `)
      .eq('user_id', userId)
      .in('status', ['pending', 'settlement', 'cancel']) // Include cancel status
      .order('created_at', { ascending: false })
      .limit(10);
    
    console.log('📊 Payment history query result:', {
      user_id: userId,
      transactions_count: transactions?.length || 0,
      transactions: transactions?.map(t => ({
        id: t.id,
        order_id: t.midtrans_order_id,
        status: t.status,
        payment_method: t.payment_method,
        created_at: t.created_at
      }))
    });

    if (transactionsError) {
      throw transactionsError;
    }

    return res.json(createSuccessResponse({
      subscription: subscription || null,
      latestTrial: latestTrialOrExpired || null,
      transactions: transactions || [],
      plans: subscriptionPlans
    }, 'Subscription status retrieved successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve subscription status',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/start-trial
 * Start free trial for eligible user
 */
router.post('/start-trial', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;

    // Check eligibility
    const eligible = await checkTrialEligibility(userId);
    if (!eligible) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Not eligible for free trial',
        ERROR_CODES.VALIDATION_ERROR,
        'eligibility',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Create trial subscription
    let startDate = new Date();
    let endDate = new Date();
    endDate.setDate(endDate.getDate() + FREE_TRIAL_CONFIG.durationDays);
    
    // Validate dates before using toISOString()
    if (isNaN(startDate.getTime()) || !startDate || startDate.getTime() <= 0) {
      console.error('❌ Invalid startDate for trial, using current date');
      startDate = new Date();
    }
    
    if (isNaN(endDate.getTime()) || !endDate || endDate.getTime() <= 0) {
      console.error('❌ Invalid endDate for trial, using current date + duration');
      endDate = new Date();
      endDate.setDate(endDate.getDate() + FREE_TRIAL_CONFIG.durationDays);
      
      // Final validation
      if (isNaN(endDate.getTime()) || !endDate || endDate.getTime() <= 0) {
        console.error('❌ Fallback endDate also invalid, using current date + 7 days');
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
      }
    }

    // Create subscription record
    // Note: plan_duration is set to 1 to satisfy database constraint,
    // but trial duration is actually controlled by free_trial_end_date
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_id: 'pro',
        plan_name: FREE_TRIAL_CONFIG.planType,
        plan_duration: 1, // Set to 1 to satisfy constraint, actual trial uses free_trial_end_date
        price: 0.01, // Set to 0.01 to satisfy constraint, trial is actually free (price 0)
        status: 'trial',
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        free_trial_used: true,
        free_trial_start_date: startDate.toISOString(),
        free_trial_end_date: endDate.toISOString()
      })
      .select()
      .single();

    if (subscriptionError) {
      throw subscriptionError;
    }

    // Update users table
    // Note: free_trial_used is stored in subscriptions table, not users table
    const { error: userUpdateError } = await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'trial',
        subscription_plan: FREE_TRIAL_CONFIG.planType,
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString()
      })
      .eq('id', userId);

    if (userUpdateError) {
      throw userUpdateError;
    }

    return res.json(createSuccessResponse({
      subscription,
      message: 'Free trial started successfully'
    }, 'Free trial started successfully'));

  } catch (error: any) {
    console.error('Error starting trial:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to start free trial',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/trial-status
 * Get trial eligibility and active trial status
 */
router.get('/trial-status', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;

    // Check eligibility
    const eligible = await checkTrialEligibility(userId);

    // Get active trial if exists
    const { data: activeTrial } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'trial')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json(createSuccessResponse({
      eligible,
      hasActiveTrial: !!activeTrial,
      trial: activeTrial || null
    }, 'Trial status retrieved successfully'));

  } catch (error: any) {
    console.error('Error getting trial status:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to get trial status',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/payment-activity
 * Get user's payment activity
 */
router.get('/payment-activity', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Get payment activity
    const { data: activities, error: activitiesError } = await supabaseAdmin
      .rpc('get_user_payment_activity', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset
      });

    if (activitiesError) {
      throw activitiesError;
    }

    // Get payment activity summary
    const { data: summary, error: summaryError } = await supabaseAdmin
      .rpc('get_payment_activity_summary', {
        p_user_id: userId
      });

    if (summaryError) {
      throw summaryError;
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabaseAdmin
      .from('payment_activity')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      throw countError;
    }

    return res.json(createSuccessResponse({
      activities: activities || [],
      summary: summary?.[0] || null,
      total: totalCount || 0,
      pagination: {
        limit,
        offset,
        hasMore: activities?.length === limit
      }
    }, 'Payment activity retrieved successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve payment activity',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/check-status
 * Manually check payment status from Midtrans
 */
router.post('/check-status', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Order ID is required',
        ERROR_CODES.VALIDATION_ERROR,
        'orderId',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Get transaction from database
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('midtrans_order_id', orderId)
      .eq('user_id', userId)
      .single();

    if (transactionError || !transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Check status from Midtrans
    let midtransStatus;
    try {
      midtransStatus = await midtransService.getTransactionStatus(orderId);
    } catch (error) {
      // If transaction not found in Midtrans, treat as pending
      console.log('Transaction not found in Midtrans:', error);
      midtransStatus = {
        transaction_status: 'pending',
        transaction_id: null,
        settlement_time: null
      };
    }
    
    // Update transaction status if changed
    if (midtransStatus.transaction_status !== transaction.status) {
      await supabaseAdmin
        .from('transactions')
        .update({
          status: midtransStatus.transaction_status,
          midtrans_transaction_id: midtransStatus.transaction_id,
          settlement_time: parseSettlementTime(midtransStatus.settlement_time),
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      // UPDATE payment activity with manual check result
      await supabaseAdmin
        .from('payment_activity')
        .update({
          status_to: midtransStatus.transaction_status,
          description: 'Status checked manually'
        })
        .eq('transaction_id', transaction.id)
        .eq('user_id', userId);
    }

    return res.json(createSuccessResponse({
      orderId,
      currentStatus: transaction.status,
      midtransStatus: midtransStatus.transaction_status,
      updated: midtransStatus.transaction_status !== transaction.status
    }, 'Status checked successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to check payment status',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/cancel
 * Cancel user's subscription
 */
router.post('/cancel', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    // Get user's active subscription
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subscriptionError || !subscription) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'No active subscription found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Mark subscription as cancelled but keep active until end_date
    // This allows user to continue using premium features until subscription expires
    await supabaseAdmin
      .from('subscriptions')
      .update({
        auto_renew: false,  // Disable auto-renewal
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || 'User requested cancellation',
        updated_at: new Date().toISOString()
        // DON'T change status - keep it 'active' so user retains access until end_date
      })
      .eq('id', subscription.id);

    // User subscription info remains unchanged - they keep premium access until expiry
    // The subscription will auto-expire when end_date is reached (handled by cron/trigger)

    return res.json(createSuccessResponse({}, 'Subscription cancelled successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to cancel subscription',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/regenerate-snap-token
 * Regenerate snap token for existing pending transaction
 */
router.post('/regenerate-snap-token', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Transaction ID is required',
        ERROR_CODES.VALIDATION_ERROR,
        'transactionId',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Get pending transaction
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        subscriptions (
          plan_name,
          plan_id,
          plan_duration
        )
      `)
      .eq('id', transactionId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (transactionError || !transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Pending transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Check if transaction is not expired
    const now = new Date();
    const expiryTime = new Date(transaction.expiry_time);
    if (now > expiryTime) {
      // Update transaction to expired
      await supabaseAdmin
        .from('transactions')
        .update({
          status: 'expire',
          updated_at: now.toISOString()
        })
        .eq('id', transaction.id);

      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Transaction has expired. Please create a new order.',
        ERROR_CODES.VALIDATION_ERROR,
        'expired',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Get plan details
    const plan = subscriptionPlans.find(p => p.id === transaction.subscriptions?.plan_id);
    if (!plan) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Invalid plan for transaction',
        ERROR_CODES.VALIDATION_ERROR,
        'plan',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Reuse snap token - snap token valid until transaction expires
    // No need to check snap_expiry_time - we already checked transaction.expiry_time above
    console.log('📋 Regenerate Snap Token - Transaction Info:', {
      transactionId: transaction.id,
      orderId: transaction.midtrans_order_id,
      paymentMethod: transaction.payment_method,
      amount: transaction.amount,
      hasSnapToken: !!transaction.snap_token,
      hasPaymentUrl: !!transaction.payment_url,
      expiresAt: expiryTime.toISOString(),
      minutesRemaining: Math.round((expiryTime.getTime() - now.getTime()) / (1000 * 60))
    });
    
    // Transaction is not expired and has snap_token - reuse it
    if (transaction.snap_token && transaction.payment_url) {
      console.log('✅ Reusing existing snap token');
      
      // Return existing snap token
      // User will see payment page with previously selected payment method
      return res.json(createSuccessResponse({
        snapToken: transaction.snap_token,
        orderId: transaction.midtrans_order_id,
        paymentUrl: transaction.payment_url,
        transactionId: transaction.id,
        paymentMethod: transaction.payment_method,
        amount: transaction.amount,
        currency: transaction.currency || 'IDR',
        plan_name: transaction.subscriptions?.plan_name,
        expiryTime: expiryTime.toISOString()
      }, 'Snap token reused successfully'));
    }
    
    // If no snap_token, transaction is invalid (should never happen)
    console.error('⚠️ Transaction missing snap_token - data corruption');
    return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
      'Transaction data is invalid. Please create a new order.',
      ERROR_CODES.VALIDATION_ERROR,
      'missing_snap_token',
      HTTP_STATUS.BAD_REQUEST
    ));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to regenerate snap token',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/cancel-pending
 * Cancel pending transaction
 */
router.post('/cancel-pending', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { transactionId, reason } = req.body;

    if (!transactionId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Transaction ID is required',
        ERROR_CODES.VALIDATION_ERROR,
        'transactionId',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Get pending transaction
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (transactionError || !transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Pending transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Check if payment method has been selected (prevent cancel before payment method chosen)
    const hasPaymentDetails = transaction.payment_type || 
                               transaction.store || 
                               transaction.va_numbers || 
                               transaction.payment_code || 
                               transaction.qr_code ||
                               (transaction.payment_details && Object.keys(transaction.payment_details).length > 0);
    
    if (!hasPaymentDetails) {
      console.log('⚠️ Cannot cancel transaction - payment method not selected yet:', {
        transaction_id: transaction.id,
        order_id: transaction.midtrans_order_id,
        payment_method: transaction.payment_method
      });
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Tidak dapat membatalkan transaksi sebelum memilih metode pembayaran. Silakan pilih metode pembayaran terlebih dahulu atau tunggu hingga transaksi kadaluarsa.',
        ERROR_CODES.VALIDATION_ERROR,
        'payment_method_not_selected',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    console.log('✅ Payment method selected, proceeding with cancellation:', {
      transaction_id: transaction.id,
      payment_type: transaction.payment_type,
      payment_method: transaction.payment_method,
      has_store: !!transaction.store,
      has_va_numbers: !!transaction.va_numbers,
      has_payment_code: !!transaction.payment_code
    });

    // Cancel transaction in Midtrans first (if order ID exists)
    if (transaction.midtrans_order_id) {
      try {
        const cancelResult = await midtransService.cancelTransaction(transaction.midtrans_order_id);
        if (cancelResult) {
          console.log('✅ Transaction cancelled in Midtrans successfully');
        } else {
          console.log('ℹ️ Transaction not found in Midtrans (may be expired or already cancelled) - continuing with local cancellation');
        }
      } catch (error: any) {
        // Log error but continue with local cancellation
        console.error('⚠️ Error cancelling transaction in Midtrans (continuing with local cancellation):', {
          order_id: transaction.midtrans_order_id,
          error: error.message
        });
      }
    } else {
      console.log('ℹ️ No Midtrans order ID found - skipping Midtrans cancellation (transaction may not have been created in Midtrans)');
    }

    // Update transaction status to cancelled
    console.log('Cancelling transaction:', transaction.id);
    console.log('🔧 Using service role for transaction update');
    
    const { data: transactionUpdateData, error: transactionUpdateError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: 'cancel',
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id)
      .select();

    if (transactionUpdateError) {
      console.error('❌ Error updating transaction:', transactionUpdateError);
      console.error('❌ Error details:', JSON.stringify(transactionUpdateError, null, 2));
      throw transactionUpdateError;
    }
    
    console.log('✅ Transaction updated successfully:', transactionUpdateData);

    // Update subscription status to cancelled
    console.log('Cancelling subscription:', transaction.subscription_id);
    console.log('🔧 Using service role for subscription update');
    
    const { data: subscriptionUpdateData, error: subscriptionUpdateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || 'User cancelled pending transaction',
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.subscription_id)
      .select();

    if (subscriptionUpdateError) {
      console.error('❌ Error updating subscription:', subscriptionUpdateError);
      console.error('❌ Error details:', JSON.stringify(subscriptionUpdateError, null, 2));
      throw subscriptionUpdateError;
    }
    
    console.log('✅ Subscription updated successfully:', subscriptionUpdateData);

    // Update existing payment activity status instead of creating new entry
    console.log('🔧 Using service role for payment activity update');
    
    const { data: activityUpdateData, error: activityUpdateError } = await supabaseAdmin
      .from('payment_activity')
      .update({
        status_to: 'cancelled',
        description: 'Pending transaction cancelled by user',
        payment_method: transaction.payment_method
      })
      .eq('transaction_id', transaction.id)
      .eq('user_id', userId)
      .eq('status_to', 'pending')
      .select();

    if (activityUpdateError) {
      console.error('❌ Error updating payment activity:', activityUpdateError);
      console.error('❌ Error details:', JSON.stringify(activityUpdateError, null, 2));
      // Don't throw error, just log it
    } else {
      console.log('✅ Payment activity updated successfully:', activityUpdateData);
    }

    console.log('Transaction cancelled successfully:', transaction.id);
    return res.json(createSuccessResponse({ 
      transactionId: transaction.id,
      status: 'cancel' 
    }, 'Pending transaction cancelled successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to cancel pending transaction',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/update-payment-method
 * Update payment method for a transaction
 */
router.post('/update-payment-method', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { transactionId, paymentMethod } = req.body;

    if (!transactionId || !paymentMethod) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Transaction ID and payment method are required',
        ERROR_CODES.VALIDATION_ERROR,
        'transactionId, paymentMethod',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Normalize payment method (lowercase, trim)
    const normalizedPaymentMethod = paymentMethod.toLowerCase().trim();
    
    console.log('💳 Updating payment method:', {
      transactionId,
      originalPaymentMethod: paymentMethod,
      normalizedPaymentMethod: normalizedPaymentMethod
    });
    
    // Update transaction payment method
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .update({
        payment_method: normalizedPaymentMethod,
        updated_at: new Date().toISOString()
      })
      .eq('id', transactionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (transactionError || !transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    return res.json(createSuccessResponse({
      transactionId: transaction.id,
      paymentMethod: paymentMethod
    }, 'Payment method updated successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to update payment method',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

export default router;
