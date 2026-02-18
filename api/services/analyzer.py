"""Package analysis service.

Scans a directory, auto-detects the package type (ATMAN vs VFX), and either
sends file metadata to Gemini Flash for LLM-based normalization (ATMAN) or uses
regex-based parsing (VFX aligned extractions).
"""

import json
import logging
import re
from collections import defaultdict
from pathlib import Path

from google import genai
from google.genai import types

from ..config import settings

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".mpg",
    ".mpeg",
    ".mxf",
    ".ts",
    ".mts",
    ".m2ts",
    ".3gp",
    ".ogv",
    ".r3d",
}

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".tiff",
    ".tif",
    ".bmp",
    ".webp",
    ".exr",
    ".dpx",
    ".hdr",
    ".gif",
    ".heic",
    ".heif",
    ".raw",
    ".cr2",
    ".cr3",
    ".nef",
    ".arw",
    ".dng",
}

AUDIO_EXTENSIONS = {".wav", ".aiff", ".aif", ".mp3", ".flac", ".ogg", ".m4a"}
SIDECAR_EXTENSIONS = {".xml", ".json", ".srt", ".edl", ".cdl"}


def classify_file(path: Path) -> str:
    """Classify a file as 'video', 'image', 'audio', 'sidecar', or 'other'."""
    ext = path.suffix.lower()
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    if ext in SIDECAR_EXTENSIONS:
        return "sidecar"
    return "other"


_VFX_FRAME_RE = re.compile(r"^\w+_\d{3,}_\d+\.png$", re.IGNORECASE)


def detect_package_type(source: Path) -> str:
    """Detect if this is a VFX extraction dir or raw ATMAN footage.

    VFX indicators (need 2+ to match):
    - config.json exists in root or parent
    - 90%+ of files are PNGs
    - Filenames match structured pattern {ID}_{FRAME}_{VARIANT}.png
    - Subdirectory named 'plate/', 'aligned/', or 'visuals/' exists
    """
    indicators = 0

    if (source / "config.json").exists() or (source.parent / "config.json").exists():
        indicators += 1

    for name in ("plate", "aligned", "visuals"):
        if (source / name).exists() or source.name == name:
            indicators += 1
            break

    sample_files = []
    for f in source.rglob("*"):
        if f.is_file() and not any(p.startswith(".") for p in f.relative_to(source).parts):
            sample_files.append(f)
            if len(sample_files) >= 200:
                break

    if sample_files:
        png_count = sum(1 for f in sample_files if f.suffix.lower() == ".png")
        png_ratio = png_count / len(sample_files)
        if png_ratio >= 0.9:
            indicators += 1

        pattern_matches = sum(1 for f in sample_files if _VFX_FRAME_RE.match(f.name))
        if len(sample_files) > 0 and pattern_matches / len(sample_files) >= 0.8:
            indicators += 1

    return "vfx" if indicators >= 2 else "atman"


def _identity_from_path(file_path: Path, base_dir: Path) -> str:
    """Extract subject/identity name from directory structure.

    Looks for '/datasets/' marker, or falls back to first relative path component.
    """
    path_str = str(file_path)
    marker = "/datasets/"
    idx = path_str.find(marker)
    if idx >= 0:
        after = path_str[idx + len(marker) :]
        # Handle double-underscore format: "dragon__paul_stanley" → "paul_stanley"
        first_component = after.split("/")[0]
        if "__" in first_component:
            first_component = first_component.split("__", 1)[1]
        return first_component or "unknown"

    try:
        rel = file_path.relative_to(base_dir)
        parts = rel.parts
        skip = {"media", "external", "aligned", "from_client", "visuals", "plate"}
        for part in parts:
            if part.lower() not in skip and not part.startswith("."):
                return part
    except (ValueError, IndexError):
        pass
    return "unknown"


