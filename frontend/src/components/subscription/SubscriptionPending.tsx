import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Clock, ArrowRight, Home, RefreshCw, CheckCircle } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '../ui/alert';

export function SubscriptionPending() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [urlStatus, setUrlStatus] = useState<string | null>(null);

  useEffect(() => {
    // Parse query parameters from Midtrans callback
    const searchParams = new URLSearchParams(location.search);
    const urlOrderId = searchParams.get('order_id');
    const urlTransactionStatus = searchParams.get('transaction_status');

    if (urlOrderId) {
      setOrderId(urlOrderId);
    }
    if (urlTransactionStatus) {
      setUrlStatus(urlTransactionStatus);
    }

    // Load subscription status and verify payment
    loadSubscriptionStatus(urlOrderId);
  }, [location.search]);

  const loadSubscriptionStatus = async (orderIdFromUrl: string | null) => {
    try {
      setLoading(true);
      const response = await api.getSubscriptionStatus();
      if (response.success) {
        setSubscriptionData(response.data);

        // Check if subscription is already active (payment might have been processed)
        if (response.data?.subscription?.status === 'active') {
          toast.success('Pembayaran berhasil! Subscription Anda telah aktif.');
          return;
        }
      }

      // If order_id is provided in URL, verify payment status
      if (orderIdFromUrl) {
        try {
          const verifyResponse = await api.checkPaymentStatus(orderIdFromUrl);
          if (verifyResponse.success && verifyResponse.data) {
            const backendStatus = verifyResponse.data.currentStatus;
            const midtransStatus = verifyResponse.data.midtransStatus;

            // If payment is already settled, redirect to success
            // Database uses: settlement, capture, pending, cancel
            // Midtrans uses: settlement, capture, pending, cancel, deny, expire, failure
            if (backendStatus === 'settlement' || backendStatus === 'capture' || 
                midtransStatus === 'settlement' || midtransStatus === 'capture') {
              toast.success('Pembayaran berhasil dikonfirmasi!');
              setTimeout(() => {
                navigate('/subscription/success', { replace: true });
              }, 2000);
              return;
            }
          }
        } catch (verifyError) {
          console.error('Failed to verify payment status:', verifyError);
        }
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  const handleGoToSubscription = () => {
    navigate('/subscription');
  };

  const handleRefresh = () => {
    loadSubscriptionStatus(orderId);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-600 mb-4">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-yellow-400">
              Pembayaran Sedang Diproses
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-300">
              Pembayaran Anda sedang diproses. Silakan tunggu konfirmasi dari bank atau penyedia pembayaran.
            </p>

            {/* Show success alert if subscription is already active */}
            {subscriptionData?.subscription?.status === 'active' && (
              <Alert variant="default" className="bg-green-900/30 border-green-600">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-300 text-sm">
                  Pembayaran berhasil! Subscription Anda telah aktif. Redirecting...
                </AlertDescription>
              </Alert>
            )}
            
            {subscriptionData?.subscription && (
              <div className="bg-gray-700 rounded-lg p-4 space-y-2 border border-gray-600">
                <h3 className="font-semibold text-gray-100">Detail Subscription:</h3>
                <div className="text-sm text-gray-300 space-y-1">
                  <p><strong className="text-gray-200">Plan:</strong> <span className="text-gray-100">{subscriptionData.subscription.plan_name}</span></p>
                  <p><strong className="text-gray-200">Status:</strong> 
                    <span className="ml-1 px-2 py-1 bg-yellow-600 text-white rounded-full text-xs">
                      {subscriptionData.subscription.status === 'pending' ? 'Pending' : subscriptionData.subscription.status}
                    </span>
                  </p>
                  <p><strong className="text-gray-200">Jumlah:</strong> <span className="text-gray-100">Rp {subscriptionData.subscription.price?.toLocaleString()}</span></p>
                  {orderId && (
                    <p className="text-xs text-gray-400 mt-2"><strong className="text-gray-300">Order ID:</strong> <span className="text-gray-200">{orderId}</span></p>
                  )}
                  {urlStatus && (
                    <p className="text-xs text-gray-400"><strong className="text-gray-300">Status Midtrans:</strong> <span className="text-gray-200">{urlStatus}</span></p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-4">
              <h3 className="font-semibold text-blue-400 mb-2">Langkah Selanjutnya:</h3>
              <ul className="text-sm text-blue-300 space-y-1 text-left">
                <li>• Selesaikan pembayaran sesuai instruksi</li>
                <li>• Tunggu konfirmasi dari bank (1-2 jam)</li>
                <li>• Subscription akan aktif otomatis</li>
                <li>• Anda akan menerima email konfirmasi</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button 
                onClick={handleGoToDashboard}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
              >
                <Home className="w-4 h-4 mr-2" />
                Ke Dashboard
              </Button>
              <Button 
                onClick={handleGoToSubscription}
                variant="outline"
                className="flex-1 border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Kelola Subscription
              </Button>
            </div>

            <Button 
              onClick={handleRefresh}
              variant="ghost"
              size="sm"
              disabled={loading}
              className="w-full text-gray-300 hover:text-white hover:bg-gray-700"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Memeriksa Status...' : 'Periksa Status Pembayaran'}
            </Button>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-gray-400">
            Jika pembayaran tidak terkonfirmasi dalam 24 jam, silakan hubungi tim support kami.
          </p>
        </div>
      </div>
    </div>
  );
}