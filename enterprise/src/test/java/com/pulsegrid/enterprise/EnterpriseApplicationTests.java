package com.pulsegrid.enterprise;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
	"spring.datasource.url=jdbc:h2:mem:enterprise;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
	"spring.datasource.driver-class-name=org.h2.Driver",
	"spring.datasource.username=sa",
	"spring.datasource.password=",
	"spring.jpa.hibernate.ddl-auto=create-drop",
	"spring.flyway.enabled=false",
	"spring.security.oauth2.client.registration.local.client-id=test-client",
	"spring.security.oauth2.client.registration.local.client-secret=test-secret",
	"spring.security.oauth2.client.registration.local.provider=local",
	"spring.security.oauth2.client.provider.local.authorization-uri=http://localhost/authorize",
	"spring.security.oauth2.client.provider.local.token-uri=http://localhost/token",
	"spring.security.oauth2.client.provider.local.user-info-uri=http://localhost/userinfo",
	"spring.security.oauth2.client.provider.local.user-name-attribute=sub",
	"spring.security.saml2.relyingparty.registration.local.identityprovider.entity-id=http://localhost/idp",
	"spring.security.saml2.relyingparty.registration.local.identityprovider.web-sso-url=http://localhost/sso",
	"spring.security.saml2.relyingparty.registration.local.identityprovider.verification.credentials[0].certificate-location=classpath:test-idp.crt"
})
class EnterpriseApplicationTests {

	@Test
	void contextLoads() {
	}

}
