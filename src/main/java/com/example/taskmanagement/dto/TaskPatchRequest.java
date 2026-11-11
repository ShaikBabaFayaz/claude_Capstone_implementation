package com.example.taskmanagement.dto;

import com.example.taskmanagement.domain.TaskStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Optional;

/**
 * PATCH body. Each field is three-state: a null reference means the property was
 * absent (leave unchanged), Optional.empty() means explicit JSON null (clear),
 * Optional.of(v) means set. Mutable class with no creator constructor on purpose:
 * Jackson then leaves omitted properties untouched (null reference).
 */
public class TaskPatchRequest {

    @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            description = "New title. Omit to leave unchanged; must not be null or blank.")
    private Optional<@NotBlank @Size(max = 255) String> title;

    @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            description = "New description. Omit to leave unchanged; null clears it.")
    private Optional<@Size(max = 2000) String> description;

    @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            description = "New status. Omit to leave unchanged; must not be null.")
    private Optional<@NotNull TaskStatus> status;

    public Optional<String> getTitle() {
        return title;
    }

    public void setTitle(Optional<String> title) {
        this.title = title;
    }

    public Optional<String> getDescription() {
        return description;
    }

    public void setDescription(Optional<String> description) {
        this.description = description;
    }

    public Optional<TaskStatus> getStatus() {
        return status;
    }

    public void setStatus(Optional<TaskStatus> status) {
        this.status = status;
    }
}
