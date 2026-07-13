/**
 * Reset Password Screen
 *
 * Public (unauthenticated) landing page for emailed reset links:
 * /reset-password?token=... — rendered outside AuthWrapper. Standalone
 * centered card matching the login landing styling.
 */

import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ResetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(token!, password);
      setIsDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            Reset Password
          </h1>

          {!token ? (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-6">
                This reset link is invalid. Request a new one from the sign-in
                screen.
              </p>
              <Link to="/" className="text-blue-600 hover:text-blue-800 font-medium">
                Back to sign in
              </Link>
            </div>
          ) : isDone ? (
            <div className="text-center">
              <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700">
                  Your password has been reset. Sign in with your new password.
                </p>
              </div>
              <Link
                to="/"
                className="inline-block w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Go to Sign In
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-6 text-center">
                Choose a new password for your account.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="At least 8 characters"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (error) setError(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Repeat the new password"
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Resetting…' : 'Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
