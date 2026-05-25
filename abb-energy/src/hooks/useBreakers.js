import { useState, useEffect } from "react";
import { api } from "../api/api";

export function useBreakers(role) {
  const [breakers, setBreakers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!role) return;
    api.breakers()
      .then((list) => {
        const map = {};
        (Array.isArray(list) ? list : []).forEach((text) => {
          const [idPart, ...nameParts] = String(text).trim().split(" - ");
          const id = idPart?.trim();
          const name = nameParts.join(" - ").trim() || `Breaker ${id}`;
          if (id) map[id] = { id, name, displayName: String(text).trim() };
        });
        setBreakers(map);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [role]);

  // Non-admins only see breaker 5
  const visible = role === "admin"
    ? breakers
    : breakers["5"] ? { "5": breakers["5"] } : {};

  return { breakers: visible, allBreakers: breakers, loading, error };
}