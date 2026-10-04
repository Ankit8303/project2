import React, { useState, useEffect, useRef } from "react";
import { 
  X, Search, FileText, Loader2, BookOpen, Image, Music, Video, 
  Table, Code2, Play, Pause, RotateCcw, RotateCw, Volume2, 
  Copy, Check, Sparkles, Layers, ListFilter, Clock, ExternalLink, Globe 
} from "lucide-react";
import axios from "axios";

export default function DocumentPreviewModal({ 
  token, 
  documentId, 
  filename, 
  onClose, 
  highlightChunkId,
  initialTimeSec 
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("media"); // 'media' or 'chunks'
  const [copiedKey, setCopiedKey] = useState(null);

  // Audio & Video player state
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Data table state
  const [tableSearch, setTableSearch] = useState("");
  const [page, setPage] = useState(1);
  const rowsPerPage = 15;

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const mediaUrl = `${API_URL}/api/documents/${documentId}/media?token=${token}`;

  useEffect(() => {
    if (documentId) {
      fetchContent();
    }
  }, [documentId]);

  // Handle initial seek time if provided (e.g. from chat citation click)
  useEffect(() => {
    if (initialTimeSec != null && !loading) {
      seekTo(initialTimeSec);
    }
  }, [initialTimeSec, loading]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const fetchContent = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/documents/${documentId}/content`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
      // If it's a document or webpage and has no media preview, default to chunks tab
      if ((res.data.fileType === "document" || res.data.fileType === "webpage") && !res.data.hasMedia) {
        setActiveTab("chunks");
      } else {
        setActiveTab("media");
      }
    } catch (err) {
      console.error("Failed to load document content:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatSeconds = (sec) => {
    const total = Math.floor(sec || 0);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const seekTo = (sec) => {
    if (audioRef.current) {
      audioRef.current.currentTime = sec;
      audioRef.current.play();
      setIsPlaying(true);
    }
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const changeSpeed = (speed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) audioRef.current.playbackRate = speed;
    if (videoRef.current) videoRef.current.playbackRate = speed;
  };

  const chunks = data?.chunks || [];
  const fileType = data?.fileType || "document";
  const mediaMetadata = data?.mediaMetadata || {};

  const filteredChunks = chunks.filter(c => 
    !search || c.text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card doc-preview-modal modal-multimodal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="preview-modal-header">
          <div className="preview-title-group">
            <div className={`preview-type-badge badge-${fileType}`}>
              {fileType === "image" && <Image size={18} />}
              {fileType === "audio" && <Music size={18} />}
              {fileType === "video" && <Video size={18} />}
              {fileType === "data" && <Table size={18} />}
              {fileType === "code" && <Code2 size={18} />}
              {fileType === "document" && <FileText size={18} />}
              {fileType === "webpage" && <Globe size={18} />}
              <span>{fileType.toUpperCase()}</span>
            </div>
            <div>
              <h3>{data?.filename || filename || "Media Intelligence Inspector"}</h3>
              <span className="preview-meta">
                {chunks.length} semantic chunks • Multimodal AI Indexed
              </span>
            </div>
          </div>

          <div className="preview-header-tabs">
            <button 
              type="button" 
              className={`preview-tab-btn ${activeTab === "media" ? "active" : ""}`}
              onClick={() => setActiveTab("media")}
            >
              <span>Media Intelligence</span>
            </button>
            <button 
              type="button" 
              className={`preview-tab-btn ${activeTab === "chunks" ? "active" : ""}`}
              onClick={() => setActiveTab("chunks")}
            >
              <span>Semantic Chunks ({chunks.length})</span>
            </button>
          </div>

          <div className="preview-header-actions">
            <button type="button" className="close-btn" onClick={onClose} title="Close Preview">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="preview-modal-body">
          {loading ? (
            <div className="preview-loading">
              <Loader2 size={36} className="spinner icon-accent" />
              <p>Analyzing multimodal structure and loading media...</p>
            </div>
          ) : activeTab === "chunks" ? (
            /* Chunks View */
            <div className="preview-chunks-container">
              <div className="chunks-search-bar">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter semantic chunks by text..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="preview-chunks-list">
                {filteredChunks.length === 0 ? (
                  <div className="preview-empty">
                    <p>No matching chunks found.</p>
                  </div>
                ) : (
                  filteredChunks.map((chunk) => (
                    <div 
                      key={chunk.chunkId} 
                      className={`preview-chunk-item ${highlightChunkId == chunk.chunkId ? "highlighted" : ""}`}
                    >
                      <div className="preview-chunk-header">
                        <div className="chunk-label-group">
                          <span className="chunk-label">Chunk #{Number(chunk.chunkId) + 1}</span>
                          {chunk.timestamp && (
                            <span 
                              className="chunk-timestamp-pill"
                              onClick={() => {
                                setActiveTab("media");
                                if (chunk.startSec != null) seekTo(chunk.startSec);
                              }}
                              title="Jump to this timestamp in media player"
                            >
                              <Play size={10} /> {chunk.timestamp}
                            </span>
                          )}
                        </div>
                        <div className="chunk-actions">
                          <span className="chunk-chars">{chunk.length} chars</span>
                          <button
                            type="button"
                            className="chunk-copy-btn"
                            title="Copy chunk text"
                            onClick={() => handleCopy(chunk.text, `chunk-${chunk.chunkId}`)}
                          >
                            {copiedKey === `chunk-${chunk.chunkId}` ? <Check size={13} className="icon-success" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                      <div className="preview-chunk-text">
                        {chunk.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Media Intelligence View */
            <div className="multimodal-view-layout">
              {/* IMAGE VIEW */}
              {fileType === "image" && (
                <div className="image-intelligence-view">
                  <div className="image-preview-panel">
                    <div className="image-lightbox-wrapper">
                      <img src={mediaUrl} alt={filename} className="preview-image" />
                    </div>
                  </div>

                  <div className="image-insights-panel">
                    {/* Visual Overview */}
                    {mediaMetadata.visualReport?.overview && (
                      <div className="insight-card">
                        <div className="insight-card-header">
                          <Sparkles size={16} className="icon-accent" />
                          <h4>Visual Scene Overview</h4>
                        </div>
                        <p className="insight-card-body">{mediaMetadata.visualReport.overview}</p>
                      </div>
                    )}

                    {/* Extracted OCR */}
                    {mediaMetadata.visualReport?.extractedText && (
                      <div className="insight-card">
                        <div className="insight-card-header">
                          <FileText size={16} className="icon-accent" />
                          <h4>Extracted Text & OCR Data</h4>
                          <button 
                            type="button" 
                            className="mini-copy-btn"
                            onClick={() => handleCopy(mediaMetadata.visualReport.extractedText, "ocr")}
                          >
                            {copiedKey === "ocr" ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedKey === "ocr" ? "Copied" : "Copy OCR"}</span>
                          </button>
                        </div>
                        <pre className="insight-card-code">{mediaMetadata.visualReport.extractedText}</pre>
                      </div>
                    )}

                    {/* Charts & Diagrams Breakdown */}
                    {mediaMetadata.visualReport?.visualElements && (
                      <div className="insight-card">
                        <div className="insight-card-header">
                          <Layers size={16} className="icon-accent" />
                          <h4>Visual Elements, Charts & Structure</h4>
                        </div>
                        <div className="insight-card-body markdown-styled">
                          {mediaMetadata.visualReport.visualElements}
                        </div>
                      </div>
                    )}

                    {/* Key Insights */}
                    {mediaMetadata.visualReport?.keyInsights && (
                      <div className="insight-card">
                        <div className="insight-card-header">
                          <Check size={16} className="icon-accent" />
                          <h4>Key Insights & Inferences</h4>
                        </div>
                        <div className="insight-card-body markdown-styled">
                          {mediaMetadata.visualReport.keyInsights}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AUDIO VIEW */}
              {fileType === "audio" && (
                <div className="audio-intelligence-view">
                  {/* Audio Player Control Bar */}
                  <div className="audio-player-card">
                    <audio 
                      ref={audioRef}
                      src={mediaUrl}
                      onTimeUpdate={() => {
                        if (audioRef.current) {
                          setCurrentTime(audioRef.current.currentTime);
                          setDuration(audioRef.current.duration || 0);
                        }
                      }}
                      onEnded={() => setIsPlaying(false)}
                      style={{ display: "none" }}
                    />

                    <div className="audio-player-controls">
                      <button 
                        type="button" 
                        className="btn-play-large"
                        onClick={togglePlayAudio}
                      >
                        {isPlaying ? <Pause size={20} /> : <Play size={20} className="icon-play-offset" />}
                      </button>

                      <div className="audio-scrubber-group">
                        <div className="audio-time-label">
                          <span>{formatSeconds(currentTime)}</span>
                          <span>/</span>
                          <span>{formatSeconds(duration || mediaMetadata.duration)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={duration || mediaMetadata.duration || 100}
                          value={currentTime}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setCurrentTime(val);
                            if (audioRef.current) audioRef.current.currentTime = val;
                          }}
                          className="audio-timeline-slider"
                        />
                      </div>

                      <div className="audio-speed-selector">
                        {[1, 1.25, 1.5, 2].map(speed => (
                          <button
                            key={speed}
                            type="button"
                            className={`speed-pill ${playbackSpeed === speed ? "active" : ""}`}
                            onClick={() => changeSpeed(speed)}
                          >
                            {speed}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Summary & Interactive Timestamped Transcript */}
                  <div className="audio-content-split">
                    {/* Executive Summary */}
                    {mediaMetadata.audioSummary && (
                      <div className="insight-card audio-summary-card">
                        <div className="insight-card-header">
                          <Sparkles size={16} className="icon-accent" />
                          <h4>Audio Executive Summary & Action Items</h4>
                        </div>
                        <div className="insight-card-body markdown-styled">
                          {mediaMetadata.audioSummary}
                        </div>
                      </div>
                    )}

                    {/* Timestamped Transcript */}
                    <div className="insight-card audio-transcript-card">
                      <div className="insight-card-header">
                        <Clock size={16} className="icon-accent" />
                        <h4>Interactive Speech Transcript (Click timestamp to jump)</h4>
                      </div>
                      <div className="audio-segments-list">
                        {(mediaMetadata.segments || []).map((seg) => {
                          const isActive = currentTime >= seg.start && currentTime <= seg.end;
                          return (
                            <div 
                              key={seg.id} 
                              className={`audio-segment-row ${isActive ? "active-segment" : ""}`}
                              onClick={() => seekTo(seg.start)}
                            >
                              <span className="segment-timestamp-badge">
                                <Play size={10} /> {seg.timestamp}
                              </span>
                              <span className="segment-text">{seg.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIDEO VIEW */}
              {fileType === "video" && (() => {
                const ytUrl = mediaMetadata.sourceUrl || mediaMetadata.url || data?.filename || "";
                const ytMatch = ytUrl.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/)([^&?#/]+)/);
                const ytVideoId = ytMatch ? ytMatch[1] : null;

                const rawScenes = (mediaMetadata.scenes && mediaMetadata.scenes.length > 0)
                  ? mediaMetadata.scenes
                  : chunks
                      .filter(c => c.timestamp || (c.text && c.text.includes("[") && c.text.includes("]")))
                      .map((c, idx) => {
                        const match = c.text.match(/\[(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\]\s*(?:(?:\[.*?\]|\*\*.*?\*\*)\s*)?(.*?):\s*([\s\S]*)/);
                        if (match) {
                          const p1 = match[1].split(":").map(Number);
                          const sSec = (p1[0] * 60) + p1[1];
                          return {
                            id: idx,
                            timestamp: match[2] ? `[${match[1]} - ${match[2]}]` : `[${match[1]}]`,
                            startSec: c.startSec ?? sSec,
                            title: match[3].replace(/\*\*/g, "").replace(/\[.*?\]/, "").trim() || `Scene ${idx + 1}`,
                            description: match[4].replace(/\n/g, " ").trim()
                          };
                        }
                        return {
                          id: idx,
                          timestamp: c.timestamp || `[Scene ${idx + 1}]`,
                          startSec: c.startSec ?? (idx * 30),
                          title: `Scene Milestone ${idx + 1}`,
                          description: c.text.slice(0, 160)
                        };
                      });

                const filteredScenes = rawScenes.filter(s =>
                  !search ||
                  s.title.toLowerCase().includes(search.toLowerCase()) ||
                  s.description.toLowerCase().includes(search.toLowerCase()) ||
                  s.timestamp.toLowerCase().includes(search.toLowerCase())
                );

                const handleSeekVideo = (sec) => {
                  setCurrentTime(sec);
                  seekTo(sec);
                };

                return (
                  <div className="video-intelligence-view">
                    {/* Video Player Display */}
                    <div className="video-player-container">
                      {ytVideoId ? (
                        <div className="youtube-player-frame-wrapper">
                          <iframe
                            key={`yt-${currentTime}`}
                            src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?enablejsapi=1&autoplay=${currentTime > 0 ? 1 : 0}&start=${Math.floor(currentTime)}`}
                            title={data?.filename || "YouTube Video"}
                            className="preview-video-element youtube-iframe-element"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <video 
                          ref={videoRef}
                          src={mediaUrl}
                          controls
                          className="preview-video-element"
                          onTimeUpdate={() => {
                            if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                          }}
                        />
                      )}
                    </div>

                    {/* Timeline & Analysis Insights Grid */}
                    <div className="video-details-container">
                      {/* Chronological Scene Timeline */}
                      <div className="insight-card video-timeline-card">
                        <div className="insight-card-header">
                          <div className="header-left-title">
                            <Video size={16} className="icon-accent" />
                            <h4>Chronological Scene Timeline</h4>
                            <span className="scene-count-badge">{filteredScenes.length} scenes</span>
                          </div>

                          {ytVideoId && (
                            <a 
                              href={`https://www.youtube.com/watch?v=${ytVideoId}`}
                              target="_blank" 
                              rel="noreferrer" 
                              className="btn-external-link"
                              title="Open on YouTube"
                            >
                              <span>YouTube</span>
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>

                        {filteredScenes.length === 0 ? (
                          <div className="empty-scenes-prompt">
                            <Clock size={24} className="icon-muted" />
                            <p>No timestamped scenes match your search query.</p>
                          </div>
                        ) : (
                          <div className="video-scenes-grid">
                            {filteredScenes.map((scene) => {
                              const isActive = currentTime >= scene.startSec && currentTime <= (scene.endSec || (scene.startSec + 45));
                              return (
                                <div 
                                  key={scene.id} 
                                  className={`video-scene-card ${isActive ? "active-scene" : ""}`}
                                  onClick={() => handleSeekVideo(scene.startSec)}
                                  title={`Click to jump to ${scene.timestamp}`}
                                >
                                  <div className="scene-card-top">
                                    <span className="scene-time-pill">
                                      <Play size={10} className="icon-play-pill" /> 
                                      {scene.timestamp}
                                    </span>
                                    <strong className="scene-title">{scene.title}</strong>
                                  </div>
                                  <p className="scene-desc">{scene.description}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Video Overview & Highlights */}
                      {(mediaMetadata.videoOverview || mediaMetadata.takeaways) && (
                        <div className="insight-card video-overview-card">
                          <div className="insight-card-header">
                            <Sparkles size={16} className="icon-accent" />
                            <h4>AI Video Overview & Takeaways</h4>
                          </div>
                          {mediaMetadata.videoOverview && (
                            <p className="insight-card-body">{mediaMetadata.videoOverview}</p>
                          )}
                          {mediaMetadata.takeaways && (
                            <div className="video-takeaways-sub">
                              <h5>Key Takeaways & Findings</h5>
                              <div className="markdown-styled">{mediaMetadata.takeaways}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* DATA / CSV VIEW */}
              {fileType === "data" && (
                <div className="data-intelligence-view">
                  <div className="data-table-card">
                    <div className="data-table-toolbar">
                      <div className="table-stats-pill">
                        <strong>{mediaMetadata.totalRows || 0}</strong> records • <strong>{mediaMetadata.columnCount || 0}</strong> columns
                      </div>

                      <div className="table-search-box">
                        <Search size={14} className="search-icon" />
                        <input
                          type="text"
                          placeholder="Search in dataset records..."
                          value={tableSearch}
                          onChange={(e) => {
                            setTableSearch(e.target.value);
                            setPage(1);
                          }}
                        />
                      </div>
                    </div>

                    <div className="data-grid-scroll">
                      <table className="data-grid-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            {(mediaMetadata.headers || []).map((h, i) => (
                              <th key={i}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {((mediaMetadata.rows || []).filter(row => 
                            !tableSearch || row.some(cell => String(cell).toLowerCase().includes(tableSearch.toLowerCase()))
                          )).slice((page - 1) * rowsPerPage, page * rowsPerPage).map((row, rIdx) => (
                            <tr key={rIdx}>
                              <td className="row-num">{((page - 1) * rowsPerPage) + rIdx + 1}</td>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="data-table-pagination">
                      <span>Page {page} of {Math.max(1, Math.ceil((mediaMetadata.rows || []).length / rowsPerPage))}</span>
                      <div className="pagination-buttons">
                        <button 
                          type="button" 
                          disabled={page === 1}
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                        >
                          Prev
                        </button>
                        <button 
                          type="button" 
                          disabled={page * rowsPerPage >= (mediaMetadata.rows || []).length}
                          onClick={() => setPage(p => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CODE VIEW */}
              {fileType === "code" && (
                <div className="code-intelligence-view">
                  <div className="insight-card">
                    <div className="insight-card-header">
                      <Code2 size={16} className="icon-accent" />
                      <h4>Source Code ({mediaMetadata.language?.toUpperCase() || "CODE"})</h4>
                      <span className="code-lines-badge">{mediaMetadata.lineCount || 0} lines</span>
                    </div>
                    <div className="preview-chunks-list">
                      {chunks.map((c, i) => (
                        <div key={i} className="preview-chunk-item">
                          <pre className="code-block-content">{c.text}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* DOCUMENT VIEW (PDF, TXT, MD) */}
              {fileType === "document" && (
                <div className="document-intelligence-view">
                  <div className="insight-card">
                    <div className="insight-card-header">
                      <FileText size={16} className="icon-accent" />
                      <h4>Document Text & Semantic Analysis</h4>
                    </div>
                    <div className="preview-chunks-list">
                      {chunks.map((c) => (
                        <div key={c.chunkId} className="preview-chunk-item">
                          <div className="preview-chunk-header">
                            <span className="chunk-label">Section #{Number(c.chunkId) + 1}</span>
                            <span className="chunk-chars">{c.length} chars</span>
                          </div>
                          <div className="preview-chunk-text">{c.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* WEBPAGE VIEW */}
              {fileType === "webpage" && (
                <div className="webpage-intelligence-view">
                  <div className="insight-card">
                    <div className="insight-card-header">
                      <div className="card-header-left">
                        <Globe size={16} className="icon-accent" />
                        <h4>Webpage Content & Extracted Articles</h4>
                      </div>
                      {mediaMetadata?.sourceUrl && (
                        <a 
                          href={mediaMetadata.sourceUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="external-link-btn"
                          title="Open live URL in new tab"
                        >
                          <ExternalLink size={12} />
                          <span>Open Live URL</span>
                        </a>
                      )}
                    </div>
                    {mediaMetadata?.description && (
                      <p className="insight-card-body web-meta-desc">
                        {mediaMetadata.description}
                      </p>
                    )}
                    <div className="preview-chunks-list">
                      {chunks.map((c) => (
                        <div key={c.chunkId} className="preview-chunk-item">
                          <div className="preview-chunk-header">
                            <span className="chunk-label">Section #{Number(c.chunkId) + 1}</span>
                            <span className="chunk-chars">{c.length} chars</span>
                          </div>
                          <div className="preview-chunk-text">{c.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
