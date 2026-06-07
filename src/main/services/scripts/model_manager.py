import os
import sys
import json
import shutil
import requests
import argparse
from pathlib import Path

# i18n message dictionary
MESSAGES = {
    "zh": {
        "downloading": "下载中 {size}MB",
        "fetchingTree": "获取模型结构...",
        "fetchTreeFailed": "获取模型结构失败: {error}",
        "downloadingFile": "下载文件 {name}...",
        "downloadFileFailed": "下载文件 {name} 失败: {error}",
        "downloadComplete": "下载完成",
        "hfDownloading": "正在通过 HuggingFace 原生下载...",
        "hfFailed": "HuggingFace 下载失败: {error}",
        "msDownloading": "正在通过 ModelScope 下载...",
        "msFailed": "ModelScope 下载失败: {error}",
        "funasrInit": "正在初始化 FunASR 以触发下载 (ModelScope)...",
        "funasrFailed": "FunASR 下载失败: {error}",
        "funasrHfUnsupported": "FunASR (paraformer-zh) 官方主要发布在 ModelScope，目前此选项只推荐使用 ModelScope。如需支持 HF 请通过代码修改。",
    },
    "en": {
        "downloading": "Downloading {size}MB",
        "fetchingTree": "Fetching model structure...",
        "fetchTreeFailed": "Failed to fetch model structure: {error}",
        "downloadingFile": "Downloading file {name}...",
        "downloadFileFailed": "Failed to download file {name}: {error}",
        "downloadComplete": "Download complete",
        "hfDownloading": "Downloading via HuggingFace native...",
        "hfFailed": "HuggingFace download failed: {error}",
        "msDownloading": "Downloading via ModelScope...",
        "msFailed": "ModelScope download failed: {error}",
        "funasrInit": "Initializing FunASR to trigger download (ModelScope)...",
        "funasrFailed": "FunASR download failed: {error}",
        "funasrHfUnsupported": "FunASR (paraformer-zh) is officially published on ModelScope. Only ModelScope source is supported. For HF support, code modification is needed.",
    }
}

_lang = "zh"

def set_lang(lang):
    global _lang
    _lang = lang if lang in MESSAGES else "zh"

def msg(key, **kwargs):
    text = MESSAGES.get(_lang, MESSAGES["zh"]).get(key, key)
    for k, v in kwargs.items():
        text = text.replace("{" + k + "}", str(v))
    return text

# Provide required tools to bypass HF mirror constraints or use ModelScope
def log_progress(task_id, progress, message):
    print(json.dumps({"type": "progress", "taskId": task_id, "progress": progress, "message": message}), flush=True)

def log_error(task_id, message):
    print(json.dumps({"type": "error", "taskId": task_id, "message": message}), flush=True)

def log_success(task_id, message):
    print(json.dumps({"type": "success", "taskId": task_id, "message": message}), flush=True)

def get_cache_size(path):
    total_size = 0
    if os.path.exists(path):
        for dirpath, _, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)
    return total_size

