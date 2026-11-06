#!/usr/bin/env python3
"""Gera vídeos com o Veo (API Gemini) e salva no Google Drive, sem celular.

Roda numa sessão de nuvem do Claude Code (ou em qualquer máquina) e mantém o
histórico em "veo-relatorio.json", na pasta do Drive, para alimentar o relatório.

Variáveis de ambiente:
  GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN  (obrigatórias)
  GEMINI_API_KEY   opcional se um proxy injeta a chave no host da API Gemini
  VEO_MODEL        padrão: veo-3.1-fast-generate-preview
  DRIVE_FOLDER     padrão: Veo

Uso:
  python3 veo_to_drive.py --prompt "drone sobre a praia" --aspect 9:16
  python3 veo_to_drive.py --prompts-file prompts.txt
  python3 veo_to_drive.py --prompt "teste" --fake-veo   # testa o Drive sem gastar com o Veo
  python3 veo_to_drive.py --history-out runs.json        # só baixa o histórico
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

API = "https://generativelanguage.googleapis.com/v1beta/"
DRIVE = "https://www.googleapis.com/drive/v3/"
UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
HISTORY_NAME = "veo-relatorio.json"
FOLDER_MIME = "application/vnd.google-apps.folder"


class HttpError(RuntimeError):
    pass


def http(method, url, *, headers=None, data=None, want="json", timeout=120):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = res.read()
            if want == "raw":
                return body, res.headers
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        try:
            detail = json.loads(detail)["error"]["message"]
        except Exception:
            detail = detail[:300]
        raise HttpError(f"HTTP {e.code} em {urllib.parse.urlsplit(url).netloc}: {detail}") from None


# ------------------------------------------------------------------ Drive

class Drive:
    def __init__(self, folder_name):
        body = urllib.parse.urlencode({
            "client_id": os.environ["GDRIVE_CLIENT_ID"],
            "client_secret": os.environ["GDRIVE_CLIENT_SECRET"],
            "refresh_token": os.environ["GDRIVE_REFRESH_TOKEN"],
            "grant_type": "refresh_token",
        }).encode()
        tok = http("POST", "https://oauth2.googleapis.com/token", data=body,
                   headers={"Content-Type": "application/x-www-form-urlencoded"})
        self.auth = {"Authorization": "Bearer " + tok["access_token"]}
        self.folder = self._folder(folder_name)

    def _find(self, query):
        q = urllib.parse.urlencode({"q": query + " and trashed=false",
                                    "fields": "files(id,name,webViewLink)", "spaces": "drive"})
        return http("GET", DRIVE + "files?" + q, headers=self.auth)["files"]

    def _folder(self, name):
        safe = name.replace("'", "\\'")
        found = self._find(f"name='{safe}' and mimeType='{FOLDER_MIME}'")
        if found:
            return found[0]["id"]
        meta = json.dumps({"name": name, "mimeType": FOLDER_MIME}).encode()
        return http("POST", DRIVE + "files", data=meta,
                    headers={**self.auth, "Content-Type": "application/json"})["id"]

    def folder_link(self):
        return http("GET", DRIVE + f"files/{self.folder}?fields=webViewLink", headers=self.auth)["webViewLink"]

    def upload(self, name, content, mime, file_id=None, description=None):
        """Upload resumable (aceita arquivos grandes). Atualiza file_id se dado."""
        meta = {"name": name}
        if description:
            meta["description"] = description
        if file_id:
            url = f"{UPLOAD}/{file_id}?uploadType=resumable&fields=id,webViewLink"
            method = "PATCH"
        else:
            meta["parents"] = [self.folder]
            url = f"{UPLOAD}?uploadType=resumable&fields=id,webViewLink"
            method = "POST"
        _, hdrs = http(method, url, data=json.dumps(meta).encode(), want="raw", headers={
            **self.auth, "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mime, "X-Upload-Content-Length": str(len(content))})
        return http("PUT", hdrs["Location"], data=content, timeout=600,
                    headers={"Content-Type": mime, "Content-Length": str(len(content))})

    def load_history(self):
        found = self._find(f"name='{HISTORY_NAME}' and '{self.folder}' in parents")
        if not found:
            return None, []
        body, _ = http("GET", DRIVE + f"files/{found[0]['id']}?alt=media", headers=self.auth, want="raw")
        return found[0]["id"], json.loads(body or b"[]")

    def save_history(self, file_id, runs):
        data = json.dumps(runs, ensure_ascii=False, indent=1).encode()
        return self.upload(HISTORY_NAME, data, "application/json", file_id=file_id)["id"]


# ------------------------------------------------------------------ Veo

def veo_headers():
    # Sem GEMINI_API_KEY, manda um valor de exemplo: o proxy da nuvem troca pela chave salva.
    return {"x-goog-api-key": os.environ.get("GEMINI_API_KEY", "placeholder"),
            "Content-Type": "application/json"}


def veo_generate(prompt, aspect, model, negative=None, poll_every=10, max_wait=900):
    params = {"aspectRatio": aspect}
    if negative:
        params["negativePrompt"] = negative
    op = http("POST", API + f"models/{model}:predictLongRunning", headers=veo_headers(),
              data=json.dumps({"instances": [{"prompt": prompt}], "parameters": params}).encode())
    name, start = op["name"], time.time()
    while not op.get("done"):
        if time.time() - start > max_wait:
            raise RuntimeError("O Veo não terminou em 15 minutos.")
        time.sleep(poll_every)
        op = http("GET", API + name, headers=veo_headers())
    if op.get("error"):
        raise RuntimeError(op["error"].get("message", "Falha na geração."))
    gen = (op.get("response") or {}).get("generateVideoResponse") or {}
    samples = gen.get("generatedSamples") or []
    uri = samples and (samples[0].get("video") or {}).get("uri")
    if not uri:
        reasons = " ".join(gen.get("raiFilteredReasons") or [])
        raise RuntimeError(reasons or "A API não devolveu vídeo (possível filtro de segurança).")
    body, _ = http("GET", uri, headers=veo_headers(), want="raw", timeout=600)
    return body


def fake_video(aspect):
    """Clipe de teste de 2 s feito com ffmpeg, para validar Drive e relatório."""
    size = "720x1280" if aspect == "9:16" else "1280x720"
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "t.mp4")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i",
                        f"testsrc2=size={size}:rate=24:duration=2", "-pix_fmt", "yuv420p", out], check=True)
        with open(out, "rb") as f:
            return f.read()


# ------------------------------------------------------------------ main

def slug(text):
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:40] or "video"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", action="append", default=[])
    ap.add_argument("--prompts-file")
    ap.add_argument("--aspect", choices=["9:16", "16:9"], default="9:16")
    ap.add_argument("--negative")
    ap.add_argument("--fake-veo", action="store_true", help="não chama o Veo; usa clipe de teste")
    ap.add_argument("--history-out", help="grava o histórico completo neste arquivo JSON")
    a = ap.parse_args()

    prompts = list(a.prompt)
    if a.prompts_file:
        with open(a.prompts_file, encoding="utf-8") as f:
            prompts += [l.strip() for l in f if l.strip() and not l.startswith("#")]

    model = os.environ.get("VEO_MODEL", "veo-3.1-fast-generate-preview")
    drive = Drive(os.environ.get("DRIVE_FOLDER", "Veo"))
    hist_id, runs = drive.load_history()

    failures = 0
    for prompt in prompts:
        started = dt.datetime.now(dt.timezone.utc)
        run = {"prompt": prompt, "aspect": a.aspect, "model": "teste-ffmpeg" if a.fake_veo else model,
               "startedAt": started.isoformat(timespec="seconds")}
        print(f"→ {prompt!r}", flush=True)
        try:
            video = fake_video(a.aspect) if a.fake_veo else veo_generate(prompt, a.aspect, model, a.negative)
            name = started.astimezone().strftime("%Y-%m-%d_%H-%M-%S") + "_" + slug(prompt) + \
                ("_TESTE" if a.fake_veo else "") + ".mp4"
            up = drive.upload(name, video, "video/mp4",
                              description=f"Veo ({run['model']}, {a.aspect}): {prompt}")
            run.update(status="pronto", fileName=name, fileUrl=up["webViewLink"], sizeBytes=len(video))
            print(f"  ✓ {name} ({len(video) // 1024} KB) {up['webViewLink']}", flush=True)
        except Exception as e:  # registra e segue para o próximo prompt
            failures += 1
            run.update(status="erro", error=str(e))
            print(f"  ✗ {e}", flush=True)
        run["seconds"] = round((dt.datetime.now(dt.timezone.utc) - started).total_seconds())
        runs.insert(0, run)

    if prompts:
        hist_id = drive.save_history(hist_id, runs)
    if a.history_out:
        with open(a.history_out, "w", encoding="utf-8") as f:
            json.dump({"folderUrl": drive.folder_link(), "runs": runs}, f, ensure_ascii=False, indent=1)
    return 1 if failures and failures == len(prompts) else 0


if __name__ == "__main__":
    sys.exit(main())
