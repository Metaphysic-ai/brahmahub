import { Link, useLocation, useParams } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { usePackage } from "@/hooks/usePackages";
import { useProject } from "@/hooks/useProjects";
import { useSubject } from "@/hooks/useSubjects";

export function AppBreadcrumb() {
  const { id: projectId, subjectId, packageId } = useParams<{ id: string; subjectId: string; packageId: string }>();
  const location = useLocation();
  const { data: project } = useProject(projectId ?? "");
  const { data: subject } = useSubject(subjectId ?? "");
  const { data: pkg } = usePackage(packageId ?? "");

  if (location.pathname === "/subjects") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Subjects</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (location.pathname === "/packages") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Packages</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (location.pathname === "/datasets") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Datasets</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (packageId) {
    const isDataset = pkg?.package_type === "vfx";
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={isDataset ? "/datasets" : "/packages"}>{isDataset ? "Datasets" : "Packages"}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono-path">{pkg?.name ?? "..."}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (!projectId) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/projects">Projects</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {projectId && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {subjectId ? (
                <BreadcrumbLink asChild>
                  <Link to={`/projects/${projectId}`}>{project?.name ?? "..."}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{project?.name ?? "..."}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        )}

        {subjectId && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{subject?.name ?? "..."}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
