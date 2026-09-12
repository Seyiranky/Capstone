import axios from 'axios';

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A suspension takes effect immediately, even for someone already mid-session
// with a valid token (see server/middleware/authMiddleware.js). Catch that
// specific rejection here and force back to login rather than leaving every
// screen silently failing its API calls.
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.code === 'ACCOUNT_SUSPENDED') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default axiosClient;
