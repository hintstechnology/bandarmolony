import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { Mail, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface EditPasswordProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

export function EditPassword({ isOpen, onClose, email }: EditPasswordProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendEmail = async () => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      setEmailSent(true);
      setCountdown(60);
      toast.success("Password reset email sent!");
    } catch (error) {
      toast.error("Failed to send email. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    await handleSendEmail();
  };

  const handleSimulateVerification = () => {
    setIsVerified(true);
    toast.success("Email verification completed! You can now set a new password.");
    setTimeout(() => {
      onClose();
      setEmailSent(false);
      setIsVerified(false);
    }, 2000);
  };

  const handleClose = () => {
    setEmailSent(false);
    setIsVerified(false);
    setCountdown(0);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          {!emailSent ? (
            <div className="space-y-4">
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium">Reset Your Password</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    We'll send a password reset link to your email address.
                  </p>
                </div>
              </div>
              
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email Address</label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm">{email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button 
                onClick={handleSendEmail} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Send Reset Link
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {!isVerified ? (
                <>
                  <div className="text-center space-y-3">
                    <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <Mail className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">Check Your Email</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        We've sent a password reset link to <strong>kajianremaja2k17@gmail.com</strong>. 
                        Please check your email and follow the instructions.
                      </p>
                    </div>
                  </div>

                  <Card className="border-dashed">
                    <CardContent className="pt-4">
                      <div className="text-center space-y-3">
                        <p className="text-sm text-muted-foreground">
                          This is a demo. Click below to simulate email verification:
                        </p>
                        <Button 
                          onClick={handleSimulateVerification}
                          variant="outline"
                          className="w-full"
                        >
                          Simulate Email Verification
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Didn't receive the email?
                    </p>
                    <Button 
                      onClick={handleResend}
                      variant="ghost"
                      disabled={countdown > 0}
                      className="w-full"
                    >
                      {countdown > 0 ? `Resend in ${countdown}s` : "Resend Email"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-3">
                  <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Verification Complete!</h3>
                    <p className="text-sm text-muted-foreground">
                      Your email has been verified. Redirecting...
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}