package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.service.dto.SsoConfigurationRequest;
import io.pulsegrid.enterprise.service.model.SsoPrincipalAttributes;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class SsoAttributeMapper {

    public SsoPrincipalAttributes mapFromSaml(UUID workspaceId, String provider, Saml2AuthenticatedPrincipal principal, SsoConfigurationRequest request) {
        Map<String, List<Object>> attributes = principal.getAttributes();
        String email = first(attributes, request.getEmailAttribute());
        String department = first(attributes, request.getDepartmentAttribute());
        List<String> roles = values(attributes, request.getRoleAttribute(), request.getGroupsAttribute());
        return new SsoPrincipalAttributes(workspaceId, provider, principal.getName(), email, roles, department);
    }

    public SsoPrincipalAttributes mapFromOidc(UUID workspaceId, String provider, OidcUser user, SsoConfigurationRequest request) {
        Map<String, Object> claims = user.getClaims();
        String email = stringClaim(claims, request.getEmailAttribute());
        String department = stringClaim(claims, request.getDepartmentAttribute());
        List<String> roles = claimList(claims, request.getRoleAttribute(), request.getGroupsAttribute());
        return new SsoPrincipalAttributes(workspaceId, provider, user.getSubject(), email, roles, department);
    }

    public SsoPrincipalAttributes mapFromClaims(UUID workspaceId, String provider, Map<String, ?> claims, SsoConfigurationRequest request) {
        String subject = stringValue(claims, "sub");
        String email = stringValue(claims, request.getEmailAttribute());
        String department = stringValue(claims, request.getDepartmentAttribute());
        List<String> roles = claimList(claims, request.getRoleAttribute(), request.getGroupsAttribute());
        return new SsoPrincipalAttributes(workspaceId, provider, subject, email, roles, department);
    }

    private String first(Map<String, List<Object>> attributes, String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        List<Object> values = attributes.get(key);
        if (values == null || values.isEmpty()) {
            return null;
        }
        Object value = values.get(0);
        return value == null ? null : value.toString();
    }

    private List<String> values(Map<String, List<Object>> attributes, String... keys) {
        List<String> result = new ArrayList<>();
        for (String key : keys) {
            if (key == null || key.isBlank()) {
                continue;
            }
            List<Object> values = attributes.get(key);
            if (values == null) {
                continue;
            }
            for (Object value : values) {
                if (value != null) {
                    String normalized = value.toString();
                    if (!normalized.isBlank() && !result.contains(normalized)) {
                        result.add(normalized);
                    }
                }
            }
        }
        return result;
    }

    private String stringClaim(Map<String, ?> claims, String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        Object value = claims.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof String s) {
            return s;
        }
        if (value instanceof Collection<?> collection && !collection.isEmpty()) {
            Object first = collection.iterator().next();
            return first == null ? null : first.toString();
        }
        return value.toString();
    }

    private List<String> claimList(Map<String, ?> claims, String... keys) {
        List<String> result = new ArrayList<>();
        for (String key : keys) {
            if (key == null || key.isBlank()) {
                continue;
            }
            Object value = claims.get(key);
            if (value instanceof Collection<?> collection) {
                for (Object item : collection) {
                    if (item != null) {
                        String normalized = item.toString();
                        if (!normalized.isBlank() && !result.contains(normalized)) {
                            result.add(normalized);
                        }
                    }
                }
            } else if (value != null) {
                String normalized = value.toString();
                if (!normalized.isBlank() && !result.contains(normalized)) {
                    result.add(normalized);
                }
            }
        }
        return result;
    }

    private String stringValue(Map<String, ?> claims, String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        Object value = claims.get(key);
        return value == null ? null : value.toString();
    }
}
