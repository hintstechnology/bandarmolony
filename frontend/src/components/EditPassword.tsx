import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  onSubmit?: (payload: { currentPassword: string; newPassword: string }) => Promise<void> | void;
};

export function EditPassword({ isOpen, onClose, email, onSubmit }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");

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
      // Don't close automatically - let the parent handle success/error
    } catch (error: any) {
      setError(error.message || "Failed to change password");
      console.error('EditPassword: Submit error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-lg mx-auto p-6">
        <DialogHeader className="pb-6">
          <DialogTitle className="text-xl font-semibold">Change Password</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error message */}
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
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
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
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
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
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
              onClick={onClose} 
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
