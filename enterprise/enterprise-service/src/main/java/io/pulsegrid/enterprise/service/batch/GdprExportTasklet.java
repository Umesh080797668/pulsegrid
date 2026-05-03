package io.pulsegrid.enterprise.service.batch;

import org.springframework.batch.core.StepContribution;
import org.springframework.batch.core.scope.context.ChunkContext;
import org.springframework.batch.core.step.tasklet.Tasklet;
import org.springframework.context.annotation.Lazy;
import org.springframework.batch.repeat.RepeatStatus;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.UUID;

@Component
public class GdprExportTasklet implements Tasklet {

    private final GdprExportService gdprExportService;

    public GdprExportTasklet(@Lazy GdprExportService gdprExportService) {
        this.gdprExportService = gdprExportService;
    }

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext chunkContext) throws Exception {
        Object workspaceParam = chunkContext.getStepContext().getJobParameters().get("workspaceId");
        Object userParam = chunkContext.getStepContext().getJobParameters().get("userId");
        Object outputParam = chunkContext.getStepContext().getJobParameters().get("outputFile");

        if (workspaceParam == null || userParam == null || outputParam == null) {
            return RepeatStatus.FINISHED;
        }

        UUID workspaceId = UUID.fromString(String.valueOf(workspaceParam));
        UUID userId = UUID.fromString(String.valueOf(userParam));
        Path outputFile = Path.of(String.valueOf(outputParam));

        gdprExportService.writeExportSnapshot(workspaceId, userId, outputFile);
        contribution.getStepExecution().getExecutionContext().putString("outputFile", outputFile.toString());
        return RepeatStatus.FINISHED;
    }
}