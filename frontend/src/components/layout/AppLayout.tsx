import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { VersionBanner } from "@/components/common/VersionBanner";
import { GlobalSearch } from "@/components/GlobalSearch";
import { AppBreadcrumb } from "./AppBreadcrumb";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);

  const handleOpenSearch = useCallback(() => setSearchOpen(true), []);

  // Strip cache-busting ?_v= param after version-banner reload
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("_v")) {
      url.searchParams.delete("_v");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar onOpenSearch={handleOpenSearch} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center h-12 px-5 shrink-0 shadow-[0_1px_3px_hsl(225,8%,3%,0.4)]">
          <AppBreadcrumb />
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <VersionBanner />
    </div>
  );
}
