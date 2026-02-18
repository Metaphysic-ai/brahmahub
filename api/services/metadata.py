"""PNG face metadata extraction.

Reads embedded metadata from aligned face PNGs. Supports two formats:
- fcWp chunks: pickle-serialized dicts from SWF3D pipeline
- tEXt chunks: JSON-encoded DFL headers from DeepFaceLab pipeline

Adapted from backend/app/services/metadata.py.
"""

import json
import pickle
import struct
from pathlib import Path
from typing import Union


def read_face_metadata(png_path: Union[Path, str]) -> dict:
    """Read face metadata from a PNG file.

    Returns a normalized dict with keys: pitch, yaw, roll, source_filename,
    landmarks, confidence/sharpness, etc. Returns empty dict if no metadata found.
    """
    png_path = Path(png_path)
    try:
        with open(png_path, "rb") as f:
            sig = f.read(8)
            if sig != b"\x89PNG\r\n\x1a\n":
                return {}

            while True:
                length_bytes = f.read(4)
                if len(length_bytes) < 4:
                    break
                length = struct.unpack(">I", length_bytes)[0]
                chunk_type = f.read(4)
                chunk_data = f.read(length)
                _crc = f.read(4)  # skip CRC

                if chunk_type == b"IEND":
                    break

                if chunk_type == b"fcWp":
                    return _parse_fcwp(chunk_data)

                if chunk_type == b"tEXt":
                    result = _parse_dfl_text(chunk_data)
                    if result:
                        return result

    except (FileNotFoundError, IOError):
        return {}

    return {}


class _NumpyArrayStub:
    """Stub for numpy.ndarray when numpy is not installed."""

    def __init__(self, *args, **kwargs):
        self._data = []

    def __setstate__(self, state):
        # numpy array pickle state: (version, shape, dtype, is_fortran, raw_data)
        pass

    def tolist(self):
        return self._data

    def __len__(self):
        return 0

    def __iter__(self):
        return iter(self._data)

    def __getitem__(self, idx):
        return self._data[idx] if self._data else 0


class _NumpyDtypeStub:
    """Stub for numpy.dtype when numpy is not installed."""

    def __init__(self, *args, **kwargs):
        pass

    def __setstate__(self, state):
        pass


def _numpy_reconstruct(subtype, shape, dtype):
    """Stub for numpy.core.multiarray._reconstruct."""
    return _NumpyArrayStub()


_NUMPY_STUBS = {
    ("numpy", "ndarray"): _NumpyArrayStub,
    ("numpy", "dtype"): _NumpyDtypeStub,
    ("numpy.core.multiarray", "_reconstruct"): _numpy_reconstruct,
}


class _NumpySafeUnpickler(pickle.Unpickler):
    """Unpickler that handles numpy types without requiring numpy installed."""

    def find_class(self, module: str, name: str):
        stub = _NUMPY_STUBS.get((module, name))
        if stub is not None:
            return stub
        if module.startswith("numpy"):
            return _NumpyArrayStub
        return super().find_class(module, name)


def _parse_fcwp(data: bytes) -> dict:
    """Parse fcWp pickle chunk into a normalized metadata dict."""
    import io
    try:
        raw = _NumpySafeUnpickler(io.BytesIO(data)).load()
    except Exception:
        return {}

    result: dict = {}

    pose = raw.get("pose")
    if pose and len(pose) >= 3:
        result["pitch"] = float(pose[0])
        result["yaw"] = float(pose[1])
        result["roll"] = float(pose[2])

    result["source_filename"] = raw.get("source_filename")
    result["source_filepath"] = raw.get("source_filepath")
    result["face_type"] = raw.get("face_type")

    source_size = raw.get("source_size")
    if source_size and len(source_size) >= 2:
        result["source_width"] = int(source_size[0])
        result["source_height"] = int(source_size[1])

    landmarks = raw.get("source_landmarks", raw.get("landmarks"))
    if landmarks is not None:
        try:
            result["landmarks"] = landmarks.tolist()
        except AttributeError:
            result["landmarks"] = landmarks

    for key in ("sharpness", "pureness", "brightness", "hue", "black"):
        val = raw.get(key)
        if val is not None:
            result[key] = float(val)

    if "sharpness" in result and "confidence" not in result:
        result["confidence"] = result["sharpness"]

    return result


def _parse_dfl_text(chunk_data: bytes) -> dict:
    """Parse a tEXt chunk looking for dfl_header JSON."""
    try:
        null_idx = chunk_data.index(b"\x00")
        key = chunk_data[:null_idx].decode("latin-1")
        value = chunk_data[null_idx + 1:].decode("latin-1")
    except (ValueError, UnicodeDecodeError):
        return {}
    if key == "dfl_header":
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {}
    return {}
