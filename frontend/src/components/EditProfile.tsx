import React, { useRef, useState, useEffect } from "react";
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isRemoving, setIsRemoving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Cleanup preview URL and pending file on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      // Clear pending file
      (window as any).pendingAvatarFile = null;
    };
  }, [previewUrl]);

  const handlePick = () => {
    if (fileRef.current) {
      // Reset the input to ensure change event fires
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show file info
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`📁 Selected file: ${file.name} (${fileSizeMB}MB)`);

    // Validate file type
    if (!isValidAvatarFile(file)) {
      toast.error('Invalid file type. Please select a JPEG, PNG, GIF, or WebP image.');
      // Clear the input
      if (fileRef.current) {
        fileRef.current.value = '';
      }
      return;
    }

    // Validate file size (1MB - matches backend limit)
    console.log(`🔍 File size validation: ${file.size} bytes (${fileSizeMB}MB), limit: 1MB`);
    console.log(`🔍 isValidAvatarSize result:`, isValidAvatarSize(file, 1));
    console.log(`🔍 File size comparison: ${file.size} <= ${1 * 1024 * 1024} = ${file.size <= 1 * 1024 * 1024}`);
    
    // Double check with direct comparison
    const maxSizeBytes = 1 * 1024 * 1024; // 1MB
    if (file.size > maxSizeBytes || !isValidAvatarSize(file, 1)) {
      console.log(`❌ File size validation failed: ${fileSizeMB}MB > 1MB`);
      
      // Show both toast and alert for maximum visibility
      toast.error(`File size too large (${fileSizeMB}MB). Please select an image smaller than 1MB.`);
      alert(`File size too large (${fileSizeMB}MB). Please select an image smaller than 1MB.`);
      
      // Clear the input
      if (fileRef.current) {
        fileRef.current.value = '';
      }
      return;
    }
    console.log(`✅ File size validation passed: ${fileSizeMB}MB <= 1MB`);

    // Show file size info for valid files
    if (file.size > 500 * 1024) { // > 500KB
      toast.info(`Uploading ${fileSizeMB}MB file...`);
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    // Simulate progress for better UX
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 20;
      });
    }, 200);
    
    try {
      // Create a preview URL for the file (local only, not uploaded to server)
      const newPreviewUrl = URL.createObjectURL(file);
      
      // Clean up previous preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      
      setPreviewUrl(newPreviewUrl);
      setLocalAvatar(newPreviewUrl);
      
      // Store the file for later upload
      (window as any).pendingAvatarFile = file;
      
      setUploadProgress(100);
      toast.success('Avatar selected! Click Save to upload.');
    } catch (error: any) {
      console.error('File processing error:', error);
      toast.error('Failed to process file. Please try again.');
    } finally {
      clearInterval(progressInterval);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemoveAvatar = () => {
    setIsRemoving(true);
    
    // Simulate loading for better UX
    setTimeout(() => {
      // Clean up preview URL if exists
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      
      // Clear pending file
      (window as any).pendingAvatarFile = null;
      
      // Only update local state, don't delete from server yet
      setLocalAvatar('');
      setIsRemoving(false);
      console.log('🗑️ Avatar marked for removal (local state only)');
    }, 500);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let finalAvatarUrl = localAvatar;
      
      // Check if there's a pending file to upload
      const pendingFile = (window as any).pendingAvatarFile;
      if (pendingFile) {
        console.log('📤 Uploading pending avatar file...');
        try {
          const result = await api.uploadAvatar(pendingFile);
          finalAvatarUrl = result.filePath;
          console.log('✅ Avatar uploaded to server:', finalAvatarUrl);
          
          // Clear the pending file and preview URL
          (window as any).pendingAvatarFile = null;
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }
        } catch (uploadError: any) {
          console.error('❌ Failed to upload avatar:', uploadError);
          toast.error('Failed to upload avatar. Please try again.');
          return;
        }
      }
      
      // Check if avatar was marked for removal
      const shouldDeleteAvatar = localAvatar === '' && (profile.avatar_url || profile.avatarUrl || profile.avatar);
      
      if (shouldDeleteAvatar) {
        console.log('🗑️ Avatar marked for deletion, calling delete API...');
        try {
          await api.deleteAvatar();
          console.log('✅ Avatar deleted from server');
          finalAvatarUrl = undefined;
        } catch (deleteError: any) {
          console.error('❌ Failed to delete avatar:', deleteError);
          toast.error('Failed to remove avatar. Please try again.');
          return;
        }
      }
      
      const dataToSave = { 
        full_name: localName,
        avatar_url: finalAvatarUrl || undefined
      };
      
      console.log('EditProfile: Saving data:', dataToSave);
      console.log('EditProfile: localName type:', typeof localName, 'value:', localName);
      console.log('EditProfile: finalAvatarUrl type:', typeof finalAvatarUrl, 'value:', finalAvatarUrl);
      
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
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin mb-2" />
                  <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-white mt-1">{Math.round(uploadProgress)}%</p>
                </div>
              )}
              {isRemoving && (
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
                {(profile.avatar_url || profile.avatarUrl || profile.avatar) && localAvatar && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleRemoveAvatar}
                    disabled={isUploading || isRemoving}
                    className="w-fit"
                  >
                    {isRemoving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <X className="w-4 h-4 mr-2" />
                    )}
                    {isRemoving ? 'Removing...' : 'Remove'}
                  </Button>
                )}
                {!localAvatar && (profile.avatar_url || profile.avatarUrl || profile.avatar) && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      // Clean up any existing preview URL
                      if (previewUrl) {
                        URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                      }
                      
                      // Clear pending file
                      (window as any).pendingAvatarFile = null;
                      
                      setLocalAvatar(profile.avatar_url || profile.avatarUrl || profile.avatar || '');
                      console.log('🔄 Avatar restored');
                    }}
                    disabled={isUploading || isRemoving}
                    className="w-fit"
                  >
                    <User className="w-4 h-4 mr-2" />
                    Restore
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
                // HTML5 validation attributes
                data-max-size="1048576" // 1MB in bytes
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
