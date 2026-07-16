import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

export const usersSearchSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  sort: z.string().optional(),
});

export type UsersSearchParams = z.infer<typeof usersSearchSchema>;

function parseSearchParams(search: string): UsersSearchParams {
  const params = new URLSearchParams(search);
  const raw = {
    search: params.get("search") ?? undefined,
    page: params.get("page") ?? undefined,
    pageSize: params.get("pageSize") ?? undefined,
    sort: params.get("sort") ?? undefined,
  };
  return usersSearchSchema.parse(raw);
}

function serializeSearchParams(sp: UsersSearchParams): string {
  const params = new URLSearchParams();
  if (sp.search) params.set("search", sp.search);
  if (sp.page && sp.page !== 1) params.set("page", String(sp.page));
  if (sp.pageSize && sp.pageSize !== 10) params.set("pageSize", String(sp.pageSize));
  if (sp.sort) params.set("sort", sp.sort);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useUsersSearchParams() {
  const [sp, setSp] = useState<UsersSearchParams>(() =>
    parseSearchParams(window.location.search),
  );

  useEffect(() => {
    const onPopState = () => setSp(parseSearchParams(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: UsersSearchParams, replace = true) => {
    const parsed = usersSearchSchema.parse(next);
    const url = `${window.location.pathname}${serializeSearchParams(parsed)}${window.location.hash}`;
    if (replace) {
      window.history.replaceState(null, "", url);
    } else {
      window.history.pushState(null, "", url);
    }
    setSp(parsed);
  }, []);

  const patch = useCallback(
    (patchParams: Partial<UsersSearchParams>, replace = true) => {
      navigate({ ...sp, ...patchParams }, replace);
    },
    [navigate, sp],
  );

  return useMemo(() => ({ sp, navigate, patch }), [sp, navigate, patch]);
}

export type AppTab = "device" | "users" | "attendance" | "settings";

function parseAppTab(search: string): AppTab {
  const value = new URLSearchParams(search).get("tab");
  if (value === "users" || value === "attendance" || value === "settings") return value;
  return "device";
}

export function useAppTab(): [AppTab, (tab: AppTab) => void] {
  const [tab, setTabState] = useState<AppTab>(() => parseAppTab(window.location.search));

  useEffect(() => {
    const onPopState = () => setTabState(parseAppTab(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setTab = useCallback((next: AppTab) => {
    const params = new URLSearchParams(window.location.search);
    if (next === "device") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
    setTabState(next);
  }, []);

  return [tab, setTab];
}
