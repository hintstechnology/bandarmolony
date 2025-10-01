// Mock API service for simulating real API calls

export interface ProfileData {
  id: string;
  name: string;
  email: string;
  joinedDate: string;
  subscriptionStatus: "active" | "inactive";
  subscriptionEndDate?: string;
  avatarUrl?: string;
}

export interface PaymentRecord {
  id: string;
  date: string;
  status: "paid" | "waiting" | "failed";
  amount: string;
  product: string;
  paymentMethod: string;
}

// Mock data
const mockProfile: ProfileData = {
  id: "1",
  name: "Iqbal Rabani",
  email: "iqbalrabani@gmail.com",
  joinedDate: "August 21, 2025",
  subscriptionStatus: "active",
  subscriptionEndDate: "September 21, 2025",
  avatarUrl: undefined
};

const mockPayments: PaymentRecord[] = [
  {
    id: "1",
    date: "Dec 15, 2024 14:32:15",
    status: "paid",
    amount: "Rp 299.000",
    product: "Pro - 1 Year",
    paymentMethod: "BCA"
  },
  {
    id: "2",
    date: "Dec 15, 2023 09:15:42",
    status: "paid",
    amount: "Rp 99.000",
    product: "Basic - 1 Month",
    paymentMethod: "E-wallet"
  },
  {
    id: "3",
    date: "Nov 20, 2024 16:45:23",
    status: "failed",
    amount: "Rp 189.000",
    product: "Plus - 6 Month",
    paymentMethod: "Qris"
  },
  {
    id: "4",
    date: "Nov 10, 2024 11:20:08",
    status: "waiting",
    amount: "Rp 25.000",
    product: "Trial - 1 Week",
    paymentMethod: "BCA"
  },
  {
    id: "5",
    date: "Oct 01, 2024 13:55:30",
    status: "paid",
    amount: "Rp 99.000",
    product: "Basic - 1 Month",
    paymentMethod: "E-wallet"
  },
  {
    id: "6",
    date: "Sep 15, 2024 10:22:18",
    status: "paid",
    amount: "Rp 189.000",
    product: "Plus - 6 Month",
    paymentMethod: "Qris"
  },
  {
    id: "7",
    date: "Aug 30, 2024 16:44:55",
    status: "failed",
    amount: "Rp 25.000",
    product: "Trial - 1 Week",
    paymentMethod: "BCA"
  }
];

// Simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  // Get profile data
  async getProfile(): Promise<ProfileData> {
    await delay(500); // Simulate network delay
    return { ...mockProfile };
  },

  // Update profile
  async updateProfile(data: Partial<ProfileData>): Promise<ProfileData> {
    await delay(800);
    Object.assign(mockProfile, data);
    return { ...mockProfile };
  },

  // Get payment history with optional filters
  async getPaymentHistory(filters?: {
    status?: string;
    paymentMethod?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<PaymentRecord[]> {
    await delay(600);
    
    let filtered = [...mockPayments];
    
    if (filters?.status && filters.status !== "all") {
      filtered = filtered.filter(payment => payment.status === filters.status);
    }
    
    if (filters?.paymentMethod && filters.paymentMethod !== "all") {
      filtered = filtered.filter(payment => payment.paymentMethod === filters.paymentMethod);
    }
    
    // Note: Date filtering would require proper date parsing in a real implementation
    
    return filtered;
  },

  // Send password reset email
  async sendPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    await delay(1000);
    return {
      success: true,
      message: `Password reset link sent to ${email}`
    };
  }
};