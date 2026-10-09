import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ProjectReport } from "../domain/project-report";
/** Produces a paginated A4 report with selectable text and repeatable section layout. */
export async function renderProjectReport(report: ProjectReport) {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]),
    y = 735;
  const safe = (text: string) => text.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
  const addPage = () => {
    page = doc.addPage([595, 842]);
    y = 780;
  };
  page.drawRectangle({
    x: 0,
    y: 758,
    width: 595,
    height: 84,
    color: rgb(0.07, 0.13, 0.23),
  });
  page.drawText("ARK", {
    x: 40,
    y: 806,
    size: 11,
    font: bold,
    color: rgb(0.42, 0.68, 1),
  });
  page.drawText(safe(report.name).slice(0, 65), {
    x: 40,
    y: 778,
    size: 19,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const line = (text: string, heading = false) => {
    const words = safe(text).split(/\s+/);
    let row = "";
    const draw = () => {
      if (y < 55) addPage();
      page.drawText(row, {
        x: 40,
        y,
        size: heading ? 13 : 10,
        font: heading ? bold : font,
        color: rgb(0.1, 0.16, 0.23),
      });
      y -= heading ? 23 : 16;
      row = "";
    };
    for (const word of words) {
      if (font.widthOfTextAtSize(row + " " + word, 10) > 510 && row) draw();
      row += (row ? " " : "") + word;
    }
    draw();
  };
  line(
    report.location +
      " | " +
      report.generated_at.slice(0, 10) +
      " | " +
      report.currency,
  );
  y -= 12;
  for (const section of report.sections) {
    if (y < 115) addPage();
    line(section.title, true);
    for (const row of section.rows) line(row);
    y -= 16;
  }
  doc.getPages().forEach((p, index) =>
    p.drawText("Ark | " + (index + 1) + " / " + doc.getPageCount(), {
      x: 40,
      y: 27,
      size: 9,
      font,
      color: rgb(0.4, 0.45, 0.5),
    }),
  );
  return doc.save();
}
