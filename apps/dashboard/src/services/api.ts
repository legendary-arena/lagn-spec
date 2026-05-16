import axios, { AxiosError } from 'axios';
import type { ApiError } from '../types/index.js';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/dash',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; code?: string }>) => {
    const apiError: ApiError = normalizeError(error);
    return Promise.reject(apiError);
  },
);

function normalizeError(error: AxiosError<{ message?: string; code?: string }>): ApiError {
  if (error.response) {
    const responseData = error.response.data;
    return {
      message: responseData?.message ?? `Request failed with status ${error.response.status}.`,
      code: responseData?.code ?? String(error.response.status),
      retryable: error.response.status >= 500,
    };
  }

  if (error.code === 'ECONNABORTED') {
    return {
      message: 'The request timed out. Please check your connection and try again.',
      code: 'timeout',
      retryable: true,
    };
  }

  return {
    message: 'A network error occurred. Please check your connection and try again.',
    code: 'network_error',
    retryable: true,
  };
}

export { apiClient };