def _analyze_vfx(source: Path) -> dict:
    """Analyze a VFX extraction directory using regex-based parsing."""
    files_by_subject: dict[str, list[dict]] = defaultdict(list)
    total_size = 0

    for f in sorted(source.rglob("*")):
        if not f.is_file():
            continue
        if any(p.startswith(".") for p in f.relative_to(source).parts):
            continue

        ftype = classify_file(f)
        if ftype not in ("image", "video", "audio"):
            continue

        size = f.stat().st_size
        total_size += size
        rel_path = str(f.relative_to(source))
        subject = _identity_from_path(f, source)

        rel_parts = [p.lower() for p in Path(rel_path).parts]
        if any(seg in ("grids", "grid") for seg in rel_parts):
            asset_type = "grid"
        elif "plate" in rel_parts:
            asset_type = "plate"
        else:
            asset_type = "aligned"

        files_by_subject[subject].append(
            {
                "original_path": rel_path,
                "file_type": ftype,
                "size_bytes": size,
                "subject": subject,
                "camera": "cam_a",
                "asset_type": asset_type,
                "selected": True,
            }
        )

    subjects = []
    for name, files in sorted(files_by_subject.items()):
        subj_size = sum(f["size_bytes"] for f in files)
        subjects.append(
            {
                "name": name,
                "file_count": len(files),
                "total_size_bytes": subj_size,
                "files": files,
            }
        )

    return {
        "source_path": str(source),
        "package_type": "vfx",
        "total_files": sum(s["file_count"] for s in subjects),
        "total_size_bytes": total_size,
        "subjects": subjects,
    }


SYSTEM_PROMPT = """
You are a hierarchical ingest mapping agent.

INPUT:
File facts including the relative path from a shoot root.

YOUR TASK:
Normalize paths to: {subject_slug}/{camera_id}/{asset_type}/{original_filename}

METHODOLOGY: TOP-DOWN HIERARCHY SCAN
You must parse the path components from Left (Root) to Right (File) to identify entities.

1. DETECT SUBJECT (The "Who"):
   - Scan ALL path components (not just top-level) for subject names.
   - Ignore generic production containers (e.g., "Day_01", "Shoot_Data", "Cards", "Footage", "Media").
   - ALSO IGNORE organizational/utility folders that are NOT subject names:
     "test", "tests", "testing", "shared", "common", "temp", "tmp",
     "backup", "archive", "misc", "other", "unknown", "assets", "output", "exports".
   - ALSO IGNORE software/tool folder names that are NOT subject names:
     "livefacelink", "liveface", "nuke", "flame", "fusion", "resolve",
     "davinci", "premiere", "aftereffects", "grading", "finishing", "conform".
   - HEURISTIC: Subject names are typically human names (first names, full names).
     Technical/software terms are NOT subjects.

   DEEP SUBJECT DETECTION:
   - Subject names can appear at ANY depth in the path, not just top-level.
   - Examples of valid subject detection:
     - "Jo/BM_PYXIS/Exports/file.mov" → subject is "jo"
     - "vac_0510/Jo/exports/file.mov" → subject is "jo" (nested under session folder)
     - "Gaussian_Splat/iphones_GPWR/Jo/file.mov" → subject is "jo" (nested under technical folder)
   FILENAME SUBJECT DETECTION:
   - Also check filenames for embedded subject names using these patterns:
     ALLCAPS PREFIX: "JO_C001_FullBody.mov" → subject is "jo"
     ALLCAPS PREFIX: "PRABHU_C002_Waist.mov" → subject is "prabhu"
     EMBEDDED AFTER SESSION: "vac_0510_Jo_English_Ram.mov" → subject is "jo"
     EMBEDDED AFTER SESSION: "vac_0530_Hernando_English_Ram.mov" → subject is "hernando"
   - Subject names in filenames are typically:
     - At the START of the filename in ALLCAPS (e.g., "PRABHU_", "JO_")
     - AFTER a session/take identifier (e.g., "vac_0510_", "C001_")
     - BEFORE language/content tags (e.g., "_English", "_Spanish", "_Ram")
   - Subject names are human names (first names), NOT camera codes (A001, C002) or technical terms

   - IMPORTANT HEURISTIC: Real subject folders typically contain camera-type subdirectories
     (e.g., "SONY_A9_4k_24fps/", "BM_PYXIS_12k_25fps/", "Cam_A/", "Angle_1/").
     Folders with media files directly at root level (no camera subdirs) are likely organizational, not subjects.
   - The first distinct, non-generic human name found (in path OR filename) is the SUBJECT.
   - If no distinct subject folder exists (files are at root or only in generic folders), use "shared".
   - IMPORTANT: Words appearing in the package_root (folder name) may still be valid
     subject names. Do NOT automatically exclude them. The package_root is for context
     only - evaluate each path/filename component independently based on whether it
     looks like a human name. For example, if package_root is "2025-12-19-Camp" and
     filename is "2025-Camp-OR-Brahma-A001.mov", "Camp" is likely the subject (a person),
     not "Brahma".
   - Slugify: lowercase, underscores only (e.g. "Jo Plaete" -> "jo_plaete").

2. DETECT CAMERA (The "Eye"):
   - Look for camera identifiers *inside* the Subject folder or in the Filename.
   - Keywords: "Cam A", "B-Cam", "Pyxis", "Sony", "Angle 1", "Wide".
   - Logic:
     - If explicit tag found -> slugify it (e.g. "cam_b", "cam_pyxis").
     - If NO tag found -> default to "cam_a".

3. DETECT ASSET TYPE (The "Format"):
   - Look for type keywords *inside* the Camera folder or in the Filename.
   - Keywords: "Proxy", "Proxies", "Graded", "Color", "Raw", "Originals", "Wav".
   - Logic:
     - "Proxy" or lightweight .mp4 -> "proxy"
     - "Graded" or processed .mov -> "graded"
     - "Raw", "BRAW", "Arri", .mxf -> "raw"
     - Audio files (.wav, .aiff, .mp3) -> "raw"  (NOT "audio" - that's a media type, not an asset type)
     - Sidecars (.xml, .json) -> "metadata"

EXAMPLE HIERARCHY PARSE:
Input: "2026_Shoot/Day_1/Jo/Card_A/Proxies/Clip1.mp4"
1. Ignore "2026_Shoot", "Day_1".
2. Found Subject: "Jo" -> "jo"
3. Found Generic "Card_A" (Assume Cam A default unless "Cam B" specified). -> "cam_a"
4. Found Type "Proxies". -> "proxy"
Result: "jo/cam_a/proxy/Clip1.mp4"

OUTPUT:
Return ONLY valid JSON with a 'manifest' list.
Each item in the list MUST have these exact keys:
- "source_path": The relative path of the input file (from input).
- "target_path": The proposed normalized destination path.
"""

