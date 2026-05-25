import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../api/api";

const TariffContext = createContext(null);

const SEASONS = { winter: [12, 1, 2], summer: [6, 7, 8, 9] };

function currentSeason() {
  const m = new Date().getMonth() + 1;
  if (SEASONS.winter.includes(m)) return "winter";
  if (SEASONS.summer.includes(m)) return "summer";
  return "shoulder";
}

export function TariffProvider({ children }) {
  const [tariffs, setTariffs] = useState(null);
  const [vat, setVat] = useState(null);
  const [loading, setLoading] = useState(true);
  const season = currentSeason();

  const fetchTariffs = useCallback(async () => {
    try {
      const data = await api.tariffs();
      setTariffs(data.tariffs);
      setVat(data.vat);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTariffs(); }, [fetchTariffs]);

  const updateTariffs = async (data) => {
    await api.updateTariffs(data);
    await fetchTariffs();
  };

  return (
    <TariffContext.Provider value={{ tariffs, vat, loading, season, updateTariffs, refetch: fetchTariffs }}>
      {children}
    </TariffContext.Provider>
  );
}

export const useTariffs = () => useContext(TariffContext);