package com.example.taskmanagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.taskmanagement.repository.TaskRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TaskApiIntegrationTest {

    private static final String PROBLEM = "application/problem+json";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void clean() {
        taskRepository.deleteAll();
    }

    private ResultActions send(MockHttpServletRequestBuilder builder, String body) throws Exception {
        MockHttpServletRequestBuilder b = builder.with(httpBasic("test-user", "test-password"));
        if (body != null) {
            b.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        return mockMvc.perform(b);
    }

    private JsonNode createTask(String body) throws Exception {
        String json = send(post("/api/tasks"), body).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json);
    }

    private JsonNode getTask(long id) throws Exception {
        String json = send(get("/api/tasks/" + id), null).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json);
    }

    @Test
    void createThenGet() throws Exception {
        MockHttpServletRequestBuilder req = post("/api/tasks");
        send(req, "{\"title\":\"Write tests\",\"description\":\"all of them\"}")
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", startsWith("http://localhost/api/tasks/")))
                .andExpect(jsonPath("$.status").value("TODO"))
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.updatedAt").isNotEmpty());

        long id = taskRepository.findAll().get(0).getId();
        send(get("/api/tasks/" + id), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Write tests"))
                .andExpect(jsonPath("$.description").value("all of them"))
                .andExpect(jsonPath("$.status").value("TODO"));
    }

    @Test
    void createHonoursSuppliedStatus() throws Exception {
        JsonNode created = createTask("{\"title\":\"x\",\"status\":\"IN_PROGRESS\"}");
        assertThat(created.get("status").asText()).isEqualTo("IN_PROGRESS");
    }

    @Test
    void listPagesWithEnvelopeAndAscendingIds() throws Exception {
        for (int i = 0; i < 5; i++) {
            createTask("{\"title\":\"t" + i + "\"}");
        }
        String json = send(get("/api/tasks?page=0&size=3"), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(3)))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(3))
                .andExpect(jsonPath("$.totalElements").value(5))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andReturn().getResponse().getContentAsString();
        JsonNode content = objectMapper.readTree(json).get("content");
        assertThat(content.get(0).get("id").asLong()).isLessThan(content.get(1).get("id").asLong());
        assertThat(content.get(1).get("id").asLong()).isLessThan(content.get(2).get("id").asLong());

        send(get("/api/tasks?page=1&size=3"), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(2)));
    }

    @Test
    void putReplacesAndClearsDescription() throws Exception {
        long id = createTask("{\"title\":\"a\",\"description\":\"d\"}").get("id").asLong();
        send(put("/api/tasks/" + id), "{\"title\":\"b\",\"status\":\"DONE\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("b"))
                .andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.description").doesNotExist());
        assertThat(getTask(id).get("description").isNull()).isTrue();
    }

    @Test
    void patchStatusOnlyLeavesOtherFields() throws Exception {
        long id = createTask("{\"title\":\"a\",\"description\":\"d\"}").get("id").asLong();
        send(patch("/api/tasks/" + id), "{\"status\":\"DONE\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("a"))
                .andExpect(jsonPath("$.description").value("d"))
                .andExpect(jsonPath("$.status").value("DONE"));
    }

    @Test
    void patchEmptyBodyGives400() throws Exception {
        long id = createTask("{\"title\":\"a\"}").get("id").asLong();
        send(patch("/api/tasks/" + id), "{}")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
    }

    @Test
    void deleteThenGetAndRepeatDeleteAre404() throws Exception {
        long id = createTask("{\"title\":\"a\"}").get("id").asLong();
        send(delete("/api/tasks/" + id), null).andExpect(status().isNoContent());
        send(get("/api/tasks/" + id), null).andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
        send(delete("/api/tasks/" + id), null).andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
    }

    @Test
    void missingIdGives404ProblemJsonOnAllItemOperations() throws Exception {
        send(get("/api/tasks/987654"), null).andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
        send(put("/api/tasks/987654"), "{\"title\":\"b\",\"status\":\"DONE\"}").andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
        send(patch("/api/tasks/987654"), "{\"status\":\"DONE\"}").andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
        send(delete("/api/tasks/987654"), null).andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
    }

    @Test
    void updatedAtNotBeforeCreatedAtAfterRealChange() throws Exception {
        JsonNode created = createTask("{\"title\":\"a\"}");
        long id = created.get("id").asLong();
        Thread.sleep(20);
        send(patch("/api/tasks/" + id), "{\"title\":\"changed\"}").andExpect(status().isOk());
        JsonNode after = getTask(id);
        Instant createdAt = Instant.parse(after.get("createdAt").asText());
        Instant updatedAt = Instant.parse(after.get("updatedAt").asText());
        assertThat(updatedAt).isAfterOrEqualTo(createdAt);
        assertThat(updatedAt).isAfterOrEqualTo(Instant.parse(created.get("updatedAt").asText()));
    }

    @Test
    void patchExplicitNullDescriptionClearsIt() throws Exception {
        long id = createTask("{\"title\":\"a\",\"description\":\"d\"}").get("id").asLong();
        send(patch("/api/tasks/" + id), "{\"description\":null}").andExpect(status().isOk());
        JsonNode after = getTask(id);
        assertThat(after.get("description").isNull()).isTrue();
        assertThat(after.get("title").asText()).isEqualTo("a");
    }

    private static Instant ts(JsonNode node, String field) {
        return Instant.parse(node.get(field).asText());
    }

    @Test
    void createResponseTimestampsEqualGetTimestamps() throws Exception {
        JsonNode created = createTask("{\"title\":\"a\"}");
        JsonNode fetched = getTask(created.get("id").asLong());
        assertThat(ts(created, "createdAt")).isEqualTo(ts(fetched, "createdAt"));
        assertThat(ts(created, "updatedAt")).isEqualTo(ts(fetched, "updatedAt"));
        assertThat(created.get("createdAt").asText()).isEqualTo(fetched.get("createdAt").asText());
        assertThat(created.get("updatedAt").asText()).isEqualTo(fetched.get("updatedAt").asText());
    }

    @Test
    void putResponseUpdatedAtIsNewAndEqualsGet() throws Exception {
        long id = createTask("{\"title\":\"a\"}").get("id").asLong();
        Instant before = ts(getTask(id), "updatedAt");
        Thread.sleep(5);
        String json = send(put("/api/tasks/" + id), "{\"title\":\"b\",\"status\":\"DONE\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode response = objectMapper.readTree(json);
        JsonNode fetched = getTask(id);
        assertThat(ts(response, "updatedAt")).isAfter(before);
        assertThat(response.get("updatedAt").asText()).isEqualTo(fetched.get("updatedAt").asText());
        assertThat(response.get("createdAt").asText()).isEqualTo(fetched.get("createdAt").asText());
    }

    @Test
    void patchResponseUpdatedAtIsNewAndEqualsGet() throws Exception {
        long id = createTask("{\"title\":\"a\"}").get("id").asLong();
        Instant before = ts(getTask(id), "updatedAt");
        Thread.sleep(5);
        String json = send(patch("/api/tasks/" + id), "{\"status\":\"DONE\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode response = objectMapper.readTree(json);
        JsonNode fetched = getTask(id);
        assertThat(ts(response, "updatedAt")).isAfter(before);
        assertThat(response.get("updatedAt").asText()).isEqualTo(fetched.get("updatedAt").asText());
    }

    @Test
    void identicalPutAndPatchResponsesKeepUpdatedAt() throws Exception {
        long id = createTask("{\"title\":\"a\",\"description\":\"d\",\"status\":\"TODO\"}").get("id").asLong();
        String before = getTask(id).get("updatedAt").asText();
        Thread.sleep(5);
        JsonNode putResp = objectMapper.readTree(
                send(put("/api/tasks/" + id), "{\"title\":\"a\",\"description\":\"d\",\"status\":\"TODO\"}")
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode patchResp = objectMapper.readTree(
                send(patch("/api/tasks/" + id), "{\"title\":\"a\"}")
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(putResp.get("updatedAt").asText()).isEqualTo(before);
        assertThat(patchResp.get("updatedAt").asText()).isEqualTo(before);
        assertThat(getTask(id).get("updatedAt").asText()).isEqualTo(before);
    }

    @Test
    void postAndPutInvalidStatusGive400ProblemJson() throws Exception {
        send(post("/api/tasks"), "{\"title\":\"a\",\"status\":\"NOPE\"}")
                .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith(PROBLEM));
        long id = createTask("{\"title\":\"a\"}").get("id").asLong();
        send(put("/api/tasks/" + id), "{\"title\":\"a\",\"status\":\"NOPE\"}")
                .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith(PROBLEM));
        assertThat(getTask(id).get("status").asText()).isEqualTo("TODO");
    }

    @Test
    void identicalPutLeavesUpdatedAtUnchanged() throws Exception {
        long id = createTask("{\"title\":\"a\",\"description\":\"d\",\"status\":\"TODO\"}").get("id").asLong();
        JsonNode before = getTask(id);
        Thread.sleep(20);
        send(put("/api/tasks/" + id), "{\"title\":\"a\",\"description\":\"d\",\"status\":\"TODO\"}")
                .andExpect(status().isOk());
        JsonNode after = getTask(id);
        assertThat(after.get("updatedAt").asText()).isEqualTo(before.get("updatedAt").asText());
    }
}