BATCH_SIZE = 40


def _tokenize(filename: str) -> list[str]:
    """Split a filename into tokens on common delimiters."""
    return re.split(r"[_\-.\s]+", filename)


def _scan_directory(source: Path) -> list[dict]:
    """Walk directory and build file facts for LLM normalization."""
    files = []
    for f in sorted(source.rglob("*")):
        if not f.is_file():
            continue
        if any(p.startswith(".") for p in f.relative_to(source).parts):
            continue

        ftype = classify_file(f)
        if ftype not in ("video", "image", "audio"):
            continue

        rel_path = str(f.relative_to(source))
        ext = f.suffix.lower()
        files.append(
            {
                "path": rel_path,
                "filename": f.name,
                "ext": ext,
                "is_video": ext in VIDEO_EXTENSIONS,
                "is_audio": ext in AUDIO_EXTENSIONS,
                "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                "tokens": _tokenize(f.stem),
            }
        )
    return files


def _call_gemini(file_facts: dict) -> list[dict]:
    """Send file facts to Gemini Flash for path normalization.

    Returns a list of {source_path, target_path} manifest entries.
    Uses response_mime_type="application/json" for guaranteed JSON output.
    """
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=settings.gemini_api_key)
    all_files = file_facts["files"]
    package_root = file_facts["package_root"]
    manifest: list[dict] = []

    for i in range(0, len(all_files), BATCH_SIZE):
        chunk = all_files[i : i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (len(all_files) + BATCH_SIZE - 1) // BATCH_SIZE

        chunk_input = {
            "package_root": package_root,
            "file_count": len(chunk),
            "files": chunk,
        }

        logger.info("LLM batch %d/%d (%d files)", batch_num, total_batches, len(chunk))

        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=json.dumps(chunk_input, indent=2),
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        response_mime_type="application/json",
                        temperature=0.0,
                        max_output_tokens=16384,
                    ),
                )
                data = json.loads(response.text)
                batch_manifest = data.get("manifest", [])
                manifest.extend(batch_manifest)
                logger.info("Batch %d/%d: %d mappings", batch_num, total_batches, len(batch_manifest))
                break

            except (json.JSONDecodeError, Exception) as exc:
                logger.warning("Batch %d attempt %d failed: %s", batch_num, attempt + 1, exc)
                if attempt == 2:
                    logger.error("Batch %d failed after 3 attempts", batch_num)

    return manifest


