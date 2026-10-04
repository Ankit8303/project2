import axios from "axios";

// REST API Auth Client — JWT-based authentication via backend
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let currentSessionUser = null;
const authListeners = new Set();

const notifyListeners = () => {
  authListeners.forEach(cb => cb(currentSessionUser));
};

// Check local storage on startup for user session
const savedToken = localStorage.getItem("documind_token");
const savedUser = localStorage.getItem("documind_user");
if (savedToken && savedUser) {
  try {
    currentSessionUser = {
      ...JSON.parse(savedUser),
      async getIdToken() {
        return localStorage.getItem("documind_token");
      }
    };
  } catch (e) {
    localStorage.removeItem("documind_token");
    localStorage.removeItem("documind_user");
  }
}

const signInUser = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    const data = response.data;
    
    localStorage.setItem("documind_token", data.token);
    localStorage.setItem("documind_user", JSON.stringify(data.user));

    currentSessionUser = {
      ...data.user,
      async getIdToken() {
        return data.token;
      }
    };

    notifyListeners();
    return { user: currentSessionUser };
  } catch (err) {
    const errorMsg = err.response?.data?.error || "Login failed.";
    throw new Error(errorMsg);
  }
};

const registerUser = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/api/auth/register`, { email, password });
    const data = response.data;

    localStorage.setItem("documind_token", data.token);
    localStorage.setItem("documind_user", JSON.stringify(data.user));

    currentSessionUser = {
      ...data.user,
      async getIdToken() {
        return data.token;
      }
    };

    notifyListeners();
    return { user: currentSessionUser };
  } catch (err) {
    const errorMsg = err.response?.data?.error || "Registration failed.";
    throw new Error(errorMsg);
  }
};

const logoutUser = async () => {
  localStorage.removeItem("documind_token");
  localStorage.removeItem("documind_user");
  currentSessionUser = null;
  notifyListeners();
};

const subscribeAuthState = (callback) => {
  authListeners.add(callback);
  // Trigger callback instantly with current state
  callback(currentSessionUser);
  return () => {
    authListeners.delete(callback);
  };
};

const isMockAuth = false;

export {
  signInUser,
  registerUser,
  logoutUser,
  subscribeAuthState,
  isMockAuth
};
