

// -- Typed Metadata -----------------------------------------------------------

export interface FaceMetadata {
  yaw?: number;
  pitch?: number;
  roll?: number;
  sharpness?: number;
  pureness?: number;
  brightness?: number;
  face_type?: string;
  source_filepath?: string;
  source_filename?: string;
  source_width?: number;
  source_height?: number;
}

export interface AssetMetadata {
  face?: FaceMetadata;
  [key: string]: unknown;
}

export interface PackageMetadata {
  source_video_path?: string;
  source_video_filename?: string;
  grid_asset_id?: string;
  plate_asset_id?: string;
  camera_model?: string;
  aligned_count?: number;
  face_types?: string[];
  source_width?: number;
  source_height?: number;
  pose_data?: Array<{ y: number; p: number; count: number }>;
  package_type?: string;
  [key: string]: unknown;
}

// -- Core Entities ------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  description: string | null;
  project_type: 'atman' | 'vfx';
  client: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  subject_count: number;
  package_count: number;
  total_assets: number;
  total_size_bytes: number;
}

export interface Subject {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  dataset_dir: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  package_count: number;
  total_assets: number;
  total_size_bytes: number;
}

export interface LinkedSubject {
  id: string;
  name: string;
}

export interface Package {
  id: string;
  subject_id: string;
  name: string;
  source_description: string | null;
  ingested_at: string;
  file_count: number;
  total_size_bytes: number;
  status: 'ingested' | 'processing' | 'ready' | 'error';
  package_type: 'atman' | 'vfx';
  picked_up: boolean;
  disk_path: string | null;
  tags: string[];
  metadata: PackageMetadata;
  linked_subjects?: LinkedSubject[];
}

export interface Asset {
  id: string;
  package_id: string;
  subject_id: string | null;
  filename: string;
  file_type: 'video' | 'image' | 'audio' | 'other';
  asset_type: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  disk_path: string;
  proxy_path: string | null;
  thumbnail_path: string | null;
  proxy_url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  codec: string | null;
  camera: string | null;
  review_status: string;
  is_on_disk: boolean;
  picked_up: boolean;
  tags: string[];
  metadata: AssetMetadata;
  created_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  project_type: 'atman' | 'vfx';
  client?: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  project_type?: 'atman' | 'vfx';
}

export interface CreateSubjectInput {
  project_id: string;
  name: string;
  description?: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateSubjectInput {
  name?: string;
  description?: string;
  notes?: string;
  tags?: string[];
}

export interface DashboardStats {
  total_projects: number;
  total_subjects: number;
  total_packages: number;
  total_raw_packages: number;
  total_datasets: number;
  total_assets: number;
  total_size_bytes: number;
  assets_by_type: Record<string, number>;
  assets_by_review_status: Record<string, number>;
  recent_packages: RecentPackage[];
  storage_by_project: StorageByProject[];
}

export interface RecentPackage {
  id: string;
  subject_id: string;
  name: string;
  source_description: string | null;
  ingested_at: string;
  file_count: number;
  total_size_bytes: number;
  status: string;
  package_type: 'atman' | 'vfx';
  picked_up: boolean;
  disk_path: string | null;
  tags: string[];
  metadata: PackageMetadata;
  project_name: string;
  project_id: string;
  subject_names: string;
  subject_ids: string;
}

export interface RecentIngest {
  package: RecentPackage;
  subjectName: string;
  subjectId: string;
  projectName: string;
  projectId: string;
}

export interface StorageByProject {
  project_name: string;
  total_bytes: number;
}

// -- Package Summary ----------------------------------------------------------

export interface PackageSummary {
  total_assets: number;
  video_count: number;
  image_count: number;
  aligned_count: number;
  grid_count: number;
  plate_count: number;
  raw_count: number;
  graded_count: number;
  proxy_count: number;
  metadata_count: number;
  picked_up_count: number;
  total_duration: number;
  common_width: number | null;
  common_height: number | null;
  face_types: string[] | null;
  source_width: number | null;
  source_height: number | null;
  yaw_min: number | null;
  yaw_max: number | null;
  pitch_min: number | null;
  pitch_max: number | null;
  avg_sharpness: number | null;
  cameras: string[] | null;
  codecs: string[] | null;
  source_video_path: string | null;
  source_video_filename: string | null;
  grid_asset_id: string | null;
  pose_data: Array<{ y: number; p: number; count: number }> | null;
}

// -- Paginated Packages -------------------------------------------------------

export interface PaginatedPackages {
  items: Package[];
  total: number;
  offset: number;
  limit: number;
}

// -- Paginated Assets ---------------------------------------------------------

export interface PaginatedAssets {
  items: Asset[];
  total: number;
  offset: number;
  limit: number;
  video_count: number;
  image_count: number;
  total_size_bytes: number;
  total_duration_seconds: number;
  picked_up_count: number;
}

export interface AssetFilters {
  package_id?: string;
  subject_id?: string;
  file_type?: string;
  asset_type?: string;
  picked_up?: boolean;
  search?: string;
  pose_bins?: string;
}

// -- Ingest Analysis ----------------------------------------------------------

export interface FileAnalysis {
  original_path: string;
  file_type: 'video' | 'image' | 'audio';
  size_bytes: number;
  subject: string;
  camera: string;
  asset_type: string;
  selected: boolean;
}

export interface SubjectAnalysis {
  name: string;
  file_count: number;
  total_size_bytes: number;
  files: FileAnalysis[];
}

export interface AnalysisResult {
  source_path: string;
  package_type: 'atman' | 'vfx';
  total_files: number;
  total_size_bytes: number;
  subjects: SubjectAnalysis[];
}

export interface DatasetMapping {
  subject_name: string;
  dataset_dir: string;
  is_new: boolean;
}

export interface DatasetSuggestion {
  dir_name: string;
  score: number;
  match_type: 'exact' | 'prefix' | 'substring' | 'fuzzy';
}

export interface DatasetResolution {
  subject_name: string;
  existing_dir: string | null;
  suggestions: DatasetSuggestion[];
}

export interface IngestExecuteRequest {
  project_id: string;
  source_path: string;
  package_type: string;
  subjects: { name: string; files: { original_path: string; selected: boolean; subject: string; asset_type: string }[] }[];
  package_name: string;
  description: string;
  tags: string[];
  skip_proxies: boolean;
  proxy_height: number;
  dataset_mappings?: DatasetMapping[];
}

export interface IngestExecuteResult {
  package_id: string;
  file_count: number;
  subjects_created: string[];
}
