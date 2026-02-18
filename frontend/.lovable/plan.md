

# Display Real Thumbnails, Images & Videos

## The Problem

All asset thumbnails are placeholder icons, images show "Image preview" text, and videos point to non-existent local file paths. Nothing visual actually loads.

## The Fix

### 1. Add real placeholder URLs to mock data (`src/services/mockData.ts`)

Use [picsum.photos](https://picsum.photos) to generate unique thumbnail and preview URLs for each asset based on its ID. Use a public sample video URL for video proxy paths.

- `thumbnail_path` -- generate per-asset: `https://picsum.photos/seed/{assetId}/400/225` (16:9 ratio, small for grid)
- For **image** assets: `proxy_path` becomes `https://picsum.photos/seed/{assetId}/1920/1080` (full-size preview)
- For **video** assets: `proxy_path` becomes a public sample `.mp4` URL (e.g. a short Big Buck Bunny clip or similar public domain video). A few different clips will be rotated across video assets for variety.

### 2. Update `AssetThumbnail` to render actual images (`src/pages/SubjectDetail.tsx` + `src/pages/PackageDetail.tsx`)

Replace the placeholder icon with an `<img>` tag that loads `asset.thumbnail_path`:

- Show the image with `object-cover` filling the aspect-video container
- Keep the Film/ImageIcon as a fallback behind the image (visible while loading or on error)
- Add a simple loading state (the muted background already serves this purpose)

### 3. Update `AssetDetailPanel` to render actual images and videos (`src/pages/SubjectDetail.tsx` + `src/pages/PackageDetail.tsx`)

**For images:**
- Replace the "Image preview" placeholder div with an actual `<img src={asset.proxy_path}>` that fills the preview area with `object-contain`
- Keep the zoom toggle behavior (clicking enlarges the image)

**For videos:**
- The `<video>` element already exists and uses `proxy_path` -- it will work once `proxy_path` points to a real URL
- Add `playsInline` attribute for iOS compatibility

---

## Technical Details

### Files to modify:

**`src/services/mockData.ts`**
- Update the `makeAsset` helper to generate real URLs:
  - `thumbnail_path`: `https://picsum.photos/seed/${id}/400/225`
  - Image `proxy_path`: `https://picsum.photos/seed/${id}/1920/1080`  
  - Video `proxy_path`: rotate through 2-3 public sample video URLs (short clips, public domain)

**`src/pages/SubjectDetail.tsx`** (AssetThumbnail + AssetDetailPanel)
- `AssetThumbnail`: Add `<img>` loading `thumbnail_path` with `object-cover`, icon as fallback behind it
- `AssetDetailPanel` image section: Replace placeholder div with `<img src={proxy_path}>` using `object-contain`
- Add `playsInline` to the `<video>` element

**`src/pages/PackageDetail.tsx`** (same AssetThumbnail + AssetDetailPanel components)
- Same changes as SubjectDetail -- both files have their own copies of these components

### Sample video URLs (public domain):
```
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4
```

### Thumbnail rendering pattern:
```text
<div class="aspect-video relative">
  <!-- Fallback icon (behind image) -->
  <Film class="absolute center text-muted/20" />
  <!-- Actual thumbnail -->
  <img src={thumbnail_path} class="absolute inset-0 w-full h-full object-cover" />
</div>
```
