import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useVersionCheck } from "@/hooks/useVersionCheck";

/** How long after dismissal before the banner reappears (30 minutes). */
const REAPPEAR_MS = 30 * 60_000;

export function VersionBanner() {
  const { updateAvailable } = useVersionCheck();
  const [dismissed, setDismissed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const reappearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dismissed || !updateAvailable) return;
    reappearTimer.current = setTimeout(() => setDismissed(false), REAPPEAR_MS);
    return () => {
      if (reappearTimer.current) clearTimeout(reappearTimer.current);
    };
  }, [dismissed, updateAvailable]);

  useEffect(() => {
    if (updateAvailable) setDismissed(false);
  }, [updateAvailable]);

  const handleRefresh = useCallback(() => {
    // Cache-busting reload: navigate to a fresh URL so the browser
    // bypasses any cached index.html and fetches the latest bundles.
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  }, []);

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setDismissed(true);
      setExiting(false);
    }, 200);
  }, []);

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-fit ${
        exiting ? "animate-slide-out-down" : "animate-slide-in-up"
      }`}
    >
      <div className="flex items-center gap-3 rounded-full border border-border/50 bg-card/95 backdrop-blur-sm shadow-lg px-4 py-2">
        <span className="text-xs text-muted-foreground">A newer version of BrahmaHub is available</span>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <Button
            size="sm"
            className="h-6 gap-1.5 rounded-full text-xs px-3 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleRefresh}
          >
            <RefreshCw size={12} />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground/50 hover:text-foreground hover:bg-transparent"
            onClick={handleDismiss}
          >
            <X size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
