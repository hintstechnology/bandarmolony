import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Calendar, Shield, CreditCard, Edit, Lock, Loader2, User, Crown, Clock } from "lucide-react";
import { EditProfile } from "./EditProfile";
import { EditPassword } from "./EditPassword";
import { useProfile } from "../../contexts/ProfileContext";
import { api } from "../../services/api";
import { useToast } from "../../contexts/ToastContext";
import { getAvatarUrl } from "../../utils/avatar";

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile, isLoading, updateProfile } = useProfile();
  const { showToast } = useToast();
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isEditPasswordOpen, setIsEditPasswordOpen] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);

  useEffect(() => {
    loadSubscriptionStatus();
  }, []);

  const loadSubscriptionStatus = async () => {
    try {
      const response = await api.getSubscriptionStatus();
      if (response.success) {
        setSubscriptionStatus(response.data);
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    }
  };

  const getSubscriptionInfo = () => {
    // Admin and Developer have Pro plan forever (no end date)
    if (profile?.role === 'admin' || profile?.role === 'developer') {
      return {
        status: 'active',
        daysLeft: 0,
        isActive: true,
        planName: 'Pro Plan',
        endDate: undefined,
        isLifetime: true // Flag to indicate lifetime subscription
      };
    }

    if (!subscriptionStatus?.subscription) {
      return { status: 'inactive', daysLeft: 0, isActive: false, planName: 'Free Plan', endDate: undefined, isLifetime: false };
    }

    const subscription = subscriptionStatus.subscription;
    
    // If subscription is cancelled, failed, or expired, treat as inactive
    if (['cancelled', 'failed', 'expired'].includes(subscription.status)) {
      return { status: 'inactive', daysLeft: 0, isActive: false, planName: 'Free Plan', endDate: undefined, isLifetime: false };
    }
    
    // Handle trial status
    if (subscription.status === 'trial') {
      const now = new Date();
      const endDate = new Date(subscription.free_trial_end_date || subscription.end_date);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysLeft <= 0) {
        return {
          status: 'expired',
          daysLeft: 0,
          isActive: false,
          planName: 'Free Plan',
          endDate: subscription.free_trial_end_date || subscription.end_date,
          isLifetime: false
        };
      }

      return {
        status: 'trial',
        daysLeft: Math.max(0, daysLeft),
        isActive: daysLeft > 0,
        planName: `${subscription.plan_name} (Trial)`,
        endDate: subscription.free_trial_end_date || subscription.end_date,
        isLifetime: false
      };
    }
    
    // Handle active paid subscription
    const now = new Date();
    const endDate = new Date(subscription.end_date);
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    const isActive = subscription.status === 'active' && daysLeft > 0;
    
    return {
      status: subscription.status,
      daysLeft: Math.max(0, daysLeft),
      isActive,
      planName: subscription.plan_name,
      endDate: subscription.end_date,
      isLifetime: false
    };
  };

  const handleUpdateProfile = async (data: any) => {
    try {
      console.log('ProfilePage: Updating profile with data:', data);
      console.log('ProfilePage: Data types:', {
        full_name: typeof data.full_name,
        avatar_url: typeof data.avatar_url,
        name: typeof data.name,
        avatarUrl: typeof data.avatarUrl
      });
      
      // Update profile via API
      const updatedProfile = await api.updateProfile(data);
      
      // Update profile in context for real-time UI update
      updateProfile(updatedProfile);
      
      showToast({
        type: 'success',
        title: 'Profile Berhasil Diupdate!',
        message: 'Perubahan telah disimpan.',
      });
      
      console.log('✅ ProfilePage: Profile updated successfully');
    } catch (error) {
      console.error('ProfilePage: Failed to update profile:', error);
      throw error;
    }
  };

  const handleChangePassword = async (data: { currentPassword: string; newPassword: string }) => {
    try {
      console.log('ProfilePage: Starting password change...');
      
      if (!profile?.email) {
        throw new Error('Profile email not found');
      }

      // Use proper API endpoint with current password verification
      const result = await api.changePassword(data.currentPassword, data.newPassword);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to change password');
      }

      console.log('✅ ProfilePage: Password changed successfully');
      
      // Show success toast
      showToast({
        type: 'success',
        title: 'Password Berhasil Diubah!',
        message: 'Silahkan login kembali dengan password baru.',
      });
      
      // Close modal ONLY on success
      setIsEditPasswordOpen(false);
      
      // No need to refresh profile - session already refreshed in API call
    } catch (error: any) {
      console.error('❌ ProfilePage: Failed to change password:', error);
      
      // Re-throw error to let EditPassword component handle it
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="ml-2 text-muted-foreground">Loading profile…</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">Please log in to view your profile</p>
          <Button onClick={() => window.location.href = '/auth'}>Go to Login</Button>
        </div>
      </div>
    );
  }

  const isActive = profile.subscriptionStatus === "active";

  return (
    <div className="min-h-full">
      <div className="h-full flex flex-col max-w-6xl mx-auto px-4 sm:px-6">
        <div className="space-y-6 py-4 sm:py-6">

          <Card>
            <CardContent className="pt-6 pb-8 px-4 sm:px-6">
              <div className="flex flex-col items-center">
                <Avatar className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 ring-4 ring-background shadow-md rounded-full">
                  <AvatarImage 
                    src={getAvatarUrl(profile.avatar_url) || getAvatarUrl(profile.avatarUrl) || getAvatarUrl(profile.avatar) || undefined} 
                    alt={profile.full_name || profile.name} 
                  />
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <User className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16" />
                  </AvatarFallback>
                </Avatar>

                <h2 className="mt-4 text-xl sm:text-2xl font-semibold text-center px-2 break-words">Hi, {profile.full_name || profile.name}</h2>

                <div className="mt-6 w-full max-w-md flex flex-col sm:flex-row gap-2 px-4 sm:px-0">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditProfileOpen(true)}
                    className="w-full sm:w-auto sm:flex-1"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    <span className="whitespace-nowrap">Edit Profile</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditPasswordOpen(true)}
                    className="w-full sm:w-auto sm:flex-1"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    <span className="whitespace-nowrap">Change Password</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Calendar className="w-5 h-5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted-foreground">Member Since</div>
                  <div className="font-medium break-words">{profile.joinedDate}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <CreditCard className="w-5 h-5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted-foreground">Current Plan</div>
                  <div className="font-medium break-words">
                    {profile.subscriptionPlan ?? (isActive ? "Pro" : "-")}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Shield className="w-5 h-5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted-foreground">Account Status</div>
                  <div className="font-medium break-words">
                    {profile.is_active ? "Active" : "Inactive"} • {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Account Details</CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="min-w-full px-4 sm:px-0">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-border/60">
                        <td className="py-3 text-muted-foreground min-w-[120px] sm:w-48">Full Name</td>
                        <td className="py-3 break-words">{profile.full_name || profile.name}</td>
                      </tr>
                      <tr className="border-b border-border/60">
                        <td className="py-3 text-muted-foreground min-w-[120px] sm:w-48">Email</td>
                        <td className="py-3 break-all">{profile.email}</td>
                      </tr>
                      <tr className="border-b border-border/60">
                        <td className="py-3 text-muted-foreground min-w-[120px] sm:w-48">Email Verified</td>
                        <td className="py-3">
                          <Badge variant={profile.email_verified ? "default" : "secondary"}>
                            {profile.email_verified ? "Verified" : "Not Verified"}
                          </Badge>
                        </td>
                      </tr>
                      <tr className="border-b border-border/60">
                        <td className="py-3 text-muted-foreground min-w-[120px] sm:w-48">Role</td>
                        <td className="py-3">
                          <Badge variant={profile.role === 'admin' ? "default" : "outline"}>
                            {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                          </Badge>
                        </td>
                      </tr>
                      <tr className="border-b border-border/60">
                        <td className="py-3 text-muted-foreground min-w-[120px] sm:w-48">Joined Since</td>
                        <td className="py-3 break-words">{profile.joinedDate}</td>
                      </tr>
                      {profile.last_login_at && (
                        <tr className="border-b border-border/60">
                          <td className="py-3 text-muted-foreground min-w-[120px] sm:w-48">Last Login</td>
                          <td className="py-3 break-words">
                            {new Date(profile.last_login_at).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-3 text-muted-foreground min-w-[120px] sm:w-48">Subscription</td>
                        <td className="py-3">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <Badge
                              variant={isActive ? "default" : "secondary"}
                              className={isActive ? "bg-green-100 text-green-800 hover:bg-green-100 w-fit" : "w-fit"}
                            >
                              {isActive ? "Active" : "Inactive"}
                            </Badge>
                            {isActive && profile.subscriptionEndDate && profile.role !== 'admin' && profile.role !== 'developer' && (
                              <span className="text-sm text-muted-foreground break-words">
                                until {(() => {
                                  const date = new Date(profile.subscriptionEndDate);
                                  const day = String(date.getDate()).padStart(2, '0');
                                  const month = String(date.getMonth() + 1).padStart(2, '0');
                                  const year = date.getFullYear();
                                  const hours = String(date.getHours()).padStart(2, '0');
                                  const minutes = String(date.getMinutes()).padStart(2, '0');
                                  return `${day}-${month}-${year}, ${hours}:${minutes}`;
                                })()}
                              </span>
                            )}
                            {isActive && (profile?.role === 'admin' || profile?.role === 'developer') && (
                              <span className="text-sm text-green-600 break-words">
                                Lifetime Access
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subscription Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5" />
                Subscription Status
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              {(() => {
                const subInfo = getSubscriptionInfo();
                
                return (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <h3 className="text-base sm:text-lg font-semibold break-words">{subInfo.planName}</h3>
                          <Badge className={
                            subInfo.isActive 
                              ? (subInfo.status === 'trial'
                                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                                  : 'bg-green-100 text-green-800 border-green-200')
                              : subInfo.status === 'expired'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-gray-100 text-gray-800 border-gray-200'
                          }>
                            {subInfo.status === 'trial' ? 'Trial' : (subInfo.isActive ? 'Active' : subInfo.status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 break-words">
                          {subInfo.isActive 
                            ? (subInfo.isLifetime 
                                ? 'Active Forever (Lifetime Access)'
                                : subInfo.status === 'trial'
                                ? `Free Trial - ${subInfo.daysLeft > 0 ? `${subInfo.daysLeft} day${subInfo.daysLeft !== 1 ? 's' : ''} remaining` : 'Expiring today'}`
                                : `Expires in ${subInfo.daysLeft} days`)
                            : subInfo.status === 'expired'
                            ? 'Subscription expired'
                            : 'No active subscription'
                          }
                        </p>
                        {subInfo.endDate && !subInfo.isLifetime && (
                          <p className="text-xs text-muted-foreground break-words">
                            End date: {new Date(subInfo.endDate).toLocaleDateString('id-ID')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {subInfo.isActive && !subInfo.isLifetime && (
                          <div className={`flex items-center gap-1 text-sm whitespace-nowrap ${subInfo.status === 'trial' ? 'text-blue-600 font-medium' : 'text-muted-foreground'}`}>
                            <Clock className="w-4 h-4 flex-shrink-0" />
                            <span>
                              {subInfo.status === 'trial' 
                                ? `Trial: ${subInfo.daysLeft} day${subInfo.daysLeft !== 1 ? 's' : ''} left`
                                : `${subInfo.daysLeft} days left`}
                            </span>
                          </div>
                        )}
                        {subInfo.isActive && subInfo.isLifetime && (
                          <div className="flex items-center gap-1 text-sm text-green-600 whitespace-nowrap">
                            <Crown className="w-4 h-4 flex-shrink-0" />
                            <span>Lifetime</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {!subInfo.isActive && (
                      <div className="pt-4 border-t border-border">
                        <Button 
                          onClick={() => navigate('/subscription')}
                          className="w-full"
                        >
                          <Crown className="w-4 h-4 mr-2" />
                          Upgrade Plan
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="divide-y border-border/60">
              {[
                { title: "Logged in", time: "Just now" },
                { title: "Changed password", time: "3 days ago" },
                { title: "Updated profile photo", time: "2 weeks ago" },
              ].map((a, i) => (
                <div key={i} className="py-3">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.time}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <EditProfile
            isOpen={isEditProfileOpen}
            onClose={() => setIsEditProfileOpen(false)}
            profile={profile}
            onSave={handleUpdateProfile}
          />
          <EditPassword
            isOpen={isEditPasswordOpen}
            onClose={() => setIsEditPasswordOpen(false)}
            email={profile.email}
            onSubmit={handleChangePassword}
          />
        </div>
      </div>
    </div>
  );
}
