import React, { useState, useRef, useEffect } from "react";
import { 
  UploadCloud, FileText, CheckCircle2, Loader2, Sparkles, AlertCircle, 
  Trash2, Search, Eye, GitCompare, CheckSquare, Square,
  Image, Music, Video, Table, Code2, Film, Mic, Sparkle, Globe, Link, ArrowRight, X, Filter
} from "lucide-react";
import axios from "axios";

export default function DocumentManager({ 
  token, 
  activeDocId, 
  setActiveDocId, 
  onOpenPreview, 
  onOpenStudy, 
  onCompareDocs 
}) {
  const [documents, setDocuments] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle, uploading, processing, success, error
  const [statusMessage, setStatusMessage] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [ingestMode, setIngestMode] = useState("file"); // "file" or "url"
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

  // Fetch documents list on mount
  useEffect(() => {
    if (token) {
      fetchDocuments();
    }
  }, [token]);

  const fetchDocuments = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const docs = response.data.documents || [];
      setDocuments(docs);
      // Automatically select the most recently uploaded document if none selected
      if (docs.length > 0 && !activeDocId) {
        setActiveDocId(docs[0].id);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  };

  const getMediaMeta = (docOrFilename) => {
    const filename = typeof docOrFilename === "string" ? docOrFilename : (docOrFilename?.filename || "");
    const fileType = typeof docOrFilename === "object" ? docOrFilename?.fileType : null;
    const ext = filename.split(".").pop().toLowerCase();

    if (fileType === "image" || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext)) {
      return { type: "image", label: ext.toUpperCase(), badgeClass: "badge-image", Icon: Image };
    }
    if (fileType === "audio" || ["mp3", "wav", "m4a", "ogg", "aac", "flac"].includes(ext)) {
      return { type: "audio", label: ext.toUpperCase(), badgeClass: "badge-audio", Icon: Music };
    }
    if (fileType === "video" || ["mp4", "webm", "mov", "mkv", "avi", "3gp"].includes(ext)) {
      return { type: "video", label: ext.toUpperCase(), badgeClass: "badge-video", Icon: Video };
    }
    if (fileType === "data" || ["csv", "tsv", "json"].includes(ext)) {
      return { type: "data", label: ext.toUpperCase(), badgeClass: "badge-data", Icon: Table };
    }
    if (fileType === "code" || ["js", "jsx", "ts", "tsx", "py", "html", "css", "sql", "java", "cpp", "c", "rs", "go"].includes(ext)) {
      return { type: "code", label: ext.toUpperCase(), badgeClass: "badge-code", Icon: Code2 };
    }
    if (fileType === "webpage") {
      return { type: "webpage", label: "WEB", badgeClass: "badge-web", Icon: Globe };
    }
    return { 
      type: "document", 
      label: ext.toUpperCase() === "MD" ? "MD" : ext.toUpperCase() === "TXT" ? "TXT" : "PDF", 
      badgeClass: "badge-doc", 
      Icon: FileText 
    };
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const uploadFile = async (file) => {
    const meta = getMediaMeta(file.name);
    setUploadStatus("uploading");
    setStatusMessage(`Uploading ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentId", Math.random().toString(36).substring(7));

    // Adaptive processing stages based on modality
    let statusSequence = [];
    if (meta.type === "audio") {
      statusSequence = [
        { delay: 1200, status: "processing", msg: "Transcribing speech & timestamps (Groq Whisper)..." },
        { delay: 3500, status: "processing", msg: "Generating executive audio summary & takeaways..." },
        { delay: 6000, status: "processing", msg: "Indexing timestamped chunks into vector memory..." }
      ];
    } else if (meta.type === "video") {
      statusSequence = [
        { delay: 1500, status: "processing", msg: "Analyzing scene chronology & dialogue (Gemini Vision)..." },
        { delay: 4500, status: "processing", msg: "Extracting on-screen text, slides & milestones..." },
        { delay: 7500, status: "processing", msg: "Indexing video scenes into vector memory..." }
      ];
    } else if (meta.type === "image") {
      statusSequence = [
        { delay: 1200, status: "processing", msg: "Running deep OCR & visual scene comprehension (Gemini)..." },
        { delay: 3000, status: "processing", msg: "Extracting charts, diagrams & key insights..." },
        { delay: 5000, status: "processing", msg: "Indexing visual knowledge into vector memory..." }
      ];
    } else if (meta.type === "data") {
      statusSequence = [
        { delay: 1000, status: "processing", msg: "Parsing dataset schema & columns..." },
        { delay: 2200, status: "processing", msg: "Generating statistical summaries & table preview..." },
        { delay: 3800, status: "processing", msg: "Indexing dataset records..." }
      ];
    } else {
      statusSequence = [
        { delay: 1000, status: "processing", msg: "Extracting document contents..." },
        { delay: 2400, status: "processing", msg: "Splitting text into semantic chunks..." },
        { delay: 3800, status: "processing", msg: "Generating embeddings (Gemini Embedding-001)..." }
      ];
    }

    statusSequence.forEach(item => {
      setTimeout(() => {
        setUploadStatus((currentStatus) => {
          if (currentStatus === "uploading" || currentStatus === "processing") {
            setStatusMessage(item.msg);
            return item.status;
          }
          return currentStatus;
        });
      }, item.delay);
    });

    try {
      const response = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });

      setUploadStatus("success");
      setStatusMessage(`${file.name} indexed and ready for intelligence queries!`);
      fetchDocuments();
      setActiveDocId(response.data.document.id);

      setTimeout(() => {
        setUploadStatus("idle");
        setStatusMessage("");
      }, 3500);
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus("error");
      const errorMsg = error.response?.data?.error || "Failed to process file.";
      setStatusMessage(errorMsg);
    }
  };

  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    const targetUrl = urlInput.trim();
    setUploadStatus("uploading");
    setStatusMessage(`Connecting to ${targetUrl}...`);

    const statusSequence = [
      { delay: 1000, status: "processing", msg: "Connecting to URL & inspecting resource..." },
      { delay: 2500, status: "processing", msg: "Extracting readable web content & metadata..." },
      { delay: 4200, status: "processing", msg: "Indexing into vector memory (Gemini Embeddings)..." }
    ];

    statusSequence.forEach(item => {
      setTimeout(() => {
        setUploadStatus(curr => (curr === "uploading" || curr === "processing") ? (setStatusMessage(item.msg), item.status) : curr);
      }, item.delay);
    });

    try {
      const response = await axios.post(`${API_URL}/api/upload-url`, {
        url: targetUrl,
        documentId: Math.random().toString(36).substring(7)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUploadStatus("success");
      setStatusMessage(`Indexed "${response.data.document.filename}" successfully!`);
      setUrlInput("");
      fetchDocuments();
      setActiveDocId(response.data.document.id);

      setTimeout(() => {
        setUploadStatus("idle");
        setStatusMessage("");
      }, 3500);
    } catch (error) {
      console.error("URL upload error:", error);
      setUploadStatus("error");
      const errorMsg = error.response?.data?.details || error.response?.data?.error || "Failed to process URL.";
      setStatusMessage(errorMsg);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  const formatSize = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleDeleteDocument = async (e, docId) => {
    e.stopPropagation();
    if (deletingDocId) return;

    try {
      setDeletingDocId(docId);
      await axios.delete(`${API_URL}/api/documents/${docId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const remainingDocs = documents.filter(d => d.id !== docId);
      setDocuments(remainingDocs);
      setSelectedForCompare(prev => prev.filter(id => id !== docId));

      if (activeDocId === docId) {
        if (remainingDocs.length > 0) {
          setActiveDocId(remainingDocs[0].id);
        } else {
          setActiveDocId("");
        }
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    } finally {
      setDeletingDocId(null);
    }
  };

  const toggleSelectForCompare = (e, docId) => {
    e.stopPropagation();
    setSelectedForCompare(prev => {
      if (prev.includes(docId)) {
        return prev.filter(id => id !== docId);
      } else {
        if (prev.length >= 2) {
          return [prev[1], docId];
        }
        return [...prev, docId];
      }
    });
  };

  const handleTriggerCompare = () => {
    if (selectedForCompare.length === 2 && onCompareDocs) {
      onCompareDocs(selectedForCompare[0], selectedForCompare[1]);
    }
  };

  const cleanTitle = (rawName) => {
    if (!rawName) return "Untitled Media";
    return rawName.replace(/^[\p{Emoji}\u2000-\u3300\s]+/u, "").trim() || rawName;
  };

  const availableCategories = [
    { id: "all", label: "All", count: documents.length },
    ...["webpage", "document", "video", "audio", "image", "data", "code"]
      .map(type => {
        const count = documents.filter(d => (d.fileType || "document") === type).length;
        const labels = {
          webpage: "Web",
          document: "Docs",
          video: "Video",
          audio: "Audio",
          image: "Images",
          data: "Data",
          code: "Code"
        };
        return { id: type, label: labels[type] || type, count };
      })
      .filter(c => c.count > 0)
  ];

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || (doc.fileType || "document") === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="document-manager">
      {/* Ingestion Mode Switcher */}
      <div className="ingestion-tabs">
        <button
          type="button"
          className={`ingestion-tab-btn ${ingestMode === "file" ? "active" : ""}`}
          onClick={() => setIngestMode("file")}
        >
          <UploadCloud size={13} />
          <span>Upload File</span>
        </button>
        <button
          type="button"
          className={`ingestion-tab-btn ${ingestMode === "url" ? "active" : ""}`}
          onClick={() => setIngestMode("url")}
        >
          <Globe size={13} />
          <span>Ingest Web URL</span>
        </button>
      </div>

      {/* URL Ingestion Zone */}
      {ingestMode === "url" && (
        <div className={`url-ingest-zone ${uploadStatus}`}>
          {uploadStatus === "idle" && (
            <form onSubmit={handleUrlSubmit} className="url-ingest-form">
              <div className="url-input-container">
                <Globe size={16} className="url-input-icon" />
                <input
                  type="url"
                  placeholder="Paste Webpage, Article, Wikipedia, or Media URL..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="url-text-input"
                  required
                />
                <button 
                  type="submit" 
                  disabled={!urlInput.trim()} 
                  className="url-submit-btn"
                  title="Fetch and index URL into vector memory"
                >
                  <ArrowRight size={15} />
                  <span>Index</span>
                </button>
              </div>

              {/* Quick Preset Samples */}
              <div className="url-quick-presets">
                <span className="presets-label">Sample links:</span>
                <button
                  type="button"
                  className="preset-url-chip"
                  onClick={() => setUrlInput("https://en.wikipedia.org/wiki/Artificial_intelligence")}
                >
                  📚 Wikipedia (AI)
                </button>
                <button
                  type="button"
                  className="preset-url-chip"
                  onClick={() => setUrlInput("https://en.wikipedia.org/wiki/Quantum_computing")}
                >
                  ⚛️ Quantum Computing
                </button>
              </div>
            </form>
          )}

          {(uploadStatus === "uploading" || uploadStatus === "processing") && (
            <div className="upload-progress">
              <Loader2 size={32} className="spinner icon-accent" />
              <h4>Universal URL Ingestion</h4>
              <p className="status-live">{statusMessage}</p>
              <div className="upload-progress-bar-container">
                <div className="upload-progress-bar-fill shimmer-effect"></div>
              </div>
            </div>
          )}

          {uploadStatus === "success" && (
            <div className="upload-success">
              <CheckCircle2 size={32} className="icon-success bounce-in" />
              <h4>Webpage Indexed</h4>
              <p>{statusMessage}</p>
            </div>
          )}

          {uploadStatus === "error" && (
            <div className="upload-error">
              <AlertCircle size={32} className="icon-error shake-in" />
              <h4>URL Ingestion Failed</h4>
              <p>{statusMessage}</p>
              <button 
                type="button" 
                className="retry-upload-btn"
                onClick={() => {
                  setUploadStatus("idle");
                  setStatusMessage("");
                }}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* File Upload Drop Zone (when in File mode) */}
      {ingestMode === "file" && (
        <div 
          className={`upload-zone ${isDragOver ? "drag-over" : ""} ${uploadStatus}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={uploadStatus === "idle" || uploadStatus === "error" || uploadStatus === "success" ? triggerFileSelect : undefined}
        >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          style={{ display: "none" }}
          accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.mp3,.wav,.m4a,.ogg,.aac,.flac,.mp4,.webm,.mov,.mkv,.avi,.3gp,.csv,.tsv,.json,.py,.js,.jsx,.ts,.tsx,.html,.css,.sql"
        />

        {uploadStatus === "idle" && (
          <div className="upload-idle">
            <div className="upload-icon-pulse">
              <UploadCloud size={28} className="upload-icon" />
            </div>
            <h4>Drop or Browse Any Media</h4>
            <p className="upload-subtitle">PDF • Images • Audio • Video • Datasets • Code</p>
            
            {/* Multimodal Pill Chips */}
            <div className="modality-pills">
              <span className="mod-pill mod-pdf"><FileText size={10} /> PDF/DOC</span>
              <span className="mod-pill mod-img"><Image size={10} /> IMAGES</span>
              <span className="mod-pill mod-audio"><Mic size={10} /> AUDIO</span>
              <span className="mod-pill mod-video"><Film size={10} /> VIDEO</span>
              <span className="mod-pill mod-data"><Table size={10} /> DATA</span>
            </div>
          </div>
        )}

        {(uploadStatus === "uploading" || uploadStatus === "processing") && (
          <div className="upload-progress">
            <Loader2 size={32} className="spinner icon-accent" />
            <h4>Analyzing Media Everything</h4>
            <p className="status-live">{statusMessage}</p>
            <div className="upload-progress-bar-container">
              <div className="upload-progress-bar-fill shimmer-effect"></div>
            </div>
          </div>
        )}

        {uploadStatus === "success" && (
          <div className="upload-success">
            <CheckCircle2 size={32} className="icon-success bounce-in" />
            <h4>Universal Ingestion Complete</h4>
            <p>{statusMessage}</p>
          </div>
        )}

        {uploadStatus === "error" && (
          <div className="upload-error">
            <AlertCircle size={32} className="icon-error shake-in" />
            <h4>Analysis Failed</h4>
            <p>{statusMessage}</p>
            <button 
              type="button" 
              className="retry-upload-btn"
              onClick={(e) => {
                e.stopPropagation();
                setUploadStatus("idle");
                setStatusMessage("");
              }}
            >
              Try Again
            </button>
          </div>
        )}
        </div>
      )}

      {/* Document Library Section */}
      <div className="doc-library">
        <div className="doc-library-header">
          <div className="doc-count-badge">
            <span className="badge-dot"></span>
            <h4>Workspace Media</h4>
            <span className="badge-count-pill">{documents.length}</span>
          </div>

          <div className="doc-header-actions">
            {documents.length >= 2 && (
              <button 
                type="button"
                className={`btn-compare-toggle ${compareMode ? "active" : ""}`}
                title="Cross-Document Comparative Analysis"
                onClick={() => {
                  setCompareMode(!compareMode);
                  setSelectedForCompare([]);
                }}
              >
                <GitCompare size={13} />
                <span>{compareMode ? "Exit Compare" : "Compare"}</span>
              </button>
            )}

            {documents.length > 2 && (
              <div className="search-box">
                <Search size={13} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter media..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    type="button" 
                    className="btn-clear-search"
                    onClick={() => setSearchQuery("")}
                    title="Clear filter"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Category Filter Chips */}
        {availableCategories.length > 2 && (
          <div className="category-filter-chips">
            {availableCategories.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`cat-chip ${selectedCategory === cat.id ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span>{cat.label}</span>
                <span className="cat-chip-count">{cat.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Compare Action Banner */}
        {compareMode && (
          <div className="compare-bar">
            <span>
              {selectedForCompare.length === 0 && "Select 2 items to compare"}
              {selectedForCompare.length === 1 && "Select 1 more item"}
              {selectedForCompare.length === 2 && "2 items ready for comparison"}
            </span>
            {selectedForCompare.length === 2 && (
              <button 
                type="button" 
                className="btn-compare-action"
                onClick={handleTriggerCompare}
              >
                Launch Comparison
              </button>
            )}
          </div>
        )}

        {documents.length === 0 ? (
          <div className="empty-docs">
            <p>No media uploaded yet. Drop an image, audio clip, video, CSV, or PDF to begin universal analysis.</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="empty-docs">
            <p>No media matching your current filter.</p>
            <button 
              type="button" 
              className="btn-reset-filters" 
              onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="doc-list">
            {filteredDocuments.map((doc) => {
              const isSelectedForCompare = selectedForCompare.includes(doc.id);
              const meta = getMediaMeta(doc);
              const IconComponent = meta.Icon;
              const displayTitle = cleanTitle(doc.filename);

              return (
                <div 
                  key={doc.id}
                  className={`doc-item ${activeDocId === doc.id ? "active" : ""} ${isSelectedForCompare ? "compare-selected" : ""}`}
                  onClick={() => {
                    if (compareMode) {
                      toggleSelectForCompare({ stopPropagation: () => {} }, doc.id);
                    } else {
                      setActiveDocId(doc.id);
                    }
                  }}
                >
                  {compareMode ? (
                    <button
                      type="button"
                      className="compare-check-btn"
                      onClick={(e) => toggleSelectForCompare(e, doc.id)}
                    >
                      {isSelectedForCompare ? (
                        <CheckSquare size={16} className="checked-icon" />
                      ) : (
                        <Square size={16} className="unchecked-icon" />
                      )}
                    </button>
                  ) : (
                    <div className={`doc-type-icon-wrapper ${meta.badgeClass}`}>
                      <IconComponent className="doc-icon" size={17} />
                      <span className="doc-ext-badge">{meta.label}</span>
                    </div>
                  )}

                  <div className="doc-info">
                    <span className="doc-name" title={doc.filename}>{displayTitle}</span>
                    <div className="doc-meta-row">
                      <span className="doc-meta-pill">{formatSize(doc.size)}</span>
                      <span className="doc-meta-dot">•</span>
                      <span className="doc-meta-pill">{doc.chunkCount} {doc.chunkCount === 1 ? "chunk" : "chunks"}</span>
                    </div>
                  </div>

                  <div className="doc-item-actions">
                    {/* Media Preview / Inspector Button */}
                    <button
                      type="button"
                      className="doc-mini-btn"
                      title="Open Multimodal Inspector & Preview"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenPreview) onOpenPreview(doc.id);
                      }}
                    >
                      <Eye size={13} />
                    </button>

                    {/* Study Center Button */}
                    <button
                      type="button"
                      className="doc-mini-btn"
                      title="Generate AI Quiz & Flashcards"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenStudy) onOpenStudy(doc.id);
                      }}
                    >
                      <Sparkles size={13} />
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      className="doc-delete-btn"
                      title="Remove this item"
                      onClick={(e) => handleDeleteDocument(e, doc.id)}
                      disabled={deletingDocId === doc.id}
                    >
                      {deletingDocId === doc.id ? (
                        <Loader2 size={13} className="spinner" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
