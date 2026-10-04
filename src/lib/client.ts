/** Browser-side helpers: file encoding, screenshot slicing and reading the event stream. */

/** Vercel rejects request bodies over 4.5 MB; leave headroom for the JSON around the files. */
export const MAX_REQUEST_BYTES = 4_200_000;

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Turns a screenshot into JPEG data URLs the vision model can read well.
 * Vision models shrink large images, so a long, scrolling screenshot of a job page
 * would become unreadably small. Tall images are cut into overlapping slices instead.
 */
export async function prepareScreenshot(file: Blob): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const sliceHeight = Math.round(width * 1.4);
  const overlap = 80;

  const slices: string[] = [];
  for (let top = 0; ; top += sliceHeight - overlap) {
    const h = Math.min(sliceHeight, height - top);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, h);
    ctx.drawImage(bitmap, 0, top / scale, bitmap.width, h / scale, 0, 0, width, h);
    slices.push(canvas.toDataURL("image/jpeg", 0.88));
    if (top + h >= height) break;
  }
  bitmap.close();
  return slices;
}

/** Yields each JSON line of a streamed response as it arrives. */
export async function* readNdjson<T>(response: Response): AsyncGenerator<T> {
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as T;
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer) as T;
}

export class AccessCodeError extends Error {}

export async function postJson(path: string, body: unknown, accessCode: string): Promise<Response> {
  const payload = JSON.stringify(body);
  if (payload.length > MAX_REQUEST_BYTES) {
    throw new Error("The files are too large to upload (4.5 MB limit). Use a smaller PDF or fewer screenshots.");
  }
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(accessCode ? { "x-access-code": accessCode } : {}) },
    body: payload,
  });
  if (response.status === 401) throw new AccessCodeError("Enter the access code for this deployment.");
  if (response.status === 413) throw new Error("The upload is too large. Use a smaller PDF or fewer screenshots.");
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed (${response.status}).`);
  }
  return response;
}
