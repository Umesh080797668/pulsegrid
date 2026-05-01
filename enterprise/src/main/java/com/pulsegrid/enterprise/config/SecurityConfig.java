package com.pulsegrid.enterprise.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		return http
			.csrf(csrf -> csrf.ignoringRequestMatchers("/actuator/**", "/api/v1/enterprise/**"))
			.authorizeHttpRequests(authorize -> authorize
				.requestMatchers("/actuator/health", "/actuator/metrics/**").permitAll()
				.requestMatchers("/actuator/**").hasRole("ACTUATOR")
				.anyRequest().authenticated())
			.oauth2Login(Customizer.withDefaults())
			.saml2Login(Customizer.withDefaults())
			.httpBasic(Customizer.withDefaults())
			.build();
	}
}
