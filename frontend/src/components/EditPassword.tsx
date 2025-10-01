import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

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

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword) return;
    try {
      setLoading(true);
      await onSubmit?.({ currentPassword, newPassword });
      onClose();
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

        <div className="space-y-6">
          {/* Email (readonly) */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              className="w-full rounded-lg border border-input bg-muted px-4 py-3 text-sm text-muted-foreground"
              value={email}
              disabled
            />
          </div>

          {/* Current password */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Current Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          {/* New password */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">New Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-6 border-t">
            <Button 
              variant="outline" 
              onClick={onClose} 
              disabled={loading}
              className="px-6 py-2.5 min-w-[80px]"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={loading || !currentPassword || !newPassword}
              className="px-6 py-2.5 min-w-[80px]"
            >
              {loading ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