def check_status():
    status = {
        "funasr": {"installed": False, "size": 0, "path": ""},
        "mineru": {"installed": False, "size": 0, "path": ""},
        "docling": {"installed": False, "size": 0, "path": ""}
    }
    
    # Check FunASR — ModelScope caches in hub/iic (old) or hub/models/iic (new SDK)
    funasr_candidates = [
        os.path.expanduser("~/.cache/modelscope/hub/iic"),
        os.path.expanduser("~/.cache/modelscope/hub/models/iic"),
    ]
    funasr_size = 0
    funasr_path = ""
    for ms_iic_path in funasr_candidates:
        if os.path.exists(ms_iic_path):
            path_size = 0
            for d in os.listdir(ms_iic_path):
                if d.startswith("speech_") or d.startswith("punc_"):
                    d_path = os.path.join(ms_iic_path, d)
                    path_size += get_cache_size(d_path)
            if path_size > funasr_size:
                funasr_size = path_size
                funasr_path = ms_iic_path
    if funasr_size > 50_000_000: # At least 50MB
        status["funasr"] = {"installed": True, "size": funasr_size, "path": funasr_path}
        
    # Check MinerU
    mineru_hf = os.path.expanduser("~/.cache/huggingface/hub/models--opendatalab--pdf-extract-models")
    mineru_ms = os.path.expanduser("~/.cache/modelscope/hub/opendatalab/pdf-extract-models")
    
    if os.path.exists(mineru_hf) and get_cache_size(mineru_hf) > 100_000_000:
        status["mineru"] = {"installed": True, "size": get_cache_size(mineru_hf), "path": mineru_hf}
    elif os.path.exists(mineru_ms) and get_cache_size(mineru_ms) > 100_000_000:
        status["mineru"] = {"installed": True, "size": get_cache_size(mineru_ms), "path": mineru_ms}
        
    # Check Docling
    docling_hf = os.path.expanduser("~/.cache/huggingface/hub/models--docling-project--docling-layout-heron")
    if os.path.exists(docling_hf) and get_cache_size(docling_hf) > 50_000_000:
        status["docling"] = {"installed": True, "size": get_cache_size(docling_hf), "path": docling_hf}
        
    print(json.dumps({"type": "status", "data": status}), flush=True)

def download_file(url, local_path, task_id, total_size_mb, current_mb_offset):
    local_path = Path(local_path)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    
    response = requests.get(url, stream=True, timeout=10)
    response.raise_for_status()
    total_length = response.headers.get('content-length')
    
    if total_length is None:
        local_path.write_bytes(response.content)
        return
        
    total_length = int(total_length)
    downloaded = 0
    
    with open(local_path, 'wb') as f:
        for data in response.iter_content(chunk_size=4096):
            downloaded += len(data)
            f.write(data)
            if downloaded % (1024 * 1024) <= 4096: # Update roughly every MB
                dl_mb = downloaded / (1024 * 1024)
                total_mb_so_far = current_mb_offset + dl_mb
                prog = int((total_mb_so_far / total_size_mb) * 100) if total_size_mb > 0 else 0
                log_progress(task_id, min(prog, 99), msg("downloading", size=f"{dl_mb:.1f}"))

def download_huggingface_model(repo_id, task_id):
    # Fallback script to download from hf-mirror.com via raw API to avoid FileMetadataError
    api_url = f"https://hf-mirror.com/api/models/{repo_id}/tree/main"
    log_progress(task_id, 2, msg("fetchingTree"))
    try:
        resp = requests.get(api_url, timeout=10)
        resp.raise_for_status()
        tree = resp.json()
    except Exception as e:
        log_error(task_id, msg("fetchTreeFailed", error=str(e)))
        return False
        
    # Prepare cache dir structure
    namespace, model_name = repo_id.split("/")
    cache_dir = Path.home() / ".cache" / "huggingface" / "hub" / f"models--{namespace}--{model_name}"
    snapshots_dir = cache_dir / "snapshots" / "main"
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    
    files_to_download = [item for item in tree if item['type'] == 'file']
    total_size = sum(item.get('size', 0) for item in files_to_download)
    total_size_mb = total_size / (1024 * 1024)
    
    current_offset_mb = 0
    for i, file_item in enumerate(files_to_download):
        filename = file_item['path']
        download_url = f"https://hf-mirror.com/{repo_id}/resolve/main/{filename}"
        local_path = snapshots_dir / filename
        
        file_size_mb = file_item.get('size', 0) / (1024 * 1024)
        log_progress(task_id, int((current_offset_mb / total_size_mb) * 100) if total_size_mb > 0 else 50, msg("downloadingFile", name=filename))
        
        try:
            download_file(download_url, local_path, task_id, total_size_mb, current_offset_mb)
        except Exception as e:
            log_error(task_id, msg("downloadFileFailed", name=filename, error=str(e)))
            return False
            
        current_offset_mb += file_size_mb
        
    # Write a dummy refs/main to trick huggingface_hub
    refs_dir = cache_dir / "refs"
    refs_dir.mkdir(parents=True, exist_ok=True)
    (refs_dir / "main").write_text("main")
    
    log_success(task_id, msg("downloadComplete"))
    return True

