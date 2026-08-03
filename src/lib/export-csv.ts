/**
 * Export data as CSV file (compatible with Excel, LibreOffice, Google Sheets)
 */
export function exportToCSV(
  filename: string,
  headers: string[],
  rows: string[][]
) {
  const BOM = "\uFEFF"; // UTF-8 BOM for Excel compatibility
  const separator = ";"; // Semicolon works better with Excel in pt-BR locale

  const escape = (value: string) => {
    const str = value ?? "";
    if (str.includes(separator) || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent =
    BOM +
    headers.map(escape).join(separator) +
    "\n" +
    rows.map((row) => row.map(escape).join(separator)).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
