"""scripts/video_compress.py — video compression to 17 Ref §一 spec: MP4, <25MB,
ideally <=15s (else <=30s).

Ported near-verbatim from classifier/video_compress.py; only the __main__ CLI
wrapper changed, to accept a target size argument (argv: input path, target size
MB, output path) and print a JSON result to stdout, per the platform design
(PSD/video processing invoked as bundled Python CLI scripts via Node
child_process — see 28 Technical Plan §5/§7).

Two-pass bitrate-targeted encode: ffprobe gets duration, then
target_bitrate = (target_size_bytes * 8 / duration) - audio_bitrate, with a
safety margin so container overhead doesn't push the result over budget.
Verified end-to-end against a real 58.5MB/48.3s CAM ticket source file
(2026-09-03, see classifier/test_video_compress.py) — not yet re-verified
end-to-end in this repo (ffmpeg not exercised here, see README).
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

AUDIO_BITRATE_KBPS = 96
SAFETY_MARGIN = 0.92  # leave headroom for container/muxing overhead


def ffprobe_duration_sec(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", path],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(out.stdout)["format"]["duration"])


def compute_target_video_bitrate_kbps(duration_sec: float, target_size_mb: float = 25) -> float:
    target_bits = target_size_mb * 8 * 1024 * 1024 * SAFETY_MARGIN
    total_kbps = target_bits / duration_sec / 1000
    video_kbps = total_kbps - AUDIO_BITRATE_KBPS
    if video_kbps <= 0:
        raise ValueError(
            f"target_size_mb={target_size_mb} too small for duration_sec={duration_sec:.1f} "
            f"even with audio stripped — clip needs trimming first, not just re-encoding"
        )
    return video_kbps


def compress_video(input_path: str, output_path: str, target_size_mb: float = 25) -> dict:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found on PATH")

    duration = ffprobe_duration_sec(input_path)
    video_kbps = compute_target_video_bitrate_kbps(duration, target_size_mb)

    passlog = str(Path(output_path).with_suffix(".passlog"))
    common = ["-c:v", "libx264", "-b:v", f"{video_kbps:.0f}k", "-preset", "medium"]

    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, *common, "-pass", "1", "-passlogfile", passlog,
         "-an", "-f", "mp4", "/dev/null"],
        capture_output=True, text=True, check=True,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, *common, "-pass", "2", "-passlogfile", passlog,
         "-c:a", "aac", "-b:a", f"{AUDIO_BITRATE_KBPS}k", output_path],
        capture_output=True, text=True, check=True,
    )
    for p in Path(output_path).parent.glob(Path(passlog).name + "*"):
        p.unlink()

    out_size = Path(output_path).stat().st_size
    return {
        "duration_sec": duration,
        "target_video_kbps": round(video_kbps),
        "output_size_bytes": out_size,
        "output_size_mb": round(out_size / 1024 / 1024, 2),
        "within_spec": out_size <= target_size_mb * 1024 * 1024,
    }


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(json.dumps({
            "error": "usage: python video_compress.py <input.mp4> <target_size_mb> <output.mp4>",
        }))
        sys.exit(1)
    input_path, target_size_mb_arg, output_path = sys.argv[1], sys.argv[2], sys.argv[3]
    try:
        result = compress_video(input_path, output_path, target_size_mb=float(target_size_mb_arg))
        print(json.dumps(result, indent=2))
    except Exception as e:  # noqa: BLE001 - always emit JSON, even on failure, for the Node caller
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
