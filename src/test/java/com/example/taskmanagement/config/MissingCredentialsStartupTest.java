package com.example.taskmanagement.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;

/**
 * Proof test (architecture G1): the real application.yml is loaded, without the
 * "test" profile, and the credential properties must make startup fail when the
 * environment variables are absent, blank or a literal "${...}" value.
 */
class MissingCredentialsStartupTest {

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(SecurityProperties.class)
    static class PropertiesOnlyConfig {
    }

    private ConfigurableApplicationContext start(String... properties) {
        return new SpringApplicationBuilder(PropertiesOnlyConfig.class)
                .web(WebApplicationType.NONE)
                .properties(properties)
                .run();
    }

    @Test
    void environmentVariablesMustBeUnsetForThisTest() {
        assertThat(System.getenv("TASKAPI_USERNAME")).isNull();
        assertThat(System.getenv("TASKAPI_PASSWORD")).isNull();
    }

    @Test
    void absentVariablesFailStartup() {
        assertThatThrownBy(() -> start())
                .hasStackTraceContaining("taskapi.security");
    }

    @Test
    void blankVariablesFailStartup() {
        assertThatThrownBy(() -> start("TASKAPI_USERNAME=", "TASKAPI_PASSWORD="))
                .hasStackTraceContaining("taskapi.security");
    }

    @Test
    void whitespaceOnlyVariablesFailStartup() {
        assertThatThrownBy(() -> start("TASKAPI_USERNAME=   ", "TASKAPI_PASSWORD=   "))
                .hasStackTraceContaining("taskapi.security");
    }

    @Test
    void onlyUsernameSetStillFailsStartup() {
        assertThatThrownBy(() -> start("TASKAPI_USERNAME=someone"))
                .hasStackTraceContaining("taskapi.security");
    }

    @Test
    void literalPlaceholderValueFailsStartup() {
        assertThatThrownBy(() -> start(
                "TASKAPI_USERNAME=${TASKAPI_USERNAME}", "TASKAPI_PASSWORD=${TASKAPI_PASSWORD}"))
                .hasStackTraceContaining("taskapi.security");
    }

    @Test
    void unresolvableLiteralPlaceholderIsRejectedByPatternNotByResolver() {
        // A value that points at a non-existent variable stays literal in the binder;
        // only the "${" check in SecurityProperties can reject it.
        assertThatThrownBy(() -> start(
                "TASKAPI_USERNAME=${NO_SUCH_VARIABLE_ANYWHERE}", "TASKAPI_PASSWORD=${NO_SUCH_VARIABLE_ANYWHERE}"))
                .hasStackTraceContaining("must not be an unresolved placeholder");
    }

    @Test
    void passwordContainingNewlineIsNotTreatedAsPlaceholder() {
        try (ConfigurableApplicationContext context =
                     start("TASKAPI_USERNAME=someone", "TASKAPI_PASSWORD=line1\nline2")) {
            assertThat(context.getBean(SecurityProperties.class).getPassword()).isEqualTo("line1\nline2");
        }
    }

    @Test
    void validPairStarts() {
        try (ConfigurableApplicationContext context =
                     start("TASKAPI_USERNAME=someone", "TASKAPI_PASSWORD=s3cret-value")) {
            SecurityProperties properties = context.getBean(SecurityProperties.class);
            assertThat(properties.getUsername()).isEqualTo("someone");
            assertThat(properties.getPassword()).isEqualTo("s3cret-value");
        }
    }
}
