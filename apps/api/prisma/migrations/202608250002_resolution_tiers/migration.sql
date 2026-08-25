-- 图片模型分辨率配置改为「档位（几 K + 短边）+ 比例」自由组合。
-- resolutionTiers: [{ label: '1K', shortEdge: 1024 }, ...]
-- allowedRatios:   ['1:1', '3:2', '2:3', '16:9']
-- 现有图片模型的 allowedSizes（WxH 预设）尽量回填为档位 + 比例；无法解析的忽略。
-- 视频模型的 allowedSizes（比例列表）语义不变。

ALTER TABLE "Model" ADD COLUMN "resolutionTiers" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Model" ADD COLUMN "allowedRatios" JSONB NOT NULL DEFAULT '[]';

DO $$
DECLARE
  m RECORD;
  s TEXT;
  w INT;
  h INT;
  a INT;
  b INT;
  g INT;
  tiers JSONB := '[]';
  ratios JSONB := '[]';
BEGIN
  FOR m IN SELECT "id", "allowedSizes" FROM "Model" WHERE "mediaKind" = 'IMAGE' LOOP
    tiers := '[]';
    ratios := '[]';
    FOR s IN SELECT jsonb_array_elements_text(m."allowedSizes") LOOP
      IF s ~ '^[0-9]{1,5}x[0-9]{1,5}$' THEN
        w := split_part(s, 'x', 1)::int;
        h := split_part(s, 'x', 2)::int;
        IF w > 0 AND h > 0 THEN
          a := w;
          b := h;
          WHILE b <> 0 LOOP
            g := a % b;
            a := b;
            b := g;
          END LOOP;
          -- a = gcd(w, h)
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(tiers) t WHERE (t->>'shortEdge')::int = LEAST(w, h)
          ) THEN
            tiers := tiers || jsonb_build_object(
              'label',
              CASE LEAST(w, h)
                WHEN 1024 THEN '1K'
                WHEN 1440 THEN '2K'
                WHEN 2160 THEN '4K'
                ELSE LEAST(w, h)::text
              END,
              'shortEdge', LEAST(w, h)
            );
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(ratios) r WHERE r = to_jsonb((w / a)::text || ':' || (h / a)::text)
          ) THEN
            ratios := ratios || to_jsonb((w / a)::text || ':' || (h / a)::text);
          END IF;
        END IF;
      END IF;
    END LOOP;
    UPDATE "Model" SET "resolutionTiers" = tiers, "allowedRatios" = ratios WHERE "id" = m."id";
  END LOOP;
END $$;
