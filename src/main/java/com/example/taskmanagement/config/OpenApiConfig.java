package com.example.taskmanagement.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    static final String BASIC_SCHEME = "basicAuth";

    @Bean
    OpenAPI taskManagementOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Task Management API")
                        .version("1.0")
                        .description("REST API for managing tasks. All /api/tasks endpoints require HTTP Basic "
                                + "authentication. POST: status is optional and defaults to TODO. "
                                + "PUT: title and status are required; an omitted description is cleared. "
                                + "PATCH: at least one of title, description, status is required. "
                                + "updatedAt changes only when a field value actually changes; an update that "
                                + "changes nothing leaves it unchanged."))
                .components(new Components().addSecuritySchemes(BASIC_SCHEME,
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("basic")))
                .addSecurityItem(new SecurityRequirement().addList(BASIC_SCHEME));
    }
}
