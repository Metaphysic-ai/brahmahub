"""Media probing (ffprobe) and proxy/thumbnail generation (ffmpeg)."""

import json
import logging
import mimetypes
import subprocess
from pathlib import Path

from rich.console import Console

console = Console()
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
    ".r3d",  # RED raw
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
    ".dng",  # RAW camera formats
}

# Codecs that browsers can't play natively → need proxy
NON_WEB_VIDEO_CODECS = {
    "prores",
    "dnxhd",
    "dnxhr",
    "cfhd",
    "v210",
    "rawvideo",
    "ffv1",
    "huffyuv",
    "mjpeg",
    "mpeg2video",
    "r210",
}


def classify_file(path: Path) -> str:
    """Classify a file as 'video', 'image', or 'other'."""
    ext = path.suffix.lower()
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in IMAGE_EXTENSIONS:
        return "image"
    return "other"


def get_mime_type(path: Path) -> str | None:
    """Get MIME type for a file."""
    mime, _ = mimetypes.guess_type(str(path))
    return mime


def _run_ffprobe(filepath: str) -> dict | None:
    """Run ffprobe and return parsed JSON output."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(filepath),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
        return None


def probe_video(filepath: Path) -> dict:
    """Extract metadata from a video file via ffprobe."""
    info = _run_ffprobe(str(filepath))
    if not info:
        return {
            "width": None,
            "height": None,
            "duration_seconds": None,
            "codec": None,
            "metadata": {},
        }

    video_stream = None
    audio_stream = None
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "video" and not video_stream:
            video_stream = stream
        if stream.get("codec_type") == "audio" and not audio_stream:
            audio_stream = stream

    fmt = info.get("format", {})
    duration = None
    if fmt.get("duration"):
        try:
            duration = float(fmt["duration"])
        except (ValueError, TypeError):
            pass

    codec_name = video_stream.get("codec_name", "") if video_stream else ""

    result = {
        "width": video_stream.get("width") if video_stream else None,
        "height": video_stream.get("height") if video_stream else None,
        "duration_seconds": duration,
        "codec": codec_name,
        "needs_proxy": codec_name.lower() in NON_WEB_VIDEO_CODECS,
        "metadata": {
            "fps": _parse_fps(video_stream.get("r_frame_rate", "")) if video_stream else None,
            "pixel_format": video_stream.get("pix_fmt") if video_stream else None,
            "color_space": video_stream.get("color_space") if video_stream else None,
            "bitrate": int(fmt.get("bit_rate", 0)) if fmt.get("bit_rate") else None,
            "audio_codec": audio_stream.get("codec_name") if audio_stream else None,
            "audio_sample_rate": audio_stream.get("sample_rate") if audio_stream else None,
            "container_format": fmt.get("format_name"),
        },
    }

    tags = {**fmt.get("tags", {}), **(video_stream.get("tags", {}) if video_stream else {})}
    camera = tags.get("make", "") or tags.get("com.apple.quicktime.make", "")
    model = tags.get("model", "") or tags.get("com.apple.quicktime.model", "")
    if camera or model:
        result["camera"] = f"{camera} {model}".strip()
    else:
        result["camera"] = None

    return result


def probe_audio(filepath: Path) -> dict:
    """Extract metadata from an audio file via ffprobe."""
    info = _run_ffprobe(str(filepath))
    if not info:
        return {
            "width": None,
            "height": None,
            "duration_seconds": None,
            "codec": None,
            "camera": None,
            "metadata": {},
        }

    audio_stream = None
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "audio" and not audio_stream:
            audio_stream = stream

    fmt = info.get("format", {})
    duration = None
    if fmt.get("duration"):
        try:
            duration = float(fmt["duration"])
        except (ValueError, TypeError):
            pass

    return {
        "width": None,
        "height": None,
        "duration_seconds": duration,
        "codec": audio_stream.get("codec_name") if audio_stream else None,
        "camera": None,
        "metadata": {
            "sample_rate": audio_stream.get("sample_rate") if audio_stream else None,
            "channels": int(audio_stream.get("channels", 0)) if audio_stream else None,
            "bitrate": int(fmt.get("bit_rate", 0)) if fmt.get("bit_rate") else None,
            "container_format": fmt.get("format_name"),
        },
    }


def probe_image(filepath: Path) -> dict:
    """Extract metadata from an image file."""
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS

        with Image.open(filepath) as img:
            width, height = img.size
            exif_data = {}
            raw_exif = img.getexif()
            if raw_exif:
                for tag_id, value in raw_exif.items():
                    tag_name = TAGS.get(tag_id, str(tag_id))
                    try:
                        exif_data[tag_name] = str(value)
                    except Exception:
                        pass

            camera = None
            make = exif_data.get("Make", "")
            model = exif_data.get("Model", "")
            if make or model:
                camera = f"{make} {model}".strip()

            return {
                "width": width,
                "height": height,
                "duration_seconds": None,
                "codec": img.format,
                "camera": camera,
                "metadata": {
                    "color_mode": img.mode,
                    "has_alpha": img.mode in ("RGBA", "LA", "PA"),
                    "exif": {k: v for k, v in list(exif_data.items())[:20]},  # limit
                },
            }
    except Exception as e:
        console.print(f"  [yellow]⚠ Could not probe image {filepath.name}: {e}[/]")
        return {
            "width": None,
            "height": None,
            "duration_seconds": None,
            "codec": None,
            "camera": None,
            "metadata": {},
        }


def _parse_fps(fps_str: str) -> float | None:
    """Parse fractional FPS string like '24000/1001'."""
    if not fps_str:
        return None
    try:
        if "/" in fps_str:
            num, den = fps_str.split("/")
            return round(float(num) / float(den), 3)
        return round(float(fps_str), 3)
    except (ValueError, ZeroDivisionError):
        return None


def generate_video_proxy(
    source: Path,
    output_dir: Path,
    max_height: int = 720,
    crf: int = 23,
) -> Path | None:
    """Generate a web-playable MP4 proxy from a video file.

    Returns the path to the proxy file, or None on failure.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    proxy_name = f"{source.stem}_proxy.mp4"
    proxy_path = output_dir / proxy_name

    if proxy_path.exists():
        return proxy_path

    try:
        # Scale to max_height, keep aspect ratio, ensure even dimensions
        scale_filter = f"scale=-2:'min({max_height},ih)':flags=lanczos,pad=ceil(iw/2)*2:ceil(ih/2)*2"

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(source),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            str(crf),
            "-vf",
            scale_filter,
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            "-pix_fmt",
            "yuv420p",
            str(proxy_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

        if result.returncode != 0:
            console.print(f"  [red]✗ Proxy generation failed for {source.name}[/]")
            if proxy_path.exists():
                proxy_path.unlink()
            return None

        return proxy_path

    except subprocess.TimeoutExpired:
        console.print(f"  [red]✗ Proxy generation timed out for {source.name}[/]")
        if proxy_path.exists():
            proxy_path.unlink()
        return None


def generate_video_thumbnail(
    source: Path,
    output_dir: Path,
    timestamp: str = "00:00:01",
    size: str = "480:-2",
) -> Path | None:
    """Extract a single frame as a JPEG thumbnail from a video."""
    output_dir.mkdir(parents=True, exist_ok=True)
    thumb_name = f"{source.stem}_thumb.jpg"
    thumb_path = output_dir / thumb_name

    if thumb_path.exists():
        return thumb_path

    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            timestamp,
            "-i",
            str(source),
            "-vframes",
            "1",
            "-vf",
            f"scale={size}",
            "-q:v",
            "2",
            str(thumb_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode != 0 or not thumb_path.exists():
            logger.warning(
                "Video thumbnail failed for %s: %s",
                source.name,
                result.stderr[-500:] if result.stderr else "unknown error",
            )
            return None
        return thumb_path

    except subprocess.TimeoutExpired:
        logger.warning("Video thumbnail timed out for %s", source.name)
        if thumb_path.exists():
            thumb_path.unlink()
        return None


def generate_image_proxy(
    source: Path,
    output_dir: Path,
    max_size: int = 1920,
    quality: int = 85,
) -> Path | None:
    """Generate a web-sized JPEG proxy from an image."""
    output_dir.mkdir(parents=True, exist_ok=True)
    proxy_name = f"{source.stem}_proxy.jpg"
    proxy_path = output_dir / proxy_name

    if proxy_path.exists():
        return proxy_path

    try:
        from PIL import Image

        with Image.open(source) as img:
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            if max(img.size) > max_size:
                img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            img.save(proxy_path, "JPEG", quality=quality, optimize=True)
            return proxy_path

    except Exception as e:
        console.print(f"  [yellow]⚠ Image proxy failed for {source.name}: {e}[/]")
        return None


def generate_image_thumbnail(
    source: Path,
    output_dir: Path,
    size: int = 480,
    quality: int = 80,
) -> Path | None:
    """Generate a small JPEG thumbnail from an image."""
    output_dir.mkdir(parents=True, exist_ok=True)
    thumb_name = f"{source.stem}_thumb.jpg"
    thumb_path = output_dir / thumb_name

    if thumb_path.exists():
        return thumb_path

    try:
        from PIL import Image

        with Image.open(source) as img:
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.thumbnail((size, size), Image.Resampling.LANCZOS)
            img.save(thumb_path, "JPEG", quality=quality)
            return thumb_path

    except Exception as e:
        logger.warning("Image thumbnail failed for %s: %s", source.name, e)
        return None
