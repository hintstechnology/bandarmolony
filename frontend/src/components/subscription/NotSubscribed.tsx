import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { CreditCard, Sparkles, Lock, ArrowRight } from "lucide-react";
import { api } from "../../services/api";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { Loader2 } from "lucide-react";

interface NotSubscribedProps {
  featureName?: string;
}

export function NotSubscribed({ featureName = "this feature" }: NotSubscribedProps) {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useProfile();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null);
  const [checkingTrial, setCheckingTrial] = useState(true);

  useEffect(() => {
    const checkTrialEligibility = async () => {
      try {
        setCheckingTrial(true);
        const status = await api.getTrialStatus();
        setTrialEligible(status.eligible);
      } catch (error) {
        console.error("Failed to check trial eligibility:", error);
        setTrialEligible(false);
      } finally {
        setCheckingTrial(false);
      }
    };

    // Only check if user is Free plan and not admin/developer
    if (profile?.subscriptionPlan === "Free" && profile?.role === "user") {
      checkTrialEligibility();
    } else {
      setTrialEligible(false);
      setCheckingTrial(false);
    }
  }, [profile]);

  const handleStartTrial = async () => {
    try {
      setIsLoading(true);
      await api.startTrial();
      
      // Show toast first
      showToast({
        type: "success",
        title: "Free Trial Started! 🎉",
        message: "You now have 7 days of Pro features. Enjoy!",
      });

      // Wait a bit for toast to show, then refresh profile
      setTimeout(async () => {
        try {
          console.log('Refreshing profile after trial start...');
          await refreshProfile(true); // Force refresh profile
          
          // Wait a bit longer to ensure profile state is updated
          setTimeout(() => {
            console.log('Profile refreshed, navigating to dashboard...');
            // Navigate to dashboard to see unlocked features
            navigate('/dashboard');
            // Force a page refresh after navigation to ensure state is synced
            setTimeout(() => {
              window.location.reload();
            }, 100);
          }, 500);
        } catch (refreshError) {
          console.error('Error refreshing profile:', refreshError);
          // Still navigate even if refresh fails, but reload to sync state
          navigate('/dashboard');
          setTimeout(() => {
            window.location.reload();
          }, 100);
        }
      }, 1000); // Increased delay to let toast show longer
    } catch (error: any) {
      console.error("Failed to start trial:", error);
      showToast({
        type: "error",
        title: "Failed to Start Trial",
        message: error.message || "Something went wrong. Please try again.",
      });
      setIsLoading(false);
    }
  };

  const handleSubscribe = () => {
    navigate("/subscription");
  };

  // Don't show for admin/developer
  if (profile?.role === "admin" || profile?.role === "developer") {
    return null;
  }

  if (checkingTrial) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-4 pb-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-10 h-10 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl mb-2">You are not Subscribed</CardTitle>
            <CardDescription className="text-base">
              You need an active subscription to access {featureName}.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Buttons and trial info - moved above table */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Start Free Trial Button - Only show if eligible */}
            {trialEligible === true && (
              <Button
                onClick={handleStartTrial}
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Start Free Trial (7 Days)
                  </>
                )}
              </Button>
            )}

            {/* Subscribe Button */}
            <Button
              onClick={handleSubscribe}
              variant={trialEligible === true ? "outline" : "default"}
              className={`flex-1 ${trialEligible !== true ? "bg-primary" : ""}`}
              size="lg"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              {trialEligible === true ? "Or Subscribe Now" : "Subscribe Now"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>

          {trialEligible === true && (
            <p className="text-xs text-center text-muted-foreground">
              Free trial includes full Pro access for 7 days. No credit card required.
            </p>
          )}

          {/* Premium Features Table */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Premium Features Available:
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold">Feature</th>
                    <th className="text-left py-3 px-4 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Market Rotation</td>
                    <td className="py-3 px-4">Relative Rotation Graph (RRG), Relative Rotation Curve (RRC), Seasonality, and Trend Filter analysis</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Broker Activity</td>
                    <td className="py-3 px-4">Broker transaction details, summary statistics, and inventory tracking</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Stock Transaction</td>
                    <td className="py-3 px-4">Done summary and detailed transaction analysis for stock trading</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Story</td>
                    <td className="py-3 px-4">Accumulation Distribution, Market Participant analysis, Ownership, and Foreign Flow insights</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">Astrology</td>
                    <td className="py-3 px-4">Ba Zi & Shio lunar calendar and Ba Zi Cycle Analysis for market timing</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium">Technical Analysis</td>
                    <td className="py-3 px-4">Advanced TradingView charts and technical indicators</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

