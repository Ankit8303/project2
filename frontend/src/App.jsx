import React, { useState, useEffect } from "react";
import { 
  SignedIn, 
  SignedOut, 
  SignIn, 
  SignUp, 
  UserButton, 
  useUser, 
  useAuth 
} from "@clerk/clerk-react";
import DocumentManager from "./components/DocumentManager";
import ChatWindow from "./components/ChatWindow";
import SourceInspector from "./components/SourceInspector";
import DocumentPreviewModal from "./components/DocumentPreviewModal";
import StudyModal from "./components/StudyModal";
import { Palette } from "lucide-react";

const THEMES = [
  { id: "amethyst", name: "Cosmic Amethyst", dot: "#a855f7" },
  { id: "emerald", name: "Aurora Emerald", dot: "#10b981" },
  { id: "obsidian", name: "Obsidian Rose", dot: "#f43f5e" }
];

export default function App() {
  const [authMode, setAuthMode] = useState("signin");

  return (
    <>
      <SignedOut>
        <div className="clerk-auth-container">
          <div className="clerk-auth-card">
            <div className="clerk-brand-header">
              <div className="brand-logo">PP</div>
              <div className="brand-titles">
                <h1>PaperPulse AI</h1>
                <p>Omnimodal Document Intelligence & Research Platform</p>
              </div>
            </div>
            
            <div className="clerk-form-wrapper">
              {authMode === "signin" ? (
                <div className="auth-card-inner">
                  <SignIn 
                    routing="hash"
                    signUpUrl="#signup"
                  />
                  <div style={{ textAlign: "center", marginTop: "12px" }}>
                    <button
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--accent-primary, #a855f7)",
                        fontSize: "13px",
                        cursor: "pointer",
                        textDecoration: "underline"
                      }}
                    >
                      Need an account? Sign up with Clerk
                    </button>
                  </div>
                </div>
              ) : (
                <div className="auth-card-inner">
                  <SignUp 
                    routing="hash"
                    signInUrl="#signin"
                  />
                  <div style={{ textAlign: "center", marginTop: "12px" }}>
                    <button
                      type="button"
                      onClick={() => setAuthMode("signin")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--accent-primary, #a855f7)",
                        fontSize: "13px",
                        cursor: "pointer",
                        textDecoration: "underline"
                      }}
                    >
                      Already have an account? Sign in
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        <AuthenticatedDashboard />
      </SignedIn>
    </>
  );
}

function AuthenticatedDashboard() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [token, setToken] = useState("");
  const [activeDocId, setActiveDocId] = useState("");
  const [selectedMessage, setSelectedMessage] = useState(null);
  
  // Modals & Theme State
  const [previewDocId, setPreviewDocId] = useState(null);
  const [previewOptions, setPreviewOptions] = useState({});
  const [studyDocId, setStudyDocId] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("paperpulse_theme") || "amethyst");
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [comparisonPrompt, setComparisonPrompt] = useState(null);

  // Apply theme to root html element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("paperpulse_theme", theme);
  }, [theme]);

  // Acquire and periodically refresh Clerk session token for API requests
  useEffect(() => {
    let isMounted = true;
    const fetchToken = async () => {
      try {
        const rawToken = await getToken();
        if (isMounted && rawToken) {
          setToken(rawToken);
        }
      } catch (err) {
        console.error("Clerk session token retrieval failure:", err);
      }
    };

    fetchToken();
    const refreshTimer = setInterval(fetchToken, 45000); // refresh every 45s before 60s expiry

    return () => {
      isMounted = false;
      clearInterval(refreshTimer);
    };
  }, [getToken]);

  const handleCompareDocs = (doc1, doc2) => {
    setActiveDocId(doc1.id);
    setComparisonPrompt(`Please compare and contrast "${doc1.filename}" and "${doc2.filename}". Highlight key differences, shared themes, and unique takeaways.`);
  };

  const userEmail = user?.primaryEmailAddress?.emailAddress || user?.username || "Authenticated User";

  if (!token) {
    return (
      <div className="app-shell" data-theme={theme} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <div className="brand-logo" style={{ width: "48px", height: "48px", fontSize: "18px" }}>PP</div>
          <div style={{ color: "var(--text-secondary)", fontSize: "13px", letterSpacing: "0.2px" }}>Connecting secure workspace session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <div className="dashboard-layout">
        {/* Main Top Header */}
        <header className="main-header">
          <div className="header-brand">
            <div className="brand-logo">PP</div>
            <h1>PaperPulse AI</h1>
          </div>

          <div className="header-controls">
            {/* Theme Customizer Dropdown */}
            <div className="theme-selector-container">
              <button
                type="button"
                className="btn btn-theme-toggle"
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                title="Customize Theme"
              >
                <Palette size={14} />
                <span>Theme</span>
              </button>

              {showThemeMenu && (
                <div className="theme-dropdown-menu">
                  <div className="theme-menu-header">Color Themes</div>
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`theme-option-btn ${theme === t.id ? "active" : ""}`}
                      onClick={() => {
                        setTheme(t.id);
                        setShowThemeMenu(false);
                      }}
                    >
                      <span className="theme-dot" style={{ background: t.dot }} />
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Clerk User Profile & Session Controls */}
            <div className="clerk-user-badge">
              <span className="user-email" title={userEmail}>
                {userEmail}
              </span>
              <UserButton 
                afterSignOutUrl="/" 
                appearance={{
                  elements: {
                    userButtonAvatarBox: {
                      width: "28px",
                      height: "28px"
                    }
                  }
                }}
              />
            </div>
          </div>
        </header>

        {/* Three-Column Dashboard Grid */}
        <main className="dashboard-grid">
          {/* Column 1: Document Manager */}
          <DocumentManager 
            token={token} 
            activeDocId={activeDocId} 
            setActiveDocId={setActiveDocId}
            onOpenPreview={(id, opts) => { setPreviewDocId(id); setPreviewOptions(opts || {}); }}
            onOpenStudy={(id) => setStudyDocId(id)}
            onCompareDocs={handleCompareDocs}
          />

          {/* Column 2: Conversational Chat */}
          <ChatWindow 
            token={token} 
            activeDocId={activeDocId} 
            onSelectMessage={setSelectedMessage}
            onOpenPreview={(id, opts) => { setPreviewDocId(id); setPreviewOptions(opts || {}); }}
            onOpenStudy={(id) => setStudyDocId(id)}
            initialPrompt={comparisonPrompt}
            onClearInitialPrompt={() => setComparisonPrompt(null)}
          />

          {/* Column 3: RAG Execution Auditor & Analytics */}
          <SourceInspector 
            selectedMessage={selectedMessage}
            activeDocId={activeDocId}
            token={token}
            onAskTopic={(topic) => setComparisonPrompt(`Tell me more about "${topic}" based on this document.`)}
          />
        </main>

        {/* In-App Semantic Preview Modal */}
        {previewDocId && (
          <DocumentPreviewModal
            token={token}
            documentId={previewDocId}
            initialTimeSec={previewOptions.startSec}
            highlightChunkId={previewOptions.chunkId}
            onClose={() => { setPreviewDocId(null); setPreviewOptions({}); }}
          />
        )}

        {/* Interactive Study Mode (Quiz & Flashcards) Modal */}
        {studyDocId && (
          <StudyModal
            token={token}
            documentId={studyDocId}
            onClose={() => setStudyDocId(null)}
          />
        )}
      </div>
    </div>
  );
}
