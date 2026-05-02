package io.pulsegrid.enterprise.service.model;

import java.security.cert.X509Certificate;
import java.util.List;

public record IdpMetadataDetails(
        String entityId,
        String singleSignOnLocation,
        String singleLogoutLocation,
        List<X509Certificate> signingCertificates
) {
}
