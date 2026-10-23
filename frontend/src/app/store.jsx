// ─────────────────────────────────────────────────────────────
// store.jsx — app-wide state: backend status, products (= brands/workspaces),
// the selected product, its latest market research and its Instagram + Facebook posts.
// The selected product id uses the same key as the old onboarding page
// ("sociva.currentProductId"), so nothing the user already created is lost.
// ─────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getLatestMarketResearch, listAllPosts, listProducts, pingBackend } from "./api";
import { useAuth } from "./context/AuthContext";

const KEY = "sociva.currentProductId";
const Ctx = createContext(null);

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function WorkspaceProvider({ children }) {
  const { user, token } = useAuth();
  const [online, setOnline] = useState(null); // null = checking
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [currentId, setCurrentId] = useState(read);
  const [research, setResearch] = useState({ loading: false, data: null, error: null });
  const [posts, setPosts] = useState({ loading: false, data: [], error: null, loaded: false });

  // When user logs out, logs in, or switches accounts, isolate state completely
  useEffect(() => {
    if (!token || !user) {
      setProducts([]);
      setCurrentId(null);
      setPosts({ loading: false, data: [], error: null, loaded: false });
      setResearch({ loading: false, data: null, error: null });
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    refreshProducts();
  }, [user?.id, token]);

  const refreshProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const list = (await listProducts()) || [];
      setProducts(list);
      setOnline(true);
      return list;
    } catch (e) {
      if (e.offline) setOnline(false);
      return [];
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    pingBackend().then((ok) => {
      setOnline(ok);
      if (ok) refreshProducts();
      else setProductsLoading(false);
    });
  }, [refreshProducts]);

  // Offline -> keep checking (every 5 s + when the tab gets focus). Before, the app checked only once on page load,
  // so a backend started / restarted after the page opened stayed "offline" (and buttons disabled) until a refresh.
  useEffect(() => {
    if (online !== false) return;
    let stop = false;
    const retry = () =>
      pingBackend().then((ok) => {
        if (ok && !stop) {
          setOnline(true);
          refreshProducts();
        }
      });
    const t = setInterval(retry, 5000);
    window.addEventListener("focus", retry);
    return () => {
      stop = true;
      clearInterval(t);
      window.removeEventListener("focus", retry);
    };
  }, [online, refreshProducts]);

  // keep a valid selection
  const current = useMemo(() => products.find((p) => p._id === currentId) || products[0] || null, [products, currentId]);

  const selectProduct = useCallback((id) => {
    setCurrentId(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const addProduct = useCallback((doc) => {
    setProducts((l) => [doc, ...l.filter((p) => p._id !== doc._id)]);
    selectProduct(doc._id);
  }, [selectProduct]);

  const refreshResearch = useCallback(async () => {
    if (!current?._id) return;
    setResearch((r) => ({ ...r, loading: true, error: null }));
    try {
      const data = await getLatestMarketResearch(current._id);
      setResearch({ loading: false, data, error: null });
    } catch (e) {
      setResearch({ loading: false, data: null, error: e });
    }
  }, [current?._id]);

  const refreshPosts = useCallback(async () => {
    setPosts((p) => ({ ...p, loading: true }));
    try {
      const r = await listAllPosts(current?._id);
      setPosts({ loading: false, data: r.data || [], error: null, loaded: true });
    } catch (e) {
      setPosts({ loading: false, data: [], error: e, loaded: true });
    }
  }, [current?._id]);

  useEffect(() => {
    if (online && current?._id) {
      refreshResearch();
      refreshPosts();
    } else if (online === false) {
      setPosts({ loading: false, data: [], error: new Error("offline"), loaded: true });
    }
  }, [online, current?._id, refreshResearch, refreshPosts]);

  const value = {
    online,
    products,
    productsLoading,
    current,
    profile: current?.aiProfile || null,
    brandName: current?.aiProfile?.name || "Northbeam Studio",
    selectProduct,
    addProduct,
    refreshProducts,
    research,
    setResearchData: (data) => setResearch({ loading: false, data, error: null }),
    refreshResearch,
    posts,
    refreshPosts,
    upsertPost: (doc) =>
      setPosts((p) => ({ ...p, data: [doc, ...p.data.filter((x) => x._id !== doc._id)] })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWorkspace = () => useContext(Ctx);

/* Helpers to read the (flexible) market research document safely */
export const researchPlatforms = (doc) => Object.values(doc?.platforms || {}).filter((p) => p && p.meta?.status === "success");
export const collect = (doc, pick) => {
  const out = [];
  const seen = new Set();
  for (const p of researchPlatforms(doc)) {
    for (const v of pick(p) || []) {
      const label = typeof v === "string" ? v : v?.name || v?.value || "";
      const k = label.toLowerCase();
      if (label && !seen.has(k)) {
        seen.add(k);
        out.push({ value: v, platform: p.platform });
      }
    }
  }
  return out;
};
