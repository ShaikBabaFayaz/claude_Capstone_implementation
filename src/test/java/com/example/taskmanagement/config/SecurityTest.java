package com.example.taskmanagement.config;

import static org.assertj.core.api.Assertions.assertThat;
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

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityTest {

    private static final String PROBLEM = "application/problem+json";

    @Autowired
    private MockMvc mockMvc;

    private void assertNoStackTrace(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        assertThat(body).doesNotContain("at com.example").doesNotContain("at org.springframework")
                .doesNotContain("Exception").doesNotContain("stackTrace").doesNotContain("trace");
    }

    @Test
    void noAuthorizationHeaderGives401ProblemJson() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/tasks"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", org.hamcrest.Matchers.startsWith("Basic")))
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.status").value(401))
                .andReturn();
        assertNoStackTrace(result);
    }

    @Test
    void wrongPasswordGives401ProblemJson() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/tasks").with(httpBasic("test-user", "wrong")))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", org.hamcrest.Matchers.startsWith("Basic")))
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andReturn();
        assertNoStackTrace(result);
    }

    @Test
    void validBasicCredentialsSucceed() throws Exception {
        mockMvc.perform(get("/api/tasks").with(httpBasic("test-user", "test-password")))
                .andExpect(status().isOk());
    }

    @Test
    void swaggerUiIsPublic() throws Exception {
        mockMvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk());
    }

    @Test
    void apiDocsJsonIsPublic() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk());
    }

    @Test
    void apiDocsYamlRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/v3/api-docs.yaml"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", org.hamcrest.Matchers.startsWith("Basic")));
    }

    @Test
    void unknownPathUnauthenticatedGives401() throws Exception {
        mockMvc.perform(get("/no/such/path"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
    }

    @Test
    void unknownPathAuthenticatedGives404ProblemJson() throws Exception {
        MvcResult result = mockMvc.perform(get("/no/such/path").with(httpBasic("test-user", "test-password")))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.status").value(404))
                .andReturn();
        assertNoStackTrace(result);
    }

    private void assertUnauthorizedProblem(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req) throws Exception {
        MvcResult result = mockMvc.perform(req)
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", org.hamcrest.Matchers.startsWith("Basic")))
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.status").value(401))
                .andReturn();
        assertNoStackTrace(result);
    }

    @Test
    void unauthenticatedPostGives401ProblemJson() throws Exception {
        assertUnauthorizedProblem(
                post("/api/tasks").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"t\"}"));
    }

    @Test
    void unauthenticatedPutGives401ProblemJson() throws Exception {
        assertUnauthorizedProblem(put("/api/tasks/1").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"t\",\"status\":\"TODO\"}"));
    }

    @Test
    void unauthenticatedPatchGives401ProblemJson() throws Exception {
        assertUnauthorizedProblem(patch("/api/tasks/1").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"DONE\"}"));
    }

    @Test
    void unauthenticatedDeleteGives401ProblemJson() throws Exception {
        assertUnauthorizedProblem(delete("/api/tasks/1"));
    }

    @Test
    void swaggerUiHtmlRedirectsToIndexWithoutCredentials() throws Exception {
        mockMvc.perform(get("/swagger-ui.html"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", org.hamcrest.Matchers.endsWith("/swagger-ui/index.html")));
    }

    @Test
    void h2ConsoleUnauthenticatedGives401() throws Exception {
        mockMvc.perform(get("/h2-console"))
                .andExpect(status().isUnauthorized());
    }
}
