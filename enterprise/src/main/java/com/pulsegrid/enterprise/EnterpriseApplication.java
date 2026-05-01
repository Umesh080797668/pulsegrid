package com.pulsegrid.enterprise;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class EnterpriseApplication {

	public static void main(String[] args) {
		SpringApplication.run(EnterpriseApplication.class, args);
	}

}
