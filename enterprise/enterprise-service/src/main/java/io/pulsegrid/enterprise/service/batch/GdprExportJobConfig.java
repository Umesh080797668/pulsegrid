package io.pulsegrid.enterprise.service.batch;

import org.springframework.batch.core.Job;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
public class GdprExportJobConfig {

    @Bean
    public Job gdprExportJob(JobRepository jobRepository, Step gdprExportStep) {
        return new JobBuilder("gdprExportJob", jobRepository)
                .start(gdprExportStep)
                .build();
    }

    @Bean
    public Step gdprExportStep(
            JobRepository jobRepository,
            PlatformTransactionManager transactionManager,
            GdprExportTasklet gdprExportTasklet
    ) {
        return new StepBuilder("gdprExportStep", jobRepository)
                .tasklet(gdprExportTasklet, transactionManager)
                .build();
    }
}