package io.pulsegrid.enterprise.service.model;

import java.util.List;
import java.util.Map;

public record ValidatedSamlAssertion(String subject, Map<String, List<String>> attributes) {
}
