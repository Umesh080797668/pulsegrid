package io.pulsegrid.enterprise.service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ComponentScan(basePackages = {"io.pulsegrid.enterprise"})
@EntityScan(basePackages = {"io.pulsegrid.enterprise.domain"})
@EnableJpaRepositories(basePackages = {"io.pulsegrid.enterprise.service.repository"})
@EnableScheduling
@ConfigurationPropertiesScan(basePackages = {"io.pulsegrid.enterprise.service.config"})
public class EnterpriseServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(EnterpriseServiceApplication.class, args);
    }

}
