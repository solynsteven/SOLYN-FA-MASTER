"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Download, Loader2, ShieldAlert, MessageSquarePlus, Trash2, Eye, EyeOff, ScanLine, Lock, Copy } from "lucide-react";
import { levelMeta, DOWNLOAD_MODES } from "@/lib/vdr/caps";
import { fmtDateTime } from "@/lib/format";
import { logPrint, listAnnotations, addAnnotation, deleteAnnotation } from "@/app/p/[projectId]/vdr/actions";
import type { VdrCap, VdrDownloadMode } from "@/db/schema";
import type { VFile } from "./types";

export type ViewerFile = Pick<VFile, "id" | "name" | "lv">;
import { cn, Alert, Modal } from "@/components/ui";

type Info = {
  kind: "pdf" | "image" | "docx" | "xlsx"; pages: number; ratios: number[]; caps: VdrCap[]; fence: boolean; downloadModes: VdrDownloadMode[];
  irm: { expiryDays: number; printLimit: number; allowCopy: boolean }; watermark: { text: string; opacity: number; size: number; density: number }; isManager: boolean;
};
type Ann = { id: string; page: number | null; body: string; user: string; mine: boolean; at: string };

/** 屏幕层水印（与服务器烧入的水印叠加；Word / Excel 预览只有这一层） */
export function wmBackground(text: string, opacity: number, size: number, density = 1) {
  // 估算文字宽度（中日文字符按 1 个字号，其余按 0.58 个字号），整段文字斜向 -22° 完整落在一个平铺单元内
  const tw = [...text].reduce((s, c) => s + (/[\u2E80-\uFFFF]/.test(c) ? size : size * 0.58), 0);
  const a = (22 * Math.PI) / 180;
  const gap = (size * 4) / Math.max(0.5, density);
  const w = Math.round(tw * Math.cos(a) + size * 3);
  const h = Math.round(tw * Math.sin(a) + gap);
  const esc = text.replace(/[<&>'"]/g, "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><text x='${w / 2}' y='${h / 2}' text-anchor='middle' dominant-baseline='middle' transform='rotate(-22 ${w / 2} ${h / 2})' fill='rgba(22,54,42,${opacity})' font-size='${size}' font-family='Noto Sans SC, sans-serif'>${esc}</text></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

/**
 * 安全预览器：
 *  - PDF / 图片：服务器逐页渲染并烧入水印，按需（滚动到附近）加载单页图片，不下发原文件
 *  - Word / Excel：分段加载 HTML，叠加屏幕水印
 *  - 无「复制文本」权限时禁止选择 / 复制 / 右键 / 拖拽；窗口失焦时遮挡内容
 *  - Fence View：仅鼠标附近区域可见
 */
export function Viewer({ projectId, file, onClose, autoDownload }: { projectId: string; file: ViewerFile; onClose: () => void; autoDownload?: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [partCount, setPartCount] = useState(0);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set([1, 2]));
  const [texts, setTexts] = useState<Record<number, { s: string; x: number; y: number; w: number; h: number }[]>>({});
  const [curPage, setCurPage] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [fenceOn, setFenceOn] = useState(true);
  const [annOpen, setAnnOpen] = useState(false);
  const [dl, setDl] = useState(!!autoDownload);
  const [printing, setPrinting] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const fence = useRef<HTMLDivElement>(null);
  const src = `/p/${projectId}/vdr/file/${file.id}`;
  const caps = info?.caps ?? [];
  const can = (c: VdrCap) => caps.includes(c);
  const width = typeof window === "undefined" ? 1200 : Math.min(1800, Math.round(Math.min(980, window.innerWidth - 80) * (window.devicePixelRatio || 1)));

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await fetch(`${src}?mode=info`);
        if (!r.ok) throw new Error(await r.text());
        const j = (await r.json()) as Info;
        if (off) return;
        setInfo(j);
        if (j.kind === "docx" || j.kind === "xlsx") {
          const p = await fetch(`${src}?mode=html&part=0`).then((x) => x.json());
          if (!off) { setParts([p.html]); setPartCount(p.parts); }
        }
      } catch (e) {
        if (!off) setErr(e instanceof Error ? e.message.slice(0, 300) : "加载失败");
      }
    })();
    return () => { off = true; };
  }, [src]);

  // 打印 / 复制 / 失焦控制
  const canPrint = can("print");
  const canCopy = can("copy");
  useEffect(() => {
    document.body.classList.add("vdr-viewing", canPrint ? "vdr-print-ok" : "vdr-print-deny");
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "s" || (e.key === "p" && !canPrint) || (!canCopy && (e.key === "c" || e.key === "a" || e.key === "x")))) e.preventDefault();
      if (e.key === "PrintScreen") { setHidden(true); navigator.clipboard?.writeText("").catch(() => null); }
    };
    const blur = () => !info?.isManager && setHidden(true);
    const focus = () => setHidden(false);
    const vis = () => (document.hidden ? blur() : focus());
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.body.classList.remove("vdr-viewing", "vdr-print-ok", "vdr-print-deny");
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [canPrint, canCopy, onClose, info?.isManager]);

  // 按需加载页面：观察占位块，进入视口附近时加载
  useEffect(() => {
    if (!info || (info.kind !== "pdf" && info.kind !== "image")) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.page);
        if (e.isIntersecting) {
          setLoadedPages((s) => (s.has(n) && s.has(n + 1) ? s : new Set([...s, n, n + 1])));
          if (e.intersectionRatio > 0.3) setCurPage(n);
        }
      }
    }, { root: host.current, rootMargin: "600px 0px", threshold: [0, 0.3] });
    host.current?.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [info]);

  // 文字层（仅「复制文本」权限）
  useEffect(() => {
    if (!info || info.kind !== "pdf" || !canCopy) return;
    for (const n of loadedPages) {
      if (texts[n] || n > info.pages) continue;
      fetch(`${src}/page?n=${n}&text=1`).then((r) => (r.ok ? r.json() : [])).then((t) => setTexts((x) => ({ ...x, [n]: t })));
    }
  }, [loadedPages, info, canCopy, src, texts]);

  // Word / Excel 分段加载
  const sentinel = useRef<HTMLDivElement>(null);
  const loadNextPart = useCallback(async () => {
    if (parts.length >= partCount) return;
    const p = await fetch(`${src}?mode=html&part=${parts.length}`).then((x) => x.json());
    setParts((cur) => (cur.length === parts.length ? [...cur, p.html] : cur));
  }, [parts.length, partCount, src]);
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && loadNextPart(), { root: host.current, rootMargin: "800px 0px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [loadNextPart]);

  // Fence View：遮罩只在鼠标附近开一个洞
  const fenceActive = !!info?.fence && fenceOn;
  useEffect(() => {
    if (!fenceActive) return;
    const mv = (x: number, y: number) => {
      fence.current?.style.setProperty("--fx", `${x}px`);
      fence.current?.style.setProperty("--fy", `${y}px`);
    };
    const m = (e: MouseEvent) => mv(e.clientX, e.clientY);
    const t = (e: TouchEvent) => e.touches[0] && mv(e.touches[0].clientX, e.touches[0].clientY);
    window.addEventListener("mousemove", m);
    window.addEventListener("touchmove", t, { passive: true });
    return () => { window.removeEventListener("mousemove", m); window.removeEventListener("touchmove", t); };
  }, [fenceActive]);

  const wm = useMemo(() => (info ? wmBackground(info.watermark.text, Math.min(0.4, info.watermark.opacity + 0.02), info.watermark.size, info.watermark.density) : "none"), [info]);

  async function doPrint() {
    if (!info) return;
    setPrinting(true);
    if (info.kind === "pdf" || info.kind === "image") setLoadedPages(new Set(Array.from({ length: info.pages }, (_, i) => i + 1)));
    else {
      const all = [...parts];
      for (let i = all.length; i < partCount; i++) all.push((await fetch(`${src}?mode=html&part=${i}`).then((x) => x.json())).html);
      setParts(all);
    }
    // 等待所有页面图片加载完成
    await new Promise((r) => setTimeout(r, 300));
    const imgs = Array.from(host.current?.querySelectorAll("img") ?? []);
    await Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = r; im.onerror = r; }))));
    const r = await logPrint(projectId, file.id, info.pages || undefined);
    setPrinting(false);
    if (!r.ok) { setErr(r.error); return; }
    window.print();
  }

  const lm = levelMeta(file.lv);
  const blockCopy = (e: React.SyntheticEvent) => { if (!canCopy) e.preventDefault(); };

  return createPortal(
    <div className="vdr-viewer fixed inset-0 z-50 flex flex-col bg-black/90" onContextMenu={(e) => !canCopy && e.preventDefault()}>
      <div className="vdr-noprint flex flex-wrap items-center gap-2 border-b border-line bg-ink-900 px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-brand-paper">{file.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-2xs text-brand-sage">
            <span className="rounded px-1 font-num font-medium" style={{ color: lm.color, border: `1px solid ${lm.color}55` }}>{lm.short}</span>
            {file.lv === "C" ? "自定义权限" : lm.label}
            {info && !canCopy && <span className="inline-flex items-center gap-1"><Lock size={11} />禁止复制</span>}
            {info && !canPrint && <span className="inline-flex items-center gap-1"><ShieldAlert size={11} />禁止打印</span>}
            {info?.fence && <span className="inline-flex items-center gap-1 text-warn"><ScanLine size={11} />围栏视图</span>}
            {info && (info.kind === "pdf" || info.kind === "image") && <span className="font-num">第 {curPage} / {info.pages} 页</span>}
          </div>
        </div>
        {info?.fence && info.isManager && (
          <button className="btn-ghost btn-sm" onClick={() => setFenceOn((v) => !v)} title="仅管理员可临时关闭">{fenceOn ? <EyeOff size={13} /> : <Eye size={13} />}{fenceOn ? "关闭围栏" : "开启围栏"}</button>
        )}
        {(can("annotate") || info?.isManager) && <button className={cn("btn-secondary btn-sm", annOpen && "border-brand-sage")} onClick={() => setAnnOpen((v) => !v)}><MessageSquarePlus size={13} />批注</button>}
        {canPrint && <button className="btn-secondary btn-sm" disabled={printing || !info} onClick={doPrint}>{printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}打印</button>}
        {info && info.downloadModes.length > 0 && <button className="btn-secondary btn-sm" onClick={() => setDl(true)}><Download size={13} />下载</button>}
        <button className="rounded p-1.5 text-brand-sage hover:bg-ink-700 hover:text-brand-paper" onClick={onClose} aria-label="关闭"><X size={18} /></button>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div ref={host} className={cn("vdr-print-area relative flex-1 overflow-auto bg-[#2a302d] py-6", !canCopy && "vdr-nocopy")}
          onCopy={blockCopy} onCut={blockCopy} onDragStart={(e) => e.preventDefault()}>
          {!info && !err && <div className="vdr-noprint absolute inset-0 flex items-center justify-center text-sm text-brand-mist"><Loader2 size={18} className="mr-2 animate-spin" />加载中…</div>}
          {err && <div className="vdr-noprint p-10 text-center text-sm text-danger">{err}</div>}
          {info && (info.kind === "pdf" || info.kind === "image") && (
            <div className="mx-auto px-4" style={{ maxWidth: 1012 }}>
              {Array.from({ length: info.pages }, (_, i) => i + 1).map((n) => (
                <div key={n} data-page={n} className="vdr-page relative mx-auto mb-4 bg-white shadow-lg" style={{ aspectRatio: `1 / ${info.ratios[n - 1] ?? 1.414}` }}>
                  {loadedPages.has(n) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${src}/page?n=${n}&w=${width}`} alt={`第 ${n} 页`} draggable={false} className="absolute inset-0 h-full w-full select-none" />
                  )}
                  {canCopy && texts[n] && (
                    <div className="vdr-textlayer absolute inset-0">
                      {texts[n].map((t, i) => (
                        <span key={i} style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.w * 100}%`, height: `${t.h * 100}%`, fontSize: `${t.h * 80}cqh` }}>{t.s}</span>
                      ))}
                    </div>
                  )}
                  <div className="vdr-watermark pointer-events-none absolute inset-0" style={{ backgroundImage: wm }} />
                  <span className="vdr-noprint absolute -left-9 top-1 font-num text-[10px] text-brand-sage/60">{n}</span>
                </div>
              ))}
            </div>
          )}
          {info && (info.kind === "docx" || info.kind === "xlsx") && (
            <div className="relative mx-auto w-[min(1000px,calc(100vw-48px))] bg-white px-9 py-7 shadow-lg">
              <div className="vdr-doc" dangerouslySetInnerHTML={{ __html: parts.join("") }} />
              <div ref={sentinel} className="h-4" />
              {parts.length < partCount && <div className="vdr-noprint py-4 text-center text-xs text-[#5B6B63]">加载中…（{parts.length}/{partCount}）</div>}
              <div className="vdr-watermark pointer-events-none absolute inset-0" style={{ backgroundImage: wm }} />
            </div>
          )}
        </div>
        {annOpen && info && <AnnotationPanel projectId={projectId} fileId={file.id} page={info.kind === "pdf" || info.kind === "image" ? curPage : null} canAdd={can("annotate")} />}
        {fenceActive && <div ref={fence} className="vdr-fence vdr-noprint pointer-events-none fixed inset-0 z-[55]" />}
        {hidden && (
          <div className="vdr-noprint fixed inset-0 z-[60] flex items-center justify-center bg-[#0b1511]" onClick={() => setHidden(false)}>
            <div className="text-center text-sm text-brand-mist"><EyeOff size={26} className="mx-auto mb-3 text-brand-sage" />窗口失去焦点，内容已暂停显示<div className="mt-1 text-2xs text-brand-sage">点击此处继续阅读</div></div>
          </div>
        )}
      </div>
      {dl && info && <DownloadDialog projectId={projectId} file={file} info={info} onClose={() => setDl(false)} />}
    </div>,
    document.body,
  );
}

