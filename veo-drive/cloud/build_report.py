#!/usr/bin/env python3
"""Monta a página do relatório (HTML) a partir do histórico salvo no Drive.

Uso: python3 build_report.py runs.json report.html [--blocker "texto"]
"""
import argparse
import datetime as dt
import html
import json

STATUS_LABEL = {"pronto": "Salvo no Drive", "erro": "Falhou"}


def esc(v):
    return html.escape(str(v), quote=True)


def fmt_time(iso):
    t = dt.datetime.fromisoformat(iso).astimezone(dt.timezone(dt.timedelta(hours=-3)))
    return t.strftime("%d/%m/%Y %H:%M")


def card(r):
    test = r.get("model") == "teste-ffmpeg"
    status = r.get("status", "erro")
    size = f"{r['sizeBytes'] / 1_048_576:.1f} MB" if r.get("sizeBytes") else "—"
    link = (f'<a class="open" href="{esc(r["fileUrl"])}" target="_blank" rel="noopener">Abrir no Drive</a>'
            if r.get("fileUrl") else "")
    err = f'<p class="err">{esc(r["error"])}</p>' if r.get("error") else ""
    tag = '<span class="chip test">teste sem Veo</span>' if test else ""
    return f"""
    <li class="run {esc(status)}">
      <div class="run-head">
        <span class="chip {esc(status)}">{esc(STATUS_LABEL.get(status, status))}</span>{tag}
        <time>{esc(fmt_time(r["startedAt"]))}</time>
      </div>
      <p class="prompt">{esc(r["prompt"])}</p>
      <dl class="facts">
        <div><dt>Formato</dt><dd>{esc(r.get("aspect", "—"))}</dd></div>
        <div><dt>Modelo</dt><dd>{esc(r.get("model", "—"))}</dd></div>
        <div><dt>Tempo</dt><dd>{esc(r.get("seconds", "—"))} s</dd></div>
        <div><dt>Tamanho</dt><dd>{esc(size)}</dd></div>
      </dl>
      {err}{link}
    </li>"""


