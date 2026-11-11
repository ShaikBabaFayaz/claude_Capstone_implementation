package com.example.taskmanagement.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
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

import com.example.taskmanagement.config.ProblemAuthenticationEntryPoint;
import com.example.taskmanagement.config.SecurityConfig;
import com.example.taskmanagement.domain.TaskStatus;
import com.example.taskmanagement.dto.PageResponse;
import com.example.taskmanagement.dto.TaskCreateRequest;
import com.example.taskmanagement.dto.TaskPatchRequest;
import com.example.taskmanagement.dto.TaskReplaceRequest;
import com.example.taskmanagement.dto.TaskResponse;
import com.example.taskmanagement.service.EmptyPatchException;
import com.example.taskmanagement.service.TaskNotFoundException;
import com.example.taskmanagement.service.TaskService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@WebMvcTest(TaskController.class)
@ActiveProfiles("test")
@Import({SecurityConfig.class, ProblemAuthenticationEntryPoint.class, GlobalExceptionHandler.class})
class TaskControllerTest {

    private static final String PROBLEM = "application/problem+json";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskService taskService;

    private static TaskResponse sample(long id) {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");
        return new TaskResponse(id, "title", "desc", TaskStatus.TODO, now, now);
    }

    private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder builder) {
        return builder.with(httpBasic("test-user", "test-password"));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return auth(builder).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    // success paths

    @Test
    void createReturns201WithLocation() throws Exception {
        when(taskService.create(any(TaskCreateRequest.class))).thenReturn(sample(7));
        mockMvc.perform(json(post("/api/tasks"), "{\"title\":\"title\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "http://localhost/api/tasks/7"))
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.status").value("TODO"));
    }

    @Test
    void createWithoutStatusIsAccepted() throws Exception {
        when(taskService.create(any(TaskCreateRequest.class))).thenReturn(sample(1));
        mockMvc.perform(json(post("/api/tasks"), "{\"title\":\"t\"}")).andExpect(status().isCreated());
        ArgumentCaptor<TaskCreateRequest> captor = ArgumentCaptor.forClass(TaskCreateRequest.class);
        verify(taskService).create(captor.capture());
        assertThat(captor.getValue().getStatus()).isNull();
    }

    @Test
    void getReturnsTask() throws Exception {
        when(taskService.get(3L)).thenReturn(sample(3));
        mockMvc.perform(auth(get("/api/tasks/3")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(3));
    }

    @Test
    void listUsesDefaults() throws Exception {
        when(taskService.list(0, 20)).thenReturn(new PageResponse<>(List.of(sample(1)), 0, 20, 1, 1));
        mockMvc.perform(auth(get("/api/tasks")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(1))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1));
    }

    @Test
    void listAcceptsBoundaryValues() throws Exception {
        when(taskService.list(0, 100)).thenReturn(new PageResponse<>(List.of(), 0, 100, 0, 0));
        mockMvc.perform(auth(get("/api/tasks?page=0&size=100"))).andExpect(status().isOk());
        when(taskService.list(2, 1)).thenReturn(new PageResponse<>(List.of(), 2, 1, 0, 0));
        mockMvc.perform(auth(get("/api/tasks?page=2&size=1"))).andExpect(status().isOk());
    }

    @Test
    void putWithFullBodyReplaces() throws Exception {
        when(taskService.replace(eq(4L), any(TaskReplaceRequest.class))).thenReturn(sample(4));
        mockMvc.perform(json(put("/api/tasks/4"), "{\"title\":\"new\",\"status\":\"DONE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(4));
    }

    @Test
    void patchWithStatusOnly() throws Exception {
        when(taskService.patch(eq(4L), any(TaskPatchRequest.class))).thenReturn(sample(4));
        mockMvc.perform(json(patch("/api/tasks/4"), "{\"status\":\"DONE\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void deleteReturns204() throws Exception {
        mockMvc.perform(auth(delete("/api/tasks/4"))).andExpect(status().isNoContent());
        verify(taskService).delete(4L);
    }

    // service exceptions

    @Test
    void notFoundIs404Problem() throws Exception {
        when(taskService.get(99L)).thenThrow(new TaskNotFoundException(99L));
        mockMvc.perform(auth(get("/api/tasks/99")))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("Task not found."));
    }

    @Test
    void emptyPatchIs400Problem() throws Exception {
        when(taskService.patch(eq(1L), any(TaskPatchRequest.class))).thenThrow(new EmptyPatchException());
        mockMvc.perform(json(patch("/api/tasks/1"), "{}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
    }

    @Test
    void unexpectedExceptionIs500WithoutDetails() throws Exception {
        when(taskService.get(1L)).thenThrow(new IllegalStateException("secret internal detail"));
        String body = mockMvc.perform(auth(get("/api/tasks/1")))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("secret internal detail").doesNotContain("IllegalStateException")
                .doesNotContain("at com.example");
    }

    // POST validation

    @Test
    void postBlankTitleIs400WithPlainFieldName() throws Exception {
        mockMvc.perform(json(post("/api/tasks"), "{\"title\":\"  \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.errors[0].field").value("title"))
                .andExpect(jsonPath("$.errors[0].message").isNotEmpty());
        verifyNoInteractions(taskService);
    }

    @Test
    void postTitleOf256CharsIs400() throws Exception {
        mockMvc.perform(json(post("/api/tasks"), "{\"title\":\"" + "x".repeat(256) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("title"));
    }

    @Test
    void postDescriptionOf2001CharsIs400() throws Exception {
        mockMvc.perform(json(post("/api/tasks"), "{\"title\":\"t\",\"description\":\"" + "x".repeat(2001) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("description"));
    }

    @Test
    void postExplicitNullStatusIs400WithPlainFieldName() throws Exception {
        mockMvc.perform(json(post("/api/tasks"), "{\"title\":\"t\",\"status\":null}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("status"));
    }

    // PUT validation

    @Test
    void putWithoutTitleIs400() throws Exception {
        mockMvc.perform(json(put("/api/tasks/1"), "{\"status\":\"TODO\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("title"));
    }

    @Test
    void putWithoutStatusIs400() throws Exception {
        mockMvc.perform(json(put("/api/tasks/1"), "{\"title\":\"t\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("status"));
    }

    @Test
    void putWithNullStatusIs400() throws Exception {
        mockMvc.perform(json(put("/api/tasks/1"), "{\"title\":\"t\",\"status\":null}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("status"));
    }

    // PATCH validation

    @Test
    void patchNullTitleIs400WithPlainFieldName() throws Exception {
        mockMvc.perform(json(patch("/api/tasks/1"), "{\"title\":null}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.errors[0].field").value("title"));
        verifyNoInteractions(taskService);
    }

    @Test
    void patchBlankTitleIs400WithPlainFieldName() throws Exception {
        mockMvc.perform(json(patch("/api/tasks/1"), "{\"title\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("title"));
    }

    @Test
    void patchNullStatusIs400WithPlainFieldName() throws Exception {
        mockMvc.perform(json(patch("/api/tasks/1"), "{\"status\":null}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("status"));
    }

    @Test
    void patchNullDescriptionIsAccepted() throws Exception {
        when(taskService.patch(eq(1L), any(TaskPatchRequest.class))).thenReturn(sample(1));
        mockMvc.perform(json(patch("/api/tasks/1"), "{\"description\":null}")).andExpect(status().isOk());
    }

    @Test
    void patchBadStatusValueIs400() throws Exception {
        String body = mockMvc.perform(json(patch("/api/tasks/1"), "{\"status\":\"NOPE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("com.fasterxml").doesNotContain("at com.example");
    }

    @Test
    void postBadStatusValueIs400() throws Exception {
        mockMvc.perform(json(post("/api/tasks"), "{\"title\":\"t\",\"status\":\"NOPE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
        verifyNoInteractions(taskService);
    }

    @Test
    void putBadStatusValueIs400() throws Exception {
        mockMvc.perform(json(put("/api/tasks/1"), "{\"title\":\"t\",\"status\":\"NOPE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
        verifyNoInteractions(taskService);
    }

    // malformed input

    @Test
    void malformedJsonIs400WithGenericDetail() throws Exception {
        String body = mockMvc.perform(json(post("/api/tasks"), "{\"title\":"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("com.fasterxml").doesNotContain("JsonParseException")
                .doesNotContain("Unexpected end");
    }

    @Test
    void nonNumericIdIs400() throws Exception {
        String body = mockMvc.perform(auth(get("/api/tasks/abc")))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("NumberFormatException").doesNotContain("at com.example");
    }

    @Test
    void wrongContentTypeIs415() throws Exception {
        mockMvc.perform(auth(post("/api/tasks")).contentType(MediaType.TEXT_PLAIN).content("x"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
    }

    // paging validation

    @Test
    void negativePageIs400NamingTheParameter() throws Exception {
        mockMvc.perform(auth(get("/api/tasks?page=-1")))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.errors[0].field").value("page"));
        verifyNoInteractions(taskService);
    }

    @Test
    void sizeZeroIs400NamingTheParameter() throws Exception {
        mockMvc.perform(auth(get("/api/tasks?size=0")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("size"));
    }

    @Test
    void size101Is400NamingTheParameter() throws Exception {
        mockMvc.perform(auth(get("/api/tasks?size=101")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("size"));
    }

    @Test
    void nonNumericSizeIs400() throws Exception {
        mockMvc.perform(auth(get("/api/tasks?size=abc")))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
        verifyNoInteractions(taskService);
    }

    // security wiring in the slice

    @Test
    void missingCredentialsIs401Problem() throws Exception {
        mockMvc.perform(get("/api/tasks/1"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", org.hamcrest.Matchers.startsWith("Basic")))
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.status").value(401));
    }
}
