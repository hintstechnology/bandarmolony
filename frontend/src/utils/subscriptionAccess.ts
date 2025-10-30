import { ProfileData } from "../services/api";

/**
 * Check if user has access to premium features
 */
export function hasPremiumAccess(profile: ProfileData | null | undefined): boolean {
  if (!profile) return false;
  
  // Admin and Developer always have access
  if (profile.role === "admin" || profile.role === "developer") {
    return true;
  }
  
  // Check subscription plan and status
  const subscriptionPlan = profile.subscriptionPlan?.toLowerCase();
  const subscriptionStatus = profile.subscriptionStatus?.toLowerCase();
  const subscriptionEndDateStr = (profile as any).subscriptionEndDate || (profile as any).subscription_end_date;
  const now = Date.now();
  const endDate = subscriptionEndDateStr ? new Date(subscriptionEndDateStr).getTime() : null;
  
  // Must have non-Free plan AND active/trial status
  if (!subscriptionPlan || subscriptionPlan === "free") {
    return false;
  }

  // Only grant access if status is active or trial AND end date is in the future
  // For non-admin/developer users, a missing endDate should be treated as no access
  if (subscriptionStatus === "active" || subscriptionStatus === "trial") {
    if (!endDate) return false;
    return endDate > now;
  }

  return false;
}

/**
 * Check if a route requires premium access
 */
export function requiresPremiumAccess(route: string): boolean {
  const freeRoutes = ["profile", "subscription"];
  const normalizedRoute = route.replace("/", "").split("/")[0] || "";
  
  return normalizedRoute ? !freeRoutes.includes(normalizedRoute) : false;
}

/**
 * Get feature name from route
 */
export function getFeatureNameFromRoute(route: string): string {
  const routeMap: Record<string, string> = {
    "dashboard": "Dashboard",
    "market-rotation": "Market Rotation",
    "broker-activity": "Broker Activity",
    "stock-transaction": "Stock Transaction",
    "story": "Story",
    "astrology": "Astrology",
    "technical-analysis": "Technical Analysis",
    "admin": "Admin Dashboard",
    "developer": "Developer Dashboard",
  };
  
  const normalizedRoute = route.replace("/", "").split("/")[0] || "";
  return routeMap[normalizedRoute] || "this feature";
}

