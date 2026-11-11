package com.example.taskmanagement.dto;

import com.example.taskmanagement.domain.TaskStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Optional;

/**
 * POST body. {@code status} is optional: a null reference means absent (defaults to
 * TODO), an explicit JSON null is Optional.empty() and fails validation.
 */
public class TaskCreateRequest {

    @NotBlank
    @Size(max = 255)
    private String title;

    @Size(max = 2000)
    private String description;

    @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, defaultValue = "TODO",
            description = "Optional. Defaults to TODO when omitted; an explicit null is rejected.")
    private Optional<@NotNull TaskStatus> status;

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Optional<TaskStatus> getStatus() {
        return status;
    }

    public void setStatus(Optional<TaskStatus> status) {
        this.status = status;
    }
}
