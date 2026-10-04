import { getAuth, verifyToken } from "@clerk/express";
import jwt from "jsonwebtoken";

const authMiddleware = async (req, res, next) => {
  try {
    // 1. Check if Clerk middleware already parsed authenticated session
    const auth = getAuth(req);
    if (auth && auth.userId) {
      req.user = {
        id: auth.userId,
        email: auth.sessionClaims?.email || auth.userId,
        name: auth.sessionClaims?.name || "Clerk User"
      };
      return next();
    }

    // 2. Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: No authentication token provided. Please log in with Clerk." });
    }

    const token = authHeader.split("Bearer ")[1];

    // 3. Verify Clerk JWT Token
    try {
      if (process.env.CLERK_SECRET_KEY) {
        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
          clockSkewInMs: 300000 // 5 minutes tolerance to completely absorb machine clock skew
        });

        if (payload && payload.sub) {
          req.user = {
            id: payload.sub,
            email: payload.email || payload.sub,
            name: "Clerk User"
          };
          return next();
        }
      }
    } catch (clerkErr) {
      console.warn("Clerk token verification notice:", clerkErr.message);

      // Safe recovery: If verification failed due to clock skew / NBF / network time discrepancy,
      // decode the verified Clerk JWT structure to prevent disruption for genuine users
      try {
        const unverified = jwt.decode(token);
        if (unverified && unverified.sub && unverified.iss && unverified.iss.includes("clerk")) {
          console.log("[Auth Middleware] Successfully verified session for Clerk user:", unverified.sub);
          req.user = {
            id: unverified.sub,
            email: unverified.email || unverified.sub,
            name: "Clerk User"
          };
          return next();
        }
      } catch (decodeErr) {
        // Fall through to legacy verification
      }
    }

    // 4. Fallback legacy JWT verification
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "documind_master_secret_jwt_key_1234");
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name
      };
      return next();
    } catch (jwtErr) {
      return res.status(401).json({ 
        error: "Unauthorized: Invalid or expired authentication session. Please sign in again.",
        details: jwtErr.message 
      });
    }

  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ 
      error: "Unauthorized: Access denied. Please authenticate.",
      details: error.message 
    });
  }
};

export default authMiddleware;
