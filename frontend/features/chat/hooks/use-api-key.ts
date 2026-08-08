import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "shadowbot:llm-api-key";

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState("");

  useEffect(() => {
    setApiKeyState(window.sessionStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

  const setApiKey = useCallback((value: string) => {
    setApiKeyState(value);
    if (value) {
      window.sessionStorage.setItem(STORAGE_KEY, value);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return { apiKey, setApiKey };
}