function AnnotationPanel({ projectId, fileId, page, canAdd }: { projectId: string; fileId: string; page: number | null; canAdd: boolean }) {
  const [list, setList] = useState<Ann[] | null>(null);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => listAnnotations(projectId, fileId).then((r) => (r.ok ? setList((r.data as Ann[]) ?? []) : setErr(r.error))), [projectId, fileId]);
  useEffect(() => { load(); }, [load]);
  return (
    <aside className="vdr-noprint flex w-80 shrink-0 flex-col border-l border-line bg-ink-900">
      <div className="border-b border-line px-4 py-2.5 text-xs text-brand-mist">批注 <span className="text-brand-sage">（仅本人与管理员可见）</span></div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {list === null ? <div className="text-xs text-brand-sage">加载中…</div> : list.length === 0 ? <div className="text-xs text-brand-sage">暂无批注</div> : list.map((a) => (
          <div key={a.id} className="rounded-md border border-line bg-ink-850 p-2.5">
            <div className="mb-1 flex items-center gap-2 text-[10px] text-brand-sage">
              {a.page && <span className="rounded bg-ink-700 px-1 font-num">P{a.page}</span>}
              <span>{a.user}</span><span className="font-num">{fmtDateTime(a.at)}</span>
              {a.mine && <button className="ml-auto hover:text-danger" onClick={() => deleteAnnotation(projectId, a.id).then(load)}><Trash2 size={11} /></button>}
            </div>
            <div className="whitespace-pre-wrap text-xs text-brand-mist">{a.body}</div>
          </div>
        ))}
      </div>
      {canAdd && (
        <div className="border-t border-line p-3">
          <textarea className="input min-h-[70px] text-xs" placeholder={page ? `在第 ${page} 页添加批注…` : "添加批注…"} value={body} onChange={(e) => setBody(e.target.value)} />
          {err && <div className="mt-1 text-2xs text-danger">{err}</div>}
          <button className="btn-primary btn-sm mt-2 w-full justify-center" disabled={!body.trim()} onClick={async () => {
            const r = await addAnnotation(projectId, fileId, page, body);
            if (r.ok) { setBody(""); load(); } else setErr(r.error);
          }}>保存批注{page ? `（第 ${page} 页）` : ""}</button>
        </div>
      )}
    </aside>
  );
}

