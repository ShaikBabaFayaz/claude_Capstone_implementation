package com.example.taskmanagement.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.taskmanagement.TaskManagementApplication;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * Re-runs the credential proof against the real application context (all beans,
 * real application.yml, no "test" profile).
 */
class FullContextCredentialsStartupTest {

    private ConfigurableApplicationContext start(String... properties) {
        return new SpringApplicationBuilder(TaskManagementApplication.class)
                .web(WebApplicationType.SERVLET)
                .properties("server.port=0")
                .properties(properties)
                .run();
    }

    @Test
    void absentCredentialsFailFullApplicationStartup() {
        assertThat(System.getenv("TASKAPI_USERNAME")).isNull();
        assertThat(System.getenv("TASKAPI_PASSWORD")).isNull();
        assertThatThrownBy(() -> start()).hasStackTraceContaining("taskapi.security");
    }

    @Test
    void placeholderCredentialsFailFullApplicationStartup() {
        assertThatThrownBy(() -> start(
                "TASKAPI_USERNAME=${NO_SUCH_VARIABLE_ANYWHERE}", "TASKAPI_PASSWORD=${NO_SUCH_VARIABLE_ANYWHERE}"))
                .hasStackTraceContaining("must not be an unresolved placeholder");
    }

    @Test
    void validCredentialsStartFullApplication() {
        try (ConfigurableApplicationContext context =
                     start("TASKAPI_USERNAME=someone", "TASKAPI_PASSWORD=s3cret-value")) {
            assertThat(context.isRunning()).isTrue();
            assertThat(context.getBean(SecurityProperties.class).getUsername()).isEqualTo("someone");
        }
    }
}
