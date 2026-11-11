package com.example.taskmanagement.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.taskmanagement.domain.TaskStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;

/**
 * Proof test (architecture G3): Jackson Optional three-state handling on the
 * Boot-managed ObjectMapper, and the property paths Hibernate Validator reports
 * for container-element constraints.
 */
@JsonTest
class TaskPatchRequestJsonTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Autowired
    private ObjectMapper objectMapper;

    private TaskPatchRequest patch(String json) throws Exception {
        return objectMapper.readValue(json, TaskPatchRequest.class);
    }

    private TaskCreateRequest create(String json) throws Exception {
        return objectMapper.readValue(json, TaskCreateRequest.class);
    }

    private static Set<String> paths(Set<? extends ConstraintViolation<?>> violations) {
        return violations.stream().map(v -> v.getPropertyPath().toString()).collect(Collectors.toSet());
    }

    // PATCH deserialization: absent / null / value

    @Test
    void patchAbsentFieldsAreNullReferences() throws Exception {
        TaskPatchRequest request = patch("{}");
        assertThat(request.getTitle()).isNull();
        assertThat(request.getDescription()).isNull();
        assertThat(request.getStatus()).isNull();
    }

    @Test
    void patchExplicitNullIsEmptyOptional() throws Exception {
        TaskPatchRequest request = patch("{\"title\":null,\"description\":null,\"status\":null}");
        assertThat(request.getTitle()).isEqualTo(Optional.empty());
        assertThat(request.getDescription()).isEqualTo(Optional.empty());
        assertThat(request.getStatus()).isEqualTo(Optional.empty());
    }

    @Test
    void patchValuesArePresentOptionals() throws Exception {
        TaskPatchRequest request = patch("{\"title\":\"t\",\"description\":\"d\",\"status\":\"DONE\"}");
        assertThat(request.getTitle()).contains("t");
        assertThat(request.getDescription()).contains("d");
        assertThat(request.getStatus()).contains(TaskStatus.DONE);
    }

    @Test
    void patchEachFieldIndependently() throws Exception {
        TaskPatchRequest request = patch("{\"description\":null}");
        assertThat(request.getTitle()).isNull();
        assertThat(request.getDescription()).isEqualTo(Optional.empty());
        assertThat(request.getStatus()).isNull();
    }

    // PATCH validation

    @Test
    void patchAbsentAndExplicitNullDescriptionAreValid() throws Exception {
        assertThat(VALIDATOR.validate(patch("{}"))).isEmpty();
        assertThat(VALIDATOR.validate(patch("{\"description\":null}"))).isEmpty();
        assertThat(VALIDATOR.validate(patch("{\"title\":\"t\",\"description\":\"d\",\"status\":\"TODO\"}")))
                .isEmpty();
    }

    @Test
    void patchExplicitNullTitleViolationPath() throws Exception {
        Set<String> paths = paths(VALIDATOR.validate(patch("{\"title\":null}")));
        System.out.println("OBSERVED patch {title:null} paths=" + paths);
        assertThat(paths).containsExactly("title");
    }

    @Test
    void patchExplicitNullStatusViolationPath() throws Exception {
        Set<String> paths = paths(VALIDATOR.validate(patch("{\"status\":null}")));
        System.out.println("OBSERVED patch {status:null} paths=" + paths);
        assertThat(paths).containsExactly("status");
    }

    @Test
    void patchBlankAndTooLongTitleViolationPath() throws Exception {
        Set<String> blank = paths(VALIDATOR.validate(patch("{\"title\":\"   \"}")));
        Set<String> longTitle = paths(VALIDATOR.validate(patch("{\"title\":\"" + "x".repeat(256) + "\"}")));
        System.out.println("OBSERVED patch blank title paths=" + blank + " long title paths=" + longTitle);
        assertThat(blank).containsExactly("title");
        assertThat(longTitle).containsExactly("title");
    }

    @Test
    void patchTooLongDescriptionViolationPath() throws Exception {
        Set<String> paths = paths(VALIDATOR.validate(patch("{\"description\":\"" + "x".repeat(2001) + "\"}")));
        System.out.println("OBSERVED patch long description paths=" + paths);
        assertThat(paths).containsExactly("description");
    }

    // POST status: absent / null / value

    @Test
    void createStatusAbsentIsNullReferenceAndValid() throws Exception {
        TaskCreateRequest request = create("{\"title\":\"t\"}");
        assertThat(request.getStatus()).isNull();
        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void createStatusExplicitNullIsEmptyOptionalAndInvalid() throws Exception {
        TaskCreateRequest request = create("{\"title\":\"t\",\"status\":null}");
        assertThat(request.getStatus()).isEqualTo(Optional.empty());
        Set<String> paths = paths(VALIDATOR.validate(request));
        System.out.println("OBSERVED create {status:null} paths=" + paths);
        assertThat(paths).containsExactly("status");
    }

    @Test
    void createStatusValueIsValid() throws Exception {
        TaskCreateRequest request = create("{\"title\":\"t\",\"status\":\"IN_PROGRESS\"}");
        assertThat(request.getStatus()).contains(TaskStatus.IN_PROGRESS);
        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void createBlankTitleViolationPath() throws Exception {
        assertThat(paths(VALIDATOR.validate(create("{\"title\":\"\"}")))).containsExactly("title");
        assertThat(paths(VALIDATOR.validate(create("{}")))).containsExactly("title");
    }

    // PUT status: absent / null

    @Test
    void replaceStatusAbsentOrNullIsInvalid() throws Exception {
        TaskReplaceRequest absent = objectMapper.readValue("{\"title\":\"t\"}", TaskReplaceRequest.class);
        TaskReplaceRequest explicitNull =
                objectMapper.readValue("{\"title\":\"t\",\"status\":null}", TaskReplaceRequest.class);
        assertThat(paths(VALIDATOR.validate(absent))).containsExactly("status");
        assertThat(paths(VALIDATOR.validate(explicitNull))).containsExactly("status");
    }
}
