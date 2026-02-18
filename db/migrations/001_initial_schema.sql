-- IngestHub Database Schema
-- Squashed from migrations 001–015 into a single clean schema.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    project_type VARCHAR(50) NOT NULL DEFAULT 'atman'
        CHECK (project_type IN ('atman', 'vfx')),
    client VARCHAR(255),
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN(tags);

-- ============================================================
-- SUBJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    dataset_dir TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_subjects_project ON subjects(project_id);
CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name);
CREATE INDEX IF NOT EXISTS idx_subjects_tags ON subjects USING GIN(tags);

-- ============================================================
-- PACKAGES (a single ingest delivery / datashoot batch)
-- ============================================================
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    source_description TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    file_count INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'ingested'
        CHECK (status IN ('ingested', 'processing', 'ready', 'error')),
    disk_path TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    picked_up BOOLEAN NOT NULL DEFAULT FALSE,
    package_type VARCHAR(20) NOT NULL DEFAULT 'atman'
        CHECK (package_type IN ('atman', 'vfx')),
    UNIQUE(subject_id, name)
);

CREATE INDEX IF NOT EXISTS idx_packages_subject ON packages(subject_id);
CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(status);
CREATE INDEX IF NOT EXISTS idx_packages_ingested ON packages(ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_packages_tags ON packages USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_packages_picked_up ON packages(picked_up);
CREATE INDEX IF NOT EXISTS idx_packages_type ON packages(package_type);

-- ============================================================
-- PACKAGES_SUBJECTS (M:M join table)
-- ============================================================
CREATE TABLE IF NOT EXISTS packages_subjects (
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (package_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_ps_subject ON packages_subjects(subject_id);

-- ============================================================
-- ASSETS (individual media files)
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    filename VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL
        CHECK (file_type IN ('video', 'image', 'audio', 'other')),
    asset_type VARCHAR(50) NOT NULL DEFAULT 'raw',
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    disk_path TEXT NOT NULL,
    proxy_path TEXT,
    thumbnail_path TEXT,
    width INTEGER,
    height INTEGER,
    duration_seconds FLOAT,
    codec VARCHAR(100),
    camera VARCHAR(255),
    review_status VARCHAR(20) NOT NULL DEFAULT 'unreviewed',
    is_on_disk BOOLEAN NOT NULL DEFAULT true,
    picked_up BOOLEAN NOT NULL DEFAULT false,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(package_id, filename),
    CONSTRAINT chk_assets_review_status
        CHECK (review_status IN ('unreviewed', 'approved', 'rejected', 'flagged'))
);

CREATE INDEX IF NOT EXISTS idx_assets_package ON assets(package_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(file_type);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_assets_filename ON assets(filename);
CREATE INDEX IF NOT EXISTS idx_assets_review_status ON assets(review_status);
CREATE INDEX IF NOT EXISTS idx_assets_picked_up ON assets(picked_up);
CREATE INDEX IF NOT EXISTS idx_assets_package_filename ON assets(package_id, filename);
CREATE INDEX IF NOT EXISTS idx_assets_package_created ON assets(package_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_asset_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_package_asset_type ON assets(package_id, asset_type, filename);
CREATE INDEX IF NOT EXISTS idx_assets_subject_id ON assets(subject_id);
CREATE INDEX IF NOT EXISTS idx_assets_disk_path ON assets(disk_path);

-- ============================================================
-- HELPER: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_projects_updated
        BEFORE UPDATE ON projects
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_subjects_updated
        BEFORE UPDATE ON subjects
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- VIEWS
-- ============================================================

DROP VIEW IF EXISTS v_subject_summary;
CREATE VIEW v_subject_summary AS
SELECT
    s.*,
    (SELECT COUNT(*) FROM packages_subjects ps WHERE ps.subject_id = s.id)::int AS package_count,
    (SELECT COUNT(*) FROM assets a WHERE a.subject_id = s.id)::int AS total_assets,
    COALESCE((SELECT SUM(a.file_size_bytes) FROM assets a WHERE a.subject_id = s.id), 0)::bigint AS total_size_bytes
FROM subjects s;

DROP VIEW IF EXISTS v_project_summary;
CREATE VIEW v_project_summary AS
SELECT
    p.*,
    (SELECT COUNT(*) FROM subjects s WHERE s.project_id = p.id)::int AS subject_count,
    (SELECT COUNT(DISTINCT ps.package_id) FROM packages_subjects ps JOIN subjects s ON s.id = ps.subject_id WHERE s.project_id = p.id)::int AS package_count,
    (SELECT COUNT(*) FROM assets a JOIN subjects s ON s.id = a.subject_id WHERE s.project_id = p.id)::int AS total_assets,
    COALESCE((SELECT SUM(a.file_size_bytes) FROM assets a JOIN subjects s ON s.id = a.subject_id WHERE s.project_id = p.id), 0)::bigint AS total_size_bytes
FROM projects p;
