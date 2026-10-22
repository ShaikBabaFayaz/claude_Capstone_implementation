package com.example.taskmanagement.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OpenApiDocsTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private JsonNode docs() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private static java.util.List<String> names(JsonNode node) {
        java.util.List<String> out = new java.util.ArrayList<>();
        node.forEach(n -> out.add(n.asText()));
        return out;
    }

    @Test
    void listsAllTaskPathsAndMethods() throws Exception {
        JsonNode paths = docs().get("paths");
        assertThat(paths.get("/api/tasks").has("get")).isTrue();
        assertThat(paths.get("/api/tasks").has("post")).isTrue();
        JsonNode item = paths.get("/api/tasks/{id}");
        assertThat(item.has("get")).isTrue();
        assertThat(item.has("put")).isTrue();
        assertThat(item.has("patch")).isTrue();
        assertThat(item.has("delete")).isTrue();
    }

    @Test
    void declaresMetadataAndBasicSecurityScheme() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(jsonPath("$.info.title").value("Task Management API"))
                .andExpect(jsonPath("$.info.description", containsString("defaults to TODO")))
                .andExpect(jsonPath("$.info.description", containsString("updatedAt changes only when")))
                .andExpect(jsonPath("$.components.securitySchemes.basicAuth.type").value("http"))
                .andExpect(jsonPath("$.components.securitySchemes.basicAuth.scheme").value("basic"));
    }

    @Test
    void requestSchemasReflectOptionalAndRequiredFields() throws Exception {
        JsonNode schemas = docs().get("components").get("schemas");

        JsonNode create = schemas.get("TaskCreateRequest");
        assertThat(create.get("properties").get("status").get("type").asText()).isEqualTo("string");
        assertThat(create.get("properties").get("status").get("enum")).isNotNull();
        assertThat(names(create.get("required"))).containsExactly("title");

        JsonNode replace = schemas.get("TaskReplaceRequest");
        assertThat(names(replace.get("required"))).containsExactlyInAnyOrder("title", "status");

        JsonNode patch = schemas.get("TaskPatchRequest");
        assertThat(patch.get("properties").get("status").get("type").asText()).isEqualTo("string");
        assertThat(patch.has("required")).isFalse();
    }
}
