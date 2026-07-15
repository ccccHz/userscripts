#!/usr/bin/env python3
"""Create a portable, cleaned Tampermonkey import archive."""

from __future__ import annotations

import argparse
import json
import re
import time
import zipfile
from pathlib import Path


MIGRATED = {
    "斗鱼每日自动保底续荧光棒": "auto-fans-continue",
    "抖音直播优化": "douyin-live-optimizer",
    "huya extend": "huya-extend",
    "快手直播优化": "kuaishou-live-optimizer",
    "skip ads": "skip-ads",
    "wikipedia auto dark": "wikipedia-auto-dark",
}

REMOTE_RETAINED = {
    "DouyuEx-斗鱼直播间增强插件",
    "「CSDNGreener」🍃CSDN广告完全过滤-免登录-个性化排版-最强老牌脚本-持续更新",
    "Bilibili Evolved",
    "dl-librescore",
    "Twitter Block Porn",
    "网盘直链下载助手",
    "微博PC直播弹幕助手",
    "小红书PC端直播美化脚本",
}


def parse_args() -> argparse.Namespace:
    workspace = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="原始 Tampermonkey 导出 ZIP")
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=workspace / "artifacts" / "tampermonkey-clean.zip",
        help="清理后 ZIP 输出路径",
    )
    return parser.parse_args()


def metadata(script: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for key, value in re.findall(r"^//\s+@([\w-]+)\s+(.+?)\s*$", script, re.MULTILINE):
        result.setdefault(key, []).append(value)
    return result


def update_options(raw: bytes, script: str) -> bytes:
    data = json.loads(raw)
    meta = metadata(script)
    options = data.setdefault("options", {})
    options["check_for_updates"] = True
    override = options.setdefault("override", {})
    for field, key in (
        ("orig_connects", "connect"),
        ("orig_excludes", "exclude"),
        ("orig_includes", "include"),
        ("orig_matches", "match"),
        ("orig_tags", "tag"),
    ):
        override[field] = meta.get(key, [])
    override["orig_noframes"] = True if "noframes" in meta else None
    override["orig_run_at"] = meta.get("run-at", ["document-idle"])[0]
    override["orig_run_in"] = meta.get("run-in", [])

    data.setdefault("settings", {})["enabled"] = True
    exported_meta = data.setdefault("meta", {})
    exported_meta["name"] = meta["name"][0]
    exported_meta["modified"] = int(time.time() * 1000)
    exported_meta["file_url"] = meta["downloadURL"][0]
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode()


def copy_remote_entries(source: zipfile.ZipFile, target: zipfile.ZipFile) -> list[str]:
    copied = []
    prefixes = tuple(f"{name}.user.js-" for name in REMOTE_RETAINED)
    exact = {
        f"{name}{suffix}"
        for name in REMOTE_RETAINED
        for suffix in (".user.js", ".options.json", ".storage.json")
    }
    for info in source.infolist():
        if info.filename in exact or info.filename.startswith(prefixes):
            target.writestr(info, source.read(info))
            copied.append(info.filename)
    return copied


def write_migrated_entries(
    source: zipfile.ZipFile,
    target: zipfile.ZipFile,
    workspace: Path,
) -> list[dict[str, str]]:
    releases = []
    for export_name, package_name in MIGRATED.items():
        dist_path = workspace / "packages" / package_name / "dist" / f"{package_name}.user.js"
        script = dist_path.read_text()
        meta = metadata(script)
        if not meta.get("updateURL") or not meta.get("downloadURL"):
            raise ValueError(f"{package_name} 构建产物缺少远程更新 metadata")

        target.writestr(f"{export_name}.user.js", script.encode())
        options_name = f"{export_name}.options.json"
        target.writestr(
            options_name,
            update_options(source.read(options_name), script),
        )
        storage_name = f"{export_name}.storage.json"
        target.writestr(storage_name, source.read(storage_name))
        releases.append(
            {
                "name": export_name,
                "package": package_name,
                "version": meta["version"][0],
                "updateURL": meta["updateURL"][0],
                "downloadURL": meta["downloadURL"][0],
            }
        )
    return releases


def main() -> None:
    args = parse_args()
    workspace = Path(__file__).resolve().parents[1]
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.source) as source, zipfile.ZipFile(
        args.output, "w", zipfile.ZIP_DEFLATED
    ) as target:
        copied = copy_remote_entries(source, target)
        releases = write_migrated_entries(source, target, workspace)

    report_path = args.output.with_suffix(".json")
    report = {
        "source": str(args.source),
        "output": str(args.output),
        "migrated": releases,
        "remote_retained": sorted(REMOTE_RETAINED),
        "remote_retained_files": len(copied),
        "script_count": len(MIGRATED) + len(REMOTE_RETAINED),
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"已生成 {args.output}，共 {report['script_count']} 个脚本。")
    print(f"清单：{report_path}")


if __name__ == "__main__":
    main()
