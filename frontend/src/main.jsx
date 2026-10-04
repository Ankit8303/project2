import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { dark } from '@clerk/themes'
import './index.css'
import App from './App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_ZGlzY3JldGUtbW9zcXVpdG8tMzEwMy5jbGVyay5hY2NvdW50cy5kZXYk";

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key in environment variables.");
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#8b5cf6',
          colorBackground: '#0b0f19',
          colorInputBackground: '#131927',
          colorInputText: '#f3f4f6',
          colorText: '#f3f4f6',
          colorTextSecondary: '#9ca3af',
          borderRadius: '12px'
        }
      }}
    >
      <App />
    </ClerkProvider>
  </StrictMode>,
)