_GENERIC_DIRS = {
    "media",
    "footage",
    "raw",
    "proxy",
    "proxies",
    "graded",
    "exports",
    "output",
    "rec709_conversion",
    "rec709",
    "conversion",
    "cards",
    "card",
    "day_01",
    "day_02",
    "day_1",
    "day_2",
    "shoot_data",
    "shared",
    "common",
    "cam_a",
    "cam_b",
    "camera",
    "angle_1",
    "angle_2",
}

_GRADED_SUFFIXES = {
    "_graded",
    "_color",
    "_colour",
    "_grade",
    "_lut",
    "_cc",
    "_rec709",
    "_conform",
    "_export",
    "_dnxhd",
    "_prores",
}


def _validate_subject_assignments(manifest_lookup: dict, all_files: list) -> dict:
    """Cross-check LLM subject assignments against directory structure.

    If >80% of files are assigned to one subject but paths show distinct
    subdirectories, redistribute based on directory structure.
    """
    if not manifest_lookup:
        return manifest_lookup

    subject_counts: dict[str, int] = defaultdict(int)
    for parsed in manifest_lookup.values():
        subject_counts[parsed["subject"]] += 1

    total = sum(subject_counts.values())
    if total == 0:
        return manifest_lookup

    top_subject = max(subject_counts, key=subject_counts.get)
    if subject_counts[top_subject] / total <= 0.8:
        return manifest_lookup  # Distribution looks reasonable

    path_subject_candidates: dict[str, set] = defaultdict(set)
    for file_info in all_files:
        parts = Path(file_info["path"]).parts
        for part in parts[:-1]:  # exclude filename
            lower = part.lower().replace(" ", "_")
            if lower not in _GENERIC_DIRS and not lower.startswith("."):
                path_subject_candidates[lower].add(file_info["path"])

    real_candidates = {k: v for k, v in path_subject_candidates.items() if len(v) >= 2}

    if len(real_candidates) <= 1:
        return manifest_lookup  # No clear multi-subject structure

    logger.info(
        "LLM assigned %d/%d files to '%s' but paths suggest %d subjects: %s. Redistributing.",
        subject_counts[top_subject],
        total,
        top_subject,
        len(real_candidates),
        list(real_candidates.keys()),
    )

    for file_info in all_files:
        rel_path = file_info["path"]
        if rel_path not in manifest_lookup:
            continue
        parts = Path(rel_path).parts
        for part in parts[:-1]:
            lower = part.lower().replace(" ", "_")
            if lower in real_candidates:
                manifest_lookup[rel_path]["subject"] = lower
                break

    return manifest_lookup


