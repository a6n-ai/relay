import {
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";

const DOC_EXT = /^(docx?|odt|rtf|txt|md|pages)$/;
const SHEET_EXT = /^(xlsx?|ods|csv|numbers)$/;
const ARCHIVE_EXT = /^(zip|gz|tgz|tar|rar|7z)$/;
const DOC_TYPE = /^(text\/|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml|vnd\.oasis\.opendocument\.text|rtf))/;
const SHEET_TYPE = /^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml|vnd\.oasis\.opendocument\.spreadsheet)|^text\/csv/;
const ARCHIVE_TYPE = /^application\/(zip|gzip|x-tar|x-gtar|x-rar|vnd\.rar|x-7z-compressed|x-compressed)/;

/** Icon by declared type first, then by extension. Declared types are only hints, so it never serves the file. */
export function attachmentIcon(contentType: string, filename: string): LucideIcon {
  const type = contentType.toLowerCase();
  const ext = filename.includes(".") ? (filename.split(".").pop() ?? "").toLowerCase() : "";
  if (type.startsWith("image/")) return ImageIcon;
  if (type === "application/pdf" || ext === "pdf") return FileTextIcon;
  if (SHEET_TYPE.test(type) || SHEET_EXT.test(ext)) return FileSpreadsheetIcon;
  if (ARCHIVE_TYPE.test(type) || ARCHIVE_EXT.test(ext)) return FileArchiveIcon;
  if (DOC_TYPE.test(type) || DOC_EXT.test(ext)) return FileTypeIcon;
  return FileIcon;
}

/** Sizes use 1 KB = 1_000 bytes. Each unit steps up before its rounded figure reaches 1000 of the unit below. */
export function formatSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 999_500) return `${Math.round(bytes / 1_000)} KB`;
  if (bytes < 999_950_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}
