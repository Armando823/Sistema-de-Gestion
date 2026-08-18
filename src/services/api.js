// Basic API service placeholder using fetch/axios
import axios from 'axios';

const api = axios.create({ baseURL: '/api/v1' });

api.interceptors.request.use(config => {
  // attach auth token if present
  return config;
});

export default api;
