import mongoose from "mongoose";

const ChatSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  documentId: {
    type: String,
    required: true
  },
  question: {
    type: String,
    required: true
  },
  answer: {
    type: String,
    required: true
  },
  intent: {
    type: String,
    required: true
  },
  sources: [
    {
      chunkId: String,
      text: String,
      length: Number
    }
  ],
  evaluation: {
    score: {
      type: Number,
      default: 100
    },
    reasoning: {
      type: String,
      default: ""
    }
  },
  suggestedQuestions: [
    {
      type: String
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Chat", ChatSchema);
