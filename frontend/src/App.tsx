import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Database, Package as PackageIcon } from "lucide-react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import PackageDetail from "@/pages/PackageDetail";
import PackageListPage from "@/pages/PackageListPage";
import ProjectDetail from "@/pages/ProjectDetail";
import Projects from "@/pages/Projects";
import SubjectDetail from "@/pages/SubjectDetail";
import Subjects from "@/pages/Subjects";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/projects/:id/subjects/:subjectId" element={<SubjectDetail />} />
              <Route path="/subjects" element={<Subjects />} />
              <Route
                path="/packages"
                element={
                  <PackageListPage packageType="atman" title="Packages" entityLabel="package" emptyIcon={PackageIcon} />
                }
              />
              <Route
                path="/datasets"
                element={
                  <PackageListPage packageType="vfx" title="Datasets" entityLabel="dataset" emptyIcon={Database} />
                }
              />
              <Route path="/packages/:packageId" element={<PackageDetail />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
