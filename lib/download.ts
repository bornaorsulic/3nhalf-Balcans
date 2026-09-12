import { apiFetch } from "@/lib/session";

function fileNameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const plain = value.match(/filename="?([^";]+)"?/i);
  if (plain?.[1]) return plain[1];
  return null;
}

export async function downloadFromApi(path: string, fallbackName: string): Promise<void> {
  const response = await apiFetch(path);
  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => (body as { detail?: string }).detail)
      .catch(() => null);
    throw new Error(detail ?? `Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileNameFromDisposition(response.headers.get("Content-Disposition")) ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
