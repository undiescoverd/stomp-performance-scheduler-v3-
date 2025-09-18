import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from '@clerk/clerk-react';
import { FEATURE_FLAGS } from '@/config/features';
import App from "./App";
import "./index.css";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Only require Clerk key if authentication is enabled
if (FEATURE_FLAGS.AUTHENTICATION_ENABLED && !clerkPubKey) {
  throw new Error("Missing Clerk Publishable Key");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {FEATURE_FLAGS.AUTHENTICATION_ENABLED ? (
      <ClerkProvider publishableKey={clerkPubKey}>
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
