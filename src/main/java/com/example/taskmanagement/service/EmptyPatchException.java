package com.example.taskmanagement.service;

/** Thrown when a PATCH request contains none of title, description or status. */
public class EmptyPatchException extends RuntimeException {

    public EmptyPatchException() {
        super("PATCH request must contain at least one of title, description, status");
    }
}
