#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import mimetypes
import os
from pathlib import Path
from typing import Dict, Iterable

from qcloud_cos import CosConfig
from qcloud_cos import CosS3Client


REQUIRED_ENV_KEYS = (
    "SALESBOAT_COS_SECRET_ID",
    "SALESBOAT_COS_SECRET_KEY",
    "SALESBOAT_COS_REGION",
    "SALESBOAT_COS_BUCKET",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mirror local assets to Tencent COS.")
    parser.add_argument("--source", required=True, help="Local directory to upload.")
    parser.add_argument("--prefix", default="", help="Remote key prefix, e.g. gltf")
    parser.add_argument("--env-file", default="", help="Optional env file with COS credentials.")
    return parser.parse_args()


def load_env_file(env_file: str) -> None:
    if not env_file:
        return

    path = Path(env_file)
    if not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def require_env() -> Dict[str, str]:
    values: Dict[str, str] = {}
    missing = []
    for key in REQUIRED_ENV_KEYS:
        value = os.environ.get(key, "").strip()
        if not value:
            missing.append(key)
            continue
        values[key] = value

    if missing:
        raise RuntimeError(f"missing required COS env vars: {', '.join(missing)}")

    return values


def normalize_prefix(prefix: str) -> str:
    normalized = prefix.strip().strip("/")
    return normalized


def iter_local_files(source_dir: Path) -> Iterable[Path]:
    for path in sorted(source_dir.rglob("*")):
        if path.is_file():
            yield path


def compute_md5(file_path: Path) -> str:
    digest = hashlib.md5()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_local_index(source_dir: Path, prefix: str) -> Dict[str, Dict[str, object]]:
    local_index: Dict[str, Dict[str, object]] = {}
    for file_path in iter_local_files(source_dir):
        relative_path = file_path.relative_to(source_dir).as_posix()
        remote_key = f"{prefix}/{relative_path}" if prefix else relative_path
        local_index[remote_key] = {
            "path": file_path,
            "size": file_path.stat().st_size,
        }
    return local_index


def build_remote_index(client: CosS3Client, bucket: str, prefix: str) -> Dict[str, Dict[str, object]]:
    remote_index: Dict[str, Dict[str, object]] = {}
    marker = ""

    while True:
        response = client.list_objects(Bucket=bucket, Prefix=prefix, Marker=marker, MaxKeys=1000)
        for entry in response.get("Contents", []):
            key = entry["Key"]
            remote_index[key] = {
                "etag": str(entry.get("ETag", "")).strip('"'),
                "size": int(entry.get("Size", 0)),
            }

        truncated_flag = response.get("IsTruncated")
        if truncated_flag not in ("true", True):
            break

        marker = response.get("NextMarker", "")
        if not marker:
            break

    return remote_index


def upload_file(client: CosS3Client, bucket: str, key: str, file_path: Path) -> None:
    content_type, _ = mimetypes.guess_type(str(file_path))
    extra_headers = {}
    if content_type:
        extra_headers["ContentType"] = content_type

    with file_path.open("rb") as body:
        client.put_object(Bucket=bucket, Key=key, Body=body, **extra_headers)


def delete_keys(client: CosS3Client, bucket: str, keys: Iterable[str]) -> int:
    key_list = list(keys)
    if not key_list:
        return 0

    deleted_total = 0
    for start_index in range(0, len(key_list), 1000):
        chunk = key_list[start_index : start_index + 1000]
        client.delete_objects(
            Bucket=bucket,
            Delete={
                "Object": [{"Key": key} for key in chunk],
                "Quiet": "true",
            },
        )
        deleted_total += len(chunk)

    return deleted_total


def main() -> int:
    args = parse_args()
    load_env_file(args.env_file)
    env_values = require_env()

    source_dir = Path(args.source).resolve()
    if not source_dir.is_dir():
        raise RuntimeError(f"source directory does not exist: {source_dir}")

    prefix = normalize_prefix(args.prefix)
    config = CosConfig(
        Region=env_values["SALESBOAT_COS_REGION"],
        SecretId=env_values["SALESBOAT_COS_SECRET_ID"],
        SecretKey=env_values["SALESBOAT_COS_SECRET_KEY"],
        Scheme="https",
    )
    client = CosS3Client(config)
    bucket = env_values["SALESBOAT_COS_BUCKET"]

    local_index = build_local_index(source_dir, prefix)
    remote_index = build_remote_index(client, bucket, prefix)

    uploaded_count = 0
    skipped_count = 0
    for key, local_meta in local_index.items():
        remote_meta = remote_index.get(key)
        local_size = int(local_meta["size"])
        needs_upload = remote_meta is None or int(remote_meta.get("size", -1)) != local_size

        if not needs_upload:
            remote_etag = str(remote_meta.get("etag", "")).lower()
            if "-" in remote_etag:
                needs_upload = True
            else:
                needs_upload = compute_md5(local_meta["path"]).lower() != remote_etag

        if not needs_upload:
            skipped_count += 1
            continue

        upload_file(client, bucket, key, local_meta["path"])
        uploaded_count += 1

    stale_keys = sorted(set(remote_index.keys()) - set(local_index.keys()))
    deleted_count = delete_keys(client, bucket, stale_keys)

    print(
        f"[cos-sync] source={source_dir} prefix={prefix or '.'} uploaded={uploaded_count} "
        f"skipped={skipped_count} deleted={deleted_count}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
