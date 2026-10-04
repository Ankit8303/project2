import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Send, Bot, User, MessageSquare, AlertCircle, 
  Download, Copy, Check, Volume2, VolumeX, Mic, MicOff, 
  Sparkles, SlidersHorizontal, Languages, Plus, Eye, BookOpen, RotateCcw,
  AlignLeft, FileText, BarChart2, List
} from "lucide-react";
import axios from "axios";

const STARTER_PROMPTS = [
  { label: "📋 Executive Summary", query: "Give me an executive summary of this document with key takeaways." },
  { label: "🔍 Key Facts & Findings", query: "What are the most critical facts, numbers, and findings in this document?" },
  { label: "⚠️ Risks & Caveats", query: "What risks, constraints, or caveats are highlighted in this document?" },
  { label: "🎯 Action Items", query: "What recommendations, action items, or conclusions are provided?" }
];

const formatSuggestions = (questionsList) => {
  if (!Array.isArray(questionsList) || questionsList.length === 0) {
    return STARTER_PROMPTS;
  }
  const icons = ["💡", "🔍", "⚡", "🎯", "📊", "🧩"];
  return questionsList.map((q, idx) => {
    const text = typeof q === "string" ? q.trim() : (q.query || q.label || "").trim();
    const startsWithEmoji = /^[\p{Emoji}\u2000-\u3300]/u.test(text);
    const prefix = startsWithEmoji ? "" : `${icons[idx % icons.length]} `;
    const displayLabel = `${prefix}${text.length > 44 ? text.slice(0, 44) + "..." : text}`;
    return {
      label: displayLabel,
      query: text,
      fullText: text
    };
  });
};

const TONE_OPTIONS = [
  { id: "balanced",  label: "Balanced Tone",      icon: "⚖️" },
  { id: "executive", label: "Executive Brief",     icon: "📋" },
  { id: "detailed",  label: "In-Depth Analytical", icon: "🔬" },
  { id: "bullets",   label: "Bullet Points Only",  icon: "🔵" }
];

const LANGUAGE_OPTIONS = [
  "English", "Spanish", "French", "German", "Hindi", "Japanese", "Chinese", "Arabic"
];

