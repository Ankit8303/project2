import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import dns from "dns";

// Fix Windows Node.js DNS resolution bug for mongodb+srv URLs
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// Route imports
import authRoutes from "./routes/auth.js";
import documentRoutes from "./routes/documents.js";
import chatRoutes from "./routes/chats.js";

import { clerkMiddleware } from "@clerk/express";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/documind";

// CORS: allow local dev + deployed Vercel frontend
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());
app.use(clerkMiddleware({
  clockSkewInMs: 300000 // 5 minutes clock skew tolerance for machine time discrepancies
}));

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log(`MongoDB successfully connected to: ${MONGODB_URI}`))
  .catch(err => {
    console.error("MongoDB connection failure:", err.message);
    process.exit(1);
  });

// Root check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "PaperPulse AI MERN Backend API is active",
    database: "MongoDB"
  });
});

// Bind API Routers
app.use("/api/auth", authRoutes);
app.use("/api", documentRoutes);
app.use("/api", chatRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error hook:", err);
  res.status(500).json({ error: "Internal server error.", details: err.message });
});

// Launch server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`PaperPulse Backend Server running on http://localhost:${PORT}`);
  console.log(`Active Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`====================================================`);
});
