"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, CheckCircle2 } from "lucide-react";
import { Alert, useAction } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { signNda } from "./actions";

export function NdaSign({ projectId, version, content, userName, signed }: { projectId: string; version: number; content: string; userName: string; signed: { name: string; at: string; hash: string } | null }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  const a = useAction();
  const onScroll = () => {
    const el = ref.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setRead(true);
  };
  return (
    <div className="card overflow-hidden">
      <div ref={ref} onScroll={onScroll} className="max-h-[56vh] overflow-y-auto whitespace-pre-wrap bg-brand-paper px-10 py-8 text-[13.5px] leading-7 text-ink-900" style={{ color: "#1B2A24" }}>
        {content}
        <div className="h-2" ref={(el) => { if (el && ref.current && ref.current.scrollHeight <= ref.current.clientHeight + 24) setTimeout(() => setRead(true)); }} />
      </div>
      <div className="border-t border-ink-700 px-6 py-5">
        {signed ? (
          <div className="flex items-start gap-3 text-sm text-brand-mist">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-sage" />
            <div>由 <b className="text-brand-paper">{signed.name}</b> 于 {fmtDateTime(signed.at)} 电子签署（v{version}）
              <div className="mt-1 break-all font-num text-2xs text-brand-sage">SHA-256 {signed.hash}</div>
            </div>
          </div>
        ) : (
          <>
            <Alert>{a.error}</Alert>
            {!read && <p className="mb-3 text-xs text-warn">请先将协议滚动阅读至底部。</p>}
            <label className="flex items-start gap-2 text-sm text-brand-mist">
              <input type="checkbox" className="mt-1" disabled={!read} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              我已完整阅读并理解上述协议，同意受其约束；我知悉本数据室对访问、预览、打印与下载进行记录，并在副本中嵌入我的身份水印。
            </label>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 text-2xs text-brand-sage">电子签名（请输入账号姓名「{userName}」）</div>
                <input className="input w-64 font-medium" value={name} onChange={(e) => setName(e.target.value)} placeholder={userName} disabled={!read} />
              </div>
              <button className="btn-primary" disabled={!read || !agree || !name.trim() || a.pending}
                onClick={() => a.exec(() => signNda(projectId, { version, signedName: name, agree }), () => router.push(`/p/${projectId}/vdr`))}>
                <FileSignature size={14} />{a.pending ? "签署中…" : "签署并进入数据室"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
