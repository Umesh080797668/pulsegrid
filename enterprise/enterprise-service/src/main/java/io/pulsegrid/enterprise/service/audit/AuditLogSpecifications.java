package io.pulsegrid.enterprise.service.audit;

import io.pulsegrid.enterprise.domain.AuditLog;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;
import java.util.UUID;

/**
 * Dynamic filter specifications for audit timeline queries.
 */
public final class AuditLogSpecifications {

    private AuditLogSpecifications() {
    }

    public static Specification<AuditLog> workspaceIdEquals(UUID workspaceId) {
        return (root, query, builder) -> workspaceId == null ? builder.conjunction() : builder.equal(root.get("workspaceId"), workspaceId);
    }

    public static Specification<AuditLog> userIdEquals(UUID userId) {
        return (root, query, builder) -> userId == null ? builder.conjunction() : builder.equal(root.get("userId"), userId);
    }

    public static Specification<AuditLog> eventTypeEquals(String eventType) {
        return (root, query, builder) -> eventType == null || eventType.isBlank()
                ? builder.conjunction()
                : builder.equal(root.get("eventType"), eventType.trim());
    }

    public static Specification<AuditLog> resourceTypeEquals(String resourceType) {
        return (root, query, builder) -> resourceType == null || resourceType.isBlank()
                ? builder.conjunction()
                : builder.equal(root.get("resourceType"), resourceType.trim());
    }

    public static Specification<AuditLog> resourceIdEquals(String resourceId) {
        return (root, query, builder) -> resourceId == null || resourceId.isBlank()
                ? builder.conjunction()
                : builder.equal(root.get("resourceId"), resourceId.trim());
    }

    public static Specification<AuditLog> createdAfterOrEqual(Instant from) {
        return (root, query, builder) -> from == null ? builder.conjunction() : builder.greaterThanOrEqualTo(root.get("createdAt"), from);
    }

    public static Specification<AuditLog> createdBeforeOrEqual(Instant to) {
        return (root, query, builder) -> to == null ? builder.conjunction() : builder.lessThanOrEqualTo(root.get("createdAt"), to);
    }
}
