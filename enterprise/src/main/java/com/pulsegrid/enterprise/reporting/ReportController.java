package com.pulsegrid.enterprise.reporting;

import java.util.List;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/enterprise/reports")
public class ReportController {

	private final ReportService reportService;

	public ReportController(ReportService reportService) {
		this.reportService = reportService;
	}

	@GetMapping(value = "/{reportType}.pdf", produces = MediaType.APPLICATION_PDF_VALUE)
	public ResponseEntity<byte[]> generate(@PathVariable String reportType) {
		byte[] payload = reportService.generatePdf(reportType.toUpperCase() + " report", List.of(
			new ReportService.ReportLine("Report type", reportType),
			new ReportService.ReportLine("Generated for", "enterprise operators"),
			new ReportService.ReportLine("Output", "JasperReports PDF")));

		return ResponseEntity.ok()
			.header(HttpHeaders.CONTENT_DISPOSITION,
				ContentDisposition.attachment().filename(reportType + ".pdf").build().toString())
			.contentType(MediaType.APPLICATION_PDF)
			.body(payload);
	}
}