export default function ChatWindow({ token, activeDocId, onSelectMessage, onOpenStudy, onOpenPreview, initialPrompt, onClearInitialPrompt }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tone, setTone] = useState("balanced");
  const [language, setLanguage] = useState("English");
  const [showToneMenu, setShowToneMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [docStarterPrompts, setDocStarterPrompts] = useState(STARTER_PROMPTS);
  const [loadingStarters, setLoadingStarters] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState(STARTER_PROMPTS);

  const messagesEndRef = useRef(null);
  const toneWrapperRef = useRef(null);
  const langWrapperRef = useRef(null);
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (toneWrapperRef.current && !toneWrapperRef.current.contains(e.target)) {
        setShowToneMenu(false);
      }
      if (langWrapperRef.current && !langWrapperRef.current.contains(e.target)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Handle injected initial prompts (e.g. from Compare Mode)
  useEffect(() => {
    if (initialPrompt) {
      setInputValue(initialPrompt);
      if (onClearInitialPrompt) onClearInitialPrompt();
    }
  }, [initialPrompt]);

  // Load chat history & tailored starter questions when active document changes
  useEffect(() => {
    if (activeDocId) {
      loadChatHistory();
      loadDocStarters();
    } else {
      setMessages([]);
      setDocStarterPrompts(STARTER_PROMPTS);
      setCurrentSuggestions(STARTER_PROMPTS);
    }
  }, [activeDocId, token]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const loadDocStarters = async () => {
    if (!activeDocId) return;
    try {
      setLoadingStarters(true);
      const res = await axios.get(`${API_URL}/api/documents/${activeDocId}/starter-questions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.questions && Array.isArray(res.data.questions) && res.data.questions.length > 0) {
        const formatted = formatSuggestions(res.data.questions);
        setDocStarterPrompts(formatted);
        // If current suggestions are generic or empty, switch to document-specific questions
        setCurrentSuggestions(prev => {
          const isGeneric = !prev || prev === STARTER_PROMPTS || prev.some(p => p.query === "Give me an executive summary of this document with key takeaways.");
          return isGeneric ? formatted : prev;
        });
      }
    } catch (err) {
      console.warn("Failed to load document-tailored starter questions:", err);
    } finally {
      setLoadingStarters(false);
    }
  };

  const loadChatHistory = async () => {
    try {
      setError("");
      const response = await axios.get(`${API_URL}/api/chats/${activeDocId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data;
      const loadedMsgs = [];
      data.chats.forEach(chat => {
        loadedMsgs.push({
          id: `q-${chat.createdAt}`,
          text: chat.question,
          sender: "user",
          createdAt: chat.createdAt
        });
        loadedMsgs.push({
          id: `a-${chat.createdAt}`,
          text: chat.answer,
          sender: "ai",
          intent: chat.intent,
          sources: chat.sources,
          evaluation: chat.evaluation,
          suggestedQuestions: chat.suggestedQuestions || [],
          createdAt: chat.createdAt
        });
      });
      setMessages(loadedMsgs);
      
      const lastAiMsg = loadedMsgs.filter(m => m.sender === "ai").pop();
      if (lastAiMsg) {
        onSelectMessage(lastAiMsg);
        if (lastAiMsg.suggestedQuestions && lastAiMsg.suggestedQuestions.length > 0) {
          setCurrentSuggestions(formatSuggestions(lastAiMsg.suggestedQuestions));
        } else {
          setCurrentSuggestions(docStarterPrompts);
        }
      } else {
        onSelectMessage(null);
        setCurrentSuggestions(docStarterPrompts);
      }
    } catch (err) {
      console.error("Failed to load chat history:", err);
      const errorMsg = err.response?.data?.error || "Failed to load chat history. Check server logs.";
      setError(errorMsg);
    }
  };

  const handleNewChat = async () => {
    if (!activeDocId) return;
    if (messages.length > 0 && !window.confirm("Start a new chat thread? This will clear the current conversation history for this document.")) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/api/chats/${activeDocId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages([]);
      setCurrentSuggestions(docStarterPrompts);
      onSelectMessage(null);
    } catch (err) {
      console.error("Failed to clear chat:", err);
    }
  };

  const executeQuery = async (queryText) => {
    if (!queryText.trim() || loading || !activeDocId) return;

    setError("");

    // Add user message to UI immediately
    const userMsg = {
      id: `user-${Date.now()}`,
      text: queryText,
      sender: "user",
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Apply tone instructions
    let enrichedQuestion = queryText;
    if (tone === "executive") {
      enrichedQuestion += " (Instruction: Provide your answer formatted as a concise executive brief).";
    } else if (tone === "detailed") {
      enrichedQuestion += " (Instruction: Provide an in-depth, thorough, and analytical response with detailed explanations).";
    } else if (tone === "bullets") {
      enrichedQuestion += " (Instruction: Format your answer strictly as structured, easy-to-read bullet points).";
    }

    // Apply multilingual instruction if not English
    if (language !== "English") {
      enrichedQuestion += ` (Instruction: Translate and write your complete response in ${language} language, while preserving citations).`;
    }

    try {
      const chatHistoryForRag = [];
      const aiMsgs = messages.filter(m => m.sender === "ai");
      const userMsgs = messages.filter(m => m.sender === "user");
      
      const lastTurns = Math.min(aiMsgs.length, 4);
      for (let i = aiMsgs.length - lastTurns; i < aiMsgs.length; i++) {
        if (userMsgs[i] && aiMsgs[i]) {
          chatHistoryForRag.push({ sender: "user", text: userMsgs[i].text });
          chatHistoryForRag.push({ sender: "ai", text: aiMsgs[i].text });
        }
      }

      const response = await axios.post(`${API_URL}/api/query`, 
        {
          documentId: activeDocId,
          question: enrichedQuestion,
          chatHistory: chatHistoryForRag
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = response.data;
      const aiMsg = {
        id: `ai-${Date.now()}`,
        text: data.answer,
        sender: "ai",
        intent: data.intent,
        sources: data.sources,
        evaluation: data.evaluation,
        suggestedQuestions: data.suggestedQuestions || [],
        createdAt: new Date().toISOString()
      };

      setMessages(prev => [...prev, aiMsg]);
      onSelectMessage(aiMsg);

      // Dynamically update the suggestion tray with new relevant follow-ups
      if (data.suggestedQuestions && data.suggestedQuestions.length > 0) {
        setCurrentSuggestions(formatSuggestions(data.suggestedQuestions));
      }
    } catch (err) {
      console.error("Query submit error:", err);
      const errorMsg = err.response?.data?.details || err.response?.data?.error || "Failed to fetch response. Try again.";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const text = inputValue;
    setInputValue("");
    executeQuery(text);
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;
    let markdown = `# PaperPulse AI - Document Intelligence Transcript\n\n`;
    markdown += `**Document ID:** ${activeDocId}\n`;
    markdown += `**Date:** ${new Date().toLocaleString()}\n`;
    markdown += `**Language:** ${language} | **Tone:** ${tone}\n\n---\n\n`;

    messages.forEach((msg) => {
      if (msg.sender === "user") {
        markdown += `### 👤 Question:\n${msg.text}\n\n`;
      } else {
        markdown += `### 🤖 PaperPulse AI Answer:\n${msg.text}\n\n`;
        if (msg.evaluation) {
          markdown += `> **Audit Grounding:** ${msg.evaluation.score}% | **Detected Intent:** ${msg.intent || "QA"}\n`;
          if (msg.evaluation.reasoning) {
            markdown += `> **Reasoning:** ${msg.evaluation.reasoning}\n`;
          }
        }
        markdown += `\n---\n\n`;
      }
    });

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paperpulse_${activeDocId}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const recognitionRef = useRef(null);

  const handleCopyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleSpeak = (text, id) => {
    if (!('speechSynthesis' in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    if (speakingMsgId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    setSpeakingMsgId(null);

    // Clean markdown, links, and codeblocks for natural reading
    const cleanText = text
      .replace(/```[\s\S]*?```/g, "Code block omitted.")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/<[^>]*>/g, "")
      .replace(/[*_#~>\[\]\(\)]/g, "")
      .replace(/\n+/g, ". ")
      .trim();

    if (!cleanText) return;

    window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Match voice to selected language if available
    const langPrefixMap = {
      English: "en",
      Spanish: "es",
      French: "fr",
      German: "de",
      Hindi: "hi",
      Japanese: "ja",
      Chinese: "zh",
      Arabic: "ar"
    };
    const prefix = langPrefixMap[language] || "en";
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const matched = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
      if (matched) utterance.voice = matched;
    }

    utterance.onstart = () => {
      setSpeakingMsgId(id);
    };

    utterance.onend = () => {
      setSpeakingMsgId(null);
    };

    utterance.onerror = (e) => {
      console.warn("Speech synthesis error:", e);
      setSpeakingMsgId(null);
    };

    // 50ms delay avoids browser voice-drop bug on rapid actions
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice speech-to-text is supported in Google Chrome, Microsoft Edge, and Safari.");
      return;
    }

    // Toggle off if already listening
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn("Speech stop warning:", e);
        }
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      const langCodeMap = {
        English: "en-US",
        Spanish: "es-ES",
        French: "fr-FR",
        German: "de-DE",
        Hindi: "hi-IN",
        Japanese: "ja-JP",
        Chinese: "zh-CN",
        Arabic: "ar-SA"
      };
      recognition.lang = langCodeMap[language] || "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let finalTrans = "";
        let interimTrans = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTrans += event.results[i][0].transcript;
          } else {
            interimTrans += event.results[i][0].transcript;
          }
        }
        if (finalTrans) {
          setInputValue(prev => prev ? `${prev} ${finalTrans.trim()}` : finalTrans.trim());
        }
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      console.error("Speech recognition error:", e);
      setIsListening(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    window.__paperpulse_seek = (sec) => {
      if (onOpenPreview && activeDocId) {
        onOpenPreview(activeDocId, { startSec: sec });
      }
    };
    return () => {
      delete window.__paperpulse_seek;
    };
  }, [activeDocId, onOpenPreview]);

  // Safe client-side markdown formatter with interactive timestamp citations
  const formatMarkdown = (text) => {
    if (!text) return "";
    let formatted = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Convert timestamps like [01:23] or [00:15 - 00:45] into clickable media jump pills
    formatted = formatted.replace(/\[(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\]/g, (match, p1) => {
      const parts = p1.split(":").map(Number);
      const sec = (parts[0] * 60) + parts[1];
      return `<button type="button" class="inline-timestamp-btn" data-time="${sec}" onclick="window.__paperpulse_seek(${sec})" title="Jump to ${p1} in media player">▶ ${match}</button>`;
    });

    formatted = formatted.replace(/^\s*-\s+(.+)$/gm, "<li>$1</li>");
    formatted = formatted.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/```(.*?)```/gs, "<pre><code>$1</code></pre>");
    formatted = formatted.replace(/`(.*?)`/g, "<code>$1</code>");
    formatted = formatted.replace(/\n/g, "<br />");

    return <div dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  return (
    <div className="card chat-window">
      {/* Top Header with Multi-Action Controls */}
      <div className="card-header chat-header-bar">
        <div className="chat-title-group">
          <Bot className="icon-accent" size={18} />
          <h3>PaperPulse Chat</h3>
        </div>

        <div className="chat-header-actions">
          {/* Preview Document Button */}
          {activeDocId && (
            <button
              type="button"
              className="chat-action-btn"
              onClick={() => onOpenPreview && onOpenPreview(activeDocId)}
              title="Preview Extracted Content"
            >
              <Eye size={13} />
              <span>Preview</span>
            </button>
          )}

          {/* Study & Quiz Mode Button */}
          {activeDocId && (
            <button
              type="button"
              className="chat-action-btn highlight-action"
              onClick={() => onOpenStudy && onOpenStudy(activeDocId)}
              title="Generate Interactive Quiz & Flashcards"
            >
              <Sparkles size={13} />
              <span>Study Mode</span>
            </button>
          )}

          {/* Tone Selector */}
          <div className="tone-selector-wrapper" ref={toneWrapperRef}>
            <button 
              type="button" 
              className={`chat-action-btn ${tone !== "balanced" ? "active" : ""}`}
              onClick={() => {
                setShowToneMenu(prev => !prev);
                setShowLangMenu(false);
              }}
              title="Change Answer Tone"
            >
              <SlidersHorizontal size={13} />
              <span>
                {TONE_OPTIONS.find(t => t.id === tone)?.icon}{" "}
                {TONE_OPTIONS.find(t => t.id === tone)?.label}
              </span>
            </button>

            {showToneMenu && (
              <div className="tone-dropdown-menu">
                {TONE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`tone-item ${tone === opt.id ? "selected" : ""}`}
                    onClick={() => {
                      setTone(opt.id);
                      setShowToneMenu(false);
                    }}
                  >
                    <span className="tone-item-icon">{opt.icon}</span>
                    <span>{opt.label}</span>
                    {tone === opt.id && <span className="tone-check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Language Selector */}
          <div className="tone-selector-wrapper" ref={langWrapperRef}>
            <button 
              type="button" 
              className={`chat-action-btn ${language !== "English" ? "active" : ""}`}
              onClick={() => {
                setShowLangMenu(prev => !prev);
                setShowToneMenu(false);
              }}
              title="Answer Language"
            >
              <Languages size={13} />
              <span>{language}</span>
            </button>

            {showLangMenu && (
              <div className="tone-dropdown-menu">
                {LANGUAGE_OPTIONS.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    className={`tone-item ${language === lang ? "selected" : ""}`}
                    onClick={() => {
                      setLanguage(lang);
                      setShowLangMenu(false);
                    }}
                  >
                    <span>{lang}</span>
                    {language === lang && <span className="tone-check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* New Chat Button */}
          {activeDocId && (
            <button
              type="button"
              className="chat-action-btn"
              onClick={handleNewChat}
              title="Start New Conversation Thread"
            >
              <Plus size={13} />
              <span>New</span>
            </button>
          )}

          {/* Export Chat Button */}
          {messages.length > 0 && (
            <button
              type="button"
              className="chat-action-btn"
              onClick={handleExportChat}
              title="Export Conversation as Markdown"
            >
              <Download size={13} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger chat-alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Message Log */}
      <div className="message-log">
        {!activeDocId ? (
          <div className="chat-empty">
            <MessageSquare size={48} className="empty-icon" />
            <h3>No Document Selected</h3>
            <p>Upload a PDF, TXT, or MD document or select one from your library to start chatting with it.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <Bot size={48} className="empty-icon" />
            <h3>Ask anything about this document</h3>
            <p>Type your question or click one of the quick starter prompts below to begin.</p>
            
            {/* Suggested Starter Questions Grounded in Uploaded Document */}
            {loadingStarters ? (
              <div className="starters-loading-state">
                <Sparkles size={16} className="icon-sparkle-pulse" />
                <span>Formulating questions tailored to this document...</span>
              </div>
            ) : (
              <div className="starter-prompts-grid">
                {docStarterPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="starter-prompt-card"
                    onClick={() => executeQuery(prompt.query)}
                    disabled={loading}
                    title={prompt.fullText || prompt.query}
                  >
                    <Sparkles size={14} className="prompt-icon" />
                    <span>{prompt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`message-bubble ${msg.sender} ${msg.sender === "ai" ? "clickable" : ""}`}
              onClick={() => msg.sender === "ai" && onSelectMessage(msg)}
            >
              <div className="message-avatar">
                {msg.sender === "user" ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className="message-content">
                <div className="message-text">{formatMarkdown(msg.text)}</div>

                {/* Inline Dynamic Follow-ups inside AI message bubble */}
                {msg.sender === "ai" && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                  <div className="msg-followups-block" onClick={(e) => e.stopPropagation()}>
                    <div className="msg-followups-label">
                      <Sparkles size={11} className="icon-sparkle-pulse" />
                      <span>Suggested Next Questions:</span>
                    </div>
                    <div className="msg-followups-grid">
                      {msg.suggestedQuestions.map((fq, fIdx) => (
                        <button
                          key={fIdx}
                          type="button"
                          className="msg-followup-pill-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            executeQuery(fq);
                          }}
                          title={fq}
                        >
                          <span className="followup-dot">✦</span>
                          <span>{fq}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {msg.sender === "ai" && (
                  <div className="message-meta-tag">
                    <span>Intent: {msg.intent || "QA"}</span>
                    {msg.evaluation && (
                      <span className={`eval-pill score-${Math.floor(msg.evaluation.score / 10) * 10}`}>
                        Grounding: {msg.evaluation.score}%
                      </span>
                    )}

                    {/* AI Message Action Buttons */}
                    <div className="msg-action-buttons">
                      <button
                        type="button"
                        className={`msg-btn ${speakingMsgId === msg.id ? "speaking-active" : ""}`}
                        title={speakingMsgId === msg.id ? "Stop Listening" : "Read Aloud"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpeak(msg.text, msg.id);
                        }}
                      >
                        {speakingMsgId === msg.id ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>

                      <button
                        type="button"
                        className="msg-btn"
                        title="Copy answer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyText(msg.text, msg.id);
                        }}
                      >
                        {copiedMsgId === msg.id ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      </button>
                    </div>

                    <span className="info-tip">Click bubble to inspect RAG sources</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        
        {loading && (
          <div className="message-bubble ai loading">
            <div className="message-avatar">
              <Bot size={14} />
            </div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Dynamic Suggested Follow-Up Prompts Pill Tray (Always visible when doc is selected) */}
      {activeDocId && !loading && (
        <div className="quick-prompts-tray">
          <div className="prompts-tray-header">
            <div className="prompts-tray-title">
              <Sparkles size={11} className="icon-sparkle-pulse" />
              <span>{messages.length === 0 ? "Starter Questions:" : "Suggested Next Questions:"}</span>
            </div>
            {messages.length > 0 && currentSuggestions !== docStarterPrompts && (
              <button
                type="button"
                className="btn-reset-starters"
                onClick={() => setCurrentSuggestions(docStarterPrompts)}
                title="Reset to document-tailored starter questions"
              >
                <RotateCcw size={10} />
                <span>Doc Starters</span>
              </button>
            )}
          </div>
          <div className="prompts-pills-list">
            {currentSuggestions.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                className="quick-prompt-pill"
                onClick={() => executeQuery(prompt.query)}
                title={prompt.fullText || prompt.query}
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Voice Input Banner */}
      {isListening && (
        <div className="listening-pulse-banner">
          <span className="listening-wave-dot"></span>
          <span className="listening-wave-dot"></span>
          <span className="listening-wave-dot"></span>
          <span className="listening-banner-text">🎙️ Listening to your voice... Speak now (Click mic again to stop)</span>
        </div>
      )}

      {/* Input Tray */}
      <form onSubmit={handleSend} className="chat-input-tray">
        {/* Voice Input Microphone Button */}
        <button
          type="button"
          className={`chat-tool-btn ${isListening ? "listening" : ""}`}
          onClick={handleVoiceInput}
          title={isListening ? "Listening... Speak now" : "Click to speak"}
          disabled={!activeDocId || loading}
        >
          {isListening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        <input
          type="text"
          placeholder={
            isListening 
              ? "Listening... Speak your question..." 
              : activeDocId 
                ? `Ask question in ${language} (${TONE_OPTIONS.find(t => t.id === tone)?.label})...` 
                : "Select or upload a document to begin..."
          }
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={!activeDocId || loading}
          required
        />

        <button type="submit" disabled={!activeDocId || loading || !inputValue.trim()} title="Send Message">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