def build(data, blocker):
    runs = data.get("runs", [])
    real = [r for r in runs if r.get("model") != "teste-ffmpeg"]
    ok_real = sum(1 for r in real if r.get("status") == "pronto")
    tests_ok = sum(1 for r in runs if r.get("model") == "teste-ffmpeg" and r.get("status") == "pronto")
    updated = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).strftime("%d/%m/%Y %H:%M")

    checks = [
        ("ok", "Conexão com o seu Google Drive", "Conta autorizada; a pasta Veo é criada e usada sozinha."),
        ("ok" if tests_ok else "wait", "Envio de vídeo para o Drive",
         f"{tests_ok} clipe(s) de teste salvos e histórico gravado." if tests_ok else "Ainda não testado."),
        ("ok", "Lógica de geração do Veo", "Pedido, espera, download e erros testados com API simulada."),
        ("ok" if ok_real else "block", "Vídeo real gerado pelo Veo",
         f"{ok_real} vídeo(s) reais salvos." if ok_real else (blocker or "Aguardando a primeira geração.")),
    ]
    check_html = "".join(
        f'<li class="check {s}"><span class="dot" aria-hidden="true"></span>'
        f'<div><strong>{esc(t)}</strong><span>{esc(d)}</span></div></li>' for s, t, d in checks)
    runs_html = "".join(card(r) for r in runs) or '<li class="empty">Nenhum vídeo gerado ainda.</li>'
    folder = esc(data.get("folderUrl", "https://drive.google.com"))

    return f"""<title>Veo no Drive</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: uma coluna estreita tipo "folha de produção": situação no topo, depois o rolo de vídeos. */
:root {{
  --bg: #f3f4f7; --surface: #ffffff; --fg: #17191f; --muted: #5a6070; --line: #dde0e8;
  --accent: #3b4fd8; --ok: #17804a; --warn: #a86400; --bad: #c0352b;
  --ok-bg: #e3f4ea; --warn-bg: #fbf0dc; --bad-bg: #fbe5e2; --test-bg: #e9ebfb;
  --display: "Bricolage Grotesque", "Avenir Next", system-ui, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #111318; --surface: #1a1d24; --fg: #eceef3; --muted: #9aa1b2; --line: #2c303a;
  --accent: #93a2ff; --ok: #5fd08f; --warn: #f0b35a; --bad: #ff8a7f;
  --ok-bg: #16301f; --warn-bg: #33270f; --bad-bg: #3a1b18; --test-bg: #23284a; color-scheme: dark; }} }}
:root[data-theme="dark"] {{
  --bg: #111318; --surface: #1a1d24; --fg: #eceef3; --muted: #9aa1b2; --line: #2c303a;
  --accent: #93a2ff; --ok: #5fd08f; --warn: #f0b35a; --bad: #ff8a7f;
  --ok-bg: #16301f; --warn-bg: #33270f; --bad-bg: #3a1b18; --test-bg: #23284a; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ background: var(--bg); color: var(--fg); font: 15px/1.55 var(--body); }}
main {{ max-width: 680px; margin: 0 auto; padding-block: 28px 48px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: grid; gap: 28px; }}
header {{ display: grid; gap: 6px; }}
.eyebrow {{ font: 500 12px var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }}
h1 {{ font: 800 clamp(30px, 7vw, 42px)/1.05 var(--display); margin: 0; text-wrap: balance; }}
h2 {{ font: 600 19px var(--display); margin: 0 0 12px; }}
header p {{ margin: 0; color: var(--muted); max-width: 60ch; }}
.stats {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }}
.stat {{ background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }}
.stat b {{ display: block; font: 600 26px var(--display); font-variant-numeric: tabular-nums; }}
.stat span {{ font-size: 12.5px; color: var(--muted); }}
ul {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }}
.check {{ display: flex; gap: 12px; align-items: flex-start; }}
.check div {{ display: grid; min-width: 0; }}
.check span:not(.dot) {{ color: var(--muted); font-size: 14px; }}
.dot {{ flex: none; width: 12px; height: 12px; border-radius: 50%; margin-top: 5px; border: 2px solid currentColor; }}
.check.ok .dot {{ color: var(--ok); background: var(--ok); }}
.check.wait .dot {{ color: var(--warn); }}
.check.block .dot {{ color: var(--bad); }}
.check.block strong {{ color: var(--bad); }}
.run {{ background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: grid; gap: 8px; min-width: 0; }}
.run-head {{ display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }}
.run-head time {{ margin-left: auto; font: 13px var(--mono); color: var(--muted); }}
.chip {{ font: 600 12px var(--body); padding: 2px 9px; border-radius: 999px; }}
.chip.pronto {{ background: var(--ok-bg); color: var(--ok); }}
.chip.erro {{ background: var(--bad-bg); color: var(--bad); }}
.chip.test {{ background: var(--test-bg); color: var(--accent); }}
.prompt {{ margin: 0; font-size: 16px; overflow-wrap: anywhere; }}
.facts {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; }}
.facts div {{ min-width: 0; }}
.facts dt {{ font: 500 11px var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }}
.facts dd {{ margin: 0; font: 13px var(--mono); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }}
.err {{ margin: 0; color: var(--bad); font-size: 14px; overflow-wrap: anywhere; }}
a {{ color: var(--accent); }}
a:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }}
.open {{ font-weight: 600; justify-self: start; }}
.empty {{ color: var(--muted); }}
.how ol {{ margin: 0; padding-left: 20px; display: grid; gap: 6px; }}
footer {{ font: 12.5px var(--mono); color: var(--muted); }}
@media (max-width: 460px) {{ .facts {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} .stat b {{ font-size: 22px; }} }}
</style>
<main>
  <header>
    <span class="eyebrow">Automação Veo → Google Drive</span>
    <h1>Veo no Drive</h1>
    <p>Vídeos gerados na nuvem e guardados na pasta <a href="{folder}" target="_blank" rel="noopener">Veo do seu Drive</a>. Você só acompanha por aqui.</p>
  </header>
  <section class="stats" aria-label="Resumo">
    <div class="stat"><b>{ok_real}</b><span>vídeos Veo salvos</span></div>
    <div class="stat"><b>{sum(1 for r in real if r.get("status") == "erro")}</b><span>falhas do Veo</span></div>
    <div class="stat"><b>{tests_ok}</b><span>testes do Drive</span></div>
  </section>
  <section>
    <h2>Situação</h2>
    <ul>{check_html}</ul>
  </section>
  <section>
    <h2>Vídeos</h2>
    <ul>{runs_html}</ul>
  </section>
  <section class="how">
    <h2>Como funciona</h2>
    <ol>
      <li>Um script na nuvem do Claude Code envia o prompt ao Veo (API Gemini).</li>
      <li>Ele espera o vídeo ficar pronto, em geral de 1 a 6 minutos, e baixa o MP4.</li>
      <li>O arquivo vai para a pasta Veo do seu Drive e este relatório é atualizado.</li>
    </ol>
  </section>
  <footer>Atualizado em {esc(updated)} (horário de Brasília)</footer>
</main>
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("runs")
    ap.add_argument("out")
    ap.add_argument("--blocker")
    a = ap.parse_args()
    with open(a.runs, encoding="utf-8") as f:
        data = json.load(f)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(build(data, a.blocker))
