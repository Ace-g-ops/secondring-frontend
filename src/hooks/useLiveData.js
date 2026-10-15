import { useCallback, useEffect, useState } from "react";

export function useLiveData(loader, intervalMs = 15000) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, refreshing: true, error: null });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const setData = useCallback((update) => {
    setState((old) => ({ ...old, data: typeof update === "function" ? update(old.data) : update }));
  }, []);

  useEffect(() => {
    let mounted = true;
    let busy = false;
    setState({ data: null, loading: true, refreshing: true, error: null });
    async function load() {
      if (!mounted || busy) return;
      busy = true;
      setState((old) => ({ ...old, refreshing: true }));
      try {
        const data = await loader();
        if (mounted) setState({ data, loading: false, refreshing: false, error: null });
      } catch (error) {
        if (mounted) setState((old) => ({ ...old, loading: false, refreshing: false, error: error.message }));
      } finally {
        busy = false;
      }
    }
    const refreshVisible = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    void load();
    const timer = window.setInterval(refreshVisible, intervalMs);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [loader, revision, intervalMs]);

  return { ...state, refresh, setData };
}
