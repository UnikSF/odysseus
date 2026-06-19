import { NextRequest, NextResponse } from "next/server";
import { importBuffer } from "@/lib/import";

export async function POST(req: NextRequest) {
  let file: File;
  try {
    const form = await req.formData();
    const f = form.get("file") as File | null;
    if (!f) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (f.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    file = f;
  } catch {
    return NextResponse.json({ error: "Could not read upload" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await importBuffer(buffer, file.name);

  if (result.warning && result.imported === 0) {
    return NextResponse.json({ error: result.warning }, { status: 400 });
  }

  const { imported, skipped, errors, warning } = result;
  return NextResponse.json({ imported, skipped, errors, warning });
}
