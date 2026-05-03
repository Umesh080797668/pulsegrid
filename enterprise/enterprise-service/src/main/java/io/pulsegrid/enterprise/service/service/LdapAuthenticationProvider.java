package io.pulsegrid.enterprise.service.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import io.pulsegrid.enterprise.domain.AuditEventType;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;

import java.util.*;

/**
 * Custom LDAP authentication provider for just-in-time user provisioning.
 * Authenticates users against LDAP and provisions them in PulseGrid on first login.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LdapAuthenticationProvider implements AuthenticationProvider {

    private final LdapService ldapService;
    private final UserProvisioningService userProvisioningService;
    private final AuditService auditService;

    @Override
    public Authentication authenticate(Authentication authentication) throws AuthenticationException {
        String username = authentication.getName();
        String password = (String) authentication.getCredentials();
        UUID workspaceId = extractWorkspaceId(authentication);

        if (workspaceId == null) {
            throw new BadCredentialsException("Workspace ID not found in authentication context");
        }

        try {
            // Authenticate against LDAP
            Optional<Map<String, Object>> ldapUser = ldapService.authenticateUser(workspaceId, username, password);

            if (ldapUser.isEmpty()) {
                log.warn("LDAP authentication failed for user: {} in workspace: {}", username, workspaceId);
                auditService.recordPrivilegedAction(
                        workspaceId,
                        null,
                        AuditEventType.FAILED_LOGIN,
                        "LDAP login failed",
                        "authentication",
                        username,
                        null,
                        null,
                        "Invalid LDAP credentials",
                        resolveIpAddress(),
                        resolveUserAgent()
                );
                throw new BadCredentialsException("Invalid credentials");
            }

            Map<String, Object> userInfo = ldapUser.get();
            String userDn = (String) userInfo.get("dn");

            // Get user's LDAP groups
            List<String> ldapGroups = ldapService.getUserGroups(workspaceId, userDn);
            
            // Map LDAP groups to PulseGrid roles
            Set<String> roles = ldapService.getMappedRoles(workspaceId, ldapGroups);

            // Provision user in PulseGrid (JIT provisioning)
            String userId = userProvisioningService.provisionOrUpdateUser(
                    workspaceId,
                    username,
                    userInfo,
                    ldapGroups,
                    roles
            );

            log.info("LDAP JIT provisioning successful for user: {} in workspace: {}", username, workspaceId);

            // Create authentication token with roles
            Collection<GrantedAuthority> authorities = roles.stream()
                    .map(role -> new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()))
                    .map(GrantedAuthority.class::cast)
                    .toList();

            UsernamePasswordAuthenticationToken token = new UsernamePasswordAuthenticationToken(
                    userId,
                    password,
                    authorities
            );
            token.setDetails(userInfo);

                auditService.recordPrivilegedAction(
                    workspaceId,
                    null,
                    AuditEventType.LOGIN,
                    "LDAP login successful",
                    "authentication",
                    username,
                    null,
                    userInfo,
                    "Successful LDAP authentication and JIT provisioning",
                    resolveIpAddress(),
                    resolveUserAgent()
                );

            return token;

        } catch (Exception e) {
            log.error("Error during LDAP authentication for user: {}", username, e);
            throw new BadCredentialsException("Authentication failed: " + e.getMessage(), e);
        }
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return UsernamePasswordAuthenticationToken.class.isAssignableFrom(authentication);
    }

    private UUID extractWorkspaceId(Authentication authentication) {
        Object details = authentication.getDetails();
        if (details instanceof Map) {
            Map<?, ?> detailsMap = (Map<?, ?>) details;
            Object workspaceId = detailsMap.get("workspaceId");
            if (workspaceId instanceof UUID) {
                return (UUID) workspaceId;
            } else if (workspaceId instanceof String) {
                try {
                    return UUID.fromString((String) workspaceId);
                } catch (IllegalArgumentException e) {
                    log.warn("Invalid workspace ID in authentication details");
                }
            }
        }

        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs != null) {
            HttpServletRequest request = attrs.getRequest();
            String header = request.getHeader("X-Workspace-Id");
            if (header != null && !header.isBlank()) {
                try {
                    return UUID.fromString(header.trim());
                } catch (IllegalArgumentException e) {
                    log.warn("Invalid X-Workspace-Id header value");
                }
            }
        }

        return null;
    }

    private String resolveIpAddress() {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            return "unknown";
        }
        HttpServletRequest request = attrs.getRequest();
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "unknown";
    }

    private String resolveUserAgent() {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            return null;
        }
        return attrs.getRequest().getHeader("User-Agent");
    }
}
