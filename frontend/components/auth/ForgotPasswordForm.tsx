/**
 * Forgot Password Form Component
 *
 * Requests a password reset link for the given email. The confirmation copy is
 * identical whether or not an account exists — the backend deliberately never
 * reveals which emails are registered.
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface ForgotPasswordFormProps {
  onSwitchToLogin?: () => void;
}

const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { forgotPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await forgotPassword(email);
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
          Reset Password
        </h2>
        <p className="text-sm text-gray-600 mb-6 text-center">
          Enter your email and we'll send you a link to reset your password.
        </p>

        {isSubmitted ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700">
              If an account exists for that email, a reset link has been sent.
              The link expires in 1 hour.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your email"
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}

        {onSwitchToLogin && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Remembered it?{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-blue-600 hover:text-blue-800 font-medium"
                disabled={isLoading}
              >
                Back to sign in
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
