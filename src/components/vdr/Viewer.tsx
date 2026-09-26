"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Download, Loader2, ShieldAlert } from "lucide-react";
import { levelMeta, atLeast } from "@/lib/vdr/constants";
import { logPrint } from "@/app/p/[projectId]/vdr/actions";
import type { VFile } from "./types";

/** 在线阅览器：PDF / 图片 / Word / Excel，叠加动态水印；V 级禁止打印与下载，P 级可打印，O 级可下载原件 */
export function Viewer({ projectId, file, watermark, onClose }: { projectId: string; file: VFile; watermark: string; onClose: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const canPrint = atLeast(file.level, "P");
  const canDownload = atLeast(file.level, "O");
  const src = `/p/${projectId}/vdr/file/${file.id}`;

  // 打印控制：通过 body class 让打印样式只输出阅览区（V 级输出空白提示）
  useEffect(() => {
    document.body.classList.add("vdr-viewing", canPrint ? "vdr-print-ok" : "vdr-print-deny");
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!canPrint && (e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "s")) e.preventDefault();
    };
    window.addEventListener("keydown", esc);
    return () => {
      document.body.classList.remove("vdr-viewing", "vdr-print-ok", "vdr-print-deny");
      window.removeEventListener("keydown", esc);
    };
  }, [canPrint, onClose]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        if (file.preview === "docx" || file.preview === "xlsx") {
          const r = await fetch(`${src}?mode=html`);
          if (!r.ok) throw new Error(await r.text());
          const j = (await r.json()) as { html: string };
          if (!cancelled) setHtml(j.html);
        } else {
          const r = await fetch(`${src}?mode=view`);
          if (!r.ok) throw new Error(await r.text());
          const buf = await r.arrayBuffer();
          if (file.preview === "image") {
            objectUrl = URL.createObjectURL(new Blob([buf], { type: file.contentType || "image/*" }));
            if (!cancelled) setImgUrl(objectUrl);
          } else if (file.preview === "pdf") {
            // legacy 构建兼容较旧的 Safari / Edge
            const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
            pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
            const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
            const host = pagesRef.current;
            if (!host || cancelled) return;
            host.innerHTML = "";
            const width = Math.min(host.clientWidth - 32, 1000);
            for (let i = 1; i <= pdf.numPages; i++) {
              if (cancelled) return;
              const page = await pdf.getPage(i);
              const vp0 = page.getViewport({ scale: 1 });
              const scale = (width / vp0.width) * (window.devicePixelRatio || 1);
              const vp = page.getViewport({ scale });
              const canvas = document.createElement("canvas");
              canvas.width = vp.width;
              canvas.height = vp.height;
              canvas.style.width = `${width}px`;
              canvas.className = "vdr-page mx-auto mb-4 block bg-white shadow-lg";
              host.appendChild(canvas);
              await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
              if (i === 1 && !cancelled) setState("ready");
            }
          }
        }
        if (!cancelled) setState("ready");
      } catch (e) {
        if (!cancelled) { setErr(e instanceof Error ? e.message.slice(0, 200) : "加载失败"); setState("error"); }
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, file.preview, file.contentType]);

  const wm = useMemo(() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='220'><text x='20' y='120' transform='rotate(-24 180 110)' fill='rgba(22,54,42,0.16)' font-size='15' font-family='sans-serif'>${watermark.replace(/[<&>]/g, "")}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [watermark]);
  const lm = levelMeta(file.level);

  return createPortal(
    <div className="vdr-viewer fixed inset-0 z-50 flex flex-col bg-black/85" onContextMenu={(e) => !canDownload && e.preventDefault()}>
      <div className="vdr-noprint flex items-center gap-3 border-b border-line bg-ink-900 px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-brand-paper">{file.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-2xs text-brand-sage">
            <span className="rounded px-1 font-num font-medium" style={{ color: lm.color, border: `1px solid ${lm.color}55` }}>{lm.short}</span>
            {lm.label}
            {!canPrint && <span className="inline-flex items-center gap-1"><ShieldAlert size={11} />本文件仅可在线阅览，禁止打印与下载</span>}
          </div>
        </div>
        {canPrint && (
          <button className="btn-secondary btn-sm" onClick={async () => { await logPrint(projectId, file.id); window.print(); }}>
            <Printer size={13} />打印
          </button>
        )}
        {canDownload && <a className="btn-secondary btn-sm" href={`${src}?mode=download`}><Download size={13} />下载原件</a>}
        <button className="rounded p-1.5 text-brand-sage hover:bg-ink-700 hover:text-brand-paper" onClick={onClose} aria-label="关闭"><X size={18} /></button>
      </div>
      <div className="vdr-print-area relative flex-1 overflow-auto bg-[#2a302d] py-6" style={{ userSelect: canDownload ? "auto" : "none" }}>
        {state === "loading" && <div className="vdr-noprint absolute inset-0 flex items-center justify-center text-sm text-brand-mist"><Loader2 size={18} className="mr-2 animate-spin" />加载中…</div>}
        {state === "error" && <div className="vdr-noprint p-10 text-center text-sm text-danger">{err || "加载失败"}</div>}
        <div className="relative mx-auto" style={{ maxWidth: 1040 }}>
          {file.preview === "pdf" && <div ref={pagesRef} className="px-4" />}
          {file.preview === "image" && imgUrl && <img src={imgUrl} alt={file.name} className="mx-auto max-w-full bg-white shadow-lg" draggable={false} />}
          {html !== null && (
            <iframe
              title={file.name}
              sandbox=""
              className="mx-auto block h-[calc(100vh-150px)] w-[min(1000px,calc(100vw-48px))] bg-white shadow-lg"
              srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font-family:-apple-system,"PingFang SC","Noto Sans SC",sans-serif;color:#1b2a24;padding:28px 36px;line-height:1.6;user-select:${canDownload ? "auto" : "none"}}table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #d7e0da;padding:3px 6px;white-space:nowrap}.xl{overflow:auto;margin-bottom:24px}h3{color:#16362A;font-size:14px}img{max-width:100%}body::after{content:"";position:fixed;inset:0;pointer-events:none;background-image:${wm.replace(/"/g, "'")}}</style>${html}`}
            />
          )}
          {/* 水印层：阅览与打印时都覆盖在文档上 */}
          <div className="vdr-watermark pointer-events-none absolute inset-0" style={{ backgroundImage: wm }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
