package io.pulsegrid.enterprise.service.service;

import com.opencsv.CSVWriter;
import io.pulsegrid.enterprise.domain.AuditLog;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/**
 * Exports audit timeline data to CSV or PDF for enterprise admins.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuditExportService {

    private final AuditService auditService;

    public byte[] exportAuditLogs(UUID workspaceId, UUID userId, String eventType, String resourceType, String resourceId, Instant from, Instant to, String format, int limit) {
        List<AuditLog> logs = auditService.getTimeline(workspaceId, userId, eventType, resourceType, resourceId, from, to, limit);
        if (format == null || format.isBlank() || "csv".equalsIgnoreCase(format)) {
            return exportCsv(logs);
        }
        if ("pdf".equalsIgnoreCase(format)) {
            return exportPdf(logs, workspaceId);
        }
        throw new IllegalArgumentException("Unsupported audit export format: " + format);
    }

    private byte[] exportCsv(List<AuditLog> logs) {
        try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
             OutputStreamWriter writer = new OutputStreamWriter(outputStream, StandardCharsets.UTF_8);
             CSVWriter csvWriter = new CSVWriter(writer)) {

            csvWriter.writeNext(new String[]{"id", "workspaceId", "userId", "eventType", "action", "resourceType", "resourceId", "ipAddress", "createdAt", "details", "beforeState", "afterState", "immutableHash"}, false);

            for (AuditLog log : logs) {
                csvWriter.writeNext(new String[]{
                        stringValue(log.getId()),
                        stringValue(log.getWorkspaceId()),
                        stringValue(log.getUserId()),
                        stringValue(log.getEventType()),
                        stringValue(log.getAction()),
                        stringValue(log.getResourceType()),
                        stringValue(log.getResourceId()),
                        stringValue(log.getIpAddress()),
                        formatInstant(log.getCreatedAt()),
                        stringValue(log.getDetails()),
                        stringValue(log.getBeforeState()),
                        stringValue(log.getAfterState()),
                        stringValue(log.getImmutableHash())
                }, false);
            }

            csvWriter.flush();
            return outputStream.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to export audit logs as CSV", e);
        }
    }

    private byte[] exportPdf(List<AuditLog> logs, UUID workspaceId) {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            PdfWriterState writerState = startAuditPdfPage(document, workspaceId, logs.size());

            int index = 1;
            for (AuditLog auditLog : logs) {
                writerState = ensureSpace(document, writerState);
                writerState.contentStream.showText(index++ + ". " + truncate(auditLog.getCreatedAt()) + " | " + truncate(auditLog.getEventType()) + " | " + truncate(auditLog.getAction()));
                writerState.contentStream.newLine();
                writerState = ensureSpace(document, writerState);
                writerState.contentStream.showText("   actor=" + truncate(auditLog.getUserId()) + " ip=" + truncate(auditLog.getIpAddress()) + " resource=" + truncate(auditLog.getResourceType()) + "/" + truncate(auditLog.getResourceId()));
                writerState.contentStream.newLine();
                writerState = ensureSpace(document, writerState);
                writerState.contentStream.showText("   before=" + truncate(auditLog.getBeforeState()));
                writerState.contentStream.newLine();
                writerState = ensureSpace(document, writerState);
                writerState.contentStream.showText("   after =" + truncate(auditLog.getAfterState()));
                writerState.contentStream.newLine();
                writerState.contentStream.newLine();
                writerState.y -= 14.5f;
            }

            writerState.contentStream.endText();
            writerState.contentStream.close();

            document.save(outputStream);
            return outputStream.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to export audit logs as PDF", e);
        }
    }

    private PdfWriterState startAuditPdfPage(PDDocument document, UUID workspaceId, int totalRecords) throws Exception {
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);
        PDPageContentStream contentStream = new PDPageContentStream(document, page);
        contentStream.setLeading(14.5f);
        contentStream.beginText();
        contentStream.setFont(PDType1Font.HELVETICA_BOLD, 14);
        contentStream.newLineAtOffset(40, 770);
        contentStream.showText("PulseGrid Audit Timeline");
        contentStream.newLine();
        contentStream.setFont(PDType1Font.HELVETICA, 10);
        contentStream.showText("Workspace: " + workspaceId);
        contentStream.newLine();
        contentStream.showText("Total records: " + totalRecords);
        contentStream.newLine();
        contentStream.newLine();
        return new PdfWriterState(page, contentStream, 720f);
    }

    private PdfWriterState ensureSpace(PDDocument document, PdfWriterState writerState) throws Exception {
        if (writerState.y > 70f) {
            return writerState;
        }

        writerState.contentStream.endText();
        writerState.contentStream.close();

        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);
        PDPageContentStream contentStream = new PDPageContentStream(document, page);
        contentStream.setLeading(14.5f);
        contentStream.beginText();
        contentStream.setFont(PDType1Font.HELVETICA, 10);
        contentStream.newLineAtOffset(40, 770);
        contentStream.showText("PulseGrid Audit Timeline - continued");
        contentStream.newLine();
        contentStream.newLine();
        return new PdfWriterState(page, contentStream, 720f);
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String formatInstant(Instant instant) {
        return instant == null ? "" : DateTimeFormatter.ISO_INSTANT.withZone(ZoneOffset.UTC).format(instant);
    }

    private String truncate(Object value) {
        if (value == null) {
            return "";
        }
        String text = String.valueOf(value);
        return text.length() > 120 ? text.substring(0, 117) + "..." : text;
    }

    private static final class PdfWriterState {
        private final PDPageContentStream contentStream;
        private float y;

        private PdfWriterState(PDPage page, PDPageContentStream contentStream, float y) {
            this.contentStream = contentStream;
            this.y = y;
        }
    }
}
