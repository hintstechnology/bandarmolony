export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  duration: number;
  popular: boolean;
}

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "plus",
    name: "Plus",
    price: 35000,
    period: "1 bulan",
    duration: 1,
    popular: false,
  },
  {
    id: "premium",
    name: "Premium",
    price: 89000,
    period: "3 bulan",
    duration: 3,
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 165000,
    period: "6 bulan",
    duration: 6,
    popular: false,
  },
];

