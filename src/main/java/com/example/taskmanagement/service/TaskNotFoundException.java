package com.example.taskmanagement.service;

public class TaskNotFoundException extends RuntimeException {

    private final Long id;

    public TaskNotFoundException(Long id) {
        super("Task " + id + " not found");
        this.id = id;
    }

    public Long getId() {
        return id;
    }
}
