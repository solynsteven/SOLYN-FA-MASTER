"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, KeyRound, Trash2, Zap } from "lucide-react";
import { Alert, Badge, ConfirmButton, EmptyState, Modal, Toggle, useAction } from "@/components/ui";
import { createApiKey, updateApiKey, deleteApiKey, testApiKey, previewModels } from "../actions";
import { fmtDateTime } from "@/lib/format";

type K = {
  id: string; label: string; last4: string; model: string; isActive: boolean; isDefault: boolean;
  lastTestedAt: string | null; lastTestOk: boolean | null; createdAt: string;
};

export function ApiKeysClient({ keys }: { keys: K[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<K | null>(null);
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});
  const act = useAction();
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} />添加 API Key</button>
      </div>
      <Alert>{act.error}</Alert>
      {keys.length === 0 ? (
        <div className="card">
          <EmptyState icon={<KeyRound size={28} strokeWidth={1.3} />} title="尚未配置 API Key" desc="添加后，Excel 导入 Skill 在遇到非标准表头时可调用 Claude 智能识别字段；后续 Agent 功能同样依赖此配置。" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">名称</th><th className="th w-32">Key</th><th className="th">模型</th><th className="th w-24">状态</th>
                <th className="th w-52">最近测试</th><th className="th w-56" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-ink-850/60">
                  <td className="td text-brand-paper">{k.label}{k.isDefault && <Badge tone="green" className="ml-2">默认</Badge>}</td>
                  <td className="td font-mono text-xs text-brand-sage">sk-…{k.last4}</td>
                  <td className="td font-mono text-xs">{k.model}</td>
                  <td className="td">{k.isActive ? <Badge tone="mid">启用</Badge> : <Badge>停用</Badge>}</td>
                  <td className="td text-xs">
                    {k.lastTestedAt ? (
                      <span className={k.lastTestOk ? "text-brand-mist" : "text-danger"}>{k.lastTestOk ? "✓ 成功" : "✕ 失败"} · <span className="font-num text-brand-sage">{fmtDateTime(k.lastTestedAt)}</span></span>
                    ) : <span className="text-brand-sage">未测试</span>}
                    {testMsg[k.id] && <div className="mt-1 text-2xs text-brand-sage">{testMsg[k.id]}</div>}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn-secondary btn-sm"
                        disabled={act.pending}
                        onClick={() =>
                          act.exec(() => testApiKey(k.id), (r) => {
                            const d = r.data as { models: string[]; modelAvailable: boolean } | undefined;
                            setTestMsg((m) => ({ ...m, [k.id]: d ? (d.modelAvailable ? `模型可用，共 ${d.models.length} 个可选模型` : `⚠ 当前模型不在可用列表中`) : "" }));
                            router.refresh();
                          })
                        }
                      >
                        <Zap size={13} />测试
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => setEditing(k)}>编辑</button>
                      <ConfirmButton
                        className="btn-ghost btn-sm text-danger"
                        title="删除 API Key"
                        confirmText="删除"
                        body={<>确定删除 <b className="text-brand-paper">{k.label}</b>？依赖它的 Agent 功能会切换到其他启用的 Key，没有则不可用。</>}
                        onConfirm={() => act.exec(() => deleteApiKey(k.id), () => router.refresh())}
                      >
                        <Trash2 size={14} />
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <KeyModal onClose={() => setCreating(false)} />}
      {editing && <KeyModal k={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function KeyModal({ k, onClose }: { k?: K; onClose: () => void }) {
  const router = useRouter();
  const a = useAction();
  const m = useAction();
  const [f, setF] = useState({ label: k?.label ?? "Anthropic 主账号", key: "", model: k?.model ?? "", isActive: k?.isActive ?? true, isDefault: k?.isDefault ?? true });
  const [models, setModels] = useState<string[]>([]);
  return (
    <Modal
      open
      onClose={onClose}
      title={k ? "编辑 API Key" : "添加 API Key"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            disabled={a.pending}
            onClick={() =>
              a.exec(() => (k ? updateApiKey(k.id, f) : createApiKey(f)), () => {
                onClose();
                router.refresh();
              })
            }
          >
            保存
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div><label className="label">名称</label><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div>
          <label className="label">{k ? "替换 Key（留空表示不修改）" : "Anthropic API Key"}</label>
          <div className="flex gap-2">
            <input className="input font-mono" type="password" autoComplete="off" placeholder="sk-ant-…" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
            <button
              type="button"
              className="btn-secondary"
              disabled={m.pending || f.key.length < 20}
              onClick={() => m.exec(() => previewModels(f.key), (r) => {
                const list = (r.data as string[]) ?? [];
                setModels(list);
                if (!f.model && list[0]) setF((x) => ({ ...x, model: list[0] }));
              })}
            >
              获取模型
            </button>
          </div>
          <Alert>{m.error}</Alert>
        </div>
        <div>
          <label className="label">模型 ID</label>
          <input className="input font-mono" list="model-list" placeholder="点击「获取模型」从账号拉取，或手动填写" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
          <datalist id="model-list">{models.map((x) => <option key={x} value={x} />)}</datalist>
          {models.length > 0 && <div className="mt-1 text-2xs text-brand-sage">已获取 {models.length} 个可用模型</div>}
        </div>
        <div className="flex items-center gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm text-brand-mist"><Toggle checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />启用</label>
          <label className="flex items-center gap-2 text-sm text-brand-mist"><Toggle checked={f.isDefault} onChange={(v) => setF({ ...f, isDefault: v })} />设为默认</label>
        </div>
        <Alert>{a.error}</Alert>
      </div>
    </Modal>
  );
}
