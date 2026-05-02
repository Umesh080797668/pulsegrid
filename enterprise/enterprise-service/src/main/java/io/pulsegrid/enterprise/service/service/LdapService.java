package io.pulsegrid.enterprise.service.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pulsegrid.enterprise.domain.LdapConfiguration;
import io.pulsegrid.enterprise.domain.LdapSyncHistory;
import io.pulsegrid.enterprise.service.dto.LdapConfigurationRequest;
import io.pulsegrid.enterprise.service.dto.LdapConfigurationResponse;
import io.pulsegrid.enterprise.service.dto.LdapSyncHistoryResponse;
import io.pulsegrid.enterprise.service.repository.LdapConfigurationRepository;
import io.pulsegrid.enterprise.service.repository.LdapSyncHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ldap.core.AttributesMapper;
import org.springframework.ldap.core.ContextMapper;
import org.springframework.ldap.core.LdapTemplate;
import org.springframework.ldap.core.support.LdapContextSource;
import org.springframework.ldap.query.LdapQueryBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import javax.naming.NamingEnumeration;
import javax.naming.NamingException;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class LdapService {

    private final LdapConfigurationRepository ldapConfigRepository;
    private final LdapSyncHistoryRepository ldapSyncHistoryRepository;
    private final UserProvisioningService userProvisioningService;
    private final ObjectMapper objectMapper;

    public Optional<LdapConfigurationResponse> getLdapConfiguration(UUID workspaceId) {
        return ldapConfigRepository.findByWorkspaceId(workspaceId).map(this::toResponse);
    }

    public Optional<LdapConfiguration> getLdapConfigurationEntity(UUID workspaceId) {
        return ldapConfigRepository.findByWorkspaceId(workspaceId);
    }

    public LdapConfigurationResponse createOrUpdateLdapConfiguration(LdapConfigurationRequest request) {
        validateRequest(request);

        LdapConfiguration config = ldapConfigRepository.findByWorkspaceId(request.getWorkspaceId())
                .orElseGet(LdapConfiguration::new);

        config.setWorkspaceId(request.getWorkspaceId());
        config.setLdapUrl(request.getLdapUrl().trim());
        config.setBaseDn(request.getBaseDn().trim());
        config.setBindDn(request.getBindDn().trim());
        config.setBindPassword(request.getBindPassword());
        config.setUserSearchBase(request.getUserSearchBase().trim());
        config.setUserSearchFilter(request.getUserSearchFilter().trim());
        config.setGroupSearchBase(request.getGroupSearchBase().trim());
        config.setGroupSearchFilter(request.getGroupSearchFilter().trim());
        config.setGroupMemberAttribute(StringUtils.hasText(request.getGroupMemberAttribute())
                ? request.getGroupMemberAttribute().trim()
                : "member");
        config.setUseStarttls(Boolean.TRUE.equals(request.getUseStarttls()));
        config.setEnabled(Boolean.TRUE.equals(request.getEnabled()));
        config.setGroupRoleMappingJson(serializeGroupRoleMapping(request.getGroupRoleMapping()));
        config.setSyncIntervalMinutes(request.getSyncIntervalMinutes() != null ? request.getSyncIntervalMinutes() : 60);

        return toResponse(ldapConfigRepository.save(config));
    }

    public boolean testLdapConnection(UUID workspaceId) {
        return getLdapConfigurationEntity(workspaceId).map(config -> {
            try {
                LdapTemplate template = createLdapTemplate(config);
                ContextMapper<Object> mapper = ctx -> null;
                template.search(
                        LdapQueryBuilder.query().base(config.getUserSearchBase()).filter("(objectClass=*)"),
                        mapper
                );
                return true;
            } catch (Exception e) {
                log.warn("LDAP connection test failed for workspace={}: {}", workspaceId, e.getMessage());
                return false;
            }
        }).orElse(false);
    }

    public Optional<Map<String, Object>> authenticateUser(UUID workspaceId, String username, String password) {
        return getLdapConfigurationEntity(workspaceId)
                .filter(LdapConfiguration::getEnabled)
                .flatMap(config -> {
                    try {
                        LdapTemplate template = createLdapTemplate(config);
                        String searchFilter = resolveFilter(config.getUserSearchFilter(), username);

                        ContextMapper<Map<String, Object>> mapper = ctxObj -> {
                            org.springframework.ldap.core.DirContextOperations ctx =
                                    (org.springframework.ldap.core.DirContextOperations) ctxObj;
                            Map<String, Object> attrs = extractAttributes(ctx.getAttributes());
                            attrs.put("dn", ctx.getDn().toString());
                            return attrs;
                        };

                        List<Map<String, Object>> users = template.search(
                                LdapQueryBuilder.query().base(config.getUserSearchBase()).filter(searchFilter),
                                mapper
                        );

                        if (users.isEmpty()) {
                            return Optional.empty();
                        }

                        boolean valid = template.authenticate(config.getUserSearchBase(), searchFilter, password);
                        if (!valid) {
                            return Optional.empty();
                        }

                        Map<String, Object> user = users.get(0);
                        user.put("username", username);
                        return Optional.of(user);
                    } catch (Exception e) {
                        log.error("LDAP authentication failed for user={} workspace={}", username, workspaceId, e);
                        return Optional.empty();
                    }
                });
    }

    public List<String> getUserGroups(UUID workspaceId, String userDn) {
        return getLdapConfigurationEntity(workspaceId)
                .filter(LdapConfiguration::getEnabled)
                .map(config -> {
                    try {
                        String groupFilter = resolveFilter(config.getGroupSearchFilter(), userDn);
                        LdapTemplate template = createLdapTemplate(config);
                        AttributesMapper<String> mapper = attrs -> {
                            Attribute cn = attrs.get("cn");
                            return cn != null ? String.valueOf(cn.get()) : null;
                        };
                        return template.search(
                                LdapQueryBuilder.query().base(config.getGroupSearchBase()).filter(groupFilter),
                                mapper
                        ).stream().filter(StringUtils::hasText).toList();
                    } catch (Exception e) {
                        log.error("LDAP group lookup failed for dn={} workspace={}", userDn, workspaceId, e);
                        return Collections.<String>emptyList();
                    }
                })
                .orElse(Collections.emptyList());
    }

    public Set<String> getMappedRoles(UUID workspaceId, List<String> ldapGroups) {
        return getLdapConfigurationEntity(workspaceId)
                .map(config -> {
                    try {
                        Map<String, String> mapping = objectMapper.readValue(
                                config.getGroupRoleMappingJson(),
                                new TypeReference<Map<String, String>>() {
                                }
                        );
                        return ldapGroups.stream()
                                .map(mapping::get)
                                .filter(StringUtils::hasText)
                                .collect(Collectors.toSet());
                    } catch (JsonProcessingException e) {
                        log.error("Failed to parse LDAP group-role mapping for workspace={}", workspaceId, e);
                        return Collections.<String>emptySet();
                    }
                })
                .orElse(Collections.emptySet());
    }

    public void syncLdapUsers(UUID workspaceId, String triggeredBy) {
        long start = System.currentTimeMillis();
        LdapSyncHistory history = LdapSyncHistory.builder()
                .workspaceId(workspaceId)
                .triggeredBy(triggeredBy)
                .status("RUNNING")
                .syncAt(Instant.now())
                .build();

        try {
            LdapConfiguration config = ldapConfigRepository.findByWorkspaceId(workspaceId)
                    .orElseThrow(() -> new IllegalStateException("LDAP configuration not found"));

            if (!Boolean.TRUE.equals(config.getEnabled())) {
                history.setStatus("SKIPPED");
                history.setSyncDurationMs(System.currentTimeMillis() - start);
                ldapSyncHistoryRepository.save(history);
                return;
            }

            LdapTemplate template = createLdapTemplate(config);
            AttributesMapper<Map<String, Object>> mapper = this::extractAttributes;
            List<Map<String, Object>> users = template.search(
                    LdapQueryBuilder.query().base(config.getUserSearchBase()).filter("(objectClass=*)"),
                    mapper
            );

                int usersCreated = 0;
                int usersUpdated = 0;
                int groupsSynced = 0;

                for (Map<String, Object> user : users) {
                String username = firstNonBlank(
                    asString(user.get("sAMAccountName")),
                    asString(user.get("uid")),
                    asString(user.get("userPrincipalName"))
                );

                if (!StringUtils.hasText(username)) {
                    continue;
                }

                String dn = asString(user.get("distinguishedName"));
                if (!StringUtils.hasText(dn)) {
                    dn = asString(user.get("dn"));
                }

                List<String> groups = StringUtils.hasText(dn)
                    ? getUserGroups(workspaceId, dn)
                    : List.of();
                Set<String> roles = getMappedRoles(workspaceId, groups);

                int created = userProvisioningService.upsertFromLdapSync(
                    workspaceId,
                    username,
                    user,
                    groups,
                    roles
                );
                usersCreated += created;
                usersUpdated += (created == 0 ? 1 : 0);
                groupsSynced += groups.size();
                }

            history.setStatus("SUCCESS");
            history.setUsersSynced(users.size());
                history.setUsersCreated(usersCreated);
                history.setUsersUpdated(usersUpdated);
                history.setGroupsSynced(groupsSynced);
            history.setSyncDurationMs(System.currentTimeMillis() - start);
            ldapSyncHistoryRepository.save(history);

            config.setLastSyncAt(Instant.now());
            config.setLastSyncStatus("SUCCESS");
            config.setLastSyncError(null);
            ldapConfigRepository.save(config);
        } catch (Exception e) {
            history.setStatus("FAILED");
            history.setErrorMessage(e.getMessage());
            history.setSyncDurationMs(System.currentTimeMillis() - start);
            ldapSyncHistoryRepository.save(history);

            ldapConfigRepository.findByWorkspaceId(workspaceId).ifPresent(config -> {
                config.setLastSyncAt(Instant.now());
                config.setLastSyncStatus("FAILED");
                config.setLastSyncError(e.getMessage());
                ldapConfigRepository.save(config);
            });
        }
    }

    public List<LdapSyncHistoryResponse> getSyncHistory(UUID workspaceId, int limit) {
        return ldapSyncHistoryRepository.findByWorkspaceIdOrderBySyncAtDesc(workspaceId).stream()
                .limit(limit)
                .map(this::toSyncHistoryResponse)
                .toList();
    }

    public void deleteLdapConfiguration(UUID workspaceId) {
        ldapConfigRepository.findByWorkspaceId(workspaceId).ifPresent(ldapConfigRepository::delete);
    }

    private LdapTemplate createLdapTemplate(LdapConfiguration config) {
        LdapContextSource contextSource = new LdapContextSource();
        contextSource.setUrl(config.getLdapUrl());
        contextSource.setBase(config.getBaseDn());
        contextSource.setUserDn(config.getBindDn());
        contextSource.setPassword(config.getBindPassword());
        contextSource.setPooled(true);
        contextSource.afterPropertiesSet();
        return new LdapTemplate(contextSource);
    }

    private Map<String, Object> extractAttributes(Attributes attributes) {
        Map<String, Object> result = new HashMap<>();
        try {
            NamingEnumeration<? extends Attribute> all = attributes.getAll();
            while (all.hasMore()) {
                Attribute attr = all.next();
                result.put(attr.getID(), attr.get());
            }
        } catch (NamingException e) {
            log.warn("Unable to map LDAP attributes", e);
        }
        return result;
    }

    private String resolveFilter(String filter, String value) {
        return filter.contains("{0}") ? filter.replace("{0}", value) : filter;
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }

    private void validateRequest(LdapConfigurationRequest request) {
        if (request.getWorkspaceId() == null) {
            throw new IllegalArgumentException("workspaceId is required");
        }
        if (!StringUtils.hasText(request.getLdapUrl()) || !StringUtils.hasText(request.getBaseDn())
                || !StringUtils.hasText(request.getBindDn()) || !StringUtils.hasText(request.getBindPassword())
                || !StringUtils.hasText(request.getUserSearchBase()) || !StringUtils.hasText(request.getUserSearchFilter())
                || !StringUtils.hasText(request.getGroupSearchBase()) || !StringUtils.hasText(request.getGroupSearchFilter())) {
            throw new IllegalArgumentException("LDAP settings are incomplete");
        }
        if (request.getGroupRoleMapping() == null || request.getGroupRoleMapping().isEmpty()) {
            throw new IllegalArgumentException("groupRoleMapping is required");
        }
    }

    private String serializeGroupRoleMapping(Map<String, String> mapping) {
        try {
            return objectMapper.writeValueAsString(mapping);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize group role mapping", e);
        }
    }

    private LdapConfigurationResponse toResponse(LdapConfiguration config) {
        Map<String, String> mapping = Collections.emptyMap();
        try {
            mapping = objectMapper.readValue(config.getGroupRoleMappingJson(), new TypeReference<Map<String, String>>() {
            });
        } catch (JsonProcessingException e) {
            log.warn("Invalid groupRoleMappingJson for workspace={}", config.getWorkspaceId(), e);
        }

        return LdapConfigurationResponse.builder()
                .id(config.getId())
                .workspaceId(config.getWorkspaceId())
                .ldapUrl(config.getLdapUrl())
                .baseDn(config.getBaseDn())
                .bindDn(config.getBindDn())
                .userSearchBase(config.getUserSearchBase())
                .userSearchFilter(config.getUserSearchFilter())
                .groupSearchBase(config.getGroupSearchBase())
                .groupSearchFilter(config.getGroupSearchFilter())
                .groupMemberAttribute(config.getGroupMemberAttribute())
                .useStarttls(config.getUseStarttls())
                .enabled(config.getEnabled())
                .groupRoleMapping(mapping)
                .syncIntervalMinutes(config.getSyncIntervalMinutes())
                .lastSyncAt(config.getLastSyncAt())
                .lastSyncStatus(config.getLastSyncStatus())
                .lastSyncError(config.getLastSyncError())
                .createdAt(config.getCreatedAt())
                .updatedAt(config.getUpdatedAt())
                .build();
    }

    private LdapSyncHistoryResponse toSyncHistoryResponse(LdapSyncHistory history) {
        return LdapSyncHistoryResponse.builder()
                .id(history.getId())
                .workspaceId(history.getWorkspaceId())
                .syncAt(history.getSyncAt())
                .status(history.getStatus())
                .usersSynced(history.getUsersSynced())
                .usersCreated(history.getUsersCreated())
                .usersUpdated(history.getUsersUpdated())
                .groupsSynced(history.getGroupsSynced())
                .errorMessage(history.getErrorMessage())
                .syncDurationMs(history.getSyncDurationMs())
                .triggeredBy(history.getTriggeredBy())
                .build();
    }
}
