import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getStaffSession, requireRole } from "@/lib/auth";

const BUCKET = "brand-images";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (after client-side compression)
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Uploads a logo file and returns its public URL. Persisting the URL onto the
 * restaurant row is a separate step (PATCH /api/settings), matching how the
 * menu item editor handles dish images.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(["owner"]);
  if (guard) return guard;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Expected multipart form data." } },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", message: "No file provided." } },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: { code: "INVALID_TYPE", message: "Only JPEG, PNG or WebP accepted." } },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: { code: "FILE_TOO_LARGE", message: "File exceeds 2 MB limit." } },
      { status: 400 }
    );
  }

  const session = await getStaffSession();
  const supabase = createServerClient();

  // Ensure bucket exists (no-op if already created)
  await supabase.storage.createBucket(BUCKET, { public: true });

  const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const path = `${session!.restaurantId}/logo-${crypto.randomUUID()}.${ext}`;

  const buffer = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    console.error("[settings logo upload]", error);
    return NextResponse.json(
      { error: { code: "UPLOAD_FAILED", message: "Logo upload failed." } },
      { status: 500 }
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ url: data.publicUrl });
}
