import React, { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Calendar, Shield, CreditCard, Edit, Lock, Loader2, User, Crown, Clock } from "lucide-react";
import { EditProfile } from "./EditProfile";
import { EditPassword } from "./EditPassword";
import { useProfile } from "../../contexts/ProfileContext";
import { api } from "../../services/api";
import { toast } from "sonner";
import { useToast } from "../../contexts/ToastContext";
import { getAvatarUrl } from "../../utils/avatar";
import { supabase } from "../../lib/supabase";

export function ProfilePage() {
  const { profile, isLoading, updateProfile, refreshProfile } = useProfile();
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
    if (!subscriptionStatus?.subscription) {
      return { status: 'inactive', daysLeft: 0, isActive: false, planName: 'Free Plan' };
    }

    const subscription = subscriptionStatus.subscription;
    
    // If subscription is cancelled, failed, or expired, treat as inactive
    if (['cancelled', 'failed', 'expired'].includes(subscription.status)) {
      return { status: 'inactive', daysLeft: 0, isActive: false, planName: 'Free Plan' };
    }
    
    const now = new Date();
    const endDate = new Date(subscription.end_date);
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    const isActive = subscription.status === 'active' && daysLeft > 0;
    
    return {
      status: subscription.status,
      daysLeft: Math.max(0, daysLeft),
      isActive,
      planName: subscription.plan_name,
      endDate: subscription.end_date
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
      if (!profile?.email) {
        throw new Error('Profile email not found');
      }

      // Use Supabase direct password change
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword
      });
      
      if (error) {
        if (error.message?.includes('same_password')) {
          throw new Error('New password must be different from current password');
        } else if (error.message?.includes('Password should be at least')) {
          throw new Error('Password must be at least 6 characters');
        } else if (error.message?.includes('session_not_found')) {
          throw new Error('Session expired. Please sign in again.');
        } else {
          throw new Error(error.message || 'Failed to change password');
        }
      }

      toast.success('Password updated successfully!');
      setIsEditPasswordOpen(false);
      
      // Refresh profile after password change to ensure UI is updated
      try {
        await refreshProfile();
      } catch (error) {
        console.warn('Profile refresh failed after password change:', error);
      }
    } catch (error: any) {
      console.error('ProfilePage: Failed to change password:', error);
      toast.error(error.message || 'Failed to change password');
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
            <CardContent className="pt-6 pb-8">
              <div className="flex flex-col items-center">
                <Avatar className="w-48 h-48 ring-4 ring-background shadow-md rounded-full">
                  <AvatarImage 
                    src={getAvatarUrl(profile.avatar_url) || getAvatarUrl(profile.avatarUrl) || getAvatarUrl(profile.avatar) || undefined} 
                    alt={profile.full_name || profile.name} 
                  />
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <User className="w-16 h-16" />
                  </AvatarFallback>
                </Avatar>

                <h2 className="mt-4 text-2xl font-semibold">Hi, {profile.full_name || profile.name}</h2>

                <div className="mt-6 flex gap-2">
                  <Button variant="outline" onClick={() => setIsEditProfileOpen(true)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Profile
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditPasswordOpen(true)}>
                    <Lock className="w-4 h-4 mr-2" />
                    Change Password
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Calendar className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Member Since</div>
                  <div className="font-medium">{profile.joinedDate}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <CreditCard className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Current Plan</div>
                  <div className="font-medium">
                    {profile.subscriptionPlan ?? (isActive ? "Pro" : "-")}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Shield className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Account Status</div>
                  <div className="font-medium">
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
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-border/60">
                      <td className="py-3 text-muted-foreground w-48">Full Name</td>
                      <td className="py-3">{profile.full_name || profile.name}</td>
                    </tr>
                    <tr className="border-b border-border/60">
                      <td className="py-3 text-muted-foreground">Email</td>
                      <td className="py-3 break-all">{profile.email}</td>
                    </tr>
                    <tr className="border-b border-border/60">
                      <td className="py-3 text-muted-foreground">Email Verified</td>
                      <td className="py-3">
                        <Badge variant={profile.email_verified ? "default" : "secondary"}>
                          {profile.email_verified ? "Verified" : "Not Verified"}
                        </Badge>
                      </td>
                    </tr>
                    <tr className="border-b border-border/60">
                      <td className="py-3 text-muted-foreground">Role</td>
                      <td className="py-3">
                        <Badge variant={profile.role === 'admin' ? "default" : "outline"}>
                          {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                        </Badge>
                      </td>
                    </tr>
                    <tr className="border-b border-border/60">
                      <td className="py-3 text-muted-foreground">Joined Since</td>
                      <td className="py-3">{profile.joinedDate}</td>
                    </tr>
                    {profile.last_login_at && (
                      <tr className="border-b border-border/60">
                        <td className="py-3 text-muted-foreground">Last Login</td>
                        <td className="py-3">
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
                      <td className="py-3 text-muted-foreground">Subscription</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={isActive ? "default" : "secondary"}
                            className={isActive ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
                          >
                            {isActive ? "Active" : "Inactive"}
                          </Badge>
                          {isActive && profile.subscriptionEndDate && (
                            <span className="text-sm text-muted-foreground">
                              until {profile.subscriptionEndDate}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
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
            <CardContent>
              {(() => {
                const subInfo = getSubscriptionInfo();
                
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold">{subInfo.planName}</h3>
                          <Badge className={
                            subInfo.isActive 
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : subInfo.status === 'expired'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-gray-100 text-gray-800 border-gray-200'
                          }>
                            {subInfo.isActive ? 'Active' : subInfo.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {subInfo.isActive 
                            ? `Expires in ${subInfo.daysLeft} days`
                            : subInfo.status === 'expired'
                            ? 'Subscription expired'
                            : 'No active subscription'
                          }
                        </p>
                        {subInfo.endDate && (
                          <p className="text-xs text-muted-foreground">
                            End date: {new Date(subInfo.endDate).toLocaleDateString('id-ID')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {subInfo.isActive && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span>{subInfo.daysLeft} days left</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {!subInfo.isActive && (
                      <div className="pt-4 border-t border-border">
                        <Button 
                          onClick={() => window.location.href = '/subscription'}
                          className="w-full"
                        >
                          <Crown className="w-4 h-4 mr-2" />
                          Upgrade to Premium
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