function DownloadDialog({ projectId, file, info, onClose }: { projectId: string; file: ViewerFile; info: Info; onClose: () => void }) {
  const [mode, setMode] = useState<VdrDownloadMode>(info.downloadModes[0]);
  const maxDate = new Date(Date.now() + info.irm.expiryDays * 86400_000).toISOString().slice(0, 10);
  const [expires, setExpires] = useState(maxDate);
  const [prints, setPrints] = useState(info.irm.printLimit);
  const [copy, setCopy] = useState(info.irm.allowCopy);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; password?: string; trace?: string } | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/p/${projectId}/vdr/file/${file.id}/download`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, expiresAt: mode === "irm" ? new Date(expires + "T23:59:59+09:00").toISOString() : undefined, printLimit: prints, allowCopy: copy }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? (await r.text().catch(() => "")) ?? `下载失败（${r.status}）`);
      const blob = await r.blob();
      const cd = r.headers.get("content-disposition") ?? "";
      const name = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? file.name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setDone({ name, password: r.headers.get("x-file-password") ?? undefined, trace: r.headers.get("x-trace-id") ?? undefined });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const modes = DOWNLOAD_MODES.filter((m) => info.downloadModes.includes(m.key));
  return (
    <Modal open onClose={onClose} width="max-w-xl" title={<span className="flex items-center gap-2"><Download size={15} />下载 · <span className="text-brand-sage">{file.name}</span></span>}
      footer={done ? <button className="btn-primary" onClick={onClose}>完成</button> : <><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={busy} onClick={go}>{busy ? <><Loader2 size={13} className="animate-spin" />正在生成专属副本…</> : "生成并下载"}</button></>}>
      {done ? (
        <div className="space-y-3 text-sm text-brand-mist">
          <p>已下载「{done.name}」。{done.trace && <span className="text-brand-sage">溯源编号 #{done.trace}</span>}</p>
          {done.password && (
            <div className="rounded-md border border-warn/40 bg-warn/10 p-3">
              <div className="mb-1 text-xs text-warn">打开密码（仅显示这一次，请妥善保存）</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-base text-brand-paper">{done.password}</code>
                <button className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(done.password!)}><Copy size={13} /></button>
              </div>
            </div>
          )}
          {mode === "irm" && <p className="text-2xs text-brand-sage">.fasec 受控文件只能在 FA MASTER「安全阅读器」中登录后联网打开（左侧菜单「工具 → 安全阅读器」）。管理员撤销后该副本立即无法打开。</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {modes.map((m) => (
            <label key={m.key} className={cn("flex cursor-pointer gap-2 rounded-md border px-3 py-2", mode === m.key ? "border-brand-mid bg-brand-green/10" : "border-line")}>
              <input type="radio" className="mt-1 accent-[#3F6E58]" checked={mode === m.key} onChange={() => setMode(m.key)} />
              <span><span className="text-sm text-brand-paper">{m.label}</span><span className="block text-2xs text-brand-sage">{m.desc}</span></span>
            </label>
          ))}
          {mode === "irm" && (
            <div className="grid grid-cols-3 gap-3 rounded-md border border-line p-3">
              <div><label className="label">有效期至</label><input type="date" className="input text-xs [color-scheme:dark]" value={expires} max={info.isManager ? undefined : maxDate} onChange={(e) => setExpires(e.target.value)} /></div>
              <div><label className="label">打印次数</label><input type="number" min={0} max={info.isManager ? 999 : info.irm.printLimit} className="input font-num text-xs" value={prints} disabled={!info.isManager && info.irm.printLimit === 0} onChange={(e) => setPrints(Number(e.target.value))} /></div>
              <label className="mt-6 flex items-center gap-1.5 text-xs text-brand-mist"><input type="checkbox" className="accent-[#3F6E58]" checked={copy} disabled={!info.irm.allowCopy && !info.isManager} onChange={(e) => setCopy(e.target.checked)} />允许复制</label>
            </div>
          )}
          <p className="text-2xs text-brand-sage">下载副本由服务器实时生成，嵌入您的身份水印（{info.watermark.text}）与唯一溯源编号；每次下载均记录在案。</p>
          <Alert>{err}</Alert>
        </div>
      )}
    </Modal>
  );
}
