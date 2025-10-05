import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabaseClient';
import { requireSupabaseUser } from '../middleware/requireSupabaseUser';
import { createSuccessResponse, createErrorResponse } from '../utils/responseUtils';
import { HTTP_STATUS, ERROR_CODES } from '../utils/responseUtils';
import { midtransService } from '../services/midtransService';
import config from '../config';

const router = express.Router();

// Subscription plans configuration
const subscriptionPlans = [
  {
    id: 'plus',
    name: 'Plus',
    price: 35000,
    period: '1 bulan',
    duration: 1,
    popular: false
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 89000,
    period: '3 bulan',
    duration: 3,
    popular: true
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 165000,
    period: '6 bulan',
    duration: 6,
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
router.get('/plans', async (req, res) => {
  try {
    res.json(createSuccessResponse(subscriptionPlans, 'Subscription plans retrieved successfully'));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
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
router.get('/payment-methods', async (req, res) => {
  try {
    const { data: paymentMethods, error } = await supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('type', { ascending: true });

    if (error) {
      throw error;
    }

    res.json(createSuccessResponse(paymentMethods, 'Payment methods retrieved successfully'));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve payment methods',
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
    const userName = req.user.user_metadata?.full_name || 'User';

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

    // Check if user already has active subscription
    const { data: existingSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (existingSubscription) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'User already has an active subscription',
        ERROR_CODES.VALIDATION_ERROR,
        'subscription',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Check if user has pending payment
    const { data: pendingTransaction } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (pendingTransaction) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'User has a pending payment. Please wait for it to complete.',
        ERROR_CODES.VALIDATION_ERROR,
        'payment',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Create subscription record
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
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

    // Get Snap redirect URL
    const paymentUrl = await midtransService.createSnapRedirectUrl(midtransTransaction);

    // Create transaction record
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: userId,
        subscription_id: subscription.id,
        midtrans_order_id: midtransOrderId,
        payment_method: paymentMethod,
        amount: plan.price,
        status: 'pending',
        payment_url: paymentUrl
      })
      .select()
      .single();

    if (transactionError) {
      throw transactionError;
    }

    // Get Snap token
    const snapToken = await midtransService.createSnapToken(midtransTransaction);

    // Log payment creation
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
      p_activity_type: 'payment_created',
      p_transaction_id: transaction.id,
      p_subscription_id: subscription.id,
      p_status_to: 'pending',
      p_amount: plan.price,
      p_payment_method: paymentMethod,
      p_description: `Payment created for ${plan.name} plan`,
      p_metadata: {
        plan_id: planId,
        order_id: midtransOrderId,
        snap_token: snapToken
      }
    });

    res.json(createSuccessResponse({
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
        error.errors[0]?.path?.join('.'),
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to create payment order',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/webhook
 * Handle Midtrans webhook notifications
 */
router.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook received:', {
      headers: req.headers,
      body: req.body,
      timestamp: new Date().toISOString()
    });
    
    const webhookData = webhookSchema.parse(req.body);
    
    // Verify webhook signature (optional for development)
    const signature = req.headers['x-midtrans-signature'] as string;
    const payload = JSON.stringify(req.body);
    
    // Skip signature verification in development mode
    if (config.NODE_ENV === 'production' && signature) {
      if (!midtransService.verifyWebhookSignature(payload, signature)) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(createErrorResponse(
          'Invalid webhook signature',
          ERROR_CODES.UNAUTHORIZED,
          undefined,
          HTTP_STATUS.UNAUTHORIZED
        ));
      }
    }

    // Log webhook
    await supabaseAdmin
      .from('payment_logs')
      .insert({
        log_type: 'webhook',
        source: 'midtrans',
        message: 'Webhook received',
        data: webhookData
      });

    // Update transaction status
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: webhookData.transaction_status,
        midtrans_transaction_id: webhookData.transaction_id,
        settlement_time: webhookData.settlement_time ? new Date(webhookData.settlement_time).toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('midtrans_order_id', webhookData.order_id)
      .select()
      .single();

    if (transactionError) {
      throw transactionError;
    }

    if (!transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Handle successful payment
    if (webhookData.transaction_status === 'settlement') {
      // Update subscription status
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + transaction.plan_duration);

      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          start_date: new Date().toISOString(),
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
          subscription_start_date: new Date().toISOString(),
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

      // Log payment activity
      await supabaseAdmin.rpc('log_payment_activity', {
        p_user_id: transaction.user_id,
        p_activity_type: 'payment_success',
        p_transaction_id: transaction.id,
        p_subscription_id: transaction.subscription_id,
        p_status_from: 'pending',
        p_status_to: 'settlement',
        p_amount: transaction.amount,
        p_payment_method: transaction.payment_method,
        p_description: 'Payment completed successfully',
        p_metadata: {
          transaction_status: webhookData.transaction_status,
          settlement_time: webhookData.settlement_time,
          midtrans_transaction_id: webhookData.transaction_id
        }
      });

      // Log subscription activation
      await supabaseAdmin.rpc('log_payment_activity', {
        p_user_id: transaction.user_id,
        p_activity_type: 'subscription_activated',
        p_transaction_id: transaction.id,
        p_subscription_id: transaction.subscription_id,
        p_status_to: 'active',
        p_amount: transaction.amount,
        p_description: `Subscription activated for ${transaction.plan_name}`,
        p_metadata: {
          plan_name: transaction.plan_name,
          end_date: endDate.toISOString()
        }
      });
    }

    // Handle failed payment
    if (['deny', 'cancel', 'expire', 'failure'].includes(webhookData.transaction_status)) {
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
    }

    res.json(createSuccessResponse({}, 'Webhook processed successfully'));

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Invalid webhook data',
        ERROR_CODES.VALIDATION_ERROR,
        error.errors[0]?.path?.join('.'),
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Webhook processing failed',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
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
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subscriptionError && subscriptionError.code !== 'PGRST116') {
      throw subscriptionError;
    }

    // Get user's payment history with subscription details
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
      .order('created_at', { ascending: false })
      .limit(10);

    if (transactionsError) {
      throw transactionsError;
    }

    res.json(createSuccessResponse({
      subscription: subscription || null,
      transactions: transactions || [],
      plans: subscriptionPlans
    }, 'Subscription status retrieved successfully'));

  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve subscription status',
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

    res.json(createSuccessResponse({
      activities: activities || [],
      summary: summary?.[0] || null,
      pagination: {
        limit,
        offset,
        hasMore: activities?.length === limit
      }
    }, 'Payment activity retrieved successfully'));

  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
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
    const midtransStatus = await midtransService.getTransactionStatus(orderId);
    
    // Update transaction status if changed
    if (midtransStatus.transaction_status !== transaction.status) {
      await supabaseAdmin
        .from('transactions')
        .update({
          status: midtransStatus.transaction_status,
          midtrans_transaction_id: midtransStatus.transaction_id,
          settlement_time: midtransStatus.settlement_time ? new Date(midtransStatus.settlement_time).toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      // Log status change
      await supabaseAdmin.rpc('log_payment_activity', {
        p_user_id: userId,
        p_activity_type: 'webhook_received',
        p_transaction_id: transaction.id,
        p_subscription_id: transaction.subscription_id,
        p_status_from: transaction.status,
        p_status_to: midtransStatus.transaction_status,
        p_amount: transaction.amount,
        p_payment_method: transaction.payment_method,
        p_description: 'Status checked manually',
        p_metadata: {
          source: 'manual_check',
          midtrans_response: midtransStatus
        }
      });
    }

    res.json(createSuccessResponse({
      orderId,
      currentStatus: transaction.status,
      midtransStatus: midtransStatus.transaction_status,
      updated: midtransStatus.transaction_status !== transaction.status
    }, 'Status checked successfully'));

  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
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

    // Update subscription status
    await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || 'User requested cancellation',
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id);

    // Update user subscription info
    await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    res.json(createSuccessResponse({}, 'Subscription cancelled successfully'));

  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
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

    // Create new Midtrans transaction with same details
    const midtransTransaction = await midtransService.createSubscriptionTransaction({
      orderId: transaction.midtrans_order_id,
      planId: plan.id,
      planName: plan.name,
      planDuration: plan.duration,
      price: plan.price,
      customer: {
        name: req.user.user_metadata?.full_name || 'User',
        email: req.user.email
      },
      callbacks: {
        finish: config.SUCCESS_URL,
        error: config.ERROR_URL,
        pending: config.PENDING_URL
      }
    });

    // Get new snap token
    const snapToken = await midtransService.createSnapToken(midtransTransaction);

    // Update payment URL
    const paymentUrl = await midtransService.createSnapRedirectUrl(midtransTransaction);
    await supabaseAdmin
      .from('transactions')
      .update({
        payment_url: paymentUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id);

    res.json(createSuccessResponse({
      snapToken,
      orderId: transaction.midtrans_order_id,
      paymentUrl: paymentUrl
    }, 'Snap token regenerated successfully'));

  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
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

    // Update transaction status to cancelled
    console.log('Cancelling transaction:', transaction.id);
    const { error: transactionUpdateError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: 'cancel',
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id);

    if (transactionUpdateError) {
      console.error('Error updating transaction:', transactionUpdateError);
      throw transactionUpdateError;
    }

    // Update subscription status to cancelled
    console.log('Cancelling subscription:', transaction.subscription_id);
    const { error: subscriptionUpdateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || 'User cancelled pending transaction',
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.subscription_id);

    if (subscriptionUpdateError) {
      console.error('Error updating subscription:', subscriptionUpdateError);
      throw subscriptionUpdateError;
    }

    // Log cancellation
    await supabaseAdmin.rpc('log_payment_activity', {
      p_user_id: userId,
      p_activity_type: 'payment_cancelled',
      p_transaction_id: transaction.id,
      p_subscription_id: transaction.subscription_id,
      p_status_from: 'pending',
      p_status_to: 'cancel',
      p_amount: transaction.amount,
      p_payment_method: transaction.payment_method,
      p_description: 'Pending transaction cancelled by user',
      p_metadata: {
        reason: reason || 'User cancelled pending transaction'
      }
    });

    console.log('Transaction cancelled successfully:', transaction.id);
    res.json(createSuccessResponse({ 
      transactionId: transaction.id,
      status: 'cancel' 
    }, 'Pending transaction cancelled successfully'));

  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to cancel pending transaction',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

export default router;
