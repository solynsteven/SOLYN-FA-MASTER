"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileLock2, Printer, X, ShieldAlert, Loader2, Upload } from "lucide-react";
import { cn } from "@/components/ui";
import { wmBackground } from "@/components/vdr/Viewer";

type Header = { v: number; id: string; p: string; name: string; type: "pdf" | "html"; origin: string; to: string; at: string };
type Policy = { expiresAt: string | null; allowCopy: boolean; printLimit: number; printsUsed: number };
type Opened = { header: Header; policy: Policy; watermark: string; pages: number; html?: string };

const b64urlToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;

/** 解析 .fasec：FASEC1\n + base64url(header JSON)\n + IV(12) + 密文（AES-256-GCM，含 tag） */
function parse(buf: ArrayBuffer): { header: Header; iv: Uint8Array<ArrayBuffer>; ct: Uint8Array<ArrayBuffer> } {
  const u = new Uint8Array(buf);
  const magic = new TextDecoder().decode(u.slice(0, 7));
  if (magic !== "FASEC1\n") throw new Error("不是有效的 FA MASTER 受控文件（.fasec）");
  let i = 7;
  while (i < u.length && u[i] !== 10) i++;
  if (i >= u.length) throw new Error("文件已损坏");
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(new TextDecoder().decode(u.slice(7, i))))) as Header;
  return { header, iv: u.slice(i + 1, i + 13), ct: u.slice(i + 13) };
}

