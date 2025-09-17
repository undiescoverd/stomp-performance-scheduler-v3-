import { useAuth } from '@clerk/clerk-react'
import { SignIn } from '@clerk/clerk-react'
import { ReactNode } from 'react'

interface AuthWrapperProps {
  children: ReactNode
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { isSignedIn, isLoaded } = useAuth()
  
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }
  
  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-8">
            STOMP Performance Scheduler
          </h1>
          <SignIn 
            appearance={{
              elements: {
                formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white',
                card: 'shadow-xl',
                headerTitle: "Sign in to your account",
                headerSubtitle: "Welcome back",
                socialButtonsBlockButton: "flex items-center justify-center gap-2 border hover:bg-gray-50",
                formFieldInput: "rounded-md border-gray-300",
              },
              variables: {
                colorPrimary: '#2563eb',
                borderRadius: '0.5rem',
              }
            }}
          />
        </div>
      </div>
    )
  }
  
  return <>{children}</>
}