import { Request, Response } from "express";
import { StudentExportService } from "../services/student-export.service.js";
import { XLSX_CONTENT_TYPE } from "../utils/excel.util.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const exportService = new StudentExportService();

/**
 * GET /api/courses/:id/students/export
 *
 * Responds with the workbook itself rather than a link to one: the file is
 * built per request from live data, so there is nothing to store and nothing
 * that can be fetched later by someone who should no longer have it.
 */
export const exportCourseStudents = asyncHandler(
  async (req: Request, res: Response) => {
    const { buffer, filename, studentCount } =
      await exportService.exportCourseStudents(
        req.params.id as string,
        req.user!
      );

    res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Content-Length", buffer.length);
    // A roster is personal data: no shared cache may keep a copy of it.
    res.setHeader("Cache-Control", "private, no-store");
    // Lets a browser client read the filename off the response, which it cannot
    // do for Content-Disposition unless the header is explicitly exposed.
    res.setHeader("X-Student-Count", String(studentCount));
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition, X-Student-Count"
    );

    res.status(200).send(buffer);
  }
);
