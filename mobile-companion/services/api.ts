import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

class ApiService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getFlows() {
    const response = await this.axiosInstance.get('/flows');
    return response.data.data;
  }

  async getFlow(id: string) {
    const response = await this.axiosInstance.get(`/flows/${id}`);
    return response.data.data;
  }

  async triggerFlow(flowId: string, data?: Record<string, any>) {
    const response = await this.axiosInstance.post(`/flows/${flowId}/run`, {
      inputData: data || {},
    });
    return response.data.data;
  }

  async getFlowRuns(flowId: string) {
    const response = await this.axiosInstance.get(`/flows/${flowId}/runs`);
    return response.data.data;
  }

  async getFlowStats(flowId: string) {
    const response = await this.axiosInstance.get(`/flows/${flowId}/stats`);
    return response.data.data;
  }

  async getHealthStatus() {
    const response = await this.axiosInstance.get('/health');
    return response.data;
  }

  setAuthToken(token: string) {
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAuthToken() {
    delete this.axiosInstance.defaults.headers.common['Authorization'];
  }
}

export const apiService = new ApiService();
