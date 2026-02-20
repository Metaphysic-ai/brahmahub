"""Pydantic models for API request/response validation."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    project_type: str = "atman"
    client: str | None = None
    notes: str | None = None
    tags: list[str] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    project_type: str | None = None
    client: str | None = None
    notes: str | None = None
    tags: list[str] | None = None


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    project_type: str
    client: str | None = None
    notes: str | None = None
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime
    subject_count: int = 0
    package_count: int = 0
    total_assets: int = 0
    total_size_bytes: int = 0


class SubjectCreate(BaseModel):
    project_id: UUID
    name: str
    description: str = ""
    notes: str | None = None
    tags: list[str] = []


class SubjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    thumbnail_url: str | None = None
    notes: str | None = None
    tags: list[str] | None = None


class SubjectResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    description: str | None = None
    thumbnail_url: str | None = None
    notes: str | None = None
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime
    package_count: int = 0
    total_assets: int = 0
    total_size_bytes: int = 0


class PackageCreate(BaseModel):
    subject_id: UUID
    name: str
    source_description: str = ""
    disk_path: str | None = None
    tags: list[str] = []
    metadata: dict = {}


class PackageUpdate(BaseModel):
    name: str | None = None
    source_description: str | None = None
    status: str | None = None
    picked_up: bool | None = None
    tags: list[str] | None = None
    metadata: dict | None = None


class LinkedSubject(BaseModel):
    id: UUID
    name: str


class PackageResponse(BaseModel):
    id: UUID
    subject_id: UUID
    name: str
    source_description: str | None = None
    ingested_at: datetime
    file_count: int = 0
    total_size_bytes: int = 0
    status: str = "ingested"
    package_type: str = "atman"
    picked_up: bool = False
    disk_path: str | None = None
    tags: list[str] = []
    metadata: dict = {}
    linked_subjects: list[LinkedSubject] = []


class PackageSummary(BaseModel):
    total_assets: int = 0
    video_count: int = 0
    image_count: int = 0
    aligned_count: int = 0
    grid_count: int = 0
    plate_count: int = 0
    raw_count: int = 0
    graded_count: int = 0
    proxy_count: int = 0
    metadata_count: int = 0
    picked_up_count: int = 0
    total_duration: float = 0.0
    common_width: int | None = None
    common_height: int | None = None
    face_types: list[str] | None = None
    source_width: int | None = None
    source_height: int | None = None
    yaw_min: float | None = None
    yaw_max: float | None = None
    pitch_min: float | None = None
    pitch_max: float | None = None
    avg_sharpness: float | None = None
    cameras: list[str] | None = None
    codecs: list[str] | None = None
    source_video_path: str | None = None
    source_video_filename: str | None = None
    grid_asset_id: str | None = None
    pose_data: list[dict] | None = None


class AssetUpdate(BaseModel):
    tags: list[str] | None = None
    review_status: str | None = None
    picked_up: bool | None = None
    is_on_disk: bool | None = None


class BulkAssetUpdate(BaseModel):
    asset_ids: list[UUID]
    updates: AssetUpdate


class BulkDeleteRequest(BaseModel):
    ids: list[UUID]


class PaginatedPackageResponse(BaseModel):
    items: list["PackageResponse"]
    total: int
    offset: int
    limit: int


class PaginatedAssetResponse(BaseModel):
    items: list["AssetResponse"]
    total: int
    offset: int
    limit: int
    video_count: int = 0
    image_count: int = 0
    total_size_bytes: int = 0
    total_duration_seconds: float = 0.0
    picked_up_count: int = 0


class AssetResponse(BaseModel):
    id: UUID
    package_id: UUID
    subject_id: UUID | None = None
    filename: str
    file_type: str
    asset_type: str = "raw"
    mime_type: str | None = None
    file_size_bytes: int | None = None
    disk_path: str
    proxy_path: str | None = None
    thumbnail_path: str | None = None
    proxy_url: str | None = None
    thumbnail_url: str | None = None
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    codec: str | None = None
    camera: str | None = None
    review_status: str = "unreviewed"
    is_on_disk: bool = True
    picked_up: bool = False
    tags: list[str] = []
    metadata: dict = {}
    created_at: datetime


class DashboardStats(BaseModel):
    total_projects: int
    total_subjects: int
    total_packages: int
    total_raw_packages: int = 0
    total_datasets: int = 0
    total_assets: int
    total_size_bytes: int
    assets_by_type: dict = {}
    assets_by_review_status: dict = {}
    recent_packages: list[dict] = []
    storage_by_project: list[dict] = []


class SearchResults(BaseModel):
    projects: list[dict] = []
    subjects: list[dict] = []
    packages: list[dict] = []
    assets: list[dict] = []


class IngestAnalyzeRequest(BaseModel):
    source_path: str
    project_id: UUID


class FileAnalysis(BaseModel):
    original_path: str
    file_type: str
    size_bytes: int
    subject: str
    camera: str
    asset_type: str
    selected: bool = True


class SubjectAnalysis(BaseModel):
    name: str
    file_count: int
    total_size_bytes: int
    files: list[FileAnalysis]


class AnalysisResult(BaseModel):
    source_path: str
    package_type: str
    total_files: int
    total_size_bytes: int
    subjects: list[SubjectAnalysis]


class IngestFileInput(BaseModel):
    original_path: str
    selected: bool = True
    subject: str
    asset_type: str


class IngestSubjectInput(BaseModel):
    name: str
    files: list[IngestFileInput]


class DatasetMappingInput(BaseModel):
    subject_name: str
    dataset_dir: str
    is_new: bool = False


class IngestExecuteRequest(BaseModel):
    project_id: UUID
    source_path: str
    package_type: str = "atman"
    subjects: list[IngestSubjectInput]
    package_name: str
    description: str = ""
    tags: list[str] = []
    skip_proxies: bool = False
    proxy_height: int = 720
    dataset_mappings: list[DatasetMappingInput] = []


class IngestExecuteResult(BaseModel):
    package_id: UUID
    file_count: int
    subjects_created: list[str]
