package io.pulsegrid.enterprise.service.audit;

import io.pulsegrid.enterprise.domain.AuditEventType;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a method as a privileged action that must be recorded in the audit trail.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface EnterpriseAudited {
    AuditEventType eventType();
    String action();
    String resourceType() default "";
    String resourceIdExpression() default "";
}
