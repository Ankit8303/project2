import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  filename: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ["document", "image", "audio", "video", "data", "code", "webpage"],
    default: "document"
  },
  mimeType: {
    type: String,
    default: ""
  },
  mediaPath: {
    type: String,
    default: ""
  },
  mediaMetadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  size: {
    type: Number,
    required: true
  },
  chunkCount: {
    type: Number,
    required: true
  },
  charCount: {
    type: Number,
    required: true
  },
  rawText: {
    type: String,
    default: ""
  },
  chunks: [
    {
      pageContent: String,
      metadata: mongoose.Schema.Types.Mixed
    }
  ],
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Document", DocumentSchema);
