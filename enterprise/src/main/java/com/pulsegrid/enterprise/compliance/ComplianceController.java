package com.pulsegrid.enterprise.compliance;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/enterprise/compliance")
public class ComplianceController {

	@GetMapping("/gdpr/requests")
	public List<ComplianceEvent> gdprRequests() {
		return List.of(
			new ComplianceEvent("gdpr-export-001", "data-export", "completed", OffsetDateTime.now().minusDays(2),
				"Workspace owner requested a full data export"),
			new ComplianceEvent("gdpr-erasure-002", "erasure", "pending", OffsetDateTime.now().minusHours(5),
				"User deletion cascade waiting for final confirmation"));
	}

	@PostMapping("/gdpr/erasure")
	public ComplianceActionResult eraseUser() {
		return new ComplianceActionResult("queued", "User and tenant-linked data removal request queued.");
	}

	@GetMapping("/soc2/evidence")
	public List<ComplianceEvent> soc2Evidence() {
		return List.of(
			new ComplianceEvent("soc2-access-review-q1", "evidence-export", "ready", OffsetDateTime.now().minusDays(7),
				"Access review, permissions snapshot, and change history bundle"),
			new ComplianceEvent("soc2-change-log-q1", "evidence-export", "ready", OffsetDateTime.now().minusDays(6),
				"Deployment and incident controls export"));
	}

	@GetMapping("/hipaa/access-logs")
	public List<ComplianceEvent> hipaaAccessLogs() {
		return List.of(
			new ComplianceEvent("hipaa-log-7781", "access-log", "immutable", OffsetDateTime.now().minusMinutes(43),
				"Privileged access to protected health data was recorded"),
			new ComplianceEvent("hipaa-log-7782", "access-log", "immutable", OffsetDateTime.now().minusMinutes(12),
				"Exported audit trail retained for seven years"));
	}

	public record ComplianceEvent(String id, String category, String status, OffsetDateTime createdAt, String note) {
	}

	public record ComplianceActionResult(String status, String message) {
	}
}