def download_hf_native(repo_id, task_id):
    try:
        from huggingface_hub import snapshot_download
        log_progress(task_id, 5, msg("hfDownloading"))
        snapshot_download(repo_id)
        log_success(task_id, msg("downloadComplete"))
        return True
    except Exception as e:
        log_error(task_id, msg("hfFailed", error=str(e)))
        return False

def download_modelscope_model(repo_id, task_id):
    try:
        from modelscope.hub.snapshot_download import snapshot_download
        log_progress(task_id, 5, msg("msDownloading"))
        # Unfortunately modelscope doesn't expose easy progress callbacks via API, but it's fast
        snapshot_download(repo_id)
        log_success(task_id, msg("downloadComplete"))
        return True
    except Exception as e:
        log_error(task_id, msg("msFailed", error=str(e)))
        return False

def do_download(target, source, task_id):
    if target == "docling":
        # Docling
        if source == "hf-mirror":
            download_huggingface_model("docling-project/docling-layout-heron", task_id)
            download_huggingface_model("ds4sd/docling-models", task_id)
        elif source == "modelscope":
            download_modelscope_model("docling-project/docling-layout-heron", task_id)
            download_modelscope_model("ds4sd/docling-models", task_id)
        else: # huggingface
            download_hf_native("docling-project/docling-layout-heron", task_id)
            download_hf_native("ds4sd/docling-models", task_id)
            
    elif target == "mineru":
        if source == "modelscope":
            download_modelscope_model("opendatalab/pdf-extract-models", task_id)
        elif source == "hf-mirror":
            download_huggingface_model("opendatalab/pdf-extract-models", task_id)
        else: # huggingface
            download_hf_native("opendatalab/pdf-extract-models", task_id)
            
    elif target == "funasr":
        # FunASR triggers download by initializing model
        if source == "modelscope":
            try:
                from funasr import AutoModel
                log_progress(task_id, 10, msg("funasrInit"))
                AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc")
                log_success(task_id, msg("downloadComplete"))
            except Exception as e:
                log_error(task_id, msg("funasrFailed", error=str(e)))
        else:
            log_error(task_id, msg("funasrHfUnsupported"))

def do_delete(target):
    if target == "funasr":
        # Clean both old and new modelscope SDK cache paths
        for p in [
            os.path.expanduser("~/.cache/modelscope/hub/iic"),
            os.path.expanduser("~/.cache/modelscope/hub/models/iic"),
        ]:
            if os.path.exists(p):
                shutil.rmtree(p, ignore_errors=True)
    elif target == "mineru":
        p1 = os.path.expanduser("~/.cache/huggingface/hub/models--opendatalab--pdf-extract-models")
        p2 = os.path.expanduser("~/.cache/modelscope/hub/opendatalab/pdf-extract-models")
        if os.path.exists(p1): shutil.rmtree(p1, ignore_errors=True)
        if os.path.exists(p2): shutil.rmtree(p2, ignore_errors=True)
    elif target == "docling":
        p1 = os.path.expanduser("~/.cache/huggingface/hub/models--docling-project--docling-layout-heron")
        p2 = os.path.expanduser("~/.cache/huggingface/hub/models--ds4sd--docling-models")
        if os.path.exists(p1): shutil.rmtree(p1, ignore_errors=True)
        if os.path.exists(p2): shutil.rmtree(p2, ignore_errors=True)
    
    check_status()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["status", "download", "delete"])
    parser.add_argument("--target", choices=["funasr", "mineru", "docling"], required=False)
    parser.add_argument("--source", choices=["huggingface", "hf-mirror", "modelscope"], default="hf-mirror")
    parser.add_argument("--task-id", default="task_1")
    parser.add_argument("--lang", choices=["zh", "en"], default="zh")
    args = parser.parse_args()
    
    set_lang(args.lang)
    
    if args.action == "status":
        check_status()
    elif args.action == "delete" and args.target:
        do_delete(args.target)
    elif args.action == "download" and args.target:
        do_download(args.target, args.source, args.task_id)
