import { describe, expect, it } from "vitest";
import { FileArchiveIcon, FileIcon, FileSpreadsheetIcon, FileTextIcon, FileTypeIcon, ImageIcon } from "lucide-react";
import { attachmentIcon, formatSize } from "./attachment-format";

describe("attachmentIcon", () => {
  it("picks the icon by declared type, then by extension", () => {
    expect(attachmentIcon("image/png", "logo.png")).toBe(ImageIcon);
    expect(attachmentIcon("application/pdf", "invoice.pdf")).toBe(FileTextIcon);
    expect(attachmentIcon("application/octet-stream", "budget.xlsx")).toBe(FileSpreadsheetIcon);
    expect(attachmentIcon("text/csv", "data.csv")).toBe(FileSpreadsheetIcon);
    expect(attachmentIcon("application/zip", "bundle.zip")).toBe(FileArchiveIcon);
    expect(attachmentIcon("application/octet-stream", "notes.docx")).toBe(FileTypeIcon);
    expect(attachmentIcon("application/octet-stream", "blob")).toBe(FileIcon);
  });
});

describe("formatSize", () => {
  it("uses 1 KB = 1_000 bytes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(240_000)).toBe("240 KB");
    expect(formatSize(10_000_000)).toBe("10.0 MB");
  });

  it("steps up a unit before the rounded figure reaches 1000", () => {
    expect(formatSize(999_499)).toBe("999 KB");
    expect(formatSize(999_500)).toBe("1.0 MB");
    expect(formatSize(999_949_999)).toBe("999.9 MB");
    expect(formatSize(999_950_000)).toBe("1.0 GB");
  });
});
