"""Dataset directory matching and symlink creation."""

import logging
from difflib import SequenceMatcher
from pathlib import Path

logger = logging.getLogger(__name__)


def _normalize(name: str) -> str:
    """Lowercase, replace separators with spaces, strip."""
    return name.lower().replace("_", " ").replace("-", " ").strip()


def list_dataset_dirs(datasets_root: str) -> list[str]:
    """Return sorted list of directory names under datasets_root."""
    root = Path(datasets_root)
    if not root.is_dir():
        return []
    return sorted(entry.name for entry in root.iterdir() if entry.is_dir())


def fuzzy_match_dataset(
    subject_name: str,
    dataset_dirs: list[str],
) -> list[dict]:
    """Match a subject name against dataset directory names.

    Returns ranked list of {"dir_name", "score", "match_type"}.
    Uses 4-tier matching: exact → prefix → substring → fuzzy.
    """
    norm_subj = _normalize(subject_name)
    if not norm_subj:
        return []

    candidates: list[dict] = []
    seen: set[str] = set()

    for d in dataset_dirs:
        norm_d = _normalize(d)

        # Exact
        if norm_d == norm_subj:
            return [{"dir_name": d, "score": 1.0, "match_type": "exact"}]

        # Prefix — either direction
        if norm_d.startswith(norm_subj) or norm_subj.startswith(norm_d):
            if d not in seen:
                candidates.append({"dir_name": d, "score": 0.9, "match_type": "prefix"})
                seen.add(d)
            continue

        # Substring — either direction
        if norm_subj in norm_d or norm_d in norm_subj:
            if d not in seen:
                candidates.append({"dir_name": d, "score": 0.8, "match_type": "substring"})
                seen.add(d)
            continue

        # Fuzzy — SequenceMatcher on full name + first token
        ratio_full = SequenceMatcher(None, norm_subj, norm_d).ratio()

        # First-token comparison: only when both tokens ≥ 3 chars
        first_subj = norm_subj.split()[0] if norm_subj.split() else norm_subj
        first_d = norm_d.split()[0] if norm_d.split() else norm_d
        best = ratio_full
        if len(first_subj) >= 3 and len(first_d) >= 3:
            ratio_first = SequenceMatcher(None, first_subj, first_d).ratio()
            if ratio_first >= 0.8:
                best = max(best, ratio_first)

        if best >= 0.75 and d not in seen:
            candidates.append({"dir_name": d, "score": round(best, 3), "match_type": "fuzzy"})
            seen.add(d)

    candidates.sort(key=lambda c: (-c["score"], c["dir_name"]))
    return candidates[:5]


# Audio file extensions for media_type classification
_AUDIO_EXTS = {".wav", ".mp3", ".aac", ".flac", ".ogg", ".m4a", ".aiff", ".wma"}


def create_dataset_symlinks(
    dataset_dir: str,
    package_name: str,
    assets: list[dict],
) -> dict:
    """Create symlinks from dataset directory back to source files.

    Each asset dict should have: original_path, file_type, asset_type.

    Symlink structure:
      {dataset_dir}/media/external/from_client/{package_name}/{media_type}/{asset_type}/{filename}

    Returns {"created": int, "skipped": int, "errors": list[str]}.
    """
    created = 0
    skipped = 0
    errors: list[str] = []

    # Sanitize path components to prevent directory traversal
    safe_pkg = Path(package_name).name
    base = Path(dataset_dir).resolve() / "media" / "external" / "from_client" / safe_pkg

    for asset in assets:
        src = Path(asset["original_path"])
        ext = src.suffix.lower()

        media_type = "audio" if (asset.get("file_type") == "audio" or ext in _AUDIO_EXTS) else "visuals"
        safe_asset_type = Path(asset.get("asset_type", "raw")).name

        target = base / media_type / safe_asset_type / src.name
        # Ensure target stays within the dataset directory
        try:
            target.parent.resolve().relative_to(base.resolve())
        except ValueError:
            errors.append(f"{src.name}: path escapes dataset directory")
            continue

        try:
            target.parent.mkdir(parents=True, exist_ok=True)

            if target.is_symlink():
                if target.resolve() == src.resolve():
                    skipped += 1
                    continue
                # Different target — remove stale link
                target.unlink()

            target.symlink_to(src)
            created += 1

        except Exception as e:
            msg = f"{src.name}: {e}"
            errors.append(msg)
            logger.warning("Symlink error for %s: %s", src.name, e)

    logger.info(
        "Dataset symlinks for %s/%s: created=%d skipped=%d errors=%d",
        Path(dataset_dir).name,
        package_name,
        created,
        skipped,
        len(errors),
    )
    return {"created": created, "skipped": skipped, "errors": errors}
