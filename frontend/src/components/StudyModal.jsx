import React, { useState, useEffect, useCallback } from "react";
import { 
  X, Sparkles, HelpCircle, BookOpen, CheckCircle2, XCircle, 
  ChevronLeft, ChevronRight, RotateCw, Loader2, Volume2, VolumeX, 
  Flame, Award, Shuffle, ThumbsUp, ThumbsDown, Copy, Check, 
  ArrowRight, FileText, Zap
} from "lucide-react";
import axios from "axios";

export default function StudyModal({ token, documentId, filename, onClose }) {
  const [mode, setMode] = useState("quiz"); // "quiz", "flashcards", "cheatsheet"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // --- Quiz State ---
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [highestStreak, setHighestStreak] = useState(0);
  const [quizViewMode, setQuizViewMode] = useState("step"); // "step" (1-by-1) or "all"
  
  // --- Flashcards State ---
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredCards, setMasteredCards] = useState(new Set());
  const [learningCards, setLearningCards] = useState(new Set());
  
  // --- Cheat Sheet State ---
  const [cheatsheetData, setCheatsheetData] = useState([]);
  const [copiedCheat, setCopiedCheat] = useState(false);

  // Audio TTS State
  const [isSpeaking, setIsSpeaking] = useState(false);

  const API_URL = "http://localhost:5000";

  useEffect(() => {
    if (documentId) {
      loadStudyData(mode);
    }
  }, [documentId, mode]);

  // Clean up audio speech synthesis on unmount
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const loadStudyData = async (type) => {
    try {
      setLoading(true);
      setError("");
      setUserAnswers({});
      setQuizScore(0);
      setStreak(0);
      setCurrentQIndex(0);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setMasteredCards(new Set());
      setLearningCards(new Set());

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }

      const res = await axios.post(
        `${API_URL}/api/documents/${documentId}/study`,
        { type },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (type === "quiz") {
        setQuizQuestions(res.data.data || []);
      } else if (type === "flashcards") {
        setFlashcards(res.data.data || []);
      } else if (type === "cheatsheet") {
        setCheatsheetData(res.data.data || []);
      }
    } catch (err) {
      console.error("Study generation failed:", err);
      setError(
        err.response?.data?.details || 
        err.response?.data?.error || 
        "Failed to generate study materials. Please make sure the document is active."
      );
    } finally {
      setLoading(false);
    }
  };

  // --- Speech Synthesis Helper ---
  const handleSpeakText = (text) => {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const cleanText = (text || "").replace(/[*#_`~>]/g, "").trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const naturalVoice = voices.find(v => v.lang.startsWith("en") && !v.name.includes("Zira")) || voices[0];
      if (naturalVoice) utterance.voice = naturalVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (e) => {
      console.warn("TTS error:", e);
      setIsSpeaking(false);
    };

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
  };

  // --- Quiz Logic ---
  const handleSelectAnswer = (qIndex, optionIndex) => {
    if (userAnswers[qIndex] !== undefined) return;
    const isCorrect = optionIndex === quizQuestions[qIndex].answerIndex;
    
    setUserAnswers(prev => ({
      ...prev,
      [qIndex]: optionIndex
    }));

    if (isCorrect) {
      setQuizScore(prev => prev + 1);
      setStreak(prev => {
        const next = prev + 1;
        if (next > highestStreak) setHighestStreak(next);
        return next;
      });
    } else {
      setStreak(0);
    }
  };

  // --- Flashcard Logic ---
  const handleNextCard = useCallback(() => {
    setIsFlipped(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setCurrentCardIndex(prev => (prev + 1) % flashcards.length);
  }, [flashcards.length]);

  const handlePrevCard = useCallback(() => {
    setIsFlipped(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setCurrentCardIndex(prev => (prev - 1 + flashcards.length) % flashcards.length);
  }, [flashcards.length]);

  const handleMarkMastered = (idx) => {
    setMasteredCards(prev => new Set(prev).add(idx));
    setLearningCards(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
    handleNextCard();
  };

  const handleMarkLearning = (idx) => {
    setLearningCards(prev => new Set(prev).add(idx));
    setMasteredCards(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
    handleNextCard();
  };

  const handleShuffleCards = () => {
    setIsFlipped(false);
    setFlashcards(prev => [...prev].sort(() => Math.random() - 0.5));
    setCurrentCardIndex(0);
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (loading || error) return;

      if (mode === "flashcards" && flashcards.length > 0) {
        if (e.code === "Space") {
          e.preventDefault();
          setIsFlipped(prev => !prev);
        } else if (e.code === "ArrowRight") {
          e.preventDefault();
          handleNextCard();
        } else if (e.code === "ArrowLeft") {
          e.preventDefault();
          handlePrevCard();
        }
      } else if (mode === "quiz" && quizViewMode === "step" && quizQuestions.length > 0) {
        const key = e.key.toUpperCase();
        if (["1", "2", "3", "4"].includes(key)) {
          handleSelectAnswer(currentQIndex, parseInt(key) - 1);
        } else if (["A", "B", "C", "D"].includes(key)) {
          const optIdx = key.charCodeAt(0) - 65;
          handleSelectAnswer(currentQIndex, optIdx);
        } else if (e.code === "ArrowRight" && currentQIndex < quizQuestions.length - 1) {
          setCurrentQIndex(prev => prev + 1);
        } else if (e.code === "ArrowLeft" && currentQIndex > 0) {
          setCurrentQIndex(prev => prev - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, flashcards, quizQuestions, currentQIndex, quizViewMode, loading, error, handleNextCard, handlePrevCard]);

  // Copy Cheat Sheet
  const handleCopyCheatSheet = () => {
    let text = `# ${filename || "Document"} - Study Cheat Sheet\n\n`;
    cheatsheetData.forEach(item => {
      text += `### ${item.title}\n`;
      item.takeaways.forEach(point => {
        text += `- ${point}\n`;
      });
      text += `\n`;
    });
    navigator.clipboard.writeText(text);
    setCopiedCheat(true);
    setTimeout(() => setCopiedCheat(false), 2000);
  };

  const totalAnswered = Object.keys(userAnswers).length;
  const isQuizComplete = quizQuestions.length > 0 && totalAnswered === quizQuestions.length;
  const scorePercent = quizQuestions.length > 0 ? Math.round((quizScore / quizQuestions.length) * 100) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card study-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="study-pro-header">
          <div className="study-pro-title-group">
            <div className="study-header-icon-box">
              <Zap size={22} className="study-header-sparkle" />
            </div>
            <div>
              <div className="study-badge-row">
                <h3>AI Study & Review Center</h3>
                <span className="study-live-badge">Interactive</span>
              </div>
              <p className="study-pro-subtitle">{filename || "Document Knowledge Base"}</p>
            </div>
          </div>

          <div className="study-pro-controls">
            {/* 3-Mode Tab Switcher */}
            <div className="study-pill-tabs">
              <button
                type="button"
                className={`study-pill-btn ${mode === "quiz" ? "active" : ""}`}
                onClick={() => setMode("quiz")}
              >
                <HelpCircle size={14} />
                <span>Quiz Mastery</span>
              </button>
              
              <button
                type="button"
                className={`study-pill-btn ${mode === "flashcards" ? "active" : ""}`}
                onClick={() => setMode("flashcards")}
              >
                <BookOpen size={14} />
                <span>3D Flashcards</span>
              </button>

              <button
                type="button"
                className={`study-pill-btn ${mode === "cheatsheet" ? "active" : ""}`}
                onClick={() => setMode("cheatsheet")}
              >
                <FileText size={14} />
                <span>Cheat Sheet</span>
              </button>
            </div>

            {/* Close Button */}
            <button type="button" className="close-btn" onClick={onClose} title="Close Center">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="study-pro-body">
          {loading ? (
            <div className="study-synthesizing-state">
              <div className="synthesizer-orb">
                <Loader2 size={44} className="spinner" />
              </div>
              <h4>Synthesizing Document Intelligence...</h4>
              <p>Extracting high-yield concepts, crafting quiz questions, and formatting flashcards.</p>
            </div>
          ) : error ? (
            <div className="study-pro-error">
              <XCircle size={36} />
              <h4>Unable to load study materials</h4>
              <p>{error}</p>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={() => loadStudyData(mode)}
              >
                <RotateCw size={14} />
                <span>Retry Generation</span>
              </button>
            </div>
          ) : mode === "quiz" ? (
            /* ====================================================
               QUIZ MASTERY VIEW
               ==================================================== */
            <div className="quiz-mastery-wrap">
              {/* Top Stats Bar */}
              <div className="quiz-stats-header">
                <div className="quiz-streak-pill" title="Consecutive correct answers">
                  <Flame size={16} className={streak > 0 ? "flame-hot" : "flame-cool"} />
                  <span>Streak: <strong>{streak}</strong></span>
                  {highestStreak > 1 && <span className="best-streak">(Best: {highestStreak})</span>}
                </div>

                <div className="quiz-score-meter">
                  <span className="meter-label">Progress: {totalAnswered} / {quizQuestions.length}</span>
                  <div className="meter-track">
                    <div 
                      className="meter-fill" 
                      style={{ width: `${(totalAnswered / (quizQuestions.length || 1)) * 100}%` }} 
                    />
                  </div>
                </div>

                <div className="quiz-header-actions-group">
                  <button
                    type="button"
                    className="btn-mode-toggle"
                    onClick={() => setQuizViewMode(prev => prev === "step" ? "all" : "step")}
                    title={quizViewMode === "step" ? "View all questions together" : "View step-by-step card mode"}
                  >
                    {quizViewMode === "step" ? "View All List" : "Step Flow"}
                  </button>

                  <button
                    type="button"
                    className="btn-study-refresh"
                    onClick={() => loadStudyData("quiz")}
                    title="Generate New Question Set"
                  >
                    <RotateCw size={13} />
                    <span>New Set</span>
                  </button>
                </div>
              </div>

              {/* Completion Banner */}
              {isQuizComplete && (
                <div className="quiz-trophy-banner">
                  <div className="trophy-icon-wrap">
                    <Award size={36} />
                  </div>
                  <div className="trophy-details">
                    <h4>
                      {scorePercent === 100 ? "🏆 Perfect Mastery! 100% Score" :
                       scorePercent >= 80 ? "🌟 Outstanding Comprehension!" :
                       scorePercent >= 60 ? "👍 Solid Understanding!" : "📚 Good Effort! Needs Review"}
                    </h4>
                    <p>You scored <strong>{quizScore} out of {quizQuestions.length} ({scorePercent}%)</strong> on this document quiz.</p>
                  </div>
                  <button 
                    type="button" 
                    className="btn-retake-quiz"
                    onClick={() => {
                      setUserAnswers({});
                      setQuizScore(0);
                      setStreak(0);
                      setCurrentQIndex(0);
                    }}
                  >
                    <RotateCw size={13} />
                    <span>Retake Quiz</span>
                  </button>
                </div>
              )}

              {/* Step-by-Step Card Flow Mode */}
              {quizViewMode === "step" && quizQuestions.length > 0 && (
                <div className="quiz-step-viewport">
                  {/* Question Navigator Dots */}
                  <div className="quiz-dots-nav">
                    {quizQuestions.map((_, idx) => {
                      const isAns = userAnswers[idx] !== undefined;
                      const isRight = isAns && userAnswers[idx] === quizQuestions[idx].answerIndex;
                      const isCurrent = idx === currentQIndex;

                      return (
                        <button
                          key={idx}
                          type="button"
                          className={`q-dot ${isCurrent ? "current" : ""} ${isAns ? (isRight ? "right" : "wrong") : ""}`}
                          onClick={() => setCurrentQIndex(idx)}
                          title={`Go to Question ${idx + 1}`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Card */}
                  {(() => {
                    const q = quizQuestions[currentQIndex];
                    if (!q) return null;
                    const hasAnswered = userAnswers[currentQIndex] !== undefined;
                    const selected = userAnswers[currentQIndex];
                    const isCorrect = selected === q.answerIndex;

                    return (
                      <div className="quiz-card-step">
                        <div className="card-step-top">
                          <div className="step-q-badge">Question {currentQIndex + 1} of {quizQuestions.length}</div>
                          <div className="step-actions">
                            <button
                              type="button"
                              className={`btn-tts-speaker ${isSpeaking ? "active" : ""}`}
                              onClick={() => handleSpeakText(`${q.question}. ${q.options.join(". ")}`)}
                              title="Listen to question"
                            >
                              {isSpeaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
                              <span>{isSpeaking ? "Mute" : "Read Aloud"}</span>
                            </button>
                          </div>
                        </div>

                        <h3 className="card-step-question">{q.question}</h3>

                        {/* Interactive Options */}
                        <div className="step-options-grid">
                          {q.options.map((option, optIdx) => {
                            let optClass = "step-option-btn";
                            if (hasAnswered) {
                              if (optIdx === q.answerIndex) optClass += " is-correct";
                              else if (optIdx === selected) optClass += " is-wrong";
                              else optClass += " is-dimmed";
                            }

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                className={optClass}
                                onClick={() => handleSelectAnswer(currentQIndex, optIdx)}
                                disabled={hasAnswered}
                              >
                                <span className="step-opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                                <span className="step-opt-text">{option}</span>
                                {hasAnswered && optIdx === q.answerIndex && (
                                  <CheckCircle2 size={18} className="step-result-icon right" />
                                )}
                                {hasAnswered && optIdx === selected && !isCorrect && (
                                  <XCircle size={18} className="step-result-icon wrong" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Feedback & Explanation */}
                        {hasAnswered && (
                          <div className={`step-explanation-box ${isCorrect ? "exp-success" : "exp-failure"}`}>
                            <div className="exp-title">
                              {isCorrect ? "✨ Spot on! Excellent answer." : "💡 Here's the key concept:"}
                            </div>
                            <p>{q.explanation}</p>
                          </div>
                        )}

                        {/* Navigation Footer */}
                        <div className="card-step-footer">
                          <button
                            type="button"
                            className="btn-step-nav"
                            disabled={currentQIndex === 0}
                            onClick={() => setCurrentQIndex(prev => prev - 1)}
                          >
                            <ChevronLeft size={16} />
                            <span>Previous</span>
                          </button>

                          <span className="step-hint-text">
                            Press <strong>A, B, C, D</strong> or <strong>1, 2, 3, 4</strong> to answer
                          </span>

                          <button
                            type="button"
                            className="btn-step-nav next"
                            disabled={currentQIndex === quizQuestions.length - 1}
                            onClick={() => setCurrentQIndex(prev => prev + 1)}
                          >
                            <span>Next</span>
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* All-in-One List View */}
              {quizViewMode === "all" && (
                <div className="quiz-list-viewport">
                  {quizQuestions.map((q, qIndex) => {
                    const hasAnswered = userAnswers[qIndex] !== undefined;
                    const selected = userAnswers[qIndex];
                    const isCorrect = selected === q.answerIndex;

                    return (
                      <div key={qIndex} className="quiz-card-item">
                        <div className="quiz-item-header">
                          <span className="q-badge">Question {qIndex + 1}</span>
                        </div>
                        <h4 className="quiz-item-q">{q.question}</h4>

                        <div className="step-options-grid">
                          {q.options.map((option, optIdx) => {
                            let optClass = "step-option-btn";
                            if (hasAnswered) {
                              if (optIdx === q.answerIndex) optClass += " is-correct";
                              else if (optIdx === selected) optClass += " is-wrong";
                              else optClass += " is-dimmed";
                            }

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                className={optClass}
                                onClick={() => handleSelectAnswer(qIndex, optIdx)}
                                disabled={hasAnswered}
                              >
                                <span className="step-opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                                <span className="step-opt-text">{option}</span>
                                {hasAnswered && optIdx === q.answerIndex && (
                                  <CheckCircle2 size={16} className="step-result-icon right" />
                                )}
                                {hasAnswered && optIdx === selected && !isCorrect && (
                                  <XCircle size={16} className="step-result-icon wrong" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {hasAnswered && (
                          <div className={`step-explanation-box ${isCorrect ? "exp-success" : "exp-failure"}`}>
                            <div className="exp-title">
                              {isCorrect ? "✅ Correct" : "❌ Explanation"}
                            </div>
                            <p>{q.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : mode === "flashcards" ? (
            /* ====================================================
               3D INTERACTIVE FLASHCARDS VIEW
               ==================================================== */
            <div className="flashcards-mastery-wrap">
              {/* Flashcard Stats Bar */}
              <div className="fc-top-bar">
                <div className="fc-mastery-status">
                  <span className="mastery-pill mastered">
                    <ThumbsUp size={12} /> {masteredCards.size} Mastered
                  </span>
                  <span className="mastery-pill learning">
                    <ThumbsDown size={12} /> {learningCards.size} In Progress
                  </span>
                </div>

                <div className="fc-actions-right">
                  <button 
                    type="button" 
                    className="fc-tool-btn" 
                    onClick={handleShuffleCards}
                    title="Shuffle Cards Order"
                  >
                    <Shuffle size={13} />
                    <span>Shuffle</span>
                  </button>

                  <button 
                    type="button" 
                    className="fc-tool-btn" 
                    onClick={() => loadStudyData("flashcards")}
                    title="Generate New Flashcards"
                  >
                    <RotateCw size={13} />
                    <span>Regenerate</span>
                  </button>
                </div>
              </div>

              {/* 3D Flipping Card Stage */}
              {flashcards.length > 0 && (
                <div className="fc-stage">
                  <div className="fc-counter-row">
                    <span className="fc-counter-badge">
                      Card {currentCardIndex + 1} of {flashcards.length}
                    </span>
                    <span className="fc-keyhint">
                      Press <strong>Space</strong> to Flip • <strong>← / →</strong> for Cards
                    </span>
                  </div>

                  <div 
                    className={`fc-3d-card ${isFlipped ? "is-flipped" : ""}`}
                    onClick={() => setIsFlipped(prev => !prev)}
                  >
                    <div className="fc-3d-inner">
                      {/* FRONT FACE */}
                      <div className="fc-face fc-front">
                        <div className="fc-card-top">
                          <span className="fc-tag-badge">
                            {flashcards[currentCardIndex]?.category || "Core Concept"}
                          </span>
                          <button
                            type="button"
                            className="fc-audio-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSpeakText(flashcards[currentCardIndex]?.front);
                            }}
                            title="Read question aloud"
                          >
                            <Volume2 size={16} />
                          </button>
                        </div>

                        <div className="fc-front-content">
                          <h2>{flashcards[currentCardIndex]?.front}</h2>
                        </div>

                        <div className="fc-card-bottom">
                          <span className="fc-flip-callout">
                            <RotateCw size={13} /> Click or Space to flip answer
                          </span>
                        </div>
                      </div>

                      {/* BACK FACE */}
                      <div className="fc-face fc-back">
                        <div className="fc-card-top">
                          <span className="fc-tag-badge answer">Definition & Takeaway</span>
                          <button
                            type="button"
                            className="fc-audio-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSpeakText(flashcards[currentCardIndex]?.back);
                            }}
                            title="Read answer aloud"
                          >
                            <Volume2 size={16} />
                          </button>
                        </div>

                        <div className="fc-back-content">
                          <p>{flashcards[currentCardIndex]?.back}</p>
                        </div>

                        <div className="fc-card-bottom">
                          <span className="fc-flip-callout">
                            <RotateCw size={13} /> Click to flip back
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rating & Navigation Controls */}
                  <div className="fc-bottom-controls">
                    <div className="fc-nav-arrows">
                      <button 
                        type="button" 
                        className="fc-arrow-btn" 
                        onClick={handlePrevCard}
                        title="Previous Card (Left Arrow)"
                      >
                        <ChevronLeft size={18} />
                      </button>
                    </div>

                    {/* Self-Rating Mastery Buttons */}
                    <div className="fc-rating-buttons">
                      <button
                        type="button"
                        className={`btn-rate-learning ${learningCards.has(currentCardIndex) ? "selected" : ""}`}
                        onClick={() => handleMarkLearning(currentCardIndex)}
                        title="Flag as needing more practice"
                      >
                        <ThumbsDown size={14} />
                        <span>Still Learning</span>
                      </button>

                      <button
                        type="button"
                        className="btn-flip-primary"
                        onClick={() => setIsFlipped(prev => !prev)}
                      >
                        <RotateCw size={14} />
                        <span>{isFlipped ? "Show Question" : "Reveal Answer"}</span>
                      </button>

                      <button
                        type="button"
                        className={`btn-rate-mastered ${masteredCards.has(currentCardIndex) ? "selected" : ""}`}
                        onClick={() => handleMarkMastered(currentCardIndex)}
                        title="Mark concept as mastered"
                      >
                        <ThumbsUp size={14} />
                        <span>Got It!</span>
                      </button>
                    </div>

                    <div className="fc-nav-arrows">
                      <button 
                        type="button" 
                        className="fc-arrow-btn" 
                        onClick={handleNextCard}
                        title="Next Card (Right Arrow)"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ====================================================
               SMART CHEAT SHEET VIEW
               ==================================================== */
            <div className="cheatsheet-mastery-wrap">
              <div className="cs-top-bar">
                <div className="cs-header-info">
                  <h4>High-Yield Executive Summary & Core Rules</h4>
                  <p>Synthesized facts extracted directly from document context.</p>
                </div>

                <div className="cs-actions">
                  <button
                    type="button"
                    className="btn-copy-cheat"
                    onClick={handleCopyCheatSheet}
                  >
                    {copiedCheat ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedCheat ? "Copied to Clipboard!" : "Copy Cheat Sheet"}</span>
                  </button>

                  <button
                    type="button"
                    className="fc-tool-btn"
                    onClick={() => loadStudyData("cheatsheet")}
                  >
                    <RotateCw size={13} />
                    <span>Regenerate</span>
                  </button>
                </div>
              </div>

              {/* Cheat Sheet Cards Grid */}
              <div className="cs-cards-grid">
                {cheatsheetData.map((item, idx) => (
                  <div key={idx} className="cs-card">
                    <div className="cs-card-header">
                      <span className="cs-idx-badge">0{idx + 1}</span>
                      <h4 className="cs-card-title">{item.title}</h4>
                      {item.importance && (
                        <span className="cs-importance-tag">{item.importance}</span>
                      )}
                    </div>

                    <ul className="cs-bullets-list">
                      {item.takeaways.map((point, pIdx) => (
                        <li key={pIdx}>
                          <ArrowRight size={13} className="bullet-arrow" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
