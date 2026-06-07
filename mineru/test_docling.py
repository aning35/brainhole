import sys
import os

# Use HuggingFace mirror
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

# Monkey-patch huggingface_hub.snapshot_download to handle hf-mirror.com
# The mirror doesn't return proper commit_hash/etag in HTTP headers,
# causing huggingface_hub >= 0.35 to reject the download.
# Strategy: if the standard download fails, check for locally cached models
# in snapshots/main/ (previously downloaded) and return that path.
from pathlib import Path
import huggingface_hub._snapshot_download as _hf_snap
from huggingface_hub.constants import HF_HUB_CACHE

_original_snapshot_download = _hf_snap.snapshot_download.__wrapped__ if hasattr(_hf_snap.snapshot_download, '__wrapped__') else None

def _patched_snapshot_download(repo_id, *, repo_type=None, revision=None, local_dir=None, **kwargs):
    """Try normal download first; on failure, fall back to local cache."""
    try:
        if _original_snapshot_download:
            return _original_snapshot_download(repo_id, repo_type=repo_type, revision=revision, local_dir=local_dir, **kwargs)
        else:
            from huggingface_hub import snapshot_download as _orig_sd
            return _orig_sd(repo_id, repo_type=repo_type, revision=revision, local_dir=local_dir, **kwargs)
    except Exception as e:
        print(f"  [HF-mirror-patch] snapshot_download failed: {type(e).__name__}: {e}")
        
        # Try to find a cached version
        if local_dir:
            local_path = Path(local_dir)
            if local_path.exists() and any(local_path.iterdir()):
                print(f"  [HF-mirror-patch] Using local_dir: {local_path}")
                return str(local_path)
        
        # Check HF cache directory
        repo_type_prefix = repo_type or "model"
        storage_folder = Path(HF_HUB_CACHE) / f"{repo_type_prefix}s--{repo_id.replace('/', '--')}"
        snapshots_dir = storage_folder / "snapshots"
        
        if snapshots_dir.exists():
            # Try 'main' first, then any other snapshot
            main_dir = snapshots_dir / "main"
            if main_dir.exists() and any(main_dir.iterdir()):
                print(f"  [HF-mirror-patch] Using cached snapshot: {main_dir}")
                return str(main_dir)
            
            for snap in sorted(snapshots_dir.iterdir()):
                if snap.is_dir() and any(snap.iterdir()):
                    print(f"  [HF-mirror-patch] Using cached snapshot: {snap}")
                    return str(snap)
        
        raise  # re-raise if no local cache found

# Patch at the docling level where it's called
import docling.models.utils.hf_model_download as _docling_dl
from huggingface_hub import snapshot_download as _orig_sd_ref

def _patched_download_hf_model(repo_id, local_dir=None, force=False, progress=False, revision=None):
    from huggingface_hub.utils import disable_progress_bars
    if not progress:
        disable_progress_bars()
    
    try:
        download_path = _orig_sd_ref(
            repo_id=repo_id,
            force_download=force,
            local_dir=local_dir,
            revision=revision,
        )
        return Path(download_path)
    except Exception as e:
        print(f"  [HF-mirror-patch] download_hf_model failed for {repo_id}: {type(e).__name__}")
        
        # Fall back to local cache
        if local_dir:
            local_path = Path(local_dir)
            if local_path.exists() and any(local_path.iterdir()):
                print(f"  [HF-mirror-patch] Using local_dir: {local_path}")
                return local_path
        
        repo_type_prefix = "model"
        storage_folder = Path(HF_HUB_CACHE) / f"{repo_type_prefix}s--{repo_id.replace('/', '--')}"
        snapshots_dir = storage_folder / "snapshots"
        
        if snapshots_dir.exists():
            main_dir = snapshots_dir / "main"
            if main_dir.exists() and any(main_dir.iterdir()):
                print(f"  [HF-mirror-patch] Using cached: {main_dir}")
                return main_dir
            for snap in sorted(snapshots_dir.iterdir()):
                if snap.is_dir() and any(snap.iterdir()):
                    print(f"  [HF-mirror-patch] Using cached: {snap}")
                    return snap
        
        raise

_docling_dl.download_hf_model = _patched_download_hf_model

from docling.document_converter import DocumentConverter

def main():
    input_path = "/Users/huihui/Brainhole_Demo_Vault/03_资料库/研报/劳动能力鉴定 职工工伤与职业病致残等级 16180-2014-gbt-e-300.pdf"
    
    print(f"[Docling] Parsing: {input_path}")
    
    converter = DocumentConverter()
    result = converter.convert(input_path)
    markdown = result.document.export_to_markdown()
    
    output_path = "/tmp/test_docling.md"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown)
    
    print(f"[Docling] Output written to: {output_path}")
    print(f"[Docling] Total chars: {len(markdown)}")
    print(f"\n--- First 500 chars ---")
    print(markdown[:500])
    print(f"\n--- Chars 3000-3500 ---")
    print(markdown[3000:3500])
    print(f"\n--- Last 500 chars ---")
    print(markdown[-500:])

if __name__ == "__main__":
    main()
