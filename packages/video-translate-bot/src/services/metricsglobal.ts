import { MetricsService } from "./metrics";

let globalMetricsService: MetricsService | null = null;

export const setGlobalMetricsService = (service: MetricsService) => {
  globalMetricsService = service;
};

export const getGlobalMetricsService = (): MetricsService | null => {
  return globalMetricsService;
};
