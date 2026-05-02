package io.pulsegrid.enterprise.service.model;

public record SsoLoginUrls(String samlLoginUrl, String oidcLoginUrl, String samlRegistrationId, String oidcRegistrationId) {
}
