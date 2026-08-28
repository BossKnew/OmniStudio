type AssetLinksInput = {
  id: string;
  deletedAt?: Date | null;
  purgedAt?: Date | null;
  thumbnail?: { id: string; deletedAt: Date | null; purgedAt?: Date | null } | null;
};

export function serializeAssetLinks(asset: AssetLinksInput, options?: { allowTrash?: boolean }) {
  if (asset.purgedAt || (asset.deletedAt && !options?.allowTrash)) return { deleted: true, contentUrl: null, thumbnailUrl: null };
  const thumbnailId = asset.thumbnail && !asset.thumbnail.purgedAt && (!asset.thumbnail.deletedAt || options?.allowTrash) ? asset.thumbnail.id : asset.id;
  return {
    deleted: false,
    contentUrl: `/api/v1/assets/${asset.id}/content`,
    thumbnailUrl: `/api/v1/assets/${thumbnailId}/content`,
  };
}
