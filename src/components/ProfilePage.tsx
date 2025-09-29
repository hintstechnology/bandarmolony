import React, { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/Button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { ChevronDown, ChevronRight, User, Edit, Lock, Loader2 } from "lucide-react";
import { PaymentHistory } from "./PaymentHistory";
import { EditProfile } from "./EditProfile";
import { EditPassword } from "./EditPassword";
import { api, ProfileData } from "../services/api";
import { toast } from "sonner";
import { cn } from "./ui/utils";
import { useIsMobile } from "./ui/use-mobile";

export function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaymentActivityOpen, setIsPaymentActivityOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isEditPasswordOpen, setIsEditPasswordOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const data = await api.getProfile();
      setProfile(data);
    } catch (error) {
      toast.error("Failed to load profile data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async (data: Partial<ProfileData>) => {
    if (!profile) return;
    const updated = await api.updateProfile(data);
    setProfile(updated);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="ml-2 text-muted-foreground">Loading profile...</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Failed to load profile data</p>
          <Button onClick={loadProfile} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Profile Information Card */}
      <Card>
        <CardContent className="pt-6">
          {isMobile ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center gap-4">
              <Avatar className="w-20 h-20 aspect-square">
                <AvatarImage src={profile.avatarUrl} alt={profile.name} />
                <AvatarFallback className="text-lg">
                  <User className="w-10 h-10" />
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl font-medium text-foreground">{profile.name}</h1>
                <p className="text-muted-foreground text-sm break-all">{profile.email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setIsEditProfileOpen(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setIsEditPasswordOpen(true)}>
                <Lock className="w-4 h-4 mr-2" />
                Change Password
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Joined Since</p>
                <p className="font-medium">{profile.joinedDate}</p>
              </div>
              <div className="col-start-2">
                <p className="text-sm text-muted-foreground">Subscription Status</p>
                <div className="flex items-center space-x-2 mt-1">
                  <Badge
                    variant={profile.subscriptionStatus === "active" ? "default" : "secondary"}
                    className={profile.subscriptionStatus === "active" ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
                  >
                    {profile.subscriptionStatus === "active" ? "Active" : "Inactive"}
                  </Badge>
                  {profile.subscriptionStatus === "active" && profile.subscriptionEndDate && (
                    <span className="text-sm text-muted-foreground">until {profile.subscriptionEndDate}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          ) : (
          <div>
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-6">
                <Avatar className="w-24 h-24 aspect-square">
                  <AvatarImage src={profile.avatarUrl} alt={profile.name} />
                  <AvatarFallback className="text-xl">
                    <User className="w-12 h-12" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h1 className="text-2xl font-medium text-foreground truncate">{profile.name}</h1>
                  <p className="text-muted-foreground break-all">{profile.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditProfileOpen(true)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Profile
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsEditPasswordOpen(true)}>
                  <Lock className="w-4 h-4 mr-2" />
                  Change Password
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="ml-28">
                <p className="text-sm text-muted-foreground">Joined Since</p>
                <p className="font-medium">{profile.joinedDate}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Subscription Status</p>
                <div className="flex items-center space-x-2 mt-1">
                  <Badge
                    variant={profile.subscriptionStatus === "active" ? "default" : "secondary"}
                    className={profile.subscriptionStatus === "active" ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
                  >
                    {profile.subscriptionStatus === "active" ? "Active" : "Inactive"}
                  </Badge>
                  {profile.subscriptionStatus === "active" && profile.subscriptionEndDate && (
                    <span className="text-sm text-muted-foreground">until {profile.subscriptionEndDate}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Activity Section */}
      <Card>
        <Collapsible open={isPaymentActivityOpen} onOpenChange={setIsPaymentActivityOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Payment Activity</CardTitle>
                {isPaymentActivityOpen ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <PaymentHistory />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Edit Profile Modal */}
      <EditProfile
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        profile={profile}
        onSave={handleUpdateProfile}
      />

      {/* Edit Password Modal */}
      <EditPassword
        isOpen={isEditPasswordOpen}
        onClose={() => setIsEditPasswordOpen(false)}
        email={profile.email}
      />
    </div>
  );
}