def _match_shared_by_filename(manifest_lookup: dict, all_files: list) -> dict:
    """Reassign 'shared' files to a subject by cross-referencing filename stems.

    Graded/colour files in generic directories (e.g. graded/) often share the
    same filename stem as a subject-assigned file.  Build a stem->subject map
    from resolved files and reassign shared files whose stem matches exactly
    one subject.
    """
    stem_to_subjects: dict[str, set[str]] = defaultdict(set)
    for file_info in all_files:
        rel_path = file_info["path"]
        parsed = manifest_lookup.get(rel_path)
        if parsed is None or parsed["subject"] == "shared":
            continue
        stem = Path(rel_path).stem.lower()
        stem_to_subjects[stem].add(parsed["subject"])

    if not stem_to_subjects:
        return manifest_lookup

    reassigned = 0
    for file_info in all_files:
        rel_path = file_info["path"]
        parsed = manifest_lookup.get(rel_path)
        if parsed is None or parsed["subject"] != "shared":
            continue

        raw_stem = Path(rel_path).stem.lower()
        matched = stem_to_subjects.get(raw_stem, set())

        if not matched:
            stripped = raw_stem
            for suffix in _GRADED_SUFFIXES:
                if stripped.endswith(suffix):
                    stripped = stripped[: -len(suffix)]
                    break
            if stripped != raw_stem:
                matched = stem_to_subjects.get(stripped, set())

        if len(matched) == 1:
            manifest_lookup[rel_path]["subject"] = next(iter(matched))
            reassigned += 1
            logger.debug("stem-match: '%s' -> '%s'", rel_path, next(iter(matched)))

    if reassigned:
        logger.info("stem-match: reassigned %d shared file(s) to named subjects", reassigned)
    return manifest_lookup


def _parse_target_path(target_path: str) -> dict:
    """Parse a normalized target_path into subject/camera/asset_type."""
    parts = target_path.strip("/").split("/")
    subject = parts[0] if len(parts) >= 1 else "shared"
    camera = parts[1] if len(parts) >= 2 else "cam_a"
    asset_type = parts[2] if len(parts) >= 3 else "raw"
    return {"subject": subject, "camera": camera, "asset_type": asset_type}


def _analyze_atman(source: Path) -> dict:
    """Analyze an ATMAN footage directory using Gemini Flash LLM normalization."""
    all_files = _scan_directory(source)
    if not all_files:
        return {
            "source_path": str(source),
            "package_type": "atman",
            "total_files": 0,
            "total_size_bytes": 0,
            "subjects": [],
        }

    file_facts = {
        "package_root": source.name,
        "file_count": len(all_files),
        "files": all_files,
    }

    manifest = _call_gemini(file_facts)

    manifest_lookup = {}
    for entry in manifest:
        sp = entry.get("source_path", "")
        tp = entry.get("target_path", "")
        manifest_lookup[sp] = _parse_target_path(tp)

    manifest_lookup = _validate_subject_assignments(manifest_lookup, all_files)
    manifest_lookup = _match_shared_by_filename(manifest_lookup, all_files)

    files_by_subject: dict[str, list[dict]] = defaultdict(list)
    total_size = 0

    for file_info in all_files:
        rel_path = file_info["path"]
        size = int(file_info["size_mb"] * 1024 * 1024)
        total_size += size

        parsed = manifest_lookup.get(rel_path, {"subject": "shared", "camera": "cam_a", "asset_type": "raw"})
        if file_info["is_video"]:
            ftype = "video"
        elif file_info.get("is_audio"):
            ftype = "audio"
        else:
            ftype = "image"

        file_entry = {
            "original_path": rel_path,
            "file_type": ftype,
            "size_bytes": size,
            "subject": parsed["subject"],
            "camera": parsed["camera"],
            "asset_type": parsed["asset_type"],
            "selected": True,
        }
        files_by_subject[parsed["subject"]].append(file_entry)

    subjects = []
    for name, files in sorted(files_by_subject.items()):
        subj_size = sum(f["size_bytes"] for f in files)
        subjects.append(
            {
                "name": name,
                "file_count": len(files),
                "total_size_bytes": subj_size,
                "files": files,
            }
        )

    return {
        "source_path": str(source),
        "package_type": "atman",
        "total_files": sum(s["file_count"] for s in subjects),
        "total_size_bytes": total_size,
        "subjects": subjects,
    }


def analyze_path(source_path: str) -> dict:
    """Scan a directory and return an analysis result.

    Auto-detects package type (VFX vs ATMAN) and uses the appropriate
    analysis strategy.
    """
    source = Path(source_path).resolve()
    if not source.is_dir():
        raise ValueError(f"Path is not a directory: {source}")

    package_type = detect_package_type(source)
    logger.info("Detected package type: %s for %s", package_type, source)

    if package_type == "vfx":
        return _analyze_vfx(source)
    else:
        return _analyze_atman(source)
