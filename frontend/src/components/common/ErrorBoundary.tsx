import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);

    // Chunk load errors happen when the frontend has been redeployed and
    // old JS chunk filenames no longer exist on disk. Auto-reload once.
    if (isChunkLoadError(error) && !sessionStorage.getItem("chunk_reload")) {
      sessionStorage.setItem("chunk_reload", "1");
      window.location.reload();
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // Clear the reload guard on successful render so future chunk errors
    // can trigger another auto-reload.
    sessionStorage.removeItem("chunk_reload");

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
        <AlertTriangle size={40} className="text-destructive" />
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-md">An unexpected error occurred. Try reloading the page.</p>
        {this.state.error && (
          <pre className="mt-2 rounded-md bg-background border p-3 text-xs font-mono-path text-muted-foreground max-w-lg overflow-x-auto text-left">
            {this.state.error.message}
          </pre>
        )}
        <Button onClick={() => window.location.reload()} className="mt-2">
          Reload page
        </Button>
      </div>
    );
  }
}

function isChunkLoadError(error: Error): boolean {
  const msg = error.message || "";
  return (
    error.name === "ChunkLoadError" ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk")
  );
}
