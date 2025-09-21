import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, CheckCircle, XCircle, Clock, RefreshCw, AlertCircle, CreditCard } from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

// Subscription plans - all have same features, different durations
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

const currentSubscription = {
  plan: 'pro',
  status: 'active',
  nextBilling: '2024-02-15',
  autoRenew: true
};

export function SubscriptionPage() {
  const [selectedPlan, setSelectedPlan] = useState('premium');
  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [paymentActivities, setPaymentActivities] = useState<any[]>([]);
  const [hasActivePayment, setHasActivePayment] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);

  useEffect(() => {
    loadSubscriptionStatus();
    loadPaymentMethods();
    loadPaymentActivity();
  }, []);

  const loadSubscriptionStatus = async () => {
    try {
      const response = await api.getSubscriptionStatus();
      if (response.success) {
        setSubscriptionStatus(response.data);
        setTransactions(response.data.transactions || []);
        
        // Check if there's an active payment
        const hasPendingPayment = response.data.transactions?.some(
          (tx: any) => tx.status === 'pending' || tx.status === 'settlement'
        );
        setHasActivePayment(hasPendingPayment || false);
        
        // Load pending transactions
        const pendingTxs = response.data.transactions?.filter(
          (tx: any) => tx.status === 'pending'
        ) || [];
        setPendingTransactions(pendingTxs);
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      const response = await api.getPaymentMethods();
      if (response.success) {
        setPaymentMethods(response.data);
      }
    } catch (error) {
      console.error('Failed to load payment methods:', error);
    }
  };

  const loadPaymentActivity = async () => {
    try {
      const response = await api.getPaymentActivity({ limit: 20 });
      if (response.success) {
        setPaymentActivities(response.data.activities || []);
      }
    } catch (error) {
      console.error('Failed to load payment activity:', error);
    }
  };

  const getSubscriptionStatus = () => {
    if (!subscriptionStatus?.subscription) {
      return { status: 'inactive', daysLeft: 0, isActive: false, planName: 'Free Plan' };
    }

    const subscription = subscriptionStatus.subscription;
    
    // If subscription is cancelled, failed, or expired, treat as inactive
    if (['cancelled', 'failed', 'expired'].includes(subscription.status)) {
      return { status: 'inactive', daysLeft: 0, isActive: false, planName: 'Free Plan' };
    }
    
    const now = new Date();
    const endDate = new Date(subscription.end_date);
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    const isActive = subscription.status === 'active' && daysLeft > 0;
    
    return {
      status: subscription.status,
      daysLeft: Math.max(0, daysLeft),
      isActive,
      endDate: subscription.end_date,
      planName: subscription.plan_name
    };
  };

  const handleSubscribe = async (planId: string) => {
    // Check if there are pending transactions
    if (hasActivePayment) {
      toast.error('Anda memiliki pembayaran yang sedang berlangsung. Silakan tunggu hingga selesai.');
      return;
    }

    try {
      setLoading(true);
      setLoadingPlan(planId);
      
      const response = await api.createSubscriptionOrder({
        planId,
        paymentMethod: 'snap'
      });

      if (response.success) {
        // Initialize Midtrans Snap
        if ((window as any).snap) {
          (window as any).snap.pay(response.data.snapToken, {
            onSuccess: (result: any) => {
              console.log('Payment success:', result);
              toast.success('Payment berhasil! Subscription Anda telah diaktifkan.');
              setHasActivePayment(false);
              // Refresh data after successful payment
              setTimeout(() => {
                loadSubscriptionStatus();
                loadPaymentActivity();
              }, 2000);
            },
            onPending: (result: any) => {
              console.log('Payment pending:', result);
              toast.info('Payment sedang diproses. Silakan tunggu konfirmasi.');
              setHasActivePayment(true);
              // Refresh data after pending payment
              setTimeout(() => {
                loadSubscriptionStatus();
                loadPaymentActivity();
              }, 2000);
            },
            onError: (result: any) => {
              console.log('Payment error:', result);
              toast.error('Payment gagal. Silakan coba lagi.');
            },
            onClose: () => {
              console.log('Payment popup closed');
              toast.info('Payment dibatalkan.');
              setHasActivePayment(false);
            }
          });
        } else {
          toast.error('Payment gateway tidak tersedia. Silakan refresh halaman.');
        }
      } else {
        toast.error(response.error || 'Gagal membuat order pembayaran');
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      toast.error(error.message || 'Terjadi kesalahan saat memproses subscription');
    } finally {
      setLoading(false);
      setLoadingPlan(null);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setLoading(true);
      const response = await api.cancelSubscription({
        reason: 'User requested cancellation'
      });

      if (response.success) {
        toast.success('Subscription berhasil dibatalkan');
        loadSubscriptionStatus();
      } else {
        toast.error(response.error || 'Gagal membatalkan subscription');
      }
    } catch (error: any) {
      console.error('Cancel subscription error:', error);
      toast.error(error.message || 'Terjadi kesalahan saat membatalkan subscription');
    } finally {
      setLoading(false);
    }
  };

  const handleContinuePayment = async (transaction: any) => {
    try {
      setLoading(true);
      
      // Get the transaction details and create new payment
      const response = await api.createSubscriptionOrder({
        planId: transaction.subscriptions?.plan_id || 'premium',
        paymentMethod: 'snap'
      });

      if (response.success) {
        // Initialize Midtrans Snap
        if ((window as any).snap) {
          (window as any).snap.pay(response.data.snapToken, {
            onSuccess: (result: any) => {
              console.log('Payment success:', result);
              toast.success('Payment berhasil! Subscription Anda telah diaktifkan.');
              setTimeout(() => {
                loadSubscriptionStatus();
                loadPaymentActivity();
              }, 2000);
            },
            onPending: (result: any) => {
              console.log('Payment pending:', result);
              toast.info('Payment sedang diproses. Silakan tunggu konfirmasi.');
              setTimeout(() => {
                loadSubscriptionStatus();
                loadPaymentActivity();
              }, 2000);
            },
            onError: (result: any) => {
              console.log('Payment error:', result);
              toast.error('Payment gagal. Silakan coba lagi.');
            },
            onClose: () => {
              console.log('Payment popup closed');
              toast.info('Payment dibatalkan.');
            }
          });
        } else {
          toast.error('Payment gateway tidak tersedia. Silakan refresh halaman.');
        }
      } else {
        toast.error(response.error || 'Gagal membuat order pembayaran');
      }
    } catch (error: any) {
      console.error('Continue payment error:', error);
      toast.error(error.message || 'Terjadi kesalahan saat memproses payment');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTransaction = async (transaction: any) => {
    try {
      setLoading(true);
      
      // Cancel the pending transaction
      const response = await api.cancelPendingTransaction({
        transactionId: transaction.id,
        reason: 'User cancelled pending transaction'
      });

      if (response.success) {
        toast.success('Transaksi berhasil dibatalkan');
        loadSubscriptionStatus();
        loadPaymentActivity();
      } else {
        toast.error(response.error || 'Gagal membatalkan transaksi');
      }
    } catch (error: any) {
      console.error('Cancel transaction error:', error);
      toast.error(error.message || 'Terjadi kesalahan saat membatalkan transaksi');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Pending Transaction Section */}
      {pendingTransactions.length > 0 && (
        <Card className="border-orange-500 bg-orange-500/10">
          <CardHeader>
            <CardTitle className="text-orange-100 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Transaksi Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Alert className="bg-blue-500/10 border-blue-500/20 text-blue-100">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Anda tidak dapat membuka transaksi baru karena ada transaksi yang belum dibayar.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h4 className="font-medium text-orange-100">Berikut transaksi yang sedang pending:</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-orange-500/20">
                        <th className="text-left py-2 px-3 text-orange-200 text-sm">Date</th>
                        <th className="text-left py-2 px-3 text-orange-200 text-sm">Status</th>
                        <th className="text-left py-2 px-3 text-orange-200 text-sm">Amount</th>
                        <th className="text-left py-2 px-3 text-orange-200 text-sm">Product</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingTransactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-orange-500/10">
                          <td className="py-2 px-3 text-orange-100 text-sm">
                            {formatDate(transaction.created_at)}
                          </td>
                          <td className="py-2 px-3">
                            <Badge className="bg-blue-500 text-white text-xs">
                              UNPAID
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-orange-100 text-sm font-medium">
                            IDR {transaction.amount?.toLocaleString() || '0'}
                          </td>
                          <td className="py-2 px-3 text-orange-100 text-sm">
                            {transaction.subscriptions?.plan_name || 'Unknown Plan'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-4 border-t border-orange-500/20">
                <div className="text-center">
                  <p className="text-orange-100 mb-4">
                    Mau lanjut bayar, atau di cancel saja?
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white px-6"
                      onClick={() => handleContinuePayment(pendingTransactions[0])}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Bayar
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="px-6"
                      onClick={() => handleCancelTransaction(pendingTransactions[0])}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 mr-2" />
                          Cancel
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <Alert className="bg-orange-500/10 border-orange-500/20 text-orange-100">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1 text-sm">
                    <p>Transaksi hanya bisa di-cancel kalau sudah pilih metode pembayaran.</p>
                    <p>Klik bayar untuk memilih metode pembayaran.</p>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const subStatus = getSubscriptionStatus();
            
                   if (!subscriptionStatus?.subscription || !subStatus.isActive) {
                     return (
                       <div className="text-center py-8">
                         <div className="text-muted-foreground mb-4">
                           <p className="text-lg font-medium">Free Plan</p>
                           <p className="text-sm">Choose a plan below to get started</p>
                         </div>
                       </div>
                     );
                   }

            return (
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{subStatus.planName}</h3>
                    <Badge className={
                      subStatus.isActive 
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : subStatus.status === 'expired'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                    }>
                      {subStatus.isActive ? 'Active' : subStatus.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {subStatus.isActive 
                      ? `Expires in ${subStatus.daysLeft} days`
                      : subStatus.status === 'expired'
                      ? 'Subscription expired'
                      : 'Subscription inactive'
                    }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {subStatus.endDate && `End date: ${new Date(subStatus.endDate).toLocaleDateString('id-ID')}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {subStatus.isActive && (
                    <>
                      <Button variant="outline" size="sm">
                        Manage Billing
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={handleCancelSubscription}
                        disabled={loading}
                      >
                        {loading ? 'Cancelling...' : 'Cancel Subscription'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Subscription Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Choose Your Plan</CardTitle>
          <p className="text-muted-foreground text-center">
            Semua paket memberikan akses penuh ke semua fitur. Pilih durasi yang sesuai dengan kebutuhan Anda.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {subscriptionPlans.map((plan) => (
              <Card 
                key={plan.id} 
                className={`relative ${plan.popular ? 'ring-2 ring-primary' : ''} ${
                  selectedPlan === plan.id ? 'border-primary' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader>
                  <CardTitle className="text-center">{plan.name}</CardTitle>
                  <div className="text-center">
                    <span className="text-3xl font-bold">
                      Rp {plan.price.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">
                      /{plan.period}
                    </span>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Features:</h4>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                      </ul>
                    </div>
                    
                    <Button 
                      className="w-full" 
                      variant={selectedPlan === plan.id ? 'default' : 'outline'}
                      onClick={() => setSelectedPlan(plan.id)}
                             disabled={hasActivePayment}
                    >
                      {selectedPlan === plan.id ? 'Selected' : 'Select Plan'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subscribe Button */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <Button 
              size="lg" 
              className="px-8"
              onClick={() => handleSubscribe(selectedPlan)}
              disabled={hasActivePayment || loading}
            >
              {loadingPlan === selectedPlan ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing Payment...
                </>
              ) : hasActivePayment ? (
                'Payment in Progress...'
              ) : (
                `Subscribe to ${subscriptionPlans.find(p => p.id === selectedPlan)?.name}`
              )}
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              You can cancel or change your plan at any time
            </p>
            
            {/* Manual Refresh Button */}
            <div className="mt-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  loadSubscriptionStatus();
                  loadPaymentActivity();
                  toast.info('Status refreshed');
                }}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh Status
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center justify-center p-4 border border-border rounded-lg">
              <span className="text-sm font-medium">Credit Card</span>
            </div>
            <div className="flex items-center justify-center p-4 border border-border rounded-lg">
              <span className="text-sm font-medium">Bank Transfer</span>
            </div>
            <div className="flex items-center justify-center p-4 border border-border rounded-lg">
              <span className="text-sm font-medium">E-Wallet</span>
            </div>
            <div className="flex items-center justify-center p-4 border border-border rounded-lg">
              <span className="text-sm font-medium">Crypto</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {paymentActivities.length > 0 ? paymentActivities.map((activity) => {
              const getStatusColor = (activityType: string) => {
                switch (activityType) {
                  case 'payment_success':
                  case 'subscription_activated':
                    return 'bg-green-100 text-green-800';
                  case 'payment_pending':
                    return 'bg-yellow-100 text-yellow-800';
                  case 'payment_failed':
                  case 'payment_cancelled':
                  case 'payment_expired':
                    return 'bg-red-100 text-red-800';
                  default:
                    return 'bg-gray-100 text-gray-800';
                }
              };

              const getStatusText = (activityType: string) => {
                switch (activityType) {
                  case 'payment_created':
                    return 'Payment Created';
                  case 'payment_pending':
                    return 'Payment Pending';
                  case 'payment_success':
                    return 'Payment Success';
                  case 'payment_failed':
                    return 'Payment Failed';
                  case 'payment_cancelled':
                    return 'Payment Cancelled';
                  case 'payment_expired':
                    return 'Payment Expired';
                  case 'subscription_activated':
                    return 'Subscription Activated';
                  case 'subscription_cancelled':
                    return 'Subscription Cancelled';
                  case 'subscription_expired':
                    return 'Subscription Expired';
                  default:
                    return activityType;
                }
              };

              return (
                <div key={activity.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <div className="font-medium">{activity.description || 'Payment Activity'}</div>
                    <div className="text-sm text-muted-foreground">
                      {activity.payment_method ? `${activity.payment_method}` : 'Payment Activity'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(activity.created_at).toLocaleDateString('id-ID', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <div className="text-right">
                    {activity.amount && (
                      <div className="font-medium">Rp {activity.amount.toLocaleString()}</div>
                    )}
                    <Badge
                      variant="secondary"
                      className={getStatusColor(activity.activity_type)}
                    >
                      {getStatusText(activity.activity_type)}
                    </Badge>
                  </div>
                </div>
              );
            }) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No payment activity yet</p>
                <p className="text-sm">Your payment history will appear here</p>
              </div>
            )}
            
            <div className="pt-4 border-t border-border">
              <Button variant="outline" className="w-full hover:bg-primary/10 hover:text-primary transition-colors">
                View All Payment History
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium">Can I change my plan anytime?</h4>
              <p className="text-sm text-muted-foreground">
                Yes, you can upgrade or downgrade your plan at any time. Changes will be prorated.
              </p>
            </div>
            <div>
              <h4 className="font-medium">Is there a free trial?</h4>
              <p className="text-sm text-muted-foreground">
                Yes, we offer a 7-day free trial for all new users. No credit card required.
              </p>
            </div>
            <div>
              <h4 className="font-medium">What happens if I cancel?</h4>
              <p className="text-sm text-muted-foreground">
                You'll continue to have access until the end of your current billing period.
              </p>
            </div>
            <div>
              <h4 className="font-medium">Do you offer refunds?</h4>
              <p className="text-sm text-muted-foreground">
                We offer a 30-day money-back guarantee for all paid plans.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}