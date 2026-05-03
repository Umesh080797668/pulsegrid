package io.pulsegrid.enterprise.service.controller;

import io.pulsegrid.enterprise.service.batch.GdprErasureService;
import io.pulsegrid.enterprise.service.batch.GdprExportService;
import io.pulsegrid.enterprise.service.dto.GdprErasureResponse;
import io.pulsegrid.enterprise.service.dto.GdprExportRequest;
import jakarta.validation.Valid;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/compliance/gdpr")
public class GdprComplianceController {

    private final GdprExportService gdprExportService;
    private final GdprErasureService gdprErasureService;

    public GdprComplianceController(GdprExportService gdprExportService, GdprErasureService gdprErasureService) {
        this.gdprExportService = gdprExportService;
        this.gdprErasureService = gdprErasureService;
    }

    @PostMapping(value = "/export", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Resource> export(@Valid @RequestBody GdprExportRequest request) {
        Path outputFile = gdprExportService.launchExport(request.getWorkspaceId(), request.getUserId());
        FileSystemResource resource = new FileSystemResource(outputFile);
        long contentLength;
        try {
            contentLength = Files.size(outputFile);
        } catch (Exception ex) {
            contentLength = -1L;
        }

        ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(outputFile.getFileName().toString()).build().toString())
                .contentType(MediaType.APPLICATION_JSON);

        if (contentLength >= 0) {
            builder.contentLength(contentLength);
        }

        return builder.body(resource);
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<GdprErasureResponse> erase(
            @RequestParam("workspaceId") java.util.UUID workspaceId,
            @org.springframework.web.bind.annotation.PathVariable java.util.UUID userId
    ) {
        GdprErasureService.ErasureResult result = gdprErasureService.eraseUser(workspaceId, userId);
        return ResponseEntity.ok(new GdprErasureResponse(
                result.workspaceId(),
                result.userId(),
                result.placeholderUserId(),
                result.deletedAuditLogs(),
                result.anonymizedFlowRuns(),
                result.purgedCredentials()
        ));
    }
}