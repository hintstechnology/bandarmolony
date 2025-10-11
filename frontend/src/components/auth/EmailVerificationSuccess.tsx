import React from 'react';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { motion } from 'motion/react';

interface EmailVerificationSuccessProps {
  onLogin?: () => void;
  message?: string;
  redirectTo?: string;
}

export function EmailVerificationSuccess({ onLogin, message, redirectTo }: EmailVerificationSuccessProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-md w-full mx-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center border border-green-200 dark:border-green-800"
        >
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ 
              type: "spring", 
              stiffness: 200, 
              damping: 15,
              delay: 0.2 
            }}
            className="flex justify-center mb-6"
          >
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
            </div>
          </motion.div>

          {/* Success Message */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
              🎉 {message ? 'Success!' : 'Email Verified!'}
            </h1>
            <p className="text-lg text-green-600 dark:text-green-400 font-medium mb-2">
              {message || 'Your account has been successfully activated'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {redirectTo ? 'You will be redirected automatically.' : 'Welcome to BandarmoloNY! You can now access all features of your account.'}
            </p>
          </motion.div>

          {/* Action Button */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            {/* No login button needed - user will be redirected automatically */}
          </motion.div>

          {/* Additional Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
          >
            <p className="text-xs text-blue-700 dark:text-blue-300">
              💡 <strong>Tip:</strong> You can now log in with your email and password to access your dashboard.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
