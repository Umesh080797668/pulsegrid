package io.pulsegrid.enterprise.service.config;

import io.pulsegrid.enterprise.domain.SsoConfiguration;
import io.pulsegrid.enterprise.service.service.LdapAuthenticationProvider;
import io.pulsegrid.enterprise.service.service.SsoService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;

/**
 * Security configuration for enterprise service.
 * Supports internal API auth plus dynamic tenant OAuth2/OIDC and SAML2 sign-in.
 */
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final SsoService ssoService;
    private final LdapAuthenticationProvider ldapAuthenticationProvider;

    @Value("${enterprise.admin.allowed-origin:http://localhost:4200}")
    private String adminAllowedOrigin;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/v1/enterprise/actuator/**").permitAll()
                        .requestMatchers("/api/v1/enterprise/health").permitAll()
                        .requestMatchers("/api/v1/enterprise/sso/config/*/metadata").permitAll()
                        .requestMatchers("/api/v1/enterprise/sso/config/*/login-url").permitAll()
                        .requestMatchers("/oauth2/**", "/login/oauth2/**", "/saml2/**", "/login/saml2/**").permitAll()
                        .anyRequest().authenticated())
                .httpBasic(Customizer.withDefaults())
                .authenticationProvider(ldapAuthenticationProvider)
                .oauth2Login(Customizer.withDefaults())
                .saml2Login(Customizer.withDefaults());

        return http.build();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    @Bean
    public ClientRegistrationRepository clientRegistrationRepository() {
        return registrationId -> ssoService.findByRegistrationId(registrationId)
                .filter(config -> "oidc".equalsIgnoreCase(config.getProvider()) && Boolean.TRUE.equals(config.getEnabled()))
                .map(this::buildOidcRegistration)
                .orElse(null);
    }

    @Bean
    public RelyingPartyRegistrationRepository relyingPartyRegistrationRepository() {
        return registrationId -> ssoService.findByRegistrationId(registrationId)
                .filter(config -> "saml2".equalsIgnoreCase(config.getProvider()) && Boolean.TRUE.equals(config.getEnabled()))
                .map(this::buildSamlRegistration)
                .orElse(null);
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(adminAllowedOrigin));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Requested-With"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/enterprise/**", configuration);
        return source;
    }

    private ClientRegistration buildOidcRegistration(SsoConfiguration config) {
        return ssoService.buildOidcClientRegistration(config);
    }

    private RelyingPartyRegistration buildSamlRegistration(SsoConfiguration config) {
        return ssoService.buildSamlRelyingPartyRegistration(config);
    }
}
