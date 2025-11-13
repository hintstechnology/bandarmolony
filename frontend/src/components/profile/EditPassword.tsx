import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  onSubmit?: (payload: { currentPassword: string; newPassword: string }) => Promise<void> | void;
};

export function EditPassword({ isOpen, onClose, email, onSubmit }: Props) {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");

  // Reset form when modal closes
  const handleClose = () => {
    setCurrentPassword("");
    setNewPassword("");
    setError("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentPassword || !newPassword) {
      setError("Please fill in all fields");
      return;
    }
    
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    
    if (currentPassword === newPassword) {
      setError("New password must be different from current password");
      return;
    }
    
    try {
      setLoading(true);
      setError("");
      
      await onSubmit?.({ currentPassword, newPassword });
      
      // If we reach here, password was changed successfully
      // Parent will show toast and close modal
      // Reset form state
      setCurrentPassword("");
      setNewPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      
    } catch (error: any) {
      console.error('EditPassword: Submit error:', error);
      
      // Handle specific error messages from backend
      let errorMessage = error.message || "Failed to change password";
      
      if (errorMessage.includes('Current password is incorrect')) {
        setError("Current password is incorrect");
      } else if (errorMessage.includes('same password') || errorMessage.includes('different from current')) {
        setError("New password must be different from current password");
      } else if (errorMessage.includes('at least 6 characters')) {
        setError("Password must be at least 6 characters");
      } else if (errorMessage.includes('Session expired')) {
        setError("Session expired. Please sign in again.");
        showToast({
          type: 'error',
          title: 'Session Expired',
          message: 'Please sign in again.',
        });
        // Close modal and let user re-login
        setTimeout(() => handleClose(), 2000);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-lg mx-auto p-6">
        <DialogHeader className="pb-6">
          <DialogTitle className="text-xl font-semibold">Change Password</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error message */}
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-950 border border-red-800 rounded-md">
              {error}
            </div>
          )}

          {/* Email (readonly) */}
          <div className="space-y-3">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={email}
              disabled
              className="bg-muted text-muted-foreground"
            />
          </div>

          {/* Current password */}
          <div className="space-y-3">
            <Label htmlFor="currentPassword" className="text-sm font-medium text-foreground block mb-2">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                placeholder="Masukkan password lama"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setError("");
                }}
                className="pr-10 h-12 px-4 py-3"
                disabled={loading}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                disabled={loading}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* New password */}
          <div className="space-y-3">
            <Label htmlFor="newPassword" className="text-sm font-medium text-foreground block mb-2">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder="Masukkan password baru"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError("");
                }}
                className="pr-10 h-12 px-4 py-3"
                disabled={loading}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
                disabled={loading}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-6 border-t">
            <Button 
              type="button"
              variant="outline" 
              onClick={handleClose} 
              disabled={loading}
              className="px-6 py-2.5 min-w-[80px]"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={loading || !currentPassword || !newPassword}
              className="px-6 py-2.5 min-w-[80px]"
            >
              {loading ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
