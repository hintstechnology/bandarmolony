import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { User, Upload, X, Loader2 } from "lucide-react";
import { ProfileData, api } from "../services/api";
import { useProfile } from "../contexts/ProfileContext";
import { toast } from "sonner";
import { getAvatarUrl, isValidAvatarFile, isValidAvatarSize } from "../utils/avatar";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: ProfileData;
  onSave: (data: Partial<ProfileData>) => Promise<void> | void;
};

export function EditProfile({ isOpen, onClose, profile, onSave }: Props) {
  const { updateProfile } = useProfile();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [localName, setLocalName] = useState(profile.full_name || profile.name);
  const [localAvatar, setLocalAvatar] = useState(profile.avatar_url || profile.avatarUrl || profile.avatar);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!isValidAvatarFile(file)) {
      toast.error('Invalid file type. Please select a JPEG, PNG, GIF, or WebP image.');
      return;
    }

    // Validate file size (1MB - matches backend limit)
    if (!isValidAvatarSize(file, 1)) {
      toast.error('File size too large. Please select an image smaller than 1MB.');
      return;
    }

    setIsUploading(true);
        try {
          const result = await api.uploadAvatar(file);
          setLocalAvatar(result.filePath);
          // Update profile context immediately for real-time UI update
          updateProfile({ avatar_url: result.filePath });
          toast.success('Avatar uploaded successfully!');
        } catch (error: any) {
          console.error('Upload error:', error);
          toast.error(error.message || 'Failed to upload avatar');
        } finally {
          setIsUploading(false);
        }
  };

  const handleRemoveAvatar = async () => {
    try {
      await api.deleteAvatar();
      setLocalAvatar('');
      // Update profile context immediately for real-time UI update
      updateProfile({ avatar_url: undefined });
      toast.success('Avatar removed successfully!');
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(error.message || 'Failed to remove avatar');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const dataToSave = { 
        full_name: localName,
        avatar_url: localAvatar || undefined
      };
      
      console.log('EditProfile: Saving data:', dataToSave);
      console.log('EditProfile: localName type:', typeof localName, 'value:', localName);
      console.log('EditProfile: localAvatar type:', typeof localAvatar, 'value:', localAvatar);
      
      await onSave(dataToSave);
      toast.success('Profile updated successfully!');
      onClose();
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="w-[95vw] max-w-lg mx-auto p-6">
            <DialogHeader className="pb-6">
              <DialogTitle className="text-xl font-semibold">Edit Profile</DialogTitle>
              <DialogDescription>
                Update your profile information and avatar.
              </DialogDescription>
            </DialogHeader>

        <div className="space-y-6">
          {/* Profile Picture Section */}
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-full overflow-hidden bg-muted flex-shrink-0">
              <Avatar className="w-full h-full">
                {localAvatar ? (
                  <AvatarImage
                    src={getAvatarUrl(localAvatar) || undefined}
                    alt={localName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <AvatarFallback className="w-full h-full">
                    <User className="w-8 h-8" />
                  </AvatarFallback>
                )}
              </Avatar>
              {isUploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={handlePick} 
                  disabled={isUploading}
                  className="w-fit"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? 'Uploading...' : 'Upload Photo'}
                </Button>
                {localAvatar && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                    className="w-fit"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, GIF, WebP up to 1MB
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          </div>

          {/* Full Name Field */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Full Name</label>
            <input
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              placeholder="Enter your full name"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4 pt-6 border-t">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="px-6 py-2.5 min-w-[80px]"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={isSaving || isUploading}
              className="px-6 py-2.5 min-w-[80px]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
