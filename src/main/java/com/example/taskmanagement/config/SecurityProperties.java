package com.example.taskmanagement.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Credentials of the single API user. Values come only from the environment
 * variables TASKAPI_USERNAME and TASKAPI_PASSWORD (see application.yml).
 * Startup fails when a value is absent, blank or an unresolved "${...}" placeholder.
 */
@Validated
@ConfigurationProperties("taskapi.security")
public class SecurityProperties {

    private static final String NOT_PLACEHOLDER = "(?s)^(?!\\$\\{).*$";

    @NotBlank
    @Pattern(regexp = NOT_PLACEHOLDER, message = "must not be an unresolved placeholder")
    private String username;

    @NotBlank
    @Pattern(regexp = NOT_PLACEHOLDER, message = "must not be an unresolved placeholder")
    private String password;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
