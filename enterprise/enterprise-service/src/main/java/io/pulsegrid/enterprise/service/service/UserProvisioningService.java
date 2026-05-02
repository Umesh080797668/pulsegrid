package io.pulsegrid.enterprise.service.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pulsegrid.enterprise.domain.LdapWorkspaceUser;
import io.pulsegrid.enterprise.service.repository.LdapWorkspaceUserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * Service for provisioning and updating users from LDAP.
 * This is a stub implementation that should be integrated with your user management system.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserProvisioningService {

    private final LdapWorkspaceUserRepository ldapWorkspaceUserRepository;
    private final ObjectMapper objectMapper;

    /**
     * Provision or update a user based on LDAP information.
     * This is a stub - integrate with your actual user management system.
     */
    public String provisionOrUpdateUser(
            UUID workspaceId,
            String username,
            Map<String, Object> ldapUserInfo,
            List<String> ldapGroups,
            Set<String> mappedRoles) {
        LdapWorkspaceUser user = ldapWorkspaceUserRepository
            .findByWorkspaceIdAndUsername(workspaceId, username)
            .orElseGet(() -> LdapWorkspaceUser.builder()
                .workspaceId(workspaceId)
                .username(username)
                .build());

        user.setDistinguishedName(asString(ldapUserInfo.get("dn")));
        user.setEmail(firstNonBlank(
            asString(ldapUserInfo.get("mail")),
            asString(ldapUserInfo.get("userPrincipalName"))
        ));
        user.setDisplayName(firstNonBlank(
            asString(ldapUserInfo.get("displayName")),
            asString(ldapUserInfo.get("cn")),
            username
        ));
        user.setLdapGroupsJson(writeJson(ldapGroups));
        user.setRolesJson(writeJson(mappedRoles.stream().sorted().toList()));
        user.setActive(true);
        user.setLastLoginAt(Instant.now());

        LdapWorkspaceUser saved = ldapWorkspaceUserRepository.save(user);
        log.info("LDAP user provisioned/updated workspace={} username={} roles={}", workspaceId, username, mappedRoles);
        return saved.getId().toString();
    }

    /**
     * Get user by workspace and username
     */
    public Optional<String> getUserId(UUID workspaceId, String username) {
        return ldapWorkspaceUserRepository.findByWorkspaceIdAndUsername(workspaceId, username)
                .map(LdapWorkspaceUser::getId)
                .map(UUID::toString);
    }

    /**
     * Update user roles
     */
    public void updateUserRoles(UUID workspaceId, String userId, Set<String> roles) {
        uuid(userId).flatMap(ldapWorkspaceUserRepository::findById).ifPresent(user -> {
            if (workspaceId.equals(user.getWorkspaceId())) {
                user.setRolesJson(writeJson(roles.stream().sorted().toList()));
                ldapWorkspaceUserRepository.save(user);
            }
        });
    }

    /**
     * Sync user groups from LDAP
     */
    public void syncUserGroups(UUID workspaceId, String userId, List<String> ldapGroups) {
        uuid(userId).flatMap(ldapWorkspaceUserRepository::findById).ifPresent(user -> {
            if (workspaceId.equals(user.getWorkspaceId())) {
                user.setLdapGroupsJson(writeJson(ldapGroups));
                ldapWorkspaceUserRepository.save(user);
            }
        });
    }

    /**
     * Deactivate user (on removal from LDAP)
     */
    public void deactivateUser(UUID workspaceId, String userId) {
        uuid(userId).flatMap(ldapWorkspaceUserRepository::findById).ifPresent(user -> {
            if (workspaceId.equals(user.getWorkspaceId())) {
                user.setActive(false);
                ldapWorkspaceUserRepository.save(user);
            }
        });
    }

    public int upsertFromLdapSync(
            UUID workspaceId,
            String username,
            Map<String, Object> ldapUserInfo,
            List<String> ldapGroups,
            Set<String> mappedRoles
    ) {
        boolean existed = ldapWorkspaceUserRepository.findByWorkspaceIdAndUsername(workspaceId, username).isPresent();
        provisionOrUpdateUser(workspaceId, username, ldapUserInfo, ldapGroups, mappedRoles);
        return existed ? 0 : 1;
    }

    public Optional<List<String>> getRoles(UUID workspaceId, String userId) {
        return uuid(userId)
                .flatMap(ldapWorkspaceUserRepository::findById)
                .filter(u -> workspaceId.equals(u.getWorkspaceId()))
                .map(LdapWorkspaceUser::getRolesJson)
                .map(this::readStringList);
    }

    private Optional<UUID> uuid(String value) {
        try {
            return Optional.of(UUID.fromString(value));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unable to serialize LDAP user payload", e);
        }
    }

    private List<String> readStringList(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception e) {
            return List.of();
        }
    }
}