export function SecureReader() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<Opened | null>(null);
  const [hidden, setHidden] = useState(false);
  const [drag, setDrag] = useState(false);
  const pagesRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef = useRef<any>(null);

  const wipe = useCallback((reason: string | null) => {
    try { pdfRef.current?.destroy?.(); } catch {}
    pdfRef.current = null;
    if (pagesRef.current) pagesRef.current.innerHTML = "";
    setDoc(null);
    setErr(reason);
  }, []);

  async function open(file: File) {
    setErr(null);
    setBusy(true);
    wipe(null);
    try {
      const { header, iv, ct } = parse(await file.arrayBuffer());
      if (header.origin && header.origin !== window.location.origin && !/localhost|127\.0\.0\.1/.test(header.origin)) {
        throw new Error(`该文件由 ${header.origin} 签发，请在该站点的安全阅读器中打开`);
      }
      const r = await fetch("/api/irm/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: header.id }), cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "验权失败");
      const key = await crypto.subtle.importKey("raw", b64urlToBytes(String(j.key).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")), "AES-GCM", false, ["decrypt"]);
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(header.id) }, key, ct));
      const base: Opened = { header, policy: j.policy, watermark: j.watermark, pages: 0 };
      if (header.type === "html") {
        setDoc({ ...base, html: new TextDecoder().decode(plain), pages: 1 });
      } else {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const pdf = await pdfjs.getDocument({ data: plain, isEvalSupported: false }).promise;
        pdfRef.current = pdf;
        setDoc({ ...base, pages: pdf.numPages });
      }
    } catch (e) {
      setErr(e instanceof Error ? (e.name === "OperationError" ? "解密失败：文件已被篡改或密钥不匹配" : e.message) : String(e));
    } finally {
      setBusy(false);
    }
  }

  // PDF 渲染到 canvas（不生成可下载的 blob / URL）
  useEffect(() => {
    const pdf = pdfRef.current;
    const host = pagesRef.current;
    if (!doc || doc.header.type !== "pdf" || !pdf || !host) return;
    let cancelled = false;
    host.innerHTML = "";
    (async () => {
      const width = Math.min(1100, host.clientWidth || 900);
      for (let n = 1; n <= doc.pages && !cancelled; n++) {
        const page = await pdf.getPage(n);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = (width / vp0.width) * Math.min(2, window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        const wrap = document.createElement("div");
        wrap.className = "vdr-page relative mx-auto mb-4 bg-white shadow";
        wrap.style.width = `${width}px`;
        wrap.style.aspectRatio = `${vp.width} / ${vp.height}`;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        wrap.appendChild(canvas);
        if (doc.policy.allowCopy) {
          const tc = await page.getTextContent();
          const layer = document.createElement("div");
          layer.className = "vdr-textlayer";
          for (const it of tc.items as { str: string; transform: number[]; width: number }[]) {
            if (!it.str?.trim()) continue;
            const [, , , d, e, f] = it.transform;
            const h = Math.abs(d) || 10;
            const s = document.createElement("span");
            s.textContent = it.str;
            s.style.left = `${(e / vp0.width) * 100}%`;
            s.style.top = `${((vp0.height - f - h) / vp0.height) * 100}%`;
            s.style.fontSize = `${(h / vp0.height) * 100}cqh`;
            layer.appendChild(s);
          }
          wrap.appendChild(layer);
        }
        host.appendChild(wrap);
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      }
    })().catch((e) => !cancelled && setErr(`渲染失败：${e instanceof Error ? e.message : e}`));
    return () => { cancelled = true; };
  }, [doc]);

  // 心跳：撤销 / 到期 / 失权 → 立即清除
  useEffect(() => {
    if (!doc) return;
    const id = doc.header.id;
    const beat = async () => {
      if (doc.policy.expiresAt && new Date(doc.policy.expiresAt).getTime() < Date.now()) return wipe("受控文件已到期，内容已清除。");
      try {
        const r = await fetch("/api/irm/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), cache: "no-store" });
        const j = await r.json();
        if (!j.ok) wipe(`${j.error || "访问权限已失效"}　内容已清除。`);
        else setDoc((d) => (d ? { ...d, policy: { ...d.policy, printsUsed: j.printsUsed, printLimit: j.printLimit } } : d));
      } catch {
        // 离线：不在离线状态下继续展示
        wipe("无法连接 FA MASTER 验证权限（受控文件需联网查看），内容已清除。");
      }
    };
    const t = setInterval(beat, 60_000);
    return () => clearInterval(t);
  }, [doc?.header.id, wipe]); // eslint-disable-line react-hooks/exhaustive-deps

  // 防复制 / 失焦遮挡
  useEffect(() => {
    if (!doc) return;
    const block = (e: Event) => { if (!doc.policy.allowCopy) e.preventDefault(); };
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "p" || k === "s" || (!doc.policy.allowCopy && (k === "c" || k === "a" || k === "x")))) e.preventDefault();
    };
    document.body.classList.add("irm-open");
    const blur = () => setHidden(true);
    const focus = () => setHidden(false);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      document.body.classList.remove("irm-open");
    };
  }, [doc]);

  async function print() {
    if (!doc) return;
    const r = await fetch("/api/irm/print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: doc.header.id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error || "无法打印");
    setDoc((d) => (d ? { ...d, policy: { ...d.policy, printsUsed: j.printsUsed } } : d));
    document.body.classList.add("vdr-printing");
    setTimeout(() => { window.print(); document.body.classList.remove("vdr-printing"); }, 50);
  }

  const canPrint = !!doc && doc.policy.printLimit > doc.policy.printsUsed;
  return (
    <div>
      {!doc && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) open(f); }}
          className={cn("card flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed px-6 py-16 text-center transition", drag && "border-brand-mid bg-ink-850")}>
          {busy ? <Loader2 size={28} className="animate-spin text-brand-sage" /> : <FileLock2 size={30} strokeWidth={1.3} className="text-brand-sage" />}
          <div className="text-sm text-brand-paper">{busy ? "正在验证权限并解密…" : "拖入或选择 .fasec 受控文件"}</div>
          <div className="max-w-md text-2xs leading-relaxed text-brand-sage">文件在您的浏览器内解密，内容不会被保存到本机；只有受控文件的接收人（或项目管理员）登录后才能打开。</div>
          <span className="btn-secondary btn-sm mt-1"><Upload size={13} />选择文件</span>
          <input type="file" accept=".fasec" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = ""; }} />
        </label>
      )}
      {err && (
        <div className="card mt-4 flex items-start gap-3 border-danger/40 px-4 py-3 text-sm text-brand-mist">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-danger" />{err}
        </div>
      )}
      {doc && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-xs">
            <FileLock2 size={15} className="text-brand-sage" />
            <span className="font-medium text-brand-paper">{doc.header.name}</span>
            <span className="text-brand-sage">接收人 {doc.header.to}</span>
            <span className="text-brand-sage">{doc.policy.expiresAt ? `有效至 ${new Date(doc.policy.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}` : "长期有效"}</span>
            <span className="text-brand-sage">{doc.policy.allowCopy ? "允许复制" : "禁止复制"} · 打印 {doc.policy.printsUsed}/{doc.policy.printLimit}</span>
            <span className="ml-auto flex gap-2">
              {doc.policy.printLimit > 0 && <button className="btn-secondary btn-sm" disabled={!canPrint} onClick={print}><Printer size={13} />打印</button>}
              <button className="btn-ghost btn-sm" onClick={() => wipe(null)}><X size={13} />关闭</button>
            </span>
          </div>
          <div className={cn("vdr-print-area relative max-h-[calc(100vh-260px)] overflow-y-auto bg-ink-850 p-6", !doc.policy.allowCopy && "vdr-nocopy")}>
            <div className={cn("relative transition", hidden && "blur-xl")}>
              {doc.html ? <div className="vdr-doc mx-auto max-w-4xl bg-white p-10" dangerouslySetInnerHTML={{ __html: doc.html }} /> : <div ref={pagesRef} />}
              <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: wmBackground(doc.watermark, 0.14, 15, 1) }} />
            </div>
            {hidden && <div className="absolute inset-0 flex items-center justify-center text-sm text-brand-mist">窗口未处于前台，内容已隐藏</div>}
          </div>
        </div>
      )}
    </div>
  );
}
