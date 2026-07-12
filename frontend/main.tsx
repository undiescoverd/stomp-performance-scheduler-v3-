import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { SettingsProvider } from "@/providers/SettingsProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import App from "./App";
import "./index.css";

// Google sign-in is presence-gated on VITE_GOOGLE_CLIENT_ID. When it's unset we
// render <App /> bare: mounting <GoogleOAuthProvider> with an empty clientId breaks
// the provider, and the whole email/password flow must stay unaffected pre-credentials.
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Kept inside AuthProvider so GoogleSignInButton can call useAuth().
const app = googleClientId ? (
  <GoogleOAuthProvider clientId={googleClientId}>
    <App />
  </GoogleOAuthProvider>
) : (
  <App />
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <QueryProvider>
          <AuthProvider>
            {app}
          </AuthProvider>
        </QueryProvider>
      </SettingsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
