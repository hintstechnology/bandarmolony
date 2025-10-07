import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Clock, ArrowRight, Home, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

export function SubscriptionPending() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<any>(null);

  useEffect(() => {
    loadSubscriptionStatus();
  }, []);

  const loadSubscriptionStatus = async () => {
    try {
      setLoading(true);
      const response = await api.getSubscriptionStatus();
      if (response.success) {
        setSubscriptionData(response.data);
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
    loadSubscriptionStatus();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-yellow-600">
              Pembayaran Sedang Diproses
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Pembayaran Anda sedang diproses. Silakan tunggu konfirmasi dari bank atau penyedia pembayaran.
            </p>
            
            {subscriptionData?.subscription && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold">Detail Subscription:</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>Plan:</strong> {subscriptionData.subscription.plan_name}</p>
                  <p><strong>Status:</strong> 
                    <span className="ml-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                      {subscriptionData.subscription.status}
                    </span>
                  </p>
                  <p><strong>Jumlah:</strong> Rp {subscriptionData.subscription.price?.toLocaleString()}</p>
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-2">Langkah Selanjutnya:</h3>
              <ul className="text-sm text-blue-700 space-y-1 text-left">
                <li>• Selesaikan pembayaran sesuai instruksi</li>
                <li>• Tunggu konfirmasi dari bank (1-2 jam)</li>
                <li>• Subscription akan aktif otomatis</li>
                <li>• Anda akan menerima email konfirmasi</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button 
                onClick={handleGoToDashboard}
                className="flex-1"
              >
                <Home className="w-4 h-4 mr-2" />
                Ke Dashboard
              </Button>
              <Button 
                onClick={handleGoToSubscription}
                variant="outline"
                className="flex-1"
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
              className="w-full"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Memeriksa Status...' : 'Periksa Status Pembayaran'}
            </Button>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Jika pembayaran tidak terkonfirmasi dalam 24 jam, silakan hubungi tim support kami.
          </p>
        </div>
      </div>
    </div>
  );
}
