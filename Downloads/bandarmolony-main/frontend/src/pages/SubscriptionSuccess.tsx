import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { CheckCircle, ArrowRight, Home } from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

export function SubscriptionSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState<any>(null);

  useEffect(() => {
    loadSubscriptionStatus();
  }, []);

  const loadSubscriptionStatus = async () => {
    try {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Memverifikasi pembayaran...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-600">
              Pembayaran Berhasil!
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Terima kasih! Pembayaran Anda telah berhasil diproses dan subscription Anda telah diaktifkan.
            </p>
            
            {subscriptionData?.subscription && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold">Detail Subscription:</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>Plan:</strong> {subscriptionData.subscription.plan_name}</p>
                  <p><strong>Status:</strong> 
                    <span className="ml-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                      {subscriptionData.subscription.status}
                    </span>
                  </p>
                  {subscriptionData.subscription.end_date && (
                    <p><strong>Berlaku hingga:</strong> {new Date(subscriptionData.subscription.end_date).toLocaleDateString('id-ID')}</p>
                  )}
                </div>
              </div>
            )}

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
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Jika Anda memiliki pertanyaan, silakan hubungi tim support kami.
          </p>
        </div>
      </div>
    </div>
  );
}
