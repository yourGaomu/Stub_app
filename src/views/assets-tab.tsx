import { useEffect, useState } from "react";
import { App } from "antd";
import {
  Upload,
  Link2,
  Trash2,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  Film,
  Archive,
} from "lucide-react";
import { assetsApi } from "../services/api";
import type { AssetDTO } from "../services/api/types";
import { useAuthStore } from "../stores/auth-store";
import { formatBytes, formatDateTime } from "../lib/format";
import { BottomSheet } from "../components/bottom-sheet";

const previewCache = new Map<string, string>();

function AssetThumbnail({
  asset,
  onPreview,
}: {
  asset: AssetDTO;
  onPreview: (url: string, title: string) => void;
}) {
  const mime = asset.contentType || "";
  const isImage = mime.startsWith("image/") && !asset.deletedAt;
  const [src, setSrc] = useState<string>(() => previewCache.get(asset.assetId) || "");

  useEffect(() => {
    if (!isImage) return;
    if (previewCache.has(asset.assetId)) {
      setSrc(previewCache.get(asset.assetId) || "");
      return;
    }
    let cancelled = false;
    assetsApi
      .getPreviewUrl(asset.assetId, mime)
      .then((url) => {
        if (!cancelled && url) {
          previewCache.set(asset.assetId, url);
          setSrc(url);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [asset.assetId, isImage, mime]);

  if (isImage && src) {
    return (
      <div
        onClick={() => onPreview(src, asset.fileName || asset.path)}
        className="h-24 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] overflow-hidden cursor-pointer relative"
      >
        <img
          src={src}
          alt={asset.fileName || asset.path}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="h-24 rounded-sm border border-dashed border-[var(--line)] bg-[var(--bg-card)] flex flex-col items-center justify-center gap-1 px-2 text-center">
      {mime.startsWith("image/") ? (
        <ImageIcon className="w-5 h-5 text-[var(--accent)]" />
      ) : mime.startsWith("video/") ? (
        <Film className="w-5 h-5 text-[var(--warn)]" />
      ) : mime.includes("zip") || mime.includes("compressed") ? (
        <Archive className="w-5 h-5 text-[var(--ink-2)]" />
      ) : (
        <FileText className="w-5 h-5 text-[var(--ink-2)]" />
      )}
      <span className="text-[10px] font-mono text-[var(--ink-3)] truncate max-w-full">
        {mime || "application/octet-stream"}
      </span>
    </div>
  );
}

export function AssetsTab({
  refreshTrigger,
  onCreateAssetLink,
}: {
  refreshTrigger: number;
  onCreateAssetLink: (asset: AssetDTO) => void;
}) {
  const { message } = App.useApp();
  const businesses = useAuthStore((s) => s.businesses);

  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [businessFilter, setBusinessFilter] = useState<string>("all");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusinessId, setUploadBusinessId] = useState("");
  const [uploadPath, setUploadPath] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [previewImg, setPreviewImg] = useState<{ url: string; title: string } | null>(null);

  const loadAssets = async () => {
    try {
      const res = await assetsApi.list({
        businessId: businessFilter === "all" ? undefined : businessFilter,
        includeDeleted,
      });
      setAssets(res.items || []);
    } catch (err: any) {
      message.error(err?.message || "加载素材列表失败");
    }
  };

  useEffect(() => {
    loadAssets();
  }, [businessFilter, includeDeleted, refreshTrigger]);

  useEffect(() => {
    if (!uploadBusinessId && businesses.length > 0) {
      setUploadBusinessId(businesses[0].businessId);
    }
  }, [businesses, uploadBusinessId]);

  const handleUpload = async () => {
    if (!uploadBusinessId.trim()) {
      message.warning("请选择或填写所属业务桶 ID");
      return;
    }
    if (!uploadFile) {
      message.warning("请选择要上传的图片或文件");
      return;
    }
    setUploading(true);
    try {
      const created = await assetsApi.upload({
        businessId: uploadBusinessId.trim(),
        path: uploadPath.trim() || uploadFile.name,
        file: uploadFile,
      });
      message.success(`素材「${created.fileName}」已上传至业务桶 ${created.businessId}`);
      setUploadOpen(false);
      setUploadFile(null);
      setUploadPath("");
      loadAssets();
    } catch (err: any) {
      message.error(err?.message || "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (asset: AssetDTO) => {
    try {
      await assetsApi.remove(asset.assetId);
      message.success("已移入 7 天回收站，关联短链已自动不可用");
      loadAssets();
    } catch (err: any) {
      message.error(err?.message || "删除失败");
    }
  };

  const handleRestore = async (asset: AssetDTO) => {
    try {
      await assetsApi.restore(asset.assetId);
      message.success("素材已从回收站恢复");
      loadAssets();
    } catch (err: any) {
      message.error(err?.message || "恢复失败");
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Header action bar */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold">私有素材库 · MinIO Assets</div>
          <div className="text-[10px] font-mono text-[var(--ink-3)]">
            按业务桶物理隔离 · 软删保留 7 天
          </div>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="stub-btn stub-btn-accent px-3 py-1.5 text-xs"
        >
          <Upload className="w-3.5 h-3.5" /> 上传素材
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setBusinessFilter("all")}
            className={`stub-pill cursor-pointer shrink-0 ${
              businessFilter === "all"
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                : ""
            }`}
          >
            全部业务桶
          </button>
          {businesses.map((biz) => (
            <button
              key={biz.businessId}
              type="button"
              onClick={() => setBusinessFilter(biz.businessId)}
              className={`stub-pill cursor-pointer shrink-0 ${
                businessFilter === biz.businessId
                  ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                  : ""
              }`}
            >
              bucket: {biz.businessId}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIncludeDeleted((v) => !v)}
          className={`stub-pill cursor-pointer shrink-0 ${
            includeDeleted ? "stub-pill-warn" : ""
          }`}
        >
          {includeDeleted ? "含回收站" : "回收站"}
        </button>
      </div>

      {/* 2-Column Asset Grid */}
      {assets.length === 0 ? (
        <div className="m-ticket text-center py-8 text-xs font-mono text-[var(--ink-3)]">
          当前业务桶暂无素材，点击右上角「上传素材」添加相册或文件
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {assets.map((asset) => {
            const isDeleted = Boolean(asset.deletedAt);
            return (
              <div
                key={asset.assetId}
                className="p-2.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] flex flex-col justify-between"
              >
                <div>
                  <AssetThumbnail
                    asset={asset}
                    onPreview={(url, title) => setPreviewImg({ url, title })}
                  />
                  <div className="text-xs font-bold truncate mt-2" title={asset.fileName}>
                    {asset.fileName || asset.path}
                  </div>
                  <div className="text-[10px] font-mono text-[var(--ink-3)] mt-0.5 flex items-center justify-between">
                    <span>{formatBytes(asset.sizeBytes)}</span>
                    <span>{asset.businessId}</span>
                  </div>
                  {isDeleted && (
                    <div className="mt-1">
                      <span className="stub-pill stub-pill-err text-[9px]">
                        回收站 · {formatDateTime(asset.deletedAt)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-dashed border-[var(--line)]">
                  {!isDeleted ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onCreateAssetLink(asset)}
                        className="stub-btn stub-btn-primary py-1 text-[11px]"
                      >
                        <Link2 className="w-3 h-3" /> ＋ 短链
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(asset)}
                        className="stub-btn stub-btn-ghost py-1 text-[11px] text-[var(--err)]"
                      >
                        <Trash2 className="w-3 h-3" /> 软删
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRestore(asset)}
                      className="col-span-2 stub-btn stub-btn-ghost py-1 text-[11px]"
                    >
                      <RotateCcw className="w-3 h-3" /> 从回收站恢复
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image Preview Sheet */}
      <BottomSheet
        open={!!previewImg}
        onClose={() => setPreviewImg(null)}
        title={previewImg?.title || "图片预览"}
        subtitle="15 分钟短期预签名预览（不消耗短链访问额度）"
      >
        {previewImg && (
          <div className="rounded-sm border border-[var(--line-strong)] bg-[var(--bg-card)] p-2 text-center">
            <img
              src={previewImg.url}
              alt={previewImg.title}
              className="max-h-[60dvh] mx-auto rounded-sm object-contain"
            />
          </div>
        )}
      </BottomSheet>

      {/* Upload Sheet */}
      <BottomSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="上传私有素材 · Upload Asset"
        subtitle="POST /api/v1/assets"
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
              所属业务桶 ID (bucketName = businessId)
            </label>
            {businesses.length > 0 ? (
              <select
                value={uploadBusinessId}
                onChange={(e) => setUploadBusinessId(e.target.value)}
                className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              >
                {businesses.map((b) => (
                  <option key={b.businessId} value={b.businessId}>
                    {b.businessId} ({b.displayName})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={uploadBusinessId}
                onChange={(e) => setUploadBusinessId(e.target.value)}
                placeholder="例如 canvas-assets"
                className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
              选择手机相册图片或本地文件
            </label>
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setUploadFile(f);
                if (f && !uploadPath) setUploadPath(f.name);
              }}
              className="w-full px-2 py-2 rounded-sm border border-dashed border-[var(--line-strong)] bg-[var(--bg-card)] font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
              存储对象路径 / 文件名 (path)
            </label>
            <input
              value={uploadPath}
              onChange={(e) => setUploadPath(e.target.value)}
              placeholder="例如 2026/poster.png"
              className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
            />
          </div>

          <button
            type="button"
            disabled={uploading}
            onClick={handleUpload}
            className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
          >
            {uploading ? "上传至 MinIO 中..." : "确认上传素材"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
