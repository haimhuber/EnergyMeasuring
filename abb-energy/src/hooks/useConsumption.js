import { useState, useCallback } from "react";
import { api } from "../api/api";

export function useConsumption() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (breakerId, from, to, view) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await api.consumption(breakerId, from, to, view);
      setData(result);
      return result;
    } catch (e) {
      setError(e.message || "Failed to fetch data");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}