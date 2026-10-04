import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, Layers, Activity, BookOpen, BarChart3, Clock, 
  FileText, Award, Tag, Loader2, Copy, Check, Sparkles, 
  TrendingUp, AlertTriangle, Compass, CheckCircle2, Cpu
} from "lucide-react";
import axios from "axios";

export default function SourceInspector({ selectedMessage, activeDocId, token, onAskTopic }) {
  const [activeTab, setActiveTab] = useState("auditor"); // "auditor" or "analytics"
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [copiedChunkId, setCopiedChunkId] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

  useEffect(() => {
    if (activeDocId && activeTab === "analytics") {
      fetchAnalytics();
    }
  }, [activeDocId, activeTab]);

  const fetchAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      const res = await axios.get(`${API_URL}/api/documents/${activeDocId}/analytics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnalytics(res.data.analytics);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const handleCopyChunk = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkId(id);
    setTimeout(() => setCopiedChunkId(null), 1800);
  };

  const getScoreColorClass = (val) => {
    if (val >= 85) return "score-high";
    if (val >= 60) return "score-mid";
    return "score-low";
  };

  const getScoreGradient = (val) => {
    if (val >= 85) return "url(#gradHigh)";
    if (val >= 60) return "url(#gradMid)";
    return "url(#gradLow)";
  };

  const scoreValue = selectedMessage?.evaluation?.score ?? 100;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scoreValue / 100) * circumference;

  return (
    <div className="card source-inspector">
      {/* Top Header with Tab Switcher */}
      <div className="card-header inspector-header-tabs">
        <div className="inspector-tabs-group">
          <button
            type="button"
            className={`inspector-tab-btn ${activeTab === "auditor" ? "active" : ""}`}
            onClick={() => setActiveTab("auditor")}
          >
            <ShieldCheck size={14} />
            <span>RAG Auditor</span>
            {selectedMessage && <span className="tab-dot active" />}
          </button>
          
          <button
            type="button"
            className={`inspector-tab-btn ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}
            disabled={!activeDocId}
            title={!activeDocId ? "Select a document first" : "View Document Analytics"}
          >
            <BarChart3 size={14} />
            <span>Doc Analytics</span>
            {analytics && <span className="tab-dot" />}
          </button>
        </div>

        <span className="inspector-top-tag">
          {activeTab === "auditor" ? "Live Trace" : "Doc Metrics"}
        </span>
      </div>

      {activeTab === "auditor" ? (
        /* ====================================================
           TAB 1: RAG AUDITOR
           ==================================================== */
        !selectedMessage ? (
          <div className="source-inspector-empty">
            <div className="empty-radar-wrap">
              <div className="radar-circle circle-1"></div>
              <div className="radar-circle circle-2"></div>
              <div className="radar-center-icon">
                <Compass className="empty-icon" size={28} />
              </div>
            </div>
            <h3>RAG Execution Auditor</h3>
            <p>Click on any <strong>AI response bubble</strong> in the chat to audit its retrieval context, routing step, and groundedness evaluation.</p>
            <div className="empty-hint-pill">
              <Sparkles size={12} />
              <span>Select any chat answer to inspect</span>
            </div>
          </div>
        ) : (
          <div className="inspector-content">
            {/* Section 1: Agentic Query Pipeline */}
            <div className="inspector-section">
              <div className="section-title">
                <Activity size={13} />
                <span>Agentic Query Pipeline</span>
              </div>

              <div className="routing-flow-card">
                <div className="routing-flow-top">
                  <div className="pipeline-node">
                    <span className="pipeline-label">Router Intent</span>
                    <span className={`intent-badge-pro ${selectedMessage.intent?.toLowerCase() || "qa"}`}>
                      {selectedMessage.intent || "QA"}
                    </span>
                  </div>

                  <div className="pipeline-arrow">→</div>

                  <div className="pipeline-node">
                    <span className="pipeline-label">Execution Engine</span>
                    <span className="engine-badge">
                      <Cpu size={11} />
                      <span>Groq AI Inference</span>
                    </span>
                  </div>
                </div>

                <p className="intent-desc">
                  {selectedMessage.intent === "GREET" && "Routed as conversational chit-chat: response was generated directly without document query retrieval."}
                  {selectedMessage.intent === "SUMMARY" && "Routed as executive summary: loaded lead document segments to synthesize key takeaways."}
                  {(!selectedMessage.intent || selectedMessage.intent === "QA") && "Routed as factual knowledge query: semantic dense search + sparse keyword match executed across vector space."}
                </p>
              </div>
            </div>

            {/* Section 2: LLM-as-a-Judge Faithfulness Audit */}
            <div className="inspector-section">
              <div className="section-title">
                <ShieldCheck size={13} />
                <span>LLM-as-a-Judge Faithfulness Audit</span>
              </div>
              
              <div className="eval-results-pro-card">
                {/* Glowing Circular SVG Radial Gauge */}
                <div className="radial-gauge-container">
                  <svg className="radial-gauge-svg" width="80" height="80">
                    <defs>
                      <linearGradient id="gradHigh" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                      <linearGradient id="gradMid" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#f97316" />
                      </linearGradient>
                      <linearGradient id="gradLow" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f43f5e" />
                        <stop offset="100%" stopColor="#ec4899" />
                      </linearGradient>
                    </defs>
                    <circle
                      className="gauge-bg"
                      cx="40"
                      cy="40"
                      r={radius}
                      strokeWidth="6"
                    />
                    <circle
                      className="gauge-progress"
                      cx="40"
                      cy="40"
                      r={radius}
                      strokeWidth="6"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      stroke={getScoreGradient(scoreValue)}
                    />
                  </svg>
                  <div className="gauge-center-text">
                    <span className="gauge-num">{scoreValue}%</span>
                    <span className="gauge-sub">Grounded</span>
                  </div>
                </div>
                
                {/* Details & Reasoning */}
                <div className="eval-info-block">
                  <div className="eval-status-row">
                    <span className="eval-status-title">Confidence Tier:</span>
                    <span className={`eval-tier-badge ${getScoreColorClass(scoreValue)}`}>
                      {scoreValue >= 85 ? (
                        <>
                          <CheckCircle2 size={12} />
                          <span>Grounded & Faithful</span>
                        </>
                      ) : scoreValue >= 60 ? (
                        <>
                          <TrendingUp size={12} />
                          <span>Partially Grounded</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={12} />
                          <span>Hallucination Risk</span>
                        </>
                      )}
                    </span>
                  </div>
                  
                  <div className="eval-reasoning-quote">
                    <p>{selectedMessage.evaluation?.reasoning || "Answer is accurately grounded in the retrieved document context without hallucinated claims."}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Retrieved Context Chunks */}
            <div className="inspector-section last">
              <div className="section-title">
                <BookOpen size={13} />
                <span>Hybrid Retrieved Chunks ({selectedMessage.sources?.length || 0})</span>
              </div>

              {(!selectedMessage.sources || selectedMessage.sources.length === 0) ? (
                <div className="no-sources-box">
                  <p>No document chunks were retrieved for this specific message.</p>
                </div>
              ) : (
                <div className="source-chunks-list">
                  {selectedMessage.sources.map((src, index) => (
                    <div key={src.chunkId || index} className="source-chunk-card-pro">
                      <div className="chunk-header-pro">
                        <div className="chunk-tag-group">
                          <span className="chunk-id-pill">Chunk #{index + 1}</span>
                          <span className="chunk-chars-tag">{src.length || src.text?.length || 0} chars</span>
                        </div>

                        <button
                          type="button"
                          className="btn-copy-chunk"
                          onClick={() => handleCopyChunk(src.text, src.chunkId || index)}
                          title="Copy context chunk"
                        >
                          {copiedChunkId === (src.chunkId || index) ? (
                            <>
                              <Check size={12} color="#10b981" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="chunk-body-pro">
                        {src.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        /* ====================================================
           TAB 2: DOCUMENT ANALYTICS
           ==================================================== */
        <div className="inspector-content">
          {!activeDocId ? (
            <div className="source-inspector-empty">
              <FileText className="empty-icon" size={32} />
              <h3>Select a Document</h3>
              <p>Upload or select a document from the left library to inspect reading analytics and complexity metrics.</p>
            </div>
          ) : loadingAnalytics ? (
            <div className="source-inspector-empty">
              <Loader2 className="spinner" size={32} />
              <p>Computing document reading metrics...</p>
            </div>
          ) : analytics ? (
            <>
              {/* Analytics Metric Cards Grid */}
              <div className="analytics-metrics-grid">
                <div className="metric-stat-card">
                  <div className="metric-icon-box time">
                    <Clock size={16} />
                  </div>
                  <div className="metric-num">{analytics.readingTimeMin} min</div>
                  <div className="metric-sub">Est. Read Time</div>
                </div>

                <div className="metric-stat-card">
                  <div className="metric-icon-box words">
                    <FileText size={16} />
                  </div>
                  <div className="metric-num">{analytics.wordCount.toLocaleString()}</div>
                  <div className="metric-sub">Total Words</div>
                </div>

                <div className="metric-stat-card">
                  <div className="metric-icon-box score">
                    <Award size={16} />
                  </div>
                  <div className="metric-num">{analytics.readabilityScore}/100</div>
                  <div className="metric-sub">Flesch Index</div>
                </div>
              </div>

              {/* Readability Meter Assessment */}
              <div className="inspector-section">
                <div className="section-title">
                  <Award size={13} />
                  <span>Readability Complexity Scale</span>
                </div>

                <div className="readability-card-pro">
                  <div className="readability-badge-row">
                    <span className="readability-tier-name">{analytics.readabilityGrade}</span>
                    <span className="readability-score-pill">{analytics.readabilityScore} / 100</span>
                  </div>

                  {/* Gradient Progress Bar */}
                  <div className="readability-bar-track">
                    <div 
                      className="readability-bar-fill" 
                      style={{ width: `${Math.min(100, Math.max(8, analytics.readabilityScore))}%` }} 
                    />
                  </div>

                  <div className="readability-scale-labels">
                    <span>Technical (0)</span>
                    <span>Standard (60)</span>
                    <span>Easy (100)</span>
                  </div>

                  <p className="intent-desc">
                    Calculated via Flesch Reading Ease assessing sentence length and average syllable density.
                  </p>
                </div>
              </div>

              {/* Key Topics & Entity Cloud */}
              <div className="inspector-section last">
                <div className="section-title">
                  <Tag size={13} />
                  <span>Key Topic Entities & Concepts</span>
                </div>

                <p className="topic-cloud-hint">
                  Click any topic to ask the AI assistant:
                </p>

                <div className="topics-tags-cloud">
                  {analytics.keyTopics?.map((topic, i) => (
                    <button
                      key={i}
                      type="button"
                      className="topic-tag-chip"
                      onClick={() => onAskTopic && onAskTopic(topic)}
                      title={`Ask about "${topic}"`}
                    >
                      <Sparkles size={11} className="chip-sparkle" />
                      <span>{topic}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="source-inspector-empty">
              <FileText className="empty-icon" size={28} />
              <p>No analytics available for this document.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
