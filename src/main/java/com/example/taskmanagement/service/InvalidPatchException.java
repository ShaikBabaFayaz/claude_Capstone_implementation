package com.example.taskmanagement.service;

/** Thrown when a PATCH request sets title or status to an explicit null. */
public class InvalidPatchException extends RuntimeException {

    public InvalidPatchException(String field) {
        super("PATCH field must not be null: " + field);
    }
}
